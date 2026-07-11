-- Fix: regular users cannot read (and therefore cannot update) their own
-- profiles row — the live DB is missing the own-row SELECT policy that
-- all_scripts_history.sql documents.
--
-- Symptoms confirmed on live:
--   - AuthProvider role fetch returns 406 / 0 rows for non-admin users
--   - name update matches 0 rows for non-admin users (in Postgres an UPDATE
--     whose WHERE reads existing rows also applies SELECT policies)
--   - everything works for admins via the "admin can read all profiles"
--     policy, which masked the problem
--
-- Run in the Supabase SQL Editor. Non-destructive.

-- 1. Restore the own-row SELECT policy.
drop policy if exists "user can read own profile" on public.profiles;
create policy "user can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- 2. Privacy cleanup: sauna_reviews.author_name historically stored the
--    author's EMAIL for signed-in reviews. Replace with the profile name
--    (or the neutral placeholder) for every row that has a linked user.
--    Rows without user_id (legacy/imported reviews) keep their author_name.
update public.sauna_reviews r
set author_name = coalesce(
  nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
  'Użytkownik'
)
from public.profiles p
where r.user_id = p.id
  and position('@' in r.author_name) > 0;

notify pgrst, 'reload schema';
