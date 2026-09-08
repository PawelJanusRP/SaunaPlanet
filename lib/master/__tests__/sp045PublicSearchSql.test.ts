// SP-045 — SQL contract + SP-044 privacy regression for public master search.
// Proves the new search boundary uses the public-visibility helper, exposes an
// allow-listed public projection, and NEVER references master_private_identity.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const mig = readFileSync('supabase/2026-09-08_sp045_public_master_search.sql', 'utf8')
// executable SQL only (comments document the boundary; code must not touch it)
const code = mig.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

describe('SP-045 — public master search privacy contract', () => {
  it('NEVER references the private identity table in executable SQL (SP-044 boundary)', () => {
    expect(code).not.toContain('master_private_identity')
    expect(code.toLowerCase()).not.toContain('full_name')
  })

  it('applies the is_master_publicly_visible boundary for every caller', () => {
    // both RPCs must gate on the public-visibility helper
    const uses = mig.match(/public\.is_master_publicly_visible\(/g) ?? []
    expect(uses.length).toBeGreaterThanOrEqual(2)
  })

  it('search projection is allow-listed to public fields only', () => {
    // returns table: id, slug, name (public/pseudonym), avatar_url, city, bio, specialties
    const sig = mig.slice(mig.indexOf('returns table ('))
    expect(sig).toContain('name        text')
    for (const forbidden of ['user_id', 'organizer_master_id uuid,', 'review_note', 'claim']) {
      expect(sig.slice(0, sig.indexOf('$$')).toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
  })

  it('name comes from sauna_masters.name (the effective public identity)', () => {
    expect(mig).toContain('m.name')
  })

  it('is on-demand and bounded (no corpus dump; capped limit)', () => {
    expect(mig).toContain('char_length(v_q) < 2')
    expect(mig).toContain('least(greatest(coalesce(p_limit, 20), 1), 50)')
  })

  it('escapes ILIKE wildcards in user input', () => {
    expect(mig).toContain(`replace(replace(replace(v_q, '\\', '\\\\'), '%', '\\%'), '_', '\\_')`)
  })

  it('both functions are STABLE SECURITY DEFINER with a pinned empty search_path', () => {
    const defs = mig.match(/security definer set search_path = ''/g) ?? []
    expect(defs.length).toBe(2)
    expect(mig).toContain('language plpgsql stable security definer')
    expect(mig).toContain('language sql stable security definer')
  })

  it('EXECUTE granted to anon + authenticated only (public discovery)', () => {
    expect(mig).toContain('grant execute on function public.search_public_masters(text, integer)\n  to anon, authenticated')
    expect(mig).toContain('grant execute on function public.get_public_master_upcoming_events(uuid, integer)\n  to anon, authenticated')
    expect(mig).toContain('from public, anon, authenticated, service_role')
  })
})

describe('SP-045 — public master upcoming-events contract', () => {
  it('only active, future events where the master organizes or is an approved participant', () => {
    expect(mig).toContain("e.status = 'active'")
    expect(mig).toContain('e.event_date >= current_date')
    expect(mig).toContain('e.organizer_master_id = p_master_id')
    expect(mig).toContain("sem.status = 'approved'")
  })
  it('returns sauna name + coordinates for the map jump, nothing private', () => {
    expect(mig).toContain('sauna_name text')
    expect(mig).toContain('latitude   double precision')
    expect(mig).toContain('longitude  double precision')
  })
})
