-- ============================================================================
-- SP-038 Slice 3C — saunas.social_links + storage hardening for imported/
-- (docs/SP038_SMART_IMPORT_ARCHITECTURE.md — Slice 3C; approved decision 2:
--  option A, JSONB keyed object; no facebook_url/instagram_url columns).
--
-- NOTE §2 (storage) goes BEYOND the reviewed social_links SQL and is
-- explicitly flagged for approval in the Slice 3C report: the live INSERT
-- policy sauna_images_insert_authenticated checks only bucket_id, so ANY
-- authenticated user could fill imported/{any_sauna_id}/ with objects
-- (attach_imported_photo would refuse to ATTACH them, but the folder spam
-- vector itself must be closed before the app starts uploading there).
--
-- Companion rollback: 2026-07-25_sp038c_rollback.sql
--
-- PRE-APPLY (read-only; on mismatch STOP):
-- P1. select column_name from information_schema.columns
--   where table_schema='public' and table_name='saunas'
--     and column_name='social_links';                        -- expect 0 rows
-- P2. select conname from pg_constraint
--   where conrelid='public.saunas'::regclass
--     and conname='saunas_social_links_is_object';           -- expect 0 rows
-- P3. select policyname, cmd, roles from pg_policies
--   where schemaname='storage' and tablename='objects'
--     and policyname like 'sauna_images%';
--   -- expect exactly: sauna_images_insert_authenticated (INSERT,
--   --                 with_check = bucket_id = 'sauna-images')
-- P4. select count(*) from storage.objects
--   where bucket_id='sauna-images' and name like 'imported/%'; -- expect 0
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. saunas.social_links — nullable JSONB, no default, no backfill.
--    Application-level shape (validated app-side, extensible without
--    another migration): {"facebook": "https://...", "instagram": ...,
--    "youtube": ..., "tiktok": ...}. DB enforces only "top-level object",
--    mirroring saunas.opening_hours.
-- ---------------------------------------------------------------------------
alter table public.saunas
  add column if not exists social_links jsonb;

alter table public.saunas
  drop constraint if exists saunas_social_links_is_object;
alter table public.saunas
  add constraint saunas_social_links_is_object
  check (social_links is null or jsonb_typeof(social_links) = 'object');

-- ---------------------------------------------------------------------------
-- 2. Storage: sauna-images — split the broad INSERT policy so the
--    imported/ prefix is writable only by the owner of the matching
--    PENDING submission (or moderation). All existing upload paths
--    ({sauna_id}/{ts}.{ext} from AddPhotoModal / AddSaunaForm) keep
--    working verbatim through the non-imported arm.
--
--    INCIDENT NOTE (2026-07-25, post-apply): the first committed version
--    of the imported_own policy used the UNQUALIFIED identifier `name`
--    inside the EXISTS subquery; PostgreSQL bound it to public.saunas.name
--    (the inner relation), producing storage.foldername(s.name) in the
--    stored definition — fail-closed for owners. Every target-table column
--    reference below is therefore fully qualified (storage.objects.*);
--    the already-applied production policy is repaired by the forward
--    hotfix 2026-07-25_sp038c_fix_imported_storage_policy.sql.
--    LESSON: in RLS policy subqueries ALWAYS qualify target-table columns
--    and verify pg_policies.with_check after applying.
-- ---------------------------------------------------------------------------
drop policy if exists "sauna_images_insert_authenticated" on storage.objects;
create policy "sauna_images_insert_authenticated" on storage.objects
  for insert to authenticated
  with check (
    storage.objects.bucket_id = 'sauna-images'
    and coalesce((storage.foldername(storage.objects.name))[1], '') <> 'imported'
  );

drop policy if exists "sauna_images_insert_imported_own" on storage.objects;
create policy "sauna_images_insert_imported_own" on storage.objects
  for insert to authenticated
  with check (
    storage.objects.bucket_id = 'sauna-images'
    and (storage.foldername(storage.objects.name))[1] = 'imported'
    and (
      public.is_platform_moderator()
      or exists (select 1 from public.saunas s
                 where s.id::text = (storage.foldername(storage.objects.name))[2]
                   and s.status = 'pending'
                   and s.created_by = auth.uid())
    )
  );

commit;

-- ============================================================================
-- POST-APPLY VERIFICATION
-- V1. social_links present, jsonb, nullable; '[]'::jsonb -> CHECK error,
--     '{}'::jsonb -> ok (rolled back); counts unchanged, all NULL.
-- V2. Policy inventory: two sauna_images INSERT policies as defined above;
--     public read + other bucket policies untouched.
-- V3. As user A (rolled-back probe or app-level test): upload to
--     imported/<own pending sauna>/x.jpg -> allowed;
--     imported/<foreign sauna>/x.jpg -> policy violation;
--     imported/<active sauna>/x.jpg -> policy violation;
--     <sauna_id>/x.jpg (legacy path) -> allowed (regression).
-- ============================================================================
