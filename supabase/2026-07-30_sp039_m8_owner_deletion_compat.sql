-- ============================================================================
-- SP-039 Slice 4C1 — M8: owner-account-deletion compatibility for owned
-- master profiles.
--
-- ROOT CAUSE (predicted in the 4A ADR §12.4, FK confirmed by catalog probe
-- 2026-07-30): sauna_masters_user_id_fkey is ON DELETE SET NULL. Deleting an
-- auth account that OWNS a master fires an FK-driven
-- `UPDATE sauna_masters SET user_id = NULL`, which hits the BEFORE UPDATE
-- guard (guard_master_privileged_columns). In the Auth deletion context
-- auth.uid() IS NULL, so neither the moderator bypass nor the M7 claim
-- carve-out applies -> the guard raises -> the ACCOUNT becomes undeletable.
-- The exact defect class M6 fixed for the invitation actors, now on the
-- ownership link itself.
--
-- FIX (three narrow pieces, one transaction):
--   1. The guard's user_id arm gains a SECOND data-derived carve-out for
--      exactly the FK-driven anonymization:
--        old.user_id IS NOT NULL AND new.user_id IS NULL AND auth.uid() IS NULL
--      No PostgREST client can reach this transition: every client carries a
--      role whose RLS UPDATE policies (masters_update_own USING/WITH CHECK
--      user_id = auth.uid(); masters_update_moderation) either fail on the
--      row or imply a NON-NULL auth.uid(). anon has no matching policy at
--      all. The only executors of this shape are the FK machinery and a
--      trusted SQL operator. Moderator powers are UNCHANGED (they bypass the
--      guard today and keep doing so); no new detach path is opened for any
--      authenticated principal.
--   2. A dedicated trigger (handle_master_owner_deletion, BEFORE UPDATE OF
--      user_id, fires AFTER the guard by name order) completes the SAME
--      transaction with the approved post-deletion state:
--        * publication is withdrawn (status 'approved' -> 'pending') so no
--          ownerless profile stays publicly visible — today status IS the
--          only publication lever; the 4C2 publication milestone will extend
--          this trigger to its dedicated publication fields;
--        * one forensic 'owner_account_deleted' event is appended (actor is
--          NULL by definition — the actor's account is being deleted).
--   3. mce_event_type_check gains 'owner_account_deleted' (superset
--      drop+recreate, the established M3/M7 pattern).
--
-- RESULTING STATE after owner deletion (documented contract):
--   master row REMAINS; user_id NULL; origin 'admin_prepared' unchanged;
--   status 'pending' (moderator attention: the pilot list already buckets a
--   master with terminal invitation history as terminal_attention);
--   the claimed invitation stays TERMINAL (claim RPC rejects terminal rows —
--   no old invitation is reusable); nothing becomes claimable without an
--   explicit NEW moderator-issued invitation; claim/audit history intact
--   (M6 semantics), extended by the owner_account_deleted event. The state
--   "previously claimed, owner deleted" is distinguishable as:
--   user_id IS NULL AND EXISTS claimed invitation (plus the explicit event).
--   M5 (delete guard) and M6 (actor anonymization) are untouched.
--
-- Companion rollback: 2026-07-30_sp039_m8_owner_deletion_compat_rollback.sql
-- (refuses once any owner_account_deleted event exists; restoring the M7
-- guard body re-introduces the undeletable-account defect — honest limits in
-- its header).
--
-- PRE-APPLY (read-only; STOP on mismatch): see the M8 cutover package P1–P5.
-- ============================================================================
begin;

-- Fail loud unless the live objects are EXACTLY the expected M7 predecessors.
do $$
declare
  v_guard text;
  v_check text;
begin
  select prosrc into v_guard from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname = 'guard_master_privileged_columns';
  if v_guard is null then
    raise exception 'M8 GUARD: guard_master_privileged_columns not found; stop and review';
  end if;
  if position('master_claim_invitations' in v_guard) = 0 then
    raise exception 'M8 GUARD: UPDATE guard lacks the M7 claim arm; stop and review';
  end if;
  if position('auth.uid() is null' in v_guard) > 0 then
    raise exception 'M8 GUARD: UPDATE guard already has the deletion arm — M8 already applied?; stop and review';
  end if;

  select pg_get_constraintdef(oid) into v_check from pg_constraint
   where conrelid = 'public.master_claim_events'::regclass
     and conname = 'mce_event_type_check';
  if v_check is null or position('invitation_claimed' in v_check) = 0 then
    raise exception 'M8 GUARD: mce_event_type_check is not the M7 seven-type body; stop and review';
  end if;
  if position('owner_account_deleted' in v_check) > 0 then
    raise exception 'M8 GUARD: mce_event_type_check already lists owner_account_deleted — M8 already applied?; stop and review';
  end if;

  if to_regprocedure('public.handle_master_owner_deletion()') is not null then
    raise exception 'M8 GUARD: handle_master_owner_deletion() already exists; stop and review';
  end if;
  if exists (select 1 from pg_trigger
             where tgrelid = 'public.sauna_masters'::regclass
               and tgname = 'sauna_masters_owner_deletion') then
    raise exception 'M8 GUARD: trigger sauna_masters_owner_deletion already exists; stop and review';
  end if;

  -- Design premise: the ownership FK anonymizes on delete.
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.sauna_masters'::regclass
                   and conname = 'sauna_masters_user_id_fkey'
                   and confdeltype = 'n') then
    raise exception 'M8 GUARD: sauna_masters_user_id_fkey is not ON DELETE SET NULL; stop and review';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Event vocabulary: + owner_account_deleted (superset recreate).
-- ---------------------------------------------------------------------------
alter table public.master_claim_events
  drop constraint mce_event_type_check;
alter table public.master_claim_events
  add constraint mce_event_type_check
  check (event_type in (
    'profile_prepared','invitation_created','invitation_sent',
    'invitation_revoked','invitation_regenerated','invitation_expired',
    'invitation_claimed','owner_account_deleted'));

-- ---------------------------------------------------------------------------
-- 2. UPDATE guard: the M7 body with the SECOND carve-out on the user_id arm.
--    Everything else is verbatim M7 (which was verbatim M1 + the claim arm).
-- ---------------------------------------------------------------------------
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
           -- Claim transition (M7): see 2026-07-30_sp039_m7_public_claim.sql.
           old.user_id is null
           and new.user_id = auth.uid()
           and old.origin = 'admin_prepared'
           and exists (
             select 1 from public.master_claim_invitations i
             where i.master_id = old.id
               and i.status = 'claimed'
               and i.claimed_by = auth.uid()
           )
         )
         and not (
           -- Owner-account deletion (M8): the FK-driven anonymization runs
           -- with NO authenticated principal. Unreachable for clients: every
           -- RLS UPDATE path to this row implies a NON-NULL auth.uid().
           old.user_id is not null
           and new.user_id is null
           and auth.uid() is null
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
-- trigger sauna_masters_guard (SP-035) already points at this function.

-- ---------------------------------------------------------------------------
-- 3. Owner-deletion completion trigger: withdraw publication + forensic event
--    in the SAME transaction as the FK anonymization. Fires AFTER the guard
--    (BEFORE UPDATE row triggers run in name order:
--    'sauna_masters_guard' < 'sauna_masters_owner_deletion').
-- ---------------------------------------------------------------------------
create function public.handle_master_owner_deletion()
returns trigger as $$
begin
  if old.user_id is not null and new.user_id is null and auth.uid() is null then
    -- No ownerless profile may stay publicly visible. status is the live
    -- publication lever today; the 4C2 publication milestone extends this
    -- to its dedicated publication fields.
    if new.status = 'approved' then
      new.status := 'pending';
    end if;
    insert into public.master_claim_events (master_id, event_type, reason)
    values (old.id, 'owner_account_deleted',
            'owner auth account deleted; publication withdrawn; moderator attention required');
  end if;
  return new;
end $$ language plpgsql security definer set search_path = '';

revoke all on function public.handle_master_owner_deletion()
  from public, anon, authenticated, service_role;

create trigger sauna_masters_owner_deletion
  before update of user_id on public.sauna_masters
  for each row
  execute function public.handle_master_owner_deletion();

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- POST-APPLY VERIFICATION (see the M8 cutover package V1–V4 + behavioral B):
-- V1. Guard prosrc contains BOTH carve-outs; other seven fields still raise
--     for a non-moderator (rolled-back probes).
-- V2. mce_event_type_check lists exactly the eight types.
-- V3. Trigger sauna_masters_owner_deletion exists (BEFORE UPDATE OF user_id),
--     name-ordered AFTER sauna_masters_guard; function is SECURITY DEFINER
--     with empty search_path and no client EXECUTE.
-- V4. Behavioral (self-rolling-back): owned+approved fixture -> auth user
--     DELETE succeeds; master remains with user_id NULL and status 'pending';
--     claimed invitation stays terminal; history intact + ONE
--     owner_account_deleted event; owner/anon detach attempts still raise;
--     M5 delete guard still blocks master deletion.
-- ============================================================================
