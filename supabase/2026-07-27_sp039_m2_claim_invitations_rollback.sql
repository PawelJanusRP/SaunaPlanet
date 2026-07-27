-- ============================================================================
-- SP-039 Slice 3B1 — M2 ROLLBACK.
--
-- DESTRUCTIVE: dropping master_claim_invitations removes ALL invitation rows,
-- including terminal (expired/revoked/claimed) claim evidence. Safe ONLY before
-- any real invitation has been generated (schema-only rollback).
--
-- AFTER real invitations exist, DO NOT run this — use the FEATURE-DISABLE
-- strategy instead: revoke EXECUTE on the M4 admin RPCs (and/or hide the future
-- admin UI). The additive schema is inert without its callers and preserves the
-- audit/history required for security investigations.
--
-- master_claim_events (M3) references this table via invitation_id ON DELETE SET
-- NULL, so those event rows survive with a nulled link — they are NOT deleted.
-- If M3 is present, its own rollback ordering applies (drop M3 first only if you
-- also intend to discard the audit; otherwise leave M3 in place).
--
-- Companion forward: 2026-07-27_sp039_m2_claim_invitations.sql
-- ============================================================================
begin;

drop table if exists public.master_claim_invitations;

commit;

notify pgrst, 'reload schema';

-- POST-ROLLBACK VERIFICATION:
--   select to_regclass('public.master_claim_invitations');  -- expect NULL
--   -- master_claim_events rows keep their data; invitation_id links become NULL.
