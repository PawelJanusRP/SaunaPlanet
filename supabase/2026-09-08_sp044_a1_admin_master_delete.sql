-- ============================================================================
-- SP-044 Slice A — admin-only master profile deletion.
--
-- Product contract change:
--   * Deletion of a sauna-master profile becomes ADMIN-ONLY and flows through
--     ONE deliberate transactional RPC, admin_delete_master_profile(uuid).
--   * The direct client DELETE policy (masters_delete = admin OR moderator,
--     versioned by SP-039 M0) is REMOVED — no client role may DELETE directly;
--     the DEFINER RPC (owner, RLS-bypassing) is the only deletion path. This
--     also removes moderator deletion, matching the SP-044 admin-only decision.
--
-- Dependency strategy (verified against the live catalog, 2026-09-08):
--   CASCADE  (functional/state): master_affiliations, master_certificates,
--            master_credentials, master_moderation_notes, master_publication,
--            sauna_event_masters.
--   SET NULL (audit, preserved) : master_claim_events, master_publication_events.
--   SET NULL (historical)       : sauna_events.organizer_master_id — events
--            organized by the master SURVIVE, merely losing the organizer link.
--   master_claim_invitations was ON DELETE RESTRICT (the hard blocker). This
--            migration switches it to ON DELETE SET NULL (+ nullable master_id)
--            so invitation history SURVIVES as detached audit, consistent with
--            the other audit tables. Before the master row is removed, the RPC
--            REVOKES + NULLS token_hash on every invitation so NO usable claim
--            token can outlive the profile.
--
-- auth.users is NEVER touched: deleting the master profile removes the
-- capability, not the person's account. Master Studio access derives from
-- sauna_masters.user_id, so it stops naturally once the row is gone.
--
-- M5 guard_master_delete is extended with an ADMIN bypass (inline profiles
-- role='admin'); moderators/users keep the M5 blocks (defense in depth, though
-- the dropped policy already denies them direct DELETE).
--
-- Conventions: SECURITY DEFINER, pinned empty search_path, fully-qualified
-- references, structured jsonb {ok, code, data}, stable mapped codes only (no
-- raw PostgreSQL errors), explicit revoke/grant. New function uses CREATE (no
-- OR REPLACE) — fail loud on collision.
--
-- Companion rollback: 2026-09-08_sp044_a1_admin_master_delete_rollback.sql
-- (IRREVERSIBLE once a real admin deletion has run — invitations detached to
-- master_id NULL cannot be re-associated; see the rollback header.)
-- ============================================================================
begin;

-- Fail loud unless the live objects are EXACTLY the expected predecessors.
do $$
declare
  v_del   text;
  v_fk    "char";
  v_guard text;
  v_check text;
begin
  -- masters_delete must be the SP-039 M0 admin+moderator inline policy.
  select qual into v_del from pg_policies
   where schemaname='public' and tablename='sauna_masters' and policyname='masters_delete';
  if v_del is null then
    raise exception 'SP044-A GUARD: masters_delete policy not found; stop and review';
  end if;
  if position('admin' in v_del) = 0 or position('moderator' in v_del) = 0 then
    raise exception 'SP044-A GUARD: masters_delete is not the admin+moderator body; stop and review';
  end if;

  -- invitation FK must currently be RESTRICT.
  select confdeltype into v_fk from pg_constraint
   where conname='master_claim_invitations_master_id_fkey'
     and conrelid='public.master_claim_invitations'::regclass;
  if v_fk is null then
    raise exception 'SP044-A GUARD: invitation master_id FK not found; stop and review';
  end if;
  if v_fk <> 'r' then
    raise exception 'SP044-A GUARD: invitation FK is not RESTRICT (found %); stop and review', v_fk;
  end if;

  -- guard_master_delete must be the M5 body (no admin bypass yet).
  select prosrc into v_guard from pg_proc
   where pronamespace='public'::regnamespace and proname='guard_master_delete';
  if v_guard is null then
    raise exception 'SP044-A GUARD: guard_master_delete not found; stop and review';
  end if;
  if position('powi' in v_guard) = 0 then
    raise exception 'SP044-A GUARD: guard_master_delete is not the M5 body; stop and review';
  end if;
  if position('role = ''admin''' in v_guard) > 0 then
    raise exception 'SP044-A GUARD: guard_master_delete already has the admin bypass — SP044-A already applied?; stop and review';
  end if;

  -- mce vocabulary must be the current eight (no master_admin_deleted yet).
  select pg_get_constraintdef(oid) into v_check from pg_constraint
   where conrelid='public.master_claim_events'::regclass and conname='mce_event_type_check';
  if v_check is null or position('owner_account_deleted' in v_check) = 0 then
    raise exception 'SP044-A GUARD: mce_event_type_check is not the expected body; stop and review';
  end if;
  if position('master_admin_deleted' in v_check) > 0 then
    raise exception 'SP044-A GUARD: mce_event_type_check already has master_admin_deleted; stop and review';
  end if;

  if to_regprocedure('public.admin_delete_master_profile(uuid)') is not null then
    raise exception 'SP044-A GUARD: admin_delete_master_profile(uuid) already exists; stop and review';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Invitation FK: RESTRICT -> SET NULL (+ nullable master_id). Invitation
--    history survives detached; the RPC clears token_hash first so nothing
--    usable outlives the master.
-- ---------------------------------------------------------------------------
alter table public.master_claim_invitations
  drop constraint master_claim_invitations_master_id_fkey;
alter table public.master_claim_invitations
  alter column master_id drop not null;
alter table public.master_claim_invitations
  add constraint master_claim_invitations_master_id_fkey
  foreign key (master_id) references public.sauna_masters(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. Audit vocabulary: + master_admin_deleted.
-- ---------------------------------------------------------------------------
alter table public.master_claim_events drop constraint mce_event_type_check;
alter table public.master_claim_events add constraint mce_event_type_check
  check (event_type in (
    'profile_prepared','invitation_created','invitation_sent',
    'invitation_revoked','invitation_regenerated','invitation_expired',
    'invitation_claimed','owner_account_deleted','master_admin_deleted'));

-- ---------------------------------------------------------------------------
-- 3. guard_master_delete: admin bypass; non-admin keeps the M5 blocks.
-- ---------------------------------------------------------------------------
create or replace function public.guard_master_delete()
returns trigger as $$
begin
  -- SP-044: a platform ADMIN may delete any master profile (through the
  -- deliberate admin_delete_master_profile RPC, which detokenizes active
  -- invitations first). Moderators are NOT admins and stay blocked.
  if exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    return old;
  end if;
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

-- ---------------------------------------------------------------------------
-- 4. Remove the direct client DELETE policy — deletion flows ONLY through the
--    admin RPC below. (RLS stays enabled with no DELETE policy => client DELETE
--    is denied for every role; the DEFINER RPC bypasses RLS as owner.)
-- ---------------------------------------------------------------------------
drop policy "masters_delete" on public.sauna_masters;

-- ---------------------------------------------------------------------------
-- 5. admin_delete_master_profile — the single sanctioned deletion path.
-- ---------------------------------------------------------------------------
create function public.admin_delete_master_profile(p_master_id uuid)
returns jsonb as $$
declare
  v_uid    uuid := auth.uid();
  v_master public.sauna_masters%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;
  -- Exact admin role required — moderator is NOT enough.
  if not exists (select 1 from public.profiles where id = v_uid and role = 'admin') then
    return jsonb_build_object('ok', false, 'code', 'not_authorized');
  end if;
  if p_master_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;

  -- Same advisory-lock discipline as the claim/admin RPCs (serialize vs claim).
  perform pg_advisory_xact_lock(hashtextextended(p_master_id::text, 0));

  select * into v_master from public.sauna_masters where id = p_master_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- Kill any usable claim token BEFORE removing the master. Active invitations
  -- become terminal (revoked) with token_hash cleared; terminal rows are also
  -- stripped of any residual token. The rows themselves survive as detached
  -- audit (FK SET NULL) — no dangling usable token can outlive the profile.
  update public.master_claim_invitations
     set status = 'revoked', revoked_at = now(), revoked_by = v_uid, token_hash = null
   where master_id = p_master_id and status in ('ready','sent','opened');
  update public.master_claim_invitations
     set token_hash = null
   where master_id = p_master_id and token_hash is not null;

  -- Audit the administrative deletion. master_id is SET NULL by the FK when the
  -- master is removed below, so the identifying data is captured in metadata.
  insert into public.master_claim_events
    (master_id, event_type, actor_user_id, reason, metadata)
  values
    (p_master_id, 'master_admin_deleted', v_uid,
     'admin deleted master profile (SP-044)',
     jsonb_build_object('deleted_master_id', p_master_id, 'deleted_master_name', v_master.name));

  -- Remove the profile. FKs resolve deterministically (CASCADE functional/state;
  -- SET NULL audit/events/invitations/organizer — historical events survive).
  delete from public.sauna_masters where id = p_master_id;

  return jsonb_build_object('ok', true, 'code', 'deleted',
    'data', jsonb_build_object('master_id', p_master_id, 'name', v_master.name));
exception when others then
  -- Never leak a raw PostgreSQL error to the client.
  return jsonb_build_object('ok', false, 'code', 'unexpected_error');
end $$ language plpgsql security definer set search_path = '';

revoke all on function public.admin_delete_master_profile(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_delete_master_profile(uuid)
  to authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- POST-APPLY VERIFICATION
-- V1. admin_delete_master_profile exists; prosecdef=true; proconfig search_path="".
-- V2. Grant: authenticated EXECUTE only (no anon/public/service_role).
-- V3. masters_delete policy is GONE; direct client DELETE denied for every role.
-- V4. invitation master_id FK confdeltype='n' (SET NULL); master_id nullable.
-- V5. guard_master_delete: admin -> allowed; user/moderator -> blocked
--     (owned / invitation-history messages), each in a rolled-back tx.
-- V6. Behavior (rolled-back fixtures):
--     a) admin deletes owned+invited master -> ok/deleted; auth.users row stays;
--        invitations survive with master_id NULL and token_hash NULL;
--        master_claim_events / master_publication_events rows survive (master_id
--        NULL); sauna_events organized by it survive (organizer_master_id NULL);
--        affiliations/certificates/publication rows are gone (CASCADE).
--     b) non-admin RPC call -> not_authorized (no rows changed).
--     c) missing id -> not_found.
-- ============================================================================
