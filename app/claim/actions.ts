'use server'

// SP-039 Slice 4A — public claim Server Actions (the ONLY app-side gateway to
// the M7 public RPCs). The claim page UI ships in Slice 4B; these wrappers are
// implemented and contract-tested first.
//
// Trust model: authorization, hashing, locking, eligibility, atomicity and
// audit ALL live in the database RPCs. These wrappers only: fail-closed on a
// malformed token shape (never forwarding garbage to the DB), invoke the RPC,
// and map stable codes to Polish messages through allow-list sanitizers.
//
// Secret handling: the raw token parameter is passed to the RPC and NOTHING
// else — it is never logged, stored, echoed back, put into a redirect, or
// included in any returned object. Raw PostgreSQL errors never reach the
// caller ('use server' contract: async-function exports only; types come from
// the pure lib, never re-exported here).

import { createClient } from '@/lib/supabase/server'
import {
  extractClaimedMasterId,
  isValidClaimTokenShape,
  sanitizePublicInvitationPreview,
  toPublicClaimResultCode,
  toPublicClaimState,
  PUBLIC_CLAIM_RESULT_MESSAGES_PL,
  PUBLIC_CLAIM_STATE_MESSAGES_PL,
  type PublicClaimActionResult,
  type PublicInspectionResult,
} from '@/lib/claim/publicClaim'
import type { ClaimRpcResult } from '@/lib/claim/types'

function inspectionFailure(state: 'invalid_or_unknown'): PublicInspectionResult {
  return {
    state,
    message: PUBLIC_CLAIM_STATE_MESSAGES_PL[state],
    preview: null,
  }
}

/** Boundary A — pre-auth inspection for the (future) landing page. */
export async function inspectMasterClaimInvitation(
  rawToken: string
): Promise<PublicInspectionResult> {
  // Fail closed BEFORE any network/database work on a malformed shape.
  if (!isValidClaimTokenShape(rawToken)) {
    return inspectionFailure('invalid_or_unknown')
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'public_inspect_master_claim_invitation',
    { p_token: rawToken }
  )
  const res = data as ClaimRpcResult | null
  if (error || !res || typeof res.code !== 'string') {
    // Never surface a raw PostgreSQL error; the generic negative is safe.
    return inspectionFailure('invalid_or_unknown')
  }

  const state = toPublicClaimState(res.code === 'claimable' ? 'claimable' : res.code)
  const preview =
    state === 'claimable' ? sanitizePublicInvitationPreview(res.data) : null
  if (state === 'claimable' && preview === null) {
    // A claimable response without a valid payload is malformed — fail closed.
    return inspectionFailure('invalid_or_unknown')
  }
  return { state, message: PUBLIC_CLAIM_STATE_MESSAGES_PL[state], preview }
}

/** Boundary B — authenticated atomic claim. */
export async function claimMasterProfile(
  rawToken: string
): Promise<PublicClaimActionResult> {
  if (!isValidClaimTokenShape(rawToken)) {
    return {
      ok: false,
      code: 'invalid_token',
      message: PUBLIC_CLAIM_RESULT_MESSAGES_PL.invalid_token,
      masterId: null,
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('public_claim_master_profile', {
    p_token: rawToken,
  })
  const res = data as ClaimRpcResult | null
  if (error || !res || typeof res.code !== 'string') {
    return {
      ok: false,
      code: 'unexpected_error',
      message: PUBLIC_CLAIM_RESULT_MESSAGES_PL.unexpected_error,
      masterId: null,
    }
  }

  const code = toPublicClaimResultCode(res.code)
  const ok = code === 'claimed' || code === 'already_claimed_by_you'
  return {
    ok,
    code,
    message: PUBLIC_CLAIM_RESULT_MESSAGES_PL[code],
    masterId: ok ? extractClaimedMasterId(res.data) : null,
  }
}
