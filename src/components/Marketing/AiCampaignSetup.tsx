/**
 * What the AI needs before it writes a campaign.
 *
 * Pressing "Write it with AI" used to go straight to a brief and then generate
 * three emails from the workspace's own details. Three questions were never
 * asked, and each one changes the output more than the brief does:
 *
 *  - **Whose voice?** An agency writes for its clients, not for itself. Without
 *    a portfolio the model writes as the workspace — so a marketing agency's
 *    campaign for a dental practice went out sounding like a marketing agency.
 *  - **How many emails?** It always wrote three. A single announcement and a
 *    fifteen-step nurture are both ordinary things to want.
 *  - **Where should people book?** The single most useful thing an outreach
 *    email can carry is a link to a diary, and the app already has one. It was
 *    never offered, so every generated email ended with "reply to this" —
 *    which is a worse call to action and one more step for the reader.
 *
 * Both the portfolio and the booking page can be made here. Sending somebody
 * to another module mid-thought and hoping they come back is how a flow gets
 * abandoned, and the booking page in particular is two fields.
 */
import { useEffect, useState } from 'react';
import {
  Building2, CalendarCheck, Loader, Plus, Check, X, Mail, ExternalLink, AlertCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { fetchBoard, savePortfolio, type Portfolio } from '../../services/projects';
import { publishBookingConfig } from '../../services/booking';
import { sessionToken } from '../../services/auth';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e2e8f0';
const ACCENT = '#5b46e5';

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: 9,
  fontSize: 13.5, color: INK, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 };

export interface AiSetup {
  portfolioId: string;
  /** For the summary line only — the id is what the server writes from. */
  portfolioName: string;
  steps: number;
  /** Absolute, or '' for none. Given to the model to put in the emails. */
  bookingUrl: string;
}

/** 1 to 15. More than fifteen is not a sequence, it is a grievance. */
const COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

export default function AiCampaignSetup({ onReady, onBack }: {
  onReady: (s: AiSetup) => void;
  onBack: () => void;
}) {
  const { addNotification, schedule, updateSchedule } = useApp();

  const [portfolios, setPortfolios] = useState<Portfolio[] | null>(null);
  const [portfolioId, setPortfolioId] = useState('');
  const [addingClient, setAddingClient] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientDoes, setClientDoes] = useState('');
  const [savingClient, setSavingClient] = useState(false);

  const [steps, setSteps] = useState(3);

  const [useBooking, setUseBooking] = useState(false);
  const [bookingChoice, setBookingChoice] = useState('');
  const [makingPage, setMakingPage] = useState(false);
  const [pageTitle, setPageTitle] = useState('');
  const [pageSlug, setPageSlug] = useState('');
  const [pageMinutes, setPageMinutes] = useState('30');
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const b = await fetchBoard();
      if (!live) return;
      setPortfolios(b.portfolios);
      /* Pre-selected only when there is exactly one: with three clients,
         guessing which is worse than asking. */
      if (b.portfolios.length === 1) setPortfolioId(b.portfolios[0].id);
    })();
    return () => { live = false; };
  }, []);

  /**
   * Every address somebody could be sent to.
   *
   * The workspace has one booking page; event types are the meetings on it. A
   * link to a named type skips a step for the reader, which on a cold email is
   * the difference between a booking and a tab that gets closed.
   */
  const origin = `${window.location.origin}${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}`;
  const hasPage = !!schedule.slug;
  const bookingOptions = hasPage
    ? [
      { id: 'page', label: schedule.title || 'Booking page', sub: `${schedule.duration} min`, url: `${origin}/book/${schedule.slug}` },
      ...(schedule.eventTypes ?? []).map(t => ({
        id: t.id, label: t.name, sub: `${t.duration} min`,
        url: `${origin}/book/${schedule.slug}?type=${encodeURIComponent(t.id)}`,
      })),
    ]
    : [];

  useEffect(() => {
    if (useBooking && !bookingChoice && bookingOptions.length) setBookingChoice(bookingOptions[0].id);
  }, [useBooking, bookingChoice, bookingOptions]);

  const saveClient = async () => {
    if (!clientName.trim()) { addNotification('Give the client a name.', 'error'); return; }
    setSavingClient(true);
    const r = await savePortfolio({
      name: clientName.trim(),
      profile: { companyName: clientName.trim(), description: clientDoes.trim() },
    });
    setSavingClient(false);
    if (!r.success || !r.id) { addNotification(r.error ?? 'Could not save the client.', 'error'); return; }
    setPortfolios(r.portfolios ?? []);
    setPortfolioId(r.id);
    setAddingClient(false);
    setClientName(''); setClientDoes('');
  };

  /** Make the booking page here rather than sending them to Booking pages. */
  const publishPage = async () => {
    const title = pageTitle.trim();
    const slug = pageSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!title) { addNotification('Give the meeting a name.', 'error'); return; }
    if (!slug) { addNotification('The web address needs some letters or numbers.', 'error'); return; }

    setPublishing(true);
    const next = {
      ...schedule,
      title,
      slug,
      duration: Math.min(Math.max(Number(pageMinutes) || 30, 5), 240),
    };
    /* Saved locally *and* published, because a booking page that only exists in
       this browser is a link in an email that answers 404 to everybody who
       clicks it. If publishing fails the link is not offered. */
    const ok = await publishBookingConfig(sessionToken(), next);
    setPublishing(false);
    if (!ok) {
      addNotification('The booking page could not be published, so the link would not work yet. Try again, or set it up under Booking pages.', 'error');
      return;
    }
    updateSchedule(next);
    setMakingPage(false);
    setBookingChoice('page');
    addNotification(`Booking page published at /book/${slug}.`, 'success');
  };

  const chosenUrl = bookingOptions.find(o => o.id === bookingChoice)?.url ?? '';
  const blocked = !portfolioId ? 'Choose who this is for'
    : useBooking && !chosenUrl ? 'Pick a booking link, or turn it off'
      : '';

  const card: React.CSSProperties = {
    border: `1px solid ${LINE}`, borderRadius: 14, padding: 16, background: '#fff',
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', display: 'grid', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '0 0 5px', letterSpacing: '-0.02em' }}>
          Before it writes
        </h2>
        <p style={{ fontSize: 13.5, color: MUTED, margin: 0, lineHeight: 1.6 }}>
          Three things change the emails more than the brief does.
        </p>
      </div>

      {/* ── 1. Whose voice ── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Building2 size={15} color={ACCENT} />
          <span style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>Who is this for?</span>
        </div>

        {portfolios === null ? (
          <Loader size={16} className="spin" color={MUTED} />
        ) : addingClient || portfolios.length === 0 ? (
          <div style={{ display: 'grid', gap: 9 }}>
            <input autoFocus value={clientName} onChange={e => setClientName(e.target.value)}
              placeholder="Client or business name" style={inp} />
            <textarea value={clientDoes} onChange={e => setClientDoes(e.target.value)} rows={2}
              placeholder="What do they do, and who buys it?" style={{ ...inp, resize: 'vertical', lineHeight: 1.55 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => void saveClient()} disabled={savingClient}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px', border: 'none', borderRadius: 9, background: INK, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                {savingClient ? <Loader size={13} className="spin" /> : <Check size={13} />} Save client
              </button>
              {portfolios.length > 0 && (
                <button onClick={() => setAddingClient(false)}
                  style={{ padding: '9px 14px', border: `1px solid ${LINE}`, borderRadius: 9, background: '#fff', fontSize: 12.5, fontWeight: 600, color: MUTED, cursor: 'pointer' }}>
                  Cancel
                </button>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
              Everything it writes comes from this. The fuller it is, the less generic the emails.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 7 }}>
            {portfolios.map(p => {
              const on = p.id === portfolioId;
              return (
                <button key={p.id} onClick={() => setPortfolioId(p.id)} aria-pressed={on}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', padding: '10px 12px',
                    borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                    border: `1.5px solid ${on ? ACCENT : LINE}`,
                    background: on ? 'rgba(91,70,229,0.05)' : '#fff',
                  }}>
                  <span style={{ width: 17, height: 17, borderRadius: 999, flexShrink: 0, border: `1.5px solid ${on ? ACCENT : '#cbd2df'}`, background: on ? ACCENT : '#fff', display: 'grid', placeItems: 'center' }}>
                    {on && <span style={{ width: 6, height: 6, borderRadius: 999, background: '#fff' }} />}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK }}>{p.name}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {String(p.profile?.description ?? '') || 'No description yet'}
                    </span>
                  </span>
                </button>
              );
            })}
            <button onClick={() => setAddingClient(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'start', marginTop: 2, padding: '7px 12px', border: `1px dashed ${LINE}`, borderRadius: 9, background: '#fff', fontSize: 12.5, fontWeight: 700, color: INK, cursor: 'pointer' }}>
              <Plus size={13} /> Add a client
            </button>
          </div>
        )}
      </div>

      {/* ── 2. How many ── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Mail size={15} color={ACCENT} />
          <span style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>How many emails?</span>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {COUNTS.map(n => (
            <button key={n} onClick={() => setSteps(n)} aria-pressed={steps === n}
              style={{
                width: 36, height: 36, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
                border: `1.5px solid ${steps === n ? ACCENT : LINE}`,
                background: steps === n ? ACCENT : '#fff',
                color: steps === n ? '#fff' : INK, fontSize: 13, fontWeight: 700,
              }}>
              {n}
            </button>
          ))}
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: MUTED, lineHeight: 1.55 }}>
          {steps === 1 ? 'One email. Right for an announcement or an offer with a date on it.'
            : steps <= 4 ? `${steps} emails over about a fortnight. The usual shape, and the one most people read to the end of.`
              : steps <= 8 ? `${steps} emails. A proper nurture — worth it when the thing you sell takes thinking about.`
                : `${steps} emails. A long run. Each one has to earn its place or people leave before the end.`}
        </p>
      </div>

      {/* ── 3. Somewhere to book ── */}
      <div style={card}>
        <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="checkbox" checked={useBooking} onChange={e => setUseBooking(e.target.checked)}
            style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer' }} />
          <span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <CalendarCheck size={15} color={ACCENT} />
              <span style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>Let people book a time</span>
            </span>
            <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 3, lineHeight: 1.55 }}>
              The emails will point at your diary instead of ending with “reply to this”. One click for
              the reader rather than an email chain.
            </span>
          </span>
        </label>

        {useBooking && (
          <div style={{ marginTop: 13, paddingTop: 13, borderTop: `1px solid ${LINE}` }}>
            {makingPage ? (
              <div style={{ display: 'grid', gap: 9 }}>
                <div>
                  <label style={lbl}>What is the meeting called?</label>
                  <input autoFocus value={pageTitle}
                    onChange={e => {
                      setPageTitle(e.target.value);
                      /* Filled from the name until somebody edits it themselves. */
                      if (!pageSlug || pageSlug === pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')) {
                        setPageSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
                      }
                    }}
                    placeholder="Free 20-minute consultation" style={inp} />
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <label style={lbl}>Web address</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 12.5, color: MUTED }}>/book/</span>
                      <input value={pageSlug} onChange={e => setPageSlug(e.target.value)} placeholder="consultation" style={inp} />
                    </div>
                  </div>
                  <div style={{ width: 110 }}>
                    <label style={lbl}>Minutes</label>
                    <input value={pageMinutes} inputMode="numeric"
                      onChange={e => setPageMinutes(e.target.value.replace(/[^\d]/g, ''))} style={inp} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => void publishPage()} disabled={publishing}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px', border: 'none', borderRadius: 9, background: INK, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                    {publishing ? <Loader size={13} className="spin" /> : <Check size={13} />} Publish it
                  </button>
                  <button onClick={() => setMakingPage(false)}
                    style={{ padding: '9px 14px', border: `1px solid ${LINE}`, borderRadius: 9, background: '#fff', fontSize: 12.5, fontWeight: 600, color: MUTED, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: MUTED, lineHeight: 1.55 }}>
                  Your existing hours are used — Monday to Friday unless you have changed them under
                  Booking pages. It goes live immediately, so the link in the emails will work.
                </p>
              </div>
            ) : bookingOptions.length === 0 ? (
              <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                <AlertCircle size={15} color="#c2410c" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ margin: '0 0 8px', fontSize: 12.5, color: '#7c2d12', lineHeight: 1.55 }}>
                    You have no booking page yet, so there is no link to put in. Make one here — it takes
                    two fields and you do not have to leave this screen.
                  </p>
                  <button onClick={() => setMakingPage(true)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: 'none', borderRadius: 9, background: INK, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                    <Plus size={13} /> Create a booking page
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 7 }}>
                {bookingOptions.map(o => {
                  const on = o.id === bookingChoice;
                  return (
                    <button key={o.id} onClick={() => setBookingChoice(o.id)} aria-pressed={on}
                      style={{
                        display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', padding: '9px 12px',
                        borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                        border: `1.5px solid ${on ? ACCENT : LINE}`,
                        background: on ? 'rgba(91,70,229,0.05)' : '#fff',
                      }}>
                      <span style={{ width: 17, height: 17, borderRadius: 999, flexShrink: 0, border: `1.5px solid ${on ? ACCENT : '#cbd2df'}`, background: on ? ACCENT : '#fff', display: 'grid', placeItems: 'center' }}>
                        {on && <span style={{ width: 6, height: 6, borderRadius: 999, background: '#fff' }} />}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK }}>{o.label}</span>
                        <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {o.sub} · {o.url.replace(/^https?:\/\//, '')}
                        </span>
                      </span>
                      <a href={o.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        aria-label={`Open ${o.label}`} style={{ color: MUTED, display: 'flex', flexShrink: 0 }}>
                        <ExternalLink size={13} />
                      </a>
                    </button>
                  );
                })}
                <button onClick={() => setMakingPage(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'start', marginTop: 2, padding: '7px 12px', border: `1px dashed ${LINE}`, borderRadius: 9, background: '#fff', fontSize: 12.5, fontWeight: 700, color: INK, cursor: 'pointer' }}>
                  <Plus size={13} /> A different meeting
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={onBack}
          style={{ padding: '10px 15px', border: `1px solid ${LINE}`, borderRadius: 10, background: '#fff', fontSize: 13, fontWeight: 700, color: INK, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <X size={14} /> Back
        </button>
        <span style={{ flex: 1, minWidth: 8 }} />
        {blocked && <span style={{ fontSize: 11.5, color: MUTED }}>{blocked}</span>}
        <button
          onClick={() => onReady({
            portfolioId,
            portfolioName: portfolios?.find(p => p.id === portfolioId)?.name ?? '',
            steps,
            bookingUrl: useBooking ? chosenUrl : '',
          })}
          disabled={!!blocked}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px',
            border: 'none', borderRadius: 10, background: blocked ? '#c7c9d3' : ACCENT, color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: blocked ? 'not-allowed' : 'pointer',
          }}>
          Continue
        </button>
      </div>
    </div>
  );
}
