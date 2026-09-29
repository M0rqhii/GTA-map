-- GTA Map: superadmin RPCs, service-role helpers for edge functions, cleanup jobs, hidden access paths.

create or replace function private.require_superadmin()
returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_active();
begin
  if not v.is_superadmin then
    raise exception 'not_allowed';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Superadmin
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_orgs()
returns table (id uuid, name text, owner_id uuid, owner_name text, member_count int, cell_count int, pin_count int,
               is_public boolean, public_delay_minutes smallint, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_superadmin();
  return query
    select o.id, o.name, o.owner_id, ow.username,
           (select count(*)::int from public.profiles p where p.org_id = o.id),
           (select count(*)::int from public.cells c where c.org_id = o.id),
           (select count(*)::int from public.pins pn where pn.org_id = o.id),
           o.is_public, o.public_delay_minutes, o.created_at
      from public.organizations o
      left join public.profiles ow on ow.id = o.owner_id
     order by lower(o.name);
end;
$$;

create or replace function public.admin_list_users()
returns table (id uuid, username text, org_id uuid, org_name text, color text, activated boolean, is_superadmin boolean,
               created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_superadmin();
  return query
    select p.id, p.username, p.org_id, o.name, p.color, p.activated, p.is_superadmin, p.created_at, u.last_sign_in_at
      from public.profiles p
      left join public.organizations o on o.id = p.org_id
      left join auth.users u on u.id = p.id
     order by lower(p.username);
end;
$$;

create or replace function public.admin_create_org(p_name text, p_owner uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_superadmin();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if char_length(v_name) not between 2 and 32 or v_name ~ '[[:cntrl:]]' then
    raise exception 'invalid_input';
  end if;
  if exists (select 1 from public.organizations o where lower(o.name) = lower(v_name)) then
    raise exception 'name_taken';
  end if;
  if p_owner is not null and not exists (select 1 from public.profiles p where p.id = p_owner and p.activated) then
    raise exception 'not_found';
  end if;
  insert into public.organizations (name, invite_code) values (v_name, private.new_invite_code()) returning id into v_id;
  perform private.log_activity(v_id, v.id, 'org_created', '{}'::jsonb);
  if p_owner is not null then
    perform private.set_member_org(p_owner, v_id);
    update public.organizations set owner_id = p_owner where id = v_id;
    perform private.log_activity(v_id, p_owner, 'member_joined', '{}'::jsonb);
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_set_owner(p_org uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_superadmin();
  v_target public.profiles;
begin
  if not exists (select 1 from public.organizations o where o.id = p_org) then
    raise exception 'not_found';
  end if;
  select * into v_target from public.profiles p where p.id = p_user and p.activated;
  if not found then
    raise exception 'not_found';
  end if;
  if v_target.org_id is distinct from p_org then
    perform private.set_member_org(p_user, p_org);
    perform private.log_activity(p_org, p_user, 'member_joined', '{}'::jsonb);
  end if;
  update public.organizations set owner_id = p_user where id = p_org;
  perform private.log_activity(p_org, v.id, 'owner_changed', jsonb_build_object('user_id', p_user, 'username', v_target.username));
end;
$$;

create or replace function public.admin_delete_org(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_superadmin();
  update public.profiles set org_id = null, color = null, joined_at = null where org_id = p_org;
  delete from public.organizations where id = p_org;
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

create or replace function public.admin_move_user(p_user uuid, p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_superadmin();
  v_target public.profiles;
begin
  select * into v_target from public.profiles p where p.id = p_user;
  if not found then
    raise exception 'not_found';
  end if;
  if p_org is not null and not exists (select 1 from public.organizations o where o.id = p_org) then
    raise exception 'not_found';
  end if;
  if v_target.org_id is not distinct from p_org then
    return;
  end if;
  if v_target.org_id is not null then
    perform private.log_activity(v_target.org_id, v.id, 'member_kicked', jsonb_build_object('user_id', p_user, 'username', v_target.username));
  end if;
  perform private.set_member_org(p_user, p_org);
  if p_org is not null then
    perform private.log_activity(p_org, p_user, 'member_joined', '{}'::jsonb);
  end if;
end;
$$;

create or replace function public.admin_clear_map(p_org uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_superadmin();
  v_count int;
begin
  if not exists (select 1 from public.organizations o where o.id = p_org) then
    raise exception 'not_found';
  end if;
  delete from public.cells c where c.org_id = p_org;
  get diagnostics v_count = row_count;
  perform private.log_activity(p_org, v.id, 'map_cleared', jsonb_build_object('count', v_count));
  return v_count;
end;
$$;

create or replace function public.admin_set_org_public(p_org uuid, p_public boolean, p_delay int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_superadmin();
begin
  perform private.apply_org_public(p_org, v.id, p_public, p_delay);
end;
$$;

create or replace function public.admin_set_superadmin(p_user uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_superadmin();
begin
  if p_user = v.id or p_value is null then
    raise exception 'not_allowed';
  end if;
  update public.profiles set is_superadmin = p_value where id = p_user;
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

create or replace function public.admin_set_activated(p_user uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles := private.require_superadmin();
begin
  if p_user = v.id or p_value is null then
    raise exception 'not_allowed';
  end if;
  update public.profiles set activated = p_value where id = p_user;
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

create or replace function public.admin_get_access_paths()
returns table (kind text, path text, rotated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_superadmin();
  return query select a.kind, a.path, a.rotated_at from private.access_paths a order by a.kind;
end;
$$;

create or replace function public.admin_rotate_access_path(p_kind text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  perform private.require_superadmin();
  if p_kind not in ('login', 'register') then
    raise exception 'invalid_input';
  end if;
  update private.access_paths
     set path = private.new_access_path(case p_kind when 'login' then 'wejscie' else 'rejestracja' end),
         rotated_at = now()
   where kind = p_kind
  returning path into v_path;
  return v_path;
end;
$$;

-- ---------------------------------------------------------------------------
-- Service role only (edge functions)
-- ---------------------------------------------------------------------------
-- Returns false when the limit is exceeded; never raises, so the hit is committed.
create or replace function public.svc_rate_limit(p_bucket text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.hit_rate_limit(p_bucket, p_max, make_interval(secs => p_window_seconds));
  return true;
exception when others then
  if sqlerrm = 'rate_limited' then
    return false;
  end if;
  raise;
end;
$$;

create or replace function public.svc_check_register_key(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.access_paths a where a.kind = 'register' and a.path = p_key)
$$;

create or replace function public.svc_username_taken(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where lower(p.username) = lower(p_username))
$$;

create or replace function public.svc_is_superadmin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = p_user and p.activated and p.is_superadmin)
$$;

create or replace function public.svc_move_user(p_user uuid, p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.organizations o where o.id = p_org) then
    raise exception 'not_found';
  end if;
  perform private.set_member_org(p_user, p_org);
  perform private.log_activity(p_org, p_user, 'member_joined', '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Hidden access paths (generated here, never stored in the repository)
-- ---------------------------------------------------------------------------
insert into private.access_paths (kind, path)
values ('login', private.new_access_path('wejscie')), ('register', private.new_access_path('rejestracja'))
on conflict (kind) do nothing;

-- ---------------------------------------------------------------------------
-- Cleanup jobs
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('gta-cleanup-activity', '17 3 * * *',
  $$delete from public.activity where created_at < now() - interval '30 days'$$);
select cron.schedule('gta-cleanup-fast', '*/15 * * * *',
  $$delete from private.cell_events where at < now() - interval '1 hour';
    delete from private.rate_limits where window_start < now() - interval '2 hours'$$);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

grant execute on function private.my_org_id() to authenticated;
grant execute on function private.is_superadmin() to authenticated;
grant execute on function private.can_receive_topic(text) to anon, authenticated;
grant execute on function private.can_track_presence(text) to authenticated;

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
  public.set_org_public(boolean, int),
  public.admin_list_orgs(),
  public.admin_list_users(),
  public.admin_create_org(text, uuid),
  public.admin_set_owner(uuid, uuid),
  public.admin_delete_org(uuid),
  public.admin_move_user(uuid, uuid),
  public.admin_clear_map(uuid),
  public.admin_set_org_public(uuid, boolean, int),
  public.admin_set_superadmin(uuid, boolean),
  public.admin_set_activated(uuid, boolean),
  public.admin_get_access_paths(),
  public.admin_rotate_access_path(text)
to authenticated;

revoke execute on function
  public.svc_rate_limit(text, int, int),
  public.svc_check_register_key(text),
  public.svc_username_taken(text),
  public.svc_is_superadmin(uuid),
  public.svc_move_user(uuid, uuid)
from public, anon, authenticated;
grant execute on function
  public.svc_rate_limit(text, int, int),
  public.svc_check_register_key(text),
  public.svc_username_taken(text),
  public.svc_is_superadmin(uuid),
  public.svc_move_user(uuid, uuid)
to service_role;
