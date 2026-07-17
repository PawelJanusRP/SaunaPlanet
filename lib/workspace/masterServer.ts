import { createClient } from '@/lib/supabase/server'

/**
 * Server-side scope resolution for the Master Studio (SP-035) — the
 * counterpart of lib/workspace/ownerServer.ts. Every /studio page calls this
 * once; "which master profile does this account own and what are its
 * affiliations" is answered in exactly one place.
 *
 * Ownership = sauna_masters.user_id (Layer 3 link). home_sauna_id is legacy
 * display data only and never participates in authorization (Decision 016).
 *
 * Visibility only: privileged actions stay in server actions + RLS.
 */

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type OwnMasterProfile = {
  id: string
  name: string
  level: string | null
  bio: string | null
  avatarUrl: string | null
  status: 'pending' | 'approved' | 'rejected'
  /** Legacy home sauna — read-only transitional data (Decision 016). */
  homeSauna: { id: string; name: string } | null
}

export type MasterAffiliation = {
  id: string
  status: 'pending' | 'approved' | 'rejected' | 'ended'
  initiatedBy: 'master' | 'facility'
  isPrimary: boolean
  createdAt: string
  saunaId: string
  saunaName: string
  saunaCity: string | null
}

export type MasterStudioScope = {
  /** The master profile linked to this account, or null. */
  profile: OwnMasterProfile | null
  /** All affiliations of that profile (any status), newest first. */
  affiliations: MasterAffiliation[]
}

export async function loadMasterStudioScope(
  supabase: SupabaseServerClient,
  userId: string
): Promise<MasterStudioScope> {
  const { data: profileRaw } = await supabase
    .from('sauna_masters')
    .select('id, name, level, bio, avatar_url, status, home_sauna_id, saunas:home_sauna_id(id, name)')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profileRaw) {
    return { profile: null, affiliations: [] }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = profileRaw as any
  const profile: OwnMasterProfile = {
    id: p.id,
    name: p.name,
    level: p.level ?? null,
    bio: p.bio ?? null,
    avatarUrl: p.avatar_url ?? null,
    status: p.status,
    homeSauna: p.saunas ? { id: p.saunas.id, name: p.saunas.name } : null,
  }

  const { data: affiliationsRaw } = await supabase
    .from('master_affiliations')
    .select('id, status, initiated_by, is_primary, created_at, sauna_id, saunas(name, city)')
    .eq('master_id', profile.id)
    .order('created_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const affiliations: MasterAffiliation[] = ((affiliationsRaw ?? []) as any[]).map((a) => ({
    id: a.id,
    status: a.status,
    initiatedBy: a.initiated_by,
    isPrimary: a.is_primary,
    createdAt: a.created_at,
    saunaId: a.sauna_id,
    saunaName: a.saunas?.name ?? 'Sauna',
    saunaCity: a.saunas?.city ?? null,
  }))

  return { profile, affiliations }
}
