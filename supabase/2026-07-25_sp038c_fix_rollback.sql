-- ============================================================================
-- SP-038 Slice 3C HOTFIX ROLLBACK — OPERATIONAL ROLLBACK ONLY.
--
-- *** WARNING — READ BEFORE RUNNING ***
-- This intentionally RESTORES THE DEFECTIVE policy definition that was
-- live before 2026-07-25_sp038c_fix_imported_storage_policy.sql:
--   * the unqualified `name` inside the EXISTS subquery re-binds to
--     public.saunas.name (storage.foldername(s.name) in pg_policies),
--   * therefore it REINTRODUCES THE KNOWN OWNER-UPLOAD DEFECT —
--     pending-facility owners are DENIED on imported/ uploads
--     (fail-closed; moderators unaffected).
-- Use ONLY if the hotfix itself must be reversed for operational reasons.
-- NOT recommended otherwise.
--
-- It does NOT touch social_links, its CHECK, the normal non-imported
-- INSERT policy, public-read policies or any other bucket, and it does
-- NOT restore the broad pre-3C bucket-only policy.
-- ============================================================================
begin;

drop policy if exists "sauna_images_insert_imported_own" on storage.objects;
-- Verbatim pre-hotfix (defective) definition — the unqualified `name` in
-- the subquery is DELIBERATE here to reproduce the exact prior behavior:
create policy "sauna_images_insert_imported_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'sauna-images'
    and (storage.foldername(name))[1] = 'imported'
    and (
      public.is_platform_moderator()
      or exists (select 1 from public.saunas s
                 where s.id::text = (storage.foldername(name))[2]
                   and s.status = 'pending'
                   and s.created_by = auth.uid())
    )
  );

commit;
