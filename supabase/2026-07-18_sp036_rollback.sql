-- ============================================================================
-- SP-036 ROLLBACK — restores the exact 2026-07-18 production baseline
-- (as captured by 2026-07-18_sp036_step0_audit.sql) for every object the
-- SP-036 migration replaced. Run only if SP-036 must be reverted.
-- ============================================================================
-- Scope notes:
--   * Policies, triggers and functions are fully reverted below.
--   * Additive columns (created_by, organizer_master_id,
--     bundled_with_submission, sauna_photos.source/source_url/created_by),
--     the import_log table, the trigram index and the pg_trgm extension are
--     LEFT IN PLACE — they are inert without the SP-036 policies and
--     dropping them could destroy data written between apply and rollback.
--     A separate cleanup can remove them once confirmed unused.
--   * Reverting deliberately RESTORES the known MVP-era holes (anon
--     insert/update policies) — that IS the baseline. Do not run this as a
--     "hardening"; it is a compatibility restore.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Drop SP-036 triggers and functions
-- ---------------------------------------------------------------------------
drop trigger if exists saunas_guard on public.saunas;
drop trigger if exists saunas_submission_cap on public.saunas;
drop trigger if exists sauna_events_guard on public.sauna_events;
drop function if exists public.guard_sauna_columns();
drop function if exists public.guard_sauna_submission_cap();
drop function if exists public.guard_event_columns();
drop function if exists public.approve_facility_submission(uuid);
drop function if exists public.attach_imported_photo(uuid, text, text);
drop function if exists public.find_similar_saunas(
  text, double precision, double precision, text, text, text);
drop function if exists public.is_verified_master_owner(uuid);
drop function if exists public.is_sauna_managed(uuid);

-- ---------------------------------------------------------------------------
-- 2. saunas — baseline policies (verbatim from the audit)
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
create policy "saunas_select" on public.saunas for select using (true);
create policy "Allow public read saunas" on public.saunas for select using (true);
create policy "saunas_insert" on public.saunas for insert with check (is_admin());
create policy "Allow anon insert saunas MVP" on public.saunas
  for insert with check (true);
create policy "saunas_update" on public.saunas for update using (is_admin());
create policy "Allow anon update saunas MVP" on public.saunas
  for update using (true) with check (true);
create policy "saunas_delete" on public.saunas for delete using (is_admin());

-- ---------------------------------------------------------------------------
-- 3. sauna_events — baseline policies
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
create policy "events_select" on public.sauna_events for select using (true);
create policy "Allow public read sauna events" on public.sauna_events
  for select using (true);
create policy "events_insert" on public.sauna_events
  for insert with check (is_admin());
create policy "events_insert_staff" on public.sauna_events
  for insert with check (is_sauna_staff(sauna_id));
create policy "Allow anon insert sauna events MVP" on public.sauna_events
  for insert with check (true);
create policy "events_update" on public.sauna_events
  for update using (is_admin());
create policy "events_update_staff" on public.sauna_events
  for update using (is_sauna_staff(sauna_id))
  with check (is_sauna_staff(sauna_id));
create policy "events_delete" on public.sauna_events
  for delete using (is_admin());
create policy "events_delete_staff" on public.sauna_events
  for delete using (is_sauna_staff(sauna_id));

-- ---------------------------------------------------------------------------
-- 4. sauna_photos — baseline policies
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
create policy "photos_select" on public.sauna_photos for select using (true);
create policy "Allow public read sauna photos" on public.sauna_photos
  for select using (true);
create policy "photos_insert" on public.sauna_photos
  for insert with check (is_admin());
create policy "Allow anon insert sauna photos MVP" on public.sauna_photos
  for insert with check (true);
create policy "photos_update" on public.sauna_photos
  for update using (is_admin());
create policy "photos_delete" on public.sauna_photos
  for delete using (is_admin());

-- ---------------------------------------------------------------------------
-- 5. pts_import_log — baseline policies
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
create policy "Allow public read pts import log MVP" on public.pts_import_log
  for select using (true);
create policy "Allow anon insert pts import log MVP" on public.pts_import_log
  for insert with check (true);

-- ---------------------------------------------------------------------------
-- 6. Isolated hardenings (migration §12) — restore baseline
-- ---------------------------------------------------------------------------
create policy "Allow anon insert sauna event masters MVP"
  on public.sauna_event_masters for insert with check (true);
create policy "anon can insert sauna_event_masters"
  on public.sauna_event_masters for insert to anon with check (true);

drop policy if exists managers_select_staff on public.sauna_managers;
create policy "public sees approved managers" on public.sauna_managers
  for select using (status = 'approved'::text);

-- ---------------------------------------------------------------------------
-- 7. Storage — baseline
-- ---------------------------------------------------------------------------
drop policy if exists "sauna_images_insert_authenticated" on storage.objects;
create policy "Allow anon upload sauna images MVP" on storage.objects
  for insert with check (bucket_id = 'sauna-images'::text);
create policy "anon can upload to master-avatars" on storage.objects
  for insert to anon with check (bucket_id = 'master-avatars'::text);

-- ---------------------------------------------------------------------------
-- 8. import_log — disable access (table itself is left in place with its
--    data; drop manually later if desired)
-- ---------------------------------------------------------------------------
drop policy if exists import_log_select on public.import_log;
drop policy if exists import_log_insert on public.import_log;

commit;

-- Post-rollback check: pg_policies for the touched tables should match the
-- saved 2026-07-18 audit output line for line (modulo policy ordering).
