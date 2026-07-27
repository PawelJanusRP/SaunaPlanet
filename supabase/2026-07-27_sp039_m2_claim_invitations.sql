-- ============================================================================
-- SP-039 Slice 3B1 — M2: master_claim_invitations.
--
-- One prepared-profile claim invitation per row. The raw token is NEVER stored
-- (only its SHA-256 digest as bytea + a non-secret 8-char prefix). At most one
-- ACTIVE invitation per master (partial unique index over explicit statuses —
-- never a volatile/time predicate). master_id uses ON DELETE RESTRICT so claim
-- history can never vanish through a cascade (SP-039 Slice 3A, approved B).
--
-- Status vocabulary (final MVP — no `created`): ready | sent | opened | claimed
-- | expired | revoked. Slice 3B1 drives ready/sent/expired/revoked; opened and
-- claimed are schema-compatible but their end-user transitions ship in Slice 4
-- (their columns — opened_at/last_opened_at/open_count/claimed_at/claimed_by —
-- are created now so Slice 4 needs no ALTER; justified retention).
--
-- Companion rollback: 2026-07-27_sp039_m2_claim_invitations_rollback.sql
--
-- PRE-APPLY (read-only; STOP on mismatch):
-- P1. Table absent: select to_regclass('public.master_claim_invitations'); -- NULL
-- P2. Proposed index/constraint names absent:
--   select indexname from pg_indexes where schemaname='public'
--     and indexname like 'master_claim_invitations_%';
-- P3. sauna_masters exists (FK target) with an id PK.
-- ============================================================================
begin;

create table public.master_claim_invitations (
  id             uuid primary key default gen_random_uuid(),
  -- RESTRICT: an invitation (incl. terminal history) blocks master deletion; the
  -- FK is the hard integrity backstop behind the M5 BEFORE DELETE guard.
  master_id      uuid not null references public.sauna_masters(id) on delete restrict,
  -- SHA-256(raw token) as raw 32 bytes. NEVER the raw token. Nullable ONLY so the
  -- 90-day retention job can null it on terminal rows (see CHECK below).
  token_hash     bytea,
  -- first 8 base64url chars of the token: NON-secret, moderator-only diagnostic.
  token_prefix   text not null,
  status         text not null default 'ready',
  expires_at     timestamptz not null,
  delivery_channel text,
  delivery_target_hint text,               -- REDACTED hint only, never a full address/number
  admin_note     text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz,
  opened_at      timestamptz,              -- Slice 4
  last_opened_at timestamptz,              -- Slice 4
  open_count     integer not null default 0,  -- Slice 4
  claimed_at     timestamptz,              -- Slice 4
  claimed_by     uuid references auth.users(id) on delete set null,  -- Slice 4
  revoked_at     timestamptz,
  revoked_by     uuid references auth.users(id) on delete set null,

  constraint mci_status_check
    check (status in ('ready','sent','opened','claimed','expired','revoked')),
  constraint mci_open_count_nonneg
    check (open_count >= 0),
  constraint mci_expiry_after_creation
    check (expires_at > created_at),
  -- claimed actor/time exist iff claimed (Slice 4 populates them)
  constraint mci_claimed_consistency
    check ((status = 'claimed') = (claimed_by is not null)
           and (claimed_at is not null) = (claimed_by is not null)),
  -- revoked actor/time exist iff revoked
  constraint mci_revoked_consistency
    check ((status = 'revoked') = (revoked_by is not null)
           and (revoked_at is not null) = (revoked_by is not null)),
  -- a send timestamp implies the row progressed past generation
  constraint mci_sent_at_consistency
    check (sent_at is null
           or status in ('sent','opened','claimed','expired','revoked')),
  -- token hash present while the invitation could still be usable; nullable ONLY
  -- for terminal rows (retention cleanup), never for an active/usable one
  constraint mci_token_hash_presence
    check (token_hash is not null
           or status in ('claimed','expired','revoked')),
  -- delivery-channel vocabulary (nullable = not recorded)
  constraint mci_delivery_channel_check
    check (delivery_channel is null
           or delivery_channel in ('email','messenger','whatsapp','sms','other')),
  -- reasonable length limits (defense-in-depth; app also validates)
  constraint mci_token_prefix_len   check (char_length(token_prefix) between 1 and 16),
  constraint mci_delivery_hint_len  check (delivery_target_hint is null or char_length(delivery_target_hint) <= 120),
  constraint mci_admin_note_len     check (admin_note is null or char_length(admin_note) <= 2000)
);

-- Usable-token uniqueness (partial — retention-nulled rows don't collide).
create unique index master_claim_invitations_token_hash_uidx
  on public.master_claim_invitations (token_hash)
  where token_hash is not null;

-- AT MOST ONE ACTIVE invitation per master. Predicate is EXPLICIT statuses only
-- — never now()/expires_at/any volatile expression (a partial-index predicate
-- must be immutable; expiry is enforced in the RPCs against expires_at).
create unique index master_claim_invitations_active_uidx
  on public.master_claim_invitations (master_id)
  where status in ('ready','sent','opened');

-- Master timeline (admin list/detail, newest first).
create index master_claim_invitations_master_idx
  on public.master_claim_invitations (master_id, created_at desc);

-- Expiry materialization + retention scans (find active-but-expired / old
-- terminal rows). Immutable columns only.
create index master_claim_invitations_status_expires_idx
  on public.master_claim_invitations (status, expires_at);

-- ---------------------------------------------------------------------------
-- RLS: default-deny for clients. RLS is ENABLED but deliberately NOT FORCED —
-- the M4 SECURITY DEFINER admin RPCs run as the table owner and rely on the
-- owner's RLS bypass to read/insert/update (the established SP-037B/SP-038
-- pattern). Clients (anon/authenticated) are non-owner, have NO policy, and have
-- their direct DML grants revoked, so ALL client access is denied and every
-- legitimate operation flows through the M4 RPCs. token_hash never leaves the DB.
-- ---------------------------------------------------------------------------
alter table public.master_claim_invitations enable row level security;

revoke all on public.master_claim_invitations from anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- POST-APPLY VERIFICATION
-- V1. Columns/types present; status default 'ready'; no raw-token column exists
--     (only token_hash bytea + token_prefix text):
--   select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='master_claim_invitations'
--   order by ordinal_position;
--   -- expect NO column named token / raw_token / secret.
-- V2. Constraints present (status vocab excludes 'created'; open_count>=0;
--     expiry>creation; claimed/revoked/sent/token-hash consistency; delivery
--     vocab; length limits):
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid='public.master_claim_invitations'::regclass order by conname;
-- V3. Indexes: token_hash unique (partial), active unique over
--     {ready,sent,opened} with NO now()/expires_at in the predicate:
--   select indexname, indexdef from pg_indexes
--   where schemaname='public' and tablename='master_claim_invitations';
--   -- assert active index def contains "ready, sent, opened" and NOT "now(".
-- V4. FK on master_id is ON DELETE RESTRICT; actor FKs ON DELETE SET NULL:
--   select conname, confdeltype from pg_constraint
--   where conrelid='public.master_claim_invitations'::regclass and contype='f';
--   -- confdeltype: master_id='r' (restrict); created_by/claimed_by/revoked_by='n' (set null).
-- V5. RLS enabled (NOT forced — DEFINER RPCs owned by the table owner must
--     operate), NO policies, no anon/authenticated grants:
--   select relrowsecurity, relforcerowsecurity from pg_class
--   where oid='public.master_claim_invitations'::regclass;   -- true, false
--   select count(*) from pg_policies where schemaname='public'
--     and tablename='master_claim_invitations';               -- 0
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema='public' and table_name='master_claim_invitations'
--     and grantee in ('anon','authenticated');                -- 0 rows
--   -- direct anon/authenticated select/insert/update/delete -> permission denied.
-- ROLLBACK LIMITATION: dropping the table after real invitations exist DESTROYS
-- claim history — prefer feature-disable. See the rollback file.
-- ============================================================================
