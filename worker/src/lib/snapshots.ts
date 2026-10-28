/**
 * Industry snapshots — a ready-made starting setup for one trade, installed
 * into a workspace (phase 3 of docs/IMPLEMENTATION-PLAN.md).
 *
 * A snapshot is data, typed and versioned here, never typed into a screen: a
 * pipeline whose stages carry their checklists, the contact fields that trade
 * records, and the workflow templates worth starting from. It installs into
 * the same documents the app already keeps (`crm_pipelines`,
 * `crm_custom_fields`), so nothing downstream has to learn a new shape.
 *
 * ── The one rule: an install only ever adds ──
 *
 * A customer's pipeline is theirs the moment it exists. An install (or an
 * upgrade to a later version) adds what is missing and leaves everything
 * present exactly as the customer has it — renamed stages, edited checklists,
 * deals and all. Items it put there before and the customer has since deleted
 * are not put back, because deleting was a decision; the preview lists them
 * and offers to restore them, which is the only way they return.
 *
 * Items are matched by id, never by name: names get edited. Every id is
 * prefixed `snap-<snapshot>-` so it cannot collide with a customer's own.
 *
 * No figures, prices, reviews or sample contacts: a snapshot is structure, and
 * the checklist wording says what to do, not what it will earn.
 *
 * Pure and import-free: the browser's build compiles it too, for the preview.
 */

export type SnapshotId = 'hvac' | 'roofing' | 'medical_billing' | 'medical_practice' | 'ecommerce';
/** The microsite slug a sign-up arrives with (`?industry=`). */
export type IndustrySlug = 'hvac' | 'roofing' | 'medical-billing' | 'ecommerce';

export interface SnapStage { id: string; name: string; color: string; playbook: string[] }
export interface SnapField { key: string; label: string }

export interface Snapshot {
  id: SnapshotId;
  industry: IndustrySlug;
  /** Whole numbers, raised whenever an item is added. Items are never taken away by a version. */
  version: number;
  title: string;
  summary: string;
  /** What each version added, newest first. */
  history: { version: number; date: string; note: string }[];
  pipeline: { id: string; name: string; stages: SnapStage[] };
  fields: SnapField[];
  /** Workflow template keys (src/components/Autopilot/workflowTemplates.ts) to start from. Shown, not installed. */
  templates: string[];
}

const P = (id: SnapshotId) => `snap-${id.replace('_', '-')}`;

const HVAC: Snapshot = {
  id: 'hvac', industry: 'hvac', version: 1,
  title: 'HVAC contractor',
  summary: 'A heating and cooling pipeline from first enquiry to completed job, with the checklist each stage needs and the system details an HVAC business records.',
  history: [{ version: 1, date: '2026-10-26', note: 'First version.' }],
  pipeline: {
    id: `${P('hvac')}-pipeline`, name: 'HVAC jobs',
    stages: [
      { id: `${P('hvac')}-new`, name: 'New enquiry', color: '#6366f1', playbook: ['Call back as soon as you can during business hours', 'Ask whether it is a repair, a replacement or maintenance', 'Note the system type and roughly how old it is'] },
      { id: `${P('hvac')}-visit`, name: 'Visit booked', color: '#0ea5e9', playbook: ['Confirm the arrival window by text or email', 'Ask about access, pets and where the equipment is'] },
      { id: `${P('hvac')}-estimate`, name: 'Estimate sent', color: '#3b82f6', playbook: ['Send the written estimate, with options where there are any', 'Follow up two days later if there is no answer'] },
      { id: `${P('hvac')}-follow`, name: 'Follow-up', color: '#f59e0b', playbook: ['Answer their questions', 'Note any competing quote they mention'] },
      { id: `${P('hvac')}-won`, name: 'Job won', color: '#22c55e', playbook: ['Schedule the work', 'Order the equipment', 'Apply for any permit the job needs'] },
      { id: `${P('hvac')}-done`, name: 'Job complete', color: '#16a34a', playbook: ['Confirm it complete in Jobs & revenue, with the final amount', 'Record each payment as it arrives', 'Ask the customer for a review'] },
    ],
  },
  fields: [
    { key: 'hvac_service', label: 'Service needed (repair, replacement, maintenance)' },
    { key: 'hvac_system', label: 'System type (furnace, heat pump, AC, boiler)' },
    { key: 'hvac_system_age', label: 'System age' },
    { key: 'hvac_fuel', label: 'Fuel (gas, electric, oil, propane)' },
    { key: 'property_type', label: 'Property (home, rental, commercial)' },
    { key: 'hvac_plan', label: 'Maintenance plan member' },
  ],
  templates: ['speed-to-lead', 'missed-call', 'quote-chase', 'appointment-reminders', 'review-request'],
};

const ROOFING: Snapshot = {
  id: 'roofing', industry: 'roofing', version: 1,
  title: 'Roofing contractor',
  summary: 'A roofing pipeline from enquiry through inspection, estimate and any insurance claim to the completed roof, with the roof and claim details a roofer records.',
  history: [{ version: 1, date: '2026-10-26', note: 'First version.' }],
  pipeline: {
    id: `${P('roofing')}-pipeline`, name: 'Roofing jobs',
    stages: [
      { id: `${P('roofing')}-new`, name: 'New enquiry', color: '#6366f1', playbook: ['Call back as soon as you can during business hours', 'Ask what they have noticed: a leak, storm damage or an ageing roof'] },
      { id: `${P('roofing')}-inspect`, name: 'Inspection booked', color: '#0ea5e9', playbook: ['Confirm the inspection time', 'Ask whether they have opened an insurance claim'] },
      { id: `${P('roofing')}-estimate`, name: 'Estimate sent', color: '#3b82f6', playbook: ['Send the written estimate with photos from the inspection', 'Follow up two days later if there is no answer'] },
      { id: `${P('roofing')}-claim`, name: 'Insurance claim', color: '#a855f7', playbook: ['Record the carrier and claim number', 'Note the adjuster visit date', 'Keep the homeowner told of each step'] },
      { id: `${P('roofing')}-signed`, name: 'Contract signed', color: '#22c55e', playbook: ['Schedule the work', 'Order materials', 'Apply for any permit the job needs'] },
      { id: `${P('roofing')}-done`, name: 'Job complete', color: '#16a34a', playbook: ['Confirm it complete in Jobs & revenue, with the final amount', 'Record each payment as it arrives, including the insurer’s', 'Ask the customer for a review'] },
    ],
  },
  fields: [
    { key: 'roof_material', label: 'Roof material (shingle, metal, tile, flat)' },
    { key: 'roof_age', label: 'Roof age' },
    { key: 'roof_issue', label: 'What they noticed (leak, storm damage, age)' },
    { key: 'roof_stories', label: 'Number of stories' },
    { key: 'insurance_carrier', label: 'Insurance carrier' },
    { key: 'insurance_claim', label: 'Insurance claim number' },
    { key: 'property_type', label: 'Property (home, rental, commercial)' },
  ],
  templates: ['speed-to-lead', 'missed-call', 'quote-chase', 'appointment-reminders', 'stale-deal', 'review-request'],
};

/* The practices a billing service sells to — never their patients. A CRM
   record here is a practice; patient data belongs only in the RCM module
   (phase 4), after a BAA, and the first checklist says so. */
const MEDICAL: Snapshot = {
  id: 'medical_billing', industry: 'medical-billing', version: 1,
  title: 'Medical billing service',
  summary: 'A pipeline for bringing a medical practice on as a billing client — enquiry, assessment, proposal, BAA and onboarding — with the practice details an assessment needs. It holds practices, never patients.',
  history: [{ version: 1, date: '2026-10-26', note: 'First version.' }],
  pipeline: {
    id: `${P('medical_billing')}-pipeline`, name: 'Practice onboarding',
    stages: [
      { id: `${P('medical_billing')}-new`, name: 'New practice enquiry', color: '#6366f1', playbook: ['Reply the same working day', 'Do not ask for or accept any patient information at this stage'] },
      { id: `${P('medical_billing')}-discovery`, name: 'Discovery call', color: '#0ea5e9', playbook: ['Ask about specialty, providers, locations and payers', 'Ask which billing work they need and whether there is a backlog'] },
      { id: `${P('medical_billing')}-assessment`, name: 'Assessment', color: '#3b82f6', playbook: ['Review their current workflow with summary figures only', 'Note the integrations onboarding would need'] },
      { id: `${P('medical_billing')}-proposal`, name: 'Proposal sent', color: '#f59e0b', playbook: ['Send the written proposal and its pricing basis', 'Follow up after a few working days'] },
      { id: `${P('medical_billing')}-baa`, name: 'BAA signed', color: '#a855f7', playbook: ['Have the Business Associate Agreement signed before any patient data is shared', 'Record the date it was signed'] },
      { id: `${P('medical_billing')}-onboarding`, name: 'Onboarding', color: '#22c55e', playbook: ['Set up access to their systems', 'Agree reporting dates and named contacts'] },
      { id: `${P('medical_billing')}-live`, name: 'Live client', color: '#16a34a', playbook: ['Hold the first monthly review'] },
    ],
  },
  fields: [
    { key: 'practice_specialty', label: 'Specialty' },
    { key: 'practice_providers', label: 'Number of providers' },
    { key: 'practice_locations', label: 'Number of locations' },
    { key: 'practice_ehr', label: 'EHR / practice-management system' },
    { key: 'practice_claims', label: 'Approximate monthly claim volume' },
    { key: 'practice_billing_now', label: 'Billing today (in-house or a company)' },
    { key: 'practice_baa_date', label: 'BAA signed on' },
  ],
  templates: ['speed-to-lead', 'appointment-reminders', 'stage-proposal', 'stale-deal'],
};

/* For the practice's own workspace, when the billing service runs one for
   it: the follow-up work between the practice and the billing team, at the
   level of a work item — never a patient. Claims, remittances and A/R live in
   Medical billing (/rcm), which stays on synthetic data until its launch
   checklist is cleared; this pipeline must never become a way round that, and
   its first checklist says so. */
const MEDICAL_PRACTICE: Snapshot = {
  id: 'medical_practice', industry: 'medical-billing', version: 1,
  title: 'Medical practice (billing client)',
  summary: 'For a practice whose billing we run: a pipeline for the billing follow-up work between the practice and the billing team — documents asked for, payer follow-up, appeals — and the practice-level details billing needs. No patient details: claims stay in Medical billing.',
  history: [{ version: 1, date: '2026-10-28', note: 'First version.' }],
  pipeline: {
    id: `${P('medical_practice')}-pipeline`, name: 'Billing follow-up',
    stages: [
      { id: `${P('medical_practice')}-raised`, name: 'Issue raised', color: '#6366f1', playbook: ['Describe the issue by claim reference from Medical billing, never by patient name or date of birth', 'Name who at the practice owns it'] },
      { id: `${P('medical_practice')}-docs`, name: 'Waiting on practice', color: '#f59e0b', playbook: ['Ask for the missing document or answer through Medical billing → Messages', 'Follow up after two working days'] },
      { id: `${P('medical_practice')}-payer`, name: 'Waiting on payer', color: '#0ea5e9', playbook: ['Record the call reference or portal answer in the claim itself', 'Set the next follow-up date'] },
      { id: `${P('medical_practice')}-appeal`, name: 'Correction or appeal', color: '#a855f7', playbook: ['Check the appeal or corrected-claim deadline', 'Have a person review the correction before it is sent'] },
      { id: `${P('medical_practice')}-resolved`, name: 'Resolved', color: '#16a34a', playbook: ['Note the outcome on the claim', 'Mention it in the monthly report'] },
    ],
  },
  fields: [
    { key: 'practice_specialty', label: 'Specialty' },
    { key: 'practice_pm_system', label: 'Practice-management / EHR system' },
    { key: 'practice_main_payers', label: 'Main payers' },
    { key: 'practice_billing_contact', label: 'Billing contact at the practice' },
    { key: 'practice_report_day', label: 'Monthly report day' },
  ],
  templates: ['ticket-triage', 'stale-deal'],
};

/* An online seller run under the e-commerce management service: customers
   from first enquiry to repeat buyer, and the store details the service team
   records. Marketplaces are not connected to Protected Central; the stages
   are where people record what they did there. */
const ECOMMERCE: Snapshot = {
  id: 'ecommerce', industry: 'ecommerce', version: 1,
  title: 'E-commerce store',
  summary: 'A customer pipeline for an online seller — enquiry, first order, follow-up, repeat buyer, win-back — with the store and marketplace details the service records. It does not connect a marketplace: orders and listings on Amazon, eBay or Walmart are worked there and noted here.',
  history: [{ version: 1, date: '2026-10-28', note: 'First version.' }],
  pipeline: {
    id: `${P('ecommerce')}-pipeline`, name: 'Store customers',
    stages: [
      { id: `${P('ecommerce')}-enquiry`, name: 'New enquiry', color: '#6366f1', playbook: ['Answer product and shipping questions the same working day', 'Note which channel they came from (store, marketplace, social, ad)'] },
      { id: `${P('ecommerce')}-cart`, name: 'Cart or quote', color: '#0ea5e9', playbook: ['Follow up an abandoned cart or a bulk-order quote once', 'Only email or text people who agreed to hear from you'] },
      { id: `${P('ecommerce')}-first`, name: 'First order', color: '#3b82f6', playbook: ['Send the thank-you and what to expect on delivery', 'Open a ticket at once for any delivery or product problem'] },
      { id: `${P('ecommerce')}-review`, name: 'Review asked', color: '#f59e0b', playbook: ['Ask for a review once the order has arrived', 'Hand an unhappy reply to a person before anything else'] },
      { id: `${P('ecommerce')}-repeat`, name: 'Repeat customer', color: '#22c55e', playbook: ['Remind them before they would usually reorder', 'Tag them for the segment their purchases fit'] },
      { id: `${P('ecommerce')}-lapsed`, name: 'Lapsed — win back', color: '#a855f7', playbook: ['One useful message, then an offer, then stop', 'Never message somebody who unsubscribed'] },
    ],
  },
  fields: [
    { key: 'ecom_channel', label: 'Where they bought (Shopify, Amazon, eBay, Walmart, other)' },
    { key: 'ecom_first_order', label: 'First order date' },
    { key: 'ecom_last_order', label: 'Last order date' },
    { key: 'ecom_orders', label: 'Number of orders' },
    { key: 'ecom_segment', label: 'Segment (product interest)' },
    { key: 'marketing_consent', label: 'Marketing consent (email / SMS, and when given)' },
  ],
  templates: ['unpaid-order', 'thank-buyer', 'review-request', 'unhappy-first', 'reorder-reminder', 'dormant-winback', 'ticket-triage'],
};

export const SNAPSHOTS: readonly Snapshot[] = [HVAC, ROOFING, MEDICAL, MEDICAL_PRACTICE, ECOMMERCE];

export const snapshotById = (id: unknown): Snapshot | undefined => SNAPSHOTS.find(s => s.id === id);
export const snapshotForIndustry = (slug: unknown): Snapshot | undefined => SNAPSHOTS.find(s => s.industry === slug);

/* ── Validation ─────────────────────────────────────────────────────────── */

const HEX = /^#[0-9a-f]{6}$/i;
const FIELD_KEY = /^[a-z][a-z0-9_]{1,39}$/;
/* No prices or percentages in a checklist: a snapshot is structure, not a promise. */
const FIGURE = /[$%£€]/;

/** Everything wrong with a snapshot, in words; empty when it is fit to install. */
export function validateSnapshot(s: Snapshot): string[] {
  const out: string[] = [];
  const pre = `${P(s.id)}-`;
  if (!Number.isInteger(s.version) || s.version < 1) out.push('The version is a whole number from 1.');
  if (!s.history.some(h => h.version === s.version)) out.push(`Version ${s.version} has no history note.`);
  if (!s.title.trim() || s.title.length > 60) out.push('The title is missing or longer than 60 characters.');
  if (!s.pipeline.id.startsWith(pre)) out.push(`The pipeline id must start "${pre}".`);
  if (!s.pipeline.name.trim()) out.push('The pipeline has no name.');
  if (s.pipeline.stages.length < 3 || s.pipeline.stages.length > 12) out.push('A pipeline has between 3 and 12 stages.');
  const stageIds = new Set<string>();
  for (const st of s.pipeline.stages) {
    if (!st.id.startsWith(pre)) out.push(`Stage "${st.name}" has an id outside "${pre}".`);
    if (stageIds.has(st.id)) out.push(`Two stages share the id "${st.id}".`);
    stageIds.add(st.id);
    if (!st.name.trim() || st.name.length > 40) out.push(`Stage "${st.id}" needs a name of up to 40 characters.`);
    if (!HEX.test(st.color)) out.push(`Stage "${st.name}" has a colour that is not #rrggbb.`);
    if (st.playbook.length > 8) out.push(`Stage "${st.name}" has more than 8 checklist items.`);
    for (const t of st.playbook) {
      if (!t.trim() || t.length > 160) out.push(`A checklist item in "${st.name}" is empty or longer than 160 characters.`);
      if (FIGURE.test(t)) out.push(`A checklist item in "${st.name}" quotes a price or percentage.`);
    }
  }
  const keys = new Set<string>();
  for (const f of s.fields) {
    if (!FIELD_KEY.test(f.key)) out.push(`Field key "${f.key}" is not lower-case letters, digits and underscores.`);
    if (keys.has(f.key)) out.push(`Two fields share the key "${f.key}".`);
    keys.add(f.key);
    if (!f.label.trim() || f.label.length > 80) out.push(`Field "${f.key}" needs a label of up to 80 characters.`);
  }
  return out;
}

/* ── Planning an install ────────────────────────────────────────────────── */

export type ItemStatus = 'add' | 'present' | 'removed' | 'restore';
export interface PlanItem { key: string; kind: 'pipeline' | 'stage' | 'field'; label: string; status: ItemStatus }

/** The stored shapes, as the app's AppContext keeps them. Anything else on a record is kept as it is. */
interface StoredStage { id: string; name?: string; [k: string]: unknown }
interface StoredPipeline { id: string; name?: string; stages?: StoredStage[]; [k: string]: unknown }
interface StoredField { key: string; label?: string; [k: string]: unknown }

export interface InstallPlan {
  items: PlanItem[];
  /** Whether installing would change anything. */
  changes: boolean;
  /** The documents to write; null where that document is unchanged. */
  pipelines: string | null;
  fields: string | null;
}

export const itemKeys = {
  pipeline: (id: string) => `pipeline:${id}`,
  stage: (pid: string, sid: string) => `stage:${pid}/${sid}`,
  field: (key: string) => `field:${key}`,
};

function parseList<T>(raw: string | null, ok: (v: unknown) => v is T): T[] | null {
  if (raw === null || raw === '') return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter(ok) : null;
  } catch { return null; }
}
const isPipeline = (v: unknown): v is StoredPipeline => !!v && typeof v === 'object' && typeof (v as StoredPipeline).id === 'string';
const isField = (v: unknown): v is StoredField => !!v && typeof v === 'object' && typeof (v as StoredField).key === 'string';

/** The record-level stamp CLAUDE.md asks of anything a setup creates (src/types/provenance.ts). */
const stamp = (s: Snapshot, at: string) => ({ origin: 'industry-snapshot', title: `${s.title} snapshot`, refId: `${s.id}@${s.version}`, route: '/snapshots', at });

const toStage = (st: SnapStage, source: ReturnType<typeof stamp>) => ({
  id: st.id, name: st.name, color: st.color, deals: [],
  playbook: st.playbook.map((text, i) => ({ id: `${st.id}-t${i + 1}`, text })),
  source,
});

/**
 * What installing `s` would do to these two documents, and the documents after.
 *
 * `prior` is every item key earlier installs of this snapshot added to this
 * workspace; an item in it that is no longer there was deleted by the
 * customer and is left out unless `restore` is set. Refuses (null) when a
 * document cannot be read as a list, rather than replacing something it does
 * not understand.
 */
export function planInstall(
  s: Snapshot, pipelinesRaw: string | null, fieldsRaw: string | null,
  prior: Iterable<string>, restore = false, at = new Date().toISOString(),
): InstallPlan | null {
  const pipes = parseList(pipelinesRaw, isPipeline);
  const fields = parseList(fieldsRaw, isField);
  if (!pipes || !fields) return null;
  const had = new Set(prior);
  const items: PlanItem[] = [];
  const gone = (key: string) => had.has(key);
  const src = stamp(s, at);

  let pipesChanged = false;
  const nextPipes: (StoredPipeline & { stages: StoredStage[] })[] = pipes.map(p => ({ ...p, stages: Array.isArray(p.stages) ? [...p.stages] : [] }));
  const pKey = itemKeys.pipeline(s.pipeline.id);
  const existing = nextPipes.find(p => p.id === s.pipeline.id);
  if (!existing) {
    if (gone(pKey) && !restore) {
      items.push({ key: pKey, kind: 'pipeline', label: s.pipeline.name, status: 'removed' });
    } else {
      nextPipes.push({ id: s.pipeline.id, name: s.pipeline.name, stages: s.pipeline.stages.map(st => toStage(st, src)), source: src });
      pipesChanged = true;
      items.push({ key: pKey, kind: 'pipeline', label: s.pipeline.name, status: gone(pKey) ? 'restore' : 'add' });
      for (const st of s.pipeline.stages) items.push({ key: itemKeys.stage(s.pipeline.id, st.id), kind: 'stage', label: st.name, status: gone(pKey) ? 'restore' : 'add' });
    }
  } else {
    items.push({ key: pKey, kind: 'pipeline', label: String(existing.name ?? s.pipeline.name), status: 'present' });
    const stages = existing.stages as StoredStage[];
    s.pipeline.stages.forEach((st, i) => {
      const key = itemKeys.stage(s.pipeline.id, st.id);
      const found = stages.find(x => x && x.id === st.id);
      if (found) { items.push({ key, kind: 'stage', label: String(found.name ?? st.name), status: 'present' }); return; }
      if (gone(key) && !restore) { items.push({ key, kind: 'stage', label: st.name, status: 'removed' }); return; }
      /* After the nearest earlier snapshot stage the customer still has, so a
         new stage lands where the snapshot means it; first if there is none. */
      let pos = 0;
      for (let j = i - 1; j >= 0; j--) {
        const idx = stages.findIndex(x => x && x.id === s.pipeline.stages[j].id);
        if (idx >= 0) { pos = idx + 1; break; }
      }
      stages.splice(pos, 0, toStage(st, src));
      pipesChanged = true;
      items.push({ key, kind: 'stage', label: st.name, status: gone(key) ? 'restore' : 'add' });
    });
  }

  let fieldsChanged = false;
  const nextFields = [...fields];
  for (const f of s.fields) {
    const key = itemKeys.field(f.key);
    const found = nextFields.find(x => x.key === f.key);
    if (found) { items.push({ key, kind: 'field', label: String(found.label ?? f.label), status: 'present' }); continue; }
    if (gone(key) && !restore) { items.push({ key, kind: 'field', label: f.label, status: 'removed' }); continue; }
    nextFields.push({ key: f.key, label: f.label, createdAt: at, source: src });
    fieldsChanged = true;
    items.push({ key, kind: 'field', label: f.label, status: gone(key) ? 'restore' : 'add' });
  }

  return {
    items,
    changes: pipesChanged || fieldsChanged,
    pipelines: pipesChanged ? JSON.stringify(nextPipes) : null,
    fields: fieldsChanged ? JSON.stringify(nextFields) : null,
  };
}

/** Counts for a plan, for a one-line summary. */
export function planCounts(items: PlanItem[]): Record<ItemStatus, number> {
  const c: Record<ItemStatus, number> = { add: 0, present: 0, removed: 0, restore: 0 };
  for (const i of items) c[i.status]++;
  return c;
}
