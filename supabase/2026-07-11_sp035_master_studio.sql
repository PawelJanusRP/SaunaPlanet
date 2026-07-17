-- SP-035: Master Studio Foundation — profile integrity + master affiliations.
--
-- Run in the Supabase SQL Editor. Additive and non-destructive except for
-- replacing the write policies on sauna_masters, which is the point: the
-- live UPDATE policy is USING (true) (REPOSITORY_AUDIT §8.1) — any
-- authenticated user can edit any master profile. Policy names on the live
-- DB are not version-controlled, so write policies are dropped by catalog
-- lookup and recreated deterministically.
--
-- BEFORE RUNNING — integrity report. If this returns rows, the unique index
-- below will fail (by design, fail-loud): resolve duplicates manually first
-- (keep the profile the person actually uses, NULL the user_id on the rest).
--
--   select user_id, count(*) as profiles, array_agg(id) as master_ids
--   from public.sauna_masters
--   where user_id is not null
--   group by user_id
--   having count(*) > 1;

-- ============================================================
-- 1. Helper functions (SECURITY DEFINER, pinned search_path)
-- ============================================================

-- Global moderation check. The capability matrix (USER_MODEL §4.1) gives
-- master-profile editing to moderator AND admin; is_admin() covers only
-- admin, hence a dedicated helper instead of widening is_admin().
create or replace function public.is_platform_moderator()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('moderator', 'admin')
  )
$$ language sql security definer stable set search_path = public;

-- "Does the current account own this master profile?" — the Layer-3 link
-- (USER_MODEL §3.1). NEVER derived from home_sauna_id.
create or replace function public.is_master_owner(target_master_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.sauna_masters
    where id = target_master_id
      and user_id is not null
      and user_id = auth.uid()
  )
$$ language sql security definer stable set search_path = public;

-- Re-asserted from the SP-034 script so the two files can run in any order.
create or replace function public.is_sauna_staff(target_sauna_id uuid)
returns boolean as $$
  select exists (
    select 1 from public.sauna_managers
    where user_id = auth.uid()
      and sauna_id = target_sauna_id
      and status = 'approved'
  )
$$ language sql security definer stable set search_path = public;

-- ============================================================
-- 2. sauna_masters — profile integrity (USER_MODEL §6.1–6.2, gap G4)
-- ============================================================

-- 2a. One account ↔ at most one master profile (both directions:
--     the column is the link, the unique index makes it 1:1).
create unique index if not exists sauna_masters_user_id_unique
  on public.sauna_masters (user_id)
  where user_id is not null;

-- 2b. Replace ALL live INSERT/UPDATE policies with deterministic ones.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public'
      and tablename = 'sauna_masters'
      and cmd in ('INSERT', 'UPDATE')
  loop
    execute format('drop policy %I on public.sauna_masters', p.policyname);
  end loop;
end $$;

-- Self-registration: only for yourself, only as pending. Moderation may
-- create profiles freely (admin panel, historical unlinked profiles).
create policy masters_insert_self on public.sauna_masters
  for insert
  with check (
    public.is_platform_moderator()
    or (user_id = auth.uid() and status = 'pending')
  );

-- A master edits only the profile linked to their own account.
create policy masters_update_own on public.sauna_masters
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy masters_update_moderation on public.sauna_masters
  for update
  using (public.is_platform_moderator())
  with check (public.is_platform_moderator());

-- 2c. Privileged columns stay with moderation even on own rows:
--     level implies certification (USER_MODEL §2.4), status is the
--     moderation lifecycle, user_id is the authorization link itself,
--     home_sauna_id is frozen legacy (Decision 016 — no new writes).
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

drop trigger if exists sauna_masters_guard on public.sauna_masters;
create trigger sauna_masters_guard
  before update on public.sauna_masters
  for each row execute function public.guard_master_privileged_columns();

-- 2d. Level on INSERT: the §2c guard is UPDATE-only (it reads OLD), so a
--     direct API insert could still set an arbitrary level while self-
--     registering (masters_insert_self allows any level). Pin non-moderation
--     inserts to the least-privileged level; moderation sets the real level at
--     approval. Defense-in-depth behind the BecomeMasterForm change.
create or replace function public.guard_master_insert_level()
returns trigger as $$
begin
  if not public.is_platform_moderator() then
    new.level := 'guest';
  end if;
  return new;
end $$ language plpgsql security definer set search_path = public;

drop trigger if exists sauna_masters_insert_guard on public.sauna_masters;
create trigger sauna_masters_insert_guard
  before insert on public.sauna_masters
  for each row execute function public.guard_master_insert_level();

-- ============================================================
-- 3. master_affiliations — first-class relationship (Decision 016, W-16)
-- ============================================================
-- Minimal, extensible schema: lifecycle + origin + primary flag. Documented
-- future aspects (type, verification, start/end semantics beyond ended_at,
-- session/event permissions, trust level) are deliberately NOT columns yet.
-- No 'owner' role here — ownership/management stay in sauna_managers.

create table if not exists public.master_affiliations (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null references public.sauna_masters(id) on delete cascade,
  sauna_id uuid not null references public.saunas(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'ended')),
  -- who opened the handshake; the other side resolves it
  initiated_by text not null check (initiated_by in ('master', 'facility')),
  -- successor of home_sauna_id; meaningful only while approved
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  ended_at timestamptz,
  constraint master_affiliations_primary_approved
    check (not is_primary or status = 'approved')
);

-- one open (pending/approved) relationship per master↔facility pair
create unique index if not exists master_affiliations_open_unique
  on public.master_affiliations (master_id, sauna_id)
  where status in ('pending', 'approved');

-- at most one primary affiliation per master
create unique index if not exists master_affiliations_primary_unique
  on public.master_affiliations (master_id)
  where is_primary;

create index if not exists master_affiliations_sauna_idx
  on public.master_affiliations (sauna_id);
create index if not exists master_affiliations_master_idx
  on public.master_affiliations (master_id);

alter table public.master_affiliations enable row level security;

-- Approved affiliations are public content (rosters, profiles); anything
-- else is visible only to the two parties and moderation.
drop policy if exists affiliations_select on public.master_affiliations;
create policy affiliations_select on public.master_affiliations
  for select
  using (
    status = 'approved'
    or public.is_master_owner(master_id)
    or public.is_sauna_staff(sauna_id)
    or public.is_platform_moderator()
  );

-- Each side may open the handshake only from its own side, only as pending.
drop policy if exists affiliations_insert on public.master_affiliations;
create policy affiliations_insert on public.master_affiliations
  for insert
  with check (
    status = 'pending'
    and (
      public.is_platform_moderator()
      or (initiated_by = 'master' and public.is_master_owner(master_id))
      or (initiated_by = 'facility' and public.is_sauna_staff(sauna_id))
    )
  );

-- Row access for updates: the two parties + moderation. WHICH transitions
-- are legal per side is enforced by the trigger below — the DB, not the
-- server action, is the boundary.
drop policy if exists affiliations_update on public.master_affiliations;
create policy affiliations_update on public.master_affiliations
  for update
  using (
    public.is_master_owner(master_id)
    or public.is_sauna_staff(sauna_id)
    or public.is_platform_moderator()
  )
  with check (
    public.is_master_owner(master_id)
    or public.is_sauna_staff(sauna_id)
    or public.is_platform_moderator()
  );

-- Lifecycle uses status, never row deletion.
drop policy if exists affiliations_delete on public.master_affiliations;
create policy affiliations_delete on public.master_affiliations
  for delete
  using (public.is_platform_moderator());

-- Transition rules (W-16): the receiving side decides, the initiator may
-- withdraw, either side may end an active affiliation, only the master
-- picks the primary. Moderation may do anything.
create or replace function public.guard_affiliation_transition()
returns trigger as $$
begin
  if public.is_platform_moderator() then
    return new;
  end if;

  if new.master_id <> old.master_id
     or new.sauna_id <> old.sauna_id
     or new.initiated_by <> old.initiated_by
     or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at
  then
    raise exception 'Tych pól afiliacji nie można zmieniać';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'pending' and new.status in ('approved', 'rejected') then
      if old.initiated_by = 'master' and not public.is_sauna_staff(old.sauna_id) then
        raise exception 'Zgłoszenie mistrza rozstrzyga obiekt';
      end if;
      if old.initiated_by = 'facility' and not public.is_master_owner(old.master_id) then
        raise exception 'Zaproszenie obiektu rozstrzyga saunamistrz';
      end if;
    elsif old.status = 'pending' and new.status = 'ended' then
      -- withdrawal: only the side that opened the handshake
      if old.initiated_by = 'master' and not public.is_master_owner(old.master_id) then
        raise exception 'Zgłoszenie może wycofać tylko saunamistrz';
      end if;
      if old.initiated_by = 'facility' and not public.is_sauna_staff(old.sauna_id) then
        raise exception 'Zaproszenie może wycofać tylko obiekt';
      end if;
    elsif old.status = 'approved' and new.status = 'ended' then
      null; -- either party (both already pass the UPDATE policy)
    else
      raise exception 'Niedozwolona zmiana statusu afiliacji (% -> %)', old.status, new.status;
    end if;
  end if;

  -- setting primary: master only, on an approved affiliation;
  -- clearing primary is harmless (needed when an affiliation ends)
  if new.is_primary and not old.is_primary then
    if not public.is_master_owner(new.master_id) then
      raise exception 'Afiliację główną wybiera saunamistrz';
    end if;
    if new.status <> 'approved' then
      raise exception 'Główną może być tylko aktywna afiliacja';
    end if;
  end if;

  return new;
end $$ language plpgsql security definer set search_path = public;

drop trigger if exists master_affiliations_guard on public.master_affiliations;
create trigger master_affiliations_guard
  before update on public.master_affiliations
  for each row execute function public.guard_affiliation_transition();

-- ============================================================
-- 4. home_sauna_id — deferred migration (documented, not executed)
-- ============================================================
-- Existing home_sauna_id values are NOT auto-converted to affiliations:
-- an approved affiliation is (future) standing consent to publish sessions,
-- and home_sauna_id was set by admins without any facility consent
-- semantics. Masters request affiliations themselves from the Studio; the
-- column stays read-only legacy display data until every master has real
-- affiliations, then retires (Decision 016). The trigger in §2c freezes it
-- against non-moderation writes.

notify pgrst, 'reload schema';
