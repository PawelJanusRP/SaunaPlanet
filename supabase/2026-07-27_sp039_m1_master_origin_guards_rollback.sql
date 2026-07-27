-- ============================================================================
-- SP-039 Slice 3B1 — M1 ROLLBACK.
--
-- FUNCTIONAL rollback (non-destructive): restore the SP-039 seven-field UPDATE
-- guard and the SP-035 level-only INSERT clamp VERBATIM. The origin column is
-- LEFT IN PLACE (dropping it is data-loss and would break M2+ if they were
-- applied). Dropping the column is provided only in the commented DATA-LOSS
-- section below.
--
-- Companion forward: 2026-07-27_sp039_m1_master_origin_guards.sql
-- ============================================================================
begin;

-- Restore the seven-field UPDATE guard verbatim (SP-039 body).
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

-- Restore the SP-035 level-only INSERT clamp verbatim.
create or replace function public.guard_master_insert_level()
returns trigger as $$
begin
  if not public.is_platform_moderator() then
    new.level := 'guest';
  end if;
  return new;
end $$ language plpgsql security definer set search_path = public;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- DATA-LOSS SECTION — apply ONLY for a full schema teardown, and ONLY after M2+
-- (which reference sauna_masters via FKs but not the origin column) are rolled
-- back. Dropping origin permanently discards which profiles were admin-prepared.
--
--   alter table public.sauna_masters drop constraint if exists sauna_masters_origin_check;
--   alter table public.sauna_masters drop column if exists origin;
-- ============================================================================
