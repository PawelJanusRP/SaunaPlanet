-- ============================================================================
-- ROLLBACK — SP-044 Slice B (claim auto-publish).
--
-- Restores the SP-039 M7 claim RPC and privileged-columns guard (no status
-- carve-out, no auto-publication). WARNING: master_publication rows already
-- flipped to 'published' by an auto-published claim are NOT reverted here — a
-- claimed+approved profile stays public (its audit shows claim_auto_published).
-- To fully hide such a profile use the M10 unpublish/suspend RPC. The mpe
-- vocabulary revert is skipped if any claim_auto_published event exists (audit).
-- ============================================================================
begin;

-- Restore the M7 guard body (user_id claim arm only; NO status carve-out).
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

-- Restore the M7 claim RPC body (link user_id only; no approval/publication).
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
  select * into v_inv from public.master_claim_invitations where id = v_inv.id for update;

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

  select * into v_master from public.sauna_masters where id = v_inv.master_id for update;
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

  begin
    update public.master_claim_invitations
       set status = 'claimed', claimed_at = now(), claimed_by = v_uid
     where id = v_inv.id;
    update public.sauna_masters set user_id = v_uid where id = v_master.id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'user_already_master');
  end;

  insert into public.master_claim_events
    (invitation_id, master_id, event_type, actor_user_id, metadata)
  values
    (v_inv.id, v_master.id, 'invitation_claimed', v_uid,
     jsonb_build_object('token_prefix', v_inv.token_prefix));

  return jsonb_build_object('ok', true, 'code', 'claimed', 'data', jsonb_build_object(
    'master_id', v_master.id, 'master_name', v_master.name));
end $$ language plpgsql security definer set search_path = '';

revoke all on function public.public_claim_master_profile(text)
  from public, anon, authenticated, service_role;
grant execute on function public.public_claim_master_profile(text) to authenticated;

-- Revert mpe vocabulary only if unused.
do $$
begin
  if exists (select 1 from public.master_publication_events where event_type = 'claim_auto_published') then
    raise notice 'SP044-B ROLLBACK: claim_auto_published events exist — leaving mpe_event_type_check as-is (audit).';
  else
    alter table public.master_publication_events drop constraint mpe_event_type_check;
    alter table public.master_publication_events add constraint mpe_event_type_check
      check (event_type in (
        'legacy_publication_granted','profile_submitted','changes_requested',
        'publication_approved','profile_unpublished','profile_suspended',
        'owner_publication_withdrawn','submission_withdrawn','publication_restored',
        'publication_demoted'));
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
