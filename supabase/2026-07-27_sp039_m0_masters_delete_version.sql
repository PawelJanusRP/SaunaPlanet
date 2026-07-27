-- ============================================================================
-- SP-039 Slice 3B1 — M0: version the live `masters_delete` policy.
--
-- The live DELETE policy on public.sauna_masters is UNVERSIONED: it exists only
-- in the historical aggregate supabase/all_scripts_history.sql, never in a
-- reviewed migration. Its live form is:
--   create policy "masters_delete" on public.sauna_masters
--     for delete using (public.is_admin());
-- (DELETE, role membership via is_admin() = profiles.role = 'admin').
--
-- This migration records that EXACT behavior in version control WITHOUT changing
-- it: same command (DELETE), same roles (default — PUBLIC, gated by the USING),
-- same USING (public.is_admin()), no WITH CHECK (not applicable to DELETE).
-- Moderator access is NOT widened. `is_admin()` itself is NOT modified here
-- (out of scope for M0 — see the SECURITY OBSERVATION below).
--
-- Companion rollback: 2026-07-27_sp039_m0_masters_delete_version_rollback.sql
--
-- SECURITY OBSERVATION (report, do NOT fix in this slice): the repository
-- history defines public.is_admin() as `language sql security definer stable`
-- WITHOUT a pinned search_path. A SECURITY DEFINER function without a pinned
-- search_path resolves unqualified names (`public.profiles`) against the
-- CALLER's search_path. In Supabase's default model the authenticated/anon
-- roles cannot CREATE schemas/tables, so this is a latent hardening gap rather
-- than a confirmed exploit; versioning is_admin with `set search_path = ''` and
-- fully-qualified refs belongs in a separate reviewed security migration, not
-- M0. The live is_admin() body must be confirmed by the read-only preflight
-- before application (this environment had no DB access).
--
-- PRE-APPLY (read-only; run FIRST — on ANY mismatch STOP and review):
-- P1. Exactly one DELETE policy named masters_delete, USING is is_admin(),
--     no WITH CHECK (expect 1 row: cmd=DELETE, qual mentions is_admin(),
--     with_check IS NULL):
--   select policyname, cmd, qual, with_check, roles
--   from pg_policies
--   where schemaname='public' and tablename='sauna_masters'
--     and policyname='masters_delete';
-- P2. is_admin() exists and is the admin-role check (record its exact body,
--     security mode, volatility, search_path, owner for the report):
--   select p.prosecdef, p.provolatile, p.proconfig, pg_get_functiondef(p.oid)
--   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname='is_admin';
-- ============================================================================
begin;

-- Fail loud unless the live predecessor is EXACTLY the reviewed definition:
-- a DELETE policy whose USING references is_admin() and which has no WITH CHECK.
do $$
declare
  v_cmd        text;
  v_qual       text;
  v_with_check text;
begin
  select cmd, qual, with_check
    into v_cmd, v_qual, v_with_check
  from pg_policies
  where schemaname = 'public' and tablename = 'sauna_masters'
    and policyname = 'masters_delete';

  if v_cmd is null then
    raise exception
      'M0 GUARD: policy masters_delete not found on public.sauna_masters — unexpected live state; stop and review';
  end if;
  if v_cmd <> 'DELETE' then
    raise exception
      'M0 GUARD: masters_delete is % (expected DELETE) — unexpected; stop and review', v_cmd;
  end if;
  if v_qual is null or position('is_admin' in v_qual) = 0 then
    raise exception
      'M0 GUARD: masters_delete USING does not reference is_admin() (found: %) — refusing to silently replace an unknown policy', coalesce(v_qual, '<null>');
  end if;
  if v_with_check is not null then
    raise exception
      'M0 GUARD: masters_delete unexpectedly has a WITH CHECK (%) — unexpected; stop and review', v_with_check;
  end if;
end $$;

-- Re-declare deterministically with the IDENTICAL behavior (idempotent record
-- of the live policy). No behavior change: same command, same authorization.
drop policy "masters_delete" on public.sauna_masters;
create policy "masters_delete" on public.sauna_masters
  for delete
  using (public.is_admin());

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- POST-APPLY VERIFICATION (read-only)
-- V1. Policy present, unchanged shape:
--   select policyname, cmd, qual, with_check from pg_policies
--   where schemaname='public' and tablename='sauna_masters'
--     and policyname='masters_delete';
--   -- expect: cmd=DELETE, qual = (is_admin()), with_check IS NULL.
-- V2. Behavior unchanged (rolled-back impersonation):
--   as an admin  -> delete of an arbitrary sauna_masters row is permitted by RLS;
--   as moderator -> DELETE denied (is_admin() false) — moderator NOT widened;
--   as user/anon -> DELETE denied.
-- V3. is_admin() untouched: pg_get_functiondef unchanged from the pre-apply
--     snapshot (P2).
-- ROLLBACK LIMITATION: the rollback reproduces the identical policy; there is
-- no data to lose. If P1 failed, DO NOT force this migration — investigate the
-- real live policy first.
-- ============================================================================
