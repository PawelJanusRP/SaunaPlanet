'use server'

// SP-044 Slice A — admin-only master profile deletion.
//
// Thin wrapper over the trusted admin_delete_master_profile DEFINER RPC. The
// RPC is the real authorization + transactional boundary (exact admin role,
// advisory lock, invitation detokenization, audit, cascade). This layer adds a
// defense-in-depth role check and a stable, bounded result — never a raw error.

import { revalidatePath } from 'next/cache'
import { createClient, getCurrentUserRole } from '@/lib/supabase/server'

export type DeleteMasterResult = { ok: boolean; code: string; name?: string }

export async function deleteMasterProfile(masterId: string): Promise<DeleteMasterResult> {
  // Admin-only — moderators must NOT reach this destructive boundary.
  const role = await getCurrentUserRole()
  if (role !== 'admin') return { ok: false, code: 'not_authorized' }
  if (!masterId) return { ok: false, code: 'invalid_input' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_delete_master_profile', {
    p_master_id: masterId,
  })
  if (error) return { ok: false, code: 'unexpected_error' }

  const res = (data ?? {}) as { ok?: boolean; code?: string; data?: { name?: string } }
  if (res.ok) {
    revalidatePath('/masters')
    revalidatePath('/admin')
    return { ok: true, code: res.code ?? 'deleted', name: res.data?.name }
  }
  return { ok: false, code: res.code ?? 'unexpected_error' }
}
