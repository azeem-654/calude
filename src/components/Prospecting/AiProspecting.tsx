/**
 * AI Prospecting — say who you want to sell to in a sentence, and get a list
 * of businesses with addresses that have been checked.
 *
 * ── What "AI" means here, exactly ──
 *
 * The sentence is understood (`parseAsk`) and run as a plan whose every step
 * is a real call, shown as it runs and reporting what it actually found:
 * search the directory, read each business's own website for the address it
 * publishes, and check every address — free checks always, the mail server
 * itself when the owner has connected a verifier. Nothing in the thread is a
 * canned message; a step that found nothing says so.
 *
 * ── Where leads come from, and where they do not ──
 *
 * The free directory (OpenStreetMap, through Geoapify), Google Maps on the
 * owner's key, each business's own website, and — with the owner's Hunter
 * key — addresses Hunter saw published on the web. Not LinkedIn, not Apollo:
 * their terms forbid exactly this, and a lead list built on a breach of terms
 * is a liability the customer did not know they had. See services/aiProspecting.ts.
 *
 * ── The look ──
 *
 * A copilot: searches and lists on the left, the run as a thread in the
 * middle, the composer at the bottom. It carries `data-noinvert` and draws its
 * own light and dark (aiProspecting.css), because the app's dark mode is an
 * inversion filter and an inverted orange gradient is a blue one.
 *
 * The search, the import and the lists are the shared ones (useProspectSearch,
 * ProspectParts) — the Contacts dialog stamps an import exactly as this does.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowUp, Bot, Bookmark, CheckCircle2, Download, Filter, Globe, ListChecks, Loader, Mail, MailCheck, MapPin,
  Plus, Search, Send, ShieldCheck, Sparkles, Users, X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useProspectSearch, outcomeText, AUTO_READ, type ImportOutcome } from './useProspectSearch';
import { Attribution, ImportPanel, Notice, SearchProblems } from './ProspectParts';
import { LeadTable, PlanSteps, VerifyTool, useLeadRows, type LeadFilter } from './AiParts';
import { suggestListName, type SavedSearch } from '../../services/prospectImport';
import { listKindOf, loadLists, type ContactList } from '../../services/contactLists';
import { ago, askTitle, toCsv } from '../../services/aiProspecting';
import type { Contact } from '../../types';
import './prospecting.css';
import './aiProspecting.css';

const EXAMPLES = ['Dentists in Leeds with a website', 'Cafés near Bristol', 'Accountants in Austin, Texas', 'Hair salons in Manchester'];

const members = (l: ContactList, contacts: Contact[]) => {
  const ids = new Set(l.memberIds);
  return contacts.filter(c => ids.has(c.id));
};

/** Where a list goes next — the same three everywhere a list is offered. */
function ListShortcuts({ list, go, compact }: { list: ContactList; go: (to: string) => void; compact?: boolean }) {
  const id = encodeURIComponent(list.id);
  const items = [
    { to: `/marketing?new=campaign&list=${id}`, label: 'Send a campaign to this list', Icon: Send },
    { to: `/autopilot?new=1&list=${id}`, label: 'Use this list in a new Autopilot project', Icon: Bot },
    { to: `/contacts?list=${id}`, label: 'Open in Contacts', Icon: Users },
  ];
  return (
    <div className="aip-shortcuts" data-compact={compact ? 'true' : undefined}>
      {items.map(({ to, label, Icon }) => (
        <button key={to} type="button" className="aip-chip" onClick={() => go(to)} aria-label={label} title={label}>
          <Icon size={12} />{!compact && <span>{label}</span>}
        </button>
      ))}
    </div>
  );
}

export default function AiProspecting() {
  const { contacts } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const s = useProspectSearch();
  const [text, setText] = useState('');
  const [askError, setAskError] = useState('');
  const [filter, setFilter] = useState<LeadFilter>('all');
  const [view, setView] = useState<'leads' | 'verify'>('leads');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<ImportOutcome | null>(null);
  const [version, setVersion] = useState(0);
  const [find, setFind] = useState('');
  const thread = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLDivElement>(null);
  const findRef = useRef<HTMLInputElement>(null);

  const rows = useLeadRows(s, filter);
  const verifier = s.google?.verifier;
  const deepReady = !!verifier?.available;
  const deepWhy = !verifier ? '' : verifier.code === 'trial_ended'
    ? 'Mailbox checks stopped when the trial ended; the free checks still run.'
    : 'Mailbox checks are switched off until the owner connects an email verifier (Settings → Platform services).';

  const lists = useMemo(() => loadLists()
    .filter(l => l.type === 'static' && (l.origin === 'prospecting' || listKindOf(l, members(l, contacts)) === 'cold'))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [contacts, version]);

  const q = find.trim().toLowerCase();
  const hits = (h: SavedSearch) => !q || `${h.trade} ${h.place}`.toLowerCase().includes(q);
  const pinned = s.history.filter(h => h.saved && hits(h));
  const recent = s.history.filter(h => !h.saved && hits(h));
  const shownLists = lists.filter(l => !q || l.name.toLowerCase().includes(q));

  const go = async (sentence?: string, from?: SavedSearch['source']) => {
    setAskError(''); setDone(null); setSaving(false); setView('leads'); setFilter('all');
    const typed = (sentence ?? text).trim();
    const line = typed || (s.trade.trim() && s.place.trim() ? `${s.trade.trim()} in ${s.place.trim()}` : '');
    if (!line) { setAskError('Say who to look for — "dentists in Leeds", "cafés near Bristol".'); return; }
    if (typed) setText('');
    const r = await s.ask(line, from);
    if (r.error) setAskError(r.error);
    /* "…with an email" narrows what is shown; the search itself is the same. */
    if (r.want) setFilter(r.want.email ? 'email' : r.want.phone ? 'phone' : r.want.website ? 'website' : 'all');
    thread.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* The dashboard's box hands a sentence over as ?q=. Run once, then forget it. */
  const handed = useRef(false);
  useEffect(() => {
    const qp = params.get('q');
    if (!qp || handed.current) return;
    handed.current = true;
    const next = new URLSearchParams(params); next.delete('q');
    setParams(next, { replace: true });
    void go(qp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  /* The frame fills the window below whatever is above it — the nav, and a
     trial or staging bar that may or may not be there. A fixed calc() guessed
     at those and cut the composer off the bottom whenever a bar was showing. */
  const frame = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const fit = () => {
      const el = frame.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      el.style.setProperty('--aip-h', `${Math.max(560, window.innerHeight - top - 16)}px`);
    };
    fit();
    window.addEventListener('resize', fit);
    const t = window.setTimeout(fit, 600);
    return () => { window.removeEventListener('resize', fit); window.clearTimeout(t); };
  }, []);

  /* ⌘K / Ctrl+K goes to the filter, as the hint says. */
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); findRef.current?.focus(); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const title = s.searched ? askTitle(s.searched.trade, s.searched.place) : view === 'verify' ? 'Check email addresses' : 'New search';
  const suggested = suggestListName(s.searched?.trade ?? s.trade, s.searched?.place ?? s.place);
  const results = s.results ?? [];
  const target = s.chosen.length ? s.chosen : results;
  const unread = target.filter(p => p.website && !p.email && !s.found[p.website]).map(p => p.website);
  const noAddress = target.filter(p => p.website && !s.emailFor(p) && !s.found[p.website]?.people).map(p => p.website);
  const toDeep = [...new Set(target.map(p => s.emailFor(p)).filter(e => e && s.checks[e]?.level !== 'mailbox' && s.checks[e]?.status !== 'invalid'))];
  const scope = s.chosen.length ? 'ticked' : 'shown';

  const readMore = async () => {
    const sites = unread.slice(0, AUTO_READ);
    s.step('read', { label: `Reading ${sites.length} more websites`, state: 'running', badge: 'Websites' });
    const r = await s.lookupSites(sites);
    s.step('read', { label: `Read ${r.read} more websites for the addresses they publish`, detail: r.error || `${r.emails} address${r.emails === 1 ? '' : 'es'} found`, state: r.error ? 'failed' : 'done', badge: 'Websites', count: r.emails });
    const fresh = Object.values(r.fresh).flatMap(c => c.emails);
    if (fresh.length) await s.verifyList(fresh, false);
  };
  const webSearch = async () => {
    const sites = noAddress.slice(0, 10);
    s.step('web', { label: `Searching the web for addresses ${sites.length} businesses published`, state: 'running', badge: verifier?.providerName ?? 'Hunter' });
    const r = await s.searchWebFor(sites);
    s.step('web', {
      label: `Searched the web for addresses ${r.searched} businesses published`,
      detail: r.error || `${r.people} found, each on a page Hunter saw it on — no guessed addresses`,
      state: r.error && !r.searched ? 'failed' : 'done', badge: verifier?.providerName ?? 'Hunter', count: r.people,
    });
    const fresh = Object.values(r.got).flatMap(c => (c.people ?? []).map(x => x.email));
    if (fresh.length) await s.verifyList(fresh, false);
  };
  const deepVerify = async () => {
    const list = toDeep.slice(0, 60);
    s.step('deep', { label: `Asking the mail server about ${list.length} address${list.length === 1 ? '' : 'es'}`, state: 'running', badge: verifier?.providerName ?? 'Verifier' });
    const r = await s.verifyList(list, true);
    const vs = Object.values(r.verdicts);
    const good = vs.filter(v => v.status === 'valid').length;
    s.step('deep', {
      label: `Verified ${r.ran} mailbox${r.ran === 1 ? '' : 'es'} with the mail server`,
      detail: r.error || `${good} confirmed${vs.filter(v => v.status === 'invalid').length ? `, ${vs.filter(v => v.status === 'invalid').length} would bounce` : ''}${vs.filter(v => v.reason === 'catch_all').length ? `, ${vs.filter(v => v.reason === 'catch_all').length} on catch-all domains` : ''}${r.note ? ` — ${r.note}` : ''}`,
      state: r.error ? 'failed' : 'done', badge: verifier?.providerName ?? 'Verifier', count: good,
    });
  };
  const openSave = () => {
    if (!s.chosen.length) s.pickAll(true);
    setSaving(true);
    window.setTimeout(() => importRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };
  const exportCsv = () => {
    const blob = new Blob([`﻿${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(s.searched ? `${s.searched.trade}-${s.searched.place}` : 'prospects').replace(/[^\w-]+/g, '-').toLowerCase()}.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const working = s.busy || s.enriching || s.verifying || s.finding || s.steps.some(x => x.state === 'running');
  const sources = [
    { id: 'free' as const, label: 'Free directory' },
    { id: 'google' as const, label: 'Google Maps' },
  ];

  return (
    <div className="aip" data-noinvert ref={frame}>
      {/* ── Searches and lists ── */}
      <aside className="aip-side" aria-label="Your searches and lists">
        <div className="aip-side-head">
          <span className="aip-mark" aria-hidden="true"><Sparkles size={14} /></span>
          <h1>AI Prospecting</h1>
          <button type="button" className="aip-icon-btn" aria-label="New search" title="New search"
            onClick={() => { setView('leads'); setDone(null); setText(''); s.setSource(s.source); document.getElementById('aip-ask')?.focus(); }}>
            <Plus size={15} />
          </button>
        </div>
        <label className="aip-find">
          <Search size={14} />
          <input ref={findRef} value={find} onChange={e => setFind(e.target.value)} placeholder="Search your searches" aria-label="Search your searches and lists" />
          <kbd>⌘K</kbd>
        </label>

        <div className="aip-side-scroll">
          {pinned.length > 0 && <>
            <span className="aip-side-label">Pinned</span>
            {pinned.map(h => <HistoryItem key={`${h.source}|${h.trade}|${h.place}`} h={h} s={s} run={() => void go(`${h.trade} in ${h.place}`, h.source)} active={!!s.searched && s.searched.trade === h.trade && s.searched.place === h.place} />)}
          </>}
          <span className="aip-side-label">Recent</span>
          {!recent.length && <span className="aip-side-empty">{q ? 'No search matches.' : 'Your searches appear here.'}</span>}
          {recent.map(h => <HistoryItem key={`${h.source}|${h.trade}|${h.place}`} h={h} s={s} run={() => void go(`${h.trade} in ${h.place}`, h.source)} active={!!s.searched && s.searched.trade === h.trade && s.searched.place === h.place} />)}

          <span className="aip-side-label">Lead lists {lists.length > 0 && <b>{lists.length}</b>}</span>
          {!shownLists.length && (
            <span className="aip-side-empty">{q ? 'No list matches.' : 'None yet. Tick the businesses that fit and save them as a list — it appears here, in Contacts, and as an audience for campaigns and Autopilot.'}</span>
          )}
          {shownLists.map(l => {
            const m = members(l, contacts);
            const withEmail = m.filter(c => c.email).length;
            const verified = m.filter(c => c.customFields?.emailStatus === 'valid').length;
            return (
              <div key={l.id} className="aip-list" data-list={l.id}>
                <span className="aip-list-dot" aria-hidden="true"><ListChecks size={11} /></span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <b>{l.name}</b>
                  <small>{m.length} {m.length === 1 ? 'business' : 'businesses'} · {withEmail} with an email{verified ? ` · ${verified} verified` : ''}</small>
                </span>
                <ListShortcuts list={l} go={navigate} compact />
              </div>
            );
          })}
        </div>

        <div className="aip-side-foot">
          <button type="button" className="aip-tool" data-on={view === 'verify'} onClick={() => setView(v => (v === 'verify' ? 'leads' : 'verify'))}>
            <MailCheck size={14} /> <span>Check email addresses</span>
          </button>
          <span className="aip-side-status">
            {deepReady
              ? <><ShieldCheck size={12} /> {verifier?.providerName} connected · {verifier?.left?.verify ?? 0} mailbox checks left today{verifier?.finds ? ` · ${verifier?.left?.find ?? 0} web searches` : ''}</>
              : <><MailCheck size={12} /> Free checks: format, domain, mail server</>}
          </span>
        </div>
      </aside>

      {/* ── The run ── */}
      <main className="aip-main">
        <header className="aip-top">
          {/* On a phone the side panel is below the run, so the name goes here too. */}
          <span className="aip-top-brand" aria-hidden="true"><span className="aip-mark"><Sparkles size={13} /></span> AI Prospecting ·</span>
          <h2 title={s.asked || undefined}>{title}</h2>
          <span style={{ flex: 1 }} />
          {results.length > 0 && view === 'leads' && <>
            <button type="button" className="aip-btn" onClick={exportCsv}><Download size={13} /> Export</button>
            <button type="button" className="aip-btn" data-accent="true" onClick={openSave}><Bookmark size={13} /> Save as list</button>
          </>}
        </header>

        <div className="aip-thread" ref={thread}>
          {view === 'verify' && <VerifyTool s={s} deepReady={deepReady} deepWhy={deepWhy} />}

          {view === 'leads' && !s.searched && !s.busy && !s.error && (
            <section className="aip-welcome">
              <span className="aip-orb" aria-hidden="true"><Sparkles size={22} /></span>
              <h3>Who do you want to sell to?</h3>
              <p>
                Say it in a sentence. AI Prospecting searches the business directory, reads each business's own website
                for the address it publishes, and checks every address before you send to it.
              </p>
              <div className="aip-examples">
                {EXAMPLES.map(x => <button key={x} type="button" className="aip-chip" onClick={() => void go(x)}><Sparkles size={11} /> {x}</button>)}
              </div>
              <div className="aip-how">
                <div><MapPin size={15} /><b>Find</b><span>Businesses by trade and town — free directory or Google Maps.</span></div>
                <div><Globe size={15} /><b>Enrich</b><span>The address each one publishes on its own site{verifier?.finds ? ', and named people the web shows' : ''}.</span></div>
                <div><ShieldCheck size={15} /><b>Verify</b><span>Format, domain and mail server for free{deepReady ? '; the mailbox itself with your verifier' : ''}.</span></div>
              </div>
              <p className="aip-fine">
                Never LinkedIn or bought data, and never a guessed address — only what a business chose to publish.
              </p>
            </section>
          )}

          {view === 'leads' && (s.searched || s.busy || s.error) && <>
            {s.asked && <div className="aip-bubble">{s.asked}</div>}
            <div className="aip-answer">
              <p className="aip-lead"><Sparkles size={14} /> {s.busy
                ? 'Searching…'
                : `I searched ${s.searched?.source === 'google' ? 'Google Maps' : 'the free directory'}, read each business's own website for the address it publishes, and checked every address I found.`}</p>
              <PlanSteps steps={s.steps} />
              <SearchProblems s={s} />
              {results.length > 0 && (
                <p className="aip-summary">
                  Found {results.length}. {rows.filter(r => r.email).length} with an address so far — the most reachable first.
                </p>
              )}
            </div>

            {results.length > 0 && (
              <section className="aip-card" aria-label="Results">
                <div className="aip-card-head">
                  <span className="aip-card-title"><Sparkles size={14} /> {askTitle(s.searched?.trade ?? '', s.searched?.place ?? '')}
                    <span className="aip-pill" aria-live="polite">{results.length} found{s.picked.size > 0 ? ` · ${s.picked.size} ticked` : ''}</span>
                    {s.cached && <span className="aip-muted">· from an earlier search</span>}
                  </span>
                  <span style={{ flex: 1 }} />
                  <div className="aip-filter" role="group" aria-label="Show">
                    <Filter size={12} />
                    {([['all', 'All'], ['email', 'With email'], ['checked', 'Takes mail'], ['phone', 'With phone'], ['website', 'With website']] as [LeadFilter, string][]).map(([id, label]) => (
                      <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
                    ))}
                  </div>
                </div>
                <LeadTable s={s} rows={rows} />
                <div className="aip-card-foot">
                  <span className="aip-muted">Showing {rows.length} of {results.length}{filter !== 'all' ? ' (filtered)' : ''}</span>
                  <span style={{ flex: 1 }} />
                  <button type="button" className="pp-link" onClick={() => s.pickAll(true)}>Tick all</button>
                  <button type="button" className="pp-link" onClick={() => s.pickAll(false)}>Clear</button>
                  {s.nextPage && (
                    <button type="button" className="aip-chip" onClick={() => void s.loadMore()} disabled={s.more}>
                      {s.more ? <Loader size={12} className="spin" /> : <Search size={12} />} More results
                    </button>
                  )}
                </div>
                {s.moreError && <div style={{ padding: '0 16px 12px' }}><Notice text={s.moreError} /></div>}
                <div style={{ padding: '0 16px 12px' }}><Attribution s={s} /></div>
              </section>
            )}

            {results.length > 0 && (
              <div className="aip-next" aria-label="Next">
                <span>Next{s.chosen.length ? ` (${s.chosen.length} ticked)` : ''}:</span>
                <button type="button" className="aip-chip" disabled={working || !unread.length} onClick={() => void readMore()}
                  title={unread.length ? `Reads the websites of the ${scope} businesses not read yet` : 'Every website here has been read'}>
                  <Mail size={12} /> {unread.length ? `Find emails on ${Math.min(unread.length, AUTO_READ)} more websites` : 'Every website read'}
                </button>
                {verifier?.finds && (
                  <button type="button" className="aip-chip" disabled={working || !noAddress.length || !deepReady} onClick={() => void webSearch()}
                    title="Asks Hunter which addresses at these businesses are published on the web — named people with their role">
                    <Globe size={12} /> Search the web for named people{noAddress.length ? ` (${Math.min(10, noAddress.length)})` : ''}
                  </button>
                )}
                <button type="button" className="aip-chip" disabled={working || !toDeep.length || !deepReady} onClick={() => void deepVerify()}
                  title={deepReady ? 'Asks the mail server whether each mailbox exists' : deepWhy}>
                  <ShieldCheck size={12} /> {deepReady ? `Verify ${Math.min(60, toDeep.length)} mailbox${toDeep.length === 1 ? '' : 'es'}` : 'Verify mailboxes — needs a verifier'}
                </button>
                <button type="button" className="aip-chip" onClick={openSave}><Bookmark size={12} /> Save as list</button>
                <button type="button" className="aip-chip" onClick={exportCsv}><Download size={12} /> Export CSV</button>
              </div>
            )}
            {!deepReady && results.length > 0 && verifier && <p className="aip-fine" style={{ margin: '0 4px' }}>{deepWhy}</p>}

            {done && (
              <section className="aip-card aip-done" role="status">
                <span className="aip-done-line"><CheckCircle2 size={16} /> {outcomeText(done)}</span>
                {done.list
                  ? <ListShortcuts list={done.list} go={navigate} />
                  : <span className="aip-muted">They are in Contacts as prospects. Put them on a list next time to send to them as one group.</span>}
              </section>
            )}

            {results.length > 0 && (saving || s.picked.size > 0) && (
              <section className="aip-card" ref={importRef} aria-label="Save as a list">
                <div className="aip-card-head">
                  <span className="aip-card-title"><Bookmark size={14} /> Save {s.chosen.length || ''} as a list</span>
                  <span style={{ flex: 1 }} />
                  <button type="button" className="aip-icon-btn" aria-label="Close" onClick={() => { setSaving(false); s.pickAll(false); }}><X size={14} /></button>
                </div>
                <div style={{ padding: '0 16px 16px' }}>
                  <ImportPanel s={s} initial="new" suggested={suggested} listsVersion={version}
                    onDone={r => {
                      if ('error' in r) return;
                      setDone(r); setSaving(false);
                      setVersion(v => v + 1);
                    }} />
                </div>
              </section>
            )}
          </>}
        </div>

        {/* ── The composer ── */}
        <form className="aip-composer" onSubmit={e => { e.preventDefault(); void go(); }}>
          <div className="aip-composer-strip">
            <span className="aip-strip-label"><Sparkles size={12} /> Search</span>
            <div role="group" aria-label="Which map to search" className="aip-sources">
              {sources.map(t => (
                <button key={t.id} type="button" aria-pressed={s.source === t.id} onClick={() => s.setSource(t.id)}>
                  <MapPin size={11} /> {t.label}
                </button>
              ))}
            </div>
            <span style={{ flex: 1 }} />
            <span className="aip-strip-tools" aria-label="Also used">
              <span title="Each business's own website is read for the address it publishes"><Globe size={11} /> Websites</span>
              {verifier?.finds && <span title="Addresses Hunter saw published on the web"><Users size={11} /> Hunter</span>}
              <span title={deepReady ? `Mailboxes checked with ${verifier?.providerName}` : 'Format, domain and mail server checked for free'}><ShieldCheck size={11} /> {deepReady ? 'Mailbox checks' : 'Free checks'}</span>
            </span>
          </div>
          <div className="aip-composer-box">
            <textarea id="aip-ask" rows={2} value={text} onChange={e => setText(e.target.value)} aria-label="Who to look for"
              placeholder="Find dentists in Leeds with a website…"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void go(); } }} />
            <div className="aip-composer-row">
              <span className="aip-understood" aria-label="Or fill in the two boxes">
                <input value={s.trade} onChange={e => s.setTrade(e.target.value)} data-field="prospects.trade" aria-label="What kind of business" placeholder="Kind of business" />
                <span>in</span>
                <input value={s.place} onChange={e => s.setPlace(e.target.value)} data-field="prospects.place" aria-label="Where" placeholder="Town or city" />
              </span>
              <span style={{ flex: 1 }} />
              <button type="submit" className="aip-send" aria-label="Search" disabled={s.busy}>
                {s.busy ? <Loader size={16} className="spin" /> : <ArrowUp size={17} />}
              </button>
            </div>
          </div>
          {askError && <div className="aip-ask-error" role="alert">{askError}</div>}
          <p className="aip-composer-fine">Results come from public directories and the businesses' own websites. Check them before you send.</p>
        </form>
      </main>
    </div>
  );
}

function HistoryItem({ h, s, run, active }: { h: SavedSearch; s: ReturnType<typeof useProspectSearch>; run: () => void; active: boolean }) {
  return (
    <div className="aip-hist" data-active={active || undefined}>
      <button type="button" className="aip-hist-main" onClick={run} aria-label={`Search ${h.trade} in ${h.place} again`}>
        <b>{askTitle(h.trade, h.place)}</b>
        <small>{h.count} lead{h.count === 1 ? '' : 's'} · {h.source === 'google' ? 'Google Maps' : 'Free directory'} · {ago(h.at)}</small>
      </button>
      <button type="button" className="aip-hist-icon" onClick={() => s.saveSearch(h)} data-on={h.saved || undefined}
        aria-label={h.saved ? `Unpin ${h.trade} in ${h.place}` : `Pin ${h.trade} in ${h.place}`} title={h.saved ? 'Unpin' : 'Pin'}>
        <Bookmark size={12} />
      </button>
      <button type="button" className="aip-hist-icon" onClick={() => s.forget(h)} aria-label={`Forget ${h.trade} in ${h.place}`} title="Forget">
        <X size={12} />
      </button>
    </div>
  );
}
