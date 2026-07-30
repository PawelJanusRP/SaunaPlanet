-- ============================================================================
-- SP-039 Slice 4C2 — M10: publication transition RPCs + material-edit
-- demotion trigger.
--
-- Builds on M9 (state table, audit table, visibility helper, legacy backfill).
-- M10 adds the ONLY writers of publication state: seven narrowly scoped
-- SECURITY DEFINER RPCs (owner / moderator gated internally, M4 pattern) and
-- one AFTER UPDATE trigger on sauna_masters that demotes a publicly visible
-- profile when its OWNER materially edits public fields.
--
-- TRANSITION MATRIX (source of truth; nothing implicit):
--
--   caller     from                to                 code                 event
--   ---------  ------------------  -----------------  -------------------  --------------------------
--   owner      draft/none          submitted          submitted            profile_submitted
--   owner      changes_requested   submitted          submitted            profile_submitted
--   owner      submitted           (no-op)            already_submitted    (none)
--   owner      submitted           draft              withdrawn            submission_withdrawn
--   owner      draft/none          (no-op)            already_draft        (none)
--   owner      published           draft              unpublished          profile_unpublished
--   owner/mod  draft/none          (no-op)            already_unpublished  (none)
--   moderator  published           draft              unpublished          profile_unpublished
--   moderator  legacy_published    draft              unpublished          profile_unpublished
--   moderator  submitted           published          published            publication_approved
--   moderator  published           (no-op)            already_published    (none)
--   moderator  submitted           changes_requested  changes_requested    changes_requested
--   moderator  changes_requested   (no-op)            already_changes_...  (none)
--   moderator  submitted           suspended          suspended            profile_suspended
--   moderator  changes_requested   suspended          suspended            profile_suspended
--   moderator  published           suspended          suspended            profile_suspended
--   moderator  legacy_published    suspended          suspended            profile_suspended
--   moderator  suspended           (no-op)            already_suspended    (none)
--   moderator  suspended           draft              restored             publication_restored
--   trigger    published           submitted          (n/a)                publication_demoted
--   trigger    legacy_published    submitted          (n/a)                publication_demoted
--
--   Every other (caller, from, to) combination returns invalid_transition
--   and writes NO event. Idempotent repeats (already_*) write NO event.
--
-- LEGACY CONTRACT (M9 grandfathering, preserved):
--   * legacy_published visibility is untouched by M10 unless a moderator
--     acts (unpublish/suspend) or a FUTURE owner materially edits the
--     profile (demotion trigger) — each of those moves the row into the
--     normal lifecycle and NOTHING in this migration can ever set
--     'legacy_published' again (the state is write-orphaned by design).
--   * The owner-unpublish and owner-submit paths treat legacy_published as
--     invalid_transition: an owner cannot exit or re-enter grandfathering
--     except through the audited material-edit demotion.
--
-- COMPLETENESS GATE (submit; mirrors lib/master/completeness.ts hard set):
--   name (btrim non-empty), city (btrim non-empty), bio (btrim length >= 80,
--   the shared BIO_MIN_LENGTH), avatar_url (btrim non-empty), specialties
--   (>= 1 element). Ownership is implied by the owner gate; suspension is a
--   transition-level refusal. Failures return code profile_incomplete with
--   data.missing = bounded field-code array; NO private values are returned.
--
-- CONCURRENCY: every RPC serializes per master via
--   pg_advisory_xact_lock(hashtextextended(master_id::text, 0))  -- M4 order
-- then row-locks sauna_masters and the publication row (FOR UPDATE). The
-- trigger relies on the ordinary row lock of the UPDATE itself.
--
-- Companion rollback: 2026-07-30_sp039_m10_publication_transitions_rollback.sql
-- ============================================================================
begin;

-- Fail loud unless the live objects are EXACTLY the expected M9 state.
do $$
declare
  v_qual text;
  v_def  text;
begin
  if to_regclass('public.master_publication') is null then
    raise exception 'M10 GUARD: master_publication missing — apply M9 first; stop';
  end if;
  if to_regclass('public.master_publication_events') is null then
    raise exception 'M10 GUARD: master_publication_events missing — apply M9 first; stop';
  end if;
  if to_regprocedure('public.is_master_publicly_visible(uuid)') is null then
    raise exception 'M10 GUARD: is_master_publicly_visible missing — apply M9 first; stop';
  end if;

  select qual into v_qual from pg_policies
   where schemaname = 'public' and tablename = 'sauna_masters'
     and policyname = 'masters_select';
  if v_qual is null or position('is_master_publicly_visible' in v_qual) = 0 then
    raise exception 'M10 GUARD: masters_select is not the M9 helper policy; stop';
  end if;

  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'public.master_publication_events'::regclass
     and conname = 'mpe_event_type_check';
  if v_def is null
     or position('legacy_publication_granted' in v_def) = 0
     or position('owner_publication_withdrawn' in v_def) = 0 then
    raise exception 'M10 GUARD: mpe_event_type_check is not the M9 body; stop';
  end if;
  if position('publication_demoted' in v_def) > 0 then
    raise exception 'M10 GUARD: event vocabulary already extended — M10 already applied?; stop';
  end if;

  if to_regprocedure('public.submit_master_profile_for_publication(uuid)') is not null
     or to_regprocedure('public.withdraw_master_profile_submission(uuid, text)') is not null
     or to_regprocedure('public.unpublish_master_profile(uuid, text)') is not null
     or to_regprocedure('public.moderator_approve_master_publication(uuid, text)') is not null
     or to_regprocedure('public.moderator_request_master_publication_changes(uuid, text)') is not null
     or to_regprocedure('public.moderator_suspend_master_publication(uuid, text)') is not null
     or to_regprocedure('public.moderator_restore_master_publication(uuid, text)') is not null
     or to_regprocedure('public.handle_master_material_edit_demotion()') is not null then
    raise exception 'M10 GUARD: an M10 function already exists; stop and review';
  end if;
  if exists (select 1 from pg_trigger
              where tgrelid = 'public.sauna_masters'::regclass
                and tgname = 'sauna_masters_material_edit_demotion') then
    raise exception 'M10 GUARD: demotion trigger already exists; stop and review';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Event vocabulary: 7 -> 10 (superset swap; existing rows all pass).
-- ---------------------------------------------------------------------------
alter table public.master_publication_events
  drop constraint mpe_event_type_check;
alter table public.master_publication_events
  add constraint mpe_event_type_check
  check (event_type in (
    'legacy_publication_granted','profile_submitted','changes_requested',
    'publication_approved','profile_unpublished','profile_suspended',
    'owner_publication_withdrawn','submission_withdrawn',
    'publication_restored','publication_demoted'));

-- ---------------------------------------------------------------------------
-- 2. Owner RPC: submit for publication (draft/changes_requested -> submitted).
-- ---------------------------------------------------------------------------
create function public.submit_master_profile_for_publication(
  p_master_id uuid
) returns jsonb as $$
declare
  v_actor   uuid := auth.uid();
  v_master  public.sauna_masters%rowtype;
  v_pub     public.master_publication%rowtype;
  v_missing text[] := '{}';
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_master_id::text, 0));

  select * into v_master from public.sauna_masters
   where id = p_master_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'master_not_found');
  end if;
  if v_master.user_id is null or v_master.user_id <> v_actor then
    return jsonb_build_object('ok', false, 'code', 'not_owner');
  end if;

  insert into public.master_publication (master_id)
  values (p_master_id)
  on conflict (master_id) do nothing;
  select * into v_pub from public.master_publication
   where master_id = p_master_id for update;

  if v_pub.publication_status = 'submitted' then
    return jsonb_build_object('ok', true, 'code', 'already_submitted');
  end if;
  if v_pub.publication_status not in ('draft','changes_requested') then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition');
  end if;

  -- completeness gate (hard pilot set; codes only, never values)
  if coalesce(btrim(v_master.name), '') = '' then
    v_missing := v_missing || 'name';
  end if;
  if coalesce(btrim(v_master.city), '') = '' then
    v_missing := v_missing || 'city';
  end if;
  if coalesce(char_length(btrim(v_master.bio)), 0) < 80 then
    v_missing := v_missing || 'bio';
  end if;
  if coalesce(btrim(v_master.avatar_url), '') = '' then
    v_missing := v_missing || 'avatar';
  end if;
  if v_master.specialties is null or cardinality(v_master.specialties) < 1 then
    v_missing := v_missing || 'specialties';
  end if;
  if cardinality(v_missing) > 0 then
    return jsonb_build_object('ok', false, 'code', 'profile_incomplete',
      'data', jsonb_build_object('missing', to_jsonb(v_missing)));
  end if;

  update public.master_publication
     set publication_status = 'submitted',
         submitted_at = now(),
         updated_at = now()
   where master_id = p_master_id;

  insert into public.master_publication_events
    (master_id, event_type, actor_user_id)
  values (p_master_id, 'profile_submitted', v_actor);

  return jsonb_build_object('ok', true, 'code', 'submitted',
    'data', jsonb_build_object('publication_status', 'submitted'));
end $$ language plpgsql security definer set search_path = '';

-- ---------------------------------------------------------------------------
-- 3. Owner RPC: withdraw a pending submission (submitted -> draft).
-- ---------------------------------------------------------------------------
create function public.withdraw_master_profile_submission(
  p_master_id uuid,
  p_reason    text default null
) returns jsonb as $$
declare
  v_actor  uuid := auth.uid();
  v_master public.sauna_masters%rowtype;
  v_pub    public.master_publication%rowtype;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 2000), '');
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_master_id::text, 0));

  select * into v_master from public.sauna_masters
   where id = p_master_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'master_not_found');
  end if;
  if v_master.user_id is null or v_master.user_id <> v_actor then
    return jsonb_build_object('ok', false, 'code', 'not_owner');
  end if;

  select * into v_pub from public.master_publication
   where master_id = p_master_id for update;
  if not found or v_pub.publication_status = 'draft' then
    return jsonb_build_object('ok', true, 'code', 'already_draft');
  end if;
  if v_pub.publication_status <> 'submitted' then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition');
  end if;

  update public.master_publication
     set publication_status = 'draft',
         updated_at = now()
   where master_id = p_master_id;

  insert into public.master_publication_events
    (master_id, event_type, actor_user_id, reason)
  values (p_master_id, 'submission_withdrawn', v_actor, v_reason);

  return jsonb_build_object('ok', true, 'code', 'withdrawn',
    'data', jsonb_build_object('publication_status', 'draft'));
end $$ language plpgsql security definer set search_path = '';

-- ---------------------------------------------------------------------------
-- 4. Owner-or-moderator RPC: unpublish (published -> draft; moderator may
--    also exit legacy_published — the grandfathering moderation path).
-- ---------------------------------------------------------------------------
create function public.unpublish_master_profile(
  p_master_id uuid,
  p_reason    text default null
) returns jsonb as $$
declare
  v_actor  uuid := auth.uid();
  v_master public.sauna_masters%rowtype;
  v_pub    public.master_publication%rowtype;
  v_is_mod boolean;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 2000), '');
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;
  v_is_mod := public.is_platform_moderator();

  perform pg_advisory_xact_lock(hashtextextended(p_master_id::text, 0));

  select * into v_master from public.sauna_masters
   where id = p_master_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'master_not_found');
  end if;
  if not v_is_mod
     and (v_master.user_id is null or v_master.user_id <> v_actor) then
    return jsonb_build_object('ok', false, 'code', 'not_authorized');
  end if;

  select * into v_pub from public.master_publication
   where master_id = p_master_id for update;
  if not found or v_pub.publication_status = 'draft' then
    return jsonb_build_object('ok', true, 'code', 'already_unpublished');
  end if;
  if v_pub.publication_status = 'legacy_published' and not v_is_mod then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition');
  end if;
  if v_pub.publication_status not in ('published','legacy_published') then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition');
  end if;

  update public.master_publication
     set publication_status = 'draft',
         published_at = null,
         updated_at = now()
   where master_id = p_master_id;

  insert into public.master_publication_events
    (master_id, event_type, actor_user_id, reason)
  values (p_master_id, 'profile_unpublished', v_actor, v_reason);

  return jsonb_build_object('ok', true, 'code', 'unpublished',
    'data', jsonb_build_object('publication_status', 'draft'));
end $$ language plpgsql security definer set search_path = '';

-- ---------------------------------------------------------------------------
-- 5. Moderator RPC: approve (submitted -> published). Fail-closed gates:
--    the master row must already be moderation-approved and owned (an
--    unowned submitted row is unreachable — the M9 owner-deletion trigger
--    resets it — but the check stays as defense in depth).
-- ---------------------------------------------------------------------------
create function public.moderator_approve_master_publication(
  p_master_id uuid,
  p_note      text default null
) returns jsonb as $$
declare
  v_actor  uuid := auth.uid();
  v_master public.sauna_masters%rowtype;
  v_pub    public.master_publication%rowtype;
  v_note   text := nullif(left(btrim(coalesce(p_note, '')), 2000), '');
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;
  if not public.is_platform_moderator() then
    return jsonb_build_object('ok', false, 'code', 'not_authorized');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_master_id::text, 0));

  select * into v_master from public.sauna_masters
   where id = p_master_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'master_not_found');
  end if;

  select * into v_pub from public.master_publication
   where master_id = p_master_id for update;
  if found and v_pub.publication_status = 'published' then
    return jsonb_build_object('ok', true, 'code', 'already_published');
  end if;
  if not found or v_pub.publication_status <> 'submitted' then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition');
  end if;
  if v_master.status <> 'approved' then
    return jsonb_build_object('ok', false, 'code', 'master_not_approved');
  end if;
  if v_master.user_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition');
  end if;

  update public.master_publication
     set publication_status = 'published',
         published_at = now(),
         publication_reviewed_at = now(),
         publication_reviewed_by = v_actor,
         publication_review_note = v_note,
         updated_at = now()
   where master_id = p_master_id;

  insert into public.master_publication_events
    (master_id, event_type, actor_user_id, reason)
  values (p_master_id, 'publication_approved', v_actor, v_note);

  return jsonb_build_object('ok', true, 'code', 'published',
    'data', jsonb_build_object('publication_status', 'published'));
end $$ language plpgsql security definer set search_path = '';

-- ---------------------------------------------------------------------------
-- 6. Moderator RPC: request changes (submitted -> changes_requested).
--    Reason REQUIRED — it is the owner-facing feedback.
-- ---------------------------------------------------------------------------
create function public.moderator_request_master_publication_changes(
  p_master_id uuid,
  p_reason    text
) returns jsonb as $$
declare
  v_actor  uuid := auth.uid();
  v_pub    public.master_publication%rowtype;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 2000), '');
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;
  if not public.is_platform_moderator() then
    return jsonb_build_object('ok', false, 'code', 'not_authorized');
  end if;
  if v_reason is null then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_master_id::text, 0));

  perform 1 from public.sauna_masters where id = p_master_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'master_not_found');
  end if;

  select * into v_pub from public.master_publication
   where master_id = p_master_id for update;
  if found and v_pub.publication_status = 'changes_requested' then
    return jsonb_build_object('ok', true, 'code', 'already_changes_requested');
  end if;
  if not found or v_pub.publication_status <> 'submitted' then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition');
  end if;

  update public.master_publication
     set publication_status = 'changes_requested',
         publication_reviewed_at = now(),
         publication_reviewed_by = v_actor,
         publication_review_note = v_reason,
         updated_at = now()
   where master_id = p_master_id;

  insert into public.master_publication_events
    (master_id, event_type, actor_user_id, reason)
  values (p_master_id, 'changes_requested', v_actor, v_reason);

  return jsonb_build_object('ok', true, 'code', 'changes_requested',
    'data', jsonb_build_object('publication_status', 'changes_requested'));
end $$ language plpgsql security definer set search_path = '';

-- ---------------------------------------------------------------------------
-- 7. Moderator RPC: suspend (submitted/changes_requested/published/
--    legacy_published -> suspended). Reason REQUIRED. Suspending a
--    legacy_published row exits grandfathering permanently (restore lands
--    on draft; nothing can ever set legacy_published again).
-- ---------------------------------------------------------------------------
create function public.moderator_suspend_master_publication(
  p_master_id uuid,
  p_reason    text
) returns jsonb as $$
declare
  v_actor  uuid := auth.uid();
  v_pub    public.master_publication%rowtype;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 2000), '');
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;
  if not public.is_platform_moderator() then
    return jsonb_build_object('ok', false, 'code', 'not_authorized');
  end if;
  if v_reason is null then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_master_id::text, 0));

  perform 1 from public.sauna_masters where id = p_master_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'master_not_found');
  end if;

  select * into v_pub from public.master_publication
   where master_id = p_master_id for update;
  if found and v_pub.publication_status = 'suspended' then
    return jsonb_build_object('ok', true, 'code', 'already_suspended');
  end if;
  if not found or v_pub.publication_status not in
     ('submitted','changes_requested','published','legacy_published') then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition');
  end if;

  update public.master_publication
     set publication_status = 'suspended',
         published_at = null,
         publication_reviewed_at = now(),
         publication_reviewed_by = v_actor,
         publication_review_note = v_reason,
         updated_at = now()
   where master_id = p_master_id;

  insert into public.master_publication_events
    (master_id, event_type, actor_user_id, reason)
  values (p_master_id, 'profile_suspended', v_actor, v_reason);

  return jsonb_build_object('ok', true, 'code', 'suspended',
    'data', jsonb_build_object('publication_status', 'suspended'));
end $$ language plpgsql security definer set search_path = '';

-- ---------------------------------------------------------------------------
-- 8. Moderator RPC: restore (suspended -> draft; the explicitly chosen
--    recovery state — the owner must re-run the workflow). Reason REQUIRED.
--    NOT idempotent by design: once restored the row is an ordinary draft
--    and a repeat returns invalid_transition (a draft origin is ambiguous).
-- ---------------------------------------------------------------------------
create function public.moderator_restore_master_publication(
  p_master_id uuid,
  p_reason    text
) returns jsonb as $$
declare
  v_actor  uuid := auth.uid();
  v_pub    public.master_publication%rowtype;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 2000), '');
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;
  if not public.is_platform_moderator() then
    return jsonb_build_object('ok', false, 'code', 'not_authorized');
  end if;
  if v_reason is null then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_master_id::text, 0));

  perform 1 from public.sauna_masters where id = p_master_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'master_not_found');
  end if;

  select * into v_pub from public.master_publication
   where master_id = p_master_id for update;
  if not found or v_pub.publication_status <> 'suspended' then
    return jsonb_build_object('ok', false, 'code', 'invalid_transition');
  end if;

  update public.master_publication
     set publication_status = 'draft',
         updated_at = now()
   where master_id = p_master_id;

  insert into public.master_publication_events
    (master_id, event_type, actor_user_id, reason)
  values (p_master_id, 'publication_restored', v_actor, v_reason);

  return jsonb_build_object('ok', true, 'code', 'restored',
    'data', jsonb_build_object('publication_status', 'draft'));
end $$ language plpgsql security definer set search_path = '';

-- ---------------------------------------------------------------------------
-- 9. Material-edit demotion trigger. A trigger (not an RPC) because owners
--    can UPDATE sauna_masters directly through PostgREST under the
--    masters_update_own policy — an RPC-only rule would be evadable. Fires
--    ONLY for owner-context edits (auth.uid() = new.user_id); trusted/FK
--    contexts (auth.uid() null) and moderator edits of other profiles never
--    demote. Demotes published AND legacy_published to submitted (the M9
--    grandfathering contract: an owner material edit moves a legacy row
--    into the normal lifecycle — audited, never silent).
--
--    Material fields = the owner-editable public presentation set:
--    name, slug, city, bio, avatar_url, cover_image_url, specialties,
--    languages, experience_since_year, social_links, website.
--    Moderation-guarded columns (level/status/rating/...) are excluded —
--    owners cannot change them anyway (guard_master_privileged_columns).
-- ---------------------------------------------------------------------------
create function public.handle_master_material_edit_demotion()
returns trigger as $$
begin
  if auth.uid() is null
     or new.user_id is null
     or new.user_id <> auth.uid() then
    return null;
  end if;

  if new.name is not distinct from old.name
     and new.slug is not distinct from old.slug
     and new.city is not distinct from old.city
     and new.bio is not distinct from old.bio
     and new.avatar_url is not distinct from old.avatar_url
     and new.cover_image_url is not distinct from old.cover_image_url
     and new.specialties is not distinct from old.specialties
     and new.languages is not distinct from old.languages
     and new.experience_since_year is not distinct from old.experience_since_year
     and new.social_links is not distinct from old.social_links
     and new.website is not distinct from old.website then
    return null;
  end if;

  update public.master_publication
     set publication_status = 'submitted',
         submitted_at = now(),
         published_at = null,
         updated_at = now()
   where master_id = new.id
     and publication_status in ('published','legacy_published');
  if found then
    insert into public.master_publication_events
      (master_id, event_type, actor_user_id, reason)
    values (new.id, 'publication_demoted', auth.uid(),
            'material profile edit while publicly visible; moderator re-approval required');
  end if;

  return null;
end $$ language plpgsql security definer set search_path = '';

create trigger sauna_masters_material_edit_demotion
  after update on public.sauna_masters
  for each row
  execute function public.handle_master_material_edit_demotion();

-- ---------------------------------------------------------------------------
-- 10. Least-privilege grants. RPCs: authenticated only (role gates are
--     internal); NEVER anon. Trigger function: not callable by anyone.
-- ---------------------------------------------------------------------------
revoke all on function public.submit_master_profile_for_publication(uuid)
  from public, anon;
grant execute on function public.submit_master_profile_for_publication(uuid)
  to authenticated;

revoke all on function public.withdraw_master_profile_submission(uuid, text)
  from public, anon;
grant execute on function public.withdraw_master_profile_submission(uuid, text)
  to authenticated;

revoke all on function public.unpublish_master_profile(uuid, text)
  from public, anon;
grant execute on function public.unpublish_master_profile(uuid, text)
  to authenticated;

revoke all on function public.moderator_approve_master_publication(uuid, text)
  from public, anon;
grant execute on function public.moderator_approve_master_publication(uuid, text)
  to authenticated;

revoke all on function public.moderator_request_master_publication_changes(uuid, text)
  from public, anon;
grant execute on function public.moderator_request_master_publication_changes(uuid, text)
  to authenticated;

revoke all on function public.moderator_suspend_master_publication(uuid, text)
  from public, anon;
grant execute on function public.moderator_suspend_master_publication(uuid, text)
  to authenticated;

revoke all on function public.moderator_restore_master_publication(uuid, text)
  from public, anon;
grant execute on function public.moderator_restore_master_publication(uuid, text)
  to authenticated;

revoke all on function public.handle_master_material_edit_demotion()
  from public, anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- POST-APPLY VERIFICATION (see the M10 package):
-- V1. mpe_event_type_check lists exactly the 10 types.
-- V2. The 7 RPCs + trigger function exist, DEFINER, search_path="", ACLs:
--     RPCs = postgres + authenticated EXECUTE; trigger fn = postgres only.
-- V3. Trigger sauna_masters_material_edit_demotion: AFTER UPDATE, enabled.
-- V4. No data changed: publication rows/events identical to pre-apply.
-- V5. Behavioral (self-rolling-back): full lifecycle + negatives.
-- ============================================================================
