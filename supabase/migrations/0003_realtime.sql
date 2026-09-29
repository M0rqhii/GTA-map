-- GTA Map: realtime broadcasts from the database and channel authorization.
-- Org channel topic: 'org:<org_id>:<channel_key>' (members + superadmins, broadcast + presence).
-- Public channel topic: 'pub:<org_id>' (anyone, only while the org is public and live; bare coordinates only).

-- ---------------------------------------------------------------------------
-- Cells: one message per statement and org; big statements (e.g. clearing the map) send 'resync'.
-- ---------------------------------------------------------------------------
create or replace function private.cells_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_topic text;
  v_live boolean;
begin
  insert into private.cell_events (org_id, x, y, added)
  select n.org_id, n.x, n.y, true from new_rows n;

  for r in
    select n.org_id,
           count(*) as cnt,
           jsonb_agg(jsonb_build_array(n.x, n.y, n.user_id, floor(extract(epoch from n.created_at))::bigint)) as full_cells,
           jsonb_agg(jsonb_build_array(n.x, n.y)) as pub_cells
      from new_rows n
     group by n.org_id
  loop
    v_topic := private.org_topic(r.org_id);
    select o.is_public and o.public_delay_minutes = 0 into v_live from public.organizations o where o.id = r.org_id;
    if r.cnt > 500 then
      if v_topic is not null then
        perform realtime.send('{}'::jsonb, 'resync', v_topic, true);
      end if;
      if coalesce(v_live, false) then
        perform realtime.send('{}'::jsonb, 'resync', 'pub:' || r.org_id::text, true);
      end if;
    else
      if v_topic is not null then
        perform realtime.send(jsonb_build_object('cells', r.full_cells), 'cells_added', v_topic, true);
      end if;
      if coalesce(v_live, false) then
        perform realtime.send(jsonb_build_object('cells', r.pub_cells), 'cells_added', 'pub:' || r.org_id::text, true);
      end if;
    end if;
  end loop;
  return null;
end;
$$;

create or replace function private.cells_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_topic text;
  v_live boolean;
begin
  insert into private.cell_events (org_id, x, y, added)
  select o.org_id, o.x, o.y, false from old_rows o;

  for r in
    select o.org_id, count(*) as cnt, jsonb_agg(jsonb_build_array(o.x, o.y)) as cells
      from old_rows o
     group by o.org_id
  loop
    v_topic := private.org_topic(r.org_id);
    select og.is_public and og.public_delay_minutes = 0 into v_live from public.organizations og where og.id = r.org_id;
    if r.cnt > 500 then
      if v_topic is not null then
        perform realtime.send('{}'::jsonb, 'resync', v_topic, true);
      end if;
      if coalesce(v_live, false) then
        perform realtime.send('{}'::jsonb, 'resync', 'pub:' || r.org_id::text, true);
      end if;
    else
      if v_topic is not null then
        perform realtime.send(jsonb_build_object('cells', r.cells), 'cells_removed', v_topic, true);
      end if;
      if coalesce(v_live, false) then
        perform realtime.send(jsonb_build_object('cells', r.cells), 'cells_removed', 'pub:' || r.org_id::text, true);
      end if;
    end if;
  end loop;
  return null;
end;
$$;

create trigger cells_after_insert
  after insert on public.cells
  referencing new table as new_rows
  for each statement execute function private.cells_after_insert();

create trigger cells_after_delete
  after delete on public.cells
  referencing old table as old_rows
  for each statement execute function private.cells_after_delete();

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------
create or replace function private.profiles_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topic text;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.org_id is not null
     and (tg_op = 'DELETE' or new.org_id is distinct from old.org_id) then
    v_topic := private.org_topic(old.org_id);
    if v_topic is not null then
      perform realtime.send(jsonb_build_object('user_id', old.id), 'member_removed', v_topic, true);
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.org_id is not null
     and (tg_op = 'INSERT' or new.org_id is distinct from old.org_id
          or new.color is distinct from old.color or new.username is distinct from old.username) then
    v_topic := private.org_topic(new.org_id);
    if v_topic is not null then
      perform realtime.send(jsonb_build_object('profile', jsonb_build_object(
        'id', new.id, 'username', new.username, 'color', new.color, 'joined_at', new.joined_at)),
        'member_changed', v_topic, true);
    end if;
  end if;
  return null;
end;
$$;

create trigger profiles_after_change
  after insert or update or delete on public.profiles
  for each row execute function private.profiles_after_change();

-- ---------------------------------------------------------------------------
-- Pins and history
-- ---------------------------------------------------------------------------
create or replace function private.pins_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topic text;
begin
  if tg_op = 'DELETE' then
    v_topic := private.org_topic(old.org_id);
    if v_topic is not null then
      perform realtime.send(jsonb_build_object('id', old.id), 'pin_removed', v_topic, true);
    end if;
  else
    v_topic := private.org_topic(new.org_id);
    if v_topic is not null then
      perform realtime.send(jsonb_build_object('pin', to_jsonb(new)), 'pin_upserted', v_topic, true);
    end if;
  end if;
  return null;
end;
$$;

create trigger pins_after_change
  after insert or update or delete on public.pins
  for each row execute function private.pins_after_change();

create or replace function private.activity_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topic text := private.org_topic(new.org_id);
begin
  if v_topic is not null then
    perform realtime.send(jsonb_build_object('entry', jsonb_build_object(
      'id', new.id, 'actor_id', new.actor_id, 'actor_name', new.actor_name,
      'actor_is_superadmin', new.actor_is_superadmin, 'kind', new.kind, 'data', new.data,
      'created_at', new.created_at, 'updated_at', new.updated_at)),
      'activity_upserted', v_topic, true);
  end if;
  return null;
end;
$$;

create trigger activity_after_change
  after insert or update on public.activity
  for each row execute function private.activity_after_change();

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------
create or replace function private.orgs_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(jsonb_build_object('org', jsonb_build_object(
    'id', new.id, 'name', new.name, 'owner_id', new.owner_id,
    'is_public', new.is_public, 'public_delay_minutes', new.public_delay_minutes)),
    'org_changed', 'org:' || new.id::text || ':' || new.channel_key, true);
  if new.is_public is distinct from old.is_public or new.public_delay_minutes is distinct from old.public_delay_minutes then
    perform realtime.send('{}'::jsonb, 'visibility_changed', 'pub:' || new.id::text, true);
  end if;
  return null;
end;
$$;

create trigger orgs_after_update
  after update on public.organizations
  for each row execute function private.orgs_after_update();

create or replace function private.orgs_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send('{}'::jsonb, 'org_deleted', 'org:' || old.id::text || ':' || old.channel_key, true);
  if old.is_public then
    perform realtime.send('{}'::jsonb, 'visibility_changed', 'pub:' || old.id::text, true);
  end if;
  return old;
end;
$$;

create trigger orgs_before_delete
  before delete on public.organizations
  for each row execute function private.orgs_before_delete();

-- ---------------------------------------------------------------------------
-- Channel authorization (evaluated by Realtime when a client joins a private channel)
-- ---------------------------------------------------------------------------
create or replace function private.can_receive_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(coalesce(p_topic, ''), ':');
  v_org uuid;
begin
  if array_length(v_parts, 1) = 3 and v_parts[1] = 'org' and v_parts[2] ~ '^[0-9a-f-]{36}$' then
    v_org := v_parts[2]::uuid;
    return exists (select 1 from public.organizations o where o.id = v_org and o.channel_key = v_parts[3])
       and (v_org = private.my_org_id() or private.is_superadmin());
  end if;
  if array_length(v_parts, 1) = 2 and v_parts[1] = 'pub' and v_parts[2] ~ '^[0-9a-f-]{36}$' then
    v_org := v_parts[2]::uuid;
    return exists (select 1 from public.organizations o where o.id = v_org and o.is_public and o.public_delay_minutes = 0);
  end if;
  return false;
end;
$$;

create or replace function private.can_track_presence(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_topic is not null and p_topic = private.org_topic(private.my_org_id())
$$;

create policy gta_receive on realtime.messages
  for select to anon, authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select private.can_receive_topic((select realtime.topic())))
  );

create policy gta_track_presence on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and (select private.can_track_presence((select realtime.topic())))
  );

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.my_org_id() to authenticated;
grant execute on function private.is_superadmin() to authenticated;
grant execute on function private.can_receive_topic(text) to anon, authenticated;
grant execute on function private.can_track_presence(text) to authenticated;
