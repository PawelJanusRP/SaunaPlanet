// SP-045 Slice B — public master-search normalization + privacy contract.

import { describe, expect, it, vi } from 'vitest'
import {
  normalizeMasterRow,
  searchMastersNormalized,
  PUBLIC_MASTER_FIELDS,
  type PublicMasterResult,
} from '../masterSearch'

describe('normalizeMasterRow', () => {
  it('maps the allow-listed public projection only', () => {
    const r = normalizeMasterRow({
      id: 'm1', slug: 'jan-k', name: 'SteamFox', avatar_url: 'a.jpg',
      city: 'Poznań', bio: 'hi', specialties: ['aufguss', 'wim-hof'],
    })
    expect(r).toEqual<PublicMasterResult>({
      id: 'm1', slug: 'jan-k', name: 'SteamFox', avatarUrl: 'a.jpg',
      city: 'Poznań', bio: 'hi', specialties: ['aufguss', 'wim-hof'],
    })
  })

  it('never surfaces private identity fields even if present in the row (SP-044)', () => {
    // A hostile/over-broad row must not leak private data through the mapper.
    const r = normalizeMasterRow({
      id: 'm2', name: 'Pseudo', slug: null, avatar_url: null, city: null, bio: null,
      specialties: null,
      full_name: 'Jan Kowalski', user_id: 'auth-uuid', review_note: 'x',
    } as Record<string, unknown>)
    const json = JSON.stringify(r)
    expect(json).not.toContain('Jan Kowalski')
    expect(json).not.toContain('auth-uuid')
    expect(Object.keys(r).sort()).toEqual(
      ['avatarUrl', 'bio', 'city', 'id', 'name', 'slug', 'specialties']
    )
    expect(r.specialties).toEqual([])
  })

  it('the allow-listed field set is exactly the public projection', () => {
    expect([...PUBLIC_MASTER_FIELDS].sort()).toEqual(
      ['avatar_url', 'bio', 'city', 'id', 'name', 'slug', 'specialties']
    )
  })
})

describe('searchMastersNormalized', () => {
  it('does not query for < 2 chars (on-demand only)', async () => {
    const rpc = vi.fn()
    const rows = await searchMastersNormalized({ rpc }, 'a')
    expect(rows).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })

  it('calls search_public_masters and maps rows', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: 'm1', slug: null, name: 'Foo', avatar_url: null, city: 'Kraków', bio: null, specialties: [] }],
      error: null,
    })
    const rows = await searchMastersNormalized({ rpc }, 'foo', 10)
    expect(rpc).toHaveBeenCalledWith('search_public_masters', { p_query: 'foo', p_limit: 10 })
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Foo')
  })

  it('fails soft (returns []) when the RPC errors (e.g. not yet applied)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'function does not exist' } })
    expect(await searchMastersNormalized({ rpc }, 'foo')).toEqual([])
  })
})
