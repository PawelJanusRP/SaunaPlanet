-- ============================================================================
-- SP-036 — find_similar_saunas: name-match tuning (rev 3)
-- ============================================================================
-- STATUS: PREPARED, awaiting approval; apply manually in the SQL Editor.
-- Supersedes rev 1/rev 2 — apply this version once.
--
-- Rev 3 (2026-07-18): reported miss+false-positive pair — submitting
-- "Termy" NEXT TO Termy Maltańskie matched distant "Tarnowskie Termy"
-- (0.375, over the rev-1 0.35 threshold) while MISSING the intended
-- "Termy Maltańskie Poznań" (0.25 — plain trigram similarity punishes the
-- length difference when the query is one word of a longer name). Plain
-- thresholds can never fix the miss, so the name arm gains a second path:
-- pg_trgm word_similarity (similarity to the best-matching word of the
-- other name) > 0.8 in either direction, gated to <= 5 km — a shared full
-- word plus close proximity is strong evidence, a shared word across town
-- is none. Distance, not the word score, is the discriminator
-- (word_similarity('termy', 'tarnowskie termy') is also 1.0).
--
-- Rev 2 (2026-07-18): "Sauna Testowa" vs "Obiekt testowy" — stripped-name
-- similarity 0.3529, a hair over 0.35; threshold raised to 0.45.
-- Rev 1 (2026-07-18): domain stopword strip + 25 km gate (Pawłowice case).
--
-- Matrix after rev 3 (name arm):
--   "Termy" vs "Termy Maltańskie Poznań", nearby      → word 1.0, <=5 km ✓ warns
--   "Termy" vs "Tarnowskie Termy", ~15 km             → distance ✗       no warn
--   "Termy Maltanskie" vs "Termy Maltańskie Poznań"   → strict 0.708     ✓ warns
--   "Sauna Testowa" vs "Obiekt testowy"               → 0.353 / word 0.6 no warn
--   "Sauna testowa" vs "Sauna&Spa" (far)              → stopwords+dist   no warn
--
-- Bug (reported 2026-07-18): submitting "Sauna testowa" in Poznań warned
-- about "Sauna&Spa" in Pawłowice (hundreds of km away). Root cause:
-- trigram similarity of the two names is ~0.353 — just over the 0.35
-- threshold — and virtually all of it comes from the shared domain
-- stopword "sauna"; the name arm also ignored distance entirely.
--
-- Fix (name arm ONLY — location/website/phone/source_url arms unchanged):
--   1. Domain stopwords (sauna/sauny/spa/wellness) are stripped from both
--      names before the trigram comparison; if stripping empties a name,
--      the full original name is used as fallback.
--   2. When BOTH sides have coordinates, a name match additionally
--      requires <= 25 km proximity (same metro area). Without coordinates
--      the name match stays global (acceptable for a warn-only signal).
--
-- Regression check: "Termy Maltanskie" vs "Termy Maltańskie Poznań" —
-- stopwords untouched ("termy" is meaningful), similarity 0.708, ~5 km
-- apart → still warns.
--
-- Same signature as before → plain CREATE OR REPLACE; existing GRANT
-- (authenticated) and REVOKE (anon) are preserved by REPLACE.
-- ============================================================================

create or replace function public.find_similar_saunas(
  p_name text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_website text default null,
  p_phone text default null,
  p_facebook_url text default null
)
returns table (
  id uuid, name text, city text, status text,
  distance_m double precision, match_reasons text[]
)
language sql stable security definer
set search_path = ''
as $$
  with params as (
    select
      nullif(trim(p_name), '') as q_name,
      -- name with domain stopwords stripped; NULL when nothing remains
      nullif(trim(regexp_replace(
        lower(coalesce(p_name, '')),
        '\m(sauna|sauny|spa|wellness)\M', ' ', 'g')), '') as q_name_res,
      nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '') as q_phone,
      nullif(lower(regexp_replace(regexp_replace(coalesce(p_website, ''),
        '^https?://(www\.)?', ''), '/+$', '')), '') as q_site,
      nullif(lower(regexp_replace(regexp_replace(coalesce(p_facebook_url, ''),
        '^https?://(www\.)?', ''), '/+$', '')), '') as q_fb
  ),
  scored as (
    select s.id, s.name, s.city, s.status,
      case when p_lat is not null and p_lng is not null
                and s.latitude is not null and s.longitude is not null
        then public.st_distance(
          public.st_makepoint(s.longitude, s.latitude)::public.geography,
          public.st_makepoint(p_lng, p_lat)::public.geography)
      end as distance_m,
      array_remove(array[
        case when p.q_name is not null
                  and (
                    -- path A: strict trigram similarity of stripped names
                    -- ("X" vs "X <city>" variants, typos) within 25 km
                    (extensions.similarity(
                       coalesce(
                         nullif(trim(regexp_replace(lower(s.name),
                           '\m(sauna|sauny|spa|wellness)\M', ' ', 'g')), ''),
                         lower(s.name)),
                       coalesce(p.q_name_res, lower(p.q_name))) > 0.45
                     and (p_lat is null or p_lng is null
                          or s.latitude is null or s.longitude is null
                          or public.st_dwithin(
                            public.st_makepoint(s.longitude, s.latitude)::public.geography,
                            public.st_makepoint(p_lng, p_lat)::public.geography,
                            25000)))
                    or
                    -- path B: shared full word + tight proximity (a short
                    -- generic query naming an existing facility nearby);
                    -- requires coordinates on BOTH sides by design
                    (p_lat is not null and p_lng is not null
                     and s.latitude is not null and s.longitude is not null
                     and greatest(
                           extensions.word_similarity(
                             coalesce(p.q_name_res, lower(p.q_name)), lower(s.name)),
                           extensions.word_similarity(
                             lower(s.name), coalesce(p.q_name_res, lower(p.q_name)))
                         ) > 0.8
                     and public.st_dwithin(
                       public.st_makepoint(s.longitude, s.latitude)::public.geography,
                       public.st_makepoint(p_lng, p_lat)::public.geography,
                       5000))
                  )
             then 'name' end,
        case when p_lat is not null and p_lng is not null
                  and s.latitude is not null and s.longitude is not null
                  and public.st_dwithin(
                    public.st_makepoint(s.longitude, s.latitude)::public.geography,
                    public.st_makepoint(p_lng, p_lat)::public.geography, 500)
             then 'location' end,
        case when p.q_site is not null and s.website is not null
                  and lower(regexp_replace(regexp_replace(s.website,
                    '^https?://(www\.)?', ''), '/+$', '')) = p.q_site
             then 'website' end,
        case when (p.q_fb is not null or p.q_site is not null)
                  and s.source_url is not null
                  and lower(regexp_replace(regexp_replace(s.source_url,
                    '^https?://(www\.)?', ''), '/+$', ''))
                    in (p.q_fb, p.q_site)
             then 'source_url' end,
        case when p.q_phone is not null and s.phone is not null
                  and regexp_replace(s.phone, '\D', '', 'g') = p.q_phone
             then 'phone' end
      ], null) as match_reasons
    from public.saunas s
    cross join params p
    where auth.uid() is not null
      and s.status in ('active', 'pending')
  )
  select id, name, city, status, distance_m, match_reasons
  from scored
  where array_length(match_reasons, 1) > 0
  order by array_length(match_reasons, 1) desc, distance_m asc nulls last
  limit 10;
$$;

-- ============================================================================
-- VERIFICATION (SQL Editor; the auth.uid() gate hides rows for the postgres
-- role, so test the internals directly):
--
-- 1. Both reported false positives must stay below the 0.45 threshold:
--    select extensions.similarity('testowa', 'obiekt testowy');  -- ~0.353
--    select extensions.similarity(
--      trim(regexp_replace(lower('Sauna testowa'),
--        '\m(sauna|sauny|spa|wellness)\M', ' ', 'g')),
--      trim(regexp_replace(lower('Sauna&Spa'),
--        '\m(sauna|sauny|spa|wellness)\M', ' ', 'g')));
--    -- expect well below 0.45
--
-- 2. Real duplicate must still match:
--    select extensions.similarity(
--      trim(regexp_replace(lower('Termy Maltanskie'),
--        '\m(sauna|sauny|spa|wellness)\M', ' ', 'g')),
--      trim(regexp_replace(lower('Termy Maltańskie Poznań'),
--        '\m(sauna|sauny|spa|wellness)\M', ' ', 'g')));
--    -- expect ~0.7
--
-- 3. Word-path checks:
--    select extensions.word_similarity('termy', 'termy maltańskie poznań');
--    -- expect 1.0 (path B fires when within 5 km)
--    select extensions.word_similarity('testowa', 'obiekt testowy');
--    -- expect ~0.6 (below 0.8 — no match)
--
-- 4. End-to-end from the map form:
--    a) "Termy" pinned near Termy Maltańskie → warns about (and centers
--       on) Termy Maltańskie Poznań; Tarnowskie Termy absent.
--    b) "Sauna Testowa" in Poznań → no warning.
--    c) "Obiekt testowy 2" near Obiekt testowy → warns and centers on it.
--
-- ROLLBACK: re-run section 5 of 2026-07-18_sp036_master_facilities.sql
-- (the previous function body).
-- ============================================================================
