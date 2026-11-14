/**
 * "Meet Protron" and "What's new" — the home page's sections on the features
 * built in November 2026 (owner's brief, 2026-11-13).
 *
 * ── Only what is true on the host the visitor is on ──
 *
 * Protron on every screen — its plan, building with its pointer, offering
 * to improve a campaign — is held back to the testing site by the owner
 * (`featureReady('protron-hands')`, docs/INCUBATOR.md). What is live everywhere
 * is chatting with Protron when a business workspace is started, the campaign
 * watch's notice and email, the Appointments tray, the 12-month plans, the
 * AI health monitor and the security shield. So both sections take `agent`
 * and say only what that host's app does; the day Protron is released the
 * full story appears with no edit here. A public page that promises a
 * button the app does not show is the plausible success this codebase
 * refuses.
 *
 * ── The pointer ──
 *
 * The coral arrow with a white edge and a coral label pill is the look of
 * Protron's own pointer in the app (Protron/ProtronCursor.tsx, protron.css),
 * drawn again here rather than imported: those files belong to the app and
 * the site must not pull the panel's code in.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Activity, AudioLines, CalendarCheck, Check, ListChecks, MessageSquare, MonitorSmartphone,
  MousePointer2, ShieldCheck, Sparkles, Bot, CalendarRange, ArrowRight,
} from 'lucide-react';
import { useReveal, useRevealGroup } from './useReveal';
import { motionReduced } from '../../services/motion';
import './protronSection.css';

type Point = { icon: typeof Bot; title: string; body: string };

function points(agent: boolean): Point[] {
  const watch: Point = {
    icon: Activity,
    title: 'It watches your campaigns',
    body: agent
      ? 'If a running campaign’s emails start failing, or replies stay very low, Protron tells you — in the app and by email — and asks whether to improve it.'
      : 'If a running campaign’s emails start failing, or replies stay very low, you get a notice in the app and an email saying which one.',
  };
  const booked: Point = {
    icon: CalendarCheck,
    title: 'You hear about every booking',
    body: 'An appointment booked on your booking page shows in the Appointments tray at the top of the app, and the booking email comes to you.',
  };
  if (!agent) {
    return [
      { icon: MessageSquare, title: 'Chat with it like a colleague', body: 'Start a new business workspace and Protron opens a chat. Type, or record a voice message.' },
      { icon: ListChecks, title: 'A few short questions', body: 'It asks what the business does, where your customers are and what you offer — and reads your website if you have one.' },
      { icon: Sparkles, title: 'Then it writes the plan', body: 'Protron writes the plan for AI Autopilot in plain words you can change. AI Autopilot builds from it.' },
      watch,
      booked,
    ];
  }
  return [
    { icon: AudioLines, title: 'Talk to it like a colleague', body: 'Press Talk live and speak. Protron answers out loud in real time, and you can talk over it the way you would with a person. Prefer to type? Type.' },
    { icon: ListChecks, title: 'It proposes a plan in a few lines', body: 'Say what you want. Protron replies with a short plan — who to reach, what to send, what needs your OK — and waits for you.' },
    { icon: MousePointer2, title: 'Approve it, and watch it build', body: 'Once you approve, Protron builds it in AI Autopilot while you watch: its pointer moves through the app and presses the same buttons you would.' },
    watch,
    booked,
    { icon: MonitorSmartphone, title: 'On every screen', body: 'Protron sits in the corner of every screen of the app, knows which screen you are on, and can open any part of it for you.' },
  ];
}

const PLAN_LINES = [
  'Find property managers in Tucson every morning',
  'Email a drain-check offer, follow up twice',
  'Hold every reply for your OK',
];

/** The picture: Protron's portrait, a live-talk window, the plan card and its pointer. */
function Stage({ agent }: { agent: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  /* The pointer's little loop runs only while the picture is on screen. */
  const [live, setLive] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || motionReduced() || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setLive(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`ptn-stage${live ? ' is-live' : ''}${agent ? ' has-agent' : ''}`} aria-hidden="true">
      <div className="ptn-in">
      <div className="ptn-portrait">
        <span className="ptn-ring" />
        <img src="/protron/robot-384.webp" alt="" width={384} height={384} loading="lazy" decoding="async" />
        <span className="ptn-tag"><Bot size={13} /> AI Live Business Manager</span>
      </div>
      <div className="ptn-window">
        <div className="ptn-win-h">
          <b>Protron</b>
          <span className="ptn-live"><i /> {agent ? 'Talking live' : 'Chat'}</span>
        </div>
        {agent && <div className="ptn-voice">{Array.from({ length: 11 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}</div>}
        <p className="ptn-bub is-you">I run a plumbing business in Tucson. I want more booked jobs.</p>
        <p className="ptn-bub is-bot">{agent ? 'Here is a plan. Approve it and I will build it while you watch.' : 'Got it. Where are most of your customers?'}</p>
        <div className="ptn-plan">
          <b><Sparkles size={13} /> {agent ? 'Your setup plan' : 'Your smart optimized prompt'}</b>
          <ul>{PLAN_LINES.map(l => <li key={l}><Check size={12} strokeWidth={3} /> {l}</li>)}</ul>
          <span className="ptn-approve-w">
            <span className="ptn-approve">{agent ? 'Approve the plan' : 'Build My AI Autopilot'}</span>
            {agent && (
              <span className="ptn-ptr">
                <span className="ptn-ripple" />
                <svg width="24" height="26" viewBox="0 0 24 26"><path d="M3 2.5 L3 21 L8.2 16.4 L11.6 23.6 L15 22 L11.7 15 L19.2 14.6 Z" fill="#d97757" stroke="#fff" strokeWidth="2" strokeLinejoin="round" /></svg>
                <span className="ptn-chip">Protron · Building in AI Autopilot</span>
              </span>
            )}
          </span>
        </div>
      </div>
      </div>
    </div>
  );
}

export function ProtronSection({ agent }: { agent: boolean }) {
  const stage = useReveal<HTMLDivElement>();
  const list = useRevealGroup<HTMLUListElement>('li');
  return (
    <section className="dc-process ptn" id="protron" aria-label="Protron, your AI Live Business Manager">
      <div className="dc-chapter-head">
        <span className="dc-eyebrow">Protron</span>
        <h2>Meet Protron. <em>Your AI Live Business Manager.</em></h2>
        <p>
          {agent
            ? 'Protron is your AI Live Business Manager, on every screen of the app. Talk to it live, out loud. It proposes a plan, builds it in AI Autopilot once you approve, and keeps watch while it runs.'
            : 'Protron is your AI Live Business Manager: you chat with it when you start a business workspace. Type, or send a voice message: it asks a few short questions and writes the plan AI Autopilot builds.'}
        </p>
      </div>
      <div className="ptn-grid">
        <div className="reveal" ref={stage}><Stage agent={agent} /></div>
        <ul className="ptn-points stagger" ref={list}>
          {points(agent).map(p => (
            <li key={p.title}>
              <span className="dc-tile-icon"><p.icon size={15} /></span>
              <span><b>{p.title}</b><small>{p.body}</small></span>
            </li>
          ))}
        </ul>
      </div>
      <p className="ptn-note">
        <ShieldCheck size={14} /> {agent
          ? 'Sending, publishing, paying and deleting stay your buttons — Protron opens the screen and shows you where they are.'
          : 'Nothing sends until you approve it.'}
      </p>
    </section>
  );
}

type News = { area: string; icon: typeof Bot; title: string; body: string; href?: string };

function news(agent: boolean): News[] {
  return [
    agent
      ? { area: 'Protron', icon: Bot, title: 'Protron, your AI Live Business Manager', body: 'On every screen: talk to it live, approve the plan it proposes, and watch it build in AI Autopilot.', href: '#protron' }
      : { area: 'Protron', icon: Bot, title: 'Chat with Protron', body: 'Start a business workspace in a chat with Protron — typed, or as a voice message. It asks a few questions and writes the plan.', href: '#protron' },
    { area: 'AI Autopilot', icon: CalendarRange, title: '12-month marketing plans', body: 'AI Autopilot writes a 12-month plan for each business workspace, a theme for every month, and the dashboard lists each one.' },
    { area: 'Campaigns', icon: Activity, title: 'Campaign watch', body: agent
      ? 'Running campaigns are checked every hour. Failing sends or very low replies raise a notice and an email, and Protron offers to fix it.'
      : 'Running campaigns are checked every hour. Failing sends or very low replies raise a notice in the app and an email.' },
    { area: 'Booking', icon: CalendarCheck, title: 'Appointments tray', body: 'New bookings from your booking page appear in a tray at the top of every screen, and the booking email comes to you.' },
    { area: 'AI', icon: Sparkles, title: 'AI that keeps working', body: 'We check every AI tool the platform uses each hour and are alerted when one fails or runs low. Backup AI keys take over when one is busy.' },
    { area: 'Security', icon: ShieldCheck, title: 'The security shield', body: 'The shield in the top bar shows how your workspace is protected: HTTPS, workspaces kept apart on our server, encrypted connected credentials, optional 2-step sign-in.' },
  ];
}

export function WhatsNew({ agent }: { agent: boolean }) {
  const grid = useRevealGroup<HTMLDivElement>('.ptn-new-card');
  return (
    <section className="dc-process ptn-new" id="whats-new" aria-label="What's new">
      <div className="dc-chapter-head">
        <span className="dc-eyebrow">What’s new</span>
        <h2>New in Protected Central <em>this month.</em></h2>
      </div>
      <div className="ptn-new-grid stagger" ref={grid}>
        {news(agent).map(n => {
          const body = (
            <>
              <span className="ptn-new-top"><span className="dc-tile-icon"><n.icon size={14} /></span><i>{n.area}</i></span>
              <b>{n.title}</b>
              <small>{n.body}</small>
              {n.href && <span className="ptn-new-more">Meet Protron <ArrowRight size={13} /></span>}
            </>
          );
          return n.href
            ? <a key={n.title} className="ptn-new-card" href={n.href}>{body}</a>
            : <div key={n.title} className="ptn-new-card">{body}</div>;
        })}
      </div>
      <p className="ptn-new-foot"><a href="/changelog">Everything that has shipped <ArrowRight size={13} /></a> · <a href="#coming-soon">Coming soon <ArrowRight size={13} /></a></p>
    </section>
  );
}
