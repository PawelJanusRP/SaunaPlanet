--This file contains history of the scripts sterted on the database. The newest are at the end.

create table public.saunas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null default 'public_sauna',
  latitude double precision not null,
  longitude double precision not null,
  city text,
  voivodeship text,
  website text,
  source text,
  source_url text,
  status text not null default 'active',
  created_at timestamp with time zone default now()
);

create table public.sauna_photos (
  id uuid primary key default gen_random_uuid(),
  sauna_id uuid references public.saunas(id) on delete cascade,
  image_url text not null,
  created_at timestamp with time zone default now()
);

create table public.sauna_events (
  id uuid primary key default gen_random_uuid(),
  sauna_id uuid references public.saunas(id) on delete cascade,
  title text not null,
  description text,
  event_date timestamp with time zone,
  source_url text,
  created_at timestamp with time zone default now()
);

alter table public.saunas enable row level security;
alter table public.sauna_photos enable row level security;
alter table public.sauna_events enable row level security;

create policy "Allow public read saunas"
on public.saunas
for select
using (true);

create policy "Allow anon insert saunas MVP"
on public.saunas
for insert
with check (true);

create policy "Allow public read sauna photos"
on public.sauna_photos
for select
using (true);

create policy "Allow anon insert sauna photos MVP"
on public.sauna_photos
for insert
with check (true);

create policy "Allow public read sauna events"
on public.sauna_events
for select
using (true);

create policy "Allow anon insert sauna events MVP"
on public.sauna_events
for insert
with check (true);
create or replace function public.get_saunas_nearby(
  user_lat double precision,
  user_lng double precision,
  radius_m integer default 10000
)
returns table (
  id uuid,
  name text,
  description text,
  category text,
  latitude double precision,
  longitude double precision,
  city text,
  voivodeship text,
  website text,
  source text,
  source_url text,
  status text,
  created_at timestamptz,
  distance_m double precision,
  image_urls text[]
)
language sql
stable
as $$
  select
    s.id,
    s.name,
    s.description,
    s.category,
    s.latitude,
    s.longitude,
    s.city,
    s.voivodeship,
    s.website,
    s.source,
    s.source_url,
    s.status,
    s.created_at,
    st_distance(
      st_makepoint(s.longitude, s.latitude)::geography,
      st_makepoint(user_lng, user_lat)::geography
    ) as distance_m,
    coalesce(
      array_agg(sp.image_url order by sp.created_at)
        filter (where sp.image_url is not null),
      '{}'
    ) as image_urls
  from public.saunas s
  left join public.sauna_photos sp
    on sp.sauna_id = s.id
  where s.status = 'active'
    and st_dwithin(
      st_makepoint(s.longitude, s.latitude)::geography,
      st_makepoint(user_lng, user_lat)::geography,
      radius_m
    )
  group by s.id
  order by distance_m asc;
$$;

create extension if not exists postgis;

select name, city, latitude, longitude
from public.saunas;

alter table saunas
add column if not exists pts_certified boolean default false;

alter table saunas
add column if not exists phone text;

alter table saunas
add column if not exists email text;

alter table saunas
add column if not exists address text;

-------------
alter table public.saunas
add column if not exists address text;

alter table public.saunas
add column if not exists pts_id integer;

alter table public.saunas
add column if not exists pts_type text;

alter table public.saunas
add column if not exists ceremonies text;

alter table public.saunas
add column if not exists attractions text;

alter table public.saunas
add column if not exists limitations text;

create unique index if not exists saunas_pts_id_key
on public.saunas(pts_id)
where pts_id is not null;



select count(*) from public.saunas;

create unique index if not exists saunas_pts_id_unique
on public.saunas (pts_id);

notify pgrst, 'reload schema';

alter table saunas
alter column latitude drop not null;

alter table saunas
alter column longitude drop not null;

create table if not exists public.pts_import_log (
  id bigint generated always as identity primary key,
  pts_id integer,
  status text not null,
  reason text,
  sauna_name text,
  source_url text,
  created_at timestamptz default now()
);

alter table public.pts_import_log enable row level security;

create policy "Allow anon insert pts import log MVP"
on public.pts_import_log
for insert
with check (true);

create policy "Allow public read pts import log MVP"
on public.pts_import_log
for select
using (true);

select count(*) from public.saunas;

drop policy if exists "Allow anon insert saunas MVP" on public.saunas;
drop policy if exists "Allow anon update saunas MVP" on public.saunas;

create policy "Allow anon insert saunas MVP"
on public.saunas
for insert
with check (true);

create policy "Allow anon update saunas MVP"
on public.saunas
for update
using (true)
with check (true);
notify pgrst, 'reload schema';

alter table public.saunas
add column if not exists cover_image_url text;

select column_name
from information_schema.columns
where table_name = 'saunas'
and column_name = 'cover_image_url';

truncate table public.pts_import_log;


select
  count(*) as all_saunas,
  count(website) as with_website,
  count(cover_image_url) as with_photo
from public.saunas;

drop function public.get_saunas_nearby;

create or replace function public.get_saunas_nearby(
  user_lat double precision,
  user_lng double precision,
  radius_m integer default 10000
)
returns table (
  id uuid,
  name text,
  description text,
  category text,
  latitude double precision,
  longitude double precision,
  city text,
  voivodeship text,
  website text,
  source text,
  source_url text,
  status text,
  created_at timestamptz,
  distance_m double precision,
  image_urls text[],
  cover_image_url text
)
language sql
stable
as $$
  select
    s.id,
    s.name,
    s.description,
    s.category,
    s.latitude,
    s.longitude,
    s.city,
    s.voivodeship,
    s.website,
    s.source,
    s.source_url,
    s.status,
    s.created_at,
    st_distance(
      st_makepoint(s.longitude, s.latitude)::geography,
      st_makepoint(user_lng, user_lat)::geography
    ) as distance_m,
    coalesce(
      array_agg(sp.image_url order by sp.created_at)
        filter (where sp.image_url is not null),
      '{}'
    ) as image_urls,
    s.cover_image_url
  from public.saunas s
  left join public.sauna_photos sp
    on sp.sauna_id = s.id
  where s.status = 'active'
    and st_dwithin(
      st_makepoint(s.longitude, s.latitude)::geography,
      st_makepoint(user_lng, user_lat)::geography,
      radius_m
    )
  group by s.id
  order by distance_m asc;
$$;

select
  name,
  cover_image_url
from saunas
where cover_image_url is not null
limit 5;

select *
from get_saunas_nearby(
  52.4064,
  16.9252,
  500000
)
limit 1;

alter table public.sauna_events
add column if not exists event_date date;

alter table public.sauna_events
add column if not exists event_time time;

alter table public.sauna_events
add column if not exists price text;

alter table public.sauna_events
add column if not exists source_url text;

alter table public.sauna_events
add column if not exists status text default 'active';





alter table public.sauna_events enable row level security;

drop policy if exists "Allow public read sauna events" on public.sauna_events;
drop policy if exists "Allow anon insert sauna events MVP" on public.sauna_events;

create policy "Allow public read sauna events"
on public.sauna_events
for select
using (true);

create policy "Allow anon insert sauna events MVP"
on public.sauna_events
for insert
with check (true);

select column_name, data_type
from information_schema.columns
where table_name = 'sauna_events'
order by ordinal_position;

create policy if not exists "Allow anon insert sauna photos MVP"
on public.sauna_photos
for insert
with check (true);

drop policy if exists "Allow anon insert sauna photos MVP" on public.sauna_photos;

create policy "Allow anon insert sauna photos MVP"
on public.sauna_photos
for insert
with check (true);

alter table public.sauna_photos enable row level security;

drop policy if exists "Allow public read sauna photos" on public.sauna_photos;
drop policy if exists "Allow anon insert sauna photos MVP" on public.sauna_photos;

create policy "Allow public read sauna photos"
on public.sauna_photos
for select
using (true);

create policy "Allow anon insert sauna photos MVP"
on public.sauna_photos
for insert
with check (true);

create policy "Allow anon upload sauna images MVP"
on storage.objects
for insert
with check (bucket_id = 'sauna-images');

create policy "Allow public read sauna images MVP"
on storage.objects
for select
using (bucket_id = 'sauna-images');

select *
from public.sauna_photos
order by created_at desc
limit 5;


create or replace function public.get_saunas_nearby(
  user_lat double precision,
  user_lng double precision,
  radius_m integer default 10000
)
returns table (
  id uuid,
  name text,
  description text,
  category text,
  latitude double precision,
  longitude double precision,
  city text,
  voivodeship text,
  website text,
  source text,
  source_url text,
  status text,
  created_at timestamptz,
  distance_m double precision,
  image_urls text[],
  cover_image_url text
)
language sql
stable
as $$
  select
    s.id,
    s.name,
    s.description,
    s.category,
    s.latitude,
    s.longitude,
    s.city,
    s.voivodeship,
    s.website,
    s.source,
    s.source_url,
    s.status,
    s.created_at,
    st_distance(
      st_makepoint(s.longitude, s.latitude)::geography,
      st_makepoint(user_lng, user_lat)::geography
    ) as distance_m,
    coalesce(
      array_agg(sp.image_url order by sp.created_at)
        filter (where sp.image_url is not null),
      '{}'
    ) as image_urls,
    s.cover_image_url
  from public.saunas s
  left join public.sauna_photos sp
    on sp.sauna_id = s.id
  where s.status = 'active'
    and st_dwithin(
      st_makepoint(s.longitude, s.latitude)::geography,
      st_makepoint(user_lng, user_lat)::geography,
      radius_m
    )
  group by s.id
  order by distance_m asc;
$$;

select sauna_id, image_url, created_at
from public.sauna_photos
order by created_at desc
limit 5;

select *
from public.get_saunas_nearby(52.4064, 16.9252, 1000000)
where id = 'b014b217-54c5-4924-b8f0-009837d0844f';

update sauna_photos
set image_url = replace(
  image_url,
  'saune-images',
  'sauna-images'
)
where image_url like '%saune-images%';

select image_url
from sauna_photos
order by created_at desc
limit 5;

select *
from sauna_events
order by created_at desc
limit 10;

create or replace function public.get_sauna_events(
  sauna_uuid uuid
)
returns table (
  id uuid,
  title text,
  description text,
  event_date timestamptz,
  event_time time,
  price text,
  status text
)
language sql
stable
as $$
  select
    e.id,
    e.title,
    e.description,
    e.event_date,
    e.event_time,
    e.price,
    e.status
  from public.sauna_events e
  where e.sauna_id = sauna_uuid
    and e.status = 'active'
  order by e.event_date asc;
$$;

select *
from get_sauna_events(
  '24041fff-96ea-4fa5-8fb6-57d60cc7473e'
);

select
  e.id,
  e.sauna_id,
  s.name as sauna_name,
  e.title,
  e.event_date,
  e.event_time
from sauna_events e
left join saunas s on s.id = e.sauna_id
order by e.created_at desc
limit 10;

create or replace function public.get_upcoming_event_saunas()
returns table (
  sauna_id uuid
)
language sql
stable
as $$
  select distinct sauna_id
  from sauna_events
  where status = 'active'
    and event_date >= current_date
    and event_date <= current_date + interval '7 days';
$$;

create table if not exists public.sauna_reviews (
  id uuid primary key default gen_random_uuid(),
  sauna_id uuid not null references public.saunas(id) on delete cascade,
  author_name text not null,
  rating integer not null check (rating between 1 and 5),
  review_text text,
  created_at timestamptz not null default now()
);

alter table public.sauna_reviews enable row level security;

create policy "Allow public read sauna reviews"
on public.sauna_reviews
for select
using (true);


create policy "Allow public insert sauna reviews MVP"
on public.sauna_reviews
for insert
with check (true);

insert into public.sauna_reviews (
  sauna_id,
  author_name,
  rating,
  review_text
)
select
  id,
  'Paweł',
  5,
  'Testowa opinia SaunaPlanet'
from public.saunas
limit 1;

select *
from public.sauna_reviews;

insert into public.sauna_reviews (
  sauna_id,
  author_name,
  rating,
  review_text
)
values (
  'b014b217-54c5-4924-b8f0-009837d0844f',
  'Paweł',
  5,
  'Testowa opinia SaunaPlanet'
);

select *
from public.sauna_reviews
order by created_at desc;

create or replace function public.get_top_saunas()
returns table (
  sauna_id uuid,
  sauna_name text,
  avg_rating numeric,
  review_count bigint
)
language sql
stable
as $$
  select
    s.id,
    s.name,
    round(avg(r.rating)::numeric, 1),
    count(r.id)
  from saunas s
  join sauna_reviews r
    on r.sauna_id = s.id
  group by s.id, s.name
  having count(r.id) >= 1
  order by avg(r.rating) desc, count(r.id) desc
  limit 10;
$$;

select * from get_top_saunas();

drop function public.get_saunas_nearby;

create or replace function public.get_saunas_nearby(
  user_lat double precision,
  user_lng double precision,
  radius_m integer default 10000
)
returns table (
  id uuid,
  name text,
  description text,
  category text,
  latitude double precision,
  longitude double precision,
  city text,
  voivodeship text,
  website text,
  source text,
  source_url text,
  status text,
  created_at timestamptz,
  distance_m double precision,
  image_urls text[],
  cover_image_url text,
  avg_rating numeric,
  review_count bigint
)
language sql
stable
as $$
  select
    s.id,
    s.name,
    s.description,
    s.category,
    s.latitude,
    s.longitude,
    s.city,
    s.voivodeship,
    s.website,
    s.source,
    s.source_url,
    s.status,
    s.created_at,
    st_distance(
      st_makepoint(s.longitude, s.latitude)::geography,
      st_makepoint(user_lng, user_lat)::geography
    ) as distance_m,
    coalesce(
      array_agg(distinct sp.image_url)
        filter (where sp.image_url is not null),
      '{}'
    ) as image_urls,
    s.cover_image_url,
    round(avg(r.rating)::numeric, 1) as avg_rating,
    count(distinct r.id) as review_count
  from public.saunas s
  left join public.sauna_photos sp
    on sp.sauna_id = s.id
  left join public.sauna_reviews r
    on r.sauna_id = s.id
  where s.status = 'active'
    and st_dwithin(
      st_makepoint(s.longitude, s.latitude)::geography,
      st_makepoint(user_lng, user_lat)::geography,
      radius_m
    )
  group by s.id
  order by distance_m asc;
$$;


create or replace function public.get_upcoming_events()
returns table (
  event_id uuid,
  title text,
  event_date timestamptz,
  event_time time,
  price text,
  sauna_id uuid,
  sauna_name text,
  city text
)
language sql
stable
as $$
  select
    e.id,
    e.title,
    e.event_date,
    e.event_time,
    e.price,
    s.id,
    s.name,
    s.city
  from sauna_events e
  join saunas s
    on s.id = e.sauna_id
  where e.status = 'active'
    and e.event_date >= current_date
  order by e.event_date asc;
$$;

select * from get_upcoming_events();

drop function if exists public.get_upcoming_events();

create or replace function public.get_upcoming_events()
returns table (
  event_id uuid,
  title text,
  event_date timestamptz,
  event_time time,
  price text,
  sauna_id uuid,
  sauna_name text,
  city text,
  latitude double precision,
  longitude double precision
)
language sql
stable
as $$
  select
    e.id,
    e.title,
    e.event_date,
    e.event_time,
    e.price,
    s.id,
    s.name,
    s.city,
    s.latitude,
    s.longitude
  from sauna_events e
  join saunas s
    on s.id = e.sauna_id
  where e.status = 'active'
    and e.event_date >= current_date
  order by e.event_date asc;
$$;


create table if not exists public.sauna_masters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  avatar_url text,
  bio text,
  home_sauna_id uuid references public.saunas(id),
  rating numeric default 0,
  review_count integer default 0,
  created_at timestamptz default now()
);


create table if not exists public.master_credentials (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null references public.sauna_masters(id) on delete cascade,

  credential_type text not null,
  title text not null,

  issuer text,

  valid_from date,
  valid_until date,

  status text default 'pending',

  evidence_url text,

  approved_at timestamptz,
  created_at timestamptz default now()
);


create table if not exists public.sauna_event_masters (
  id uuid primary key default gen_random_uuid(),

  event_id uuid not null references public.sauna_events(id) on delete cascade,
  master_id uuid not null references public.sauna_masters(id) on delete cascade,

  status text default 'pending',

  role text,

  created_at timestamptz default now(),
  approved_at timestamptz
);


insert into public.sauna_masters (
  name,
  bio
)
values (
  'Marcin Ciesielski',
  'Mistrzy Polski 2019'
);

select *
from public.sauna_masters;

alter table public.sauna_masters enable row level security;

drop policy if exists "Allow public read sauna masters" on public.sauna_masters;

create policy "Allow public read sauna masters"
on public.sauna_masters
for select
using (true);

insert into sauna_masters (
  name,
  bio,
  rating,
  review_count
)
values
(
  'Marcin Ciesielski',
  'Specjalista ceremonii piwnych',
  4.9,
  120
),
(
  'Anna Nowak',
  'Mistrzyni ceremonii ziołowych',
  4.8,
  85
),
(
  'Piotr Wiśniewski',
  'Saunamistrz pokazów tematycznych',
  4.7,
  60
);

select column_name, data_type
from information_schema.columns
where table_name = 'sauna_masters'
order by ordinal_position;

select * from sauna_masters;
delete from sauna_masters where id = 'ed8813fb-346c-4108-a7aa-8f74c9bd502a';
update sauna_masters set rating = 4.9 where id = 'ec9f02d1-8ab9-4007-8194-01f7d55ef978';
update sauna_masters set review_count = 123 where id = 'ec9f02d1-8ab9-4007-8194-01f7d55ef978';

insert into master_credentials (
  master_id,
  credential_type,
  title,
  issuer,
  status
)
select
  id,
  'master',
  'Mistrz Polski 2019',
  'SaunaPlanet',
  'approved'
from sauna_masters where id = 'ec9f02d1-8ab9-4007-8194-01f7d55ef978';

select * from master_credentials;
delete from master_credentials where id = 'd63a6a34-017a-4b9d-91aa-d7faf8112522';

alter table public.master_credentials enable row level security;

drop policy if exists "Allow public read master credentials" on public.master_credentials;

create policy "Allow public read master credentials"
on public.master_credentials
for select
using (true);

select * from sauna_events;

insert into sauna_event_masters (
  event_id,
  master_id,
  status,
  role
)
values (
  'f70cb352-051a-4719-94b5-3e842e80f376',
  'ec9f02d1-8ab9-4007-8194-01f7d55ef978',
  'approved',
  'lead'
);

select * from sauna_masters;

select
  sem.*,
  sm.name,
  se.title
from sauna_event_masters sem
join sauna_masters sm
  on sm.id = sem.master_id
join sauna_events se
  on se.id = sem.event_id;

  select * from sauna_events;

  alter table public.sauna_event_masters enable row level security;

drop policy if exists "Allow public read sauna event masters" on public.sauna_event_masters;

create policy "Allow public read sauna event masters"
on public.sauna_event_masters
for select
using (true);

drop policy if exists "Allow public read sauna events" on public.sauna_events;

create policy "Allow public read sauna events"
on public.sauna_events
for select
using (true);

select
  *
from sauna_events se
join saunas s on s.id = se.sauna_id;

alter table sauna_masters
add column if not exists level text default 'guest';

update sauna_masters
set level = 'master'
where name = 'Marcin Ciesielski';

select * from sauna_Masters;

update sauna_masters
set name = 'Julia Szadkowska'
where id = 'bdf6e5c5-1998-462f-8788-57a9457425ce';

update sauna_masters
set avatar_url = 'https://scontent.fpoz3-1.fna.fbcdn.net/v/t39.30808-6/505463045_3913828958763803_1627222206384490720_n.jpg?stp=dst-jpg_tt6&cstp=mx2048x2048&ctp=s2048x2048&_nc_cat=106&ccb=1-7&_nc_sid=6ee11a&_nc_ohc=lWGmn3gD_rIQ7kNvwFb2gtW&_nc_oc=AdqX8R1gpjol2wdcBESoXvB5R8VYgBn2gvwH5FBp65mGPlnFLdZ8Gq89H6VzTrzsZA4&_nc_zt=23&_nc_ht=scontent.fpoz3-1.fna&_nc_gid=_3vyfjftWpkhHRCReBuNFg&_nc_ss=7b2a8&oh=00_Af-zHnaKorQkiC1Eu-a25vC5t8IjnW2YZQT1RuM9amB13g&oe=6A35B9D0'
where id = 'bdf6e5c5-1998-462f-8788-57a9457425ce';

select
  s.name as sauna,
  sm.name as master,
  sm.avatar_url,
  sm.level
from sauna_event_masters sem
join sauna_events se on se.id = sem.event_id
join saunas s on s.id = se.sauna_id
join sauna_masters sm on sm.id = sem.master_id
where sem.status = 'approved';

select id, title, sauna_id
from sauna_events;

Event: 9f706782-030f-49df-b78d-8db5b4a71251
Termy: b014b217-54c5-4924-b8f0-009837d0844f

select id, name
from saunas
where name ilike '%Malta%';

update sauna_events
set sauna_id = 'b014b217-54c5-4924-b8f0-009837d0844f';

drop function if exists public.get_saunas_nearby(
  double precision,
  double precision,
  integer
);

create function public.get_saunas_nearby(
  user_lat double precision,
  user_lng double precision,
  radius_m integer default 10000
)
returns table (
  id uuid,
  name text,
  description text,
  category text,
  latitude double precision,
  longitude double precision,
  city text,
  voivodeship text,
  website text,
  source text,
  source_url text,
  status text,
  created_at timestamptz,
  distance_m double precision,
  image_urls text[],
  cover_image_url text,
  avg_rating numeric,
  review_count bigint,
  masters jsonb
)
language sql
stable
as $$
  select
    s.id,
    s.name,
    s.description,
    s.category,
    s.latitude,
    s.longitude,
    s.city,
    s.voivodeship,
    s.website,
    s.source,
    s.source_url,
    s.status,
    s.created_at,
    st_distance(
      st_makepoint(s.longitude, s.latitude)::geography,
      st_makepoint(user_lng, user_lat)::geography
    ) as distance_m,
    coalesce(
      array_agg(distinct sp.image_url)
        filter (where sp.image_url is not null),
      '{}'
    ) as image_urls,
    s.cover_image_url,
    round(avg(r.rating)::numeric, 1) as avg_rating,
    count(distinct r.id) as review_count,
    coalesce(
      (
        select jsonb_agg(
          distinct jsonb_build_object(
            'id', sm.id,
            'name', sm.name,
            'avatar_url', sm.avatar_url,
            'level', sm.level
          )
        )
        from public.sauna_events se
        join public.sauna_event_masters sem
          on sem.event_id = se.id
        join public.sauna_masters sm
          on sm.id = sem.master_id
        where se.sauna_id = s.id
          and sem.status = 'approved'
          and se.status = 'active'
          and se.event_date >= current_date
      ),
      '[]'::jsonb
    ) as masters
  from public.saunas s
  left join public.sauna_photos sp
    on sp.sauna_id = s.id
  left join public.sauna_reviews r
    on r.sauna_id = s.id
  where s.status = 'active'
    and st_dwithin(
      st_makepoint(s.longitude, s.latitude)::geography,
      st_makepoint(user_lng, user_lat)::geography,
      radius_m
    )
  group by s.id
  order by distance_m asc;
$$;


select name, masters
from get_saunas_nearby(52.4064, 16.9252, 1000000)
where jsonb_array_length(masters) > 0;

select * from sauna_masters;
update sauna_masters
set level = 'senior'
where name = 'Anna Nowak';

update sauna_masters
set level = 'certified'
where name = 'Piotr Wiśniewski';


insert into sauna_event_masters (
  event_id,
  master_id,
  status,
  role
)
values (
  '9f706782-030f-49df-b78d-8db5b4a71251',
  'bdf6e5c5-1998-462f-8788-57a9457425ce',
  'approved',
  'lead'
);

select * from sauna_events;
select * from sauna_masters;

alter table public.sauna_event_masters enable row level security;

drop policy if exists "Allow anon insert sauna event masters MVP" on public.sauna_event_masters;

create policy "Allow anon insert sauna event masters MVP"
on public.sauna_event_masters
for insert
with check (true);

alter table public.sauna_event_masters enable row level security;

drop policy if exists "Allow anon insert sauna event masters MVP" on public.sauna_event_masters;

create policy "Allow anon insert sauna event masters MVP"
on public.sauna_event_masters
for insert
with check (true);

select * from sauna_event_masters;

select
  s.name as sauna,
  se.title as event,
  sm.name as master,
  sm.avatar_url,
  sm.level,
  sem.status
from sauna_event_masters sem
join sauna_events se on se.id = sem.event_id
join saunas s on s.id = se.sauna_id
join sauna_masters sm on sm.id = sem.master_id
where s.name ilike '%Malta%';


select
  s.name as sauna,
  se.title as event,
  sm.id,
  sm.name as master,
  sm.level,
  sm.avatar_url,
  sem.status
from sauna_event_masters sem
join sauna_events se
  on se.id = sem.event_id
join saunas s
  on s.id = se.sauna_id
join sauna_masters sm
  on sm.id = sem.master_id
where s.name ilike '%Malta%'
order by sm.name;

select * from sauna_event_masters;
select * from sauna_masters;

select
  name,
  jsonb_array_length(masters) as masters_count,
  masters
from get_saunas_nearby(52.4064, 16.9252, 1000000)
where name ilike '%Malta%';

select
  se.title,
  se.event_date,
  se.status as event_status,
  sm.name as master,
  sem.status as assignment_status
from sauna_event_masters sem
join sauna_events se on se.id = sem.event_id
join sauna_masters sm on sm.id = sem.master_id
join saunas s on s.id = se.sauna_id
where s.name ilike '%Malta%'
order by se.event_date, sm.name;

select id, name, avatar_url, level
from sauna_masters
order by name;

update sauna_masters set avatar_url = 'https://www.facebook.com/photo/?fbid=9429405407114281&set=a.113134208741494' where id = 'ec9f02d1-8ab9-4007-8194-01f7d55ef978';

drop function get_sauna_events;
CREATE OR REPLACE FUNCTION get_sauna_events(sauna_uuid UUID)
RETURNS TABLE (
  id          UUID,
  title       TEXT,
  description TEXT,
  event_date  DATE,
  event_time  TIME,
  price       TEXT,
  status      TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    id,
    title,
    description,
    event_date,
    event_time,
    price,
    status
  FROM sauna_events
  WHERE sauna_id   = sauna_uuid
    AND status     = 'active'
    AND event_date >= CURRENT_DATE
  ORDER BY event_date ASC;
$$;

select
  sm.name,
  sm.avatar_url,
  sm.level,
  sem.status,
  se.title,
  se.event_date,
  s.name as sauna_name
from sauna_event_masters sem
join sauna_masters sm on sm.id = sem.master_id
join sauna_events se on se.id = sem.event_id
join saunas s on s.id = se.sauna_id
order by s.name, se.event_date, sm.name;


CREATE POLICY "anon can update avatar_url"
ON sauna_masters
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Storage: pozwól anonimowym uploadować do master-avatars
CREATE POLICY "anon can upload to master-avatars"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'master-avatars');

SELECT * 
FROM saunas
WHERE name ILIKE '%maltańskie%' OR name ILIKE '%malta%';

delete from saunas where id = 'dd125fd1-98a6-461c-a210-4e4742e011e0';

--b014b217-54c5-4924-b8f0-009837d0844f

SELECT
  id,
  name,
  masters
FROM get_saunas_nearby(52.4064, 16.9252, 20000)
WHERE name ILIKE '%maltańskie%' OR name ILIKE '%malta%';

SELECT
  sem.status        AS assignment_status,
  sem.role          AS event_role,
  se.event_date,
  se.status         AS event_status,
  sm.id             AS master_id,
  sm.name           AS master_name,
  sm.avatar_url,
  sm.level          AS master_level
FROM sauna_event_masters sem
JOIN sauna_events        se  ON se.id  = sem.event_id
JOIN sauna_masters       sm  ON sm.id  = sem.master_id
JOIN saunas              s   ON s.id   = se.sauna_id
WHERE s.name ILIKE '%maltańskie%' OR s.name ILIKE '%malta%'
ORDER BY se.event_date DESC;

SELECT
  sem.status        AS assignment_status,
  se.event_date,
  se.status         AS event_status,
  sm.name,
  sm.avatar_url,
  sm.level
FROM sauna_event_masters sem
JOIN sauna_events        se  ON se.id  = sem.event_id
JOIN sauna_masters       sm  ON sm.id  = sem.master_id
JOIN saunas              s   ON s.id   = se.sauna_id
WHERE (s.name ILIKE '%maltańskie%' OR s.name ILIKE '%malta%')
  AND sem.status = 'approved'
  AND se.event_date >= CURRENT_DATE
  AND se.status    = 'active';

  SELECT
  rpc.name,
  rpc.masters,
  sem.role          AS event_role,
  sm.level          AS master_level
FROM get_saunas_nearby(52.4064, 16.9252, 20000) rpc
JOIN saunas              s   ON s.id  = rpc.id
JOIN sauna_events        se  ON se.sauna_id = s.id
JOIN sauna_event_masters sem ON sem.event_id = se.id
JOIN sauna_masters       sm  ON sm.id = sem.master_id
WHERE rpc.name ILIKE '%maltańskie%' OR rpc.name ILIKE '%malta%';

CREATE POLICY "anon can insert sauna_masters"
ON sauna_masters
FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "anon can insert sauna_event_masters"
ON sauna_event_masters
FOR INSERT
TO anon
WITH CHECK (true);

update profiles set role = 'admin' where id = 'janus@hot.pl';
select * from profiles;

-- 1. Tabela profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user'
    check (role in ('user', 'moderator', 'admin')),
  created_at timestamptz default now()
);

-- 2. Trigger
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. RLS
alter table public.profiles enable row level security;

create policy "user can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "admin can read all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- 4. Profil dla istniejących użytkowników
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- 5. Nadanie roli admin dla janus@hot.pl
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'janus@hot.pl');

-- Helper: sprawdzenie roli admin
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
$$ language sql security definer stable;

-- Kolumna user_id w recenzjach
alter table public.sauna_reviews
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- ============================================================
-- SAUNAS
-- ============================================================
alter table public.saunas enable row level security;

drop policy if exists "saunas_select" on public.saunas;
drop policy if exists "saunas_insert" on public.saunas;
drop policy if exists "saunas_update" on public.saunas;
drop policy if exists "saunas_delete" on public.saunas;

create policy "saunas_select" on public.saunas for select using (true);
create policy "saunas_insert" on public.saunas for insert with check (public.is_admin());
create policy "saunas_update" on public.saunas for update using (public.is_admin());
create policy "saunas_delete" on public.saunas for delete using (public.is_admin());

-- ============================================================
-- SAUNA_PHOTOS
-- ============================================================
alter table public.sauna_photos enable row level security;

drop policy if exists "photos_select" on public.sauna_photos;
drop policy if exists "photos_insert" on public.sauna_photos;
drop policy if exists "photos_update" on public.sauna_photos;
drop policy if exists "photos_delete" on public.sauna_photos;

create policy "photos_select" on public.sauna_photos for select using (true);
create policy "photos_insert" on public.sauna_photos for insert with check (public.is_admin());
create policy "photos_update" on public.sauna_photos for update using (public.is_admin());
create policy "photos_delete" on public.sauna_photos for delete using (public.is_admin());

-- ============================================================
-- SAUNA_EVENTS
-- ============================================================
alter table public.sauna_events enable row level security;

drop policy if exists "events_select" on public.sauna_events;
drop policy if exists "events_insert" on public.sauna_events;
drop policy if exists "events_update" on public.sauna_events;
drop policy if exists "events_delete" on public.sauna_events;

create policy "events_select" on public.sauna_events for select using (true);
create policy "events_insert" on public.sauna_events for insert with check (public.is_admin());
create policy "events_update" on public.sauna_events for update using (public.is_admin());
create policy "events_delete" on public.sauna_events for delete using (public.is_admin());

-- ============================================================
-- SAUNA_REVIEWS
-- ============================================================
alter table public.sauna_reviews enable row level security;

drop policy if exists "reviews_select" on public.sauna_reviews;
drop policy if exists "reviews_insert" on public.sauna_reviews;
drop policy if exists "reviews_update" on public.sauna_reviews;
drop policy if exists "reviews_delete" on public.sauna_reviews;

create policy "reviews_select" on public.sauna_reviews for select using (true);
create policy "reviews_insert" on public.sauna_reviews for insert
  with check (auth.uid() is not null and auth.uid() = user_id);
create policy "reviews_update" on public.sauna_reviews for update
  using (auth.uid() = user_id or public.is_admin());
create policy "reviews_delete" on public.sauna_reviews for delete
  using (auth.uid() = user_id or public.is_admin());

-- ============================================================
-- SAUNA_MASTERS
-- ============================================================
alter table public.sauna_masters enable row level security;

drop policy if exists "masters_select" on public.sauna_masters;
drop policy if exists "masters_insert" on public.sauna_masters;
drop policy if exists "masters_update" on public.sauna_masters;
drop policy if exists "masters_delete" on public.sauna_masters;

create policy "masters_select" on public.sauna_masters for select using (true);
create policy "masters_insert" on public.sauna_masters for insert with check (public.is_admin());
create policy "masters_update" on public.sauna_masters for update using (public.is_admin());
create policy "masters_delete" on public.sauna_masters for delete using (public.is_admin());

-- ============================================================
-- MASTER_CREDENTIALS
-- ============================================================
alter table public.master_credentials enable row level security;

drop policy if exists "credentials_select" on public.master_credentials;
drop policy if exists "credentials_insert" on public.master_credentials;
drop policy if exists "credentials_update" on public.master_credentials;
drop policy if exists "credentials_delete" on public.master_credentials;

create policy "credentials_select" on public.master_credentials for select using (true);
create policy "credentials_insert" on public.master_credentials for insert with check (public.is_admin());
create policy "credentials_update" on public.master_credentials for update using (public.is_admin());
create policy "credentials_delete" on public.master_credentials for delete using (public.is_admin());

-- ============================================================
-- SAUNA_EVENT_MASTERS
-- ============================================================
alter table public.sauna_event_masters enable row level security;

drop policy if exists "event_masters_select" on public.sauna_event_masters;
drop policy if exists "event_masters_insert" on public.sauna_event_masters;
drop policy if exists "event_masters_update" on public.sauna_event_masters;
drop policy if exists "event_masters_delete" on public.sauna_event_masters;

create policy "event_masters_select" on public.sauna_event_masters for select using (true);
create policy "event_masters_insert" on public.sauna_event_masters for insert with check (public.is_admin());
create policy "event_masters_update" on public.sauna_event_masters for update using (public.is_admin());
create policy "event_masters_delete" on public.sauna_event_masters for delete using (public.is_admin());


create table public.sauna_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  city text,
  category text not null default 'public_sauna',
  website text,
  latitude double precision,
  longitude double precision,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  created_at timestamptz default now()
);

alter table public.sauna_submissions enable row level security;

create policy "submissions_select"
  on public.sauna_submissions for select
  using (auth.uid() = user_id or public.is_admin());

create policy "submissions_insert"
  on public.sauna_submissions for insert
  with check (auth.uid() = user_id);

create policy "submissions_update"
  on public.sauna_submissions for update
  using (public.is_admin());

create policy "submissions_delete"
  on public.sauna_submissions for delete
  using (public.is_admin());

-- Odswiezenie schema cache PostgREST
notify pgrst, 'reload schema';

select p.id, p.role, u.email
from public.profiles p
join auth.users u on u.id = p.id
where u.email = 'janus@hot.pl';

drop policy if exists "admin can read all profiles" on profiles;

create policy "admin can read all profiles"
  on profiles for select
  using (public.is_admin());

  select * from saunas where name like '%Wodny Raj%';


  



  1. Dodaj home_sauna_id do sauna_masters
ALTER TABLE sauna_masters
  ADD COLUMN home_sauna_id UUID REFERENCES saunas(id) ON DELETE SET NULL;
Wpływ: addytywny, istniejące rekordy mają NULL → grupowanie na /masters traktuje je jako „Bez przypisanej sauny". Bez błędów kompatybilności.

2. Dodaj status do sauna_masters
ALTER TABLE sauna_masters
  ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected'));
Wpływ: istniejące rekordy dostaną status = 'approved' → nie znikają z listy. Addytywne.

3. RLS — publiczny odczyt tylko approved masterów
-- Zastąp obecną politykę read na sauna_masters:
DROP POLICY IF EXISTS "Public read sauna_masters" ON sauna_masters;

CREATE POLICY "Public read approved sauna_masters"
  ON sauna_masters FOR SELECT
  USING (status = 'approved');

CREATE POLICY "Admin read all sauna_masters"
  ON sauna_masters FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'moderator')
    )
  );

4. INSERT policy dla sauna_masters (self-registration)
CREATE POLICY "Authenticated users can insert pending masters"
  ON sauna_masters FOR INSERT
  TO authenticated
  WITH CHECK (status = 'pending');

  -- INSERT dla admina/moderatora (dowolny status)
CREATE POLICY "Admin can insert sauna_masters"
  ON sauna_masters FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'moderator')
    )
  );

-- UPDATE dla admina/moderatora (zmiana statusu, avatar_url itp.)
CREATE POLICY "Admin can update sauna_masters"
  ON sauna_masters FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'moderator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'moderator')
    )
  );

  SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'objects' AND schemaname = 'storage'
  AND qual::text LIKE '%master-avatars%' OR with_check::text LIKE '%master-avatars%';

  CREATE POLICY "Authenticated users can upload to master-avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'master-avatars');

CREATE POLICY "Authenticated users can upload to master-avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'master-avatars');

SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'objects' AND schemaname = 'storage';

SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'sauna_masters';










-- Usuń wszystkie istniejące polityki
DROP POLICY IF EXISTS "Admin can insert sauna_masters"           ON sauna_masters;
DROP POLICY IF EXISTS "Admin can update sauna_masters"           ON sauna_masters;
DROP POLICY IF EXISTS "Admin read all sauna_masters"             ON sauna_masters;
DROP POLICY IF EXISTS "Allow public read sauna masters"          ON sauna_masters;
DROP POLICY IF EXISTS "Authenticated users can insert pending masters" ON sauna_masters;
DROP POLICY IF EXISTS "Public read approved sauna_masters"       ON sauna_masters;
DROP POLICY IF EXISTS "anon can insert sauna_masters"            ON sauna_masters;
DROP POLICY IF EXISTS "anon can update avatar_url"               ON sauna_masters;
DROP POLICY IF EXISTS "masters_delete"                           ON sauna_masters;
DROP POLICY IF EXISTS "masters_insert"                           ON sauna_masters;
DROP POLICY IF EXISTS "masters_select"                           ON sauna_masters;
DROP POLICY IF EXISTS "masters_update"                           ON sauna_masters;

-- SELECT: publiczni widzą approved, admin widzi wszystko
CREATE POLICY "masters_select" ON sauna_masters FOR SELECT
USING (
  status = 'approved'
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'moderator')
  )
);

-- INSERT: admin wstawia dowolny status, zalogowany użytkownik tylko pending
CREATE POLICY "masters_insert" ON sauna_masters FOR INSERT
TO authenticated
WITH CHECK (
  status = 'pending'
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'moderator')
  )
);

-- UPDATE: permisywny (MVP — UploadAvatarButton nie wymaga jeszcze ownership)
CREATE POLICY "masters_update" ON sauna_masters FOR UPDATE
USING (true)
WITH CHECK (true);

-- DELETE: tylko admin
CREATE POLICY "masters_delete" ON sauna_masters FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'moderator')
  )
);


-- 1. Podgląd — jakich Hubertów usuniemy (bez zdjęcia)
SELECT id, name, avatar_url
FROM sauna_masters
WHERE name ILIKE 'Hubert%'
  AND (avatar_url IS NULL OR avatar_url = '');

-- 2. Podgląd — jaki Hubert zostaje (ze zdjęciem)
SELECT id, name, avatar_url
FROM sauna_masters
WHERE name ILIKE 'Hubert%'
  AND avatar_url IS NOT NULL AND avatar_url <> '';

-- 3. Podgląd — ID Term Maltańskich
SELECT id, name FROM saunas WHERE name ILIKE '%Maltań%';

DELETE FROM sauna_masters
WHERE name ILIKE 'Hubert%'
  AND (avatar_url IS NULL OR avatar_url = '');


UPDATE sauna_masters
SET home_sauna_id = (
  SELECT id FROM saunas WHERE name ILIKE '%Maltań%' LIMIT 1
);







-- Słownik zarządzany przez admina
CREATE TABLE certificate_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT true,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Certyfikaty przypisane do mistrzów
CREATE TABLE master_certificates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id           UUID NOT NULL REFERENCES sauna_masters(id) ON DELETE CASCADE,
  certificate_type_id UUID NOT NULL REFERENCES certificate_types(id),
  year                INTEGER,
  notes               TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Słownik certyfikatów
CREATE TABLE certificate_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT true,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Certyfikaty mistrzów
CREATE TABLE master_certificates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id           UUID NOT NULL REFERENCES sauna_masters(id) ON DELETE CASCADE,
  certificate_type_id UUID NOT NULL REFERENCES certificate_types(id),
  year                INTEGER,
  notes               TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Seed słownika
INSERT INTO certificate_types (name, category, sort_order) VALUES
('Certyfikacja SaunaPlanet',            'certification',   10),
('Certyfikowany Instruktor Sauny PTS',  'certification',   20),
('Certyfikowany Saunamistrz PTS',       'certification',   30),
('Mistrz Polski Saunamistrzów',         'championship_pl', 100),
('Wicemistrz Polski Saunamistrzów',     'championship_pl', 110),
('III miejsce Mistrzostw Polski',       'championship_pl', 120),
('Uczestnik Mistrzostw Polski',         'championship_pl', 130),
('Zwycięzca Battle of Gladiators',      'gladiators',      200),
('Finalista Battle of Gladiators',      'gladiators',      210),
('Uczestnik Battle of Gladiators',      'gladiators',      220),
('Mistrz Świata Aufguss WM',            'aufguss_wm',      300),
('Wicemistrz Świata Aufguss WM',        'aufguss_wm',      310),
('III miejsce Aufguss WM',              'aufguss_wm',      320),
('Uczestnik Aufguss WM',                'aufguss_wm',      330),
('Zwycięzca Modern Classic Cup',        'classic_cup',     400),
('Finalista Modern Classic Cup',        'classic_cup',     410),
('Uczestnik Modern Classic Cup',        'classic_cup',     420),
('Zwycięzca Sauna Cup',                 'cup',             500),
('Uczestnik Sauna Cup',                 'cup',             510),
('Zwycięzca Pucharu Polski',            'cup',             520),
('Uczestnik Pucharu Polski',            'cup',             530),
('Ambasador SaunaPlanet',               'other',           900),
('Inny certyfikat',                     'other',           999);

-- RLS certificate_types
ALTER TABLE certificate_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active certificate_types"
  ON certificate_types FOR SELECT USING (is_active = true);

CREATE POLICY "Admin manage certificate_types"
  ON certificate_types FOR ALL TO authenticated
  USING   (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','moderator')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','moderator')));

-- RLS master_certificates
ALTER TABLE master_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read approved master_certificates"
  ON master_certificates FOR SELECT
  USING (
    status = 'approved'
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','moderator'))
  );

CREATE POLICY "Authenticated insert master_certificates"
  ON master_certificates FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','moderator'))
  );

CREATE POLICY "Admin update master_certificates"
  ON master_certificates FOR UPDATE TO authenticated
  USING   (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','moderator')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','moderator')));

CREATE POLICY "Admin delete master_certificates"
  ON master_certificates FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','moderator')));




  CREATE TABLE event_photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES sauna_events(id) ON DELETE CASCADE,
  image_url   TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE event_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_photos_select" ON event_photos
  FOR SELECT USING (true);

CREATE POLICY "event_photos_insert" ON event_photos
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "event_photos_delete" ON event_photos
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'moderator')
    )
  );

  -- ulubione sauny
CREATE TABLE user_favorites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sauna_id   UUID NOT NULL REFERENCES saunas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, sauna_id)
);

-- zainteresowanie eventem
CREATE TABLE user_event_interests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id   UUID NOT NULL REFERENCES sauna_events(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'going',  -- 'going' | 'interested'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, event_id)
);

-- RLS: user_favorites
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own favorites" ON user_favorites
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS: user_event_interests
ALTER TABLE user_event_interests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own interests" ON user_event_interests
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());