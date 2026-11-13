/**
 * "Watch it get built" — AI Autopilot, step by step, at the foot of the home page.
 *
 * ── Why it is drawn, and what it replaced ──
 *
 * The closing section used to hold a reel of the dashboard: a whole page
 * shrunk into the strip, which read as a short, tall picture with a wide gap
 * above it, and nothing in it showed Autopilot doing anything. The owner
 * asked for a proper demonstration: 16:9 across the column, a story a visitor
 * can follow, and a pointer that moves like a hand rather than jumping.
 *
 * So the page draws it, as five scenes in the app's own Autopilot palette
 * (Autopilot/theme.ts) with the product's real names — New AI Autopilot
 * business workspace, the 12-month marketing plan, Workflows, Marketing,
 * Conversations, replies held for your OK. A recorded MP4 would go stale the
 * day a label changes and would be blurry at one of the two widths; this is
 * crisp at both and costs no download.
 *
 * ── Honesty ──
 *
 * It is an illustration with one example business, and says so in the frame.
 * There are no figures in it: the last scene says what happens ("Replies
 * arrive in your inbox"), not how many — an invented count would read as a
 * result (CLAUDE.md: no invented figures on a customer screen).
 *
 * ── How it moves ──
 *
 * The player — design sizes, the clock, the pointer, the bar — is
 * shared/DemoFilm.tsx, shared with the platform film above it on the page and
 * the AI Prospecting demo in the app. This file is the story and its scenes.
 */
import type { CSSProperties, ReactNode } from 'react';
import {
  Calendar, Check, ChevronRight, Clock, FileText, GitBranch, Inbox, LayoutDashboard, Loader, Mail,
  MessageSquare, Send, Share2, ShieldCheck, Sparkles, Zap,
} from 'lucide-react';
import DemoFilm, { Field, Typed, click, move, on, type, type FilmStep, type RailItem } from '../shared/DemoFilm';
import './autopilotDemo.css';

/* ── The story ─────────────────────────────────────────────────────────── */

type Rail = 'autopilot' | 'marketing' | 'conversations';

type Step = Omit<FilmStep, 'crumb' | 'rail'> & { crumb: string; rail: Rail };

const MONTHS: [string, string][] = [
  ['Jan', 'New-year plumbing check'], ['Feb', 'Frozen-pipe prevention'], ['Mar', 'Water-heater tune-up'],
  ['Apr', 'Leak detection week'], ['May', 'Outdoor taps & irrigation'], ['Jun', 'Water-saving tips'],
  ['Jul', 'Monsoon drain prep'], ['Aug', 'Back-to-school routines'], ['Sep', 'Water-heater flush month'],
  ['Oct', 'Fall inspection offer'], ['Nov', 'Guest-ready kitchens'], ['Dec', 'Year-end maintenance'],
];

const STEPS: Step[] = [
  {
    title: 'Business details',
    caption: 'Tell AI Autopilot about the business in a few lines. That is the whole brief.',
    crumb: 'New business workspace',
    rail: 'autopilot',
    ms: 9400,
    cues: [
      move(200, 'f1', 750, 'Typing the business name'), click(1000, 'f1'), type(1050, 'f1t', 850), on(1900, 'w1'),
      move(2050, 'f2', 650, 'What it sells'), click(2750, 'f2'), type(2800, 'f2t', 1300), on(3900, 'w2'),
      move(4250, 'f3', 600, 'Who it serves'), click(4900, 'f3'), type(4950, 'f3t', 1000), on(5700, 'w3'),
      move(6050, 'f4', 550, 'The website'), click(6650, 'f4'), type(6700, 'f4t', 850), on(7300, 'w4'),
      move(7650, 'go', 750, 'Building the plan'), click(8450, 'go'),
    ],
  },
  {
    title: '12-month plan',
    caption: 'It writes a 12-month marketing plan from what you said — a theme for every month.',
    crumb: 'Brightside Plumbing · Overview',
    rail: 'autopilot',
    ms: 7600,
    cues: [
      on(150, 'plan'),
      ...MONTHS.map((_, i) => on(350 + i * 120, `m${i}`)),
      move(2100, 'm6', 900, 'Opening July'), click(3100, 'm6'), on(3200, 'detail'),
      on(3600, 'd1'), on(3850, 'd2'), on(4100, 'd3'),
    ],
  },
  {
    title: 'Workflows & emails',
    caption: 'It builds the email workflows and writes every email in them, ready to read.',
    crumb: 'Brightside Plumbing · Workflows',
    rail: 'autopilot',
    ms: 8600,
    cues: [
      on(150, 'n0'), on(450, 'e0'), on(600, 'n1'), on(900, 'e1'), on(1050, 'n2'), on(1350, 'e2'), on(1500, 'n3'), on(1800, 'e3'), on(1950, 'n4'),
      move(2200, 'n4', 850, 'Writing the email'), click(3150, 'n4'), on(3250, 'mail'),
      type(3500, 'subj', 750), type(4350, 'body', 2500), on(7000, 'hold'),
    ],
  },
  {
    title: 'Posts scheduled',
    caption: 'Blog articles and social posts are written to the plan and put on the schedule.',
    crumb: 'Marketing · Scheduled posts',
    rail: 'marketing',
    ms: 7000,
    cues: [
      on(250, 'p0'), on(600, 'p1'), on(950, 'p2'), on(1300, 'p3'), on(1650, 'p4'),
      move(2100, 'sched', 900, 'Scheduling the posts'), click(3100, 'sched'), on(3150, 'week'),
    ],
  },
  {
    title: 'Replies come in',
    caption: 'Replies arrive in your inbox with an answer drafted. Nothing sends until you say yes.',
    crumb: 'Conversations',
    rail: 'conversations',
    ms: 9600,
    cues: [
      on(250, 'r0'), on(650, 'r1'), on(1050, 'r2'),
      move(1500, 'r0', 850, 'Reading the reply'), click(2450, 'r0'), on(2550, 'reply'),
      type(2900, 'draft', 1900),
      move(5000, 'send', 800, 'Sending once you say yes'), click(5900, 'send'), on(6000, 'sent'),
      on(6700, 'b1'), on(7100, 'b2'),
    ],
  },
];

const WILL: [string, ReactNode][] = [
  ['w1', <>A <b>12-month marketing plan</b></>],
  ['w2', <><b>Email workflows</b> and every email in them</>],
  ['w3', <><b>Blog and social posts</b>, on a schedule</>],
  ['w4', <><b>Reply drafts</b>, held for your OK</>],
];

const FLOW: { k: string; tone: string; icon: typeof Mail; h: string; s: string }[] = [
  { k: 'n0', tone: 'trigger', icon: Zap, h: 'New enquiry arrives', s: 'Trigger' },
  { k: 'n1', tone: 'ai', icon: Sparkles, h: 'AI writes a personal reply', s: 'AI step' },
  { k: 'n2', tone: 'wait', icon: Clock, h: 'Wait two days', s: 'Wait' },
  { k: 'n3', tone: 'condition', icon: GitBranch, h: 'Did they reply?', s: 'If / else' },
  { k: 'n4', tone: 'integration', icon: Mail, h: 'Send follow-up email', s: 'Email' },
];

const POSTS: { k: string; day: string; kind: string; icon: typeof Mail; h: string }[] = [
  { k: 'p0', day: 'Mon', kind: 'Facebook post', icon: Share2, h: 'Is your drain ready for monsoon season?' },
  { k: 'p1', day: 'Tue', kind: 'Blog post', icon: FileText, h: 'Getting your drains ready for the monsoon' },
  { k: 'p2', day: 'Wed', kind: 'Instagram post', icon: Share2, h: 'Before and after: a water-heater install' },
  { k: 'p3', day: 'Thu', kind: 'LinkedIn post', icon: Share2, h: 'Why we flush water heaters every year' },
  { k: 'p4', day: 'Fri', kind: 'Facebook post', icon: Share2, h: 'A leak at the weekend? Do this first' },
];

const INBOX: { k: string; subj: string; msg: string }[] = [
  { k: 'r0', subj: 'Re: Still need a hand with that leak?', msg: 'Yes please — is Thursday morning possible?' },
  { k: 'r1', subj: 'Re: Is your drain ready for monsoon season?', msg: 'How much notice do you need for a drain check?' },
  { k: 'r2', subj: 'New enquiry from your website', msg: 'Our water heater is making a banging noise.' },
];

/* ── The player ────────────────────────────────────────────────────────── */

const RAIL: RailItem[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'autopilot', icon: Sparkles, label: 'AI Autopilot' },
  { id: 'conversations', icon: MessageSquare, label: 'Conversations' },
  { id: 'calendar', icon: Calendar, label: 'Calendar' },
  { id: 'marketing', icon: Mail, label: 'Marketing' },
];

const FILM: FilmStep[] = STEPS.map(s => ({
  ...s,
  crumb: s.rail === 'autopilot' ? <>AI Autopilot <ChevronRight size={13} /> {s.crumb}</> : s.crumb,
}));

export default function AutopilotDemo() {
  return (
    <DemoFilm steps={FILM} rail={RAIL} label="AI Autopilot, step by step — an illustration with an example business">
      {({ scene }) => (
        <>
          {/* 1 · Business details */}
          <section {...scene(0, 'apd-s1')}>
            <div className="apd-card apd-form">
              <div className="apd-card-h">
                <span className="apd-ic is-ai"><Sparkles size={16} /></span>
                <span><b>New AI Autopilot business workspace</b><small>Tell it about the business — it builds the rest.</small></span>
              </div>
              <Field k="f1" label="Business name" ph="Your business" text="Brightside Plumbing" />
              <Field k="f2" label="What you sell" ph="Your services" text="Emergency repairs and water-heater installs" />
              <Field k="f3" label="Who your customers are" ph="Who you serve, and where" text="Homeowners in Tucson, Arizona" />
              <Field k="f4" label="Website" ph="yourbusiness.com" text="brightside-plumbing.example" wide />
              <div className="apd-form-foot">
                <span className="apd-btn is-primary apd-t apd-go" data-k="go">
                  <span className="apd-go-a"><Sparkles size={15} /> Build my plan</span>
                  <span className="apd-go-b"><Loader size={15} className="apd-spin" /> Building…</span>
                </span>
              </div>
            </div>
            <aside className="apd-card apd-will">
              <b className="apd-will-h">What AI Autopilot will build</b>
              <ul>
                {WILL.map(([k, text]) => (
                  <li key={k} className="apd-will-i" data-k={k}><span className="apd-tick"><Check size={12} strokeWidth={3} /></span><span>{text}</span></li>
                ))}
              </ul>
            </aside>
          </section>

          {/* 2 · The 12-month plan */}
          <section {...scene(1, 'apd-s2')}>
            <div className="apd-card apd-plan apd-r" data-k="plan">
              <div className="apd-card-h">
                <span className="apd-ic is-ai"><Calendar size={16} /></span>
                <span><b>12-month marketing plan</b><small>Written from your brief. Every agent works to the month’s theme.</small></span>
              </div>
              <div className="apd-months">
                {MONTHS.map(([m, theme], i) => (
                  <div key={m} className={`apd-month apd-r${i === 6 ? ' apd-t' : ''}`} data-k={`m${i}`}>
                    <b>{m}</b><span>{theme}</span>
                  </div>
                ))}
              </div>
              <div className="apd-detail apd-r" data-k="detail">
                <b>July · Monsoon drain prep</b>
                <span className="apd-detail-i apd-r" data-k="d1"><Mail size={14} /> Emails to past customers about drain checks</span>
                <span className="apd-detail-i apd-r" data-k="d2"><Share2 size={14} /> Social posts with monsoon tips</span>
                <span className="apd-detail-i apd-r" data-k="d3"><FileText size={14} /> A blog article on getting drains ready</span>
              </div>
            </div>
          </section>

          {/* 3 · Workflows and the emails in them */}
          <section {...scene(2, 'apd-s3')}>
            <div className="apd-card apd-flow">
              <div className="apd-card-h"><span className="apd-ic is-ai"><GitBranch size={16} /></span><span><b>Workflow · New enquiry follow-up</b><small>Built by AI Autopilot</small></span></div>
              <div className="apd-nodes">
                {FLOW.map((n, i) => (
                  <div key={n.k} className="apd-node-wrap">
                    {i > 0 && <span className="apd-edge" data-k={`e${i - 1}`} />}
                    <div className={`apd-node apd-r is-${n.tone}${i === 4 ? ' apd-t' : ''}`} data-k={n.k}>
                      <span className="apd-node-ic"><n.icon size={15} /></span>
                      <span className="apd-node-t"><b>{n.h}</b><small>{n.s}</small></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="apd-card apd-mail apd-r" data-k="mail">
              <div className="apd-mail-h"><Mail size={15} /> <b>Send follow-up email</b><span className="apd-pill">Written by AI</span></div>
              <div className="apd-mail-row"><span>Subject</span><Typed k="subj" text="Still need a hand with that leak?" /></div>
              <p className="apd-mail-body">
                <Typed k="body" text="Hi there, just checking in after your enquiry about the leak. We can come out this week — reply to this email and we will find a time that suits you." />
              </p>
              <div className="apd-hold apd-r" data-k="hold"><ShieldCheck size={15} /> Waits for your OK before it sends</div>
            </div>
          </section>

          {/* 4 · Posts on the schedule */}
          <section {...scene(3, 'apd-s4')}>
            <div className="apd-card apd-week" data-k="week">
              <div className="apd-card-h">
                <span className="apd-ic is-ai"><Calendar size={16} /></span>
                <span><b>Scheduled posts · this week</b><small>Social posts and blog posts, written to July’s theme</small></span>
                <span className="apd-btn is-primary apd-t apd-sched" data-k="sched"><Check size={15} /> Approve &amp; schedule</span>
              </div>
              <div className="apd-days">
                {POSTS.map((p, i) => (
                  <div key={p.k} className={`apd-day${i > 2 ? ' apd-wide-only' : ''}`}>
                    <span className="apd-day-h">{p.day}</span>
                    <div className="apd-post apd-r" data-k={p.k} style={{ '--i': i } as CSSProperties}>
                      <span className="apd-post-k"><p.icon size={13} /> {p.kind}</span>
                      <b>{p.h}</b>
                      <span className="apd-post-s">
                        <span className="apd-st-a"><Clock size={12} /> 9:00 am · Draft</span>
                        <span className="apd-st-b"><Check size={12} strokeWidth={3} /> Scheduled</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 5 · Replies, held for your OK */}
          <section {...scene(4, 'apd-s5')}>
            <div className="apd-card apd-inbox">
              <div className="apd-card-h"><span className="apd-ic"><Inbox size={16} /></span><span><b>Inbox</b><small>Replies to what Autopilot sent</small></span></div>
              {INBOX.map((r, i) => (
                <div key={r.k} className={`apd-msg apd-r${i === 0 ? ' apd-t' : ''}${i === 2 ? ' apd-wide-only' : ''}`} data-k={r.k}>
                  <span className="apd-dot" />
                  <span className="apd-msg-t"><b>{r.subj}</b><span>{r.msg}</span></span>
                </div>
              ))}
            </div>
            <div className="apd-card apd-reply apd-r" data-k="reply">
              <div className="apd-mail-h"><Sparkles size={15} /> <b>Reply waiting for your OK</b></div>
              <blockquote>Yes please — is Thursday morning possible?</blockquote>
              <p className="apd-mail-body"><Typed k="draft" text="Thursday morning works. We can be with you between 9 and 11 — shall we book that in?" /></p>
              <div className="apd-reply-foot">
                <span className="apd-btn">Edit</span>
                <span className="apd-btn is-primary apd-t" data-k="send"><Send size={14} /> Send</span>
              </div>
              <div className="apd-sent apd-r" data-k="sent"><Check size={14} strokeWidth={3} /> Sent from your own mailbox</div>
            </div>
            <div className="apd-badges">
              <span className="apd-badge apd-r" data-k="b1"><Inbox size={15} /> Replies arrive in your inbox</span>
              <span className="apd-badge apd-r" data-k="b2"><ShieldCheck size={15} /> Nothing sends until you approve it</span>
            </div>
          </section>
        </>
      )}
    </DemoFilm>
  );
}
