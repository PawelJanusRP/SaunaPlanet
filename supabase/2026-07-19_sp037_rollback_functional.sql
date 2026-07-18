-- ============================================================================
-- SP-037 FUNCTIONAL ROLLBACK — disables the master participation workflow
-- while PRESERVING the security improvements.
-- ============================================================================
-- Target state: masters can no longer request or withdraw, staff can no
-- longer resolve; the administrative direct-assignment workflow keeps
-- working; the tightened SELECT (approved / own / event staff /
-- moderation) STAYS — do not restore the public USING(true) read.
--
-- In-flight data at rollback time: pending rows remain invisible to the
-- public, visible to their master, event staff and moderation; admin
-- resolves or deletes them manually. The partial unique index and the
-- created_by column stay (inert, data-preserving).
-- ============================================================================

begin;

-- 1. Remove workflow-specific trigger
drop trigger if exists sauna_event_masters_guard on public.sauna_event_masters;
drop function if exists public.guard_event_master_columns();

-- 2. Remove workflow policies; keep hardened SELECT + admin set
drop policy if exists event_masters_insert_request on public.sauna_event_masters;
drop policy if exists event_masters_update_staff on public.sauna_event_masters;
drop policy if exists event_masters_delete_own_pending on public.sauna_event_masters;

-- (event_masters_select, event_masters_insert_admin,
--  event_masters_update_admin, event_masters_delete_admin stay.
--  is_event_staff() stays — the SELECT policy references it.)

commit;

-- Post-rollback check:
--   select policyname, cmd from pg_policies
--   where tablename = 'sauna_event_masters' order by cmd;
--   -- expect: delete ×1 (admin), insert ×1 (admin), select ×1, update ×1
