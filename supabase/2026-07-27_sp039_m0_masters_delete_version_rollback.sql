-- ============================================================================
-- SP-039 Slice 3B1 — M0 ROLLBACK: restore the exact confirmed predecessor
-- masters_delete policy (inline admin+moderator EXISTS over profiles).
--
-- M0 changed NO effective authorization (it re-declared the identical live
-- admin-OR-moderator DELETE policy), so this rollback re-asserts that same
-- policy. There is no data to lose and nothing destructive here. It deliberately
-- does NOT restore an is_admin()-based policy (that never was the production
-- predecessor — the pre-drift assumption was false).
--
-- Companion forward: 2026-07-27_sp039_m0_masters_delete_version.sql
-- ============================================================================
begin;

drop policy if exists "masters_delete" on public.sauna_masters;
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

-- POST-ROLLBACK VERIFICATION:
--   select policyname, cmd, permissive, roles, qual, with_check from pg_policies
--   where schemaname='public' and tablename='sauna_masters'
--     and policyname='masters_delete';
--   -- expect: DELETE, PERMISSIVE, roles {public}, with_check IS NULL, the
--   -- profiles admin/moderator EXISTS (admin AND moderator retain DELETE access,
--   -- identical to the pre-M0 live state). is_admin() is not touched.
