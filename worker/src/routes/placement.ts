/**
 * Inbox placement testing.
 *
 * Every other number in the deliverability module describes what the *sending*
 * server did. This one answers the question that actually decides whether a
 * campaign worked: when the message reached Gmail or Outlook, did it land in
 * the inbox or in the junk folder? The only way to know is to look inside a
 * mailbox, so the seed mailbox credentials live here — encrypted at rest, and
 * never returned to the browser.
 *
 * POST JSON { action, token, ... }:
 *   capabilities                 → whether placement can be detected from here
 *   seed_list                    → the configured seeds, without their passwords
 *   seed_set  { id, email, host, port, encryption, username, password }   (agency only)
 *   seed_remove { id }                                                    (agency only)
 *   check     { id, marker }     → 'inbox' | 'spam' | 'missing'
 *
 * The PHP this replaces kept one set of seeds for the whole install, so every
 * agency user on the host shared — and could overwrite — the same mailboxes.
 * Here a seed belongs to the account that created it.
 */
import { addr, body, fail, json, ok } from '../lib/http';
import { installSecret, nowIso, userFromToken, type Env } from '../lib/db';
import { decryptSecret, encryptSecret } from '../lib/crypto';
import { imapFindMarker } from '../lib/imap';
import type { Encryption } from '../lib/smtp';

const SECRET_KEY = 'mailbox_key';   // the same install secret the mailboxes use
const HOST_OK = /^[a-z0-9.\-]+\.[a-z]{2,}$/i;
const ID_OK = /^[A-Za-z0-9_\-]{1,64}$/;

interface SeedRow {
  owner_email: string;
  id: string;
  email: string;
  host: string;
  port: number;
  encryption: string;
  username: string;
  password: string;
}

interface PlacementBody {
  token?: string;
  action?: string;
  id?: string;
  marker?: string;
  email?: string;
  host?: string;
  port?: number;
  encryption?: string;
  username?: string;
  password?: string;
}

const encOf = (v: unknown): Encryption => (v === 'tls' ? 'tls' : v === 'none' ? 'none' : 'ssl');

/** What the settings screen may see: everything except the password itself. */
function redact(row: SeedRow): Record<string, unknown> {
  return {
    id: row.id,
    email: row.email,
    host: row.host,
    port: row.port,
    encryption: row.encryption,
    username: row.username,
    hasPassword: !!row.password,
  };
}

export async function handlePlacement(req: Request, env: Env): Promise<Response> {
  const d = await body<PlacementBody>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this action needs a current session.', 401, { code: 'unauthorised' });

  const owner = user.email;
  const action = String(d.action ?? '');

  const seeds = async (): Promise<SeedRow[]> => {
    const r = await env.DB.prepare(
      'SELECT * FROM crm_placement_seeds WHERE owner_email = ? ORDER BY email',
    ).bind(owner).all<SeedRow>();
    return r.results ?? [];
  };

  if (action === 'capabilities') {
    const rows = await seeds();
    return json({
      success: true,
      /* Workers open IMAP over a raw socket, so unlike the shared host this
         replaces there is no extension that might be missing. */
      imap: true,
      seeds: rows.length,
      message: rows.length
        ? 'Placement is detected automatically: each seed mailbox is opened over IMAP and searched for the test message.'
        : 'Add a seed mailbox to detect placement automatically. Until then placement has to be recorded by hand.',
    });
  }

  if (action === 'seed_list') {
    return json({ success: true, imap: true, seeds: (await seeds()).map(redact) });
  }

  if (action === 'seed_set') {
    if (user.role !== 'agency') return fail('Only an agency user can store mailbox credentials.');

    const id = String(d.id ?? '').trim();
    if (!ID_OK.test(id)) return fail('A seed id is required.');

    const email = addr(d.email);
    if (!email) return fail('Enter the seed mailbox address.');

    const host = String(d.host ?? '').trim();
    if (!HOST_OK.test(host)) return fail('Enter a valid IMAP host, e.g. imap.gmail.com.');

    const port = Number(d.port) || 993;
    if (!Number.isInteger(port) || port < 1 || port > 65535) return fail('That port is not valid.');

    const encryption = encOf(d.encryption);
    const username = String(d.username ?? '').trim() || email;
    const key = await installSecret(env.DB, SECRET_KEY);

    /* An empty password on an existing seed means "leave it as it was", so the
       form never has to echo a stored secret back to the browser to save an
       unrelated field. */
    let stored = '';
    const raw = String(d.password ?? '');
    if (raw) {
      stored = await encryptSecret(key, raw);
    } else {
      const prev = await env.DB.prepare(
        'SELECT password FROM crm_placement_seeds WHERE owner_email = ? AND id = ?',
      ).bind(owner, id).first<{ password: string }>();
      stored = prev?.password ?? '';
      if (!stored) return fail('An app password is required to read the mailbox.');
    }

    await env.DB.prepare(
      `INSERT INTO crm_placement_seeds (owner_email, id, email, host, port, encryption, username, password, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(owner_email, id) DO UPDATE SET
         email = excluded.email, host = excluded.host, port = excluded.port,
         encryption = excluded.encryption, username = excluded.username,
         password = excluded.password, updated_at = excluded.updated_at`,
    ).bind(owner, id, email, host, port, encryption, username, stored, nowIso()).run();

    return json({
      success: true,
      seed: redact({ owner_email: owner, id, email, host, port, encryption, username, password: stored }),
    });
  }

  if (action === 'seed_remove') {
    if (user.role !== 'agency') return fail('Only an agency user can remove mailbox credentials.');
    await env.DB.prepare('DELETE FROM crm_placement_seeds WHERE owner_email = ? AND id = ?')
      .bind(owner, String(d.id ?? '')).run();
    return ok();
  }

  if (action === 'check') {
    const marker = String(d.marker ?? '').trim();
    /* The marker is what the search matches on. Too short and it would match
       unrelated mail, reporting a delivery that never happened. */
    if (marker.length < 6) return fail('A placement marker is required.');

    const row = await env.DB.prepare(
      'SELECT * FROM crm_placement_seeds WHERE owner_email = ? AND id = ?',
    ).bind(owner, String(d.id ?? '')).first<SeedRow>();
    if (!row) return fail('That seed mailbox is not configured.');

    const key = await installSecret(env.DB, SECRET_KEY);
    const password = await decryptSecret(key, row.password);
    if (!password) {
      return fail('The saved password for that mailbox could not be read back. Enter it again.');
    }

    const r = await imapFindMarker(
      {
        host: row.host,
        port: row.port,
        encryption: encOf(row.encryption),
        username: row.username,
        password,
        folder: 'INBOX',
      },
      marker,
    );

    /* Not signing in is a different answer from not finding the message, and
       conflating them would report a perfectly delivered campaign as missing. */
    if (!r.ok) return fail(r.error, 200, { code: r.connectFailed ? 'connect_failed' : 'check_failed' });

    return json({
      success: true,
      placement: r.placement,
      folder: r.folder,
      searched: r.searched,
      ...(r.placement === 'missing'
        ? { note: 'The message was not in the inbox or any junk folder. It may still be in transit, or it may have been rejected outright.' }
        : {}),
    });
  }

  return fail(`"${action}" is not something this endpoint does.`);
}
