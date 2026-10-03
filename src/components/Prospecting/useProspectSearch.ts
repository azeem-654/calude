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
  googleAvailability, lookupContacts, searchProspects,
  type Contactable, type GoogleAvailability, type Prospect, type ProspectSource,
} from '../../services/prospects';
import {
  emailOf, planImport, prospectRows, recordSearch, loadSearches, toggleSaved, forgetSearch,
  type SavedSearch, type Searched,
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
}

/** A refusal about the key, the trial or the budget is not fixed by typing differently. */
export const KEY_REFUSAL = /^(no_key|trial_ended|places_budget|bad_key|api_disabled|key_restricted|billing|quota)$/;

export function useProspectSearch() {
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

  /* Asked before anybody types, so "the owner has not set the key" is said up
     front rather than after a search — and the free directory is offered at once. */
  useEffect(() => {
    let live = true;
    void googleAvailability().then(g => { if (live) setGoogle(g); });
    return () => { live = false; };
  }, []);

  const clear = useCallback(() => {
    setError(''); setErrorCode(''); setResults(null); setNextPage(''); setPicked(new Set()); setFound({}); setMoreError('');
  }, []);

  const setSource = useCallback((s: ProspectSource) => { setSourceState(s); clear(); }, [clear]);

  const run = useCallback(async (q: Searched) => {
    setBusy(true); clear();
    const r = await searchProspects(q);
    setBusy(false);
    if (r.error) { setError(r.error); setErrorCode(r.code); return; }
    setResults(r.prospects);
    setAnswered(r.source);
    setAttribution(r.attribution);
    setCached(r.cached);
    setNextPage(r.nextPageToken);
    setSearched(q);
    setHistory(recordSearch({ source: q.source, trade: q.trade, place: q.place, count: r.prospects.length }));
  }, [clear]);

  const search = useCallback(() => run({ source, trade: trade.trim(), place: place.trim() }), [run, source, trade, place]);

  /** Run a search from the history, boxes and tab included. */
  const rerun = useCallback((s: SavedSearch) => {
    setSourceState(s.source); setTrade(s.trade); setPlace(s.place);
    void run({ source: s.source, trade: s.trade, place: s.place });
  }, [run]);

  /* Each further page is another search on the same budget, so it is asked
     for, never fetched ahead. */
  const loadMore = useCallback(async () => {
    if (!searched || !nextPage) return;
    setMore(true); setMoreError('');
    const r = await searchProspects({ ...searched, pageToken: nextPage });
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
    const r = await lookupContacts(sites);
    setEnriching(false);
    if (r.error) return { ok: false, message: r.error };
    setFound(f => ({ ...f, ...r.contacts }));
    const n = Object.values(r.contacts).reduce((sum, c) => sum + c.emails.length, 0);
    return n
      ? { ok: true, message: `Found ${n} published address${n === 1 ? '' : 'es'}.` }
      : { ok: false, message: 'None of those publish an email address on their site.' };
  }, [chosen, found]);

  const emailFor = useCallback((p: Prospect) => emailOf(p, found), [found]);

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

    const plan = planImport(prospectRows(chosen, answered, searched, found), contacts);
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
    return { created: made.length, already: plan.known.length, list, filled: fills.length };
  }, [chosen, answered, searched, found, contacts, bulkImportContacts, updateContacts]);

  const googleDown = source === 'google' && !!google && !google.available;
  const offerFree = source === 'google' && (googleDown || KEY_REFUSAL.test(errorCode));

  return {
    source, setSource, answered, google, googleDown, offerFree,
    trade, setTrade, place, setPlace,
    busy, more, enriching, error, errorCode, moreError,
    results, attribution, cached, nextPage, searched,
    picked, toggle, pickAll, chosen, found, emailFor,
    search, rerun, loadMore, enrich, importChosen,
    history,
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
export function sourceLine(s: Pick<ProspectSearch, 'source' | 'googleDown'>): string {
  /* "Included" directly above "needs the Google Maps key" read as a
     contradiction; until the owner's key is set it is not. */
  if (s.source === 'google' && s.googleDown) return 'From Google Maps — not switched on for this app yet.';
  if (s.source === 'google') return 'From Google Maps. Included — nothing for you to connect.';
  return 'From the free business directory. Nothing to connect, and the results are yours to keep.';
}
