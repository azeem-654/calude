/**
 * Customers → Lead Directory: searching the people the install owner has
 * loaded (routes/leaddir.ts). Searching is free and shows who and where, with
 * the email and phone masked; showing someone in full, or adding them to
 * Contacts, spends the workspace's allowance once per person.
 *
 * Imports land the way AI Prospecting's do (planImport — never a second copy
 * of somebody already in Contacts, only blanks filled) on a list marked
 * `cold`, because these are strangers: the sending plan and the campaign
 * wizard read that.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BookUser, CheckCircle, ExternalLink, Eye, Loader, Search, UserPlus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Contact } from '../../types';
import { dirCall, type DirPerson, type DirStatus } from '../../services/leadDirectory';
import { emailTag, planImport } from '../../services/prospectImport';
import { verifyEmails, type Verdict } from '../../services/prospects';
import { addToStaticList, createList, loadLists } from '../../services/contactLists';
import { currentActor } from '../../services/contactPermissions';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const fmtN = (n: number) => n.toLocaleString('en-US');

interface Query { industry: string; place: string; title: string; level: string; companySize: string; hasEmail: boolean }

export default function LeadDirectory() {
  const navigate = useNavigate();
  const { contacts, bulkImportContacts, updateContacts } = useApp();
  const [st, setSt] = useState<DirStatus | null>(null);
  const [stErr, setStErr] = useState<{ error: string; code: string } | null>(null);
  const [params] = useSearchParams();
  /* AI Prospecting's "See them all" opens the same search here (?industry=&place=). */
  const [q, setQ] = useState<Query>(() => ({ industry: params.get('industry') ?? '', place: params.get('place') ?? '', title: '', level: '', companySize: '', hasEmail: false }));
  const handed = useRef(!!(params.get('industry') || params.get('place')));
  const [asked, setAsked] = useState<Query | null>(null);
  const [people, setPeople] = useState<DirPerson[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [capped, setCapped] = useState(false);
  const [more, setMore] = useState(false);
  const [after, setAfter] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [listName, setListName] = useState('');
  const [listId, setListId] = useState('');
  const [working, setWorking] = useState('');
  const [outcome, setOutcome] = useState('');

  const loadStatus = useCallback(async () => {
    const d = await dirCall('status');
    if (d.success) { setSt(d as unknown as DirStatus); setStErr(null); } else setStErr({ error: String(d.error ?? 'The lead directory could not be read.'), code: String(d.code ?? '') });
  }, []);
  useEffect(() => { void loadStatus(); }, [loadStatus]);
  useEffect(() => {
    if (!st || !handed.current) return;
    handed.current = false;
    void search();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st]);

  const search = async (next = false) => {
    const ask = next && asked ? asked : q;
    setBusy(true); setError(''); setNote(''); setOutcome('');
    const d = await dirCall('search', { ...ask, after: next ? after : 0 });
    setBusy(false);
    if (!d.success) { setError(String(d.error ?? 'The search failed.')); return; }
    const rows = (d.people as DirPerson[]) ?? [];
    setAsked(ask);
    setPeople(p => (next ? [...p, ...rows] : rows));
    if (!next) { setTotal(d.total == null ? null : Number(d.total)); setCapped(d.capped === true); setPicked(new Set()); }
    setMore(d.more === true); setAfter(Number(d.after) || 0);
    if (d.note) setNote(String(d.note));
    if (!next) setListName([ask.title, ask.industry, ask.place].filter(Boolean).join(' · ').slice(0, 60) || 'Lead Directory');
  };

  const chosen = useMemo(() => people.filter(p => picked.has(p.id)), [people, picked]);
  const unseen = chosen.filter(p => !p.revealed).length;

  /** Shows the ticked people in full; spends the allowance on the ones not seen before. */
  const reveal = async (): Promise<DirPerson[] | null> => {
    if (!chosen.length) return null;
    const d = await dirCall('reveal', { ids: chosen.map(p => p.id) });
    if (!d.success) { setError(String(d.error ?? 'Could not show them.')); return null; }
    const shown = new Map(((d.people as DirPerson[]) ?? []).map(p => [p.id, p]));
    setPeople(ps => ps.map(p => shown.get(p.id) ?? p));
    if (d.left && st) setSt({ ...st, left: d.left as DirStatus['left'] });
    return [...shown.values()];
  };

  const add = async () => {
    setWorking('add'); setError(''); setOutcome('');
    const full = await reveal();
    if (!full) { setWorking(''); return; }
    /*
     * Every address is checked before it reaches Contacts — the same free
     * check AI Prospecting runs (format, domain, mail server; cached a week
     * across workspaces). A list file's own "verified" is the seller's word,
     * kept beside it but never put in its place: lists go stale, and an
     * address that bounces costs the sender's reputation, not the seller's.
     */
    setWorking('check');
    const emails = [...new Set(full.map(p => p.email).filter(Boolean))];
    const checks: Record<string, Verdict> = {};
    let checkErr = '';
    for (let i = 0; i < emails.length; i += 20) {
      const r = await verifyEmails(emails.slice(i, i + 20), false);
      Object.assign(checks, r.verdicts);
      if (r.error) { checkErr = r.error; break; }
    }
    setWorking('');
    const at = new Date().toISOString();
    const rows: Omit<Contact, 'id'>[] = full.map(p => {
      const [firstName, ...rest] = p.name.split(' ');
      const v = p.email ? checks[p.email] : undefined;
      const tag = emailTag(v);
      let extra: Record<string, string> = {};
      try { extra = p.extra ? JSON.parse(p.extra) as Record<string, string> : {}; } catch { /* not ours to fix here */ }
      const known = {
        foundAt: at, directoryId: String(p.id), industry: p.industry, seniority: p.level, department: p.department,
        companySize: p.size, revenue: p.revenue, founded: p.founded, keywords: p.keywords, postalCode: p.postal ?? '',
        companyLinkedin: p.company_linkedin ?? '', social: p.social ?? '', sicNaics: p.codes ?? '', technologies: p.technologies ?? '',
        listEmailStatus: p.email_status ?? '',
        ...(v ? { emailStatus: v.status, emailCheck: v.level, emailCheckedAt: v.checkedAt } : {}),
      };
      /* The file's other columns travel too, under their own names, without overwriting ours. */
      const fromFile = Object.fromEntries(Object.entries(extra).filter(([k, val]) => val && val !== 'hidden' && !(k in known)).slice(0, 25));
      return {
        name: p.name, email: p.email, phone: p.phone, status: 'prospect', source: 'Lead directory',
        tags: ['lead directory', 'cold', ...(tag ? [tag] : [])], createdAt: at, lastActivity: at, value: 0,
        firstName, lastName: rest.join(' ') || undefined, company: p.company || undefined, jobTitle: p.title || undefined,
        website: p.website || undefined, linkedin: p.linkedin || undefined,
        address: [p.address, p.city, p.state, p.postal, p.country].filter(Boolean).join(', ') || undefined,
        customFields: Object.fromEntries(Object.entries({ ...fromFile, ...known }).filter(([, val]) => val)) as Record<string, string>,
      };
    });
    if (checkErr) setError(`Added, but the email check stopped: ${checkErr} The rest are added without a check.`);
    const counts = { verified: 0, ok: 0, risky: 0, bounce: 0 };
    for (const e of emails) {
      const st = checks[e]?.status;
      if (st === 'valid') counts.verified++; else if (st === 'domain_ok') counts.ok++; else if (st === 'risky') counts.risky++; else if (st === 'invalid') counts.bounce++;
    }
    const plan = planImport(rows, contacts);
    const made = plan.fresh.length ? bulkImportContacts(plan.fresh) : [];
    const fills = plan.known.filter(k => Object.keys(k.fill).length).map(k => ({ id: k.contact.id, updates: k.fill }));
    if (fills.length) updateContacts(fills);
    const ids = [...made.map(c => c.id), ...plan.known.map(k => k.contact.id)];
    let where = 'Contacts';
    if (listId) {
      const list = loadLists().find(l => l.id === listId);
      if (list && list.type === 'static') { addToStaticList(list.id, ids); where = `“${list.name}”`; }
    } else if (listName.trim()) {
      const l = createList({ name: listName.trim(), type: 'static', memberIds: ids, createdBy: currentActor().name, kind: 'cold', origin: 'prospecting' });
      where = `“${l.name}”`;
    }
    setPicked(new Set());
    const checked = counts.verified + counts.ok + counts.risky + counts.bounce;
    setOutcome(`${ids.length} on ${where} — ${made.length} new, ${plan.known.length} already in Contacts.`
      + (checked ? ` Emails checked: ${[counts.verified && `${counts.verified} verified`, counts.ok && `${counts.ok} domain takes mail`, counts.risky && `${counts.risky} risky`, counts.bounce && `${counts.bounce} would bounce (tagged “email bounces”)`].filter(Boolean).join(', ')}.` : ''));
  };

  const lists = useMemo(() => loadLists().filter(l => l.type === 'static'), [outcome]); // eslint-disable-line react-hooks/exhaustive-deps

  if (stErr) {
    return (
      <div style={page}>
        <Head />
        <div role="status" style={{ ...card, color: '#334155', fontSize: 14, lineHeight: 1.6 }}>
          {stErr.code === 'not_shared' || stErr.code === 'no_database'
            ? 'The lead directory is not open yet. In the meantime AI Prospecting finds businesses and their published emails, live.'
            : stErr.error}
          <div style={{ marginTop: 10 }}><button style={btn} onClick={() => navigate('/prospecting')}><Search size={13} /> Open AI Prospecting</button></div>
        </div>
      </div>
    );
  }

  return (
    <div style={page} data-testid="lead-directory">
      <Head label={st?.label} total={st?.total} />
      {st?.left && (
        <div style={{ fontSize: 12.5, color: MUTED }}>
          Searching is free. Showing someone's email, phone and profile uses your allowance — {fmtN(st.left.day)} left today, {fmtN(st.left.month)} this month. Seeing the same person again is free.
          {st.trialEnded && <strong style={{ color: '#b42318' }}> Your trial has ended, so details cannot be shown until you choose a plan.</strong>}
        </div>
      )}

      <form onSubmit={e => { e.preventDefault(); void search(); }} style={{ ...card, display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <Field label="Industry">
            <input data-field="leaddir.industry" list="ld-industries" value={q.industry} onChange={e => setQ({ ...q, industry: e.target.value })} placeholder="e.g. Real estate" style={input} />
          </Field>
          <Field label="Where">
            <input data-field="leaddir.place" list="ld-places" value={q.place} onChange={e => setQ({ ...q, place: e.target.value })} placeholder="e.g. Florida, or Tampa, FL" style={input} />
          </Field>
          <Field label="Job title">
            <input data-field="leaddir.title" value={q.title} onChange={e => setQ({ ...q, title: e.target.value })} placeholder="e.g. CEO or owner" style={input} />
          </Field>
          <Field label="Seniority">
            <select value={q.level} onChange={e => setQ({ ...q, level: e.target.value })} style={input}>
              <option value="">Any</option>
              {st?.levels.map(f => <option key={f.value} value={f.label}>{f.label} ({fmtN(f.n)})</option>)}
            </select>
          </Field>
          <Field label="Company size">
            <select value={q.companySize} onChange={e => setQ({ ...q, companySize: e.target.value })} style={input}>
              <option value="">Any</option>
              {st?.sizes.map(f => <option key={f.value} value={f.label}>{f.label} ({fmtN(f.n)})</option>)}
            </select>
          </Field>
        </div>
        <datalist id="ld-industries">{st?.industries.map(f => <option key={f.value} value={f.label}>{fmtN(f.n)} people</option>)}</datalist>
        <datalist id="ld-places">{st?.states.map(f => <option key={f.value} value={f.label}>{fmtN(f.n)} people</option>)}{st?.countries.map(f => <option key={f.value} value={f.label}>{fmtN(f.n)} people</option>)}</datalist>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13, color: INK }}>
            <input type="checkbox" checked={q.hasEmail} onChange={e => setQ({ ...q, hasEmail: e.target.checked })} /> Only people with an email address
          </label>
          <span style={{ flex: 1 }} />
          <button type="submit" disabled={busy} style={{ ...btn, background: '#4f46e5', color: '#fff', borderColor: 'transparent' }}>
            {busy ? <Loader size={13} className="spin" /> : <Search size={13} />} Search
          </button>
        </div>
      </form>

      {error && <div role="alert" style={{ fontSize: 13, color: '#b42318', background: '#fef2f2', borderRadius: 10, padding: '10px 12px' }}>{error}</div>}
      {note && <div role="status" style={{ fontSize: 13, color: '#9a3412', background: '#fff7ed', borderRadius: 10, padding: '10px 12px' }}>{note}</div>}
      {outcome && <div role="status" style={{ fontSize: 13, color: '#0f7b3d', background: '#e8f6ee', borderRadius: 10, padding: '10px 12px', display: 'flex', gap: 6, alignItems: 'center' }}><CheckCircle size={13} /> {outcome}</div>}

      {asked && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '12px 14px', borderBottom: `1px solid ${LINE}` }}>
            <strong data-testid="ld-count" style={{ fontSize: 14, color: INK }}>{total == null ? `${fmtN(people.length)} shown` : `${capped ? 'Over 5,000' : fmtN(total)} ${total === 1 ? 'person' : 'people'}`}</strong>
            <span style={{ flex: 1 }} />
            {!!people.length && <button style={btn} onClick={() => setPicked(picked.size === people.length ? new Set() : new Set(people.map(p => p.id)))}>{picked.size === people.length ? 'Untick all' : 'Tick all shown'}</button>}
          </div>
          {!!chosen.length && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', background: '#f5f3ff', borderBottom: `1px solid ${LINE}` }} data-testid="ld-actions">
              <span style={{ fontSize: 13, color: INK, fontWeight: 700 }}>{chosen.length} ticked{unseen ? ` · ${unseen} not seen before (uses ${unseen} of your allowance)` : ''}</span>
              <span style={{ flex: 1 }} />
              <button style={btn} disabled={!!working} onClick={async () => { setWorking('reveal'); await reveal(); setWorking(''); }}>
                {working === 'reveal' ? <Loader size={12} className="spin" /> : <Eye size={12} />} Show details
              </button>
              <select value={listId} onChange={e => setListId(e.target.value)} style={{ ...input, width: 'auto', maxWidth: 220 }}>
                <option value="">New list…</option>
                {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              {!listId && <input value={listName} onChange={e => setListName(e.target.value)} placeholder="List name" style={{ ...input, width: 200 }} />}
              <button style={{ ...btn, background: '#4f46e5', color: '#fff', borderColor: 'transparent' }} disabled={!!working} onClick={() => void add()}>
                {working === 'add' || working === 'check' ? <Loader size={12} className="spin" /> : <UserPlus size={12} />} {working === 'check' ? 'Checking the emails…' : 'Add to Contacts'}
              </button>
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: MUTED, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  <th style={th} />
                  <th style={th}>Person</th><th style={th}>Company</th><th style={th}>Where</th><th style={th}>Email</th><th style={th}>Phone</th><th style={th} />
                </tr>
              </thead>
              <tbody>
                {people.map(p => (
                  <tr key={p.id} style={{ borderTop: `1px solid ${LINE}`, background: picked.has(p.id) ? '#faf5ff' : undefined }}>
                    <td style={td}><input type="checkbox" aria-label={`Tick ${p.name}`} checked={picked.has(p.id)} onChange={() => setPicked(s => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} /></td>
                    <td style={td}><div style={{ fontWeight: 700, color: INK }}>{p.name}</div><div style={{ color: MUTED, fontSize: 12 }}>{[p.title, p.level].filter(Boolean).join(' · ')}</div></td>
                    <td style={td}>
                      <div style={{ color: INK }}>{p.company}</div>
                      <div style={{ color: MUTED, fontSize: 12 }}>
                        {p.website ? <a href={p.website} target="_blank" rel="noreferrer noopener" style={{ color: '#4f46e5' }}>{p.domain || 'website'} <ExternalLink size={10} /></a> : null}
                        {p.size ? `${p.website ? ' · ' : ''}${p.size}` : ''}
                      </div>
                    </td>
                    <td style={td}>{[p.city, p.state].filter(Boolean).join(', ') || p.country}</td>
                    <td style={{ ...td, fontFamily: p.revealed ? undefined : 'ui-monospace, monospace' }}>
                      {p.email || <span style={{ color: MUTED }}>—</span>}
                      {/* The list's own word on it, labelled as the list's — checked again on adding. */}
                      {p.email && p.email_status && p.email_status !== 'unknown' && (
                        <span title="What the file this person came from says about the address. It is checked again when you add them to Contacts."
                          style={{ display: 'inline-block', marginLeft: 6, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                            background: p.email_status === 'valid' ? '#e8f6ee' : p.email_status === 'invalid' ? '#fef2f2' : '#fff7ed',
                            color: p.email_status === 'valid' ? '#0f7b3d' : p.email_status === 'invalid' ? '#b42318' : '#9a3412' }}>
                          list: {p.email_status === 'valid' ? 'verified' : p.email_status === 'invalid' ? 'bounces' : 'risky'}
                        </span>
                      )}
                    </td>
                    <td style={td}>{p.phone || <span style={{ color: MUTED }}>—</span>}</td>
                    <td style={td}>{p.revealed && p.linkedin ? <a href={p.linkedin} target="_blank" rel="noreferrer noopener" style={{ color: '#0a66c2', fontSize: 12, fontWeight: 700 }}>Profile <ExternalLink size={10} /></a> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!people.length && !busy && <div style={{ padding: 18, fontSize: 13, color: MUTED }}>Nobody matches that. Try a wider place — a state rather than a town — or leave the job title empty.</div>}
          {more && <div style={{ padding: 12, borderTop: `1px solid ${LINE}` }}><button style={btn} disabled={busy} onClick={() => void search(true)}>{busy ? <Loader size={12} className="spin" /> : null} Show 50 more</button></div>}
        </div>
      )}
    </div>
  );
}

function Head({ label, total }: { label?: string; total?: number }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#6366f1,#ec4899)', color: '#fff' }}><BookUser size={20} /></span>
      <div style={{ flex: 1, minWidth: 200 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: INK, margin: 0 }}>{label && label !== 'Lead directory' ? label : 'Lead Directory'}</h1>
        <div style={{ fontSize: 13, color: MUTED }}>People at businesses, by industry, place and job title{total ? ` — ${fmtN(total)} in the directory` : ''}.</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'grid', gap: 4, fontSize: 12, color: MUTED, minWidth: 0 }}>{label}{children}</label>;
}

const page: React.CSSProperties = { padding: 'clamp(14px, 3vw, 28px)', display: 'grid', gap: 14, maxWidth: 1280, margin: '0 auto', minWidth: 0 };
const card: React.CSSProperties = { background: '#fff', borderRadius: 16, border: `1px solid ${LINE}`, padding: 16, minWidth: 0 };
const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 10, border: `1px solid ${LINE}`,
  background: '#fff', color: INK, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
const input: React.CSSProperties = { padding: '9px 11px', borderRadius: 10, border: `1px solid ${LINE}`, fontSize: 13, fontFamily: 'inherit', color: INK, background: '#fff', minWidth: 0, width: '100%', boxSizing: 'border-box' };
const th: React.CSSProperties = { padding: '9px 12px', fontWeight: 700 };
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top', overflowWrap: 'anywhere' };
