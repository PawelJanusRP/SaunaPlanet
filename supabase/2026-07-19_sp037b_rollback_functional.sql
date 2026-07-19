-- ============================================================================
-- SP-037 rev B — FUNCTIONAL WORKFLOW ROLLBACK, PRESERVING DATA-INTEGRITY
-- HARDENING
-- ============================================================================
-- Restores the deployed SP-037 rev-4 state: removes master-event creation,
-- proposal resolution and invitations while keeping every prior hardening
-- (tightened SELECT, uniform guard, INSERT normalization, admin operator
-- workflow, SP-037 request/resolve machine). The initiated_by column stays
-- (inert; rows born with it keep their value — dropping it could destroy
-- workflow data created between apply and rollback).
--
-- In-flight data: pending master-event proposals stay pending (invisible
-- publicly; organizer may delete own event, admin resolves); pending
-- invitations become unreachable rows an admin resolves or deletes.
-- ============================================================================

begin;

-- 1. Drop rev-B RPCs; restore the SP-036 approve_facility_submission body
drop function if exists public.create_master_event(
  uuid, text, timestamptz, time, text, text, integer, boolean);
drop function if exists public.resolve_master_event(uuid, text, text);
drop function if exists public.reject_facility_submission(uuid);

create or replace function public.approve_facility_submission(target_sauna_id uuid)
returns jsonb as $$
declare
  v_activated uuid[];
  v_skipped uuid[];
begin
  if not public.is_platform_moderator() then
    raise exception 'Zgłoszenia obiektów zatwierdza tylko moderacja';
  end if;

  update public.saunas
    set status = 'active'
    where id = target_sauna_id and status = 'pending';
  if not found then
    raise exception 'Obiekt nie istnieje albo nie oczekuje na moderację';
  end if;

  with activated as (
    update public.sauna_events e
      set status = 'active'
      where e.sauna_id = target_sauna_id
        and e.bundled_with_submission = true
        and e.status = 'pending'
        and e.event_date >= pg_catalog.date_trunc('day', pg_catalog.now())
        and exists (select 1 from public.sauna_masters m
                    where m.id = e.organizer_master_id
                      and m.status = 'approved')
      returning e.id
  )
  select coalesce(array_agg(id), '{}') into v_activated from activated;

  select coalesce(array_agg(e.id), '{}') into v_skipped
  from public.sauna_events e
  where e.sauna_id = target_sauna_id
    and e.bundled_with_submission = true
    and e.status = 'pending';

  return pg_catalog.jsonb_build_object(
    'activated_event_ids', pg_catalog.to_jsonb(v_activated),
    'skipped_event_ids', pg_catalog.to_jsonb(v_skipped));
end $$ language plpgsql security definer set search_path = '';

-- 2. Drop invitation policies; restore the rev-4 request/withdrawal arms
drop policy if exists event_masters_insert_invitation on public.sauna_event_masters;
drop policy if exists event_masters_update_invited on public.sauna_event_masters;
drop policy if exists event_masters_delete_invitation on public.sauna_event_masters;

drop policy if exists event_masters_insert_request on public.sauna_event_masters;
create policy event_masters_insert_request on public.sauna_event_masters
  for insert with check (
    public.is_verified_master_owner(master_id)
    and status = 'pending'
    and role is null
    and approved_at is null
    and exists (
      select 1 from public.sauna_events e
      where e.id = event_id
        and e.status = 'active'
        and e.event_date >= date_trunc('day', now())
    )
  );

drop policy if exists event_masters_delete_own_pending on public.sauna_event_masters;
create policy event_masters_delete_own_pending on public.sauna_event_masters
  for delete using (
    public.is_master_owner(master_id) and status = 'pending'
  );

-- 3. Restore the rev-4 trigger bodies (initiated_by-agnostic; resolver =
--    event staff OR admin, per the rev-4 contract)
create or replace function public.normalize_event_master_insert()
returns trigger as $$
begin
  if new.status = 'approved' then
    if new.role is null
       or new.role not in ('lead', 'assistant', 'guest') then
      raise exception
        'Zatwierdzone przypisanie wymaga roli: lead, assistant lub guest';
    end if;
    new.approved_at := now();
  else
    new.approved_at := null;
    new.role := null;
  end if;
  return new;
end $$ language plpgsql security definer set search_path = '';

create or replace function public.guard_event_master_columns()
returns trigger as $$
begin
  if new.event_id is distinct from old.event_id
     or new.master_id is distinct from old.master_id
  then
    raise exception 'Przypisania eventu nie można przenosić';
  end if;

  if new.role is distinct from old.role
     and not (old.status = 'pending' and new.status = 'approved')
  then
    raise exception 'Rolę nadaje się wyłącznie przy zatwierdzaniu zgłoszenia';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'pending' and new.status in ('approved', 'rejected') then
      if not (public.is_event_staff(old.event_id) or public.is_admin()) then
        raise exception 'Zgłoszenie rozstrzyga obsada obiektu lub administrator';
      end if;
      if new.status = 'approved' then
        if new.role is null
           or new.role not in ('lead', 'assistant', 'guest') then
          raise exception
            'Zatwierdzenie wymaga roli: lead, assistant lub guest';
        end if;
        new.approved_at := now();
      else
        new.approved_at := null;
        new.role := null;
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

commit;

-- Post-rollback check: policy inventory should read delete ×2, insert ×2,
-- select ×1, update ×2 (the rev-4 state); the initiated_by column remains.
