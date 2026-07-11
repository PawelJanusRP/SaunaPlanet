-- Fix: profiles RLS blocks (1) users updating their own name and
-- (2) reading other users' display names (comments, reviews, workspace).
--
-- Current live state (see all_scripts_history.sql):
--   - RLS enabled on public.profiles
--   - SELECT policies: own row (auth.uid() = id) + admin (is_admin())
--   - NO UPDATE policy -> client-side name updates silently match 0 rows
--
-- Run in the Supabase SQL Editor. Non-destructive: adds one policy,
-- narrows column grants, adds one view.

-- 1. Users may update their own profile row.
--    Column-level grants below keep role/email immutable from the API:
--    RLS decides WHICH rows, grants decide WHICH columns.
drop policy if exists "user can update own profile" on public.profiles;
create policy "user can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke update on public.profiles from anon, authenticated;
grant update (first_name, last_name) on public.profiles to authenticated;
-- Note: admin_update_user_role keeps working — with zero UPDATE policies it
-- could only ever work as SECURITY DEFINER, which bypasses these grants.

-- 2. Public display names without exposing email/role: a dedicated view.
--    Owned by postgres (table owner) -> reads bypass profiles RLS by design;
--    it exposes ONLY id + name columns, for any signed-in or anonymous reader.
create or replace view public.public_profiles
with (security_invoker = off) as
  select id, first_name, last_name
  from public.profiles;

grant select on public.public_profiles to anon, authenticated;

-- PostgREST schema cache refresh so the view is visible to the API at once.
notify pgrst, 'reload schema';
