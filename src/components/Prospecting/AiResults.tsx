/**
 * The second screen of AI Prospecting — what a search is doing and what it
 * found: the assistant at the top, the progress card, the five figures, and
 * the rail on the right (where they are, what was scanned, what it means, and
 * what kinds of business came back).
 *
 * ── Every number is counted, never invented ──
 *
 * The design these follow carried "97% valid numbers", "best time to reach"
 * and sources nobody connected. None of that is here: phone numbers are not
 * validated, so they are counted, not scored; there is no data on when anybody
 * answers, so no time is suggested; and "Sources scanned" lists exactly the
 * sources this search asked, with what each returned. The map is the result's
 * own coordinates drawn on a grid — no map tiles, because the tile servers'
 * terms do not allow a product to lean on them, and a picture of a street map
 * is not needed to see where thirty dentists cluster.
 */
import { useEffect, useState } from 'react';
import {
  AlertTriangle, BadgeCheck, Building2, CheckCircle2, Clock, Globe, Lightbulb, Loader, Mail, MapPin, Phone,
  ShieldCheck, Sparkles, Target, TrendingUp, Users,
} from 'lucide-react';
import type { ProspectSearch, Step } from './useProspectSearch';
import type { LeadRow } from './AiParts';

/* ── Time ── */

export const clock = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};
export const stamp = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit' });
};

/** Seconds since `iso`, ticking while `running`. */
function useElapsed(iso: string, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running]);
  useEffect(() => { setNow(Date.now()); }, [running, iso]);
  return iso ? Math.max(0, Math.round((now - Date.parse(iso)) / 1000)) : 0;
}

/* ── The assistant ── */

/** A small robot, drawn — it blinks while it works, and is still otherwise. */
export function Robot({ working }: { working: boolean }) {
  return (
    <svg className="aip-robot" data-working={working || undefined} viewBox="0 0 120 110" aria-hidden="true">
      <defs>
        <linearGradient id="aip-rb-h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#dfe3f5" /></linearGradient>
        <linearGradient id="aip-rb-v" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1e1b4b" /><stop offset="1" stopColor="#312e81" /></linearGradient>
      </defs>
      <line x1="60" y1="8" x2="60" y2="22" stroke="#a5b4fc" strokeWidth="3" strokeLinecap="round" />
      <circle className="aip-rb-tip" cx="60" cy="8" r="5" fill="#8b5cf6" />
      <rect x="18" y="22" width="84" height="62" rx="26" fill="url(#aip-rb-h)" stroke="#c7cdea" strokeWidth="1.5" />
      <rect x="10" y="44" width="10" height="20" rx="5" fill="#c7d2fe" />
      <rect x="100" y="44" width="10" height="20" rx="5" fill="#c7d2fe" />
      <rect x="28" y="34" width="64" height="38" rx="18" fill="url(#aip-rb-v)" />
      <g className="aip-rb-eyes">
        <ellipse cx="47" cy="53" rx="6" ry="7" fill="#67e8f9" />
        <ellipse cx="73" cy="53" rx="6" ry="7" fill="#67e8f9" />
      </g>
      <path d="M50 64 Q60 70 70 64" stroke="#67e8f9" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <rect x="40" y="86" width="40" height="18" rx="9" fill="url(#aip-rb-h)" stroke="#c7cdea" strokeWidth="1.5" />
      <circle cx="60" cy="95" r="3.5" fill="#22c55e" />
    </svg>
  );
}

/* ── Progress ── */

const STAGES: { id: Step['id']; label: string; also?: Step['id'] }[] = [
  { id: 'search', label: 'Searching businesses' },
  { id: 'read', label: 'Searching websites', also: 'web' },
  { id: 'verify', label: 'Verifying contacts' },
  { id: 'deep', label: 'Verifying mailboxes' },
];

/**
 * How far along, as a share of the stages — the running one counted by its
 * own progress when it has one, half otherwise. It reaches 100 only when
 * nothing is running, so the ring never claims to be done early.
 */
export function percentDone(s: ProspectSearch): number {
  if (s.busy) return 8;
  const states = STAGES.map(st => s.steps.find(x => x.id === st.id)?.state);
  const running = s.steps.some(x => x.state === 'running') || s.verifying || s.enriching || s.finding;
  if (!running) return s.steps.length ? 100 : 0;
  const done = states.filter(x => x === 'done' || x === 'skipped' || x === 'failed').length;
  const part = s.progress && s.progress.total ? s.progress.done / s.progress.total : 0.5;
  return Math.min(97, Math.round(((done + part) / STAGES.length) * 100));
}

export function ProgressCard({ s, sources }: { s: ProspectSearch; sources: string[] }) {
  const running = s.busy || s.steps.some(x => x.state === 'running') || s.verifying || s.enriching || s.finding;
  const pct = percentDone(s);
  const secs = useElapsed(s.startedAt, running);
  const R = 34, C = 2 * Math.PI * R;
  const what = `${s.searched?.trade ?? s.trade} in ${s.searched?.place ?? s.place}`;
  return (
    <section className="aip-card aip-progress-card" aria-label="Progress">
      <div className="aip-ring" role="img" aria-label={`${pct}% done`}>
        <svg viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={R} className="aip-ring-track" />
          <circle cx="40" cy="40" r={R} className="aip-ring-bar" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} />
        </svg>
        <b>{pct}%</b>
      </div>
      <div className="aip-progress-what">
        <b>{running ? `Searching for ${what}…` : s.error ? `The search for ${what} stopped` : `Searched live for ${what}`}</b>
        <span>
          <Clock size={11} /> {running
            ? `Started ${clock(s.startedAt)} · ${secs}s so far`
            : s.restoredAt ? `Saved search · found ${stamp(s.fetchedAt || s.restoredAt)}`
              : s.fetchedAt ? `Fetched live at ${stamp(s.fetchedAt)}` : ''}
        </span>
      </div>
      <ol className="aip-timeline">
        {STAGES.map(st => {
          const step = s.steps.find(x => x.id === st.id) ?? (st.also ? s.steps.find(x => x.id === st.also) : undefined);
          const state = step?.state ?? (st.id === 'search' && s.busy ? 'running' : 'waiting');
          const detail = state === 'waiting'
            ? (st.id === 'deep' && !s.google?.verifier.available ? 'Needs a verifier' : 'Waiting…')
            : step?.state === 'running' ? (s.progress ? `${s.progress.done} of ${s.progress.total}` : 'In progress')
              : typeof step?.count === 'number' ? `${step.count} ${st.id === 'search' ? 'found' : st.id === 'read' ? 'addresses' : st.id === 'verify' ? 'take mail' : 'confirmed'}`
                : step?.state === 'skipped' ? 'Not needed' : step?.state === 'failed' ? 'Stopped' : 'Done';
          return (
            <li key={st.id} data-state={state}>
              <span className="aip-tl-dot">{state === 'done' ? <CheckCircle2 size={14} /> : state === 'running' ? <Loader size={13} className="spin" /> : state === 'failed' ? <AlertTriangle size={12} /> : null}</span>
              <b>{st.label}</b>
              <small>{detail}</small>
            </li>
          );
        })}
      </ol>
      <div className="aip-source-chips">
        {sources.map(x => <span key={x} className="aip-chip-static">{x}</span>)}
      </div>
    </section>
  );
}

/* ── The five figures ── */

export function KpiRow({ s, rows }: { s: ProspectSearch; rows: LeadRow[] }) {
  const all = s.results ?? [];
  const emails = rows.filter(r => r.email).length;
  const checked = rows.filter(r => r.v).length;
  const takes = rows.filter(r => r.v?.status === 'valid' || r.v?.status === 'domain_ok').length;
  const verified = rows.filter(r => r.v?.status === 'valid').length;
  const phones = all.filter(p => p.phone).length;
  const sites = all.filter(p => p.website).length;
  const high = rows.filter(r => r.score >= 75).length;
  const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—');
  const delta = s.prevCount !== null && s.prevCount !== undefined ? all.length - s.prevCount : null;
  const cards = [
    { Icon: Building2, tone: 'violet', n: all.length, label: 'Businesses found',
      sub: delta === null ? `Fetched live ${clock(s.fetchedAt)}` : delta === 0 ? 'Same as last time' : `${delta > 0 ? '+' : ''}${delta} vs last time`, up: (delta ?? 0) > 0 },
    { Icon: Mail, tone: 'green', n: emails, label: 'Email addresses',
      sub: verified ? `${verified} verified mailbox${verified === 1 ? '' : 'es'}` : checked ? `${pct(takes, checked)} take mail` : 'Not checked yet' },
    { Icon: Phone, tone: 'blue', n: phones, label: 'Phone numbers', sub: `${pct(phones, all.length)} of results` },
    { Icon: Globe, tone: 'sky', n: sites, label: 'Websites', sub: `${pct(sites, all.length)} of results` },
    { Icon: Target, tone: 'amber', n: high, label: 'High-confidence leads', sub: 'Score 75 or more' },
  ];
  return (
    <div className="aip-kpis" aria-label="What this search found">
      {cards.map(c => (
        <div key={c.label} className="aip-kpi" data-tone={c.tone}>
          <span className="aip-kpi-icon"><c.Icon size={17} /></span>
          <span className="aip-kpi-body">
            <b>{c.n}</b>
            <span>{c.label}</span>
            <small data-up={c.up || undefined}>{c.up && <TrendingUp size={10} />} {c.sub}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── The rail ── */

const PALETTE = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#94a3b8'];

function PinMap({ rows, place }: { rows: LeadRow[]; place: string }) {
  const pts = rows.filter(r => r.p.lat && r.p.lon && Math.abs(r.p.lat) <= 90);
  if (!pts.length) {
    return <div className="aip-map aip-map-empty"><MapPin size={16} /> No coordinates for these — the register lists addresses, not points.</div>;
  }
  const lats = pts.map(r => r.p.lat), lons = pts.map(r => r.p.lon);
  const [la0, la1, lo0, lo1] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const k = Math.cos(((la0 + la1) / 2) * Math.PI / 180) || 1;
  const w = Math.max((lo1 - lo0) * k, 0.004), h = Math.max(la1 - la0, 0.004);
  const span = Math.max(w / 1.6, h);
  const cx = ((lo0 + lo1) / 2) * k, cy = (la0 + la1) / 2;
  const x = (lon: number) => 160 + ((lon * k - cx) / span) * 82;
  const y = (lat: number) => 100 - ((lat - cy) / span) * 82;
  return (
    <div className="aip-map">
      <svg viewBox="0 0 320 200" role="img" aria-label={`${pts.length} businesses plotted around ${place}`}>
        <defs>
          <pattern id="aip-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" className="aip-map-grid" /></pattern>
          <radialGradient id="aip-glow"><stop offset="0" stopColor="#8b5cf6" stopOpacity="0.28" /><stop offset="1" stopColor="#8b5cf6" stopOpacity="0" /></radialGradient>
        </defs>
        <rect width="320" height="200" fill="url(#aip-grid)" />
        <circle cx="160" cy="100" r="90" fill="url(#aip-glow)" />
        {pts.map((r, i) => (
          <g key={r.p.ref} className="aip-pin" style={{ ['--i' as string]: Math.min(i, 30) }} transform={`translate(${x(r.p.lon).toFixed(1)} ${y(r.p.lat).toFixed(1)})`}>
            <title>{r.p.name}</title>
            <path d="M0 0 C-6 -8 -7 -11 -7 -14 A7 7 0 1 1 7 -14 C7 -11 6 -8 0 0Z" fill={r.score >= 75 ? '#7c3aed' : r.score >= 45 ? '#a78bfa' : '#c4b5fd'} />
            <circle cx="0" cy="-14" r="2.6" fill="#fff" />
          </g>
        ))}
      </svg>
      <span className="aip-map-place"><MapPin size={11} /> {place}</span>
    </div>
  );
}

function Donut({ rows }: { rows: LeadRow[] }) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const c = (r.p.category || 'Other').replace(/^./, m => m.toUpperCase());
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5).reduce((n, [, v]) => n + v, 0);
  if (rest) top.push(['Other', rest]);
  const total = rows.length || 1;
  const R = 40, C = 2 * Math.PI * R;
  let at = 0;
  return (
    <div className="aip-donut">
      <svg viewBox="0 0 110 110" role="img" aria-label="Business types">
        <circle cx="55" cy="55" r={R} className="aip-ring-track" strokeWidth="14" />
        {top.map(([name, n], i) => {
          const len = (n / total) * C;
          const el = <circle key={name} cx="55" cy="55" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="14"
            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-at} transform="rotate(-90 55 55)" />;
          at += len;
          return el;
        })}
        <text x="55" y="53" textAnchor="middle" className="aip-donut-n">{rows.length}</text>
        <text x="55" y="66" textAnchor="middle" className="aip-donut-l">businesses</text>
      </svg>
      <ul>
        {top.map(([name, n], i) => (
          <li key={name}><i style={{ background: PALETTE[i % PALETTE.length] }} />{name}<b>{Math.round((n / total) * 100)}%</b></li>
        ))}
      </ul>
    </div>
  );
}

export interface Insight { Icon: typeof Mail; title: string; sub: string; act?: () => void }

export function InsightsRail({ s, rows, insights, scanned }: {
  s: ProspectSearch; rows: LeadRow[]; insights: Insight[];
  scanned: { name: string; detail: string; state: 'done' | 'running' | 'waiting' | 'off' }[];
}) {
  const place = s.searched?.place ?? s.place;
  return (
    <aside className="aip-rail" aria-label="About these results">
      <section className="aip-card aip-rail-card">
        <div className="aip-rail-head"><Users size={14} /> <b>Businesses found</b><span className="aip-rail-n">{(s.results ?? []).length}</span></div>
        <PinMap rows={rows} place={place} />
      </section>
      <section className="aip-card aip-rail-card">
        <div className="aip-rail-head"><ShieldCheck size={14} /> <b>What was searched</b></div>
        <ul className="aip-scanned">
          {scanned.map(x => (
            <li key={x.name} data-state={x.state}>
              <span>{x.name}</span>
              <small>{x.detail}</small>
              {x.state === 'done' ? <CheckCircle2 size={14} /> : x.state === 'running' ? <Loader size={13} className="spin" /> : <span className="aip-dot-wait" />}
            </li>
          ))}
        </ul>
      </section>
      {insights.length > 0 && (
        <section className="aip-card aip-rail-card">
          <div className="aip-rail-head"><Lightbulb size={14} /> <b>AI insights</b></div>
          <ul className="aip-insights">
            {insights.map(i => (
              <li key={i.title}>
                <button type="button" onClick={i.act} disabled={!i.act}>
                  <span className="aip-ins-icon"><i.Icon size={13} /></span>
                  <span><b>{i.title}</b><small>{i.sub}</small></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {rows.length > 0 && (
        <section className="aip-card aip-rail-card">
          <div className="aip-rail-head"><Sparkles size={14} /> <b>Business type breakdown</b></div>
          <Donut rows={rows} />
        </section>
      )}
    </aside>
  );
}

export const INSIGHT_ICONS = { BadgeCheck, Target, Globe, Users, AlertTriangle, ShieldCheck, Mail };
