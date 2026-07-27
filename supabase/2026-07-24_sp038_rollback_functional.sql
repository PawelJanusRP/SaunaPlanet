-- ============================================================================
-- SP-038 Slice 3 — FUNCTIONAL ROLLBACK for 2026-07-24_sp038_import_linking.sql
--
-- Removes the linking workflow while PRESERVING data and data-integrity
-- hardening, mirroring the SP-037/037B rollback philosophy:
--   * keeps import_log.sauna_id and its data (audit trail unharmed),
--   * keeps saunas.opening_hours and its data,
--   * keeps the extended source_kind vocabulary (rows may already use
--     'google_maps'; narrowing back would require data migration first),
--   * keeps the tightened INSERT policy (fake-provenance hole stays closed),
--   * keeps both indexes (harmless, useful).
-- What it removes: the ONLY write path to sauna_id — after this rollback
-- the column is frozen (no policy, no RPC can set it).
-- ============================================================================
begin;

drop function if exists public.link_import_to_submission(uuid, uuid);

commit;

-- ============================================================================
-- FULL ROLLBACK (DATA LOSS — run only on explicit decision, each step
-- independent; NOT part of the functional rollback above):
--
-- -- drops the link data and the audit column:
-- drop index if exists public.import_log_sauna_id_uidx;
-- alter table public.import_log drop column if exists sauna_id;
--
-- -- drops opening hours data:
-- alter table public.saunas drop constraint if exists saunas_opening_hours_is_object;
-- alter table public.saunas drop column if exists opening_hours;
--
-- -- restores the SP-036 INSERT policy (reopens the pre-slice-3 shape;
-- -- only meaningful together with dropping sauna_id above):
-- drop policy if exists import_log_insert on public.import_log;
-- create policy import_log_insert on public.import_log
--   for insert with check (requested_by = auth.uid());
--
-- -- narrows source_kind back (FIRST migrate any 'google_maps' rows):
-- update public.import_log set source_kind = 'other'
--   where source_kind = 'google_maps';
-- alter table public.import_log drop constraint if exists import_log_source_kind_check;
-- alter table public.import_log add constraint import_log_source_kind_check
--   check (source_kind in
--     ('facebook_page','facebook_event','instagram','website','other'));
--
-- drop index if exists public.import_log_requested_by_created_at_idx;
-- ============================================================================
