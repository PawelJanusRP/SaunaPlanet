-- ============================================================================
-- SP-039 M8 ROLLBACK — remove the owner-deletion compatibility pieces.
--
-- WARNING — HONEST LIMITS:
--   * IMPOSSIBLE after any real owner deletion: once an
--     'owner_account_deleted' event exists, the seven-type
--     mce_event_type_check cannot be restored and this file REFUSES to run.
--     Deleting or rewriting audit history to force it is prohibited.
--   * Rolling back RE-INTRODUCES the defect: any auth account owning a
--     master profile becomes undeletable again.
--   * Rolling back never restores a deleted owner or re-publishes a profile
--     whose publication was withdrawn — those are business facts.
--
-- Companion forward: 2026-07-30_sp039_m8_owner_deletion_compat.sql
-- ============================================================================
begin;

do $$
declare
  v_cnt   integer;
  v_guard text;
begin
  select count(*) into v_cnt from public.master_claim_events
   where event_type = 'owner_account_deleted';
  if v_cnt > 0 then
    raise exception 'M8 ROLLBACK GUARD: % owner_account_deleted event(s) exist — the M7 vocabulary cannot be restored; stop', v_cnt;
  end if;

  select prosrc into v_guard from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname = 'guard_master_privileged_columns';
  if v_guard is null or position('auth.uid() is null' in v_guard) = 0 then
    raise exception 'M8 ROLLBACK GUARD: live UPDATE guard is not the M8 body; stop and review';
  end if;

  if to_regprocedure('public.handle_master_owner_deletion()') is null then
    raise exception 'M8 ROLLBACK GUARD: handle_master_owner_deletion() not found — nothing to roll back?; stop and review';
  end if;
end $$;

drop trigger sauna_masters_owner_deletion on public.sauna_masters;
drop function public.handle_master_owner_deletion();

-- Restore the M7 guard body VERBATIM (claim arm only, no deletion arm).
create or replace function public.guard_master_privileged_columns()
returns trigger as $$
begin
  if public.is_platform_moderator() then
    return new;
  end if;

  if new.level is distinct from old.level
     or new.status is distinct from old.status
     or (new.user_id is distinct from old.user_id
         and not (
           old.user_id is null
           and new.user_id = auth.uid()
           and old.origin = 'admin_prepared'
           and exists (
             select 1 from public.master_claim_invitations i
             where i.master_id = old.id
               and i.status = 'claimed'
               and i.claimed_by = auth.uid()
           )
         ))
     or new.home_sauna_id is distinct from old.home_sauna_id
     or new.is_founding_partner is distinct from old.is_founding_partner
     or new.rating is distinct from old.rating
     or new.review_count is distinct from old.review_count
     or new.origin is distinct from old.origin
  then
    raise exception
      'Pola uprzywilejowane profilu saunamistrza może zmieniać wyłącznie moderacja.';
  end if;

  return new;
end $$ language plpgsql security definer set search_path = '';

-- Restore the M7 seven-type vocabulary (guard above proved no deletion events).
alter table public.master_claim_events
  drop constraint mce_event_type_check;
alter table public.master_claim_events
  add constraint mce_event_type_check
  check (event_type in (
    'profile_prepared','invitation_created','invitation_sent',
    'invitation_revoked','invitation_regenerated','invitation_expired',
    'invitation_claimed'));

commit;

notify pgrst, 'reload schema';

-- POST-ROLLBACK: trigger and function absent; guard prosrc has no
-- 'auth.uid() is null'; mce_event_type_check lists exactly seven types.
