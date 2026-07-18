-- ============================================================================
-- SP-036 — MASTER-CONTRIBUTED FACILITIES & EVENTS: DATABASE MIGRATION
-- Revision 2 — RECONCILED with the 2026-07-18 production baseline
-- (output of 2026-07-18_sp036_step0_audit.sql, PostgreSQL 17.6).
-- ============================================================================
-- STATUS: PREPARED, AWAITING APPROVAL. Not executed.
-- Reconciled facts this revision incorporates:
--   * saunas.status / sauna_events.status have NO CHECK constraints —
--     'pending' / 'rejected' values need no constraint change.
--   * sauna_events.event_date is timestamptz (not date); status is NULLABLE
--     with default 'active'.
--   * PostGIS 3.3.7 lives in schema `public`; pg_trgm is NOT installed —
--     this migration installs it into schema `extensions`.
--   * Live storage policy names: "Allow anon upload sauna images MVP",
--     "anon can upload to master-avatars".
--   * sauna_submissions census: exactly 1 row (approved), 0 pending, no FK
--     dependents — nothing to migrate; freeze-in-place is safe.
--   * The full replaced-policy inventory is recorded in the audit output
--     and reproduced in 2026-07-18_sp036_rollback.sql.
--
-- All functions introduced here are SECURITY DEFINER with
-- `set search_path = ''` and fully qualified references (review point 2).
--
-- EXISTING-ROW EFFECTS (review point 3) — full disclosure, no UPDATE/DELETE
-- of any row is performed, but two ADD COLUMN defaults assign an effective
-- historical value:
--   * sauna_photos.source = 'user' for all pre-SP-036 photos (accurate:
--     they were community uploads; imported ones did not exist yet),
--   * sauna_events.bundled_with_submission = false for all 10 existing
--     events (accurate: the mechanism did not exist),
--   * all created_by columns stay NULL on existing rows (no authorship is
--     claimed retroactively).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Extensions. pg_trgm goes to `extensions` (Supabase convention); all
--    references below are qualified as extensions.similarity /
--    extensions.gin_trgm_ops. PostGIS is already installed in `public`.
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- 2. Columns (additive)
-- ---------------------------------------------------------------------------
alter table public.saunas
  add column if not exists created_by uuid
    references auth.users(id) on delete set null;
alter table public.saunas
  alter column created_by set default auth.uid();
comment on column public.saunas.created_by is
  'Submitter, audit only — NEVER an authorization source. The default is a
   convenience, not a control: RLS WITH CHECK independently requires
   created_by = auth.uid() for non-moderation inserts, and saunas_guard
   makes it immutable afterwards (SP-036).';

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
   submission (path B''). Deterministic marker: facility approval activates
   ONLY these, never ordinary pending events. Immutable via trigger.';

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
   NULL on pre-SP-036 rows — historically unattributable; such rows are
   deliberately NOT user-deletable (only staff/moderation).';

create index if not exists saunas_created_by_idx
  on public.saunas (created_by) where created_by is not null;
create index if not exists sauna_events_organizer_idx
  on public.sauna_events (organizer_master_id)
  where organizer_master_id is not null;
create index if not exists saunas_name_trgm_idx
  on public.saunas using gin ((lower(name)) extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 3. import_log — URL-assisted submission audit trail
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
-- 4. Helper functions (SECURITY DEFINER, empty search_path, fully qualified)
-- ---------------------------------------------------------------------------
create or replace function public.is_sauna_managed(target_sauna_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.sauna_managers
    where sauna_id = target_sauna_id and status = 'approved'
  )
$$ language sql security definer stable set search_path = '';

create or replace function public.is_verified_master_owner(target_master_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.sauna_masters
    where id = target_master_id
      and user_id is not null
      and user_id = auth.uid()
      and status = 'approved'
  )
$$ language sql security definer stable set search_path = '';

revoke all on function public.is_sauna_managed(uuid) from public, anon;
revoke all on function public.is_verified_master_owner(uuid) from public, anon;
grant execute on function public.is_sauna_managed(uuid) to authenticated;
grant execute on function public.is_verified_master_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Duplicate detection RPC — warn-only by contract (similarity must never
--    auto-reject/merge/modify). SECURITY DEFINER hardening: empty
--    search_path, authenticated-only execution, minimal disclosure
--    (name/city/status/distance/reasons only), 10-row cap, static SQL.
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
set search_path = ''
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
        then public.st_distance(
          public.st_makepoint(s.longitude, s.latitude)::public.geography,
          public.st_makepoint(p_lng, p_lat)::public.geography)
      end as distance_m,
      array_remove(array[
        case when p.q_name is not null
                  and extensions.similarity(lower(s.name), lower(p.q_name)) > 0.35
             then 'name' end,
        case when p_lat is not null and p_lng is not null
                  and s.latitude is not null and s.longitude is not null
                  and public.st_dwithin(
                    public.st_makepoint(s.longitude, s.latitude)::public.geography,
                    public.st_makepoint(p_lng, p_lat)::public.geography, 500)
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
revoke all on function public.find_similar_saunas(
  text, double precision, double precision, text, text, text)
  from public, anon;
grant execute on function public.find_similar_saunas(
  text, double precision, double precision, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 6. saunas — deterministic policy replacement + guards
--    Replaces (baseline, see rollback script): saunas_select,
--    "Allow public read saunas", saunas_insert, "Allow anon insert saunas
--    MVP" (INSERT true), saunas_update, "Allow anon update saunas MVP"
--    (UPDATE true — anyone could modify any facility; closed here),
--    saunas_delete.
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
end $$ language plpgsql security definer set search_path = '';

drop trigger if exists saunas_guard on public.saunas;
create trigger saunas_guard
  before update on public.saunas
  for each row execute function public.guard_sauna_columns();

-- Anti-abuse cap: max 5 open submissions per user, race-hardened with a
-- per-user transaction-scoped advisory lock (review point 6): two
-- concurrent inserts by the same user serialize on the lock, so the count
-- cannot be read stale. Cross-user contention: none (per-user key).
create or replace function public.guard_sauna_submission_cap()
returns trigger as $$
begin
  if public.is_platform_moderator() then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sp036_sauna_cap:' || auth.uid()::text, 0));
  if (select count(*) from public.saunas
      where created_by = auth.uid() and status = 'pending') >= 5 then
    raise exception
      'Masz już 5 zgłoszeń oczekujących na moderację — poczekaj na ich rozpatrzenie';
  end if;
  return new;
end $$ language plpgsql security definer set search_path = '';

drop trigger if exists saunas_submission_cap on public.saunas;
create trigger saunas_submission_cap
  before insert on public.saunas
  for each row execute function public.guard_sauna_submission_cap();

-- ---------------------------------------------------------------------------
-- 7. sauna_events — deterministic policy replacement + guard
--    Replaces (baseline): events_select, "Allow public read sauna events",
--    events_insert, events_insert_staff, "Allow anon insert sauna events
--    MVP" (INSERT true — anonymous event creation; closed here),
--    events_update, events_update_staff, events_delete, events_delete_staff.
--    Note: sauna_events.status is nullable — every non-moderation arm pins
--    an explicit non-null status.
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
      (bundled_with_submission = false
       and exists (select 1 from public.saunas s
                   where s.id = sauna_id and s.status = 'active')
       and ((not public.is_sauna_managed(sauna_id) and status = 'active')
            or (public.is_sauna_managed(sauna_id) and status = 'pending')))
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
end $$ language plpgsql security definer set search_path = '';

drop trigger if exists sauna_events_guard on public.sauna_events;
create trigger sauna_events_guard
  before update on public.sauna_events
  for each row execute function public.guard_event_columns();

-- ---------------------------------------------------------------------------
-- 8. Moderation RPCs
-- ---------------------------------------------------------------------------
-- approve_facility_submission — TRANSACTION / FAILURE SEMANTICS (point 5):
--   * raises ONLY when (a) the caller is not moderation, or (b) the target
--     is not a pending facility. Nothing else can fail the call.
--   * Ineligible bundled events (expired, or organizer no longer an
--     approved master) NEVER cause an error or rollback — they are simply
--     not selected by the activation UPDATE and remain 'pending',
--     deterministically reported in the return value as skipped_event_ids.
--   * The function body is atomic: facility approval and bundled-event
--     activation commit or roll back together with the caller's
--     transaction.
--   * "Not expired" = event_date >= start of the current day (server TZ) —
--     today's events still activate.
create or replace function public.approve_facility_submission(target_sauna_id uuid)
returns jsonb as $$
declare
  v_activated uuid[];
  v_skipped uuid[];
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

  with activated as (
    update public.sauna_events e
      set status = 'active'
      where e.sauna_id = target_sauna_id
        and e.bundled_with_submission = true
        and e.status = 'pending'
        and e.event_date >= pg_catalog.date_trunc('day', pg_catalog.now())
        and exists (select 1 from public.sauna_masters m
                    where m.id = e.organizer_master_id
                      and m.status = 'approved')
      returning e.id
  )
  select coalesce(array_agg(id), '{}') into v_activated from activated;

  select coalesce(array_agg(e.id), '{}') into v_skipped
  from public.sauna_events e
  where e.sauna_id = target_sauna_id
    and e.bundled_with_submission = true
    and e.status = 'pending';

  return jsonb_build_object(
    'activated_event_ids', pg_catalog.to_jsonb(v_activated),
    'skipped_event_ids', pg_catalog.to_jsonb(v_skipped));
end $$ language plpgsql security definer set search_path = '';

revoke all on function public.approve_facility_submission(uuid) from public, anon;
grant execute on function public.approve_facility_submission(uuid) to authenticated;

-- attach_imported_photo — FAILURE SEMANTICS: raises only when the caller
-- neither owns the pending submission nor is moderation, or when the image
-- URL is outside the controlled imported/ folder of that facility. The
-- server-only guarantee for source='imported' rests on this function: the
-- plain INSERT policy pins non-moderation inserts to source='user'.
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
  if p_image_url not like
     'https://bctphcpbspdsrwjydqpl.supabase.co/storage/v1/object/public/sauna-images/imported/'
     || target_sauna_id::text || '/%' then
    raise exception 'Nieprawidłowa ścieżka obrazu importowanego';
  end if;
  insert into public.sauna_photos (sauna_id, image_url, source, source_url, created_by)
    values (target_sauna_id, p_image_url, 'imported', p_source_url, auth.uid())
    returning id into new_id;
  return new_id;
end $$ language plpgsql security definer set search_path = '';

revoke all on function public.attach_imported_photo(uuid, text, text) from public, anon;
grant execute on function public.attach_imported_photo(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. sauna_photos — deterministic policy replacement (review point 7)
--    Replaces (baseline): photos_select, "Allow public read sauna photos",
--    photos_insert, "Allow anon insert sauna photos MVP" (INSERT true),
--    photos_update, photos_delete.
--    Ownership rules: uploaders delete their OWN user photos; rows with
--    created_by IS NULL (pre-SP-036) are staff/moderation-only; there is no
--    UPDATE policy at all — photo rows are immutable (replace =
--    delete + insert). The INSERT check binds the row to the facility's own
--    storage folder, so a photo row cannot point at an unrelated object.
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
        and image_url like
          ('https://bctphcpbspdsrwjydqpl.supabase.co/storage/v1/object/public/sauna-images/'
           || sauna_id::text || '/%')
        and exists (select 1 from public.saunas s
                    where s.id = sauna_id
                      and (s.status = 'active'
                           or (s.status = 'pending'
                               and s.created_by = auth.uid()))))
  );
create policy photos_delete on public.sauna_photos
  for delete using (
    public.is_platform_moderator()
    or public.is_sauna_staff(sauna_id)
    or (created_by is not null
        and created_by = auth.uid()
        and source = 'user')
  );
-- no UPDATE policy: rows are immutable by design

-- ---------------------------------------------------------------------------
-- 10. pts_import_log — close the anon read+write MVP policies.
--     App-dependency check (2026-07-18): the only consumer is the manual
--     scripts/importPtsSaunas.ts (writes with the anon key). After this
--     change future PTS imports must run under a moderator session or a
--     service key — accepted; imports are rare, operator-run events.
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
create policy pts_import_log_select on public.pts_import_log
  for select using (public.is_platform_moderator());
create policy pts_import_log_insert on public.pts_import_log
  for insert with check (public.is_platform_moderator());

-- ---------------------------------------------------------------------------
-- 11. Storage: sauna-images — remove anonymous upload (exact live policy
--     name from the baseline), keep public read, require authentication.
-- ---------------------------------------------------------------------------
drop policy if exists "Allow anon upload sauna images MVP" on storage.objects;
create policy "sauna_images_insert_authenticated" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sauna-images');
-- "Allow public read sauna images MVP" (SELECT) stays as-is.

-- ---------------------------------------------------------------------------
-- 12. ISOLATED HARDENINGS — adjacent MVP-era holes surfaced by the audit.
--     Each verified against application code (no consumer depends on the
--     removed grant); each independently revertible (see rollback script).
--     Skippable as a block if you prefer to defer — nothing in SP-036
--     depends on them.
-- ---------------------------------------------------------------------------
-- 12a. sauna_event_masters: two anonymous INSERT-true policies allowed
--      anyone to attach masters to events. App check: assignment runs
--      admin-side only (SP-035D aligned removeEventMaster to admin;
--      event_masters_insert is_admin remains for the UI path).
drop policy if exists "Allow anon insert sauna event masters MVP"
  on public.sauna_event_masters;
drop policy if exists "anon can insert sauna_event_masters"
  on public.sauna_event_masters;

-- 12b. master-avatars: anonymous upload no longer needed — the only
--      uploader (UploadAvatarButton) runs authenticated, and the
--      authenticated policy already exists.
drop policy if exists "anon can upload to master-avatars" on storage.objects;

-- 12c. sauna_managers: "public sees approved managers" exposed user_id of
--      approved managers to anon. App check (2026-07-18): every SELECT in
--      the codebase filters by own user_id, runs as admin/moderator, or
--      goes through SECURITY DEFINER is_sauna_staff — zero consumers of
--      the public arm. Replaced with staff-scoped visibility.
drop policy if exists "public sees approved managers" on public.sauna_managers;
create policy managers_select_staff on public.sauna_managers
  for select using (public.is_sauna_staff(sauna_id));
--      (own-rows and admin SELECT policies remain untouched.)

commit;

-- ============================================================================
-- POST-APPLY VERIFICATION (run immediately after; all read-only or
-- reversible probes on throwaway rows)
-- ============================================================================
-- V1. Policy inventory matches the target state:
--   select tablename, policyname, cmd from pg_policies
--   where schemaname='public' and tablename in
--     ('saunas','sauna_events','sauna_photos','pts_import_log',
--      'sauna_managers','sauna_event_masters','import_log')
--   order by tablename, cmd, policyname;
-- V2. Data untouched:
--   select count(*) from public.saunas;                  -- 215
--   select count(*) from public.sauna_events;            -- 10
--   select status, count(*) from public.saunas group by status; -- active,215
-- V3. As anon (PostgREST): GET saunas?status=eq.pending → 0 rows;
--     GET pts_import_log → 0 rows; POST saunas → 401/403.
-- V4. As a regular user: INSERT saunas status='active' → FAILS;
--     status='pending' → OK (then delete the test row as admin);
--     6th pending insert → FAILS with the cap message.
-- V5. As a verified master: event INSERT at a managed sauna with
--     status='active' → FAILS; 'pending' → OK. UPDATE own event status →
--     FAILS ('Status eventu zmienia obsada obiektu lub moderacja').
-- V6. select public.find_similar_saunas('Termy',52.4,16.9); as anon → error
--     (no grant); as authenticated → ≤10 rows, minimal columns only.
-- V7. select public.approve_facility_submission('<test pending id>');
--     as non-moderator → error; as admin → sauna active + jsonb report.
-- ============================================================================
