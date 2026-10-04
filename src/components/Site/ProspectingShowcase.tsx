/**
 * AI Prospecting on the public site — what it does, the real screens it does
 * it on, the trades it works for, and the project that does it every day.
 *
 * ── What it shows ──
 *
 * The screens are photographs of the running product (`REELS.prospecting`,
 * taken by scripts/site-reels.mts against a mock directory of invented
 * businesses on `.example` addresses — it cannot be anybody's data). They used
 * to be a drawing with three rows; the owner asked for the section to look as
 * busy as a real account and to speak to every kind of business somebody
 * might sell to, so there are searches in different trades and towns, and a
 * moving row of example searches across two dozen trades.
 *
 * Every line in PROSPECTING and DAILY is something the product does today
 * (services/aiProspecting.ts, worker/src/prospectFinderTick.ts). The one that
 * depends on the owner — mailbox-level verification — says so. The figures in
 * TRADES are example searches from the sample workspace and are labelled as
 * such; nothing here is a customer's result.
 */
import { useState } from 'react';
import {
  Ban, BarChart3, Building2, Calculator, CalendarClock, Camera, Car, CheckCircle2, Coffee, Croissant, Dumbbell,
  Flower2, Globe, HeartPulse, Home, Hotel, KeyRound, Landmark, ListChecks, MapPin, Megaphone, MessageSquareText,
  Monitor, PartyPopper, PawPrint, Repeat, Scale, Scissors, Search, ShieldCheck, Sparkles, Stethoscope, UtensilsCrossed, Zap,
} from 'lucide-react';
import FeatureStage from './FeatureStage';
import { REELS } from './reels';
import { useReveal } from './useReveal';
import { motionReduced } from '../../services/motion';

const PROSPECTING = [
  { icon: Sparkles, title: 'Ask in a sentence', body: '"Real estate agents in Richmond, Virginia with a website." It searches, reads, checks — and shows each step as it runs, with what it found.' },
  { icon: MapPin, title: 'Three kinds of source', body: 'Business directories, verified business directories (the UK company register, with directors) and Google Maps — named for what they are, on every row.' },
  { icon: Globe, title: 'The email they publish', body: 'Each business\'s own website is read for the address it chose to publish. Never a guessed firstname@ that bounces.' },
  { icon: ShieldCheck, title: 'Checked before you send', body: 'Format, domain and mail server on every address — and the mailbox itself, catch-alls and named people when a mailbox verifier is connected.' },
  { icon: ListChecks, title: 'Straight into work', body: 'Save a list, or add the ticked ones to a workflow, an AI Autopilot project or an email campaign — each row time-stamped with when it was found.' },
  { icon: Ban, title: 'No scraped LinkedIn', body: 'Only sources whose terms allow it. A lead list built on somebody else\'s terms of service is a liability, not an asset.' },
];

/* Example searches from the sample workspace — trade, town, found, with an
   address, verified mailboxes. Shown moving, two rows the opposite way. */
type Trade = { icon: typeof Home; trade: string; town: string; found: number; emails: number; verified: number };
const TRADES: Trade[] = [
  { icon: Home, trade: 'Real estate agents', town: 'Richmond, VA', found: 51, emails: 44, verified: 33 },
  { icon: Stethoscope, trade: 'Dentists', town: 'Leeds', found: 58, emails: 52, verified: 41 },
  { icon: Scale, trade: 'Law firms', town: 'Denver, CO', found: 48, emails: 43, verified: 35 },
  { icon: Dumbbell, trade: 'Gyms', town: 'Austin, TX', found: 47, emails: 42, verified: 30 },
  { icon: Coffee, trade: 'Cafés', town: 'Bristol', found: 39, emails: 33, verified: 24 },
  { icon: Calculator, trade: 'Accountants', town: 'Manchester', found: 44, emails: 40, verified: 34 },
  { icon: Scissors, trade: 'Hair salons', town: 'Miami, FL', found: 53, emails: 45, verified: 31 },
  { icon: Car, trade: 'Auto repair', town: 'Phoenix, AZ', found: 46, emails: 39, verified: 28 },
  { icon: ShieldCheck, trade: 'Insurance agencies', town: 'Norfolk, VA', found: 35, emails: 32, verified: 27 },
  { icon: PawPrint, trade: 'Veterinarians', town: 'Plano, TX', found: 39, emails: 35, verified: 29 },
  { icon: Hotel, trade: 'Hotels', town: 'Virginia Beach, VA', found: 42, emails: 37, verified: 30 },
  { icon: Zap, trade: 'Electricians', town: 'Leeds', found: 36, emails: 30, verified: 22 },
  { icon: HeartPulse, trade: 'Chiropractors', town: 'Denver, CO', found: 41, emails: 37, verified: 31 },
  { icon: Flower2, trade: 'Florists', town: 'Manchester', found: 34, emails: 29, verified: 21 },
  { icon: Camera, trade: 'Photographers', town: 'Austin, TX', found: 45, emails: 41, verified: 33 },
  { icon: Building2, trade: 'Architects', town: 'Bristol', found: 37, emails: 34, verified: 28 },
  { icon: KeyRound, trade: 'Mortgage brokers', town: 'Richmond, VA', found: 43, emails: 39, verified: 32 },
  { icon: Landmark, trade: 'Property managers', town: 'Norfolk, VA', found: 38, emails: 33, verified: 26 },
  { icon: Car, trade: 'Driving schools', town: 'Leeds', found: 36, emails: 31, verified: 23 },
  { icon: PartyPopper, trade: 'Wedding venues', town: 'Virginia Beach, VA', found: 36, emails: 33, verified: 27 },
  { icon: Croissant, trade: 'Bakeries', town: 'Miami, FL', found: 40, emails: 34, verified: 25 },
  { icon: Monitor, trade: 'IT support', town: 'Phoenix, AZ', found: 44, emails: 41, verified: 36 },
  { icon: Megaphone, trade: 'Marketing agencies', town: 'Manchester', found: 49, emails: 46, verified: 38 },
  { icon: UtensilsCrossed, trade: 'Restaurants', town: 'Austin, TX', found: 59, emails: 48, verified: 34 },
];

/* What a project does every day once it is told who and where. */
const DAILY = [
  { icon: Repeat, title: 'Searches its rotation', body: 'Each kind of business in each town, a few at a time through the day — a state is worked town by town, largest first.' },
  { icon: Search, title: 'Reads and checks', body: 'Reads each new business\'s website for its address, checks it, and leaves out anyone already in your contacts.' },
  { icon: CalendarClock, title: 'Adds your number a day', body: 'Up to the number you chose join the project\'s audience — 10, 20, 100 — with when each was found.' },
  { icon: MessageSquareText, title: 'Writes to them — with you', body: 'Outreach goes 20 at a time, each batch waiting for your approval. Texts only to the ones who say yes on their own page.' },
];

/* Thirty days of the sample project's finder — the shape of the chart on its Prospects tab. */
const DAYS = [19, 20, 18, 12, 11, 19, 20, 20, 18, 19, 13, 12, 20, 19, 18, 20, 20, 11, 14, 19, 20, 18, 19, 20, 12, 13, 18, 20, 19, 14];

function TradeRow({ items, reverse }: { items: Trade[]; reverse?: boolean }) {
  /* Twice over, so the loop has no seam; the copy is hidden from readers. */
  return (
    <div className={`dc-trades-row${reverse ? ' rev' : ''}`}>
      <div className="dc-trades-track">
        {[...items, ...items].map((t, i) => (
          <div key={`${t.trade}-${t.town}-${i}`} className="dc-trade" aria-hidden={i >= items.length || undefined}>
            <span className="dc-trade-icon"><t.icon size={15} /></span>
            <span className="dc-trade-text">
              <b>{t.trade}</b>
              <small>{t.town}</small>
            </span>
            <span className="dc-trade-nums">
              <em>{t.found}</em><small>found</small>
              <em className="ok">{t.verified}</em><small>verified</small>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* What a search says as it runs — beside the screens on a wide window. */
const CHIPS = [
  { icon: Search, title: '51 found live', sub: 'Realtors in Richmond, Virginia' },
  { icon: Globe, title: 'Websites read', sub: 'The address each one publishes' },
  { icon: ShieldCheck, title: '33 mailboxes verified', sub: 'Checked before you send' },
  { icon: CalendarClock, title: '20 new every day', sub: 'Added to an Autopilot project' },
];

export default function ProspectingShowcase() {
  const trades = useReveal<HTMLDivElement>();
  const daily = useReveal<HTMLDivElement>();
  const [still] = useState(() => motionReduced());
  const half = Math.ceil(TRADES.length / 2);
  return (
    <FeatureStage
      id="prospecting"
      className="dc-prospect"
      eyebrow="AI Prospecting"
      title={<>Say who to sell to. <em>Get leads you can reach — every day.</em></>}
      body={<>One sentence finds the businesses, reads the email address each one publishes on its own website, and
        checks it before you send. <b>Every lead is found live, the moment you ask</b> — and stamped with when.</>}
      label="AI Prospecting"
      shots={REELS.prospecting}
      features={PROSPECTING}
      chips={CHIPS}
      after={<>
      <div className={`dc-trades reveal${still ? ' still' : ''}`} ref={trades}>
        <div className="dc-trades-head">
          <h3>Whoever you sell to.</h3>
          <p>Realtors, dentists, law firms, gyms, restaurants, salons, garages, vets, venues — in any town, the same sentence.</p>
        </div>
        <TradeRow items={TRADES.slice(0, half)} />
        <TradeRow items={TRADES.slice(half)} reverse />
        <p className="dc-trades-note">Example searches from the sample workspace.</p>
      </div>

      <div className="dc-daily reveal" ref={daily}>
        <div className="dc-daily-copy">
          <span className="dc-eyebrow"><Sparkles size={13} /> On AI Autopilot</span>
          <h3>And a project that finds its own, every day.</h3>
          <p>
            Tell an AI Autopilot project "sell to real estate agents in Virginia" — in the wizard, or with
            <b> Search this every day</b> on any search — and it keeps its audience growing on its own.
          </p>
          <ol className="dc-daily-steps">
            {DAILY.map((d, i) => (
              <li key={d.title}>
                <span className="dc-daily-n">{i + 1}</span>
                <span className="dc-tile-icon"><d.icon size={15} /></span>
                <div><b>{d.title}</b><span>{d.body}</span></div>
              </li>
            ))}
          </ol>
        </div>
        <figure className="dc-daily-card" aria-label="Thirty days of a sample project's daily prospecting">
          <div className="dc-daily-top">
            <span><BarChart3 size={14} /> Brightline Realty — Virginia listings</span>
            <i><CheckCircle2 size={12} /> Finding every day</i>
          </div>
          <div className="dc-daily-kpis">
            <div><b>14 / 20</b><small>Added today</small></div>
            <div><b>515</b><small>In the audience</small></div>
            <div><b>9</b><small>Searches in rotation</small></div>
          </div>
          <div className="dc-daily-bars" aria-hidden="true">
            {DAYS.map((v, i) => <i key={i} style={{ '--h': `${(v / 20) * 100}%`, '--d': `${i * 28}ms` } as React.CSSProperties} />)}
          </div>
          <div className="dc-daily-axis"><span>30 days ago</span><span>today</span></div>
          <div className="dc-daily-chips">
            {['real estate agents · Richmond', 'property managers · Norfolk', 'mortgage brokers · Virginia Beach'].map(c => <span key={c}>{c}</span>)}
          </div>
          <figcaption>Sample project — the same chart its Prospects tab draws.</figcaption>
        </figure>
      </div>
      </>}
    />
  );
}
