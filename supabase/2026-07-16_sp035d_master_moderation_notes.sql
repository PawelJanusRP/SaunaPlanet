-- SP-035D: persist master rejection notes (moderation-only).
--
-- Run in the Supabase SQL Editor. Purely additive — no existing table,
-- policy or trigger is modified.
--
-- Why a separate table instead of a column on sauna_masters:
-- * RLS is row-level; a note column would be readable by whoever can read
--   the master row, and the live SELECT policies on sauna_masters are not
--   version-controlled (REPOSITORY_AUDIT §5 caveat). A dedicated table
--   keeps the note verifiably moderation-only.
-- * sauna_submissions.admin_note (visible to the submitter) is a different
--   product decision; whether the rejected master should see the reason is
--   still an open product question — until decided, the note stays with
--   moderation (SP-035D review, CODE_QUALITY_REVIEW.md A2).
--
-- Depends on public.is_platform_moderator() from
-- 2026-07-11_sp035_master_studio.sql — run that script first.

create table if not exists public.master_moderation_notes (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null references public.sauna_masters(id) on delete cascade,
  note text not null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists master_moderation_notes_master_idx
  on public.master_moderation_notes (master_id);

alter table public.master_moderation_notes enable row level security;

-- Moderation-only, append-only: no UPDATE/DELETE policies on purpose —
-- notes are an audit trail (rows disappear only via the FK cascade when a
-- master profile is deleted).
drop policy if exists master_moderation_notes_select on public.master_moderation_notes;
create policy master_moderation_notes_select on public.master_moderation_notes
  for select
  using (public.is_platform_moderator());

drop policy if exists master_moderation_notes_insert on public.master_moderation_notes;
create policy master_moderation_notes_insert on public.master_moderation_notes
  for insert
  with check (public.is_platform_moderator());

notify pgrst, 'reload schema';
