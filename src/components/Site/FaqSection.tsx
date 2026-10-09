/**
 * The questions a visitor has between "this looks right" and pressing the
 * button. Every answer is true of the running product — the trial and its end
 * (lib/trial.ts), drafts and approvals (Autopilot guardrails), where prospects
 * come from (AI Prospecting), and security (docs/SECURITY.md §7 wording).
 */
import { Plus } from 'lucide-react';

const FAQ: { q: string; a: string }[] = [
  {
    q: 'What happens after I sign up?',
    a: 'If you made a plan with Find my solution, your AI Autopilot project is built straight away from your answers — its workflows, schedules and first outputs — and you land in it, not on an empty dashboard. Otherwise you describe what you want in one sentence and it is built the same way.',
  },
  {
    q: 'Do I need a credit card?',
    a: 'No. Every account starts with 7 days free and no card. When the trial ends you choose a plan to keep the AI and the automations running; your records, mailbox and anything you made stay yours, and you can export them from Settings at any time.',
  },
  {
    q: 'Will it email or text anybody without me?',
    a: 'No. Anything that emails or texts starts as a draft, and new prospects are proposed in batches that wait for your approval. What each project may do on its own is a setting you can see and change.',
  },
  {
    q: 'What do I need to connect?',
    a: 'Only what your plan uses. Content, workflows, the CRM and the AI work as soon as you sign up. Sending email needs your own mailbox (Gmail, Microsoft 365, Brevo or any SMTP); texts need a number; a shop needs a payment account. The plan tells you which, before you sign up.',
  },
  {
    q: 'Is the AI included?',
    a: 'Yes — no key of your own, no separate AI subscription. It reads your request, writes the workflows and the content, and every step it makes is shown to you before it runs.',
  },
  {
    q: 'Where do new leads come from?',
    a: 'AI Prospecting searches public business directories and the businesses’ own websites live, and checks every address before it is used. It does not scrape LinkedIn.',
  },
  {
    q: 'Can I resell it to my own clients?',
    a: 'Yes. Each client gets their own workspace under your name and logo, and you set your own price. How many clients depends on your plan.',
  },
  {
    q: 'Is my business data safe?',
    a: 'Each workspace is separated from every other and every request is checked on the server. Passwords are hashed, the credentials you connect are encrypted and never shown back to a browser, and you can export or delete your data. The Security & Privacy page lists exactly what goes where.',
  },
];

export default function FaqSection() {
  return (
    <section className="dc-faq" id="faq" aria-label="Questions">
      <div className="dc-chapter-head">
        <span className="dc-eyebrow">Questions</span>
        <h2>Before you <em>start.</em></h2>
      </div>
      <div className="dc-faq-list">
        {FAQ.map(f => (
          <details key={f.q} className="dc-faq-item">
            <summary><span>{f.q}</span><Plus size={18} aria-hidden="true" /></summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
