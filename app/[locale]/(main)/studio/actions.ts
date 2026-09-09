'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'
import { slugWithSuffix } from '@/lib/master/slug'
import {
  buildOwnMasterProfilePatch,
  type OwnMasterProfileUpdate,
} from '@/lib/master/profileUpdate'

/**
 * SP-035: Master Studio + affiliation lifecycle (Decision 016, W-16).
 *
 * Authorization is layered: every action re-verifies the caller's side of
 * the relationship server-side, and the database enforces the same rules
 * independently (RLS + transition trigger in
 * supabase/2026-07-11_sp035_master_studio.sql). Workspace context and route
 * params are presentation only. home_sauna_id is never consulted.
 */

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

async function requireUser(supabase: SupabaseServerClient) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const t = await getTranslations('studio')
    throw new Error(t('actions.notLoggedIn'))
  }
  return user
}

async function isModeration() {
  const role = await getCurrentUserRole()
  return role === 'admin' || role === 'moderator'
}

/** The master profile linked to this account (Layer 3 link — never home_sauna_id). */
async function getOwnMaster(supabase: SupabaseServerClient, userId: string) {
  const { data } = await supabase
    .from('sauna_masters')
    .select('id, status')
    .eq('user_id', userId)
    .maybeSingle()
  return data as { id: string; status: string } | null
}

async function isStaffOfSauna(supabase: SupabaseServerClient, userId: string, saunaId: string) {
  const { data } = await supabase
    .from('sauna_managers')
    .select('id')
    .eq('user_id', userId)
    .eq('sauna_id', saunaId)
    .eq('status', 'approved')
    .maybeSingle()
  return data !== null
}

function revalidateAffiliationSurfaces() {
  revalidatePath('/studio')
  revalidatePath('/studio/affiliations')
  revalidatePath('/workspace')
  revalidatePath('/workspace/team')
}

async function friendlyInsertError(message: string) {
  if (message.includes('master_affiliations_open_unique') || message.includes('duplicate key')) {
    const t = await getTranslations('studio')
    return t('actions.duplicateAffiliation')
  }
  return message
}

// ============================================================
// Own master profile
// ============================================================

/**
 * SP-039: explicit-payload profile update (validation lives in the pure
 * lib/master/profileUpdate builder). Only self-editable fields are
 * accepted here — privileged columns (level, status, founding badge,
 * rating) have no path through this action and the database guard blocks
 * them independently.
 *
 * Expected failures are RETURNED as { error } instead of thrown (D1):
 * Next.js strips thrown server-action messages in production builds —
 * same convention as app/saunas/actions.ts.
 *
 * NOTE (2026-07-27 regression fix): a `'use server'` module may only
 * export async Server Action functions. A type-only re-export
 * (`export type { OwnMasterProfileUpdate }`) is NOT reliably erased by
 * the Turbopack "use server" transform — it left a runtime binding to an
 * undefined name and crashed the whole module graph at evaluation
 * (ReferenceError). The type lives in lib/master/profileUpdate and is
 * imported here purely for the signature; consumers import it from there.
 */
export async function updateOwnMasterProfile(
  data: OwnMasterProfileUpdate
): Promise<{ error?: string }> {
  const t = await getTranslations('studio')
  const tv = await getTranslations('common')
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: t('actions.notLoggedIn') }

    const own = await getOwnMaster(supabase, user.id)
    if (!own) return { error: t('actions.noMasterProfile') }

    const built = buildOwnMasterProfilePatch(data)
    // SP-047E2: localize the validation message from its stable code.
    if (!built.ok) return { error: tv(`validation.${built.code}`) }
    if (Object.keys(built.patch).length === 0) return {}

    const { data: updated, error } = await supabase
      .from('sauna_masters')
      .update(built.patch)
      .eq('id', own.id)
      .select('id, slug')

    if (error) {
      if (
        built.requestedSlug &&
        (error.code === '23505' || error.message.includes('sauna_masters_slug_unique'))
      ) {
        return {
          error: t('actions.slugTaken', {
            slug: built.requestedSlug,
            suggestion: slugWithSuffix(built.requestedSlug, 2),
          }),
        }
      }
      // our own guard messages are user-oriented Polish — pass them through
      if (error.message.includes('Pola uprzywilejowane')) return { error: error.message }
      console.error('updateOwnMasterProfile db error:', error.message)
      return { error: t('actions.profileSaveFailed') }
    }
    if (!updated || updated.length === 0) {
      return { error: t('actions.noEditPermission') }
    }

    revalidatePath('/studio')
    revalidatePath('/studio/profile')
    revalidatePath(`/masters/${own.id}`)
    const newSlug = (updated[0] as { slug?: string | null }).slug
    if (newSlug) revalidatePath(`/masters/${newSlug}`)
    return {}
  } catch (e) {
    console.error('updateOwnMasterProfile failed:', e)
    return { error: t('actions.profileSaveFailed') }
  }
}

/** Canonical identity result codes (from set_master_identity RPC). Kept stable
 *  here; the user-facing label is resolved via t('actions.identityErrors.<code>')
 *  at the call site. */
const IDENTITY_ERROR_CODES = [
  'not_authenticated',
  'not_authorized',
  'not_found',
  'invalid_input',
  'name_required',
  'name_too_long',
  'nickname_required',
  'nickname_too_long',
  'unexpected_error',
] as const

/**
 * SP-044: the SOLE app path for identity/privacy. Delegates to the trusted
 * set_master_identity RPC, which stores the real name privately, derives the
 * public display name (pseudonym when privacy is on), and enforces the
 * name=nickname invariant + slug privacy. Real-name / privacy edits do NOT
 * demote publication (the RPC suppresses re-moderation).
 */
export async function updateOwnMasterIdentity(
  fullName: string,
  nickname: string | null,
  showNicknameOnly: boolean
): Promise<{ error?: string }> {
  const t = await getTranslations('studio')
  // Resolve a canonical identity code to a localized label (fail-closed).
  const identityError = (code: string) =>
    (IDENTITY_ERROR_CODES as readonly string[]).includes(code)
      ? t(`actions.identityErrors.${code}` as 'actions.identityErrors.unexpected_error')
      : t('actions.identityErrors.unexpected_error')
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: t('actions.notLoggedIn') }

    const own = await getOwnMaster(supabase, user.id)
    if (!own) return { error: t('actions.noMasterProfile') }

    const { data, error } = await supabase.rpc('set_master_identity', {
      p_master_id: own.id,
      p_full_name: fullName,
      p_nickname: nickname,
      p_show_nickname_only: showNicknameOnly,
    })
    if (error) return { error: identityError('unexpected_error') }

    const res = (data ?? {}) as { ok?: boolean; code?: string }
    if (!res.ok) return { error: identityError(res.code ?? '') }

    revalidatePath('/studio')
    revalidatePath('/studio/profile')
    revalidatePath(`/masters/${own.id}`)
    return {}
  } catch {
    return { error: identityError('unexpected_error') }
  }
}

// ============================================================
// Affiliation lifecycle — one model, both directions
// ============================================================

export async function requestAffiliation(saunaId: string) {
  const supabase = await createClient()
  const user = await requireUser(supabase)
  const t = await getTranslations('studio')

  const own = await getOwnMaster(supabase, user.id)
  if (!own) throw new Error(t('actions.noMasterProfile'))
  if (own.status !== 'approved') {
    throw new Error(t('actions.affiliationsRequireApproval'))
  }

  const { data: created, error } = await supabase
    .from('master_affiliations')
    .insert({
      master_id: own.id,
      sauna_id: saunaId,
      status: 'pending',
      initiated_by: 'master',
      created_by: user.id,
    })
    .select('id')

  if (error) throw new Error(await friendlyInsertError(error.message))
  if (!created || created.length === 0) throw new Error(t('actions.requestCreateFailed'))

  revalidateAffiliationSurfaces()
}

export async function inviteMaster(saunaId: string, masterId: string) {
  const supabase = await createClient()
  const user = await requireUser(supabase)
  const t = await getTranslations('studio')

  if (!(await isModeration()) && !(await isStaffOfSauna(supabase, user.id, saunaId))) {
    throw new Error(t('actions.noFacilityManagePermission'))
  }

  const { data: master } = await supabase
    .from('sauna_masters')
    .select('id, status')
    .eq('id', masterId)
    .maybeSingle()
  if (!master || master.status !== 'approved') {
    throw new Error(t('actions.onlyApprovedMastersInvitable'))
  }

  const { data: created, error } = await supabase
    .from('master_affiliations')
    .insert({
      master_id: masterId,
      sauna_id: saunaId,
      status: 'pending',
      initiated_by: 'facility',
      created_by: user.id,
    })
    .select('id')

  if (error) throw new Error(await friendlyInsertError(error.message))
  if (!created || created.length === 0) throw new Error(t('actions.invitationCreateFailed'))

  revalidateAffiliationSurfaces()
}

type AffiliationRow = {
  id: string
  master_id: string
  sauna_id: string
  status: string
  initiated_by: 'master' | 'facility'
  is_primary: boolean
}

async function getAffiliation(supabase: SupabaseServerClient, id: string): Promise<AffiliationRow> {
  const { data } = await supabase
    .from('master_affiliations')
    .select('id, master_id, sauna_id, status, initiated_by, is_primary')
    .eq('id', id)
    .maybeSingle()
  // RLS hides pending/rejected rows from third parties — "not found" both
  // for missing ids and for rows the caller may not see.
  if (!data) {
    const t = await getTranslations('studio')
    throw new Error(t('actions.affiliationNotFound'))
  }
  return data as AffiliationRow
}

async function callerSides(supabase: SupabaseServerClient, userId: string, row: AffiliationRow) {
  const [own, staff, moderation] = await Promise.all([
    getOwnMaster(supabase, userId),
    isStaffOfSauna(supabase, userId, row.sauna_id),
    isModeration(),
  ])
  return {
    isMasterSide: own !== null && own.id === row.master_id,
    isFacilitySide: staff,
    isModeration: moderation,
  }
}

/** The receiving side resolves a pending handshake (approve/reject). */
export async function respondToAffiliation(id: string, decision: 'approved' | 'rejected') {
  const supabase = await createClient()
  const user = await requireUser(supabase)
  const t = await getTranslations('studio')

  const row = await getAffiliation(supabase, id)
  if (row.status !== 'pending') throw new Error(t('actions.affiliationAlreadyResolved'))

  const sides = await callerSides(supabase, user.id, row)
  const isReceiver =
    row.initiated_by === 'master' ? sides.isFacilitySide : sides.isMasterSide
  if (!isReceiver && !sides.isModeration) {
    throw new Error(t('actions.affiliationResolvedByOtherSide'))
  }

  const { data: updated, error } = await supabase
    .from('master_affiliations')
    .update({ status: decision, resolved_by: user.id, resolved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')

  if (error) throw new Error(error.message)
  if (!updated || updated.length === 0) throw new Error(t('actions.noResolvePermission'))

  revalidateAffiliationSurfaces()
}

/**
 * Ends an affiliation: withdrawal of an own pending handshake (initiator
 * side) or ending an active one (either side). The DB trigger enforces the
 * same rules independently.
 */
export async function endAffiliation(id: string) {
  const supabase = await createClient()
  const user = await requireUser(supabase)
  const t = await getTranslations('studio')

  const row = await getAffiliation(supabase, id)
  if (row.status !== 'pending' && row.status !== 'approved') {
    throw new Error(t('actions.affiliationAlreadyEnded'))
  }

  const sides = await callerSides(supabase, user.id, row)
  if (!sides.isModeration) {
    if (row.status === 'pending') {
      const isInitiator =
        row.initiated_by === 'master' ? sides.isMasterSide : sides.isFacilitySide
      if (!isInitiator) throw new Error(t('actions.onlyInitiatorCanWithdraw'))
    } else if (!sides.isMasterSide && !sides.isFacilitySide) {
      throw new Error(t('actions.noEndPermission'))
    }
  }

  const { data: updated, error } = await supabase
    .from('master_affiliations')
    .update({ status: 'ended', is_primary: false, ended_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['pending', 'approved'])
    .select('id')

  if (error) throw new Error(error.message)
  if (!updated || updated.length === 0) throw new Error(t('actions.noEndPermission'))

  revalidateAffiliationSurfaces()
}

/** The master picks which approved affiliation is primary (home-sauna successor). */
export async function setPrimaryAffiliation(id: string) {
  const supabase = await createClient()
  const user = await requireUser(supabase)
  const t = await getTranslations('studio')

  const row = await getAffiliation(supabase, id)
  if (row.status !== 'approved') throw new Error(t('actions.onlyActiveCanBePrimary'))

  const sides = await callerSides(supabase, user.id, row)
  if (!sides.isMasterSide && !sides.isModeration) {
    throw new Error(t('actions.primaryChosenByMaster'))
  }

  // clear the current primary first (unique index allows at most one)
  const { error: clearError } = await supabase
    .from('master_affiliations')
    .update({ is_primary: false })
    .eq('master_id', row.master_id)
    .eq('is_primary', true)
  if (clearError) throw new Error(clearError.message)

  const { data: updated, error } = await supabase
    .from('master_affiliations')
    .update({ is_primary: true })
    .eq('id', id)
    .eq('status', 'approved')
    .select('id')

  if (error) throw new Error(error.message)
  if (!updated || updated.length === 0) throw new Error(t('actions.setPrimaryFailed'))

  revalidateAffiliationSurfaces()
}
