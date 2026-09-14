/**
 * "Do you want the domain, the email and the site as well?"
 *
 * One step of the project wizard, and the only one that spends money. Three
 * things it does differently from the rest of the wizard because of that:
 *
 * - **It starts switched off.** Nobody arrives at a wizard expecting to be
 *   sold to, and a step that is on by default turns a free action into a
 *   purchase somebody has to notice and undo.
 * - **The price is on every control.** Not a total revealed at the end — each
 *   toggle carries its own figure, so the number at the bottom is never a
 *   surprise about what was counted.
 * - **The yearly and monthly parts are never added together.** A domain is a
 *   year and a mailbox is a month; one blended figure is true of neither and is
 *   the thing people dispute.
 *
 * Nothing here knows who the domain is bought from. The endpoint returns names
 * and prices; who registers them is not this screen's business, and there is no
 * field on the type for it.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Globe, Search, Check, Loader, Mail, Server, Database, Sparkles, AlertCircle, ShoppingCart,
} from 'lucide-react';
import {
  money, quoteSetup, searchDomains, startCheckout,
  type DomainOffer, type Quote,
} from '../../services/digitalSetup';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

/**
 * The addresses a business actually needs, in the order it needs them.
 *
 * hello@ first because it is the one that goes on the website. Named rather
 * than free text: a customer typing their own list at this point is a customer
 * spending five minutes on a decision that can be changed later in two clicks,
 * and the mailbox manager exists for exactly that.
 */
const MAILBOX_CHOICES = ['hello', 'sales', 'support', 'accounts', 'info'];

export interface DigitalSetupChoice {
  /** '' when the customer wants none of this. */
  domain: string;
  mailboxes: string[];
  hosting: boolean;
  crm: boolean;
}

export default function DigitalSetupStep({ companyName, contactEmail, projectId, onOrder }: {
  companyName: string;
  contactEmail: string;
  /** Empty while the project is still being created; checkout is held until it is not. */
  projectId: string;
  /** Called with the order id once the customer is on their way to pay. */
  onOrder: (orderId: string) => void;
}) {
  const [wanted, setWanted] = useState(false);
  const [typed, setTyped] = useState('');
  const [offers, setOffers] = useState<DomainOffer[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [unavailable, setUnavailable] = useState(false);

  const [domain, setDomain] = useState('');
  const [mailboxes, setMailboxes] = useState<string[]>(['hello']);
  const [hosting, setHosting] = useState(true);
  const [crm, setCrm] = useState(true);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState('');

  /*
   * One search in flight at a time, and a late answer is discarded.
   *
   * Typing "abc" then "abcroofing" fires two searches, and the shorter one can
   * land second — leaving suggestions for a name the customer has moved past.
   * The counter makes the answer to a superseded question unusable rather than
   * merely late.
   */
  const searchSeq = useRef(0);

  const runSearch = async (companyOrDomain: string) => {
    const seq = ++searchSeq.current;
    setSearching(true);
    setSearchError('');
    const r = await searchDomains(companyName || companyOrDomain, companyOrDomain);
    if (seq !== searchSeq.current) return;
    setSearching(false);
    setOffers(r.results);
    setUnavailable(r.code === 'not_connected');
    setSearchError(r.error);
  };

  /* Searched as soon as the step is opened, from the name already typed into
     the wizard — the whole promise is that they do not have to think of one. */
  useEffect(() => {
    if (!wanted || !companyName.trim()) return;
    void runSearch(companyName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, companyName]);

  /* Repriced whenever the basket changes, because a total that lags behind the
     controls is a total somebody will screenshot and argue about. */
  useEffect(() => {
    if (!domain) { setQuote(null); return; }
    let live = true;
    setQuoting(true);
    void (async () => {
      const r = await quoteSetup({ domain, mailboxes: mailboxes.length, hosting, crm });
      if (!live) return;
      setQuoting(false);
      setQuote(r.quote);
      setError(r.error);
    })();
    return () => { live = false; };
  }, [domain, mailboxes, hosting, crm]);

  const toggleMailbox = (name: string) => {
    setMailboxes(prev => prev.includes(name) ? prev.filter(m => m !== name) : [...prev, name].slice(0, 10));
  };

  const buy = async () => {
    if (!projectId) { setError('Finish the project first — this is bought for it.'); return; }
    setBuying(true);
    setError('');
    const r = await startCheckout({
      domain, mailboxes, hosting, crm, projectId,
      companyName, contactEmail,
    });
    setBuying(false);
    if (r.error) { setError(r.error); return; }
    onOrder(r.orderId);
    /* Their processor's own page. Replaced rather than opened in a tab so the
       back button returns here rather than to a dead checkout. */
    if (r.url) window.location.href = r.url;
  };

  if (!wanted) {
    return (
      <div style={{ border: `1px dashed ${LINE}`, borderRadius: 16, padding: 20, background: '#fbfbfd' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(91,70,229,0.09)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Globe size={17} color={ACCENT} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: INK }}>
              Want the domain and email set up too?
            </h4>
            <p style={{ margin: '5px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
              We can register a domain for {companyName || 'this business'}, create its business email,
              publish a starter website and have all of it working before your first campaign goes out.
              Optional — the project runs without it.
            </p>
            <button onClick={() => setWanted(true)} style={{
              marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '9px 16px', borderRadius: 9, border: `1px solid ${LINE}`,
              background: '#fff', color: INK, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <Search size={13} /> Find a domain
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 16, background: '#fff', overflow: 'hidden' }}>
      <div style={{ padding: '13px 16px', borderBottom: `1px solid ${LINE}`, background: '#fafbfc', display: 'flex', alignItems: 'center', gap: 9 }}>
        <Globe size={15} color={ACCENT} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>Digital Business Setup</div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>Domain, email, website and workspace — set up for you</div>
        </div>
        <button onClick={() => { setWanted(false); setDomain(''); }} style={{
          border: 'none', background: 'none', color: MUTED, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>Not now</button>
      </div>

      <div style={{ padding: 16, display: 'grid', gap: 16 }}>
        {/* ── Find a name ── */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
            Your domain
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={typed}
              onChange={e => setTyped(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void runSearch(typed); } }}
              placeholder={companyName ? `${companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com` : 'yourbusiness.com'}
              style={{
                flex: 1, minWidth: 180, padding: '10px 12px', border: `1px solid ${LINE}`,
                borderRadius: 9, fontSize: 13.5, color: INK, outline: 'none', fontFamily: 'inherit',
              }} />
            <button onClick={() => void runSearch(typed)} disabled={searching} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px',
              border: 'none', borderRadius: 9, background: searching ? '#c7c9d3' : INK,
              color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: searching ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}>
              {searching ? <Loader size={13} className="spin" /> : <Search size={13} />} Search
            </button>
          </div>
        </div>

        {unavailable && (
          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 11, background: '#fffbeb', border: '1px solid #fde68a' }}>
            <AlertCircle size={15} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 11.5, color: '#78350f', lineHeight: 1.6 }}>
              Domain registration is not switched on for this installation yet. Your project will still
              run — this step can be done later.
            </p>
          </div>
        )}
        {searchError && !unavailable && (
          <p style={{ margin: 0, fontSize: 12, color: '#b42318' }}>{searchError}</p>
        )}

        {offers.length > 0 && (
          <div style={{ display: 'grid', gap: 7 }}>
            {offers.slice(0, 8).map(o => {
              const chosen = o.domain === domain;
              return (
                <button key={o.domain}
                  onClick={() => o.available && setDomain(o.domain)}
                  disabled={!o.available}
                  aria-pressed={chosen}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px',
                    borderRadius: 11, textAlign: 'left', fontFamily: 'inherit',
                    border: `1.5px solid ${chosen ? ACCENT : LINE}`,
                    background: chosen ? 'rgba(91,70,229,0.05)' : o.available ? '#fff' : '#fafafa',
                    cursor: o.available ? 'pointer' : 'not-allowed',
                    opacity: o.available ? 1 : 0.55,
                  }}>
                  <span style={{
                    width: 17, height: 17, borderRadius: 999, flexShrink: 0, display: 'grid', placeItems: 'center',
                    border: `1.5px solid ${chosen ? ACCENT : '#cbd2df'}`, background: chosen ? ACCENT : '#fff',
                  }}>
                    {chosen && <Check size={10} color="#fff" />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {o.domain}
                  </span>
                  {o.premium && o.available && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '2px 7px', borderRadius: 999 }}>
                      Premium
                    </span>
                  )}
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: o.available ? INK : MUTED, whiteSpace: 'nowrap' }}>
                    {o.available ? `${money(o.priceCents ?? 0, o.currency)}/yr` : 'Taken'}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── What else ── */}
        {domain && (
          <>
            <div style={{ height: 1, background: LINE }} />

            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>What should we set up on it?</div>

              <div>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 7 }}>
                  <Mail size={13} color={ACCENT} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>Business email</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {MAILBOX_CHOICES.map(name => {
                    const on = mailboxes.includes(name);
                    return (
                      <button key={name} onClick={() => toggleMailbox(name)} aria-pressed={on} style={{
                        padding: '6px 11px', borderRadius: 999, fontFamily: 'inherit',
                        border: `1.5px solid ${on ? ACCENT : LINE}`,
                        background: on ? 'rgba(91,70,229,0.06)' : '#fff',
                        color: on ? ACCENT : MUTED, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}>
                        {name}@{domain}
                      </button>
                    );
                  })}
                </div>
              </div>

              {([
                ['hosting', hosting, setHosting, Server, 'Website hosting', 'A starter site, published and ready to edit.'],
                ['crm', crm, setCrm, Database, 'CRM workspace', 'Contacts, deals, inbox and booking pages.'],
              ] as const).map(([id, on, set, Icon, label, sub]) => (
                <button key={id} onClick={() => set(!on)} aria-pressed={on} style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', padding: '11px 12px',
                  borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1.5px solid ${on ? ACCENT : LINE}`, background: on ? 'rgba(91,70,229,0.04)' : '#fff',
                }}>
                  <span style={{
                    width: 17, height: 17, borderRadius: 5, marginTop: 1, flexShrink: 0, display: 'grid', placeItems: 'center',
                    border: `1.5px solid ${on ? ACCENT : '#cbd2df'}`, background: on ? ACCENT : '#fff',
                  }}>
                    {on && <Check size={11} color="#fff" />}
                  </span>
                  <Icon size={14} color={ACCENT} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK }}>{label}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 1, lineHeight: 1.5 }}>{sub}</span>
                  </span>
                </button>
              ))}

              {/* Always on, always shown. It is what the whole product is for. */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 11, background: '#f7f8fa', border: `1px solid ${LINE}` }}>
                <Sparkles size={14} color={ACCENT} style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK }}>AI Autopilot Content Engine</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 1, lineHeight: 1.5 }}>
                    Starts writing your content plan the moment setup finishes.
                  </span>
                </span>
              </div>
            </div>

            {/* ── The bill ── */}
            <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '10px 13px', background: '#fafbfc', borderBottom: `1px solid ${LINE}`, fontSize: 12, fontWeight: 800, color: INK }}>
                Your order
              </div>
              <div style={{ padding: 13, display: 'grid', gap: 8 }}>
                {quoting && !quote && <span style={{ fontSize: 12, color: MUTED }}>Working out your total…</span>}
                {quote?.lines.map(l => (
                  <div key={l.kind + l.label} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#475569' }}>{l.label}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: INK, whiteSpace: 'nowrap' }}>
                      {l.totalCents === 0 ? 'Included' : `${money(l.totalCents, quote.currency)}${l.period === 'month' ? '/mo' : l.period === 'year' ? '/yr' : ''}`}
                    </span>
                  </div>
                ))}

                {quote && (
                  <>
                    <div style={{ height: 1, background: LINE, margin: '3px 0' }} />
                    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: INK }}>Due today</span>
                      <span style={{ fontSize: 15, fontWeight: 800, color: INK }}>
                        {money(quote.dueTodayCents + quote.monthlyCents, quote.currency)}
                      </span>
                    </div>
                    {/*
                      Spelled out rather than blended. Today's charge is the year
                      of domain plus the first month of everything else, and a
                      customer who is not told that reads the figure as either
                      the monthly or the yearly price and is wrong either way.
                    */}
                    <p style={{ margin: 0, fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
                      That is one year of {domain} plus your first month of services.
                      {quote.monthlyCents > 0 && ` Then ${money(quote.monthlyCents, quote.currency)} a month.`}
                    </p>
                  </>
                )}
              </div>
            </div>

            {error && (
              <p style={{ margin: 0, fontSize: 12, color: '#b42318', lineHeight: 1.5 }}>{error}</p>
            )}

            <button onClick={() => void buy()} disabled={buying || !quote || !projectId} style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: '12px 18px', border: 'none', borderRadius: 10,
              background: buying || !quote || !projectId ? '#c7c9d3' : INK,
              color: '#fff', fontSize: 13.5, fontWeight: 700,
              cursor: buying || !quote || !projectId ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}>
              {buying ? <Loader size={14} className="spin" /> : <ShoppingCart size={14} />}
              {buying ? 'Taking you to payment…' : quote ? `Pay ${money(quote.dueTodayCents + quote.monthlyCents, quote.currency)} and set it all up` : 'Set it all up'}
            </button>
            {!projectId && (
              <p style={{ margin: 0, fontSize: 11.5, color: MUTED }}>
                Finish creating the project first — this is set up for it.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
