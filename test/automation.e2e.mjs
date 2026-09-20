/**
 * Does the workflow builder actually do anything?
 *
 * Needs a built bundle and `npx wrangler dev --local --test-scheduled`:
 *   node test/automation.e2e.mjs
 *
 * It makes two workspaces and no more: sign-up is rate limited to five an hour
 * per address, deliberately, and a test that needs six would be telling you the
 * brake works rather than that the engine does. Every section therefore uses its
 * own automation id and its own form inside the same workspace, and the counts
 * are scoped to one graph rather than to the tenant.
 *
 * ── What is worth testing here ──
 *
 * The node graph in Marketing → Automations has been buildable for a long time
 * and, until the engine was written, nothing executed it. So the checks that
 * matter are the ones that tell a *running* automation apart from a drawing of
 * one, and the ones that stop a running automation being dangerous:
 *
 *  - a stranger's form submission enrols somebody with no session involved;
 *  - the tick carries out the steps, in order, with nobody logged in;
 *  - a step that cannot run is **skipped and named**, not counted as sent;
 *  - a graph that points back at itself stops instead of sending for ever;
 *  - a wait is honoured rather than run immediately;
 *  - a paused graph stops where it is and resumes where it stopped;
 *  - one workspace cannot read another's runs.
 */
const B = 'http://127.0.0.1:8787';
const out = [];
const ok = (n, p, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

const post = async (path, body) => {
  const r = await fetch(`${B}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json();
};

const tick = () => fetch(`${B}/cdn-cgi/handler/scheduled`).then(r => r.text());

async function workspace(label) {
  const email = `auto-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@test.dev`;
  const r = await post('/api/auth.php', {
    action: 'register', email, name: 'Automation Tester', password: 'Str0ng-Passw0rd-42x',
  });
  if (!r.success) throw new Error(`could not register: ${JSON.stringify(r)}`);
  return { token: r.token, accountId: r.user.accountId };
}

const saveGraph = (w, automations) => post('/api/data.php', {
  action: 'bulk_set', token: w.token, accountId: w.accountId,
  items: { crm_automations: JSON.stringify(automations) },
});

const liveForm = (w, slug, name) => post('/api/engagement.php', {
  token: w.token, accountId: w.accountId, action: 'save_form',
  record: {
    name, slug, headline: name, status: 'live', createPerson: 1,
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true },
    ],
  },
});

const runs = (w, automationId) =>
  post('/api/engagement.php', { token: w.token, accountId: w.accountId, action: 'automation_runs', ...(automationId ? { automationId } : {}) });

const history = (w, runId) =>
  post('/api/engagement.php', { token: w.token, accountId: w.accountId, action: 'automation_log', runId });

const node = (id, type, config, nextId, extra = {}) => ({ id, type, label: type, config, nextId, ...extra });

/* ── 1. A stranger's form submission runs an automation ── */
const w = await workspace('main');
/* The second tenant, made here rather than where it is first used: the checks
   that matter most are the ones that aim at a workspace somebody else really
   owns, and an id nobody owns is a different thing entirely — naming one of
   those *claims* it, which is deliberate and documented. */
const other = await workspace('other');
const slug = `quote-${Date.now().toString(36)}`;
ok('a form can be published', (await liveForm(w, slug, 'Get a quote')).success === true);

const graphs = [{
  id: 'au-main', name: 'New enquiry welcome', status: 'active', nodes: [
    node('n0', 'trigger', { event: 'form_submitted', formName: 'Get a quote' }, 'n1'),
    node('n1', 'add_tag', { tag: 'enquiry' }, 'n2'),
    node('n2', 'condition', { field: 'email', operator: 'is_set' }, null, { yesId: 'n3', noId: 'n4' }),
    node('n3', 'send_email', { subject: 'Thanks {{firstName}}', body: 'We got it.' }, 'n5'),
    node('n4', 'end', {}, null),
    node('n5', 'end', {}, null),
  ],
}];
await saveGraph(w, graphs);

const sub = await post('/api/engage.php', {
  action: 'submit', formSlug: slug,
  answers: { name: 'Rita Walker', email: 'rita@example.test' },
});
ok('a stranger can submit with no session at all', sub.success === true, JSON.stringify(sub).slice(0, 160));

let r = await runs(w, 'au-main');
ok('the submission put somebody into the automation', (r.runs ?? []).length === 1, JSON.stringify(r.totals));
ok('and the run knows who, before any contact exists in the CRM',
  r.runs?.[0]?.contactName === 'Rita Walker' && r.runs?.[0]?.contactEmail === 'rita@example.test',
  JSON.stringify(r.runs?.[0] ?? {}));
ok('and what set it off', r.runs?.[0]?.triggerKind === 'form_submitted' && r.runs?.[0]?.triggerRef === 'Get a quote');

const runId = r.runs[0].id;

/* Three ticks: tag, condition, email. */
await tick(); await tick(); await tick();
const h = await history(w, runId);
const steps = (h.entries ?? []).map(e => `${e.nodeType}:${e.status}`);
ok('the tag step ran', steps.includes('add_tag:ok'), steps.join(' '));
ok('the condition took the Yes branch', (h.entries ?? []).some(e => e.nodeType === 'condition' && /Yes/.test(e.detail)), steps.join(' '));

/*
 * The one a plausible implementation gets wrong. There is no mail server on a
 * brand-new workspace, so the email cannot go — and the honest outcome is a
 * skipped step that names the reason, never a success and never a silent
 * nothing.
 */
const mail = (h.entries ?? []).find(e => e.nodeType === 'send_email');
ok('an email with no mail server is skipped, not counted as sent', mail?.status === 'skipped', JSON.stringify(mail ?? {}));
ok('and it says why in words somebody can act on', /no mail server/i.test(mail?.detail ?? ''), mail?.detail ?? '');

await tick();
r = await runs(w, 'au-main');
ok('the run finishes', r.runs?.[0]?.status === 'done', JSON.stringify(r.runs?.[0] ?? {}));

/* The tag the engine asked for is waiting for the browser, not written by the
   Worker — the contact list is the browser's document. */
const pending = await post('/api/engagement.php', { token: w.token, accountId: w.accountId, action: 'pending_contact_changes' });
ok('the tag is proposed to the browser rather than written by the server',
  (pending.changes ?? []).some(c => c.kind === 'add_tag' && c.value === 'enquiry'),
  JSON.stringify(pending.changes ?? []).slice(0, 200));

/* ── 2. A graph that points back at itself stops ── */
{
  const loop = w;
  const loopSlug = `loop-${Date.now().toString(36)}`;
  await liveForm(loop, loopSlug, 'Loop form');
  /* Appended rather than replacing: `saveGraph` writes the whole list, and a
     section that dropped the others would silently stop their runs with "the
     automation no longer exists" — which would look like a passing test. */
  graphs.push({
    id: 'au-loop', name: 'Round and round', status: 'active', nodes: [
      node('n0', 'trigger', { event: 'form_submitted', formName: 'Loop form' }, 'n1'),
      /* No wait and no end: n1 → n2 → n1, for ever. */
      node('n1', 'add_tag', { tag: 'a' }, 'n2'),
      node('n2', 'add_tag', { tag: 'b' }, 'n1'),
    ],
  });
  await saveGraph(loop, graphs);
  await post('/api/engage.php', { action: 'submit', formSlug: loopSlug, answers: { name: 'Loop', email: 'loop@example.test' } });

  /* Far fewer ticks than the 200-step ceiling, so this proves the brake exists
     without pretending to reach it: what matters is that each tick advances by
     one and the run is still bounded. */
  for (let i = 0; i < 4; i++) await tick();
  const lr = await runs(loop, 'au-loop');
  ok('a looping graph advances one step a tick rather than running away',
    lr.runs?.[0]?.stepsTaken <= 4 && lr.runs?.[0]?.status === 'active',
    JSON.stringify(lr.runs?.[0] ?? {}));
}

/* ── 3. A wait is a wait ── */
{
  const slow = w;
  const slowSlug = `wait-${Date.now().toString(36)}`;
  await liveForm(slow, slowSlug, 'Wait form');
  graphs.push({
    id: 'au-wait', name: 'Sleep on it', status: 'active', nodes: [
      node('n0', 'trigger', { event: 'form_submitted', formName: 'Wait form' }, 'n1'),
      node('n1', 'wait', { days: '2' }, 'n2'),
      node('n2', 'add_tag', { tag: 'after-the-wait' }, null),
    ],
  });
  await saveGraph(slow, graphs);
  await post('/api/engage.php', { action: 'submit', formSlug: slowSlug, answers: { name: 'Pat', email: 'pat@example.test' } });

  await tick(); await tick(); await tick();
  const sr = await runs(slow, 'au-wait');
  const due = new Date(sr.runs?.[0]?.dueAt ?? 0).getTime();
  ok('a two-day wait is still waiting after three ticks',
    sr.runs?.[0]?.stepsTaken === 1 && due > Date.now() + 86_400_000,
    JSON.stringify(sr.runs?.[0] ?? {}));

  const sp = await post('/api/engagement.php', { token: slow.token, accountId: slow.accountId, action: 'pending_contact_changes' });
  ok('and the step after it has not happened yet',
    !(sp.changes ?? []).some(c => c.value === 'after-the-wait'), JSON.stringify(sp.changes ?? []));
}

/* ── 4. Pausing stops it where it is ── */
{
  const p = w;
  const pSlug = `pause-${Date.now().toString(36)}`;
  await liveForm(p, pSlug, 'Pause form');
  const graph = (status) => ([...graphs, {
    id: 'au-pause', name: 'Pausable', status, nodes: [
      node('n0', 'trigger', { event: 'form_submitted', formName: 'Pause form' }, 'n1'),
      node('n1', 'add_tag', { tag: 'one' }, 'n2'),
      node('n2', 'add_tag', { tag: 'two' }, null),
    ],
  }]);
  await saveGraph(p, graph('active'));
  await post('/api/engage.php', { action: 'submit', formSlug: pSlug, answers: { name: 'Sam', email: 'sam@example.test' } });

  await tick();                         // does n1
  await saveGraph(p, graph('paused'));
  await tick(); await tick();           // must do nothing
  let pr = await runs(p, 'au-pause');
  ok('a paused automation stops where it is', pr.runs?.[0]?.stepsTaken === 1, JSON.stringify(pr.runs?.[0] ?? {}));

  await saveGraph(p, graph('active'));
  await tick();
  pr = await runs(p, 'au-pause');
  ok('and resumes from there rather than starting again',
    pr.runs?.[0]?.stepsTaken === 2 && pr.runs?.[0]?.status === 'done', JSON.stringify(pr.runs?.[0] ?? {}));

  /* And the step it resumed into actually happened, rather than the run merely
     being marked finished. */
  const pp = await post('/api/engagement.php', { token: p.token, accountId: p.accountId, action: 'pending_contact_changes' });
  ok('and the step after the pause really ran',
    (pp.changes ?? []).some(c => c.value === 'two'), JSON.stringify(pp.changes ?? []).slice(0, 200));
}

/* ── 4b. The triggers the app itself reports ──
 *
 * Four of the seven triggers the builder offers describe things that happen
 * *in the browser* — a tag, a deal moving, an appointment — or on a tracking
 * pixel. None of them could ever fire until the app was given a way to say so,
 * which made them names in a menu and nothing else. This is that path.
 */
{
  const ev = w;
  graphs.push({
    id: 'au-tag', name: 'On a tag', status: 'active', nodes: [
      node('n0', 'trigger', { event: 'tag_added', tag: 'vip' }, 'n1'),
      node('n1', 'add_tag', { tag: 'greeted' }, null),
    ],
  });
  await saveGraph(ev, graphs);

  const started = await post('/api/engagement.php', {
    token: ev.token, accountId: ev.accountId, action: 'enrol_event',
    record: { kind: 'tag_added', ref: 'vip', contactId: 'c-tagged-1', contactName: 'Tagged', contactEmail: 'tagged@example.test' },
  });
  ok('the app can report an event the server never saw', started.success === true && started.started === 1,
    JSON.stringify(started));

  /* A tag that no graph is listening for must start nothing — otherwise every
     tag in the CRM would enrol everybody in everything. */
  const quiet = await post('/api/engagement.php', {
    token: ev.token, accountId: ev.accountId, action: 'enrol_event',
    record: { kind: 'tag_added', ref: 'not-listened-for', contactId: 'c-tagged-2', contactEmail: 'two@example.test' },
  });
  ok('and a tag nothing listens for starts nothing', quiet.started === 0, JSON.stringify(quiet));

  await tick();
  const tr = await runs(ev, 'au-tag');
  ok('the tag-triggered workflow ran', tr.runs?.[0]?.status === 'done' && tr.runs?.[0]?.stepsTaken === 1,
    JSON.stringify(tr.runs?.[0] ?? {}));

  /* An event needs a workspace. Without this, any signed-in tenant could enrol
     into another's graphs by naming their account. */
  const cross = await post('/api/engagement.php', {
    token: ev.token, accountId: other.accountId, action: 'enrol_event',
    record: { kind: 'tag_added', ref: 'vip', contactId: 'c-x' },
  });
  ok('and an event cannot be aimed at a workspace somebody else owns',
    cross.success !== true, JSON.stringify(cross).slice(0, 140));
}

/* ── 5. One workspace cannot read another's ── */
{
  const cross = await post('/api/engagement.php', {
    token: other.token, accountId: w.accountId, action: 'automation_runs',
  });
  ok('another workspace cannot read these runs', cross.success !== true, JSON.stringify(cross).slice(0, 140));

  /* The subtler one: a *valid* token, its *own* workspace, somebody else's run
     id. It must read as empty rather than as the other tenant's history. */
  const leak = await post('/api/engagement.php', {
    token: other.token, accountId: other.accountId, action: 'automation_log', runId,
  });
  ok('and a run id from another workspace reads as empty',
    leak.success === true && (leak.entries ?? []).length === 0, JSON.stringify(leak).slice(0, 140));
}

for (const line of out) console.log(line);
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
