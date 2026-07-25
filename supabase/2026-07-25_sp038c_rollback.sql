-- ============================================================================
-- SP-038 Slice 3C — ROLLBACK for 2026-07-25_sp038c_social_links.sql
--
-- §1 restores the pre-3C storage INSERT policy (single broad
--    authenticated policy, exactly the SP-036 shape). Safe, no data loss.
-- §2 (COMMENTED) drops the social_links column — DATA LOSS; run only on
--    explicit decision.
-- Imported objects already uploaded under imported/ and their sauna_photos
-- rows are managed by existing moderation delete policies — no special
-- rollback handling.
-- ============================================================================
begin;

drop policy if exists "sauna_images_insert_imported_own" on storage.objects;
drop policy if exists "sauna_images_insert_authenticated" on storage.objects;
create policy "sauna_images_insert_authenticated" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sauna-images');

commit;

-- ============================================================================
-- §2 DATA-LOSS steps (explicit decision required):
-- alter table public.saunas drop constraint if exists saunas_social_links_is_object;
-- alter table public.saunas drop column if exists social_links;
-- ============================================================================
