// SP-039 Slice 4A — pure model for the PUBLIC claim boundary.
//
// Two separate contracts, mirroring the M7 RPC pair:
//   * inspection (pre-auth landing page): a state enumeration plus a minimal
//     allow-listed profile snapshot — nothing else ever crosses this boundary;
//   * atomic claim (authenticated): stable result codes only.
//
// The DATABASE is the authority for every rule; this module is the tested
// UI/action contract (message mapping, allow-list sanitizing, shape checks).
// Raw tokens and PostgreSQL errors must never reach the browser.

import { CLAIM_TOKEN_SHAPE } from './claimLink'

/** Public invitation states the landing page may learn (Boundary A).
 *  Malformed and unknown tokens deliberately share `invalid_or_unknown`
 *  (anti-enumeration); `already_claimed` covers both a claimed invitation and
 *  an owned master. */
export const PUBLIC_CLAIM_STATES = [
  'claimable',
  'invalid_or_unknown',
  'expired',
  'revoked',
  'already_claimed',
] as const
export type PublicClaimState = (typeof PUBLIC_CLAIM_STATES)[number]

/** Stable result codes of the authenticated atomic claim (Boundary B).
 *  Success codes: `claimed` and the winner-idempotent `already_claimed_by_you`. */
export const PUBLIC_CLAIM_RESULT_CODES = [
  'claimed',
  'already_claimed_by_you',
  'not_authenticated',
  'invalid_token',
  'expired',
  'revoked',
  'already_claimed',
  'master_not_eligible',
  'user_already_master',
  'unexpected_error',
] as const
export type PublicClaimResultCode = (typeof PUBLIC_CLAIM_RESULT_CODES)[number]

/** Codes on which the claim outcome is settled for this user (no retry). */
export const TERMINAL_PUBLIC_CLAIM_CODES: readonly PublicClaimResultCode[] = [
  'claimed',
  'already_claimed_by_you',
  'expired',
  'revoked',
  'already_claimed',
]

export const PUBLIC_CLAIM_STATE_MESSAGES_PL: Record<PublicClaimState, string> = {
  claimable: 'Ten profil czeka na przejęcie.',
  invalid_or_unknown: 'Ten link zaproszenia jest nieprawidłowy lub nieaktualny.',
  expired: 'To zaproszenie wygasło — poproś administrację o nowy link.',
  revoked: 'To zaproszenie zostało unieważnione — poproś administrację o nowy link.',
  already_claimed: 'Ten profil został już przejęty.',
}

export const PUBLIC_CLAIM_RESULT_MESSAGES_PL: Record<PublicClaimResultCode, string> = {
  claimed: 'Profil został przypisany do Twojego konta.',
  already_claimed_by_you: 'Ten profil jest już przypisany do Twojego konta.',
  not_authenticated: 'Zaloguj się, aby przejąć profil.',
  invalid_token: 'Ten link zaproszenia jest nieprawidłowy lub nieaktualny.',
  expired: 'To zaproszenie wygasło — poproś administrację o nowy link.',
  revoked: 'To zaproszenie zostało unieważnione — poproś administrację o nowy link.',
  already_claimed: 'Ten profil został już przejęty przez inne konto.',
  master_not_eligible:
    'Tego profilu nie można teraz przejąć — skontaktuj się z administracją.',
  user_already_master:
    'Twoje konto ma już profil saunamistrza — skontaktuj się z administracją.',
  unexpected_error: 'Wystąpił nieoczekiwany błąd. Spróbuj ponownie.',
}

/** Narrow an arbitrary string to a known public state (fail-closed default). */
export function toPublicClaimState(code: string): PublicClaimState {
  return (PUBLIC_CLAIM_STATES as readonly string[]).includes(code)
    ? (code as PublicClaimState)
    : 'invalid_or_unknown'
}

/** Narrow an arbitrary string to a known claim result code (fail-closed). */
export function toPublicClaimResultCode(code: string): PublicClaimResultCode {
  return (PUBLIC_CLAIM_RESULT_CODES as readonly string[]).includes(code)
    ? (code as PublicClaimResultCode)
    : 'unexpected_error'
}

/** Client-side pre-check of the token shape. UX convenience AND a fail-closed
 *  gate: the server wrapper refuses to call the RPC for malformed input. The
 *  database re-validates authoritatively. */
export function isValidClaimTokenShape(token: unknown): token is string {
  return typeof token === 'string' && CLAIM_TOKEN_SHAPE.test(token)
}

/** The ONLY data the landing page ever receives about a claimable profile. */
export type PublicInvitationPreview = {
  state: 'claimable'
  masterName: string
  city: string | null
  avatarUrl: string | null
  bio: string | null
  expiresAt: string | null
  authRequired: boolean
}

/** Inspection states as consumed by the claim page: the five DB-contract
 *  states plus the FRONTEND-ONLY `unavailable` (transport/malformed-response
 *  failure — retryable, deliberately distinct from the terminal generic
 *  negative so the page can say "odśwież" instead of "link nieaktualny"). */
export type PublicInspectionState = PublicClaimState | 'unavailable'

export const PUBLIC_INSPECTION_MESSAGES_PL: Record<PublicInspectionState, string> = {
  ...PUBLIC_CLAIM_STATE_MESSAGES_PL,
  unavailable: 'Chwilowy problem techniczny — odśwież stronę i spróbuj ponownie.',
}

/** Result of the inspection boundary as consumed by the claim page. */
export type PublicInspectionResult = {
  state: PublicInspectionState
  message: string
  preview: PublicInvitationPreview | null
}

/** Result of the authenticated claim as consumed by the (future 4B) page. */
export type PublicClaimActionResult = {
  ok: boolean
  code: PublicClaimResultCode
  message: string
  /** Present only on `claimed` / `already_claimed_by_you`. */
  masterId: string | null
}

/**
 * ALLOW-LIST sanitizer for the inspection payload. Only the fields named here
 * can ever reach a component; secret or internal keys in the raw payload are
 * structurally dropped, never forwarded.
 */
export function sanitizePublicInvitationPreview(
  raw: unknown
): PublicInvitationPreview | null {
  if (raw === null || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = typeof r.master_name === 'string' ? r.master_name.trim() : ''
  if (name.length === 0) return null
  return {
    state: 'claimable',
    masterName: name,
    city: typeof r.city === 'string' && r.city.trim() !== '' ? r.city : null,
    avatarUrl:
      typeof r.avatar_url === 'string' && r.avatar_url.trim() !== ''
        ? r.avatar_url
        : null,
    bio: typeof r.bio === 'string' && r.bio.trim() !== '' ? r.bio : null,
    expiresAt: typeof r.expires_at === 'string' ? r.expires_at : null,
    authRequired: r.auth_required !== false,
  }
}

/** Extract the master id from a successful claim payload (allow-list). */
export function extractClaimedMasterId(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null
  const id = (raw as Record<string, unknown>).master_id
  return typeof id === 'string' && id.length > 0 ? id : null
}
