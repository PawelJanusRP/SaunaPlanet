-- ============================================================================
-- SP-039 Slice 3B1 — M1: prepared-profile provenance (`origin`) + guard hardening.
--
-- Adds public.sauna_masters.origin (self_registered | admin_prepared) and makes
-- it a privileged column: the UPDATE guard protects it as an EIGHTH field
-- (never weakening the existing seven), and the INSERT guard clamps it to
-- 'self_registered' for non-moderators (mirroring the existing level clamp) so
-- an ordinary user cannot self-mint an admin_prepared row.
--
-- DELIBERATELY additive & non-destructive: existing rows default to
-- 'self_registered'; no backfill; no data change. Deferred (NOT added here):
-- claimed_at, identity_verified_at, qualifications_verified_at (Slice 4+).
--
-- SECURITY: both guard bodies are re-authored with `set search_path = ''` (NOT
-- the legacy `search_path = public`). The only object reference in either body
-- is the already-qualified public.is_platform_moderator(); everything else is
-- NEW/OLD trigger columns, so the hardening is behavior-preserving. The rollback
-- deliberately restores the exact legacy predecessor (which used
-- `search_path = public`).
--
-- The master DELETE guard is intentionally NOT here — it references
-- master_claim_invitations, which is created in M2. It ships in M5, after the
-- invitation table exists. Application order: M0 -> M1 -> M2 -> M3 -> M4 -> M5.
--
-- Companion rollback: 2026-07-27_sp039_m1_master_origin_guards_rollback.sql
--
-- PRE-APPLY (read-only; STOP on any mismatch):
-- P1. origin column absent (expect 0 rows):
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='sauna_masters'
--     and column_name='origin';
-- P2. UPDATE guard is the SP-039 SEVEN-field body (mentions rating/review_count/
--     is_founding_partner, does NOT mention origin):
--   select prosrc from pg_proc
--   where pronamespace='public'::regnamespace
--     and proname='guard_master_privileged_columns';
-- P3. INSERT guard is the SP-035 level clamp (mentions level := 'guest', does
--     NOT mention origin):
--   select prosrc from pg_proc
--   where pronamespace='public'::regnamespace
--     and proname='guard_master_insert_level';
-- P4. Both triggers point at those functions (sauna_masters_guard BEFORE UPDATE,
--     sauna_masters_insert_guard BEFORE INSERT):
--   select tgname, tgtype from pg_trigger
--   where tgrelid='public.sauna_masters'::regclass and not tgisinternal;
-- ============================================================================
begin;

-- Fail loud unless BOTH guards are EXACTLY the confirmed production predecessors
-- (2026-07-28 preflight): the seven-field UPDATE guard and the level-only INSERT
-- guard. Protecting origin on top of an unknown/older body would be unsafe.
do $$
declare
  v_upd text;
  v_ins text;
begin
  -- UPDATE guard: confirmed seven-field body, no origin yet.
  select prosrc into v_upd from pg_proc
  where pronamespace = 'public'::regnamespace
    and proname = 'guard_master_privileged_columns';
  if v_upd is null then
    raise exception 'M1 GUARD: guard_master_privileged_columns not found; stop and review';
  end if;
  if position('is_founding_partner' in v_upd) = 0
     or position('new.rating' in v_upd) = 0
     or position('new.review_count' in v_upd) = 0 then
    raise exception 'M1 GUARD: UPDATE guard is not the SP-039 seven-field body; stop and review';
  end if;
  if position('origin' in v_upd) > 0 then
    raise exception 'M1 GUARD: UPDATE guard already references origin — already applied or drift; stop and review';
  end if;

  -- INSERT guard: confirmed level-only clamp, no origin yet.
  select prosrc into v_ins from pg_proc
  where pronamespace = 'public'::regnamespace
    and proname = 'guard_master_insert_level';
  if v_ins is null then
    raise exception 'M1 GUARD: guard_master_insert_level not found; stop and review';
  end if;
  if position('is_platform_moderator' in v_ins) = 0
     or position('new.level' in v_ins) = 0 then
    raise exception 'M1 GUARD: INSERT guard is not the SP-035 level-only clamp; stop and review';
  end if;
  if position('origin' in v_ins) > 0 then
    raise exception 'M1 GUARD: INSERT guard already references origin — already applied or drift; stop and review';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. origin column — additive, defaulted, vocabulary-pinned.
-- ---------------------------------------------------------------------------
alter table public.sauna_masters
  add column origin text not null default 'self_registered';

alter table public.sauna_masters
  add constraint sauna_masters_origin_check
  check (origin in ('self_registered', 'admin_prepared'));

-- ---------------------------------------------------------------------------
-- 2. UPDATE guard — add origin as the EIGHTH protected field. The existing
--    seven are reproduced VERBATIM; the generic approved message is unchanged.
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
     or new.origin is distinct from old.origin
  then
    raise exception
      'Pola uprzywilejowane profilu saunamistrza może zmieniać wyłącznie moderacja.';
  end if;

  return new;
end $$ language plpgsql security definer set search_path = '';
-- trigger sauna_masters_guard (SP-035) already points at this function.

-- ---------------------------------------------------------------------------
-- 3. INSERT guard — clamp origin to 'self_registered' for non-moderators, in
--    addition to the existing level := 'guest' clamp. Moderator inserts (admin
--    preparation) may set origin='admin_prepared' freely.
-- ---------------------------------------------------------------------------
create or replace function public.guard_master_insert_level()
returns trigger as $$
begin
  if not public.is_platform_moderator() then
    new.level := 'guest';
    new.origin := 'self_registered';
  end if;
  return new;
end $$ language plpgsql security definer set search_path = '';
-- trigger sauna_masters_insert_guard (SP-035) already points at this function.

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- POST-APPLY VERIFICATION
-- V1. Column + constraint present:
--   select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--   where table_schema='public' and table_name='sauna_masters' and column_name='origin';
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conrelid='public.sauna_masters'::regclass and conname='sauna_masters_origin_check';
--   -- expect: text NOT NULL default 'self_registered'; CHECK in the two values.
-- V2. UPDATE guard now has EIGHT protected fields (rolled-back impersonation of
--     a linked owner): update own city -> ok; update own origin -> 'Pola
--     uprzywilejowane...' exception; as moderator -> allowed. The original seven
--     probes (level/status/user_id/home_sauna_id/is_founding_partner/rating/
--     review_count) still raise for a non-moderator.
-- V3. INSERT guard clamp (rolled-back): a non-moderator INSERT with
--     origin='admin_prepared' lands as origin='self_registered' (and level
--     'guest'); a moderator INSERT with origin='admin_prepared' is preserved.
-- V4. Existing rows unchanged: select count(*) from public.sauna_masters
--     where origin <> 'self_registered';  -- expect 0 immediately after apply.
-- ROLLBACK LIMITATION: reverting restores the seven-field guard + level-only
-- insert clamp verbatim; DROPPING the origin column is DATA-LOSS and lives only
-- in the commented section of the rollback file.
-- ============================================================================
