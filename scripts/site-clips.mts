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
 * an element drawn into the page (`CURSOR`) that follows the real mouse
 * events, since a headless capture shows none; it moves on an arc with a
 * minimum-jerk profile, the way a hand does, and pulses where it clicks.
 * Frames come from the DevTools screencast with their own timestamps, so a
 * slow API answer is a pause in the clip rather than a jump; a recipe may run
 * a stretch faster (`speed`) where only waiting happens. Each clip is written
 * as VP9 WebM (Chrome, Firefox, Edge) and H.264 MP4 (Safari), with a fade at
 * both ends so the loop closes on dark, and a poster taken at 2× of where it
 * ends — what a visitor who asked for less motion sees instead.
 */
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

/* The pointer. Inside the page so the screencast sees it; `data-noinvert` so
   the dark theme's page-wide inversion leaves it its own colours. */
const CURSOR = () => {
  const put = () => {
    if (document.getElementById('clip-cursor')) return;
    const st = document.createElement('style');
    st.textContent = `
      #clip-cursor{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;will-change:transform;transition:none}
      #clip-cursor svg{display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55));transform-origin:3px 2px;transition:transform .09s ease-out}
      #clip-cursor.down svg{transform:scale(.86)}
      #clip-cursor i{position:absolute;left:-17px;top:-17px;width:36px;height:36px;border-radius:50%;border:2.5px solid #ff7a3d;opacity:0;transform:scale(.3)}
      #clip-cursor i.go{animation:clipring .55s ease-out}
      @keyframes clipring{0%{opacity:.95;transform:scale(.3)}100%{opacity:0;transform:scale(1.35)}}
      .toast-stack,[data-trialbar],.trial-bar,[aria-label="Help"],[data-corner-help]{display:none!important}`;
    document.documentElement.appendChild(st);
    const c = document.createElement('div');
    c.id = 'clip-cursor';
    c.setAttribute('data-noinvert', '');
    c.innerHTML = '<i></i><svg width="26" height="28" viewBox="0 0 24 26"><path d="M3 2.5 L3 21 L8.2 16.4 L11.6 23.6 L15 22 L11.7 15 L19.2 14.6 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const at = JSON.parse(sessionStorage.getItem('clip-at') || '[640,420]');
    c.style.transform = `translate(${at[0]}px,${at[1]}px)`;
    document.documentElement.appendChild(c);
    addEventListener('mousemove', e => { c.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; sessionStorage.setItem('clip-at', JSON.stringify([e.clientX, e.clientY])); }, true);
    addEventListener('mousedown', () => { c.classList.add('down'); const r = c.querySelector('i')!; r.classList.remove('go'); void (r as HTMLElement).offsetWidth; r.classList.add('go'); }, true);
    addEventListener('mouseup', () => c.classList.remove('down'), true);
  };
  if (document.documentElement) put(); else addEventListener('DOMContentLoaded', put);
};

/* Entries for modules the live app holds back (see the header). Matched on a
   control's whole label, or a phrase only those modules' cards carry. */
const LIVE_LOOK = () => {
  const WHOLE = /^(Reviews|Reputation|Shops?|Online shop|Jobs|Jobs & revenue|Medical billing|Revenue cycle|RCM|Growth service)$/i;
  const PHRASE = /(e-commerce store|online store|connect a shop|Websites → Shops|medical billing|jobs & revenue)/i;
  /* This Worker has no AI key, so screens that use AI say so and carry on
     without it; the live app has its key, and a visitor would never see
     these notices. The notice goes; what the screen did without AI stays. */
  const NO_AI = /^(The AI could not be reached|The AI is not available|AI writing is not available|Not made yet: Writing is unavailable)/;
  const sweep = () => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('button,a,[role=tab],[role=menuitem],[role=option]'))) {
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim();
      if (WHOLE.test(label) || WHOLE.test((el.textContent || '').trim()) || (PHRASE.test(label) && label.length < 200)) el.style.setProperty('display', 'none', 'important');
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('p,div,span'))) {
      if (el.childElementCount < 3 && NO_AI.test((el.textContent || '').trim())) el.style.setProperty('display', 'none', 'important');
    }
    /* A card that is about the shop: the smallest bordered box around the phrase. */
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!PHRASE.test(n.nodeValue || '')) continue;
      let box = n.parentElement;
      while (box && box !== document.body && !(getComputedStyle(box).borderTopWidth !== '0px' && box.getBoundingClientRect().height > 40)) box = box.parentElement;
      /* Only a card: a bordered box taller than this is a column holding much
         else besides, and hiding it would take the screen with it. */
      if (box && box !== document.body && box.getBoundingClientRect().height < 320) box.style.setProperty('display', 'none', 'important');
    }
  };
  const go = () => { sweep(); new MutationObserver(sweep).observe(document.body, { childList: true, subtree: true, characterData: true }); };
  if (document.body) go(); else addEventListener('DOMContentLoaded', go);
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
    const seg = this.segs.find(x => t >= x.a && t < x.b);
    if (seg) return seg.f;
    let f = 1;
    for (const m of this.marks) if (m.t <= t) f = m.f;
    return f;
  }
  /** A stretch where only waiting happens, played `f` times as fast. */
  speed(f: number) { this.marks.push({ t: Date.now() / 1000, f }); }
  async pause(ms: number) { await sleep(ms); }
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

type Recipe = { route: string; act: (h: Hand, p: Page) => Promise<void> };
/* A tab strip may draw its tabs as `tab` or as plain buttons; either will do. */
const btn = (p: Page, name: string | RegExp) => p.getByRole('button', { name }).or(p.getByRole('tab', { name })).or(p.getByRole('radio', { name })).locator('visible=true').first();
const text = (p: Page, t: string | RegExp) => p.getByText(t).locator('visible=true').first();

const RECIPES: Record<string, Recipe> = {
  'clip-contacts': {
    route: '/contacts',
    async act(h, p) {
      await h.pause(600);
      await h.click(btn(p, /^Add Contact$/));
      await h.pause(400);
      await h.click(p.getByPlaceholder('John Smith'));
      await h.type('Jordan Example', 40);
      await h.click(p.getByPlaceholder('john@example.com'));
      await h.type('jordan@northwind.example', 26);
      await h.click(p.getByPlaceholder('Acme Inc.'));
      await h.type('Northwind Studio', 30);
      await h.click(p.getByRole('button', { name: /^Add Contact$/ }).locator('visible=true').last());
      await h.pause(700);
      await h.click(p.getByPlaceholder(/Search name/).first());
      await h.type('Jordan', 60);
      await h.pause(600);
      await h.click(p.getByText('Jordan Example', { exact: true }).first());
      await h.pause(2400);
    },
  },

  'clip-autopilot': {
    route: '/autopilot?new=1',
    async act(h, p) {
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
      /* The questions, briskly: each screen answered the quickest honest
         way, by letting AI Autopilot choose. */
      h.speed(3.5);
      for (let i = 0; i < 8; i++) {
        await h.pause(500);
        if (await p.getByRole('button', { name: /Looks good/ }).count()) break;
        const all = p.getByRole('button', { name: /Let AI decide all/ }).locator('visible=true').first();
        const next = p.locator('button').filter({ hasText: /^(Next|Answer:|See the blueprint)/ }).locator('visible=true').last();
        if (await next.isDisabled().catch(() => false)) {
          if (await all.count()) await h.click(all);
          else await h.click(p.getByRole('button', { name: /Let AI decide/ }).locator('visible=true').first());
        }
        await h.click(next);
      }
      h.speed(1);
      await h.pause(1600);
      await h.scroll(380, 900);
      await h.pause(700);
      await h.click(btn(p, /Looks good/));
      await h.pause(900);
      await h.click(btn(p, /^Review$/));
      await h.pause(900);
      await h.click(btn(p, /Build My AI Autopilot/));
      h.speed(2);
      await p.getByRole('button', { name: /Open the business workspace/ }).locator('visible=true').first().waitFor({ timeout: 60_000 });
      h.speed(1);
      await h.pause(900);
      await h.click(btn(p, /Open the business workspace/));
      await h.pause(1200);
      /* The new business workspace is the newest, at the top of the board. */
      await p.evaluate(() => window.scrollTo({ top: 0 }));
      await h.pause(3000);
    },
  },

  'clip-prospecting': {
    route: '/prospecting',
    async act(h, p) {
      await h.pause(600);
      const box = p.getByLabel('Who to look for').first();
      await h.click(box);
      await h.type('real estate agents in Richmond, Virginia', 38);
      await h.click(btn(p, /^Search$/));
      h.speed(2.5);
      await p.getByText(/Checked \d+ (address|contact)/).first().waitFor({ timeout: 90_000 });
      h.speed(1);
      await h.pause(1500);
      await h.scroll(520, 1400);
      await h.pause(1200);
      await h.scroll(520, 1400);
      await h.pause(1800);
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

  'clip-pipelines': {
    route: '/pipelines',
    async act(h, p) {
      await h.pause(900);
      /* A deal card dragged one stage on, the way a person does it. */
      const drag = async (k: number, dx: number) => {
        const card = p.locator('[draggable="true"]').locator('visible=true').nth(k);
        const b = await card.boundingBox();
        if (!b) throw new Error('no deal card on the board');
        await h.to({ x: b.x + b.width / 2, y: b.y + 24 });
        await p.mouse.down();
        await h.pause(180);
        await h.to({ x: b.x + b.width / 2 + dx, y: b.y + 70 });
        await h.pause(180);
        await p.mouse.up();
        await h.pause(1000);
        return { x: b.x + b.width / 2 + dx, y: b.y + 40 };
      };
      const at = await drag(0, 300);
      await h.click(at);
      await h.pause(1200);
      await h.click(text(p, 'Send the proposal'), { dx: -40 });
      await h.pause(1300);
      await p.keyboard.press('Escape');
      await h.pause(900);
      await drag(2, 300);
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
      /* It ends on the brief: writing the emails from it is the AI's, and this
         Worker has no key — the next screen would only say so. */
      await h.to(btn(p, /^Next/));
      await h.pause(1600);
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
  await ctx.addInitScript(CURSOR);
  await ctx.addInitScript(LIVE_LOOK);
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
  /* A long clip is squeezed a little harder, to stay near 1.5 MB. */
  const q = total > 30 ? 2 : 0;
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
