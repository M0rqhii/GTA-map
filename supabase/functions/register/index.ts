// Public registration: requires the hidden register-link key. Creates an activated account with a
// synthetic e-mail (<nick>@users.invalid) so users only ever see nick + password.
import { createActivatedUser, guard, json, readJson, serviceClient, USERNAME_RE, validPassword } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const early = guard(req);
  if (early) return early;

  const body = await readJson(req);
  const key = body?.key;
  const username = body?.username;
  const password = body?.password;
  if (typeof key !== 'string' || key.length === 0 || key.length > 100
      || typeof username !== 'string' || !USERNAME_RE.test(username) || !validPassword(password)) {
    return json(req, { error: 'invalid_input' }, 400);
  }

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const db = serviceClient();

  const { data: allowed, error: limitError } = await db.rpc('svc_rate_limit', {
    p_bucket: `register:${ip}`, p_max: 5, p_window_seconds: 3600,
  });
  if (limitError) return json(req, { error: 'server_error' }, 500);
  if (!allowed) return json(req, { error: 'rate_limited' }, 429);

  const { data: keyOk, error: keyError } = await db.rpc('svc_check_register_key', { p_key: key });
  if (keyError) return json(req, { error: 'server_error' }, 500);
  if (!keyOk) return json(req, { error: 'not_found' }, 404);

  const result = await createActivatedUser(db, username, password);
  if ('error' in result) return json(req, { error: result.error }, result.error === 'username_taken' ? 409 : 500);
  return json(req, { ok: true });
});
