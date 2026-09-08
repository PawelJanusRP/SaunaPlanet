-- ============================================================================
-- ROLLBACK — SP-044 C2. Restores the C1 GUC-based demotion body.
-- WARNING: the C1 body carries the KNOWN GUC-bypass defect (a client can set
-- sp044.suppress_demotion and skip content re-moderation). Only roll back if
-- C1 itself is being rolled back too. Prefer keeping C2.
-- ============================================================================
begin;

create or replace function public.handle_master_material_edit_demotion()
returns trigger as $$
begin
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
     set publication_status = 'submitted', submitted_at = now(),
         published_at = null, updated_at = now()
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
