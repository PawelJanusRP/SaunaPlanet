-- ============================================================================
-- SP-039 Slice 3B1 — M4: admin claim-invitation RPCs (moderator-gated,
-- SECURITY DEFINER, single trust boundary for token generation).
--
-- Conventions (SP-037B / SP-038): SECURITY DEFINER, `set search_path = ''`,
-- FULLY-QUALIFIED refs, internal moderator authorization (never trusts the
-- server action), structured jsonb {ok, code, data} result, audit written in the
-- SAME transaction, `revoke ... from public, anon` + `grant execute ... to
-- authenticated`. The browser must NEVER call these directly (Next.js server
-- layer only) and never sends a token or hash — the token is generated HERE.
--
-- pgcrypto lives in the `extensions` schema on Supabase (same as pg_trgm — see
-- SP-036); with `search_path=''` it MUST be qualified: extensions.gen_random_bytes
-- / extensions.digest. Core funcs (pg_advisory_xact_lock, hashtextextended, now,
-- encode, translate, rtrim, left, make_interval) resolve from pg_catalog.
--
-- RATE-LIMIT SCOPE (precise): the per-actor rolling-hour limits below count
-- SUCCESSFUL privileged lifecycle operations (they count audit events, which are
-- written only when an operation succeeds). They protect against accidental or
-- abusive MASS GENERATION by an already-authorized moderator. They are NOT a
-- full invalid-attempt / malformed-request / network-abuse limiter — rejected
-- calls (not_authorized, not_eligible, invalid_transition, ...) do not write
-- events and are not throttled here. Comprehensive attempt-rate monitoring and
-- alerting is deferred to SP-040. Thresholds: create+regenerate 30/hour,
-- mark_sent+revoke 60/hour, per moderator.
--
-- COUNTING MODEL (deliberate, documented — approved option A): the limits are
-- EVENT-count based, not logical-operation based. Consequences: one successful
-- regeneration of a LIVE invitation writes 'invitation_regenerated' +
-- 'invitation_created' and therefore consumes two units of the 30/hour
-- create+regenerate pool; its explicit 'invitation_revoked' event also consumes
-- one unit of the shared 60/hour mark_sent+revoke pool (a regeneration IS a real
-- revocation). 'invitation_expired' materialization events count toward NO pool.
-- Acceptable headroom for the 10-master pilot; revisit with SP-040 telemetry.
--
-- >>> PREFLIGHT (read-only, MANDATORY before apply — this env had no DB access):
--   select extnamespace::regnamespace, extname from pg_extension where extname='pgcrypto';
--   select pg_get_functiondef('extensions.gen_random_bytes(integer)'::regprocedure);
--   select pg_get_functiondef('extensions.digest(text,text)'::regprocedure);
--   select pg_get_functiondef('pg_catalog.hashtextextended(text,bigint)'::regprocedure);
--   select pg_get_functiondef('pg_catalog.pg_advisory_xact_lock(bigint)'::regprocedure);
--   -- If pgcrypto is in `public` (not `extensions`), change the two qualified
--   -- calls below. If pgcrypto/gen_random_bytes is UNAVAILABLE, switch to the
--   -- Node crypto.randomBytes(32) fallback (lib/claim/token.ts) — the RPC would
--   -- then accept a server-computed p_token_hash bytea instead of generating.
-- <<<
--
-- Companion rollback: 2026-07-27_sp039_m4_admin_rpcs_rollback.sql
-- PRE-APPLY: none of the six function names exist yet:
--   select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.proname like 'admin_%master_claim%';
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- admin_create_master_claim_invitation
--   moderator-only; rate-limited; eligibility-gated; advisory-locked per master;
--   materializes expired active rows; returns active_invitation_exists if a
--   live active invitation remains (NEVER auto-revokes); generates a base64url
--   256-bit token in-DB, stores only its SHA-256 digest; returns the raw token
--   EXACTLY ONCE. Never accepts a client hash.
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_master_claim_invitation(
  p_master_id  uuid,
  p_valid_days integer default 14,
  p_admin_note text default null
) returns jsonb as $$
declare
  v_actor    uuid := auth.uid();
  v_master   public.sauna_masters%rowtype;
  v_recent   integer;
  v_active   uuid;
  v_token    text;
  v_hash     bytea;
  v_prefix   text;
  v_inv_id   uuid;
  v_expires  timestamptz;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;
  if not public.is_platform_moderator() then
    return jsonb_build_object('ok', false, 'code', 'not_authorized');
  end if;
  if coalesce(p_valid_days, 0) < 1 or p_valid_days > 60 then
    p_valid_days := 14;
  end if;

  -- Throttle on SUCCESSFUL create+regenerate operations: 30 / moderator /
  -- rolling hour (counts audit events, which are written ONLY on success —
  -- see the RATE-LIMIT SCOPE note in the header). Guards against accidental or
  -- abusive mass generation by an authorized moderator; it is NOT an
  -- invalid-attempt or network-abuse limiter (that is SP-040's job).
  select count(*) into v_recent
  from public.master_claim_events
  where actor_user_id = v_actor
    and event_type in ('invitation_created','invitation_regenerated')
    and created_at >= now() - interval '1 hour';
  if v_recent >= 30 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  -- Eligibility.
  select * into v_master from public.sauna_masters where id = p_master_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'master_not_found');
  end if;
  if v_master.user_id is not null then
    return jsonb_build_object('ok', false, 'code', 'master_already_claimed');
  end if;
  if v_master.origin <> 'admin_prepared'
     or v_master.status <> 'pending'
     or coalesce(btrim(v_master.name), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'master_not_eligible');
  end if;

  -- Serialize generation for this master (race-safe with zero prior rows).
  perform pg_advisory_xact_lock(hashtextextended(p_master_id::text, 0));

  -- Lock existing active rows, then materialize the truly-expired ones.
  perform 1 from public.master_claim_invitations
   where master_id = p_master_id and status in ('ready','sent','opened')
   for update;

  -- One 'invitation_expired' event PER transitioned invitation, tied to its id
  -- (UPDATE ... RETURNING feeds the audit insert — never a generic master-only
  -- event when the transitioned invitation is known).
  with expired as (
    update public.master_claim_invitations
       set status = 'expired'
     where master_id = p_master_id
       and status in ('ready','sent','opened')
       and expires_at <= now()
     returning id
  )
  insert into public.master_claim_events
    (invitation_id, master_id, event_type, actor_user_id, reason)
  select e.id, p_master_id, 'invitation_expired', v_actor, 'materialized before create'
  from expired e;

  -- A non-expired active invitation still present -> conflict (no auto-revoke).
  select id into v_active from public.master_claim_invitations
   where master_id = p_master_id and status in ('ready','sent','opened')
   limit 1;
  if v_active is not null then
    return jsonb_build_object('ok', false, 'code', 'active_invitation_exists');
  end if;

  -- Generate: 32 CSPRNG bytes -> base64url -> SHA-256 digest (bytea). pgcrypto.
  v_token  := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  v_hash   := extensions.digest(v_token, 'sha256');
  v_prefix := left(v_token, 8);
  v_expires := now() + make_interval(days => p_valid_days);

  insert into public.master_claim_invitations
    (master_id, token_hash, token_prefix, status, expires_at, admin_note, created_by)
  values
    (p_master_id, v_hash, v_prefix, 'ready', v_expires, nullif(btrim(p_admin_note), ''), v_actor)
  returning id into v_inv_id;

  insert into public.master_claim_events
    (invitation_id, master_id, event_type, actor_user_id, metadata)
  values
    (v_inv_id, p_master_id, 'invitation_created', v_actor,
     jsonb_build_object('token_prefix', v_prefix));

  -- raw_token returned EXACTLY ONCE to the Next.js server layer; never stored.
  return jsonb_build_object('ok', true, 'code', 'ok', 'data', jsonb_build_object(
    'invitation_id', v_inv_id,
    'token_prefix',  v_prefix,
    'expires_at',    v_expires,
    'raw_token',     v_token));
end $$ language plpgsql security definer set search_path = '';

-- ---------------------------------------------------------------------------
-- admin_mark_master_claim_sent — ready -> sent; records channel + REDACTED hint.
-- ---------------------------------------------------------------------------
create or replace function public.admin_mark_master_claim_sent(
  p_invitation_id uuid,
  p_delivery_channel text,
  p_delivery_target_hint text default null
) returns jsonb as $$
declare
  v_actor uuid := auth.uid();
  v_inv   public.master_claim_invitations%rowtype;
  v_recent integer;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;
  if not public.is_platform_moderator() then
    return jsonb_build_object('ok', false, 'code', 'not_authorized');
  end if;
  if p_delivery_channel is null
     or p_delivery_channel not in ('email','messenger','whatsapp','sms','other') then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition',
      'data', jsonb_build_object('detail', 'delivery_channel'));
  end if;

  select count(*) into v_recent
  from public.master_claim_events
  where actor_user_id = v_actor
    and event_type in ('invitation_sent','invitation_revoked')
    and created_at >= now() - interval '1 hour';
  if v_recent >= 60 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  select * into v_inv from public.master_claim_invitations
   where id = p_invitation_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'invitation_not_found');
  end if;
  if v_inv.status = 'sent' then
    return jsonb_build_object('ok', true, 'code', 'already_sent');  -- idempotent
  end if;
  if v_inv.status <> 'ready' then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition');
  end if;

  update public.master_claim_invitations
     set status = 'sent',
         sent_at = now(),
         delivery_channel = p_delivery_channel,
         delivery_target_hint = nullif(btrim(p_delivery_target_hint), '')
   where id = p_invitation_id;

  insert into public.master_claim_events
    (invitation_id, master_id, event_type, actor_user_id, delivery_channel)
  values
    (p_invitation_id, v_inv.master_id, 'invitation_sent', v_actor, p_delivery_channel);

  return jsonb_build_object('ok', true, 'code', 'sent');
end $$ language plpgsql security definer set search_path = '';

-- ---------------------------------------------------------------------------
-- admin_revoke_master_claim_invitation — active -> revoked; reason required;
-- token hash RETAINED (nulled later by the 90-day retention job).
-- ---------------------------------------------------------------------------
create or replace function public.admin_revoke_master_claim_invitation(
  p_invitation_id uuid,
  p_reason text
) returns jsonb as $$
declare
  v_actor uuid := auth.uid();
  v_inv   public.master_claim_invitations%rowtype;
  v_recent integer;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;
  if not public.is_platform_moderator() then
    return jsonb_build_object('ok', false, 'code', 'not_authorized');
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition',
      'data', jsonb_build_object('detail', 'reason_required'));
  end if;

  select count(*) into v_recent
  from public.master_claim_events
  where actor_user_id = v_actor
    and event_type in ('invitation_sent','invitation_revoked')
    and created_at >= now() - interval '1 hour';
  if v_recent >= 60 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  select * into v_inv from public.master_claim_invitations
   where id = p_invitation_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'invitation_not_found');
  end if;
  if v_inv.status = 'revoked' then
    return jsonb_build_object('ok', true, 'code', 'already_revoked');  -- idempotent
  end if;
  if v_inv.status not in ('ready','sent','opened') then
    return jsonb_build_object('ok', false, 'code', 'invitation_already_terminal');
  end if;

  update public.master_claim_invitations
     set status = 'revoked', revoked_at = now(), revoked_by = v_actor
   where id = p_invitation_id;

  insert into public.master_claim_events
    (invitation_id, master_id, event_type, actor_user_id, reason)
  values
    (p_invitation_id, v_inv.master_id, 'invitation_revoked', v_actor, btrim(p_reason));

  return jsonb_build_object('ok', true, 'code', 'revoked');
end $$ language plpgsql security definer set search_path = '';

-- ---------------------------------------------------------------------------
-- admin_regenerate_master_claim_invitation — explicit revoke-then-create in ONE
-- transaction. Audit contract (approved chain): materialize expired (one
-- 'invitation_expired' per transitioned row) -> revoke old row +
-- 'invitation_revoked' -> insert replacement -> 'invitation_regenerated' on the
-- old row (metadata carries old_invitation_id AND new_invitation_id) ->
-- 'invitation_created' on the new row (metadata regenerated_from). Old row kept;
-- token never rotated in place; previous raw token unrecoverable.
-- ---------------------------------------------------------------------------
create or replace function public.admin_regenerate_master_claim_invitation(
  p_master_id  uuid,
  p_reason     text,
  p_valid_days integer default 14
) returns jsonb as $$
declare
  v_actor   uuid := auth.uid();
  v_master  public.sauna_masters%rowtype;
  v_recent  integer;
  v_old_id  uuid;
  v_token   text;
  v_hash    bytea;
  v_prefix  text;
  v_inv_id  uuid;
  v_expires timestamptz;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;
  if not public.is_platform_moderator() then
    return jsonb_build_object('ok', false, 'code', 'not_authorized');
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition',
      'data', jsonb_build_object('detail', 'reason_required'));
  end if;
  if coalesce(p_valid_days, 0) < 1 or p_valid_days > 60 then
    p_valid_days := 14;
  end if;

  select count(*) into v_recent
  from public.master_claim_events
  where actor_user_id = v_actor
    and event_type in ('invitation_created','invitation_regenerated')
    and created_at >= now() - interval '1 hour';
  if v_recent >= 30 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  select * into v_master from public.sauna_masters where id = p_master_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'master_not_found');
  end if;
  if v_master.user_id is not null then
    return jsonb_build_object('ok', false, 'code', 'master_already_claimed');
  end if;
  if v_master.origin <> 'admin_prepared'
     or v_master.status <> 'pending'
     or coalesce(btrim(v_master.name), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'master_not_eligible');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_master_id::text, 0));

  perform 1 from public.master_claim_invitations
   where master_id = p_master_id and status in ('ready','sent','opened')
   for update;

  -- Materialize expired FIRST — same forensic semantics as create: one
  -- 'invitation_expired' event per transitioned invitation, tied to its id.
  with expired as (
    update public.master_claim_invitations
       set status = 'expired'
     where master_id = p_master_id
       and status in ('ready','sent','opened')
       and expires_at <= now()
     returning id
  )
  insert into public.master_claim_events
    (invitation_id, master_id, event_type, actor_user_id, reason)
  select e.id, p_master_id, 'invitation_expired', v_actor, 'materialized before regenerate'
  from expired e;

  -- Revoke any live active row (explicit regeneration). AUDIT CHAIN step 1/3:
  -- 'invitation_revoked' on the old row — the same state transition as an
  -- ordinary revoke gets the same forensic event. The regeneration LINK event
  -- is written only after the replacement exists (so it can carry BOTH ids —
  -- never misleading metadata before the new id is known).
  select id into v_old_id from public.master_claim_invitations
   where master_id = p_master_id and status in ('ready','sent','opened')
   limit 1;
  if v_old_id is not null then
    update public.master_claim_invitations
       set status = 'revoked', revoked_at = now(), revoked_by = v_actor
     where id = v_old_id;
    insert into public.master_claim_events
      (invitation_id, master_id, event_type, actor_user_id, reason)
    values
      (v_old_id, p_master_id, 'invitation_revoked', v_actor, btrim(p_reason));
  end if;

  v_token  := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  v_hash   := extensions.digest(v_token, 'sha256');
  v_prefix := left(v_token, 8);
  v_expires := now() + make_interval(days => p_valid_days);

  insert into public.master_claim_invitations
    (master_id, token_hash, token_prefix, status, expires_at, created_by)
  values
    (p_master_id, v_hash, v_prefix, 'ready', v_expires, v_actor)
  returning id into v_inv_id;

  -- AUDIT CHAIN step 2/3: the regeneration link on the OLD invitation, now able
  -- to reference both lifecycle ids.
  if v_old_id is not null then
    insert into public.master_claim_events
      (invitation_id, master_id, event_type, actor_user_id, reason, metadata)
    values
      (v_old_id, p_master_id, 'invitation_regenerated', v_actor, btrim(p_reason),
       jsonb_build_object('old_invitation_id', v_old_id,
                          'new_invitation_id', v_inv_id));
  end if;

  -- AUDIT CHAIN step 3/3: creation of the replacement (regenerated_from is null
  -- when no live row existed — plain re-issue after expiry/revocation).
  insert into public.master_claim_events
    (invitation_id, master_id, event_type, actor_user_id, metadata)
  values
    (v_inv_id, p_master_id, 'invitation_created', v_actor,
     jsonb_build_object('token_prefix', v_prefix,
                        'regenerated_from', v_old_id));

  return jsonb_build_object('ok', true, 'code', 'ok', 'data', jsonb_build_object(
    'invitation_id', v_inv_id,
    'token_prefix',  v_prefix,
    'expires_at',    v_expires,
    'raw_token',     v_token,
    'revoked_invitation_id', v_old_id));
end $$ language plpgsql security definer set search_path = '';

-- ---------------------------------------------------------------------------
-- admin_list_master_claim_invitations — moderator read projection.
--   NEVER returns token_hash or the raw token. token_prefix (diagnostic) only.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_master_claim_invitations()
returns jsonb as $$
declare v_rows jsonb;
begin
  if not public.is_platform_moderator() then
    return jsonb_build_object('ok', false, 'code', 'not_authorized');
  end if;

  select coalesce(jsonb_agg(payload order by payload_created_at desc), '[]'::jsonb)
    into v_rows
  from (
    select jsonb_build_object(
             'invitation_id', i.id,
             'master_id',     i.master_id,
             'master_name',   m.name,
             'master_status', m.status,
             'origin',        m.origin,
             'claimed_owner', (m.user_id is not null),
             'status',        i.status,
             'token_prefix',  i.token_prefix,
             'expires_at',    i.expires_at,
             'created_at',    i.created_at,
             'sent_at',       i.sent_at,
             'revoked_at',    i.revoked_at,
             'delivery_channel', i.delivery_channel,
             'delivery_target_hint', i.delivery_target_hint
           ) as payload,
           i.created_at as payload_created_at
    from public.master_claim_invitations i
    join public.sauna_masters m on m.id = i.master_id
  ) s;

  return jsonb_build_object('ok', true, 'code', 'ok', 'data', v_rows);
end $$ language plpgsql security definer stable set search_path = '';

-- ---------------------------------------------------------------------------
-- admin_get_master_claim_invitation — one invitation + its audit history.
--   NEVER returns token_hash / raw token.
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_master_claim_invitation(p_id uuid)
returns jsonb as $$
declare
  v_inv    jsonb;
  v_events jsonb;
  v_master_id uuid;
begin
  if not public.is_platform_moderator() then
    return jsonb_build_object('ok', false, 'code', 'not_authorized');
  end if;

  select jsonb_build_object(
           'invitation_id', i.id,
           'master_id',     i.master_id,
           'master_name',   m.name,
           'status',        i.status,
           'token_prefix',  i.token_prefix,
           'expires_at',    i.expires_at,
           'created_at',    i.created_at,
           'sent_at',       i.sent_at,
           'revoked_at',    i.revoked_at,
           'delivery_channel', i.delivery_channel,
           'delivery_target_hint', i.delivery_target_hint,
           'admin_note',    i.admin_note),
         i.master_id
    into v_inv, v_master_id
  from public.master_claim_invitations i
  join public.sauna_masters m on m.id = i.master_id
  where i.id = p_id;

  if v_inv is null then
    return jsonb_build_object('ok', false, 'code', 'invitation_not_found');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'event_type', e.event_type,
           'actor_user_id', e.actor_user_id,
           'reason', e.reason,
           'delivery_channel', e.delivery_channel,
           'metadata', e.metadata,
           'created_at', e.created_at
         ) order by e.created_at), '[]'::jsonb)
    into v_events
  from public.master_claim_events e
  where e.invitation_id = p_id or (e.master_id = v_master_id and e.invitation_id is null);

  return jsonb_build_object('ok', true, 'code', 'ok',
    'data', jsonb_build_object('invitation', v_inv, 'events', v_events));
end $$ language plpgsql security definer stable set search_path = '';

-- ---------------------------------------------------------------------------
-- Privileges: never anon; execute for authenticated (internal moderator gate).
-- ---------------------------------------------------------------------------
revoke all on function public.admin_create_master_claim_invitation(uuid, integer, text) from public, anon;
revoke all on function public.admin_mark_master_claim_sent(uuid, text, text)            from public, anon;
revoke all on function public.admin_revoke_master_claim_invitation(uuid, text)          from public, anon;
revoke all on function public.admin_regenerate_master_claim_invitation(uuid, text, integer) from public, anon;
revoke all on function public.admin_list_master_claim_invitations()                     from public, anon;
revoke all on function public.admin_get_master_claim_invitation(uuid)                    from public, anon;

grant execute on function public.admin_create_master_claim_invitation(uuid, integer, text) to authenticated;
grant execute on function public.admin_mark_master_claim_sent(uuid, text, text)            to authenticated;
grant execute on function public.admin_revoke_master_claim_invitation(uuid, text)          to authenticated;
grant execute on function public.admin_regenerate_master_claim_invitation(uuid, text, integer) to authenticated;
grant execute on function public.admin_list_master_claim_invitations()                     to authenticated;
grant execute on function public.admin_get_master_claim_invitation(uuid)                    to authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- POST-APPLY VERIFICATION (rolled-back impersonation unless noted)
-- V1. All six functions: prosecdef=true, proconfig has search_path="":
--   select proname, prosecdef, proconfig from pg_proc p
--   join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and proname like 'admin_%master_claim%';
-- V2. anon has NO execute (revoked); authenticated has execute:
--   (attempt as anon -> permission denied for function.)
-- V3. Non-moderator (ordinary user) -> {ok:false, code:'not_authorized'} for
--     every function; anon session (auth.uid() null) -> 'not_authenticated'.
-- V4. Moderator create against an eligible admin_prepared/pending/user_id-NULL
--     master -> ok, raw_token present; row stored with token_hash =
--     extensions.digest(raw_token,'sha256') and token_prefix = left(raw_token,8);
--     re-create -> {ok:false,'active_invitation_exists'} (no second active row);
--     'invitation_created' event has metadata.token_prefix and NO raw token.
-- V5. Ineligible: user_id NOT NULL -> master_already_claimed; origin
--     self_registered / status<>pending / blank name -> master_not_eligible;
--     missing id -> master_not_found.
-- V6. mark_sent ready->sent (idempotent repeat -> already_sent; non-ready ->
--     invalid_transition). revoke active->revoked (reason required; repeat ->
--     already_revoked; terminal -> invitation_already_terminal); token_hash
--     RETAINED after revoke.
-- V7. regenerate: old active row -> revoked with the FULL audit chain, in order:
--     invitation_revoked (old id) -> invitation_regenerated (old id; metadata
--     old_invitation_id + new_invitation_id) -> invitation_created (new id;
--     metadata regenerated_from); exactly one active row remains; two distinct
--     token_hashes; old raw token unrecoverable. Expired materialization (create
--     AND regenerate) writes one invitation_expired event PER transitioned row,
--     each tied to its invitation_id.
-- V8. Concurrency: two parallel create calls for the same fresh master -> exactly
--     one active invitation (advisory lock + partial unique index).
-- V9. list/get projections contain token_prefix and NEVER token_hash/raw_token
--     (grep the returned jsonb keys).
-- V10. Rate limit: 30 creates/hour then create -> rate_limited; 60 sent+revoke/
--      hour then -> rate_limited.
-- ============================================================================
