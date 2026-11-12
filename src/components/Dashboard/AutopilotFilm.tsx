/**
 * "See AI Autopilot work" — a short explainer film on the dashboard hero.
 *
 * ── Why a film, and why drawn rather than recorded ──
 *
 * The owner's brief (2026-11-12): instead of describing Autopilot's features
 * as a row of buttons, show them — a full-width, low film in three parts:
 * what it does and how it works (live talk, solving while you speak), the
 * baby steps of setting it up by talking / recording / typing, and results
 * across many kinds of US business.
 *
 * It is drawn by the page, scene by scene, rather than shipped as an MP4:
 * the words are the product's real words and buttons (a recorded screen goes
 * stale the day a label changes), it is crisp at every width and in both
 * themes, it costs no download, it can be paused, scrubbed and read by a
 * screen reader, and its captions are text. It behaves like a video — play,
 * pause, chapters, a scrubber, a clock, narration — because that is what
 * the owner asked for and what people know how to use.
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
 * for less motion; under reduced motion it waits for Play and the CSS
 * transitions are off (autopilotFilm.css). Narration is the browser's own
 * voice (speechSynthesis), off until asked for — no AI voice is spent on it.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AirVent, AudioLines, Briefcase, CalendarCheck, Check, CircleDollarSign, GraduationCap, Hammer, House,
  Keyboard, LayoutTemplate, Mail, Megaphone, MessageSquare, Mic, Pause, Play, Presentation, Receipt, Scale,
  Search, Share2, ShieldCheck, ShoppingBag, SkipBack, SkipForward, Smile, SprayCan, Star, Users, Volume2,
  VolumeX, Wrench, Zap,
} from 'lucide-react';
import ProtronAvatar from '../Protron/ProtronAvatar';
import { motionReduced } from '../../services/motion';
import './autopilotFilm.css';

type Icon = typeof Mail;
type Scene = { ch: 0 | 1 | 2; ms: number; say: string; draw: (p: number) => ReactNode };

const CHAPTERS = ['What it does', 'Set it up by talking', 'Results'];

const clamp = (n: number) => Math.max(0, Math.min(1, n));
/** Progress of a sub-span of a scene: 0 before `a`, 1 after `b`. */
const span = (p: number, a: number, b: number) => clamp((p - a) / Math.max(0.0001, b - a));
const typed = (text: string, p: number) => text.slice(0, Math.round(text.length * clamp(p)));
const on = (p: number, at: number) => (p >= at ? ' is-on' : '');
const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** Long enough to read (and for the narrator to say) the caption. */
const fit = (ms: number, say: string) => Math.max(ms, say.split(/\s+/).length * 360 + 900);

function Wave({ live, bars = 18 }: { live: boolean; bars?: number }) {
  return (
    <span className={`apf-wave${live ? ' is-live' : ''}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => <i key={i} style={{ animationDelay: `${(i * 97) % 700}ms` }} />)}
    </span>
  );
}

function FlowNode({ icon: I, label, shown, last }: { icon: Icon; label: string; shown: boolean; last?: boolean }) {
  return (
    <div className={`apf-node${shown ? ' is-on' : ''}`}>
      <span className="apf-node-ic"><I size={14} /></span>
      <span className="apf-node-tx">{label}</span>
      {!last && <span className="apf-node-link" aria-hidden="true" />}
    </div>
  );
}

/* ── Part one: what it does ── */

const CAPS: { icon: Icon; label: string }[] = [
  { icon: Search, label: 'Finds customers' },
  { icon: Mail, label: 'Writes & sends emails' },
  { icon: MessageSquare, label: 'Answers replies' },
  { icon: Share2, label: 'Posts to social' },
  { icon: LayoutTemplate, label: 'Builds pages & funnels' },
  { icon: CalendarCheck, label: 'Books appointments' },
  { icon: Receipt, label: 'Invoices & chases payment' },
  { icon: Star, label: 'Asks for reviews' },
];

const MANUAL = [
  'Search for leads by hand',
  'Write every email yourself',
  'Chase each reply',
  'Back-and-forth to book a time',
  'Send invoices, chase payment',
  'Post on social when you remember',
];

const TALK: { who: 'you' | 'pt'; text: string; a: number; b: number }[] = [
  { who: 'you', text: 'I’m a plumber in Phoenix. I want more water-heater jobs.', a: 0.02, b: 0.3 },
  { who: 'pt', text: 'Got it. Which neighbourhoods, and do you text or email quotes?', a: 0.34, b: 0.56 },
  { who: 'you', text: 'Scottsdale and Tempe. Both — text first.', a: 0.6, b: 0.78 },
];

const BUILD: { icon: Icon; label: string; at: number }[] = [
  { icon: Search, label: 'Find homeowners · Scottsdale, Tempe', at: 0.22 },
  { icon: MessageSquare, label: 'Text, then email a quote offer', at: 0.46 },
  { icon: Mail, label: 'Follow up after 2 days', at: 0.66 },
  { icon: CalendarCheck, label: 'Book the visit', at: 0.8 },
  { icon: Receipt, label: 'Invoice with a payment link', at: 0.9 },
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
            <span className="apf-rail-n">{i < n ? <Check size={11} /> : i + 1}</span>
            <span className="apf-rail-tx">{s}</span>
          </li>
        ))}
      </ol>
      <div className="apf-mock">
        <span className="apf-mock-step">Step {n + 1} of {STEPS.length}</span>
        {children}
        <span className="apf-mock-bar" style={{ transform: `scaleX(${p.toFixed(3)})` }} aria-hidden="true" />
      </div>
    </div>
  );
}

/* ── Part three: example businesses ── */

type Example = { icon: Icon; who: string; where: string; said: string; did: [string, string, string]; notes: [string, string, string] };

const EXAMPLES: Example[] = [
  { icon: Wrench, who: 'Plumber', where: 'Phoenix, AZ', said: 'More water-heater installs, less time on the phone.',
    did: ['Finds homeowners asking for water-heater help nearby', 'Texts and emails a quote offer', 'Books the visit into the calendar'],
    notes: ['New enquiry — tankless water heater', 'Booked — Thu 9:00 am, Scottsdale', 'Paid — water-heater install · $1,850'] },
  { icon: Zap, who: 'Electrician', where: 'Dallas, TX', said: 'Panel upgrades from homeowners.',
    did: ['Finds older homes in Plano and Frisco', 'Offers a free safety inspection', 'Follows up until the visit is booked'],
    notes: ['Reply — “Can you come this week?”', 'Booked — inspection Tue 1:00 pm', 'Paid — panel upgrade · $2,400'] },
  { icon: House, who: 'Real estate agent', where: 'Miami, FL', said: 'Seller leads in Coral Gables.',
    did: ['Finds owners likely to sell', 'Sends a free home-value report', 'Books listing appointments'],
    notes: ['New lead — 3-bed home valuation', 'Booked — listing appointment Sat 11:00', 'Commission received · $11,400'] },
  { icon: Megaphone, who: 'Digital marketing agency', where: 'Austin, TX', said: 'New retainer clients this quarter.',
    did: ['Finds local businesses with weak websites', 'Sends each a personal audit', 'Books discovery calls'],
    notes: ['Reply — “Send me the audit”', 'Booked — discovery call Tue 2:00 pm', 'Retainer signed · $2,500 / month'] },
  { icon: ShoppingBag, who: 'Solo entrepreneur, online store', where: 'Denver, CO', said: 'Bring past customers back.',
    did: ['Writes a win-back email series', 'Posts on social every day', 'Recovers abandoned carts'],
    notes: ['Cart recovered — 2 items', 'New order from a returning customer', 'Paid · $186'] },
  { icon: Users, who: 'Business coach', where: 'Atlanta, GA', said: 'Fill my one-to-one coaching programme.',
    did: ['Publishes a free-guide page', 'Nurtures every sign-up by email', 'Books strategy calls'],
    notes: ['New sign-up — free guide', 'Booked — strategy call Wed 4:00 pm', 'Paid — coaching package · $1,500'] },
  { icon: GraduationCap, who: 'Educator & tutor', where: 'Boston, MA', said: 'Enrol students in my SAT prep course.',
    did: ['Builds the course page', 'Emails every parent who asked', 'Sends reminders before the start date'],
    notes: ['Enquiry — SAT prep, grade 11', 'Enrolled — spring cohort', 'Paid — course fee · $480'] },
  { icon: Presentation, who: 'Corporate trainer', where: 'Chicago, IL', said: 'Leadership workshops with HR teams.',
    did: ['Finds HR leads at mid-size firms', 'Sends a workshop outline', 'Books intro calls'],
    notes: ['Reply — “Can you do March?”', 'Booked — intro call Mon 10:00 am', 'Invoice paid — workshop · $6,500'] },
  { icon: Briefcase, who: 'Corporate consultant', where: 'New York, NY', said: 'Win operations projects.',
    did: ['Finds COOs at growing companies', 'Sends a short case study', 'Follows up until a call is booked'],
    notes: ['Reply — “Interested, let’s talk”', 'Booked — discovery call Thu 3:00 pm', 'Proposal accepted · $12,000'] },
  { icon: AirVent, who: 'HVAC contractor', where: 'Houston, TX', said: 'Sell AC maintenance plans before summer.',
    did: ['Emails past customers a tune-up offer', 'Texts reminders to book', 'Takes the payment online'],
    notes: ['New booking — AC tune-up', 'Booked — Fri 8:00 am', 'Paid — maintenance plan · $189'] },
  { icon: Smile, who: 'Dental practice', where: 'San Diego, CA', said: 'More implant consultations.',
    did: ['Publishes an implant landing page', 'Answers questions by email', 'Books consultations'],
    notes: ['Enquiry — implant consultation', 'Booked — Mon 9:30 am', 'Deposit paid · $500'] },
  { icon: Hammer, who: 'Roofing company', where: 'Charlotte, NC', said: 'Storm-damage inspections.',
    did: ['Finds homeowners in affected areas', 'Offers a free roof inspection', 'Books the inspection'],
    notes: ['Reply — “Yes, please inspect”', 'Booked — inspection Sat 10:00 am', 'Deposit paid — new roof · $4,200'] },
  { icon: Scale, who: 'Estate-planning attorney', where: 'Orlando, FL', said: 'More consultations from families.',
    did: ['Publishes a plain-English guide', 'Follows up with every download', 'Books consultations'],
    notes: ['New download — wills & trusts guide', 'Booked — consultation Wed 11:00 am', 'Paid — estate plan · $1,200'] },
  { icon: SprayCan, who: 'Cleaning company', where: 'Seattle, WA', said: 'Recurring home-cleaning clients.',
    did: ['Finds new movers nearby', 'Sends a first-clean offer', 'Turns one-offs into weekly plans'],
    notes: ['New enquiry — 2-bed apartment', 'Booked — first clean Tue', 'Paid — weekly plan · $160'] },
];

function ExampleScene({ e, i, p }: { e: Example; i: number; p: number }) {
  return (
    <div className="apf-ex">
      <span className="apf-tag">Example scenario — an illustration, not a customer’s results</span>
      <div className="apf-ex-who">
        <span className="apf-ex-ic"><e.icon size={20} /></span>
        <span>
          <b>{e.who}</b>
          <span className="apf-ex-where">{e.where}</span>
        </span>
      </div>
      <div className="apf-ex-body">
        <div className="apf-ex-left">
          <p className="apf-ex-said"><Mic size={13} /> “{e.said}”</p>
          <ul className="apf-ex-did">
            {e.did.map((d, k) => (
              <li key={d} className={on(p, 0.12 + k * 0.14).trim()}><Check size={12} /> {d}</li>
            ))}
          </ul>
        </div>
        <div className="apf-phone" aria-label="Notifications">
          {e.notes.map((n, k) => (
            <div key={n} className={`apf-note${k === 2 ? ' is-money' : ''}${on(p, 0.3 + k * 0.2)}`}>
              <span className="apf-note-ic">{k === 2 ? <CircleDollarSign size={14} /> : k === 1 ? <CalendarCheck size={14} /> : <MessageSquare size={14} />}</span>
              <span>{n}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="apf-ex-dots" aria-hidden="true">
        {EXAMPLES.map((x, k) => <i key={x.who} className={k === i ? 'is-on' : ''} />)}
      </div>
    </div>
  );
}

function buildScenes(): Scene[] {
  const s: Scene[] = [];
  const add = (ch: Scene['ch'], ms: number, say: string, draw: Scene['draw']) => s.push({ ch, ms: fit(ms, say), say, draw });

  /* ── Part one ── */
  add(0, 6500, 'This is AI Autopilot. Tell it what you want, and it finds customers, follows up, books the work and gets you paid.', p => (
    <div className="apf-title">
      <span className="apf-kicker">AI Autopilot</span>
      <h3>Your business, on AI Autopilot</h3>
      <p>Talk to it like a business manager. It does the work in this app for you — every day, in the cloud.</p>
      <div className="apf-caps">
        {CAPS.map((c, i) => (
          <span key={c.label} className={`apf-cap${on(p, 0.08 + i * 0.09)}`}><c.icon size={14} /> {c.label}</span>
        ))}
      </div>
    </div>
  ));
  add(0, 7000, 'The usual way is a dozen jobs done by hand. With Autopilot you say it once, and it runs every step, asking you before anything important goes out.', p => (
    <div className="apf-vs">
      <div className="apf-vs-col">
        <span className="apf-vs-h">The usual way</span>
        <ul>{MANUAL.map((m, i) => <li key={m} className={on(p, 0.1 + i * 0.08).trim()}>{m}</li>)}</ul>
      </div>
      <div className={`apf-vs-col is-auto${on(p, 0.55)}`}>
        <span className="apf-vs-h">On AI Autopilot</span>
        <div className="apf-say"><AudioLines size={15} /> “Find me water-heater jobs in Phoenix.”</div>
        <p>It plans every step and runs it each day — finding, writing, following up, booking, invoicing.</p>
        <p className="apf-guard"><ShieldCheck size={14} /> It asks you before anything important goes out.</p>
      </div>
    </div>
  ));
  add(0, 10000, 'Talk to it live, one to one. While you are still speaking, Protron is already building the workflow.', p => {
    const speaking = TALK.find(l => p >= l.a && p <= l.b);
    return (
      <div className="apf-live">
        <div className="apf-call">
          <div className="apf-call-head">
            <ProtronAvatar size={46} state={speaking?.who === 'pt' ? 'speaking' : speaking ? 'listening' : 'working'} alive={false} />
            <span><b>Live with Protron</b><span className="apf-rec"><i /> {mmss(p * 28000)}</span></span>
          </div>
          <div className="apf-log">
            {TALK.map(l => p >= l.a && (
              <div key={l.text} className={`apf-bub is-${l.who}`}>{typed(l.text, span(p, l.a, l.b))}</div>
            ))}
          </div>
          <Wave live={!!speaking} />
        </div>
        <div className="apf-build">
          <span className="apf-build-h"><Zap size={13} /> Building while you talk</span>
          {BUILD.map((b, i) => <FlowNode key={b.label} icon={b.icon} label={b.label} shown={p >= b.at} last={i === BUILD.length - 1} />)}
        </div>
      </div>
    );
  });
  add(0, 5500, 'Type it, record it, or just talk. Whichever is easiest for you.', p => {
    const ways = [
      { icon: Keyboard, h: 'Type it', t: 'One line is enough to start.' },
      { icon: Mic, h: 'Record it', t: 'Press record, say it, check the words.' },
      { icon: AudioLines, h: 'Talk live', t: 'A real conversation — it asks, you answer.' },
    ];
    const lit = Math.min(2, Math.floor(p * 3.2));
    return (
      <div className="apf-ways">
        {ways.map((w, i) => (
          <div key={w.h} className={`apf-way${i === lit ? ' is-lit' : ''}${i === 2 ? ' is-live' : ''}`}>
            <span className="apf-way-ic"><w.icon size={20} /></span>
            <b>{w.h}</b>
            <span>{w.t}</span>
          </div>
        ))}
      </div>
    );
  });

  /* ── Part two: six baby steps ── */
  add(1, 5500, 'Step one. Open AI Autopilot and press Talk live — or Record, or simply type.', p => (
    <StepFrame n={0} p={p}>
      <div className="apf-box">
        <span className="apf-box-ph">Describe a result…</span>
        <div className="apf-box-bar">
          <span className="apf-btn is-rec"><Mic size={13} /> Record</span>
          <span className={`apf-btn is-live${on(p, 0.55)}`}><AudioLines size={13} /> Talk live</span>
        </div>
        <span className="apf-cursor" style={{ transform: `translate(${(1 - span(p, 0.1, 0.55)) * -120}px, ${(1 - span(p, 0.1, 0.55)) * -50}px)` }} aria-hidden="true" />
      </div>
    </StepFrame>
  ));
  add(1, 6000, 'Step two. Say what your business does and what you want from it.', p => (
    <StepFrame n={1} p={p}>
      <div className="apf-talkline">
        <Wave live={p < 0.9} bars={24} />
        <p className="apf-said">{typed('We’re an electrical contractor in Dallas. I want more panel-upgrade jobs from homeowners.', span(p, 0.05, 0.85))}</p>
      </div>
    </StepFrame>
  ));
  add(1, 6000, 'Step three. Protron asks a few short questions — where your customers are, your offer, your website.', p => (
    <StepFrame n={2} p={p}>
      <div className="apf-qa">
        {[
          ['Where are your customers?', 'Dallas, Plano and Frisco'],
          ['What’s your offer?', 'A free safety inspection with any upgrade'],
          ['Do you have a website?', 'Yes — Protron reads it for you'],
        ].map(([q, a], i) => (
          <div key={q} className={`apf-qa-row${on(p, 0.08 + i * 0.28)}`}>
            <span className="apf-q"><ProtronAvatar size={20} alive={false} /> {q}</span>
            <span className={`apf-a${on(p, 0.2 + i * 0.28)}`}>{a}</span>
          </div>
        ))}
      </div>
    </StepFrame>
  ));
  add(1, 5500, 'Step four. It writes your smart prompt and the plan, in plain words you can change.', p => (
    <StepFrame n={3} p={p}>
      <div className="apf-prompt">
        <b>Your smart optimized prompt for AI Autopilot</b>
        <p>{typed('Find homeowners in Dallas, Plano and Frisco with older electrical panels. Offer a free safety inspection with any upgrade. Text first, then email. Follow up twice. Book visits into my calendar and send an invoice when the job is done.', span(p, 0.05, 0.75))}</p>
        <div className="apf-chips">
          {['Find', 'Text & email', 'Follow up', 'Book', 'Invoice'].map((c, i) => <span key={c} className={`apf-chip${on(p, 0.72 + i * 0.05)}`}>{c}</span>)}
        </div>
      </div>
    </StepFrame>
  ));
  add(1, 6000, 'Step five. It builds the workflow, one step at a time, and you can watch every step.', p => (
    <StepFrame n={4} p={p}>
      <div className="apf-flow">
        {[
          { icon: Search, label: 'Find homeowners' },
          { icon: MessageSquare, label: 'Text the offer' },
          { icon: Mail, label: 'Email follow-up' },
          { icon: CalendarCheck, label: 'Book the visit' },
          { icon: Receipt, label: 'Invoice & get paid' },
        ].map((n, i, all) => <FlowNode key={n.label} icon={n.icon} label={n.label} shown={p >= 0.08 + i * 0.16} last={i === all.length - 1} />)}
      </div>
    </StepFrame>
  ));
  add(1, 6500, 'Step six. Choose what needs your OK, then switch it on. It runs in the cloud every few minutes, even with this tab closed.', p => (
    <StepFrame n={5} p={p}>
      <div className="apf-guards">
        {['Ask me before any email or text is sent', 'Ask me before booking a time', 'Tell me when money comes in'].map((g, i) => (
          <div key={g} className="apf-guard-row">
            <span>{g}</span>
            <span className={`apf-toggle${on(p, 0.12 + i * 0.14)}`} aria-hidden="true"><i /></span>
          </div>
        ))}
        <div className={`apf-power${on(p, 0.62)}`}>
          <span className="apf-power-sw" aria-hidden="true"><i /></span>
          <span><b>{p >= 0.62 ? 'AI Autopilot is ON' : 'Switch AI Autopilot on'}</b><span>{p >= 0.62 ? 'Running in the cloud every 5 minutes' : 'Nothing runs until you say so'}</span></span>
        </div>
      </div>
    </StepFrame>
  ));

  /* ── Part three: example businesses ── */
  EXAMPLES.forEach((e, i) => {
    const article = /^[AEIOU]/i.test(e.who) ? 'An' : 'A';
    add(2, 3900, i === 0 ? `Here is what that looks like. ${article} ${e.who.toLowerCase()} in ${e.where.split(',')[0]}.` : `${article} ${e.who.toLowerCase()} in ${e.where.split(',')[0]}.`,
      p => <ExampleScene e={e} i={i} p={p} />);
  });

  return s;
}

export default function AutopilotFilm({ onTalk, onRecord, onType }: {
  onTalk: () => void;
  onRecord: () => void;
  onType: () => void;
}) {
  const scenes = useMemo(() => {
    const list = buildScenes();
    /* The last scene is where the film hands over to the real buttons. */
    list.push({ ch: 2, ms: 7000, say: 'Ready? Press Talk live, record your prompt, or type it — and put your business on AI Autopilot.', draw: () => (
      <div className="apf-end">
        <h3>Type it. Record it. Or just talk.</h3>
        <p>Protron sets AI Autopilot up with you, one small step at a time.</p>
        <div className="apf-end-row">
          <button type="button" className="apf-end-btn is-live" onClick={onTalk}><AudioLines size={16} /> Talk live with Protron</button>
          <button type="button" className="apf-end-btn is-rec" onClick={onRecord}><Mic size={16} /> Record my prompt</button>
          <button type="button" className="apf-end-btn" onClick={onType}><Keyboard size={16} /> Type it</button>
        </div>
      </div>
    ) });
    return list;
  }, [onTalk, onRecord, onType]);

  const starts = useMemo(() => { let a = 0; return scenes.map(s => { const at = a; a += s.ms; return at; }); }, [scenes]);
  const total = starts[starts.length - 1] + scenes[scenes.length - 1].ms;
  const chapterAt = (c: number) => starts[scenes.findIndex(s => s.ch === c)];
  const chapterEnd = (c: number) => (c < 2 ? chapterAt(c + 1) : total);

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [voice, setVoice] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const tRef = useRef(0);
  const visible = useRef(false);
  const chosen = useRef(false); // the person pressed play/pause — autoplay stops deciding
  const still = useRef(motionReduced());

  const idx = Math.max(0, starts.findIndex((st, i) => t >= st && t < st + scenes[i].ms));
  const scene = scenes[idx] ?? scenes[0];
  const p = clamp((t - starts[idx]) / scene.ms);

  const seek = useCallback((ms: number) => { tRef.current = Math.max(0, Math.min(total - 1, ms)); setT(tRef.current); }, [total]);

  /* The clock. */
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let drawn = 0;
    const tick = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      if (visible.current && !document.hidden) {
        tRef.current += dt;
        if (tRef.current >= total) { tRef.current = total - 1; setT(tRef.current); setPlaying(false); return; }
        /* ~30 renders a second: the scenes are timed in tenths, and a React
           render of the whole film every frame was frames the page needed. */
        if (now - drawn >= 32) { drawn = now; setT(tRef.current); }
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

  /* Narration: the browser's voice reads each caption as its scene starts. */
  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) return;
    if (!voice || !playing) { synth.cancel(); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(scene.say);
    u.rate = 1.05;
    u.lang = 'en-US';
    synth.speak(u);
  }, [idx, voice, playing, scene.say]);
  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);

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
      className="apf"
      role="region"
      aria-roledescription="video"
      aria-label="See AI Autopilot work"
      data-chapter={scene.ch}
      onKeyDown={e => { if (e.key === ' ' && e.target === e.currentTarget) { e.preventDefault(); toggle(); } }}
      tabIndex={0}
    >
      <div className="apf-head">
        <span className="apf-head-ch">{scene.ch + 1}/3 · {CHAPTERS[scene.ch]}</span>
        <span className="apf-head-title">See AI Autopilot work</span>
      </div>
      <div className="apf-stage" key={idx} aria-hidden="false">
        {scene.draw(p)}
      </div>
      <p className="apf-subs" aria-live={playing ? 'off' : 'polite'}>{scene.say}</p>
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
        {typeof window !== 'undefined' && 'speechSynthesis' in window && (
          <button type="button" className={`apf-ctl${voice ? ' is-on' : ''}`} onClick={() => setVoice(v => !v)} aria-pressed={voice}
            aria-label={voice ? 'Turn narration off' : 'Turn narration on'} title={voice ? 'Narration on' : 'Narration off'}>
            {voice ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
        )}
      </div>
    </div>
  );
}
