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

import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import {
  extractClaimedMasterId,
  isValidClaimTokenShape,
  sanitizePublicInvitationPreview,
  toPublicClaimResultCode,
  toPublicClaimState,
  type PublicClaimActionResult,
  type PublicInspectionResult,
  type PublicInspectionState,
} from '@/lib/claim/publicClaim'
import type { ClaimRpcResult } from '@/lib/claim/types'

// SP-047E1: canonical states/codes come from the pure lib (unchanged); the
// user-visible message is resolved from that stable code via next-intl at this
// presentation boundary (getTranslations resolves the locale from the
// NEXT_LOCALE cookie in this bare Server Action).
type ClaimT = Awaited<ReturnType<typeof getTranslations<'claim'>>>

function inspectionFailure(
  state: 'invalid_or_unknown' | 'unavailable',
  t: ClaimT
): PublicInspectionResult {
  return {
    state,
    message: t(`publicState.${state}`),
    preview: null,
  }
}

/** Boundary A — pre-auth inspection for the (future) landing page. */
export async function inspectMasterClaimInvitation(
  rawToken: string
): Promise<PublicInspectionResult> {
  const t = await getTranslations('claim')
  // Fail closed BEFORE any network/database work on a malformed shape.
  if (!isValidClaimTokenShape(rawToken)) {
    return inspectionFailure('invalid_or_unknown', t)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc(
    'public_inspect_master_claim_invitation',
    { p_token: rawToken }
  )
  const res = data as ClaimRpcResult | null
  if (error || !res || typeof res.code !== 'string') {
    // Never surface a raw PostgreSQL error. A transport failure is RETRYABLE
    // ('unavailable'), never conflated with the terminal generic negative.
    return inspectionFailure('unavailable', t)
  }

  const state = toPublicClaimState(res.code === 'claimable' ? 'claimable' : res.code)
  const preview =
    state === 'claimable' ? sanitizePublicInvitationPreview(res.data) : null
  if (state === 'claimable' && preview === null) {
    // A claimable response without a valid payload is malformed — fail closed.
    return inspectionFailure('invalid_or_unknown', t)
  }
  return { state, message: t(`publicState.${state as PublicInspectionState}`), preview }
}

/** Boundary B — authenticated atomic claim. */
export async function claimMasterProfile(
  rawToken: string
): Promise<PublicClaimActionResult> {
  const t = await getTranslations('claim')
  if (!isValidClaimTokenShape(rawToken)) {
    return {
      ok: false,
      code: 'invalid_token',
      message: t('publicResult.invalid_token'),
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
      message: t('publicResult.unexpected_error'),
      masterId: null,
    }
  }

  const code = toPublicClaimResultCode(res.code)
  const ok = code === 'claimed' || code === 'already_claimed_by_you'
  return {
    ok,
    code,
    message: t(`publicResult.${code}`),
    masterId: ok ? extractClaimedMasterId(res.data) : null,
  }
}
