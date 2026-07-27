-- ============================================================================
-- SP-039 Slice 3B1 — M0 ROLLBACK: reproduce the exact predecessor masters_delete.
--
-- M0 changed NO behavior (it re-declared the identical live policy), so this
-- rollback simply re-asserts the same admin-only DELETE policy. There is no
-- data to lose and nothing destructive here.
--
-- Companion forward: 2026-07-27_sp039_m0_masters_delete_version.sql
-- ============================================================================
begin;

drop policy if exists "masters_delete" on public.sauna_masters;
create policy "masters_delete" on public.sauna_masters
  for delete
  using (public.is_admin());

commit;

notify pgrst, 'reload schema';

-- POST-ROLLBACK VERIFICATION:
--   select policyname, cmd, qual, with_check from pg_policies
--   where schemaname='public' and tablename='sauna_masters'
--     and policyname='masters_delete';
--   -- expect: cmd=DELETE, qual=(is_admin()), with_check IS NULL (identical to
--   -- the pre-M0 live state). is_admin() is not touched by M0 or this rollback.
