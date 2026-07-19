-- ============================================================================
-- SP-037 rev B — MASTER EVENT CREATION & PARTICIPATION (Slice 1: database)
-- ============================================================================
-- STATUS: PREPARED, NOT APPROVED FOR EXECUTION.
-- Design: docs/SP037_MASTER_EVENTS_ARCHITECTURE.md + Paweł's clarifications
-- of 2026-07-19 (edge cases 1–10). Rollback:
-- 2026-07-19_sp037b_rollback_functional.sql.
--
-- Read-only probe (2026-07-19, pre-migration):
--   * sauna_event_masters: initiated_by column absent (42703); 20 approved
--     rows visible publicly, invariant clean;
--   * sauna_events: 11 rows, all active, 1 future, 0 with organizer,
--     0 bundled — the new paths start from an empty state.
--
-- TRANSITION MATRIX (final; § numbers = sections below)
--   participation (sauna_event_masters):
--     initiated_by='master' : INSERT pending, role NULL (master, §3)
--         → approved (event staff / platform moderation*, role required)  [§4]
--         → rejected (same resolvers; role := NULL)                       [§4]
--         → DELETE by owning master while pending (withdrawal)            [§3]
--     initiated_by='facility': INSERT pending, role = OFFER (staff, §3)
--         → approved (invited master / platform moderation*; role frozen) [§4]
--         → rejected (same; role := NULL)                                 [§4]
--         → DELETE by inviting staff while pending (cancel)               [§3]
--     initiated_by NULL      : legacy/admin operator rows; admin policies
--                              only; same guard transitions as 'master'.
--     organizer pair rows    : born ONLY via trusted RPCs (§5–§7);
--                              'master'-initiated; unmanaged→approved at
--                              birth, managed/bundled→pending, resolved
--                              atomically with the event.
--   events (sauna_events):
--     master event @unmanaged: born active (§5); moderation override.
--     master event @managed  : born pending (§5) → resolve_master_event
--                              (§6) → active|rejected + organizer pair.
--     bundled (@own pending) : born pending (§5) → facility approval (§7)
--                              activates eligible + organizer pairs; new
--                              reject_facility_submission (§8) rejects
--                              bundled content deterministically.
--
-- (*) MODERATOR SEMANTICS — REVIEW FLAG: the guard's resolver checks widen
--     from is_admin() (rev 4) to is_platform_moderator(). This does NOT
--     broaden API authorization: the UPDATE policies (is_admin OR
--     is_event_staff OR invited-master arm) remain the row-access gate and
--     still deny non-admin moderators, exactly as rev 4 required. The
--     widening is needed so the facility-approval RPCs — which SP-036
--     grants to moderators by product rule — can atomically resolve the
--     bundled organizer pairs inside SECURITY DEFINER context (where RLS
--     is bypassed and the guard is the only check). Net effect: non-admin
--     moderators resolve participation ONLY through the self-checking
--     facility RPCs, never through generic UPDATE.
--
-- EDGE-CASE COVERAGE (Paweł 2026-07-19): (1) routing decided inside the
-- RPC transaction, never client-supplied; (2) is_sauna_managed counts
-- status='approved' managers only — pending managers do not manage;
-- (3) proposal at a facility that lost its manager: stays pending, master
-- may DELETE own organized event (deployed events_delete_master), admin
-- resolves; (4) resolution is pending-only and concurrency-safe (FOR
-- UPDATE + status='pending' predicates); (5–6) event_id, sauna_id,
-- organizer_master_id (SP-036 guard), master_id, initiated_by immutable
-- through normal workflows; (7) master requests carry no role while
-- pending; (8) invitations carry the offered valid role, frozen — the
-- master accepts/rejects exactly that role; (9) facility approval and
-- rejection touch ONLY bundled_with_submission rows of that facility and
-- their organizer pairs; (10) every RPC returns explicit resulting
-- statuses.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Handshake direction. NULL = legacy/admin operator rows (the 20
--    historical assignments and future admin direct inserts).
-- ---------------------------------------------------------------------------
alter table public.sauna_event_masters
  add column if not exists initiated_by text
    check (initiated_by in ('master', 'facility'));

-- ---------------------------------------------------------------------------
-- 2. Trigger body replacements (same trigger names, new contracts)
-- ---------------------------------------------------------------------------
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
  elsif new.status = 'pending' and new.initiated_by = 'facility' then
    -- invitation: the offered role is mandatory and vocabulary-checked
    if new.role is null
       or new.role not in ('lead', 'assistant', 'guest') then
      raise exception
        'Zaproszenie wymaga zaproponowania roli: lead, assistant lub guest';
    end if;
    new.approved_at := null;
  else
    new.approved_at := null;
    new.role := null;
  end if;
  return new;
end $$ language plpgsql security definer set search_path = '';

create or replace function public.guard_event_master_columns()
returns trigger as $$
begin
  -- identity immutable for everyone, no exceptions (edge cases 5–6)
  if new.event_id is distinct from old.event_id
     or new.master_id is distinct from old.master_id
     or new.initiated_by is distinct from old.initiated_by
  then
    raise exception 'Przypisania eventu nie można przenosić';
  end if;

  -- role rules: invitations carry a frozen offer (edge case 8); requests
  -- get their role only inside pending → approved
  if new.role is distinct from old.role then
    if old.initiated_by = 'facility' then
      raise exception
        'Rola zaproszenia jest stała — anuluj zaproszenie i wyślij nowe';
    elsif not (old.status = 'pending' and new.status = 'approved') then
      raise exception 'Rolę nadaje się wyłącznie przy zatwierdzaniu zgłoszenia';
    end if;
  end if;

  if new.status is distinct from old.status then
    if old.status = 'pending' and new.status in ('approved', 'rejected') then
      -- resolver depends on the handshake direction (edge case 6);
      -- is_platform_moderator (not is_admin) — see the header REVIEW FLAG:
      -- policies still gate API access, this only serves the trusted RPCs
      if old.initiated_by = 'facility' then
        if not (public.is_master_owner(old.master_id)
                or public.is_platform_moderator()) then
          raise exception
            'Zaproszenie rozstrzyga zaproszony saunamistrz lub moderacja';
        end if;
      else
        if not (public.is_event_staff(old.event_id)
                or public.is_platform_moderator()) then
          raise exception 'Zgłoszenie rozstrzyga obsada obiektu lub moderacja';
        end if;
      end if;
      if new.status = 'approved' then
        if new.role is null
           or new.role not in ('lead', 'assistant', 'guest') then
          raise exception 'Zatwierdzenie wymaga roli: lead, assistant lub guest';
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

-- ---------------------------------------------------------------------------
-- 3. Policy updates (POLICY MATRIX — final INSERT/DELETE arms)
--    INSERT: admin (any, operator exception) | master request
--            ('master', pending, no role) | staff invitation
--            ('facility', pending, offered role, approved target master)
--    DELETE: admin (any) | owning master ('master' pending — withdrawal)
--            | inviting staff ('facility' pending — cancel)
--    UPDATE: admin | event staff | invited master ('facility' rows) —
--            transitions constrained by the guard in §2
--    SELECT: unchanged (approved / own master / event staff / moderation)
-- ---------------------------------------------------------------------------
drop policy if exists event_masters_insert_request on public.sauna_event_masters;
create policy event_masters_insert_request on public.sauna_event_masters
  for insert with check (
    public.is_verified_master_owner(master_id)
    and status = 'pending'
    and initiated_by = 'master'
    and role is null
    and approved_at is null
    and exists (
      select 1 from public.sauna_events e
      where e.id = event_id
        and e.status = 'active'
        and e.event_date >= date_trunc('day', now())
    )
  );

create policy event_masters_insert_invitation on public.sauna_event_masters
  for insert with check (
    public.is_event_staff(event_id)
    and status = 'pending'
    and initiated_by = 'facility'
    and approved_at is null
    and role in ('lead', 'assistant', 'guest')
    and exists (
      select 1 from public.sauna_masters m
      where m.id = master_id and m.status = 'approved'
    )
    and exists (
      select 1 from public.sauna_events e
      where e.id = event_id
        and e.status = 'active'
        and e.event_date >= date_trunc('day', now())
    )
  );

create policy event_masters_update_invited on public.sauna_event_masters
  for update
  using (public.is_master_owner(master_id) and initiated_by = 'facility')
  with check (public.is_master_owner(master_id) and initiated_by = 'facility');

drop policy if exists event_masters_delete_own_pending on public.sauna_event_masters;
create policy event_masters_delete_own_pending on public.sauna_event_masters
  for delete using (
    public.is_master_owner(master_id)
    and status = 'pending'
    and initiated_by = 'master'
  );

create policy event_masters_delete_invitation on public.sauna_event_masters
  for delete using (
    public.is_event_staff(event_id)
    and status = 'pending'
    and initiated_by = 'facility'
  );

-- ---------------------------------------------------------------------------
-- 4. (No further policy changes — resolution UPDATE arms from SP-037 rev 4
--    remain: event_masters_update_admin, event_masters_update_staff.)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 5. create_master_event — the ONLY application path for master events.
--    Routing decided inside this transaction (edge cases 1–2); returns
--    explicit statuses (edge case 10).
-- ---------------------------------------------------------------------------
create or replace function public.create_master_event(
  p_sauna_id uuid,
  p_title text,
  p_event_date timestamptz,
  p_event_time time default null,
  p_price text default null,
  p_description text default null,
  p_max_participants integer default null,
  p_role text default 'lead',
  p_bundled boolean default false
) returns jsonb as $$
declare
  v_master uuid;
  v_sauna record;
  v_event_status text;
  v_part_status text;
  v_event_id uuid;
begin
  select id into v_master from public.sauna_masters
   where user_id = auth.uid() and status = 'approved';
  if v_master is null then
    raise exception 'Tylko zatwierdzony saunamistrz może tworzyć wydarzenia';
  end if;
  if p_title is null or btrim(p_title) = '' then
    raise exception 'Tytuł wydarzenia jest wymagany';
  end if;
  if p_event_date is null
     or p_event_date < pg_catalog.date_trunc('day', pg_catalog.now()) then
    raise exception 'Wydarzenie musi mieć dzisiejszą lub przyszłą datę';
  end if;
  if p_role is null or p_role not in ('lead', 'assistant', 'guest') then
    raise exception 'Rola organizatora: lead, assistant lub guest';
  end if;
  if p_max_participants is not null and p_max_participants < 1 then
    raise exception 'Limit miejsc musi być większy od zera';
  end if;

  select id, status, created_by into v_sauna
    from public.saunas where id = p_sauna_id;
  if v_sauna.id is null then
    raise exception 'Obiekt nie istnieje';
  end if;

  if p_bundled then
    if v_sauna.status <> 'pending'
       or v_sauna.created_by is distinct from auth.uid() then
      raise exception
        'Event dołączony można dodać tylko do własnego zgłoszenia obiektu';
    end if;
    v_event_status := 'pending';
    v_part_status := 'pending';
  elsif v_sauna.status <> 'active' then
    raise exception 'Wydarzenia można tworzyć tylko w zatwierdzonych obiektach';
  elsif public.is_sauna_managed(p_sauna_id) then
    v_event_status := 'pending';
    v_part_status := 'pending';
  else
    v_event_status := 'active';
    v_part_status := 'approved';
  end if;

  insert into public.sauna_events
    (sauna_id, title, description, event_date, event_time, price,
     max_participants, status, organizer_master_id, created_by,
     bundled_with_submission)
  values
    (p_sauna_id, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''),
     p_event_date, p_event_time, nullif(btrim(coalesce(p_price, '')), ''),
     p_max_participants, v_event_status, v_master, auth.uid(), p_bundled)
  returning id into v_event_id;

  insert into public.sauna_event_masters
    (event_id, master_id, status, role, initiated_by)
  values
    (v_event_id, v_master, v_part_status,
     case when v_part_status = 'approved' then p_role else null end,
     'master');

  return pg_catalog.jsonb_build_object(
    'event_id', v_event_id,
    'event_status', v_event_status,
    'participation_status', v_part_status);
end $$ language plpgsql security definer set search_path = '';

revoke all on function public.create_master_event(
  uuid, text, timestamptz, time, text, text, integer, text, boolean)
  from public, anon;
grant execute on function public.create_master_event(
  uuid, text, timestamptz, time, text, text, integer, text, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 6. resolve_master_event — atomic resolution of a master-event proposal
--    and its organizer pair (rule C; edge cases 3–4, 10). FOR UPDATE +
--    pending-only predicates make concurrent resolutions safe: the second
--    resolver gets a clean 'already resolved' error.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_master_event(
  p_event_id uuid,
  p_decision text,
  p_organizer_role text default 'lead'
) returns jsonb as $$
declare
  v_event record;
  v_part record;
  v_part_status text := 'absent';
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decyzja musi być approved albo rejected';
  end if;

  select id, sauna_id, organizer_master_id, status into v_event
    from public.sauna_events
   where id = p_event_id
   for update;
  if v_event.id is null or v_event.organizer_master_id is null then
    raise exception 'To nie jest propozycja wydarzenia saunamistrza';
  end if;
  if v_event.status <> 'pending' then
    raise exception 'Propozycja została już rozstrzygnięta';
  end if;
  if not (public.is_sauna_staff(v_event.sauna_id) or public.is_admin()) then
    raise exception 'Propozycję rozstrzyga obsada obiektu lub administrator';
  end if;
  if p_decision = 'approved'
     and (p_organizer_role is null
          or p_organizer_role not in ('lead', 'assistant', 'guest')) then
    raise exception 'Zatwierdzenie wymaga roli organizatora: lead, assistant lub guest';
  end if;

  update public.sauna_events
     set status = case p_decision when 'approved' then 'active'
                                  else 'rejected' end
   where id = p_event_id;

  select id, status into v_part
    from public.sauna_event_masters
   where event_id = p_event_id
     and master_id = v_event.organizer_master_id
   for update;

  if v_part.id is not null and v_part.status = 'pending' then
    if p_decision = 'approved' then
      update public.sauna_event_masters
         set status = 'approved', role = p_organizer_role
       where id = v_part.id;
    else
      update public.sauna_event_masters
         set status = 'rejected'
       where id = v_part.id;
    end if;
    v_part_status := p_decision;
  elsif v_part.id is not null then
    v_part_status := v_part.status; -- already resolved out-of-band by admin
  end if;

  return pg_catalog.jsonb_build_object(
    'event_id', p_event_id,
    'event_status', case p_decision when 'approved' then 'active'
                                    else 'rejected' end,
    'participation_status', v_part_status);
end $$ language plpgsql security definer set search_path = '';

revoke all on function public.resolve_master_event(uuid, text, text)
  from public, anon;
grant execute on function public.resolve_master_event(uuid, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 7. approve_facility_submission — EXTENDED (replaces the SP-036 body):
--    after activating eligible bundled events, atomically approves their
--    organizers' pending participation pairs (rule A). Deterministic
--    bundled scope only (edge case 9); explicit statuses (edge case 10).
-- ---------------------------------------------------------------------------
create or replace function public.approve_facility_submission(target_sauna_id uuid)
returns jsonb as $$
declare
  v_activated uuid[];
  v_skipped uuid[];
  v_participations integer := 0;
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

  update public.sauna_event_masters p
     set status = 'approved',
         role = coalesce(p.role, 'lead')
    from public.sauna_events e
   where p.event_id = any(v_activated)
     and e.id = p.event_id
     and p.master_id = e.organizer_master_id
     and p.status = 'pending';
  get diagnostics v_participations = row_count;

  select coalesce(array_agg(e.id), '{}') into v_skipped
  from public.sauna_events e
  where e.sauna_id = target_sauna_id
    and e.bundled_with_submission = true
    and e.status = 'pending';

  return pg_catalog.jsonb_build_object(
    'facility_status', 'active',
    'activated_event_ids', pg_catalog.to_jsonb(v_activated),
    'skipped_event_ids', pg_catalog.to_jsonb(v_skipped),
    'approved_participations', v_participations);
end $$ language plpgsql security definer set search_path = '';

-- (grants unchanged from SP-036: authenticated only)

-- ---------------------------------------------------------------------------
-- 8. reject_facility_submission — NEW: rejects the facility and,
--    deterministically, ONLY its bundled pending events + their organizer
--    pairs (closes the orphaned-bundled gap; edge cases 9–10).
-- ---------------------------------------------------------------------------
create or replace function public.reject_facility_submission(target_sauna_id uuid)
returns jsonb as $$
declare
  v_rejected uuid[];
  v_participations integer := 0;
begin
  if not public.is_platform_moderator() then
    raise exception 'Zgłoszenia obiektów odrzuca tylko moderacja';
  end if;

  update public.saunas
    set status = 'rejected'
    where id = target_sauna_id and status = 'pending';
  if not found then
    raise exception 'Obiekt nie istnieje albo nie oczekuje na moderację';
  end if;

  with rejected as (
    update public.sauna_events e
      set status = 'rejected'
      where e.sauna_id = target_sauna_id
        and e.bundled_with_submission = true
        and e.status = 'pending'
      returning e.id, e.organizer_master_id
  )
  , parts as (
    update public.sauna_event_masters p
       set status = 'rejected'
      from rejected r
     where p.event_id = r.id
       and p.master_id = r.organizer_master_id
       and p.status = 'pending'
    returning p.id
  )
  select coalesce((select array_agg(id) from rejected), '{}'),
         coalesce((select count(*) from parts), 0)
    into v_rejected, v_participations;

  return pg_catalog.jsonb_build_object(
    'facility_status', 'rejected',
    'rejected_event_ids', pg_catalog.to_jsonb(v_rejected),
    'rejected_participations', v_participations);
end $$ language plpgsql security definer set search_path = '';

revoke all on function public.reject_facility_submission(uuid) from public, anon;
grant execute on function public.reject_facility_submission(uuid) to authenticated;

commit;

-- ============================================================================
-- VERIFICATION SUITE (run in order after manual apply)
-- ============================================================================
-- W1 (SQL, read-only): policy inventory —
--   select policyname, cmd from pg_policies
--   where tablename='sauna_event_masters' order by cmd, policyname;
--   -- expect: delete ×3, insert ×3, select ×1, update ×3
-- W2 (SQL, read-only): column present; data untouched —
--   select count(*) filter (where initiated_by is null) as legacy,
--          count(*) from public.sauna_event_masters;   -- 20, 20
-- W3 (SQL, postgres — INSERT trigger): invitation without role →
--   insert into public.sauna_event_masters (event_id, master_id, status, initiated_by)
--   select e.id, m.id, 'pending', 'facility' from public.sauna_events e,
--     public.sauna_masters m limit 1;
--   -- expect ERROR 'Zaproszenie wymaga zaproponowania roli...'
-- W4 (SQL, postgres): create_master_event self-validation —
--   select public.create_master_event(gen_random_uuid(), 'x', now());
--   -- expect ERROR 'Tylko zatwierdzony saunamistrz...' (auth.uid() NULL)
-- W5 (SQL, postgres): resolve_master_event on a non-proposal —
--   select public.resolve_master_event(
--     (select id from public.sauna_events limit 1), 'approved');
--   -- expect ERROR 'To nie jest propozycja wydarzenia saunamistrza'
-- W6 (anon, PostgREST): rpc/create_master_event → permission denied;
--   rpc/resolve_master_event → permission denied;
--   rpc/reject_facility_submission → permission denied;
--   sauna_event_masters?select=* keys unchanged (+ initiated_by, no UUIDs);
--   map RPC still 200 (no new function is referenced by any SELECT policy).
-- W7 (invariant sweep, extended):
--   select count(*) from public.sauna_event_masters
--   where (status='approved' and (approved_at is null or role is null
--            or role not in ('lead','assistant','guest')))
--      or (status<>'approved' and approved_at is not null)
--      or (status='pending' and initiated_by='facility'
--            and (role is null or role not in ('lead','assistant','guest')))
--      or (status='pending' and (initiated_by='master' or initiated_by is null)
--            and role is not null);
--   -- expect 0
-- W8 (session tests — application phase / E2E): request vs invitation
--   resolution sides, invitation role frozen, concurrent double-resolve
--   (second gets 'już rozstrzygnięta'), moderator-without-admin denied at
--   the policy layer for generic UPDATE.
-- ============================================================================
