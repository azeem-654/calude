/**
 * /api/leaddir.php — the owner's lead directory (lib/leadDir.ts,
 * docs/LEAD-DIRECTORY.md).
 *
 * ── Who does what ──
 *
 * The install owner loads it: the browser reads a CSV or ZIP of any size
 * from the owner's own disk and sends it here 500 rows at a time
 * (`import_start` / `import_rows` / `import_finish`), so no upload limit
 * applies and an interrupted load resumes where it stopped. The owner also
 * removes people on request, undoes a load, and decides whether customers
 * may search it (`settings`) — which needs the owner to state they hold the
 * right to share the records, because whoever sold them a list usually
 * licensed it to them alone.
 *
 * Customers search it (`facets`, `search`) for free and see people with the
 * address and phone masked; `reveal` shows them in full and spends the
 * workspace's allowance (REVEAL_BUDGET), once per person. An ended trial
 * stops reveals — the directory is the owner's asset, like their keys.
 */
import { body, fail, json } from '../lib/http';
import { nowIso, userFromToken, workspaceAccess, type Env, type SessionUser } from '../lib/db';
import { trialForWorkspace } from '../lib/trial';
import {
  REVEAL_BUDGET, ROWS_PER_BATCH, ensureSchema, facetsOf, industriesLike, insertArgs, insertSql, key, maskEmail, maskPhone,
  normalise, placeWhere, roleTerms, titleTerms, type LeadIn,
} from '../lib/leadDir';

interface Req {
  token?: string;
  accountId?: string;
  action?: string;
  /* import */
  importId?: string;
  fileKey?: string;
  name?: string;
  label?: string;
  size?: number;
  rows?: LeadIn[];
  bytesDone?: number;
  seen?: number;
  bad?: number;
  /* settings */
  shared?: boolean;
  attest?: boolean;
  /* search */
  industry?: string;
  place?: string;
  title?: string;
  level?: string;
  size_?: string;
  companySize?: string;
  hasEmail?: boolean;
  after?: number;
  /* reveal / remove */
  ids?: number[];
  email?: string;
  id?: number;
}

const isOwner = (u: SessionUser) => u.role === 'agency' && !u.accountId;

const PAGE = 50;
const SHOWN = 'id, name, title, level, department, company, website, domain, email, phone, linkedin, industry, city, state, country, postal, size, revenue, founded, keywords, address, email_status, company_linkedin, social, codes, technologies, extra';

type Row = Record<string, string | number | boolean | null>;

async function meta(db: D1Database, k: string): Promise<string | null> {
  return (await db.prepare('SELECT v FROM ld_meta WHERE k = ?').bind(k).first<{ v: string }>())?.v ?? null;
}
const setMeta = (db: D1Database, k: string, v: string) =>
  db.prepare('INSERT INTO ld_meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, v);

async function settingsOf(db: D1Database) {
  return {
    shared: (await meta(db, 'shared')) === '1',
    label: (await meta(db, 'label')) || 'Lead directory',
    attestedAt: await meta(db, 'attested_at'),
    total: Number((await meta(db, 'total')) ?? 0),
  };
}

/** Facet rows as {value,label,n} for one kind, most-populated first. */
async function facetList(db: D1Database, kind: string, limit: number) {
  const r = await db.prepare('SELECT value, label, n FROM ld_facets WHERE kind = ? AND n > 0 ORDER BY n DESC LIMIT ?').bind(kind, limit).all<{ value: string; label: string; n: number }>();
  return r.results ?? [];
}

async function revealsUsed(db: D1Database, accountId: string) {
  const day = new Date(Date.now() - 86_400_000).toISOString();
  const month = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const r = await db.prepare('SELECT SUM(CASE WHEN at > ? THEN 1 ELSE 0 END) AS d, COUNT(*) AS m FROM ld_reveals WHERE account_id = ? AND at > ?')
    .bind(day, accountId, month).first<{ d: number | null; m: number }>();
  return { day: Number(r?.d ?? 0), month: Number(r?.m ?? 0) };
}

const hideValues = (extra: unknown): string => {
  try { return extra ? JSON.stringify(Object.fromEntries(Object.keys(JSON.parse(String(extra)) as Record<string, string>).map(k => [k, 'hidden']))) : ''; }
  catch { return ''; }
};

/** The person as a customer sees them before revealing: who and where, with the means of contact hidden. */
function masked(r: Row, revealed: boolean): Row {
  if (revealed) return { ...r, revealed: true };
  return {
    ...r, email: maskEmail(String(r.email ?? '')), phone: maskPhone(String(r.phone ?? '')),
    linkedin: r.linkedin ? 'hidden' : '', address: r.address ? 'hidden' : '', social: r.social ? 'hidden' : '',
    /* The file's other columns can hold a second address or a home phone:
       which columns there are is shown, not what is in them. */
    extra: hideValues(r.extra),
    revealed: false,
  };
}

export async function handleLeadDir(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  const owner = isOwner(user);
  const act = String(d.action ?? 'status');

  const db = env.LEADS;
  if (!db) {
    return fail(owner
      ? 'The lead directory has no database yet. The next deploy creates it (scripts/leads-db.mjs); if it still says this, the deploy log says why.'
      : 'The lead directory is not available yet.', 200, { code: 'no_database' });
  }
  await ensureSchema(db);

  /* ── The owner's side ─────────────────────────────────────────────── */

  if (act === 'admin') {
    if (!owner) return fail('Only the owner of this installation manages the lead directory.', 403, { code: 'not_owner' });
    const imports = await db.prepare('SELECT * FROM ld_imports ORDER BY started_at DESC LIMIT 25').all<Row>();
    return json({
      success: true, ...(await settingsOf(db)), imports: imports.results ?? [],
      industries: await facetList(db, 'industry', 12), states: await facetList(db, 'state', 12),
      removed: (await db.prepare('SELECT COUNT(*) AS n FROM ld_removed').first<{ n: number }>())?.n ?? 0,
      rowsPerBatch: ROWS_PER_BATCH, budget: REVEAL_BUDGET,
    });
  }

  if (['import_start', 'import_rows', 'import_finish', 'import_undo', 'settings', 'remove'].includes(act) && !owner) {
    return fail('Only the owner of this installation manages the lead directory.', 403, { code: 'not_owner' });
  }

  if (act === 'import_start') {
    const fileKey = String(d.fileKey ?? '').slice(0, 200);
    if (!fileKey) return fail('Choose a file first.', 200, { field: 'leaddir.file' });
    /* The same file again, unfinished: carry on from where it stopped. */
    const open = await db.prepare("SELECT * FROM ld_imports WHERE file_key = ? AND status IN ('running', 'paused', 'failed') ORDER BY started_at DESC LIMIT 1").bind(fileKey).first<Row>();
    if (open) {
      await db.prepare("UPDATE ld_imports SET status = 'running', error = NULL, updated_at = ? WHERE id = ?").bind(nowIso(), open.id).run();
      return json({ success: true, resumed: true, import: { ...open, status: 'running' } });
    }
    const id = `imp-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    const at = nowIso();
    await db.prepare(`INSERT INTO ld_imports (id, file_key, name, label, size, status, started_at, updated_at) VALUES (?, ?, ?, ?, ?, 'running', ?, ?)`)
      .bind(id, fileKey, String(d.name ?? '').slice(0, 200), String(d.label ?? '').slice(0, 120), Math.max(0, Number(d.size) || 0), at, at).run();
    return json({ success: true, resumed: false, import: await db.prepare('SELECT * FROM ld_imports WHERE id = ?').bind(id).first<Row>() });
  }

  if (act === 'import_rows') {
    const id = String(d.importId ?? '');
    const imp = await db.prepare('SELECT id, status FROM ld_imports WHERE id = ?').bind(id).first<{ id: string; status: string }>();
    if (!imp) return fail('That import is not known — start it again.', 200, { code: 'no_import' });
    const rows = Array.isArray(d.rows) ? d.rows : [];
    if (rows.length > ROWS_PER_BATCH) return fail(`At most ${ROWS_PER_BATCH} rows at a time.`);
    const at = nowIso();
    const leads = rows.map(r => normalise(r ?? {}));
    const good = leads.filter((l): l is NonNullable<typeof l> => !!l);
    let added = 0;
    const facetAdd = new Map<string, [string, string, string, number]>();
    try {
      if (good.length) {
        const res = await db.batch(good.map(l => db.prepare(insertSql).bind(...insertArgs(l, id, at))));
        res.forEach((r, i) => {
          if (!r.meta?.changes) return;
          added++;
          for (const [k, v, label] of facetsOf(good[i])) {
            const m = `${k}\u0000${v}`;
            const cur = facetAdd.get(m);
            if (cur) cur[3]++; else facetAdd.set(m, [k, v, label, 1]);
          }
        });
      }
      const counters = [...facetAdd.values()].map(([k, v, label, n]) =>
        db.prepare('INSERT INTO ld_facets (kind, value, label, n) VALUES (?, ?, ?, ?) ON CONFLICT(kind, value) DO UPDATE SET n = n + excluded.n').bind(k, v, label, n));
      await db.batch([
        ...counters,
        db.prepare("INSERT INTO ld_meta (k, v) VALUES ('total', ?) ON CONFLICT(k) DO UPDATE SET v = CAST(v AS INTEGER) + ?").bind(String(added), added),
        db.prepare(`UPDATE ld_imports SET rows_seen = rows_seen + ?, rows_added = rows_added + ?, rows_dup = rows_dup + ?, rows_bad = rows_bad + ?,
          bytes_done = MAX(bytes_done, ?), status = 'running', error = NULL, updated_at = ? WHERE id = ?`)
          .bind(rows.length + Math.max(0, Number(d.bad) || 0), added, good.length - added, rows.length - good.length + Math.max(0, Number(d.bad) || 0),
            Math.max(0, Number(d.bytesDone) || 0), at, id),
      ]);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      /* A full database is the one failure the owner must act on, so it is named. */
      const full = /SQLITE_FULL|database or disk is full|exceeded.*size|storage/i.test(msg);
      const error = full ? 'The directory database is full. On the Workers Paid plan a D1 database holds 10 GB; on the free plan 500 MB.' : msg.slice(0, 300);
      await db.prepare("UPDATE ld_imports SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").bind(error, at, id).run().catch(() => {});
      return fail(error, 200, { code: full ? 'full' : 'write_failed' });
    }
    return json({ success: true, added, duplicates: good.length - added, bad: rows.length - good.length });
  }

  if (act === 'import_finish') {
    const id = String(d.importId ?? '');
    const status = d.name === 'paused' ? 'paused' : 'done';
    await db.prepare('UPDATE ld_imports SET status = ?, bytes_done = MAX(bytes_done, ?), updated_at = ?, finished_at = CASE WHEN ? = \'done\' THEN ? ELSE finished_at END WHERE id = ?')
      .bind(status, Math.max(0, Number(d.bytesDone) || 0), nowIso(), status, nowIso(), id).run();
    return json({ success: true, import: await db.prepare('SELECT * FROM ld_imports WHERE id = ?').bind(id).first<Row>() });
  }

  /* Takes a load back out, 2,000 people a call, keeping the counts true. */
  if (act === 'import_undo') {
    const id = String(d.importId ?? '');
    const rows = await db.prepare('SELECT id, ind_k, industry, st_k, state, co_k, country, level, size FROM ld_people WHERE import_id = ? ORDER BY id LIMIT 2000').bind(id).all<Row>();
    const list = rows.results ?? [];
    if (list.length) {
      const dec = new Map<string, [string, string, number]>();
      for (const r of list) for (const [k, v] of facetsOf(r as never)) { const m = `${k}\u0000${v}`; const c = dec.get(m); if (c) c[2]++; else dec.set(m, [k, v, 1]); }
      await db.batch([
        ...[...dec.values()].map(([k, v, n]) => db.prepare('UPDATE ld_facets SET n = MAX(0, n - ?) WHERE kind = ? AND value = ?').bind(n, k, v)),
        db.prepare('DELETE FROM ld_people WHERE id IN (SELECT id FROM ld_people WHERE import_id = ? ORDER BY id LIMIT 2000)').bind(id),
        db.prepare("UPDATE ld_meta SET v = MAX(0, CAST(v AS INTEGER) - ?) WHERE k = 'total'").bind(list.length),
        db.prepare('UPDATE ld_imports SET rows_added = MAX(0, rows_added - ?), updated_at = ? WHERE id = ?').bind(list.length, nowIso(), id),
      ]);
    }
    const left = (await db.prepare('SELECT COUNT(*) AS n FROM (SELECT 1 FROM ld_people WHERE import_id = ? LIMIT 1)').bind(id).first<{ n: number }>())?.n ?? 0;
    if (!left) await db.prepare("UPDATE ld_imports SET status = 'undone', updated_at = ? WHERE id = ?").bind(nowIso(), id).run();
    return json({ success: true, removed: list.length, done: !left });
  }

  if (act === 'settings') {
    const ops: D1PreparedStatement[] = [];
    if (typeof d.label === 'string') ops.push(setMeta(db, 'label', d.label.trim().slice(0, 60) || 'Lead directory'));
    if (typeof d.shared === 'boolean') {
      if (d.shared && d.attest !== true && !(await meta(db, 'attested_at'))) {
        return fail('Tick the box to confirm you may share these records with your customers.', 200, { field: 'leaddir.attest' });
      }
      ops.push(setMeta(db, 'shared', d.shared ? '1' : '0'));
      if (d.shared && d.attest === true) ops.push(setMeta(db, 'attested_at', nowIso()));
    }
    if (ops.length) await db.batch(ops);
    return json({ success: true, ...(await settingsOf(db)) });
  }

  /* Somebody asked to be taken out: gone now, and kept out of later loads. */
  if (act === 'remove') {
    const email = String(d.email ?? '').trim().toLowerCase();
    const id = Number(d.id) || 0;
    if (!email && !id) return fail('Type the email address to remove.', 200, { field: 'leaddir.remove' });
    const r = await db.prepare('SELECT id, dedupe, ind_k, industry, st_k, state, co_k, country, level, size FROM ld_people WHERE ' + (id ? 'id = ?' : 'dedupe = ?')).bind(id || email).all<Row>();
    const list = r.results ?? [];
    const at = nowIso();
    const ops: D1PreparedStatement[] = [];
    if (email) ops.push(db.prepare('INSERT OR IGNORE INTO ld_removed (dedupe, at) VALUES (?, ?)').bind(email, at));
    for (const p of list) {
      ops.push(db.prepare('INSERT OR IGNORE INTO ld_removed (dedupe, at) VALUES (?, ?)').bind(p.dedupe, at));
      ops.push(db.prepare('DELETE FROM ld_people WHERE id = ?').bind(p.id));
      for (const [k, v] of facetsOf(p as never)) ops.push(db.prepare('UPDATE ld_facets SET n = MAX(0, n - 1) WHERE kind = ? AND value = ?').bind(k, v));
    }
    if (list.length) ops.push(db.prepare("UPDATE ld_meta SET v = MAX(0, CAST(v AS INTEGER) - ?) WHERE k = 'total'").bind(list.length));
    if (ops.length) await db.batch(ops);
    return json({ success: true, removed: list.length });
  }

  /* ── A customer's side (the owner may always look) ────────────────── */

  const accountId = String(d.accountId ?? '').trim();
  if (!accountId) return fail('A valid workspace is required.');
  const access = await workspaceAccess(env.DB, user, accountId);
  if (!access.ok) return fail(access.message ?? 'That workspace is not yours.', 403, { code: access.code });
  const s = await settingsOf(db);
  if (!owner && !s.shared) return fail('The lead directory is not open yet.', 200, { code: 'not_shared' });

  if (act === 'status' || act === 'facets') {
    const used = owner ? null : await revealsUsed(db, accountId);
    const trial = owner ? null : await trialForWorkspace(env, accountId).catch(() => null);
    return json({
      success: true, label: s.label, total: s.total, shared: s.shared,
      left: used ? { day: Math.max(0, REVEAL_BUDGET.day - used.day), month: Math.max(0, REVEAL_BUDGET.month - used.month) } : null,
      trialEnded: trial?.kind === 'ended',
      industries: await facetList(db, 'industry', 60), states: await facetList(db, 'state', 80),
      countries: await facetList(db, 'country', 30), levels: await facetList(db, 'level', 20), sizes: await facetList(db, 'size', 20),
    });
  }

  if (act === 'search') {
    const where: string[] = [];
    const args: (string | number)[] = [];
    const industry = String(d.industry ?? '').trim().slice(0, 80);
    const place = String(d.place ?? '').trim().slice(0, 80);
    /* Every search is narrowed by an industry or a place first: a job title
       alone would read the whole directory on every page. */
    if (!industry && !place) return fail('Say which industry, or where — then narrow by job title.', 200, { field: 'leaddir.industry' });
    if (industry) {
      const all = await db.prepare("SELECT value, n FROM ld_facets WHERE kind = 'industry' AND n > 0").all<{ value: string; n: number }>();
      const inds = industriesLike(industry, all.results ?? []);
      /* "business owners" or "CEOs" is not an industry but a role: read the
         words as job titles and seniority (the AI Prospecting box sends whatever
         was typed), and only then say nobody matches. */
      const roles = inds.length ? [] : roleTerms(industry);
      if (!inds.length && !roles.length) {
        return json({ success: true, people: [], total: 0, more: false, note: `Nobody in the directory is filed under an industry like "${industry}".`, field: 'leaddir.industry' });
      }
      if (inds.length) {
        where.push(`ind_k IN (${inds.map(() => '?').join(',')})`);
        args.push(...inds);
      } else {
        where.push(`(${roles.map(() => 'title_k LIKE ?').join(' OR ')} OR lower(level) IN (${roles.map(() => '?').join(',')}))`);
        args.push(...roles.map(t => `%${t}%`), ...roles);
      }
    }
    if (place) {
      const st = await db.prepare("SELECT value FROM ld_facets WHERE kind IN ('state', 'country') AND n > 0").all<{ value: string }>();
      const states = new Set<string>(), countries = new Set<string>();
      for (const r of st.results ?? []) { if (r.value.includes('|')) states.add(r.value.split('|')[1]); else countries.add(r.value); }
      const w = placeWhere(place, states, countries);
      if (w.sql) { where.push(w.sql); args.push(...w.args); }
    }
    const terms = titleTerms(String(d.title ?? '').slice(0, 80));
    if (terms.length) { where.push(`(${terms.map(() => 'title_k LIKE ?').join(' OR ')})`); args.push(...terms.map(t => `%${t}%`)); }
    const level = key(String(d.level ?? ''));
    if (level) { where.push('lower(level) = ?'); args.push(level); }
    const size = key(String(d.companySize ?? ''));
    if (size) { where.push('lower(size) = ?'); args.push(size); }
    if (d.hasEmail === true) where.push('has_email = 1');
    const cond = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const after = Math.max(0, Math.floor(Number(d.after) || 0));
    const page = await db.prepare(`SELECT ${SHOWN} FROM ld_people ${cond ? `${cond} AND` : 'WHERE'} id > ? ORDER BY id LIMIT ?`).bind(...args, after, PAGE + 1).all<Row>();
    const list = page.results ?? [];
    const more = list.length > PAGE;
    const shown = list.slice(0, PAGE);
    /* Counted to 5,000 at most: past that the exact number costs a scan and says nothing more. */
    const total = after ? null : (await db.prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM ld_people ${cond} LIMIT 5001)`).bind(...args).first<{ n: number }>())?.n ?? 0;
    let seen = new Set<number>();
    if (!owner && shown.length) {
      const r = await db.prepare(`SELECT person_id FROM ld_reveals WHERE account_id = ? AND person_id IN (${shown.map(() => '?').join(',')})`).bind(accountId, ...shown.map(p => p.id)).all<{ person_id: number }>();
      seen = new Set((r.results ?? []).map(x => x.person_id));
    }
    return json({
      success: true, people: shown.map(p => masked(p, owner || seen.has(Number(p.id)))), total, capped: total === 5001,
      more, after: shown.length ? Number(shown[shown.length - 1].id) : after, fetchedAt: nowIso(),
    });
  }

  if (act === 'reveal') {
    const ids = [...new Set((Array.isArray(d.ids) ? d.ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 50);
    if (!ids.length) return fail('Tick the people to show first.');
    const rows = await db.prepare(`SELECT ${SHOWN} FROM ld_people WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<Row>();
    const list = rows.results ?? [];
    if (owner) return json({ success: true, people: list.map(p => masked(p, true)), spent: 0 });
    if ((await trialForWorkspace(env, accountId).catch(() => null))?.kind === 'ended') {
      return fail('Your 7-day free trial has ended, so the lead directory has stopped showing contact details. Choose a plan under Plan & billing to carry on.', 402, { code: 'trial_ended' });
    }
    const already = await db.prepare(`SELECT person_id FROM ld_reveals WHERE account_id = ? AND person_id IN (${ids.map(() => '?').join(',')})`).bind(accountId, ...ids).all<{ person_id: number }>();
    const had = new Set((already.results ?? []).map(x => x.person_id));
    const fresh = list.filter(p => !had.has(Number(p.id)));
    const used = await revealsUsed(db, accountId);
    const room = Math.min(REVEAL_BUDGET.day - used.day, REVEAL_BUDGET.month - used.month);
    if (fresh.length > room) {
      return fail(room > 0
        ? `That is ${fresh.length} new people and your allowance has ${room} left today. Tick fewer, or come back tomorrow.`
        : `You have used today's allowance of ${REVEAL_BUDGET.day} contacts from the directory (${REVEAL_BUDGET.month} a month). It refills tomorrow.`, 429, { code: 'reveal_budget', left: Math.max(0, room) });
    }
    const at = nowIso();
    if (fresh.length) await db.batch(fresh.map(p => db.prepare('INSERT OR IGNORE INTO ld_reveals (account_id, person_id, at) VALUES (?, ?, ?)').bind(accountId, p.id, at)));
    const after = await revealsUsed(db, accountId);
    return json({
      success: true, people: list.map(p => masked(p, true)), spent: fresh.length,
      left: { day: Math.max(0, REVEAL_BUDGET.day - after.day), month: Math.max(0, REVEAL_BUDGET.month - after.month) },
    });
  }

  return fail('Unknown action.');
}
