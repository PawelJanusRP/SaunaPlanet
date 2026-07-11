-- SP-034: Owner Event Management — allow approved facility staff
-- (sauna_managers rows with status 'approved') to create, edit and delete
-- events of their own facilities.
--
-- Current live state (see all_scripts_history.sql lines ~1441-1449):
--   - sauna_events SELECT: public
--   - sauna_events INSERT/UPDATE/DELETE: is_admin() only
--   - server action updateEvent additionally allowed moderators, but RLS
--     silently matched 0 rows for them (no error) — moderator edits were a
--     no-op at the DB level. This script does not change the moderator
--     situation; it only adds facility-staff policies.
--
-- Run in the Supabase SQL Editor. Non-destructive: adds one helper function
-- and three additive (permissive, OR-ed) policies. Existing admin policies
-- keep working unchanged.

-- 1. "Is the current user approved staff of this facility?"
--    SECURITY DEFINER so the check does not depend on sauna_managers RLS
--    visibility (same pattern as public.is_admin()).
create or replace function public.is_sauna_staff(target_sauna_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.sauna_managers
    where user_id = auth.uid()
      and sauna_id = target_sauna_id
      and status = 'approved'
  )
$$ language sql security definer stable set search_path = public;

-- 2. Facility staff may insert events for their own facility.
drop policy if exists "events_insert_staff" on public.sauna_events;
create policy "events_insert_staff" on public.sauna_events
  for insert
  with check (public.is_sauna_staff(sauna_id));

-- 3. Facility staff may update events of their own facility. WITH CHECK
--    repeats the guard so an event cannot be moved to a facility the user
--    does not manage.
drop policy if exists "events_update_staff" on public.sauna_events;
create policy "events_update_staff" on public.sauna_events
  for update
  using (public.is_sauna_staff(sauna_id))
  with check (public.is_sauna_staff(sauna_id));

-- 4. Facility staff may delete events of their own facility.
--    Note: deletion of events that already have registrations/reviews may be
--    blocked by FK constraints unless those FKs cascade (event_registrations,
--    event_reviews, event_comments live only in the live schema — verify
--    there). The UI treats a failed delete as an error toast, nothing breaks.
drop policy if exists "events_delete_staff" on public.sauna_events;
create policy "events_delete_staff" on public.sauna_events
  for delete
  using (public.is_sauna_staff(sauna_id));
