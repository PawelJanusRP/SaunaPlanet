-- ROLLBACK — SP-045 public master search. Pure read-only helpers; safe to drop.
begin;
drop function if exists public.search_public_masters(text, integer);
drop function if exists public.get_public_master_upcoming_events(uuid, integer);
commit;
notify pgrst, 'reload schema';
