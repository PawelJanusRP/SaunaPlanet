-- ============================================================================
-- SP-038 Slice 3C HOTFIX — repair the name-binding defect in
-- sauna_images_insert_imported_own.
--
-- ROOT CAUSE: the originally applied policy used the UNQUALIFIED
-- identifier `name` inside its EXISTS subquery over public.saunas s;
-- PostgreSQL bound it to the inner relation (s.name — the SAUNA's name),
-- so the stored predicate evaluates storage.foldername(s.name) and the
-- pending-owner arm can never match. Fail-closed: owners were denied,
-- moderators unaffected, no unauthorized access existed.
--
-- This migration drops ONLY that one policy and recreates it with fully
-- qualified target-table column references. Authorization semantics are
-- IDENTICAL to the approved design. It does NOT touch social_links, its
-- CHECK, the normal non-imported INSERT policy, public-read policies or
-- any other bucket.
--
-- The pre-apply guard below asserts the expected defective state; after a
-- successful apply a RE-RUN of this migration FAILS ON PURPOSE (the
-- defective definition is gone) — that is the intended protection against
-- applying it against the wrong environment or twice.
--
-- Companion operational rollback: 2026-07-25_sp038c_fix_rollback.sql
--
-- PRE-APPLY (read-only; run first, STOP on any mismatch):
-- P1. Target policy exists and carries the defective binding:
--   select policyname, with_check from pg_policies
--   where schemaname='storage' and tablename='objects'
--     and policyname='sauna_images_insert_imported_own';
--   -- expect exactly 1 row whose with_check CONTAINS
--   --   storage.foldername(s.name)
--   -- and does NOT contain storage.foldername(objects.name)
-- P2. Normal upload policy is the correct 3C shape:
--   select with_check from pg_policies
--   where schemaname='storage' and tablename='objects'
--     and policyname='sauna_images_insert_authenticated';
--   -- expect bucket check AND COALESCE(foldername(name)[1],'') <> 'imported'
-- ============================================================================
begin;

-- Guard: refuse to run unless the live policy is in the expected
-- defective state (protects against double-apply / wrong environment).
do $$
declare v_check text;
begin
  select with_check into v_check
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'sauna_images_insert_imported_own';
  if v_check is null then
    raise exception
      'HOTFIX GUARD: policy sauna_images_insert_imported_own not found — stop and review';
  end if;
  if position('storage.foldername(s.name)' in v_check) = 0 then
    raise exception
      'HOTFIX GUARD: live policy does not carry the expected defective s.name binding — already fixed or unexpected state; stop and review';
  end if;
end $$;

drop policy "sauna_images_insert_imported_own" on storage.objects;
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
-- V1. Stored definition is bound to the Storage object path:
--   select cmd, roles, with_check from pg_policies
--   where schemaname='storage' and tablename='objects'
--     and policyname='sauna_images_insert_imported_own';
--   -- expect: cmd = INSERT; roles = {authenticated};
--   --   with_check CONTAINS storage.foldername(objects.name) (twice),
--   --   does NOT contain storage.foldername(s.name),
--   --   retains s.status = 'pending', s.created_by = auth.uid(),
--   --   s.id::text = ...[2] and is_platform_moderator().
-- V2. Behavioral probes (LATER, on production, inside rolled-back
--     transactions with role/claims impersonation — same technique as the
--     3C verification):
--   a) owner of a pending sauna -> imported/<own-id>/x.jpg  = ALLOWED;
--   b) different user           -> imported/<that-id>/x.jpg = DENIED;
--   c) owner, ACTIVE sauna      -> imported/<active-id>/x   = DENIED;
--   d) malformed uuid segment   -> imported/not-a-uuid/x    = DENIED;
--   e) legacy <sauna-id>/x.jpg stays ALLOWED via the separate normal
--      policy (regression).
-- ============================================================================
