/**
 * The public site.
 *
 * Until now protectedcentral.com opened on a login box, which tells a visitor
 * who has never heard of the product exactly nothing. This is the page that
 * answers "what is it" before asking anyone to sign in.
 *
 * It is the whole of protectedcentral.com. The product is a separate hostname,
 * app.protectedcentral.com, and every way in from here — sign in, sign up, the
 * hero buttons — is a link across to it. services/hosts.ts owns that decision
 * so the same bundle still runs as one site on localhost.
 *
 * The page holds still and the scroll moves the scene. A tall document sits
 * under a fixed stage, and every pixel of scroll advances the scene by a
 * proportional amount — a nudge of the wheel starts the next screen arriving,
 * and it keeps arriving for as long as you keep going. useScrollScene.ts owns
 * that; this file is the scenes and the chrome.
 *
 * The screens are photographs of the real modules, taken by a script against a
 * seeded workspace rather than drawn in a design tool. What the visitor sees is
 * what they get, and when a module changes the picture is re-taken rather than
 * redrawn.
 *
 * Every claim on it is checkable against the software. There are no customer
 * counts, no uptime figures and no testimonials, because there is nothing to
 * base them on yet and a marketing page that opens with an invented number is
 * the worst possible first impression for a product whose entire argument is
 * that it shows you its working.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, ArrowUpRight, BarChart3, Building2, Check, ChevronDown,
  Inbox, Info, Lock, MousePointerClick, Palette, Receipt, Send, ShieldCheck,
  Sparkles, Users,
} from 'lucide-react';
import { activeBranding } from '../../services/tenancy';
import { LogoMark } from '../shared/Logo';
import { appHref, isCrossOrigin } from '../../services/hosts';
import { clamp01, mix, smoothstep, useScrollScene } from './useScrollScene';
import './site.css';

/** How many viewport heights of scroll one scene occupies. Higher is slower. */
const SCENE_VH = 118;

const SHOT = (name: string) => `${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/site/${name}.webp`;

/* ── The content ──────────────────────────────────────────────────────── */

/**
 * One close-up of one function.
 *
 * `src` is a crop of the running application, not the whole window: a 1240px
 * screen shrunk into a column shows that a screen exists and nothing about what
 * it does. `label` says which function is being shown, because a crop without
 * one is just a smaller screenshot. `w`/`h` are the real pixel size, so the
 * space is reserved before the picture arrives and the page does not jump.
 */
interface View {
  src: string;
  label: string;
  alt: string;
  w: number;
  h: number;
}

interface Scene {
  id: string;
  chapter: string;
  eyebrow: string;
  lead: string;
  emph: string;
  body?: string;
  /** The whole window, for the scenes that are about the screen as a whole. */
  shot?: { src: string; alt: string };
  /** Close-ups of the functions that make the module's case. */
  views?: View[];
  points?: string[];
  tone?: 'dark';
  /** Rendered instead of the body/points column. */
  extra?: React.ReactNode;
}

/** A close-up, described once and used by whichever scene needs it. */
const view = (file: string, label: string, alt: string, w: number, h: number): View =>
  ({ src: SHOT(file), label, alt, w, h });

const CAPABILITIES: { group: string; items: string[] }[] = [
  { group: 'Reach', items: ['Email sequences', 'One-to-one email', 'SMS with consent and STOP', 'Deliverability & warm-up', 'Prospect search'] },
  { group: 'Convert', items: ['Funnels', 'Websites', 'Landing pages', 'Booking pages', 'Forms & surveys'] },
  { group: 'Manage', items: ['Contacts', 'Pipelines', 'Conversations', 'Calendar', 'Tasks & notes'] },
  { group: 'Create', items: ['AI Shorts', 'Blog automation', 'Social creator', 'Content library', 'Brand overlays'] },
  { group: 'Understand', items: ['Campaign performance', 'Open & reply rates', 'Reputation', 'Analytics', 'Decision log'] },
  { group: 'Run it as an agency', items: ['Sub-accounts', 'White-label branding', 'Per-client billing', 'Role-based access', 'Isolated data'] },
];

const GROUP_ICON: Record<string, typeof Check> = {
  Reach: Send, Convert: MousePointerClick, Manage: Users,
  Create: Sparkles, Understand: BarChart3, 'Run it as an agency': Building2,
};

const LIFECYCLE = [
  { n: '01', title: 'Objective', body: 'One or two sentences in your own words, kept verbatim.' },
  { n: '02', title: 'Plan', body: 'Who to reach, what is on offer, how many follow-ups, when to stop.' },
  { n: '03', title: 'Prospects', body: 'Checked one signal at a time. What cannot be settled is reported as unknown.' },
  { n: '04', title: 'Build', body: 'Real contacts, a real sequence, real enrolments in the modules that own them.' },
  { n: '05', title: 'Send', body: 'Inside the limits you set. A reply ends the cadence.' },
  { n: '06', title: 'Measure', body: 'Read live from whichever module owns each figure.' },
  { n: '07', title: 'Rewrite', body: 'When the figures say the funnel is failing, it rewrites the half that failed.' },
];

/* The three sections added below the product tour. Each is a claim the software
   can be checked against, not a benefit statement. */
const AGENCY = [
  { icon: Building2, title: 'A sub-account per client', body: 'Its own contacts, pipelines, campaigns and calendar. Switching between them takes one click.' },
  { icon: Lock, title: 'Enforced on the server', body: 'A workspace you do not own is refused by the API, not merely hidden by the interface.' },
  { icon: Palette, title: 'Your name on it', body: 'White-label the product name and logo per client, so what they log into looks like yours.' },
  { icon: Receipt, title: 'Billed per client', body: 'Each sub-account carries its own plan and its own billing status.' },
];

const OWNERSHIP = [
  { icon: Send, title: 'Your SMTP', body: 'Gmail, Microsoft 365, Brevo, or anything else that speaks SMTP. Stored encrypted, used only to send your mail.' },
  { icon: Inbox, title: 'Your IMAP', body: 'Replies are read from your own mailbox, so a conversation stays a conversation.' },
  { icon: ShieldCheck, title: 'Your domain’s reputation', body: 'SPF, DKIM and DMARC are checked against your domain, and the warm-up ramp holds sending back rather than dropping it.' },
];

const START = [
  { title: 'Create your account', body: 'Free, and it takes a minute. Your workspace is yours alone from the moment it exists.' },
  { title: 'Connect your mailbox', body: 'Your own SMTP and IMAP. Tested before anything is saved, so you know it works.' },
  { title: 'Say what you want', body: 'One sentence. The agent turns it into a plan and shows it to you before creating anything.' },
  { title: 'Approve, then watch', body: 'Nothing sends until you say so, and every figure afterwards is read from the module that owns it.' },
];

const LIMITS = [
  { title: 'Follow-ups need the app open', body: 'The schedule is checked every minute while a tab is open. Nothing goes out with every tab closed.' },
  { title: 'You bring your own mailbox', body: 'Email goes through your SMTP and replies come back over IMAP. Your sending reputation stays yours.' },
  { title: 'It says so when it cannot tell', body: 'Where an answer is unknown it says unknown, and a rate over four sends is not shown as a rate.' },
];

const SCENES: Scene[] = [
  {
    id: 'hero', chapter: 'Intro', eyebrow: 'For agencies & growing teams',
    lead: 'Everything it takes to', emph: 'win the next customer.',
    body: 'Find the people worth contacting, write to them, book the meeting and see what actually '
      + 'worked — in one place, on your own mailbox, with every step visible and editable before it happens.',
    shot: { src: SHOT('dashboard'), alt: 'The dashboard, showing the day at a glance' },
    tone: 'dark',
  },
  {
    id: 'dashboard', chapter: 'Products', eyebrow: 'Dashboard',
    lead: 'Open it once', emph: 'and know where you stand.',
    body: 'Not a wall of charts. The three things worth acting on this morning, each counted from '
      + 'your own records rather than estimated.',
    views: [
      view('dash-kpis', 'Counted from your own records, not estimated', 'Open pipeline and revenue won for the week', 560, 180),
      view('dash-next', 'What to do next, ranked by lift', 'A ranked list of the next actions', 600, 262),
    ],
  },
  {
    id: 'agent', chapter: 'Products', eyebrow: 'AI Sales Agent',
    lead: 'Describe the outcome.', emph: 'It builds the campaign.',
    body: 'Write what you want in a sentence. The agent works out who to reach and how, shows you the '
      + 'plan before anything exists, then creates the real contacts, the real sequence and the real enrolments.',
    views: [
      view('agent-objective', 'Your sentence, kept word for word', 'The objective, stored verbatim', 620, 146),
      view('agent-metrics', 'Every figure read live from the module that owns it', 'Prospects found, enrolled, sent, opened and replied', 600, 192),
    ],
    points: [
      'Every plan is editable before a record is created',
      'Nothing sends until you say it may',
      'Percentages appear only once the sample can carry them',
    ],
  },
  {
    id: 'flow', chapter: 'Products', eyebrow: 'The campaign canvas',
    lead: 'Drag the nodes.', emph: 'Join the ports. Press Run.',
    body: 'The same campaign as a graph you can rearrange — objective, plan, prospects, build, '
      + 'send, measure, rewrite. Pull a wire from one port to another and the run follows it, '
      + 'handing each step to the module that already owns it.',
    shot: { src: SHOT('flow'), alt: 'The campaign canvas, with nodes joined by wires' },
    points: [
      'Wires only join ports that carry the same thing',
      'Skip a node and everything downstream of it stands down',
      'Each node shows what it knows, read live',
    ],
    tone: 'dark',
  },
  {
    id: 'email', chapter: 'Products', eyebrow: 'Email & Sequences',
    lead: 'Cadences that stop', emph: 'the moment somebody answers.',
    body: 'Multi-step sequences on your own SMTP, with merge fields, open and click tracking, bounce '
      + 'suppression and a warm-up ramp that refuses to send past the day’s allowance.',
    views: [
      view('mkt-stats', 'Sent, opened, replied — across every campaign', 'Totals across all campaigns', 580, 114),
      view('mkt-list', 'Campaigns, with the sequence that produced them', 'The campaign list', 620, 310),
    ],
    points: [
      'A/B test any step',
      'Hard bounces suppressed on the first rejection',
      'A daily cap holds messages back rather than dropping them',
    ],
  },
  {
    id: 'contacts', chapter: 'Products', eyebrow: 'Contacts',
    lead: 'The record of', emph: 'everyone you have spoken to.',
    body: 'Custom fields, notes, tasks and a full activity history, with a command centre that shows '
      + 'what each person has opened, clicked and replied to.',
    views: [
      view('contacts-filters', 'Filter by status, stage, owner or tag', 'Contact filters and segments', 620, 240),
      view('contacts-table', 'Health, stage and pipeline on every row', 'The contact table', 620, 400),
    ],
    points: [
      'Import a list, deduplicate on the way in',
      'Timezone inferred from the number when it is not set',
      'Every record traceable to what created it',
    ],
  },
  {
    id: 'pipelines', chapter: 'Products', eyebrow: 'Pipelines',
    lead: 'Deals you can', emph: 'actually see moving.',
    body: 'Drag-and-drop stages you define, weighted forecasting, and board, list, table, calendar, '
      + 'funnel and Gantt views of the same deals.',
    views: [
      view('pipe-summary', 'Open value, and the same value weighted by probability', 'Pipeline totals', 580, 142),
      view('pipe-board', 'Stages you define, dragged straight across', 'The deal board', 600, 420),
    ],
    points: [
      'Stages, fields and priorities you set',
      'Automations on stage change',
      'Weighted value by probability',
    ],
  },
  {
    id: 'calendar', chapter: 'Products', eyebrow: 'Calendar & Booking',
    lead: 'An interested reply', emph: 'becomes a meeting.',
    body: 'Booking pages on your real availability, so nobody spends four emails agreeing on Tuesday. '
      + 'Meetings land in the calendar and back on the campaign that produced them.',
    views: [
      view('cal-week', 'The week, on one grid', 'The week view', 600, 420),
      view('cal-upcoming', 'What is booked, and who booked it', 'Upcoming appointments', 352, 380),
    ],
    points: [
      'Booking pages work for signed-out visitors',
      'Reminders before the meeting',
      'Meetings trace back to the campaign',
    ],
  },
  {
    id: 'lifecycle', chapter: 'How it runs', eyebrow: 'How a campaign runs',
    lead: 'Seven steps, and', emph: 'you can stop it at any of them.',
    extra: (
      <ol className="mesh lifecycle" style={{
        margin: 0, padding: 0, listStyle: 'none',
        /* Four across, so seven steps land 4 + 3 rather than 6 + 1. */
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
      }}>
        {LIFECYCLE.map(s => (
          <li key={s.n}>
            <span className="mono" style={{ color: 'var(--lime-deep)' }}>{s.n}</span>
            <h3 className="card-title">{s.title}</h3>
            <p className="card-body">{s.body}</p>
          </li>
        ))}
      </ol>
    ),
  },
  {
    id: 'agency', chapter: 'How it runs', eyebrow: 'Run it as an agency',
    lead: 'One login,', emph: 'every client kept apart.',
    body: 'Each client is a sub-account with its own contacts, pipelines and campaigns. Nothing leaks '
      + 'between them, and the separation is enforced on the server rather than by the interface hiding things.',
    extra: (
      <div className="mesh" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))' }}>
        {AGENCY.map(a => (
          <div key={a.title}>
            <span className="glyph soft" style={{ marginBottom: 9 }}><a.icon size={13} strokeWidth={2.2} /></span>
            <h3 className="card-title">{a.title}</h3>
            <p className="card-body">{a.body}</p>
          </div>
        ))}
      </div>
    ),
    tone: 'dark',
  },
  {
    id: 'own', chapter: 'How it runs', eyebrow: 'Your mailbox, your reputation',
    lead: 'It sends from you,', emph: 'not from us.',
    body: 'Connect your own SMTP and replies come back over your own IMAP. Nothing is relayed through '
      + 'a shared pool, so your deliverability is the result of how you send rather than of who else '
      + 'happens to be on the same server.',
    extra: (
      <div className="mesh" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))' }}>
        {OWNERSHIP.map(o => (
          <div key={o.title}>
            <span className="glyph soft" style={{ marginBottom: 9 }}><o.icon size={13} strokeWidth={2.2} /></span>
            <h3 className="card-title">{o.title}</h3>
            <p className="card-body">{o.body}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'included', chapter: 'Included', eyebrow: 'Everything included',
    lead: 'No add-ons, no tiers,', emph: 'no second tool to keep in sync.',
    extra: (
      <div style={{
        display: 'grid', gap: 'clamp(9px, 1.2vw, 14px)',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))',
      }}>
        {CAPABILITIES.map(c => {
          const Glyph = GROUP_ICON[c.group] ?? Check;
          return (
            <div key={c.group} className="tile">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="glyph soft"><Glyph size={13} strokeWidth={2.2} /></span>
                <span className="card-title">{c.group}</span>
              </span>
              <ul style={{ margin: '9px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {c.items.map(i => <li key={i} className="card-body">{i}</li>)}
              </ul>
            </div>
          );
        })}
      </div>
    ),
  },
  {
    id: 'answers', chapter: 'Straight answers', eyebrow: 'Straight answers',
    lead: 'The three things everybody', emph: 'finds out in week one.',
    extra: (
      <div style={{
        display: 'grid', gap: 'clamp(10px, 1.6vw, 18px)',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))',
      }}>
        {LIMITS.map(l => (
          <div key={l.title} className="tile" style={{ padding: 'clamp(15px, 2vw, 22px)' }}>
            <span className="glyph soft" style={{ marginBottom: 10 }}><Info size={13} strokeWidth={2.2} /></span>
            <h3 className="card-title">{l.title}</h3>
            <p className="card-body">{l.body}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'start', chapter: 'Start', eyebrow: 'Free to try',
    lead: 'Point it at your list and', emph: 'watch it show its working.',
    body: 'Create your account, connect your own mailbox, write one sentence about what you want, '
      + 'and approve the plan before anything is created. Four steps, and you can stop at any of them.',
    extra: (
      <ol className="steps">
        {START.map((s, i) => (
          <li key={s.title}>
            <span className="mono step-n">{String(i + 1).padStart(2, '0')}</span>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </li>
        ))}
      </ol>
    ),
    tone: 'dark',
  },
];

/* ── Pieces ───────────────────────────────────────────────────────────── */

/**
 * A way in.
 *
 * On protectedcentral.com the product is another origin, so this has to be a
 * real link the browser follows; anywhere the two live together it is a router
 * navigation, and either way it is an anchor rather than a button — a way into
 * a site belongs in the address bar, in the right-click menu and in whatever
 * a crawler makes of the page.
 */
function AppLink({ to, className, children }: { to: string; className?: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  const href = appHref(to);
  const onClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    /* Off-origin, or the visitor asked for a new tab: leave it to the browser. */
    if (isCrossOrigin(href) || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  }, [href, navigate, to]);
  return <a className={className} href={href} onClick={onClick}>{children}</a>;
}

function Heading({ lead, emph, as = 'h2' }: { lead: string; emph: string; as?: 'h1' | 'h2' }) {
  const Tag = as;
  return (
    <Tag style={{
      margin: 0, maxWidth: 620, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.13,
      fontSize: as === 'h1' ? 'clamp(34px, 4.6vw, 60px)' : 'clamp(26px, 3.1vw, 40px)',
    }}>
      <span className="lead">{lead} </span>
      <span className="emph">{emph}</span>
    </Tag>
  );
}

/* ── The page ─────────────────────────────────────────────────────────── */

export default function SiteHome() {
  const name = activeBranding().appName;

  const stage = useRef<(HTMLElement | null)[]>([]);
  const copy = useRef<(HTMLElement | null)[]>([]);
  const shots = useRef<(HTMLElement | null)[]>([]);
  /* The individual lines inside a scene, so they can arrive in order rather
     than the whole block sliding in as one slab. */
  const pieces = useRef<(HTMLElement[] | null)[]>([]);
  const rail = useRef<HTMLDivElement | null>(null);
  const [current, setCurrent] = useState(0);
  const shown = useRef(0);

  /**
   * One frame. Styles are written straight onto the nodes: putting this in
   * state would re-render ten scenes sixty times a second.
   */
  const paint = useCallback((u: number) => {
    /*
     * How far a line travels as it arrives.
     *
     * On a wide screen the copy and the screen sit side by side and 22px of
     * travel is just movement. Stacked on a phone they are one above the other
     * with a 14px gap, and a line still 22px below its resting place is a line
     * sitting on top of the screenshot — which is exactly what the last bullet
     * did for the whole of its entrance.
     */
    const rise = window.innerWidth < 760 ? 10 : 22;

    for (let i = 0; i < SCENES.length; i++) {
      const el = stage.current[i];
      if (!el) continue;
      const t = u - i;

      /* Off screen in either direction: hidden, and cheap. */
      if (t < -1.05 || t > 1.05) {
        if (el.style.visibility !== 'hidden') { el.style.visibility = 'hidden'; el.style.opacity = '0'; }
        continue;
      }
      el.style.visibility = 'visible';

      const inA = smoothstep(-0.62, -0.05, t);
      const outA = 1 - smoothstep(0.34, 0.92, t);
      el.style.opacity = String(inA * outA);
      /* The whole scene drifts up as it passes, so the eye is carried rather
         than cut to. */
      el.style.transform = `translate3d(0, ${mix(46, -46, clamp01((t + 0.6) / 1.5))}px, 0)`;

      const c = copy.current[i];
      if (c) {
        c.style.transform = `translate3d(0, ${mix(30, -30, clamp01((t + 0.55) / 1.4))}px, 0)`;
        c.style.opacity = String(smoothstep(-0.5, 0.0, t) * (1 - smoothstep(0.4, 0.85, t)));

        /*
         * Each line lags a little behind the one above it, so the scene reads
         * as being written rather than pasted. Cached on first sight: querying
         * the DOM sixty times a second for fourteen scenes is wasteful.
         *
         * Every line's fade has to *finish before* the scene is centred, and
         * the old numbers did not. The window was (-0.42 + lag, 0.06 + lag)
         * with lag = k * 0.07, so the fifth line's window still ran to t = 0.34
         * — and at t = 0, where a scene rests while you read it, that line sat
         * at 20% opacity and the paragraph above it at 62%. Permanently. Every
         * section on the site was showing its body copy and its bullets
         * half-faded, which is most of what "the text is not visible" was.
         *
         * Now the whole staircase lands by t = -0.09: the last line is opaque
         * slightly before the scene stops moving, and stays that way.
         */
        const kids = pieces.current[i] ?? (pieces.current[i] = [...c.querySelectorAll<HTMLElement>('[data-rise]')]);
        for (let k = 0; k < kids.length; k++) {
          const from = -0.78 + k * 0.055;
          const a = smoothstep(from, from + 0.32, t);
          kids[k].style.opacity = String(a);
          kids[k].style.transform = `translate3d(0, ${mix(rise, 0, a)}px, 0)`;
        }
      }

      const s = shots.current[i];
      if (s) {
        /* The screen lands: it arrives small and tilted away, grows and squares
           up as it comes into place, then leans off again.

           Every term here is written to be exactly zero at t = 0. The frame is
           now wide enough to reach the edge of the band it sits on, so the
           resting offset and the resting scale of 1.03 the earlier numbers left
           behind are the difference between a picture that fits the screen and
           one whose right-hand edge is past it. */
        const settle = smoothstep(-0.62, -0.02, t);
        const past = smoothstep(0.3, 1.0, t);
        const drift = t < -1.1 ? -1.1 : t > 1.1 ? 1.1 : t;
        s.style.transform = [
          `perspective(1700px)`,
          `translate3d(${-drift * 64}px, ${-drift * 88}px, 0)`,
          `rotateY(${mix(-16, 0, settle) + past * 10}deg)`,
          `rotateX(${mix(11, 0, settle) + past * 4.5}deg)`,
          `scale(${mix(0.82, 1, settle) - past * 0.08})`,
        ].join(' ');
        s.style.opacity = String(smoothstep(-0.55, -0.05, t) * (1 - smoothstep(0.42, 0.95, t)));
        /* How far in this scene is, for the sheen that crosses the glass as it
           settles and for the glow that comes up behind it. */
        s.style.setProperty('--in', String(settle));
      }
    }

    /* The rail is the only thing that needs React, and only when it changes. */
    const next = Math.max(0, Math.min(SCENES.length - 1, Math.round(u)));
    if (next !== shown.current) { shown.current = next; setCurrent(next); }
    if (rail.current) rail.current.style.setProperty('--at', String(clamp01(u / (SCENES.length - 1))));
  }, []);

  const scene = useScrollScene(SCENES.length, SCENE_VH, paint);

  const chapter = SCENES[current].chapter;
  const withinChapter = useMemo(() => {
    const all = SCENES.filter(s => s.chapter === chapter);
    return { n: all.findIndex(s => s.id === SCENES[current].id) + 1, of: all.length };
  }, [chapter, current]);

  return (
    <div className="site scene-root">
      {/*
        The document's height is what there is to scroll, and it stops on the
        last scene rather than past it. One scene occupies SCENE_VH of scroll,
        so the last one is centred at (n - 1) strides; a document any taller
        than that scrolls on into a screen where every scene has already faded
        out, which is the blank page you used to land on at the bottom.
      */}
      <div className="scene-spacer"
        style={{ height: `calc(${(SCENES.length - 1) * SCENE_VH}vh + 100vh)` }} />

      <div className="scene-stage" aria-hidden="false">
        {SCENES.map((s, i) => (
          <section
            key={s.id}
            ref={el => { stage.current[i] = el; }}
            className={s.tone === 'dark' ? 'scene dark' : 'scene'}
            aria-label={s.eyebrow}
          >
            {s.tone === 'dark' && <span className="beam" />}
            {/* A scene with close-ups stacks: centred copy above, the views
                below it across the full width. A scene with one whole window
                keeps the two-column layout, which is what that picture wants. */}
            <div className="scene-inner" data-wide={!s.shot} data-views={!!s.views}>
              <div className="scene-copy" ref={el => { copy.current[i] = el; }}>
                <span className="chip" data-rise>{s.eyebrow}</span>
                <div data-rise style={{ marginTop: 16 }}>
                  <Heading as={i === 0 ? 'h1' : 'h2'} lead={s.lead} emph={s.emph} />
                </div>
                {s.body && (
                  <p data-rise style={{
                    margin: '16px 0 0', maxWidth: 460,
                    fontSize: 'clamp(15px, 1.15vw, 15.5px)', lineHeight: 1.68,
                    color: s.tone === 'dark' ? 'var(--on-dark-mute)' : 'var(--text-mute)',
                  }}>
                    {s.body}
                  </p>
                )}
                {s.points && (
                  <ul style={{ margin: '16px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {s.points.map(p => (
                      <li key={p} data-rise style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 'clamp(13.5px, 1vw, 13px)', lineHeight: 1.5, color: 'var(--text-mute)' }}>
                        <span className="glyph soft" style={{ width: 19, height: 19, borderRadius: 6, marginTop: 1, flexShrink: 0 }}>
                          <Check size={11} strokeWidth={3} />
                        </span>
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
                {(i === 0 || s.id === 'start') && (
                  <div data-rise style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 24 }}>
                    <AppLink to="/signup" className="btn btn-primary">
                      Sign up free <ArrowRight size={13} />
                    </AppLink>
                    <AppLink to="/login" className="btn btn-quiet">
                      Sign in <ArrowUpRight size={12} />
                    </AppLink>
                  </div>
                )}
                {s.extra && <div data-rise style={{ marginTop: 20 }}>{s.extra}</div>}
              </div>

              {s.views && (
                /*
                  Several close-ups of one module, each on the function it is
                  making a case for. They arrive one after another rather than
                  together — a row of three appearing at once reads as a
                  decorative strip, while three arriving in order reads as an
                  argument being made.
                */
                <div className="views" ref={el => { shots.current[i] = el; }} data-n={s.views.length}>
                  {s.views.map((v, k) => (
                    <figure className="view" key={v.src} style={{ '--k': k } as React.CSSProperties}>
                      <div className="view-frame">
                        <img src={v.src} alt={v.alt} loading={i < 2 ? 'eager' : 'lazy'} width={v.w} height={v.h} />
                        <span className="view-sheen" aria-hidden="true" />
                        <span className="view-pulse" aria-hidden="true" />
                      </div>
                      <figcaption className="view-label">{v.label}</figcaption>
                    </figure>
                  ))}
                </div>
              )}

              {s.shot && (
                /*
                  The screen is the argument, so it is given the room: a wide
                  frame that runs out past the text column, lit from behind,
                  breathing on its own while the scroll flies it in.
                */
                <figure className="shot" ref={el => { shots.current[i] = el; }}>
                  <span className="shot-glow" aria-hidden="true" />
                  <div className="shot-frame">
                    <span className="shot-bar" aria-hidden="true">
                      <i /><i /><i />
                      <span className="shot-tab mono">{s.eyebrow}</span>
                    </span>
                    <span className="shot-screen">
                      <img src={s.shot.src} alt={s.shot.alt} loading={i < 2 ? 'eager' : 'lazy'} width={1400} height={903} />
                      <span className="shot-sheen" aria-hidden="true" />
                    </span>
                  </div>
                </figure>
              )}
            </div>
          </section>
        ))}
      </div>

      <header className="scene-chrome scene-top">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
          <LogoMark size={26} />
          <span className="wordmark">{name}</span>
        </span>
        <span className="strapline mono">Every step, in the open.</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <AppLink to="/login" className="btn btn-quiet">Sign in</AppLink>
          <AppLink to="/signup" className="btn btn-primary">Sign up <ArrowRight size={13} /></AppLink>
        </span>
      </header>

      <footer className="scene-chrome scene-bottom">
        <span className="scene-chapter" style={{ display: 'flex', alignItems: 'baseline', gap: 11, minWidth: 0 }}>
          <span className="mono" style={{ color: 'var(--text)' }}>{chapter}</span>
          {withinChapter.of > 1 && (
            <span className="mono scene-count">{withinChapter.n} / {withinChapter.of}</span>
          )}
        </span>

        <div className="scene-rail" ref={rail} role="tablist" aria-label="Sections">
          <span className="scene-progress" aria-hidden="true" />
          {SCENES.map((s, i) => (
            <button key={s.id} role="tab" aria-selected={i === current} aria-label={s.eyebrow}
              title={s.eyebrow} className="tick" onClick={() => scene.scrollTo(i)} />
          ))}
        </div>

        {/* There is nothing under the last scene any more, so it stops asking. */}
        <span className="mono scroll-hint">
          {current === SCENES.length - 1
            ? 'End'
            : <>Scroll <ChevronDown size={12} style={{ verticalAlign: -2 }} /></>}
        </span>
      </footer>
    </div>
  );
}
