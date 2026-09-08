-- ============================================================================
-- SP-044 Slice C — pseudonym + privacy mode for sauna-master profiles.
--
-- Privacy is a BOUNDARY, not a presentation preference. Column-level privacy
-- cannot be expressed with row-level RLS, so the real name is moved into a
-- SEPARATE owner/admin-only table and public.sauna_masters.name is redefined as
-- the EFFECTIVE PUBLIC DISPLAY NAME. Because every public surface (directory,
-- detail, map satellites via get_saunas_nearby, event lineups via
-- sauna_event_masters -> sauna_masters(name)) already reads sauna_masters.name,
-- keeping that column = effective display name means the real name never leaks
-- through any anonymous PostgREST read, SSR payload, alt/title, or RPC JSON —
-- with no per-surface filtering.
--
-- Hard invariant (declarative CHECK, cannot be bypassed even by a direct
-- PostgREST write): when show_nickname_only, name MUST equal a non-empty
-- nickname. A client that flips the flag directly must also set name=nickname,
-- so the public row can never carry the real name under privacy mode.
--
-- Pieces (one transaction):
--   1. sauna_masters + nickname, show_nickname_only + the invariant CHECK.
--   2. master_private_identity (1:1, real name) — RLS: owner + moderator SELECT,
--      deny-all client writes (the DEFINER RPC is the only writer).
--   3. Backfill: one private-identity row per existing master (full_name=name);
--      no name changes (all rows keep show_nickname_only=false).
--   4. handle_master_material_edit_demotion (M10) + a suppression hook so the
--      trusted identity RPC does not trigger content re-moderation (Part D).
--   5. set_master_identity(master, full_name, nickname, show_nickname_only) —
--      the single sanctioned writer of identity/privacy: owner or moderator,
--      validates, stores the real name privately, derives the public name, and
--      drops a real-name-derived slug when privacy is enabled (UUID route).
--
-- Companion rollback: 2026-09-08_sp044_c1_master_privacy_rollback.sql
-- (refuses once any profile has privacy enabled — public names would revert to
-- real names; see the rollback header).
-- ============================================================================
begin;

-- Fail loud unless the live objects are EXACTLY the expected predecessors.
do $$
declare v_dem text;
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='sauna_masters'
               and column_name in ('nickname','show_nickname_only')) then
    raise exception 'SP044-C GUARD: nickname/show_nickname_only already exist; stop and review';
  end if;
  if to_regclass('public.master_private_identity') is not null then
    raise exception 'SP044-C GUARD: master_private_identity already exists; stop and review';
  end if;
  if to_regprocedure('public.set_master_identity(uuid,text,text,boolean)') is not null then
    raise exception 'SP044-C GUARD: set_master_identity already exists; stop and review';
  end if;
  select prosrc into v_dem from pg_proc
   where pronamespace='public'::regnamespace and proname='handle_master_material_edit_demotion';
  if v_dem is null or position('publication_demoted' in v_dem) = 0 then
    raise exception 'SP044-C GUARD: demotion trigger is not the M10 body; stop and review';
  end if;
  if position('sp044.suppress_demotion' in v_dem) > 0 then
    raise exception 'SP044-C GUARD: demotion suppression already present; stop and review';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. New identity columns + the hard public-name invariant.
-- ---------------------------------------------------------------------------
alter table public.sauna_masters add column nickname text;
alter table public.sauna_masters add column show_nickname_only boolean not null default false;

alter table public.sauna_masters
  add constraint sauna_masters_nickname_len
  check (nickname is null or char_length(btrim(nickname)) between 1 and 60);

-- The boundary: under privacy mode the PUBLIC name must be the (non-empty)
-- nickname — never the real name. Existing rows (show_nickname_only=false) pass.
alter table public.sauna_masters
  add constraint sauna_masters_privacy_name_invariant
  check (
    not show_nickname_only
    or (nickname is not null and btrim(nickname) <> '' and name = nickname)
  );

-- ---------------------------------------------------------------------------
-- 2. Private identity (real name). Owner + moderator read; deny-all writes.
-- ---------------------------------------------------------------------------
create table public.master_private_identity (
  master_id  uuid primary key references public.sauna_masters(id) on delete cascade,
  full_name  text not null check (btrim(full_name) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.master_private_identity enable row level security;
revoke all on public.master_private_identity from anon, authenticated;
grant select on public.master_private_identity to authenticated;

create policy master_private_identity_select_own_or_mod
  on public.master_private_identity
  for select
  using (
    public.is_platform_moderator()
    or exists (
      select 1 from public.sauna_masters m
      where m.id = master_id and m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Backfill: canonical real name per existing master (no public name change).
-- ---------------------------------------------------------------------------
insert into public.master_private_identity (master_id, full_name)
select id, name from public.sauna_masters
on conflict (master_id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Demotion trigger + identity-change suppression (Part D).
-- ---------------------------------------------------------------------------
create or replace function public.handle_master_material_edit_demotion()
returns trigger as $$
begin
  -- SP-044: identity/privacy changes flow through set_master_identity, which
  -- sets this transaction-local GUC. Changing display name / pseudonym /
  -- privacy is NOT a professional-content edit, and enabling privacy must take
  -- effect immediately (never keep the real name public awaiting moderation).
  if coalesce(current_setting('sp044.suppress_demotion', true), '') = 'on' then
    return null;
  end if;

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

-- ---------------------------------------------------------------------------
-- 5. set_master_identity — the sole sanctioned identity/privacy writer.
-- ---------------------------------------------------------------------------
create function public.set_master_identity(
  p_master_id uuid,
  p_full_name text,
  p_nickname text,
  p_show_nickname_only boolean
) returns jsonb as $$
declare
  v_uid       uuid := auth.uid();
  v_master    public.sauna_masters%rowtype;
  v_full      text;
  v_nick      text;
  v_effective text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated');
  end if;
  if p_master_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_master_id::text, 0));
  select * into v_master from public.sauna_masters where id = p_master_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  -- Owner OR platform moderator (admin/moderator) — no one else.
  if not (v_master.user_id = v_uid or public.is_platform_moderator()) then
    return jsonb_build_object('ok', false, 'code', 'not_authorized');
  end if;

  v_full := btrim(coalesce(p_full_name, ''));
  v_nick := nullif(btrim(coalesce(p_nickname, '')), '');

  if v_full = '' then
    return jsonb_build_object('ok', false, 'code', 'name_required');
  end if;
  if char_length(v_full) > 120 then
    return jsonb_build_object('ok', false, 'code', 'name_too_long');
  end if;
  if v_nick is not null and char_length(v_nick) > 60 then
    return jsonb_build_object('ok', false, 'code', 'nickname_too_long');
  end if;
  -- Privacy mode cannot be enabled without a non-empty pseudonym.
  if coalesce(p_show_nickname_only, false) and v_nick is null then
    return jsonb_build_object('ok', false, 'code', 'nickname_required');
  end if;

  v_effective := case when coalesce(p_show_nickname_only, false) then v_nick else v_full end;

  -- Canonical real name -> private table (RLS: owner + moderator only).
  insert into public.master_private_identity (master_id, full_name)
  values (p_master_id, v_full)
  on conflict (master_id) do update set full_name = excluded.full_name, updated_at = now();

  -- Do NOT re-moderate on an identity/privacy change (Part D).
  perform set_config('sp044.suppress_demotion', 'on', true);

  update public.sauna_masters
     set name = v_effective,
         nickname = v_nick,
         show_nickname_only = coalesce(p_show_nickname_only, false),
         -- Privacy-safe slug: a real-name-derived slug would leak identity via
         -- the URL. When privacy is ON, drop the slug (the public route falls
         -- back to the UUID) until the owner supplies a pseudonym-safe one.
         slug = case when coalesce(p_show_nickname_only, false) then null else slug end
   where id = p_master_id;

  return jsonb_build_object('ok', true, 'code', 'saved', 'data', jsonb_build_object(
    'name', v_effective,
    'show_nickname_only', coalesce(p_show_nickname_only, false)));
exception when others then
  return jsonb_build_object('ok', false, 'code', 'unexpected_error');
end $$ language plpgsql security definer set search_path = '';

revoke all on function public.set_master_identity(uuid, text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.set_master_identity(uuid, text, text, boolean)
  to authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- POST-APPLY VERIFICATION
-- V1. sauna_masters has nickname + show_nickname_only + both CHECK constraints;
--     existing rows all pass (show_nickname_only=false).
-- V2. master_private_identity: RLS enabled, SELECT-only grant, own-or-moderator
--     policy, one backfilled row per master; anon SELECT -> permission denied.
-- V3. set_master_identity DEFINER, search_path="", authenticated EXECUTE only.
-- V4. Enable privacy (owner): name becomes nickname, real name in the private
--     table, slug NULL, publication NOT demoted; anon read of sauna_masters
--     shows nickname; anon read of master_private_identity denied.
-- V5. Privacy ON + real-name edit: public name (nickname) unchanged, no
--     demotion; private full_name updated.
-- V6. Enabling privacy with empty nickname -> nickname_required (no change).
-- V7. Direct PostgREST attempt to set show_nickname_only=true with name<>nick
--     -> CHECK violation (invariant holds without the RPC).
-- ============================================================================
