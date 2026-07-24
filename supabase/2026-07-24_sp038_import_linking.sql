-- ============================================================================
-- SP-038 Slice 3 — import->submission linking, google_maps source kind,
-- saunas.opening_hours, rate-limit index.
-- (docs/SP038_SMART_IMPORT_ARCHITECTURE.md — Slice 3; design approved in
--  the Slice 3A review, 2026-07-24: decisions D1 tightened INSERT policy,
--  D2 unique sauna_id index, D3 link only ok/partial operations.)
--
-- All functions: SECURITY DEFINER, empty search_path, fully qualified refs.
-- Companion rollback: 2026-07-24_sp038_rollback_functional.sql
--
-- PRE-APPLY VERIFICATION (read-only; run FIRST — confirms the state this
-- migration was designed against; on any mismatch STOP and re-review):
-- P1. Exactly one CHECK on source_kind, current 5-value vocabulary:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid='public.import_log'::regclass and contype='c';
-- P2. Only the PK index exists on import_log:
--   select indexname from pg_indexes
--   where schemaname='public' and tablename='import_log';
-- P3. saunas has no opening_hours column (expect 0 rows):
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='saunas'
--     and column_name='opening_hours';
-- P4. No rows already using future vocabulary:
--   select source_kind, count(*) from public.import_log group by 1;
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. source_kind vocabulary + 'google_maps'.
--    The SP-036 CHECK was created inline (auto-generated name), so it is
--    dropped by catalog lookup (conkey match on the source_kind column),
--    never by a guessed name, then recreated under an explicit name with
--    the extended vocabulary (superset -> existing rows remain valid).
-- ---------------------------------------------------------------------------
do $$
declare con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.import_log'::regclass
      and c.contype = 'c'
      and exists (select 1 from pg_attribute a
                  where a.attrelid = c.conrelid
                    and a.attname = 'source_kind'
                    and a.attnum = any (c.conkey))
  loop
    execute format('alter table public.import_log drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.import_log
  add constraint import_log_source_kind_check
  check (source_kind in
    ('facebook_page','facebook_event','instagram','website','google_maps','other'));

-- ---------------------------------------------------------------------------
-- 2. import_log.sauna_id — nullable audit link to the created submission.
--    ON DELETE SET NULL: the audit row must survive facility deletion
--    (append-only trail), and an audit row must never veto an admin
--    facility delete (RESTRICT would; CASCADE would erase the trail).
--    Same convention as import_log.requested_by.
-- ---------------------------------------------------------------------------
alter table public.import_log
  add column if not exists sauna_id uuid
    references public.saunas(id) on delete set null;

-- At most ONE import operation linked per sauna (D2): keeps the moderation
-- lookup deterministic and doubles as the FK-side index (partial: the
-- vast majority of rows stay NULL).
create unique index if not exists import_log_sauna_id_uidx
  on public.import_log (sauna_id) where sauna_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Close the fake-provenance INSERT hole (D1): without this, any user
--    could INSERT a fresh import_log row with sauna_id pointing at an
--    arbitrary sauna (the SP-036 INSERT policy only pins requested_by).
--    New rows are born unlinked; linking happens exclusively through the
--    RPC below. Slice 2 application code never sends sauna_id, so this is
--    behavior-preserving for the app.
-- ---------------------------------------------------------------------------
drop policy if exists import_log_insert on public.import_log;
create policy import_log_insert on public.import_log
  for insert with check (requested_by = auth.uid() and sauna_id is null);
-- (still no UPDATE/DELETE policies: append-only outside the RPC)

-- ---------------------------------------------------------------------------
-- 4. Rolling-hour rate-limit index (Slice 2 query in
--    app/saunas/importActions.ts: WHERE requested_by = $uid AND
--    created_at >= now()-'1h'): equality column first, range column
--    second; also serves the RLS own-rows SELECT arm. No partial index:
--    requested_by IS NULL rows (orphaned by user deletion) are a
--    negligible fraction.
-- ---------------------------------------------------------------------------
create index if not exists import_log_requested_by_created_at_idx
  on public.import_log (requested_by, created_at);

-- ---------------------------------------------------------------------------
-- 5. saunas.opening_hours — nullable JSONB, no default, no backfill, no
--    value is overwritten. Minimal validation only: a non-null value must
--    be a JSON object (the application owns the inner schema; initial
--    shape mirrors OpeningHoursDraft in lib/import/types.ts:
--    {"specifications":[{"days":[...],"opens":"09:00","closes":"21:00"}],
--     "raw":["Mo-Fr 09:00-21:00"],"note":null}).
-- ---------------------------------------------------------------------------
alter table public.saunas
  add column if not exists opening_hours jsonb;

alter table public.saunas
  drop constraint if exists saunas_opening_hours_is_object;
alter table public.saunas
  add constraint saunas_opening_hours_is_object
  check (opening_hours is null or jsonb_typeof(opening_hours) = 'object');

-- ---------------------------------------------------------------------------
-- 6. link_import_to_submission — the ONLY write path to import_log.sauna_id.
--    Atomic conditional UPDATE: every authorization fact is a predicate of
--    the UPDATE itself (no read-then-update; a concurrent second call
--    serializes on the row lock, re-evaluates sauna_id IS NULL and
--    no-ops). Returns true when exactly one row was linked, false on any
--    no-op (not found / not owned / already linked / target not the
--    caller's pending submission / concurrent unique conflict). false is
--    deliberately indistinguishable across causes — minimal disclosure.
--    FAILURE SEMANTICS: raises only for anonymous callers
--    (defense-in-depth; anon has no EXECUTE anyway). A best-effort
--    post-submission link must never break an already-successful
--    submission, hence no-op = false, not an exception.
-- ---------------------------------------------------------------------------
create or replace function public.link_import_to_submission(
  p_import_id uuid, p_sauna_id uuid
) returns boolean as $$
begin
  if auth.uid() is null then
    raise exception 'Operacja wymaga zalogowania';
  end if;
  update public.import_log l
    set sauna_id = p_sauna_id
    where l.id = p_import_id
      and l.requested_by = auth.uid()          -- caller owns the operation
      and l.sauna_id is null                   -- never overwrite a link
      and l.result in ('ok','partial')         -- only draft-producing ops (D3)
      and exists (select 1 from public.saunas s
                  where s.id = p_sauna_id
                    and s.status = 'pending'   -- pending submission only
                    and s.created_by = auth.uid());  -- caller's own
  return found;
exception when unique_violation then
  -- concurrent second link to the same sauna lost the race -> clean no-op
  return false;
end $$ language plpgsql security definer set search_path = '';

revoke all on function public.link_import_to_submission(uuid, uuid) from public, anon;
grant execute on function public.link_import_to_submission(uuid, uuid) to authenticated;

commit;

-- ============================================================================
-- POST-APPLY VERIFICATION (throwaway writes inside rolled-back transactions)
-- ============================================================================
-- V1. Constraint present under the explicit name; 'google_maps' accepted,
--     'garbage' rejected:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid='public.import_log'::regclass and contype='c';
--   -- in a rolled-back tx: insert source_kind='google_maps' -> ok;
--   --                      insert source_kind='garbage' -> CHECK error.
-- V2. Policies unchanged in shape: import_log = SELECT + INSERT only:
--   select policyname, cmd, with_check from pg_policies
--   where schemaname='public' and tablename='import_log';
-- V3. As a regular user (PostgREST): PATCH import_log?id=eq.<own row>
--     {"sauna_id": "<own pending sauna>"} -> 0 rows updated (no policy).
-- V4. As user A: select link_import_to_submission(<A log ok/partial>, <A pending>)
--     -> true; repeat -> false (already linked); with <B pending> -> false;
--     with <active sauna> -> false; with <A log result=blocked> -> false.
--     As anon: RPC -> permission denied.
-- V5. As a regular user: INSERT into import_log with sauna_id preset
--     -> RLS violation (policy §3).
-- V6. explain (costs off) select count(*) from import_log
--     where requested_by='<uuid>' and created_at >= now()-interval '1 hour';
--     -> Index (Only) Scan on import_log_requested_by_created_at_idx.
-- V7. update public.saunas set opening_hours='[]'::jsonb where id='<x>'
--     -> CHECK error; '{}'::jsonb -> ok (roll back).
-- V8. Invariant sweep: select count(*) from public.import_log l
--     join public.saunas s on s.id = l.sauna_id
--     where l.requested_by is distinct from s.created_by;  -- expect 0
-- ============================================================================
