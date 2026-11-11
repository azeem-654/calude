/**
 * Re-apply this browser's change to a document somebody else saved first
 * (DATA-1). Pure, so `npm run test:merge` can hold it to its word.
 *
 * Two tabs each held the contact list, each added a contact and saved the
 * whole list; the second save replaced the first and one contact vanished
 * without a word. The server now refuses a save made against a stale copy and
 * hands back the current one. This works out what *this* browser changed
 * (local against the copy it started from, `base`) and applies only that to
 * the current copy (`remote`) — the pattern `dataUpdate` uses on the server.
 *
 *   lists of records with an `id`   added, edited and removed records, by id;
 *                                    the same record edited in both: this
 *                                    browser's edit wins, as it did before
 *   plain objects (settings)         changed top-level fields
 *   anything else                    this browser's copy, as before — the
 *                                    customer's own edit is not discarded
 */

type Rec = Record<string, unknown> & { id: string | number };
const isRecList = (v: unknown): v is Rec[] =>
  Array.isArray(v) && v.every(x => !!x && typeof x === 'object' && !Array.isArray(x) && (typeof (x as Rec).id === 'string' || typeof (x as Rec).id === 'number'));
const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const parse = (s: string | null): unknown => { if (s === null) return undefined; try { return JSON.parse(s); } catch { return Symbol.for('unparsed'); } };

export function mergeDoc(base: string | null, local: string | null, remote: string | null): string | null {
  if (local === base) return remote;
  if (remote === base || remote === local) return local;
  if (local === null) return null;        // this browser deleted it: as before
  const b = parse(base), l = parse(local), r = parse(remote);
  if (typeof l === 'symbol' || typeof r === 'symbol') return local;

  if (isRecList(l) && (r === undefined || isRecList(r)) && (b === undefined || isRecList(b))) {
    const baseById = new Map((b ?? []).map(x => [String(x.id), x]));
    const localById = new Map(l.map(x => [String(x.id), x]));
    const remoteList = r ?? [];
    const remoteIds = new Set(remoteList.map(x => String(x.id)));
    const out: Rec[] = [];
    for (const item of remoteList) {
      const id = String(item.id);
      const was = baseById.get(id);
      const mine = localById.get(id);
      if (was && !mine) continue;                         // removed here
      out.push(mine && was && !same(mine, was) ? mine : item); // edited here, or theirs
    }
    const added = l.filter(x => !baseById.has(String(x.id)) && !remoteIds.has(String(x.id)));
    /* Lists that put the newest first (contacts, deals) get theirs first
       again; the rest get them at the end. */
    const newestFirst = l.length > 0 && !baseById.has(String(l[0].id));
    return JSON.stringify(newestFirst ? [...added, ...out] : [...out, ...added]);
  }

  if (isPlain(l) && isPlain(r) && (b === undefined || isPlain(b))) {
    const was = b ?? {};
    const out: Record<string, unknown> = { ...r };
    for (const k of new Set([...Object.keys(l), ...Object.keys(was)])) {
      if (same(l[k], was[k])) continue;
      if (k in l) out[k] = l[k]; else delete out[k];
    }
    return JSON.stringify(out);
  }
  return local;
}
