-- ============================================================================
-- SP-039 Slice 4C2 — M9: master profile publication schema + legacy backfill.
--
-- Owner decision (2026-07-30): existing verified legacy public profiles are
-- EXPLICITLY migrated to the distinct 'legacy_published' state; all new and
-- pilot profiles require an owner and the normal publication workflow.
--
-- Architecture (ADR §12.6): publication state lives in a SEPARATE 1:1 table,
-- NOT on sauna_masters — clients have no DML on it (deny-all writes; the M10
-- DEFINER transition RPCs are the only writers), so owners structurally
-- cannot self-publish and guard_master_privileged_columns needs NO new
-- carve-outs. The public-visibility predicate moves behind a SECURITY
-- DEFINER helper so the masters_select RLS policy never sub-queries a
-- protected table as the caller.
--
-- VISIBILITY IDENTITY GUARANTEE (SaunaMap/satellites are HIGH-RISK areas):
-- the backfill marks EVERY currently-approved master 'legacy_published', so
-- the set of publicly visible masters is IDENTICAL before and after this
-- cutover. The workflow gate binds only profiles created/claimed afterwards.
--
-- Pieces (one transaction):
--   1. public.master_publication            — 1:1 state row (PK master_id).
--   2. public.master_publication_events     — append-only audit (M3 pattern).
--   3. public.is_master_publicly_visible()  — DEFINER helper for the policy.
--   4. Backfill: every status='approved' master -> ('legacy_published',
--      published_at=now()) + one 'legacy_publication_granted' event each.
--   5. masters_select policy swap: the 'approved' arm becomes the helper
--      call; owner and moderator arms verbatim.
--   6. handle_master_owner_deletion (M8) extended: the FK-driven owner
--      anonymization ALSO resets an in-workflow publication row
--      (published/submitted/changes_requested -> draft, published_at NULL)
--      with an 'owner_publication_withdrawn' event. legacy_published and
--      suspended rows are left as-is (legacy never required an owner;
--      suspension is a moderator state) — the M8 status withdrawal
--      ('approved' -> 'pending') already hides the profile either way.
--
-- NOT here (M10): transition RPCs (submit/approve/changes/unpublish/
-- suspend), the material-edit demotion trigger, app boundaries and UI.
--
-- Companion rollback: 2026-07-30_sp039_m9_publication_schema_rollback.sql
-- (refuses once the workflow has been used beyond the legacy backfill).
--
-- PRE-APPLY (read-only; STOP on mismatch): see the M9 cutover package P1–P6.
-- ============================================================================
begin;

-- Fail loud unless the live objects are EXACTLY the expected predecessors.
do $$
declare
  v_qual text;
  v_fn   text;
begin
  if to_regclass('public.master_publication') is not null then
    raise exception 'M9 GUARD: master_publication already exists; stop and review';
  end if;
  if to_regclass('public.master_publication_events') is not null then
    raise exception 'M9 GUARD: master_publication_events already exists; stop and review';
  end if;
  if to_regprocedure('public.is_master_publicly_visible(uuid)') is not null then
    raise exception 'M9 GUARD: is_master_publicly_visible(uuid) already exists; stop and review';
  end if;

  -- masters_select must be the SP-035d three-arm body (D2-restored).
  select qual into v_qual from pg_policies
   where schemaname = 'public' and tablename = 'sauna_masters'
     and policyname = 'masters_select';
  if v_qual is null then
    raise exception 'M9 GUARD: masters_select policy not found; stop and review';
  end if;
  if position('approved' in v_qual) = 0
     or position('user_id = auth.uid()' in v_qual) = 0
     or position('is_platform_moderator' in v_qual) = 0 then
    raise exception 'M9 GUARD: masters_select is not the SP-035d three-arm body; stop and review';
  end if;
  if position('is_master_publicly_visible' in v_qual) > 0 then
    raise exception 'M9 GUARD: masters_select already uses the helper — M9 already applied?; stop and review';
  end if;

  -- Owner-deletion trigger must be the M8 body (no publication awareness yet).
  select prosrc into v_fn from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname = 'handle_master_owner_deletion';
  if v_fn is null or position('owner_account_deleted' in v_fn) = 0 then
    raise exception 'M9 GUARD: handle_master_owner_deletion is not the M8 body; stop and review';
  end if;
  if position('master_publication' in v_fn) > 0 then
    raise exception 'M9 GUARD: handle_master_owner_deletion already publication-aware — M9 already applied?; stop and review';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Publication state (1:1). Deny-all client writes; owner/moderator reads.
-- ---------------------------------------------------------------------------
create table public.master_publication (
  -- CASCADE: pure state, not audit — history lives in the events table, and
  -- the M5 delete guard blocks deleting any master with claim history anyway.
  master_id     uuid primary key
                references public.sauna_masters(id) on delete cascade,
  publication_status text not null default 'draft',
  published_at  timestamptz,
  submitted_at  timestamptz,
  publication_reviewed_at timestamptz,
  publication_reviewed_by uuid references auth.users(id) on delete set null,
  -- moderator feedback for the owner; NEVER exposed publicly
  publication_review_note text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint mp_status_check
    check (publication_status in
      ('draft','submitted','changes_requested','published','legacy_published','suspended')),
  -- live-publication timestamp equivalence (both public states)
  constraint mp_published_at_consistency
    check ((publication_status in ('published','legacy_published'))
           = (published_at is not null)),
  -- a submitted row must know when (timestamp persists as history afterwards)
  constraint mp_submitted_has_time
    check (publication_status <> 'submitted' or submitted_at is not null),
  -- M6 lesson baked in from day one: actor implies timestamp, never the
  -- reverse — the reviewer account may be deleted later (ON DELETE SET NULL)
  constraint mp_reviewer_implies_time
    check (publication_reviewed_by is null or publication_reviewed_at is not null),
  constraint mp_note_len
    check (publication_review_note is null
           or char_length(publication_review_note) <= 2000)
);

alter table public.master_publication enable row level security;
revoke all on public.master_publication from anon, authenticated;
grant select on public.master_publication to authenticated;

-- Owner sees their own workflow state; moderation sees all. NO write policy:
-- every mutation flows through the M10 DEFINER RPCs (owner bypass).
create policy master_publication_select_own_or_mod on public.master_publication
  for select
  using (
    public.is_platform_moderator()
    or exists (
      select 1 from public.sauna_masters m
      where m.id = master_id and m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Publication audit (append-only; the M3 pattern verbatim).
-- ---------------------------------------------------------------------------
create table public.master_publication_events (
  id            uuid primary key default gen_random_uuid(),
  master_id     uuid references public.sauna_masters(id) on delete set null,
  event_type    text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  reason        text,
  created_at    timestamptz not null default now(),

  constraint mpe_event_type_check
    check (event_type in (
      'legacy_publication_granted','profile_submitted','changes_requested',
      'publication_approved','profile_unpublished','profile_suspended',
      'owner_publication_withdrawn')),
  constraint mpe_reason_len
    check (reason is null or char_length(reason) <= 2000)
);

create index master_publication_events_master_idx
  on public.master_publication_events (master_id, created_at desc);
create index master_publication_events_type_time_idx
  on public.master_publication_events (event_type, created_at);

alter table public.master_publication_events enable row level security;
revoke all on public.master_publication_events from anon, authenticated;
grant select on public.master_publication_events to authenticated;

create policy master_publication_events_select_moderator
  on public.master_publication_events
  for select
  using (public.is_platform_moderator());

-- ---------------------------------------------------------------------------
-- 3. Public-visibility helper (DEFINER: the policy must not sub-query a
--    protected table as the caller).
-- ---------------------------------------------------------------------------
create function public.is_master_publicly_visible(target_master_id uuid)
returns boolean as $$
  select exists (
    select 1
    from public.sauna_masters m
    join public.master_publication mp on mp.master_id = m.id
    where m.id = target_master_id
      and m.status = 'approved'
      and (mp.publication_status = 'legacy_published'
           or (mp.publication_status = 'published' and m.user_id is not null))
  )
$$ language sql security definer stable set search_path = '';

revoke all on function public.is_master_publicly_visible(uuid)
  from public, anon, authenticated, service_role;
-- the policy evaluates as the querying role — both public roles need EXECUTE
grant execute on function public.is_master_publicly_visible(uuid)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Legacy backfill: EVERY currently-approved master is explicitly granted
--    legacy publication (owner decision) — the visible set cannot change.
-- ---------------------------------------------------------------------------
insert into public.master_publication (master_id, publication_status, published_at)
select id, 'legacy_published', now()
from public.sauna_masters
where status = 'approved';

insert into public.master_publication_events (master_id, event_type, reason)
select id, 'legacy_publication_granted',
       'M9 backfill: existing verified public profile migrated to legacy_published'
from public.sauna_masters
where status = 'approved';

-- Post-backfill identity check (fail loud inside the transaction).
do $$
declare v_a integer; v_b integer;
begin
  select count(*) into v_a from public.sauna_masters where status = 'approved';
  select count(*) into v_b from public.master_publication
   where publication_status = 'legacy_published';
  if v_a <> v_b then
    raise exception 'M9 GUARD: backfill mismatch (approved=% legacy=%); stop', v_a, v_b;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. masters_select: the public arm becomes the helper; owner and moderator
--    arms stay verbatim. Visible set is IDENTICAL post-backfill.
-- ---------------------------------------------------------------------------
drop policy masters_select on public.sauna_masters;
create policy masters_select on public.sauna_masters
  for select
  using (
    public.is_master_publicly_visible(id)
    or user_id = auth.uid()
    or public.is_platform_moderator()
  );

-- ---------------------------------------------------------------------------
-- 6. Owner-deletion trigger: M8 body + publication-workflow reset.
-- ---------------------------------------------------------------------------
create or replace function public.handle_master_owner_deletion()
returns trigger as $$
begin
  if old.user_id is not null and new.user_id is null and auth.uid() is null then
    if new.status = 'approved' then
      new.status := 'pending';
    end if;
    -- Reset an in-workflow publication row; legacy_published (never needed an
    -- owner) and suspended (moderator state) are left untouched. Either way
    -- the status withdrawal above already hides the profile.
    update public.master_publication
       set publication_status = 'draft',
           published_at = null,
           updated_at = now()
     where master_id = old.id
       and publication_status in ('published','submitted','changes_requested');
    if found then
      insert into public.master_publication_events (master_id, event_type, reason)
      values (old.id, 'owner_publication_withdrawn',
              'owner auth account deleted; publication workflow reset to draft');
    end if;
    insert into public.master_claim_events (master_id, event_type, reason)
    values (old.id, 'owner_account_deleted',
            'owner auth account deleted; publication withdrawn; moderator attention required');
  end if;
  return new;
end $$ language plpgsql security definer set search_path = '';

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- POST-APPLY VERIFICATION (see the M9 cutover package V1–V6):
-- V1. Both tables exist with the pinned constraints; RLS enabled; the ONLY
--     policies are the two SELECT policies; no client INSERT/UPDATE/DELETE.
-- V2. Helper: prosecdef, search_path="", EXECUTE for anon+authenticated only.
-- V3. masters_select qual contains is_master_publicly_visible + the two
--     verbatim arms.
-- V4. IDENTITY: the pre-M9 approved-master id set == the post-M9 publicly
--     visible id set (anon-perspective probe) — directory/map unchanged.
-- V5. Backfill: legacy rows == approved rows; one event per row; no other
--     publication rows or event types exist.
-- V6. Behavioral (self-rolling-back): a claimed+approved fixture WITHOUT a
--     publication row is NOT anon-visible (workflow gate binds new profiles);
--     with a 'published' row it IS visible; owner deletion resets published
--     -> draft + event and hides it; legacy fixture stays visible unowned.
-- ============================================================================
