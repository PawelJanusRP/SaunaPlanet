-- ============================================================================
-- SP-039 M10 ROLLBACK — remove the publication transition layer.
--
-- WARNING — HONEST LIMITS:
--   * REFUSES once the workflow has actually been used: any event of the
--     three M10 types (submission_withdrawn, publication_restored,
--     publication_demoted) OR any publication row in a state only reachable
--     through the M10 writers (submitted, changes_requested, published,
--     suspended). Those are business facts; deleting or reinterpreting them
--     rewrites history. 'draft' rows are allowed (M9's owner-deletion path
--     can create them) and are left untouched.
--   * NEVER deletes or rewrites audit history, and NEVER changes any
--     publication row — no profile is silently republished or unpublished.
--   * Within its window it drops the 7 RPCs + the demotion trigger/function
--     and restores the M9 7-type event vocabulary VERBATIM.
--
-- Companion forward: 2026-07-30_sp039_m10_publication_transitions.sql
-- ============================================================================
begin;

do $$
declare
  v_evts integer;
  v_rows integer;
  v_def  text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'public.master_publication_events'::regclass
     and conname = 'mpe_event_type_check';
  if v_def is null or position('publication_demoted' in v_def) = 0 then
    raise exception 'M10 ROLLBACK GUARD: event vocabulary is not the M10 body — nothing to roll back?; stop';
  end if;

  select count(*) into v_evts from public.master_publication_events
   where event_type in
     ('submission_withdrawn','publication_restored','publication_demoted');
  if v_evts > 0 then
    raise exception 'M10 ROLLBACK GUARD: % M10-type event(s) exist — history cannot be discarded; stop', v_evts;
  end if;

  select count(*) into v_rows from public.master_publication
   where publication_status in
     ('submitted','changes_requested','published','suspended');
  if v_rows > 0 then
    raise exception 'M10 ROLLBACK GUARD: % row(s) are in M10-reachable workflow states; stop', v_rows;
  end if;
end $$;

drop trigger sauna_masters_material_edit_demotion on public.sauna_masters;
drop function public.handle_master_material_edit_demotion();
drop function public.submit_master_profile_for_publication(uuid);
drop function public.withdraw_master_profile_submission(uuid, text);
drop function public.unpublish_master_profile(uuid, text);
drop function public.moderator_approve_master_publication(uuid, text);
drop function public.moderator_request_master_publication_changes(uuid, text);
drop function public.moderator_suspend_master_publication(uuid, text);
drop function public.moderator_restore_master_publication(uuid, text);

-- Restore the M9 7-type vocabulary VERBATIM (guards above proved no row of
-- the three M10 types exists, so validation passes).
alter table public.master_publication_events
  drop constraint mpe_event_type_check;
alter table public.master_publication_events
  add constraint mpe_event_type_check
  check (event_type in (
    'legacy_publication_granted','profile_submitted','changes_requested',
    'publication_approved','profile_unpublished','profile_suspended',
    'owner_publication_withdrawn'));

commit;

notify pgrst, 'reload schema';

-- POST-ROLLBACK: the 7 RPCs, the trigger and its function are absent;
-- mpe_event_type_check lists exactly the M9 7 types; no publication row or
-- event was modified.
