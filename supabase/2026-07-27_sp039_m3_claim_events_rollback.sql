-- ============================================================================
-- SP-039 Slice 3B1 — M3 ROLLBACK.
--
-- DESTRUCTIVE: dropping master_claim_events discards forensic claim history.
-- Safe ONLY before any real event exists (schema-only rollback). After real
-- events exist, prefer FEATURE-DISABLE (revoke EXECUTE on the M4 RPCs) and keep
-- the audit trail for security investigations.
--
-- Rollback ordering: M3 has no dependents; it may be dropped independently of
-- M2. If tearing down the whole feature, drop M4 (functions) -> M3 -> M2 -> M1.
--
-- Companion forward: 2026-07-27_sp039_m3_claim_events.sql
-- ============================================================================
begin;

drop policy if exists master_claim_events_select_moderator on public.master_claim_events;
drop table if exists public.master_claim_events;

commit;

notify pgrst, 'reload schema';

-- POST-ROLLBACK VERIFICATION:
--   select to_regclass('public.master_claim_events');  -- expect NULL
