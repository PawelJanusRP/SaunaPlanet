-- ============================================================================
-- SP-037 FUNCTIONAL WORKFLOW ROLLBACK — PRESERVING DATA-INTEGRITY HARDENING
-- ============================================================================
-- This is a *functional workflow rollback preserving data-integrity
-- hardening*: it disables the master participation workflow (requests,
-- staff resolution, withdrawal) but intentionally KEEPS the INSERT
-- normalization trigger and the tightened SELECT — those are security /
-- data-quality properties independent of the workflow.
-- ============================================================================
-- Target state: masters can no longer request or withdraw, staff can no
-- longer resolve; the administrative direct-assignment workflow keeps
-- working; the tightened SELECT (approved / own / event staff /
-- moderation) STAYS — do not restore the public USING(true) read.
--
-- In-flight data at rollback time: pending rows remain invisible to the
-- public, visible to their master, event staff and moderation; admin
-- resolves or deletes them manually. The partial unique index stays
-- (inert, data-preserving). Note: rev 2 of the migration adds NO columns
-- (created_by was removed from the sprint), so there is nothing
-- column-related to roll back.
-- ============================================================================

begin;

-- 1. Remove workflow-specific triggers
drop trigger if exists sauna_event_masters_guard on public.sauna_event_masters;
drop function if exists public.guard_event_master_columns();
-- NOTE: the INSERT normalization trigger (rev 3) is deliberately KEPT —
-- the "approved ⇔ trusted approved_at + defined role" invariant is a
-- security/data-quality property independent of the participation
-- workflow, and the admin direct-assignment tool relies on it staying
-- consistent. Drop sauna_event_masters_insert_guard only in a full
-- decommission.

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
