/**
 * AI Prospecting — say who you want to sell to in a sentence, and get a list
 * of businesses, found live, with addresses that have been checked.
 *
 * ── Two screens ──
 *
 * **New search** (AiStart.tsx): who do you want to sell to, the promise that
 * every lead is searched live, examples, the three steps, the composer. The
 * side panel shows recent searches and lead lists.
 *
 * **Results** (AiResults.tsx, AiParts.tsx): as soon as a search starts — the
 * assistant, the source tabs and search bar, the progress card (a ring, the
 * four stages, the sources it is using), five counted figures, the table, and
 * a rail with where they are, what was scanned, what it means and what kinds of
 * business came back. The side panel becomes a drawer, because three columns
 * do not fit beside a table on a laptop.
 *
 * ── What "AI" and "live" mean here, exactly ──
 *
 * The sentence is understood (`parseAsk`) and run as a plan whose every step
 * is a real call, shown as it runs and reporting what it actually found.
 * `live` makes every one of those calls skip the server's caches, so the time
 * stamped on each row is when it was really found. Nothing in either screen is
 * a canned message or an invented figure.
 *
 * ── Where leads come from, and where they do not ──
 *
 * Business directories (OpenStreetMap, through Geoapify), verified business
 * directories (the company register), Google Maps on the owner's key, each
 * business's own website, and — with the owner's Hunter key — addresses Hunter
 * saw published on the web. Not LinkedIn, not Apollo: their terms forbid
 * exactly this. See services/aiProspecting.ts.
 *
 * It carries `data-noinvert` and draws its own light and dark
 * (aiProspecting.css), because the app's dark mode is an inversion filter and
 * an inverted orange gradient is a blue one.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, BadgeCheck, Bookmark, Bot, CalendarClock, CheckCircle2, Columns3, Copy, Download, Eye, EyeOff, Filter, Folder, GitBranch,
  Globe, Lightbulb, Loader, Mail, MailCheck, MapPin, MoreHorizontal, PanelLeft, Pin, PlayCircle, Plus, RotateCcw, Search, Send,
  ShieldCheck, Sparkles, Target, Users, X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useProspectSearch, outcomeText, AUTO_READ, type ImportOutcome } from './useProspectSearch';
import { Attribution, ImportPanel, Notice, SearchProblems } from './ProspectParts';
import { COLUMNS, LeadTable, PlanSteps, ProgressBar, SkeletonRows, Thinking, VerifyTool, useLeadRows, type ColumnId, type LeadFilter } from './AiParts';
import AddTo, { type AddMode } from './AddTo';
import DailySearch from './DailySearch';
import { HowItWorks, Ideas, StartScreen, tradeIcon, tradeTone } from './AiStart';
import { InsightsRail, KpiRow, ProgressCard, Robot, clock, type Insight } from './AiResults';
import MicButton from './MicButton';
import { SOURCE_NAME, type ProspectSource } from '../../services/prospects';
import { suggestListName, type SavedSearch } from '../../services/prospectImport';
import { listKindOf, loadLists, type ContactList } from '../../services/contactLists';
import { addressesOf, ago, askTitle, parseAsk, relatedTrades, toCsv } from '../../services/aiProspecting';
import type { Contact } from '../../types';
import './prospecting.css';
import './aiProspecting.css';

const members = (l: ContactList, contacts: Contact[]) => {
  const ids = new Set(l.memberIds);
  return contacts.filter(c => ids.has(c.id));
};

/** Where a list goes next — the same three everywhere a list is offered. */
function ListShortcuts({ list, go }: { list: ContactList; go: (to: string) => void }) {
  const id = encodeURIComponent(list.id);
  return (
    <div className="aip-shortcuts">
      <button type="button" className="aip-chip" onClick={() => go(`/marketing?new=campaign&list=${id}`)}><Send size={12} /> Send a campaign to this list</button>
      <button type="button" className="aip-chip" onClick={() => go(`/autopilot?new=1&list=${id}`)}><Bot size={12} /> Use this list in a new Autopilot project</button>
      <button type="button" className="aip-chip" onClick={() => go(`/contacts?list=${id}`)}><Users size={12} /> Open in Contacts</button>
    </div>
  );
}

/** A "…" menu. Closes on a choice, on leaving it, and on Escape. */
function Kebab({ label, items }: { label: string; items: { label: string; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="aip-menu-wrap" onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
      <button type="button" className="aip-kebab" aria-label={label} aria-expanded={open} onClick={() => setOpen(o => !o)}><MoreHorizontal size={15} /></button>
      {open && (
        <span className="aip-menu" role="menu" onMouseLeave={() => setOpen(false)}>
          {items.map(i => <button key={i.label} type="button" role="menuitem" onClick={() => { setOpen(false); i.onClick(); }}>{i.label}</button>)}
        </span>
      )}
    </span>
  );
}


export default function AiProspecting() {
  const { contacts } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const s = useProspectSearch({ live: true });
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
  const [drawer, setDrawer] = useState(false);
  const [how, setHow] = useState(false);
  const [ideas, setIdeas] = useState(false);
  const [moreHistory, setMoreHistory] = useState(false);
  const [moreLists, setMoreLists] = useState(false);
  const [cols, setCols] = useState<Set<ColumnId>>(() => new Set(COLUMNS.map(c => c.id)));
  const [colsOpen, setColsOpen] = useState(false);
  const [daily, setDaily] = useState(false);
  const [dailyProject, setDailyProject] = useState('');
  const importRef = useRef<HTMLDivElement>(null);
  const findRef = useRef<HTMLInputElement>(null);

  const rows = useLeadRows(s, filter);
  const verifier = s.google?.verifier;
  const deepReady = !!verifier?.available;
  const deepWhy = !verifier ? '' : verifier.code === 'trial_ended'
    ? 'Mailbox checks stopped when the trial ended; the address checks still run.'
    : 'Mailbox checks are switched off until the owner connects an email verifier (Settings → Platform services).';

  const screen: 'start' | 'results' | 'verify' = view === 'verify' ? 'verify' : (s.searched || s.busy || s.error) ? 'results' : 'start';

  const lists = useMemo(() => loadLists()
    .filter(l => l.type === 'static' && (l.origin === 'prospecting' || listKindOf(l, members(l, contacts)) === 'cold'))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [contacts, version]);

  const q = find.trim().toLowerCase();
  const hits = (h: SavedSearch) => !q || `${h.trade} ${h.place}`.toLowerCase().includes(q);
  const history = [...s.history.filter(h => h.saved && hits(h)), ...s.history.filter(h => !h.saved && hits(h))];
  const shownHistory = moreHistory ? history : history.slice(0, 5);
  const shownLists = lists.filter(l => !q || l.name.toLowerCase().includes(q));
  const listsToShow = moreLists ? shownLists : shownLists.slice(0, 4);

  /** Start a new search: back to the first screen, nothing typed. */
  const startNew = () => {
    s.reset(); setView('leads'); setDone(null); setSaving(false); setAddMode(null); setSaid(null); setDrawer(false); setDaily(false); setDailyProject('');
    setText(''); setAskError(''); setFilter('all'); setShowAll(false);
    window.setTimeout(() => document.getElementById('aip-ask')?.focus(), 30);
  };

  const go = async (sentence?: string, from?: SavedSearch['source']) => {
    setAskError(''); setDone(null); setSaving(false); setAddMode(null); setSaid(null); setView('leads'); setFilter('all'); setDrawer(false);
    const typed = (sentence ?? text).trim();
    /* The results bar has only the two boxes; a whole sentence typed into the
       first ("dentists in Leeds with a website") is taken as a sentence. */
    const boxSentence = parseAsk(s.trade) ? s.trade.trim() : '';
    const line = typed || boxSentence || (s.trade.trim() && s.place.trim() ? `${s.trade.trim()} in ${s.place.trim()}` : '');
    if (!line) { setAskError('Say who to look for — "dentists in Leeds", "cafés near Bristol".'); return; }
    if (typed) setText('');
    const r = await s.ask(line, from);
    if (r.error) setAskError(r.error);
    /* "…with an email" narrows what is shown; the search itself is the same. */
    if (r.want) setFilter(r.want.email ? 'email' : r.want.phone ? 'phone' : r.want.website ? 'website' : 'all');
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
     trial or staging bar that may or may not be there. */
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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (screen === 'results') setDrawer(true);
        window.setTimeout(() => findRef.current?.focus(), 20);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [screen]);

  const title = screen === 'verify' ? 'Check email addresses' : s.searched ? askTitle(s.searched.trade, s.searched.place) : s.busy ? 'Searching…' : 'New search';
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
  const scrollTo = () => window.setTimeout(() => importRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  const openSave = () => {
    if (!s.chosen.length) s.pickAll(true);
    setAddMode(null); setSaving(true); scrollTo();
  };
  const openAdd = (m: AddMode) => { setSaving(false); setAddMode(m); setDone(null); scrollTo(); };
  /* A row's own menu: that one business, and where it goes. */
  const onRow = (ref: string, what: 'list' | 'workflow' | 'project' | 'campaign') => {
    s.pickAll(false); s.toggle(ref);
    if (what === 'list') { setAddMode(null); setSaving(true); scrollTo(); } else openAdd(what);
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
  const sources: { id: ProspectSource; label: string; tip: string; Icon: typeof MapPin; off: boolean }[] = [
    { id: 'free', label: SOURCE_NAME.free, tip: 'OpenStreetMap\'s businesses, with phone and website — searched live, yours to keep', Icon: MapPin, off: false },
    { id: 'register', label: SOURCE_NAME.register, tip: s.google?.register.available ? 'The official company register (UK Companies House): active companies, with their directors' : (s.google?.register.error ?? ''), Icon: BadgeCheck, off: !!s.google && !s.google.register.available },
    { id: 'google', label: SOURCE_NAME.google, tip: s.google?.available ? 'Google Maps — the widest coverage, with ratings' : (s.google?.error ?? ''), Icon: Globe, off: !!s.google && !s.google.available },
  ];
  const running = s.steps.find(x => x.state === 'running');
  const thinking = s.busy ? `Searching ${s.source === 'google' ? 'Google Maps' : s.source === 'register' ? 'the company register' : 'business directories'} for ${s.trade || 'businesses'} in ${s.place || 'that place'}` : running?.label ?? '';

  /* ── What the rail says — every line counted from what is on screen ── */
  const answered = s.answered || s.searched?.source || s.source;
  const read = Object.values(s.found).filter(c => c.checkedAt);
  const up = read.filter(c => c.live).length;
  const checked = rows.filter(r => r.v).length;
  const takes = rows.filter(r => r.v?.status === 'valid' || r.v?.status === 'domain_ok').length;
  const verifiedN = rows.filter(r => r.v?.status === 'valid').length;
  const high = rows.filter(r => r.score >= 75);
  const known = rows.filter(r => r.known).length;
  const blocked = rows.filter(r => r.blocked).length;
  const withSite = results.filter(p => p.website).length;
  const scanned: { name: string; detail: string; state: 'done' | 'running' | 'waiting' | 'off' }[] = [
    { name: answered === 'osm' ? `${SOURCE_NAME.free} (OpenStreetMap)` : SOURCE_NAME[answered as ProspectSource] ?? 'Directory', detail: s.busy ? 'Searching…' : `${results.length} found`, state: s.busy ? 'running' : 'done' },
    ...(answered === 'register' ? [{ name: 'Directors (register)', detail: `${results.filter(p => p.officers?.length).length} named`, state: 'done' as const }] : []),
    { name: 'Official websites', detail: s.reading.size ? `reading ${s.reading.size}…` : read.length ? `${read.length} read · ${up} up` : withSite ? 'Waiting' : 'None to read', state: s.reading.size ? 'running' : read.length ? 'done' : 'waiting' },
    { name: 'Address checks', detail: s.checking.size ? 'checking…' : checked ? `${checked} checked · ${takes} take mail` : 'Waiting', state: s.checking.size ? 'running' : checked ? 'done' : 'waiting' },
    ...(s.steps.some(x => x.id === 'web') ? [{ name: 'Web search (Hunter)', detail: `${s.steps.find(x => x.id === 'web')?.count ?? 0} found`, state: s.finding ? 'running' as const : 'done' as const }] : []),
    { name: deepReady ? `Mailboxes (${verifier?.providerName})` : 'Mailbox verification', detail: deepReady ? (verifiedN ? `${verifiedN} verified` : 'Not run yet') : 'Not connected', state: deepReady ? (verifiedN ? 'done' : 'waiting') : 'off' },
  ];
  const insights: Insight[] = [
    ...(checked ? [{ Icon: ShieldCheck, title: `${takes} address${takes === 1 ? '' : 'es'} take mail`, sub: `${Math.round((takes / checked) * 100)}% of ${checked} checked${verifiedN ? ` · ${verifiedN} mailboxes verified` : ''}`, act: () => setFilter('checked') }] : []),
    ...(high.length ? [{ Icon: Target, title: `${high.length} high-confidence lead${high.length === 1 ? '' : 's'}`, sub: 'Score 75+: reachable by email, phone and website — tick them', act: () => tickWhere(r => r.score >= 75) }] : []),
    ...(results.length ? [{ Icon: Globe, title: `${Math.round((withSite / results.length) * 100)}% have a website`, sub: allUnread.length ? `${allUnread.length} not read yet — find their emails` : 'Every one read for its address', act: allUnread.length && !working ? () => void readAll() : undefined }] : []),
    ...(known ? [{ Icon: Users, title: `${known} already in your Contacts`, sub: 'Saving puts them on the list, never twice' }] : []),
    ...(blocked ? [{ Icon: AlertTriangle, title: `${blocked} on your do-not-email list`, sub: 'Left out of anything that sends' }] : []),
    ...(!deepReady && checked ? [{ Icon: MailCheck, title: 'Mailboxes not verified yet', sub: deepWhy }] : []),
  ];
  const sourceChips = [
    SOURCE_NAME[(s.searched?.source ?? s.source) as ProspectSource] ?? 'Directory',
    ...(answered === 'register' ? ['Directors'] : ['Official websites']),
    'Address validation',
    ...(deepReady ? [`${verifier?.providerName} mailbox checks`] : []),
  ];
  /* Other kinds of business in the same place: the categories that came back, then neighbours of the trade. */
  const trade = (s.searched?.trade ?? '').toLowerCase();
  const related = [...new Set([
    ...[...new Set(results.map(p => p.category.toLowerCase()).filter(c => c && !trade.includes(c.replace(/s$/, ''))))].slice(0, 3),
    ...relatedTrades(trade),
  ])].slice(0, 5);
  const TradeIcon = tradeIcon(trade);

  const sideDrawn = screen === 'start' || drawer;

  return (
    <div className="aip" data-noinvert ref={frame} data-screen={screen} data-drawer={drawer || undefined}>
      {/* ── Searches and lists ── */}
      <aside className="aip-side" aria-label="Your searches and lists" hidden={!sideDrawn}>
        <div className="aip-side-head">
          <span className="aip-mark" aria-hidden="true"><Sparkles size={15} /></span>
          <h1>AI Prospecting</h1>
          <button type="button" className="aip-icon-btn" aria-label="Start a new search" title="Start a new search" onClick={startNew}><Plus size={16} /></button>
          {screen !== 'start' && <button type="button" className="aip-icon-btn" aria-label="Close the panel" onClick={() => setDrawer(false)}><X size={15} /></button>}
        </div>
        <label className="aip-find">
          <Search size={14} />
          <input ref={findRef} value={find} onChange={e => setFind(e.target.value)} placeholder="Search your searches…" aria-label="Search your searches and lists" />
          <kbd>⌘K</kbd>
        </label>

        <div className="aip-side-scroll">
          <div className="aip-side-row">
            <span className="aip-side-label">Recent searches</span>
            {history.length > 5 && <button type="button" className="aip-see" onClick={() => setMoreHistory(v => !v)}>{moreHistory ? 'Fewer' : 'See all'}</button>}
          </div>
          {!history.length && <span className="aip-side-empty">{q ? 'No search matches.' : 'Your searches appear here.'}</span>}
          {shownHistory.map(h => {
            const Icon = tradeIcon(h.trade);
            const active = !!s.searched && s.searched.trade === h.trade && s.searched.place === h.place;
            return (
              <div key={`${h.source}|${h.trade}|${h.place}`} className="aip-hist" data-active={active || undefined}>
                <span className="aip-hist-tile" data-tone={tradeTone(h.trade)}><Icon size={15} /></span>
                <button type="button" className="aip-hist-main" onClick={() => void go(`${h.trade} in ${h.place}`, h.source)} aria-label={`Search ${h.trade} in ${h.place} again`}>
                  <b>{h.saved && <Pin size={10} className="aip-pinned" />}{askTitle(h.trade, h.place)}</b>
                  <small>{h.count} lead{h.count === 1 ? '' : 's'} · {SOURCE_NAME[h.source] ?? h.source}</small>
                </button>
                <span className="aip-hist-age">{ago(h.at)}</span>
                <Kebab label={`More for ${h.trade} in ${h.place}`} items={[
                  { label: 'Search again, live', onClick: () => void go(`${h.trade} in ${h.place}`, h.source) },
                  { label: h.saved ? 'Unpin' : 'Pin to the top', onClick: () => s.saveSearch(h) },
                  { label: 'Forget this search', onClick: () => s.forget(h) },
                ]} />
              </div>
            );
          })}

          <div className="aip-side-row">
            <span className="aip-side-label">My lead lists</span>
            {shownLists.length > 4 && <button type="button" className="aip-see" onClick={() => setMoreLists(v => !v)}>{moreLists ? 'Fewer' : 'See all'}</button>}
          </div>
          {!shownLists.length && (
            <span className="aip-side-empty">{q ? 'No list matches.' : 'None yet. Tick the businesses that fit and save them as a list — it appears here, in Contacts, and as an audience for campaigns and Autopilot.'}</span>
          )}
          {listsToShow.map(l => {
            const m = members(l, contacts);
            const withEmail = m.filter(c => c.email).length;
            const verified = m.filter(c => c.customFields?.emailStatus === 'valid').length;
            const id = encodeURIComponent(l.id);
            return (
              <div key={l.id} className="aip-list" data-list={l.id}>
                <span className="aip-list-icon" aria-hidden="true"><Folder size={15} /></span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <b>{l.name}</b>
                  <small>{m.length} {m.length === 1 ? 'business' : 'businesses'} · {withEmail} with an email{verified ? ` · ${verified} verified` : ''}</small>
                </span>
                <Kebab label={`More for ${l.name}`} items={[
                  { label: 'Send a campaign to this list', onClick: () => navigate(`/marketing?new=campaign&list=${id}`) },
                  { label: 'Use this list in a new Autopilot project', onClick: () => navigate(`/autopilot?new=1&list=${id}`) },
                  { label: 'Open in Contacts', onClick: () => navigate(`/contacts?list=${id}`) },
                ]} />
              </div>
            );
          })}
        </div>

        <div className="aip-side-foot">
          <button type="button" className="aip-tool" data-on={view === 'verify'} onClick={() => { setView(v => (v === 'verify' ? 'leads' : 'verify')); setDrawer(false); }}>
            <MailCheck size={14} /> <span>Check email addresses</span>
          </button>
          <button type="button" className="aip-ideas-card" onClick={() => setIdeas(true)}>
            <span className="aip-ideas-icon"><Lightbulb size={17} /></span>
            <span><b>Need ideas?</b><small>Ready-made searches for what you sell.</small></span>
          </button>
          <span className="aip-side-status">
            {deepReady
              ? <><ShieldCheck size={12} /> {verifier?.providerName} connected · {verifier?.left?.verify ?? 0} mailbox checks left today{verifier?.finds ? ` · ${verifier?.left?.find ?? 0} web searches` : ''}</>
              : <><MailCheck size={12} /> Address checks: format, domain, mail server</>}
          </span>
        </div>
      </aside>
      {drawer && screen !== 'start' && <button type="button" className="aip-scrim" aria-label="Close the panel" onClick={() => setDrawer(false)} />}

      {/* ── The screens ── */}
      <main className="aip-main">
        <header className="aip-top">
          {screen !== 'start' && (
            <button type="button" className="aip-icon-btn" aria-label="Your searches and lists" title="Your searches and lists" onClick={() => setDrawer(true)}><PanelLeft size={15} /></button>
          )}
          <span className="aip-top-brand" aria-hidden="true"><span className="aip-mark"><Sparkles size={13} /></span> AI Prospecting ·</span>
          <h2 title={s.asked || undefined}>{title}</h2>
          <span style={{ flex: 1 }} />
          {screen === 'start' && <button type="button" className="aip-btn aip-how" onClick={() => setHow(true)}><PlayCircle size={14} /> How it works</button>}
          {screen !== 'start' && (
            <button type="button" className="aip-btn aip-new" onClick={startNew} disabled={s.busy}><RotateCcw size={13} /> Start a new search</button>
          )}
          {results.length > 0 && screen === 'results' && <>
            <button type="button" className="aip-btn" onClick={() => exportCsv()}><Download size={13} /> Export</button>
            <button type="button" className="aip-btn" data-accent="true" onClick={openSave}><Bookmark size={13} /> Save as list</button>
          </>}
        </header>

        <div className="aip-scroll">
          {screen === 'start' && (
            <StartScreen s={s} text={text} setText={setText} onGo={() => void go()} error={askError} sources={sources}
              verifierReady={deepReady} onExample={x => void go(x)} />
          )}

          {screen === 'verify' && <div className="aip-pad"><VerifyTool s={s} deepReady={deepReady} deepWhy={deepWhy} /></div>}

          {screen === 'results' && (
            <div className="aip-results">
              <div className="aip-results-main">
                {/* The assistant, and what it is doing in its own words. */}
                <section className="aip-hero-bar">
                  <span className="aip-hero-mark"><Sparkles size={20} /></span>
                  <span className="aip-hero-titles">
                    <span className="aip-hero-name">AI Prospecting <span className="aip-live-badge"><span className="aip-live-dot" /> Live data</span></span>
                    <span className="aip-hero-tag">Freshly searched contact details from several sources, checked as it goes.</span>
                  </span>
                  <span className="aip-bot">
                    <Robot working={working} />
                    <span className="aip-bot-say" aria-live="polite">
                      {working ? `${thinking || 'Working'}…`
                        : results.length ? `I found ${results.length} live, read ${read.length} website${read.length === 1 ? '' : 's'} and checked ${checked} address${checked === 1 ? '' : 'es'}. Tick the ones you want.`
                          : s.error ? 'That search stopped — the reason is below.' : 'I\'ll search the directories, read their websites and check every address for you.'}
                    </span>
                  </span>
                </section>

                {/* Where to search, and the search itself. */}
                <section className="aip-card aip-searchcard">
                  <div className="aip-tabs">
                    <div role="group" aria-label="Where to search" className="aip-tabs-group">
                      {sources.map(t => (
                        <button key={t.id} type="button" aria-pressed={s.source === t.id} onClick={() => s.setSource(t.id)} title={t.tip} data-off={t.off || undefined}>
                          <t.Icon size={13} /> {t.label}
                        </button>
                      ))}
                    </div>
                    <button type="button" className="aip-tab-tool" onClick={() => setView('verify')}><MailCheck size={13} /> Address checks</button>
                  </div>
                  <form className="aip-searchrow" onSubmit={e => { e.preventDefault(); void go(''); }}>
                    <label className="aip-sfield">
                      <Search size={16} />
                      <input value={s.trade} onChange={e => s.setTrade(e.target.value)} data-field="prospects.trade" aria-label="What kind of business" placeholder="dentists, cafés, accountants…" />
                    </label>
                    <span className="aip-in">in</span>
                    <label className="aip-sfield">
                      <MapPin size={16} />
                      <input value={s.place} onChange={e => s.setPlace(e.target.value)} data-field="prospects.place" aria-label="Where" placeholder="Town or city" />
                      {s.place && <button type="button" className="aip-clear" aria-label="Clear the place" onClick={() => s.setPlace('')}><X size={13} /></button>}
                    </label>
                    <MicButton onResult={r => {
                      const a = parseAsk(r.text);
                      if (a) { s.setTrade(a.trade); s.setPlace(a.place); } else s.setTrade(r.text);
                    }} />
                    <button type="submit" className="aip-go" disabled={s.busy}>{s.busy ? <Loader size={15} className="spin" /> : <Sparkles size={15} />} <span>Search with AI</span></button>
                  </form>
                  {askError && <div className="aip-ask-error" role="alert" style={{ padding: '0 16px' }}>{askError}</div>}
                  {related.length > 0 && !s.busy && (
                    <div className="aip-types" aria-label="Try also">
                      <span className="aip-type" data-on="true"><TradeIcon size={12} /> {s.searched?.trade}</span>
                      {related.map(t => {
                        const I = tradeIcon(t);
                        return <button key={t} type="button" className="aip-type" onClick={() => void go(`${t} in ${s.searched?.place ?? s.place}`)}><I size={12} /> {t}</button>;
                      })}
                    </div>
                  )}
                </section>

                <ProgressCard s={s} sources={sourceChips} />
                {thinking && <Thinking text={`${thinking}…`} />}
                {s.progress && <ProgressBar {...s.progress} />}
                {s.steps.length > 0 && (
                  <details className="aip-log" open>
                    <summary>Step by step — what AI Prospecting did, live</summary>
                    <PlanSteps steps={s.steps} />
                  </details>
                )}
                <SearchProblems s={s} />

                {results.length > 0 && <KpiRow s={s} rows={rows} />}
                {s.busy && <SkeletonRows />}

                {results.length > 0 && (
                  <section className="aip-card" aria-label="Results">
                    <div className="aip-card-head">
                      <span className="aip-card-title"><Sparkles size={14} /> Search results
                        <span className="aip-pill" aria-live="polite">{results.length} found{s.picked.size > 0 ? ` · ${s.picked.size} ticked` : ''}</span>
                        <span className="aip-muted">· {rows.filter(r => r.email).length} emails · {s.searched?.place} · <span className="aip-live-dot" aria-hidden="true" /> found live {clock(s.fetchedAt)}</span>
                      </span>
                      <span style={{ flex: 1 }} />
                      <span className="aip-menu-wrap">
                        <button type="button" className="aip-btn" aria-expanded={colsOpen} onClick={() => setColsOpen(o => !o)}><Columns3 size={13} /> Columns</button>
                        {colsOpen && (
                          <span className="aip-menu aip-cols" role="group" aria-label="Columns" onMouseLeave={() => setColsOpen(false)}>
                            {COLUMNS.map(c => (
                              <label key={c.id}><input type="checkbox" checked={cols.has(c.id)} onChange={() => setCols(prev => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} /> {c.label}</label>
                            ))}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="aip-filterrow">
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
                      <span className="aip-muted">{verifiedN} verified · {rows.filter(r => r.email).length} with an address</span>
                    </div>
                    <LeadTable s={s} rows={rows} showAll={showAll} cols={cols} onRow={onRow} />
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
                    <button type="button" className="aip-chip" data-accent="true" onClick={() => { setDaily(true); setAddMode(null); setSaving(false); scrollTo(); }}
                      title="An AI Autopilot project searches this live every day and adds the new ones to its audience">
                      <CalendarClock size={12} /> Search this every day
                    </button>
                    <button type="button" className="aip-chip" onClick={() => exportCsv()}><Download size={12} /> Export CSV</button>
                  </div>
                )}
                {daily && s.searched && (
                  <div ref={importRef}>
                    <DailySearch trade={s.searched.trade} place={s.searched.place} source={s.searched.source} onClose={() => setDaily(false)}
                      onDone={(m, projectId) => { setDaily(false); setSaid({ ok: true, text: m }); setDailyProject(projectId); }} />
                  </div>
                )}
                {dailyProject && (
                  <button type="button" className="aip-chip" style={{ justifySelf: 'start' }} onClick={() => navigate(`/autopilot?project=${encodeURIComponent(dailyProject)}&tab=prospects`)}>
                    <CalendarClock size={12} /> Open the project's Prospects tab
                  </button>
                )}
                {said && <div role="status" className="aip-note" data-ok={said.ok}>{said.text}</div>}

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
              </div>
              <InsightsRail s={s} rows={rows} insights={insights} scanned={scanned} />
            </div>
          )}
        </div>

        {/* ── What to do with the ticked ones — on screen whenever any are ticked ── */}
        {screen === 'results' && s.picked.size > 0 && (
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
      </main>

      {how && <HowItWorks onClose={() => setHow(false)} />}
      {ideas && <Ideas onClose={() => setIdeas(false)} onPick={t => { setIdeas(false); if (screen !== 'start') startNew(); setView('leads'); setText(`${t} in `); s.setTrade(t); window.setTimeout(() => document.getElementById('aip-ask')?.focus(), 40); }} />}
    </div>
  );
}
