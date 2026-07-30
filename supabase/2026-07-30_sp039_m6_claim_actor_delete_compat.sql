-- ============================================================================
-- SP-039 M6 — claim audit actor-deletion compatibility.
--
-- DEFECT (found by the 3B4 Preview E2E, 2026-07-29): the M2 constraints
--   mci_revoked_consistency: (status='revoked') = (revoked_by IS NOT NULL)
--                            AND (revoked_at IS NOT NULL) = (revoked_by IS NOT NULL)
--   mci_claimed_consistency: (status='claimed') = (claimed_by IS NOT NULL)
--                            AND (claimed_at IS NOT NULL) = (claimed_by IS NOT NULL)
-- pin the TERMINAL STATE to the ACTOR column, while the actor FKs
-- (revoked_by/claimed_by -> auth.users) are ON DELETE SET NULL. Deleting any
-- account that ever revoked (or, come Slice 4, claimed) an invitation makes
-- the FK null the actor on a terminal row -> 23514 -> the ACCOUNT becomes
-- undeletable. That defeats the approved audit design: history must SURVIVE
-- account deletion, with the actor reference anonymized to NULL.
--
-- FIX: pin the terminal-state equivalence to the TIMESTAMP columns (which are
-- never nulled by any FK or code path) and relax the actor columns to an
-- implication (actor present -> timestamp present -> status terminal). The
-- actor columns are INTENTIONALLY nullable on terminal rows: a NULL actor on a
-- revoked/claimed row means "the acting account was later deleted"; the
-- timestamps, status, token evidence and master_claim_events remain intact.
--
-- Strength comparison (nothing else weakens):
--   kept:    status='revoked'  <=> revoked_at IS NOT NULL   (was implied via actor)
--   kept:    status='claimed'  <=> claimed_at IS NOT NULL   (was implied via actor)
--   kept:    revoked_by/claimed_by present => timestamp present => status terminal
--   relaxed: terminal row MAY have a NULL actor (post account deletion) — the
--            exact behavior the approved design requires.
-- Mixed terminal states stay impossible exactly as before: mci_status_check
-- allows one status, and each timestamp equivalence binds to its own status.
--
-- SCOPE: exactly the two CHECK constraints above are dropped and recreated
-- under their ESTABLISHED NAMES. No data change, no FK/RLS/grant/RPC/trigger/
-- column change. Runs in one transaction; ALTER TABLE takes a short ACCESS
-- EXCLUSIVE lock and validates against the current rows (single-digit row
-- count — instantaneous).
--
-- Companion rollback: 2026-07-30_sp039_m6_claim_actor_delete_compat_rollback.sql
--
-- PRE-APPLY (read-only; STOP on mismatch): see the M6 cutover package (P1–P6).
-- ============================================================================
begin;

-- Fail loud unless the live constraints are EXACTLY the M2 actor-equivalence
-- bodies, the actor FKs are ON DELETE SET NULL, and no existing row would
-- violate the corrected definitions. Anything else = drift; stop and review.
do $$
declare
  v_revoked text;
  v_claimed text;
  v_fk      integer;
  v_bad     integer;
begin
  select pg_get_constraintdef(oid) into v_revoked from pg_constraint
   where conrelid = 'public.master_claim_invitations'::regclass
     and conname = 'mci_revoked_consistency';
  if v_revoked is null then
    raise exception 'M6 GUARD: mci_revoked_consistency not found; stop and review';
  end if;
  if position('(revoked_by IS NOT NULL)' in v_revoked) = 0
     or position('revoked' in v_revoked) = 0 then
    raise exception 'M6 GUARD: mci_revoked_consistency is not the M2 actor-equivalence body; stop and review';
  end if;
  if position('(revoked_by IS NULL)' in v_revoked) > 0 then
    raise exception 'M6 GUARD: mci_revoked_consistency already actor-nullable — M6 already applied?; stop and review';
  end if;

  select pg_get_constraintdef(oid) into v_claimed from pg_constraint
   where conrelid = 'public.master_claim_invitations'::regclass
     and conname = 'mci_claimed_consistency';
  if v_claimed is null then
    raise exception 'M6 GUARD: mci_claimed_consistency not found; stop and review';
  end if;
  if position('(claimed_by IS NOT NULL)' in v_claimed) = 0
     or position('claimed' in v_claimed) = 0 then
    raise exception 'M6 GUARD: mci_claimed_consistency is not the M2 actor-equivalence body; stop and review';
  end if;
  if position('(claimed_by IS NULL)' in v_claimed) > 0 then
    raise exception 'M6 GUARD: mci_claimed_consistency already actor-nullable — M6 already applied?; stop and review';
  end if;

  -- Both actor FKs must be ON DELETE SET NULL ('n') — the design this fixes for.
  select count(*) into v_fk from pg_constraint
   where conrelid = 'public.master_claim_invitations'::regclass
     and contype = 'f'
     and conname in ('master_claim_invitations_revoked_by_fkey',
                     'master_claim_invitations_claimed_by_fkey')
     and confdeltype = 'n';
  if v_fk <> 2 then
    raise exception 'M6 GUARD: actor FKs are not both ON DELETE SET NULL; stop and review';
  end if;

  -- No existing row may violate the corrected definitions (expected: 0 — the
  -- new bodies are strictly weaker on the actor columns only).
  select count(*) into v_bad from public.master_claim_invitations
   where not ( ((status = 'revoked') = (revoked_at is not null))
               and (revoked_by is null or revoked_at is not null) )
      or not ( ((status = 'claimed') = (claimed_at is not null))
               and (claimed_by is null or claimed_at is not null) );
  if v_bad > 0 then
    raise exception 'M6 GUARD: % row(s) would violate the corrected constraints; stop and review', v_bad;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Swap the two constraints, keeping the established names. The terminal state
-- is pinned to the timestamps; the actor columns may be anonymized to NULL by
-- the ON DELETE SET NULL FKs when the acting account is deleted.
-- ---------------------------------------------------------------------------
alter table public.master_claim_invitations
  drop constraint mci_revoked_consistency;
alter table public.master_claim_invitations
  add constraint mci_revoked_consistency
  check ((status = 'revoked') = (revoked_at is not null)
         and (revoked_by is null or revoked_at is not null));

alter table public.master_claim_invitations
  drop constraint mci_claimed_consistency;
alter table public.master_claim_invitations
  add constraint mci_claimed_consistency
  check ((status = 'claimed') = (claimed_at is not null)
         and (claimed_by is null or claimed_at is not null));

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- POST-APPLY VERIFICATION (see the M6 cutover package V1–V5):
-- V1. Both constraints exist under the SAME names, convalidated = true, and
--     their defs contain "(revoked_by IS NULL)" / "(claimed_by IS NULL)".
-- V2. Actor FKs unchanged (confdeltype 'n'); no other constraint changed.
-- V3. Row counts and statuses unchanged (no data was touched).
-- V4. Behavioral: deleting an auth account referenced by revoked_by now
--     SUCCEEDS; the invitation keeps status='revoked' and revoked_at, and
--     revoked_by becomes NULL (audit rows in master_claim_events remain,
--     actor_user_id there also SET NULL).
-- V5. Claimed path: catalog-verified + rolled-back SQL fixture (the public
--     claim flow does not exist yet — Slice 4); see the behavioral block.
-- ROLLBACK: the companion file restores the M2 bodies — IMPOSSIBLE once any
-- terminal row has an anonymized (NULL) actor; see its warning header.
-- ============================================================================
