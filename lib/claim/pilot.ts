// SP-039 Slice 3B2 — pure pilot administration model (readiness, filters,
// editability, action contracts).
//
// Everything here is deterministic and unit-tested; the DATABASE stays the
// authority (M4 RPC eligibility, M1 guards, M5 delete guard). This layer only
// classifies state for the moderator UI and defines the stable result
// contracts of the pilot server actions. No token_hash / raw token ever enters
// these types — the sanitizer below picks an explicit allow-list of fields.

import {
  ACTIVE_INVITATION_STATUSES,
  INVITATION_STATUSES,
  type InvitationStatus,
} from './types'

// ---------------------------------------------------------------------------
// Invitation summary (UI-facing, allow-listed fields only)
// ---------------------------------------------------------------------------

/**
 * The ONLY invitation shape the pilot UI ever sees. Built exclusively via
 * toPilotInvitationSummary(), which copies an explicit allow-list — token_hash
 * or raw_token can never ride along even if a future RPC leaked them.
 * deliveryTargetHint is redacted at write time by contract (M4);
 * tokenPrefix is the non-secret, moderator-only diagnostic label (§5.1).
 */
export type PilotInvitationSummary = {
  invitationId: string
  masterId: string
  status: InvitationStatus
  expiresAt: string | null
  createdAt: string | null
  sentAt: string | null
  revokedAt: string | null
  deliveryChannel: string | null
  deliveryTargetHint: string | null
  tokenPrefix: string | null
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/** Allow-list projection of one admin_list_master_claim_invitations row. */
export function toPilotInvitationSummary(row: unknown): PilotInvitationSummary | null {
  if (typeof row !== 'object' || row === null) return null
  const r = row as Record<string, unknown>
  const invitationId = asStringOrNull(r.invitation_id)
  const masterId = asStringOrNull(r.master_id)
  const status = asStringOrNull(r.status)
  if (!invitationId || !masterId || !status) return null
  if (!(INVITATION_STATUSES as readonly string[]).includes(status)) return null
  return {
    invitationId,
    masterId,
    status: status as InvitationStatus,
    expiresAt: asStringOrNull(r.expires_at),
    createdAt: asStringOrNull(r.created_at),
    sentAt: asStringOrNull(r.sent_at),
    revokedAt: asStringOrNull(r.revoked_at),
    deliveryChannel: asStringOrNull(r.delivery_channel),
    deliveryTargetHint: asStringOrNull(r.delivery_target_hint),
    tokenPrefix: asStringOrNull(r.token_prefix),
  }
}

/** Sanitize the whole RPC list payload (unknown JSON) into summaries. */
export function toPilotInvitationSummaries(data: unknown): PilotInvitationSummary[] {
  if (!Array.isArray(data)) return []
  const out: PilotInvitationSummary[] = []
  for (const row of data) {
    const s = toPilotInvitationSummary(row)
    if (s) out.push(s)
  }
  return out
}

/**
 * Deterministic "latest" pick: newest createdAt first; identical timestamps
 * tie-break on invitationId (descending) so the result is stable.
 */
export function pickLatestInvitation(
  rows: readonly PilotInvitationSummary[]
): PilotInvitationSummary | null {
  let latest: PilotInvitationSummary | null = null
  for (const row of rows) {
    if (!latest) {
      latest = row
      continue
    }
    const a = row.createdAt ?? ''
    const b = latest.createdAt ?? ''
    if (a > b || (a === b && row.invitationId > latest.invitationId)) latest = row
  }
  return latest
}

/** Group sanitized summaries by master for the pilot list. */
export function groupInvitationsByMaster(
  rows: readonly PilotInvitationSummary[]
): Map<string, PilotInvitationSummary[]> {
  const map = new Map<string, PilotInvitationSummary[]>()
  for (const row of rows) {
    const list = map.get(row.masterId)
    if (list) list.push(row)
    else map.set(row.masterId, [row])
  }
  return map
}

// ---------------------------------------------------------------------------
// Readiness model
// ---------------------------------------------------------------------------

/**
 * Required completeness for READY_FOR_INVITATION (UI rule — conservative
 * superset of the DB hard rule, which requires only a non-empty name):
 *  - name: the DB hard requirement (mirrors the M4 RPC eligibility);
 *  - city: the public "where does this master operate" context shown on the
 *    list and public profile — an invited master must recognize the profile;
 *  - bio:  the public "about" text — a prepared profile without any
 *    description is not presentable to the person being invited.
 * Avatar / specialties / links stay soft hints, never blockers (design §8:
 * name is the only DB-hard requirement; richer completeness is advisory).
 */
export const PILOT_REQUIRED_FIELDS = ['name', 'city', 'bio'] as const
export type PilotRequiredField = (typeof PILOT_REQUIRED_FIELDS)[number]

export const PILOT_REQUIRED_FIELD_LABELS_PL: Record<PilotRequiredField, string> = {
  name: 'Imię i nazwisko',
  city: 'Miasto działania',
  bio: 'Opis profilu (o sobie)',
}

export type PilotProfileState = {
  /** Ownership presence only — the UUID itself is never displayed. */
  userId: string | null
  origin: string
  status: string
  name: string | null
  city: string | null
  bio: string | null
}

export const PILOT_READINESS_VALUES = [
  'claimed',
  'active_invitation',
  'terminal_attention',
  'ready_for_invitation',
  'incomplete',
] as const
export type PilotReadiness = (typeof PILOT_READINESS_VALUES)[number]

export type PilotReadinessResult = {
  readiness: PilotReadiness
  /** Completeness gaps (relevant for incomplete / shown as checklist). */
  missingRequired: PilotRequiredField[]
  /** True when the latest invitation still has an active STATUS but is past
   *  expires_at (the DB materializes expiry lazily — treat as attention). */
  invitationExpired: boolean
}

export function missingRequiredFields(p: PilotProfileState): PilotRequiredField[] {
  const missing: PilotRequiredField[] = []
  if (!p.name || p.name.trim().length === 0) missing.push('name')
  if (!p.city || p.city.trim().length === 0) missing.push('city')
  if (!p.bio || p.bio.trim().length === 0) missing.push('bio')
  return missing
}

/**
 * Readiness precedence (documented contract, in order):
 *  1. claimed             — user_id is set OR the latest invitation is claimed;
 *  2. active_invitation   — latest invitation status in {ready,sent,opened}
 *                           AND now < expires_at;
 *  3. terminal_attention  — latest invitation expired/revoked, OR an
 *                           active-status invitation past its expires_at
 *                           (needs regenerate — next slice);
 *  4. ready_for_invitation — unclaimed admin_prepared pending profile with all
 *                           PILOT_REQUIRED_FIELDS present and no invitation
 *                           in play;
 *  5. incomplete          — everything else (missing fields, wrong origin or
 *                           a status outside the pilot flow).
 */
export function evaluatePilotReadiness(
  profile: PilotProfileState,
  latestInvitation: PilotInvitationSummary | null,
  now: Date = new Date()
): PilotReadinessResult {
  const missing = missingRequiredFields(profile)

  if (profile.userId !== null || latestInvitation?.status === 'claimed') {
    return { readiness: 'claimed', missingRequired: missing, invitationExpired: false }
  }

  if (latestInvitation) {
    const isActiveStatus = (ACTIVE_INVITATION_STATUSES as readonly string[]).includes(
      latestInvitation.status
    )
    if (isActiveStatus) {
      const expired =
        latestInvitation.expiresAt !== null &&
        new Date(latestInvitation.expiresAt).getTime() <= now.getTime()
      if (expired) {
        return { readiness: 'terminal_attention', missingRequired: missing, invitationExpired: true }
      }
      return { readiness: 'active_invitation', missingRequired: missing, invitationExpired: false }
    }
    if (latestInvitation.status === 'expired' || latestInvitation.status === 'revoked') {
      return { readiness: 'terminal_attention', missingRequired: missing, invitationExpired: false }
    }
  }

  const structurallyInvitable =
    profile.origin === 'admin_prepared' &&
    profile.status === 'pending' &&
    profile.userId === null

  if (structurallyInvitable && missing.length === 0) {
    return { readiness: 'ready_for_invitation', missingRequired: [], invitationExpired: false }
  }
  return { readiness: 'incomplete', missingRequired: missing, invitationExpired: false }
}

/** Polish badge meta per readiness (design-language colors: ready=blue,
 *  active=indigo, claimed=green, attention=red, incomplete=yellow). */
export const PILOT_READINESS_META: Record<
  PilotReadiness,
  { label: string; className: string }
> = {
  ready_for_invitation: { label: 'Gotowy do zaproszenia', className: 'bg-blue-100 text-blue-700' },
  incomplete: { label: 'Profil niekompletny', className: 'bg-yellow-100 text-yellow-700' },
  active_invitation: { label: 'Zaproszenie aktywne', className: 'bg-indigo-100 text-indigo-700' },
  claimed: { label: 'Profil przejęty', className: 'bg-green-100 text-green-700' },
  terminal_attention: { label: 'Wymaga uwagi', className: 'bg-red-100 text-red-700' },
}

/** Readable Polish labels for raw invitation statuses (never shown bare). */
export const INVITATION_STATUS_LABELS_PL: Record<InvitationStatus, string> = {
  ready: 'Wygenerowane (niewysłane)',
  sent: 'Wysłane',
  opened: 'Otwarte',
  claimed: 'Przejęte',
  expired: 'Wygasłe',
  revoked: 'Unieważnione',
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export const PILOT_FILTERS = [
  'all',
  'ready',
  'incomplete',
  'active',
  'claimed',
  'attention',
] as const
export type PilotFilter = (typeof PILOT_FILTERS)[number]

export const PILOT_FILTER_LABELS_PL: Record<PilotFilter, string> = {
  all: 'Wszystkie przygotowane',
  ready: 'Gotowe do zaproszenia',
  incomplete: 'Niekompletne',
  active: 'Zaproszenie aktywne',
  claimed: 'Przejęte',
  attention: 'Wymagają uwagi',
}

/** Explicit filter -> readiness mapping (never inferred visually). */
const FILTER_TO_READINESS: Record<Exclude<PilotFilter, 'all'>, PilotReadiness> = {
  ready: 'ready_for_invitation',
  incomplete: 'incomplete',
  active: 'active_invitation',
  claimed: 'claimed',
  attention: 'terminal_attention',
}

export function matchesPilotFilter(readiness: PilotReadiness, filter: PilotFilter): boolean {
  if (filter === 'all') return true
  return FILTER_TO_READINESS[filter] === readiness
}

/** Narrow an arbitrary query value to a known filter (default: all). */
export function toPilotFilter(value: string | undefined): PilotFilter {
  return (PILOT_FILTERS as readonly string[]).includes(value ?? '')
    ? (value as PilotFilter)
    : 'all'
}

// ---------------------------------------------------------------------------
// Prepared-profile editability (server actions re-check after a fresh read)
// ---------------------------------------------------------------------------

export type PreparedProfileEditabilityInput = {
  exists: boolean
  userId: string | null
  origin: string
  status: string
}

export type PreparedProfileEditability =
  | { ok: true }
  | {
      ok: false
      code: 'not_found' | 'master_claimed' | 'not_admin_prepared' | 'not_editable_status'
    }

/**
 * A prepared profile is editable through the pilot editor iff it still
 * exists, is unclaimed, has origin admin_prepared and status pending.
 * The server action re-reads the row and calls this BEFORE updating, and the
 * UPDATE itself repeats the same conditions as WHERE clauses (0 rows =
 * concurrent change -> conflict). Order: found -> claimed -> origin -> status.
 */
export function evaluatePreparedProfileEditability(
  m: PreparedProfileEditabilityInput
): PreparedProfileEditability {
  if (!m.exists) return { ok: false, code: 'not_found' }
  if (m.userId !== null) return { ok: false, code: 'master_claimed' }
  if (m.origin !== 'admin_prepared') return { ok: false, code: 'not_admin_prepared' }
  if (m.status !== 'pending') return { ok: false, code: 'not_editable_status' }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Pilot server-action result contract
// ---------------------------------------------------------------------------

export const PILOT_ACTION_CODES = [
  'ok',
  'not_authenticated',
  'not_authorized',
  'invalid_input',
  'not_found',
  'master_claimed',
  'not_admin_prepared',
  'not_editable_status',
  'conflict',
  'unexpected_error',
] as const
export type PilotActionCode = (typeof PILOT_ACTION_CODES)[number]

export const PILOT_ACTION_MESSAGES_PL: Record<PilotActionCode, string> = {
  ok: 'Zapisano.',
  not_authenticated: 'Musisz być zalogowany.',
  not_authorized: 'Brak uprawnień.',
  invalid_input: 'Nieprawidłowe dane formularza.',
  not_found: 'Nie znaleziono profilu saunamistrza.',
  master_claimed: 'Ten profil został już przejęty przez właściciela — edycja przez pilot jest zablokowana.',
  not_admin_prepared: 'Ten profil nie jest profilem przygotowanym przez administrację.',
  not_editable_status: 'Profil nie jest już w stanie umożliwiającym edycję pilotażową.',
  conflict: 'Profil został w międzyczasie zmieniony — odśwież stronę i spróbuj ponownie.',
  unexpected_error: 'Wystąpił nieoczekiwany błąd.',
}

export type PilotActionResult = {
  ok: boolean
  code: PilotActionCode
  message: string
  /** Present on successful create — the id of the new prepared profile. */
  masterId?: string
}

/** Build a stable result; a custom message may refine (never replace) a code. */
export function pilotResult(
  code: PilotActionCode,
  overrides?: { message?: string; masterId?: string }
): PilotActionResult {
  return {
    ok: code === 'ok',
    code,
    message: overrides?.message ?? PILOT_ACTION_MESSAGES_PL[code],
    ...(overrides?.masterId ? { masterId: overrides.masterId } : {}),
  }
}
