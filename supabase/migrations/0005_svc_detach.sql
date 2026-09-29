-- svc_move_user accepts a null org (detach before deleting an account, handing over ownership).
create or replace function public.svc_move_user(p_user uuid, p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old uuid;
begin
  select p.org_id into v_old from public.profiles p where p.id = p_user;
  if not found then
    raise exception 'not_found';
  end if;
  if p_org is not null and not exists (select 1 from public.organizations o where o.id = p_org) then
    raise exception 'not_found';
  end if;
  if v_old is not null and v_old is distinct from p_org then
    perform private.log_activity(v_old, p_user, 'member_left', '{}'::jsonb);
  end if;
  perform private.set_member_org(p_user, p_org);
  if p_org is not null and v_old is distinct from p_org then
    perform private.log_activity(p_org, p_user, 'member_joined', '{}'::jsonb);
  end if;
end;
$$;

revoke execute on function public.svc_move_user(uuid, uuid) from public, anon, authenticated;
grant execute on function public.svc_move_user(uuid, uuid) to service_role;
