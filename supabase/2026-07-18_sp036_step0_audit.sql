-- ============================================================================
-- SP-036 STEP 0 — READ-ONLY PRODUCTION AUDIT
-- ============================================================================
-- Run in the Supabase SQL Editor. Contains ONLY SELECT statements — no DDL,
-- no DML, no side effects. Run each section and SAVE THE FULL OUTPUT: it is
-- both the drift report input and the ROLLBACK BASELINE (the recorded
-- pg_policies output is the authoritative "state before SP-036" to restore
-- to if the migration must be reverted).
--
-- Context: the repository SQL is known to have drifted from the live schema
-- (docs/SP036_ARCHITECTURE.md §7). This probe closes the gaps that the
-- PostgREST-level audit (2026-07-18, anon key) could not reach.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Server + extensions
-- ---------------------------------------------------------------------------
select version();
select extname, extversion from pg_extension order by extname;

-- ---------------------------------------------------------------------------
-- 1. RLS policies — the core drift question.
--    Expected findings to confirm/refute:
--    * saunas: a permissive INSERT policy (client-side inserts of
--      status='active' demonstrably work for regular users — repo says
--      admin-only, so something broader is live)
--    * sauna_photos: same suspicion (client-side inserts work)
--    * sauna_events: possibly a leftover permissive INSERT from the
--      pre-SP-034 client-side AddEventModal era
--    * pts_import_log: anon SELECT works via PostgREST (confirmed leak)
--    * sauna_managers: anon SELECT of approved rows incl. user_id works
--      via PostgREST (confirmed — policy wording needed)
-- ---------------------------------------------------------------------------
select schemaname, tablename, policyname, permissive, roles, cmd,
       qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in (
        'saunas','sauna_events','sauna_photos','sauna_managers',
        'sauna_masters','master_affiliations','master_moderation_notes',
        'sauna_submissions','pts_import_log','profiles',
        'event_registrations','event_reviews','event_comments',
        'user_event_interests','user_favorites',
        'master_certificates','certificate_types',
        'sauna_event_masters','master_credentials','event_photos'))
   or schemaname = 'storage'
order by schemaname, tablename, cmd, policyname;

-- Which tables actually have RLS enabled?
select relname, relrowsecurity, relforcerowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and relkind = 'r'
order by relname;

-- ---------------------------------------------------------------------------
-- 2. Exact column definitions for tables absent from the repo SQL
--    (sauna_managers, event_registrations, event_reviews, event_comments)
--    plus the tables SP-036 will alter.
-- ---------------------------------------------------------------------------
select table_name, ordinal_position, column_name, data_type,
       is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('saunas','sauna_events','sauna_photos','sauna_managers',
                     'event_registrations','event_reviews','event_comments',
                     'sauna_submissions','profiles','pts_import_log')
order by table_name, ordinal_position;

-- ---------------------------------------------------------------------------
-- 3. CHECK constraints (especially any status CHECKs SP-036 must respect:
--    saunas.status must accept 'pending'/'rejected';
--    sauna_events.status must accept 'pending')
-- ---------------------------------------------------------------------------
select rel.relname as table_name, con.conname,
       pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public' and con.contype = 'c'
order by rel.relname, con.conname;

-- ---------------------------------------------------------------------------
-- 4. Triggers (expected: on_auth_user_created, sauna_masters_guard,
--    sauna_masters_insert_guard, master_affiliations_guard — anything else
--    is undocumented drift)
-- ---------------------------------------------------------------------------
select event_object_table as table_name, trigger_name, action_timing,
       string_agg(event_manipulation, ',') as events,
       action_statement
from information_schema.triggers
where trigger_schema in ('public','auth')
group by 1,2,3,5
order by 1,2;

-- ---------------------------------------------------------------------------
-- 5. Functions in public — name, security mode, config (search_path)
-- ---------------------------------------------------------------------------
select p.proname,
       case when p.prosecdef then 'SECURITY DEFINER' else 'invoker' end as security,
       p.proconfig,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;

-- ---------------------------------------------------------------------------
-- 6. Legacy sauna_submissions — data + dependency census (SP-036 decision:
--    deprecate gradually; this decides "complete in place vs migrate")
-- ---------------------------------------------------------------------------
select status, count(*) from public.sauna_submissions group by status;
select id, user_id, name, city, category, created_at
from public.sauna_submissions
where status = 'pending'
order by created_at
limit 50;
-- FK dependencies pointing AT sauna_submissions (expected: none)
select conrelid::regclass as referencing_table, conname
from pg_constraint
where confrelid = 'public.sauna_submissions'::regclass;

-- ---------------------------------------------------------------------------
-- 7. Data impact baseline for the SP-036 policy tightening
-- ---------------------------------------------------------------------------
select status, count(*) from public.saunas group by status;
select status, count(*),
       count(*) filter (where event_date < current_date) as past
from public.sauna_events group by status;
select count(*) as photos_total from public.sauna_photos;
select status, count(*) from public.sauna_managers group by status;
-- rows a stricter saunas SELECT would hide from the public
select count(*) as non_active_saunas from public.saunas where status <> 'active';

-- ---------------------------------------------------------------------------
-- 8. Storage buckets + their policies (bucket list; policies came out of §1)
-- ---------------------------------------------------------------------------
select id, name, public from storage.buckets order by name;

-- ---------------------------------------------------------------------------
-- 9. Indexes on tables SP-036 touches (baseline)
-- ---------------------------------------------------------------------------
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('saunas','sauna_events','sauna_photos','sauna_managers')
order by tablename, indexname;
