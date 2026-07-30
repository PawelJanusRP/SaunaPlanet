-- ============================================================================
-- SP-039 M9 ROLLBACK — remove the publication schema.
--
-- WARNING — HONEST LIMITS:
--   * REFUSES once the workflow has been used beyond the legacy backfill
--     (any publication row not in 'legacy_published', or any event other
--     than 'legacy_publication_granted'): those states/events are business
--     facts and deleting them rewrites history.
--   * Within its window, dropping the tables DISCARDS the legacy publication
--     grants and their backfill events — recoverable only by re-running the
--     M9 forward (same visible-set identity property).
--   * Restores the SP-035d masters_select and the M8 trigger body VERBATIM;
--     the publicly visible set is again exactly the approved masters.
--
-- Companion forward: 2026-07-30_sp039_m9_publication_schema.sql
-- ============================================================================
begin;

do $$
declare
  v_rows integer;
  v_evts integer;
  v_qual text;
begin
  if to_regclass('public.master_publication') is null then
    raise exception 'M9 ROLLBACK GUARD: master_publication not found — nothing to roll back?; stop and review';
  end if;

  select count(*) into v_rows from public.master_publication
   where publication_status <> 'legacy_published';
  if v_rows > 0 then
    raise exception 'M9 ROLLBACK GUARD: % non-legacy publication row(s) exist — the workflow is in use; stop', v_rows;
  end if;
  select count(*) into v_evts from public.master_publication_events
   where event_type <> 'legacy_publication_granted';
  if v_evts > 0 then
    raise exception 'M9 ROLLBACK GUARD: % workflow event(s) exist — history cannot be discarded; stop', v_evts;
  end if;

  select qual into v_qual from pg_policies
   where schemaname = 'public' and tablename = 'sauna_masters'
     and policyname = 'masters_select';
  if v_qual is null or position('is_master_publicly_visible' in v_qual) = 0 then
    raise exception 'M9 ROLLBACK GUARD: masters_select is not the M9 body; stop and review';
  end if;
end $$;

-- Restore the SP-035d three-arm policy VERBATIM.
drop policy masters_select on public.sauna_masters;
create policy masters_select on public.sauna_masters
  for select
  using (
    (status = 'approved')
    or (user_id = auth.uid())
    or public.is_platform_moderator()
  );

-- Restore the M8 trigger body VERBATIM (no publication awareness).
create or replace function public.handle_master_owner_deletion()
returns trigger as $$
begin
  if old.user_id is not null and new.user_id is null and auth.uid() is null then
    if new.status = 'approved' then
      new.status := 'pending';
    end if;
    insert into public.master_claim_events (master_id, event_type, reason)
    values (old.id, 'owner_account_deleted',
            'owner auth account deleted; publication withdrawn; moderator attention required');
  end if;
  return new;
end $$ language plpgsql security definer set search_path = '';

drop function public.is_master_publicly_visible(uuid);
drop table public.master_publication_events;
drop table public.master_publication;

commit;

notify pgrst, 'reload schema';

-- POST-ROLLBACK: masters_select qual = the three verbatim arms with
-- (status = 'approved'); helper and both tables absent; trigger body has no
-- publication reference.
