// SP-039 Slice 4C2 — SQL contract test for the M9 publication schema.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(p, 'utf8')
const stripComments = (sql: string) =>
  sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')

const m9 = read('supabase/2026-07-30_sp039_m9_publication_schema.sql')
const m9r = read('supabase/2026-07-30_sp039_m9_publication_schema_rollback.sql')
const m9s = stripComments(m9)

describe('M9 — drift guards (fail-loud preconditions)', () => {
  it('requires both tables and the helper to be absent', () => {
    expect(m9).toContain("to_regclass('public.master_publication') is not null")
    expect(m9).toContain(
      "to_regclass('public.master_publication_events') is not null"
    )
    expect(m9).toContain(
      "to_regprocedure('public.is_master_publicly_visible(uuid)') is not null"
    )
  })
  it('requires the SP-035d masters_select and the M8 trigger body', () => {
    expect(m9).toContain("position('user_id = auth.uid()' in v_qual) = 0")
    expect(m9).toContain("position('is_master_publicly_visible' in v_qual) > 0")
    expect(m9).toContain("position('owner_account_deleted' in v_fn) = 0")
    expect(m9).toContain("position('master_publication' in v_fn) > 0")
  })
})

describe('M9 — publication state table', () => {
  it('is 1:1 with the master and vocabulary-pinned', () => {
    expect(m9s).toContain('master_id     uuid primary key')
    expect(m9s).toContain(
      "('draft','submitted','changes_requested','published','legacy_published','suspended')"
    )
  })
  it('pins the live-publication timestamp equivalence for BOTH public states', () => {
    expect(m9s).toContain(
      "check ((publication_status in ('published','legacy_published'))"
    )
    expect(m9s).toContain('= (published_at is not null))')
  })
  it('bakes the M6 lesson in from day one (actor implies timestamp)', () => {
    expect(m9s).toContain(
      'check (publication_reviewed_by is null or publication_reviewed_at is not null)'
    )
    expect(m9s).toContain('references auth.users(id) on delete set null')
  })
  it('review note is bounded and never public (no grant beyond SELECT)', () => {
    expect(m9s).toContain('char_length(publication_review_note) <= 2000')
  })
  it('deny-all client writes: SELECT-only grant + own-or-moderator policy', () => {
    expect(m9s).toContain(
      'revoke all on public.master_publication from anon, authenticated'
    )
    expect(m9s).toContain('grant select on public.master_publication to authenticated')
    expect(m9s).toContain('master_publication_select_own_or_mod')
    expect(m9s).toContain('for select')
    // no write policies anywhere in the file
    expect(m9s).not.toContain('for insert')
    expect(m9s).not.toContain('for update')
    expect(m9s).not.toContain('for delete')
  })
})

describe('M9 — publication events table (M3 pattern)', () => {
  it('is append-only with SET NULL parents and a pinned vocabulary', () => {
    for (const t of [
      'legacy_publication_granted',
      'profile_submitted',
      'changes_requested',
      'publication_approved',
      'profile_unpublished',
      'profile_suspended',
      'owner_publication_withdrawn',
    ]) {
      expect(m9s).toContain(`'${t}'`)
    }
    expect(m9s).toContain('references public.sauna_masters(id) on delete set null')
    expect(m9s).toContain('master_publication_events_select_moderator')
  })
})

describe('M9 — visibility helper and policy swap', () => {
  const helper = m9s.slice(
    m9s.indexOf('create function public.is_master_publicly_visible'),
    m9s.indexOf('insert into public.master_publication (')
  )
  it('helper is DEFINER/stable/empty search_path with public-role EXECUTE', () => {
    expect(helper).toContain("security definer stable set search_path = ''")
    expect(helper).toContain('to anon, authenticated')
    expect(helper).toContain('from public, anon, authenticated, service_role')
  })
  it('helper encodes the decided predicate: legacy OR (published AND owner)', () => {
    expect(helper).toContain("m.status = 'approved'")
    expect(helper).toContain("mp.publication_status = 'legacy_published'")
    expect(helper).toContain(
      "mp.publication_status = 'published' and m.user_id is not null"
    )
  })
  it('masters_select keeps the owner and moderator arms verbatim', () => {
    const policy = m9s.slice(m9s.indexOf('create policy masters_select'))
    expect(policy).toContain('public.is_master_publicly_visible(id)')
    expect(policy).toContain('or user_id = auth.uid()')
    expect(policy).toContain('or public.is_platform_moderator()')
  })
})

describe('M9 — legacy backfill (visible-set identity)', () => {
  it('grants legacy publication to EVERY approved master with one event each', () => {
    expect(m9s).toContain(
      "select id, 'legacy_published', now()\nfrom public.sauna_masters\nwhere status = 'approved'"
    )
    expect(m9s).toContain("select id, 'legacy_publication_granted',")
    const backfills = m9s.match(/where status = 'approved'/g) ?? []
    expect(backfills.length).toBeGreaterThanOrEqual(2)
  })
  it('fails loud in-transaction on a backfill count mismatch', () => {
    expect(m9).toContain('backfill mismatch')
  })
})

describe('M9 — owner-deletion trigger extension', () => {
  const fn = m9s.slice(
    m9s.indexOf('create or replace function public.handle_master_owner_deletion')
  )
  it('keeps every M8 condition and action verbatim', () => {
    expect(fn).toContain(
      'old.user_id is not null and new.user_id is null and auth.uid() is null'
    )
    expect(fn).toContain("new.status := 'pending'")
    expect(fn).toContain("'owner_account_deleted'")
  })
  it('resets ONLY in-workflow rows (legacy and suspended untouched)', () => {
    expect(fn).toContain(
      "publication_status in ('published','submitted','changes_requested')"
    )
    expect(fn).toContain("set publication_status = 'draft'")
    expect(fn).toContain('published_at = null')
    expect(fn).not.toContain("'legacy_published',")
  })
  it('writes the withdrawal event only when a row was actually reset', () => {
    expect(fn).toContain('if found then')
    expect(fn).toContain("'owner_publication_withdrawn'")
  })
})

describe('M9 — transaction and scope hygiene', () => {
  it('is transactional and reloads PostgREST', () => {
    expect(m9s).toContain('begin;')
    expect(m9s).toContain('commit;')
    expect(m9).toContain("notify pgrst, 'reload schema'")
  })
  it('touches no invitation/claim tables or guard function', () => {
    expect(m9s).not.toContain('alter table public.master_claim_invitations')
    expect(m9s).not.toContain('alter table public.master_claim_events')
    expect(m9s).not.toContain('guard_master_privileged_columns')
    expect(m9s).not.toContain('alter table public.sauna_masters')
  })
})

describe('M9 rollback — honest and guarded', () => {
  it('refuses once the workflow is in use beyond the backfill', () => {
    expect(m9r).toContain("publication_status <> 'legacy_published'")
    expect(m9r).toContain("event_type <> 'legacy_publication_granted'")
  })
  it('restores SP-035d and the M8 trigger verbatim, then drops the schema', () => {
    const r = stripComments(m9r)
    expect(r).toContain("(status = 'approved')")
    expect(r).toContain('or (user_id = auth.uid())')
    expect(r).toContain('drop function public.is_master_publicly_visible(uuid)')
    expect(r).toContain('drop table public.master_publication_events')
    expect(r).toContain('drop table public.master_publication')
    expect(r).not.toContain('master_publication\n       set')
  })
  it('documents the discarded-grants consequence', () => {
    expect(m9r).toContain('DISCARDS the legacy publication')
  })
})
