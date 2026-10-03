/**
 * AI Prospecting — say who you want to sell to in a sentence, and get a list
 * of businesses with addresses that have been checked.
 *
 * ── What "AI" means here, exactly ──
 *
 * The sentence is understood (`parseAsk`) and run as a plan whose every step
 * is a real call, shown as it runs and reporting what it actually found:
 * search the directory, read each business's own website for the address it
 * publishes, and check every address — the address checks always, the mail server
 * itself when the owner has connected a verifier. Nothing in the thread is a
 * canned message; a step that found nothing says so.
 *
 * ── Where leads come from, and where they do not ──
 *
 * Business directories (OpenStreetMap, through Geoapify), verified business
 * directories (the company register), Google Maps on the owner's key, each
 * business's own website, and — with the owner's Hunter
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
  ArrowUp, BadgeCheck, Bot, Bookmark, CheckCircle2, Copy, Download, Eye, EyeOff, Filter, GitBranch, Globe, ListChecks, Loader,
  Mail, MailCheck, MapPin, Plus, RotateCcw, Search, Send, ShieldCheck, Sparkles, Users, X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useProspectSearch, outcomeText, AUTO_READ, type ImportOutcome } from './useProspectSearch';
import { Attribution, ImportPanel, Notice, SearchProblems } from './ProspectParts';
import { LeadTable, PlanSteps, ProgressBar, SkeletonRows, Thinking, VerifyTool, useLeadRows, type LeadFilter } from './AiParts';
import AddTo, { type AddMode } from './AddTo';
import { SOURCE_NAME, type ProspectSource } from '../../services/prospects';
import { suggestListName, type SavedSearch } from '../../services/prospectImport';
import { listKindOf, loadLists, type ContactList } from '../../services/contactLists';
import { addressesOf, ago, askTitle, toCsv } from '../../services/aiProspecting';
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
  const [showAll, setShowAll] = useState(false);
  const [addMode, setAddMode] = useState<AddMode | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const thread = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLDivElement>(null);
  const findRef = useRef<HTMLInputElement>(null);

  const rows = useLeadRows(s, filter);
  const verifier = s.google?.verifier;
  const deepReady = !!verifier?.available;
  const deepWhy = !verifier ? '' : verifier.code === 'trial_ended'
    ? 'Mailbox checks stopped when the trial ended; the address checks still run.'
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

  /** Start a new search: an empty page, the composer ready. */
  const startNew = () => {
    s.reset(); setView('leads'); setDone(null); setSaving(false); setAddMode(null); setSaid(null);
    setText(''); setAskError(''); setFilter('all'); setShowAll(false);
    window.setTimeout(() => document.getElementById('aip-ask')?.focus(), 30);
  };

  const go = async (sentence?: string, from?: SavedSearch['source']) => {
    setAskError(''); setDone(null); setSaving(false); setAddMode(null); setSaid(null); setView('leads'); setFilter('all');
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

  /* Every website not read yet, across the whole result — the bulk button. */
  const allUnread = results.filter(p => p.website && !p.email && !s.found[p.website]).map(p => p.website);
  const readAll = async () => {
    const sites = allUnread;
    s.step('read', { label: `Reading all ${sites.length} remaining websites for the addresses they publish`, state: 'running', badge: 'Websites' });
    const r = await s.lookupSites(sites, 'Reading websites');
    s.step('read', { label: `Read ${r.read} more websites for the addresses they publish`, detail: r.error || `${r.emails} address${r.emails === 1 ? '' : 'es'} found`, state: r.error ? 'failed' : 'done', badge: 'Websites', count: r.emails });
    const fresh = Object.values(r.fresh).flatMap(c => c.emails);
    if (fresh.length) await s.verifyList(fresh, false);
    setShowAll(true);
  };
  /* Every address on the shown rows, one per line — the ones known to bounce left out. */
  const allAddresses = [...new Set(rows.flatMap(r => addressesOf(r.p, s.found)).filter(e => s.checks[e]?.status !== 'invalid'))];
  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(allAddresses.join('\n'));
      setSaid({ ok: true, text: `Copied ${allAddresses.length} address${allAddresses.length === 1 ? '' : 'es'}.` });
    } catch {
      setSaid({ ok: false, text: 'The browser would not let the page copy — use Export instead.' });
    }
  };
  const tickWhere = (f: (r: (typeof rows)[number]) => boolean) => {
    s.pickAll(false);
    for (const r of rows) if (f(r)) s.toggle(r.p.ref);
  };

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
    setAddMode(null);
    setSaving(true);
    window.setTimeout(() => importRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };
  const openAdd = (m: AddMode) => {
    setSaving(false); setAddMode(m); setDone(null);
    window.setTimeout(() => importRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };
  const exportCsv = (only?: Set<string>) => {
    const blob = new Blob([`﻿${toCsv(only ? rows.filter(r => only.has(r.p.ref)) : rows)}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(s.searched ? `${s.searched.trade}-${s.searched.place}` : 'prospects').replace(/[^\w-]+/g, '-').toLowerCase()}.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const working = s.busy || s.enriching || s.verifying || s.finding || s.steps.some(x => x.state === 'running');
  /* Three sources, named for what they are. Each says why when it is not on. */
  const sources: { id: ProspectSource; label: string; tip: string; Icon: typeof MapPin }[] = [
    { id: 'free', label: SOURCE_NAME.free, tip: 'OpenStreetMap\'s businesses, with phone and website — the results are yours to keep', Icon: MapPin },
    { id: 'register', label: SOURCE_NAME.register, tip: s.google?.register.available ? 'The official company register (UK Companies House): active companies, with their directors' : (s.google?.register.error ?? ''), Icon: BadgeCheck },
    { id: 'google', label: SOURCE_NAME.google, tip: s.google?.available ? 'Google Maps — the widest coverage, with ratings' : (s.google?.error ?? ''), Icon: Globe },
  ];
  const running = s.steps.find(x => x.state === 'running');
  const thinking = s.busy ? `Searching ${s.source === 'google' ? 'Google Maps' : s.source === 'register' ? 'the company register' : 'business directories'} for ${s.trade || 'businesses'} in ${s.place || 'that place'}` : running?.label ?? '';

  return (
    <div className="aip" data-noinvert ref={frame}>
      {/* ── Searches and lists ── */}
      <aside className="aip-side" aria-label="Your searches and lists">
        <div className="aip-side-head">
          <span className="aip-mark" aria-hidden="true"><Sparkles size={14} /></span>
          <h1>AI Prospecting</h1>
          <button type="button" className="aip-icon-btn" aria-label="Start a new search" title="Start a new search" onClick={startNew}>
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
              : <><MailCheck size={12} /> Address checks: format, domain, mail server</>}
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
          {(s.searched || s.busy || view === 'verify' || s.error) && (
            <button type="button" className="aip-btn aip-new" onClick={startNew} disabled={s.busy}><RotateCcw size={13} /> Start a new search</button>
          )}
          {results.length > 0 && view === 'leads' && <>
            <button type="button" className="aip-btn" onClick={() => exportCsv()}><Download size={13} /> Export</button>
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
                <div><MapPin size={15} /><b>Find</b><span>Businesses by trade and town — business directories, verified business directories or Google Maps.</span></div>
                <div><Globe size={15} /><b>Enrich</b><span>The address each one publishes on its own site{verifier?.finds ? ', and named people the web shows' : ''}.</span></div>
                <div><ShieldCheck size={15} /><b>Verify</b><span>Format, domain and mail server on every address{deepReady ? ', and the mailbox itself' : ''} — tagged Verified when it is.</span></div>
              </div>
              <p className="aip-fine">
                Never LinkedIn or bought data, and never a guessed address — only what a business chose to publish.
              </p>
            </section>
          )}

          {view === 'leads' && (s.searched || s.busy || s.error) && <>
            {s.asked && <div className="aip-bubble">{s.asked}</div>}
            <div className="aip-answer">
              {!s.busy && s.searched && (
                <p className="aip-lead"><Sparkles size={14} /> {s.searched.source === 'register'
                  ? 'I searched the official company register for active companies and named their directors.'
                  : `I searched ${s.searched.source === 'google' ? 'Google Maps' : 'business directories'}, read each business's own website for the address it publishes, and checked every address I found.`}</p>
              )}
              <PlanSteps steps={s.steps} />
              {thinking && <Thinking text={`${thinking}…`} />}
              {s.progress && <ProgressBar {...s.progress} />}
              <SearchProblems s={s} />
              {results.length > 0 && (
                <p className="aip-summary">
                  Found {results.length}. {rows.filter(r => r.email).length} with an address so far — the most reachable first.
                </p>
              )}
            </div>

            {s.busy && <SkeletonRows />}

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
                <div className="aip-bulk" aria-label="Every email address">
                  <button type="button" className="aip-chip" data-accent="true" disabled={working || !allUnread.length} onClick={() => void readAll()}
                    title={allUnread.length ? 'Reads every website not read yet, eight at a time, and checks each address found' : 'Every website here has been read'}>
                    <Mail size={12} /> {allUnread.length ? `Find all emails (${allUnread.length} websites)` : 'All websites read'}
                  </button>
                  <button type="button" className="aip-chip" aria-pressed={showAll} onClick={() => setShowAll(v => !v)}>
                    {showAll ? <EyeOff size={12} /> : <Eye size={12} />} {showAll ? 'Best address only' : 'Show all email addresses'}
                  </button>
                  <button type="button" className="aip-chip" disabled={!allAddresses.length} onClick={() => void copyAll()}>
                    <Copy size={12} /> Copy {allAddresses.length} address{allAddresses.length === 1 ? '' : 'es'}
                  </button>
                  <span className="aip-muted">{rows.filter(r => r.v?.status === 'valid').length} verified · {rows.filter(r => r.email).length} with an address</span>
                </div>
                <LeadTable s={s} rows={rows} showAll={showAll} />
                <div className="aip-card-foot">
                  <span className="aip-muted">Showing {rows.length} of {results.length}{filter !== 'all' ? ' (filtered)' : ''}</span>
                  <span style={{ flex: 1 }} />
                  <span className="aip-muted">Tick:</span>
                  <button type="button" className="pp-link" onClick={() => s.pickAll(true)}>Tick all</button>
                  <button type="button" className="pp-link" onClick={() => tickWhere(r => !!r.email && !r.blocked)}>With email</button>
                  <button type="button" className="pp-link" onClick={() => tickWhere(r => r.v?.status === 'valid')}>Verified</button>
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
                <button type="button" className="aip-chip" onClick={() => exportCsv()}><Download size={12} /> Export CSV</button>
              </div>
            )}
            {said && <div role="status" className="aip-note" data-ok={said.ok}>{said.text}</div>}
            {!deepReady && results.length > 0 && verifier && <p className="aip-fine" style={{ margin: '0 4px' }}>{deepWhy}</p>}

            {done && (
              <section className="aip-card aip-done" role="status">
                <span className="aip-done-line"><CheckCircle2 size={16} /> {outcomeText(done)}</span>
                {done.list
                  ? <ListShortcuts list={done.list} go={navigate} />
                  : <span className="aip-muted">They are in Contacts as prospects. Put them on a list next time to send to them as one group.</span>}
              </section>
            )}

            {results.length > 0 && addMode && (
              <div ref={importRef}>
                <AddTo s={s} mode={addMode} suggested={suggested} go={navigate} onClose={() => setAddMode(null)}
                  onDone={m => { setAddMode(null); setSaid({ ok: true, text: m }); setVersion(v => v + 1); }} />
              </div>
            )}

            {results.length > 0 && !addMode && (saving || s.picked.size > 0) && (
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

        {/* ── What to do with the ticked ones — on screen whenever any are ticked ── */}
        {view === 'leads' && s.picked.size > 0 && (
          <div className="aip-actionbar" role="toolbar" aria-label="With the ticked businesses">
            <b>{s.picked.size} ticked</b>
            <button type="button" className="aip-chip" onClick={openSave}><Bookmark size={12} /> Save to a list</button>
            <button type="button" className="aip-chip" onClick={() => openAdd('workflow')}><GitBranch size={12} /> Add to a workflow</button>
            <button type="button" className="aip-chip" onClick={() => openAdd('project')}><Bot size={12} /> Add to an AI project</button>
            <button type="button" className="aip-chip" onClick={() => openAdd('campaign')}><Send size={12} /> Add to an email campaign</button>
            <button type="button" className="aip-chip" onClick={() => exportCsv(s.picked)}><Download size={12} /> Export ticked</button>
            <button type="button" className="aip-icon-btn" aria-label="Untick all" title="Untick all" onClick={() => { s.pickAll(false); setAddMode(null); }}><X size={13} /></button>
          </div>
        )}

        {/* ── The composer ── */}
        <form className="aip-composer" data-working={working || undefined} onSubmit={e => { e.preventDefault(); void go(); }}>
          <div className="aip-composer-strip">
            <span className="aip-strip-label"><Sparkles size={12} /> Search</span>
            <div role="group" aria-label="Where to search" className="aip-sources">
              {sources.map(t => (
                <button key={t.id} type="button" aria-pressed={s.source === t.id} onClick={() => s.setSource(t.id)} title={t.tip}
                  data-off={(t.id === 'google' && s.google && !s.google.available) || (t.id === 'register' && s.google && !s.google.register.available) || undefined}>
                  <t.Icon size={11} /> {t.label}
                </button>
              ))}
            </div>
            <span style={{ flex: 1 }} />
            <span className="aip-strip-tools" aria-label="Also used">
              <span title="Each business's own website is read for the address it publishes"><Globe size={11} /> Websites</span>
              {verifier?.finds && <span title="Addresses Hunter saw published on the web"><Users size={11} /> Hunter</span>}
              <span title={deepReady ? `Mailboxes checked with ${verifier?.providerName}` : 'Format, domain and mail server checked on every address'}><ShieldCheck size={11} /> {deepReady ? 'Mailbox checks' : 'Address checks'}</span>
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
        <small>{h.count} lead{h.count === 1 ? '' : 's'} · {SOURCE_NAME[h.source] ?? h.source} · {ago(h.at)}</small>
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
