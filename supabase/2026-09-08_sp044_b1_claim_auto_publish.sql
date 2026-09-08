-- ============================================================================
-- SP-044 Slice B — claim auto-activates a public profile.
--
-- Owner decision (2026-09-08): a successfully claimed ADMIN-PREPARED master
-- profile becomes immediately public — no extra moderator click. This is a
-- deliberate change to the SP-039 publication contract, scoped STRICTLY to the
-- controlled claim path (valid high-entropy token, admin_prepared, active
-- invitation, authenticated claimant, unowned target, one-account-one-master).
-- It is NOT a general self-publish: the only writer of this transition is
-- public_claim_master_profile, and the guard carve-out below requires a
-- 'claimed' invitation naming auth.uid() — a state no client can forge.
--
-- Root cause of post-claim invisibility (SP-039): the M7 claim RPC linked
-- user_id but left status='pending' and created NO master_publication row, so
-- is_master_publicly_visible() (status='approved' AND published/legacy) stayed
-- false. This migration makes the claim atomically establish:
--   invitation=claimed, user_id=claimant, status=approved,
--   publication=published, published_at=now()  (+ audit claim_auto_published).
--
-- Pieces (one transaction):
--   1. mpe vocabulary: + 'claim_auto_published'.
--   2. guard_master_privileged_columns: the M7 body + a status carve-out
--      (pending -> approved) bound to the SAME claim condition as the user_id
--      arm. Every other privileged field is unchanged.
--   3. public_claim_master_profile: M7 body + status='approved' in the same
--      ownership UPDATE + an upserted 'published' master_publication row + a
--      'claim_auto_published' audit event.
--   4. Deterministic, fail-closed backfill of the trusted cohort
--      (admin_prepared + owned + claimed invitation + not-yet-public). The
--      2026-09-08 preflight found 0 such rows — the backfill is a guarded no-op
--      today but is correct if the cohort is ever non-empty.
--
-- Companion rollback: 2026-09-08_sp044_b1_claim_auto_publish_rollback.sql
-- (restores the M7 RPC/guard; publication rows already created stay — see hdr).
-- ============================================================================
begin;

-- Fail loud unless the live objects are EXACTLY the expected predecessors.
do $$
declare
  v_guard text;
  v_rpc   text;
  v_mpe   text;
begin
  select prosrc into v_guard from pg_proc
   where pronamespace='public'::regnamespace and proname='guard_master_privileged_columns';
  if v_guard is null or position('old.origin = ''admin_prepared''' in v_guard) = 0 then
    raise exception 'SP044-B GUARD: guard_master_privileged_columns is not the M7 body; stop and review';
  end if;
  if position('new.status = ''approved''' in v_guard) > 0 then
    raise exception 'SP044-B GUARD: guard already has the status carve-out — SP044-B already applied?; stop and review';
  end if;

  select prosrc into v_rpc from pg_proc
   where pronamespace='public'::regnamespace and proname='public_claim_master_profile';
  if v_rpc is null then
    raise exception 'SP044-B GUARD: public_claim_master_profile not found; stop and review';
  end if;
  if position('master_publication' in v_rpc) > 0 then
    raise exception 'SP044-B GUARD: claim RPC already publication-aware — SP044-B already applied?; stop and review';
  end if;

  select pg_get_constraintdef(oid) into v_mpe from pg_constraint
   where conrelid='public.master_publication_events'::regclass and conname='mpe_event_type_check';
  if v_mpe is null or position('publication_demoted' in v_mpe) = 0 then
    raise exception 'SP044-B GUARD: mpe_event_type_check is not the expected body; stop and review';
  end if;
  if position('claim_auto_published' in v_mpe) > 0 then
    raise exception 'SP044-B GUARD: mpe already has claim_auto_published; stop and review';
  end if;

  if to_regclass('public.master_publication') is null then
    raise exception 'SP044-B GUARD: master_publication table missing; stop and review';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Publication audit vocabulary: + claim_auto_published.
-- ---------------------------------------------------------------------------
alter table public.master_publication_events drop constraint mpe_event_type_check;
alter table public.master_publication_events add constraint mpe_event_type_check
  check (event_type in (
    'legacy_publication_granted','profile_submitted','changes_requested',
    'publication_approved','profile_unpublished','profile_suspended',
    'owner_publication_withdrawn','submission_withdrawn','publication_restored',
    'publication_demoted','claim_auto_published'));

-- ---------------------------------------------------------------------------
-- 2. UPDATE guard: M7 body + status pending->approved claim carve-out.
-- ---------------------------------------------------------------------------
create or replace function public.guard_master_privileged_columns()
returns trigger as $$
begin
  if public.is_platform_moderator() then
    return new;
  end if;

  if new.level is distinct from old.level
     or (new.status is distinct from old.status
         and not (
           -- SP-044 claim auto-publish: pending -> approved as part of the SAME
           -- data-derived claim transition that links user_id (below).
           old.status = 'pending' and new.status = 'approved'
           and old.user_id is null and new.user_id = auth.uid()
           and old.origin = 'admin_prepared'
           and exists (
             select 1 from public.master_claim_invitations i
             where i.master_id = old.id
               and i.status = 'claimed'
               and i.claimed_by = auth.uid()
           )
         ))
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

-- ---------------------------------------------------------------------------
-- 3. public_claim_master_profile: M7 body + atomic auto-publication.
-- ---------------------------------------------------------------------------
create or replace function public.public_claim_master_profile(p_token text)
returns jsonb as $$
declare
  v_uid    uuid := auth.uid();
  v_inv    public.master_claim_invitations%rowtype;
  v_master public.sauna_masters%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  select * into v_inv from public.master_claim_invitations
   where token_hash = extensions.digest(p_token, 'sha256');
  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_inv.master_id::text, 0));

  select * into v_inv from public.master_claim_invitations
   where id = v_inv.id for update;

  if v_inv.status = 'claimed' then
    if v_inv.claimed_by = v_uid then
      return jsonb_build_object('ok', true, 'code', 'already_claimed_by_you',
        'data', jsonb_build_object('master_id', v_inv.master_id));
    end if;
    return jsonb_build_object('ok', false, 'code', 'already_claimed');
  end if;
  if v_inv.status = 'revoked' then
    return jsonb_build_object('ok', false, 'code', 'revoked');
  end if;
  if v_inv.status = 'expired' then
    return jsonb_build_object('ok', false, 'code', 'expired');
  end if;
  if v_inv.expires_at <= now() then
    update public.master_claim_invitations set status = 'expired' where id = v_inv.id;
    insert into public.master_claim_events
      (invitation_id, master_id, event_type, actor_user_id, reason)
    values
      (v_inv.id, v_inv.master_id, 'invitation_expired', v_uid, 'materialized on claim attempt');
    return jsonb_build_object('ok', false, 'code', 'expired');
  end if;

  select * into v_master from public.sauna_masters
   where id = v_inv.master_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;
  if v_master.user_id is not null then
    return jsonb_build_object('ok', false, 'code', 'already_claimed');
  end if;
  if v_master.origin <> 'admin_prepared'
     or v_master.status <> 'pending'
     or coalesce(btrim(v_master.name), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'master_not_eligible');
  end if;
  if exists (select 1 from public.sauna_masters where user_id = v_uid) then
    return jsonb_build_object('ok', false, 'code', 'user_already_master');
  end if;

  -- The atomic pair (subtransaction): invitation FIRST (the guard derives the
  -- claim allowance from the claimed row in this same transaction), then the
  -- ownership + APPROVAL link. SP-044: status='approved' rides the same UPDATE.
  begin
    update public.master_claim_invitations
       set status = 'claimed', claimed_at = now(), claimed_by = v_uid
     where id = v_inv.id;

    update public.sauna_masters
       set user_id = v_uid, status = 'approved'
     where id = v_master.id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'user_already_master');
  end;

  -- Publication: create/flip the 1:1 row to 'published' (DEFINER bypasses the
  -- deny-all client-write posture). Idempotent for safety.
  insert into public.master_publication (master_id, publication_status, published_at)
  values (v_master.id, 'published', now())
  on conflict (master_id) do update
    set publication_status = 'published', published_at = now(), updated_at = now();

  insert into public.master_claim_events
    (invitation_id, master_id, event_type, actor_user_id, metadata)
  values
    (v_inv.id, v_master.id, 'invitation_claimed', v_uid,
     jsonb_build_object('token_prefix', v_inv.token_prefix));

  -- Explicit publication audit: public because a prepared-profile claim
  -- succeeded — NOT a moderator approval.
  insert into public.master_publication_events
    (master_id, event_type, actor_user_id, reason)
  values
    (v_master.id, 'claim_auto_published', v_uid,
     'auto-published on successful prepared-profile claim (SP-044)');

  return jsonb_build_object('ok', true, 'code', 'claimed', 'data', jsonb_build_object(
    'master_id',   v_master.id,
    'master_name', v_master.name,
    'published',   true));
end $$ language plpgsql security definer set search_path = '';

-- Re-affirm the M7 grant posture (CREATE OR REPLACE preserves it; explicit for
-- the SP-039 posture).
revoke all on function public.public_claim_master_profile(text)
  from public, anon, authenticated, service_role;
grant execute on function public.public_claim_master_profile(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Fail-closed backfill of the trusted cohort (0 rows at 2026-09-08).
-- ---------------------------------------------------------------------------
-- Shape assertion: EVERY owned admin_prepared profile must have arrived via a
-- claimed invitation. If not, the data shape is unexpected — abort.
do $$
declare v_owned int; v_owned_claimed int;
begin
  select count(*) into v_owned from public.sauna_masters
   where origin = 'admin_prepared' and user_id is not null;
  select count(*) into v_owned_claimed from public.sauna_masters m
   where m.origin = 'admin_prepared' and m.user_id is not null
     and exists (select 1 from public.master_claim_invitations i
                 where i.master_id = m.id and i.status = 'claimed');
  if v_owned <> v_owned_claimed then
    raise exception
      'SP044-B GUARD: % owned admin_prepared profiles but % have a claimed invitation — unexpected; stop', v_owned, v_owned_claimed;
  end if;
end $$;

-- Approve the cohort. Disable ONLY the privileged-columns guard for this narrow
-- backfill (the carve-out requires auth.uid(), absent in a migration session);
-- FK and other triggers stay active. Re-enabled immediately after.
alter table public.sauna_masters disable trigger sauna_masters_guard;

update public.sauna_masters m
   set status = 'approved'
 where m.origin = 'admin_prepared'
   and m.user_id is not null
   and m.status <> 'approved'
   and exists (select 1 from public.master_claim_invitations i
               where i.master_id = m.id and i.status = 'claimed' and i.claimed_by = m.user_id);

alter table public.sauna_masters enable trigger sauna_masters_guard;

insert into public.master_publication (master_id, publication_status, published_at)
select m.id, 'published', now()
from public.sauna_masters m
left join public.master_publication mp on mp.master_id = m.id
where m.origin = 'admin_prepared' and m.user_id is not null
  and exists (select 1 from public.master_claim_invitations i
              where i.master_id = m.id and i.status = 'claimed' and i.claimed_by = m.user_id)
  and (mp.master_id is null or mp.publication_status not in ('published','legacy_published'))
on conflict (master_id) do update
  set publication_status = 'published', published_at = now(), updated_at = now();

insert into public.master_publication_events (master_id, event_type, reason)
select m.id, 'claim_auto_published',
       'SP-044 backfill: claimed prepared profile auto-published'
from public.sauna_masters m
where m.origin = 'admin_prepared' and m.user_id is not null
  and exists (select 1 from public.master_claim_invitations i
              where i.master_id = m.id and i.status = 'claimed' and i.claimed_by = m.user_id)
  and not exists (select 1 from public.master_publication_events e
                  where e.master_id = m.id and e.event_type = 'claim_auto_published');

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- POST-APPLY VERIFICATION
-- V1. guard_master_privileged_columns has the status carve-out AND the M7
--     user_id arm; the other six fields still raise for a non-moderator.
-- V2. public_claim_master_profile: valid prepared claim -> invitation=claimed,
--     user_id linked, status='approved', master_publication='published'
--     (published_at set), one invitation_claimed + one claim_auto_published
--     event; profile immediately anon-visible via masters_select.
-- V3. Negatives unchanged: invalid/expired/revoked/claimed tokens -> stable
--     codes, NO status/publication change; second claimant -> already_claimed;
--     user with existing master -> user_already_master.
-- V4. A self_registered/pending profile CANNOT reach 'approved'+'published'
--     through this path (guard carve-out requires admin_prepared + claimed inv).
-- V5. Backfill idempotent; only the trusted cohort touched; shape guard fires
--     on an owned admin_prepared profile lacking a claimed invitation.
-- ============================================================================
