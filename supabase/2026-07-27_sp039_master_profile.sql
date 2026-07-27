-- ============================================================================
-- SP-039 Slice 1 — expanded sauna-master profile foundation.
--
-- Scope (approved 2026-07-27, decisions R1/R2/R3):
--   §1 nine additive profile columns on public.sauna_masters;
--   §2 stable invariants (slug shape + case-insensitive unique, year range,
--      social_links object, array cardinality bounds);
--   §3 privileged-column guard extended with is_founding_partner AND the
--      previously unprotected legacy rating/review_count (R1);
--   §4 master-avatars Storage INSERT hardened to record ownership (R2).
--
-- DELIBERATELY NO "IF NOT EXISTS" on columns/indexes: the PRE-APPLY checks
-- assert the exact expected legacy state and the migration FAILS LOUDLY on
-- any drift instead of silently masking it.
--
-- Companion rollback: 2026-07-27_sp039_rollback.sql
--
-- PRE-APPLY (read-only; run FIRST — on any mismatch STOP and review):
-- P1. None of the new columns exist yet (expect 0 rows):
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='sauna_masters'
--     and column_name in ('slug','city','specialties','languages',
--       'experience_since_year','social_links','website','cover_image_url',
--       'is_founding_partner');
-- P2. Index inventory is exactly the legacy pair (expect 2 rows:
--     sauna_masters_pkey, sauna_masters_user_id_unique):
--   select indexname from pg_indexes
--   where schemaname='public' and tablename='sauna_masters';
-- P3. Guard function is the SP-035 four-column body (expect the source to
--     mention level/status/user_id/home_sauna_id and NOT is_founding_partner):
--   select prosrc from pg_proc
--   where pronamespace='public'::regnamespace
--     and proname='guard_master_privileged_columns';
-- P4. Legacy Storage INSERT policy present in bucket-only form (expect 1 row
--     whose with_check is exactly (bucket_id = 'master-avatars'::text)):
--   select policyname, with_check from pg_policies
--   where schemaname='storage' and tablename='objects'
--     and policyname='Authenticated users can upload to master-avatars';
-- P5. No object named master_avatars_insert_own exists yet (expect 0 rows):
--   select policyname from pg_policies
--   where schemaname='storage' and tablename='objects'
--     and policyname='master_avatars_insert_own';
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. Additive profile columns (all nullable / defaulted — every existing and
--    pending row stays valid; no backfill).
-- ---------------------------------------------------------------------------
alter table public.sauna_masters
  add column slug text,
  add column city text,
  add column specialties text[],
  add column languages text[],
  add column experience_since_year smallint,
  add column social_links jsonb,
  add column website text,
  add column cover_image_url text,
  add column is_founding_partner boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Stable invariants. Everything vocabulary-shaped (reserved slugs,
--    specialty ids, language codes, https rules, dedup, blanks) is
--    application validation by design (decisions D1/R3) — SQL pins only
--    what must never vary.
-- ---------------------------------------------------------------------------
-- Canonical slug: lowercase ASCII letters/digits with single internal
-- hyphens (POSIX ERE — structurally excludes leading/trailing/repeated
-- hyphens), length 3–40, nullable.
alter table public.sauna_masters
  add constraint sauna_masters_slug_shape
  check (
    slug is null
    or (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        and char_length(slug) between 3 and 40)
  );

-- Case-insensitive uniqueness on lower(slug): the shape CHECK already
-- forces lowercase, but the index stays correct even if the CHECK is ever
-- relaxed.
create unique index sauna_masters_slug_unique
  on public.sauna_masters (lower(slug))
  where slug is not null;

alter table public.sauna_masters
  add constraint sauna_masters_experience_year_range
  check (experience_since_year is null
         or experience_since_year between 1980 and 2100);
-- (the application additionally rejects years above the CURRENT year — a
--  volatile now()-based CHECK is deliberately not used)

-- Same conservative contract as saunas.social_links (SP-038): top-level
-- object only.
alter table public.sauna_masters
  add constraint sauna_masters_social_links_is_object
  check (social_links is null or jsonb_typeof(social_links) = 'object');

-- Arrays: present means non-empty and bounded; the application converts
-- empty arrays to NULL and owns element-level rules.
alter table public.sauna_masters
  add constraint sauna_masters_specialties_bounds
  check (specialties is null or cardinality(specialties) between 1 and 12);

alter table public.sauna_masters
  add constraint sauna_masters_languages_bounds
  check (languages is null or cardinality(languages) between 1 and 8);

-- ---------------------------------------------------------------------------
-- 3. Privileged-column guard (R1). Adds is_founding_partner plus the legacy
--    display fields rating/review_count, which the column-agnostic
--    masters_update_own policy otherwise leaves SELF-EDITABLE — after the
--    "hide rating when review_count = 0" rule a master could fabricate the
--    section back into existence. Moderation keeps full access.
--    The exception message is deliberately generic (approved wording).
-- ---------------------------------------------------------------------------
create or replace function public.guard_master_privileged_columns()
returns trigger as $$
begin
  if public.is_platform_moderator() then
    return new;
  end if;

  if new.level is distinct from old.level
     or new.status is distinct from old.status
     or new.user_id is distinct from old.user_id
     or new.home_sauna_id is distinct from old.home_sauna_id
     or new.is_founding_partner is distinct from old.is_founding_partner
     or new.rating is distinct from old.rating
     or new.review_count is distinct from old.review_count
  then
    raise exception
      'Pola uprzywilejowane profilu saunamistrza może zmieniać wyłącznie moderacja.';
  end if;

  return new;
end $$ language plpgsql security definer set search_path = public;
-- trigger sauna_masters_guard (SP-035) already points at this function.

-- ---------------------------------------------------------------------------
-- 4. Storage (R2): master-avatars INSERT becomes ownership-aware. The
--    legacy policy checked only the bucket, so any authenticated user could
--    fill any master's folder. The first path segment must now be the id
--    of a sauna_masters record LINKED TO THE CALLER (any status — a pending
--    master keeps uploading their own avatar, preserving current behavior),
--    or the caller is moderation. Both approved layouts pass:
--      <master_id>/<file>            (avatars — existing convention)
--      <master_id>/covers/<file>     (covers — new convention)
--    Lessons applied: every target-table column reference is QUALIFIED
--    (storage.objects.*) so the inner relation cannot capture it, and the
--    untrusted segment is never cast to uuid — the comparison is text
--    against m.id::text, so malformed/missing segments fail CLOSED with no
--    exception. No UPDATE/DELETE policies are added; public read and other
--    buckets are untouched.
--    NOTE (RLS layering): the EXISTS subquery runs as the caller;
--    masters_select's own-row arm (user_id = auth.uid()) guarantees owners
--    can always see their own row regardless of status.
-- ---------------------------------------------------------------------------
drop policy "Authenticated users can upload to master-avatars" on storage.objects;
create policy "master_avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (
    storage.objects.bucket_id = 'master-avatars'
    and (
      public.is_platform_moderator()
      or exists (
        select 1 from public.sauna_masters m
        where m.id::text
                = (storage.foldername(storage.objects.name))[1]
          and m.user_id = auth.uid()
      )
    )
  );

commit;

-- ============================================================================
-- POST-APPLY VERIFICATION
-- V1. Columns/constraints/index present:
--   select column_name, data_type, is_nullable from information_schema.columns
--   where table_schema='public' and table_name='sauna_masters'
--     and column_name in ('slug','city','specialties','languages',
--       'experience_since_year','social_links','website','cover_image_url',
--       'is_founding_partner');
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid='public.sauna_masters'::regclass and contype='c'
--     and conname like 'sauna_masters_%';
--   select indexdef from pg_indexes where indexname='sauna_masters_slug_unique';
-- V2. Constraint probes (rolled-back transaction):
--   slug 'Zle--Slug' / 'ab' / '-abc' -> CHECK error; 'dobry-slug-3' -> ok;
--   two rows with slugs differing only by case -> unique violation;
--   specialties '{}' -> CHECK error; social_links '[]'::jsonb -> CHECK error.
-- V3. Guard probes (rolled-back, impersonated linked owner):
--   update own city/slug/social_links -> ok;
--   update own is_founding_partner / rating / review_count / level ->
--   'Pola uprzywilejowane...' exception; as moderator -> allowed.
-- V4. Storage policy stored definition:
--   select with_check from pg_policies
--   where schemaname='storage' and tablename='objects'
--     and policyname='master_avatars_insert_own';
--   -- expect: qualified objects refs, storage.foldername(objects.name),
--   --         m.id::text comparison, user_id = auth.uid(),
--   --         is_platform_moderator(); NO 'foldername(m.name)' binding.
-- V5. Behavioral storage probes (rolled-back, impersonation):
--   owner  -> '<own master id>/x.jpg'          ALLOW;
--   owner  -> '<own master id>/covers/x.jpg'   ALLOW;
--   other  -> '<that id>/x.jpg'                DENY (RLS);
--   anyone -> 'not-a-uuid/x.jpg'               DENY, no cast exception;
--   anyone -> 'x.jpg' (no folder)              DENY;
--   moderator -> any of the above              ALLOW.
-- V6. Unrelated policies unchanged (sauna-images pair, public reads):
--   select policyname, cmd from pg_policies
--   where schemaname='storage' and tablename='objects' order by policyname;
-- ============================================================================
