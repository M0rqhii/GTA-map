-- GTA Map: RPCs for members, org owners and the public viewer.
-- Errors are raised as short codes (not_allowed, invalid_input, ...) translated by src/lib/errors.ts.

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create or replace function private.require_active()
returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.profiles;
begin
  select * into v from public.profiles p where p.id = auth.uid() and p.activated;
  if not found then
    raise exception 'not_allowed';
  end if;
  return v;
end;
$$;

create or replace function private.require_member(p_need_color boolean default false)
returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_active();
begin
  if v.org_id is null or (p_need_color and v.color is null) then
    raise exception 'not_allowed';
  end if;
  return v;
end;
$$;

create or replace function private.require_owner()
returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_member(false);
begin
  if not exists (select 1 from public.organizations o where o.id = v.org_id and o.owner_id = v.id) then
    raise exception 'not_allowed';
  end if;
  return v;
end;
$$;

create or replace function private.log_activity(p_org uuid, p_actor uuid, p_kind text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_super boolean;
begin
  select p.username, (p.is_superadmin and p.org_id is distinct from p_org)
    into v_name, v_super
    from public.profiles p where p.id = p_actor;
  insert into public.activity (org_id, actor_id, actor_name, actor_is_superadmin, kind, data)
  values (p_org, p_actor, v_name, coalesce(v_super, false), p_kind, coalesce(p_data, '{}'::jsonb));
end;
$$;

-- Cell changes of one person within 10 s are merged into a single history entry.
create or replace function private.log_cells_activity(p_org uuid, p_actor uuid, p_kind text, p_cells jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int := jsonb_array_length(p_cells);
  v_id bigint;
  v_data jsonb;
  v_minx int; v_miny int; v_maxx int; v_maxy int;
  v_prev jsonb;
begin
  if v_n = 0 then
    return;
  end if;
  select min((e ->> 0)::int), min((e ->> 1)::int), max((e ->> 0)::int), max((e ->> 1)::int)
    into v_minx, v_miny, v_maxx, v_maxy
    from jsonb_array_elements(p_cells) e;

  select a.id, a.data into v_id, v_data
    from public.activity a
   where a.org_id = p_org and a.actor_id = p_actor and a.kind = p_kind
     and a.updated_at > now() - interval '10 seconds'
   order by a.id desc
   limit 1
   for update;

  if v_id is null then
    perform private.log_activity(p_org, p_actor, p_kind, jsonb_build_object(
      'count', v_n, 'minX', v_minx, 'minY', v_miny, 'maxX', v_maxx, 'maxY', v_maxy,
      'cells', case when v_n <= 500 then p_cells else '[]'::jsonb end));
  else
    v_prev := coalesce(v_data -> 'cells', '[]'::jsonb);
    update public.activity
       set data = jsonb_build_object(
             'count', coalesce((v_data ->> 'count')::int, 0) + v_n,
             'minX', least((v_data ->> 'minX')::int, v_minx),
             'minY', least((v_data ->> 'minY')::int, v_miny),
             'maxX', greatest((v_data ->> 'maxX')::int, v_maxx),
             'maxY', greatest((v_data ->> 'maxY')::int, v_maxy),
             'cells', case when jsonb_array_length(v_prev) + v_n <= 500 then v_prev || p_cells else v_prev end),
           updated_at = now()
     where id = v_id;
  end if;
end;
$$;

-- Rotating the key moves the org channel to a new topic, cutting off removed members' subscriptions.
create or replace function private.rotate_channel_key(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text := private.org_topic(p_org);
begin
  if v_old is null then
    return;
  end if;
  update public.organizations set channel_key = encode(extensions.gen_random_bytes(16), 'hex') where id = p_org;
  perform realtime.send('{}'::jsonb, 'channel_rotated', v_old, true);
end;
$$;

-- The single place where membership changes. Leaving an org removes the user's cells and pins there,
-- hands ownership to the longest-standing member (or deletes an empty org) and resets the color.
create or replace function private.set_member_org(p_user uuid, p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old uuid;
  v_new_owner uuid;
begin
  select p.org_id into v_old from public.profiles p where p.id = p_user for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_old is not distinct from p_org then
    return;
  end if;

  if v_old is not null then
    delete from public.cells c where c.org_id = v_old and c.user_id = p_user;
    delete from public.pins pn where pn.org_id = v_old and pn.user_id = p_user;
  end if;

  update public.profiles
     set org_id = p_org,
         color = null,
         joined_at = case when p_org is null then null else now() end
   where id = p_user;

  if v_old is not null then
    if exists (select 1 from public.organizations o where o.id = v_old and o.owner_id = p_user) then
      select p.id into v_new_owner
        from public.profiles p
       where p.org_id = v_old and p.activated
       order by p.joined_at nulls last, p.created_at
       limit 1;
      if v_new_owner is null then
        delete from public.organizations o where o.id = v_old;
        return;
      end if;
      update public.organizations set owner_id = v_new_owner where id = v_old;
      perform private.log_activity(v_old, v_new_owner, 'owner_changed', jsonb_build_object(
        'user_id', v_new_owner,
        'username', (select p.username from public.profiles p where p.id = v_new_owner)));
    end if;
    perform private.rotate_channel_key(v_old);
  end if;
end;
$$;

create or replace function private.valid_pin(p_px real, p_py real, p_icon text, p_body text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_px is not null and p_py is not null
     and p_px between 0 and 8192 and p_py between 0 and 8192
     and p_icon in ('important', 'found', 'entrance', 'check', 'danger', 'note')
     and p_body is not null and char_length(p_body) between 1 and 300
     and btrim(p_body) <> '' and p_body !~ '[\x01-\x09\x0b-\x1f\x7f]'
$$;

create or replace function private.apply_org_public(p_org uuid, p_actor uuid, p_public boolean, p_delay int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_public is null or p_delay is null or p_delay not in (0, 5, 15, 30) then
    raise exception 'invalid_input';
  end if;
  update public.organizations set is_public = p_public, public_delay_minutes = p_delay where id = p_org;
  if not found then
    raise exception 'not_found';
  end if;
  perform private.log_activity(p_org, p_actor, 'org_public_changed', jsonb_build_object('is_public', p_public, 'delay', p_delay));
end;
$$;

-- ---------------------------------------------------------------------------
-- Public (anonymous) API: only org names and bare coordinates ever leave these functions.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_access_path(p_path text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.kind from private.access_paths a where a.path = p_path
$$;

create or replace function public.public_list_orgs()
returns table (id uuid, name text, delay smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name, o.public_delay_minutes from public.organizations o where o.is_public order by lower(o.name)
$$;

create or replace function public.public_get_cells(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_delay int;
begin
  select o.public_delay_minutes into v_delay from public.organizations o where o.id = p_org and o.is_public;
  if not found then
    return null;
  end if;

  if v_delay = 0 then
    return (
      select coalesce(jsonb_agg(e.v order by c.y, c.x, e.ord), '[]'::jsonb)
        from public.cells c
        cross join lateral unnest(array[c.x, c.y]) with ordinality as e(v, ord)
       where c.org_id = p_org);
  end if;

  -- State as of now() - delay: the first change after the cutoff tells what the cell was before it.
  return (
    with first_after as (
      select distinct on (ev.x, ev.y) ev.x, ev.y, ev.added
        from private.cell_events ev
       where ev.org_id = p_org and ev.at > now() - make_interval(mins => v_delay)
       order by ev.x, ev.y, ev.at, ev.id
    ), state as (
      select c.x, c.y from public.cells c
       where c.org_id = p_org
         and not exists (select 1 from first_after f where f.x = c.x and f.y = c.y)
      union all
      select f.x, f.y from first_after f where not f.added
    )
    select coalesce(jsonb_agg(e.v order by s.y, s.x, e.ord), '[]'::jsonb)
      from state s
      cross join lateral unnest(array[s.x, s.y]) with ordinality as e(v, ord));
end;
$$;

-- ---------------------------------------------------------------------------
-- Account
-- ---------------------------------------------------------------------------
create or replace function public.get_me()
returns table (id uuid, username text, org_id uuid, color text, joined_at timestamptz, activated boolean, is_superadmin boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.org_id, p.color, p.joined_at, p.activated, p.is_superadmin
    from public.profiles p where p.id = auth.uid()
$$;

-- Activates an account created outside the register flow (e.g. Discord) with the register link key.
-- Returns false instead of raising so the rate-limit counter is kept.
create or replace function public.activate_account(p_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'not_allowed';
  end if;
  perform private.hit_rate_limit('activate:' || auth.uid()::text, 10, interval '10 minutes');
  select exists (select 1 from private.access_paths a where a.kind = 'register' and a.path = p_key) into v_ok;
  if v_ok then
    update public.profiles set activated = true where id = auth.uid();
  end if;
  return v_ok;
end;
$$;

create or replace function public.create_org(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_active();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if v.org_id is not null then
    raise exception 'already_in_org';
  end if;
  if char_length(v_name) not between 2 and 32 or v_name ~ '[[:cntrl:]]' then
    raise exception 'invalid_input';
  end if;
  perform private.hit_rate_limit('create_org:' || v.id::text, 5, interval '1 hour');
  if exists (select 1 from public.organizations o where lower(o.name) = lower(v_name)) then
    raise exception 'name_taken';
  end if;
  begin
    insert into public.organizations (name, invite_code, owner_id)
    values (v_name, private.new_invite_code(), v.id)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'name_taken';
  end;
  perform private.set_member_org(v.id, v_id);
  perform private.log_activity(v_id, v.id, 'org_created', '{}'::jsonb);
  return v_id;
end;
$$;

-- Returns 'ok' | 'invalid_code' | 'already_in_org'. Never raises on a wrong code, so failed
-- guesses still count towards the rate limit.
create or replace function public.join_org(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_active();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_org uuid;
begin
  perform private.hit_rate_limit('join:' || v.id::text, 10, interval '10 minutes');
  if v.org_id is not null then
    return 'already_in_org';
  end if;
  select o.id into v_org from public.organizations o where o.invite_code = v_code;
  if v_org is null then
    return 'invalid_code';
  end if;
  perform private.set_member_org(v.id, v_org);
  perform private.log_activity(v_org, v.id, 'member_joined', '{}'::jsonb);
  return 'ok';
end;
$$;

create or replace function public.leave_org()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_member(false);
begin
  perform private.log_activity(v.org_id, v.id, 'member_left', '{}'::jsonb);
  perform private.set_member_org(v.id, null);
end;
$$;

create or replace function public.set_color(p_color text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_member(false);
  v_color text := lower(coalesce(p_color, ''));
begin
  if not (v_color = any (private.palette())) then
    raise exception 'invalid_input';
  end if;
  begin
    update public.profiles set color = v_color where id = v.id;
  exception when unique_violation then
    raise exception 'color_taken';
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cells
-- ---------------------------------------------------------------------------
-- Compact snapshot: {users: [uuid...], cells: [x, y, userIndex, epochSeconds, ...]}
create or replace function public.get_org_cells(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (p_org = private.my_org_id() or private.is_superadmin()) then
    raise exception 'not_allowed';
  end if;
  return (
    with u as (
      select d.user_id, (row_number() over (order by d.user_id) - 1)::bigint as idx
        from (select distinct c.user_id from public.cells c where c.org_id = p_org) d
    )
    select jsonb_build_object(
      'users', coalesce((select jsonb_agg(u.user_id order by u.idx) from u), '[]'::jsonb),
      'cells', coalesce((
        select jsonb_agg(e.v order by c.y, c.x, e.ord)
          from public.cells c
          join u on u.user_id = c.user_id
          cross join lateral unnest(array[c.x::bigint, c.y::bigint, u.idx, floor(extract(epoch from c.created_at))::bigint])
            with ordinality as e(v, ord)
         where c.org_id = p_org), '[]'::jsonb)));
end;
$$;

create or replace function private.parse_cells(p_cells smallint[])
returns table (ix smallint, iy smallint)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_n int := coalesce(array_length(p_cells, 1), 0);
begin
  if v_n = 0 or v_n % 2 = 1 or v_n > 2000 then
    raise exception 'invalid_input';
  end if;
  for i in 1 .. v_n / 2 loop
    if p_cells[2 * i - 1] is null or p_cells[2 * i] is null
       or p_cells[2 * i - 1] not between 0 and 80 or p_cells[2 * i] not between 0 and 118 then
      raise exception 'invalid_input';
    end if;
  end loop;
  return query
    select distinct p_cells[2 * i - 1], p_cells[2 * i] from generate_series(1, v_n / 2) as i;
end;
$$;

-- p_cells = [x0, y0, x1, y1, ...]. Returns the cells actually inserted as [[x, y], ...].
create or replace function public.mark_cells(p_cells smallint[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_member(true);
  v_done jsonb;
begin
  perform private.hit_rate_limit('cells:' || v.id::text, 3000, interval '1 minute', coalesce(array_length(p_cells, 1), 0) / 2);
  with input as (
    select * from private.parse_cells(p_cells)
  ), ins as (
    insert into public.cells (org_id, x, y, user_id)
    select v.org_id, input.ix, input.iy, v.id from input
    on conflict do nothing
    returning x, y
  )
  select coalesce(jsonb_agg(jsonb_build_array(ins.x, ins.y)), '[]'::jsonb) into v_done from ins;
  perform private.log_cells_activity(v.org_id, v.id, 'cells_marked', v_done);
  return v_done;
end;
$$;

-- Removes only the caller's own cells. Returns the cells actually removed as [[x, y], ...].
create or replace function public.unmark_cells(p_cells smallint[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_member(false);
  v_done jsonb;
begin
  perform private.hit_rate_limit('cells:' || v.id::text, 3000, interval '1 minute', coalesce(array_length(p_cells, 1), 0) / 2);
  with input as (
    select * from private.parse_cells(p_cells)
  ), del as (
    delete from public.cells c
     using input
     where c.org_id = v.org_id and c.user_id = v.id and c.x = input.ix and c.y = input.iy
    returning c.x, c.y
  )
  select coalesce(jsonb_agg(jsonb_build_array(del.x, del.y)), '[]'::jsonb) into v_done from del;
  perform private.log_cells_activity(v.org_id, v.id, 'cells_unmarked', v_done);
  return v_done;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pins
-- ---------------------------------------------------------------------------
create or replace function public.add_pin(p_px real, p_py real, p_icon text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_member(true);
  v_id uuid;
begin
  if not private.valid_pin(p_px, p_py, p_icon, p_body) then
    raise exception 'invalid_input';
  end if;
  perform private.hit_rate_limit('pins:' || v.id::text, 30, interval '1 minute');
  perform 1 from public.organizations o where o.id = v.org_id for update;
  if (select count(*) from public.pins pn where pn.org_id = v.org_id) >= 500 then
    raise exception 'pin_limit';
  end if;
  insert into public.pins (org_id, user_id, px, py, icon, body)
  values (v.org_id, v.id, p_px, p_py, p_icon, p_body)
  returning id into v_id;
  perform private.log_activity(v.org_id, v.id, 'pin_added', jsonb_build_object(
    'pin_id', v_id, 'icon', p_icon, 'body', left(p_body, 80), 'px', p_px, 'py', p_py));
  return v_id;
end;
$$;

create or replace function public.update_pin(p_id uuid, p_icon text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_member(false);
  v_pin public.pins;
begin
  select * into v_pin from public.pins pn where pn.id = p_id and pn.org_id = v.org_id and pn.user_id = v.id;
  if not found then
    raise exception 'not_allowed';
  end if;
  if not private.valid_pin(v_pin.px, v_pin.py, p_icon, p_body) then
    raise exception 'invalid_input';
  end if;
  perform private.hit_rate_limit('pins:' || v.id::text, 30, interval '1 minute');
  update public.pins set icon = p_icon, body = p_body, updated_at = now() where id = p_id;
  perform private.log_activity(v.org_id, v.id, 'pin_edited', jsonb_build_object(
    'pin_id', p_id, 'icon', p_icon, 'body', left(p_body, 80), 'px', v_pin.px, 'py', v_pin.py));
end;
$$;

create or replace function public.delete_pin(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_member(false);
  v_pin public.pins;
begin
  select * into v_pin from public.pins pn where pn.id = p_id and pn.org_id = v.org_id;
  if not found then
    raise exception 'not_allowed';
  end if;
  if v_pin.user_id <> v.id
     and not exists (select 1 from public.organizations o where o.id = v.org_id and o.owner_id = v.id) then
    raise exception 'not_allowed';
  end if;
  delete from public.pins where id = p_id;
  perform private.log_activity(v.org_id, v.id, 'pin_removed', jsonb_build_object(
    'pin_id', p_id, 'icon', v_pin.icon, 'body', left(v_pin.body, 80), 'px', v_pin.px, 'py', v_pin.py));
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner
-- ---------------------------------------------------------------------------
create or replace function public.get_invite_code(p_org uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  select o.invite_code into v_code
    from public.organizations o
   where o.id = p_org
     and ((o.owner_id = auth.uid() and o.id = private.my_org_id()) or private.is_superadmin());
  if v_code is null then
    raise exception 'not_allowed';
  end if;
  return v_code;
end;
$$;

create or replace function public.regenerate_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_owner();
  v_code text := private.new_invite_code();
begin
  update public.organizations set invite_code = v_code where id = v.org_id;
  return v_code;
end;
$$;

create or replace function public.kick_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_owner();
  v_target public.profiles;
begin
  select * into v_target from public.profiles p where p.id = p_user;
  if not found or v_target.org_id is distinct from v.org_id or v_target.id = v.id then
    raise exception 'not_allowed';
  end if;
  perform private.log_activity(v.org_id, v.id, 'member_kicked', jsonb_build_object('user_id', v_target.id, 'username', v_target.username));
  perform private.set_member_org(v_target.id, null);
end;
$$;

create or replace function public.clear_map()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_owner();
  v_count int;
begin
  delete from public.cells c where c.org_id = v.org_id;
  get diagnostics v_count = row_count;
  perform private.log_activity(v.org_id, v.id, 'map_cleared', jsonb_build_object('count', v_count));
  return v_count;
end;
$$;

create or replace function public.set_org_public(p_public boolean, p_delay int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_owner();
begin
  perform private.apply_org_public(v.org_id, v.id, p_public, p_delay);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.my_org_id() to authenticated;
grant execute on function private.is_superadmin() to authenticated;

grant execute on function public.resolve_access_path(text) to anon, authenticated;
grant execute on function public.public_list_orgs() to anon, authenticated;
grant execute on function public.public_get_cells(uuid) to anon, authenticated;

grant execute on function
  public.get_me(),
  public.activate_account(text),
  public.create_org(text),
  public.join_org(text),
  public.leave_org(),
  public.set_color(text),
  public.get_org_cells(uuid),
  public.mark_cells(smallint[]),
  public.unmark_cells(smallint[]),
  public.add_pin(real, real, text, text),
  public.update_pin(uuid, text, text),
  public.delete_pin(uuid),
  public.get_invite_code(uuid),
  public.regenerate_invite(),
  public.kick_member(uuid),
  public.clear_map(),
  public.set_org_public(boolean, int)
to authenticated;
