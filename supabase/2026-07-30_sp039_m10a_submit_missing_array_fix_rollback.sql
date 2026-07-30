-- ============================================================================
-- SP-039 M10a ROLLBACK — restore the ORIGINAL (defective) M10 submit body.
--
-- Exists only for protocol completeness: rolling back reintroduces the
-- 22P02 runtime error on every incomplete submit. There is no reason to
-- ever run this except to reproduce the defect.
-- ============================================================================
begin;

do $$
declare
  v_fn text;
begin
  select prosrc into v_fn from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname = 'submit_master_profile_for_publication';
  if v_fn is null or position('array_append' in v_fn) = 0 then
    raise exception 'M10a ROLLBACK GUARD: live body is not the M10a fix; stop';
  end if;
end $$;

create or replace function public.submit_master_profile_for_publication(
  p_master_id uuid
) returns jsonb as $$
declare
  v_actor   uuid := auth.uid();
  v_master  public.sauna_masters%rowtype;
  v_pub     public.master_publication%rowtype;
  v_missing text[] := '{}';
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_master_id::text, 0));

  select * into v_master from public.sauna_masters
   where id = p_master_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'master_not_found');
  end if;
  if v_master.user_id is null or v_master.user_id <> v_actor then
    return jsonb_build_object('ok', false, 'code', 'not_owner');
  end if;

  insert into public.master_publication (master_id)
  values (p_master_id)
  on conflict (master_id) do nothing;
  select * into v_pub from public.master_publication
   where master_id = p_master_id for update;

  if v_pub.publication_status = 'submitted' then
    return jsonb_build_object('ok', true, 'code', 'already_submitted');
  end if;
  if v_pub.publication_status not in ('draft','changes_requested') then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition');
  end if;

  if coalesce(btrim(v_master.name), '') = '' then
    v_missing := v_missing || 'name';
  end if;
  if coalesce(btrim(v_master.city), '') = '' then
    v_missing := v_missing || 'city';
  end if;
  if coalesce(char_length(btrim(v_master.bio)), 0) < 80 then
    v_missing := v_missing || 'bio';
  end if;
  if coalesce(btrim(v_master.avatar_url), '') = '' then
    v_missing := v_missing || 'avatar';
  end if;
  if v_master.specialties is null or cardinality(v_master.specialties) < 1 then
    v_missing := v_missing || 'specialties';
  end if;
  if cardinality(v_missing) > 0 then
    return jsonb_build_object('ok', false, 'code', 'profile_incomplete',
      'data', jsonb_build_object('missing', to_jsonb(v_missing)));
  end if;

  update public.master_publication
     set publication_status = 'submitted',
         submitted_at = now(),
         updated_at = now()
   where master_id = p_master_id;

  insert into public.master_publication_events
    (master_id, event_type, actor_user_id)
  values (p_master_id, 'profile_submitted', v_actor);

  return jsonb_build_object('ok', true, 'code', 'submitted',
    'data', jsonb_build_object('publication_status', 'submitted'));
end $$ language plpgsql security definer set search_path = '';

commit;

notify pgrst, 'reload schema';
