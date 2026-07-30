-- ============================================================================
-- SP-039 Slice 3B1 — M4 ROLLBACK: drop the admin RPCs.
--
-- Non-destructive to data (functions only). This is ALSO the FEATURE-DISABLE
-- lever: dropping these functions (or, more conservatively, `revoke execute ...
-- from authenticated`) stops all invitation generation/management while leaving
-- the invitation + audit tables and their data intact for investigation.
--
-- Companion forward: 2026-07-27_sp039_m4_admin_rpcs.sql
-- ============================================================================
begin;

drop function if exists public.admin_create_master_claim_invitation(uuid, integer, text);
drop function if exists public.admin_mark_master_claim_sent(uuid, text, text);
drop function if exists public.admin_revoke_master_claim_invitation(uuid, text);
drop function if exists public.admin_regenerate_master_claim_invitation(uuid, text, integer);
drop function if exists public.admin_list_master_claim_invitations();
drop function if exists public.admin_get_master_claim_invitation(uuid);

commit;

notify pgrst, 'reload schema';

-- FEATURE-DISABLE ALTERNATIVE (keep the functions + data, stop callers):
--   revoke execute on function public.admin_create_master_claim_invitation(uuid, integer, text) from authenticated;
--   revoke execute on function public.admin_regenerate_master_claim_invitation(uuid, text, integer) from authenticated;
--   -- (leaving list/get available for read-only investigation).
--
-- POST-ROLLBACK VERIFICATION:
--   select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and proname like 'admin_%master_claim%';  -- 0 rows
