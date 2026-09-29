// Superadmin account management: create accounts, reset passwords, delete accounts.
// The caller's JWT is verified with Auth and the superadmin flag is checked in the database.
import { createActivatedUser, guard, json, readJson, serviceClient, USERNAME_RE, UUID_RE, validPassword } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const early = guard(req);
  if (early) return early;

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json(req, { error: 'not_allowed' }, 401);

  const db = serviceClient();
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) return json(req, { error: 'not_allowed' }, 401);
  const callerId = auth.user.id;

  const { data: isAdmin, error: adminError } = await db.rpc('svc_is_superadmin', { p_user: callerId });
  if (adminError) return json(req, { error: 'server_error' }, 500);
  if (!isAdmin) return json(req, { error: 'not_allowed' }, 403);

  const body = await readJson(req);
  const action = body?.action;

  if (action === 'create_user') {
    const username = body?.username;
    const password = body?.password;
    const orgId = body?.org_id ?? null;
    if (typeof username !== 'string' || !USERNAME_RE.test(username) || !validPassword(password)
        || (orgId !== null && (typeof orgId !== 'string' || !UUID_RE.test(orgId)))) {
      return json(req, { error: 'invalid_input' }, 400);
    }
    const result = await createActivatedUser(db, username, password);
    if ('error' in result) return json(req, { error: result.error }, result.error === 'username_taken' ? 409 : 500);
    if (orgId) {
      const { error: moveError } = await db.rpc('svc_move_user', { p_user: result.userId, p_org: orgId });
      if (moveError) return json(req, { error: 'not_found', user_id: result.userId }, 404);
    }
    return json(req, { ok: true, user_id: result.userId });
  }

  if (action === 'reset_password') {
    const userId = body?.user_id;
    const password = body?.password;
    if (typeof userId !== 'string' || !UUID_RE.test(userId) || !validPassword(password)) {
      return json(req, { error: 'invalid_input' }, 400);
    }
    const { error } = await db.auth.admin.updateUserById(userId, { password });
    if (error) return json(req, { error: 'not_found' }, 404);
    return json(req, { ok: true });
  }

  if (action === 'delete_user') {
    const userId = body?.user_id;
    if (typeof userId !== 'string' || !UUID_RE.test(userId)) return json(req, { error: 'invalid_input' }, 400);
    if (userId === callerId) return json(req, { error: 'not_allowed' }, 403);
    // Leave the org first so ownership is handed over (or an empty org removed).
    const { error: detachError } = await db.rpc('svc_move_user', { p_user: userId, p_org: null });
    if (detachError) return json(req, { error: 'not_found' }, 404);
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) return json(req, { error: 'server_error' }, 500);
    return json(req, { ok: true });
  }

  return json(req, { error: 'invalid_input' }, 400);
});
