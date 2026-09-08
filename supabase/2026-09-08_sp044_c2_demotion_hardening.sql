-- ============================================================================
-- SP-044 Slice C2 — HARDEN material-edit demotion (security fix).
--
-- DEFECT (found during the Production cutover behavioral review): the C1
-- demotion suppression trusted a transaction-local custom GUC
-- (sp044.suppress_demotion). Custom placeholder GUCs are settable by ANY role,
-- so an authenticated owner could `set_config('sp044.suppress_demotion','on')`
-- and then edit a PROFESSIONAL-CONTENT field (bio, city, ...) while their
-- published profile stayed public — bypassing moderator re-approval. Confirmed
-- empirically (baseline bio edit demotes; GUC + bio edit did NOT).
--
-- FIX: never trust a client-settable flag. Drive demotion PURELY from the
-- actual field diff. Display-IDENTITY fields (name, slug) are not professional
-- content and never demote — this is exactly what set_master_identity changes,
-- so enabling privacy still takes effect immediately. A change to ANY
-- professional-content field (bio, city, avatar, cover, specialties, languages,
-- experience, social, website) still demotes to 'submitted'. There is no
-- session/request value a client can set to bypass this.
--
-- The vestigial set_config('sp044.suppress_demotion',...) call inside
-- set_master_identity becomes a harmless no-op (the trigger ignores it); left
-- in place to keep this fix minimal (no RPC re-deploy).
--
-- Companion rollback: 2026-09-08_sp044_c2_demotion_hardening_rollback.sql
-- ============================================================================
begin;

do $$
declare v text;
begin
  select prosrc into v from pg_proc
   where pronamespace='public'::regnamespace and proname='handle_master_material_edit_demotion';
  if v is null or position('publication_demoted' in v) = 0 then
    raise exception 'SP044-C2 GUARD: demotion function not found / not expected body; stop and review';
  end if;
  if position('sp044.suppress_demotion' in v) = 0 then
    raise exception 'SP044-C2 GUARD: C1 GUC-based demotion body not present — wrong predecessor; stop and review';
  end if;
end $$;

create or replace function public.handle_master_material_edit_demotion()
returns trigger as $$
begin
  -- Only the owner's own edits are in scope (moderator writes never demote).
  if auth.uid() is null
     or new.user_id is null
     or new.user_id <> auth.uid() then
    return null;
  end if;

  -- SP-044 hardened: demotion is decided ONLY by the real field diff — never by
  -- a client-settable flag. Display-identity fields (name, slug) do NOT demote;
  -- a change to ANY professional-content field below DOES. set_master_identity
  -- only ever changes name/slug among these, so privacy/pseudonym changes take
  -- effect immediately with no re-moderation, and no client GUC can bypass a
  -- genuine content edit.
  if new.city is not distinct from old.city
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

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- POST-APPLY VERIFICATION
-- V1. demotion function no longer references sp044.suppress_demotion.
-- V2. owner bio edit on a published profile -> demotes (submitted).
-- V3. owner bio edit + client-set GUC -> STILL demotes (no bypass).
-- V4. set_master_identity privacy enable on a published profile -> NOT demoted
--     (only name/slug changed).
-- ============================================================================
