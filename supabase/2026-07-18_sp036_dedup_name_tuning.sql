-- ============================================================================
-- SP-036 — find_similar_saunas: name-match tuning (rev 2)
-- ============================================================================
-- STATUS: PREPARED, awaiting approval; apply manually in the SQL Editor.
--
-- Rev 2 (2026-07-18): second false positive after rev 1 — "Sauna Testowa"
-- warned about "Obiekt testowy" (similarity of the stripped names is
-- 0.3529, again a hair over 0.35; the shared root is "testow-"). Both
-- observed false positives landed at ~0.353, i.e. the threshold was set
-- razor-thin. Name-arm threshold raised 0.35 → 0.45. Regression checks:
-- "Termy Maltanskie" vs "Termy Maltańskie Poznań" = 0.708 (still warns);
-- short real duplicates of the "X" vs "X <city>" shape score ~0.46+
-- (still warn).
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
                  and extensions.similarity(
                    coalesce(
                      nullif(trim(regexp_replace(lower(s.name),
                        '\m(sauna|sauny|spa|wellness)\M', ' ', 'g')), ''),
                      lower(s.name)),
                    coalesce(p.q_name_res, lower(p.q_name))) > 0.45
                  -- same-area gate: applies only when both sides have coords
                  and (p_lat is null or p_lng is null
                       or s.latitude is null or s.longitude is null
                       or public.st_dwithin(
                         public.st_makepoint(s.longitude, s.latitude)::public.geography,
                         public.st_makepoint(p_lng, p_lat)::public.geography,
                         25000))
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
-- 3. End-to-end: repeat the map-form scenario ("Sauna Testowa", Poznań) —
--    neither Sauna&Spa (Pawłowice) nor Obiekt testowy may warn; a
--    submission named "Obiekt testowy 2" nearby SHOULD still warn.
--
-- ROLLBACK: re-run section 5 of 2026-07-18_sp036_master_facilities.sql
-- (the previous function body).
-- ============================================================================
