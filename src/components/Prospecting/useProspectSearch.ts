/**
 * Searching for businesses and importing the ones ticked — the one
 * implementation behind Prospecting and the "Find businesses" dialog in
 * Contacts.
 *
 * It was the dialog's own state until Prospecting became a page. Two copies of
 * "which map answered", "what was this searched for" and "may these be
 * imported" would drift the first time either changed — and the drift that
 * matters is the import stamp, which is what the sending rules read.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  findPeople, googleAvailability, lookupContacts, searchProspects, verifyEmails,
  type Contactable, type GoogleAvailability, type Prospect, type ProspectSource, type Verdict,
} from '../../services/prospects';
import type { Contact } from '../../types';
import { addressesOf, parseAsk, type Ask } from '../../services/aiProspecting';
import {
  emailOf, planImport, prospectRows, recordSearch, loadSearches, toggleSaved, forgetSearch,
  loadSnapshot, saveSnapshot, keepable,
  type SavedSearch, type Searched, type SearchSnapshot,
} from '../../services/prospectImport';
import { addToStaticList, createList, loadLists, type ContactList } from '../../services/contactLists';
import { currentActor } from '../../services/contactPermissions';

/** Where an import goes: Contacts only, a list that exists, or a new one by name. */
export type ListChoice =
  | { mode: 'none' }
  | { mode: 'existing'; id: string }
  | { mode: 'new'; name: string };

export interface ImportOutcome {
  created: number;
  already: number;
  /** The list they went on, when one was chosen. */
  list: ContactList | null;
  /** Of the already-known, how many had a blank this search filled. */
  filled: number;
  /** Everybody ticked, as the contacts they now are — new and already-known. */
  contacts: Contact[];
}

/** One line of the plan AI Prospecting shows: a real step, with what it actually found. */
export interface Step {
  id: 'search' | 'read' | 'web' | 'verify' | 'deep';
  label: string;
  detail: string;
  state: 'running' | 'done' | 'failed' | 'skipped';
  /** Who answered — "Business directories", "Websites", "Hunter" — drawn as a badge. */
  badge: string;
  count?: number;
}

/** How many more websites one "Find emails on more websites" press reads. The first pass reads them all. */
export const AUTO_READ = 16;

/** A refusal about the key, the trial or the budget is not fixed by typing differently. */
export const KEY_REFUSAL = /^(no_key|trial_ended|places_budget|bad_key|api_disabled|key_restricted|billing|quota)$/;

/**
 * `live` (AI Prospecting) asks every source again rather than take a stored
 * answer, so each row's "found at" is when it was really found. The Contacts
 * dialog leaves it off and takes the cache, as it always has.
 */
export function useProspectSearch(opts: { live?: boolean } = {}) {
  const live = opts.live === true;
  const { contacts, bulkImportContacts, updateContacts } = useApp();
  const [source, setSourceState] = useState<ProspectSource>('free');
  /* Which map answered the last search — the free directory may answer from
     OpenStreetMap's own servers, and the credit and the stamp follow that. */
  const [answered, setAnswered] = useState<ProspectSource | ''>('');
  const [google, setGoogle] = useState<GoogleAvailability | null>(null);
  const [trade, setTrade] = useState('');
  const [place, setPlace] = useState('');
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [moreError, setMoreError] = useState('');
  const [results, setResults] = useState<Prospect[] | null>(null);
  const [attribution, setAttribution] = useState('');
  const [cached, setCached] = useState(false);
  const [nextPage, setNextPage] = useState('');
  /* What the shown results were searched for, so "More" and the source stamp
     on an import describe the search that produced them, not the boxes as
     they are now. */
  const [searched, setSearched] = useState<Searched | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [found, setFound] = useState<Record<string, Contactable>>({});
  const [history, setHistory] = useState<SavedSearch[]>(() => loadSearches());
  /* What the checks said about each address, by address. */
  const [checks, setChecks] = useState<Record<string, Verdict>>({});
  const [verifying, setVerifying] = useState(false);
  const [finding, setFinding] = useState(false);
  /* The sentence the current results were asked for, its narrowing, and the plan as it ran. */
  const [asked, setAsked] = useState('');
  const [want, setWant] = useState<Ask['want']>({ email: false, website: false, phone: false });
  const [steps, setSteps] = useState<Step[]>([]);
  /* What is being worked on right now, row by row — the table shimmers those
     cells, so the work is seen happening where its answer will land. */
  const [reading, setReading] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState<Set<string>>(new Set());
  /* A long pass (every website, every mailbox) says how far it has got. */
  /* When this search began and when its source answered — the page's "live" stamps —
     and how many the same search found last time, for the comparison. */
  const [startedAt, setStartedAt] = useState('');
  const [fetchedAt, setFetchedAt] = useState('');
  const [prevCount, setPrevCount] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  /* Set when the results on screen were reopened from a past search rather
     than found just now — the page says when they were found. */
  const [restoredAt, setRestoredAt] = useState('');
  const step = useCallback((id: Step['id'], patch: Partial<Step> & Pick<Step, 'label' | 'state' | 'badge'>) => {
    setSteps(prev => {
      const i = prev.findIndex(x => x.id === id);
      const next: Step = { id, detail: '', ...(i >= 0 ? prev[i] : {}), ...patch };
      return i >= 0 ? prev.map((x, j) => (j === i ? next : x)) : [...prev, next];
    });
  }, []);

  /* Asked before anybody types, so "the owner has not set the key" is said up
     front rather than after a search — and the free directory is offered at once. */
  useEffect(() => {
    let live = true;
    void googleAvailability().then(g => { if (live) setGoogle(g); });
    return () => { live = false; };
  }, []);

  const clear = useCallback(() => {
    setError(''); setErrorCode(''); setResults(null); setNextPage(''); setPicked(new Set()); setFound({}); setMoreError('');
    setChecks({}); setSteps([]); setProgress(null); setRestoredAt('');
  }, []);

  /** Start a new search: nothing shown, nothing typed, the source kept. */
  const reset = useCallback(() => {
    clear();
    setSearched(null); setAsked(''); setTrade(''); setPlace(''); setAnswered(''); setStartedAt(''); setFetchedAt(''); setPrevCount(null);
    setWant({ email: false, website: false, phone: false });
  }, [clear]);

  const setSource = useCallback((s: ProspectSource) => { setSourceState(s); clear(); }, [clear]);

  const run = useCallback(async (q: Searched): Promise<Prospect[] | null> => {
    setBusy(true); clear();
    setStartedAt(new Date().toISOString());
    const before = loadSearches().find(h => h.source === q.source && h.trade.toLowerCase() === q.trade.toLowerCase() && h.place.toLowerCase() === q.place.toLowerCase());
    setPrevCount(before ? before.count : null);
    const r = await searchProspects({ ...q, fresh: live });
    setBusy(false);
    if (r.error) { setError(r.error); setErrorCode(r.code); return null; }
    setFetchedAt(r.fetchedAt);
    setResults(r.prospects);
    setAnswered(r.source);
    setAttribution(r.attribution);
    setCached(r.cached);
    setNextPage(r.nextPageToken);
    setSearched(q);
    setHistory(recordSearch({ source: q.source, trade: q.trade, place: q.place, count: r.prospects.length }));
    return r.prospects;
  }, [clear]);

  const search = useCallback(() => { setAsked(''); setWant({ email: false, website: false, phone: false }); return run({ source, trade: trade.trim(), place: place.trim() }); }, [run, source, trade, place]);

  /** Run a search from the history, boxes and tab included. */
  const rerun = useCallback((s: SavedSearch) => {
    setSourceState(s.source); setTrade(s.trade); setPlace(s.place);
    setAsked(''); setWant({ email: false, website: false, phone: false });
    void run({ source: s.source, trade: s.trade, place: s.place });
  }, [run]);

  /**
   * Reopen a past search with what it found — rows, the addresses read off
   * their websites, every check with its date, the step log — instead of
   * running it all again. Null when there is nothing kept for it (a Google
   * search, or one from before results were kept); the caller then searches.
   */
  const restore = useCallback((h: Pick<SavedSearch, 'source' | 'trade' | 'place'>): SearchSnapshot | null => {
    const snap = loadSnapshot(h);
    if (!snap) return null;
    clear();
    setSourceState(snap.source); setTrade(snap.trade); setPlace(snap.place);
    setResults(snap.results); setFound(snap.found ?? {}); setChecks(snap.checks ?? {});
    setSteps((snap.steps ?? []).filter(x => x.state !== 'running') as Step[]);
    setAnswered(snap.answered); setAttribution(snap.attribution ?? ''); setCached(false); setNextPage('');
    setSearched({ source: snap.source, trade: snap.trade, place: snap.place });
    setAsked(snap.asked ?? ''); setWant(snap.want ?? { email: false, website: false, phone: false });
    setStartedAt(snap.startedAt ?? ''); setFetchedAt(snap.fetchedAt ?? ''); setPrevCount(null);
    setRestoredAt(snap.savedAt || snap.fetchedAt || '');
    return snap;
  }, [clear]);

  /**
   * Read websites for their published addresses, eight to a request (the
   * server's cap). Returns how many sites were read and addresses found, and
   * the new lookups, so a caller in the middle of a pipeline does not have to
   * wait for React to hand them back.
   */
  const lookupSites = useCallback(async (sites: string[], label = '') => {
    const fresh: Record<string, Contactable> = {};
    let error = '';
    for (let i = 0; i < sites.length; i += 8) {
      const batch = sites.slice(i, i + 8);
      setReading(new Set(batch));
      if (label) setProgress({ label, done: i, total: sites.length });
      const r = await lookupContacts(batch, live);
      if (r.error) { error = r.error; break; }
      Object.assign(fresh, r.contacts);
      setFound(f => {
        const next = { ...f };
        for (const [k, c] of Object.entries(r.contacts)) next[k] = { ...c, people: f[k]?.people };
        return next;
      });
    }
    setReading(new Set());
    if (label) setProgress(null);
    const emails = Object.values(fresh).reduce((n, c) => n + c.emails.length, 0);
    return { read: Object.keys(fresh).length, emails, fresh, error };
  }, []);

  /**
   * Check addresses, twenty to a request. `deep` asks the owner's verifier too.
   * Returns the verdicts and what the server said about the deep pass.
   */
  const verifyList = useCallback(async (emails: string[], deep: boolean) => {
    const list = [...new Set(emails.map(e => e.toLowerCase()).filter(Boolean))];
    const got: Record<string, Verdict> = {};
    let note = '';
    let error = '';
    let ran = 0;
    setVerifying(true);
    for (let i = 0; i < list.length; i += 20) {
      setChecking(new Set(list.slice(i, i + 20)));
      if (list.length > 20) setProgress({ label: deep ? 'Asking mail servers' : 'Checking addresses', done: i, total: list.length });
      const r = await verifyEmails(list.slice(i, i + 20), deep, live);
      if (r.error) { error = r.error; break; }
      Object.assign(got, r.verdicts);
      ran += r.deep.ran;
      if (r.deep.error) note = r.deep.error;
      setChecks(c => ({ ...c, ...r.verdicts }));
      /* A missing verifier or a spent allowance is the same for the next
         twenty; the rest get the free check in one more pass, not a refusal each. */
      if (deep && r.deep.code && r.deep.code !== 'verify_budget') deep = false;
    }
    setVerifying(false); setChecking(new Set());
    if (list.length > 20) setProgress(null);
    return { verdicts: got, note, error, ran };
  }, []);

  /** Hunter's domain search for sites, five to a request. Merges the people into `found`. */
  const searchWebFor = useCallback(async (sites: string[]) => {
    const got: Record<string, Contactable> = {};
    let error = '';
    let searched = 0;
    setFinding(true);
    for (let i = 0; i < sites.length; i += 5) {
      const r = await findPeople(sites.slice(i, i + 5));
      searched += r.searched;
      setFound(f => {
        const next = { ...f };
        for (const [k, people] of Object.entries(r.people)) {
          next[k] = { emails: f[k]?.emails ?? [], mx: f[k]?.mx ?? null, people };
          got[k] = next[k];
        }
        return next;
      });
      if (r.error) { error = r.error; break; }
    }
    setFinding(false);
    const people = Object.values(got).reduce((n, c) => n + (c.people?.length ?? 0), 0);
    return { searched, people, got, error };
  }, []);

  /**
   * One sentence, run as a plan: search, read the first websites for the
   * addresses they publish, and give every address found the free check.
   * Each step is shown as it runs and reports what it actually found — a step
   * that found nothing says so, and one that could not run says why.
   */
  const ask = useCallback(async (text: string, from?: ProspectSource): Promise<{ error: string; want?: Ask['want'] }> => {
    const a = parseAsk(text);
    if (!a) return { error: 'Say the kind of business and the place — "dentists in Leeds", "cafés near Bristol".' };
    setTrade(a.trade); setPlace(a.place);
    const src = from ?? source;
    if (from) setSourceState(from);
    /* The log on the results names no source — the customer asked for
       businesses, not for an account of the suppliers. Licences' credits stay
       on the card (Attribution); the loading messages say what is searched. */
    const where = 'Search';
    const list = await run({ source: src, trade: a.trade, place: a.place });
    setAsked(text.trim()); setWant(a.want);
    if (!list) {
      step('search', { label: `Searched for ${a.trade} in ${a.place}`, detail: 'The search was refused — see why below.', state: 'failed', badge: where });
      return { error: '', want: a.want };
    }
    const named = list.filter(p => p.officers?.length).length;
    step('search', {
      label: `Searched for ${a.trade} in ${a.place}`,
      detail: src === 'register' ? `${list.length} active compan${list.length === 1 ? 'y' : 'ies'}${named ? `, ${named} with their directors named` : ''}` : `${list.length} found`,
      state: 'done', badge: where, count: list.length,
    });
    if (!list.length) return { error: '', want: a.want };
    if (src === 'register') {
      /* The register holds no websites, so there is nothing to read — said, not skipped silently. */
      step('read', { label: 'Registered companies come with no websites or email addresses', detail: 'Directors are named instead. Search the web for named people, or search all businesses for websites.', state: 'skipped', badge: 'Websites' });
      return { error: '', want: a.want };
    }

    /* Every website, not the first sixteen: the most addresses a search can
       give is what it is for, and a press to get the rest was a press most
       people never found. Eight to a request, with a bar for a long list. */
    const sites = [...new Set(list.filter(p => p.website && !p.email).map(p => p.website))];
    const onMap = list.filter(p => p.email).length;
    let fresh: Record<string, Contactable> = {};
    if (sites.length) {
      step('read', { label: `Searching ${sites.length} websites for the addresses they publish`, state: 'running', badge: 'Websites' });
      const r = await lookupSites(sites, sites.length > 8 ? 'Searching websites for email addresses' : '');
      fresh = r.fresh;
      step('read', {
        label: `Read ${r.read} websites for the addresses they publish`,
        detail: r.error ? r.error : `${r.emails} address${r.emails === 1 ? '' : 'es'} found${onMap ? `, plus ${onMap} published on the map` : ''}`,
        state: r.error ? 'failed' : 'done', badge: 'Websites', count: r.emails,
      });
    } else {
      step('read', { label: 'No websites to read', detail: onMap ? `${onMap} published an address on the map` : 'None of these list a website', state: 'skipped', badge: 'Websites' });
    }

    const emails = [...new Set(list.flatMap(p => addressesOf(p, fresh)))];
    if (emails.length) {
      step('verify', { label: `Verifying ${emails.length} contact${emails.length === 1 ? '' : 's'} — format, domain and mail server`, state: 'running', badge: 'Contact check' });
      const v = await verifyList(emails, false);
      const vs = Object.values(v.verdicts);
      const bad = vs.filter(x => x.status === 'invalid').length;
      const okd = vs.filter(x => x.status === 'valid' || x.status === 'domain_ok').length;
      step('verify', {
        label: `Checked ${vs.length} contact${vs.length === 1 ? '' : 's'} — format, domain and mail server`,
        detail: v.error ? v.error : `${okd} take mail${bad ? `, ${bad} would bounce` : ''}${vs.length - okd - bad ? `, ${vs.length - okd - bad} risky or unclear` : ''}`,
        state: v.error ? 'failed' : 'done', badge: 'Contact check', count: okd,
      });
    }
    return { error: '', want: a.want };
  }, [source, run, step, lookupSites, verifyList]);

  /* Each further page is another search on the same budget, so it is asked
     for, never fetched ahead. */
  const loadMore = useCallback(async () => {
    if (!searched || !nextPage) return;
    setMore(true); setMoreError('');
    const r = await searchProspects({ ...searched, pageToken: nextPage, fresh: live });
    setMore(false);
    if (r.error) { setMoreError(r.error); setNextPage(''); return; }
    setResults(prev => {
      const have = new Set((prev ?? []).map(p => p.ref));
      return [...(prev ?? []), ...r.prospects.filter(p => !have.has(p.ref))];
    });
    setNextPage(r.nextPageToken);
  }, [searched, nextPage]);

  const toggle = useCallback((ref: string) => {
    setPicked(p => {
      const next = new Set(p);
      if (next.has(ref)) next.delete(ref); else next.add(ref);
      return next;
    });
  }, []);
  const pickAll = useCallback((on: boolean) => setPicked(on ? new Set((results ?? []).map(r => r.ref)) : new Set()), [results]);

  const chosen = useMemo(() => (results ?? []).filter(p => picked.has(p.ref)), [results, picked]);

  /**
   * Read the published address off each ticked business's own site.
   * Eight at a time — the server caps it too, because each is several page
   * fetches. Returns what to say, so the caller decides how.
   */
  const enrich = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    const sites = chosen.filter(p => p.website && !found[p.website]).map(p => p.website).slice(0, 8);
    if (!sites.length) {
      return chosen.some(p => p.website)
        ? { ok: false, message: 'Those have all been looked up already.' }
        : { ok: false, message: 'None of those have a website listed.' };
    }
    setEnriching(true);
    const r = await lookupContacts(sites, live);
    setEnriching(false);
    if (r.error) return { ok: false, message: r.error };
    setFound(f => {
      const next = { ...f };
      for (const [k, c] of Object.entries(r.contacts)) next[k] = { ...c, people: f[k]?.people };
      return next;
    });
    const n = Object.values(r.contacts).reduce((sum, c) => sum + c.emails.length, 0);
    return n
      ? { ok: true, message: `Found ${n} published address${n === 1 ? '' : 'es'}.` }
      : { ok: false, message: 'None of those publish an email address on their site.' };
  }, [chosen, found]);

  const emailFor = useCallback((p: Prospect) => emailOf(p, found, checks), [found, checks]);

  /**
   * Import the ticked ones, once each, and put them on the chosen list.
   *
   * Everybody ticked goes on the list — the new and the already-known alike —
   * because the list is "the dentists I found in Leeds", and one of them
   * having been in Contacts since spring does not make them any less so.
   */
  const importChosen = useCallback((choice: ListChoice): ImportOutcome | { error: string } => {
    if (!chosen.length) return { error: 'Tick the businesses to add first.' };
    if (choice.mode === 'new' && !choice.name.trim()) return { error: 'Give the new list a name.' };
    let list: ContactList | null = null;
    if (choice.mode === 'existing') {
      list = loadLists().find(l => l.id === choice.id) ?? null;
      if (!list) return { error: 'That list no longer exists — choose another or make a new one.' };
      if (list.type !== 'static') return { error: `"${list.name}" is a smart list — it picks its own members by rule, so nobody can be added to it. Choose another or make a new one.` };
    }

    const plan = planImport(prospectRows(chosen, answered, searched, found, undefined, checks), contacts, checks);
    const made = plan.fresh.length ? bulkImportContacts(plan.fresh) : [];
    const fills = plan.known.filter(k => Object.keys(k.fill).length).map(k => ({ id: k.contact.id, updates: k.fill }));
    if (fills.length) updateContacts(fills);
    const ids = [...made.map(c => c.id), ...plan.known.map(k => k.contact.id)];

    if (choice.mode === 'new') {
      /* A list of found businesses is strangers, and it says so — the planner
         and the campaign wizard read this rather than guessing. */
      list = createList({ name: choice.name.trim(), type: 'static', memberIds: ids, createdBy: currentActor().name, kind: 'cold', origin: 'prospecting' });
    } else if (list) {
      addToStaticList(list.id, ids);
      list = loadLists().find(l => l.id === list!.id) ?? list;
    }
    setPicked(new Set());
    const byId = new Map(contacts.map(c => [c.id, c]));
    const now = [...made, ...plan.known.map(k => ({ ...(byId.get(k.contact.id) ?? k.contact), ...k.fill }))];
    return { created: made.length, already: plan.known.length, list, filled: fills.length, contacts: now };
  }, [chosen, answered, searched, found, checks, contacts, bulkImportContacts, updateContacts]);

  /* Keep what this search has found, each time a pass adds to it — not while
     a pass is still running, so a reopened search never shows a half-read
     list as finished. Google's results are never kept (prospectImport). */
  const working = busy || verifying || finding || reading.size > 0 || checking.size > 0 || steps.some(x => x.state === 'running');
  useEffect(() => {
    if (!searched || !results || working || !keepable(searched.source) || !keepable(answered)) return;
    const t = window.setTimeout(() => saveSnapshot({
      source: searched.source, answered, trade: searched.trade, place: searched.place,
      asked, want, results, found, checks, steps, attribution, startedAt, fetchedAt,
      savedAt: restoredAt || new Date().toISOString(),
    }), 400);
    return () => window.clearTimeout(t);
  }, [searched, results, working, answered, asked, want, found, checks, steps, attribution, startedAt, fetchedAt, restoredAt]);

  const googleDown = source === 'google' && !!google && !google.available;
  const registerDown = source === 'register' && !!google && !google.register.available;
  /* Whichever chosen source is not on, and why — said before anybody types. */
  const downError = googleDown ? google!.error : registerDown ? google!.register.error : '';
  const offerFree = (source === 'google' && (googleDown || KEY_REFUSAL.test(errorCode))) || registerDown;

  return {
    source, setSource, answered, google, googleDown, registerDown, downError, offerFree, reset,
    reading, checking, progress, live, startedAt, fetchedAt, prevCount, restoredAt, restore,
    trade, setTrade, place, setPlace,
    busy, more, enriching, error, errorCode, moreError,
    results, attribution, cached, nextPage, searched,
    picked, toggle, pickAll, chosen, found, emailFor,
    search, rerun, loadMore, enrich, importChosen,
    history,
    checks, verifying, finding, steps, step, asked, want, setWant,
    ask, lookupSites, verifyList, searchWebFor,
    saveSearch: (s: SavedSearch) => setHistory(toggleSaved(s)),
    forget: (s: SavedSearch) => setHistory(forgetSearch(s)),
  };
}

export type ProspectSearch = ReturnType<typeof useProspectSearch>;

/** "6 added to “Dentists — Leeds, Oct” — 4 new, 2 already in Contacts." */
export function outcomeText(o: ImportOutcome): string {
  const n = o.created + o.already;
  const filled = o.filled ? ` (${o.filled} given details they were missing)` : '';
  if (!o.list) {
    return `${o.created} added to Contacts as prospect${o.created === 1 ? '' : 's'}${o.already ? ` — ${o.already} ${o.already === 1 ? 'was' : 'were'} already there and ${o.already === 1 ? 'was' : 'were'} not added twice${filled}` : ''}.`;
  }
  return `${n} on “${o.list.name}” — ${o.created} new, ${o.already} already in Contacts${filled}.`;
}

/** One line under the title saying where this search goes and what that means. */
export function sourceLine(s: Pick<ProspectSearch, 'source' | 'googleDown' | 'registerDown'>): string {
  /* "Included" directly above "needs the Google Maps key" read as a
     contradiction; until the owner's key is set it is not. */
  if (s.source === 'google' && s.googleDown) return 'From Google Maps — not switched on for this app yet.';
  if (s.source === 'google') return 'From Google Maps. Included — nothing for you to connect.';
  if (s.source === 'register') return s.registerDown ? 'From the company register — not switched on for this app yet.' : 'From the official company register: active companies, with their directors.';
  return 'From business directories. Nothing to connect, and the results are yours to keep.';
}
