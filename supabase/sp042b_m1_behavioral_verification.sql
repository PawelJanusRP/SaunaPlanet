-- ============================================================================
-- SP-042B M1 — POST-APPLY BEHAVIORAL VERIFICATION (B1-B10).
--
-- VERIFICATION-ONLY. This is NOT a migration, is never applied as schema and
-- changes nothing durably: every synthetic write happens inside the single
-- transaction of this one statement, and the block ALWAYS terminates with
-- RAISE EXCEPTION (both on pass and on fail), which aborts that transaction —
-- so rollback is unconditional, even when an assertion fails or an unexpected
-- error occurs mid-block (any error aborts the statement's transaction).
--
-- HOW TO RUN: paste as ONE statement into the Supabase SQL Editor (role:
-- postgres) AFTER the M1 forward migration. The expected outcome is an ERROR
-- whose message starts with:
--
--   SP042B M1 BEHAVIORAL RESULTS: pass=10 fail=0
--
-- A failed test appears in the same message as 'Bx FAIL ...'.
--
-- Privacy: fixtures are selected only into internal UUID variables; no user
-- e-mails, JWT contents, keys or network data are printed. The synthetic
-- anonymous key is a constant 64-hex literal, not derived from any real
-- address. No sauna row is modified (B9 proves it with a before/after
-- snapshot); the selected auth user/profile is only read, never written.
-- ============================================================================
do $$
declare
  v_sauna_id     uuid;
  v_sauna_before jsonb;
  v_sauna_after  jsonb;
  v_user_id      uuid;   -- any real account (created_by bind probe; read-only)
  v_plain_user   uuid;   -- account with profiles.role='user' (enumeration probe)
  v_hash         text := repeat('ab', 32); -- constant 64 lowercase hex
  v_res          jsonb;
  v_report_id    uuid;
  v_count        integer;
  v_pass         integer := 0;
  v_fail         integer := 0;
  v_out          text := '';
begin
  -- B0: fixtures ------------------------------------------------------------
  select id into v_sauna_id from public.saunas where status = 'active' limit 1;
  if v_sauna_id is null then
    raise exception 'SP042B B0 ABORT: no active sauna found';
  end if;
  select to_jsonb(s) into v_sauna_before from public.saunas s where s.id = v_sauna_id;

  select id into v_user_id from auth.users limit 1;
  if v_user_id is null then
    raise exception 'SP042B B0 ABORT: no auth user found';
  end if;
  select p.id into v_plain_user from public.profiles p where p.role = 'user' limit 1;

  -- B1: direct anon RPC invocation => permission denied (42501) ---------------
  begin
    set local role anon;
    perform public.submit_feedback_report('facility_correction', v_sauna_id,
      'other', 'B1 direct anon call must be denied', null, null, 'pl', null, v_hash);
    v_fail := v_fail + 1; v_out := v_out || 'B1 FAIL anon call succeeded; ';
  exception
    when insufficient_privilege then
      v_pass := v_pass + 1; v_out := v_out || 'B1 PASS 42501; ';
    when others then
      v_fail := v_fail + 1; v_out := v_out || 'B1 FAIL sqlstate=' || SQLSTATE || '; ';
  end;

  -- B2: null auth.uid() WITHOUT service_role context => invalid-input ---------
  perform set_config('request.jwt.claims', '{}', true);
  v_res := public.submit_feedback_report('facility_correction', v_sauna_id,
    'other', 'B2 untrusted anonymous context must be refused', null, null, 'pl', null, v_hash);
  if v_res->>'ok' = 'false' and v_res->>'code' = 'invalid-input' then
    v_pass := v_pass + 1; v_out := v_out || 'B2 PASS; ';
  else
    v_fail := v_fail + 1; v_out := v_out || 'B2 FAIL code=' || coalesce(v_res->>'code','?') || '; ';
  end if;

  -- B3: trusted service_role anonymous invocation => succeeds -----------------
  --     created_by IS NULL, key hash stored, report_created audit exists.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_res := public.submit_feedback_report('facility_correction', v_sauna_id,
    'other', 'B3 trusted anonymous submission', null, null, 'pl', null, v_hash);
  select id into v_report_id from public.feedback_reports
    where submitter_key_hash = v_hash and created_by is null
    order by created_at desc limit 1;
  select count(*) into v_count from public.feedback_report_events
    where report_id = v_report_id and event_type = 'report_created';
  if v_res->>'ok' = 'true' and v_report_id is not null and v_count = 1 then
    v_pass := v_pass + 1; v_out := v_out || 'B3 PASS; ';
  else
    v_fail := v_fail + 1; v_out := v_out || 'B3 FAIL code=' || coalesce(v_res->>'code','?')
      || ' events=' || v_count || '; ';
  end if;

  -- B4: authenticated invocation => created_by = auth.uid(); a supplied -------
  --     anonymous hash is IGNORED (stored NULL); item snapshot correct.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user_id, 'role', 'authenticated')::text, true);
  v_res := public.submit_feedback_report('facility_correction', v_sauna_id,
    'name', 'B4 authenticated submission with a proposed name',
    to_jsonb('B4 Proposed Facility Name'::text), null, 'pl', null, v_hash);
  perform set_config('request.jwt.claims', '{}', true);
  select count(*) into v_count from public.feedback_reports r
    join public.feedback_correction_items i on i.report_id = r.id
    where r.created_by = v_user_id
      and r.submitter_key_hash is null            -- supplied hash NOT stored
      and r.message like 'B4 %'
      and i.field_code = 'name' and i.status = 'pending'
      and i.current_value = (select to_jsonb(s.name) from public.saunas s where s.id = v_sauna_id);
  if v_res->>'ok' = 'true' and v_count = 1 then
    v_pass := v_pass + 1; v_out := v_out || 'B4 PASS; ';
  else
    v_fail := v_fail + 1; v_out := v_out || 'B4 FAIL code=' || coalesce(v_res->>'code','?')
      || ' rows=' || v_count || '; ';
  end if;

  -- B5: same anonymous hash — first 3 accepted, 4th within the hour limited ---
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_res := public.submit_feedback_report('facility_correction', v_sauna_id,
    'other', 'B5 anonymous submission number two', null, null, 'pl', null, v_hash);
  if v_res->>'ok' <> 'true' then v_out := v_out || 'B5(#2) code=' || coalesce(v_res->>'code','?') || '; '; end if;
  v_res := public.submit_feedback_report('facility_correction', v_sauna_id,
    'other', 'B5 anonymous submission number three', null, null, 'pl', null, v_hash);
  if v_res->>'ok' <> 'true' then v_out := v_out || 'B5(#3) code=' || coalesce(v_res->>'code','?') || '; '; end if;
  v_res := public.submit_feedback_report('facility_correction', v_sauna_id,
    'other', 'B5 anonymous submission number four', null, null, 'pl', null, v_hash);
  perform set_config('request.jwt.claims', '{}', true);
  select count(*) into v_count from public.feedback_reports where submitter_key_hash = v_hash;
  if v_res->>'code' = 'rate-limited' and v_count = 3 then
    v_pass := v_pass + 1; v_out := v_out || 'B5 PASS 3-then-limited; ';
  else
    v_fail := v_fail + 1; v_out := v_out || 'B5 FAIL code=' || coalesce(v_res->>'code','?')
      || ' rows=' || v_count || '; ';
  end if;

  -- B6: submitted report content is immutable ---------------------------------
  begin
    update public.feedback_reports set message = 'B6 tampered' where id = v_report_id;
    v_fail := v_fail + 1; v_out := v_out || 'B6 FAIL update succeeded; ';
  exception
    when others then
      if SQLERRM like '%immutable%' then
        v_pass := v_pass + 1; v_out := v_out || 'B6 PASS guard; ';
      else
        v_fail := v_fail + 1; v_out := v_out || 'B6 FAIL ' || SQLSTATE || '; ';
      end if;
  end;

  -- B7a: anon cannot enumerate feedback rows ----------------------------------
  begin
    set local role anon;
    select count(*) into v_count from public.feedback_reports;
    v_fail := v_fail + 1; v_out := v_out || 'B7a FAIL anon selected ' || v_count || '; ';
  exception
    when insufficient_privilege then
      v_pass := v_pass + 1; v_out := v_out || 'B7a PASS 42501; ';
    when others then
      v_fail := v_fail + 1; v_out := v_out || 'B7a FAIL ' || SQLSTATE || '; ';
  end;

  -- B7b: ordinary authenticated user sees ZERO rows ---------------------------
  if v_plain_user is null then
    v_fail := v_fail + 1; v_out := v_out || 'B7b FAIL no plain-user profile available; ';
  else
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_plain_user, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into v_count from public.feedback_reports;
      reset role;
      perform set_config('request.jwt.claims', '{}', true);
      if v_count = 0 then
        v_pass := v_pass + 1; v_out := v_out || 'B7b PASS 0 rows; ';
      else
        v_fail := v_fail + 1; v_out := v_out || 'B7b FAIL rows=' || v_count || '; ';
      end if;
    exception when others then
      v_fail := v_fail + 1; v_out := v_out || 'B7b FAIL ' || SQLSTATE || '; ';
    end;
  end if;

  -- B8: report_created audit count matches successful synthetic reports (4) ---
  select count(*) into v_count from public.feedback_report_events e
    where e.event_type = 'report_created'
      and e.report_id in (select id from public.feedback_reports
                          where submitter_key_hash = v_hash or message like 'B4 %');
  if v_count = 4 then
    v_pass := v_pass + 1; v_out := v_out || 'B8 PASS 4 events; ';
  else
    v_fail := v_fail + 1; v_out := v_out || 'B8 FAIL events=' || v_count || '; ';
  end if;

  -- B9: sauna row logically identical before/after ----------------------------
  select to_jsonb(s) into v_sauna_after from public.saunas s where s.id = v_sauna_id;
  if v_sauna_after = v_sauna_before then
    v_pass := v_pass + 1; v_out := v_out || 'B9 PASS saunas untouched; ';
  else
    v_fail := v_fail + 1; v_out := v_out || 'B9 FAIL saunas changed; ';
  end if;

  -- B10: stored anonymous keys are ONLY well-formed 64-hex values -------------
  select count(*) into v_count from public.feedback_reports
    where (submitter_key_hash = v_hash or message like 'B4 %')
      and submitter_key_hash is not null
      and submitter_key_hash !~ '^[0-9a-f]{64}$';
  if v_count = 0 then
    v_pass := v_pass + 1; v_out := v_out || 'B10 PASS only hex key hashes; ';
  else
    v_fail := v_fail + 1; v_out := v_out || 'B10 FAIL; ';
  end if;

  -- Unconditional rollback: the summary itself aborts the transaction, so
  -- every synthetic row above disappears regardless of pass/fail.
  raise exception 'SP042B M1 BEHAVIORAL RESULTS: pass=% fail=% | %', v_pass, v_fail, v_out;
end $$;
