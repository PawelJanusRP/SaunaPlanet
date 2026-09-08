// SP-045 — pure normalization for the public master-search RPC result.
//
// SP-044 privacy: this maps ONLY the allow-listed public projection returned by
// search_public_masters (id, slug, name, avatar_url, city, bio, specialties).
// `name` is the effective PUBLIC display identity (pseudonym when the master
// enabled show_nickname_only). There is no path here to full_name / user_id /
// any private field — the RPC does not return them and this mapper does not read
// them.

export type PublicMasterResult = {
  id: string
  slug: string | null
  name: string
  avatarUrl: string | null
  city: string | null
  bio: string | null
  specialties: string[]
}

/** Map ONE public RPC row. Unknown/missing fields normalize defensively. */
export function normalizeMasterRow(row: Record<string, unknown>): PublicMasterResult {
  const specialties = Array.isArray(row.specialties)
    ? (row.specialties as unknown[]).filter((s): s is string => typeof s === 'string')
    : []
  return {
    id: String(row.id ?? ''),
    slug: typeof row.slug === 'string' && row.slug ? row.slug : null,
    name: typeof row.name === 'string' ? row.name : '',
    avatarUrl: typeof row.avatar_url === 'string' && row.avatar_url ? row.avatar_url : null,
    city: typeof row.city === 'string' && row.city ? row.city : null,
    bio: typeof row.bio === 'string' && row.bio ? row.bio : null,
    specialties,
  }
}

/** Allow-listed keys the public master projection may contain (contract). */
export const PUBLIC_MASTER_FIELDS = [
  'id', 'slug', 'name', 'avatar_url', 'city', 'bio', 'specialties',
] as const

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>
}

/**
 * Calls the SP-045 public master-search RPC and returns normalized rows.
 * Fails soft: on any error (e.g. the RPC not yet applied to the target DB) it
 * returns [] rather than throwing, so search stays usable.
 */
export async function searchMastersNormalized(
  client: RpcClient,
  query: string,
  limit = 20
): Promise<PublicMasterResult[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const { data, error } = await client.rpc('search_public_masters', { p_query: q, p_limit: limit })
  if (error || !Array.isArray(data)) return []
  return (data as Record<string, unknown>[]).map(normalizeMasterRow)
}
