/**
 * Records the home page's module demos from the real app, in dark mode.
 *
 *   VITE_BASE=/ npm run build
 *   npx tsx scripts/site-clips.mts                  # every clip in clips.ts
 *   npx tsx scripts/site-clips.mts clip-contacts    # just the ones named
 *
 * ── The workspace ──
 *
 * The same busy sample agency the site's stills are taken against: it starts
 * `scripts/site-reels.mts` with HOLD=1 (its own wrangler on :8797, a fresh D1,
 * the mock directory, the seeded clients, workflows and finder) and records
 * once that says it is holding. CLIPS_REUSE=1 records against one already
 * holding, for working out a recipe.
 *
 * ── As the live app looks ──
 *
 * The browser reaches that Worker as http://app.protectedcentral.com (a
 * host-resolver rule, nothing leaves the machine), so `isRehearsal()` is false
 * and everything in the incubator is off exactly as on the live app — no Talk
 * live, no floating Protron. The app modules the incubator is gaining today
 * (reviews, jobs & revenue, the online shop, the trade services, medical
 * billing — docs/INCUBATOR.md) may not be gated in this checkout yet, so their
 * menu entries are hidden here too (`LIVE_LOOK`): a clip on the live site must
 * not show a button the live app does not have.
 *
 * ── The recording ──
 *
 * A 1280×800 window at 1×, the app's own dark theme, motion on. The pointer is
 * a 3D one drawn into the page (`CLIP_CURSOR`, clip-cursor.mts) that follows
 * the real mouse events, since a headless capture shows none; it moves on an
 * arc with a minimum-jerk profile, the way a hand does, lifts and tilts as it
 * travels, sinks and ripples where it clicks, and is an I-beam over text.
 * Frames come from the DevTools screencast with their own timestamps, so a
 * slow API answer is a pause in the clip rather than a jump; a recipe may run
 * a stretch faster (`speed`) where only waiting happens. Each clip is written
 * as VP9 WebM (Chrome, Firefox, Edge) and H.264 MP4 (Safari), with a fade at
 * both ends so the loop closes on dark, and a poster taken at 2× of where it
 * ends — what a visitor who asked for less motion sees instead.
 */
import { LIVE_LOOK } from './live-look.mts';
import { CLIP_CURSOR } from './clip-cursor.mts';
import { CLIP_FRAME } from './clip-frame.mts';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { CLIP_IDS } from '../src/components/Site/clips.ts';

const OUT = 'public/site/clips';
const RAW = '/tmp/site-clips-raw';
/* Near-lossless copies the platform film is cut from (scripts/site-film.mts),
   kept between runs so one clip can be retaken without the others. */
const MASTER = '/tmp/site-clips-master';
const SESSION = '/tmp/site-reel-raw/session.json';
const HOST = 'app.protectedcentral.com';
const BASE = `http://${HOST}`;
const VIEW = { width: 1280, height: 800 };
const FPS = 25;
const FF = process.env.FFMPEG || '/usr/bin/ffmpeg';

if (!fs.existsSync('dist/index.html')) { console.log('Build first: VITE_BASE=/ npm run build'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(MASTER, { recursive: true });

/* ── The sample workspace ──────────────────────────────────────────────── */

let holder: ReturnType<typeof spawn> | null = null;
if (!process.env.CLIPS_REUSE) {
  fs.rmSync(SESSION, { force: true });
  holder = spawn('npx', ['tsx', 'scripts/site-reels.mts'], { env: { ...process.env, HOLD: '1' }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  holder.stdout!.on('data', c => { log += c; });
  holder.stderr!.on('data', c => { log += c; });
  holder.on('exit', code => { if (!fs.existsSync(SESSION)) { console.log(log.slice(-3000)); console.log(`the sample workspace did not start (${code})`); process.exit(1); } });
  const stop = () => { try { process.kill(-holder!.pid!, 'SIGTERM'); } catch { /* gone */ } };
  process.on('exit', stop);
  process.on('SIGINT', () => process.exit(130));
  for (let i = 0; i < 900 && !fs.existsSync(SESSION); i++) await new Promise(r => setTimeout(r, 1000));
}
if (!fs.existsSync(SESSION)) { console.log('No sample workspace is holding (see site-reels.mts HOLD=1).'); process.exit(1); }
const S = JSON.parse(fs.readFileSync(SESSION, 'utf8')) as { token: string; accountId: string; projects: { id: string; name: string }[] };

/* ── What every page gets ──────────────────────────────────────────────── */

const signIn = ([token, acct, subs]: string[]) => {
  /* The sample agency is signed in on the app's own host only: a clip that
     opens a client's sign-in address (clip-agency) shows that page as a
     visitor sees it, signed out. */
  if (location.hostname !== 'app.protectedcentral.com') return;
  localStorage.setItem('crm_session', JSON.stringify({
    token, backend: 'php', user: { email: 'alex@riverastudio.com', name: 'Alex Rivera', role: 'agency', accountId: acct },
  }));
  localStorage.setItem('crm_active_account', acct);
  if (subs === 'off') localStorage.setItem('crm_subaccounts', JSON.stringify([{ id: acct, name: 'Rivera Studio', plan: 'agency', status: 'active', price: 0 }]));
  else localStorage.setItem('crm_subaccounts', JSON.stringify([
    { id: acct, name: 'Rivera Studio', plan: 'agency', status: 'active', price: 0 },
    { id: 'reel-c1', parentId: acct, name: 'Brightline Realty', plan: 'pro', status: 'active', price: 2497, createdAt: '2026-05-12T09:00:00Z' },
    { id: 'reel-c2', parentId: acct, name: 'Parkway Dental', plan: 'growth', status: 'active', price: 1497, createdAt: '2026-06-19T09:00:00Z' },
    { id: 'reel-c3', parentId: acct, name: 'Harbour Law', plan: 'pro', status: 'active', price: 2497, createdAt: '2026-07-02T09:00:00Z' },
    { id: 'reel-c4', parentId: acct, name: 'Legacy Fitness', plan: 'starter', status: 'active', price: 897, createdAt: '2026-07-08T09:00:00Z' },
    { id: 'reel-c5', parentId: acct, name: 'Vine Street Kitchen', plan: 'growth', status: 'active', price: 1497, createdAt: '2026-08-14T09:00:00Z' },
  ]));
  localStorage.setItem('crm_sidebar_mode', JSON.stringify('hidden'));
  /* The app's own look since 2026-11-14, said outright so a default changing
     cannot quietly turn the clips light. */
  localStorage.setItem('crm_theme', 'dark');
  localStorage.removeItem('crm_motion');
};

/* ── The hand ──────────────────────────────────────────────────────────── */

type Page = Awaited<ReturnType<Awaited<ReturnType<typeof pw.chromium.launch>>['newPage']>>;
type Loc = ReturnType<Page['locator']>;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/*
 * Every scripted motion has a planned length — a move of ~0.4–1 s, a key every
 * ~50 ms — but driving a real page over DevTools takes longer than planned
 * (each key re-renders the form; each wheel step repaints a long list), so a
 * real-time recording types and moves at a third of a person's pace. Each
 * motion notes how long it really took, and its frames are played back at
 * the planned pace (`timed`). Pauses and waits for the server are left as
 * they happened, unless a recipe marks a stretch to run faster (`speed`).
 */
class Hand {
  x = 640; y = 420;
  marks: { t: number; f: number }[] = [];
  segs: { a: number; b: number; f: number }[] = [];
  constructor(public page: Page) {}
  private async timed(planned: number, fn: () => Promise<void>) {
    const a = Date.now() / 1000;
    await fn();
    const b = Date.now() / 1000;
    const f = ((b - a) * 1000) / planned;
    if (f > 1.05) this.segs.push({ a, b, f });
  }
  /** How much faster than recorded the moment `t` plays. */
  factor(t: number) {
    let f = 1;
    for (const m of this.marks) if (m.t <= t) f = m.f;
    /* A motion inside a fast stretch is first brought back to its planned
       pace, then sped up with the rest — so `fast` hurries the typing and the
       moves too, not only the pauses between them. */
    const seg = this.segs.find(x => t >= x.a && t < x.b);
    return seg ? seg.f * f : f;
  }
  /** A stretch where only waiting happens, played `f` times as fast. */
  speed(f: number) { this.marks.push({ t: Date.now() / 1000, f }); }
  /**
   * A routine stretch played `f` times as fast, with a badge saying so —
   * the owner's note of 2026-11-19: speed through the ordinary steps, take
   * time over the features. `fast(1)` ends it.
   */
  async fast(f: number) {
    this.speed(f);
    await this.page.evaluate(l => (window as unknown as { __clipFast: (l: string) => void }).__clipFast(l), f > 1 ? `⏩ ${f}× speed` : '').catch(() => {});
  }
  /** A caption over the frame naming what is on screen; '' clears it. Read by a viewer at 1×, so not inside a fast stretch. */
  async say(title: string, sub = '') {
    await this.page.evaluate(([t, s]) => (window as unknown as { __clipSay: (t: string, s: string) => void }).__clipSay(t, s), [title, sub]).catch(() => {});
    await sleep(350);
  }
  /** A long film's chapter card over the whole frame, held `ms`, then the app again. */
  async card(kicker: string, title: string, sub = '', ms = 3400, keep = false) {
    const set = (a: string[]) => this.page.evaluate(([k, t, s]) => (window as unknown as { __clipCard: (k: string, t: string, s: string) => void }).__clipCard(k, t, s), a).catch(() => {});
    await this.say('');
    await set([kicker, title, sub]);
    await sleep(ms);
    /* The film's last card stays up through the fade at the end. */
    if (keep) return;
    await set(['', '', '']);
    await sleep(600);
  }
  /**
   * Waits for real AI work — `done` true — with the stretch played `f`× and
   * badged as such, so a minute of the model thinking reads as an edit. The
   * ceiling is generous: a refusal here is a model that never answered.
   */
  async waitAi(done: () => Promise<boolean>, f = 6, ms = 180_000) {
    await this.fast(f);
    const t = Date.now();
    while (!(await done().catch(() => false))) {
      if (Date.now() - t > ms) throw new Error('the AI never answered');
      await sleep(400);
    }
    await this.fast(1);
  }
  async pause(ms: number) { await sleep(ms); }
  /* A native <select>: pointed at and pressed like anything else, then set.
     Its open list is drawn by the browser outside the page, so a screencast
     would never show it — the value simply changes, which is what is seen. */
  async choose(sel: Loc, label: string) {
    await this.to(sel);
    await this.page.mouse.down();
    await sleep(90);
    await this.page.mouse.up();
    await sleep(250);
    await this.page.keyboard.press('Escape').catch(() => {});
    await sel.selectOption({ label });
    await sleep(300);
  }
  async to(target: Loc | { x: number; y: number }, opts: { dx?: number; dy?: number } = {}) {
    let tx: number, ty: number;
    if ('x' in target) { tx = target.x; ty = target.y; } else {
      await target.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
      const b = await target.boundingBox({ timeout: 8000 }).catch(() => null);
      if (!b) throw new Error(`nothing to point at: ${String(target)}`);
      tx = b.x + Math.min(b.width / 2, 60) + (opts.dx ?? 0);
      ty = b.y + b.height / 2 + (opts.dy ?? 0);
    }
    const sx = this.x, sy = this.y, d = Math.hypot(tx - sx, ty - sy);
    const ms = Math.max(380, Math.min(1050, 300 + d * 0.75));
    const n = Math.max(8, Math.round(ms / 16));
    /* A gentle arc: the hand pivots at the wrist, so a long move bows. */
    const bow = Math.min(60, d * 0.09) * (tx > sx ? -1 : 1);
    const nx = d ? -(ty - sy) / d : 0, ny = d ? (tx - sx) / d : 0;
    await this.timed(ms, async () => {
      for (let i = 1; i <= n; i++) {
        const s = i / n;
        const e = 10 * s ** 3 - 15 * s ** 4 + 6 * s ** 5;
        const arc = Math.sin(Math.PI * e) * bow;
        const t0 = Date.now();
        await this.page.mouse.move(sx + (tx - sx) * e + nx * arc, sy + (ty - sy) * e + ny * arc);
        await sleep(Math.max(0, 16 - (Date.now() - t0)));
      }
    });
    this.x = tx; this.y = ty;
    await sleep(140);
  }
  async click(target: Loc | { x: number; y: number }, opts: { dx?: number; dy?: number } = {}) {
    await this.to(target, opts);
    await this.page.mouse.down();
    await sleep(90);
    await this.page.mouse.up();
    await sleep(320);
  }
  async type(text: string, delay = 48) {
    const gaps = [...text].map(ch => delay + (ch === ' ' ? 30 : 0) + Math.random() * 25);
    await this.timed(gaps.reduce((a, b) => a + b, 0), async () => {
      for (let i = 0; i < text.length; i++) {
        const t0 = Date.now();
        await this.page.keyboard.type(text[i]);
        await sleep(Math.max(0, gaps[i] - (Date.now() - t0)));
      }
    });
    await sleep(250);
  }
  /** Scrolls the page smoothly, by the wheel, until `target` sits `top` px under the window's top. */
  async reach(target: Loc, top = 150) {
    const b = await target.boundingBox({ timeout: 8000 }).catch(() => null);
    if (!b) throw new Error(`nothing to scroll to: ${String(target)}`);
    const dy = Math.round(b.y - top);
    if (Math.abs(dy) > 8) await this.scroll(dy, Math.min(1700, 600 + Math.abs(dy) * 0.45));
  }
  async scroll(dy: number, ms = 700) {
    const n = Math.max(6, Math.round(ms / 16));
    let done = 0;
    await this.timed(ms, async () => {
      for (let i = 1; i <= n; i++) {
        const e = (1 - Math.cos(Math.PI * i / n)) / 2;
        const to = Math.round(dy * e);
        await this.page.mouse.wheel(0, to - done);
        done = to;
        await sleep(16);
      }
    });
    await sleep(250);
  }
}

/* ── The recipes ───────────────────────────────────────────────────────── */

/* `toasts`: the app's own notices stay on screen — for a clip whose point
   is one ("1 deal on the board from your forms"); otherwise they are hidden
   as noise. */
/* `ownClients`: the server's own client list, not the five sample clients
   put in the browser for the account switcher — for the agency clip, which
   makes a client on camera and must not show figures for clients that do
   not exist on the server. */
/* `film`: a chapter of a long demonstration film (scripts/demo-film.mts
   joins them), not a site clip — no cap of six minutes, and only the
   near-lossless master is written, nothing under public/. */
type Recipe = { route: string; toasts?: boolean; ownClients?: boolean; film?: boolean; act: (h: Hand, p: Page) => Promise<void> };
/* A tab strip may draw its tabs as `tab` or as plain buttons; either will do. */
const btn = (p: Page, name: string | RegExp) => p.getByRole('button', { name }).or(p.getByRole('tab', { name })).or(p.getByRole('radio', { name })).locator('visible=true').first();
const text = (p: Page, t: string | RegExp) => p.getByText(t).locator('visible=true').first();

const RECIPES: Record<string, Recipe> = {
  /* Contacts — the owner's note of 2026-11-19: not "a contact added" but
     what the module does that others do not. Adding one is shown, sped up;
     the time goes to lists per business workspace, filters, the address
     checks, acting on many at once, handing people to AI Autopilot, finding
     businesses from inside Contacts, and the one-page profile. */
  'clip-contacts': {
    route: '/contacts',
    async act(h, p) {
      await h.say('Contacts that work for you', 'Every person and business, scored, segmented and ready to act on');
      await h.pause(2600);

      /* The everyday step, quickly. */
      await h.say('Adding a contact takes seconds');
      await h.fast(4);
      await h.click(btn(p, /^Add Contact$/));
      await h.click(p.getByPlaceholder('John Smith'));
      await h.type('Jordan Example', 40);
      await h.click(p.getByPlaceholder('john@example.com'));
      await h.type('jordan@northwind.example', 26);
      await h.click(p.getByPlaceholder('Acme Inc.'));
      await h.type('Northwind Studio', 30);
      await h.click(p.getByRole('button', { name: /^Add Contact$/ }).locator('visible=true').last());
      await h.pause(600);
      await h.fast(1);

      /* Lists that belong to a business workspace. */
      const lists = p.getByLabel('Contact lists').first();
      await h.say('A list for every business workspace', 'AI Autopilot fills them — here, a daily finder adding Virginia realtors');
      await h.scroll(330, 900);
      await h.pause(500);
      await h.click(lists.getByText(/Virginia realtors/).first());
      await h.pause(2600);
      await h.scroll(-330, 900);
      await h.click(lists.getByText('All contacts', { exact: true }).first());
      await h.pause(600);

      /* Segmenting. */
      await h.say('Filter and segment in a click', 'By stage, owner, email health — or any field you like');
      await h.choose(p.locator('select').filter({ hasText: 'All Email Health' }).locator('visible=true').first(), 'Valid');
      await h.pause(1100);
      await h.click(btn(p, /Filter$/));
      await h.pause(500);
      await h.click(btn(p, /Add Filter/));
      await h.pause(400);
      await h.choose(p.locator('select').filter({ hasText: 'Job Title' }).locator('visible=true').first(), 'Source');
      await h.click(p.getByPlaceholder('Value...').locator('visible=true').first());
      await h.type('Website', 60);
      await h.pause(1800);

      /* Deliverability. */
      await h.say('Every address checked before you send', 'Risky and invalid ones cleared out in one click');
      await h.to(btn(p, /Verify these addresses/));
      await h.pause(1300);
      await h.to(btn(p, /One-click clean/));
      await h.pause(1500);
      await p.goto(`${BASE}/contacts`, { waitUntil: 'networkidle' });
      await h.pause(900);

      /* Acting on many, and handing them to AI Autopilot. */
      await h.say('Push contacts straight into an AI Autopilot workflow', 'Tick them, pick a business workspace, done');
      const rows = p.locator('tbody input[type=checkbox]');
      for (let i = 0; i < 3; i++) await h.click(rows.nth(i));
      await h.pause(900);
      await h.to(p.locator('select').filter({ hasText: 'Move deals to stage' }).locator('visible=true').first());
      await h.pause(500);
      await h.click(btn(p, /Send to AI Autopilot/));
      await h.pause(1200);
      const sd = p.getByTestId('cl-send-dialog');
      await h.click(sd.locator('label').filter({ hasText: 'Brightline Realty' }).first());
      await h.pause(700);
      await h.click(p.getByTestId('cl-send-go'));
      await h.pause(2400);
      await p.keyboard.press('Escape');
      await p.goto(`${BASE}/contacts`, { waitUntil: 'networkidle' });
      await h.pause(700);

      /* New prospects without leaving the screen. */
      await h.say('Find new prospects from inside Contacts', 'Search the business directories and add them to a list');
      await h.click(btn(p, /Find businesses/));
      await h.pause(700);
      await h.click(p.getByPlaceholder(/What kind/));
      await h.type('dentists', 55);
      await h.click(p.getByPlaceholder(/Where/));
      await h.type('Leeds', 60);
      await h.click(p.getByRole('button', { name: /^Search$/ }).locator('visible=true').first());
      h.speed(2);
      await text(p, /\d+ found/).waitFor({ timeout: 60_000 });
      h.speed(1);
      await h.pause(900);
      const dlg = p.getByRole('dialog', { name: 'Find businesses' });
      const picks = dlg.locator('input[type=checkbox][aria-label^="Tick "]:not([aria-label="Tick all"])');
      for (let i = 0; i < 3; i++) await h.click(picks.nth(i));
      await h.pause(600);
      await h.click(dlg.getByText('A new list', { exact: true }));
      await h.click(dlg.getByLabel('Name of the new list'));
      await p.keyboard.press('Control+A');
      await h.type('Dentists — Leeds', 45);
      await h.click(dlg.locator('label').filter({ hasText: /acceptable use|agree|allowed/i }).locator('input[type=checkbox]').first());
      await h.click(dlg.getByRole('button', { name: /^Add 3 to/ }));
      await h.pause(2200);
      await p.keyboard.press('Escape');
      await h.pause(500);

      /* The profile. */
      await h.say('One page per contact', 'Health score, lifecycle, next best action and the whole history');
      await h.click(p.getByPlaceholder(/Search name/).first());
      await h.type('Aisha', 70);
      await h.pause(500);
      await h.click(p.getByText('Aisha Khan', { exact: true }).first());
      await h.pause(1600);
      await h.click(p.getByTitle('How this score is calculated').locator('visible=true').first());
      await h.pause(2400);
      await h.click(btn(p, /^Notes/));
      await h.click(p.getByPlaceholder('Add a note about this contact...'));
      await h.type('Wants the booking page live before March.', 32);
      await h.click(btn(p, /^\+ Note$/));
      await h.pause(1000);
      await h.click(btn(p, /^Deals/));
      await h.pause(2800);
    },
  },

  /* AI Autopilot — the owner's brief: walk its workflows step by step. The
     seeded business workspaces are the subject (a branching nine-step
     workflow, its guardrails, its agents, Brightline's daily finder); the
     wizard comes last, briskly, so the clip ends on a new one built. Cards
     are found by their business workspace's id, so workspaces a retake has
     already added on top do not move the targets. */
  'clip-autopilot': {
    route: '/autopilot',
    async act(h, p) {
      const card = (name: string) => {
        const pj = S.projects.find(x => x.name.startsWith(name));
        if (!pj) throw new Error(`no business workspace ${name} in the sample`);
        return p.locator(`#project-${pj.id}`);
      };
      const tab = (c: Loc, t: string) => c.getByRole('tab', { name: t, exact: true }).or(c.getByRole('button', { name: t, exact: true })).first();
      const vine = card('Vine Street Kitchen');
      await h.say('AI Autopilot runs your clients’ businesses', 'A business workspace per client, working on the server every five minutes');
      await h.pause(2800);

      /* The canvas. */
      await h.say('Workflows drawn the way they run', 'Every fork labelled Yes or No, every path joined up');
      const canvas = vine.getByRole('group', { name: 'Workflow diagram' }).first();
      await h.reach(canvas, 200);
      await h.pause(700);
      for (const n of ['A deal moves to Won', 'How did we do?', 'Happy (4–5 stars)?']) {
        await h.to(vine.getByRole('button', { name: `Edit step: ${n}` }).first(), { dx: -150, dy: 30 });
        await h.pause(600);
      }
      const right = vine.getByRole('button', { name: 'Scroll the workflow right' }).first();
      await h.click(right);
      await h.pause(2600);
      await h.click(vine.getByRole('button', { name: 'Scroll the workflow left' }).first());
      await h.pause(600);

      /* Node by node. */
      await h.say('Walk the workflow node by node', 'The real message and condition — your own forms, tags and stages');
      await h.click(vine.getByRole('button', { name: 'Edit step: A deal moves to Won' }).first());
      await h.pause(1600);
      const next = p.getByRole('button', { name: 'Next step' });
      await h.click(next);
      await h.pause(1900);
      await h.click(next);
      await h.say('Branches: Yes carries on, No goes where you choose');
      await h.pause(2200);
      await h.say('Dry-run any step against a real contact', 'Nothing is sent — it shows which way they would go, and why');
      await h.click(p.locator('button,[role=tab]', { hasText: /^\s*Test\s*$/ }).last());
      await h.pause(2800);
      await h.say('Walk the workflow node by node', 'Each step tried against the same contact');
      for (let i = 0; i < 6; i++) {
        await h.click(next);
        await h.pause(1100);
      }
      await h.click(p.getByRole('button', { name: 'Cancel' }).last());
      await h.pause(500);

      /* The whole workflow, editable. */
      await h.say('Change the whole workflow in place', 'Add a step anywhere, reorder them, change what starts it');
      await h.click(vine.getByRole('button', { name: /^Edit$/ }).first());
      await h.pause(1300);
      await h.click(p.getByRole('button', { name: 'Add a step after How did we do?' }));
      await h.pause(1800);
      await h.to(p.getByRole('button', { name: /^Their deal moves stage/ }).first());
      await h.pause(900);
      await h.to(p.getByRole('button', { name: /^They book an appointment/ }).first());
      await h.pause(1100);
      await h.click(p.getByRole('button', { name: 'Cancel' }).last());
      await h.pause(500);

      /* Guardrails. */
      await h.say('You decide what it may do by itself', 'Off, asks first, or on its own — set for each business workspace');
      await h.reach(vine, 90);
      await h.click(tab(vine, 'Business Workspace Settings'));
      await h.pause(900);
      await h.scroll(300, 800);
      await h.to(text(p, 'Write workflows'));
      await h.pause(700);
      await h.to(vine.getByRole('radio', { name: 'Asks first' }).nth(1));
      await h.pause(900);
      await h.to(vine.getByRole('radio', { name: 'On its own' }).nth(4));
      await h.pause(1200);

      /* Agents and what they did. */
      await h.reach(vine, 90);
      await h.say('AI agents on a schedule', 'They read the business and write for it — everything they make is a draft');
      await h.click(tab(vine, 'AI Agents'));
      await h.pause(2600);
      await h.say('Everything it did, in the open', 'From your own mailbox, logged as it happens');
      await h.click(tab(vine, 'Activity'));
      await h.pause(2400);

      /* A daily finder. */
      const bright = card('Brightline Realty');
      await h.say('New leads found for it every day', 'A daily search reads each website, checks the address and adds the new ones');
      await h.fast(3);
      await h.reach(bright, 90);
      await h.fast(1);
      await h.click(tab(bright, 'Prospects'));
      await h.pause(1600);
      await h.scroll(380, 900);
      await h.pause(1600);
      await h.scroll(560, 1000);
      await h.pause(2400);

      /* A new one, from a sentence. */
      await h.say('A new business workspace from one sentence', 'Answer what it could not work out, read the blueprint, build');
      await h.fast(4);
      await h.reach(btn(p, /New business workspace/), 260);
      await h.click(btn(p, /New business workspace/));
      await h.pause(700);
      await h.click(text(p, 'I’d rather describe it myself'));
      await h.pause(500);
      await h.click(p.getByLabel('What would you like AI Autopilot to do?'));
      await h.type('Post on social media every weekday and follow up every new lead within minutes', 28);
      await h.click(text(p, 'Social Media Growth'));
      await h.click(btn(p, 'Continue'));
      await h.pause(1800);
      await h.click(btn(p, 'Answer a few questions'));
      await h.pause(800);
      await h.click(text(p, 'My Rivera Studio profile'));
      await h.click(btn(p, /^Next$/));
      /* The questions: each screen answered the quickest honest way, by
         letting AI Autopilot choose. */
      for (let i = 0; i < 8; i++) {
        await h.pause(500);
        if (await p.getByRole('button', { name: /Looks good/ }).count()) break;
        const all = p.getByRole('button', { name: /Let AI decide all/ }).locator('visible=true').first();
        const nx = p.locator('button').filter({ hasText: /^(Next|Answer:|See the blueprint)/ }).locator('visible=true').last();
        if (await nx.isDisabled().catch(() => false)) {
          if (await all.count()) await h.click(all);
          else await h.click(p.getByRole('button', { name: /Let AI decide/ }).locator('visible=true').first());
        }
        await h.click(nx);
      }
      await h.fast(1);
      await h.say('Read exactly what it will build', 'Every workflow and every step, before anything exists');
      await h.pause(1800);
      await h.scroll(380, 1100);
      await h.pause(1400);
      await h.click(btn(p, /Looks good/));
      await h.fast(3);
      await h.pause(700);
      await h.click(btn(p, /^Review$/));
      await h.pause(700);
      await h.click(btn(p, /Build My AI Autopilot/));
      await p.getByRole('button', { name: /Open the business workspace/ }).locator('visible=true').first().waitFor({ timeout: 60_000 });
      await h.fast(1);
      await h.say('The business workspace is built', 'Open it to see every workflow it made');
      await h.pause(1200);
      await h.click(btn(p, /Open the business workspace/));
      await h.pause(1200);
      await p.evaluate(() => window.scrollTo({ top: 0 }));
      await h.pause(3000);
    },
  },

  /* AI Prospecting — what makes it more than a directory: one sentence,
     searched live with every stage shown, each website read for its
     address and every address checked, and the search handed to an AI
     Autopilot business workspace to run by itself on a schedule. */
  'clip-prospecting': {
    route: '/prospecting',
    async act(h, p) {
      await h.say('AI Prospecting: say who you sell to', 'One sentence — no filters to learn');
      await h.pause(2200);
      await h.click(p.getByLabel('Who to look for').first());
      await h.type('dentists in Richmond, Virginia', 46);
      await h.pause(400);
      await h.click(btn(p, /^Search$/));
      await h.say('It searches live, reads the websites and checks every address', 'Each stage shown as it runs');
      h.speed(2.5);
      await p.getByText(/Checked \d+ (address|contact)/).first().waitFor({ timeout: 90_000 });
      h.speed(1);
      await h.pause(1200);
      await h.to(text(p, 'What was searched'), { dy: 40 });
      await h.pause(1800);

      await h.say('What it did, step by step', 'What it searched, what it read, what it checked — and what would bounce');
      await h.scroll(470, 1100);
      await h.pause(2600);

      await h.say('Only addresses worth sending to', 'Filter to the ones that take mail, have a phone or a website');
      await h.scroll(420, 1000);
      await h.click(btn(p, /^Takes mail$/));
      await h.pause(1400);
      await h.scroll(380, 1000);
      await h.pause(1800);
      await h.scroll(-380, 900);
      await h.click(btn(p, /^All$/));
      await h.pause(600);

      /* The search, run every weekday by an AI Autopilot business workspace. */
      await h.say('Turn the search into a daily finder', 'An AI Autopilot business workspace runs it on a schedule, by itself');
      const connect = p.getByTestId('connect-autopilot-btn');
      await h.reach(connect, 380);
      await h.click(connect);
      await h.pause(1200);
      await h.click(p.getByRole('radio', { name: /Parkway Dental/ }));
      await h.pause(900);
      const go = p.getByTestId('connect-next');
      await h.click(go);
      await h.say('Decide what counts as a lead', 'Website, email or phone required — and what to leave out');
      await h.pause(2400);
      await h.click(go);
      await h.say('How often, and how many', 'Every day, weekdays or days you pick');
      await h.pause(700);
      await h.click(p.getByRole('radio', { name: /^Every day$/ }));
      await h.pause(1600);
      await h.click(go);
      await h.say('Every prospect checked before it is added', 'Duplicates, unsubscribes and bad domains turned away');
      await h.pause(2600);
      await h.click(go);
      await h.say('Where the new prospects go', 'A contact list, tags, a pipeline — or straight into the next workflow');
      await h.pause(2600);
      await h.click(go);
      await h.say('Connected — new prospects every day', 'Nobody has to remember to search again');
      await h.pause(3400);
    },
  },

  /* Websites — what a visitor asks of a builder: whole sites to start
     from, editing on the page itself, sections in a click, every page and
     screen size, search settings and publishing. "Generate with AI" is
     left alone (the recording's Worker has no AI key). */
  'clip-websites': {
    route: '/websites',
    async act(h, p) {
      await h.say('Websites & funnels for every client', 'Whole sites and multi-step funnels, built and hosted in the app');
      await h.pause(2400);
      await h.click(btn(p, /^Funnels$/));
      await h.pause(1600);
      await h.click(btn(p, /^Websites$/));
      await h.pause(500);

      await h.say('Start from a whole site, not a blank page', 'Multi-page templates — hover one to scroll through it');
      await h.click(btn(p, /^New Website$/));
      await h.pause(1300);
      await h.to(p.getByText('Business Website', { exact: true }).last(), { dy: -120 });
      await h.pause(1600);
      await h.to(p.getByText('Digital Agency', { exact: true }).last(), { dy: -120 });
      await h.pause(1200);
      await h.click(p.getByText('Consulting Firm', { exact: true }).last(), { dy: -110 });
      await h.pause(1300);
      await h.click(btn(p, /Use this template/));
      await h.pause(2000);

      await h.say('Click anything on the page to change it', 'Its words and buttons in the panel beside it');
      await h.click(p.getByText(/Expert guidance, without/).first());
      await h.pause(800);
      /* The block's text in the properties panel: the box holding the headline. */
      await p.evaluate(() => {
        const box = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('textarea, input'))
          .find(el => el.getBoundingClientRect().width > 0 && /Expert guidance/.test(el.value));
        box?.setAttribute('data-clip-target', '1');
      });
      await h.click(p.locator('[data-clip-target="1"]'));
      await p.keyboard.press('ControlOrMeta+A');
      await h.type('Clear advice for growing firms', 40);
      await h.pause(700);
      /* The button's words beside it. (The colour swatches change the
         block's gradient, which the template's hero picture covers, so
         nothing would be seen to change.) */
      await p.evaluate(() => {
        const box = Array.from(document.querySelectorAll<HTMLInputElement>('input'))
          .find(el => el.getBoundingClientRect().width > 0 && el.value === 'Book a free consult');
        box?.setAttribute('data-clip-target', '2');
      });
      await h.click(p.locator('[data-clip-target="2"]'));
      await p.keyboard.press('ControlOrMeta+A');
      await h.type('Book a 20-minute call', 45);
      await h.pause(1500);

      await h.say('Add a section in one click', 'Sections, content and forms, straight onto the page');
      await h.click(p.getByText('FAQ', { exact: true }).first());
      await h.pause(900);
      await h.to({ x: 620, y: 480 });
      await h.scroll(2600, 1700);
      await h.pause(2000);
      await h.scroll(-2600, 1400);
      await h.pause(400);

      await h.say('Every page, on every screen', 'Add pages; check it on a tablet and a phone before it goes live');
      await h.click(btn(p, /^pages$/i));
      await h.pause(1300);
      await h.click(p.locator('button:has(svg.lucide-tablet)').first());
      await h.pause(1500);
      await h.click(p.locator('button:has(svg.lucide-smartphone)').first());
      await h.pause(1900);
      await h.click(p.locator('button:has(svg.lucide-monitor)').first());
      await h.pause(600);

      await h.say('Ready for search engines', 'Its title, description and the link people will share');
      await h.click(btn(p, /^seo & link$/i));
      await h.pause(700);
      await h.click(p.getByPlaceholder(/title for search/i).first());
      await h.type('Halden Consulting — clear advice for growing firms', 30);
      await h.pause(900);

      await h.say('Publish — live in a click', 'On a public link under your business’s name, ready to share');
      await h.click(btn(p, /^Publish$/));
      await h.pause(800);
      await h.click(btn(p, /^Publish now$/));
      await h.pause(3000);
    },
  },

  /* Graphics Designer & Editor — templates drawn in the client's own name
     and colours, words that fit their box, every format re-laid, brand and
     picture in a click, variations, and the post itself. "Rewrite the
     words" (AI) is left alone. */
  'clip-graphics': {
    route: '/social-creator',
    async act(h, p) {
      const tab = (t: string) => p.getByRole('tab', { name: t }).or(p.getByRole('button', { name: t, exact: true })).locator('visible=true').first();
      const fmt = (t: RegExp) => p.getByRole('radio', { name: t }).or(p.getByRole('button', { name: t })).or(p.getByRole('tab', { name: t })).locator('visible=true').first();
      await h.say('Graphics Designer & Editor', 'Every template drawn with your client’s name and colours');
      await h.pause(2600);
      await h.say('Templates for what you are posting', 'Offers, launches, tips, announcements and more');
      await h.click(btn(p, /^Offers & discounts$/));
      await h.pause(1500);
      await h.click(btn(p, /^Tips & education$/));
      await h.pause(1500);
      await h.click(btn(p, /^All templates$/));
      await h.pause(500);

      await h.say('Pick one and say what it is about', 'Offers and prices only ever come from what you type');
      await h.scroll(330, 900);
      await h.to(text(p, 'Bauhaus News'));
      await h.pause(300);
      await h.click(btn(p, /^Use template$/));
      await h.pause(600);
      await h.click(p.getByPlaceholder('e.g. our new spring range'));
      await h.type('Spring garden consultations', 40);
      await h.click(btn(p, /Create design/));
      await p.getByRole('button', { name: /Rewrite the words/ }).first().waitFor({ timeout: 30_000 });
      await h.pause(1000);

      await h.say('Change the words — the design keeps its shape', 'Every line measured and fitted to its box');
      await h.click(p.getByPlaceholder('A line about it'));
      await h.type('Book a free walk-through this April', 36);
      await h.pause(1200);

      await h.say('Every format, re-laid — never stretched', 'Feed, square, story, landscape');
      for (const f of [/^Square/, /^Story/, /^Landscape/, /^Portrait/]) {
        await h.click(fmt(f));
        await h.pause(1400);
      }

      await h.say('Your client’s brand in a click', 'Their colours, and a font style to suit');
      await h.click(tab('Brand'));
      await h.pause(900);
      await h.click(p.getByRole('button', { name: /^Editorial\b.*magazine/ }).first());
      await h.pause(1500);
      await h.click(p.getByRole('button', { name: /^Friendly/ }).first());
      await h.pause(1500);

      await h.say('Swap the picture', 'A curated photo library — or upload your own');
      await h.click(tab('Pictures'));
      await h.pause(800);
      await h.click(p.locator('button[aria-pressed][title]').locator('visible=true').nth(4));
      await h.pause(2000);

      await h.say('The same words, another composition', 'Pick a variation — your words and pictures come with you');
      await h.click(text(p, 'Seasonal Check-up'));
      await h.pause(2200);

      await h.say('Ready to post', 'Caption, hashtags and a reminder date — download it or save it to the Media Center');
      await h.scroll(420, 1000);
      await h.click(p.getByPlaceholder(/hvac|hashtag/i).first());
      await h.type('springgarden gardendesign', 45);
      await h.pause(800);
      await h.scroll(-420, 900);
      await h.to(btn(p, /Download PNG/));
      await h.pause(2400);
    },
  },

  /* Customer Engagement — one place for every way a customer reaches the
     business: a ticket worked with a private note, a form changed and then
     really filled in on the business's own page and filed, an AI agent
     told what it may and may not do, and the chat widget's one line. The
     agent's answers need an AI key, so its chat is not shown. */
  'clip-engagement': {
    route: '/engagement',
    toasts: true,
    async act(h, p) {
      const tab = (t: string) => p.getByRole('tab', { name: new RegExp(`^${t}`) }).or(p.getByRole('button', { name: new RegExp(`^${t}`) })).locator('visible=true').first();
      const field = (label: string) => p.getByLabel(label, { exact: true }).or(p.getByText(label, { exact: true }).locator('xpath=following::*[self::input or self::textarea][1]')).locator('visible=true').first();
      await h.say('Customer Engagement', 'Chat, forms, tickets and live help — every way a customer reaches you');
      await h.pause(2600);

      await h.say('A ticket for anybody who needs help', 'Its status, your reply — and notes the customer never sees');
      await h.click(tab('Tickets'));
      await h.pause(800);
      await h.click(text(p, 'Booking link shows the wrong clinic hours'));
      await h.pause(1000);
      await h.click(btn(p, /^In progress$/));
      await h.pause(700);
      await h.click(p.getByPlaceholder(/^Reply to the customer/).first());
      await h.type('Fixed the Saturday hours on the booking page — checking the reminder emails next.', 26);
      await h.click(p.getByText(/Internal note/).first());
      await h.pause(500);
      await h.click(btn(p, /^Send$/));
      await h.pause(1600);

      await h.say('Forms for any website', 'Change one in the app — every answer is kept and becomes a contact');
      await h.click(tab('Forms'));
      await h.pause(800);
      await h.click(p.getByRole('button', { name: /^Edit$/ }).nth(1));
      await h.pause(900);
      await h.scroll(380, 900);
      await h.click(btn(p, /Add a question/));
      await h.pause(400);
      await h.click(p.getByPlaceholder('Question', { exact: true }).last());
      await p.keyboard.press('ControlOrMeta+A');
      await h.type('Best time to call you', 45);
      await h.pause(500);
      await h.click(btn(p, /Save and make it live/));
      await h.pause(1400);

      await h.say('A visitor fills it in on the business’s page…');
      await p.goto(`${BASE}/f/book-a-consultation`, { waitUntil: 'networkidle' });
      await h.pause(1000);
      await h.fast(3);
      const f = (n: number) => p.locator(`#pf-${n}`);
      await h.click(f(0)); await h.type('Priya Natarajan', 40);
      await h.click(f(1)); await h.type('priya@larkspur.example', 26);
      await h.click(f(2)); await h.type('Weekday mornings', 40);
      const consent = p.locator('input[type=checkbox]').first();
      if (await consent.count()) await h.click(consent);
      await h.fast(1);
      await h.click(p.getByRole('button', { name: /^(Send|Submit)/ }).first());
      await h.pause(1600);
      await p.goto(`${BASE}/engagement`, { waitUntil: 'networkidle' });
      await h.say('…and it is filed with the contact', 'Every answer kept, word for word');
      await h.click(tab('Submissions'));
      await h.pause(2800);

      await h.say('An AI agent for the website’s chat', 'It answers only from what you publish — and hands over to a person');
      await h.click(tab('AI agents'));
      await h.pause(700);
      await h.click(p.getByRole('button', { name: /New/ }).locator('visible=true').last());
      await h.pause(700);
      await h.fast(3);
      await h.click(field('What it is called'));
      await h.type('Front desk', 50);
      await h.click(field('Describe the business'));
      await h.type('A family dental practice in Leeds. Check-ups, hygiene and cosmetic work; open weekdays 8 to 6.', 22);
      await h.fast(1);
      await h.scroll(420, 900);
      await h.pause(500);
      await h.click(text(p, 'Offer your real booking times'));
      await h.pause(500);
      await h.click(text(p, 'Hand over to a person'));
      await h.pause(1400);
      await h.scroll(-420, 900);
      await h.click(p.getByRole('button', { name: /^Cancel$/ }).locator('visible=true').last());
      await h.pause(500);

      await h.say('One line of HTML puts it on any site', 'The chat window in your brand, with your name and photo');
      await h.click(tab('Widgets'));
      await h.pause(700);
      await h.click(p.getByRole('button', { name: /New/ }).locator('visible=true').last());
      await h.pause(700);
      await h.click(field('Name it'));
      await h.type('Parkway Dental chat', 45);
      await h.click(field('Title in the window'));
      await h.type('Questions? Ask us', 45);
      await h.click(btn(p, /Save and make it live/));
      await h.pause(1500);
      await h.to(p.getByLabel('Embed code').first());
      await h.pause(2600);
    },
  },

  /* Pipelines — the owner's note of 2026-11-19: show what is unusual. A
     pipeline per business workspace with its first tasks already written,
     a real enquiry on the business's own form arriving as a deal, an
     automation acting on the board, the deal itself, and the views. */
  'clip-pipelines': {
    route: '/pipelines',
    toasts: true,
    async act(h, p) {
      const pipe = () => p.locator('select').filter({ hasText: 'New business' }).locator('visible=true').first();
      const view = (t: string) => p.locator('button', { hasText: new RegExp(`^\\s*${t}\\s*$`) }).locator('visible=true').first();
      await h.say('Pipelines: every deal, from first enquiry to won');
      await h.pause(2600);

      /* One per business workspace. */
      await h.say('A separate pipeline for every business workspace', 'Made with the workspace, its first tasks written for that business');
      await h.choose(pipe(), 'Parkway Dental — new patients');
      await h.pause(1400);
      await h.click(text(p, 'Get Parkway Dental live'));
      await h.pause(1300);
      await h.scroll(260, 800);
      await h.pause(2000);
      await p.keyboard.press('Escape');
      await h.pause(500);
      await h.choose(pipe(), 'Harbour Law — consultations');
      await h.pause(1600);
      await h.choose(pipe(), 'New business');
      await h.pause(800);

      /* A visitor's enquiry on the business's website. */
      await h.say('Website enquiries become deals by themselves', 'A visitor asks for a quote on the business’s website…');
      await p.goto(`${BASE}/f/get-a-quote`, { waitUntil: 'networkidle' });
      await h.pause(900);
      await h.fast(3);
      const f = (n: number) => p.locator(`#pf-${n}`);
      await h.click(f(0)); await h.type('Maya Collins', 40);
      await h.click(f(1)); await h.type('maya@harbourview.example', 26);
      await h.click(f(3)); await h.type('A new website and online booking', 30);
      await h.click(f(4)); await h.type('1200', 60);
      await h.click(p.locator('input[type=checkbox]').first());
      await h.fast(1);
      await h.click(p.getByRole('button', { name: 'Send' }));
      await h.pause(1500);
      await p.goto(`${BASE}/pipelines`, { waitUntil: 'networkidle' });
      if (!(await pipe().inputValue().catch(() => '')).startsWith('p1')) await pipe().selectOption({ label: 'New business' });
      await h.say('…and it is on the board in seconds', 'A contact and a deal, in the first stage, nobody typing anything');
      h.speed(1.6);
      await p.getByText('Maya Collins', { exact: true }).locator('visible=true').first().waitFor({ timeout: 30_000 });
      h.speed(1);
      await h.to(p.getByText('Maya Collins', { exact: true }).locator('visible=true').first());
      await h.pause(2600);

      /* An automation on the board. */
      await h.say('Automations that work the board for you', 'Here: any deal idle for 14 days is flagged urgent and stale');
      await h.click(p.locator('button', { hasText: /^\s*Automations/ }).locator('visible=true').first());
      await h.pause(1100);
      await h.click(text(p, 'Flag stale deals'));
      await h.pause(1600);
      await p.keyboard.press('Escape');
      await h.pause(400);
      /* The idle sweep runs when a pipeline is opened. */
      await h.choose(pipe(), 'Renewals & upsells');
      await h.pause(500);
      await h.choose(pipe(), 'New business');
      await h.pause(2800);

      /* Moving a deal, and what is inside one. */
      await h.say('Drag a deal on — open it for sub-tasks, deadlines and comments');
      const card = p.locator('[draggable="true"]').locator('visible=true').nth(1);
      const b = await card.boundingBox();
      if (!b) throw new Error('no deal card on the board');
      await h.to({ x: b.x + b.width / 2, y: b.y + 24 });
      await p.mouse.down();
      await h.pause(180);
      await h.to({ x: b.x + b.width / 2 + 300, y: b.y + 70 });
      await h.pause(180);
      await p.mouse.up();
      await h.pause(1000);
      await h.click({ x: b.x + b.width / 2 + 300, y: b.y + 50 });
      await h.pause(1200);
      await h.click(text(p, 'Send the proposal'), { dx: -40 });
      await h.pause(2200);
      await p.keyboard.press('Escape');
      await h.pause(600);

      /* The views. */
      await h.say('See it your way', 'Board, list, table, funnel or timeline');
      for (const v of ['List', 'Table', 'Funnel', 'Gantt']) {
        await h.click(view(v));
        await h.pause(1700);
      }
      await h.click(view('Board'));
      await h.pause(1800);
    },
  },

  /* Email campaigns — what is sent and what came back: results counted
     from real sends, sequences with steps days apart that wait for no
     reply, an A/B step, a step read as one real contact will get it, the
     activity log and a list brought in. The AI-written parts (the brief's
     emails, "Write with AI", automations described in a sentence) are left
     out: they need an AI model the recording cannot count on. */
  'clip-campaigns': {
    route: '/marketing',
    async act(h, p) {
      const tab = (t: string) => p.getByRole('tab', { name: new RegExp(`^${t}`) }).or(p.getByRole('button', { name: new RegExp(`^${t}`) })).locator('visible=true').first();
      const sub = (t: string) => p.getByRole('tab', { name: t, exact: true }).or(p.getByRole('button', { name: t, exact: true })).locator('visible=true').last();
      await h.say('Email campaigns from your own mailbox', 'Sent by the server — a scheduled campaign goes out with every tab closed');
      await h.pause(2600);

      await h.say('Every figure counted from real sends', 'Opened, clicked, replied and bounced — campaign by campaign');
      await h.click(text(p, 'North Texas outreach'));
      await h.pause(3200);
      await h.click(p.getByRole('button', { name: /^←?\s*Back$/ }).locator('visible=true').last());
      await h.pause(600);

      await h.say('Sequences: several emails, days apart', 'Each step goes when its turn comes, from your own address');
      await h.click(tab('Sequences'));
      await h.pause(1000);
      await h.click(text(p, /^Step 2$/));
      await h.pause(1300);
      await h.to(p.getByText(/^Send in$/).first(), { dx: 30 });
      await h.pause(1200);

      await h.say('It stops the moment somebody answers', 'A step can wait for no reply, no open or no click');
      await h.reach(p.locator('select').filter({ hasText: 'Proceed regardless' }).locator('visible=true').first(), 380);
      /* The select sits at the foot of the editor, where the caption is:
         read the caption, then it clears for the change to be seen. */
      await h.pause(1500);
      await h.say('');
      await h.choose(p.locator('select').filter({ hasText: 'Proceed regardless' }).locator('visible=true').first(), 'If no reply');
      await h.pause(1800);
      await h.reach(p.getByText('Enable A/B test').first(), 260);

      await h.say('A/B test any step', 'Two versions of the same email, side by side');
      await h.click(p.getByText('Enable A/B test').first());
      await h.pause(800);
      await h.click(btn(p, /^Test B$/));
      await h.pause(1400);
      await h.click(btn(p, /^Test A$/));
      await h.pause(600);

      await h.say('Read it as one real contact will get it', 'Every merge field filled in before it goes');
      await h.click(p.locator('button:has(svg.lucide-eye)').locator('visible=true').first());
      await h.pause(700);
      await h.scroll(340, 900);
      await h.pause(900);
      await h.pause(1200);
      await h.say('');
      await h.pause(1000);
      await h.choose(p.locator('select').filter({ hasText: /Alderman/ }).locator('visible=true').first(), 'Blue Ridge Real Estate Group');
      await h.pause(2200);

      await h.say('Everything it did, logged', 'Who was added, what was switched on, every change');
      await h.scroll(-600, 900);
      await h.click(sub('Activity'));
      await h.pause(2200);

      await h.say('Bring your own list', 'Any spreadsheet — they become contacts you can use anywhere');
      await h.click(tab('Import a list'));
      await h.pause(2600);
    },
  },

  /* Booking pages — the page edited beside the real thing (words, look,
     a visitor's own time zone, a phone), the bookings it brings in, the
     working hours behind it and the emails that go out by themselves.
     "Fill it in from my website" (AI) is left alone. */
  'clip-booking': {
    route: '/scheduling',
    async act(h, p) {
      const tab = (t: string) => p.getByRole('tab', { name: new RegExp(`^${t}`) }).or(p.getByRole('button', { name: new RegExp(`^${t}`) })).locator('visible=true').first();
      const byValue = async (re: RegExp, id: string) => {
        await p.evaluate(([src, tag]) => {
          const rx = new RegExp(src);
          const box = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'))
            .find(el => el.getBoundingClientRect().width > 0 && rx.test(el.value));
          box?.setAttribute('data-clip-v', tag);
        }, [re.source, id]);
        return p.locator(`[data-clip-v="${id}"]`);
      };
      await h.say('Booking pages that fill your calendar', 'Every booking in one list — confirmed, completed or cancelled in a click');
      await h.pause(2800);

      await h.say('Edit it beside the real thing', 'The page your visitors see changes as you type');
      await h.click(tab('Booking pages'));
      await h.pause(1200);
      await h.scroll(470, 1000);
      await h.click(await byValue(/^Free 30-minute (growth audit|website review)$/, 'title'));
      await p.keyboard.press('ControlOrMeta+A');
      await h.type('Free 30-minute website review', 42);
      await h.pause(600);
      await h.click(p.getByPlaceholder('Helping local businesses grow'));
      await p.keyboard.press('ControlOrMeta+A');
      await h.type('Websites and booking for local firms', 42);
      await h.pause(1200);

      await h.say('Your look in one click', 'Four themes, the same page');
      await h.reach(p.getByRole('button', { name: 'Light theme' }).first(), 420);
      for (const t of ['Light theme', 'Midnight blue theme', 'Royal purple theme', 'Midnight lime theme']) {
        await h.click(p.getByRole('button', { name: t }).first());
        await h.pause(1300);
      }

      await h.say('How long, where, and which days', 'Video call, phone or in person — set once, shown on the page');
      await h.reach(btn(p, /^45 min$/), 330);
      await h.click(btn(p, /^45 min$/));
      await h.pause(900);
      await h.click(btn(p, /In person$/));
      await h.pause(1400);

      /* The visitor's own zone is the picker on the page itself (the
         preview, on the right) — not "Your time zone" in the editor, which
         is the host's. */
      await h.say('Times shown in each visitor’s own time zone', 'They pick a day and a time — no back-and-forth emails');
      await p.evaluate(() => {
        const sel = Array.from(document.querySelectorAll('select'))
          .find(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.left > 900 && r.top > 0 && r.top < innerHeight && el.querySelector('option') && /\//.test(el.options[0]?.text || ''); });
        sel?.setAttribute('data-clip-v', 'zone');
      });
      const zone = p.locator('[data-clip-v="zone"]');
      const ny = (await zone.locator('option', { hasText: 'New York' }).first().innerText()).trim();
      await h.choose(zone, ny);
      await h.pause(1200);
      await h.click(p.getByRole('button', { name: /^Monday, November 23, \d+ times$/ }).locator('visible=true').first());
      await h.pause(1600);

      await h.say('Check it on a phone before you share it');
      /* The preview sticks while the editor scrolls, so its own toolbar is
         reached by going back to the top of the editor beside it. */
      await h.reach(p.getByText('Your booking page', { exact: true }).first(), 170);
      await h.click(p.getByRole('button', { name: 'Phone', exact: true }).first());
      await h.pause(2200);
      await h.click(p.getByRole('button', { name: 'Desktop', exact: true }).first());
      await h.pause(500);

      await h.say('Your hours, and the emails that go by themselves', 'Confirmations with reschedule links, and a note to you for every booking');
      await h.scroll(-2000, 1100);
      await h.click(tab('Availability'));
      await h.pause(1800);
      await h.click(tab('Automations'));
      await h.pause(2600);
    },
  },

  /* Unified Inbox — every mailbox in one list, each message read for its
     mood and urgency, answered in place with a ready reply, tagged, noted
     for the team and closed. "AI draft reply" is left alone. */
  'clip-inbox': {
    route: '/conversations',
    async act(h, p) {
      await h.say('Every mailbox in one list', 'Sales, campaigns and support — each message with its contact');
      await h.pause(2400);
      await h.click(btn(p, /^Support/));
      await h.pause(1100);
      await h.click(btn(p, /^Campaigns/));
      await h.pause(1100);
      await h.click(btn(p, /^All inboxes/));
      await h.pause(600);

      await h.say('The urgent and the unhappy, first', 'Each message read for its mood and how urgent it is');
      await h.click(p.locator('button, [role=tab], [role=radio]', { hasText: /^\s*urgent\s*$/i }).locator('visible=true').last());
      await h.pause(1300);
      await h.click(text(p, 'URGENT: cannot access my account'));
      await h.pause(2000);
      await h.click(p.locator('button, [role=tab], [role=radio]', { hasText: /^\s*all\s*$/i }).locator('visible=true').last());
      await h.pause(600);

      await h.say('Answer without leaving it', 'A ready reply in a click, then your own words — from your own address');
      await h.click(text(p, 'Question about your pricing'));
      await h.pause(1200);
      await h.click(btn(p, /^Book a call$/));
      await h.pause(900);
      await h.click(p.getByPlaceholder(/^Reply to /));
      await p.keyboard.press('End');
      await h.type(' Thursday at 10 suits us.', 34);
      await h.pause(700);
      await h.to(p.getByText(/Sending as /).locator('visible=true').first());
      await h.pause(1400);

      await h.say('Tag it, note it, close it', 'A private note your team sees and the customer never does');
      /* Tag and Note ask with the browser's own prompt box, which a
         screencast never shows (like a native <select>); it is answered
         here and what it adds appears on the conversation. */
      p.once('dialog', d => { void d.accept('pricing'); });
      await h.click(btn(p, /^\+?\s*Tag$/));
      await h.pause(1300);
      p.once('dialog', d => { void d.accept('Asked about annual pricing — send the agency rate sheet.'); });
      await h.click(btn(p, /Note$/));
      await h.pause(1800);
      await h.click(p.getByTitle('Mark resolved').first());
      await h.pause(1600);

      await h.say('Find any conversation', 'Search every mailbox at once');
      await h.click(p.getByPlaceholder('Search inbox…'));
      await h.type('invoice', 70);
      await h.pause(2600);
    },
  },

  /* Agency & white-label — a client workspace made on camera, with its
     price and the name on its sign-in page; the agency's own product name
     across the app; a sign-in address claimed and live; and that address
     opened, signed out, as a client sees it. Own domains are not shown:
     whether they are switched on differs between this recording and live. */
  'clip-agency': {
    route: '/agency',
    ownClients: true,
    async act(h, p) {
      await h.say('Agency & white-label', 'A workspace for every client, under your own name');
      await h.pause(2600);

      await h.say('A client workspace in a minute', 'Its own contacts, pipelines and campaigns — and the price they pay you');
      await h.click(btn(p, /New Sub-Account/));
      await h.pause(900);
      await h.fast(3);
      await h.click(p.getByPlaceholder('Acme — Main Location'));
      await h.type('Harbour Law — Leeds', 40);
      await h.click(p.getByPlaceholder('Acme Inc.'));
      await h.type('Harbour Law LLP', 40);
      await h.click(p.getByPlaceholder('jane@acme.com'));
      await h.type('office@harbourlaw.example', 26);
      await h.click(p.getByPlaceholder(/Dental · Real estate/));
      await h.type('Law firm', 45);
      await h.fast(1);
      await h.click(text(p, 'Scale'));
      await h.pause(600);
      const price = p.locator('input[type=number]').filter({ visible: true }).first();
      await h.click(price);
      await p.keyboard.press('ControlOrMeta+A');
      await h.type('497', 90);
      await h.choose(p.locator('select').filter({ hasText: 'Trial' }).locator('visible=true').first(), 'Active');
      await h.pause(500);

      await h.say('Your name on their sign-in page', 'Each client can carry the product name you sell it under');
      const name = p.getByPlaceholder('Protected Central (default)');
      await h.reach(name, 360);
      await h.click(name);
      await h.type('Rivera Growth', 55);
      await h.click(p.getByPlaceholder('Sign in to your workspace'));
      await h.type('Sign in to Rivera Growth', 42);
      await h.pause(700);
      await h.click(btn(p, /^Create Sub-Account$/));
      await h.pause(2600);

      await h.say('Your product name across the app', 'The top bar, the sign-in screen, the emails’ sender name');
      await p.goto(`${BASE}/settings?tab=branding`, { waitUntil: 'networkidle' });
      await h.pause(900);
      await h.click(p.locator('#brand-name'));
      await p.keyboard.press('ControlOrMeta+A');
      await h.type('Rivera Growth', 60);
      await h.click(p.locator('#brand-headline'));
      await p.keyboard.press('ControlOrMeta+A');
      await h.type('Sign in to Rivera Growth', 45);
      await h.pause(700);
      await h.click(btn(p, /Save branding/));
      await h.pause(1600);

      /* The "Your own domain" card under it says whether own domains are
         switched on, which differs between this recording (off) and live
         (on) — so the box is brought to the foot of the window, the card
         below the fold, and the caption clears while it is used. */
      await h.say('Your own sign-in address, live at once', 'Nothing to set up — your clients sign in there');
      await h.pause(1600);
      await h.say('');
      const sub = p.getByPlaceholder('youragency');
      await h.reach(sub, 700);
      await h.click(sub);
      await h.type('rivera-growth', 60);
      await h.click(btn(p, /Claim it/));
      await h.pause(2600);

      await h.say('What your client sees', 'Your name and your headline — signed out, at your address');
      await p.goto('http://rivera-growth.protectedcentral.com/login', { waitUntil: 'networkidle' });
      await h.pause(3600);
    },
  },

  /* Reports — every figure read from the module that owns it, over the
     period chosen: the overview, where contacts came from, deals by stage
     and owner, campaigns and deliverability. */
  'clip-reports': {
    route: '/analytics',
    async act(h, p) {
      await h.say('Reports read live from every module', 'Revenue, new contacts and conversion — counted from your own records');
      await h.pause(2800);
      await h.say('Any period you like', 'Seven days to twelve months');
      await h.click(btn(p, /^90d$/));
      await h.pause(1400);
      await h.click(btn(p, /^12m$/));
      await h.pause(1600);

      await h.say('Where every contact came from', 'Each source counted — forms, finders, the booking page');
      await h.scroll(330, 1000);
      await h.pause(2400);
      await h.say('Deals by stage, and who is winning them');
      await h.scroll(420, 1000);
      await h.pause(2400);
      await h.say('Every campaign side by side', 'Sent, opened and clicked');
      await h.scroll(380, 1000);
      await h.pause(2400);
      await h.scroll(-1130, 1200);

      /* Not "Revenue by business workspace": it counts shop orders, and the
         online shop is held back on live (docs/INCUBATOR.md). */
      await h.say('Is your mail arriving?', 'Delivery and bounce rates, list health and sender reputation');
      await h.click(btn(p, /^Deliverability$/));
      await h.pause(1500);
      await h.scroll(380, 1000);
      await h.pause(2400);
    },
  },
};

/* ── The AI Autopilot deep-dive film ───────────────────────────────────────
 *
 * The owner's brief of 2026-11-20: every step, button and feature of AI
 * Autopilot — several businesses each with its own business workspace,
 * website and work; how somebody follows what it does; how it keeps
 * improving — recorded with real AI (the Worker's keys: AI_API_KEY /
 * OPENROUTER_API_KEY in the environment, passed on by site-reels.mts).
 * Chapters, joined by `scripts/demo-film.mts`. The AI's words differ on every
 * take, so the wizard is driven by what is on screen (answer while the box
 * is there, the footer's main button, "Include it" when offered), never by
 * a fixed list of its replies. "Improves" is shown as what it does: it
 * re-reads every business each day and adds what it finds — not as learning
 * from results, which it does not do.
 */
const wizard = (p: Page) => p.locator('[role=dialog]').last();
/** Text that has stopped changing for `still` ms — a streamed AI reply finished. */
const settled = (loc: Loc, still = 2400) => {
  let prev = '', since = Date.now();
  return async () => {
    const cur = await loc.innerText().catch(() => '');
    if (cur !== prev) { prev = cur; since = Date.now(); return false; }
    return Date.now() - since >= still;
  };
};
const enabled = (loc: Loc) => async () => (await loc.count()) > 0 && await loc.first().isEnabled();
const projectCard = (p: Page, name: string) => {
  const pj = S.projects.find(x => x.name.startsWith(name));
  if (!pj) throw new Error(`no business workspace ${name} in the sample`);
  return p.locator(`#project-${pj.id}`);
};
/* Each business workspace has its own co-pilot beside its card, outside it
   in the page: the one level with the card is that business's. */
const besideCard = async (p: Page, card: Loc, css: string, tag: string) => {
  const top = (await card.boundingBox())?.y ?? 0;
  await p.evaluate(([css, tag, top]) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(css as string)).filter(e => e.getBoundingClientRect().width > 0);
    els.sort((a, b) => Math.abs(a.getBoundingClientRect().y - (top as number)) - Math.abs(b.getBoundingClientRect().y - (top as number)));
    document.querySelectorAll(`[data-clip-near="${tag}"]`).forEach(e => e.removeAttribute('data-clip-near'));
    els[0]?.setAttribute('data-clip-near', tag as string);
  }, [css, tag, top]);
  return p.locator(`[data-clip-near="${tag}"]`);
};
const cardTab = (c: Loc, t: string) => c.getByRole('tab', { name: t, exact: true }).or(c.getByRole('button', { name: t, exact: true })).first();

const FILM: Record<string, Recipe> = {
  /* 1 · The board: many businesses, one place. */
  'film-ap-board': {
    route: '/autopilot', film: true,
    async act(h, p) {
      await h.card('AI Autopilot · the deep dive', 'Every business you run, on autopilot', 'The real app, recorded live with real AI — a sample agency and its client businesses');
      await h.say('One board for every business', 'Each business workspace has its own goal, workflows, prospects and website');
      await h.pause(3000);
      await h.to(text(p, 'Posts this month'));
      await h.say('Allowances counted live', 'Posts and prospects made this month, against the plan');
      await h.pause(1800);
      await h.say('An agency keeps each client in its own account', 'Switch client here — or open the agency dashboard for all of them');
      const switcher = p.locator('button[title="Rivera Studio"]').first();
      await h.click(switcher);
      await h.pause(3200);
      await h.click(switcher);
      await h.pause(600);
      await h.to(text(p, /AI Autopilot business workspaces/));
      await h.say('They work on the server every five minutes', 'Whether or not this page — or your computer — is open');
      await h.pause(2800);
      /* Down the board, one business after another. */
      await h.say('Five businesses, each running its own plan', 'Catering, fitness, law, dentistry, real estate — independent of each other');
      for (const n of ['Legacy Fitness', 'Harbour Law', 'Parkway Dental', 'Brightline Realty']) {
        await h.reach(projectCard(p, n), 110);
        await h.pause(1500);
      }
      await h.say('Put the business that matters most on top', 'Move up, move down — or pause a whole business in one click');
      const bright = projectCard(p, 'Brightline Realty');
      await h.to(p.getByRole('switch', { name: /^Pause Brightline Realty/ }).first());
      await h.pause(1200);
      await h.click(p.getByRole('button', { name: /^Move Brightline Realty .* up$/ }).first());
      await h.pause(2200);
      await h.say('Share progress with each client', 'A read-only page — they never see your other clients, contacts or prices');
      await h.reach(p.getByRole('button', { name: /Share progress with your clients/ }), 200);
      await h.pause(1400);
      await h.scroll(380, 900);
      await h.pause(3000);
    },
  },

  /* 2 · A new business workspace, built in one conversation with Protron. */
  'film-ap-new': {
    route: '/autopilot', film: true,
    async act(h, p) {
      await h.card('Chapter 1', 'A new business in one conversation', 'Protron, the AI business manager, asks what it needs, writes the plan, and AI Autopilot builds it');
      await h.click(btn(p, /New business workspace/));
      await h.pause(1400);
      const w = wizard(p);
      await h.say('Chat with Protron — type, or send a voice note', 'If the business has a website, it reads it for you');
      await h.pause(2600);
      const box = w.getByPlaceholder(/Type your answer/);
      const answers = [
        'No website yet. It is for my client Summit Commercial Cleaning in Denver — they clean offices and want more office and property managers as clients.',
        'Find new office and property managers every day, email them, and answer every enquiry within 15 minutes.',
        'We have no list yet, start from scratch.',
      ];
      let first = true;
      for (const a of answers) {
        if (!(await box.isVisible().catch(() => false))) break;
        await h.click(box);
        await h.fast(3);
        await h.type(a, 24);
        await h.fast(1);
        await p.keyboard.press('Enter');
        await h.waitAi(settled(w, 2600), 4, 90_000);
        if (first) { await h.say('Real AI answers in seconds', 'It asks only what it still needs, with answers to tap'); first = false; }
        await h.pause(3200);
        const inc = w.getByRole('button', { name: 'Include it' }).locator('visible=true');
        if (await inc.count()) {
          await h.say('It suggests solutions that fit the business', 'Include one in a click — or say no thanks');
          await h.pause(1500);
          while (await inc.count()) { await h.click(inc.first()); await h.pause(700); }
        }
      }
      await h.say('Then it writes the plan for AI Autopilot', 'A smart, optimized instruction from everything it learned');
      const approve = w.getByRole('button', { name: /Approve and continue/ });
      await h.click(w.getByRole('button', { name: /Create my smart optimized prompt for/ }));
      await h.waitAi(async () => (await enabled(approve)()) && await w.locator('textarea').evaluateAll(els => els.some(e => /Company:/.test((e as HTMLTextAreaElement).value))), 6);
      await h.say('Read it, change anything', 'Company, customers, objectives, constraints — all in plain words');
      await h.pause(3800);
      await h.click(w.getByPlaceholder(/Add something/));
      await h.type('We only clean on weekday evenings', 34);
      await h.say('Add a sentence — it rewrites the whole plan', 'Or press Write it again for a fresh version');
      await h.click(w.getByRole('button', { name: 'Add and rewrite' }));
      await h.pause(1200);
      await h.waitAi(enabled(approve), 6);
      await h.pause(2600);
      await h.click(approve);
      const qs = w.getByRole('button', { name: 'Answer a few questions' });
      await h.waitAi(enabled(qs), 6);
      await h.say('It tells you what it understood', 'Off? Say so in your own words and press Fix it');
      await h.pause(3600);
      await h.say('Add more work in a click', 'Branded social posts every day · an SEO article every week');
      await h.click(w.getByRole('button', { name: /^Daily social media posts/ }));
      await h.pause(700);
      await h.click(w.getByRole('button', { name: /^SEO blog articles/ }));
      await h.pause(1400);
      await h.click(qs);
      await h.pause(1500);
      /* Only what is still missing, a screen at a time. */
      await h.say('Only the questions it could not answer itself', 'Each with suggestions — or let AI decide, and it says why');
      let shownKinds = false, shownSite = false;
      for (let i = 0; i < 24; i++) {
        if (await w.getByRole('button', { name: /Looks good/ }).count()) break;
        const head = (await w.locator('h1,h2').first().innerText().catch(() => '')).trim();
        const nx = w.locator('button:visible').last();
        /* The AI orders its questions differently each take: "The people it
           works with" can open on the prospects-a-day question, without the
           suggested kinds. Highlight only the screen that shows them. */
        if (!shownKinds && /people it works with/i.test(head) && await w.getByText(/Suggested for your business/).count()) {
          shownKinds = true;
          await h.fast(1);
          await h.say('It picks who to find, and tells you why', 'Kinds of business searched live every day — widen it in a click');
          await h.to(w.getByText(/Suggested for your business/).first());
          await h.pause(3400);
        } else if (!shownSite && /website or funnel/i.test(head)) {
          shownSite = true;
          await h.fast(1);
          await h.say('Its own website or funnel, already in its name', 'Every design shows the business’s name, colour and photo — or let AI design it');
          await h.pause(2600);
          const quote = w.getByText('Free Quote Request', { exact: true }).first();
          if (await quote.count()) { await h.click(quote); await h.pause(1600); }
        } else if (i > 0) {
          /* Back to the general caption once a highlighted screen has gone by. */
          if (shownKinds || shownSite) await h.say('Only the questions it could not answer itself', 'Each with suggestions — or let AI decide, and it says why');
          await h.fast(4);
        }
        if (await nx.isDisabled()) {
          const all = w.getByRole('button', { name: /Let AI decide all/ }).locator('visible=true');
          const one = w.getByRole('button', { name: /Let AI decide/ }).locator('visible=true');
          if (await all.count()) await h.click(all.first());
          else if (await one.count()) await h.click(one.first());
          await h.pause(400);
        }
        await h.click(nx);
        await h.waitAi(settled(w, 1800), 4, 60_000);
      }
      await h.fast(1);
      await h.say('Read exactly what it will build', 'Workflows, AI agents and schedules — before anything exists');
      await h.pause(3200);
      await h.scroll(420, 1100);
      await h.pause(2200);
      await h.say('Change the blueprint by just saying it', 'No going back through the questions');
      await h.click(w.getByPlaceholder(/Make this three posts per week/).locator('visible=true').first());
      await h.type('Make it three posts a week and add LinkedIn', 34);
      await h.click(w.getByRole('button', { name: 'Update', exact: true }).locator('visible=true').first());
      await h.waitAi(settled(w, 2000), 4, 90_000);
      await h.pause(2400);
      await h.click(w.getByRole('button', { name: /Looks good/ }));
      await h.pause(1600);
      await h.say('Only what this business uses', 'Anything not connected yet simply waits — the rest starts now');
      await h.pause(3200);
      await h.scroll(360, 900);
      await h.pause(1600);
      await h.click(w.locator('button:visible').last());
      await h.pause(1400);
      await h.say('Nothing that contacts a person switches on without you', 'Emails and texts arrive as drafts for you to read first');
      await h.pause(3400);
      await h.click(w.getByRole('button', { name: /Build My AI Autopilot/ }));
      const open = p.getByRole('button', { name: /Open the business workspace/ }).locator('visible=true').first();
      await h.waitAi(async () => (await open.count()) > 0, 5, 240_000);
      await h.say('Built — and every record is real', 'Its emails written, the prospect search started, drafts waiting for you');
      await h.pause(3000);
      await h.scroll(400, 1000);
      await h.pause(2400);
      await h.click(open);
      await h.pause(1500);
      await p.evaluate(() => window.scrollTo({ top: 0 }));
      await h.say('The new business, live on the board', 'Its own goal, workflows and daily prospect search');
      await h.pause(3600);
    },
  },

  /* 3 · Inside one business workspace: its workflows, and the AI co-pilot. */
  'film-ap-inside': {
    route: '/autopilot', film: true,
    async act(h, p) {
      await h.card('Chapter 2', 'Inside a business workspace', 'Its workflows drawn as they run, tried step by step — and new ones written from a sentence');
      const vine = projectCard(p, 'Vine Street Kitchen');
      await h.reach(vine, 90);
      await h.say('Its goal, its money and its work, at a glance', 'Vine Street Kitchen: book 60 catering events this spring');
      await h.pause(3200);
      await h.say('Workflows drawn the way they run', 'Every fork labelled Yes or No, every path joined up');
      const canvas = vine.getByRole('group', { name: 'Workflow diagram' }).first();
      await h.reach(canvas, 200);
      await h.pause(800);
      for (const n of ['A deal moves to Won', 'How did we do?', 'Happy (4–5 stars)?']) {
        await h.to(vine.getByRole('button', { name: `Edit step: ${n}` }).first(), { dx: -150, dy: 30 });
        await h.pause(700);
      }
      await h.click(vine.getByRole('button', { name: 'Scroll the workflow right' }).first());
      await h.pause(2600);
      await h.click(vine.getByRole('button', { name: 'Scroll the workflow left' }).first());
      await h.pause(600);
      await h.say('Open any step: the real message and condition', 'Your own forms, tags and stages — nothing generic');
      await h.click(vine.getByRole('button', { name: 'Edit step: A deal moves to Won' }).first());
      await h.pause(1800);
      const next = p.getByRole('button', { name: 'Next step' });
      await h.click(next);
      await h.pause(2200);
      await h.click(next);
      await h.say('Dry-run a step against a real contact', 'Nothing is sent — it shows which way they would go, and why');
      await h.click(p.locator('button,[role=tab]', { hasText: /^\s*Test\s*$/ }).last());
      await h.pause(3000);
      for (let i = 0; i < 4; i++) { await h.click(next); await h.pause(1200); }
      await h.click(p.getByRole('button', { name: 'Cancel' }).last());
      await h.pause(600);
      await h.say('Change the whole workflow in place', 'Add a step anywhere, reorder them, change what starts it');
      await h.click(vine.getByRole('button', { name: /^Edit$/ }).first());
      await h.pause(1400);
      await h.click(p.getByRole('button', { name: 'Add a step after How did we do?' }));
      await h.pause(2000);
      await h.click(p.getByRole('button', { name: 'Cancel' }).last());
      await h.pause(600);
      /* The co-pilot, with real AI. */
      await h.reach(vine, 90);
      await h.say('Or describe a workflow in plain words', 'Edit with AI writes it for this business, in its voice');
      const ask = await besideCard(p, vine, 'textarea[placeholder^="e.g. When somebody fills in the quote"]', 'ask');
      await h.click(ask);
      await h.type('When somebody asks for a catering quote, tag them catering-lead, email our menu within the hour, and follow up after two days if they have not replied', 22);
      const panel = ask.locator('xpath=ancestor::*[.//button[contains(., "Update business workspace")]][1]');
      await h.click(panel.getByRole('button', { name: /Update business workspace/ }).first());
      const drafted = panel.getByText(/built as a draft/);
      await h.waitAi(async () => (await drafted.count()) > 0, 6, 150_000);
      await h.say('Written in seconds — and it arrives switched off', 'Nothing reaches anybody until you have read it');
      await h.pause(3000);
      const sw = vine.getByRole('switch', { name: /^Switch on / }).or(vine.getByRole('button', { name: /^Switch on / })).last();
      await h.reach(sw, 260);
      await h.pause(2600);
      await h.say('Read it, then switch it on', 'From now on it runs on the server, every five minutes');
      await h.click(sw);
      await h.pause(3400);
    },
  },

  /* 4 · Following the work: agents, guardrails, approvals, activity, plan. */
  'film-ap-follow': {
    route: '/autopilot', film: true,
    async act(h, p) {
      await h.card('Chapter 3', 'Follow everything it does', 'What its AI agents make, what waits for you, what it did — and how it re-plans every day');
      const vine = projectCard(p, 'Vine Street Kitchen');
      await h.reach(vine, 90);
      await h.click(cardTab(vine, 'AI Agents'));
      await h.say('AI agents on a schedule', 'They read the business and write for it — every piece is a draft');
      await h.pause(3200);
      await h.to(text(p, 'Edit this agent'));
      await h.pause(1400);
      await h.scroll(420, 1000);
      await h.say('Every step it is on the hook for', 'Emails, conditions, texts and agents, across its live workflows');
      await h.pause(2600);
      const doIt = vine.getByRole('button', { name: 'Do it' }).first();
      await h.reach(doIt, 420);
      await h.say('Ideas it found wait for your yes', 'It spotted 22 past clients never asked about spring — Do it, or Not this one');
      await h.pause(3200);
      await h.reach(vine, 90);
      await h.click(cardTab(vine, 'Business Workspace Settings'));
      await h.say('You decide what it may do by itself', 'Off, asks first, or on its own — for each business separately');
      await h.pause(2400);
      await h.to(text(p, 'Write workflows'));
      await h.pause(900);
      await h.to(vine.getByRole('radio', { name: 'Asks first' }).nth(2));
      await h.pause(1000);
      await h.to(vine.getByRole('radio', { name: 'On its own' }).nth(4));
      await h.pause(1400);
      const approve = vine.getByRole('button', { name: 'Approve', exact: true }).first();
      await h.reach(approve, 360);
      await h.say('Its plan for today, item by item', 'Done, waiting for you, or noticed — each with what it will do');
      await h.pause(3400);
      await h.say('One approval, and it goes ahead', 'Sent from the business’s own mailbox, logged as it happens');
      await h.click(approve);
      await h.pause(3000);
      await h.reach(vine, 90);
      await h.click(cardTab(vine, 'Activity'));
      await h.say('Everything it did, in the open', 'Going on now, what the agents made, what is coming up');
      await h.pause(3600);
      await h.click(cardTab(vine, 'Schedule'));
      await h.say('When each workflow runs next', 'On a schedule, or the moment something happens');
      await h.pause(3000);
      await h.click(cardTab(vine, 'Analytics'));
      await h.say('It re-plans every business every day', 'Reads the business, writes, builds, sends — then plans again and adds what it finds');
      await h.pause(4200);
      await h.say('Problems spotted before you ask', 'Deals gone quiet, follow-ups missing, a list that vanished — named, never hidden');
      await h.click(cardTab(vine, 'Business Workspace Settings'));
      await h.pause(600);
      const noticed = vine.getByText('Spotted 3 deals with no activity in 14 days').first();
      await h.reach(noticed, 380);
      await h.pause(3600);
      /* Another business: its own prospects, found daily. */
      const bright = projectCard(p, 'Brightline Realty');
      await h.fast(3);
      await h.reach(bright, 90);
      await h.fast(1);
      await h.click(cardTab(bright, 'Prospects'));
      await h.say('Every business finds its own new leads', 'Brightline’s daily search: each website read, each address checked');
      await h.pause(2000);
      await h.scroll(400, 1000);
      await h.pause(2400);
      await h.click(cardTab(bright, 'Assets'));
      await h.say('Everything it made, in one place', 'Posts, pages and articles — each a shortcut to the module that owns it');
      await h.pause(3400);
    },
  },

  /* 5 · Each business, its own website — and where to start. */
  'film-ap-sites': {
    route: '/websites', film: true,
    async act(h, p) {
      await h.card('Chapter 4', 'A website for every business', 'Each client’s own site and funnels — and ready-made workflows to start from');
      await h.say('Each client has its own website', 'Built from whole-site templates, published on its own address');
      await h.pause(3400);
      await h.click(btn(p, /^Funnels$/));
      await h.say('…and its own funnels', 'Summit’s quote funnel was built by AI Autopilot a minute ago');
      await h.pause(3800);
      await h.say('');
      await p.goto(`${BASE}/autopilot`, { waitUntil: 'networkidle' });
      await h.pause(1500);
      await h.click(btn(p, /^Templates$/));
      await h.say('Or start from a ready-made workflow', 'A gallery of workflows the engine really runs — preview, then use');
      await h.pause(3000);
      await h.scroll(500, 1200);
      await h.pause(2600);
      await h.card('AI Autopilot', 'Many businesses. One board. Real AI.', 'You decide what it may do by itself — everything else waits for your yes', 4200, true);
    },
  },
};
Object.assign(RECIPES, FILM);

/* ── The platform film: every module, its AI first ─────────────────────────
 *
 * The same brief: each module's AI features shown first, recorded with real
 * AI, then the rest of the module — which is its site clip above, already
 * feature-led, joined after it by demo-film.mts. Only buttons that really
 * call a model are captioned as AI (2026-11-20 audit: Pipelines' "Brain"
 * answers from rules, AI Prospecting's sentence reading is rule-based, and
 * the sequence editor's "Write with AI" button does nothing — none is shown
 * as AI here). A module with no AI of its own gets a title card only.
 */
const visibleButtons = (p: Page) => p.locator('button:visible').count();
const titleCard = (kicker: string, title: string, sub: string): Recipe => ({
  route: '/', film: true,
  async act(h) { await h.card(kicker, title, sub, 3600, true); },
});

const PLATFORM: Record<string, Recipe> = {
  'film-card-intro': titleCard('Protected Central', 'Every module, AI first', 'The real app, recorded live with real AI on a sample agency — then everything else each module does'),
  'film-card-autopilot': titleCard('Module · AI Autopilot', 'Businesses that run themselves', 'The short version — the full deep dive is its own film'),
  'film-card-prospecting': titleCard('Module · AI Prospecting', 'New leads from one sentence', 'Searched live, each website read, every address checked'),
  'film-card-engagement': titleCard('Module · Customer Engagement', 'Tickets, forms and AI chat agents', 'An AI agent that answers on the client’s website, set up in a minute'),
  'film-card-booking': titleCard('Module · Booking pages', 'A booking page for every client', 'Edited beside the live page, shown in each visitor’s time zone'),
  'film-card-agency': titleCard('Module · Agency & white-label', 'Your product, your name on it', 'Client workspaces, prices and a sign-in address of your own'),
  'film-card-reports': titleCard('Module · Reports', 'Every figure, read live', 'From the module that owns it, over the period you choose'),

  'film-ai-contacts': {
    route: '/contacts', film: true,
    async act(h, p) {
      await h.card('Module · Contacts', 'Contacts — AI first', 'Subject lines written for each person, then filters, lists and the rest');
      await h.say('Open anybody: their whole story on one page', 'Health score, stage, deals, notes and email');
      await h.click(p.locator('table tbody tr, [role=row]').nth(1));
      await h.pause(2200);
      await h.click(p.getByRole('tab', { name: /^Email/ }).or(p.getByRole('button', { name: /^Email$/ })).first());
      await h.pause(1200);
      await h.say('Subject lines written for this person', 'From their name and company, and whatever you have typed so far');
      const before = await visibleButtons(p);
      await h.click(p.getByRole('button', { name: /AI subjects/ }).first());
      await h.waitAi(async () => (await visibleButtons(p)) >= before + 3, 5, 60_000);
      await h.pause(2600);
      await h.say('Pick one and it is in the Subject box', 'Then write, or start from a template');
      const pick = p.locator('input[placeholder="Subject"]').locator('xpath=following::button[1]');
      await h.click(pick);
      await h.pause(2800);
    },
  },

  'film-ai-pipelines': {
    route: '/pipelines', film: true,
    async act(h, p) {
      await h.card('Module · Pipelines', 'Pipelines — AI first', 'Stages and tasks designed for the business, then the board and its automations');
      await h.say('Describe the work — AI lays out the stages', 'Design stages, from what the business sells and to whom');
      await h.click(p.getByRole('button', { name: /Design stages/ }).first());
      await h.pause(1200);
      const d = p.getByRole('dialog', { name: /Design this pipeline with AI/ });
      await h.fast(3);
      await h.click(d.getByPlaceholder(/A family dental practice/)); await h.type('A marketing studio for clinics, law firms and trades', 26);
      await h.click(d.getByPlaceholder(/Implants and Invisalign/)); await h.type('Websites, booking pages and monthly retainers', 26);
      await h.click(d.getByPlaceholder(/Adults within 20 minutes/)); await h.type('Owners of local service businesses in North Texas', 26);
      await h.click(d.getByPlaceholder(/3,000/)); await h.type('$2,500', 40);
      await h.fast(1);
      await h.click(d.getByRole('button', { name: 'Design the stages' }));
      await h.waitAi(async () => (await d.getByRole('button', { name: /^Apply to/ }).count()) > 0, 5, 120_000);
      await h.say('Every stage with its first tasks', 'And exactly what applying would change — no deal is ever deleted');
      await h.pause(3400);
      await h.scroll(420, 1200);
      await h.pause(2400);
      await h.scroll(420, 1200);
      await h.say('Rename, reorder, rewrite — it is a draft', 'Nothing changes until you press Apply');
      await h.pause(3000);
      /* Its own close button (the header's ×): Escape does not close it. */
      await h.click(d.locator('button').first());
      await h.pause(900);
      await h.say('Ask Brain about the board', 'AI answers from these deals — the suggestion chips are counted exactly');
      await h.click(p.getByRole('button', { name: /Brain/ }).first());
      await h.pause(1200);
      const ask = p.getByPlaceholder(/Ask anything about your deals/);
      await h.click(ask);
      await h.type('Which two deals should I chase first this week, and why?', 30);
      await p.keyboard.press('Enter');
      await h.waitAi(async () => (await p.getByText('AI answer · read from the deals on this board').count()) > 0, 5, 90_000);
      await h.pause(1000);
      await h.reach(p.getByText('AI answer · read from the deals on this board').first(), 520);
      await h.pause(4200);
    },
  },

  'film-ai-campaigns': {
    route: '/marketing', film: true,
    async act(h, p) {
      await h.card('Module · Email campaigns', 'Email campaigns — AI first', 'Campaigns written from a brief, rewritten on request, automations from a sentence');
      await h.say('A whole campaign, written from a brief', 'For the client you pick, from their business profile');
      await h.click(p.getByRole('button', { name: /Create Campaign/ }).first());
      await h.pause(1000);
      await h.click(p.getByText('Write it with AI').first());
      await h.pause(1200);
      await h.click(p.getByText('Vine Street Kitchen', { exact: true }).first());
      await h.click(p.getByRole('button', { name: '3', exact: true }).first());
      await h.click(p.getByRole('button', { name: 'Continue' }));
      await h.pause(1000);
      await h.fast(3);
      await h.click(p.getByPlaceholder(/Summer Product Launch/)); await h.type('Spring catering offer', 30);
      await h.click(p.getByPlaceholder(/launching TaskFlow/)); await h.type('Spring catering: office lunches and events for 20 to 200 people, with a free tasting for first-time clients', 18);
      await h.click(p.getByPlaceholder(/Start free trial/)); await h.type('Book a free tasting', 30);
      await h.click(p.getByRole('button', { name: /Email Sequence/ }));
      await h.click(p.getByRole('button', { name: /Promote Offer/ }));
      await h.click(p.getByRole('button', { name: /Friendly/ }));
      await h.fast(1);
      await h.click(p.getByRole('button', { name: 'Next' }));
      await h.waitAi(async () => (await p.getByRole('button', { name: 'Regenerate' }).count()) > 0, 5, 120_000);
      await h.say('Three emails, timed and conditioned', 'Day 0, then if not opened, then if not replied — it stops when they answer');
      await h.pause(3000);
      await h.say('It says when it has too little to go on', 'A thin business profile is named, not papered over');
      await h.to(p.getByText(/almost nothing on file/).first());
      await h.pause(2600);
      await h.click(p.getByText('Day 0').first());
      await h.pause(1200);
      await h.say('Ask the AI to change any email', 'Shorter, warmer, more direct, or a different subject line');
      await h.click(p.getByRole('button', { name: /make it shorter/i }).first());
      await h.waitAi(async () => !(await p.getByRole('button', { name: /make it shorter/i }).first().isDisabled()), 5, 90_000);
      await h.pause(2600);
      await h.click(p.locator('button[aria-label="Close"], button:has(svg.lucide-x)').first()).catch(async () => { await p.keyboard.press('Escape'); });
      await h.pause(1000);
      await h.say('An automation from one sentence', 'Describe it — it builds the trigger, waits, emails and tags');
      await h.click(p.locator('button, [role=tab], a').filter({ hasText: /^\s*Automations\s*$/ }).locator('visible=true').first());
      await h.pause(1000);
      await h.click(p.getByRole('button', { name: /New Automation/ }).first());
      await h.pause(900);
      await h.click(p.getByPlaceholder(/New Lead Nurture/)); await h.type('Missed tasting follow-up', 34);
      await h.click(p.getByPlaceholder(/downloads a pricing guide/));
      await h.fast(2);
      await h.type('When somebody books a tasting and does not turn up, wait one day, email them to rebook, and tag them no-show', 20);
      await h.fast(1);
      await h.click(p.getByRole('button', { name: /Build it/ }));
      const made = p.getByText('Missed tasting follow-up').first();
      await h.waitAi(async () => (await made.count()) > 0 && !(await p.getByRole('button', { name: /Build it/ }).count()), 5, 120_000);
      await h.click(made);
      await h.say('Built as a draft, step by step', 'Read it on the canvas, then switch it on');
      await h.pause(4200);
    },
  },

  'film-ai-blog': {
    route: '/blog-automation', film: true,
    async act(h, p) {
      await h.card('Module · Blog & SEO', 'A blog that ranks your own pages', 'Strategy, month plan and every post written by AI — each checked against nine SEO rules');
      const tab = (t: string) => p.getByRole('button', { name: t, exact: true }).first();
      await h.say('Give it the writing you already have', 'An about page, a service page, an old post — a few hundred words');
      await h.click(p.getByRole('button', { name: /^Portfolio/ }).first());
      await h.pause(1200);
      await h.click(p.getByPlaceholder(/What is this\?/)); await h.type('About page', 40);
      await h.click(p.getByPlaceholder(/Paste the text here/));
      await p.getByPlaceholder(/Paste the text here/).fill('Rivera Studio is a small marketing studio in Dallas, Texas. We build websites, booking pages and email campaigns for clinics, law firms and trades across North Texas. Most clients come to us because their phone goes quiet between referrals: we set up a site that answers the questions people really ask, a booking page that fills the calendar, and follow-up emails that bring past customers back. Every project starts with a free audit of the current site and ends with a monthly report in plain English.');
      await h.pause(1400);
      await h.click(p.getByRole('button', { name: 'Add to portfolio' }));
      await h.pause(900);
      await h.say('It reads the business and builds a ranking strategy', 'What you sell, who to, the terms worth chasing — grouped into clusters');
      await h.click(p.getByRole('button', { name: /Rebuild strategy|Build strategy/ }).first());
      await h.waitAi(async () => /Read by the AI/.test(await p.locator('main').innerText()), 5, 150_000);
      await h.say('Even how the business writes', 'Its tone, the phrases it really uses, words it never would');
      await h.pause(2600);
      await h.scroll(420, 1100);
      await h.pause(2600);
      await h.scroll(700, 1400);
      await h.say('Keywords in clusters, each aimed at a page', 'Intent and an honest difficulty estimate — not a made-up search volume');
      await h.pause(3200);
      await p.evaluate(() => window.scrollTo({ top: 0 }));
      await h.click(tab('Month plan'));
      await h.pause(1000);
      await h.say('A month of posts, planned', 'Cheapest to rank first, each pillar before the posts that link to it');
      await h.click(p.getByRole('button', { name: /Plan the month/ }).first());
      await h.waitAi(async () => (await p.getByRole('button', { name: 'Approve the month' }).count()) > 0, 5, 150_000);
      await h.pause(2600);
      await h.click(p.getByRole('button', { name: 'Approve the month' }));
      await h.pause(1200);
      await h.click(tab('Write'));
      await h.pause(1000);
      await h.say('Each post written in the business’s voice', 'Over a thousand words, headings and internal links');
      await h.click(p.getByRole('button', { name: /^Write$/ }).nth(1));
      await h.waitAi(async () => (await p.getByRole('button', { name: /^Rewrite$/ }).count()) > 0, 5, 240_000);
      await h.say('Measured against nine on-page SEO checks', 'Words, density, headings, links — a failing check is shown, not hidden');
      await h.pause(3200);
      await h.click(p.getByRole('button', { name: /^Read$/ }).first());
      await h.pause(1800);
      await h.scroll(500, 1300);
      await h.pause(2600);
      await h.scroll(600, 1300);
      await h.say('Then published to WordPress, or as files', 'On the planned dates — nothing goes out until you approve it');
      await h.pause(3200);
    },
  },

  'film-ai-websites': {
    route: '/websites', film: true,
    async act(h, p) {
      await h.card('Module · Websites & funnels', 'Websites — AI first', 'Any section rewritten by AI from a sentence, then templates, pages and publishing');
      await h.say('Every client’s site, edited on the page', 'Click a section, and its words are in the panel beside it');
      await h.click(p.getByRole('button', { name: /Open Builder/ }).first());
      await h.pause(2200);
      await h.click(p.getByText('We build brands people').first());
      await h.pause(1000);
      await h.say('Say what the section should say', 'Generate with AI writes the headline, the line under it and the buttons');
      await h.click(p.getByRole('button', { name: /Generate with AI/ }).first());
      await h.pause(600);
      await h.click(p.getByPlaceholder(/Describe what you want for this/).first());
      await h.type('A warm, confident hero for a studio that fills calendars for clinics, law firms and trades in North Texas', 22);
      await h.click(p.getByRole('button', { name: /^✨ Generate$/ }).first());
      await h.waitAi(async () => !(await p.getByText('We build brands people').count()), 5, 90_000);
      await h.say('Rewritten in seconds — in the site’s own design', 'Change any word by hand afterwards');
      await h.pause(4200);
    },
  },

  'film-ai-graphics': {
    route: '/social-creator', film: true,
    async act(h, p) {
      await h.card('Module · Graphics Designer', 'Graphics — AI first', 'Post designs written by AI in your client’s name and colours, then every format and brand');
      await h.say('Say what the post is about — AI writes the design', 'Headline, label, points and button, fitted to the template');
      await h.scroll(330, 900);
      await h.to(text(p, 'Bauhaus News'));
      await h.click(btn(p, /^Use template$/));
      await h.pause(600);
      await h.click(p.getByPlaceholder('e.g. our new spring range'));
      await h.type('Spring office catering — free tasting for new clients', 30);
      await h.click(btn(p, /Create design/));
      await h.waitAi(async () => (await p.getByRole('button', { name: /Rewrite the words/ }).count()) > 0, 5, 90_000);
      await h.pause(2600);
      await h.say('Not right? Rewrite the words', 'Prices and dates are never invented — only ever what you typed');
      await h.click(p.getByRole('button', { name: /Rewrite the words/ }).first());
      await h.waitAi(async () => !(await p.getByRole('button', { name: /Rewrite the words/ }).first().isDisabled()), 5, 90_000);
      await h.pause(3000);
      await h.say('Or describe a whole design from scratch', 'AI Generate lays it out and opens it in the editor');
      await h.say('');
      await p.goto(`${BASE}/social-creator?compose=ai`, { waitUntil: 'networkidle' });
      await h.pause(1400);
      await h.say('Or describe a whole design from scratch', 'AI Generate lays it out and opens it in the editor');
      await h.click(p.getByLabel('AI Prompt'));
      await h.type('Spring catering for offices: lunches for 20 to 200 people, book a free tasting', 24);
      await h.click(p.getByRole('button', { name: /Generate & Edit/ }));
      await h.waitAi(async () => /\/social-creator\/editor\//.test(p.url()), 5, 90_000);
      await h.pause(1500);
      await h.say('Every piece editable in the editor', 'Text, shapes, pictures and stickers — then export');
      await h.pause(3600);
    },
  },

  'film-ai-inbox': {
    route: '/conversations', film: true,
    async act(h, p) {
      await h.card('Module · Unified Inbox', 'Unified Inbox — AI first', 'A reply drafted from the conversation, then every mailbox in one list');
      await h.say('A pricing question comes in', 'Every mailbox in one list, the urgent and unhappy marked');
      await h.click(p.getByText('Question about your pricing').first());
      await h.pause(2200);
      await h.say('AI drafts the reply from the conversation', 'In the business’s voice — and it says when it is not sure');
      await h.click(p.getByRole('button', { name: /AI draft reply/ }).first());
      await h.waitAi(async () => await p.locator('textarea').evaluateAll(els => els.some(e => (e as HTMLTextAreaElement).value.length > 60)), 5, 90_000);
      await h.pause(1500);
      await h.reach(p.locator('textarea').last(), 300);
      await h.say('Read it, change it, send it', 'From the business’s own address — nothing goes without you');
      await h.pause(4200);
    },
  },
};
Object.assign(RECIPES, PLATFORM);

const missing = CLIP_IDS.filter(id => !RECIPES[id]);
const only = process.argv.slice(2);
const todo = (only.length ? only : CLIP_IDS).filter(id => RECIPES[id]);
if (!only.length && missing.length) console.log(`No recipe yet for: ${missing.join(', ')} — those are skipped.`);

/* ── Recording ─────────────────────────────────────────────────────────── */

/* Every protectedcentral.com host goes to the local Worker, so a client's
   own sign-in address (rivera-growth.protectedcentral.com) opens too. */
const browser = await pw.chromium.launch({ args: [`--host-resolver-rules=MAP ${HOST}:80 127.0.0.1:8797, MAP *.protectedcentral.com:80 127.0.0.1:8797`] });
const failed: string[] = [];
const report: string[] = [];

async function record(id: string) {
  const r = RECIPES[id];
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
  /* tsx names every function it compiles with a `__name` helper the page
     does not have; these run in the page, so they get a stand-in. */
  await ctx.addInitScript({ content: 'window.__name = (f) => f;' });
  await ctx.addInitScript(signIn, [S.token, S.accountId, r.ownClients ? 'off' : 'on']);
  await ctx.addInitScript(CLIP_CURSOR);
  await ctx.addInitScript(LIVE_LOOK);
  await ctx.addInitScript(CLIP_FRAME);
  if (r.toasts) await ctx.addInitScript(() => {
    const on = () => document.documentElement.setAttribute('data-clip-toasts', '');
    if (document.documentElement) on(); else addEventListener('DOMContentLoaded', on);
  });
  const page = await ctx.newPage();
  const errs: string[] = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${BASE}${r.route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const hand = new Hand(page);
  await page.mouse.move(hand.x, hand.y);

  const dir = `${RAW}/${id}`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await ctx.newCDPSession(page);
  const frames: { t: number; f: string }[] = [];
  cdp.on('Page.screencastFrame', async (e: { data: string; sessionId: number; metadata: { timestamp: number } }) => {
    const f = `${dir}/f${String(frames.length).padStart(5, '0')}.jpg`;
    fs.writeFileSync(f, Buffer.from(e.data, 'base64'));
    frames.push({ t: e.metadata.timestamp, f });
    await cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: r.film ? 80 : 92, maxWidth: VIEW.width, maxHeight: VIEW.height, everyNthFrame: 1 });
  await sleep(400);
  const t0 = Date.now() / 1000;
  hand.marks.push({ t: t0, f: 1 });
  /* A recipe that waits on something that never comes is refused, not
     left hanging: every wait has a ceiling, and so does the whole clip. */
  page.setDefaultTimeout(20_000);
  try {
    await Promise.race([
      r.act(hand, page),
      new Promise((_, no) => setTimeout(() => no(new Error(`the recipe took over ${r.film ? 25 : 6} minutes`)), r.film ? 1_500_000 : 360_000)),
    ]);
  } catch (e) {
    await page.screenshot({ path: `${RAW}/${id}-fail.png` }).catch(() => {});
    throw e;
  } finally {
    await sleep(300);
    await cdp.send('Page.stopScreencast').catch(() => {});
  }
  if (errs.length) throw new Error(`page errors: ${errs.join(' | ').slice(0, 400)}`);
  if (frames.length < 20) throw new Error(`only ${frames.length} frames`);

  /* The poster, at 2×: where the clip ends, which is what it was for. */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 2, mobile: false });
  await sleep(700);
  await page.screenshot({ path: `${dir}/poster.png` });
  await ctx.close();

  /* Frame durations from their own clocks, the fast stretches shortened. */
  const factor = (t: number) => hand.factor(t);
  const list: string[] = [];
  let total = 0;
  for (let i = 0; i < frames.length; i++) {
    const raw = i + 1 < frames.length ? frames[i + 1].t - frames[i].t : 0.8;
    const d = Math.max(0.001, raw / factor(frames[i].t));
    total += d;
    list.push(`file '${frames[i].f}'`, `duration ${d.toFixed(4)}`);
  }
  list.push(`file '${frames[frames.length - 1].f}'`);
  fs.writeFileSync(`${dir}/list.txt`, list.join('\n'));
  const fade = `fps=${FPS},format=yuv420p,fade=t=in:st=0:d=0.35,fade=t=out:st=${Math.max(0, total - 0.5).toFixed(2)}:d=0.5`;
  const input = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}/list.txt`, '-vf', fade, '-an'];
  if (r.film) {
    execFileSync(FF, [...input, '-c:v', 'libx264', '-preset', 'fast', '-crf', '14', `${MASTER}/${id}.mp4`]);
    fs.rmSync(dir, { recursive: true, force: true });
    report.push(`${id}: ${total.toFixed(1)} s · master ${Math.round(fs.statSync(`${MASTER}/${id}.mp4`).size / 1048576)} MB`);
    return;
  }
  /* A long clip is squeezed a little harder, to stay under ~4 MB. */
  const q = total > 90 ? 4 : total > 30 ? 2 : 0;
  execFileSync(FF, [...input, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(38 + q), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-g', '250', `${OUT}/${id}.webm`]);
  execFileSync(FF, [...input, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(28 + q), '-tune', 'animation', '-profile:v', 'high', '-level', '4.0', '-movflags', '+faststart', `${OUT}/${id}.mp4`]);
  execFileSync(FF, ['-y', '-loglevel', 'error', '-i', `${dir}/poster.png`, '-vf', 'scale=1920:-1:flags=lanczos', '-c:v', 'libwebp', '-quality', '78', `${OUT}/${id}-poster.webp`]);
  /* The film is cut from a near-lossless master, not from the web copies. */
  execFileSync(FF, [...input, '-c:v', 'libx264', '-preset', 'fast', '-crf', '12', `${MASTER}/${id}.mp4`]);
  /* The frames are ~1 GB a clip at 25 fps; a run of several fills the disk
     (and a full disk stalls the screencast without an error), so they go
     once the clip is encoded. The master above is what is kept. */
  fs.rmSync(dir, { recursive: true, force: true });
  const kb = (f: string) => Math.round(fs.statSync(f).size / 1024);
  report.push(`${id}: ${total.toFixed(1)} s · webm ${kb(`${OUT}/${id}.webm`)} KB · mp4 ${kb(`${OUT}/${id}.mp4`)} KB · poster ${kb(`${OUT}/${id}-poster.webp`)} KB`);
}

for (const id of todo) {
  try {
    console.log(`recording ${id}…`);
    await record(id);
  } catch (e) {
    failed.push(id);
    console.log(`  ${id} refused: ${(e as Error).message.split('\n')[0]}`);
  }
}
await browser.close();
console.log(report.join('\n'));
if (failed.length) { console.log(`refused: ${failed.join(', ')}`); process.exit(1); }
process.exit(0);
