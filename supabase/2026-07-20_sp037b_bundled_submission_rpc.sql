-- ============================================================================
-- SP-037B Slice 4 correction — ATOMIC BUNDLED SUBMISSION RPC
-- ============================================================================
-- STATUS: PREPARED, NOT APPROVED FOR EXECUTION.
-- Rollback: 2026-07-20_sp037b_bundled_rpc_rollback.sql.
--
-- Read-only probe (2026-07-20, pre-migration):
--   * public.submit_facility_with_master_event does not exist (PGRST202);
--   * pending: 0 facilities (anon-hidden), 1 event, 0 participations
--     (anon-hidden) — the 1 pending event (Paweł's paused E2E proposal)
--     IS readable by anon via the API, as is 1 rejected event, because
--     events_select is USING(true). The "public invisibility of all
--     pending bundle records" requirement therefore needs §2 below.
--
-- POLICY / PERMISSION NOTES
--   * SECURITY DEFINER is REQUIRED here, not optional: the organizer
--     participation row cannot be created under invoker rights — the
--     request INSERT policy deliberately demands an ACTIVE event, while a
--     bundled pair is born pending. The function performs its own
--     authorization (approved master), validation and integrity checks;
--     EXECUTE is granted to authenticated only, never anon.
--   * The five-open-submissions cap and its advisory-lock concurrency
--     strategy are REUSED, not duplicated: the facility INSERT inside the
--     RPC fires the existing guard_sauna_submission_cap trigger
--     (auth.uid() is preserved in DEFINER context), so concurrent bundles
--     serialize per-user exactly like plain submissions.
--   * No other RPC is called — all three inserts are inline in ONE
--     function body = ONE transaction: any raise (validation, cap,
--     normalization trigger, unique index) rolls back EVERYTHING, so a
--     failed event or participation leaves no facility behind.
--   * The function creates NO sauna_managers row, NO master_affiliations
--     row and grants no facility-edit entitlement — authorization for
--     later edits still flows only from the saunas UPDATE policy
--     (creator while pending) and staff/moderation rules.
--
-- §2 — sauna_events SELECT tightening (required by the invisibility rule):
--   replaces events_select USING(true) with
--     active  → public,
--     own     → created_by = auth.uid()  (organizer sees own proposals),
--     staff   → is_event_staff(id)       (manager queue),
--     mod     → is_platform_moderator()  (admin tab).
--   Consumer audit (all verified in code):
--     - public surfaces (/events RPCs, map, sauna/master pages) read only
--       active rows — unaffected; the map RPCs are invoker-rights and
--       is_event_staff already has anon EXECUTE (2026-07-19 incident
--       grant), so NO repeat of the policy-function outage;
--     - admin Eventy tab → moderation arm; workspace proposals → staff
--       arm; Studio organizer union + event page for the organizer →
--       created_by arm (every organizer event is RPC-created with
--       created_by set);
--     - accepted cosmetic edge: an anon viewer of a master profile will
--       no longer see a LEGACY admin-rejected event behind an approved
--       participation (embed resolves null); current data has no such
--       row.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The atomic bundled-submission RPC
-- ---------------------------------------------------------------------------
create or replace function public.submit_facility_with_master_event(
  p_name text,
  p_event_title text,
  p_event_date timestamptz,
  p_description text default null,
  p_category text default 'public_sauna',
  p_city text default null,
  p_website text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_event_time time default null,
  p_event_price text default null,
  p_event_description text default null,
  p_event_max_participants integer default null
) returns jsonb as $$
declare
  v_master uuid;
  v_sauna_id uuid;
  v_event_id uuid;
  v_participation_id uuid;
begin
  -- authorization: an authenticated, APPROVED master only
  select id into v_master from public.sauna_masters
   where user_id = auth.uid() and status = 'approved';
  if v_master is null then
    raise exception
      'Tylko zatwierdzony saunamistrz może zgłosić obiekt z wydarzeniem';
  end if;

  -- facility validation (mirrors the submitFacility action rules)
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Podaj nazwę sauny lub obiektu';
  end if;
  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Podaj obie współrzędne albo żadną';
  end if;
  if p_latitude is not null
     and (p_latitude < -90 or p_latitude > 90
          or p_longitude < -180 or p_longitude > 180) then
    raise exception 'Współrzędne są poza dopuszczalnym zakresem';
  end if;

  -- event validation (mirrors create_master_event rules)
  if p_event_title is null or btrim(p_event_title) = '' then
    raise exception 'Podaj nazwę wydarzenia';
  end if;
  if p_event_date is null
     or p_event_date < pg_catalog.date_trunc('day', pg_catalog.now()) then
    raise exception 'Wydarzenie musi mieć dzisiejszą lub przyszłą datę';
  end if;
  if p_event_max_participants is not null and p_event_max_participants < 1 then
    raise exception 'Limit miejsc musi być większy od zera';
  end if;

  -- 1) facility — the INSERT fires guard_sauna_submission_cap (advisory
  --    lock + five-pending limit) exactly like a plain submission
  insert into public.saunas
    (name, description, category, city, website, latitude, longitude,
     status, created_by, source)
  values
    (btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''),
     coalesce(p_category, 'public_sauna'),
     nullif(btrim(coalesce(p_city, '')), ''),
     nullif(btrim(coalesce(p_website, '')), ''),
     p_latitude, p_longitude,
     'pending', auth.uid(), 'user_submission')
  returning id into v_sauna_id;

  -- 2) bundled event
  insert into public.sauna_events
    (sauna_id, title, description, event_date, event_time, price,
     max_participants, status, organizer_master_id, created_by,
     bundled_with_submission)
  values
    (v_sauna_id, btrim(p_event_title),
     nullif(btrim(coalesce(p_event_description, '')), ''),
     p_event_date, p_event_time,
     nullif(btrim(coalesce(p_event_price, '')), ''),
     p_event_max_participants,
     'pending', v_master, auth.uid(), true)
  returning id into v_event_id;

  -- 3) organizer participation — pending, master-initiated; the INSERT
  --    normalization trigger forces role NULL and approved_at NULL
  insert into public.sauna_event_masters
    (event_id, master_id, status, initiated_by)
  values
    (v_event_id, v_master, 'pending', 'master')
  returning id into v_participation_id;

  return pg_catalog.jsonb_build_object(
    'facility_id', v_sauna_id,
    'event_id', v_event_id,
    'participation_id', v_participation_id,
    'facility_status', 'pending',
    'event_status', 'pending',
    'participation_status', 'pending');
end $$ language plpgsql security definer set search_path = '';

revoke all on function public.submit_facility_with_master_event(
  text, text, timestamptz, text, text, text, text,
  double precision, double precision, time, text, text, integer)
  from public, anon;
grant execute on function public.submit_facility_with_master_event(
  text, text, timestamptz, text, text, text, text,
  double precision, double precision, time, text, text, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. sauna_events SELECT tightening — pending/rejected rows leave the
--    public API surface (see the consumer audit in the header)
-- ---------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'sauna_events'
               and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.sauna_events', pol.policyname);
  end loop;
end $$;

create policy events_select on public.sauna_events
  for select using (
    status = 'active'
    or created_by = auth.uid()
    or public.is_event_staff(id)
    or public.is_platform_moderator()
  );

commit;

-- ============================================================================
-- VERIFICATION SUITE (run in order after manual apply)
-- ============================================================================
-- B1 (SQL, read-only): function present with the right posture —
--   select proname, prosecdef, proconfig from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where nspname='public' and proname='submit_facility_with_master_event';
--   -- expect: prosecdef = true, search_path=""
-- B2 (SQL as postgres): select public.submit_facility_with_master_event(
--   'x','y', now());  -- expect ERROR 'Tylko zatwierdzony saunamistrz...'
--   (auth.uid() is NULL — proves self-authorization)
-- B3 (anon, PostgREST): rpc/submit_facility_with_master_event → 401
--   permission denied (never exposed to anon).
-- B4 (anon, PostgREST): sauna_events?status=eq.pending → 0 rows and
--   sauna_events?status=eq.rejected → 0 rows (the probe showed 1+1 before
--   — this is the §2 closure); sauna_events?status=eq.active → rows;
--   rpc/get_saunas_nearby → 200 with saunas (map unharmed — the §2 arm
--   functions all have anon EXECUTE).
-- B5 (session: verified master): call with valid inputs → jsonb with
--   facility_id/event_id/participation_id, all three rows pending,
--   bundled_with_submission=true, organizer_master_id = own master,
--   participation initiated_by='master', role NULL, approved_at NULL.
--   Then verify NO new sauna_managers or master_affiliations rows exist
--   for that master/sauna (counts unchanged).
-- B6 (session: verified master) — forced failure atomicity:
--   a) event date in the past → ERROR; count of own pending saunas
--      UNCHANGED (no facility-only orphan);
--   b) empty event title → same;
--   (any raise inside the body — including the participation insert —
--   rolls back the whole transaction; B6a empirically demonstrates the
--   rollback path through the same mechanism.)
-- B7 (session: verified master): with 5 own pending submissions → call →
--   cap trigger error ('Masz już 5 zgłoszeń...'); NOTHING created; two
--   parallel calls at 4 pending → at most one succeeds (advisory lock).
-- B8 (session: ordinary user) → ERROR 'Tylko zatwierdzony saunamistrz...';
--   (session: PENDING master) → same error.
-- B9 (regression): plain facility-only submission (ordinary user and
--   master), duplicate warnings, imported-photo flow and
--   approve/reject_facility_submission behavior — unchanged (none of
--   their code paths is touched by this migration).
-- ============================================================================
