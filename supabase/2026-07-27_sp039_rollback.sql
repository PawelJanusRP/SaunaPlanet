-- ============================================================================
-- SP-039 Slice 1 — ROLLBACK for 2026-07-27_sp039_master_profile.sql
--
-- FUNCTIONAL ROLLBACK (this file, §1–§2): reverses the behavioral changes
-- WITHOUT dropping profile data:
--   §1 restores the SP-035 four-column guard verbatim — NOTE this also
--      reopens the pre-SP-039 self-edit hole on rating/review_count (that
--      was the live state before this migration; documented trade-off);
--   §2 restores the legacy bucket-only master-avatars INSERT policy
--      verbatim — reopens the folder-spam vector (pre-SP-039 live state).
-- New profile columns and their constraints/index REMAIN (harmless while
-- unused by the application). No other Storage policy is touched.
--
-- FULL DATA-LOSS ROLLBACK: commented §3 — run only on explicit decision.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. Guard — SP-035 definition, verbatim.
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
  then
    raise exception 'Poziom, status i powiązania profilu zmienia tylko moderacja';
  end if;

  return new;
end $$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- 2. Storage — legacy bucket-only INSERT policy, verbatim.
-- ---------------------------------------------------------------------------
drop policy if exists "master_avatars_insert_own" on storage.objects;
drop policy if exists "Authenticated users can upload to master-avatars" on storage.objects;
create policy "Authenticated users can upload to master-avatars" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'master-avatars');

commit;

-- ============================================================================
-- 3. FULL ROLLBACK — DATA LOSS (explicit decision required; drops every
--    SP-039 profile value):
-- alter table public.sauna_masters
--   drop constraint if exists sauna_masters_slug_shape,
--   drop constraint if exists sauna_masters_experience_year_range,
--   drop constraint if exists sauna_masters_social_links_is_object,
--   drop constraint if exists sauna_masters_specialties_bounds,
--   drop constraint if exists sauna_masters_languages_bounds;
-- drop index if exists public.sauna_masters_slug_unique;
-- alter table public.sauna_masters
--   drop column if exists slug,
--   drop column if exists city,
--   drop column if exists specialties,
--   drop column if exists languages,
--   drop column if exists experience_since_year,
--   drop column if exists social_links,
--   drop column if exists website,
--   drop column if exists cover_image_url,
--   drop column if exists is_founding_partner;
-- ============================================================================
