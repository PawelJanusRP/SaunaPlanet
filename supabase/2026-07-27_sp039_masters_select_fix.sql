-- ============================================================================
-- SP-039 D2 — restore the intended masters_select policy (SP-035d).
--
-- DRIFT (found during Slice 1B Preview E2E, 2026-07-27): the LIVE
-- masters_select on production is NOT the versioned SP-035d definition —
-- its own-row arm (user_id = auth.uid()) is missing and the moderation
-- check is an inlined EXISTS over profiles. Consequences (fail-closed, no
-- security hole): a pending/rejected master cannot read their own profile
-- (Studio gate shows "no profile" instead of the real status; own public
-- page 404s), and — interacting with the SP-039 master_avatars_insert_own
-- Storage policy, whose EXISTS runs under the caller's RLS — a PENDING
-- owner is denied uploading their own avatar/cover.
--
-- This migration re-applies the SP-035d three-arm definition verbatim.
-- The guard below asserts the expected DRIFTED live state first and fails
-- loudly otherwise (wrong environment / already fixed).
--
-- Companion operational rollback: 2026-07-27_sp039_masters_select_fix_rollback.sql
--
-- PRE-APPLY (read-only; STOP on mismatch):
-- P1. Live policy exists and is in the drifted shape:
--   select qual from pg_policies
--   where schemaname='public' and tablename='sauna_masters'
--     and policyname='masters_select';
--   -- expect: contains "status = 'approved'" and an EXISTS over profiles;
--   --         does NOT contain user_id.
-- ============================================================================
begin;

do $$
declare v_qual text;
begin
  select qual into v_qual
  from pg_policies
  where schemaname = 'public' and tablename = 'sauna_masters'
    and policyname = 'masters_select';
  if v_qual is null then
    raise exception
      'D2 GUARD: policy masters_select not found — unexpected live state; stop and review';
  end if;
  if position('user_id' in v_qual) > 0 then
    raise exception
      'D2 GUARD: live policy already contains the own-row arm — drift already fixed or unexpected state; stop and review';
  end if;
end $$;

drop policy "masters_select" on public.sauna_masters;

-- SP-035d definition, verbatim:
--   * everyone (incl. anon)  -> approved profiles
--   * the linked account     -> its own profile in any status (Studio gate)
--   * moderator/admin        -> every profile
create policy masters_select on public.sauna_masters
  for select
  using (
    status = 'approved'
    or user_id = auth.uid()
    or public.is_platform_moderator()
  );

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- POST-APPLY VERIFICATION
-- V1. Stored qual contains all three arms:
--   select qual from pg_policies
--   where schemaname='public' and tablename='sauna_masters'
--     and policyname='masters_select';
--   -- expect: status = 'approved', user_id = auth.uid(),
--   --         is_platform_moderator()
-- V2. Behavioral (rolled-back impersonation of a pending master's owner):
--   a) select own pending row              -> 1 row (was 0 before);
--   b) anon select of that pending row     -> 0 rows (unchanged);
--   c) storage insert '<own-id>/x.jpg'     -> ALLOW (was DENY before);
--   d) storage insert '<own-id>/covers/x'  -> ALLOW;
--   e) foreign user on that folder         -> DENY (unchanged).
-- V3. Unrelated sauna_masters policies (insert/update/delete) untouched.
-- ============================================================================
