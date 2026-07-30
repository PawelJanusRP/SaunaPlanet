-- ============================================================================
-- SP-039 Slice 4A — M7: public claim foundation (inspection + atomic claim).
--
-- Two NEW public-boundary RPCs plus the two narrow schema amendments they need:
--
--   1. public_inspect_master_claim_invitation(p_token) — pre-auth landing-page
--      projection. Read-only (STABLE). Grants: anon + authenticated. Returns a
--      minimal allow-listed snapshot; malformed and unknown tokens share ONE
--      generic negative (anti-enumeration).
--   2. public_claim_master_profile(p_token) — authenticated atomic claim.
--      Grants: authenticated ONLY (never anon). Identifies the claimant solely
--      from auth.uid(); hashes and compares the token server-side; locks in the
--      SAME order as the M4 admin RPCs (advisory lock on the master, then row
--      locks); transitions the invitation to 'claimed' and links
--      sauna_masters.user_id in ONE transaction (all-or-nothing).
--   3. mce_event_type_check gains 'invitation_claimed' (the superset
--      drop+recreate M3 planned for Slice 4; no other names added — opened
--      tracking is an explicitly deferred decision).
--   4. guard_master_privileged_columns: user_id stays a privileged column, but
--      the guard now recognizes ONE data-derived claim transition for
--      non-moderators: old.user_id IS NULL -> new.user_id = auth.uid(), on an
--      admin_prepared row, and ONLY when a 'claimed' invitation for this master
--      naming auth.uid() exists (written earlier in the same transaction by RPC
--      #2 — the only writer of that state; the invitation table has no client
--      DML). Defense in depth: a direct client UPDATE cannot even reach the
--      guard — masters_update_own USING (user_id = auth.uid()) never matches an
--      unclaimed row. The other seven privileged fields are unchanged.
--
-- Conventions (M4): SECURITY DEFINER, `set search_path = ''`, fully-qualified
-- references, structured jsonb {ok, code, data}, audit in the SAME transaction,
-- stable mapped codes only (no raw PostgreSQL errors), pgcrypto qualified as
-- extensions.digest. New functions use CREATE FUNCTION (no OR REPLACE) —
-- fail-loud on collision (M5 lesson). Grants follow the M5 default-privileges
-- lesson: revoke from public/anon/authenticated/service_role, then grant back
-- exactly what each boundary needs.
--
-- Token model: the raw token is accepted as a parameter, hashed with SHA-256
-- and compared against token_hash. It is NEVER stored, logged, embedded in an
-- exception message, or written to event metadata (metadata carries the
-- non-secret token_prefix at most). token_hash is RETAINED on claim (same as
-- revoke) — terminal-row hash clearance stays with the 90-day retention job.
--
-- Companion rollback: 2026-07-30_sp039_m7_public_claim_rollback.sql
-- (IMPOSSIBLE after any real claim — see its header.)
--
-- PRE-APPLY (read-only; STOP on mismatch): see the M7 cutover package P1–P6.
-- ============================================================================
begin;

-- Fail loud unless the live objects are EXACTLY the expected predecessors.
do $$
declare
  v_check text;
  v_guard text;
begin
  -- Event vocabulary must be the M3 six (no claim events yet).
  select pg_get_constraintdef(oid) into v_check from pg_constraint
   where conrelid = 'public.master_claim_events'::regclass
     and conname = 'mce_event_type_check';
  if v_check is null then
    raise exception 'M7 GUARD: mce_event_type_check not found; stop and review';
  end if;
  if position('invitation_regenerated' in v_check) = 0
     or position('invitation_expired' in v_check) = 0 then
    raise exception 'M7 GUARD: mce_event_type_check is not the M3 six-event body; stop and review';
  end if;
  if position('invitation_claimed' in v_check) > 0 then
    raise exception 'M7 GUARD: mce_event_type_check already lists invitation_claimed — M7 already applied?; stop and review';
  end if;

  -- UPDATE guard must be the M1 eight-field body (origin present, no claim arm).
  select prosrc into v_guard from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname = 'guard_master_privileged_columns';
  if v_guard is null then
    raise exception 'M7 GUARD: guard_master_privileged_columns not found; stop and review';
  end if;
  if position('new.origin' in v_guard) = 0
     or position('new.user_id' in v_guard) = 0
     or position('is_founding_partner' in v_guard) = 0 then
    raise exception 'M7 GUARD: UPDATE guard is not the M1 eight-field body; stop and review';
  end if;
  if position('master_claim_invitations' in v_guard) > 0 then
    raise exception 'M7 GUARD: UPDATE guard already has the claim arm — M7 already applied?; stop and review';
  end if;

  -- The two new function names must be free.
  if to_regprocedure('public.public_inspect_master_claim_invitation(text)') is not null then
    raise exception 'M7 GUARD: public_inspect_master_claim_invitation(text) already exists; stop and review';
  end if;
  if to_regprocedure('public.public_claim_master_profile(text)') is not null then
    raise exception 'M7 GUARD: public_claim_master_profile(text) already exists; stop and review';
  end if;

  -- pgcrypto must live in `extensions` (the M4 assumption this file repeats).
  if not exists (
    select 1 from pg_extension
    where extname = 'pgcrypto' and extnamespace = 'extensions'::regnamespace
  ) then
    raise exception 'M7 GUARD: pgcrypto is not installed in schema extensions; stop and review';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Event vocabulary: + invitation_claimed (superset recreate planned by M3).
-- ---------------------------------------------------------------------------
alter table public.master_claim_events
  drop constraint mce_event_type_check;
alter table public.master_claim_events
  add constraint mce_event_type_check
  check (event_type in (
    'profile_prepared','invitation_created','invitation_sent',
    'invitation_revoked','invitation_regenerated','invitation_expired',
    'invitation_claimed'));

-- ---------------------------------------------------------------------------
-- 2. UPDATE guard: the M1 eight-field body with the ONE data-derived claim
--    transition carved out of the user_id arm. Everything else is verbatim M1.
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
           -- The claim transition: an unclaimed admin-prepared profile may be
           -- linked to the CURRENT account only when a 'claimed' invitation for
           -- this master naming this account exists. Only the claim RPC writes
           -- that state (clients have no DML on the invitation table), and it
           -- does so earlier in the SAME transaction, before this UPDATE.
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
-- trigger sauna_masters_guard (SP-035) already points at this function.

-- ---------------------------------------------------------------------------
-- 3. public_inspect_master_claim_invitation — pre-auth landing projection.
--    Read-only; NEVER materializes expiry (the claim RPC does); malformed and
--    unknown tokens return the SAME generic negative; the claimable payload is
--    a fixed allow-list (no ids, no actor/delivery/admin fields, no hashes).
-- ---------------------------------------------------------------------------
create function public.public_inspect_master_claim_invitation(p_token text)
returns jsonb as $$
declare
  v_inv    public.master_claim_invitations%rowtype;
  v_master public.sauna_masters%rowtype;
begin
  -- One generic negative for malformed AND unknown (anti-enumeration).
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_or_unknown');
  end if;

  select * into v_inv from public.master_claim_invitations
   where token_hash = extensions.digest(p_token, 'sha256');
  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid_or_unknown');
  end if;

  if v_inv.status = 'claimed' then
    return jsonb_build_object('ok', false, 'code', 'already_claimed');
  end if;
  if v_inv.status = 'revoked' then
    return jsonb_build_object('ok', false, 'code', 'revoked');
  end if;
  if v_inv.status = 'expired'
     or (v_inv.status in ('ready','sent','opened') and v_inv.expires_at <= now()) then
    return jsonb_build_object('ok', false, 'code', 'expired');
  end if;

  select * into v_master from public.sauna_masters where id = v_inv.master_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid_or_unknown');
  end if;
  if v_master.user_id is not null then
    return jsonb_build_object('ok', false, 'code', 'already_claimed');
  end if;
  if v_master.origin <> 'admin_prepared'
     or v_master.status <> 'pending'
     or coalesce(btrim(v_master.name), '') = '' then
    -- Rare admin-side drift; generic on purpose (holder should contact admin).
    return jsonb_build_object('ok', false, 'code', 'invalid_or_unknown');
  end if;

  return jsonb_build_object('ok', true, 'code', 'claimable', 'data', jsonb_build_object(
    'state',         'claimable',
    'master_name',   v_master.name,
    'city',          v_master.city,
    'avatar_url',    v_master.avatar_url,
    'bio',           v_master.bio,
    'expires_at',    v_inv.expires_at,
    'auth_required', true));
end $$ language plpgsql security definer stable set search_path = '';

-- ---------------------------------------------------------------------------
-- 4. public_claim_master_profile — authenticated atomic claim.
--    Exactly one winner under concurrency (advisory lock + FOR UPDATE);
--    idempotent for the winner; no partial state on any failure (the
--    invitation+ownership pair updates inside ONE subtransaction).
-- ---------------------------------------------------------------------------
create function public.public_claim_master_profile(p_token text)
returns jsonb as $$
declare
  v_uid    uuid := auth.uid();
  v_inv    public.master_claim_invitations%rowtype;
  v_master public.sauna_masters%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;
  -- Malformed and unknown share ONE generic negative; no events are written
  -- for rejected attempts (no unauthenticated/no-op audit noise).
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  select * into v_inv from public.master_claim_invitations
   where token_hash = extensions.digest(p_token, 'sha256');
  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid_token');
  end if;

  -- Same lock order as the M4 admin RPCs (deadlock-free): advisory lock on the
  -- master, then row locks. Serializes claim vs claim AND claim vs
  -- revoke/regenerate on the same master.
  perform pg_advisory_xact_lock(hashtextextended(v_inv.master_id::text, 0));

  select * into v_inv from public.master_claim_invitations
   where id = v_inv.id for update;

  -- Terminal outcomes first. claimed_by may be NULL after actor deletion (M6):
  -- NULL never equals v_uid, so an anonymized claim correctly reads as
  -- claimed-by-someone-else.
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
  -- Active but past expiry: materialize, exactly like the M4 admin RPCs.
  if v_inv.expires_at <= now() then
    update public.master_claim_invitations
       set status = 'expired'
     where id = v_inv.id;
    insert into public.master_claim_events
      (invitation_id, master_id, event_type, actor_user_id, reason)
    values
      (v_inv.id, v_inv.master_id, 'invitation_expired', v_uid,
       'materialized on claim attempt');
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
  -- One account <-> one master profile (sauna_masters_user_id_unique).
  if exists (select 1 from public.sauna_masters where user_id = v_uid) then
    return jsonb_build_object('ok', false, 'code', 'user_already_master');
  end if;

  -- The pair: invitation FIRST (the amended UPDATE guard derives the claim
  -- allowance from the claimed row in this same transaction), then the
  -- ownership link. The subtransaction guarantees no partial state: if the
  -- ownership UPDATE hits the one-master-per-user unique index (a parallel
  -- claim of a DIFFERENT master by the same account), BOTH updates roll back
  -- and a stable code is returned.
  begin
    update public.master_claim_invitations
       set status = 'claimed', claimed_at = now(), claimed_by = v_uid
     where id = v_inv.id;

    update public.sauna_masters
       set user_id = v_uid
     where id = v_master.id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'user_already_master');
  end;

  insert into public.master_claim_events
    (invitation_id, master_id, event_type, actor_user_id, metadata)
  values
    (v_inv.id, v_master.id, 'invitation_claimed', v_uid,
     jsonb_build_object('token_prefix', v_inv.token_prefix));

  return jsonb_build_object('ok', true, 'code', 'claimed', 'data', jsonb_build_object(
    'master_id',   v_master.id,
    'master_name', v_master.name));
end $$ language plpgsql security definer set search_path = '';

-- ---------------------------------------------------------------------------
-- Privileges (M5 default-privileges lesson: strip everything, grant back
-- exactly). Inspection is the ONLY public-facing grant; the mutating claim is
-- authenticated-only and is NEVER granted to anon.
-- ---------------------------------------------------------------------------
revoke all on function public.public_inspect_master_claim_invitation(text)
  from public, anon, authenticated, service_role;
revoke all on function public.public_claim_master_profile(text)
  from public, anon, authenticated, service_role;

grant execute on function public.public_inspect_master_claim_invitation(text)
  to anon, authenticated;
grant execute on function public.public_claim_master_profile(text)
  to authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- POST-APPLY VERIFICATION (see the M7 cutover package V1–V8):
-- V1. Both functions exist, prosecdef=true, proconfig has search_path="".
-- V2. Grants: inspect = anon+authenticated EXECUTE; claim = authenticated
--     EXECUTE only; neither has public/service_role EXECUTE.
-- V3. mce_event_type_check lists exactly the seven types.
-- V4. guard_master_privileged_columns contains the claim arm; the other seven
--     fields still raise for a non-moderator (rolled-back probes).
-- V5. Inspect: valid active token -> claimable + allow-listed payload only;
--     malformed/unknown -> invalid_or_unknown; revoked/expired/claimed map to
--     their states; NO token_hash/ids/admin/delivery fields in any payload.
-- V6. Claim happy path (rolled-back fixture): invitation -> claimed
--     (claimed_at/claimed_by set), master.user_id linked, ONE
--     invitation_claimed event with token_prefix metadata and NO raw token.
-- V7. Claim negatives: anon grant absent (permission denied); unauthenticated
--     -> not_authenticated; wrong/expired/revoked/claimed tokens -> stable
--     codes; second claimant -> already_claimed; winner repeat ->
--     already_claimed_by_you; user with existing master -> user_already_master.
-- V8. No partial state: any failed path leaves invitation status and
--     sauna_masters.user_id unchanged (subtransaction rollback probe).
-- ============================================================================
