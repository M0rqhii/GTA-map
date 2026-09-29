-- Auth writes app_metadata only after inserting the user row, so activation is proven with a
-- single-use token instead: edge functions issue it (service role) and pass it in user_metadata;
-- the new-user trigger consumes it and takes the username from the token, not from client data.

create table private.registration_tokens (
  token text primary key,
  username text not null,
  created_at timestamptz not null default now()
);
alter table private.registration_tokens enable row level security;
revoke all on private.registration_tokens from public, anon, authenticated;

create or replace function public.svc_issue_registration_token(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := private.random_string('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 32);
begin
  if p_username is null or p_username !~ '^[A-Za-z0-9_-]{3,20}$' then
    raise exception 'invalid_input';
  end if;
  delete from private.registration_tokens t where t.created_at < now() - interval '10 minutes';
  insert into private.registration_tokens (token, username) values (v_token, p_username);
  return v_token;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_token text := v_meta ->> 'reg_token';
  v_name text;
  v_base text;
  v_try int := 0;
begin
  if v_token is not null then
    delete from private.registration_tokens t
     where t.token = v_token and t.created_at > now() - interval '10 minutes'
    returning t.username into v_name;
  end if;

  if v_name is not null then
    insert into public.profiles (id, username, activated) values (new.id, v_name, true);
    return new;
  end if;

  -- Synthetic nick+password addresses can only be created through the edge functions.
  if lower(coalesce(new.email, '')) like '%@users.invalid' then
    raise exception 'signup_disabled';
  end if;

  -- Any other sign-up (e.g. Discord) gets an inactive profile with a derived nick.
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

  insert into public.profiles (id, username, activated) values (new.id, v_name, false);
  return new;
end;
$$;

revoke execute on function public.svc_issue_registration_token(text) from public, anon, authenticated;
grant execute on function public.svc_issue_registration_token(text) to service_role;
revoke execute on function private.handle_new_user() from public, anon, authenticated;
