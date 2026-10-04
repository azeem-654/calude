/**
 * The corner of every screen: the owner's messages, and an offer of help.
 *
 * ── Why help is offered, not just available ──
 *
 * The round help button has always been there, and a stuck trial customer
 * almost never presses it. They conclude the product is hard, close the tab,
 * and the trial ends on day seven with nobody having heard from them. So this
 * card asks — at the two moments somebody is most likely to be stuck:
 *
 *  1. Something just went wrong on this screen: a server error, a form asking
 *     for a box it does not show, a crash (fieldGuard.ts `signalTrouble`).
 *     Always offered, trial or not; it is the moment a customer decides
 *     whether to leave.
 *  2. They have been on a screen a while during their trial. Once per screen
 *     per day, after 75 seconds of the tab being visible — long enough that
 *     somebody who knew what they were doing would have done it.
 *
 * The card names the screen and offers only what will work: a call in the
 * browser, screen sharing, chat and a ticket when the help widget has them
 * switched on — named exactly as the widget's own home panel names them, so
 * the card and the panel it opens never disagree — and a booked call when the
 * owner has set a kickoff booking link. A card with nothing behind its buttons would
 * be worse than no card, so with none of those it is not drawn at all.
 *
 * Nothing here for the install owner, who is the person being asked for.
 *
 * ── The owner's messages ──
 *
 * Unread notices from routes/customers.ts sit above the help offer until they
 * are closed. They come from the owner, so their button is the owner's link —
 * the server has already refused anything that is not http(s).
 *
 * ── Out of the way of a dialog ──
 *
 * While a modal is open the whole corner steps aside. It sits above the page
 * at a fixed spot, and a wizard's footer button lives in the same corner: the
 * welcome notice covered "Continue" on the New project wizard, so a brand-new
 * customer's first project could not get past its first screen. Nothing is
 * lost — the notices stay unread and come back when the dialog closes.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CalendarCheck, LifeBuoy, MessageSquare, Monitor, Phone, Ticket, X } from 'lucide-react';
import { getSession } from '../../services/auth';
import { myAccount, onMyAccount, readNotice, type MyAccount } from '../../services/customers';
import { TROUBLE_EVENT } from '../../services/fieldGuard';
import { NAV_GROUPS } from '../Layout/navModel';

interface Chat { open: (view?: string) => void; features: () => string[]; online?: () => boolean | null }
declare global { interface Window { ProtectedCentralChat?: Chat } }

const OFF_KEY = 'pc_help_offer_off';
const DWELL_MS = 75_000;

/** The screen's own name, from the nav, so the offer says where they are. */
function screenName(path: string): string {
  const items = NAV_GROUPS.flatMap(g => g.items);
  const hit = items.find(i => i.path.split('?')[0] === path);
  if (hit) return hit.label;
  if (path === '/') return 'the dashboard';
  return 'this screen';
}

/** Whether a modal dialog is open anywhere on the page. Watched rather than
    asked for, because the dialogs are spread over twenty components and the
    one that broke this was not written with the corner in mind. */
function useModalOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => setOpen(!!document.querySelector('[aria-modal="true"]'));
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal'] });
    return () => mo.disconnect();
  }, []);
  return open;
}

const dayKey = (path: string) => `pc_help_offered_${new Date().toISOString().slice(0, 10)}_${path}`;

export default function CornerHelp() {
  const session = getSession();
  const isOwner = !!session && session.user.accountId == null && session.user.role === 'agency';
  const loc = useLocation();
  const [acct, setAcct] = useState<MyAccount | null>(null);
  const [features, setFeatures] = useState<string[]>(() => window.ProtectedCentralChat?.features() ?? []);
  const [offer, setOffer] = useState<{ path: string; why: 'trouble' | 'dwell' } | null>(null);
  const shownFor = useRef(new Set<string>());
  const modalOpen = useModalOpen();

  useEffect(() => {
    let alive = true;
    void myAccount().then(a => { if (alive) setAcct(a); });
    const off = onMyAccount(a => { if (alive) setAcct(a); });
    const ready = () => setFeatures(window.ProtectedCentralChat?.features() ?? []);
    window.addEventListener('pc-widget-ready', ready);
    return () => { alive = false; off(); window.removeEventListener('pc-widget-ready', ready); };
  }, []);

  const canChat = features.includes('chat');
  const canScreen = features.includes('screen');
  const canCall = features.includes('voice');
  const canTicket = features.includes('ticket');
  const kickoff = acct?.kickoffUrl ?? '';
  const anything = canChat || canScreen || canCall || canTicket || !!kickoff || features.length > 0;

  /* 1. Something went wrong here. */
  useEffect(() => {
    if (isOwner) return;
    const onTrouble = () => {
      const path = window.location.pathname;
      if (shownFor.current.has(`t:${path}`)) return;
      shownFor.current.add(`t:${path}`);
      setOffer({ path, why: 'trouble' });
    };
    window.addEventListener(TROUBLE_EVENT, onTrouble);
    return () => window.removeEventListener(TROUBLE_EVENT, onTrouble);
  }, [isOwner]);

  /* 2. A while on one screen, during the trial. Counted only while the tab is
     visible — a tab left open over lunch is not somebody stuck. */
  const onTrial = acct?.trial.kind === 'trial';
  useEffect(() => {
    if (isOwner || !onTrial) return;
    const path = loc.pathname;
    let off = false;
    try { off = localStorage.getItem(OFF_KEY) === '1' || localStorage.getItem(dayKey(path)) === '1'; } catch { /* private mode */ }
    if (off) return;
    let spent = 0;
    let last = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === 'visible') spent += now - last;
      last = now;
      if (spent < DWELL_MS) return;
      window.clearInterval(timer);
      try { localStorage.setItem(dayKey(path), '1'); } catch { /* shown once more tomorrow instead */ }
      setOffer(o => o ?? { path, why: 'dwell' });
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [isOwner, onTrial, loc.pathname]);

  const name = useMemo(() => screenName(loc.pathname), [loc.pathname]);
  const notices = acct?.notices ?? [];
  const showOffer = !!offer && offer.path === loc.pathname && anything && !isOwner;
  if (modalOpen || (!notices.length && !showOffer)) return null;

  const openChat = (view: string) => { window.ProtectedCentralChat?.open(view); setOffer(null); };

  return (
    <div style={{
      position: 'fixed', right: 16, bottom: 84, zIndex: 890, width: 'min(360px, calc(100vw - 32px))',
      display: 'grid', gap: 10,
    }}>
      {notices.slice(0, 2).map(n => (
        <div key={n.id} role="status" style={CARD}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <b style={{ fontSize: 14, lineHeight: 1.35, flex: 1 }}>{n.title}</b>
            <button type="button" aria-label="Close this message" style={CLOSE} onClick={() => void readNotice(n.id).then(() => setAcct(a => (a ? { ...a, notices: a.notices.filter(x => x.id !== n.id) } : a)))}>
              <X size={14} />
            </button>
          </div>
          {n.body && <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.55, color: '#4b5563', whiteSpace: 'pre-line' }}>{n.body}</p>}
          {n.link && (
            <a href={n.link} target="_blank" rel="noopener noreferrer" style={{ ...PRIMARY, marginTop: 10 }}>
              <CalendarCheck size={14} /> {n.linkLabel || 'Open'}
            </a>
          )}
        </div>
      ))}

      {showOffer && (
        <div role="dialog" aria-label="Help with this screen" style={CARD}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <LifeBuoy size={18} color="#5b46e5" style={{ flexShrink: 0, marginTop: 1 }} />
            <b style={{ fontSize: 14, lineHeight: 1.35, flex: 1 }}>
              {offer?.why === 'trouble'
                ? 'That did not go through. Want a hand?'
                : `Need a hand with ${name}?`}
            </b>
            <button type="button" aria-label="Not now" style={CLOSE} onClick={() => setOffer(null)}><X size={14} /></button>
          </div>
          <p style={{ margin: '6px 0 10px', fontSize: 13, lineHeight: 1.55, color: '#4b5563' }}>
            {offer?.why === 'trouble'
              ? 'A real person can look at it with you now — we see which screen you are on.'
              : `A real person can walk you through it — ${ways({ call: canCall, screen: canScreen, chat: canChat, ticket: canTicket, book: !!kickoff })}.`}
          </p>
          <div style={{ display: 'grid', gap: 6 }}>
            {/* The widget's own names and order, the first one the strong one. */}
            {canCall && <button type="button" style={PRIMARY} onClick={() => openChat('voice')}><Phone size={14} /> Start an online call</button>}
            {canScreen && <button type="button" style={canCall ? SECONDARY : PRIMARY} onClick={() => openChat('screen')}><Monitor size={14} /> Share your screen with us</button>}
            {canChat && <button type="button" style={canCall || canScreen ? SECONDARY : PRIMARY} onClick={() => openChat('chat')}><MessageSquare size={14} /> Live chat</button>}
            {canTicket && !canChat && !canScreen && !canCall && <button type="button" style={PRIMARY} onClick={() => openChat('ticket')}><Ticket size={14} /> Submit a ticket</button>}
            {!canChat && !canScreen && !canCall && !canTicket && features.length > 0 && (
              <button type="button" style={PRIMARY} onClick={() => openChat('home')}><LifeBuoy size={14} /> Get help</button>
            )}
            {kickoff && (
              <a href={kickoff} target="_blank" rel="noopener noreferrer" style={SECONDARY} onClick={() => setOffer(null)}>
                <CalendarCheck size={14} /> Book a call
              </a>
            )}
          </div>
          {offer?.why === 'dwell' && (
            <button type="button" style={{ ...CLOSE, width: 'auto', marginTop: 8, fontSize: 12, color: '#6b7280', textDecoration: 'underline' }}
              onClick={() => { try { localStorage.setItem(OFF_KEY, '1'); } catch { /* private mode */ } setOffer(null); }}>
              Don&rsquo;t offer this again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* Only the ways that are on the card. The sentence used to list all three
   whatever was switched on, so a card with one "Book a call" button offered a
   chat and a screen share that were nowhere on it. */
function ways(o: { call: boolean; screen: boolean; chat: boolean; ticket: boolean; book: boolean }): string {
  const w = [
    o.call && 'call us now from your browser', o.screen && 'share your screen', o.chat && 'chat',
    o.ticket && !o.chat && !o.screen && !o.call && 'submit a ticket', o.book && 'book a call',
  ].filter(Boolean) as string[];
  if (!w.length) return 'press Get help';
  return w.length === 1 ? w[0] : `${w.slice(0, -1).join(', ')} or ${w[w.length - 1]}`;
}

const CARD: React.CSSProperties = {
  background: '#fff', borderRadius: 16, padding: '14px 14px 12px', border: '1px solid #e5e7eb',
  boxShadow: '0 18px 40px -16px rgba(15,23,42,.35)', fontFamily: 'inherit', color: '#111827',
};
const CLOSE: React.CSSProperties = {
  border: 'none', background: 'transparent', padding: 2, cursor: 'pointer', color: '#6b7280',
  display: 'inline-flex', flexShrink: 0,
};
const PRIMARY: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px 12px',
  borderRadius: 10, border: 'none', background: '#5b46e5', color: '#fff', fontWeight: 700, fontSize: 13,
  cursor: 'pointer', textDecoration: 'none', fontFamily: 'inherit',
};
const SECONDARY: React.CSSProperties = {
  ...PRIMARY, background: '#fff', color: '#111827', border: '1px solid #e5e7eb',
};
