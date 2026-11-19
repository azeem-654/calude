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

const signIn = ([token, acct]: string[]) => {
  localStorage.setItem('crm_session', JSON.stringify({
    token, backend: 'php', user: { email: 'alex@riverastudio.com', name: 'Alex Rivera', role: 'agency', accountId: acct },
  }));
  localStorage.setItem('crm_active_account', acct);
  localStorage.setItem('crm_subaccounts', JSON.stringify([
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
type Recipe = { route: string; toasts?: boolean; act: (h: Hand, p: Page) => Promise<void> };
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

  'clip-websites': {
    route: '/websites',
    async act(h, p) {
      await h.pause(600);
      await h.click(btn(p, /^New Website$/));
      await h.pause(1500);
      await h.to(p.getByText('Business Website', { exact: true }).last(), { dy: -120 });
      await h.pause(500);
      await h.click(p.getByText('Consulting Firm', { exact: true }).last(), { dy: -110 });
      await h.pause(1200);
      await h.click(btn(p, /Use this template/));
      await h.pause(2000);
      await h.click(p.getByText(/Expert guidance, without/).first());
      await h.pause(800);
      /* The block's text in the properties panel: the box holding the headline. */
      await p.evaluate(() => {
        const box = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('textarea, input'))
          .find(el => el.getBoundingClientRect().width > 0 && /Expert guidance/.test(el.value));
        box?.setAttribute('data-clip-target', '1');
      });
      const field = p.locator('[data-clip-target="1"]');
      if (await field.count()) {
        await h.click(field);
        await p.keyboard.press('ControlOrMeta+A');
        await h.type('Clear advice for growing firms', 40);
        await h.pause(900);
      }
      await h.click(btn(p, /^Publish$/));
      await h.pause(700);
      await h.click(btn(p, /^Publish now$/));
      await h.pause(2600);
    },
  },

  'clip-graphics': {
    route: '/social-creator',
    async act(h, p) {
      await h.pause(600);
      await h.scroll(330, 900);
      await h.to(text(p, 'Bauhaus News'));
      await h.pause(300);
      await h.click(btn(p, /^Use template$/));
      await h.pause(500);
      await h.click(p.getByPlaceholder('e.g. our new spring range'));
      await h.type('Spring garden consultations', 40);
      await h.click(btn(p, /Create design/));
      await p.getByRole('button', { name: /Rewrite the words/ }).first().waitFor({ timeout: 30_000 });
      await h.pause(900);
      await h.click(p.getByPlaceholder('A line about it'));
      await h.type('Book a free walk-through this April', 36);
      await h.pause(500);
      await h.click(btn(p, /^Square 1:1$/));
      await h.pause(1100);
      await h.click(text(p, 'Seasonal Check-up'));
      await h.pause(2000);
    },
  },

  'clip-engagement': {
    route: '/engagement',
    async act(h, p) {
      await h.pause(1000);
      await h.click(btn(p, /^Tickets/));
      await h.pause(900);
      await h.click(text(p, 'Booking link shows the wrong clinic hours'));
      await h.pause(1500);
      await h.click(btn(p, /^Forms$/));
      await h.pause(900);
      await h.click(btn(p, /^Edit$/));
      await h.pause(900);
      await h.scroll(420, 900);
      await h.click(btn(p, /Add a question/));
      await h.pause(500);
      await h.click(p.getByPlaceholder('Question', { exact: true }).last());
      await p.keyboard.press('ControlOrMeta+A');
      await h.type('Best time to call you', 45);
      await h.pause(1800);
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

  'clip-campaigns': {
    route: '/marketing',
    async act(h, p) {
      await h.pause(700);
      await h.click(btn(p, /^Create Campaign$/));
      await h.pause(900);
      await h.click(text(p, 'From a template'));
      await h.pause(1000);
      await h.click(btn(p, /^Use this$/));
      await h.pause(900);
      await h.click(p.getByPlaceholder(/Summer Product Launch/));
      await h.type('Spring check-in', 45);
      await h.click(text(p, 'Re-engage'));
      await h.click(p.getByPlaceholder(/We're launching/));
      await h.type('A friendly note to past clients: book your spring review.', 26);
      await h.click(text(p, 'Friendly'));
      await h.pause(600);
      /* Then the AI writes the emails from that brief — with a key in the
         shell (site-reels.mts passes AI_API_KEY / OPENROUTER_API_KEY to its
         Worker), as on live. Without one, "Regenerate" never appears and the
         clip is refused rather than ending on a "no AI" notice. */
      await h.click(btn(p, /^Next/));
      h.speed(3);
      await btn(p, /Regenerate/).waitFor({ timeout: 120_000 });
      h.speed(1);
      await h.pause(1400);
      await h.scroll(420, 1400);
      await h.pause(1800);
    },
  },

  'clip-booking': {
    route: '/scheduling',
    async act(h, p) {
      await h.pause(700);
      await h.click(btn(p, /^Booking pages$/));
      await h.pause(900);
      await h.scroll(470, 1000);
      const tag = p.getByPlaceholder('Helping local businesses grow');
      await h.click(tag);
      await p.keyboard.press('ControlOrMeta+A');
      await h.type('Websites and booking for local firms', 42);
      await h.pause(700);
      await h.click(p.getByRole('button', { name: /, \d+ times$/ }).locator('visible=true').first());
      await h.pause(2400);
    },
  },

  'clip-inbox': {
    route: '/conversations',
    async act(h, p) {
      await h.pause(800);
      await h.click(text(p, 'Question about your pricing'));
      await h.pause(1200);
      await h.click(p.getByPlaceholder(/^Reply to /));
      await h.type('Thanks, Emily — happy to walk you through it. Does Thursday at 10 suit you?', 26);
      await h.pause(600);
      await h.to(btn(p, /^Send reply$/));
      await h.pause(1800);
    },
  },

  'clip-agency': {
    route: '/settings?tab=branding',
    async act(h, p) {
      await h.pause(900);
      await h.click(p.locator('#brand-name'));
      await p.keyboard.press('ControlOrMeta+A');
      await h.type('Rivera Growth', 60);
      await h.pause(500);
      await h.click(p.locator('#brand-headline'));
      await p.keyboard.press('ControlOrMeta+A');
      await h.type('Sign in to Rivera Growth', 45);
      await h.pause(2200);
    },
  },

  'clip-reports': {
    route: '/analytics',
    async act(h, p) {
      await h.pause(1200);
      await h.click(btn(p, /^90d$/));
      await h.pause(1400);
      await h.scroll(420, 1100);
      await h.pause(900);
      await h.scroll(-420, 900);
      await h.click(btn(p, /^Deliverability$/));
      await h.pause(2600);
    },
  },
};

const missing = CLIP_IDS.filter(id => !RECIPES[id]);
const only = process.argv.slice(2);
const todo = (only.length ? only : CLIP_IDS).filter(id => RECIPES[id]);
if (!only.length && missing.length) console.log(`No recipe yet for: ${missing.join(', ')} — those are skipped.`);

/* ── Recording ─────────────────────────────────────────────────────────── */

const browser = await pw.chromium.launch({ args: [`--host-resolver-rules=MAP ${HOST}:80 127.0.0.1:8797`] });
const failed: string[] = [];
const report: string[] = [];

async function record(id: string) {
  const r = RECIPES[id];
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
  /* tsx names every function it compiles with a `__name` helper the page
     does not have; these run in the page, so they get a stand-in. */
  await ctx.addInitScript({ content: 'window.__name = (f) => f;' });
  await ctx.addInitScript(signIn, [S.token, S.accountId]);
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
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: VIEW.width, maxHeight: VIEW.height, everyNthFrame: 1 });
  await sleep(400);
  const t0 = Date.now() / 1000;
  hand.marks.push({ t: t0, f: 1 });
  try {
    await r.act(hand, page);
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
  /* A long clip is squeezed a little harder, to stay under ~4 MB. */
  const q = total > 90 ? 4 : total > 30 ? 2 : 0;
  execFileSync(FF, [...input, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(38 + q), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-g', '250', `${OUT}/${id}.webm`]);
  execFileSync(FF, [...input, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(28 + q), '-tune', 'animation', '-profile:v', 'high', '-level', '4.0', '-movflags', '+faststart', `${OUT}/${id}.mp4`]);
  execFileSync(FF, ['-y', '-loglevel', 'error', '-i', `${dir}/poster.png`, '-vf', 'scale=1920:-1:flags=lanczos', '-c:v', 'libwebp', '-quality', '78', `${OUT}/${id}-poster.webp`]);
  /* The film is cut from a near-lossless master, not from the web copies. */
  execFileSync(FF, [...input, '-c:v', 'libx264', '-preset', 'fast', '-crf', '12', `${MASTER}/${id}.mp4`]);
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
