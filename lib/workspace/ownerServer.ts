import { createClient } from '@/lib/supabase/server'
import {
  resolveWorkspaceContext,
  workspaceContextIds,
  type ActiveWorkspaceContext,
  type WorkspaceContextOption,
} from './context'

/**
 * Server-side scope resolution for the Owner Workspace (SP-033). Every
 * /workspace page calls this once instead of re-implementing membership
 * loading and context resolution — the single place where "which facilities
 * does this account operate and which are in scope right now" is answered.
 *
 * Visibility only: data access is still constrained by RLS and the explicit
 * user_id filter; privileged actions stay in server actions.
 */

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type OwnerMembership = {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  saunaId: string
  saunaName: string
  saunaCity: string | null
}

export type OwnerWorkspaceScope = {
  /** All memberships (any status) — the portfolio list with status chips. */
  memberships: OwnerMembership[]
  /** Approved facilities as context options. */
  options: WorkspaceContextOption[]
  context: ActiveWorkspaceContext
  /** Facility ids the active context spans; empty = no approved membership. */
  activeSaunaIds: string[]
}

export async function loadOwnerWorkspaceScope(
  supabase: SupabaseServerClient,
  userId: string,
  contextParam: string | undefined
): Promise<OwnerWorkspaceScope> {
  const { data } = await supabase
    .from('sauna_managers')
    .select('id, status, sauna_id, saunas(id, name, city)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const memberships: OwnerMembership[] = ((data ?? []) as any[]).map((m) => ({
    id: m.id,
    status: m.status,
    saunaId: m.sauna_id,
    saunaName: m.saunas?.name ?? 'Sauna',
    saunaCity: m.saunas?.city ?? null,
  }))

  const options: WorkspaceContextOption[] = memberships
    .filter((m) => m.status === 'approved')
    .map((m) => ({ id: m.saunaId, label: m.saunaName }))

  const context = resolveWorkspaceContext(contextParam, options)

  return {
    memberships,
    options,
    context,
    activeSaunaIds: workspaceContextIds(context, options),
  }
}
