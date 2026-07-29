-- ============================================================================
-- SP-039 M6 ROLLBACK — restore the M2 actor-equivalence constraints.
--
-- WARNING: restoring the M2 bodies RE-INTRODUCES the account-deletion defect
-- (23514 on deleting any account that revoked/claimed an invitation), and the
-- restore itself FAILS if any terminal row already has an anonymized (NULL)
-- actor — i.e. once ANY revoking/claiming account has been deleted under M6,
-- this rollback is impossible without rewriting audit data (which is
-- prohibited). Use only immediately after M6, before any actor deletion.
--
-- Companion forward: 2026-07-30_sp039_m6_claim_actor_delete_compat.sql
-- ============================================================================
begin;

-- Fail loud unless the live constraints are the M6 timestamp-equivalence
-- bodies (i.e. M6 actually applied) and no row would violate the M2 originals.
do $$
declare
  v_revoked text;
  v_claimed text;
  v_bad     integer;
begin
  select pg_get_constraintdef(oid) into v_revoked from pg_constraint
   where conrelid = 'public.master_claim_invitations'::regclass
     and conname = 'mci_revoked_consistency';
  if v_revoked is null or position('(revoked_by IS NULL)' in v_revoked) = 0 then
    raise exception 'M6 ROLLBACK GUARD: live mci_revoked_consistency is not the M6 body; stop and review';
  end if;
  select pg_get_constraintdef(oid) into v_claimed from pg_constraint
   where conrelid = 'public.master_claim_invitations'::regclass
     and conname = 'mci_claimed_consistency';
  if v_claimed is null or position('(claimed_by IS NULL)' in v_claimed) = 0 then
    raise exception 'M6 ROLLBACK GUARD: live mci_claimed_consistency is not the M6 body; stop and review';
  end if;

  select count(*) into v_bad from public.master_claim_invitations
   where not ( ((status = 'revoked') = (revoked_by is not null))
               and ((revoked_at is not null) = (revoked_by is not null)) )
      or not ( ((status = 'claimed') = (claimed_by is not null))
               and ((claimed_at is not null) = (claimed_by is not null)) );
  if v_bad > 0 then
    raise exception 'M6 ROLLBACK GUARD: % row(s) have anonymized actors — M2 bodies cannot be restored; stop', v_bad;
  end if;
end $$;

alter table public.master_claim_invitations
  drop constraint mci_revoked_consistency;
alter table public.master_claim_invitations
  add constraint mci_revoked_consistency
  check ((status = 'revoked') = (revoked_by is not null)
         and (revoked_at is not null) = (revoked_by is not null));

alter table public.master_claim_invitations
  drop constraint mci_claimed_consistency;
alter table public.master_claim_invitations
  add constraint mci_claimed_consistency
  check ((status = 'claimed') = (claimed_by is not null)
         and (claimed_at is not null) = (claimed_by is not null));

commit;

notify pgrst, 'reload schema';

-- POST-ROLLBACK: pg_get_constraintdef for both names again contains
-- "(revoked_by IS NOT NULL)" / "(claimed_by IS NOT NULL)" equivalences and no
-- "IS NULL OR" arm.
