/**
 * "See the whole platform work" — the home page's demonstration film.
 *
 * The owner asked for a video that shows the whole platform working (2026-11-13):
 * Protron's live talk → AI Autopilot builds a business workspace and its
 * workflows → AI Prospecting finds prospects every day → campaigns send and
 * replies arrive → the booking page books appointments → deals move on the
 * pipeline → unpaid payments are followed up → reports, with Protron
 * watching the campaigns. Drawn by the same player as the closing
 * AutopilotDemo (shared/DemoFilm.tsx), in the app's own palette, with one
 * example business (Brightside Plumbing, Tucson — the same as the closing
 * film) and its example prospects on `.example` addresses.
 *
 * ── Honesty ──
 *
 * The frame says "Illustration · example business". There is no figure that
 * could read as a result: no counts of prospects, replies, bookings or money,
 * and the report says what it covers, not how much. Every label is a real
 * screen's word: "Contact checked" (a format, domain and mail-server check —
 * never "verified", which in this product means a mailbox verifier said so),
 * "Approve the plan", "Appointments", "Build My AI Autopilot".
 *
 * ── Two versions of the first and last steps ──
 *
 * Protron on every screen — the plan it proposes, building it with its
 * pointer, offering to improve a campaign — is held back to the testing site
 * (`featureReady('protron-hands')`, docs/INCUBATOR.md). Where it is off, `agent`
 * is false and the film shows only what is live there: talking to Protron
 * when a business workspace is started, the wizard building it, and the
 * campaign watch's notice and email. It turns into the full story the day
 * Protron is released, with no edit here.
 */
import type { CSSProperties } from 'react';
import {
  AlertTriangle, BarChart3, Bell, Calendar, CalendarCheck, Check, ChevronRight, CreditCard, FileText,
  GitBranch, Inbox, KanbanSquare, Mail, MessageSquare, Search, Send, Sparkles, Users,
} from 'lucide-react';
import DemoFilm, { Typed, click, move, on, type, type FilmStep, type RailItem } from '../shared/DemoFilm';
import './platformDemo.css';

const PORTRAIT = '/protron/robot-160.webp';

const RAIL: RailItem[] = [
  { id: 'autopilot', icon: Sparkles, label: 'AI Autopilot' },
  { id: 'prospecting', icon: Search, label: 'Prospecting' },
  { id: 'campaigns', icon: Mail, label: 'Campaigns' },
  { id: 'inbox', icon: MessageSquare, label: 'Inbox' },
  { id: 'booking', icon: CalendarCheck, label: 'Booking' },
  { id: 'deals', icon: KanbanSquare, label: 'Deals' },
  { id: 'payments', icon: CreditCard, label: 'Payments' },
  { id: 'reports', icon: BarChart3, label: 'Reports' },
];

const ap = (s: string) => <>AI Autopilot <ChevronRight size={13} /> {s}</>;

function steps(agent: boolean): FilmStep[] {
  return [
    {
      title: agent ? 'Talk to Protron' : 'Chat with Protron',
      caption: agent
        ? 'Talk to Protron like a colleague, out loud. It proposes a plan in a few lines, and you approve it.'
        : 'Start a business workspace in a chat with Protron — type, or send a voice message. It asks a few short questions and writes the plan.',
      crumb: agent ? 'Protron · Live talk' : ap('New business workspace'),
      rail: agent ? '' : 'autopilot',
      ms: 10200,
      cues: [
        on(200, 'live'), on(400, 'u1'), type(500, 'u1t', 2300),
        on(3100, 'p1'), type(3200, 'p1t', 1300),
        on(4500, 'plan'), on(4800, 'b1'), on(5150, 'b2'), on(5500, 'b3'), on(5850, 'b4'),
        move(6200, 'ok', 900, agent ? 'Approving the plan' : 'Building the plan'), click(7300, 'ok'), on(7500, 'done'),
      ],
    },
    {
      title: 'Autopilot builds',
      caption: agent
        ? 'Protron builds it in AI Autopilot while you watch: the business workspace, its 12-month plan and its workflows.'
        : 'AI Autopilot builds the business workspace: its 12-month marketing plan, its workflows and their emails.',
      crumb: ap('Brightside Plumbing'),
      rail: 'autopilot',
      ms: 9400,
      cues: [
        on(100, 'st0'),
        move(300, 'nx', 900, agent ? 'Protron · Next' : 'Next'), click(1300, 'nx'), on(1350, 'st1'),
        click(2100, 'nx'), on(2150, 'st2'), on(2200, 'nxb'),
        click(2900, 'nx'), on(2950, 'st3'), on(3000, 'build'),
        on(3300, 'w1'), ...Array.from({ length: 12 }, (_, i) => on(3400 + i * 70, `m${i}`)),
        on(4500, 'w2'), on(5200, 'w3'), on(5900, 'w4'), on(6600, 'w5'), on(7300, 'ready'),
      ],
    },
    {
      title: 'Daily prospects',
      caption: 'AI Prospecting finds businesses that fit and checks their addresses. A daily finder adds new ones every morning.',
      crumb: 'AI Prospecting',
      rail: 'prospecting',
      ms: 10200,
      cues: [
        move(200, 'cmp', 800, 'Describing who to find'), click(1100, 'cmp'), type(1150, 'q', 2100),
        move(3350, 'srch', 600, 'Searching'), click(4000, 'srch'),
        on(4200, 'res'), on(4400, 'r0'), on(4700, 'r1'), on(5000, 'r2'), on(5300, 'r3'),
        on(6100, 'daily'), on(6400, 'd0'), on(6800, 'd1'), on(7200, 'd2'), on(7600, 'd3'), on(8000, 'd4'),
      ],
    },
    {
      title: 'Campaigns',
      caption: 'Email campaigns go out from your own mailbox. Replies arrive in your inbox with an answer drafted for your OK.',
      crumb: 'Campaigns · Spring drain check',
      rail: 'campaigns',
      ms: 9000,
      cues: [
        on(150, 'e0'), on(450, 'e1'), on(750, 'e2'),
        move(1100, 'send', 900, 'Approve & send'), click(2100, 'send'), on(2200, 'camp'),
        on(3400, 'inbox'), on(3800, 'i0'), on(4600, 'i1'),
        move(5300, 'i0', 900, 'Opening the reply'), click(6300, 'i0'), on(6450, 'drafted'),
      ],
    },
    {
      title: 'Bookings',
      caption: 'Prospects pick a time on your booking page. Each new booking shows in the Appointments tray and is emailed to you.',
      crumb: 'Booking page · Drain check visit',
      rail: 'booking',
      ms: 9000,
      cues: [
        move(300, 'thu', 900, 'A prospect picks Thursday'), click(1300, 'thu'), on(1400, 'slots'),
        move(1900, 't9', 700, '9:00 am'), click(2700, 't9'),
        move(3100, 'book', 700, 'Booking'), click(3900, 'book'), on(4000, 'bk'),
        on(4900, 'dot'), on(5200, 'a0'), on(6000, 'mail'),
      ],
    },
    {
      title: 'Deals',
      caption: 'Every lead is a deal on your pipeline, from new lead to appointment to won, with its emails and bookings on it.',
      crumb: 'Deals · Pipeline',
      rail: 'deals',
      ms: 7800,
      cues: [
        on(150, 'k0'), on(350, 'k1'), on(550, 'k2'), on(750, 'k3'),
        move(1100, 'c0', 900, 'Moving the deal'), click(2100, 'c0'),
        move(2300, 'col2', 1000), click(3400, 'col2'), on(3450, 'board'), on(4400, 'won'),
      ],
    },
    {
      title: 'Payments',
      caption: 'Somebody who was sent a payment link and has not paid gets a friendly reminder with a fresh link.',
      crumb: 'Payments',
      rail: 'payments',
      ms: 9000,
      cues: [
        on(150, 'o0'), on(450, 'o1'), on(750, 'o2'),
        move(1200, 'o2', 900, 'Following up'), click(2200, 'o2'), on(2300, 'rem'),
        type(2600, 'rs', 900), type(3600, 'rb', 2200), on(6000, 'sentr'), on(6100, 'pay'),
      ],
    },
    {
      title: 'Reports',
      caption: agent
        ? 'A plain-words report of what happened. Protron watches running campaigns and asks to improve one that is doing badly.'
        : 'A plain-words report of what happened. If a campaign’s emails fail or replies stay low, you get a notice and an email.',
      crumb: 'Reports · Morning digest',
      rail: 'reports',
      ms: 9400,
      cues: [
        on(150, 'g0'), on(450, 'g1'), on(750, 'g2'), on(1050, 'g3'), on(1350, 'g4'),
        on(2300, 'alert'),
        move(3300, 'imp', 1000, agent ? 'Improve it' : 'Opening the campaign'), click(4500, 'imp'), on(4650, 'prop'),
      ],
    },
  ];
}

const PLAN = [
  'Find property managers and restaurants in Tucson, every morning',
  'Email them a drain-check offer from your mailbox, and follow up twice',
  'Put your booking link in every email',
  'Hold every reply for your OK before it sends',
];

const BUILT = [
  ['w1', '12-month marketing plan'],
  ['w2', 'Contact list for new prospects'],
  ['w3', 'Email workflow · New enquiry follow-up'],
  ['w4', 'Blog and social posts, on a schedule'],
  ['w5', 'Daily prospect finder'],
] as const;

const PROSPECTS = [
  { k: 'r0', name: 'Saguaro Property Management', cat: 'Property management', mail: 'office@saguaro-pm.example' },
  { k: 'r1', name: 'Desert Bloom Café', cat: 'Restaurant', mail: 'hello@desertbloom.example' },
  { k: 'r2', name: 'Pine Court Apartments', cat: 'Apartment complex', mail: 'manager@pinecourt.example' },
  { k: 'r3', name: 'Mesa Verde Diner', cat: 'Restaurant', mail: 'info@mesaverdediner.example' },
];

const DAYS = [
  { k: 'd0', d: 'Mon', who: 'Catalina Dental' },
  { k: 'd1', d: 'Tue', who: 'Rillito Lofts' },
  { k: 'd2', d: 'Wed', who: 'Sonoran Grill' },
  { k: 'd3', d: 'Thu', who: 'Tanque Verde HOA' },
  { k: 'd4', d: 'Fri', who: 'Old Pueblo Inn' },
];

const DIGEST = [
  { k: 'g0', icon: Search, t: 'New prospects the daily finder added' },
  { k: 'g1', icon: Send, t: 'Campaign emails sent from your mailbox' },
  { k: 'g2', icon: Inbox, t: 'Replies, and the answers waiting for your OK' },
  { k: 'g3', icon: CalendarCheck, t: 'New bookings on your booking page' },
  { k: 'g4', icon: CreditCard, t: 'Payments received, and reminders sent' },
];

/** Protron's portrait, as the app draws it: the owner's robot, in a lit ring. */
function Face({ live }: { live?: boolean }) {
  return (
    <span className={`pfd-face${live ? ' is-live' : ''}`}>
      <img src={PORTRAIT} alt="" width={160} height={160} loading="lazy" decoding="async" />
    </span>
  );
}

export default function PlatformDemo({ agent }: { agent: boolean }) {
  return (
    <DemoFilm
      steps={steps(agent)}
      rail={RAIL}
      className="pfd"
      label="The whole platform, step by step — an illustration with an example business"
    >
      {({ scene }) => (
        <>
          {/* 1 · Talk to Protron */}
          <section {...scene(0, 'pfd-s1')}>
            <div className="apd-card pfd-talk">
              <div className="pfd-who">
                <Face live={agent} />
                <span className="pfd-who-t"><b>Protron</b><small>AI Live Business Manager</small></span>
                <span className="pfd-live apd-r" data-k="live"><i /> {agent ? 'Live' : 'Chat'}</span>
              </div>
              {agent && <div className="pfd-bars" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}</div>}
              <div className="pfd-bub is-you apd-r" data-k="u1"><Typed k="u1t" text="We’re a plumbing business in Tucson. I want more booked jobs from local businesses." /></div>
              <div className="pfd-bub is-bot apd-r" data-k="p1"><Typed k="p1t" text={agent ? 'Got it. Here is a plan — approve it and I will build it.' : 'Got it. A couple of quick questions, then I will write the plan.'} /></div>
            </div>
            <div className="apd-card pfd-plan apd-r" data-k="plan">
              <div className="apd-card-h">
                <span className="apd-ic is-ai"><Sparkles size={16} /></span>
                <span><b>{agent ? 'Your setup plan' : 'Your smart optimized prompt for AI Autopilot'}</b><small>Brightside Plumbing · Tucson, Arizona</small></span>
              </div>
              <ul className="pfd-list">
                {PLAN.map((p, i) => (
                  <li key={p} className={`apd-r${i > 1 ? ' apd-wide-only' : ''}`} data-k={`b${i + 1}`}><Check size={14} strokeWidth={3} /> {p}</li>
                ))}
              </ul>
              <div className="pfd-foot">
                <span className="apd-btn is-primary apd-t" data-k="ok"><Check size={15} /> {agent ? 'Approve the plan' : 'Build My AI Autopilot'}</span>
                <span className="apd-st is-ok apd-r" data-k="done"><Check size={12} strokeWidth={3} /> {agent ? 'Approved' : 'Building'}</span>
              </div>
            </div>
          </section>

          {/* 2 · AI Autopilot builds */}
          <section {...scene(1, 'pfd-s2')}>
            <div className="apd-card pfd-wiz">
              <div className="apd-card-h">
                <span className="apd-ic is-ai"><Sparkles size={16} /></span>
                <span><b>New AI Autopilot business workspace</b><small>Brightside Plumbing · Tucson, Arizona</small></span>
              </div>
              <ol className="pfd-stepper">
                {['Business', 'Customers', 'Offer', 'Build'].map((s, i) => (
                  <li key={s} className="pfd-stp" data-k={`st${i}`}><i>{i + 1}</i><span>{s}</span></li>
                ))}
              </ol>
              <div className="pfd-sum">
                <span><b>Who</b> Property managers and restaurants</span>
                <span><b>Where</b> Tucson, Arizona</span>
                <span className="apd-wide-only"><b>Offer</b> A drain check before the monsoon</span>
              </div>
              <div className="pfd-foot">
                <span className="apd-btn is-primary apd-t pfd-nx" data-k="nx">
                  <span className="pfd-nx-a">Next <ChevronRight size={15} /></span>
                  <span className="pfd-nx-b" data-k="nxb"><Sparkles size={15} /> Build</span>
                </span>
              </div>
            </div>
            <div className="apd-card pfd-build" data-k="build">
              <b className="pfd-h">Building your business workspace</b>
              <ul className="pfd-checks">
                {BUILT.map(([k, t]) => (
                  <li key={k} className={`pfd-check${k === 'w4' ? ' apd-wide-only' : ''}`} data-k={k}><span className="apd-tick-s"><Check size={11} strokeWidth={3} /></span>{t}</li>
                ))}
              </ul>
              <div className="pfd-months">
                {['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map((m, i) => <span key={i} className="apd-r" data-k={`m${i}`}>{m}</span>)}
              </div>
              <span className="apd-st is-ok apd-r" data-k="ready"><Check size={12} strokeWidth={3} /> Ready — nothing sends until you approve it</span>
            </div>
          </section>

          {/* 3 · AI Prospecting, every day */}
          <section {...scene(2, 'pfd-s3')}>
            <div className="pfd-cmp apd-t" data-k="cmp">
              <Search size={17} />
              <span className="pfd-cmp-q"><span className="pfd-ph">Describe who you want to find</span><Typed k="q" text="Property managers and restaurants in Tucson with a website" /></span>
              <span className="apd-btn is-primary apd-t" data-k="srch">Search</span>
            </div>
            <div className="apd-card pfd-res apd-r" data-k="res">
              <div className="pfd-res-h"><b>Results</b><span className="apd-st">All businesses</span><span className="apd-st">With email</span></div>
              {PROSPECTS.map((p, i) => (
                <div key={p.k} className={`pfd-row apd-r${i > 1 ? ' apd-wide-only' : ''}`} data-k={p.k}>
                  <b>{p.name}</b><span className="pfd-cat">{p.cat}</span><span className="pfd-mail">{p.mail}</span>
                  <span className="apd-st is-ok"><Check size={11} strokeWidth={3} /> Contact checked</span>
                </div>
              ))}
            </div>
            <div className="pfd-daily apd-r" data-k="daily">
              <span className="pfd-daily-h"><Calendar size={15} /> Daily finder · every morning</span>
              <div className="pfd-days">
                {DAYS.map((d, i) => (
                  <span key={d.k} className={`pfd-day apd-r${i > 2 ? ' apd-wide-only' : ''}`} data-k={d.k}><b>{d.d}</b><small>+ {d.who}</small></span>
                ))}
              </div>
            </div>
          </section>

          {/* 4 · Campaigns and replies */}
          <section {...scene(3, 'pfd-s4')}>
            <div className="apd-card pfd-camp" data-k="camp">
              <div className="apd-card-h">
                <span className="apd-ic"><Mail size={16} /></span>
                <span><b>Email campaign · Spring drain check</b><small>From hello@brightside-plumbing.example</small></span>
              </div>
              {[
                ['e0', 'Email 1 · A drain check before the monsoon', 'Ready', 'Sent'],
                ['e1', 'Email 2 · Follow-up, three days later', 'Scheduled', 'Scheduled'],
                ['e2', 'Email 3 · A last note, a week later', 'Scheduled', 'Scheduled'],
              ].map(([k, t, a, b], i) => (
                <div key={k} className={`pfd-seq apd-r${i === 0 ? ' is-first' : ''}`} data-k={k}>
                  <Mail size={14} /><span>{t}</span>
                  <span className="pfd-swap"><span className="apd-st pfd-sa">{a}</span><span className="apd-st is-ok pfd-sb">{b}</span></span>
                </div>
              ))}
              <div className="pfd-foot"><span className="apd-btn is-primary apd-t" data-k="send"><Send size={14} /> Approve &amp; send</span></div>
            </div>
            <div className="apd-card pfd-inbox apd-r" data-k="inbox">
              <div className="apd-card-h"><span className="apd-ic"><Inbox size={16} /></span><span><b>Inbox</b><small>Replies to the campaign</small></span></div>
              <div className="pfd-msg apd-r apd-t" data-k="i0"><span className="pfd-dot" /><span><b>Re: A drain check before the monsoon</b><small>Yes — can you come next week? We have three buildings.</small></span></div>
              <div className="pfd-msg apd-r apd-wide-only" data-k="i1"><span className="pfd-dot" /><span><b>Re: A drain check before the monsoon</b><small>Do you also look after commercial kitchens?</small></span></div>
              <span className="apd-st is-ai apd-r" data-k="drafted"><Sparkles size={12} /> Answer drafted · waiting for your OK</span>
            </div>
          </section>

          {/* 5 · The booking page */}
          <section {...scene(4, 'pfd-s5')}>
            <div className="apd-card pfd-book">
              <div className="apd-card-h">
                <span className="apd-ic"><CalendarCheck size={16} /></span>
                <span><b>Book a drain check</b><small>Brightside Plumbing · 45 minutes</small></span>
              </div>
              <div className="pfd-week">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(d => (
                  <span key={d} className={`pfd-wd${d === 'Thu' ? ' apd-t' : ''}`} data-k={d === 'Thu' ? 'thu' : undefined}>{d}</span>
                ))}
              </div>
              <div className="pfd-slots apd-r" data-k="slots">
                {['8:00 am', '9:00 am', '11:00 am', '2:00 pm'].map((t, i) => (
                  <span key={t} className={`pfd-slot${t === '9:00 am' ? ' apd-t' : ''}${i === 3 ? ' apd-wide-only' : ''}`} data-k={t === '9:00 am' ? 't9' : undefined}>{t}</span>
                ))}
              </div>
              <div className="pfd-foot">
                <span className="apd-st is-ok apd-r" data-k="bk"><Check size={12} strokeWidth={3} /> Booked · Thursday 9:00 am</span>
                <span className="apd-btn is-primary apd-t" data-k="book">Book</span>
              </div>
            </div>
            <div className="apd-card pfd-tray">
              <div className="pfd-tray-h"><span className="pfd-bell"><Bell size={16} /><i className="apd-r" data-k="dot" /></span><b>Appointments</b></div>
              <div className="pfd-appt apd-r" data-k="a0">
                <span className="pfd-appt-d"><b>Thu</b><small>9:00</small></span>
                <span><b>Drain check</b><small>Pine Court Apartments</small></span>
                <span className="apd-st is-ok">New</span>
              </div>
              <span className="apd-st apd-r" data-k="mail"><Mail size={12} /> Booking email sent to you</span>
            </div>
          </section>

          {/* 6 · Deals on the pipeline */}
          <section {...scene(5, 'pfd-s6')}>
            <div className="pfd-board" data-k="board">
              {[
                { k: 'k0', h: 'New lead', cards: ['Catalina Dental', 'Rillito Lofts'] },
                { k: 'k1', h: 'Contacted', cards: ['Saguaro Property Management'] },
                { k: 'k2', h: 'Appointment booked', cards: [] },
                { k: 'k3', h: 'Won', cards: ['Mesa Verde Diner'] },
              ].map((c, i) => (
                <div key={c.k} className="pfd-col apd-r" data-k={c.k}>
                  <span className="pfd-col-h">{c.h}</span>
                  {i === 1 && <span className="pfd-deal pfd-src apd-t" data-k="c0"><b>Pine Court Apartments</b><small><CalendarCheck size={11} /> Booked Thu 9:00 am</small></span>}
                  {/* Where the deal lands: a dashed gap until it is moved, then the card. */}
                  {i === 2 && (
                    <span className="pfd-land apd-t" data-k="col2">
                      <span className="pfd-drop" />
                      <span className="pfd-deal pfd-dst"><b>Pine Court Apartments</b><small><CalendarCheck size={11} /> Booked Thu 9:00 am</small></span>
                    </span>
                  )}
                  {c.cards.map(n => <span key={n} className="pfd-deal"><b>{n}</b><small>{i === 3 ? <><Check size={11} /> Won</> : <><Mail size={11} /> In the campaign</>}</small></span>)}
                </div>
              ))}
            </div>
            <span className="apd-st is-ok pfd-won apd-r" data-k="won"><GitBranch size={12} /> Its emails, replies and booking stay on the deal</span>
          </section>

          {/* 7 · Payments followed up */}
          <section {...scene(6, 'pfd-s7')}>
            <div className="apd-card pfd-pays">
              <div className="apd-card-h"><span className="apd-ic"><CreditCard size={16} /></span><span><b>Payments</b><small>Orders with a payment link</small></span></div>
              <div className="pfd-pay apd-r" data-k="o0"><span><b>Water-heater install</b><small>Saguaro Property Management</small></span><span className="apd-st is-ok">Paid</span></div>
              <div className="pfd-pay apd-r apd-wide-only" data-k="o1"><span><b>Leak repair</b><small>Desert Bloom Café</small></span><span className="apd-st">Payment link sent</span></div>
              <div className="pfd-pay apd-r apd-t" data-k="o2">
                <span><b>Drain check</b><small>Pine Court Apartments</small></span>
                <span className="pfd-swap" data-k="pay"><span className="apd-st is-warn pfd-sa">Not paid yet</span><span className="apd-st is-ok pfd-sb">Reminder sent</span></span>
              </div>
            </div>
            <div className="apd-card pfd-rem apd-r" data-k="rem">
              <div className="pfd-rem-h"><Mail size={15} /> <b>Payment reminder</b></div>
              <div className="pfd-rem-row"><span>Subject</span><Typed k="rs" text="A fresh link to pay for your drain check" /></div>
              <p className="pfd-rem-body"><Typed k="rb" text="Hi Dana, thanks again for having us out on Thursday. Here is a fresh link to pay for the drain check whenever suits you." /></p>
              <span className="apd-st is-ok apd-r" data-k="sentr"><Check size={12} strokeWidth={3} /> Sent from your own mailbox</span>
            </div>
          </section>

          {/* 8 · Reports, and the campaign watch */}
          <section {...scene(7, 'pfd-s8')}>
            <div className="apd-card pfd-digest">
              <div className="apd-card-h"><span className="apd-ic"><FileText size={16} /></span><span><b>Morning digest</b><small>What happened overnight, in plain words</small></span></div>
              {DIGEST.map((g, i) => (
                <div key={g.k} className={`pfd-dg apd-r${i > 2 ? ' apd-wide-only' : ''}`} data-k={g.k}><g.icon size={15} /> {g.t}</div>
              ))}
            </div>
            <div className="apd-card pfd-alert apd-r" data-k="alert">
              <div className="pfd-who">
                {agent ? <Face /> : <span className="apd-ic pfd-warn"><AlertTriangle size={16} /></span>}
                <span className="pfd-who-t"><b>{agent ? 'Protron' : 'Campaign watch'}</b><small>{agent ? 'Watching your campaigns' : 'A campaign needs a look'}</small></span>
              </div>
              <p className="pfd-alert-t">
                {agent
                  ? <>Replies to <b>Spring drain check</b> are very low this week. Want me to improve it?</>
                  : <>Replies to <b>Spring drain check</b> are very low this week. We have emailed you about it too.</>}
              </p>
              <div className="pfd-foot">
                {agent && <span className="apd-btn">Not now</span>}
                <span className="apd-btn is-primary apd-t" data-k="imp">{agent ? <><Sparkles size={14} /> Improve it</> : <><Users size={14} /> Open the campaign</>}</span>
              </div>
              <span className="apd-st is-ai apd-r" data-k="prop"><Sparkles size={12} /> {agent ? 'Protron proposes the change — you approve it' : 'Open it to change the subject or the emails'}</span>
            </div>
          </section>
        </>
      )}
    </DemoFilm>
  );
}
