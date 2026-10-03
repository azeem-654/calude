/**
 * AI Prospecting on the public site — what it does, and a drawing of the
 * screen it does it on.
 *
 * The other sections show photographs of the running product (reels.ts,
 * taken by scripts/site-reels.mts). AI Prospecting has none yet, so this is a
 * drawing, and it says so under the picture: the businesses are invented, on
 * `.example` addresses that cannot belong to anybody. Re-take it as a reel
 * once the script has a seeded search to photograph.
 *
 * Every line in PROSPECTING is something the product does today. The one
 * that depends on the owner — mailbox-level verification — says so.
 */
import { CheckCircle2, Globe, ListChecks, MapPin, Search, ShieldCheck, Sparkles, Ban } from 'lucide-react';
import { useReveal, useRevealGroup } from './useReveal';

const PROSPECTING = [
  { icon: Sparkles, title: 'Ask in a sentence', body: '"Dentists in Leeds with a website." It searches, reads, checks — and shows each step as it runs, with what it found.' },
  { icon: MapPin, title: 'A free business directory', body: 'OpenStreetMap\'s businesses with phone and website, kept in your own lists — or Google Maps when you want its coverage.' },
  { icon: Globe, title: 'The email they publish', body: 'Each business\'s own website is read for the address it chose to publish. Never a guessed firstname@ that bounces.' },
  { icon: ShieldCheck, title: 'Checked before you send', body: 'Format, domain, mail server and throwaway inboxes for free — and the mailbox itself, catch-alls and spam traps with a connected verifier.' },
  { icon: ListChecks, title: 'Lists that go to work', body: 'Save the ones that fit as a list, then send it a campaign or hand it to an Autopilot project. Or export a CSV.' },
  { icon: Ban, title: 'No scraped LinkedIn', body: 'Only sources whose terms allow it. A lead list built on somebody else\'s terms of service is a liability, not an asset.' },
];

const ROWS = [
  { n: 'Harbour Dental Care', c: 'Dentist · Park Row', e: 'hello@harbourdental.example', s: 'Verified', k: 'valid', score: 90 },
  { n: 'Kirkgate Smiles', c: 'Dentist · Kirkgate', e: 'info@kirkgatesmiles.example', s: 'Domain OK', k: 'ok', score: 75 },
  { n: 'Northfield Orthodontics', c: 'Orthodontist · Headrow', e: 'reception@northfield.example', s: 'Risky', k: 'risky', score: 45 },
];

function Illustration() {
  return (
    <figure className="dc-pm" aria-label="A drawing of the AI Prospecting screen, with invented businesses">
      <div className="dc-pm-win" aria-hidden="true">
        <div className="dc-pm-side">
          <b className="dc-pm-brand"><i><Sparkles size={10} /></i> AI Prospecting</b>
          <span className="dc-pm-find"><Search size={10} /> Search your searches</span>
          <small>PINNED</small>
          <span className="dc-pm-hist dc-pm-on">Dentists · Leeds<em>42 leads</em></span>
          <small>RECENT</small>
          <span className="dc-pm-hist">Cafés · Bristol<em>58 leads · 3h</em></span>
          <span className="dc-pm-hist">Accountants · Austin<em>36 leads · 1d</em></span>
          <small>LEAD LISTS</small>
          <span className="dc-pm-list"><i /> Leeds dentists<em>12</em></span>
        </div>
        <div className="dc-pm-main">
          <div className="dc-pm-bubble">Find dentists in Leeds with a website</div>
          <p className="dc-pm-lead"><Sparkles size={11} /> I searched the free directory, read each business's own website, and checked every address I found.</p>
          <ul className="dc-pm-steps">
            <li><CheckCircle2 size={11} /> Searched the free directory for dentists in Leeds <em>42</em></li>
            <li><CheckCircle2 size={11} /> Read 16 websites for the addresses they publish <em>11</em></li>
            <li><CheckCircle2 size={11} /> Checked 11 addresses — domain and mail server <em>10</em></li>
          </ul>
          <div className="dc-pm-card">
            <div className="dc-pm-head"><Sparkles size={11} /> Dentists · Leeds <span>42 found</span></div>
            <div className="dc-pm-th"><span>Name</span><span>Email</span><span>Score</span></div>
            {ROWS.map(r => (
              <div key={r.n} className="dc-pm-tr">
                <span><b>{r.n}</b><em>{r.c}</em></span>
                <span><b className="dc-pm-mail">{r.e}</b><i data-k={r.k}>{r.s}</i></span>
                <span className="dc-pm-score" data-k={r.k}>{r.score}</span>
              </div>
            ))}
          </div>
          <div className="dc-pm-compose">
            <div className="dc-pm-strip"><Sparkles size={10} /> Search <span>Free directory</span><span>Websites</span><span>Free checks</span></div>
            <div className="dc-pm-box">Ask for more, or refine the list…<i>↑</i></div>
          </div>
        </div>
      </div>
      <figcaption>Drawing with invented businesses — not a screenshot.</figcaption>
    </figure>
  );
}

export default function ProspectingShowcase() {
  const head = useReveal<HTMLDivElement>();
  const list = useRevealGroup<HTMLDivElement>('.dc-show-item');
  const pic = useReveal<HTMLDivElement>();
  return (
    <section className="dc-showcase dc-prospect" id="prospecting" aria-label="AI Prospecting">
      <div className="dc-show">
        <div className="dc-show-head reveal" ref={head}>
          <span className="dc-eyebrow">AI Prospecting</span>
          <h2>Say who to sell to. <em>Get leads you can reach.</em></h2>
          <p>
            One sentence finds the businesses, reads the email address each one publishes on its own website, and
            checks it before you send — so the list you save is one your mailbox can actually deliver to.
          </p>
          <div className="dc-show-list stagger" ref={list}>
            {PROSPECTING.map(a => (
              <div key={a.title} className="dc-show-item">
                <span className="dc-tile-icon"><a.icon size={15} /></span>
                <div><b>{a.title}</b><span>{a.body}</span></div>
              </div>
            ))}
          </div>
        </div>
        <div className="reveal" ref={pic}><Illustration /></div>
      </div>
    </section>
  );
}
