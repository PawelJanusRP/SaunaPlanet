'use server'

// SP-039 Slice 3B1 — admin claim-invitation Server Actions.
//
// Thin, safe wrappers over the M4 SECURITY DEFINER RPCs. Authorization,
// eligibility, locking, token generation and audit all live in the DATABASE
// (the RPC is the trust boundary); these wrappers only: invoke the RPC, map the
// stable code to a Polish message, and pass the RPC data through. The raw token
// (on create/regenerate success) is returned to the caller ONCE and is NEVER
// logged here. No admin UI is built in this slice.
//
// 'use server' contract (SP-039 Slice 1 lesson): every export below is an
// `export async function`; types come from the pure lib '@/lib/claim/types',
// never re-exported from this module.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { claimMessagePl, toClaimResultCode } from '@/lib/claim/errors'
import type { ClaimActionResult, ClaimRpcResult } from '@/lib/claim/types'

function mapResult(res: ClaimRpcResult | null, hadError: boolean): ClaimActionResult {
  if (hadError || !res || typeof res.code !== 'string') {
    // Never surface a raw PostgreSQL error to the caller/browser.
    return {
      ok: false,
      code: 'unexpected_error',
      message: claimMessagePl('unexpected_error'),
    }
  }
  const code = toClaimResultCode(res.code)
  return { ok: !!res.ok, code, message: claimMessagePl(code), data: res.data }
}

export async function createClaimInvitation(
  masterId: string,
  adminNote?: string | null,
  validDays: number = 14
): Promise<ClaimActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_create_master_claim_invitation', {
    p_master_id: masterId,
    p_valid_days: validDays,
    p_admin_note: adminNote ?? null,
  })
  const result = mapResult(data as ClaimRpcResult | null, !!error)
  if (result.ok) revalidatePath('/admin')
  return result
}

export async function markClaimInvitationSent(
  invitationId: string,
  deliveryChannel: string,
  deliveryTargetHint?: string | null
): Promise<ClaimActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_mark_master_claim_sent', {
    p_invitation_id: invitationId,
    p_delivery_channel: deliveryChannel,
    p_delivery_target_hint: deliveryTargetHint ?? null,
  })
  const result = mapResult(data as ClaimRpcResult | null, !!error)
  if (result.ok) revalidatePath('/admin')
  return result
}

export async function revokeClaimInvitation(
  invitationId: string,
  reason: string
): Promise<ClaimActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_revoke_master_claim_invitation', {
    p_invitation_id: invitationId,
    p_reason: reason,
  })
  const result = mapResult(data as ClaimRpcResult | null, !!error)
  if (result.ok) revalidatePath('/admin')
  return result
}

export async function regenerateClaimInvitation(
  masterId: string,
  reason: string,
  validDays: number = 14
): Promise<ClaimActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_regenerate_master_claim_invitation', {
    p_master_id: masterId,
    p_reason: reason,
    p_valid_days: validDays,
  })
  const result = mapResult(data as ClaimRpcResult | null, !!error)
  if (result.ok) revalidatePath('/admin')
  return result
}

export async function listClaimInvitations(): Promise<ClaimActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_list_master_claim_invitations')
  return mapResult(data as ClaimRpcResult | null, !!error)
}

export async function getClaimInvitation(
  invitationId: string
): Promise<ClaimActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_get_master_claim_invitation', {
    p_id: invitationId,
  })
  return mapResult(data as ClaimRpcResult | null, !!error)
}
