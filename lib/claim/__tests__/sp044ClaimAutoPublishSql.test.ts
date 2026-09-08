// SP-044 Slice B — SQL contract test for claim auto-publication.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(p, 'utf8')
const stripComments = (sql: string) =>
  sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

const mig = read('supabase/2026-09-08_sp044_b1_claim_auto_publish.sql')
const migS = stripComments(mig)
const rb = read('supabase/2026-09-08_sp044_b1_claim_auto_publish_rollback.sql')
const rbS = stripComments(rb)

describe('SP-044-B — fail-loud drift guards', () => {
  it('requires the M7 guard + M7 claim RPC (no publication) as predecessors', () => {
    expect(mig).toContain("position('new.status = ''approved''' in v_guard) > 0")
    expect(mig).toContain("position('master_publication' in v_rpc) > 0")
    expect(mig).toContain("position('claim_auto_published' in v_mpe) > 0")
  })
})

describe('SP-044-B — atomic post-claim state', () => {
  it('the ownership UPDATE also sets status=approved', () => {
    expect(migS).toContain('set user_id = v_uid, status = ')
    expect(migS).toContain("status = 'approved'")
  })
  it('upserts a published master_publication row', () => {
    expect(migS).toContain('insert into public.master_publication (master_id, publication_status, published_at)')
    expect(migS).toContain("values (v_master.id, 'published', now())")
    expect(migS).toContain('on conflict (master_id) do update')
  })
  it('records an explicit claim_auto_published audit event (not a moderator approval)', () => {
    expect(migS).toContain("'claim_auto_published'")
    expect(mig).toContain('NOT a moderator approval')
  })
  it('returns published:true', () => {
    expect(migS).toContain("'published',   true")
  })
})

describe('SP-044-B — security boundary (no general self-publish)', () => {
  it('the status carve-out is bound to admin_prepared + a claimed invitation for auth.uid()', () => {
    expect(migS).toContain("old.status = 'pending' and new.status = 'approved'")
    expect(migS).toContain("old.origin = 'admin_prepared'")
    expect(migS).toContain('i.claimed_by = auth.uid()')
  })
  it('the RPC stays authenticated-only (never anon)', () => {
    expect(migS).toContain('grant execute on function public.public_claim_master_profile(text) to authenticated')
    expect(migS).not.toContain('to anon, authenticated')
  })
  it('guard + RPC keep the pinned empty search_path', () => {
    expect(mig).toContain("language plpgsql security definer set search_path = ''")
  })
})

describe('SP-044-B — fail-closed backfill', () => {
  it('asserts every owned admin_prepared profile has a claimed invitation', () => {
    expect(migS).toContain('v_owned <> v_owned_claimed')
    expect(mig).toContain('unexpected')
  })
  it('disables ONLY the privileged-columns guard around the status backfill', () => {
    expect(migS).toContain('alter table public.sauna_masters disable trigger sauna_masters_guard')
    expect(migS).toContain('alter table public.sauna_masters enable trigger sauna_masters_guard')
  })
  it('only touches the admin_prepared + owned + claimed cohort', () => {
    expect(migS).toContain("m.origin = 'admin_prepared' and m.user_id is not null")
    expect(migS).toContain("i.status = 'claimed' and i.claimed_by = m.user_id")
  })
})

describe('SP-044-B — rollback', () => {
  it('restores the M7 guard (no status carve-out) and M7 RPC (no publication)', () => {
    // M7 guard blocks ALL status changes for non-moderators:
    expect(rbS).toContain('new.status is distinct from old.status')
    expect(rbS).not.toContain("new.status = 'approved'")
    // M7 RPC links user_id only, no publication write:
    expect(rbS).toContain('set user_id = v_uid where id = v_master.id')
    expect(rbS).not.toContain('insert into public.master_publication ')
  })
  it('leaves already-published claim rows and their audit intact', () => {
    expect(rb).toContain('are NOT reverted')
    expect(rbS).toContain('claim_auto_published')
  })
})
