'use server'

// SP-039 Slice 3B2 — prepared-profile server actions (moderator only).
//
// Writes go through the RLS client (masters_insert_self moderator arm /
// masters_update_moderation) — no service role, no direct claim-table access.
// Validation reuses the pure lib/master/profileUpdate builder (the same
// contract as the owner Studio form), so origin/status/user_id/level can never
// enter the patch. Every failure is RETURNED as a stable code with a Polish
// message (thrown server-action messages are stripped in production builds).
//
// 'use server' contract: only async function exports; all types come from the
// pure libs (lib/claim/pilot, lib/master/profileUpdate).

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'
import {
  createClaimInvitation,
  listClaimInvitations,
  markClaimInvitationSent,
  regenerateClaimInvitation,
  revokeClaimInvitation,
} from '@/app/(main)/admin/claimActions'
import {
  buildOwnMasterProfilePatch,
  type OwnMasterProfileUpdate,
} from '@/lib/master/profileUpdate'
import { isUuid, slugWithSuffix } from '@/lib/master/slug'
import {
  buildClaimUrl,
  parseTokenGrant,
  resolveClaimPublicOrigin,
} from '@/lib/claim/claimLink'
import {
  invitationControlMessagePl,
  isDeliveryChannel,
  normalizeValidDays,
  validateDeliveryHint,
  validateInvitationReason,
  type InvitationControlFailure,
  type InvitationControlResult,
  type InvitationSecretResult,
} from '@/lib/claim/invitationControls'
import {
  evaluatePilotReadiness,
  evaluatePreparedProfileEditability,
  pickLatestInvitation,
  pilotResult,
  toPilotInvitationSummaries,
  type PilotActionResult,
  type PilotProfileState,
} from '@/lib/claim/pilot'
import type { ClaimActionResult } from '@/lib/claim/types'

async function requireModerator(): Promise<PilotActionResult | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return pilotResult('not_authenticated')
  const role = await getCurrentUserRole()
  if (role !== 'admin' && role !== 'moderator') return pilotResult('not_authorized')
  return null
}

function slugConflictMessage(requestedSlug: string): string {
  return `Adres „${requestedSlug}" jest już zajęty — spróbuj np. „${slugWithSuffix(requestedSlug, 2)}"`
}

/**
 * Creates an admin-prepared pilot profile: origin='admin_prepared',
 * status='pending', user_id=NULL (column default), level='guest' baseline
 * (levels are certification-driven and stay with dedicated moderation flows).
 */
export async function createPreparedMasterProfile(
  data: OwnMasterProfileUpdate
): Promise<PilotActionResult> {
  try {
    const denied = await requireModerator()
    if (denied) return denied

    if (typeof data.name !== 'string' || data.name.trim().length === 0) {
      return pilotResult('invalid_input', { message: 'Imię i nazwisko jest wymagane' })
    }
    const built = buildOwnMasterProfilePatch(data)
    if (!built.ok) return pilotResult('invalid_input', { message: built.error })

    const supabase = await createClient()
    const { data: created, error } = await supabase
      .from('sauna_masters')
      .insert({
        ...built.patch,
        level: 'guest',
        status: 'pending',
        origin: 'admin_prepared',
      })
      .select('id')

    if (error) {
      if (
        built.requestedSlug &&
        (error.code === '23505' || error.message.includes('sauna_masters_slug_unique'))
      ) {
        return pilotResult('invalid_input', {
          message: slugConflictMessage(built.requestedSlug),
        })
      }
      return pilotResult('unexpected_error')
    }
    if (!created || created.length === 0) return pilotResult('unexpected_error')

    const masterId = (created[0] as { id: string }).id
    revalidatePath('/admin/masters/pilot')
    return pilotResult('ok', { message: 'Profil przygotowany.', masterId })
  } catch {
    return pilotResult('unexpected_error')
  }
}

/**
 * Edits a prepared, UNCLAIMED profile. Concurrency contract: the current row
 * is re-read first (fresh editability verdict), and the UPDATE repeats the
 * same conditions as WHERE clauses — if the profile was claimed, re-originated
 * or moderated in between, zero rows match and the caller gets `conflict`
 * instead of overwriting claim-related state.
 */
export async function updatePreparedMasterProfile(
  masterId: string,
  data: OwnMasterProfileUpdate
): Promise<PilotActionResult> {
  try {
    if (typeof masterId !== 'string' || !isUuid(masterId)) {
      return pilotResult('invalid_input')
    }
    const denied = await requireModerator()
    if (denied) return denied

    const supabase = await createClient()
    const { data: current, error: readError } = await supabase
      .from('sauna_masters')
      .select('id, user_id, origin, status')
      .eq('id', masterId)
      .maybeSingle()
    if (readError) return pilotResult('unexpected_error')

    const row = current as { id: string; user_id: string | null; origin: string; status: string } | null
    const editable = evaluatePreparedProfileEditability({
      exists: row !== null,
      userId: row?.user_id ?? null,
      origin: row?.origin ?? '',
      status: row?.status ?? '',
    })
    if (!editable.ok) return pilotResult(editable.code)

    const built = buildOwnMasterProfilePatch(data)
    if (!built.ok) return pilotResult('invalid_input', { message: built.error })
    if (Object.keys(built.patch).length === 0) return pilotResult('ok')

    const { data: updated, error } = await supabase
      .from('sauna_masters')
      .update(built.patch)
      .eq('id', masterId)
      .is('user_id', null)
      .eq('origin', 'admin_prepared')
      .eq('status', 'pending')
      .select('id')

    if (error) {
      if (
        built.requestedSlug &&
        (error.code === '23505' || error.message.includes('sauna_masters_slug_unique'))
      ) {
        return pilotResult('invalid_input', {
          message: slugConflictMessage(built.requestedSlug),
        })
      }
      return pilotResult('unexpected_error')
    }
    if (!updated || updated.length === 0) return pilotResult('conflict')

    revalidatePath('/admin/masters/pilot')
    revalidatePath(`/admin/masters/pilot/${masterId}`)
    return pilotResult('ok', { message: 'Profil zapisany.' })
  } catch {
    return pilotResult('unexpected_error')
  }
}

// ===========================================================================
// SP-039 Slice 3B3 — invitation controls.
//
// Every mutation flows through the M4 SECURITY DEFINER RPCs via the existing
// claimActions wrappers — the database is the final transition/eligibility
// authority; the gates here only pre-validate and keep the UI verdict fresh.
// The raw token exists application-side ONLY on the create/regenerate success
// path: parsed fail-closed (payload_malformed, never logged), embedded in the
// claim URL, and returned exclusively in InvitationSecretResult. Mark-sent and
// revoke return InvitationControlResult, which has no secret field at the
// type level. No token value is ever logged or persisted here.
// ===========================================================================

function controlFailure(
  code: InvitationControlFailure['code'],
  message?: string
): InvitationControlFailure {
  return { ok: false, code, message: message ?? invitationControlMessagePl(code) }
}

/** Map a denied requireModerator() verdict onto the invitation contract. */
function deniedFailure(denied: PilotActionResult): InvitationControlFailure {
  return controlFailure(
    denied.code === 'not_authenticated' ? 'not_authenticated' : 'not_authorized'
  )
}

/** Map a failed wrapper result (stable code + Polish message, never raw PG). */
function wrapperFailure(result: ClaimActionResult): InvitationControlFailure {
  const code = result.code === 'ok' ? 'unexpected_error' : result.code
  return { ok: false, code, message: result.message }
}

function revalidatePilotSurfaces() {
  revalidatePath('/admin/masters/pilot')
  revalidatePath('/admin/masters/pilot/[id]', 'page')
}

/** Fresh profile + latest-invitation state for the generation gates. */
async function readInvitationGateState(masterId: string): Promise<
  | { ok: true; profile: PilotProfileState; latest: ReturnType<typeof pickLatestInvitation> }
  | { ok: false; failure: InvitationControlFailure }
> {
  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from('sauna_masters')
    .select('id, user_id, origin, status, name, city, bio')
    .eq('id', masterId)
    .maybeSingle()
  if (error) return { ok: false, failure: controlFailure('unexpected_error') }
  if (!row) return { ok: false, failure: controlFailure('master_not_found') }
  const m = row as {
    user_id: string | null
    origin: string
    status: string
    name: string | null
    city: string | null
    bio: string | null
  }
  const listResult = await listClaimInvitations()
  if (!listResult.ok) return { ok: false, failure: controlFailure('unexpected_error') }
  const latest = pickLatestInvitation(
    toPilotInvitationSummaries(listResult.data).filter((i) => i.masterId === masterId)
  )
  return {
    ok: true,
    profile: {
      userId: m.user_id,
      origin: m.origin,
      status: m.status,
      name: m.name,
      city: m.city,
      bio: m.bio,
    },
    latest,
  }
}

/**
 * Generates a fresh invitation for a ready prepared profile. Re-reads the
 * profile + invitation state server-side and offers the RPC only when the
 * readiness verdict is ready_for_invitation (the RPC re-checks everything).
 * Success returns the ONE-TIME claim URL — shown once, never recoverable.
 */
export async function generateMasterInvitation(
  masterId: string,
  validDays?: number,
  adminNote?: string | null
): Promise<InvitationSecretResult> {
  try {
    if (typeof masterId !== 'string' || !isUuid(masterId)) {
      return controlFailure('invalid_input')
    }
    const denied = await requireModerator()
    if (denied) return deniedFailure(denied)

    // The public origin MUST resolve BEFORE the RPC: create returns the raw
    // token exactly once, and a config error discovered afterwards would leave
    // an active invitation with no displayable link. Fail closed = no RPC.
    const origin = resolveClaimPublicOrigin()
    if (!origin.ok) return controlFailure(origin.code)

    const days = normalizeValidDays(validDays)
    const note =
      typeof adminNote === 'string' && adminNote.trim() !== ''
        ? adminNote.trim().slice(0, 2000)
        : null

    const gate = await readInvitationGateState(masterId)
    if (!gate.ok) return gate.failure
    const readiness = evaluatePilotReadiness(gate.profile, gate.latest)
    if (readiness.readiness !== 'ready_for_invitation') {
      if (readiness.readiness === 'claimed') return controlFailure('master_already_claimed')
      if (readiness.readiness === 'active_invitation') {
        return controlFailure('active_invitation_exists')
      }
      return controlFailure('master_not_eligible')
    }

    const result = await createClaimInvitation(masterId, note, days)
    if (!result.ok) return wrapperFailure(result)

    const grant = parseTokenGrant(result.data)
    if (!grant) return controlFailure('payload_malformed')
    const claimUrl = buildClaimUrl(grant.rawToken, origin.origin)
    if (!claimUrl) return controlFailure('payload_malformed')

    revalidatePilotSurfaces()
    return {
      ok: true,
      code: 'ok',
      message: 'Zaproszenie wygenerowane — skopiuj link teraz.',
      invitationId: grant.invitationId,
      tokenPrefix: grant.tokenPrefix,
      expiresAt: grant.expiresAt,
      claimUrl,
      revokedInvitationId: null,
    }
  } catch {
    return controlFailure('unexpected_error')
  }
}

/**
 * Regenerates: revokes the current active invitation (if any) and issues a
 * replacement in ONE database transaction (M4 contract; also valid as a plain
 * re-issue after expiry/revocation). Requires a reason. Success returns the
 * NEW one-time claim URL; the previous raw token is unrecoverable.
 */
export async function regenerateMasterInvitation(
  masterId: string,
  reason: string,
  validDays?: number
): Promise<InvitationSecretResult> {
  try {
    if (typeof masterId !== 'string' || !isUuid(masterId)) {
      return controlFailure('invalid_input')
    }
    const reasonCheck = validateInvitationReason(reason)
    if (!reasonCheck.ok) return controlFailure('invalid_input', reasonCheck.message)
    const denied = await requireModerator()
    if (denied) return deniedFailure(denied)

    // Same fail-closed ordering as generate: no origin -> no regenerate RPC
    // (a replacement token with no displayable link must never be minted).
    const origin = resolveClaimPublicOrigin()
    if (!origin.ok) return controlFailure(origin.code)

    const days = normalizeValidDays(validDays)

    const gate = await readInvitationGateState(masterId)
    if (!gate.ok) return gate.failure
    const readiness = evaluatePilotReadiness(gate.profile, gate.latest)
    if (readiness.readiness === 'claimed') return controlFailure('master_already_claimed')
    const eligible =
      gate.profile.userId === null &&
      gate.profile.origin === 'admin_prepared' &&
      gate.profile.status === 'pending' &&
      readiness.missingRequired.length === 0
    if (!eligible) return controlFailure('master_not_eligible')

    const result = await regenerateClaimInvitation(masterId, reasonCheck.value, days)
    if (!result.ok) return wrapperFailure(result)

    const grant = parseTokenGrant(result.data)
    if (!grant) return controlFailure('payload_malformed')
    const claimUrl = buildClaimUrl(grant.rawToken, origin.origin)
    if (!claimUrl) return controlFailure('payload_malformed')

    revalidatePilotSurfaces()
    return {
      ok: true,
      code: 'ok',
      message: 'Nowe zaproszenie wygenerowane — poprzedni link przestał działać.',
      invitationId: grant.invitationId,
      tokenPrefix: grant.tokenPrefix,
      expiresAt: grant.expiresAt,
      claimUrl,
      revokedInvitationId: grant.revokedInvitationId,
    }
  } catch {
    return controlFailure('unexpected_error')
  }
}

/**
 * Marks a ready invitation as sent, recording the channel and a REDACTED
 * delivery hint (application-side redaction gate; the DB stores as-given).
 * Idempotent already_sent passes through as a success code.
 */
export async function markMasterInvitationSent(
  invitationId: string,
  deliveryChannel: string,
  deliveryTargetHint?: string | null
): Promise<InvitationControlResult> {
  try {
    if (typeof invitationId !== 'string' || !isUuid(invitationId)) {
      return controlFailure('invalid_input')
    }
    if (!isDeliveryChannel(deliveryChannel)) {
      return controlFailure('invalid_input', 'Wybierz prawidłowy kanał dostarczenia.')
    }
    const hintCheck = validateDeliveryHint(deliveryTargetHint)
    if (!hintCheck.ok) return controlFailure('invalid_input', hintCheck.message)
    const denied = await requireModerator()
    if (denied) return deniedFailure(denied)

    const result = await markClaimInvitationSent(invitationId, deliveryChannel, hintCheck.value)
    if (!result.ok) return wrapperFailure(result)

    revalidatePilotSurfaces()
    return { ok: true, code: result.code, message: result.message }
  } catch {
    return controlFailure('unexpected_error')
  }
}

/**
 * Revokes an active invitation (reason required; the link stops working).
 * Idempotent already_revoked passes through as a success code.
 */
export async function revokeMasterInvitation(
  invitationId: string,
  reason: string
): Promise<InvitationControlResult> {
  try {
    if (typeof invitationId !== 'string' || !isUuid(invitationId)) {
      return controlFailure('invalid_input')
    }
    const reasonCheck = validateInvitationReason(reason)
    if (!reasonCheck.ok) return controlFailure('invalid_input', reasonCheck.message)
    const denied = await requireModerator()
    if (denied) return deniedFailure(denied)

    const result = await revokeClaimInvitation(invitationId, reasonCheck.value)
    if (!result.ok) return wrapperFailure(result)

    revalidatePilotSurfaces()
    return { ok: true, code: result.code, message: result.message }
  } catch {
    return controlFailure('unexpected_error')
  }
}
