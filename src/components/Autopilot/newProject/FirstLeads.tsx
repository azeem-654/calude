/**
 * The first leads, found on the spot — right after the customer says who to
 * find and where, before any more questions.
 *
 * ── Why a screen of its own ──
 *
 * "It will find dentists in Leeds every day" is a promise until the customer
 * sees some. The live sample used to sit under the place box, where it was
 * easy to scroll past; the owner wanted the wizard to stop and *find* them, so
 * the customer understands the project has started working. This runs the
 * same three steps the daily finder runs (worker/src/prospectFinderTick.ts):
 * a live directory search, each business's own website read for the address
 * it publishes, and every address checked. Nothing here is a mock-up — when a
 * step finds nothing it says so.
 *
 * Nothing is saved: the project does not exist yet. When it is built, the
 * finder starts with this same search, so these are the people it begins with.
 *
 * The box underneath takes a correction in words ("only clinics with a
 * website", "try Fort Lauderdale too"), which changes the answers and runs
 * the search again.
 */
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, Globe, Loader, Mail, MapPin, RefreshCcw, Send, Sparkles, Wand2, AlertTriangle } from 'lucide-react';
import { lookupContacts, searchProspects, verifyEmails, type Contactable, type Prospect, type Verdict } from '../../../services/prospects';
import { bestAddress, checkLabel } from '../../../services/aiProspecting';

type StepState = 'todo' | 'now' | 'done' | 'warn';
interface Step { key: 'search' | 'read' | 'check'; label: string; state: StepState; detail?: string }

/** How many to show: enough to judge the kind of business, few enough to read. */
const SHOW = 10;
/** Websites read here — the same eight the server reads in one request. */
const READ = 8;

export default function FirstLeads({ trades, places, perDay, onCorrect }: {
  trades: string[];
  places: string[];
  perDay: string;
  /** A correction in words; resolves with a sentence saying what changed, or why not. */
  onCorrect: (text: string) => Promise<{ ok: boolean; said: string }>;
}) {
  const trade = trades[0] ?? '';
  const place = places[0] ?? '';
  const key = `${trade}|${place}`;
  const [steps, setSteps] = useState<Step[]>([]);
  const [rows, setRows] = useState<Prospect[]>([]);
  const [total, setTotal] = useState(0);
  const [found, setFound] = useState<Record<string, Contactable>>({});
  const [checks, setChecks] = useState<Record<string, Verdict>>({});
  const [note, setNote] = useState('');
  const [fix, setFix] = useState('');
  const [fixing, setFixing] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const run = useRef(0);

  const go = async () => {
    const me = ++run.current;
    const live = () => me === run.current;
    let cur: Step[] = [
      { key: 'search', label: `Searching the internet for ${trade} in ${place}`, state: 'now' },
      { key: 'read', label: 'Reading their websites for contact details', state: 'todo' },
      { key: 'check', label: 'Checking every email address', state: 'todo' },
    ];
    const mark = (k: Step['key'], patch: Partial<Step>) => { cur = cur.map(s => (s.key === k ? { ...s, ...patch } : s)); if (live()) setSteps(cur); };
    setSteps(cur); setRows([]); setFound({}); setChecks({}); setNote(''); setTotal(0);

    let r = await searchProspects({ source: 'free', trade, place, fresh: true });
    /* The free directory is volunteer-run and sometimes busy; one quiet retry. */
    if (r.error && !r.code) { await new Promise(res => window.setTimeout(res, 2500)); r = await searchProspects({ source: 'free', trade, place, fresh: true }); }
    if (!live()) return;
    if (r.error) {
      mark('search', { state: 'warn', detail: `The business directory did not answer just now (${r.error}). This does not hold the project up — once built, it searches by itself and retries.` });
      mark('read', { state: 'todo' }); mark('check', { state: 'todo' });
      return;
    }
    /* Businesses with a website first: those are the ones an address can be read from. */
    const sorted = [...r.prospects].sort((a, b) => Number(!!b.website || !!b.email) - Number(!!a.website || !!a.email));
    const first = sorted.slice(0, SHOW);
    setRows(first); setTotal(r.prospects.length); setNote(r.note ?? '');
    mark('search', { state: 'done', detail: r.prospects.length ? `${r.prospects.length} found live${r.prospects.length > SHOW ? ` — the first ${SHOW} below` : ''}` : 'Nothing listed for that just now' });
    if (!first.length) { mark('read', { state: 'todo' }); mark('check', { state: 'todo' }); return; }

    mark('read', { state: 'now' });
    const sites = [...new Set(first.map(p => p.website).filter(Boolean))].slice(0, READ);
    const c = sites.length ? await lookupContacts(sites, true) : { contacts: {}, error: '' };
    if (!live()) return;
    setFound(c.contacts);
    const withAddress = first.filter(p => (p.email || c.contacts[p.website]?.emails?.length));
    mark('read', c.error
      ? { state: 'warn', detail: `Could not read the websites just now (${c.error}).` }
      : { state: 'done', detail: sites.length ? `${sites.length} website${sites.length === 1 ? '' : 's'} read · ${withAddress.length} published an email address` : 'None of these list a website' });

    const emails = [...new Set(first.flatMap(p => [p.email, ...(c.contacts[p.website]?.emails ?? [])]).map(e => String(e ?? '').toLowerCase()).filter(Boolean))].slice(0, 20);
    if (!emails.length) { mark('check', { state: 'done', detail: 'No addresses to check yet — the daily run reads more websites.' }); return; }
    mark('check', { state: 'now' });
    const v = await verifyEmails(emails, false, true);
    if (!live()) return;
    setChecks(v.verdicts);
    const good = Object.values(v.verdicts).filter(x => x.status === 'valid' || x.status === 'domain_ok').length;
    mark('check', v.error ? { state: 'warn', detail: `The check could not run just now (${v.error}).` } : { state: 'done', detail: `${good} of ${emails.length} address${emails.length === 1 ? '' : 'es'} take mail` });
  };

  useEffect(() => {
    if (!trade || !place) return;
    void go();
    return () => { run.current++; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const send = async () => {
    const t = fix.trim();
    if (t.length < 3 || fixing) return;
    setFixing(true); setSaid(null);
    const r = await onCorrect(t);
    setFixing(false);
    setSaid({ ok: r.ok, text: r.said });
    if (r.ok) setFix('');
  };

  const busy = steps.some(s => s.state === 'now');
  const leads = rows.map(p => {
    const email = bestAddress(p, found, checks);
    return { p, email, v: email ? checks[email] : undefined };
  });

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div>
        <span className="np-eyebrow" style={{ color: '#5b46e5' }}><Sparkles size={13} /> YOUR AI AUTOPILOT HAS STARTED</span>
        <h2 className="wz-title" style={{ marginTop: 4 }}>Your first <span className="wz-accent">leads</span></h2>
        <p style={{ margin: '8px 0 0', fontSize: 14.5, color: '#6b7280', lineHeight: 1.55 }}>
          Found live, right now — the same search it will run every day, adding up to {perDay || '20'} new prospects a day.
          Check they are the kind of business you want before going on.
        </p>
      </div>

      <ol className="np-stages" aria-live="polite">
        {steps.map(s => (
          <li key={s.key} className="np-stage" data-state={s.state}>
            <span className="np-stage-icon">
              {s.state === 'done' ? <CheckCircle2 size={17} color="#16a34a" />
                : s.state === 'now' ? <Loader size={17} color="#5b46e5" className="spin" />
                  : s.state === 'warn' ? <AlertTriangle size={17} color="#b45309" />
                    : <Circle size={17} color="#cbd5e1" />}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: s.state === 'now' ? 700 : 500 }}>{s.label}</span>
              {s.detail && <span style={{ display: 'block', fontSize: 12.5, color: s.state === 'warn' ? '#92400e' : '#6b7280', marginTop: 2, lineHeight: 1.5 }}>{s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>

      {note && <span style={{ fontSize: 12.5, color: '#4c39d1' }}>{note}</span>}

      {leads.length > 0 && (
        <ul className="np-leads" aria-label="First leads">
          {leads.map(({ p, email, v }, i) => (
            <li key={p.ref} className="np-lead np-rise" style={{ animationDelay: `${Math.min(i, 9) * 50}ms` }}>
              <span className="np-lead-n">{i + 1}</span>
              <span style={{ minWidth: 0 }}>
                <b className="np-lead-name">{p.name}</b>
                <span className="np-lead-meta">
                  {p.category && <span>{p.category}</span>}
                  {p.address && <span><MapPin size={11} /> {p.address}</span>}
                </span>
              </span>
              <span className="np-lead-contact">
                {email ? (
                  <span className="np-lead-email" data-ok={v ? String(v.status === 'valid' || v.status === 'domain_ok') : 'wait'}>
                    <Mail size={12} /> {email}
                    <small>{v ? checkLabel(v) : busy ? 'checking…' : 'not checked'}</small>
                  </span>
                ) : p.website ? (
                  <span className="np-lead-web"><Globe size={12} /> {busy && !found[p.website] ? 'reading website…' : 'website — no address published'}</span>
                ) : (
                  <span className="np-lead-web">no website listed</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!busy && total === 0 && steps[0]?.state === 'done' && (
        <span style={{ fontSize: 13, color: '#92400e', lineHeight: 1.55 }}>
          Nothing is listed for {trade} in {place} just now. Try a broader kind of business or a bigger place below — the finder can only add what the directories list.
        </span>
      )}

      <div className="np-fix">
        <label htmlFor="np-leads-fix" className="np-fix-label"><Wand2 size={14} /> Not the right kind of prospects? Tell AI what to change</label>
        <div className="np-fix-row">
          <input id="np-leads-fix" className="np-input" value={fix} disabled={fixing} data-field="project.leadsCorrection"
            placeholder={`e.g. “look for ${trade === 'dentists' ? 'orthodontists' : 'bigger firms'} instead” or “also search near ${place.split(',')[0] || 'the next town'}”`}
            onChange={e => setFix(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void send(); } }} />
          <button type="button" className="np-fix-send" onClick={() => void send()} disabled={fixing || fix.trim().length < 3}>
            {fixing ? <Loader size={15} className="spin" /> : <Send size={15} />} <span>{fixing ? 'Changing…' : 'Change & search'}</span>
          </button>
        </div>
        {said && <span style={{ fontSize: 12.5, color: said.ok ? '#0f7b3d' : '#9a3412' }}>{said.text}</span>}
        <button type="button" className="np-skip" style={{ justifySelf: 'start', display: 'inline-flex', gap: 5, alignItems: 'center' }} onClick={() => void go()} disabled={busy}>
          <RefreshCcw size={12} /> Search again
        </button>
      </div>

      <p style={{ margin: 0, fontSize: 12.5, color: '#6b7280', lineHeight: 1.55 }}>
        Nothing is saved yet. When the project is built it starts with this search, then works through {trades.length > 1 ? `${trades.length} kinds of business` : trade}
        {places.length > 1 ? ` across ${places.length} places` : ''}, adding only businesses whose address was checked. You approve each batch before anybody is emailed.
      </p>
    </div>
  );
}
