/**
 * "Works with" — the logo strip on the sign-in screen and the public site.
 *
 * ── Two rows, because they are two different claims ──
 *
 * One row of logos under "Our partners" would say every company on it has an
 * agreement with us, and none of them does. What is true is narrower and still
 * worth showing: the software *connects to* four of them — Google for sign-in,
 * Gemini and Calendar; Stripe for payments; Cloudflare for hosting and custom
 * domains; Openprovider for registering domains, the email providers a mailbox can
 * send through, Twilio, WordPress, Printful, the email verifiers and the
 * business directories — and *writes for* more, posts cut to each platform's
 * canvas and limits. Each row is labelled with which it is.
 *
 * A company goes on the first two rows when the code talks to it (or, for
 * the second, when the social creator has a format for it) — not before.
 *
 * The third row is the tools the owner used to make and run Protected
 * Central, as the owner lists them. The owner asked for it to read
 * "Technology partners", and it carries an asterisk because none of them has
 * an agreement with us: the note under the strip says what the word means
 * here — the platforms it is built and runs on — so it claims no endorsement.
 * It is its own row, not "integrations", because the product does not call
 * any of them: a visitor reading "Slack" under "connects to" would go looking
 * for the Slack setting and not find it. When one of them is integrated, it
 * moves up a row.
 *
 * ── Motion ──
 *
 * Each row is its list twice over, slid by exactly one copy, so the loop has
 * no seam. The moving copies are hidden from screen readers, which get the
 * list once, still. With reduced motion the rows are drawn once, still.
 */
import { BRAND_PATHS } from './brandPaths';
import './worksWith.css';

interface Brand { id: string; name: string; role: string }

const CONNECTS: Brand[] = [
  { id: 'google', name: 'Google', role: 'Sign-in · Calendar' },
  { id: 'googlegemini', name: 'Gemini', role: 'AI writing and planning' },
  { id: 'googlemaps', name: 'Google Maps', role: 'Business search · reviews' },
  { id: 'googlemeet', name: 'Google Meet', role: 'Live-help meetings' },
  { id: 'stripe', name: 'Stripe', role: 'Payments' },
  { id: 'creem', name: 'Creem', role: 'Payments' },
  { id: 'cloudflare', name: 'Cloudflare', role: 'Hosting · custom domains' },
  { id: 'openprovider', name: 'Openprovider', role: 'Domain registration' },
  { id: 'brevo', name: 'Brevo', role: 'Email sending' },
  { id: 'resend', name: 'Resend', role: 'Email sending' },
  { id: 'sendgrid', name: 'SendGrid', role: 'Email sending' },
  { id: 'mailgun', name: 'Mailgun', role: 'Email sending' },
  { id: 'mailjet', name: 'Mailjet', role: 'Email sending' },
  { id: 'postmark', name: 'Postmark', role: 'Email sending' },
  { id: 'twilio', name: 'Twilio', role: 'Text messages' },
  { id: 'wordpress', name: 'WordPress', role: 'Blog publishing' },
  { id: 'printful', name: 'Printful', role: 'Print-on-demand orders' },
  { id: 'hunter', name: 'Hunter', role: 'Email finding & checks' },
  { id: 'zerobounce', name: 'ZeroBounce', role: 'Email checks' },
  { id: 'millionverifier', name: 'MillionVerifier', role: 'Email checks' },
  { id: 'geoapify', name: 'Geoapify', role: 'Business directory search' },
  { id: 'openstreetmap', name: 'OpenStreetMap', role: 'Business directory data' },
  { id: 'companieshouse', name: 'Companies House', role: 'UK company register' },
];

const WRITES_FOR: Brand[] = [
  { id: 'facebook', name: 'Facebook', role: 'Posts' },
  { id: 'instagram', name: 'Instagram', role: 'Posts & stories' },
  { id: 'x', name: 'X', role: 'Posts' },
  { id: 'tiktok', name: 'TikTok', role: 'Short-video captions' },
  { id: 'linkedin', name: 'LinkedIn', role: 'Company posts' },
  { id: 'youtube', name: 'YouTube', role: 'Titles & descriptions' },
  { id: 'pinterest', name: 'Pinterest', role: 'Pins' },
  { id: 'meta', name: 'Meta', role: 'Facebook ad videos' },
];

const PARTNERS: Brand[] = [
  { id: 'cloudflareworkers', name: 'Cloudflare Workers', role: 'Runs Protected Central on a global cloud network' },
  { id: 'anthropic', name: 'Anthropic', role: 'Claude, used to write and review the code' },
  { id: 'openai', name: 'OpenAI', role: 'Used in building Protected Central' },
  { id: 'groq', name: 'Groq', role: 'Used in building Protected Central' },
  { id: 'github', name: 'GitHub', role: 'Code and deployment pipeline' },
  { id: 'zapier', name: 'Zapier', role: 'Used in building Protected Central' },
  { id: 'slack', name: 'Slack', role: 'Used in building Protected Central' },
];

function Mark({ b }: { b: Brand }) {
  const d = BRAND_PATHS[b.id];
  return (
    <span className="ww-item" title={`${b.name} — ${b.role}`}>
      {d && (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <path d={d} fill="currentColor" />
        </svg>
      )}
      <span className="ww-name">{b.name}</span>
    </span>
  );
}

/* Enough copies that one half is wider than any screen, so the slide never
   shows the end of the row. */
function Row({ label, items, reverse }: { label: string; items: Brand[]; reverse?: boolean }) {
  const half = Array.from({ length: Math.ceil(10 / items.length) }, () => items).flat();
  return (
    <div className="ww-row">
      <span className="ww-label">{label}</span>
      <div className="ww-window">
        <div className={`ww-track${reverse ? ' ww-rev' : ''}`} aria-hidden="true">
          {[0, 1].map(copy => (
            <div className="ww-copy" key={copy}>
              {half.map((b, i) => <Mark key={`${copy}-${i}`} b={b} />)}
            </div>
          ))}
        </div>
        {/* What is shown when motion is off: each mark once, wrapped. */}
        <div className="ww-static" aria-hidden="true">
          {items.map(b => <Mark key={b.id} b={b} />)}
        </div>
        <ul className="ww-sr">
          {items.map(b => <li key={b.id}>{b.name}: {b.role}</li>)}
        </ul>
      </div>
    </div>
  );
}

export default function WorksWith({ title = 'Integrations & tools', compact = false }: { title?: string; compact?: boolean }) {
  return (
    <section className={`ww${compact ? ' ww-compact' : ''}`} aria-label={title}>
      {title && <p className="ww-title">{title}</p>}
      <Row label="Connects to" items={CONNECTS} />
      <Row label="Writes for" items={WRITES_FOR} reverse />
      <Row label="Technology partners*" items={PARTNERS} />
      <p className="ww-note">
        * The enterprise-grade platforms Protected Central is built and runs on. Named as the
        technology we use — not an endorsement by, or a formal agreement with, any of them.
      </p>
    </section>
  );
}
