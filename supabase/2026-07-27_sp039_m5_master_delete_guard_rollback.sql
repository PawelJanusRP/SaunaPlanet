-- ============================================================================
-- SP-039 Slice 3B1 — M5 ROLLBACK: drop the master delete guard.
--
-- Non-destructive. After rollback, the master_claim_invitations master_id FK
-- (ON DELETE RESTRICT, M2) STILL blocks deletion of any master that has
-- invitation history — the invitation-history protection remains. Only the
-- clearer domain error and the user_id-IS-NOT-NULL block are removed.
--
-- Companion forward: 2026-07-27_sp039_m5_master_delete_guard.sql
-- ============================================================================
begin;

drop trigger if exists sauna_masters_delete_guard on public.sauna_masters;
drop function if exists public.guard_master_delete();

commit;

notify pgrst, 'reload schema';

-- POST-ROLLBACK VERIFICATION:
--   select tgname from pg_trigger where tgrelid='public.sauna_masters'::regclass
--     and tgname='sauna_masters_delete_guard';   -- 0 rows
--   -- FK RESTRICT still refuses deleting a master with invitation history.
