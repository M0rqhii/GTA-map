-- GTA Map: schema, helpers, row level security and privileges.
-- Clients never write tables directly: every change goes through security definer RPCs (0002+).

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- Functions are not executable by default; each migration grants execute explicitly.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Palette (must equal src/lib/palette.ts)
-- ---------------------------------------------------------------------------
create or replace function private.palette()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
-- PALETTE-BEGIN
    '#fc9292', '#fcb292', '#fcca92', '#fce292', '#fcf392', '#eafc92', '#befc92', '#92fc9a',
    '#92fcc7', '#92fcea', '#92eefc', '#92d9fc', '#92befc', '#929afc', '#b992fc', '#f392fc',
    '#f65151', '#f68251', '#f6a951', '#f6cd51', '#f6e851', '#daf651', '#95f651', '#51f65e',
    '#51f6a3', '#51f6da', '#51e0f6', '#51bff6', '#5195f6', '#515ef6', '#8d51f6', '#e851f6',
    '#ed1d1d', '#ed5b1d', '#ed8c1d', '#edb91d', '#eddb1d', '#caed1d', '#73ed1d', '#1ded2e',
    '#1ded85', '#1dedca', '#1dd1ed', '#1da7ed', '#1d73ed', '#1d2eed', '#691ded', '#db1ded',
    '#bc1515', '#bc4715', '#bc6e15', '#bc9215', '#bcae15', '#a0bc15', '#5bbc15', '#15bc23',
    '#15bc69', '#15bca0', '#15a6bc', '#1584bc', '#155bbc', '#1523bc', '#5215bc', '#ae15bc',
    '#8a1414', '#8a3714', '#8a5314', '#8a6d14', '#8a8014', '#778a14', '#458a14', '#148a1e',
    '#148a4f', '#148a77', '#147b8a', '#14638a', '#14458a', '#141e8a', '#3f148a', '#80148a'
-- PALETTE-END
  ]::text[]
$$;

create or replace function private.random_string(p_alphabet text, p_len int)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_bytes bytea := extensions.gen_random_bytes(p_len * 2);
  v_n int := length(p_alphabet);
  v_out text := '';
begin
  for i in 0 .. p_len - 1 loop
    v_out := v_out || substr(p_alphabet, 1 + ((get_byte(v_bytes, 2 * i) * 256 + get_byte(v_bytes, 2 * i + 1)) % v_n), 1);
  end loop;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 32 and name = btrim(name) and name !~ '[[:cntrl:]]'),
  invite_code text not null unique check (invite_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  owner_id uuid,
  is_public boolean not null default false,
  public_delay_minutes smallint not null default 0 check (public_delay_minutes in (0, 5, 15, 30)),
  channel_key text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now()
);
create unique index organizations_name_ci on public.organizations (lower(name));

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_-]{3,20}$'),
  org_id uuid references public.organizations (id) on delete set null,
  color text check (color is null or color = any (private.palette())),
  joined_at timestamptz,
  activated boolean not null default false,
  is_superadmin boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, color)
);
create unique index profiles_username_ci on public.profiles (lower(username));
create index profiles_org on public.profiles (org_id);

alter table public.organizations
  add constraint organizations_owner_fk foreign key (owner_id) references public.profiles (id) on delete set null;

-- Grid: 81 columns x 119 rows (src/lib/grid.ts)
create table public.cells (
  org_id uuid not null references public.organizations (id) on delete cascade,
  x smallint not null check (x between 0 and 80),
  y smallint not null check (y between 0 and 118),
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (org_id, x, y)
);
create index cells_org_user on public.cells (org_id, user_id);

create table public.pins (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  px real not null check (px between 0 and 8192),
  py real not null check (py between 0 and 8192),
  icon text not null check (icon in ('important', 'found', 'entrance', 'check', 'danger', 'note')),
  body text not null check (char_length(body) between 1 and 300 and body !~ '[\x01-\x09\x0b-\x1f\x7f]'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pins_org on public.pins (org_id);
create index pins_user on public.pins (user_id);

create table public.activity (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text,
  actor_is_superadmin boolean not null default false,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index activity_org_id on public.activity (org_id, id desc);
create index activity_org_actor on public.activity (org_id, actor_id, id desc);
create index activity_created on public.activity (created_at);
create index activity_actor on public.activity (actor_id);

create table private.cell_events (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  x smallint not null,
  y smallint not null,
  added boolean not null,
  at timestamptz not null default now()
);
create index cell_events_org_at on private.cell_events (org_id, at);

create table private.access_paths (
  kind text primary key check (kind in ('login', 'register')),
  path text not null unique,
  rotated_at timestamptz not null default now()
);

create table private.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (bucket, window_start)
);

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.cells enable row level security;
alter table public.pins enable row level security;
alter table public.activity enable row level security;
alter table private.cell_events enable row level security;
alter table private.access_paths enable row level security;
alter table private.rate_limits enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.my_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.org_id from public.profiles p where p.id = auth.uid() and p.activated
$$;

create or replace function private.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_superadmin from public.profiles p where p.id = auth.uid() and p.activated), false)
$$;

create or replace function private.org_topic(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'org:' || o.id::text || ':' || o.channel_key from public.organizations o where o.id = p_org
$$;

-- Fixed-window rate limit. Raises 'rate_limited' when the bucket exceeds p_max within the window.
create or replace function private.hit_rate_limit(p_bucket text, p_max int, p_window interval, p_cost int default 1)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seconds double precision := extract(epoch from p_window);
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / v_seconds) * v_seconds);
  v_hits int;
begin
  insert into private.rate_limits (bucket, window_start, hits)
  values (p_bucket, v_start, p_cost)
  on conflict (bucket, window_start) do update set hits = private.rate_limits.hits + p_cost
  returning hits into v_hits;
  if v_hits > p_max then
    raise exception 'rate_limited';
  end if;
end;
$$;

create or replace function private.new_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  loop
    v_code := private.random_string('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 6);
    exit when not exists (select 1 from public.organizations o where o.invite_code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function private.new_access_path(p_prefix text)
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select p_prefix || '-' || private.random_string('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 20)
$$;

-- ---------------------------------------------------------------------------
-- New auth user -> profile. Public e-mail sign-ups are rejected: only accounts created by the
-- register / admin-users edge functions carry app_metadata.activated = true.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_app jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_activated boolean := coalesce((v_app ->> 'activated')::boolean, false);
  v_name text;
  v_base text;
  v_try int := 0;
begin
  if coalesce(v_app ->> 'provider', 'email') = 'email' and not v_activated then
    raise exception 'signup_disabled';
  end if;

  if v_activated then
    v_name := v_meta ->> 'username';
    if v_name is null or v_name !~ '^[A-Za-z0-9_-]{3,20}$' then
      raise exception 'invalid_input';
    end if;
  else
    v_base := regexp_replace(
      coalesce(v_meta -> 'custom_claims' ->> 'global_name', v_meta ->> 'full_name', v_meta ->> 'name', v_meta ->> 'user_name', ''),
      '[^A-Za-z0-9_-]', '', 'g');
    v_base := left(v_base, 15);
    if char_length(v_base) < 3 then
      v_base := 'gracz';
    end if;
    v_name := v_base;
    while exists (select 1 from public.profiles p where lower(p.username) = lower(v_name)) loop
      v_try := v_try + 1;
      if v_try > 50 then
        raise exception 'username_taken';
      end if;
      v_name := v_base || lpad((floor(random() * 10000))::int::text, 4, '0');
    end loop;
  end if;

  insert into public.profiles (id, username, activated) values (new.id, v_name, v_activated);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security (read only; writes go through RPCs)
-- ---------------------------------------------------------------------------
create policy organizations_select on public.organizations
  for select to authenticated
  using (id = (select private.my_org_id()) or (select private.is_superadmin()));

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (org_id is not null and org_id = (select private.my_org_id()))
    or (select private.is_superadmin())
  );

create policy cells_select on public.cells
  for select to authenticated
  using (org_id = (select private.my_org_id()) or (select private.is_superadmin()));

create policy pins_select on public.pins
  for select to authenticated
  using (org_id = (select private.my_org_id()) or (select private.is_superadmin()));

create policy activity_select on public.activity
  for select to authenticated
  using (org_id = (select private.my_org_id()) or (select private.is_superadmin()));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select (id, name, owner_id, is_public, public_delay_minutes, channel_key, created_at)
  on public.organizations to authenticated;
grant select (id, username, org_id, color, joined_at, created_at)
  on public.profiles to authenticated;
grant select on public.cells, public.pins, public.activity to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.my_org_id() to authenticated;
grant execute on function private.is_superadmin() to authenticated;
