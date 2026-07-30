// SP-039 Slice 3B1 — prepared-profile invitation eligibility (pure).
//
// Mirrors the authoritative eligibility check inside
// admin_create_master_claim_invitation so the (future) admin UI can pre-validate
// and show the right message. The DATABASE remains the authority — this is a UX
// convenience and a tested contract, never a security boundary.

import type { ClaimResultCode } from './types'

export type MasterEligibilityInput = {
  exists: boolean
  /** null = unclaimed; non-null = already linked to an account. */
  userId: string | null
  origin: string
  status: string
  name: string | null
}

export type EligibilityVerdict = {
  eligible: boolean
  code: Extract<
    ClaimResultCode,
    'ok' | 'master_not_found' | 'master_already_claimed' | 'master_not_eligible'
  >
}

/** A profile is invitable iff: exists, unclaimed, admin_prepared, pending,
 *  and has a non-empty name. Order matches the RPC (found -> claimed -> rest). */
export function evaluateInvitationEligibility(
  m: MasterEligibilityInput
): EligibilityVerdict {
  if (!m.exists) return { eligible: false, code: 'master_not_found' }
  if (m.userId !== null) return { eligible: false, code: 'master_already_claimed' }
  const nameOk = typeof m.name === 'string' && m.name.trim().length > 0
  if (m.origin !== 'admin_prepared' || m.status !== 'pending' || !nameOk) {
    return { eligible: false, code: 'master_not_eligible' }
  }
  return { eligible: true, code: 'ok' }
}
