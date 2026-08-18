/**
 * Running the graph.
 *
 * Nothing here does any work of its own. Each node hands off to the service
 * that already owns that step — proposeStrategy, discover, buildCampaign,
 * reviseFunnel — so the canvas is a way of ordering and seeing the module, not
 * a second implementation of it. That was the rule the module was built under
 * and it is the reason a campaign run from the canvas and a campaign run from
 * the tabs produce the same records.
 *
 * Two things it will not do. It does not carry on past a node that failed when
 * everything after it depends on that node's output — a build with no plan
 * would report success having created nothing. And it never applies a rewrite:
 * that one proposes, and a person approves the wording on the Email tab, which
 * is the same rule the rest of the module works under.
 */
import { getCampaign, setStatus } from './aiCampaigns';
import { logDecision } from './aiDecisionLog';
import { crmContacts, discover, googlePlaces, leadsFor } from './aiDiscovery';
import { proposeStrategy } from './aiStrategy';
import { setStrategy } from './aiCampaigns';
import { buildCampaign, type OrchestrateApi } from './aiOrchestrator';
import { rollup, sequenceView, type RollupApi } from './aiRollup';
import { diagnose, reviseFunnel } from './aiRestrategy';
import { customerBusinessName } from './tenancy';
import { runnable } from './aiFlow';
import type { FlowGraph, FlowRunResult, FlowStepResult } from '../types/aiFlow';
import type { Contact } from '../types';

export interface FlowRunApi extends OrchestrateApi, RollupApi {
  contacts: Contact[];
}

/**
 * Walk the graph and do what each node says.
 *
 * `onStep` is called as each finishes so the canvas can light the node up while
 * the run is still going, rather than after everything has happened.
 */
export async function runFlow(
  campaignId: string,
  graph: FlowGraph,
  api: FlowRunApi,
  onStep?: (step: FlowStepResult) => void,
): Promise<FlowRunResult> {
  const steps: FlowStepResult[] = [];
  const record = (s: FlowStepResult) => { steps.push(s); onStep?.(s); return s; };

  const order = runnable(graph);
  if (!order.length) {
    return { ok: false, steps, stoppedBecause: 'Nothing on this canvas is wired up to run.' };
  }

  for (const node of order) {
    const campaign = getCampaign(campaignId);
    if (!campaign) {
      return { ok: false, steps, stoppedBecause: 'The campaign no longer exists.' };
    }

    if (node.kind === 'plan') {
      if (campaign.strategy) {
        record({ nodeId: node.id, kind: node.kind, ok: true, summary: 'Plan already agreed', detail: 'Left alone rather than overwritten — approve a new one from the Strategy tab if you want it changed.' });
        continue;
      }
      const proposal = await proposeStrategy(campaign.objective);
      const saved = !!setStrategy(campaignId, proposal.strategy);
      const step = record({
        nodeId: node.id, kind: node.kind, ok: saved,
        summary: saved ? `Plan worked out (${proposal.strategy.generatedBy === 'ai' ? 'by the model' : 'without a model'})` : 'The plan could not be saved',
        detail: proposal.strategy.summary,
      });
      if (!step.ok) return { ok: false, steps, stoppedBecause: 'The plan could not be saved, and everything after it needs one.' };
      continue;
    }

    if (node.kind === 'prospects') {
      const withPlan = getCampaign(campaignId);
      if (!withPlan?.strategy) {
        record({ nodeId: node.id, kind: node.kind, ok: false, summary: 'No plan to search from', detail: 'Join a Plan node to this one, or approve a plan first.' });
        return { ok: false, steps, stoppedBecause: 'There is no plan, so there is nothing to search for.' };
      }
      const which = node.config?.source === 'google-places' ? 'google-places' : 'crm';
      const source = which === 'crm' ? crmContacts(api.contacts) : googlePlaces;
      const run = await discover(campaignId, withPlan.strategy, {
        source,
        limit: which === 'crm' ? Math.max(1, withPlan.guardrails.dailyNewProspects) : 20,
      });
      record({
        nodeId: node.id, kind: node.kind, ok: run.ok,
        summary: run.ok ? `${run.added.length} found from ${which === 'crm' ? 'your contacts' : 'Google Places'}` : 'The search failed',
        detail: run.ok
          ? `${run.added.filter(l => l.status === 'qualified').length} match the plan.${run.duplicates ? ` ${run.duplicates} were already on the list.` : ''}`
          : run.error,
      });
      continue;
    }

    if (node.kind === 'build') {
      const ready = getCampaign(campaignId);
      if (!ready?.strategy) {
        record({ nodeId: node.id, kind: node.kind, ok: false, summary: 'Nothing to build from', detail: 'There is no agreed plan.' });
        return { ok: false, steps, stoppedBecause: 'A build needs a plan.' };
      }
      const result = buildCampaign(ready, api, new Date(), customerBusinessName());
      record({
        nodeId: node.id, kind: node.kind, ok: result.ok,
        summary: result.ok ? result.created.join('; ') : (result.error ?? 'Nothing could be built'),
        detail: result.blocked.join(' ') || undefined,
      });
      if (result.ok) setStatus(campaignId, 'running');
      continue;
    }

    if (node.kind === 'rewrite') {
      const live = getCampaign(campaignId);
      if (!live) continue;
      const views = sequenceView(live, api).filter(v => v.status !== 'missing').sort((a, b) => b.sent - a.sent);
      const view = views[0] ?? null;
      const seq = view ? api.sequences.find(s => s.id === view.id) : undefined;
      const finding = diagnose(view);

      if (!finding.rewritable || !seq || !view) {
        record({ nodeId: node.id, kind: node.kind, ok: true, summary: finding.headline, detail: `${finding.evidence} Nothing was changed.` });
        continue;
      }
      const revision = reviseFunnel(live, seq, view, { businessName: customerBusinessName() });
      record({
        nodeId: node.id, kind: node.kind, ok: true,
        summary: revision ? `A rewrite is ready: ${finding.headline.toLowerCase()}` : finding.headline,
        /* Proposed, never applied: the wording is a person's to approve. */
        detail: revision
          ? `${finding.evidence} Open the Email tab to read it and apply it — nothing has been changed yet.`
          : finding.evidence,
      });
      continue;
    }
  }

  const ok = steps.every(s => s.ok);
  logDecision(campaignId, {
    kind: 'plan',
    summary: `Flow run: ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`,
    because: steps.map(s => `${s.summary}.`).join(' '),
    counts: { steps: steps.length, failed: steps.filter(s => !s.ok).length },
  });
  return { ok, steps };
}

/**
 * What a node should show without running anything.
 *
 * Read live every render from whichever module owns the figure, the same way
 * the campaign tabs read them, so a node never displays a stale copy.
 */
export function nodeStatus(campaignId: string, api: FlowRunApi): Record<string, { value: string; note?: string }> {
  const campaign = getCampaign(campaignId);
  if (!campaign) return {};

  const leads = leadsFor(campaignId);
  const roll = rollup(campaign, api);
  const figure = (label: string) => roll.figures.find(f => f.label === label)?.value ?? null;
  const views = sequenceView(campaign, api).filter(v => v.status !== 'missing');
  const view = views.sort((a, b) => b.sent - a.sent)[0] ?? null;

  const dash = (n: number | null) => (n === null ? '—' : n.toLocaleString());

  return {
    objective: { value: campaign.objective ? 'Written' : 'Empty', note: campaign.objective.slice(0, 90) },
    plan: {
      value: campaign.strategy ? 'Agreed' : 'Not yet',
      note: campaign.strategy
        ? `${campaign.strategy.cadence.followUps} follow-ups, ${campaign.strategy.cadence.intervalDays} days apart`
        : 'Run this node to work one out',
    },
    prospects: {
      value: leads.length ? `${leads.length}` : '—',
      note: leads.length ? `${leads.filter(l => l.status === 'qualified' || l.status === 'promoted').length} match the plan` : 'Nothing searched yet',
    },
    build: {
      value: dash(figure('In your CRM')),
      note: views.length ? `${views.length} sequence${views.length === 1 ? '' : 's'} created` : 'No records yet',
    },
    sequence: {
      value: view ? view.status : '—',
      note: view ? `${view.enrolled} enrolled · ${view.sent} sent` : 'Nothing built yet',
    },
    send: {
      value: dash(figure('Sent')),
      note: `Cap ${campaign.guardrails.maxEmailsPerDay} a day`,
    },
    measure: {
      value: view && view.openRate !== null ? `${view.openRate}% opened` : dash(figure('Opened')),
      note: view && view.replyRate !== null ? `${view.replyRate}% replied` : 'Rates appear once there are enough sends',
    },
    rewrite: (() => {
      const d = diagnose(view);
      return { value: d.rewritable ? 'Worth doing' : 'Not now', note: d.headline };
    })(),
  };
}
