-- ============================================================================
-- SP-037B bundled-submission RPC — FUNCTIONAL ROLLBACK
-- ============================================================================
-- Reverts 2026-07-20_sp037b_bundled_submission_rpc.sql:
--   * drops the atomic RPC (the application then has no bundled path —
--     redeploy the pre-correction app or accept the feature being off);
--   * restores the pre-migration sauna_events SELECT policy.
--
-- WARNING on §2: restoring USING(true) REOPENS the documented openness —
-- anonymous API callers can again read pending/rejected event rows. That
-- is the exact pre-migration state (SP-036 accepted stance), restored
-- here for compatibility; it conflicts with the bundle-invisibility rule,
-- so treat this rollback as a compatibility restore, not a hardening.
--
-- Bundle rows already created by the RPC are ordinary pending records —
-- they remain valid data governed by the existing moderation flow.
-- ============================================================================

begin;

drop function if exists public.submit_facility_with_master_event(
  text, text, timestamptz, text, text, text, text,
  double precision, double precision, time, text, text, integer);

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'sauna_events'
               and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.sauna_events', pol.policyname);
  end loop;
end $$;

create policy events_select on public.sauna_events
  for select using (true);

commit;

-- Post-rollback check: rpc/submit_facility_with_master_event → PGRST202;
-- anon can read non-active event rows again (pre-migration behavior).
