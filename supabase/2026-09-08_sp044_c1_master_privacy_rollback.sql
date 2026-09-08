-- ============================================================================
-- ROLLBACK — SP-044 Slice C (pseudonym + privacy).
--
-- REFUSES once any profile has privacy enabled: those rows carry name=nickname
-- and the real name only in master_private_identity, so dropping the table +
-- columns would either lose the real name or re-expose it. Disable privacy for
-- all masters (set_master_identity with show_nickname_only=false) BEFORE
-- rolling back, or keep this slice.
-- ============================================================================
begin;

do $$
begin
  if exists (select 1 from public.sauna_masters where show_nickname_only) then
    raise exception
      'SP044-C ROLLBACK REFUSED: profiles have privacy enabled — disable privacy first or public names revert to real names; see header.';
  end if;
end $$;

drop function if exists public.set_master_identity(uuid, text, text, boolean);

-- Restore the M10 demotion body (no suppression hook).
create or replace function public.handle_master_material_edit_demotion()
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

drop table if exists public.master_private_identity;

alter table public.sauna_masters drop constraint if exists sauna_masters_privacy_name_invariant;
alter table public.sauna_masters drop constraint if exists sauna_masters_nickname_len;
alter table public.sauna_masters drop column if exists show_nickname_only;
alter table public.sauna_masters drop column if exists nickname;

commit;

notify pgrst, 'reload schema';
