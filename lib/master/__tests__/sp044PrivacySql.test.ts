// SP-044 Slice C — SQL contract test for pseudonym + privacy mode.
// Pins the privacy BOUNDARY: the public name is the effective display name, the
// real name lives behind RLS, and the invariant is enforced declaratively.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(p, 'utf8')
const stripComments = (sql: string) =>
  sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

const mig = read('supabase/2026-09-08_sp044_c1_master_privacy.sql')
const migS = stripComments(mig)
const rb = read('supabase/2026-09-08_sp044_c1_master_privacy_rollback.sql')
const rbS = stripComments(rb)

describe('SP-044-C — schema + hard invariant', () => {
  it('adds nickname + show_nickname_only', () => {
    expect(migS).toContain('add column nickname text')
    expect(migS).toContain('add column show_nickname_only boolean not null default false')
  })
  it('enforces name=nickname (non-empty) under privacy mode as a CHECK', () => {
    expect(migS).toContain('sauna_masters_privacy_name_invariant')
    expect(migS).toContain('not show_nickname_only')
    expect(migS).toContain("btrim(nickname) <> '' and name = nickname")
  })
})

describe('SP-044-C — real name is behind an RLS boundary', () => {
  it('private identity table is SELECT-only for clients, no write policy', () => {
    expect(migS).toContain('create table public.master_private_identity')
    expect(migS).toContain('revoke all on public.master_private_identity from anon, authenticated')
    expect(migS).toContain('grant select on public.master_private_identity to authenticated')
  })
  it('only owner or moderator may read it', () => {
    expect(migS).toContain('master_private_identity_select_own_or_mod')
    expect(migS).toContain('public.is_platform_moderator()')
    expect(migS).toContain('m.user_id = auth.uid()')
  })
  it('backfills one row per existing master without changing public names', () => {
    expect(migS).toContain('insert into public.master_private_identity (master_id, full_name)')
    expect(migS).toContain('select id, name from public.sauna_masters')
    expect(migS).toContain('on conflict (master_id) do nothing')
  })
})

describe('SP-044-C — set_master_identity (sole sanctioned writer)', () => {
  it('is DEFINER with pinned search_path and authenticated-only EXECUTE', () => {
    expect(mig).toContain("language plpgsql security definer set search_path = ''")
    expect(migS).toContain('grant execute on function public.set_master_identity(uuid, text, text, boolean)\n  to authenticated')
    expect(migS).not.toContain('to anon')
  })
  it('is owner-or-moderator gated', () => {
    expect(migS).toContain('v_master.user_id = v_uid or public.is_platform_moderator()')
    expect(migS).toContain("'not_authorized'")
  })
  it('requires a real name, and a pseudonym when privacy is on', () => {
    expect(migS).toContain("'name_required'")
    expect(migS).toContain('p_show_nickname_only, false) and v_nick is null')
    expect(migS).toContain("'nickname_required'")
  })
  it('derives the public name and stores the real name privately', () => {
    expect(migS).toContain('v_effective := case when coalesce(p_show_nickname_only, false) then v_nick else v_full end')
    expect(migS).toContain('insert into public.master_private_identity (master_id, full_name)')
    expect(migS).toContain('set name = v_effective')
  })
  it('drops a real-name-derived slug when privacy is enabled', () => {
    expect(migS).toContain('slug = case when coalesce(p_show_nickname_only, false) then null else slug end')
  })
  it('never leaks raw PG errors', () => {
    expect(migS).toContain('exception when others then')
    expect(migS).toContain("'unexpected_error'")
  })
})

describe('SP-044-C / Part D — demotion suppression', () => {
  it('the demotion trigger honours the identity-change suppression GUC', () => {
    expect(migS).toContain("current_setting('sp044.suppress_demotion', true)")
    expect(migS).toContain("perform set_config('sp044.suppress_demotion', 'on', true)")
  })
  it('privacy changes still demote nothing but real content edits still do', () => {
    // The M10 material-field comparison is preserved below the suppression hook.
    expect(migS).toContain('new.bio is not distinct from old.bio')
    expect(migS).toContain("publication_status in ('published','legacy_published')")
  })
})

describe('SP-044-C — rollback safety', () => {
  it('refuses while any profile has privacy enabled', () => {
    expect(rb).toContain('ROLLBACK REFUSED')
    expect(rbS).toContain('where show_nickname_only')
  })
  it('drops the RPC, table and columns and restores the M10 demotion body', () => {
    expect(rbS).toContain('drop function if exists public.set_master_identity')
    expect(rbS).toContain('drop table if exists public.master_private_identity')
    expect(rbS).toContain('drop column if exists show_nickname_only')
    expect(rbS).not.toContain('sp044.suppress_demotion')
  })
})
