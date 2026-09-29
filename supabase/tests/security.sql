-- GTA Map security test suite. Run as postgres (e.g. Supabase SQL editor or MCP execute_sql).
-- Everything runs inside one DO block that always ends by raising an exception, so all fixtures
-- are rolled back. Success is reported as: ERROR: ALL SECURITY TESTS PASSED
-- Any failure is reported as: ERROR: FAIL <label> ...
do $test$
declare
  A uuid := 'aaaaaaaa-0000-4000-8000-000000000001'; -- owner of org1
  B uuid := 'bbbbbbbb-0000-4000-8000-000000000002'; -- member of org1
  C uuid := 'cccccccc-0000-4000-8000-000000000003'; -- owner of org2 (outsider for org1)
  D uuid := 'dddddddd-0000-4000-8000-000000000004'; -- no org
  S uuid := 'eeeeeeee-0000-4000-8000-000000000005'; -- superadmin, no org
  N uuid := 'ffffffff-0000-4000-8000-000000000006'; -- inactive (e.g. Discord outside the register link)
  v_org1 uuid;
  v_org2 uuid;
  v_code1 text;
  v_json jsonb;
  v_pin_a uuid;
  v_pin_b uuid;
  v_topic_old text;
  v_topic_new text;
  v_register_key text;
begin
  -- ---------------------------------------------------------------- helpers
  create schema sec_test;
  create function sec_test.as_user(p uuid) returns void language plpgsql as $f$
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end $f$;
  create function sec_test.as_anon() returns void language plpgsql as $f$
  begin
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
  end $f$;
  create function sec_test.as_admin() returns void language plpgsql as $f$
  begin
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
  end $f$;
  create function sec_test.expect_error(p_sql text, p_expected text, p_label text) returns void language plpgsql as $f$
  begin
    begin
      execute p_sql;
    exception when others then
      if sqlerrm = p_expected or sqlstate = p_expected then
        return;
      end if;
      raise exception 'FAIL %: expected %, got % (%)', p_label, p_expected, sqlerrm, sqlstate;
    end;
    raise exception 'FAIL %: expected error %, but it succeeded', p_label, p_expected;
  end $f$;
  create function sec_test."check"(p boolean, p_label text) returns void language plpgsql as $f$
  begin
    if p is not true then
      raise exception 'FAIL %', p_label;
    end if;
  end $f$;
  grant usage on schema sec_test to anon, authenticated;
  grant execute on all functions in schema sec_test to public;

  -- ---------------------------------------------------------------- fixtures
  insert into private.registration_tokens (token, username)
  values ('tok_a', 'sec_a'), ('tok_b', 'sec_b'), ('tok_c', 'sec_c'), ('tok_d', 'sec_d'), ('tok_s', 'sec_s');
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', A, 'authenticated', 'authenticated', 'sec_a@users.invalid', '{"provider":"email"}', '{"reg_token":"tok_a"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', B, 'authenticated', 'authenticated', 'sec_b@users.invalid', '{"provider":"email"}', '{"reg_token":"tok_b"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', C, 'authenticated', 'authenticated', 'sec_c@users.invalid', '{"provider":"email"}', '{"reg_token":"tok_c"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', D, 'authenticated', 'authenticated', 'sec_d@users.invalid', '{"provider":"email"}', '{"reg_token":"tok_d"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', S, 'authenticated', 'authenticated', 'sec_s@users.invalid', '{"provider":"email"}', '{"reg_token":"tok_s"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', N, 'authenticated', 'authenticated', 'sec_n@example.com', '{"provider":"discord"}', '{"full_name":"Sec Nobody <b>"}', now(), now());
  update public.profiles set is_superadmin = true where id = S;
  perform sec_test."check"((select activated from public.profiles where id = A), 'fixture: token account is activated');
  perform sec_test."check"((select not activated from public.profiles where id = N), 'fixture: other sign-ups are inactive');
  perform sec_test."check"((select username from public.profiles where id = N) = 'SecNobodyb', 'fixture: derived nick is sanitized');
  perform sec_test.expect_error($q$
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
            'forged@users.invalid', '{}', '{"reg_token":"guess","username":"forged"}', now(), now())$q$,
    'signup_disabled', '0 forged token / synthetic e-mail sign-up');
  perform sec_test.expect_error($q$
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
            'replay@users.invalid', '{}', '{"reg_token":"tok_a"}', now(), now())$q$,
    'signup_disabled', '0 registration token cannot be reused');

  perform sec_test.as_user(A);
  v_org1 := public.create_org('Sec Org One');
  perform public.set_color('#fc9292');
  perform sec_test.as_admin();
  select invite_code into v_code1 from public.organizations where id = v_org1;
  v_topic_old := private.org_topic(v_org1);
  select path into v_register_key from private.access_paths where kind = 'register';

  perform sec_test.as_user(B);
  perform sec_test."check"(public.join_org(lower(v_code1)) = 'ok', 'setup: B joins org1 with a lowercase code');
  perform public.set_color('#fcb292');

  perform sec_test.as_user(C);
  v_org2 := public.create_org('Sec Org Two');
  perform public.set_color('#fc9292');

  perform sec_test.as_user(D);
  perform sec_test.expect_error($q$select public.create_org('  SEC ORG ONE ')$q$, 'name_taken', 'org names are case-insensitive');

  -- ---------------------------------------------------------------- cells (1, 2)
  perform sec_test.as_user(A);
  v_json := public.mark_cells(array[5, 5, 6, 6]::smallint[]);
  perform sec_test."check"(jsonb_array_length(v_json) = 2, 'A marks two cells');
  perform sec_test.expect_error($q$select public.mark_cells(array[81, 0]::smallint[])$q$, 'invalid_input', 'cell outside the grid');
  perform sec_test.expect_error($q$select public.mark_cells(array[1]::smallint[])$q$, 'invalid_input', 'odd coordinate array');

  perform sec_test.as_user(B);
  perform sec_test."check"(jsonb_array_length(public.unmark_cells(array[5, 5]::smallint[])) = 0, '1 B cannot unmark A''s cell');
  perform sec_test."check"(jsonb_array_length(public.mark_cells(array[5, 5, 7, 7]::smallint[])) = 1, '2 B cannot take A''s cell');
  perform sec_test."check"((select user_id from public.cells where org_id = v_org1 and x = 5 and y = 5) = A, '1/2 cell still belongs to A');

  -- ---------------------------------------------------------------- other org (3)
  perform sec_test.as_user(C);
  perform sec_test."check"((select count(*) from public.cells where org_id = v_org1) = 0, '3 C cannot read org1 cells');
  perform sec_test."check"((select count(*) from public.profiles where org_id = v_org1) = 0, '3 C cannot read org1 members');
  perform sec_test."check"((select count(*) from public.organizations where id = v_org1) = 0, '3 C cannot read org1');
  perform sec_test."check"((select count(*) from public.activity where org_id = v_org1) = 0, '3 C cannot read org1 history');
  perform sec_test."check"((select count(*) from public.pins where org_id = v_org1) = 0, '3 C cannot read org1 pins');
  perform sec_test.expect_error(format('select public.get_org_cells(%L)', v_org1), 'not_allowed', '3 C get_org_cells(org1)');

  -- ---------------------------------------------------------------- direct writes and hidden columns (4, 5)
  perform sec_test.as_user(A);
  perform sec_test.expect_error($q$update public.profiles set is_superadmin = true where id = auth.uid()$q$, '42501', '4 cannot make self superadmin');
  perform sec_test.expect_error($q$update public.profiles set activated = true where id = auth.uid()$q$, '42501', '4 cannot self-activate');
  perform sec_test.expect_error(format('update public.profiles set org_id = %L where id = auth.uid()', v_org2), '42501', '4 cannot change own org');
  perform sec_test.expect_error(format('insert into public.cells (org_id, x, y, user_id) values (%L, 1, 1, %L)', v_org1, A), '42501', '4 no direct cell insert');
  perform sec_test.expect_error($q$delete from public.cells$q$, '42501', '4 no direct cell delete');
  perform sec_test.expect_error($q$update public.organizations set owner_id = auth.uid()$q$, '42501', '4 no direct org update');
  perform sec_test.expect_error($q$insert into public.activity (org_id, kind) select id, 'fake' from public.organizations$q$, '42501', '4 cannot forge history');
  perform sec_test.expect_error($q$select is_superadmin from public.profiles$q$, '42501', '5 is_superadmin hidden');
  perform sec_test.expect_error($q$select activated from public.profiles$q$, '42501', '5 activated hidden');
  perform sec_test.expect_error($q$select invite_code from public.organizations$q$, '42501', '5 invite_code hidden');
  perform sec_test.expect_error($q$select * from private.access_paths$q$, '42501', '5 access paths hidden');
  perform sec_test.expect_error($q$select * from private.registration_tokens$q$, '42501', '5 registration tokens hidden');
  perform sec_test.expect_error($q$select public.svc_check_register_key('x')$q$, '42501', '5 service functions blocked');
  perform sec_test.expect_error($q$select public.admin_list_users()$q$, 'not_allowed', '12 member cannot use admin RPCs');
  perform sec_test.expect_error($q$select public.admin_rotate_access_path('login')$q$, 'not_allowed', '12 member cannot rotate links');

  -- ---------------------------------------------------------------- inactive account (6)
  perform sec_test.as_user(N);
  perform sec_test.expect_error($q$select public.create_org('Nobody Org')$q$, 'not_allowed', '6 inactive cannot create org');
  perform sec_test.expect_error(format('select public.join_org(%L)', v_code1), 'not_allowed', '6 inactive cannot join');
  perform sec_test."check"((select count(*) from public.organizations) = 0, '6 inactive reads no orgs');
  perform sec_test."check"(public.activate_account('wrong-key') = false, '6 wrong activation key rejected');

  -- ---------------------------------------------------------------- anonymous viewer (7, 13)
  perform sec_test.as_anon();
  perform sec_test.expect_error($q$select count(*) from public.cells$q$, '42501', '7 anon cannot read cells');
  perform sec_test.expect_error($q$select count(*) from public.profiles$q$, '42501', '7 anon cannot read profiles');
  perform sec_test.expect_error($q$select count(*) from public.organizations$q$, '42501', '7 anon cannot read orgs');
  perform sec_test.expect_error($q$select public.create_org('x')$q$, '42501', '7 anon cannot call member RPCs');
  perform sec_test.expect_error($q$select public.admin_get_access_paths()$q$, '42501', '7 anon cannot call admin RPCs');
  perform sec_test."check"(public.resolve_access_path('login') is null, '7 guessing a path fails');
  perform sec_test."check"(public.resolve_access_path(v_register_key) = 'register', '7 register path resolves');
  perform sec_test."check"(public.public_get_cells(v_org1) is null, '7 private org is hidden');
  perform sec_test."check"((select count(*) from public.public_list_orgs()) = 0, '7 no public orgs listed');
  perform sec_test."check"(not private.can_receive_topic('pub:' || v_org1), '13 anon cannot join pub topic of private org');
  perform sec_test."check"(not private.can_receive_topic(v_topic_old), '13 anon cannot join org topic');

  perform sec_test.as_user(A);
  perform public.set_org_public(true, 0);
  perform sec_test.as_anon();
  v_json := public.public_get_cells(v_org1);
  perform sec_test."check"(jsonb_typeof(v_json) = 'array' and jsonb_array_length(v_json) = 6, '7 public view has the 3 cells');
  perform sec_test."check"(not exists (select 1 from jsonb_array_elements(v_json) e where jsonb_typeof(e) <> 'number'), '7 public view has bare numbers only');
  perform sec_test."check"((select count(*) from public.public_list_orgs()) = 1, '7 public org listed');
  perform sec_test."check"(private.can_receive_topic('pub:' || v_org1), '13 anon may join live pub topic');
  perform sec_test."check"(not private.can_receive_topic(v_topic_old), '13 anon still cannot join org topic');

  -- ---------------------------------------------------------------- delayed public view (8)
  perform sec_test.as_user(A);
  perform public.mark_cells(array[3, 3]::smallint[]);
  perform sec_test.as_admin();
  update private.cell_events set at = now() - interval '20 minutes' where org_id = v_org1 and x = 3 and y = 3;
  perform sec_test.as_user(A);
  perform public.set_org_public(true, 15);
  perform sec_test.as_anon();
  perform sec_test."check"(public.public_get_cells(v_org1) = '[3, 3]'::jsonb, '8 delayed view shows only the old cell');
  perform sec_test."check"(not private.can_receive_topic('pub:' || v_org1), '8 no live channel while delayed');

  -- ---------------------------------------------------------------- invite code guessing (9)
  perform sec_test.as_user(D);
  for i in 1 .. 10 loop
    perform sec_test."check"(public.join_org('ZZZZZZ') = 'invalid_code', '9 wrong code');
  end loop;
  perform sec_test.expect_error($q$select public.join_org('ZZZZZZ')$q$, 'rate_limited', '9 join attempts are rate limited');

  -- ---------------------------------------------------------------- pins (10, 11)
  perform sec_test.as_user(A);
  v_pin_a := public.add_pin(4000, 4000, 'found', '<img src=x onerror=alert(1)>');
  perform sec_test."check"((select body from public.pins where id = v_pin_a) = '<img src=x onerror=alert(1)>', '10 pin text stored verbatim');
  perform sec_test.expect_error(format('select public.add_pin(1, 1, %L, %L)', 'note', repeat('x', 301)), 'invalid_input', '10 pin text too long');
  perform sec_test.expect_error($q$select public.add_pin(1, 1, 'bomb', 'x')$q$, 'invalid_input', '10 unknown pin icon');
  perform sec_test.expect_error($q$select public.add_pin(9000, 1, 'note', 'x')$q$, 'invalid_input', '10 pin outside the map');
  perform sec_test.expect_error(format('select public.add_pin(1, 1, %L, %L)', 'note', 'a' || chr(7) || 'b'), 'invalid_input', '10 control characters');

  perform sec_test.as_user(B);
  v_pin_b := public.add_pin(4100, 4100, 'note', 'B pin');
  perform sec_test.expect_error(format('select public.delete_pin(%L)', v_pin_a), 'not_allowed', '11 member cannot delete others'' pins');
  perform sec_test.expect_error(format('select public.update_pin(%L, %L, %L)', v_pin_a, 'note', 'hacked'), 'not_allowed', '11 member cannot edit others'' pins');
  perform sec_test.expect_error($q$select public.clear_map()$q$, 'not_allowed', '11 member cannot clear the map');
  perform sec_test.expect_error(format('select public.kick_member(%L)', A), 'not_allowed', '11 member cannot kick');
  perform sec_test.expect_error($q$select public.set_org_public(false, 0)$q$, 'not_allowed', '11 member cannot change visibility');
  perform sec_test.expect_error($q$select public.regenerate_invite()$q$, 'not_allowed', '11 member cannot regenerate invite');
  perform sec_test.expect_error(format('select public.get_invite_code(%L)', v_org1), 'not_allowed', '11 member cannot read invite code');

  perform sec_test.as_user(C);
  perform sec_test.expect_error(format('select public.kick_member(%L)', B), 'not_allowed', '11 other owner cannot kick B');
  perform sec_test.expect_error(format('select public.delete_pin(%L)', v_pin_a), 'not_allowed', '11 other org cannot delete pin');

  perform sec_test.as_user(A);
  perform public.delete_pin(v_pin_b);
  perform sec_test."check"(not exists (select 1 from public.pins where id = v_pin_b), '11 owner can delete any pin');
  perform sec_test."check"(public.get_invite_code(v_org1) = v_code1, '11 owner reads invite code');

  -- ---------------------------------------------------------------- superadmin (12, 13)
  perform sec_test.as_user(S);
  perform sec_test."check"((select count(*) from public.admin_list_users()) >= 6, '12 superadmin lists users');
  perform sec_test."check"((select count(*) from public.cells where org_id = v_org1) = 4, '12 superadmin reads org1 cells');
  perform sec_test."check"(private.can_receive_topic(v_topic_old), '13 superadmin may watch org1');
  perform sec_test."check"(not private.can_track_presence(v_topic_old), '13 superadmin is not tracked as online');
  perform sec_test."check"((select count(*) from public.admin_get_access_paths()) = 2, '12 superadmin reads access paths');
  perform sec_test.expect_error(format('select public.admin_set_superadmin(%L, false)', S), 'not_allowed', '12 superadmin cannot demote self');
  perform sec_test.expect_error($q$select public.mark_cells(array[1, 1]::smallint[])$q$, 'not_allowed', '12 superadmin cannot mark in foreign org');

  perform sec_test.as_user(B);
  perform sec_test."check"(private.can_receive_topic(v_topic_old), '13 member may join org topic');
  perform sec_test."check"(private.can_track_presence(v_topic_old), '13 member may track presence');
  perform sec_test.as_user(C);
  perform sec_test."check"(not private.can_receive_topic(v_topic_old), '13 outsider cannot join org topic');
  perform sec_test."check"(not private.can_track_presence(v_topic_old), '13 outsider cannot track presence');
  perform sec_test."check"(not private.can_receive_topic('org:' || v_org1 || ':guess'), '13 wrong channel key');

  -- ---------------------------------------------------------------- colors (14)
  perform sec_test.as_user(A);
  perform sec_test.expect_error($q$select public.set_color('#fcb292')$q$, 'color_taken', '14 color taken in the same org');
  perform sec_test.expect_error($q$select public.set_color('#123456')$q$, 'invalid_input', '14 color outside the palette');

  -- ---------------------------------------------------------------- kick rotates the channel (16)
  perform public.kick_member(B);
  perform sec_test.as_admin();
  v_topic_new := private.org_topic(v_org1);
  perform sec_test."check"(v_topic_new <> v_topic_old, '16 kick rotates the channel key');
  perform sec_test."check"(not exists (select 1 from public.cells where org_id = v_org1 and user_id = B), '16 kicked member''s cells removed');
  perform sec_test.as_user(B);
  perform sec_test."check"(not private.can_receive_topic(v_topic_new), '16 kicked member cannot join the new topic');
  perform sec_test."check"(not private.can_receive_topic(v_topic_old), '16 old topic is dead');
  perform sec_test."check"((select org_id from public.get_me()) is null, '16 kicked member has no org');

  -- ---------------------------------------------------------------- owner leaves (15)
  perform sec_test."check"(public.join_org(v_code1) = 'ok', '15 B rejoins');
  perform sec_test.as_user(A);
  perform public.leave_org();
  perform sec_test.as_admin();
  perform sec_test."check"((select owner_id from public.organizations where id = v_org1) = B, '15 ownership passes to B');
  perform sec_test.as_user(C);
  perform public.leave_org();
  perform sec_test.as_admin();
  perform sec_test."check"(not exists (select 1 from public.organizations where id = v_org2), '15 empty org is deleted');

  -- ---------------------------------------------------------------- activation with the register key (6)
  perform sec_test.as_user(N);
  perform sec_test."check"(public.activate_account(v_register_key), '6 activation with the register key');
  perform sec_test.as_admin();
  perform sec_test."check"((select activated from public.profiles where id = N), '6 account activated');

  raise exception 'ALL SECURITY TESTS PASSED';
end
$test$;
