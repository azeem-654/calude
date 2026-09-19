/**
 * What happens to a lead the moment it arrives.
 *
 * ── The gap this closes ──
 *
 * Forms, the chat agent and the voice agent all capture people. Until now that
 * was where it stopped: `mergeCaptured()` turned a capture into a contact and
 * the contact sat in a list. A contact in a list is not a lead being worked —
 * somebody has to notice it, open the pipeline, and make a deal by hand. Which
 * is the part that does not happen on a Friday afternoon.
 *
 * So an arriving lead can be routed, once, at the moment it becomes a contact:
 * a deal on the board where the work is actually tracked, and — only if
 * somebody has chosen it — enrolment in a follow-up sequence.
 *
 * ── Why the sequence is off by default and the deal is on ──
 *
 * They are not the same kind of act. Creating a deal is bookkeeping inside the
 * customer's own workspace: worst case it is a card to drag to the bin. Putting
 * a stranger into an email sequence *sends them mail*, and this codebase's
 * standing rule is that anything that sends defaults to needing a person — the
 * same reason `sendEmail` in the Autopilot guardrails defaults to `'approval'`.
 *
 * A form somebody filled in asking to be contacted is consent to be contacted,
 * so the option is offered plainly and takes one click. It is just not assumed.
 *
 * ── Why routing is idempotent ──
 *
 * `mergeCaptured()` is safe to call repeatedly and is called on a timer. If
 * routing were not, a page left open would grow a new deal for the same person
 * every couple of minutes. A lead is routed once: a deal already carrying its
 * contact id is enough to stop, and so is an existing enrolment.
 */
import type { Deal, Pipeline } from '../types';
import type { SequenceEnrollment } from './contactEmail';
import type { EmailSequence } from '../types/marketing';

const ROUTING_KEY = 'crm_lead_routing';
const PIPELINES_KEY = 'crm_pipelines';
const ENROLL_KEY = 'crm_sequence_enrollments';
const SEQ_KEY = 'crm_sequences';

export interface LeadRouting {
  /** Put an arriving lead on the board. On by default — see the header. */
  createDeal: boolean;
  /** Empty means "the first pipeline", which is what a workspace with one has. */
  pipelineId: string;
  /** Empty means "the first stage", which is where a new lead belongs. */
  stageId: string;
  /** What a new deal is worth before anybody has asked. 0 means unset. */
  dealValue: number;
  /** Empty means no sequence. Setting it is a decision to send mail. */
  sequenceId: string;
}

export const DEFAULT_ROUTING: LeadRouting = {
  createDeal: true,
  pipelineId: '',
  stageId: '',
  dealValue: 0,
  sequenceId: '',
};

function read<T>(key: string, fallback: T): T {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return (v ?? fallback) as T; } catch { return fallback; }
}

function write(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export const loadRouting = (): LeadRouting => ({ ...DEFAULT_ROUTING, ...read<Partial<LeadRouting>>(ROUTING_KEY, {}) });
export const saveRouting = (r: LeadRouting): boolean => write(ROUTING_KEY, r);

/** A lead as it arrives, whichever channel produced it. */
export interface ArrivingLead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  /** Where it came from, for the deal's source stamp: "form", "chat", "voice". */
  channel: string;
}

export interface RoutingResult {
  deals: number;
  enrolled: number;
  /** Said plainly rather than swallowed — a routing that could not run is a
   *  lead nobody is working, and silence about it is the worst outcome. */
  problems: string[];
}

/**
 * Put arriving leads on the board and, if configured, into a sequence.
 *
 * Reads and writes storage directly rather than going through AppContext: the
 * merge that calls this runs on a timer with no component mounted, and the
 * refresh event is what brings the result onto the screen.
 */
export function routeLeads(leads: ArrivingLead[]): RoutingResult {
  const out: RoutingResult = { deals: 0, enrolled: 0, problems: [] };
  if (!leads.length) return out;

  const routing = loadRouting();

  if (routing.createDeal) {
    const pipelines = read<Pipeline[]>(PIPELINES_KEY, []);
    const pipeline = pipelines.find(p => p.id === routing.pipelineId) ?? pipelines[0];
    if (!pipeline) {
      out.problems.push('No pipeline exists yet, so there is nowhere to put a deal. New leads are still saved as contacts.');
    } else {
      const stage = pipeline.stages.find(s => s.id === routing.stageId) ?? pipeline.stages[0];
      if (!stage) {
        out.problems.push(`"${pipeline.name}" has no stages, so there is nowhere to put a deal.`);
      } else {
        /* Every deal already on this pipeline, so a lead routed on an earlier
           tick is not routed again. Across all stages, not just the first —
           somebody may already have dragged it along. */
        const seen = new Set<string>();
        for (const s of pipeline.stages) for (const d of s.deals ?? []) if (d.contactId) seen.add(d.contactId);

        for (const lead of leads) {
          if (!lead.id || seen.has(lead.id)) continue;
          const deal: Deal = {
            id: `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            title: lead.name || lead.email || 'New enquiry',
            contactId: lead.id,
            contactName: lead.name || lead.email || 'New enquiry',
            contactEmail: lead.email,
            contactPhone: lead.phone ?? '',
            value: Math.max(0, Math.round(routing.dealValue)),
            stage: stage.id,
            probability: 10,
            expectedClose: '',
            assignedTo: '',
            createdAt: new Date().toISOString(),
            status: 'active',
            source: `engagement:${lead.channel}`,
            /* The stage's own playbook, so a routed deal starts with the same
               checklist one created by hand would have. */
            checklist: (stage.playbook ?? []).map(t => ({ id: `ck-${Math.random().toString(36).slice(2, 8)}`, text: t.text, done: false })),
          };
          stage.deals = [deal, ...(stage.deals ?? [])];
          seen.add(lead.id);
          out.deals += 1;
        }
        if (out.deals && !write(PIPELINES_KEY, pipelines)) {
          out.problems.push('The browser refused to save the new deals. Check that storage is not blocked for this site.');
          out.deals = 0;
        }
      }
    }
  }

  if (routing.sequenceId) {
    const sequences = read<EmailSequence[]>(SEQ_KEY, []);
    const seq = sequences.find(s => s.id === routing.sequenceId);
    if (!seq) {
      out.problems.push('The sequence new leads were set to join no longer exists. Pick another in Engagement → Settings.');
    } else {
      const enrollments = read<SequenceEnrollment[]>(ENROLL_KEY, []);
      const already = new Set(enrollments.filter(e => e.sequenceId === seq.id).map(e => e.contactId));
      const now = new Date().toISOString();
      for (const lead of leads) {
        if (!lead.id || !lead.email || already.has(lead.id)) continue;
        enrollments.unshift({
          id: `en-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          contactId: lead.id,
          sequenceId: seq.id,
          sequenceName: seq.name,
          status: 'active',
          currentStep: 0,
          totalSteps: seq.steps.length,
          enrolledAt: now,
          /* Due immediately: the first email of a follow-up is the reply to an
             enquiry, and a day-one wait on it is a day of silence after
             somebody asked to be contacted. The sending tick still applies the
             mailbox, the suppression list and the daily cap. */
          nextSendAt: now,
          history: [],
        });
        already.add(lead.id);
        out.enrolled += 1;
      }
      if (out.enrolled && !write(ENROLL_KEY, enrollments)) {
        out.problems.push('The browser refused to save the sequence enrolments.');
        out.enrolled = 0;
      }
    }
  }

  return out;
}
