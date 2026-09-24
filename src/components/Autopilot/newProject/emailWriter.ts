/**
 * Making a template's emails this business's emails.
 *
 * The gallery's email workflows were each written for one trade, and the
 * wizard copied them as they stood — so an Amazon FBA agency's campaign told
 * its prospects to check their boiler pressure before winter. Before a
 * workflow is saved, every email in it is rewritten from the client's business
 * profile and the project's strategy (routes/intake.ts `write_emails`), keeping
 * what each step is for.
 *
 * Without the AI, the emails are replaced by plain ones built from the profile
 * — an honest introduction, the offer, the booking line — rather than kept in
 * another trade's words. Either way they are a draft: the workflow is saved
 * switched off and says so.
 */
import type { WorkflowNode } from '../../../services/autopilot';
import { writeEmails } from '../../../services/intake';

export interface TailorContext {
  business: { companyName: string; description: string; audience?: string; offer?: string; website?: string; tone?: string };
  workflow: string;
  purpose: string;
  objective: string;
  /** 'page' — our booking page ({{bookingLink}}); 'own' — their URL; 'none'. */
  booking: 'page' | 'own' | 'none';
  bookingUrl?: string;
}

export interface Tailored { nodes: WorkflowNode[]; how: 'ai' | 'plain' | 'none'; note: string }

const firstSentence = (s: string) => (s.split(/(?<=[.!?])\s/)[0] ?? s).trim().replace(/[.!?]*$/, '');

/** A plain email for one step, from the profile, when the AI cannot write it. */
export function plainEmail(intent: string, index: number, total: number, ctx: TailorContext): { subject: string; body: string } {
  const what = firstSentence(ctx.business.description).replace(/^(we|i)\s+/i, '');
  const offer = ctx.business.offer ? firstSentence(ctx.business.offer) : '';
  const book = ctx.booking === 'none' ? '' : 'If it would help to talk it through, pick a time here:\n{{bookingLink}}';
  const last = total > 1 && (index === total - 1 || /stop|close|last|leave/i.test(intent));
  const intro = `I'm writing from {{myCompany}} — ${what.charAt(0).toLowerCase()}${what.slice(1)}.`;
  if (last) {
    return {
      subject: 'Shall I close this off, {{firstName}}?',
      body: `Hello {{firstName}},\n\n${intro} I have written a couple of times and not heard back, so this is the last one from me.\n\nIf now is not the right time, no problem at all. If it is, just reply and I will pick it up.\n\n{{senderName}}`,
    };
  }
  if (index === 0) {
    return {
      subject: `{{firstName}}, a quick note from {{myCompany}}`,
      body: `Hello {{firstName}},\n\n${intro}\n\n${offer ? `${offer}. ` : ''}I thought it might be relevant to you${ctx.business.audience ? `, as we work with ${firstSentence(ctx.business.audience).toLowerCase()}` : ''}.\n\n${book || 'Reply to this email if you would like to know more.'}\n\n{{senderName}}`,
    };
  }
  return {
    subject: 'Following up, {{firstName}}',
    body: `Hello {{firstName}},\n\nJust following up on my last note from {{myCompany}}. ${offer ? `${offer}.` : ''}\n\n${book || 'If you have any questions, reply and I will answer them.'}\n\n{{senderName}}`,
  };
}

export async function tailorEmails(nodes: WorkflowNode[], ctx: TailorContext): Promise<Tailored> {
  const emails = nodes.filter(n => n.type === 'send_email');
  if (!emails.length) return { nodes, how: 'none', note: '' };
  const out = nodes.map(n => ({ ...n, config: { ...n.config } }));
  const byId = new Map(out.map(n => [n.id, n]));

  const written = new Set<string>();
  let note = '';
  if (ctx.business.companyName && ctx.business.description.trim().length >= 8) {
    const r = await writeEmails({
      business: ctx.business,
      strategy: { workflow: ctx.workflow, purpose: ctx.purpose, objective: ctx.objective, booking: ctx.booking !== 'none' },
      emails: emails.map(e => ({ id: e.id, intent: e.label, subject: String(e.config.subject ?? ''), body: String(e.config.body ?? '') })),
    });
    if (r.ok) {
      for (const e of r.emails) {
        const n = byId.get(e.id);
        if (n) { n.config.subject = e.subject; n.config.body = e.body; written.add(e.id); }
      }
    } else {
      note = r.noAi ? 'the AI was not available' : r.error;
    }
  } else {
    note = 'the business profile is too thin to write from';
  }
  /* Whatever the AI did not write becomes a plain draft from the profile —
     never left in another trade's words. */
  emails.forEach((e, i) => {
    if (!written.has(e.id)) Object.assign(byId.get(e.id)!.config, plainEmail(e.label, i, emails.length, ctx));
  });
  const how: Tailored['how'] = written.size === emails.length ? 'ai' : 'plain';
  note = how === 'ai'
    ? `${emails.length} email${emails.length === 1 ? '' : 's'} written for ${ctx.business.companyName}.`
    : written.size
      ? `${written.size} of ${emails.length} emails written for ${ctx.business.companyName}; the rest are plain drafts from the profile.`
      : `Emails written as plain drafts from the profile${note ? ` (${note})` : ''} — edit them on the workflow.`;

  /* Their own booking link is known now, so it is written in; ours is filled
     at send time from the booking page. */
  if (ctx.booking === 'own' && ctx.bookingUrl) {
    for (const n of out) {
      if (n.type === 'send_email') n.config.body = String(n.config.body ?? '').replace(/\{\{\s*bookingLink\s*\}\}/g, ctx.bookingUrl);
    }
  }
  return { nodes: out, how, note };
}
