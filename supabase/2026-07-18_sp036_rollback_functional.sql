-- ============================================================================
-- SP-036 FUNCTIONAL ROLLBACK — disables the SP-036 submission/event
-- workflow while PRESERVING every security hardening.
-- ============================================================================
-- This is the PREFERRED rollback. The full baseline rollback
-- (2026-07-18_sp036_rollback.sql) restores the captured production state
-- verbatim — including the MVP-era anonymous write holes — and must be
-- treated as an EMERGENCY COMPATIBILITY OPTION ONLY.
--
-- Target state after this script:
--   * facility INSERT/UPDATE: moderation-only (no community submissions),
--   * event INSERT/UPDATE/DELETE: admin + facility staff only (no master
--     publication paths),
--   * everything hardened by SP-036 STAYS hardened:
--     - NO anonymous UPDATE on saunas,
--     - NO anonymous inserts into saunas / sauna_events / sauna_photos /
--       sauna_event_masters,
--     - NO anonymous storage uploads (sauna-images, master-avatars),
--     - NO public access to pts_import_log,
--     - NO public exposure of approved managers' user_id
--       (managers_select_staff stays),
--     - photo ownership rules stay (own-photo delete, folder binding,
--       imported server-only semantics — though no new imports can occur).
--
-- In-flight data at rollback time (documented behavior):
--   * pending saunas remain 'pending': invisible to the public, still
--     visible to their submitters (read-only for them — the update arm is
--     removed) and to moderation, who resolve them manually via admin
--     UPDATE (approve → 'active' / reject → 'rejected').
--   * bundled pending events remain 'pending': invisible in every public
--     query (status filters), removable by moderation.
--   * import_log keeps its data; new writes stop (insert policy dropped).
--   * Additive columns, the trigram index, pg_trgm and the import_log
--     table remain in place (inert, no data loss).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Remove workflow-specific RPCs and triggers
-- ---------------------------------------------------------------------------
drop trigger if exists saunas_submission_cap on public.saunas;
drop function if exists public.guard_sauna_submission_cap();
drop trigger if exists saunas_guard on public.saunas;
drop function if exists public.guard_sauna_columns();
drop trigger if exists sauna_events_guard on public.sauna_events;
drop function if exists public.guard_event_columns();
drop function if exists public.approve_facility_submission(uuid);
drop function if exists public.attach_imported_photo(uuid, text, text);
drop function if exists public.find_similar_saunas(
  text, double precision, double precision, text, text, text);

-- ---------------------------------------------------------------------------
-- 2. saunas — moderation-only writes, hardened reads kept
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
    or created_by = auth.uid()          -- submitters keep sight of their
    or public.is_platform_moderator()   -- frozen pending rows
  );
create policy saunas_insert on public.saunas
  for insert with check (public.is_platform_moderator());
create policy saunas_update on public.saunas
  for update using (public.is_platform_moderator())
  with check (public.is_platform_moderator());
create policy saunas_delete on public.saunas
  for delete using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. sauna_events — back to admin + staff (pre-SP-036 functionality with
--    post-SP-036 security; staff still cannot mark events as bundled)
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
  for insert with check (
    public.is_sauna_staff(sauna_id)
    and bundled_with_submission = false
  );
create policy events_update_admin on public.sauna_events
  for update using (public.is_admin()) with check (public.is_admin());
create policy events_update_staff on public.sauna_events
  for update using (public.is_sauna_staff(sauna_id))
  with check (public.is_sauna_staff(sauna_id));
create policy events_delete_admin on public.sauna_events
  for delete using (public.is_admin());
create policy events_delete_staff on public.sauna_events
  for delete using (public.is_sauna_staff(sauna_id));

-- ---------------------------------------------------------------------------
-- 4. sauna_photos — hardened set stays; only the pending-submission arm
--    becomes dead letter (no pending submissions can be created), which is
--    harmless. No change required — section intentionally empty.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 5. import_log — freeze writes, keep audit data readable to moderation
--    and to the requesting users
-- ---------------------------------------------------------------------------
drop policy if exists import_log_insert on public.import_log;

-- ---------------------------------------------------------------------------
-- 6. Helpers: is_verified_master_owner no longer has any consumer — drop.
--    is_sauna_managed is kept ONLY if something still references it; after
--    sections 1–3 nothing does, so drop it as well.
-- ---------------------------------------------------------------------------
drop function if exists public.is_verified_master_owner(uuid);
drop function if exists public.is_sauna_managed(uuid);

commit;

-- ---------------------------------------------------------------------------
-- Post-rollback verification (read-only):
--   * pg_policies on saunas/sauna_events: only the sets defined above;
--   * pg_policies on sauna_photos / pts_import_log / sauna_managers /
--     sauna_event_masters and storage.objects: UNCHANGED from the SP-036
--     hardened state;
--   * as anon: POST saunas → denied; PATCH saunas → denied;
--     GET pts_import_log → 0 rows.
-- ---------------------------------------------------------------------------
