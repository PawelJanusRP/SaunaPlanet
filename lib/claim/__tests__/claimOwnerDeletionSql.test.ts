// SP-039 Slice 4C1 — SQL contract test for the M8 owner-deletion migration.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(p, 'utf8')
const stripComments = (sql: string) =>
  sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')

const m8 = read('supabase/2026-07-30_sp039_m8_owner_deletion_compat.sql')
const m8r = read('supabase/2026-07-30_sp039_m8_owner_deletion_compat_rollback.sql')
const m8s = stripComments(m8)

describe('M8 — drift guards (fail-loud preconditions)', () => {
  it('requires the M7 guard body (claim arm present, deletion arm absent)', () => {
    expect(m8).toContain("position('master_claim_invitations' in v_guard) = 0")
    expect(m8).toContain("position('auth.uid() is null' in v_guard) > 0")
    expect(m8).toContain('M8 already applied?')
  })
  it('requires the M7 seven-type vocabulary without the deletion event', () => {
    expect(m8).toContain("position('invitation_claimed' in v_check) = 0")
    expect(m8).toContain("position('owner_account_deleted' in v_check) > 0")
  })
  it('requires free names for the new function and trigger', () => {
    expect(m8).toContain(
      "to_regprocedure('public.handle_master_owner_deletion()') is not null"
    )
    expect(m8).toContain("tgname = 'sauna_masters_owner_deletion'")
  })
  it('pins the ON DELETE SET NULL design premise for the ownership FK', () => {
    expect(m8).toContain("conname = 'sauna_masters_user_id_fkey'")
    expect(m8).toContain("confdeltype = 'n'")
  })
})

describe('M8 — event vocabulary', () => {
  it('recreates mce_event_type_check as the eight-type superset', () => {
    expect(m8s).toContain('drop constraint mce_event_type_check')
    for (const t of [
      'profile_prepared',
      'invitation_created',
      'invitation_sent',
      'invitation_revoked',
      'invitation_regenerated',
      'invitation_expired',
      'invitation_claimed',
      'owner_account_deleted',
    ]) {
      expect(m8s).toContain(`'${t}'`)
    }
  })
})

describe('M8 — guard: both carve-outs, nothing else weakened', () => {
  it('keeps all eight privileged fields', () => {
    for (const f of [
      'new.level is distinct from old.level',
      'new.status is distinct from old.status',
      'new.user_id is distinct from old.user_id',
      'new.home_sauna_id is distinct from old.home_sauna_id',
      'new.is_founding_partner is distinct from old.is_founding_partner',
      'new.rating is distinct from old.rating',
      'new.review_count is distinct from old.review_count',
      'new.origin is distinct from old.origin',
    ]) {
      expect(m8s).toContain(f)
    }
  })
  it('retains the FULL M7 claim carve-out verbatim', () => {
    expect(m8s).toContain('old.user_id is null')
    expect(m8s).toContain('new.user_id = auth.uid()')
    expect(m8s).toContain("old.origin = 'admin_prepared'")
    expect(m8s).toContain("i.status = 'claimed'")
    expect(m8s).toContain('i.claimed_by = auth.uid()')
  })
  it('the deletion carve-out requires ALL THREE conditions', () => {
    const arm = m8s.slice(
      m8s.indexOf('old.user_id is not null'),
      m8s.indexOf('or new.home_sauna_id')
    )
    expect(arm).toContain('old.user_id is not null')
    expect(arm).toContain('new.user_id is null')
    expect(arm).toContain('auth.uid() is null')
  })
  it('keeps the approved generic Polish exception message', () => {
    expect(m8).toContain(
      'Pola uprzywilejowane profilu saunamistrza może zmieniać wyłącznie moderacja.'
    )
  })
})

describe('M8 — owner-deletion completion trigger', () => {
  it('is a new function (no or-replace) fired BEFORE UPDATE OF user_id', () => {
    expect(m8s).toContain('create function public.handle_master_owner_deletion()')
    expect(m8s).not.toContain('create or replace function public.handle_master')
    expect(m8s).toContain('before update of user_id on public.sauna_masters')
  })
  it('fires after the guard by trigger-name ordering', () => {
    // BEFORE row triggers run alphabetically; the guard must stay first
    expect('sauna_masters_guard' < 'sauna_masters_owner_deletion').toBe(true)
  })
  it('activates ONLY on the FK-deletion shape and withdraws publication', () => {
    const fn = m8s.slice(
      m8s.indexOf('create function public.handle_master_owner_deletion'),
      m8s.indexOf('revoke all on function public.handle_master_owner_deletion')
    )
    expect(fn).toContain(
      'old.user_id is not null and new.user_id is null and auth.uid() is null'
    )
    expect(fn).toContain("if new.status = 'approved' then")
    expect(fn).toContain("new.status := 'pending'")
  })
  it('appends ONE forensic event with a NULL actor and no secrets', () => {
    const fn = m8s.slice(
      m8s.indexOf('create function public.handle_master_owner_deletion'),
      m8s.indexOf('create trigger sauna_masters_owner_deletion')
    )
    expect(fn).toContain("'owner_account_deleted'")
    expect(fn).toContain('insert into public.master_claim_events (master_id, event_type, reason)')
    expect(fn).not.toContain('actor_user_id')
    expect(fn).not.toContain('token')
  })
  it('is SECURITY DEFINER with an empty search_path and no client EXECUTE', () => {
    const defs = m8s.match(/security definer set search_path = ''/g) ?? []
    expect(defs.length).toBe(2) // guard + trigger function
    expect(m8s).toContain(
      'revoke all on function public.handle_master_owner_deletion()'
    )
    expect(m8s).toContain('from public, anon, authenticated, service_role')
  })
})

describe('M8 — transaction and scope hygiene', () => {
  it('is transactional and reloads PostgREST', () => {
    expect(m8s).toContain('begin;')
    expect(m8s).toContain('commit;')
    expect(m8).toContain("notify pgrst, 'reload schema'")
  })
  it('contains no unrelated DDL', () => {
    expect(m8s).not.toContain('create table')
    expect(m8s).not.toContain('add column')
    expect(m8s).not.toContain('create policy')
    expect(m8s).not.toContain('drop policy')
    expect(m8s).not.toContain('create index')
    expect(m8s).not.toContain('grant ')
  })
})

describe('M8 rollback — honest and guarded', () => {
  it('refuses once any owner_account_deleted event exists', () => {
    expect(m8r).toContain("event_type = 'owner_account_deleted'")
    expect(m8r).toContain('cannot be restored')
  })
  it('drops the trigger+function and restores the M7 guard verbatim', () => {
    const r = stripComments(m8r)
    expect(r).toContain('drop trigger sauna_masters_owner_deletion')
    expect(r).toContain('drop function public.handle_master_owner_deletion()')
    expect(r).toContain('i.claimed_by = auth.uid()')
    expect(r).not.toContain('and new.user_id is null and auth.uid() is null')
  })
  it('warns that rollback re-introduces the undeletable-account defect', () => {
    expect(m8r).toContain('RE-INTRODUCES the defect')
    expect(m8r).toContain('undeletable again')
  })
})
