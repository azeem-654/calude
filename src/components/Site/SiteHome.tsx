/**
 * The public site.
 *
 * Until now protectedcentral.com opened on a login box, which tells a visitor
 * who has never heard of the product exactly nothing. This is the page that
 * answers "what is it" before asking anyone to sign in.
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
  Info, Layers, MousePointerClick, Send, Sparkles, Users,
} from 'lucide-react';
import { activeBranding } from '../../services/tenancy';
import { clamp01, mix, smoothstep, useScrollScene } from './useScrollScene';
import './site.css';

/** How many viewport heights of scroll one scene occupies. Higher is slower. */
const SCENE_VH = 118;

const SHOT = (name: string) => `${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/site/${name}.webp`;

/* ── The content ──────────────────────────────────────────────────────── */

interface Scene {
  id: string;
  chapter: string;
  eyebrow: string;
  lead: string;
  emph: string;
  body?: string;
  /** A real screen from the app. */
  shot?: { src: string; alt: string };
  points?: string[];
  tone?: 'dark';
  /** Rendered instead of the body/points column. */
  extra?: React.ReactNode;
}

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
    id: 'agent', chapter: 'Products', eyebrow: 'AI Sales Agent',
    lead: 'Describe the outcome.', emph: 'It builds the campaign.',
    body: 'Write what you want in a sentence. The agent works out who to reach and how, shows you the '
      + 'plan before anything exists, then creates the real contacts, the real sequence and the real enrolments.',
    shot: { src: SHOT('agent'), alt: 'A live campaign, with the figures read from each module' },
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
    shot: { src: SHOT('marketing'), alt: 'The sequence list in Marketing' },
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
    shot: { src: SHOT('contacts'), alt: 'The contact list with filters and segments' },
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
    shot: { src: SHOT('pipelines'), alt: 'The deal board with stages and weighted value' },
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
    shot: { src: SHOT('calendar'), alt: 'The calendar with the week’s appointments' },
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
      <ol className="mesh" style={{
        margin: 0, padding: 0, listStyle: 'none',
        /* Four across, so seven steps land 4 + 3 rather than 6 + 1. */
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
      }}>
        {LIFECYCLE.map(s => (
          <li key={s.n}>
            <span className="mono" style={{ color: 'var(--lime-deep)' }}>{s.n}</span>
            <h3 style={{ margin: '8px 0 5px', fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{s.title}</h3>
            <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.6, color: 'var(--text-mute)' }}>{s.body}</p>
          </li>
        ))}
      </ol>
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
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.group}</span>
              </span>
              <ul style={{ margin: '9px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {c.items.map(i => <li key={i} style={{ fontSize: 11.5, color: 'var(--text-mute)', lineHeight: 1.5 }}>{i}</li>)}
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
            <h3 style={{ margin: '0 0 7px', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{l.title}</h3>
            <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.7, color: 'var(--text-mute)' }}>{l.body}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'start', chapter: 'Start', eyebrow: 'Free to try',
    lead: 'Point it at your list and', emph: 'watch it show its working.',
    body: 'Connect your own mailbox, write one sentence about what you want, and approve the plan '
      + 'before anything is created.',
    tone: 'dark',
  },
];

/* ── Pieces ───────────────────────────────────────────────────────────── */

function Heading({ lead, emph, as = 'h2' }: { lead: string; emph: string; as?: 'h1' | 'h2' }) {
  const Tag = as;
  return (
    <Tag style={{
      margin: 0, maxWidth: 620, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.13,
      fontSize: as === 'h1' ? 'clamp(31px, 4.6vw, 60px)' : 'clamp(23px, 3.1vw, 40px)',
    }}>
      <span className="lead">{lead} </span>
      <span className="emph">{emph}</span>
    </Tag>
  );
}

/* ── The page ─────────────────────────────────────────────────────────── */

export default function SiteHome() {
  const navigate = useNavigate();
  const name = activeBranding().appName;
  const onSignIn = useCallback(() => navigate('/login'), [navigate]);

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

        /* Each line lags a little behind the one above it, so the scene reads
           as being written rather than pasted. Cached on first sight: querying
           the DOM sixty times a second for nine scenes is wasteful. */
        const kids = pieces.current[i] ?? (pieces.current[i] = [...c.querySelectorAll<HTMLElement>('[data-rise]')]);
        for (let k = 0; k < kids.length; k++) {
          const lag = k * 0.07;
          const a = smoothstep(-0.42 + lag, 0.06 + lag, t);
          kids[k].style.opacity = String(a);
          kids[k].style.transform = `translate3d(0, ${mix(22, 0, a)}px, 0)`;
        }
      }

      const s = shots.current[i];
      if (s) {
        /* The screen lands: it arrives tilted away and squares up as it comes
           into place, then eases past. */
        const settle = smoothstep(-0.55, 0.12, t);
        const past = smoothstep(0.3, 1.0, t);
        s.style.transform = [
          `perspective(1500px)`,
          `translate3d(${mix(38, -34, clamp01((t + 0.55) / 1.5))}px, ${mix(52, -60, clamp01((t + 0.55) / 1.5))}px, 0)`,
          `rotateY(${mix(-13, 0, settle) + past * 9}deg)`,
          `rotateX(${mix(9, 0, settle) + past * 4}deg)`,
          `scale(${mix(0.9, 1, settle) - past * 0.06})`,
        ].join(' ');
        s.style.opacity = String(smoothstep(-0.55, -0.05, t) * (1 - smoothstep(0.42, 0.95, t)));
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
      {/* The document's height is what there is to scroll. The tail lets the
          last scene finish rather than stopping half-played. */}
      <div className="scene-spacer"
        style={{ height: `calc(${SCENES.length * SCENE_VH}vh + 100vh)` }} />

      <div className="scene-stage" aria-hidden="false">
        {SCENES.map((s, i) => (
          <section
            key={s.id}
            ref={el => { stage.current[i] = el; }}
            className={s.tone === 'dark' ? 'scene dark' : 'scene'}
            aria-label={s.eyebrow}
          >
            {s.tone === 'dark' && <span className="beam" />}
            <div className="scene-inner" data-wide={!s.shot}>
              <div className="scene-copy" ref={el => { copy.current[i] = el; }}>
                <span className="chip" data-rise>{s.eyebrow}</span>
                <div data-rise style={{ marginTop: 16 }}>
                  <Heading as={i === 0 ? 'h1' : 'h2'} lead={s.lead} emph={s.emph} />
                </div>
                {s.body && (
                  <p data-rise style={{
                    margin: '16px 0 0', maxWidth: 460,
                    fontSize: 'clamp(12.5px, 1.1vw, 14.5px)', lineHeight: 1.72,
                    color: s.tone === 'dark' ? 'var(--on-dark-mute)' : 'var(--text-mute)',
                  }}>
                    {s.body}
                  </p>
                )}
                {s.points && (
                  <ul style={{ margin: '16px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {s.points.map(p => (
                      <li key={p} data-rise style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-mute)' }}>
                        <span className="glyph soft" style={{ width: 18, height: 18, borderRadius: 6, marginTop: 1 }}>
                          <Check size={10} strokeWidth={3} />
                        </span>
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
                {(i === 0 || s.id === 'start') && (
                  <div data-rise style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 24 }}>
                    <button className="btn btn-primary" onClick={onSignIn}>
                      Get started <ArrowRight size={13} />
                    </button>
                    <button className="btn btn-quiet" onClick={onSignIn}>
                      Sign in <ArrowUpRight size={12} />
                    </button>
                  </div>
                )}
                {s.extra && <div data-rise style={{ marginTop: 20 }}>{s.extra}</div>}
              </div>

              {s.shot && (
                <figure className="shot" ref={el => { shots.current[i] = el; }}>
                  <img src={s.shot.src} alt={s.shot.alt} loading={i < 2 ? 'eager' : 'lazy'} width={1400} height={903} />
                </figure>
              )}
            </div>
          </section>
        ))}
      </div>

      <header className="scene-chrome scene-top">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
          <span className="glyph" style={{ width: 24, height: 24, borderRadius: 7 }}>
            <Layers size={13} strokeWidth={2.4} />
          </span>
          <span className="mono" style={{ color: 'var(--text)', fontSize: 11.5, letterSpacing: '0.2em', fontWeight: 600 }}>
            {name}
          </span>
        </span>
        <span className="strapline mono">Sales · Marketing · Sites · Content</span>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onSignIn}>Sign in <ArrowRight size={13} /></button>
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

        <span className="mono scroll-hint">
          Scroll <ChevronDown size={12} style={{ verticalAlign: -2 }} />
        </span>
      </footer>
    </div>
  );
}
