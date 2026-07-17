-- SP-035D: deterministic SELECT policies on sauna_masters.
--
-- Run in the Supabase SQL Editor, AFTER 2026-07-11_sp035_master_studio.sql
-- (depends on public.is_platform_moderator()).
--
-- Why: the live SELECT policies on sauna_masters are not version-controlled
-- (REPOSITORY_AUDIT §5 caveat). An anon-key probe (2026-07-17) shows the
-- public arm is already status = 'approved', but the OWN-ROW arm cannot be
-- verified from outside — without it the Master Studio gate cannot read the
-- owner's own pending/rejected profile and would show "no profile" instead
-- of the real status (PLATFORM_WORKSPACES §5: pending/rejected visible to
-- self and moderation only). This script makes the whole SELECT surface
-- deterministic, same pattern as the SP-035 INSERT/UPDATE cleanup: drop by
-- catalog lookup, recreate explicitly.
--
-- Resulting visibility:
--   * everyone (incl. anon)  -> approved profiles
--   * the linked account      -> its own profile in any status (Studio gate)
--   * moderator/admin         -> every profile
--
-- SECURITY DEFINER RPCs (get_saunas_nearby etc.) bypass RLS and are
-- unaffected. INSERT/UPDATE/DELETE policies are not touched.

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public'
      and tablename = 'sauna_masters'
      and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.sauna_masters', p.policyname);
  end loop;
end $$;

create policy masters_select on public.sauna_masters
  for select
  using (
    status = 'approved'
    or user_id = auth.uid()
    or public.is_platform_moderator()
  );

notify pgrst, 'reload schema';
