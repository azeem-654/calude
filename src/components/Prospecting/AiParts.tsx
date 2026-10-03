/**
 * The pieces AI Prospecting draws that the "Find businesses" dialog does not:
 * the plan as it ran, the lead table with each address's check and a score,
 * and the email checker for a pasted list.
 *
 * Colours come from the page's custom properties (aiProspecting.css), which
 * the page defines for light and dark — the page carries `data-noinvert`, so
 * the app's inverting dark mode leaves it alone and these draw the real thing.
 */
import { useMemo, useState } from 'react';
import {
  AlertTriangle, BadgeCheck, CheckCircle2, Globe, Info, Loader, MailCheck, MinusCircle, Phone, ShieldCheck, Sparkles, Star, Users,
} from 'lucide-react';
import { findSuppression } from '../../services/deliverability';
import { sameBusiness } from '../../services/prospectImport';
import type { Prospect, Verdict } from '../../services/prospects';
import {
  SCORE_RULE, STATUS_LABEL, leadScore, personFor, verdictSentence, addressesOf,
} from '../../services/aiProspecting';
import { useApp } from '../../context/AppContext';
import type { ProspectSearch, Step } from './useProspectSearch';

/* ── A check, as a badge ─────────────────────────────────────────────── */

export function CheckBadge({ v, email }: { v?: Verdict; email: string }) {
  if (!email) return null;
  if (!v) return <span className="aip-badge" data-s="none" title="Not checked yet">Not checked</span>;
  const Icon = v.status === 'valid' ? ShieldCheck : v.status === 'invalid' ? AlertTriangle : v.status === 'risky' ? AlertTriangle : v.status === 'domain_ok' ? MailCheck : Info;
  return (
    <span className="aip-badge" data-s={v.status} title={verdictSentence(v)}>
      <Icon size={10} /> {v.status === 'valid' ? 'Verified email' : STATUS_LABEL[v.status]}
    </span>
  );
}

/* ── The plan ─────────────────────────────────────────────────────────── */

export function PlanSteps({ steps }: { steps: Step[] }) {
  if (!steps.length) return null;
  return (
    <ol className="aip-steps" aria-label="What AI Prospecting did">
      {steps.map(st => {
        const Icon = st.state === 'running' ? Loader : st.state === 'done' ? CheckCircle2 : st.state === 'failed' ? AlertTriangle : MinusCircle;
        return (
          <li key={st.id} data-state={st.state}>
            <span className="aip-step-icon"><Icon size={14} className={st.state === 'running' ? 'spin' : undefined} /></span>
            {st.state === 'running' && <span className="aip-step-scan" aria-hidden="true" />}
            <span className="aip-step-text">
              <span>{st.label}</span>
              {st.detail && <small>{st.detail}</small>}
            </span>
            <span className="aip-step-badge">{st.badge}{typeof st.count === 'number' ? ` · ${st.count}` : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ── The leads ────────────────────────────────────────────────────────── */

export type LeadFilter = 'all' | 'email' | 'checked' | 'phone' | 'website';

export interface LeadRow {
  p: Prospect; email: string; v?: Verdict; person: ReturnType<typeof personFor>; score: number; others: number;
  /** Already a contact in this workspace — the import will put them on the list, not copy them. */
  known: boolean;
  /** The address is on the suppression list (unsubscribed, bounced, complained): never email it. */
  blocked: string;
}

const BLOCKED: Record<string, string> = {
  unsubscribed: 'Unsubscribed', hard_bounce: 'Bounced before', complaint: 'Reported as spam', invalid: 'Marked invalid', manual: 'Do not email',
};

export function useLeadRows(s: ProspectSearch, filter: LeadFilter): LeadRow[] {
  const { contacts } = useApp();
  return useMemo(() => {
    const rows = (s.results ?? []).map(p => {
      const email = s.emailFor(p);
      const v = email ? s.checks[email] : undefined;
      const person = personFor(p, s.found, email);
      /* A director named by the register counts as a named person for the score. */
      const named = person ?? (p.officers?.[0] ? { email: '', name: p.officers[0].name, position: p.officers[0].role, type: 'personal' as const, sources: 1, confidence: 100 } : null);
      const sup = email ? findSuppression(email) : null;
      const probe = { name: p.name, email, phone: p.phone, website: p.website, status: 'prospect' as const, tags: [], source: '', createdAt: '', lastActivity: '', value: 0 };
      return {
        p, email, v, person, score: leadScore(p, email, v, named), others: Math.max(0, addressesOf(p, s.found).length - 1),
        known: contacts.some(c => sameBusiness(probe, c)),
        blocked: sup ? BLOCKED[sup.reason] ?? 'Do not email' : '',
      };
    });
    const kept = rows.filter(r => filter === 'all' ? true
      : filter === 'email' ? !!r.email
        : filter === 'checked' ? r.v?.status === 'valid' || r.v?.status === 'domain_ok'
          : filter === 'website' ? !!r.p.website
            : !!r.p.phone);
    /* Most reachable first — the order a person works a list in. Ties keep
       the directory's order, so the table does not reshuffle for nothing. */
    return kept.map((r, i) => ({ r, i })).sort((a, b) => b.r.score - a.r.score || a.i - b.i).map(x => x.r);
  }, [s.results, s.found, s.checks, s.emailFor, filter, contacts]);
}

const hue = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
function Avatar({ name }: { name: string }) {
  const letters = name.replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  return <span className="aip-avatar" aria-hidden="true" style={{ ['--h' as string]: hue(name) }}>{letters}</span>;
}

/** A cell being worked on right now: a shimmer with what is happening, never a blank. */
function Working({ text }: { text: string }) {
  return <span className="aip-working" role="status"><span className="aip-shimmer" aria-hidden="true" />{text}</span>;
}

export function LeadTable({ s, rows, showAll }: { s: ProspectSearch; rows: LeadRow[]; showAll: boolean }) {
  const results = s.results ?? [];
  const all = results.length > 0 && s.picked.size === results.length;
  const some = s.picked.size > 0 && !all;
  return (
    <div className="pp-results aip-table-wrap">
      <table className="pp-table aip-table" aria-label="Businesses found">
        <thead>
          <tr>
            <th className="pp-check">
              <input type="checkbox" aria-label="Tick all" checked={all}
                ref={el => { if (el) el.indeterminate = some; }}
                onChange={e => s.pickAll(e.target.checked)} />
            </th>
            <th>Name</th>
            <th>{showAll ? 'Every email address' : 'Email'}</th>
            <th>Phone</th>
            <th>Website</th>
            <th title={SCORE_RULE}>Score <Info size={10} style={{ verticalAlign: -1 }} /></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => <LeadRowView key={r.p.ref} r={r} s={s} i={i} showAll={showAll} />)}
        </tbody>
      </table>
    </div>
  );
}

function LeadRowView({ r, s, i, showAll }: { r: LeadRow; s: ProspectSearch; i: number; showAll: boolean }) {
  const { p, email, v, person } = r;
  const on = s.picked.has(p.ref);
  const c = s.found[p.website];
  const every = addressesOf(p, s.found);
  /* Every address known was shown to bounce: name the first, struck through. */
  const dead = email ? '' : every[0] ?? '';
  const readingNow = !!p.website && s.reading.has(p.website);
  return (
    <tr data-on={on} onClick={() => s.toggle(p.ref)} className="aip-row" style={{ ['--i' as string]: Math.min(i, 24) }}>
      <td className="pp-check" onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={on} onChange={() => s.toggle(p.ref)} aria-label={`Tick ${p.name}`} />
      </td>
      <td>
        <span className="aip-who">
          <Avatar name={p.name} />
          <span style={{ minWidth: 0 }}>
            <span className="pp-name">{p.name}</span>
            {typeof p.rating === 'number' && (
              <span className="aip-rating"><Star size={10} fill="#f59e0b" color="#f59e0b" /> {p.rating.toFixed(1)}</span>
            )}
            <span className="pp-sub">{p.category}{p.category && p.address ? ' · ' : ''}{p.address}</span>
            {p.officers && p.officers.length > 0 && (
              <span className="aip-person"><Users size={10} /> {p.officers.slice(0, 2).map(o => `${o.name} (${o.role})`).join(', ')}</span>
            )}
            <span className="aip-tags">
              {p.registerUrl && (
                <a className="aip-tag" data-t="register" href={p.registerUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  title={`Company ${p.companyNumber}${p.incorporated ? `, formed ${p.incorporated}` : ''} — active on the register`}>
                  <BadgeCheck size={10} /> Registered company
                </a>
              )}
              {r.known && <span className="aip-tag" data-t="known" title="Already in Contacts — saving puts them on the list rather than adding them twice">In Contacts</span>}
            </span>
          </span>
        </span>
      </td>
      <td className="pp-cell">
        <span className="pp-label">Email</span>
        {showAll && every.length > 0 ? (
          <span className="aip-all">
            {every.map(e => (
              <span key={e} className="aip-all-row">
                <span className={s.checks[e]?.status === 'invalid' ? 'pp-none' : 'pp-email aip-email'}>
                  {s.checks[e]?.status === 'invalid' ? <s>{e}</s> : e}
                </span>
                {s.checking.has(e) ? <Working text="Checking…" /> : <CheckBadge v={s.checks[e]} email={e} />}
              </span>
            ))}
          </span>
        ) : email ? (
          <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
            <span className="pp-email aip-email">{email}{r.others > 0 && <span className="aip-more" title={every.filter(e => e !== email).join(', ')}> +{r.others}</span>}</span>
            <span className="aip-tags">
              {s.checking.has(email) ? <Working text="Checking the mail server…" /> : <CheckBadge v={v} email={email} />}
              {r.blocked && <span className="aip-tag" data-t="blocked" title="On your suppression list — campaigns and workflows will not email it">{r.blocked}</span>}
            </span>
            {person && <span className="aip-person"><Users size={10} /> {person.name}{person.position ? `, ${person.position}` : ''}</span>}
          </span>
        ) : readingNow ? (
          <Working text="Reading their website…" />
        ) : dead ? (
          /* Said, not hidden: somebody who knows the business may have a
             better address, and should know why this one is not used. */
          <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
            <span className="pp-none"><s>{dead}</s></span>
            <CheckBadge v={s.checks[dead]} email={dead} />
          </span>
        ) : c
          /* "We could not check" reported as "this will bounce" has people
             deleting good leads — the three cases stay three. */
          ? <span className="pp-none">None published{c.mx === false ? ' · the domain takes no mail' : c.mx === null && !c.emails.length && !c.people ? ' · mail check could not run' : ''}</span>
          : <span className="pp-none">{p.registerUrl ? 'The register lists no email' : p.website ? 'Not looked up yet' : 'No website to read'}</span>}
      </td>
      <td className={`pp-cell${p.phone ? '' : ' pp-empty'}`}>
        <span className="pp-label"><Phone size={10} /></span>
        {p.phone || <span className="pp-none">—</span>}
      </td>
      <td className={`pp-cell${p.website ? '' : ' pp-empty'}`}>
        <span className="pp-label"><Globe size={10} /></span>
        {p.website
          ? <a className="pp-site" href={p.website} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{p.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>
          : <span className="pp-none">—</span>}
      </td>
      <td className="pp-cell">
        <span className="pp-label">Score</span>
        <span className="aip-score" data-band={r.score >= 75 ? 'high' : r.score >= 45 ? 'mid' : 'low'} title={SCORE_RULE}>{r.score}</span>
      </td>
    </tr>
  );
}

/* ── While it works ───────────────────────────────────────────────────── */

/**
 * The thing working: an orb that breathes, and the step it is on in words.
 * The words are the running step's own label, so the animation never says
 * something is happening that is not.
 */
export function Thinking({ text }: { text: string }) {
  return (
    <div className="aip-thinking" role="status" aria-live="polite">
      <span className="aip-think-orb" aria-hidden="true"><i /><i /><i /><Sparkles size={13} /></span>
      <span className="aip-think-text">{text}</span>
      <span className="aip-dots" aria-hidden="true"><i /><i /><i /></span>
    </div>
  );
}

/** A long pass, measured: "Reading websites — 24 of 44". */
export function ProgressBar({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="aip-progress" role="progressbar" aria-label={label} aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}>
      <span>{label} — {done} of {total}</span>
      <span className="aip-progress-track"><span style={{ width: `${Math.max(4, pct)}%` }} /></span>
    </div>
  );
}

/** Placeholder rows while the first answer is on its way. */
export function SkeletonRows({ n = 5 }: { n?: number }) {
  return (
    <div className="aip-card aip-skeleton" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="aip-skel-row" style={{ ['--i' as string]: i }}>
          <span className="aip-skel aip-skel-av" /><span className="aip-skel" style={{ width: '28%' }} />
          <span className="aip-skel" style={{ width: '24%' }} /><span className="aip-skel" style={{ width: '14%' }} />
        </div>
      ))}
    </div>
  );
}

/* ── The checker for a pasted list ───────────────────────────────────── */

const EMAIL_IN_TEXT = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi;

/**
 * Paste addresses (or pull in Contacts'), check them, and write what was
 * found back onto the matching contacts. The same checks as the lead table,
 * on the same server, so the two cannot disagree about an address.
 */
export function VerifyTool({ s, deepReady, deepWhy }: { s: ProspectSearch; deepReady: boolean; deepWhy: string }) {
  const { contacts, updateContacts } = useApp();
  const [text, setText] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [shown, setShown] = useState<string[]>([]);
  const emails = useMemo(() => [...new Set((text.match(EMAIL_IN_TEXT) ?? []).map(e => e.toLowerCase()))].slice(0, 200), [text]);
  const withEmail = contacts.filter(c => c.email);

  const run = async (deep: boolean) => {
    setNote(null);
    if (!emails.length) { setNote({ ok: false, text: 'Paste at least one email address.' }); return; }
    setShown(emails);
    const r = await s.verifyList(emails, deep);
    if (r.error) { setNote({ ok: false, text: r.error }); return; }
    setNote({ ok: true, text: deep ? `Checked ${Object.keys(r.verdicts).length}; ${r.ran} asked of the mail server.${r.note ? ` ${r.note}` : ''}` : `Checked ${Object.keys(r.verdicts).length} — format, domain and mail server.` });
  };

  const matches = withEmail.filter(c => s.checks[c.email.toLowerCase()] && shown.includes(c.email.toLowerCase()));
  const save = () => {
    const ups = matches.map(c => {
      const v = s.checks[c.email.toLowerCase()];
      return { id: c.id, updates: { customFields: { ...(c.customFields ?? {}), emailStatus: v.status, emailCheck: v.level, emailCheckedAt: v.checkedAt } } };
    });
    if (ups.length) updateContacts(ups);
    setNote({ ok: true, text: `Saved the check on ${ups.length} contact${ups.length === 1 ? '' : 's'}.` });
  };

  return (
    <section className="aip-card" aria-label="Check email addresses" style={{ display: 'grid', gap: 12 }}>
      <div className="aip-card-head">
        <span className="aip-card-title"><MailCheck size={15} /> Check email addresses</span>
      </div>
      <div style={{ display: 'grid', gap: 10, padding: '0 16px 16px' }}>
        <p className="aip-muted" style={{ margin: 0 }}>
          Paste addresses — a column from a spreadsheet, an email signature, anything — and each one is checked for format,
          domain and mail server, for free. {deepReady ? 'Verify mailboxes also asks the mail server whether the mailbox exists.' : deepWhy}
        </p>
        <textarea className="aip-textarea" rows={5} value={text} onChange={e => setText(e.target.value)} aria-label="Email addresses to check"
          placeholder={'sarah@mintly.ai\ninfo@leedsdental.co.uk'} data-field="verify.emails" />
        <div className="aip-row">
          <span className="aip-muted">{emails.length} address{emails.length === 1 ? '' : 'es'}{emails.length === 200 ? ' (the first 200)' : ''}</span>
          <span style={{ flex: 1 }} />
          {withEmail.length > 0 && (
            <button type="button" className="aip-chip" onClick={() => setText(withEmail.slice(0, 200).map(c => c.email).join('\n'))}>
              <Users size={12} /> Use my contacts' addresses ({Math.min(200, withEmail.length)})
            </button>
          )}
          <button type="button" className="aip-chip" disabled={s.verifying || !emails.length} onClick={() => void run(false)}>
            {s.verifying ? <Loader size={12} className="spin" /> : <MailCheck size={12} />} Check (free)
          </button>
          <button type="button" className="aip-chip" data-accent="true" disabled={s.verifying || !emails.length || !deepReady}
            title={deepReady ? 'Asks the mail server whether each mailbox exists' : deepWhy} onClick={() => void run(true)}>
            <ShieldCheck size={12} /> Verify mailboxes
          </button>
        </div>
        {note && <div role="status" className="aip-note" data-ok={note.ok}>{note.text}</div>}
        {shown.length > 0 && (
          <div className="aip-table-wrap pp-results">
            <table className="pp-table aip-table" aria-label="Checked addresses">
              <thead><tr><th>Address</th><th>Result</th><th>Why</th></tr></thead>
              <tbody>
                {shown.map(e => {
                  const v = s.checks[e];
                  return (
                    <tr key={e} style={{ cursor: 'default' }}>
                      <td className="pp-cell"><span className="pp-name" style={{ fontWeight: 600 }}>{e}</span></td>
                      <td className="pp-cell"><span className="pp-label">Result</span>{v ? <CheckBadge v={v} email={e} /> : <span className="pp-none">{s.verifying ? 'Checking…' : '—'}</span>}</td>
                      <td className="pp-cell"><span className="pp-label">Why</span><span className="aip-muted">{v ? verdictSentence(v) : ''}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {matches.length > 0 && (
          <button type="button" className="aip-chip" style={{ justifySelf: 'start' }} onClick={save}>
            <CheckCircle2 size={12} /> Save the result on {matches.length} matching contact{matches.length === 1 ? '' : 's'}
          </button>
        )}
      </div>
    </section>
  );
}
