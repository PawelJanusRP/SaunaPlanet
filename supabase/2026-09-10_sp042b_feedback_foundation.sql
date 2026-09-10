-- ============================================================================
-- SP-042B — Feedback foundation (M1): unified feedback intake for facility
-- corrections (docs/SP042_FEEDBACK_ARCHITECTURE.md §6, §11, §12, §15, §16).
--
-- Additive only. Creates:
--   * feedback_reports          — common intake (type/category/message/status);
--   * feedback_correction_items — field-level proposals (partial acceptance);
--   * feedback_report_events    — append-only audit;
--   * submit_feedback_report()  — the ONLY intake path (SECURITY DEFINER,
--                                 granted to authenticated + service_role;
--                                 anon has NO EXECUTE — anonymous intake
--                                 exists exclusively through the trusted
--                                 server-only invocation, see below).
--
-- PRIVACY CONTRACT (hard): reports are private. Clients (anon and plain
-- authenticated) have NO SELECT/INSERT/UPDATE/DELETE on any feedback table —
-- no enumeration, no read-back. Moderation reads/updates go through
-- is_platform_moderator(). created_by is derived from auth.uid() inside the
-- RPC and never accepted from the caller. No raw IP is ever stored — only an
-- HMAC-derived submitter key hash for anonymous rolling-window rate limiting
-- (computed by the server action from trusted platform headers).
--
-- ANTI-ABUSE TRUST MODEL (security review fix, 2026-09-10): the anonymous
-- branch is reachable ONLY through the trusted server path. Direct anon
-- PostgREST callers could otherwise mint a fresh random 64-hex key per
-- request and rotate around the anonymous rolling windows (and skip the
-- Server Action honeypot). Two independent locks enforce this:
--   1. GRANTS — EXECUTE goes to authenticated + service_role only; anon is
--      revoked, so an anonymous browser cannot call the RPC at all;
--   2. IN-BODY PIN — the anonymous branch (auth.uid() IS NULL) additionally
--      requires the trusted server JWT context (claims role = service_role),
--      so even a grant drift cannot silently reopen direct anonymous intake.
-- Authenticated sessions keep calling the RPC directly: identity binds to
-- auth.uid() and the per-account window applies regardless of any
-- client-supplied key material (the key is ignored and stored NULL).
--
-- SP-042B scope: the RPC accepts type='facility_correction' only; SP-042C
-- extends the accepted set to suggestion/contact without schema changes.
-- Nothing here mutates saunas; the apply path is SP-042D (M2).
--
-- Rate limits (approved D-decisions + architecture §16):
--   authenticated: 10 reports / rolling hour (per created_by);
--   anonymous:      3 / rolling hour AND 10 / rolling 24 h (per key hash).
--
-- Conventions: fail-loud DDL (no or-replace), pinned empty search_path,
-- fully-qualified refs, revoke-then-grant incl. service_role (M7 posture),
-- terminal-state CHECKs pinned to timestamps (M6 lesson).
--
-- Companion rollback: 2026-09-10_sp042b_feedback_foundation_rollback.sql
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 0. Guards — abort loudly on any collision or missing prerequisite.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.feedback_reports') is not null then
    raise exception 'SP042B GUARD: feedback_reports already exists; stop and review';
  end if;
  if to_regclass('public.feedback_correction_items') is not null then
    raise exception 'SP042B GUARD: feedback_correction_items already exists; stop and review';
  end if;
  if to_regclass('public.feedback_report_events') is not null then
    raise exception 'SP042B GUARD: feedback_report_events already exists; stop and review';
  end if;
  if to_regprocedure('public.submit_feedback_report(text,uuid,text,text,jsonb,text,text,text,text)') is not null then
    raise exception 'SP042B GUARD: submit_feedback_report already exists; stop and review';
  end if;
  if to_regprocedure('public.is_platform_moderator()') is null then
    raise exception 'SP042B GUARD: is_platform_moderator() missing (SP-035d prerequisite); stop';
  end if;
  if to_regclass('public.saunas') is null then
    raise exception 'SP042B GUARD: saunas missing; stop';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. feedback_reports — common intake (architecture §6.1).
-- ---------------------------------------------------------------------------
create table public.feedback_reports (
  id                  uuid primary key default gen_random_uuid(),
  type                text not null check (type in
                        ('facility_correction','suggestion','contact')),
  sauna_id            uuid references public.saunas(id) on delete set null,
  sauna_name_snapshot text,
  category            text check (category in
                        ('name','address','coordinates','website','social_link',
                         'contact_details','category','opening_info','photo',
                         'closed','duplicate','other')),
  message             text not null check (btrim(message) <> ''
                                           and char_length(message) <= 4000),
  created_by          uuid references auth.users(id) on delete set null,
  contact_email       text check (contact_email is null
                                  or (char_length(contact_email) <= 254
                                      and position('@' in contact_email) > 1)),
  submitter_key_hash  text check (submitter_key_hash is null
                                  or submitter_key_hash ~ '^[0-9a-f]{64}$'),
  locale              text not null check (locale in ('pl','en','de')),
  source_path         text check (source_path is null
                                  or char_length(source_path) <= 300),
  status              text not null default 'new' check (status in
                        ('new','in_review','resolved','rejected')),
  resolved_at         timestamptz,
  resolved_by         uuid references auth.users(id) on delete set null,
  admin_note          text check (admin_note is null
                                  or char_length(admin_note) <= 4000),
  created_at          timestamptz not null default now(),

  -- facility context must exist at insert; the snapshot survives deletion
  constraint fr_facility_context check
    (type <> 'facility_correction'
     or sauna_id is not null or sauna_name_snapshot is not null),
  -- category is a facility-correction concept only
  constraint fr_category_scope check
    (category is null or type = 'facility_correction'),
  -- terminal state pinned to the TIMESTAMP, never to actor columns (M6 lesson:
  -- resolved_by is nulled by FK when the moderator account is deleted)
  constraint fr_resolution_consistency check
    ((status in ('resolved','rejected')) = (resolved_at is not null))
);

create index feedback_reports_status_created_idx
  on public.feedback_reports (status, created_at desc);
create index feedback_reports_sauna_idx
  on public.feedback_reports (sauna_id) where sauna_id is not null;
-- rolling-window rate-limit scans (SP-038 import_log index pattern)
create index feedback_reports_created_by_created_at_idx
  on public.feedback_reports (created_by, created_at) where created_by is not null;
create index feedback_reports_key_hash_created_at_idx
  on public.feedback_reports (submitter_key_hash, created_at) where submitter_key_hash is not null;

-- ---------------------------------------------------------------------------
-- 2. feedback_correction_items — field-level proposals (architecture §6.2).
-- ---------------------------------------------------------------------------
create table public.feedback_correction_items (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid not null references public.feedback_reports(id) on delete cascade,
  field_code     text not null check (field_code in
                   ('name','description','address','city','website','phone',
                    'email','category','coordinates','opening_hours','social_links')),
  current_value  jsonb,
  proposed_value jsonb not null,
  provenance     jsonb,
  status         text not null default 'pending' check (status in
                   ('pending','accepted','rejected')),
  resolved_at    timestamptz,
  resolved_by    uuid references auth.users(id) on delete set null,
  applied_at     timestamptz,
  created_at     timestamptz not null default now(),

  constraint fci_resolution_consistency check
    ((status <> 'pending') = (resolved_at is not null)),
  constraint fci_applied_only_accepted check
    (applied_at is null or status = 'accepted'),
  constraint fci_one_field_per_report unique (report_id, field_code)
);

-- ---------------------------------------------------------------------------
-- 3. feedback_report_events — append-only audit (architecture §6.3, §15).
--    Message bodies are NEVER copied into events; the report row stays the
--    authoritative submitted content.
-- ---------------------------------------------------------------------------
create table public.feedback_report_events (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.feedback_reports(id) on delete cascade,
  item_id       uuid references public.feedback_correction_items(id) on delete set null,
  event_type    text not null check (event_type in
                  ('report_created','status_changed','item_accepted',
                   'item_rejected','correction_applied','stale_conflict',
                   'moderator_override','note_added')),
  actor_user_id uuid references auth.users(id) on delete set null,
  payload       jsonb,
  created_at    timestamptz not null default now()
);

create index feedback_report_events_report_idx
  on public.feedback_report_events (report_id, created_at);

-- ---------------------------------------------------------------------------
-- 4. RLS + table grants. Deny-by-default: clients get no row unless a
--    moderation policy grants it; intake writes happen only inside the
--    SECURITY DEFINER RPC (owner bypasses RLS).
-- ---------------------------------------------------------------------------
alter table public.feedback_reports enable row level security;
alter table public.feedback_correction_items enable row level security;
alter table public.feedback_report_events enable row level security;

create policy feedback_reports_select_moderation
  on public.feedback_reports for select
  to authenticated using (public.is_platform_moderator());

-- workflow-column updates only (guard trigger below freezes submitted content);
-- exercised by SP-042D moderation, present now so the boundary is complete
create policy feedback_reports_update_moderation
  on public.feedback_reports for update
  to authenticated
  using (public.is_platform_moderator())
  with check (public.is_platform_moderator());

create policy feedback_correction_items_select_moderation
  on public.feedback_correction_items for select
  to authenticated using (public.is_platform_moderator());

create policy feedback_report_events_select_moderation
  on public.feedback_report_events for select
  to authenticated using (public.is_platform_moderator());

-- No INSERT/DELETE policy anywhere; items/events have no UPDATE policy either
-- (their state changes only through SP-042D SECURITY DEFINER RPCs).
-- Belt-and-braces on top of RLS: strip client table privileges explicitly.
revoke all on public.feedback_reports from anon;
revoke insert, delete on public.feedback_reports from authenticated;
revoke all on public.feedback_correction_items from anon;
revoke insert, update, delete on public.feedback_correction_items from authenticated;
revoke all on public.feedback_report_events from anon;
revoke insert, update, delete on public.feedback_report_events from authenticated;

-- ---------------------------------------------------------------------------
-- 5. Guard trigger — submitted content is immutable; terminal reports accept
--    only admin_note additions (architecture §11).
-- ---------------------------------------------------------------------------
create function public.guard_feedback_report_update()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.type is distinct from old.type
     or new.sauna_id is distinct from old.sauna_id
     or new.sauna_name_snapshot is distinct from old.sauna_name_snapshot
     or new.category is distinct from old.category
     or new.message is distinct from old.message
     or new.created_by is distinct from old.created_by
     or new.contact_email is distinct from old.contact_email
     or new.submitter_key_hash is distinct from old.submitter_key_hash
     or new.locale is distinct from old.locale
     or new.source_path is distinct from old.source_path
     or new.created_at is distinct from old.created_at then
    raise exception 'feedback_reports: submitted content is immutable';
  end if;
  if old.status in ('resolved','rejected') and (
       new.status is distinct from old.status
       or new.resolved_at is distinct from old.resolved_at
       or new.resolved_by is distinct from old.resolved_by) then
    raise exception 'feedback_reports: report is terminal';
  end if;
  return new;
end $$;

create trigger feedback_reports_guard
  before update on public.feedback_reports
  for each row execute function public.guard_feedback_report_update();

-- ---------------------------------------------------------------------------
-- 6. Status-change audit trigger — the action layer cannot skip audit
--    (architecture §15). SECURITY DEFINER so the append succeeds although
--    clients hold no INSERT on the events table.
-- ---------------------------------------------------------------------------
create function public.feedback_report_status_audit()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    insert into public.feedback_report_events (report_id, event_type, actor_user_id, payload)
    values (new.id, 'status_changed', auth.uid(),
            jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end $$;

create trigger feedback_reports_status_audit
  after update on public.feedback_reports
  for each row execute function public.feedback_report_status_audit();

-- ---------------------------------------------------------------------------
-- 7. submit_feedback_report — the ONLY intake path (architecture §12.1).
--    Returns jsonb { ok, code } with stable codes and no identifiers
--    (anti-enumeration). Identity: created_by := auth.uid(), never a param.
--    Counting errors propagate and abort the call — fail closed.
-- ---------------------------------------------------------------------------
create function public.submit_feedback_report(
  p_type text,
  p_sauna_id uuid,
  p_category text,
  p_message text,
  p_proposed_value jsonb,
  p_contact_email text,
  p_locale text,
  p_source_path text,
  p_submitter_key_hash text
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid       uuid := auth.uid();
  v_sauna     public.saunas%rowtype;
  v_message   text := btrim(coalesce(p_message, ''));
  v_email     text := nullif(btrim(coalesce(p_contact_email, '')), '');
  v_key       text := nullif(btrim(coalesce(p_submitter_key_hash, '')), '');
  v_source    text := nullif(btrim(coalesce(p_source_path, '')), '');
  v_field     text;
  v_current   jsonb;
  v_proposed  jsonb;
  v_prop_text text;
  v_lat       numeric;
  v_lng       numeric;
  v_count     integer;
  v_report_id uuid;
begin
  -- SP-042B accepts facility corrections only; SP-042C widens this set.
  if p_type is distinct from 'facility_correction' then
    return jsonb_build_object('ok', false, 'code', 'invalid-input');
  end if;

  if p_locale is null or p_locale not in ('pl','en','de') then
    return jsonb_build_object('ok', false, 'code', 'invalid-input');
  end if;

  if p_category is null or p_category not in
     ('name','address','coordinates','website','social_link','contact_details',
      'category','opening_info','photo','closed','duplicate','other') then
    return jsonb_build_object('ok', false, 'code', 'invalid-category');
  end if;

  if v_message = '' or char_length(v_message) > 4000 then
    return jsonb_build_object('ok', false, 'code', 'invalid-input');
  end if;

  if v_email is not null and (char_length(v_email) > 254
     or position('@' in v_email) <= 1
     or position(' ' in v_email) > 0) then
    return jsonb_build_object('ok', false, 'code', 'invalid-email');
  end if;

  -- context hint only — sanitize, never reject because of it
  if v_source is not null and (char_length(v_source) > 300 or left(v_source, 1) <> '/') then
    v_source := null;
  end if;

  select * into v_sauna from public.saunas where id = p_sauna_id;
  if not found or v_sauna.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'invalid-facility');
  end if;

  -- Rolling-window rate limits (architecture §16).
  if v_uid is not null then
    select count(*) into v_count from public.feedback_reports
      where created_by = v_uid and created_at >= now() - interval '1 hour';
    if v_count >= 10 then
      return jsonb_build_object('ok', false, 'code', 'rate-limited');
    end if;
  else
    -- Anonymous branch: ONLY the trusted server path may enter (see header —
    -- grants already exclude anon; this pin survives any grant drift).
    if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
      return jsonb_build_object('ok', false, 'code', 'invalid-input');
    end if;
    -- anonymous submissions are accepted only with a server-derived HMAC key
    if v_key is null or v_key !~ '^[0-9a-f]{64}$' then
      return jsonb_build_object('ok', false, 'code', 'invalid-input');
    end if;
    select count(*) into v_count from public.feedback_reports
      where submitter_key_hash = v_key and created_at >= now() - interval '1 hour';
    if v_count >= 3 then
      return jsonb_build_object('ok', false, 'code', 'rate-limited');
    end if;
    select count(*) into v_count from public.feedback_reports
      where submitter_key_hash = v_key and created_at >= now() - interval '24 hours';
    if v_count >= 10 then
      return jsonb_build_object('ok', false, 'code', 'rate-limited');
    end if;
  end if;

  -- Optional single structured item (owner decision D3).
  if p_proposed_value is not null then
    v_field := case p_category
      when 'name'            then 'name'
      when 'address'         then 'address'
      when 'coordinates'     then 'coordinates'
      when 'website'         then 'website'
      when 'social_link'     then 'social_links'
      when 'contact_details' then 'contact_details' -- refined to phone/email below
      when 'category'        then 'category'
      when 'opening_info'    then 'opening_hours'
      else null
    end;
    -- the form never offers a structured input for unmapped categories
    if v_field is null or pg_column_size(p_proposed_value) > 2048 then
      return jsonb_build_object('ok', false, 'code', 'invalid-input');
    end if;

    if v_field = 'coordinates' then
      if jsonb_typeof(p_proposed_value) <> 'object'
         or jsonb_typeof(p_proposed_value->'lat') <> 'number'
         or jsonb_typeof(p_proposed_value->'lng') <> 'number' then
        return jsonb_build_object('ok', false, 'code', 'invalid-input');
      end if;
      v_lat := (p_proposed_value->>'lat')::numeric;
      v_lng := (p_proposed_value->>'lng')::numeric;
      if v_lat < -90 or v_lat > 90 or v_lng < -180 or v_lng > 180
         or (v_lat = 0 and v_lng = 0) then
        return jsonb_build_object('ok', false, 'code', 'invalid-input');
      end if;
      v_proposed := jsonb_build_object('lat', v_lat, 'lng', v_lng);
    else
      if jsonb_typeof(p_proposed_value) <> 'string' then
        return jsonb_build_object('ok', false, 'code', 'invalid-input');
      end if;
      v_prop_text := btrim(p_proposed_value #>> '{}');
      if v_prop_text = '' or char_length(v_prop_text) > 500 then
        return jsonb_build_object('ok', false, 'code', 'invalid-input');
      end if;
      if v_field = 'contact_details' then
        v_field := case when position('@' in v_prop_text) > 1 then 'email' else 'phone' end;
      end if;
      v_proposed := to_jsonb(v_prop_text);
    end if;

    -- current-value snapshot, taken in the same transaction (architecture §8)
    v_current := case v_field
      when 'name'          then to_jsonb(v_sauna.name)
      when 'address'       then to_jsonb(v_sauna.address)
      when 'website'       then to_jsonb(v_sauna.website)
      when 'phone'         then to_jsonb(v_sauna.phone)
      when 'email'         then to_jsonb(v_sauna.email)
      when 'category'      then to_jsonb(v_sauna.category)
      when 'coordinates'   then case
                                  when v_sauna.latitude is null or v_sauna.longitude is null then null
                                  else jsonb_build_object('lat', v_sauna.latitude, 'lng', v_sauna.longitude)
                                end
      when 'opening_hours' then v_sauna.opening_hours
      when 'social_links'  then v_sauna.social_links
      else null
    end;
  end if;

  insert into public.feedback_reports
    (type, sauna_id, sauna_name_snapshot, category, message, created_by,
     contact_email, submitter_key_hash, locale, source_path, status)
  values
    ('facility_correction', v_sauna.id, v_sauna.name, p_category, v_message, v_uid,
     v_email, case when v_uid is null then v_key else null end, p_locale, v_source, 'new')
  returning id into v_report_id;

  if v_field is not null then
    insert into public.feedback_correction_items
      (report_id, field_code, current_value, proposed_value, provenance, status)
    values
      (v_report_id, v_field, v_current, v_proposed,
       jsonb_build_object('origin', 'user'), 'pending');
  end if;

  insert into public.feedback_report_events (report_id, event_type, actor_user_id, payload)
  values (v_report_id, 'report_created', v_uid,
          jsonb_build_object('type', 'facility_correction', 'category', p_category));

  return jsonb_build_object('ok', true, 'code', 'ok');
end $$;

-- ---------------------------------------------------------------------------
-- 8. Function grants — explicit revoke-then-grant; never rely on Supabase
--    default privileges. anon deliberately receives NO EXECUTE (anonymous
--    intake = trusted server path only; see header). Trigger/guard functions
--    stay postgres-only.
-- ---------------------------------------------------------------------------
revoke all on function public.submit_feedback_report(text,uuid,text,text,jsonb,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_feedback_report(text,uuid,text,text,jsonb,text,text,text,text)
  to authenticated, service_role;

revoke all on function public.guard_feedback_report_update()
  from public, anon, authenticated, service_role;
revoke all on function public.feedback_report_status_audit()
  from public, anon, authenticated, service_role;

commit;
