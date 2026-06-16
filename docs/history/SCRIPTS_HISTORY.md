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