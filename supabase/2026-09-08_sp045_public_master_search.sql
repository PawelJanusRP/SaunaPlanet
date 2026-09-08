-- ============================================================================
-- SP-045 — public master search boundary (map-native unified search).
--
-- Two READ-ONLY, SECURITY DEFINER RPCs that expose ONLY publicly-visible sauna
-- masters and their public upcoming events for the map's unified search. They
-- exist because a direct RLS SELECT is NOT safe for public discovery: a
-- moderator/admin caller would see their own/unpublished rows via masters_select
-- and leak them into "public" search. These RPCs apply the SP-039/SP-044
-- boundary is_master_publicly_visible() for EVERY caller — public discovery, not
-- an administration surface.
--
-- SP-044 PRIVACY CONTRACT (hard): the projection is allow-listed to the
-- effective PUBLIC identity only. sauna_masters.name is already the public
-- display name (pseudonym when show_nickname_only). These functions NEVER read
-- or return public.master_private_identity, user_id, moderation notes, claim
-- data or publication notes.
--
-- Conventions: STABLE SECURITY DEFINER, pinned empty search_path, fully-qualified
-- refs, bounded limits, ILIKE with escaped wildcards, explicit revoke/grant.
--
-- Companion rollback: 2026-09-08_sp045_public_master_search_rollback.sql
-- NOT applied to Production during SP-045 (frontend/UX branch).
-- ============================================================================
begin;

do $$
begin
  if to_regprocedure('public.search_public_masters(text,integer)') is not null then
    raise exception 'SP045 GUARD: search_public_masters already exists; stop and review';
  end if;
  if to_regprocedure('public.get_public_master_upcoming_events(uuid,integer)') is not null then
    raise exception 'SP045 GUARD: get_public_master_upcoming_events already exists; stop and review';
  end if;
  if to_regprocedure('public.is_master_publicly_visible(uuid)') is null then
    raise exception 'SP045 GUARD: is_master_publicly_visible(uuid) missing (SP-039 M9 predecessor); stop';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. search_public_masters — allow-listed public projection, public boundary.
-- ---------------------------------------------------------------------------
create function public.search_public_masters(p_query text, p_limit integer default 20)
returns table (
  id          uuid,
  slug        text,
  name        text,   -- effective PUBLIC display name (pseudonym when private)
  avatar_url  text,
  city        text,
  bio         text,
  specialties text[]
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q   text := btrim(coalesce(p_query, ''));
  v_pat text;
  v_lim integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  -- On-demand only: never dump the corpus for a blank/1-char query.
  if char_length(v_q) < 2 then
    return;
  end if;
  -- Escape ILIKE wildcards so user input cannot inject pattern metacharacters.
  v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
    select m.id, m.slug, m.name, m.avatar_url, m.city, m.bio, m.specialties
    from public.sauna_masters m
    where public.is_master_publicly_visible(m.id)
      and (
        m.name ilike v_pat
        or coalesce(m.city, '') ilike v_pat
        or exists (
          select 1 from unnest(coalesce(m.specialties, '{}'::text[])) sp
          where sp ilike v_pat
        )
      )
    order by (m.name ilike (replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%')) desc,
             m.name asc
    limit v_lim;
end $$;

-- ---------------------------------------------------------------------------
-- 2. get_public_master_upcoming_events — public events of a public master.
--    Only ACTIVE, future events where the master is the organizer or an
--    APPROVED participant; sauna name + coordinates for the map jump.
-- ---------------------------------------------------------------------------
create function public.get_public_master_upcoming_events(p_master_id uuid, p_limit integer default 5)
returns table (
  event_id   uuid,
  title      text,
  event_date timestamptz,
  event_time time,
  sauna_id   uuid,
  sauna_name text,
  latitude   double precision,
  longitude  double precision
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.title, e.event_date, e.event_time, s.id, s.name, s.latitude, s.longitude
  from public.sauna_events e
  join public.saunas s on s.id = e.sauna_id
  where e.status = 'active'
    and e.event_date >= current_date
    and public.is_master_publicly_visible(p_master_id)
    and (
      e.organizer_master_id = p_master_id
      or exists (
        select 1 from public.sauna_event_masters sem
        where sem.event_id = e.id
          and sem.master_id = p_master_id
          and sem.status = 'approved'
      )
    )
  order by e.event_date asc
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
$$;

-- ---------------------------------------------------------------------------
-- Privileges: both are public read-only discovery (anon + authenticated).
-- ---------------------------------------------------------------------------
revoke all on function public.search_public_masters(text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.search_public_masters(text, integer)
  to anon, authenticated;

revoke all on function public.get_public_master_upcoming_events(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_master_upcoming_events(uuid, integer)
  to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- POST-APPLY VERIFICATION
-- V1. Both functions STABLE SECURITY DEFINER, proconfig search_path="".
-- V2. EXECUTE = anon + authenticated only.
-- V3. search: returns only publicly-visible masters (never a pending/draft or
--     unpublished master, even as moderator); blank/1-char -> 0 rows; projection
--     has NO user_id / full_name / notes.
-- V4. A pseudonym-only master returns its pseudonym in name; the real name never
--     appears (source is sauna_masters.name, not master_private_identity).
-- V5. events: only active future events where the master organizes or is an
--     approved participant; returns sauna name + coordinates only.
-- ============================================================================
