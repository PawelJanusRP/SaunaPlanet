-- ============================================================================
-- SP-042B — Feedback foundation (M1) ROLLBACK.
--
-- Drops the SP-042B feedback objects in reverse dependency order.
--
-- GUARD: refuses to run once any facility correction has been APPLIED
-- (feedback_report_events.event_type = 'correction_applied') — applied
-- facility changes must never lose their audit trail
-- (docs/SP042_FEEDBACK_ARCHITECTURE.md §23). Before that point the only data
-- loss is collected, not-yet-applied feedback — the accepted pre-launch cost.
-- ============================================================================
begin;

do $$
begin
  if to_regclass('public.feedback_reports') is null then
    raise exception 'SP042B ROLLBACK GUARD: feedback_reports missing — nothing to roll back';
  end if;
  if to_regclass('public.feedback_report_events') is not null
     and exists (select 1 from public.feedback_report_events
                 where event_type = 'correction_applied') then
    raise exception 'SP042B ROLLBACK GUARD: applied corrections exist — audit history must not be dropped';
  end if;
end $$;

drop function if exists public.submit_feedback_report(text,uuid,text,text,jsonb,text,text,text,text);

drop trigger if exists feedback_reports_status_audit on public.feedback_reports;
drop trigger if exists feedback_reports_guard on public.feedback_reports;
drop function if exists public.feedback_report_status_audit();
drop function if exists public.guard_feedback_report_update();

drop table if exists public.feedback_report_events;
drop table if exists public.feedback_correction_items;
drop table if exists public.feedback_reports;

commit;
