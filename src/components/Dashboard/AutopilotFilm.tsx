/**
 * "See AI Autopilot work" — the explainer film on the dashboard hero.
 *
 * ── Why a film, and why drawn rather than recorded ──
 *
 * The owner's brief (2026-11-12): instead of describing Autopilot's features
 * as a row of buttons, show them — a film in three parts: what it does and
 * how it works (live talk, solving while you speak), the baby steps of
 * setting it up by talking / recording / typing, and results across many
 * kinds of US business.
 *
 * It is drawn by the page, scene by scene, rather than shipped as an MP4:
 * the words are the product's real words and buttons (a recorded screen goes
 * stale the day a label changes), it is crisp at every width, it costs no
 * download, it can be paused, scrubbed and read by a screen reader, and its
 * captions are text. It behaves like a video — play, pause, chapters, a
 * scrubber, a clock, narration — because that is what people know how to use.
 *
 * ── The second pass (owner, 2026-11-13) ──
 *
 * The first version was a 300px strip with a cursor that swooped in from a
 * fixed offset, scenes that popped in, and text that reflowed as it typed;
 * the owner found it glitchy and hard to follow and asked for a full-width,
 * YouTube-shaped film. So:
 *
 *  - The picture is 16:9 at the hero column's width (capped to the window's
 *    height, dashboard.css). Every scene is laid out once at a fixed design
 *    size — 1200, 960 or 640 wide, chosen by the frame's width so the text
 *    stays readable on a phone — and scaled with one transform. Nothing in a
 *    scene changes size while it plays: typed words are laid out in full and
 *    only revealed, bubbles and rows hold their place before they show.
 *  - Scenes cross-fade (opacity only) instead of remounting with a jump.
 *  - The pointer is the site demo's (Site/AutopilotDemo.tsx): each scene
 *    names its targets (`data-k`) and when to reach them; the pointer measures
 *    the real element, travels there from wherever it is on a slight arc with
 *    a minimum-jerk profile (longer reaches take longer), and a click shows a
 *    ripple and a ring on the target. It runs on its own clock, so a seek or
 *    a new scene sends it on from where it was — it never teleports.
 *
 * ── Honesty ──
 *
 * Part three shows example businesses and example job values so a customer
 * can picture money arriving; nothing on a customer screen may pass for a
 * real result (CLAUDE.md: no invented figures). So every result scene is
 * labelled "Example scenario — an illustration, not a customer's results",
 * each amount is a typical price for that job, not a claim about earnings,
 * and there are no totals, percentages or testimonials.
 *
 * ── Motion ──
 *
 * One clock (`t`, ms), advanced by requestAnimationFrame only while playing,
 * on screen and the tab visible. Every scene is a pure function of its own
 * progress (0..1), so seeking anywhere draws the right frame. It plays by
 * itself only when it is on screen and the person has not asked their device
 * for less motion; under reduced motion it waits for Play, the CSS
 * transitions are off and there is no pointer (autopilotFilm.css).
 * Narration is off until asked for, and is Protron's warm AI voice — the
 * owner asked for "exactly the live bot's voice" (2026-11-12). Its lines live
 * in services/filmNarration.ts; the server makes each once per install and
 * keeps it (protron.php `narrate`), so a line heard before costs nothing.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { exampleLine, FILM_PEOPLE, FILM_SAY } from '../../services/filmNarration';
import { narrator, unlockAudio } from '../../services/protron/voice';
import {
  AirVent, ArrowRight, AudioLines, BarChart3, Briefcase, CalendarCheck, Check, CircleDollarSign, Clock, FlaskConical,
  GraduationCap, Hammer, House, Keyboard, LayoutDashboard, LayoutTemplate, Link2, Loader, Mail, Megaphone, MessageSquare,
  Mic, Pause, Play, Plus, Presentation, Receipt, RefreshCw, Scale, Search, Send, Share2, ShieldCheck, ShoppingBag,
  SkipBack, SkipForward, Smile, Sparkles, SprayCan, Square, SquareCheck, Star, Trophy, UserPlus, Users, Volume2,
  VolumeX, Wrench, Zap,
} from 'lucide-react';
import ProtronAvatar from '../Protron/ProtronAvatar';
import { LogoMark } from '../shared/Logo';
import { motionReduced } from '../../services/motion';
import './autopilotFilm.css';

type Icon = typeof Mail;
/**
 * Where the pointer goes in a scene: from progress `at`, to the element marked
 * `data-k={k}`; a click at `click`; `say` is the label beside it, naming what
 * it is doing, the way an AI agent's cursor does.
 */
type Aim = { at: number; k: string; click?: number; say?: string };
type Scene = { ch: number; ms: number; say: string; draw: (p: number) => ReactNode; aim?: Aim[] };

/* The owner, 2026-11-13: the main story is Protron using the app itself —
   opening modules, writing the prompt, building and launching the campaign —
   then watching it, A/B testing, rewriting and reporting back. */
const CHAPTERS = ['What it does', 'Set it up', 'Runs your app', 'Watches & improves', 'Results'];

const clamp = (n: number) => Math.max(0, Math.min(1, n));
/** Progress of a sub-span of a scene: 0 before `a`, 1 after `b`. */
const span = (p: number, a: number, b: number) => clamp((p - a) / Math.max(0.0001, b - a));
const on = (p: number, at: number) => (p >= at ? ' is-on' : '');
const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** Long enough to read (and for the narrator to say) the caption. */
const fit = (ms: number, say: string) => Math.max(ms, say.split(/\s+/).length * 360 + 900);

/** Text that types itself without moving anything: every character is laid out from the start and only shown. */
function Typed({ text, p }: { text: string; p: number }) {
  const chars = Array.from(text);
  const n = Math.round(chars.length * clamp(p));
  return (
    <span className="apf-typed" aria-label={text}>
      {chars.map((c, i) => <span key={i} aria-hidden="true" className={i < n ? (i === n - 1 && n < chars.length ? 'is-on is-caret' : 'is-on') : undefined}>{c}</span>)}
    </span>
  );
}

function Wave({ live, bars = 18 }: { live: boolean; bars?: number }) {
  return (
    <span className={`apf-wave${live ? ' is-live' : ''}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => <i key={i} style={{ animationDelay: `${(i * 97) % 700}ms` }} />)}
    </span>
  );
}

function FlowNode({ icon: I, label, sub, shown, last, k }: { icon: Icon; label: string; sub?: string; shown: boolean; last?: boolean; k?: string }) {
  return (
    <div className="apf-node-wrap">
      <div className={`apf-node${shown ? ' is-on' : ''}`} data-k={k}>
        <span className="apf-node-ic"><I size={15} /></span>
        <span className="apf-node-tx"><b>{label}</b>{sub && <small>{sub}</small>}</span>
        <Check size={14} className="apf-node-ok" />
      </div>
      {!last && <span className={`apf-node-link${shown ? ' is-on' : ''}`} aria-hidden="true" />}
    </div>
  );
}

/* ── Part one: what it does ── */

const CAPS: { icon: Icon; label: string; t: string }[] = [
  { icon: Search, label: 'Finds customers', t: 'Searches for the kind of customer you describe' },
  { icon: Mail, label: 'Writes & sends emails', t: 'From your own mailbox, in your voice' },
  { icon: MessageSquare, label: 'Answers replies', t: 'Drafts an answer to every reply' },
  { icon: Share2, label: 'Posts to social', t: 'On the days your plan says' },
  { icon: LayoutTemplate, label: 'Builds pages & funnels', t: 'Pages and forms that capture leads' },
  { icon: CalendarCheck, label: 'Books appointments', t: 'Straight into your calendar' },
  { icon: Receipt, label: 'Invoices & chases payment', t: 'With a payment link, then a reminder' },
  { icon: Star, label: 'Asks for reviews', t: 'Once the job is done' },
];

const MANUAL = [
  'Search for leads by hand',
  'Write every email yourself',
  'Chase each reply',
  'Back-and-forth to book a time',
  'Send invoices, chase payment',
  'Post on social when you remember',
];

const RUNS: { icon: Icon; label: string }[] = [
  { icon: Search, label: 'Finds homeowners who need a water heater' },
  { icon: Mail, label: 'Writes and sends the first email' },
  { icon: MessageSquare, label: 'Follows up, answers replies' },
  { icon: CalendarCheck, label: 'Books the visit' },
  { icon: Receipt, label: 'Sends the invoice' },
];

const TALK: { who: 'you' | 'pt'; text: string; a: number; b: number }[] = [
  { who: 'you', text: 'I’m a plumber in Phoenix. I want more water-heater jobs.', a: 0.02, b: 0.3 },
  { who: 'pt', text: 'Got it. Which neighbourhoods, and do you text or email quotes?', a: 0.34, b: 0.56 },
  { who: 'you', text: 'Scottsdale and Tempe. Both — text first.', a: 0.6, b: 0.78 },
];

const BUILD: { icon: Icon; label: string; sub: string; at: number }[] = [
  { icon: Search, label: 'Find homeowners', sub: 'Scottsdale, Tempe', at: 0.22 },
  { icon: MessageSquare, label: 'Text, then email a quote offer', sub: 'Waits for your OK', at: 0.46 },
  { icon: Mail, label: 'Follow up after 2 days', sub: 'If there is no reply', at: 0.66 },
  { icon: CalendarCheck, label: 'Book the visit', sub: 'Into your calendar', at: 0.8 },
  { icon: Receipt, label: 'Invoice with a payment link', sub: 'When the job is done', at: 0.9 },
];

/* ── Part two: the baby steps ── */

const STEPS = [
  'Press Talk live — or Record, or type',
  'Say what your business does and what you want',
  'Answer a few short questions',
  'It writes your smart prompt and plan',
  'It builds the workflow, step by step',
  'Choose what needs your OK, then switch it on',
];

function StepFrame({ n, p, children }: { n: number; p: number; children: ReactNode }) {
  return (
    <div className="apf-steps">
      <ol className="apf-rail">
        {STEPS.map((s, i) => (
          <li key={s} className={i < n ? 'is-done' : i === n ? 'is-now' : ''}>
            <span className="apf-rail-n">{i < n ? <Check size={12} /> : i + 1}</span>
            <span className="apf-rail-tx">{s}</span>
          </li>
        ))}
      </ol>
      <div className="apf-mock">
        <div className="apf-mock-h">
          <span className="apf-mock-ic"><Sparkles size={14} /></span>
          <b>AI Autopilot</b>
          <span className="apf-mock-step">Step {n + 1} of {STEPS.length}</span>
        </div>
        <div className="apf-mock-body">{children}</div>
        <span className="apf-mock-bar" style={{ transform: `scaleX(${p.toFixed(4)})` }} aria-hidden="true" />
      </div>
    </div>
  );
}

/* ── Parts three and four: Protron in the app ──
 *
 * The app itself on screen — its modules down the side, as in the real
 * sidebar — with Protron's pointer opening them and doing the work. One
 * example business throughout (the electrician in Dallas set up in part
 * two), and every frame says it is an example: the counts, rates and
 * prospects in it are an illustration, never a customer's results. */

type NavKey = 'dashboard' | 'autopilot' | 'contacts' | 'campaigns' | 'booking' | 'reports';
const NAV: { k: NavKey; icon: Icon; label: string }[] = [
  { k: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { k: 'autopilot', icon: Sparkles, label: 'AI Autopilot' },
  { k: 'contacts', icon: Users, label: 'Contacts' },
  { k: 'campaigns', icon: Mail, label: 'Email campaigns' },
  { k: 'booking', icon: CalendarCheck, label: 'Booking pages' },
  { k: 'reports', icon: BarChart3, label: 'Reports' },
];

/** The app's window: sidebar, a breadcrumb, the honesty label, and the module's view. `open` false shows a dimmed placeholder until the module is opened. */
function AppFrame({ nav, crumb, open = true, children }: { nav: NavKey; crumb: string; open?: boolean; children: ReactNode }) {
  return (
    <div className="apf-app">
      <div className="apf-app-top">
        <LogoMark size={20} />
        <b className="apf-app-brand">Protected Central</b>
        <span className="apf-app-crumb">{crumb}</span>
        <span className="apf-tag">Example scenario — an illustration, not a customer’s results</span>
      </div>
      <div className="apf-app-body">
        <nav className="apf-app-nav">
          {NAV.map(n => (
            <span key={n.k} data-k={`nav-${n.k}`} className={`apf-app-nav-i${n.k === nav ? ' is-now' : ''}`}><n.icon size={15} /><i>{n.label}</i></span>
          ))}
        </nav>
        <div className="apf-app-main">
          <div className={`apf-app-skel${open ? '' : ' is-on'}`} aria-hidden="true"><i /><i /><i /><i /></div>
          <div className={`apf-app-view${open ? ' is-on' : ''}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}

const PROSPECTS: [string, string][] = [
  ['Homeowner — Plano, TX', 'House built 1994'],
  ['Homeowner — Frisco, TX', 'Asked about an EV charger'],
  ['Homeowner — Dallas, TX', 'House built 1988'],
  ['Homeowner — Richardson, TX', 'Asked about a panel upgrade'],
  ['Homeowner — Garland, TX', 'House built 1979'],
  ['Homeowner — Plano, TX', 'Moved in last month'],
];

const STATS: { k: string; icon: Icon; label: string; n: number }[] = [
  { k: 'st-sent', icon: Send, label: 'Sent', n: 240 },
  { k: 'st-replies', icon: MessageSquare, label: 'Replies', n: 19 },
  { k: 'st-booked', icon: CalendarCheck, label: 'Appointments booked', n: 6 },
  { k: 'st-sales', icon: CircleDollarSign, label: 'Sales', n: 3 },
];

const REPORT: { icon: Icon; text: ReactNode }[] = [
  { icon: RefreshCw, text: <>I <b>improved the follow-up email</b> — replies were slow, so I moved the offer to the first line and made it shorter.</> },
  { icon: FlaskConical, text: <><b>Subject B won the A/B test</b>, so every new prospect now gets B.</> },
  { icon: UserPlus, text: <>I <b>added 24 new prospects</b> to <i>Panel upgrades — Dallas</i> and <b>12</b> to <i>Spring tune-up — Plano</i>.</> },
  { icon: CalendarCheck, text: <><b>3 appointments</b> were booked this week. They’re on your calendar.</> },
];

const FEED: [Icon, string][] = [
  [MessageSquare, 'Reply from a homeowner in Plano — “Is Thursday free?”'],
  [CalendarCheck, 'Appointment booked — Thu 10:00 am, Plano'],
  [CircleDollarSign, 'Sale — panel upgrade · $2,400'],
];

const PLAN: [Icon, string][] = [[Search, 'Find homeowners'], [Mail, 'Email campaign'], [CalendarCheck, 'Booking page'], [RefreshCw, 'Follow-ups']];

/** A count that rises with the scene — tabular figures in a fixed box, so the digits never shift the layout. */
const upTo = (n: number, p: number) => Math.round(n * clamp(p));

/* ── Part five: example businesses ── */

type Example = { icon: Icon; who: string; where: string; said: string; did: [string, string, string]; notes: [string, string, string] };

/* Who and where come from the narration script, so what is said is what is shown. */
const person = (i: number) => ({ who: FILM_PEOPLE[i][0], where: FILM_PEOPLE[i][1] });

const EXAMPLES: Example[] = [
  { icon: Wrench, ...person(0), said: 'More water-heater installs, less time on the phone.',
    did: ['Finds homeowners asking for water-heater help nearby', 'Texts and emails a quote offer', 'Books the visit into the calendar'],
    notes: ['New enquiry — tankless water heater', 'Booked — Thu 9:00 am, Scottsdale', 'Paid — water-heater install · $1,850'] },
  { icon: Zap, ...person(1), said: 'Panel upgrades from homeowners.',
    did: ['Finds older homes in Plano and Frisco', 'Offers a free safety inspection', 'Follows up until the visit is booked'],
    notes: ['Reply — “Can you come this week?”', 'Booked — inspection Tue 1:00 pm', 'Paid — panel upgrade · $2,400'] },
  { icon: House, ...person(2), said: 'Seller leads in Coral Gables.',
    did: ['Finds owners likely to sell', 'Sends a free home-value report', 'Books listing appointments'],
    notes: ['New lead — 3-bed home valuation', 'Booked — listing appointment Sat 11:00', 'Commission received · $11,400'] },
  { icon: Megaphone, ...person(3), said: 'New retainer clients this quarter.',
    did: ['Finds local businesses with weak websites', 'Sends each a personal audit', 'Books discovery calls'],
    notes: ['Reply — “Send me the audit”', 'Booked — discovery call Tue 2:00 pm', 'Retainer signed · $2,500 / month'] },
  { icon: ShoppingBag, ...person(4), said: 'Bring past customers back.',
    did: ['Writes a win-back email series', 'Posts on social every day', 'Recovers abandoned carts'],
    notes: ['Cart recovered — 2 items', 'New order from a returning customer', 'Paid · $186'] },
  { icon: Users, ...person(5), said: 'Fill my one-to-one coaching programme.',
    did: ['Publishes a free-guide page', 'Nurtures every sign-up by email', 'Books strategy calls'],
    notes: ['New sign-up — free guide', 'Booked — strategy call Wed 4:00 pm', 'Paid — coaching package · $1,500'] },
  { icon: GraduationCap, ...person(6), said: 'Enrol students in my SAT prep course.',
    did: ['Builds the course page', 'Emails every parent who asked', 'Sends reminders before the start date'],
    notes: ['Enquiry — SAT prep, grade 11', 'Enrolled — spring cohort', 'Paid — course fee · $480'] },
  { icon: Presentation, ...person(7), said: 'Leadership workshops with HR teams.',
    did: ['Finds HR leads at mid-size firms', 'Sends a workshop outline', 'Books intro calls'],
    notes: ['Reply — “Can you do March?”', 'Booked — intro call Mon 10:00 am', 'Invoice paid — workshop · $6,500'] },
  { icon: Briefcase, ...person(8), said: 'Win operations projects.',
    did: ['Finds COOs at growing companies', 'Sends a short case study', 'Follows up until a call is booked'],
    notes: ['Reply — “Interested, let’s talk”', 'Booked — discovery call Thu 3:00 pm', 'Proposal accepted · $12,000'] },
  { icon: AirVent, ...person(9), said: 'Sell AC maintenance plans before summer.',
    did: ['Emails past customers a tune-up offer', 'Texts reminders to book', 'Takes the payment online'],
    notes: ['New booking — AC tune-up', 'Booked — Fri 8:00 am', 'Paid — maintenance plan · $189'] },
  { icon: Smile, ...person(10), said: 'More implant consultations.',
    did: ['Publishes an implant landing page', 'Answers questions by email', 'Books consultations'],
    notes: ['Enquiry — implant consultation', 'Booked — Mon 9:30 am', 'Deposit paid · $500'] },
  { icon: Hammer, ...person(11), said: 'Storm-damage inspections.',
    did: ['Finds homeowners in affected areas', 'Offers a free roof inspection', 'Books the inspection'],
    notes: ['Reply — “Yes, please inspect”', 'Booked — inspection Sat 10:00 am', 'Deposit paid — new roof · $4,200'] },
  { icon: Scale, ...person(12), said: 'More consultations from families.',
    did: ['Publishes a plain-English guide', 'Follows up with every download', 'Books consultations'],
    notes: ['New download — wills & trusts guide', 'Booked — consultation Wed 11:00 am', 'Paid — estate plan · $1,200'] },
  { icon: SprayCan, ...person(13), said: 'Recurring home-cleaning clients.',
    did: ['Finds new movers nearby', 'Sends a first-clean offer', 'Turns one-offs into weekly plans'],
    notes: ['New enquiry — 2-bed apartment', 'Booked — first clean Tue', 'Paid — weekly plan · $160'] },
];

function ExampleScene({ e, i, p }: { e: Example; i: number; p: number }) {
  return (
    <div className="apf-ex">
      <div className="apf-ex-top">
        <div className="apf-ex-who">
          <span className="apf-ex-ic"><e.icon size={22} /></span>
          <span>
            <b>{e.who}</b>
            <span className="apf-ex-where">{e.where}</span>
          </span>
        </div>
        <span className="apf-tag">Example scenario — an illustration, not a customer’s results</span>
      </div>
      <div className="apf-ex-body">
        <div className="apf-ex-left">
          <p className="apf-ex-said"><Mic size={15} /> <span>“{e.said}”</span></p>
          <span className="apf-ex-h">What AI Autopilot does</span>
          <ul className="apf-ex-did">
            {e.did.map((d, k) => (
              <li key={d} className={on(p, 0.1 + k * 0.13).trim() || undefined}><span className="apf-ex-tick"><Check size={11} strokeWidth={3} /></span> {d}</li>
            ))}
          </ul>
        </div>
        <div className="apf-phone" aria-label="Notifications">
          <span className="apf-phone-h">Notifications</span>
          {e.notes.map((n, k) => (
            <div key={n} className={`apf-note${k === 2 ? ' is-money' : ''}${on(p, 0.3 + k * 0.18)}`}>
              <span className="apf-note-ic">{k === 2 ? <CircleDollarSign size={15} /> : k === 1 ? <CalendarCheck size={15} /> : <MessageSquare size={15} />}</span>
              <span>{n}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="apf-ex-dots" aria-hidden="true">
        {EXAMPLES.map((x, k) => <i key={x.who} className={k === i ? 'is-on' : undefined} />)}
      </div>
    </div>
  );
}

function buildScenes(): Scene[] {
  const s: Scene[] = [];
  const add = (ch: Scene['ch'], ms: number, say: string, draw: Scene['draw'], aim?: Aim[]) => s.push({ ch, ms: fit(ms, say), say, draw, aim });

  /* ── Part one ── */
  add(0, 6500, FILM_SAY.intro, p => (
    <div className="apf-title">
      <span className="apf-kicker">AI Autopilot</span>
      <h3>Your business, on AI Autopilot</h3>
      <p>Talk to it like a business manager. It does the work in this app for you — every day, in the cloud.</p>
      <div className="apf-caps">
        {CAPS.map((c, i) => (
          <div key={c.label} className={`apf-cap${on(p, 0.08 + i * 0.09)}`}>
            <span className="apf-cap-ic"><c.icon size={16} /></span>
            <span><b>{c.label}</b><small>{c.t}</small></span>
          </div>
        ))}
      </div>
    </div>
  ));
  add(0, 7000, FILM_SAY.usual, p => (
    <div className="apf-vs">
      <div className="apf-vs-col">
        <span className="apf-vs-h">The usual way</span>
        <ul className="apf-vs-list">{MANUAL.map((m, i) => <li key={m} className={on(p, 0.1 + i * 0.07).trim() || undefined}><Clock size={14} /> <span>{m}</span></li>)}</ul>
      </div>
      <div className={`apf-vs-col is-auto${on(p, 0.52)}`}>
        <span className="apf-vs-h">On AI Autopilot</span>
        <div className="apf-say"><AudioLines size={16} /> “Find me water-heater jobs in Phoenix.”</div>
        <ul className="apf-runs">
          {RUNS.map((r, i) => (
            <li key={r.label} className={on(p, 0.6 + i * 0.065).trim() || undefined}><span className="apf-runs-ic"><r.icon size={14} /></span> {r.label} <Check size={14} className="apf-runs-ok" /></li>
          ))}
        </ul>
        <p className="apf-guard"><ShieldCheck size={15} /> It asks you before anything important goes out.</p>
      </div>
    </div>
  ));
  add(0, 10000, FILM_SAY.live, p => {
    const speaking = TALK.find(l => p >= l.a && p <= l.b);
    return (
      <div className="apf-live">
        <div className="apf-call">
          <div className="apf-call-head">
            <ProtronAvatar size={48} state={speaking?.who === 'pt' ? 'speaking' : speaking ? 'listening' : 'working'} alive={false} />
            <span><b>Live with Protron</b><span className="apf-rec"><i /> {mmss(p * 28000)}</span></span>
          </div>
          <div className="apf-log">
            {TALK.map(l => (
              <div key={l.text} className={`apf-bub is-${l.who}${on(p, l.a)}`}><Typed text={l.text} p={span(p, l.a, l.b)} /></div>
            ))}
          </div>
          <Wave live={!!speaking} bars={28} />
        </div>
        <div className="apf-build">
          <span className="apf-build-h"><Zap size={14} /> Building while you talk</span>
          {BUILD.map((b, i) => <FlowNode key={b.label} icon={b.icon} label={b.label} sub={b.sub} shown={p >= b.at} last={i === BUILD.length - 1} />)}
        </div>
      </div>
    );
  });
  add(0, 6500, FILM_SAY.ways, p => {
    const ways = [
      { icon: Keyboard, h: 'Type it', t: 'One line is enough to start.' },
      { icon: Mic, h: 'Record it', t: 'Press record, say it, check the words.' },
      { icon: AudioLines, h: 'Talk live', t: 'A real conversation — it asks, you answer.' },
    ];
    const lit = Math.min(2, Math.floor(p * 3.2));
    return (
      <div className="apf-ways">
        {ways.map((w, i) => (
          <div key={w.h} data-k={`way${i}`} className={`apf-way${i === lit ? ' is-lit' : ''}${i === 2 ? ' is-live' : ''}`}>
            <span className="apf-way-ic"><w.icon size={24} /></span>
            <b>{w.h}</b>
            <span>{w.t}</span>
          </div>
        ))}
      </div>
    );
  }, [{ at: 0, k: 'way0', say: 'Type it' }, { at: 0.27, k: 'way1', say: 'Record it' }, { at: 0.58, k: 'way2', click: 0.75, say: 'Or talk live' }]);

  /* ── Part two: six baby steps ── */
  add(1, 5500, FILM_SAY.step1, p => (
    <StepFrame n={0} p={p}>
      <div className="apf-box">
        <span className="apf-box-ph">Describe a result — e.g. find 20 dentists in Austin every day and email them about our offer…</span>
        <div className="apf-box-bar">
          <span className="apf-btn is-rec"><Mic size={14} /> Record</span>
          <span className={`apf-btn is-live${on(p, 0.55)}`} data-k="live"><AudioLines size={14} /> Talk live</span>
          <span className="apf-box-send"><ArrowRight size={16} /></span>
        </div>
      </div>
      <div className={`apf-listen${on(p, 0.62)}`}><Wave live={p >= 0.62} bars={16} /> <b>Live</b> — Protron is listening</div>
    </StepFrame>
  ), [{ at: 0.06, k: 'live', click: 0.52, say: 'Pressing Talk live' }]);
  add(1, 6000, FILM_SAY.step2, p => (
    <StepFrame n={1} p={p}>
      <div className="apf-talkline">
        <span className="apf-talk-h"><Wave live={p < 0.88} bars={22} /> You, speaking</span>
        <p className="apf-said"><Typed text="We’re an electrical contractor in Dallas. I want more panel-upgrade jobs from homeowners." p={span(p, 0.05, 0.82)} /></p>
        <div className={`apf-heard${on(p, 0.88)}`}><ProtronAvatar size={22} alive={false} /> Got it — panel upgrades for homeowners in Dallas.</div>
      </div>
    </StepFrame>
  ));
  add(1, 6000, FILM_SAY.step3, p => (
    <StepFrame n={2} p={p}>
      <div className="apf-qa">
        {[
          ['Where are your customers?', 'Dallas, Plano and Frisco'],
          ['What’s your offer?', 'A free safety inspection with any upgrade'],
          ['Do you have a website?', 'Yes — Protron reads it for you'],
        ].map(([q, a], i) => (
          <div key={q} className={`apf-qa-row${on(p, 0.06 + i * 0.28)}`}>
            <span className="apf-q"><ProtronAvatar size={22} alive={false} /> {q}</span>
            <span className={`apf-a${on(p, 0.18 + i * 0.28)}`}>{a}</span>
          </div>
        ))}
      </div>
    </StepFrame>
  ));
  add(1, 6500, FILM_SAY.step4, p => (
    <StepFrame n={3} p={p}>
      <div className="apf-prompt">
        <b>Your smart optimized prompt for AI Autopilot</b>
        <p><Typed text="Find homeowners in Dallas, Plano and Frisco with older electrical panels. Offer a free safety inspection with any upgrade. Text first, then email. Follow up twice. Book visits into my calendar and send an invoice when the job is done." p={span(p, 0.04, 0.62)} /></p>
        <div className="apf-chips">
          {['Find', 'Text & email', 'Follow up', 'Book', 'Invoice'].map((c, i) => <span key={c} className={`apf-chip${on(p, 0.64 + i * 0.04)}`}>{c}</span>)}
        </div>
        <div className="apf-prompt-foot">
          <span className="apf-btn">Change something</span>
          <span className={`apf-btn is-go${on(p, 0.88)}`} data-k="build">
            <span className="apf-go-a"><Sparkles size={14} /> Build it</span>
            <span className="apf-go-b"><Loader size={14} className="apf-spin" /> Building…</span>
          </span>
        </div>
      </div>
    </StepFrame>
  ), [{ at: 0.7, k: 'build', click: 0.86, say: 'Building it' }]);
  add(1, 7000, FILM_SAY.step5, p => (
    <StepFrame n={4} p={p}>
      <div className="apf-flow-wrap">
        <div className="apf-flow">
          {[
            { icon: Search, label: 'Find homeowners', sub: 'Dallas, Plano, Frisco' },
            { icon: MessageSquare, label: 'Text the offer', sub: 'Waits for your OK' },
            { icon: Mail, label: 'Email follow-up', sub: 'After 2 days, if no reply' },
            { icon: CalendarCheck, label: 'Book the visit', sub: 'Into your calendar' },
            { icon: Receipt, label: 'Invoice & get paid', sub: 'Payment link' },
          ].map((n, i, all) => <FlowNode key={n.label} k={`n${i}`} icon={n.icon} label={n.label} sub={n.sub} shown={p >= 0.05 + i * 0.12} last={i === all.length - 1} />)}
        </div>
        <div className={`apf-peek${on(p, 0.8)}`}>
          <span className="apf-peek-h"><Mail size={14} /> Email follow-up</span>
          <span className="apf-peek-s">Subject: Your free safety inspection</span>
          <span className="apf-peek-b">Hi — just following up on the free safety inspection with any panel upgrade. Reply with a day that suits you and we will book it in.</span>
          <span className="apf-peek-f"><ShieldCheck size={13} /> Sends only after your OK</span>
        </div>
      </div>
    </StepFrame>
  ), [{ at: 0.64, k: 'n2', click: 0.78, say: 'Opening the email' }]);
  add(1, 7500, FILM_SAY.step6, p => (
    <StepFrame n={5} p={p}>
      <div className="apf-guards">
        {['Ask me before any email or text is sent', 'Ask me before booking a time', 'Tell me when money comes in'].map((g, i) => (
          <div key={g} className="apf-guard-row">
            <span>{g}</span>
            <span className={`apf-toggle${on(p, 0.12 + i * 0.14)}`} data-k={`g${i}`} aria-hidden="true"><i /></span>
          </div>
        ))}
        <div className={`apf-power${on(p, 0.62)}`}>
          <span className="apf-power-sw" data-k="power" aria-hidden="true"><i /></span>
          <span className="apf-power-tx">
            <span className={`apf-pw-a${p >= 0.62 ? '' : ' is-on'}`}><b>Switch AI Autopilot on</b><span>Nothing runs until you say so</span></span>
            <span className={`apf-pw-b${on(p, 0.62)}`}><b>AI Autopilot is ON</b><span>Running in the cloud every 5 minutes</span></span>
          </span>
        </div>
      </div>
    </StepFrame>
  ), [{ at: 0, k: 'g0', click: 0.11, say: 'Asking you first' }, { at: 0.13, k: 'g1', click: 0.25, say: 'Asking you first' }, { at: 0.27, k: 'g2', click: 0.39, say: 'Telling you about money' }, { at: 0.44, k: 'power', click: 0.6, say: 'Switching it on' }]);

  /* ── Part three: Protron runs the app ── */
  add(2, 9500, FILM_SAY.run1, p => (
    <AppFrame nav={p >= 0.1 ? 'autopilot' : 'dashboard'} crumb={p >= 0.1 ? 'AI Autopilot' : 'Dashboard'} open={p >= 0.1}>
      <div className="apf-ap">
        <div className="apf-ap-box" data-k="ap-box">
          <span className={`apf-ap-ph${p >= 0.3 ? '' : ' is-on'}`}>Describe a result — e.g. find 20 dentists in Austin every day and email them about our offer…</span>
          <p><Typed text="Find homeowners in Dallas with older electrical panels. Email them a free safety inspection offer, follow up twice, and book visits on my booking page." p={span(p, 0.3, 0.68)} /></p>
          <div className="apf-ap-bar">
            <span className="apf-btn is-rec"><Mic size={13} /> Record</span>
            <span className="apf-btn is-live"><AudioLines size={13} /> Talk live</span>
            <span className={`apf-btn is-go${on(p, 0.84)}`} data-k="ap-build">
              <span className="apf-go-a"><Sparkles size={13} /> Build it</span>
              <span className="apf-go-b"><Loader size={13} className="apf-spin" /> Building…</span>
            </span>
          </div>
        </div>
        <div className="apf-ap-plan">
          {PLAN.map(([I, l], i) => <span key={l} className={`apf-ap-step${on(p, 0.87 + i * 0.03)}`}><I size={14} /> {l} <Check size={13} className="apf-ap-ok" /></span>)}
        </div>
      </div>
    </AppFrame>
  ), [
    { at: 0, k: 'nav-autopilot', click: 0.09, say: 'Opening AI Autopilot' },
    { at: 0.17, k: 'ap-box', click: 0.26, say: 'Writing the prompt' },
    { at: 0.72, k: 'ap-build', click: 0.83, say: 'Building the plan' },
  ]);
  add(2, 9000, FILM_SAY.run2, p => (
    <AppFrame nav={p >= 0.1 ? 'contacts' : 'autopilot'} crumb={p >= 0.1 ? 'Contacts · New prospects' : 'AI Autopilot'} open={p >= 0.1}>
      <div className="apf-ct">
        <div className="apf-ct-head">
          <span className={`apf-ct-check${on(p, 0.6)}`} data-k="ct-all">{p >= 0.6 ? <SquareCheck size={16} /> : <Square size={16} />}</span>
          <b>New prospects</b>
          <span className="apf-ct-src"><Sparkles size={12} /> Found by AI Autopilot</span>
          <span className="apf-btn is-go apf-ct-add" data-k="ct-add"><span className="apf-go-a"><Plus size={13} /> Add to campaign</span></span>
        </div>
        <div className="apf-ct-rows">
          {PROSPECTS.map(([who, why], i) => (
            <div key={who + why} className={`apf-ct-row${on(p, 0.16 + i * 0.06)}${p >= 0.6 ? ' is-picked' : ''}`}>
              <span className="apf-ct-box">{p >= 0.6 ? <SquareCheck size={15} /> : <Square size={15} />}</span>
              <b>{who}</b>
              <span>{why}</span>
              <span className="apf-ct-tag">Panel upgrade</span>
            </div>
          ))}
        </div>
        <div className={`apf-toast${on(p, 0.8)}`}><Check size={14} strokeWidth={3} /> 6 prospects added to <b>Panel upgrades — Dallas</b></div>
      </div>
    </AppFrame>
  ), [
    { at: 0, k: 'nav-contacts', click: 0.09, say: 'Opening Contacts' },
    { at: 0.5, k: 'ct-all', click: 0.59, say: 'Choosing new prospects' },
    { at: 0.66, k: 'ct-add', click: 0.78, say: 'Adding them to the campaign' },
  ]);
  add(2, 11500, FILM_SAY.run3, p => (
    <AppFrame nav={p >= 0.07 ? 'campaigns' : 'contacts'} crumb={p >= 0.07 ? 'Email campaigns · New campaign' : 'Contacts'} open={p >= 0.07}>
      <div className="apf-cp">
        <div className="apf-cp-head">
          <b>Panel upgrades — Dallas</b>
          <span className={`apf-cp-status${on(p, 0.88)}`}>
            <span className="apf-cp-st-a">Draft</span>
            <span className="apf-cp-st-b"><i /> Live · sending from your mailbox</span>
          </span>
          <span className="apf-btn apf-cp-new" data-k="cp-new"><Plus size={13} /> New campaign</span>
        </div>
        <div className={`apf-cp-form${on(p, 0.17)}`}>
          <div className="apf-cp-field" data-k="cp-subj"><span>Subject</span><b><Typed text="Is your electrical panel older than 25 years?" p={span(p, 0.25, 0.36)} /></b></div>
          <div className="apf-cp-field is-body" data-k="cp-body"><span>Email</span>
            <p><Typed text="Hi there — older panels can struggle with today’s appliances and EV chargers. We’re offering a free safety inspection with any panel upgrade in Dallas this month. Reply here or pick a time on our booking page." p={span(p, 0.43, 0.66)} /></p>
          </div>
          <div className="apf-cp-foot">
            <span className="apf-cp-to"><Users size={13} /> To: 6 new prospects</span>
            <span className={`apf-cp-when${on(p, 0.74)}`} data-k="cp-when"><Clock size={13} /> <span className="apf-cp-w-a">Choose a time</span><span className="apf-cp-w-b">Tue 9:00 am</span></span>
            <span className={`apf-btn is-go${on(p, 0.88)}`} data-k="cp-launch">
              <span className="apf-go-a"><Send size={13} /> Launch</span>
              <span className="apf-go-b"><Check size={13} strokeWidth={3} /> Launched</span>
            </span>
          </div>
        </div>
      </div>
    </AppFrame>
  ), [
    { at: 0, k: 'nav-campaigns', click: 0.06, say: 'Opening Email campaigns' },
    { at: 0.09, k: 'cp-new', click: 0.15, say: 'Starting a campaign' },
    { at: 0.19, k: 'cp-subj', click: 0.24, say: 'Writing the subject' },
    { at: 0.37, k: 'cp-body', click: 0.42, say: 'Writing the email' },
    { at: 0.67, k: 'cp-when', click: 0.73, say: 'Scheduling it' },
    { at: 0.78, k: 'cp-launch', click: 0.87, say: 'Launching' },
  ]);
  add(2, 9000, FILM_SAY.run4, p => (
    <AppFrame nav={p >= 0.09 ? 'booking' : 'campaigns'} crumb={p >= 0.09 ? 'Booking pages' : 'Email campaigns'} open={p >= 0.09}>
      <div className="apf-bk">
        <div className="apf-bk-card">
          <span className="apf-bk-ic"><CalendarCheck size={18} /></span>
          <span className="apf-bk-tx"><b>Free safety inspection</b><span>30 minutes · weekdays 8 am – 5 pm</span></span>
          <span className={`apf-toggle${on(p, 0.33)}`} data-k="bk-on" aria-hidden="true"><i /></span>
        </div>
        <div className={`apf-bk-mail${on(p, 0.42)}`}>
          <span className="apf-bk-mh"><Mail size={14} /> Panel upgrades — Dallas · the email</span>
          <span className="apf-bk-body">… Reply here or pick a time on our booking page.</span>
          <span className="apf-bk-row">
            <span className="apf-btn apf-bk-link" data-k="bk-link"><Link2 size={13} /> Insert booking link</span>
            <span className={`apf-bk-cta${on(p, 0.64)}`}><CalendarCheck size={14} /> Book your free inspection</span>
          </span>
        </div>
      </div>
    </AppFrame>
  ), [
    { at: 0, k: 'nav-booking', click: 0.08, say: 'Opening Booking pages' },
    { at: 0.22, k: 'bk-on', click: 0.32, say: 'Turning the page on' },
    { at: 0.5, k: 'bk-link', click: 0.62, say: 'Adding the link to the email' },
  ]);

  /* ── Part four: watching and improving ── */
  add(3, 10000, FILM_SAY.watch1, p => (
    <AppFrame nav="campaigns" crumb="Email campaigns · Running">
      <div className="apf-wt">
        <div className={`apf-wt-row${p >= 0.14 ? ' is-picked' : ''}`} data-k="wt-row">
          <span className="apf-wt-live"><i /> Live</span>
          <b>Panel upgrades — Dallas</b>
          <span>Started 9 days ago</span>
        </div>
        <div className={`apf-wt-panel${on(p, 0.16)}`}>
          <div className="apf-wt-stats">
            {STATS.map(st => (
              <div key={st.k} className="apf-wt-stat" data-k={st.k}>
                <span className="apf-wt-ic"><st.icon size={15} /></span>
                <b>{upTo(st.n, span(p, 0.2, 0.6))}</b>
                <span>{st.label}</span>
              </div>
            ))}
          </div>
          <div className="apf-wt-feed">
            {FEED.map(([I, t], i) => <span key={t} className={`apf-wt-ev${on(p, 0.4 + i * 0.14)}`}><I size={14} /> {t}</span>)}
          </div>
        </div>
      </div>
    </AppFrame>
  ), [
    { at: 0.02, k: 'wt-row', click: 0.13, say: 'Checking running campaigns' },
    { at: 0.62, k: 'st-replies', say: 'Reading the replies' },
    { at: 0.8, k: 'st-booked', say: 'Counting appointments' },
  ]);
  add(3, 10000, FILM_SAY.watch2, p => {
    const a = 4.1 * span(p, 0.12, 0.5), b = 7.8 * span(p, 0.12, 0.55);
    return (
      <AppFrame nav="campaigns" crumb="Email campaigns · A/B test">
        <div className="apf-ab">
          <div className="apf-ab-h"><FlaskConical size={16} /> <b>A/B test · email 1 subject</b><span>Half of new prospects get each version</span></div>
          {[
            { v: 'A', subj: 'Your free safety inspection', rate: a },
            { v: 'B', subj: 'Is your electrical panel older than 25 years?', rate: b },
          ].map(r => (
            <div key={r.v} className={`apf-ab-row${r.v === 'B' && p >= 0.58 ? ' is-win' : ''}`}>
              <span className="apf-ab-v">{r.v}</span>
              <span className="apf-ab-subj">{r.subj}</span>
              <span className="apf-ab-bar"><i style={{ transform: `scaleX(${(r.rate / 10).toFixed(4)})` }} /></span>
              <span className="apf-ab-rate" data-k={r.v === 'B' ? 'ab-rate-b' : undefined}>{r.rate.toFixed(1)}% replied</span>
              <span className={`apf-ab-win${r.v === 'B' ? on(p, 0.58) : ''}`}><Trophy size={13} /> Winning</span>
            </div>
          ))}
          <div className="apf-ab-foot">
            <span className={`apf-ab-done${on(p, 0.78)}`}><Check size={14} strokeWidth={3} /> B is now the subject for every new prospect</span>
            <span className={`apf-btn is-go${on(p, 0.77)}`} data-k="ab-use"><span className="apf-go-a">Use B for everyone</span><span className="apf-go-b"><Check size={13} strokeWidth={3} /> Done</span></span>
          </div>
        </div>
      </AppFrame>
    );
  }, [
    { at: 0.15, k: 'ab-rate-b', say: 'Comparing A and B' },
    { at: 0.6, k: 'ab-use', click: 0.76, say: 'Sending B to everyone new' },
  ]);
  add(3, 10500, FILM_SAY.watch3, p => (
    <AppFrame nav="campaigns" crumb="Email campaigns · Email 2 · Follow-up">
      <div className="apf-rw">
        <div className="apf-rw-note"><BarChart3 size={14} /> Email 2 is getting fewer replies than email 1</div>
        <div className="apf-rw-card">
          <div className="apf-rw-h"><b>Follow-up · after 2 days</b><span className={`apf-btn${on(p, 0.2)}`} data-k="rw-edit"><Sparkles size={13} /> Rewrite with AI</span></div>
          <p className={`apf-rw-old${on(p, 0.22)}`}>Just checking you saw our last email about panel upgrades. We have some availability this month if you are interested in learning more.</p>
          <p className="apf-rw-new"><Typed text="Free safety inspection this week — reply with a day that suits you, or book a time in one click. It takes 30 minutes and there is no obligation." p={span(p, 0.3, 0.62)} /></p>
          <div className="apf-rw-foot">
            <span className={`apf-rw-live${on(p, 0.8)}`}><Check size={14} strokeWidth={3} /> Relaunched — the new version is live</span>
            <span className={`apf-btn is-go${on(p, 0.8)}`} data-k="rw-launch"><span className="apf-go-a"><RefreshCw size={13} /> Relaunch</span><span className="apf-go-b"><Check size={13} strokeWidth={3} /> Live</span></span>
          </div>
        </div>
      </div>
    </AppFrame>
  ), [
    { at: 0.08, k: 'rw-edit', click: 0.2, say: 'Rewriting the follow-up' },
    { at: 0.66, k: 'rw-launch', click: 0.79, say: 'Relaunching' },
  ]);
  add(3, 11000, FILM_SAY.watch4, p => (
    <AppFrame nav="dashboard" crumb="Dashboard">
      <div className="apf-rp">
        <div className="apf-rp-h">
          <ProtronAvatar size={34} alive={false} />
          <span><b>Protron · this week’s report</b><span>Panel upgrades — Dallas and Spring tune-up — Plano</span></span>
        </div>
        {REPORT.map((r, i) => (
          <div key={i} className={`apf-rp-i${on(p, 0.1 + i * 0.17)}`}><span className="apf-rp-ic"><r.icon size={15} /></span><span>{r.text}</span></div>
        ))}
        <div className="apf-rp-foot"><span className="apf-btn">See the details</span><span className="apf-btn is-go" data-k="rp-ok"><span className="apf-go-a">Looks good</span></span></div>
      </div>
    </AppFrame>
  ), [{ at: 0.82, k: 'rp-ok', say: 'Waiting for your OK' }]);

  /* ── Part five: example businesses ── */
  EXAMPLES.forEach((e, i) => {
    add(4, 4200, exampleLine(i),
      p => <ExampleScene e={e} i={i} p={p} />);
  });

  return s;
}

/* ── Layout: three design sizes, one transform ── */

type Fit = { w: number; h: number; k: number; tier: 'big' | 'mid' | 'compact' };

/** The design size for a frame `c` px wide: whichever keeps the scene's text readable once scaled. */
function fitFor(c: number): Fit {
  if (c < 620) return { w: 640, h: 360, k: c / 640, tier: 'compact' };
  if (c < 900) return { w: 960, h: 540, k: c / 960, tier: 'mid' };
  return { w: 1200, h: 675, k: c / 1200, tier: 'big' };
}

/** Where an element sits inside the canvas, from layout offsets — the reveal transforms and the scale do not count. */
function boxIn(el: HTMLElement, root: HTMLElement) {
  let x = 0, y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight, ok: n === root };
}
/** Minimum-jerk easing: velocity and acceleration are zero at both ends, as in a hand's reach. */
const reach = (s: number) => s * s * s * (10 - 15 * s + 6 * s * s);

export default function AutopilotFilm({ onTalk, onRecord, onType }: {
  onTalk: () => void;
  onRecord: () => void;
  onType: () => void;
}) {
  const scenes = useMemo(() => {
    const list = buildScenes();
    /* The last scene is where the film hands over to the real buttons. */
    list.push({ ch: 4, ms: 7000, say: FILM_SAY.end, draw: () => (
      <div className="apf-end">
        <span className="apf-kicker">Your turn</span>
        <h3>Type it. Record it. Or just talk.</h3>
        <p>Protron sets AI Autopilot up with you, one small step at a time.</p>
        <div className="apf-end-row">
          <button type="button" className="apf-end-btn is-live" data-k="end-live" onClick={onTalk}><AudioLines size={16} /> Talk live with Protron</button>
          <button type="button" className="apf-end-btn is-rec" onClick={onRecord}><Mic size={16} /> Record my prompt</button>
          <button type="button" className="apf-end-btn" onClick={onType}><Keyboard size={16} /> Type it</button>
        </div>
      </div>
    ), aim: [{ at: 0.2, k: 'end-live', say: 'Your turn' }] });
    return list;
  }, [onTalk, onRecord, onType]);

  const starts = useMemo(() => { let a = 0; return scenes.map(s => { const at = a; a += s.ms; return at; }); }, [scenes]);
  const total = starts[starts.length - 1] + scenes[scenes.length - 1].ms;
  const chapterAt = (c: number) => starts[scenes.findIndex(s => s.ch === c)];
  const chapterEnd = (c: number) => (c < CHAPTERS.length - 1 ? chapterAt(c + 1) : total);

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [voice, setVoice] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const pointer = useRef<HTMLDivElement>(null);
  const rippleAt = useRef<HTMLDivElement>(null);
  const ripple = useRef<HTMLSpanElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const tRef = useRef(0);
  const visible = useRef(false);
  const chosen = useRef(false); // the person pressed play/pause — autoplay stops deciding
  const still = useRef(motionReduced());
  const holdAt = useRef<number | null>(null);
  const [fitNow, setFit] = useState<Fit>(() => fitFor(1120));

  const idx = Math.max(0, starts.findIndex((st, i) => t >= st && t < st + scenes[i].ms));
  const scene = scenes[idx] ?? scenes[0];
  const p = clamp((t - starts[idx]) / scene.ms);

  const seek = useCallback((ms: number) => { tRef.current = Math.max(0, Math.min(total - 1, ms)); setT(tRef.current); }, [total]);

  /* ── Size: measured on resize, never per frame ── */
  useLayoutEffect(() => {
    const el = screen.current;
    if (!el) return;
    const size = () => {
      const next = fitFor(el.clientWidth || 1120);
      setFit(f => (f.w === next.w && Math.abs(f.k - next.k) < 0.0005 ? f : next));
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── The outgoing scene stays a moment and fades, so a new one never pops ── */
  const [leaving, setLeaving] = useState<number | null>(null);
  const lastIdx = useRef(idx);
  useEffect(() => {
    if (lastIdx.current === idx) return;
    const was = lastIdx.current;
    lastIdx.current = idx;
    if (still.current) return;
    setLeaving(was);
    const id = window.setTimeout(() => setLeaving(null), 260);
    return () => window.clearTimeout(id);
  }, [idx]);

  /* The clock. */
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      if (visible.current && !document.hidden) {
        /* While the narrator is still saying this scene's line, the scene waits for it. */
        const hold = holdAt.current;
        tRef.current = hold !== null && tRef.current + dt > hold ? Math.max(tRef.current, hold) : tRef.current + dt;
        if (tRef.current >= total) { tRef.current = total - 1; setT(tRef.current); setPlaying(false); return; }
        /* Every frame: the scenes only switch classes and reveal laid-out
           text, so a render is cheap, and a 30-a-second clock made the
           progress bars and the typing step visibly. */
        setT(tRef.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total]);

  /* Plays by itself on screen, unless motion is reduced or the person chose. */
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') { visible.current = true; return; }
    const io = new IntersectionObserver(([e]) => {
      visible.current = e.isIntersecting;
      if (e.isIntersecting && !chosen.current && !still.current) setPlaying(true);
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* ── The pointer: its own clock, chasing the scene's current target ── */
  const now = useRef({ idx, p, aim: scene.aim });
  useLayoutEffect(() => { now.current = { idx, p, aim: scene.aim }; });
  useEffect(() => {
    if (still.current) return;
    const ptr = pointer.current, cv = canvas.current;
    if (!ptr || !cv) return;
    let pos: { x: number; y: number } | null = null;
    let goal = '';
    let move: { at: number; ms: number; x0: number; y0: number; cx: number; cy: number; x1: number; y1: number } | null = null;
    let shown = false;
    const clicked = new Set<string>();
    const put = (x: number, y: number) => { pos = { x, y }; ptr.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`; };
    const show = (v: boolean) => { if (v !== shown) { shown = v; ptr.style.opacity = v ? '1' : '0'; } };
    const label = ptr.querySelector<HTMLElement>('.apf-ptr-say');
    /* The label names what it is doing; near the right or bottom edge it flips to the other side so it never leaves the frame. */
    const tell = (text: string | undefined, x: number, y: number) => {
      if (!label) return;
      if (text) label.textContent = text;
      label.classList.toggle('is-on', !!text);
      label.classList.toggle('is-left', x > cv.offsetWidth * 0.66);
      label.classList.toggle('is-up', y > cv.offsetHeight * 0.76);
    };
    let raf = 0;
    const frame = (time: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible.current || document.hidden) return;
      const { idx: si, p: sp, aim } = now.current;
      const ai = aim ? aim.reduce((best, a, i) => (sp >= a.at ? i : best), -1) : -1;
      /* A seek back: clicks not yet reached may happen again. */
      for (const key of clicked) { const [s, i] = key.split(':').map(Number); const c = s === si ? aim?.[i]?.click : undefined; if (s !== si || c === undefined || sp < c) clicked.delete(key); }
      if (ai < 0 || !aim) { show(false); goal = ''; move = null; return; }
      const a = aim[ai];
      const key = `${si}:${ai}`;
      const el = layer.current?.querySelector<HTMLElement>(`[data-k="${a.k}"]`);
      /* Not drawn at this size (a part a phone's layout leaves out): no trip, and no click on nothing. */
      if (!el || !el.offsetParent) return;
      if (goal !== key) {
        goal = key;
        const b = boxIn(el, cv);
        if (!b.ok || (!b.w && !b.h)) return;
        const x1 = b.x + Math.min(b.w * 0.5, 110), y1 = b.y + b.h * 0.58;
        tell(a.say, x1, y1);
        /* The first time, it comes in from low on the right, already moving — never out of nowhere onto the target. */
        if (!pos) put(cv.offsetWidth * 0.78, cv.offsetHeight * 0.86);
        const { x: x0, y: y0 } = pos ?? { x: x1, y: y1 };
        const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
        /* A gentle arc that bows upward, the way a wrist swings. */
        let nx = -dy / len, ny = dx / len;
        if (ny > 0) { nx = -nx; ny = -ny; }
        const bow = Math.min(80, len * 0.15);
        move = { at: time, ms: Math.min(1300, 420 + len * 0.8), x0, y0, x1, y1, cx: (x0 + x1) / 2 + nx * bow, cy: (y0 + y1) / 2 + ny * bow };
      }
      show(true);
      if (move) {
        const s = reach(clamp((time - move.at) / move.ms)), u = 1 - s;
        put(u * u * move.x0 + 2 * u * s * move.cx + s * s * move.x1, u * u * move.y0 + 2 * u * s * move.cy + s * s * move.y1);
        if (s >= 1) move = null;
      }
      /* The click: only once the pointer is there, and only near its moment
         (after a long seek past it, the state already shows it happened). */
      if (a.click !== undefined && !move && sp >= a.click && !clicked.has(key)) {
        clicked.add(key);
        if (sp - a.click < 0.2 && pos) {
          const at = rippleAt.current, r = ripple.current, g = ring.current;
          if (at && r) {
            at.style.transform = `translate3d(${pos.x.toFixed(2)}px, ${pos.y.toFixed(2)}px, 0)`;
            r.animate?.([{ transform: 'scale(0.2)', opacity: 0.9 }, { transform: 'scale(1)', opacity: 0 }], { duration: 620, easing: 'cubic-bezier(.2,.7,.3,1)' });
          }
          if (g) {
            const b = boxIn(el, cv);
            g.style.width = `${b.w + 10}px`; g.style.height = `${b.h + 10}px`;
            g.style.transform = `translate3d(${b.x - 5}px, ${b.y - 5}px, 0)`;
            g.style.borderRadius = getComputedStyle(el).borderRadius;
            g.animate?.([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' });
          }
          ptr.animate?.([{ scale: '1' }, { scale: '0.86' }, { scale: '1' }], { duration: 240, easing: 'ease-out' });
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  // Restart on a new design size: the old coordinates mean nothing in the new one.
  }, [fitNow.w]);

  /* Narration: Protron's warm AI voice — the live bot's voice — reads each
     caption as its scene starts; the next line is fetched while this one
     plays. Without the AI voice the film stays silent and says why. */
  const [voiceNote, setVoiceNote] = useState('');
  useEffect(() => {
    if (!voice || !playing) { narrator.stop(); holdAt.current = null; return; }
    let gone = false;
    const next = scenes[idx + 1];
    holdAt.current = starts[idx] + scene.ms - 40;
    void narrator.say(scene.say).then(why => {
      if (gone) return;
      holdAt.current = null;
      setVoiceNote(why);
    });
    if (next) void narrator.prepare(next.say);
    return () => { gone = true; holdAt.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once per scene; starts and scene follow idx
  }, [idx, voice, playing]);
  useEffect(() => () => { narrator.stop(); }, []);

  const toggle = () => {
    chosen.current = true;
    if (!playing && t >= total - 50) seek(0);
    setPlaying(v => !v);
  };
  const jump = (dir: 1 | -1) => {
    chosen.current = true;
    const next = Math.max(0, Math.min(scenes.length - 1, idx + dir));
    seek(dir < 0 && p > 0.25 ? starts[idx] : starts[next]);
    setPlaying(true);
  };

  return (
    <div
      ref={root}
      className={`apf is-${fitNow.tier}${still.current ? ' is-still' : ''}`}
      role="region"
      aria-roledescription="video"
      aria-label="See AI Autopilot work"
      data-chapter={scene.ch}
      onKeyDown={e => { if (e.key === ' ' && e.target === e.currentTarget) { e.preventDefault(); toggle(); } }}
      tabIndex={0}
    >
      <div className="apf-head">
        <span className="apf-head-ch">{scene.ch + 1}/{CHAPTERS.length} · {CHAPTERS[scene.ch]}</span>
        <span className="apf-head-title">See AI Autopilot work</span>
      </div>
      <div className="apf-screen" ref={screen}>
        <div className="apf-canvas" ref={canvas} style={{ width: fitNow.w, height: fitNow.h, transform: `scale(${fitNow.k})` }}>
          {leaving !== null && leaving !== idx && scenes[leaving] && (
            <div className="apf-layer is-leaving" key={`out-${leaving}`} aria-hidden="true">{scenes[leaving].draw(1)}</div>
          )}
          <div className="apf-layer is-now" key={idx} ref={layer}>{scene.draw(p)}</div>
          <span className="apf-ring" ref={ring} aria-hidden="true" />
          <div className="apf-ripple-at" ref={rippleAt} aria-hidden="true"><span className="apf-ripple" ref={ripple} /></div>
          <div className="apf-ptr" ref={pointer} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2.5 L4 19.5 L8.6 15.4 L11.5 21.8 L14.6 20.4 L11.8 14.2 L18 14.2 Z" fill="#D97757" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" /></svg>
            <span className="apf-ptr-say" />
          </div>
        </div>
      </div>
      <p className="apf-subs" aria-live={playing ? 'off' : 'polite'}>{scene.say}</p>
      {voice && voiceNote && <p className="apf-voice-note" role="status">Narrator unavailable — captions only. {voiceNote}</p>}
      <div className="apf-bar">
        <button type="button" className="apf-ctl" onClick={() => jump(-1)} aria-label="Previous scene"><SkipBack size={15} /></button>
        <button type="button" className="apf-ctl is-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>
        <button type="button" className="apf-ctl" onClick={() => jump(1)} aria-label="Next scene"><SkipForward size={15} /></button>
        <div className="apf-chs">
          {CHAPTERS.map((c, i) => {
            const a = chapterAt(i), b = chapterEnd(i);
            const fill = clamp((t - a) / (b - a));
            return (
              <button
                key={c}
                type="button"
                className={`apf-ch${scene.ch === i ? ' is-now' : ''}`}
                style={{ flexGrow: b - a }}
                aria-label={`Chapter ${i + 1}: ${c}`}
                onClick={e => {
                  chosen.current = true;
                  const r = e.currentTarget.getBoundingClientRect();
                  const f = e.clientX && r.width ? clamp((e.clientX - r.left) / r.width) : 0;
                  seek(a + (f < 0.12 ? 0 : f) * (b - a));
                  setPlaying(true);
                }}
              >
                <span className="apf-ch-lbl">{c}</span>
                <span className="apf-ch-track"><span style={{ transform: `scaleX(${fill.toFixed(4)})` }} /></span>
              </button>
            );
          })}
        </div>
        <span className="apf-time">{mmss(t)} / {mmss(total)}</span>
        {typeof window !== 'undefined' && 'AudioContext' in window && (
          <button type="button" className={`apf-ctl${voice ? ' is-on' : ''}`} onClick={() => { unlockAudio(); setVoiceNote(''); if (!voice) { chosen.current = true; setPlaying(true); } setVoice(v => !v); }} aria-pressed={voice}
            aria-label={voice ? 'Turn narration off' : 'Turn narration on'} title={voice ? 'Narration on' : 'Narration off'}>
            {voice ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
        )}
      </div>
    </div>
  );
}
