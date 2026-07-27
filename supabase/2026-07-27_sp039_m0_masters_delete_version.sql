-- ============================================================================
-- SP-039 Slice 3B1 — M0: version the live `masters_delete` policy.
--
-- The live DELETE policy on public.sauna_masters is UNVERSIONED (it exists only
-- in the historical aggregate supabase/all_scripts_history.sql, never in a
-- reviewed migration). The 2026-07-28 production read-only preflight CONFIRMED
-- its actual live form is NOT `using (public.is_admin())` (an earlier assumption
-- that was PROVEN FALSE) but an INLINE admin-OR-moderator check:
--
--   policy:      masters_delete
--   command:     DELETE
--   permissive:  PERMISSIVE
--   roles:       {public}
--   with_check:  none
--   using:
--     EXISTS (SELECT 1 FROM profiles
--             WHERE profiles.id = auth.uid()
--               AND profiles.role = ANY (ARRAY['admin'::text, 'moderator'::text]))
--
-- i.e. it authorizes BOTH admin AND moderator (semantically the same set as
-- public.is_platform_moderator()). This migration versions that EXACT behavior
-- WITHOUT changing effective authorization: same command (DELETE), same
-- PERMISSIVE mode, same roles (PUBLIC, gated by USING), same admin+moderator
-- authorization, no WITH CHECK. It deliberately does NOT reduce the policy to
-- public.is_admin() (that would REMOVE moderator DELETE access) and does NOT
-- introduce a helper dependency — the goal is exact behavior versioning with the
-- minimum change, so the inline EXISTS is reproduced verbatim (with the
-- reference qualified as public.profiles).
--
-- NORMALIZATION NOTE: pg_policies renders the STORED expression. Because
-- `public` is on the parse-time search_path, PostgreSQL may render the qualified
-- `public.profiles` back as unqualified `profiles` in pg_policies.qual (and
-- `= ANY (ARRAY[...])` vs `IN (...)` may normalize). Post-apply verification
-- compares SEMANTICS (admin+moderator, no is_admin, no with_check), not textual
-- identity — see V1.
--
-- is_admin() is NOT referenced by this policy and NOT touched here; its unpinned
-- search_path is classified as SEPARATE security debt (docs/SP039_SLICE3_ADMIN_
-- INVITATIONS.md §is_admin) — it is NOT a blocker for M0–M5.
--
-- Companion rollback: 2026-07-27_sp039_m0_masters_delete_version_rollback.sql
--
-- PRE-APPLY (read-only; run FIRST — on ANY mismatch STOP and review):
-- P1. The live masters_delete is the inline admin+moderator DELETE policy, no
--     WITH CHECK (record it for the report):
--   select policyname, cmd, permissive, roles, qual, with_check
--   from pg_policies
--   where schemaname='public' and tablename='sauna_masters'
--     and policyname='masters_delete';
--   -- expect: cmd=DELETE, qual = the profiles admin/moderator EXISTS,
--   --         with_check IS NULL, and qual does NOT contain is_admin.
-- ============================================================================
begin;

-- Fail loud unless the live predecessor is EXACTLY the confirmed production
-- policy: a DELETE policy whose USING is the profiles admin+moderator EXISTS,
-- does NOT reference is_admin(), and has no WITH CHECK.
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
  -- must be the inline admin+moderator EXISTS over profiles
  if v_qual is null
     or position('profiles' in v_qual) = 0
     or position('admin' in v_qual) = 0
     or position('moderator' in v_qual) = 0 then
    raise exception
      'M0 GUARD: masters_delete USING is not the expected inline admin/moderator profiles check (found: %) — refusing to replace an unknown policy', coalesce(v_qual, '<null>');
  end if;
  -- must NOT be the (false) is_admin()-only form
  if position('is_admin' in v_qual) > 0 then
    raise exception
      'M0 GUARD: masters_delete USING references is_admin() — this is the pre-drift assumption, NOT the confirmed production predecessor; stop and review';
  end if;
  if v_with_check is not null then
    raise exception
      'M0 GUARD: masters_delete unexpectedly has a WITH CHECK (%) — unexpected; stop and review', v_with_check;
  end if;
end $$;

-- Re-declare deterministically, AUTHORIZATION-EQUIVALENT to the live policy:
-- admin OR moderator, DELETE, PERMISSIVE (default), roles PUBLIC (default), no
-- WITH CHECK. The inline EXISTS is reproduced verbatim with the table reference
-- qualified as public.profiles (minimum-dependency versioning; no is_admin, no
-- is_platform_moderator introduced).
drop policy "masters_delete" on public.sauna_masters;
create policy "masters_delete" on public.sauna_masters
  for delete
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = any (array['admin'::text, 'moderator'::text])
    )
  );

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- POST-APPLY VERIFICATION (read-only)
-- V1. Policy present, SEMANTICALLY unchanged (ignore schema-qualification
--     normalization, see NORMALIZATION NOTE):
--   select policyname, cmd, permissive, roles, qual, with_check from pg_policies
--   where schemaname='public' and tablename='sauna_masters'
--     and policyname='masters_delete';
--   -- expect: cmd=DELETE, PERMISSIVE, roles {public}, with_check IS NULL,
--   --         qual = profiles admin/moderator EXISTS, and NO is_admin.
-- V2. Behavior unchanged (rolled-back impersonation):
--   as an admin     -> DELETE of an arbitrary sauna_masters row permitted by RLS;
--   as a moderator  -> DELETE permitted (moderator access PRESERVED — the whole
--                      point of the drift fix);
--   as user/anon    -> DELETE denied.
-- V3. is_admin() untouched (it is unrelated to this policy).
-- ROLLBACK LIMITATION: the rollback reproduces the identical inline policy;
-- there is no data to lose. If P1 failed, DO NOT force this migration —
-- investigate the real live policy first.
-- ============================================================================
