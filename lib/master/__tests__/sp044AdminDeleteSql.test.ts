// SP-044 Slice A — SQL contract test for admin-only master deletion.
// Static assertions over the migration + rollback text (no DB needed): they
// pin the security posture and the deterministic dependency strategy.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(p, 'utf8')
const stripComments = (sql: string) =>
  sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')

const mig = read('supabase/2026-09-08_sp044_a1_admin_master_delete.sql')
const migS = stripComments(mig)
const rb = read('supabase/2026-09-08_sp044_a1_admin_master_delete_rollback.sql')
const rbS = stripComments(rb)

describe('SP-044-A — fail-loud drift guards', () => {
  it('requires the M0 admin+moderator masters_delete predecessor', () => {
    expect(mig).toContain("policyname='masters_delete'")
    expect(mig).toContain("position('admin' in v_del) = 0 or position('moderator' in v_del) = 0")
  })
  it('requires the invitation FK to currently be RESTRICT', () => {
    expect(mig).toContain("v_fk <> 'r'")
  })
  it('refuses if the admin bypass or the RPC already exist', () => {
    expect(mig).toContain("position('role = ''admin''' in v_guard) > 0")
    expect(mig).toContain("to_regprocedure('public.admin_delete_master_profile(uuid)') is not null")
  })
})

describe('SP-044-A — dependency strategy', () => {
  it('migrates the invitation FK RESTRICT -> SET NULL and makes master_id nullable', () => {
    expect(migS).toContain('alter column master_id drop not null')
    expect(migS).toContain('references public.sauna_masters(id) on delete set null')
  })
  it('does NOT alter the historical / audit FKs (events, publication, organizer stay as designed)', () => {
    // The migration touches ONLY the invitation FK; no cascade of sauna_events.
    expect(migS).not.toContain('sauna_events')
    expect(migS).not.toContain('master_publication_events_master_id_fkey')
  })
})

describe('SP-044-A — admin-only boundary', () => {
  it('drops the direct client DELETE policy (RPC-only deletion)', () => {
    expect(migS).toContain('drop policy "masters_delete" on public.sauna_masters')
  })
  it('guard gains an admin bypass; moderators/users keep the M5 blocks', () => {
    expect(migS).toContain("where id = auth.uid() and role = 'admin'")
    expect(migS).toContain('powiązanego z kontem')
    expect(migS).toContain('historią zaproszeń')
  })
})

describe('SP-044-A — admin_delete_master_profile RPC', () => {
  it('is SECURITY DEFINER with a pinned empty search_path', () => {
    expect(migS).toContain('security definer set search_path = ')
    expect(mig).toContain("language plpgsql security definer set search_path = ''")
  })
  it('requires auth.uid() and the EXACT admin role (not moderator)', () => {
    expect(migS).toContain('auth.uid()')
    expect(migS).toContain("where id = v_uid and role = 'admin'")
    expect(migS).toContain("'not_authorized'")
  })
  it('locks the target and returns a bounded structured result', () => {
    expect(migS).toContain('pg_advisory_xact_lock')
    expect(migS).toContain('for update')
    expect(migS).toContain("jsonb_build_object('ok', true, 'code', 'deleted'")
  })
  it('kills any usable claim token before deletion', () => {
    expect(migS).toContain("status = 'revoked'")
    expect(migS).toContain('token_hash = null')
    expect(migS).toContain("status in ('ready','sent','opened')")
  })
  it('writes a preserved audit event and never leaks raw PG errors', () => {
    expect(mig).toContain("'master_admin_deleted'")
    expect(migS).toContain('exception when others then')
    expect(migS).toContain("'unexpected_error'")
  })
  it('grants EXECUTE to authenticated only (no anon/public/service_role)', () => {
    expect(migS).toContain('revoke all on function public.admin_delete_master_profile(uuid)')
    expect(migS).toContain('grant execute on function public.admin_delete_master_profile(uuid)\n  to authenticated')
  })
  it('adds master_admin_deleted to the claim-event vocabulary', () => {
    expect(migS).toContain("'invitation_claimed','owner_account_deleted','master_admin_deleted'")
  })
})

describe('SP-044-A — rollback safety', () => {
  it('refuses once a real deletion detached invitations', () => {
    expect(rb).toContain('master_id is null')
    expect(rb).toContain('ROLLBACK REFUSED')
  })
  it('restores RESTRICT + NOT NULL and the admin+moderator policy', () => {
    expect(rbS).toContain('alter column master_id set not null')
    expect(rbS).toContain('on delete restrict')
    expect(rbS).toContain("array['admin'::text, 'moderator'::text]")
  })
  it('drops the RPC', () => {
    expect(rbS).toContain('drop function if exists public.admin_delete_master_profile(uuid)')
  })
})
