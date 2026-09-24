/**
 * Whether an event starts a workflow.
 *
 * Its own module, with no imports, for one reason: it is the whole decision
 * between "this enquiry starts the follow-up" and "nothing happens", and it has
 * to be testable without loading the engine — which brings the mail socket
 * library with it, and that only exists inside a Worker. Every way this rule
 * goes wrong looks the same from outside: a workflow that is on and never runs.
 *
 * Tested: `npm run test:triggers`.
 */

/** Minimal shape of a trigger step, so this file needs nothing from the engine. */
interface TriggerNode { type: string; config?: Record<string, string> }

export interface TriggerEvent {
  /** contact_created | form_submitted | tag_added | deal_created | deal_moved */
  kind: string;
  /** The form's name or the tag, for triggers that name one. */
  ref?: string;
  /**
   * The form's id, when the event is a form.
   *
   * Matched ahead of the name. A trigger that names a form by its name stops
   * working the day somebody renames the form, with nothing to say so; one
   * attached to the form itself does not.
   */
  refId?: string;
  contactId: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}

/**
 * Does this graph's trigger node want this event?
 *
 * Exported because it is the whole decision and it is worth being able to argue
 * with it directly in a test rather than through a database.
 */
export function triggerMatches(node: TriggerNode | undefined, ev: TriggerEvent): boolean {
  if (!node || node.type !== 'trigger') return false;
  const cfg = node.config ?? {};
  const want = String(cfg.event ?? '').trim();
  if (!want || want !== ev.kind) return false;

  /*
   * The narrowing that belongs to *this* event, and only that one.
   *
   * It used to be `formName ?? tag` for every event. `??` only skips null, so
   * a trigger switched from a form to a tag that still carried the old form's
   * name — which the builder did not clear — was a tag trigger waiting for a
   * form. It never started, and nothing said why.
   */
  if (ev.kind === 'form_submitted') {
    const formId = String(cfg.formId ?? '').trim();
    /* Attached to the form itself when it can be, so renaming the form does
       not quietly stop the workflow. */
    if (formId && ev.refId) return formId === ev.refId;
    const named = String(cfg.formName ?? '').trim().toLowerCase();
    return !named || (ev.ref ?? '').trim().toLowerCase() === named;
  }

  /* Matched case-insensitively, because the name is typed in one screen and
     chosen in another and nobody should lose an automation to capitalisation. */
  const named = String(cfg.tag ?? '').trim().toLowerCase();
  if (!named) return true;
  return (ev.ref ?? '').trim().toLowerCase() === named;
}
