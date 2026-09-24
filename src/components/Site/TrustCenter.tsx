/**
 * /security — the Trust Center.
 *
 * ── The rule this page is written to ──
 *
 * Every sentence here describes something the code does today, and says where
 * a protection depends on a choice (your AI key's plan, a service you connect).
 * Nothing is "military-grade", nothing is "unhackable", and no certification is
 * named that is not held — a security page that overclaims is the first thing
 * a careful buyer stops trusting. What is not done yet is listed as not done.
 *
 * When a protection changes, this page changes in the same commit. The facts
 * are kept close to the code they describe: see docs/SECURITY.md for the audit
 * behind each line.
 */
import {
  ArrowLeft, ArrowRight, Lock, KeyRound, Users, Server, Sparkles, Activity, Download, Bug, ShieldCheck, Database, Globe, Check, X,
} from 'lucide-react';
import { LogoMark } from '../shared/Logo';
import { appHref, isCrossOrigin } from '../../services/hosts';
import { usePageTitle } from '../../services/pageTitle';
import './site.css';

export const SECURITY_CONTACT = 'security@protectedcentral.com';
const UPDATED = '24 September 2026';

const cross = (href: string) => (isCrossOrigin(href) ? { rel: 'noopener' as const } : {});

const SECTIONS: { id: string; icon: typeof Lock; title: string; lead: string; points: string[] }[] = [
  {
    id: 'isolation', icon: Lock, title: 'Workspace isolation',
    lead: 'Each business works in its own workspace, and the server — not the page in your browser — decides who may open it.',
    points: [
      'Every request that reads or changes workspace data is checked on the server against the signed-in account.',
      'Records are saved against their workspace; a request naming another workspace’s record is refused, not quietly applied.',
      'Workspace isolation is tested by signing up two accounts and having one attempt to read, send as, and overwrite the other.',
      'There is no staff login that can open your workspace as you.',
    ],
  },
  {
    id: 'access', icon: KeyRound, title: 'Signing in',
    lead: 'Several ways in, each with limits on guessing.',
    points: [
      'Passwords are stored only as PBKDF2-SHA-256 hashes with a unique salt, never in readable form.',
      'Optional 2-step sign-in with an authenticator app (time-based one-time codes).',
      'Sign in with an emailed one-time code, or with Google.',
      'Repeated wrong passwords are slowed down per account and per network.',
      'Session tokens are stored on our side only as a hash. You can see every device signed in to your account and sign any of them out.',
      'Changing your password needs your current one and signs out your other devices.',
    ],
  },
  {
    id: 'roles', icon: Users, title: 'Access control',
    lead: 'Who can do what is decided by the account’s role, on the server.',
    points: [
      'A workspace owner manages its members, settings and connected services.',
      'Members added to a workspace can open that workspace and nothing else.',
      'Connecting the platform’s own payment processor is limited to a single install owner account.',
      'Security-relevant actions — sign-ins, failed attempts, password and member changes — are recorded in an activity log you can read in Settings.',
    ],
  },
  {
    id: 'encryption', icon: Server, title: 'Encryption',
    lead: 'Described exactly, because “encrypted” can mean many things.',
    points: [
      'All traffic to the app uses HTTPS (TLS), and browsers are told to insist on it (HSTS).',
      'Credentials you connect — mailbox passwords, API keys, payment keys, calendar tokens — are encrypted with AES-256-GCM before they are stored, and are never sent back to a browser. Screens only say whether a service is connected.',
      'Your workspace data is stored in Cloudflare’s D1 database, on Cloudflare’s infrastructure.',
      'This is not end-to-end encryption: our server can read your workspace data, because it has to — to send your campaigns and run your automations.',
    ],
  },
  {
    id: 'ai', icon: Sparkles, title: 'AI processing',
    lead: 'AI features use Google’s Gemini models. They receive what the task needs, not your workspace.',
    points: [
      'Writing posts, articles and campaigns: your business profile and your request.',
      'Starting a project: what you type or say, and any files or web pages you give it.',
      'Replying to email and chat: the message being answered, with your business profile.',
      'Screening outgoing messages for abuse: the text of that message.',
      'Your contact list is not sent — messages are written with placeholders that are filled in on our side.',
      'Most AI features are called from our server with the platform’s key. A few older tools — review replies, inbox drafts, AI Shorts and some content planners — call Gemini directly from your browser when you have saved your own AI key in Settings → AI Engine. We are moving those to the server.',
      'Whether Google may use this data to improve its models depends on the plan of the AI key in use: Google’s terms say paid-plan prompts are not used that way, and free-tier prompts may be.',
    ],
  },
  {
    id: 'monitoring', icon: Activity, title: 'Monitoring and errors',
    lead: 'Useful for fixing problems, without becoming a second copy of your data.',
    points: [
      'If something fails on the server you see a short message with a reference such as PC-7F3A21; the details stay in our logs.',
      'Passwords, keys and tokens are not written to logs.',
      'Operational logs are deleted automatically — security activity after 180 days, delivery logs after 30.',
      'Pages are served with browser protections that block injected scripts and stop the app being framed by other sites.',
    ],
  },
  {
    id: 'backups', icon: Database, title: 'Backups and recovery',
    lead: 'What is in place today.',
    points: [
      'The database supports point-in-time restore through Cloudflare D1 Time Travel, within the retention window of our Cloudflare plan.',
      'A restore point is recorded automatically before every release that changes the database.',
      'Changes reach the live app only after passing a separate testing environment with its own database.',
    ],
  },
  {
    id: 'control', icon: Download, title: 'Your control over your data',
    lead: 'In Settings → Security & Privacy.',
    points: [
      'Download your workspace data as one file at any time (connected-service keys are never included).',
      'Delete your account and every workspace you own, with its data and connections.',
      'Sign out devices, turn on 2-step sign-in, and read your security activity.',
    ],
  },
];

const PROVIDERS: { name: string; what: string; when: string }[] = [
  { name: 'Cloudflare', what: 'Hosting, database, network', when: 'Always' },
  { name: 'Google (Gemini)', what: 'AI writing, reading and transcription', when: 'When you use an AI feature' },
  { name: 'Google (Sign-In, Calendar)', what: 'Signing in; calendar bookings', when: 'If you sign in with Google or connect a calendar' },
  { name: 'Stripe or Creem', what: 'Card payments, on their own pages', when: 'When you pay, or your shop takes a payment' },
  { name: 'Your email provider', what: 'Sending and reading your mail', when: 'The mailbox or service you connect' },
  { name: 'Twilio', what: 'Text messages', when: 'If you connect SMS' },
  { name: 'Openprovider', what: 'Domain registration', when: 'If you buy a domain through the app' },
];

const NOT_YET = [
  'SOC 2, ISO 27001, HIPAA or PCI DSS certification — we do not hold these. Card details are entered on Stripe’s or Creem’s own payment pages and never reach our servers.',
  'Single sign-on (SAML) for teams.',
  'Customer-chosen data residency.',
];

export default function TrustCenter() {
  usePageTitle('Security & Privacy — Protected Central');
  const home = typeof window !== 'undefined' && /^(www\.)?protectedcentral\.com$/.test(window.location.hostname) ? '/' : appHref('/');

  return (
    <div className="dc tc">
      <header className="dc-nav stuck">
        <a className="dc-brand" href={home}><LogoMark size={26} /><span>Protected Central</span></a>
        <div className="dc-nav-cta">
          <a className="dc-btn dc-btn-ghost" href={appHref('/login')} {...cross(appHref('/login'))}>Sign in</a>
          <a className="dc-btn dc-btn-primary" href={appHref('/signup')} {...cross(appHref('/signup'))}>Start free</a>
        </div>
      </header>

      <main className="tc-main">
        <a className="tc-back" href={home}><ArrowLeft size={14} /> Back to the site</a>
        <span className="dc-eyebrow">Trust Center</span>
        <h1 className="tc-h1">Your business belongs to you.</h1>
        <p className="tc-lead">
          Protected Central is built around privacy, access control and careful handling of the data you put in.
          This page says exactly what that means today — including what we do not do yet.
        </p>
        <p className="tc-updated">Last updated {UPDATED}</p>

        <nav className="tc-toc" aria-label="On this page">
          {SECTIONS.map(s => <a key={s.id} href={`#${s.id}`}>{s.title}</a>)}
          <a href="#providers">Service providers</a>
          <a href="#not-yet">What we do not claim</a>
          <a href="#report">Report a vulnerability</a>
        </nav>

        <div className="tc-grid">
          {SECTIONS.map(s => (
            <section key={s.id} id={s.id} className="tc-card">
              <div className="tc-card-head"><span className="dc-tile-icon"><s.icon size={16} /></span><h2>{s.title}</h2></div>
              <p className="tc-card-lead">{s.lead}</p>
              <ul>{s.points.map(p => <li key={p}><Check size={13} /> <span>{p}</span></li>)}</ul>
            </section>
          ))}
        </div>

        <section id="providers" className="tc-card tc-wide">
          <div className="tc-card-head"><span className="dc-tile-icon"><Globe size={16} /></span><h2>Service providers</h2></div>
          <p className="tc-card-lead">Other companies that process data for the features you use. Most are involved only if you use that feature.</p>
          <div className="tc-table" role="table" aria-label="Service providers">
            <div role="row" className="tc-row tc-row-head"><span role="columnheader">Provider</span><span role="columnheader">What for</span><span role="columnheader">When</span></div>
            {PROVIDERS.map(p => (
              <div role="row" className="tc-row" key={p.name}>
                <span role="cell"><b>{p.name}</b></span><span role="cell">{p.what}</span><span role="cell">{p.when}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="not-yet" className="tc-card tc-wide">
          <div className="tc-card-head"><span className="dc-tile-icon"><ShieldCheck size={16} /></span><h2>What we do not claim</h2></div>
          <p className="tc-card-lead">So that nothing above is read as more than it is.</p>
          <ul className="tc-not">{NOT_YET.map(p => <li key={p}><X size={13} /> <span>{p}</span></li>)}</ul>
        </section>

        <section id="report" className="tc-card tc-wide">
          <div className="tc-card-head"><span className="dc-tile-icon"><Bug size={16} /></span><h2>Report a vulnerability</h2></div>
          <p className="tc-card-lead">
            If you believe you have found a security problem, email <a href={`mailto:${SECURITY_CONTACT}`}>{SECURITY_CONTACT}</a> with
            what you found and how to reproduce it. Please do not access other people’s data, run automated scans against the
            live service, or disrupt it while testing. We will reply, keep you informed, and credit you if you would like.
          </p>
        </section>

        <div className="tc-cta">
          <a className="dc-btn dc-btn-primary dc-btn-lg" href={appHref('/signup')} {...cross(appHref('/signup'))}>Start free <ArrowRight size={15} /></a>
          <a className="dc-btn dc-btn-outline dc-btn-lg" href="/terms">Acceptable use policy</a>
        </div>
      </main>
    </div>
  );
}
