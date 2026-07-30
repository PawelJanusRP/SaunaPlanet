// SP-039 Slice 3B1 — pure types for the admin claim-invitation layer.
// This is a PURE library module (no 'use server'): types live here so the
// Server Action module can import them without a runtime re-export (the SP-039
// Slice 1 Turbopack lesson — see lib/master/profileUpdate.ts).

/** Final MVP invitation status vocabulary (no `created`). */
export const INVITATION_STATUSES = [
  'ready',
  'sent',
  'opened',
  'claimed',
  'expired',
  'revoked',
] as const
export type InvitationStatus = (typeof INVITATION_STATUSES)[number]

/** Statuses counted as "active" for the one-active-per-master uniqueness. */
export const ACTIVE_INVITATION_STATUSES = ['ready', 'sent', 'opened'] as const
export type ActiveInvitationStatus = (typeof ACTIVE_INVITATION_STATUSES)[number]

/** Slice-3 audit event vocabulary. */
export const CLAIM_EVENT_TYPES = [
  'profile_prepared',
  'invitation_created',
  'invitation_sent',
  'invitation_revoked',
  'invitation_regenerated',
  'invitation_expired',
] as const
export type ClaimEventType = (typeof CLAIM_EVENT_TYPES)[number]

/**
 * Stable result codes shared by the DB RPCs and the server-action mapping.
 * Success codes: ok | sent | revoked | already_sent | already_revoked.
 */
export const CLAIM_RESULT_CODES = [
  'ok',
  'sent',
  'revoked',
  'already_sent',
  'already_revoked',
  'not_authenticated',
  'not_authorized',
  'master_not_found',
  'master_already_claimed',
  'master_not_eligible',
  'active_invitation_exists',
  'invitation_not_found',
  'invalid_transition',
  'invitation_already_terminal',
  'generation_conflict',
  'rate_limited',
  'unexpected_error',
] as const
export type ClaimResultCode = (typeof CLAIM_RESULT_CODES)[number]

/** Raw jsonb shape returned by the DB RPCs. */
export type ClaimRpcResult = {
  ok: boolean
  code: string
  data?: unknown
}

/** Result a Server Action returns to its caller (Polish message included). */
export type ClaimActionResult = {
  ok: boolean
  code: ClaimResultCode
  message: string
  /** Passed through from the RPC; on create/regenerate success carries the
   *  one-time `raw_token`. Callers must show it once and NEVER log it. */
  data?: unknown
}

export const DELIVERY_CHANNELS = [
  'email',
  'messenger',
  'whatsapp',
  'sms',
  'other',
] as const
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number]
