-- ============================================================================
-- SP-039 Slice 3B1 — M3: master_claim_events (append-only forensic audit).
--
-- Immutable history of the invitation lifecycle. Operational state remains
-- authoritative in the master_claim_invitations row; events are the forensic
-- trail. Append-only: INSERT flows ONLY through the M4 SECURITY DEFINER RPCs
-- (owner bypasses RLS — table is ENABLE, not FORCE); moderators may SELECT; NO
-- client INSERT/UPDATE/DELETE. Both parent FKs are nullable and ON DELETE SET
-- NULL so an event ALWAYS outlives its parents (never cascade-deleted).
--
-- Slice-3 event vocabulary only (six). Slice 4 will extend the CHECK with the
-- end-user claim events (superset drop+recreate) — no unused names added now.
-- No ip/user_agent: Slice-3 actors are trusted authenticated moderators
-- (actor_user_id suffices); IP/UA are reserved for the Slice-4 end-user events.
--
-- Companion rollback: 2026-07-27_sp039_m3_claim_events_rollback.sql
--
-- PRE-APPLY (read-only; STOP on mismatch):
-- P1. Table absent: select to_regclass('public.master_claim_events'); -- NULL
-- P2. master_claim_invitations present (M2 applied first):
--   select to_regclass('public.master_claim_invitations');  -- not null
-- ============================================================================
begin;

create table public.master_claim_events (
  id            uuid primary key default gen_random_uuid(),
  -- SET NULL (never cascade): an event survives deletion of its invitation.
  invitation_id uuid references public.master_claim_invitations(id) on delete set null,
  -- SET NULL (never cascade): an event survives deletion of its master.
  master_id     uuid references public.sauna_masters(id) on delete set null,
  event_type    text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  reason        text,
  delivery_channel text,
  metadata      jsonb,                     -- token_prefix at most; NEVER the raw token
  created_at    timestamptz not null default now(),

  constraint mce_event_type_check
    check (event_type in (
      'profile_prepared','invitation_created','invitation_sent',
      'invitation_revoked','invitation_regenerated','invitation_expired')),
  constraint mce_metadata_is_object
    check (metadata is null or jsonb_typeof(metadata) = 'object'),
  constraint mce_reason_len
    check (reason is null or char_length(reason) <= 2000),
  constraint mce_delivery_channel_check
    check (delivery_channel is null
           or delivery_channel in ('email','messenger','whatsapp','sms','other'))
);

-- Master timeline / invitation timeline (newest first).
create index master_claim_events_master_idx
  on public.master_claim_events (master_id, created_at desc);
create index master_claim_events_invitation_idx
  on public.master_claim_events (invitation_id, created_at desc);
-- Actor rolling-window rate-limit windows (M4) + event-type/time queries.
create index master_claim_events_actor_idx
  on public.master_claim_events (actor_user_id, event_type, created_at);
-- Event-type/time + retention scans.
create index master_claim_events_type_time_idx
  on public.master_claim_events (event_type, created_at);

-- ---------------------------------------------------------------------------
-- RLS: enabled (not forced — DEFINER RPCs owned by the table owner INSERT the
-- audit). Moderators may SELECT (no secret column here); NO client
-- INSERT/UPDATE/DELETE policy at all -> append-only from any client's view.
-- ---------------------------------------------------------------------------
alter table public.master_claim_events enable row level security;

revoke all on public.master_claim_events from anon, authenticated;
-- moderators need the base SELECT privilege for the policy below to apply
grant select on public.master_claim_events to authenticated;

create policy master_claim_events_select_moderator on public.master_claim_events
  for select
  using (public.is_platform_moderator());
-- (no INSERT/UPDATE/DELETE policies: clients can never write; the M4 DEFINER
--  RPCs insert as the table owner, bypassing RLS.)

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- POST-APPLY VERIFICATION
-- V1. Columns/types; nullable invitation_id/master_id/actor_user_id; metadata jsonb:
--   select column_name, data_type, is_nullable from information_schema.columns
--   where table_schema='public' and table_name='master_claim_events'
--   order by ordinal_position;
-- V2. Slice-3 event vocabulary CHECK (exactly the six; no claim events yet):
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conrelid='public.master_claim_events'::regclass and conname='mce_event_type_check';
-- V3. FK delete actions all SET NULL:
--   select conname, confdeltype from pg_constraint
--   where conrelid='public.master_claim_events'::regclass and contype='f';
--   -- confdeltype = 'n' for invitation_id, master_id, actor_user_id.
-- V4. Append-only posture: exactly one policy (SELECT, moderator); no
--     INSERT/UPDATE/DELETE policy; anon/authenticated have no INSERT/UPDATE/DELETE:
--   select policyname, cmd, qual from pg_policies where schemaname='public'
--     and tablename='master_claim_events';                      -- 1 row, SELECT
--   select privilege_type from information_schema.role_table_grants
--   where table_name='master_claim_events' and grantee='authenticated';  -- SELECT only
-- V5. Behavioral (rolled-back impersonation): moderator SELECT -> rows; ordinary
--     user SELECT -> 0 rows (policy false); any client INSERT/UPDATE/DELETE ->
--     permission denied / no policy.
-- ROLLBACK: dropping the table discards forensic history — only for schema-only
-- teardown before any real event exists (see rollback file).
-- ============================================================================
