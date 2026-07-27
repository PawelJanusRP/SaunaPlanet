-- ============================================================================
-- SP-039 Slice 3B1 — M5: master deletion guard (BEFORE DELETE).
--
-- Approved contract B: the ordinary admin-delete path (masters_delete policy,
-- authorization UNCHANGED — still is_admin()) is blocked when the master is
-- owned or has ANY claim-invitation history. The master_claim_invitations
-- master_id FK is `ON DELETE RESTRICT` and is the hard integrity backstop; this
-- BEFORE DELETE trigger fires FIRST and raises a clearer Polish domain error
-- (for admin result mapping) than a raw FK violation, AND covers the
-- user_id-IS-NOT-NULL case that the FK alone does not.
--
-- SECURITY DEFINER: the trigger must see invitation rows regardless of the
-- deleter's RLS (the invitations table is client-default-deny); owned by the
-- table owner, it bypasses RLS. It does NOT replace masters_delete authorization
-- — it only refuses unsafe deletes that pass authorization.
--
-- HARDENED: `set search_path = ''` with every object fully qualified
-- (public.master_claim_invitations, OLD.*). A newly authored SECURITY DEFINER
-- function does not inherit the legacy `search_path = public` convention.
--
-- Sequenced LAST (needs master_claim_invitations from M2).
-- Companion rollback: 2026-07-27_sp039_m5_master_delete_guard_rollback.sql
--
-- PRE-APPLY (read-only; STOP on mismatch):
-- P1. master_claim_invitations exists: select to_regclass('public.master_claim_invitations'); -- not null
-- P2. No trigger named sauna_masters_delete_guard yet:
--   select tgname from pg_trigger where tgrelid='public.sauna_masters'::regclass
--     and tgname='sauna_masters_delete_guard';   -- 0 rows
-- ============================================================================
begin;

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

drop trigger if exists sauna_masters_delete_guard on public.sauna_masters;
create trigger sauna_masters_delete_guard
  before delete on public.sauna_masters
  for each row execute function public.guard_master_delete();

-- Restrictive grant for the NEWLY-created guard (repository's safest posture for
-- new functions; contrast with the legacy trigger functions whose broad grants
-- are LEFT UNCHANGED and tracked as separate security debt). A `returns trigger`
-- function CANNOT be invoked directly through SQL (PostgreSQL rejects calling a
-- trigger function outside trigger context), and trigger FIRING does NOT depend
-- on the triggering user's EXECUTE privilege (the trigger runs as part of the
-- DELETE, as its SECURITY DEFINER owner). Revoking EXECUTE from clients is
-- therefore pure defense-in-depth with ZERO behavioral impact on the delete
-- guard. No client EXECUTE is granted; the owner (postgres) retains implicit
-- rights for migration administration.
revoke execute on function public.guard_master_delete() from public;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- POST-APPLY VERIFICATION (rolled-back impersonation as an admin, who alone
-- passes the masters_delete RLS policy)
-- V1. Function is SECURITY DEFINER with pinned search_path:
--   select prosecdef, proconfig from pg_proc
--   where pronamespace='public'::regnamespace and proname='guard_master_delete';
-- V2. Trigger present, BEFORE DELETE, row-level:
--   select tgname, tgtype from pg_trigger
--   where tgrelid='public.sauna_masters'::regclass and tgname='sauna_masters_delete_guard';
-- V3. Behavior (each in a rolled-back tx, as an admin):
--   a) delete a prepared, unclaimed, invitation-FREE master  -> ALLOWED;
--   b) delete a master with user_id NOT NULL                 -> blocked (Polish
--      "...powiązanego z kontem...");
--   c) delete a master that has ANY invitation row (incl. expired/revoked/
--      claimed)                                              -> blocked (Polish
--      "...historią zaproszeń..."); the FK RESTRICT is the backstop if the
--      trigger were ever dropped.
-- V4. masters_delete authorization unchanged: moderator/user/anon still cannot
--     reach DELETE at all (is_admin() policy).
-- ROLLBACK: dropping the trigger/function leaves the FK RESTRICT as the residual
-- protection for the invitation-history case (the user_id case then relies on
-- the admin path not being used); see the rollback file.
-- ============================================================================
