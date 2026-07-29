// SP-039 Slice 3B3 — invitation-control model (pure): action-availability
// matrix, input validation for mark-sent/revoke/regenerate, and the stable
// result contracts of the invitation server actions.
//
// The DATABASE (M4 RPCs) remains the final authority for every transition —
// this matrix only decides what the moderator UI OFFERS; a stale UI verdict is
// always corrected by the RPC's own gate.

import { claimMessagePl } from './errors'
import type { ClaimResultCode, DeliveryChannel } from './types'
import { DELIVERY_CHANNELS } from './types'
import {
  evaluatePilotReadiness,
  type PilotInvitationSummary,
  type PilotProfileState,
} from './pilot'

// ---------------------------------------------------------------------------
// Action-availability matrix
// ---------------------------------------------------------------------------

/** Effective invitation state the matrix keys on (documented contract). */
export const INVITATION_CONTROL_STATES = [
  'none',
  'ready',
  'sent',
  'opened',
  'claimed',
  'expired',
  'revoked',
] as const
export type InvitationControlState = (typeof INVITATION_CONTROL_STATES)[number]

export type InvitationActionAvailability = {
  /** Effective state; an active-STATUS invitation past expires_at is treated
   *  as `expired` (the DB materializes expiry lazily on the next generate). */
  state: InvitationControlState
  canGenerate: boolean
  canMarkSent: boolean
  canRevoke: boolean
  canRegenerate: boolean
}

const NO_ACTIONS = {
  canGenerate: false,
  canMarkSent: false,
  canRevoke: false,
  canRegenerate: false,
}

/**
 * Documented matrix (UI-offer level; DB authoritative):
 *  - none:    Generate only when readiness = ready_for_invitation.
 *  - ready:   Mark-sent + Revoke + Regenerate. (Copy exists only while the raw
 *             token is still in the immediate response — a UI-state concern,
 *             not part of this matrix.)
 *  - sent:    Revoke + Regenerate (mark-sent is idempotent server-side and not
 *             offered as a normal transition).
 *  - opened:  Revoke + Regenerate.
 *  - claimed profile or claimed invitation: NO mutation controls.
 *  - expired / revoked (incl. active-status past expires_at): Regenerate only,
 *    and only while the profile remains unclaimed and otherwise eligible
 *    (admin_prepared + pending + complete).
 */
export function evaluateInvitationActions(
  profile: PilotProfileState,
  latestInvitation: PilotInvitationSummary | null,
  now: Date = new Date()
): InvitationActionAvailability {
  const readiness = evaluatePilotReadiness(profile, latestInvitation, now)

  if (readiness.readiness === 'claimed') {
    return { state: 'claimed', ...NO_ACTIONS }
  }

  // Unclaimed + structurally invitable + complete — the regenerate/generate gate.
  const eligible =
    profile.userId === null &&
    profile.origin === 'admin_prepared' &&
    profile.status === 'pending' &&
    readiness.missingRequired.length === 0

  if (!latestInvitation) {
    return {
      state: 'none',
      ...NO_ACTIONS,
      canGenerate: readiness.readiness === 'ready_for_invitation',
    }
  }

  // Active-status invitation past its expiry behaves as expired in the UI.
  if (readiness.invitationExpired || latestInvitation.status === 'expired') {
    return { state: 'expired', ...NO_ACTIONS, canRegenerate: eligible }
  }
  if (latestInvitation.status === 'revoked') {
    return { state: 'revoked', ...NO_ACTIONS, canRegenerate: eligible }
  }

  switch (latestInvitation.status) {
    case 'ready':
      return {
        state: 'ready',
        canGenerate: false,
        canMarkSent: true,
        canRevoke: true,
        canRegenerate: true,
      }
    case 'sent':
      return {
        state: 'sent',
        canGenerate: false,
        canMarkSent: false,
        canRevoke: true,
        canRegenerate: true,
      }
    case 'opened':
      return {
        state: 'opened',
        canGenerate: false,
        canMarkSent: false,
        canRevoke: true,
        canRegenerate: true,
      }
    default:
      // 'claimed' handled above via readiness; anything else: fail closed.
      return { state: 'claimed', ...NO_ACTIONS }
  }
}

// ---------------------------------------------------------------------------
// Input validation (mirrors the RPC contracts; Polish messages)
// ---------------------------------------------------------------------------

export const DELIVERY_CHANNEL_LABELS_PL: Record<DeliveryChannel, string> = {
  email: 'E-mail',
  messenger: 'Messenger',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  other: 'Inny kanał',
}

export function isDeliveryChannel(v: unknown): v is DeliveryChannel {
  return typeof v === 'string' && (DELIVERY_CHANNELS as readonly string[]).includes(v)
}

export const DELIVERY_HINT_MAX = 120
export const DELIVERY_HINT_EXAMPLES = [
  'p***@example.com',
  '***123',
  'Messenger — profil publiczny',
] as const

/** local@domain.tld with no masking chars anywhere — a likely FULL address. */
const FULL_EMAIL_SHAPE = /(^|[\s(<:])[^\s@*]{2,}@[^\s@*]+\.[A-Za-z]{2,}/

export type HintValidation =
  | { ok: true; value: string | null }
  | { ok: false; message: string }

/**
 * Conservative redaction gate for the delivery hint. Only a REDACTED hint may
 * be stored (design decision 12): reject values that look like a complete
 * private e-mail address (user@domain.tld without any `*` masking) or a
 * complete phone number (7+ digits total without any `*`). Blank -> null.
 * The database stores the value as-given, so this application gate is the
 * redaction boundary.
 */
export function validateDeliveryHint(raw: string | null | undefined): HintValidation {
  const hint = (raw ?? '').trim()
  if (!hint) return { ok: true, value: null }
  if (hint.length > DELIVERY_HINT_MAX) {
    return { ok: false, message: `Wskazówka może mieć najwyżej ${DELIVERY_HINT_MAX} znaków.` }
  }
  if (!hint.includes('*') && FULL_EMAIL_SHAPE.test(hint)) {
    return {
      ok: false,
      message:
        'Wygląda na pełny adres e-mail — zapisz tylko zredagowaną wskazówkę, np. p***@example.com.',
    }
  }
  const digitCount = (hint.match(/\d/g) ?? []).length
  if (!hint.includes('*') && digitCount >= 7) {
    return {
      ok: false,
      message:
        'Wygląda na pełny numer telefonu — zapisz tylko zredagowaną wskazówkę, np. ***123.',
    }
  }
  return { ok: true, value: hint }
}

export const INVITATION_REASON_MAX = 2000

export type ReasonValidation =
  | { ok: true; value: string }
  | { ok: false; message: string }

/** Revoke/regenerate reason: required non-empty, capped at the audit limit. */
export function validateInvitationReason(raw: string | null | undefined): ReasonValidation {
  const reason = (raw ?? '').trim()
  if (!reason) return { ok: false, message: 'Podaj powód — jest wymagany i trafia do historii.' }
  if (reason.length > INVITATION_REASON_MAX) {
    return { ok: false, message: `Powód może mieć najwyżej ${INVITATION_REASON_MAX} znaków.` }
  }
  return { ok: true, value: reason }
}

export const VALID_DAYS_MIN = 1
export const VALID_DAYS_MAX = 60
export const VALID_DAYS_DEFAULT = 14

/** Mirrors the RPC clamp: integers within 1–60 pass through, anything else
 *  becomes the approved default (14). */
export function normalizeValidDays(raw: unknown): number {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
  if (typeof n !== 'number' || !Number.isInteger(n)) return VALID_DAYS_DEFAULT
  if (n < VALID_DAYS_MIN || n > VALID_DAYS_MAX) return VALID_DAYS_DEFAULT
  return n
}

// ---------------------------------------------------------------------------
// Server-action result contracts
// ---------------------------------------------------------------------------

/**
 * Result codes of the invitation server actions = the RPC's stable codes plus:
 *  - `payload_malformed` — RPC succeeded but returned an unparseable grant
 *    (the operation may have happened; the caller must refresh, never retry
 *    blindly);
 *  - `invalid_input` — application-side validation failed before any RPC call.
 */
export type InvitationControlCode = ClaimResultCode | 'payload_malformed' | 'invalid_input'

const EXTRA_MESSAGES_PL: Record<'payload_malformed' | 'invalid_input', string> = {
  payload_malformed:
    'Nieprawidłowa odpowiedź serwera — zaproszenie mogło zostać utworzone. Odśwież stronę i sprawdź stan.',
  invalid_input: 'Nieprawidłowe dane formularza.',
}

export function invitationControlMessagePl(code: InvitationControlCode): string {
  if (code === 'payload_malformed' || code === 'invalid_input') {
    return EXTRA_MESSAGES_PL[code]
  }
  return claimMessagePl(code)
}

/**
 * The ONLY result type that may carry the secret (as the complete claim URL).
 * Mark-sent and revoke use InvitationControlResult, which has NO secret field
 * — the type system, not discipline, keeps the token out of generic results.
 */
export type InvitationSecretSuccess = {
  ok: true
  code: 'ok'
  message: string
  invitationId: string
  tokenPrefix: string
  expiresAt: string
  /** Full one-time claim link. Shown once, never persisted, never re-shown. */
  claimUrl: string
  revokedInvitationId: string | null
}

export type InvitationControlFailure = {
  ok: false
  code: Exclude<InvitationControlCode, 'ok'>
  message: string
}

export type InvitationSecretResult = InvitationSecretSuccess | InvitationControlFailure

/** Non-secret mutations (mark-sent, revoke): success codes pass through. */
export type InvitationControlResult =
  | { ok: true; code: InvitationControlCode; message: string }
  | InvitationControlFailure
