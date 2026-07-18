-- ============================================================================
-- SP-037 — MASTER EVENT PARTICIPATION: DATABASE MIGRATION
-- ============================================================================
-- STATUS: PREPARED, NOT APPROVED FOR EXECUTION. Apply manually in the SQL
-- Editor after review. Rollback: 2026-07-19_sp037_rollback_functional.sql.
--
-- Probe findings this script relies on (read-only, 2026-07-19, via the
-- still-public SELECT policy):
--   * 20 rows total, ALL status='approved' (roles: lead 17, assistant 2,
--     guest 1) — no pending/rejected rows exist yet;
--   * 0 duplicate (event_id, master_id) pairs among pending/approved →
--     the partial unique index is safe to create;
--   * 0 orphaned refs (NOT NULL + FK CASCADE), 0 inconsistencies (no
--     approved assignment with a non-approved master or non-active event);
--   * all 20 rows belong to PAST events — legitimate history (portfolio,
--     past lineups); they satisfy the new policies and index unchanged;
--   * no application query depends on public access to non-approved rows
--     (every read surface filters status='approved': /events/[id],
--     /sauna/[id] ×2, /masters/[id], get_saunas_nearby).
--
-- KNOWN LIMITATION (accepted for MVP, per review): withdrawal DELETEs the
-- owned pending row — request history is lost. No 'withdrawn' state in
-- this sprint; if history becomes a requirement, a later sprint converts
-- withdrawal to a status value.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Audit column: who created the row (master request or admin assignment).
--    Existing 20 rows stay NULL — historical admin assignments, no
--    retroactive authorship claimed. Default is a convenience, not a
--    control: the request INSERT policy independently requires
--    created_by = auth.uid(), and the guard trigger freezes it afterward.
-- ---------------------------------------------------------------------------
alter table public.sauna_event_masters
  add column if not exists created_by uuid
    references auth.users(id) on delete set null;
alter table public.sauna_event_masters
  alter column created_by set default auth.uid();

-- ---------------------------------------------------------------------------
-- 2. One open request/assignment per (event, master). Partial: a rejected
--    request does not block a later re-request or an admin assignment.
--    Probe confirmed zero conflicting pairs in production.
-- ---------------------------------------------------------------------------
create unique index if not exists sauna_event_masters_active_unique
  on public.sauna_event_masters (event_id, master_id)
  where status in ('pending', 'approved');

-- ---------------------------------------------------------------------------
-- 3. Helper: is the caller approved staff of the event's facility?
--    (SECURITY DEFINER is necessary: sauna_managers rows of other users
--    are not visible to the caller under RLS.)
-- ---------------------------------------------------------------------------
create or replace function public.is_event_staff(target_event_id uuid)
returns boolean as $$
  select exists (
    select 1
    from public.sauna_events e
    join public.sauna_managers m on m.sauna_id = e.sauna_id
    where e.id = target_event_id
      and m.user_id = auth.uid()
      and m.status = 'approved'
  )
$$ language sql security definer stable set search_path = '';

revoke all on function public.is_event_staff(uuid) from public, anon;
grant execute on function public.is_event_staff(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Deterministic policy replacement on sauna_event_masters.
--    Replaces (live baseline after SP-036 §12a): event_masters_select +
--    "Allow public read sauna event masters" (both SELECT true),
--    event_masters_insert (is_admin), event_masters_update (is_admin),
--    event_masters_delete (is_admin).
-- ---------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'sauna_event_masters'
  loop
    execute format('drop policy %I on public.sauna_event_masters', pol.policyname);
  end loop;
end $$;

-- Public sees approved lineups only; masters see their own requests; staff
-- see requests within their managed event scope; moderation sees all.
create policy event_masters_select on public.sauna_event_masters
  for select using (
    status = 'approved'
    or public.is_master_owner(master_id)
    or public.is_event_staff(event_id)
    or public.is_platform_moderator()
  );

-- Existing administrative direct-assignment workflow (client inserts with
-- status='approved') continues to work unchanged.
create policy event_masters_insert_admin on public.sauna_event_masters
  for insert with check (public.is_admin());

-- Master participation request: own approved profile, pending-only,
-- self-attributed, no pre-set approval timestamp, target event active and
-- not past (date-level check; timezone nuance accepted for a warn-level
-- gate — the resolving staff sees the event either way).
create policy event_masters_insert_request on public.sauna_event_masters
  for insert with check (
    public.is_verified_master_owner(master_id)
    and status = 'pending'
    and created_by = auth.uid()
    and approved_at is null
    and exists (
      select 1 from public.sauna_events e
      where e.id = event_id
        and e.status = 'active'
        and e.event_date >= date_trunc('day', now())
    )
  );

create policy event_masters_update_admin on public.sauna_event_masters
  for update using (public.is_admin()) with check (public.is_admin());
create policy event_masters_update_staff on public.sauna_event_masters
  for update using (public.is_event_staff(event_id))
  with check (public.is_event_staff(event_id));

create policy event_masters_delete_admin on public.sauna_event_masters
  for delete using (public.is_admin());
-- Withdrawal while pending (MVP: deletes request history — documented
-- limitation, no 'withdrawn' state this sprint).
create policy event_masters_delete_own_pending on public.sauna_event_masters
  for delete using (
    public.is_master_owner(master_id) and status = 'pending'
  );

-- ---------------------------------------------------------------------------
-- 5. Guard trigger — trusted resolution logic at the database boundary.
--    * event_id / master_id / created_by frozen after insertion (everyone
--      except platform moderation);
--    * approved_at is NEVER client-controlled: the trigger assigns it on
--      approval and clears it on rejection; any other change is refused;
--    * staff transitions are limited to pending → approved / rejected;
--    * masters have no UPDATE policy at all — this trigger is defense in
--      depth on top of that, and also constrains staff.
-- ---------------------------------------------------------------------------
create or replace function public.guard_event_master_columns()
returns trigger as $$
begin
  if public.is_platform_moderator() then
    -- moderation keeps full access, but approved_at still follows status
    if new.status = 'rejected' then new.approved_at := null; end if;
    if new.status = 'approved' and old.status is distinct from 'approved'
       and new.approved_at is null then
      new.approved_at := now();
    end if;
    return new;
  end if;

  if new.event_id is distinct from old.event_id
     or new.master_id is distinct from old.master_id
     or new.created_by is distinct from old.created_by
  then
    raise exception 'Przypisania eventu nie można przenosić';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'pending' and new.status in ('approved', 'rejected') then
      if not public.is_event_staff(old.event_id) then
        raise exception 'Zgłoszenie rozstrzyga obsada obiektu lub moderacja';
      end if;
      -- trusted timestamp logic
      if new.status = 'approved' then
        new.approved_at := now();
      else
        new.approved_at := null;
      end if;
    else
      raise exception 'Niedozwolona zmiana statusu zgłoszenia (% -> %)',
        old.status, new.status;
    end if;
  elsif new.approved_at is distinct from old.approved_at then
    raise exception 'Znacznika zatwierdzenia nie można zmieniać';
  end if;

  return new;
end $$ language plpgsql security definer set search_path = '';

drop trigger if exists sauna_event_masters_guard on public.sauna_event_masters;
create trigger sauna_event_masters_guard
  before update on public.sauna_event_masters
  for each row execute function public.guard_event_master_columns();

commit;

-- ============================================================================
-- POST-APPLY VERIFICATION (read-only unless marked)
-- ============================================================================
-- V1. Policy inventory:
--   select policyname, cmd from pg_policies
--   where tablename = 'sauna_event_masters' order by cmd, policyname;
--   -- expect exactly: select ×1, insert ×2, update ×2, delete ×2
-- V2. Data untouched: select status, count(*) from sauna_event_masters
--   group by status;  -- approved, 20
-- V3. Index: select indexname from pg_indexes
--   where tablename = 'sauna_event_masters';
--   -- includes sauna_event_masters_active_unique
-- V4. As anon (PostgREST): sauna_event_masters?status=neq.approved →
--   0 rows (today it returns them — that is the leak being closed).
-- V5. As a verified master (app/API): INSERT pending on an active future
--   event → OK; INSERT with status='approved' → RLS violation; duplicate
--   request for the same event → unique violation; DELETE own pending →
--   OK; UPDATE own row → no row matched (no policy).
-- V6. As staff of the event's sauna: UPDATE pending → approved sets
--   approved_at automatically; → rejected clears it; approved → pending →
--   exception; changing approved_at alone → exception.
-- ============================================================================
