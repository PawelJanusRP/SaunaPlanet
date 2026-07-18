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
--
-- REVIEW REV 2 (2026-07-19) — resolved findings:
--   1. NO created_by column. RLS filters rows, not columns — approved rows
--      are publicly selectable, so an auth-user UUID column would leak via
--      PostgREST select=*. The column is not strictly required: requester
--      identity is carried by master_id (linked to the account through
--      sauna_masters.user_id, enforced by is_verified_master_owner at
--      INSERT and is_master_owner at DELETE). Decision-log audit metadata,
--      if ever needed, goes to a separate non-public table in a later
--      sprint. Result: the table exposes NO auth.users UUID in any column
--      (master_id/event_id are public-entity ids by design).
--   2. event_id / master_id are immutable FOR EVERYONE — no moderation
--      exception in the trigger. Identity repair = the existing explicit
--      admin procedure outside the workflow: DELETE (admin policy) +
--      re-INSERT (admin direct assignment).
--   3. role contract: master requests carry role = NULL (pinned by the
--      INSERT policy); role may change ONLY inside the trusted
--      pending → approved transition (staff/admin choose it while
--      approving); approved/rejected rows have immutable roles for every
--      actor — historical role corrections use the same admin
--      delete + re-insert repair path.
--
-- REVIEW REV 3 (2026-07-19) — final boundary conditions:
--   * INSERT-time normalization trigger added: approved rows ALWAYS get a
--     trusted approved_at := now() (caller-supplied values are
--     overwritten) and MUST carry a non-null role; non-approved rows are
--     normalized to approved_at = NULL and role = NULL. This keeps the
--     admin direct-assignment tool working unchanged while enforcing the
--     invariant "approved ⇔ trusted timestamp + defined role".
--   * pending → approved REQUIRES a non-null role (loud error otherwise);
--     pending → rejected forces role = NULL and approved_at = NULL; an
--     attempted role assignment during rejection fails loudly at the
--     role gate.
--   * Admin resolution does NOT require event-staff membership: the
--     UPDATE policies are OR-ed (is_admin OR is_event_staff) and the
--     transition guard accepts is_event_staff OR is_platform_moderator.
--   * Role vocabulary: ENFORCED IN TRUSTED DATABASE LOGIC (rev 4) —
--     approved rows require role IN ('lead','assistant','guest') at both
--     INSERT normalization and pending → approved resolution; any other
--     value fails loudly. pending/rejected rows keep role IS NULL.
--     Compatible with production data (probe 2026-07-19: all 20 rows use
--     exactly these values — lead 17 / assistant 2 / guest 1).
--   * Moderator semantics (rev 4): resolution = event staff (own events)
--     or ADMIN (any request). A non-admin platform moderator has NO
--     UPDATE policy on this table (policies are is_admin OR
--     is_event_staff — row access is the gate, not the trigger) and the
--     trigger's transition check now uses is_admin() as well, keeping
--     both layers identical.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. One open request/assignment per (event, master). Partial: a rejected
--    request does not block a later re-request or an admin assignment.
--    Probe confirmed zero conflicting pairs in production.
-- ---------------------------------------------------------------------------
create unique index if not exists sauna_event_masters_active_unique
  on public.sauna_event_masters (event_id, master_id)
  where status in ('pending', 'approved');

-- ---------------------------------------------------------------------------
-- 2. Helper: is the caller approved staff of the event's facility?
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

revoke all on function public.is_event_staff(uuid) from public;
-- IMPORTANT (post-apply incident, 2026-07-19): anon MUST keep EXECUTE.
-- RLS policies run in the caller's context, and this helper is referenced
-- by the SELECT policy below — revoking it from anon made every anonymous
-- read of sauna_event_masters (including the public map RPC, which joins
-- the table) fail with "permission denied for function is_event_staff".
-- Hotfixed live with this grant. For anon the function merely returns
-- false (auth.uid() is null) — nothing is exposed.
grant execute on function public.is_event_staff(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Deterministic policy replacement on sauna_event_masters.
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

-- Master participation request: own approved profile, pending-only, no
-- role proposal (role = NULL — staff assigns it at approval), no pre-set
-- approval timestamp, target event active and not past (date-level check;
-- timezone nuance accepted for a warn-level gate — the resolving staff
-- sees the event either way).
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
-- 4. Guard trigger — a UNIFORM state machine at the database boundary,
--    with NO moderation bypass (review rev 2):
--    * event_id / master_id frozen after insertion for EVERYONE; identity
--      repair = explicit admin procedure outside the workflow (DELETE +
--      re-INSERT via the admin policies);
--    * the only legal status transitions, for every actor, are
--      pending → approved and pending → rejected, performed by event
--      staff or platform moderation (admin);
--    * approved_at is owned by this trigger: set to now() on approval,
--      forced NULL on rejection, immutable otherwise — never
--      client-controlled for anyone;
--    * role may change ONLY inside the pending → approved transition
--      (the approver assigns it); immutable in every other update, for
--      every actor — approved/rejected history cannot be rewritten;
--    * masters have no UPDATE policy at all — this trigger is defense in
--      depth on top of the policy layer.
-- ---------------------------------------------------------------------------
create or replace function public.guard_event_master_columns()
returns trigger as $$
begin
  -- identity: immutable for everyone, no exceptions
  if new.event_id is distinct from old.event_id
     or new.master_id is distinct from old.master_id
  then
    raise exception 'Przypisania eventu nie można przenosić';
  end if;

  -- role: only assignable while approving a pending request
  if new.role is distinct from old.role
     and not (old.status = 'pending' and new.status = 'approved')
  then
    raise exception 'Rolę nadaje się wyłącznie przy zatwierdzaniu zgłoszenia';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'pending' and new.status in ('approved', 'rejected') then
      -- Resolution contract: event staff for their own events, admins for
      -- any request. Deliberately is_admin(), NOT is_platform_moderator()
      -- — a non-admin moderator must not gain event-management rights
      -- (SP-034 decision). The UPDATE policies (is_admin OR
      -- is_event_staff) enforce the same contract at the row-access
      -- layer; this check keeps both layers identical.
      if not (public.is_event_staff(old.event_id) or public.is_admin()) then
        raise exception 'Zgłoszenie rozstrzyga obsada obiektu lub administrator';
      end if;
      -- trusted timestamp + role logic (vocabulary enforced in trusted
      -- database logic, mirroring the INSERT normalization trigger)
      if new.status = 'approved' then
        if new.role is null
           or new.role not in ('lead', 'assistant', 'guest') then
          raise exception
            'Zatwierdzenie wymaga roli: lead, assistant lub guest';
        end if;
        new.approved_at := now();
      else
        -- rejection never assigns anything: an attempted role change is
        -- already refused by the role gate above; normalize both fields
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

drop trigger if exists sauna_event_masters_guard on public.sauna_event_masters;
create trigger sauna_event_masters_guard
  before update on public.sauna_event_masters
  for each row execute function public.guard_event_master_columns();

-- ---------------------------------------------------------------------------
-- 5. INSERT normalization trigger (rev 3) — the "approved ⇔ trusted
--    approved_at + defined role" invariant holds from the moment a row is
--    born, for every insert path:
--    * status='approved' (admin direct assignment): approved_at is FORCED
--      to now() — a caller-supplied timestamp cannot survive — and a
--      non-null role is required;
--    * any other status: approved_at and role are normalized to NULL
--      (pending requests and any future non-approved inserts carry
--      neither a timestamp nor a role).
-- ---------------------------------------------------------------------------
create or replace function public.normalize_event_master_insert()
returns trigger as $$
begin
  if new.status = 'approved' then
    -- Role vocabulary is enforced HERE, in trusted database logic — the
    -- UI/TypeScript/server-action layers are convenience, not the
    -- boundary (staff can call the API directly). Probe 2026-07-19: all
    -- 20 existing rows already use exactly these values.
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

drop trigger if exists sauna_event_masters_insert_guard on public.sauna_event_masters;
create trigger sauna_event_masters_insert_guard
  before insert on public.sauna_event_masters
  for each row execute function public.normalize_event_master_insert();

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
-- V3. Index + columns: select indexname from pg_indexes
--   where tablename = 'sauna_event_masters';
--   -- includes sauna_event_masters_active_unique
--   select column_name from information_schema.columns
--   where table_name = 'sauna_event_masters' order by ordinal_position;
--   -- expect: id, event_id, master_id, status, role, created_at,
--   --         approved_at — and NOTHING ELSE (no created_by)
-- V4. As anon (PostgREST): sauna_event_masters?status=neq.approved →
--   0 rows (today it returns them — that is the leak being closed).
-- V4b. ANON COLUMN-EXPOSURE TEST: GET sauna_event_masters?select=*&limit=1
--   → the returned JSON keys must be exactly {id, event_id, master_id,
--   status, role, created_at, approved_at}; none of them is an
--   auth.users UUID (master_id/event_id are public catalogue entities).
-- V5. As a verified master (app/API): INSERT pending (role omitted) on an
--   active future event → OK; INSERT with status='approved' or a non-null
--   role → RLS violation; duplicate request for the same event → unique
--   violation; DELETE own pending → OK; UPDATE own row → no row matched
--   (no policy).
-- V6. As staff of the event's sauna: UPDATE pending → approved WITH a role
--   → approved_at set automatically; pending → approved WITHOUT a role →
--   exception 'Zatwierdzenie wymaga nadania roli'; pending → rejected →
--   approved_at NULL and role NULL (attempted role value in the same
--   statement → exception at the role gate); approved → pending →
--   exception; changing approved_at or role alone (no transition) →
--   exception; UPDATE of an already approved/rejected row → refused.
-- V7. Admin boundary cases (SQL Editor with an admin JWT or via the app):
--   a) direct INSERT status='approved' with role='lead' → row created,
--      approved_at = trusted now() even if the INSERT supplied
--      approved_at='2020-01-01' (caller value cannot survive); repeat
--      with role='assistant' and role='guest' → both accepted;
--   b) direct INSERT status='approved' WITHOUT role → exception;
--      direct INSERT status='approved' with role='dj' (or any value
--      outside lead/assistant/guest) → exception with the vocabulary
--      message;
--   c) direct INSERT status='pending' with role+approved_at supplied →
--      row created with role NULL and approved_at NULL (normalized);
--   d) admin NOT affiliated with the event's sauna resolves a pending
--      request → allowed (policy is_admin OR is_event_staff; guard
--      uses the same pair);
--   e) admin UPDATE of an approved row's role (no transition) →
--      exception (uniform machine; repair = DELETE + re-INSERT);
--   f) approval attempt with role='master_of_ceremony' (invalid) →
--      exception; approval with role='guest' → succeeds;
--   g) as a MODERATOR who is neither admin nor staff of the event's
--      sauna: UPDATE pending → approved → 0 rows affected / refused at
--      the POLICY layer (no UPDATE policy matches — the moderator never
--      reaches the trigger), confirming moderators gain no generic
--      event-management rights.
-- V8. Invariant sweep (read-only, after any test data):
--   select count(*) from public.sauna_event_masters
--   where (status = 'approved' and (approved_at is null or role is null))
--      or (status <> 'approved' and approved_at is not null);
--   -- must be 0
--
-- EXECUTION ORDER: V1 → V2 → V3 (inventory, data, structure: read-only)
-- → V4/V4b (anon probes via PostgREST) → V7a–c (admin inserts; creates
-- test rows) → V5 (master request/withdrawal) → V6 + V7d–e (resolution
-- paths) → V8 (invariant sweep) → cleanup: delete test rows as admin.
-- ============================================================================
