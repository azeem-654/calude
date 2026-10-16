/**
 * Every business an Autopilot project has examined — new and old, from every
 * source, whatever became of it (`finders.php prospects`).
 *
 * ── Why every one, and not only the audience ──
 *
 * The tab used to list the people added to the audience and nothing else, so
 * its own tile could say "32 nothing to write to" over a list of five. A
 * customer reads that as the other 32 being lost. Each row here says what
 * happened to it — added, still being checked, no email found, already in
 * Contacts, opted out, turned away and why — and the chips filter by the same
 * groups the server counts by, so a chip, a tile and the list cannot disagree.
 *
 * Read from the server a page at a time (50, newest first, "Show more"):
 * a finder adds a hundred a day, and a year of it does not belong in one
 * answer. The CSV export walks the same pages for the filter on screen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, ExternalLink, Loader, Search, UserRound } from 'lucide-react';
import { T } from './theme';
import { useApp } from '../../context/AppContext';
import { projectLeads, type LeadGroup, type LeadRow, type LeadsPage } from '../../services/finders';
import { REJECT_LABEL, type RejectReason } from '../../services/prospectSources';
import { SOURCE_NAME, type ProspectSource } from '../../services/prospects';
import './projectLeads.css';

export const GROUP_LABEL: Record<LeadGroup, string> = {
  all: 'All',
  added: 'Added to audience',
  waiting: 'Still being checked',
  no_email: 'No email found',
  known: 'Already in your contacts',
  other: 'Turned away',
};

const CHECK_WORD: Record<string, string> = { valid: 'Contact verified', domain_ok: 'Contact checked', risky: 'Risky address', invalid: 'Bounces', unknown: 'Not checked' };

/** What became of one business, in words — and the colour it is drawn in. */
export function outcomeOf(r: LeadRow): { word: string; detail: string; tone: string; soft: string } {
  const why = REJECT_LABEL[r.reject_reason as RejectReason] ?? '';
  switch (r.status) {
    case 'added':
      return { word: r.source === 'manual' ? 'Added by hand' : 'Added to audience', detail: r.confidence ? `${r.confidence}% confidence` : '', tone: T.good, soft: T.goodSoft };
    case 'ready':
      return { word: 'Checked — joins on a later day', detail: 'Today\'s number was already in', tone: T.accent, soft: T.accentSoft };
    case 'candidate':
      return { word: 'Website not read yet', detail: 'Read on a coming step', tone: T.muted, soft: T.raised };
    case 'no_email':
      return {
        word: 'No email found', tone: T.warn, soft: T.warnSoft,
        /* An address the directory listed can still fail its check — say so, or the row reads as a contradiction. */
        detail: why || (r.email ? 'The address it lists did not pass the check' : r.website ? 'None published on its website' : 'No website to read'),
      };
    case 'known':
      return { word: 'Already in your contacts', detail: 'Not added twice', tone: T.muted, soft: T.raised };
    case 'removed':
      return { word: 'Deleted by you', detail: 'Removed from Contacts — never added again', tone: T.muted, soft: T.raised };
    case 'rejected':
      if (r.reject_reason === 'duplicate') return { word: 'Already in your contacts', detail: why, tone: T.muted, soft: T.raised };
      if (r.reject_reason === 'suppressed') return { word: 'Opted out', detail: why, tone: T.bad, soft: T.badSoft };
      if (r.grp === 'no_email') return { word: 'No email found', detail: why, tone: T.warn, soft: T.warnSoft };
      return { word: 'Turned away', detail: why || r.reject_reason, tone: T.bad, soft: T.badSoft };
    default:
      return { word: r.status, detail: '', tone: T.muted, soft: T.raised };
  }
}

const titleWords = (s: string) => s.replace(/(^|[\s,(-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
/** "med spas|miami, florida" — the search that found it — as "med spas · Miami, Florida". */
const whereOf = (query: string) => {
  const [trade, place] = query.split('|');
  return place ? `${trade} · ${titleWords(place)}` : trade;
};
const dateOf = (iso: string) => {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', ...(thisYear ? {} : { year: 'numeric' }), hour: 'numeric', minute: '2-digit' });
};
const hostOf = (url: string) => { try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; } };
const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? url : '');

function sourceOf(r: LeadRow, sources: LeadsPage['sources']): { name: string; via: string } {
  const via = SOURCE_NAME[r.source as ProspectSource] ?? '';
  if (!r.finder_id) return { name: 'Added by hand from AI Prospecting', via: '' };
  const s = sources[r.finder_id];
  return { name: s?.name ?? 'A search since disconnected', via };
}

/* CSV, with any cell that a spreadsheet would run as a formula made inert. */
const cell = (v: unknown) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const EXPORT_CAP = 5000;

const chip = (on: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 999, font: 'inherit', fontSize: 12.5, fontWeight: 650,
  border: `1px solid ${on ? T.accent : T.line}`, background: on ? T.accentSoft : T.panel, color: on ? T.accent : T.ink, cursor: 'pointer',
});
const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${T.line}`,
  background: T.panel, color: T.ink, font: 'inherit', fontSize: 12.5, fontWeight: 650, cursor: 'pointer',
};

export default function LeadsList({ projectId, projectName, group, onGroup, refreshKey, onCounts }: {
  projectId: string; projectName: string; group: LeadGroup; onGroup: (g: LeadGroup) => void;
  refreshKey: number; onCounts: (c: Record<LeadGroup, number>) => void;
}) {
  const navigate = useNavigate();
  const { contacts } = useApp();
  const [rows, setRows] = useState<LeadRow[] | null>(null);
  const [next, setNext] = useState('');
  const [matched, setMatched] = useState<Record<LeadGroup, number> | null>(null);
  const [sources, setSources] = useState<LeadsPage['sources']>({});
  const [q, setQ] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<'' | 'more' | 'csv'>('');
  const [error, setError] = useState('');
  const [said, setSaid] = useState('');
  const shown = useRef(0);
  shown.current = rows?.length ?? 0;

  /* The search box settles before it asks. */
  useEffect(() => { const t = window.setTimeout(() => setQ(typed.trim()), 300); return () => window.clearTimeout(t); }, [typed]);

  /** From the top again — as many as are on screen (up to a page of 200), so a refresh does not fold "Show more" back up. */
  const reload = useCallback(async (keep: boolean) => {
    const r = await projectLeads(projectId, { status: group, q, limit: keep ? Math.min(200, Math.max(50, shown.current)) : 50 });
    if (!r.success) { setError(r.error ?? 'Could not read this business workspace\'s leads.'); return; }
    setError('');
    setRows(r.rows); setNext(r.next); setMatched(r.matched); setSources(r.sources);
    onCounts(r.counts);
  }, [projectId, group, q, onCounts]);

  useEffect(() => { void reload(false); }, [reload]);
  useEffect(() => { if (refreshKey) void reload(true); }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void reload(true); }, 60_000);
    return () => window.clearInterval(t);
  }, [reload]);

  const more = async () => {
    setBusy('more');
    const r = await projectLeads(projectId, { status: group, q, before: next, limit: 50 });
    setBusy('');
    if (!r.success) { setError(r.error ?? 'Could not read more.'); return; }
    setRows(rs => [...(rs ?? []), ...r.rows]); setNext(r.next);
  };

  const exportCsv = async () => {
    setBusy('csv'); setSaid('');
    const all: LeadRow[] = [];
    let srcs = sources;
    let before = '';
    for (;;) {
      const r = await projectLeads(projectId, { status: group, q, before, limit: 200 });
      if (!r.success) { setBusy(''); setSaid(r.error ?? 'The export could not be read.'); return; }
      all.push(...r.rows); srcs = r.sources; before = r.next;
      if (!before || all.length >= EXPORT_CAP) break;
    }
    const head = ['Business', 'Kind of business', 'Person', 'Role', 'Email', 'Email check', 'Phone', 'Website', 'Address', 'Found by', 'Found through', 'Search', 'Status', 'Why', 'Found at', 'Added at'];
    const lines = all.slice(0, EXPORT_CAP).map(r => {
      const o = outcomeOf(r); const s = sourceOf(r, srcs);
      return [r.name, r.category, r.person_name, r.person_role, r.email, CHECK_WORD[r.email_status] ?? r.email_status, r.phone, r.website, r.address,
        s.name, s.via, whereOf(r.query), o.word, o.detail, r.found_at, r.added_at].map(cell).join(',');
    });
    const blob = new Blob([`\ufeff${[head.join(','), ...lines].join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${projectName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'project'}-leads${group === 'all' ? '' : `-${group}`}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setBusy('');
    setSaid(all.length > EXPORT_CAP ? `Exported the newest ${EXPORT_CAP.toLocaleString()}.` : `Exported ${all.length.toLocaleString()} ${all.length === 1 ? 'lead' : 'leads'}.`);
  };

  const have = new Set(contacts.map(c => c.id));
  const total = matched?.[group] ?? 0;
  const groups: LeadGroup[] = ['all', 'added', 'waiting', 'no_email', 'known', 'other'];

  return (
    <section style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, display: 'grid', gap: 12, minWidth: 0 }}
      aria-label="All leads" data-testid="all-leads" id="project-all-leads">
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 3, flex: '1 1 260px', minWidth: 0 }}>
          <b style={{ fontSize: 15, color: T.ink }}>All leads</b>
          <span style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>
            Every company this business workspace has looked at, newest first, and what became of it — the ones added to your audience and the ones it could not use.
          </span>
        </div>
        <button type="button" style={btn} disabled={busy === 'csv' || !total} onClick={() => void exportCsv()} data-testid="leads-export">
          {busy === 'csv' ? <Loader size={13} className="spin" /> : <Download size={13} />} Export CSV
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="pl-chips" role="group" aria-label="Show">
          {groups.filter(g => g === 'all' || g === 'added' || g === group || (matched?.[g] ?? 0) > 0).map(g => (
            <button key={g} type="button" style={chip(group === g)} aria-pressed={group === g} onClick={() => onGroup(g)} data-group={g}>
              {GROUP_LABEL[g]} <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.8 }} data-count={g}>{matched?.[g] ?? 0}</span>
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 200px', minWidth: 0, padding: '6px 10px', border: `1px solid ${T.line}`, borderRadius: 9, color: T.faint }}>
          <Search size={13} />
          <input value={typed} onChange={e => setTyped(e.target.value)} placeholder="Search by name, email, website…" aria-label="Search leads"
            style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', font: 'inherit', fontSize: 13, color: T.ink, background: 'transparent' }} />
        </label>
      </div>
      {said && <span role="status" style={{ fontSize: 12.5, color: T.ink }}>{said}</span>}
      {error && <span role="alert" style={{ fontSize: 12.5, color: T.bad }}>{error}</span>}

      {rows === null && !error && <span style={{ fontSize: 12.5, color: T.muted, display: 'inline-flex', gap: 6, alignItems: 'center' }}><Loader size={13} className="spin" /> Reading the leads…</span>}
      {rows && !rows.length && (
        <span style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>
          {q ? `Nothing here matches "${q}".`
            : group !== 'all' ? `None in "${GROUP_LABEL[group]}".`
              : 'No businesses examined yet — the first appear within a few minutes of a source starting.'}
        </span>
      )}

      {rows && rows.length > 0 && (
        <div className="pl-list">
          <div className="pl-row pl-head" aria-hidden>
            <span>Business</span><span>Email</span><span>Found</span><span>Status</span>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Leads">
            {rows.map(r => {
              const o = outcomeOf(r);
              const s = sourceOf(r, sources);
              const href = safeHref(r.website);
              const inContacts = !!r.contact_id && have.has(r.contact_id);
              return (
                <li key={r.id} className="pl-row" data-lead-status={r.status}>
                  <div className="pl-wide">
                    <b style={{ color: T.ink }}>{r.name}</b>
                    <span style={{ display: 'block', fontSize: 11.5, color: T.muted }}>
                      {r.category}{r.person_name ? ` · ${r.person_name}${r.person_role ? `, ${r.person_role}` : ''}` : ''}
                    </span>
                    {href && (
                      <a href={href} target="_blank" rel="noopener noreferrer nofollow"
                        style={{ color: T.accent, textDecoration: 'none', display: 'inline-flex', gap: 3, alignItems: 'center', maxWidth: '100%', fontSize: 12 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hostOf(href)}</span><ExternalLink size={10} style={{ flex: '0 0 auto' }} />
                      </a>
                    )}
                  </div>
                  <div>
                    <span className="pl-cell-label">Email</span>
                    <span style={{ color: r.email ? T.ink : T.faint, overflowWrap: 'anywhere' }}>{r.email || '—'}</span>
                    {r.email && r.email_status && (
                      <span style={{ display: 'block', fontSize: 11, color: r.email_status === 'valid' ? T.good : r.email_status === 'invalid' ? T.bad : T.muted }}>
                        {CHECK_WORD[r.email_status] ?? r.email_status}
                      </span>
                    )}
                    {r.phone && <span style={{ display: 'block', fontSize: 11, color: T.muted }}>{r.phone}</span>}
                  </div>
                  <div>
                    <span className="pl-cell-label">Found</span>
                    <span style={{ color: T.ink }}>{dateOf(r.found_at)}</span>
                    {r.query && <span style={{ display: 'block', fontSize: 11, color: T.muted }}>{whereOf(r.query)}</span>}
                    <span style={{ display: 'block', fontSize: 11, color: T.muted }}>{s.name}{s.via ? ` · ${s.via}` : ''}</span>
                  </div>
                  <div className="pl-wide">
                    <span className="pl-cell-label">Status</span>
                    <span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 999, color: o.tone, background: o.soft }} data-outcome>{o.word}</span>
                    {o.detail && <span style={{ display: 'block', fontSize: 11, color: T.muted, marginTop: 3 }}>{o.detail}</span>}
                    {r.status === 'added' && r.added_at && <span style={{ display: 'block', fontSize: 11, color: T.muted }}>Added {dateOf(r.added_at)}</span>}
                    {inContacts && (
                      <button type="button" onClick={() => navigate(`/contacts?contact=${encodeURIComponent(r.contact_id)}`)}
                        style={{ marginTop: 5, border: 0, background: 'none', padding: 0, color: T.accent, font: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        <UserRound size={12} /> Open contact
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: T.muted }} data-testid="leads-shown">Showing {rows.length} of {total}</span>
          {next && (
            <button type="button" style={btn} disabled={busy === 'more'} onClick={() => void more()}>
              {busy === 'more' ? <Loader size={13} className="spin" /> : null} Show more
            </button>
          )}
        </div>
      )}
      <span style={{ fontSize: 11.5, color: T.faint, lineHeight: 1.5 }}>
        A business that was not added keeps only its name, website and where it was found after 30 days — enough that no search examines it again.
      </span>
    </section>
  );
}
