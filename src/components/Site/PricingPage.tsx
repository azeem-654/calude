/**
 * /pricing — the full pricing page on the public site.
 *
 * The cards and the comparison are PricingParts.tsx, generated from the plan
 * table the server enforces (worker/src/lib/allowances.ts). The white-label
 * section says only what the product does (routes/whitelabel.ts,
 * routes/resell.ts, routes/portal.ts); the billing answers only what the code
 * does (lib/trial.ts, the processors' portals). Custom's form lands in
 * `crm_enquiries`, which the install owner reads on Sign-ups & trials, and is
 * emailed to them when the install mailbox can send.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader } from 'lucide-react';
import { LogoMark } from '../shared/Logo';
import { appHref, isCrossOrigin } from '../../services/hosts';
import { usePageTitle } from '../../services/pageTitle';
import { CARD_PLANS, isUnlimited, sendEnquiry, type EnquiryNeed } from '../../services/allowances';
import { BillingToggle, ComparisonTable, PlanCards, usePlanTable } from './PricingParts';
import './site.css';

const cross = (href: string) => (isCrossOrigin(href) ? { rel: 'noopener' as const } : {});

const NEEDS: { id: EnquiryNeed; label: string }[] = [
  { id: 'limits', label: 'Higher allowances than Pro' },
  { id: 'setup', label: 'Done-for-you setup' },
  { id: 'integrations', label: 'A custom integration' },
  { id: 'invoice', label: 'Invoiced billing' },
  { id: 'other', label: 'Something else' },
];

export default function PricingPage() {
  usePageTitle('Pricing — Protected Central');
  const table = usePlanTable();
  const [yearly, setYearly] = useState(false);
  const formRef = useRef<HTMLElement | null>(null);
  const toForm = () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const home = typeof window !== 'undefined' && /^(www\.)?protectedcentral\.com$/.test(window.location.hostname) ? '/' : appHref('/');
  const sold = CARD_PLANS(table.plans).filter(p => p.kind === 'self');
  const count = (n: number, one: string, many: string) => (isUnlimited(n) ? `unlimited ${many}` : `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`);

  /* Arriving at /pricing#custom (the home page's Custom button) lands on the form. */
  useEffect(() => {
    if (window.location.hash === '#custom') setTimeout(() => formRef.current?.scrollIntoView({ block: 'start' }), 60);
  }, []);

  const faq: { q: string; a: string }[] = [
    { q: 'Is there a free trial?', a: `Yes — 7 days, and no card is asked for. The trial has its own allowance (${table.trial.limits.autopilot_projects} AI Autopilot business workspaces, ${table.trial.limits.ai_shorts} AI Shorts, ${table.trial.limits.social_posts} social posts, ${table.trial.limits.prospects_found} prospects found), enough to build a real project and see it work.` },
    { q: 'What happens when the trial ends?', a: 'The AI and the automations stop until you choose a plan. Everything you made stays in your workspace, and you can download all of it from Settings at any time.' },
    { q: 'How does yearly billing work?', a: 'You pay ten months’ price once a year — two months free — on the same plan and allowances. Prices are in US dollars.' },
    { q: 'Can I cancel?', a: 'Yes. Plan & billing → Manage billing & payment method opens the payment provider’s own portal, where you change your card, see invoices and cancel. When the provider tells us the subscription has ended, the AI and automations stop as they do at the end of a trial; your records stay yours.' },
    { q: 'What happens when I reach an allowance?', a: 'That one thing waits — a new business workspace, the month’s next Short or post — and the app says which allowance it is, how much is used and which plan raises it. Nothing is charged extra, and monthly allowances start again on the 1st.' },
    { q: 'Can I change plan?', a: 'Choose a larger plan from Plan & billing before you subscribe, or, once subscribed, write to us with the form below and we move you.' },
    { q: 'Who sees my card?', a: 'Nobody here. You pay on the payment provider’s own secure checkout; this app never sees or stores your card.' },
  ];

  return (
    <div className="dc pcp">
      <header className="dc-nav stuck">
        <a className="dc-brand" href={home}><LogoMark size={26} /><span>Protected Central</span></a>
        <div className="dc-nav-cta">
          <a className="dc-btn dc-btn-ghost" href={appHref('/login')} {...cross(appHref('/login'))}>Sign in</a>
          <a className="dc-btn dc-btn-primary" href={appHref('/signup')} {...cross(appHref('/signup'))}>Start free</a>
        </div>
      </header>

      <main className="pcp-main">
        <a className="tc-back" href={home}><ArrowLeft size={14} /> Back to the site</a>
        <div className="dc-chapter-head pcp-head">
          <span className="dc-eyebrow">Pricing</span>
          <h1 className="tc-h1">Three plans. <em>Or one built around you.</em></h1>
          <p>
            Every number below is what the product holds you to — not an estimate — and every plan is white-label.
            7 days free, no card required.
          </p>
        </div>
        <nav className="tc-toc pcp-toc" aria-label="On this page">
          <a href="#plans">Plans</a><a href="#compare">Compare every feature</a><a href="#white-label">White-label</a>
          <a href="#billing">Billing questions</a><a href="#custom">Custom plans</a>
        </nav>

        <section id="plans" className="pcp-sec">
          <BillingToggle yearly={yearly} onChange={setYearly} />
          <PlanCards table={table} yearly={yearly} customHref="#custom" onCustom={toForm} />
        </section>

        <section id="compare" className="pcp-sec">
          <h2 className="pcp-h2">Compare every feature</h2>
          <p className="pcp-lead">Every allowance and every feature, plan by plan. Ticks on every plan are things no plan holds back.</p>
          <ComparisonTable table={table} />
        </section>

        <section id="white-label" className="pcp-sec">
          <h2 className="pcp-h2">White-label, on every plan</h2>
          <p className="pcp-lead">Your clients see your business, not ours. What that means here:</p>
          <div className="tc-grid">
            <div className="tc-card">
              <h3 className="pcp-h3">Your brand on every workspace</h3>
              <ul>
                <li><Check size={13} /> <span>Your name, logo and colours on your workspace and on each client’s.</span></li>
                <li><Check size={13} /> <span>Each client gets a workspace of their own, under your brand, kept apart from every other.</span></li>
                <li><Check size={13} /> <span>Client report links show a client their business workspace’s progress — never your prices, costs or contacts.</span></li>
              </ul>
            </div>
            <div className="tc-card">
              <h3 className="pcp-h3">A login address that is yours</h3>
              <ul>
                <li><Check size={13} /> <span>A free address such as <b>yourname.protectedcentral.com</b>, live the moment you claim it, where your clients sign in to your branded login screen.</span></li>
                <li><Check size={13} /> <span>Or your own domain, with one DNS record — offered once it is switched on for this platform.</span></li>
                <li><Check size={13} /> <span>{sold.map(p => `${p.name}: ${count(p.limits.login_addresses, 'address', 'addresses')}`).join(' · ')}.</span></li>
              </ul>
            </div>
            <div className="tc-card">
              <h3 className="pcp-h3">Resell at your price</h3>
              <ul>
                <li><Check size={13} /> <span>Connect your own Stripe or Creem and set each client’s monthly price. Clients pay you; the money never passes through us.</span></li>
                <li><Check size={13} /> <span>{sold.map(p => `${p.name}: ${count(p.limits.sub_accounts, 'client sub-account', 'client sub-accounts')}`).join(' · ')}.</span></li>
              </ul>
            </div>
            <div className="tc-card">
              <h3 className="pcp-h3">More than that?</h3>
              <ul>
                <li><Check size={13} /> <span>Custom raises any of it — more addresses, more sub-accounts, more of every allowance — agreed with you.</span></li>
              </ul>
              <a className="dc-btn dc-btn-outline pcp-inline-btn" href="#custom" onClick={e => { e.preventDefault(); toForm(); }}>Tell us what you need <ArrowRight size={14} /></a>
            </div>
          </div>
        </section>

        <section id="billing" className="pcp-sec">
          <h2 className="pcp-h2">Billing questions</h2>
          <div className="pcp-faq">
            {faq.map(f => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="custom" className="pcp-sec" ref={formRef}>
          <h2 className="pcp-h2">Custom plans</h2>
          <p className="pcp-lead">
            For more than Pro allows, or something it does not do. Tell us what you need; a person reads it and
            replies by email. A Custom plan starts from everything in Pro and raises what you need.
          </p>
          <EnquiryForm />
        </section>

        <div className="tc-cta">
          <a className="dc-btn dc-btn-primary dc-btn-lg" href={appHref('/signup')} {...cross(appHref('/signup'))}>Start free <ArrowRight size={15} /></a>
          <a className="dc-btn dc-btn-outline dc-btn-lg" href="/terms-of-service">Terms of service</a>
          <a className="dc-btn dc-btn-outline dc-btn-lg" href="/security">Security &amp; privacy</a>
        </div>
      </main>
    </div>
  );
}

function EnquiryForm() {
  const [f, setF] = useState({ name: '', email: '', company: '', message: '', url: '' });
  const [needs, setNeeds] = useState<EnquiryNeed[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(x => ({ ...x, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await sendEnquiry({ ...f, needs });
    setBusy(false);
    if (r.success) { setSent(f.email); return; }
    setError({ text: r.error || 'That could not be sent. Try again in a moment.', field: r.field });
  }

  if (sent) {
    return (
      <div className="tc-card pcp-sent" role="status" data-enquiry-sent>
        <h3 className="pcp-h3"><Check size={16} /> Thank you — it is with us.</h3>
        <p className="tc-card-lead">A person reads every enquiry and replies to <b>{sent}</b>.</p>
      </div>
    );
  }

  return (
    <form className="tc-card pcp-form" onSubmit={e => void submit(e)} noValidate data-enquiry>
      <div className="pcp-form-row">
        <label><span>Your name</span><input data-field="enquiry.name" value={f.name} onChange={set('name')} autoComplete="name" required /></label>
        <label><span>Email</span><input data-field="enquiry.email" type="email" value={f.email} onChange={set('email')} autoComplete="email" required /></label>
      </div>
      <label><span>Company <i>(optional)</i></span><input value={f.company} onChange={set('company')} autoComplete="organization" /></label>
      <fieldset>
        <legend>What do you need?</legend>
        <div className="pcp-needs">
          {NEEDS.map(n => (
            <label key={n.id} className={needs.includes(n.id) ? 'on' : ''}>
              <input type="checkbox" checked={needs.includes(n.id)} onChange={() => setNeeds(x => x.includes(n.id) ? x.filter(y => y !== n.id) : [...x, n.id])} />
              {n.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label><span>Tell us about it</span><textarea data-field="enquiry.message" rows={5} value={f.message} onChange={set('message')} placeholder="How many clients, which allowances, what you would like built…" required /></label>
      {/* For scripts only: a person never sees this box. */}
      <label className="pcp-hp" aria-hidden="true"><span>Website</span><input tabIndex={-1} autoComplete="off" value={f.url} onChange={set('url')} /></label>
      {error && <p role="alert" className="pcp-error">{error.text}</p>}
      <button type="submit" className="dc-btn dc-btn-primary" disabled={busy}>
        {busy ? <Loader size={14} className="spin" /> : null} Send to the team <ArrowRight size={14} />
      </button>
    </form>
  );
}
