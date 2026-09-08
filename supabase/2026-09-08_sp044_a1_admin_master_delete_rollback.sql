-- ============================================================================
-- ROLLBACK — SP-044 Slice A (admin master deletion).
--
-- IRREVERSIBILITY WARNING: safe ONLY before any real admin deletion has run.
-- Once admin_delete_master_profile has deleted a master, its invitation rows
-- were detached (master_id = NULL) and their tokens cleared. Restoring the FK
-- to NOT NULL / ON DELETE RESTRICT will then FAIL (NULL master_id rows), and no
-- rollback can re-associate them. In that case DO NOT run this file — treat the
-- SET NULL invitation FK as the new baseline and disable the feature at the app
-- layer instead.
--
-- This rollback restores the pre-SP-044 delete contract (admin+moderator direct
-- DELETE policy, M5 guard without admin bypass, RESTRICT invitation FK) and
-- drops the RPC + the added audit vocabulary.
-- ============================================================================
begin;

-- Refuse if the feature has already been used (detached invitations exist).
do $$
begin
  if exists (select 1 from public.master_claim_invitations where master_id is null) then
    raise exception
      'SP044-A ROLLBACK REFUSED: detached invitations (master_id NULL) exist — a real deletion already ran; rollback is impossible. See header.';
  end if;
end $$;

drop function if exists public.admin_delete_master_profile(uuid);

-- Restore RESTRICT + NOT NULL on the invitation FK.
alter table public.master_claim_invitations
  drop constraint master_claim_invitations_master_id_fkey;
alter table public.master_claim_invitations
  alter column master_id set not null;
alter table public.master_claim_invitations
  add constraint master_claim_invitations_master_id_fkey
  foreign key (master_id) references public.sauna_masters(id) on delete restrict;

-- Restore the M5 guard body (no admin bypass).
create or replace function public.guard_master_delete()
returns trigger as $$
begin
  if old.user_id is not null then
    raise exception
      'Nie można usunąć profilu saunamistrza powiązanego z kontem — najpierw odłącz właściciela.'
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.master_claim_invitations
             where master_id = old.id) then
    raise exception
      'Nie można usunąć profilu z historią zaproszeń — zachowaj dowody i użyj procedury odzyskiwania.'
      using errcode = 'P0001';
  end if;
  return old;
end $$ language plpgsql security definer set search_path = '';

-- Restore the SP-039 M0 admin+moderator direct DELETE policy.
create policy "masters_delete" on public.sauna_masters
  for delete
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = any (array['admin'::text, 'moderator'::text])
    )
  );

-- Revert the audit vocabulary (only safe if no master_admin_deleted rows exist).
do $$
begin
  if exists (select 1 from public.master_claim_events where event_type = 'master_admin_deleted') then
    raise exception
      'SP044-A ROLLBACK: master_admin_deleted events exist — leave mce_event_type_check as-is (audit history).';
  end if;
end $$;
alter table public.master_claim_events drop constraint mce_event_type_check;
alter table public.master_claim_events add constraint mce_event_type_check
  check (event_type in (
    'profile_prepared','invitation_created','invitation_sent',
    'invitation_revoked','invitation_regenerated','invitation_expired',
    'invitation_claimed','owner_account_deleted'));

commit;

notify pgrst, 'reload schema';
