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
  AlertTriangle, CheckCircle2, Globe, Info, Loader, MailCheck, MinusCircle, Phone, ShieldCheck, Star, Users,
} from 'lucide-react';
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
      <Icon size={10} /> {STATUS_LABEL[v.status]}
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

export interface LeadRow { p: Prospect; email: string; v?: Verdict; person: ReturnType<typeof personFor>; score: number; others: number }

export function useLeadRows(s: ProspectSearch, filter: LeadFilter): LeadRow[] {
  return useMemo(() => {
    const rows = (s.results ?? []).map(p => {
      const email = s.emailFor(p);
      const v = email ? s.checks[email] : undefined;
      const person = personFor(p, s.found, email);
      return { p, email, v, person, score: leadScore(p, email, v, person), others: Math.max(0, addressesOf(p, s.found).length - 1) };
    });
    const kept = rows.filter(r => filter === 'all' ? true
      : filter === 'email' ? !!r.email
        : filter === 'checked' ? r.v?.status === 'valid' || r.v?.status === 'domain_ok'
          : filter === 'website' ? !!r.p.website
            : !!r.p.phone);
    /* Most reachable first — the order a person works a list in. Ties keep
       the directory's order, so the table does not reshuffle for nothing. */
    return kept.map((r, i) => ({ r, i })).sort((a, b) => b.r.score - a.r.score || a.i - b.i).map(x => x.r);
  }, [s.results, s.found, s.checks, s.emailFor, filter]);
}

const hue = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
function Avatar({ name }: { name: string }) {
  const letters = name.replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  return <span className="aip-avatar" aria-hidden="true" style={{ ['--h' as string]: hue(name) }}>{letters}</span>;
}

export function LeadTable({ s, rows }: { s: ProspectSearch; rows: LeadRow[] }) {
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
            <th>Email</th>
            <th>Phone</th>
            <th>Website</th>
            <th title={SCORE_RULE}>Score <Info size={10} style={{ verticalAlign: -1 }} /></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => <LeadRowView key={r.p.ref} r={r} s={s} />)}
        </tbody>
      </table>
    </div>
  );
}

function LeadRowView({ r, s }: { r: LeadRow; s: ProspectSearch }) {
  const { p, email, v, person } = r;
  const on = s.picked.has(p.ref);
  const c = s.found[p.website];
  /* Every address known was shown to bounce: name the first, struck through. */
  const dead = email ? '' : addressesOf(p, s.found)[0] ?? '';
  return (
    <tr data-on={on} onClick={() => s.toggle(p.ref)}>
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
          </span>
        </span>
      </td>
      <td className="pp-cell">
        <span className="pp-label">Email</span>
        {email ? (
          <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
            <span className="pp-email aip-email">{email}{r.others > 0 && <span className="aip-more" title={addressesOf(p, s.found).filter(e => e !== email).join(', ')}> +{r.others}</span>}</span>
            <CheckBadge v={v} email={email} />
            {person && <span className="aip-person"><Users size={10} /> {person.name}{person.position ? `, ${person.position}` : ''}</span>}
          </span>
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
          : <span className="pp-none">{p.website ? 'Not looked up yet' : 'No website to read'}</span>}
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
