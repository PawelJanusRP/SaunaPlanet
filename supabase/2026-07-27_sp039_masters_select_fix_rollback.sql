-- ============================================================================
-- SP-039 D2 ROLLBACK — OPERATIONAL ONLY.
--
-- *** WARNING ***
-- This restores the DRIFTED pre-fix live policy (own-row arm removed,
-- moderation inlined over profiles). It REINTRODUCES the known problems:
-- pending/rejected masters cannot read their own profile and pending
-- owners are denied master-avatars uploads under the SP-039 Storage
-- policy. Use only to reverse the D2 fix for operational reasons.
-- ============================================================================
begin;

drop policy if exists "masters_select" on public.sauna_masters;
-- verbatim reproduction of the drifted live definition captured 2026-07-27:
create policy masters_select on public.sauna_masters
  for select
  using (
    status = 'approved'
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'moderator')
    )
  );

commit;

notify pgrst, 'reload schema';
