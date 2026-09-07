-- ============================================================================
-- SP-039 M7 ROLLBACK — remove the public claim foundation.
--
-- WARNING — HONEST LIMITS:
--   * IMPOSSIBLE after any real claim: once an 'invitation_claimed' event
--     exists, the six-type mce_event_type_check cannot be restored, and this
--     file REFUSES to run (guard below). Deleting or rewriting audit history to
--     force it is prohibited.
--   * Rolling back NEVER un-claims ownership: an assigned sauna_masters.user_id
--     and a claimed invitation are business facts, not schema artifacts. This
--     file only removes the RPCs and restores the M1 guard / M3 vocabulary.
--   * Use only as a schema-level teardown BEFORE the first real claim
--     (feature-disable lever: dropping the two functions alone also fully
--     disables the public flow without touching the guard or the vocabulary).
--
-- Companion forward: 2026-07-30_sp039_m7_public_claim.sql
-- ============================================================================
begin;

-- Fail loud unless rollback is still possible and the live objects are the M7
-- bodies.
do $$
declare
  v_claimed integer;
  v_guard   text;
begin
  select count(*) into v_claimed from public.master_claim_events
   where event_type = 'invitation_claimed';
  if v_claimed > 0 then
    raise exception 'M7 ROLLBACK GUARD: % invitation_claimed event(s) exist — the M3 vocabulary cannot be restored; stop', v_claimed;
  end if;

  select prosrc into v_guard from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname = 'guard_master_privileged_columns';
  if v_guard is null or position('master_claim_invitations' in v_guard) = 0 then
    raise exception 'M7 ROLLBACK GUARD: live UPDATE guard is not the M7 body; stop and review';
  end if;

  if to_regprocedure('public.public_inspect_master_claim_invitation(text)') is null
     or to_regprocedure('public.public_claim_master_profile(text)') is null then
    raise exception 'M7 ROLLBACK GUARD: M7 functions not found — nothing to roll back?; stop and review';
  end if;
end $$;

drop function public.public_claim_master_profile(text);
drop function public.public_inspect_master_claim_invitation(text);

-- Restore the M1 eight-field guard body VERBATIM (no claim arm).
create or replace function public.guard_master_privileged_columns()
returns trigger as $$
begin
  if public.is_platform_moderator() then
    return new;
  end if;

  if new.level is distinct from old.level
     or new.status is distinct from old.status
     or new.user_id is distinct from old.user_id
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

-- Restore the M3 six-type vocabulary (guard above proved no claimed events).
alter table public.master_claim_events
  drop constraint mce_event_type_check;
alter table public.master_claim_events
  add constraint mce_event_type_check
  check (event_type in (
    'profile_prepared','invitation_created','invitation_sent',
    'invitation_revoked','invitation_regenerated','invitation_expired'));

commit;

notify pgrst, 'reload schema';

-- POST-ROLLBACK: both public_* claim functions absent; guard prosrc no longer
-- references master_claim_invitations; mce_event_type_check lists exactly six.
