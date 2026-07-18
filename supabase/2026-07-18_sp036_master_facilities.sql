-- ============================================================================
-- SP-036 — MASTER-CONTRIBUTED FACILITIES & EVENTS: DATABASE MIGRATION
-- ============================================================================
-- STATUS: PREPARED, NOT APPROVED FOR EXECUTION.
-- Prerequisites, in order:
--   1. Run supabase/2026-07-18_sp036_step0_audit.sql and SAVE the output
--      (it is the rollback baseline).
--   2. Reconcile this script with the audit findings — in particular any
--      CHECK constraint on saunas.status / sauna_events.status (§3 of the
--      audit) and the actual policy names on storage.objects and
--      pts_import_log.
--   3. Paweł approves and applies manually in the SQL Editor.
--
-- Design reference: docs/SP036_ARCHITECTURE.md (rev 3). Fully additive for
-- data (new columns/tables only, no drops, no rewrites); policies on
-- saunas / sauna_events / sauna_photos / pts_import_log are REPLACED with
-- deterministic sets (SP-035 DO-block pattern) — the audit output records
-- what they replace.
--
-- Verified live facts this script relies on (PostgREST audit 2026-07-18):
--   * saunas: 215 rows, all status='active'; no created_by column
--   * sauna_events: 10 rows, all 'active'; single event_date column;
--     has source_url, max_participants; no organizer/created_by columns
--   * sauna_photos: columns id, sauna_id, image_url, created_at only
--   * sauna_managers: columns id, user_id, sauna_id, status, created_at
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------------
-- pg_trgm: duplicate WARNINGS only (Paweł 2026-07-18) — nothing may
-- auto-reject/merge/modify a submission based on similarity.
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- 2. Columns (additive; defaults chosen so existing rows stay valid)
-- ---------------------------------------------------------------------------
alter table public.saunas
  add column if not exists created_by uuid
    references auth.users(id) on delete set null;
alter table public.saunas
  alter column created_by set default auth.uid();
comment on column public.saunas.created_by is
  'Submitter, audit only — NEVER an authorization source (SP-036).';

alter table public.sauna_events
  add column if not exists created_by uuid
    references auth.users(id) on delete set null,
  add column if not exists organizer_master_id uuid
    references public.sauna_masters(id) on delete set null,
  add column if not exists bundled_with_submission boolean not null default false;
alter table public.sauna_events
  alter column created_by set default auth.uid();
comment on column public.sauna_events.organizer_master_id is
  'NULL = facility event (pre-SP-036 model); set = master-published event.';
comment on column public.sauna_events.bundled_with_submission is
  'TRUE only for events created together with the organizer''s own facility
   submission (path B''). Deterministic marker required by the SP-036 brief —
   facility approval activates ONLY these, never ordinary pending events.';

alter table public.sauna_photos
  add column if not exists source text not null default 'user',
  add column if not exists source_url text,
  add column if not exists created_by uuid
    references auth.users(id) on delete set null;
alter table public.sauna_photos
  alter column created_by set default auth.uid();
do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname = 'sauna_photos_source_check') then
    alter table public.sauna_photos
      add constraint sauna_photos_source_check
      check (source in ('user', 'imported'));
  end if;
end $$;
comment on column public.sauna_photos.created_by is
  'Uploader identity for auditability and future image moderation (SP-036).
   NULL on rows uploaded before SP-036 — historically unattributable.';

create index if not exists saunas_created_by_idx
  on public.saunas (created_by) where created_by is not null;
create index if not exists sauna_events_organizer_idx
  on public.sauna_events (organizer_master_id)
  where organizer_master_id is not null;
create index if not exists saunas_name_trgm_idx
  on public.saunas using gin (lower(name) gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 3. import_log — URL-assisted submission audit trail (IMPORTS.md rules)
-- ---------------------------------------------------------------------------
create table if not exists public.import_log (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null
    default auth.uid(),
  source_kind text not null check (source_kind in
    ('facebook_page','facebook_event','instagram','website','other')),
  url text not null,
  result text not null check (result in ('ok','partial','failed','blocked')),
  extracted jsonb,
  created_at timestamptz not null default now()
);
alter table public.import_log enable row level security;

drop policy if exists import_log_select on public.import_log;
create policy import_log_select on public.import_log
  for select using (requested_by = auth.uid() or public.is_platform_moderator());
drop policy if exists import_log_insert on public.import_log;
create policy import_log_insert on public.import_log
  for insert with check (requested_by = auth.uid());
-- no UPDATE/DELETE policies: append-only audit trail

-- ---------------------------------------------------------------------------
-- 4. Helper functions
-- ---------------------------------------------------------------------------
create or replace function public.is_sauna_managed(target_sauna_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.sauna_managers
    where sauna_id = target_sauna_id and status = 'approved'
  )
$$ language sql security definer stable set search_path = public;

-- is_master_owner (SP-035) + verification state, checked at call time
create or replace function public.is_verified_master_owner(target_master_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.sauna_masters
    where id = target_master_id
      and user_id is not null
      and user_id = auth.uid()
      and status = 'approved'
  )
$$ language sql security definer stable set search_path = public;

revoke all on function public.is_sauna_managed(uuid) from public, anon;
revoke all on function public.is_verified_master_owner(uuid) from public, anon;
grant execute on function public.is_sauna_managed(uuid) to authenticated;
grant execute on function public.is_verified_master_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Duplicate detection RPC (warn-only; SECURITY DEFINER hardening per
--    Paweł 2026-07-18: safe search_path, authenticated-only execution,
--    minimal disclosure for other users' pending rows, capped results,
--    static SQL so no data can leak through error messages)
-- ---------------------------------------------------------------------------
create or replace function public.find_similar_saunas(
  p_name text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_website text default null,
  p_phone text default null,
  p_facebook_url text default null
)
returns table (
  id uuid, name text, city text, status text,
  distance_m double precision, match_reasons text[]
)
language sql stable security definer
set search_path = public
as $$
  with params as (
    select
      nullif(trim(p_name), '') as q_name,
      nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '') as q_phone,
      nullif(lower(regexp_replace(regexp_replace(coalesce(p_website, ''),
        '^https?://(www\.)?', ''), '/+$', '')), '') as q_site,
      nullif(lower(regexp_replace(regexp_replace(coalesce(p_facebook_url, ''),
        '^https?://(www\.)?', ''), '/+$', '')), '') as q_fb
  ),
  scored as (
    select s.id, s.name, s.city, s.status,
      case when p_lat is not null and p_lng is not null
                and s.latitude is not null and s.longitude is not null
        then st_distance(
          st_makepoint(s.longitude, s.latitude)::geography,
          st_makepoint(p_lng, p_lat)::geography)
      end as distance_m,
      array_remove(array[
        case when p.q_name is not null
                  and similarity(lower(s.name), lower(p.q_name)) > 0.35
             then 'name' end,
        case when p_lat is not null and p_lng is not null
                  and s.latitude is not null and s.longitude is not null
                  and st_dwithin(
                    st_makepoint(s.longitude, s.latitude)::geography,
                    st_makepoint(p_lng, p_lat)::geography, 500)
             then 'location' end,
        case when p.q_site is not null and s.website is not null
                  and lower(regexp_replace(regexp_replace(s.website,
                    '^https?://(www\.)?', ''), '/+$', '')) = p.q_site
             then 'website' end,
        case when (p.q_fb is not null or p.q_site is not null)
                  and s.source_url is not null
                  and lower(regexp_replace(regexp_replace(s.source_url,
                    '^https?://(www\.)?', ''), '/+$', ''))
                    in (p.q_fb, p.q_site)
             then 'source_url' end,
        case when p.q_phone is not null and s.phone is not null
                  and regexp_replace(s.phone, '\D', '', 'g') = p.q_phone
             then 'phone' end
      ], null) as match_reasons
    from public.saunas s
    cross join params p
    where auth.uid() is not null
      and s.status in ('active', 'pending')
  )
  select id, name, city, status, distance_m, match_reasons
  from scored
  where array_length(match_reasons, 1) > 0
  order by array_length(match_reasons, 1) desc, distance_m asc nulls last
  limit 10;
$$;
-- Minimal disclosure: only name/city/status/distance leave this function —
-- no address, no contact data, no submitter identity, regardless of the
-- caller's RLS view. Warn-only by contract: callers must never use this to
-- block or mutate anything automatically.
revoke all on function public.find_similar_saunas(
  text, double precision, double precision, text, text, text)
  from public, anon;
grant execute on function public.find_similar_saunas(
  text, double precision, double precision, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 6. saunas — deterministic policy replacement + guard trigger + cap
-- ---------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'saunas'
  loop
    execute format('drop policy %I on public.saunas', pol.policyname);
  end loop;
end $$;

create policy saunas_select on public.saunas
  for select using (
    status = 'active'
    or created_by = auth.uid()
    or public.is_platform_moderator()
  );
create policy saunas_insert on public.saunas
  for insert with check (
    public.is_platform_moderator()
    or (auth.uid() is not null
        and status = 'pending'
        and created_by = auth.uid()
        and pts_id is null
        and pts_certified is not true)
  );
create policy saunas_update on public.saunas
  for update
  using (
    public.is_platform_moderator()
    or (created_by = auth.uid() and status = 'pending')
  )
  with check (
    public.is_platform_moderator()
    or (created_by = auth.uid() and status = 'pending')
  );
create policy saunas_delete on public.saunas
  for delete using (public.is_admin());

-- Column-level guard: submitter edits content, never status/authorship/PTS.
create or replace function public.guard_sauna_columns()
returns trigger as $$
begin
  if public.is_platform_moderator() then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.created_by is distinct from old.created_by
     or new.pts_id is distinct from old.pts_id
     or new.pts_certified is distinct from old.pts_certified
     or new.pts_type is distinct from old.pts_type
  then
    raise exception 'Status, autorstwo i pola PTS zmienia tylko moderacja';
  end if;
  return new;
end $$ language plpgsql security definer set search_path = public;

drop trigger if exists saunas_guard on public.saunas;
create trigger saunas_guard
  before update on public.saunas
  for each row execute function public.guard_sauna_columns();

-- Anti-abuse cap (Paweł 2026-07-18): max 5 open submissions per user,
-- enforced at the database boundary; moderation exempt. The server action
-- performs the same check first for a friendly error.
create or replace function public.guard_sauna_submission_cap()
returns trigger as $$
begin
  if public.is_platform_moderator() then
    return new;
  end if;
  if (select count(*) from public.saunas
      where created_by = auth.uid() and status = 'pending') >= 5 then
    raise exception
      'Masz już 5 zgłoszeń oczekujących na moderację — poczekaj na ich rozpatrzenie';
  end if;
  return new;
end $$ language plpgsql security definer set search_path = public;

drop trigger if exists saunas_submission_cap on public.saunas;
create trigger saunas_submission_cap
  before insert on public.saunas
  for each row execute function public.guard_sauna_submission_cap();

-- ---------------------------------------------------------------------------
-- 7. sauna_events — deterministic policy replacement + guard trigger
--    (replaces both the pre-SP-034 admin set and the SP-034 staff set with
--    one deterministic superset: admin + staff + master paths A/B/C/B')
-- ---------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'sauna_events'
  loop
    execute format('drop policy %I on public.sauna_events', pol.policyname);
  end loop;
end $$;

create policy events_select on public.sauna_events
  for select using (true);
  -- unchanged openness: public queries filter status='active'; pending
  -- proposal metadata is not sensitive (same stance as pre-SP-036 admin
  -- moderation queue). Revisit if proposals ever carry private data.

create policy events_insert_admin on public.sauna_events
  for insert with check (public.is_admin());
create policy events_insert_staff on public.sauna_events
  for insert with check (public.is_sauna_staff(sauna_id));
create policy events_insert_master on public.sauna_events
  for insert with check (
    organizer_master_id is not null
    and public.is_verified_master_owner(organizer_master_id)
    and created_by = auth.uid()
    and (
      -- paths B/C: approved facility, routing decided by management state
      (bundled_with_submission = false
       and exists (select 1 from public.saunas s
                   where s.id = sauna_id and s.status = 'active')
       and ((not public.is_sauna_managed(sauna_id) and status = 'active')
            or (public.is_sauna_managed(sauna_id) and status = 'pending')))
      -- path B': bundled with the caller's OWN pending facility submission
      or
      (bundled_with_submission = true
       and status = 'pending'
       and exists (select 1 from public.saunas s
                   where s.id = sauna_id
                     and s.status = 'pending'
                     and s.created_by = auth.uid()))
    )
  );

create policy events_update_admin on public.sauna_events
  for update using (public.is_admin()) with check (public.is_admin());
create policy events_update_staff on public.sauna_events
  for update using (public.is_sauna_staff(sauna_id))
  with check (public.is_sauna_staff(sauna_id));
create policy events_update_master on public.sauna_events
  for update
  using (organizer_master_id is not null
         and public.is_verified_master_owner(organizer_master_id))
  with check (organizer_master_id is not null
              and public.is_verified_master_owner(organizer_master_id));

create policy events_delete_admin on public.sauna_events
  for delete using (public.is_admin());
create policy events_delete_staff on public.sauna_events
  for delete using (public.is_sauna_staff(sauna_id));
create policy events_delete_master on public.sauna_events
  for delete using (organizer_master_id is not null
                    and public.is_verified_master_owner(organizer_master_id));

-- Guard: organizers cannot self-publish or rewrite provenance. Moderation
-- unrestricted; facility staff manage status freely (existing behavior);
-- everyone else (i.e. organizer masters) may edit content but not touch
-- status, provenance or the bundled marker.
create or replace function public.guard_event_columns()
returns trigger as $$
begin
  if public.is_platform_moderator() then
    return new;
  end if;
  if new.created_by is distinct from old.created_by
     or new.organizer_master_id is distinct from old.organizer_master_id
     or new.sauna_id is distinct from old.sauna_id
     or new.bundled_with_submission is distinct from old.bundled_with_submission
  then
    raise exception 'Pochodzenia eventu nie można zmieniać';
  end if;
  if new.status is distinct from old.status
     and not public.is_sauna_staff(old.sauna_id) then
    raise exception 'Status eventu zmienia obsada obiektu lub moderacja';
  end if;
  return new;
end $$ language plpgsql security definer set search_path = public;

drop trigger if exists sauna_events_guard on public.sauna_events;
create trigger sauna_events_guard
  before update on public.sauna_events
  for each row execute function public.guard_event_columns();

-- ---------------------------------------------------------------------------
-- 8. Facility approval — moderation-only RPC. Approves the facility and
--    activates ONLY its bundled events (deterministic marker), re-verifying
--    at approval time that the organizer is still an approved master and
--    the event has not expired (Paweł 2026-07-18). Ordinary pending events
--    (path C proposals) are NEVER touched by facility approval.
-- ---------------------------------------------------------------------------
create or replace function public.approve_facility_submission(target_sauna_id uuid)
returns jsonb as $$
declare
  activated integer;
begin
  if not public.is_platform_moderator() then
    raise exception 'Zgłoszenia obiektów zatwierdza tylko moderacja';
  end if;

  update public.saunas
    set status = 'active'
    where id = target_sauna_id and status = 'pending';
  if not found then
    raise exception 'Obiekt nie istnieje albo nie oczekuje na moderację';
  end if;

  update public.sauna_events e
    set status = 'active'
    where e.sauna_id = target_sauna_id
      and e.bundled_with_submission = true
      and e.status = 'pending'
      and e.event_date >= current_date
      and exists (select 1 from public.sauna_masters m
                  where m.id = e.organizer_master_id
                    and m.status = 'approved');
  get diagnostics activated = row_count;

  return jsonb_build_object('activated_events', activated);
end $$ language plpgsql security definer set search_path = public;

revoke all on function public.approve_facility_submission(uuid) from public, anon;
grant execute on function public.approve_facility_submission(uuid) to authenticated;

-- Imported preview photo attach — server-action entry point. RLS keeps
-- source='imported' unreachable from plain client inserts; this DEFINER
-- function is the only path, and it verifies the caller owns the pending
-- submission (or is moderation).
create or replace function public.attach_imported_photo(
  target_sauna_id uuid, p_image_url text, p_source_url text
) returns uuid as $$
declare new_id uuid;
begin
  if not (public.is_platform_moderator()
          or exists (select 1 from public.saunas s
                     where s.id = target_sauna_id
                       and s.status = 'pending'
                       and s.created_by = auth.uid())) then
    raise exception 'Obraz importowany można dodać tylko do własnego zgłoszenia';
  end if;
  insert into public.sauna_photos (sauna_id, image_url, source, source_url, created_by)
    values (target_sauna_id, p_image_url, 'imported', p_source_url, auth.uid())
    returning id into new_id;
  return new_id;
end $$ language plpgsql security definer set search_path = public;

revoke all on function public.attach_imported_photo(uuid, text, text) from public, anon;
grant execute on function public.attach_imported_photo(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. sauna_photos — deterministic policy replacement
-- ---------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'sauna_photos'
  loop
    execute format('drop policy %I on public.sauna_photos', pol.policyname);
  end loop;
end $$;

create policy photos_select on public.sauna_photos
  for select using (true);
create policy photos_insert on public.sauna_photos
  for insert with check (
    public.is_platform_moderator()
    or public.is_sauna_staff(sauna_id)
    or (auth.uid() is not null
        and source = 'user'
        and source_url is null
        and created_by = auth.uid()
        and exists (select 1 from public.saunas s
                    where s.id = sauna_id
                      and (s.status = 'active'
                           or (s.status = 'pending'
                               and s.created_by = auth.uid()))))
  );
create policy photos_delete on public.sauna_photos
  for delete using (
    public.is_platform_moderator() or public.is_sauna_staff(sauna_id)
  );
-- no UPDATE policy: photos are replaced (insert + delete), not edited

-- ---------------------------------------------------------------------------
-- 10. pts_import_log — close the anon-read leak found in the 2026-07-18
--     PostgREST audit (import telemetry is moderation-only)
-- ---------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'pts_import_log'
  loop
    execute format('drop policy %I on public.pts_import_log', pol.policyname);
  end loop;
end $$;
alter table public.pts_import_log enable row level security;
create policy pts_import_log_select on public.pts_import_log
  for select using (public.is_platform_moderator());

-- ---------------------------------------------------------------------------
-- 11. Storage: sauna-images — remove anonymous upload, require auth.
--     NOTE: policy names below come from the repo history; reconcile with
--     the step-0 audit output (storage.objects section) before applying.
-- ---------------------------------------------------------------------------
drop policy if exists "Allow anon insert sauna images MVP" on storage.objects;
create policy "sauna_images_insert_authenticated" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sauna-images');
-- public read stays as-is ("Allow public read sauna images MVP")

commit;

-- ============================================================================
-- POST-APPLY VERIFICATION (read-only, run after the migration)
-- ============================================================================
-- 1. select count(*) from public.saunas;              -- unchanged (215)
-- 2. As anon (PostgREST): saunas?status=eq.pending → 0 rows even after a
--    test submission exists.
-- 3. As a regular user: INSERT saunas with status='active' → must FAIL;
--    with status='pending' → must succeed; 6th pending insert → must FAIL.
-- 4. As a verified master: event INSERT at a managed sauna with
--    status='active' → must FAIL; with 'pending' → succeed.
-- 5. As the organizer master: UPDATE own pending event status → must FAIL.
-- 6. select public.find_similar_saunas('Termy', 52.4, 16.9) as anon → must
--    FAIL (no execute grant); as authenticated → rows with minimal fields.
-- 7. As anon (PostgREST): pts_import_log → 0 rows / 401.
--
-- ============================================================================
-- ROLLBACK / RECOVERY
-- ============================================================================
-- * Policies + triggers + functions: drop the objects created above and
--   re-create the policy set recorded by the step-0 audit output (the saved
--   pg_policies snapshot is the authoritative baseline).
-- * New columns and import_log are additive and inert if unused — they can
--   remain in place during a rollback (no data loss either way).
-- * No existing row is modified by this migration; the only behavioral
--   changes are policy-level. Reverting policies restores pre-SP-036
--   behavior exactly, including its known holes.
-- ============================================================================
