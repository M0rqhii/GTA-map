-- Channel checks return an explicit false (never NULL) for users without an org and for anon.
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
    return coalesce(
      exists (select 1 from public.organizations o where o.id = v_org and o.channel_key = v_parts[3])
      and ((v_org = private.my_org_id()) is true or private.is_superadmin()),
      false);
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
  select coalesce(p_topic is not null and p_topic = private.org_topic(private.my_org_id()), false)
$$;

revoke execute on function private.can_receive_topic(text), private.can_track_presence(text) from public;
grant execute on function private.can_receive_topic(text) to anon, authenticated;
grant execute on function private.can_track_presence(text) to authenticated;
