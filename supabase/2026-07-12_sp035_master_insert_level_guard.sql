-- SP-035 DELTA (2026-07-12): master self-registration INSERT-level guard.
--
-- Context: SP-034 and the ORIGINAL SP-035 script
-- (supabase/2026-07-11_sp035_master_studio.sql) are ALREADY APPLIED to the
-- live database. Do NOT re-run the full SP-035 script.
--
-- This standalone, idempotent delta adds ONLY the piece introduced by the
-- post-review remediation and still missing from live: a BEFORE INSERT guard
-- on public.sauna_masters that stops a non-moderator (self-registration via
-- BecomeMasterForm, or a direct PostgREST/API insert) from assigning a
-- privileged `level`.
--
-- Why it is needed: the existing §2c guard (guard_master_privileged_columns)
-- is BEFORE UPDATE only (it reads OLD), so it does not cover INSERT. The live
-- masters_insert_self RLS policy allows a self-insert
-- (user_id = auth.uid() AND status = 'pending') without constraining `level`.
--
-- Behaviour: non-moderation inserts are pinned to the least-privileged
-- existing level ('guest'); moderation (is_platform_moderator = admin OR
-- moderator) is untouched and still sets the real level. Fires on INSERT only,
-- so it never modifies existing rows.
--
-- Dependency: public.is_platform_moderator() — created by the original SP-035
-- script and already present on live (verified). This delta does NOT recreate
-- it, nor any other SP-035 object (tables, policies, indexes, other triggers).

-- 1. Trigger function (idempotent: create or replace).
create or replace function public.guard_master_insert_level()
returns trigger as $$
begin
  if not public.is_platform_moderator() then
    new.level := 'guest';
  end if;
  return new;
end $$ language plpgsql security definer set search_path = public;

-- 2. BEFORE INSERT trigger (idempotent: drop if exists, then create).
drop trigger if exists sauna_masters_insert_guard on public.sauna_masters;
create trigger sauna_masters_insert_guard
  before insert on public.sauna_masters
  for each row execute function public.guard_master_insert_level();
