/**
 * The blueprint a project was built from, as stored on `crm_projects.brief`.
 *
 * ── What the server does with it ──
 *
 * Almost nothing, on purpose. The brief is the customer's own description of
 * their project, written by the wizard and shown back on the project page; the
 * server keeps it and caps it. Exactly one field changes behaviour:
 * `plannerChannels`, which `autopilotPlan.ts` reads to decide which plays may
 * run for this project.
 *
 * Why that field exists: a project that only wants social posts used to be
 * `kind: 'general'`, and 'general' plans everything — a website, a daily blog,
 * an email sequence, and a "no mailbox is connected" error for a project that
 * was never going to send an email. The blueprint knows which channels its own
 * workflows cover and which the planner should look after, so it says so.
 */

/**
 * Every channel a play can belong to.
 *
 * The planner's vocabulary, not the wizard's: `site` is the landing page or
 * website the planner writes, `sales` is the deals pipeline, `reviews` is the
 * review ask. A channel not in this list is dropped rather than stored, so a
 * typo in the client cannot quietly switch the planner off.
 */
export const PLANNER_CHANNELS = [
  'email', 'sms', 'social', 'blog', 'site', 'video', 'book', 'shop', 'sales', 'reviews', 'contacts',
] as const;
export type PlannerChannel = typeof PLANNER_CHANNELS[number];

/** Large enough for any real blueprint, small enough that it is not a file store. */
const MAX_BYTES = 48_000;

/**
 * The brief as it will be stored, or null when it should not be.
 *
 * Kept whole rather than rebuilt field by field: it is the customer's own text,
 * rendered back only to them, and a whitelist here would be a second copy of the
 * blueprint's shape that drifts the first time the wizard learns a field. The
 * planner field is the exception and is checked properly.
 */
export function sanitiseBrief(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const brief = { ...(raw as Record<string, unknown>) };
  if ('plannerChannels' in brief) {
    const list = Array.isArray(brief.plannerChannels) ? brief.plannerChannels : [];
    brief.plannerChannels = [...new Set(list.map(String))]
      .filter((c): c is PlannerChannel => (PLANNER_CHANNELS as readonly string[]).includes(c));
  }
  /* The second field the server acts on, so it is checked the same way: a
     list id of the shape the app makes, or nothing. The name is display only. */
  if ('audience' in brief) {
    const a = brief.audience as { listId?: unknown; listName?: unknown } | null;
    const id = String(a?.listId ?? '');
    brief.audience = LIST_ID.test(id) ? { listId: id, listName: String(a?.listName ?? '').slice(0, 120) } : undefined;
    if (!brief.audience) delete brief.audience;
  }
  const text = JSON.stringify(brief);
  /* Refused rather than truncated: half a JSON document is not a brief, it is
     a parse error waiting on the project page. */
  if (text.length > MAX_BYTES) return null;
  return text;
}

/**
 * Which channels the planner may act on, from a stored brief.
 *
 * `null` means "no opinion" — every project made before the brief existed, and
 * any row whose JSON cannot be read. Those plan exactly as they always have. An
 * empty array is a real answer: the project's own workflows do all of its work
 * and the planner has nothing to add.
 */
export function focusOf(stored: string | null | undefined): PlannerChannel[] | null {
  if (!stored) return null;
  try {
    const b = JSON.parse(stored) as { plannerChannels?: unknown };
    if (!b || !Array.isArray(b.plannerChannels)) return null;
    return b.plannerChannels
      .map(String)
      .filter((c): c is PlannerChannel => (PLANNER_CHANNELS as readonly string[]).includes(c));
  } catch {
    return null;
  }
}

/** The shape of a contact list's id (src/services/contactLists.ts `createList`). */
const LIST_ID = /^list-[A-Za-z0-9_-]{1,80}$/;

/**
 * The contact list a project works from, from a stored brief — or null when
 * it works from the workspace as a whole (every project older than this, and
 * every one whose contacts are "already in" or "find new ones").
 *
 * Only the id is returned. Who is on the list, and whether they are
 * strangers, is read from the workspace's own records at plan time; a brief
 * written by the browser is never trusted to say either.
 */
export function audienceOf(stored: string | null | undefined): { listId: string } | null {
  if (!stored) return null;
  try {
    const b = JSON.parse(stored) as { audience?: { listId?: unknown } };
    const id = String(b?.audience?.listId ?? '');
    return LIST_ID.test(id) ? { listId: id } : null;
  } catch {
    return null;
  }
}
