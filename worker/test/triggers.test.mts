/**
 * Whether a workflow starts, argued with directly.
 *
 * Run with `npm run test:triggers`. `triggerMatches` is the whole decision
 * between "this enquiry starts the follow-up" and "nothing happens", and every
 * way it goes wrong looks identical from the outside: a workflow that is
 * switched on and never runs.
 *
 * ── The two bugs this pins ──
 *
 * A trigger switched from "a form is submitted" to "a tag is added" kept the
 * old form name, and the rule — `formName ?? tag` — went on matching the form
 * name. A tag trigger waiting for a form, for ever.
 *
 * And a form trigger matched on the form's *name*, so renaming the form
 * silently detached every workflow listening for it.
 */
import { triggerMatches, type TriggerEvent } from '../src/lib/triggers';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

const trig = (config: Record<string, string>) =>
  ({ id: 't', type: 'trigger', label: 't', config, nextId: null }) as Parameters<typeof triggerMatches>[0];
const ev = (e: Partial<TriggerEvent>): TriggerEvent => ({ kind: 'form_submitted', contactId: 'c1', ...e });

/* ── The event has to be the one it listens for ─────────────────────────── */
ok('a form trigger ignores a tag', !triggerMatches(trig({ event: 'form_submitted' }), ev({ kind: 'tag_added', ref: 'x' })));
ok('a trigger with no event never starts', !triggerMatches(trig({}), ev({})));

/* ── Forms ──────────────────────────────────────────────────────────────── */
ok('"any form" starts on every form', triggerMatches(trig({ event: 'form_submitted' }), ev({ ref: 'Anything' })));
ok('a named form starts on that form', triggerMatches(trig({ event: 'form_submitted', formName: 'Get a quote' }), ev({ ref: 'get a quote' })));
ok('and not on another', !triggerMatches(trig({ event: 'form_submitted', formName: 'Get a quote' }), ev({ ref: 'Newsletter' })));

{
  /* The rename. Attached by id, the trigger follows the form. */
  const t = trig({ event: 'form_submitted', formName: 'Get a quote', formId: 'frm_1' });
  ok('a form chosen by id still starts after the form is renamed',
    triggerMatches(t, ev({ ref: 'Request a price', refId: 'frm_1' })));
  ok('and a different form with the old name does not start it',
    !triggerMatches(t, ev({ ref: 'Get a quote', refId: 'frm_2' })));
  /* Older events carry no id — say, one fired before this change. The name is
     still honoured, so nothing already working stops. */
  ok('an event with no id falls back to the name', triggerMatches(t, ev({ ref: 'Get a quote' })));
}

/* ── Tags, and the stale form name ──────────────────────────────────────── */
ok('a tag trigger starts on its tag',
  triggerMatches(trig({ event: 'tag_added', tag: 'enquiry' }), ev({ kind: 'tag_added', ref: 'Enquiry' })));
ok('a tag trigger ignores a different tag',
  !triggerMatches(trig({ event: 'tag_added', tag: 'enquiry' }), ev({ kind: 'tag_added', ref: 'customer' })));
ok('a tag trigger still carrying an old form name listens for the tag, not the form',
  triggerMatches(trig({ event: 'tag_added', tag: 'enquiry', formName: 'Get a quote' }),
    ev({ kind: 'tag_added', ref: 'enquiry' })));
ok('a stage trigger narrows by stage',
  triggerMatches(trig({ event: 'deal_stage_changed', tag: 'Proposal' }), ev({ kind: 'deal_stage_changed', ref: 'proposal' }))
  && !triggerMatches(trig({ event: 'deal_stage_changed', tag: 'Proposal' }), ev({ kind: 'deal_stage_changed', ref: 'Won' })));

for (const line of out) console.log(line);
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed}/${out.length} passed`);
process.exit(failed ? 1 : 0);
