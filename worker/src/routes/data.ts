/**
 * The per-account key/value sync the app pushes its state into.
 *
 * Same contract data.php had, so the client code that reads and writes it did
 * not need touching — but the access rule is enforced properly here. In the
 * PHP an account id arrived in the request and was largely taken at its word;
 * this checks it against the session on every call, so a client cannot read
 * another workspace's records by naming it.
 */
import { body, fail, json, ok } from '../lib/http';
import { canAccess, dataDelete, dataGet, dataList, dataPut, userFromToken, type Env } from '../lib/db';

interface DataBody {
  token?: string;
  action?: 'get' | 'put' | 'list' | 'delete';
  accountId?: string;
  key?: string;
  value?: string;
}

/** Keys are a bounded identifier, not free text — they index a primary key. */
const KEY_OK = /^[A-Za-z0-9_.\-:]{1,191}$/;
const ACCOUNT_OK = /^[A-Za-z0-9_.\-]{1,64}$/;

/* D1 rows are capped so one runaway client cannot fill the database. Generous
   for the app's own records, which are lists of contacts and campaigns. */
const MAX_VALUE_BYTES = 2 * 1024 * 1024;

export async function handleData(req: Request, env: Env): Promise<Response> {
  const d = await body<DataBody>(req);

  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const accountId = String(d.accountId ?? '').trim();
  if (!ACCOUNT_OK.test(accountId)) return fail('A valid account id is required.');
  if (!canAccess(user, accountId)) return fail('That workspace is not yours to read.', 403);

  switch (d.action) {
    case 'list':
      return json({ success: true, data: await dataList(env.DB, accountId) });

    case 'get': {
      const key = String(d.key ?? '');
      if (!KEY_OK.test(key)) return fail('A valid key is required.');
      return json({ success: true, value: await dataGet(env.DB, accountId, key) });
    }

    case 'put': {
      const key = String(d.key ?? '');
      if (!KEY_OK.test(key)) return fail('A valid key is required.');
      const value = String(d.value ?? '');
      if (new TextEncoder().encode(value).length > MAX_VALUE_BYTES) {
        return fail('That record is too large to store — it exceeds 2MB.');
      }
      await dataPut(env.DB, accountId, key, value);
      return ok();
    }

    case 'delete': {
      const key = String(d.key ?? '');
      if (!KEY_OK.test(key)) return fail('A valid key is required.');
      await dataDelete(env.DB, accountId, key);
      return ok();
    }

    default:
      return fail(`"${d.action ?? ''}" is not something this endpoint does.`);
  }
}
