// SP-039 Slice 3B1 — invitation status-transition legality (pure).
//
// Mirrors the authoritative transitions enforced by the DB RPCs. Slice 3B1
// drives ready/sent/expired/revoked; opened/claimed are schema-compatible but
// their end-user transitions ship in Slice 4. The DATABASE is the authority.

import type { InvitationStatus } from './types'

const ACTIVE: ReadonlySet<InvitationStatus> = new Set([
  'ready',
  'sent',
  'opened',
])
const TERMINAL: ReadonlySet<InvitationStatus> = new Set([
  'claimed',
  'expired',
  'revoked',
])

export function isActiveStatus(s: InvitationStatus): boolean {
  return ACTIVE.has(s)
}

export function isTerminalStatus(s: InvitationStatus): boolean {
  return TERMINAL.has(s)
}

/** mark-sent is legal only from `ready`. */
export function canMarkSent(s: InvitationStatus): boolean {
  return s === 'ready'
}

/** revoke is legal from any active status. */
export function canRevoke(s: InvitationStatus): boolean {
  return ACTIVE.has(s)
}

/** materialize-expired applies to an active row past its expiry. */
export function shouldExpire(
  s: InvitationStatus,
  expiresAt: Date,
  now: Date
): boolean {
  return ACTIVE.has(s) && expiresAt.getTime() <= now.getTime()
}
