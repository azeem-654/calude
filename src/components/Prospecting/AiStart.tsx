/**
 * The first screen of AI Prospecting — "Who do you want to sell to?" — and
 * the composer it opens on.
 *
 * ── Prompt first ──
 *
 * The sentence box is the first thing on the screen, above the fold on a
 * laptop and on a phone, because typing who to look for is the only thing
 * this screen is for. It once sat under a promise, examples and three
 * illustrated steps, and people scrolled to find it. Those are below it now.
 *
 * ── One sentence, no boxes, no tabs ──
 *
 * There is no "kind of business" box, no "town" box and no row of source
 * tabs. The sentence is read (`readAsk` in services/aiProspecting.ts) for the
 * trade, the place, what to narrow to ("with a website") and where to look
 * ("registered companies", "with reviews"), and `chooseSource` decides what
 * is actually asked given what the owner has switched on. What was understood
 * is shown under the words as chips, and a sentence missing its place or its
 * trade is asked about there rather than searched blind.
 *
 * A refusal from the server can still name `prospects.trade` or
 * `prospects.place`; the sentence box carries both names in its `data-field`
 * (fieldGuard.ts matches one of several), so the refusal is never a dead end,
 * and the words go under the box with how to say it in the sentence.
 *
 * ── The promise in bold, and why it is true ──
 *
 * "Freshly searched, live" is the promise because it is the difference a
 * customer can feel: a bought list is a database of businesses somebody
 * scraped years ago, half of them closed. This page asks its sources at the
 * moment of the search (`live` in useProspectSearch — every cache skipped),
 * reads each website then, checks each address then, and stamps every row
 * with that moment. The words are only allowed because the code does that.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  ArrowUp, BadgeCheck, Building2, Calculator, Coffee, Database, Globe, Hammer, HeartPulse, Loader, MailCheck, MapPin,
  Phone, PlayCircle, Scissors, Search, ShieldCheck, Sparkles, Star, Stethoscope, Users, Wrench, X, Zap, Car, Utensils, Dumbbell,
  Home, Scale, Camera, PawPrint,
} from 'lucide-react';
import type { ProspectSearch } from './useProspectSearch';
import MicButton from './MicButton';
import { SOURCE_LABEL, askProblem, chooseSource, readAsk, type AskSource } from '../../services/aiProspecting';

/** An icon for a trade, for the chips and the recent searches. A guess at a picture, never at data. */
export function tradeIcon(trade: string): typeof Building2 {
  const t = trade.toLowerCase();
  if (/dent|orthodon/.test(t)) return Stethoscope;
  if (/doctor|clinic|physio|chiro|pharm|care/.test(t)) return HeartPulse;
  if (/caf|coffee|bakery/.test(t)) return Coffee;
  if (/restaurant|takeaway|pub|bar|food/.test(t)) return Utensils;
  if (/account|bookkeep|tax|financ/.test(t)) return Calculator;
  if (/hair|salon|barber|beaut|nail/.test(t)) return Scissors;
  if (/plumb|electric|heating|mechanic|garage/.test(t)) return Wrench;
  if (/build|roof|joiner|carpent|plaster|paint/.test(t)) return Hammer;
  if (/gym|fitness|yoga|pilates/.test(t)) return Dumbbell;
  if (/estate|letting|property/.test(t)) return Home;
  if (/solicitor|lawyer|legal/.test(t)) return Scale;
  if (/photo/.test(t)) return Camera;
  if (/vet|pet|groom/.test(t)) return PawPrint;
  if (/car|taxi/.test(t)) return Car;
  return Building2;
}

/** A tint per trade, so a list of recent searches is not six identical grey squares. */
export function tradeTone(trade: string): string {
  const tones = ['violet', 'orange', 'blue', 'pink', 'green', 'sky'];
  return tones[[...trade.toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 3) % tones.length];
}

export const EXAMPLES = ['Dentists in Leeds with a website', 'Cafés near Bristol', 'Accountants in Austin, Texas', 'Hair salons in Manchester'];

/** Ready-made searches by what the customer sells — "Need ideas?". */
export const IDEAS: { sell: string; trades: string[] }[] = [
  { sell: 'Websites, SEO or marketing', trades: ['restaurants', 'dentists', 'hair salons', 'plumbers', 'gyms'] },
  { sell: 'Accounting or bookkeeping', trades: ['builders', 'cafés', 'electricians', 'estate agents'] },
  { sell: 'Cleaning or facilities', trades: ['dentists', 'gyms', 'accountants', 'solicitors'] },
  { sell: 'Software or IT support', trades: ['accountants', 'solicitors', 'estate agents', 'opticians'] },
  { sell: 'Photography or video', trades: ['restaurants', 'hotels', 'wedding planners', 'estate agents'] },
];

/* Offered when a sentence names a place but no kind of business. */
const COMMON_TRADES = ['dentists', 'accountants', 'cafés', 'plumbers'];

export const SOURCE_ICON: Record<AskSource | 'osm', typeof MapPin> = { free: MapPin, osm: MapPin, register: BadgeCheck, google: Star };

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const enough = (x: string) => x.replace(/[^\p{L}\p{N}]/gu, '').length >= 2;

/**
 * The sentence box — the same one on the first screen (`hero`) and on the
 * results screen's search card (`bar`). Enter searches, Shift+Enter is a new
 * line; the box grows with what is typed. The microphone puts what it heard
 * in the box for checking — never straight into a search.
 */
export function Composer({ s, text, setText, onGo, error, variant = 'hero', searchedSource }: {
  s: ProspectSearch; text: string; setText: (t: string) => void; onGo: () => void; error: string; variant?: 'hero' | 'bar';
  /** On the results screen, the source already searched — labelled above the box, so the chip is drawn only when the words would change it. */
  searchedSource?: string;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text, variant]);

  const a = useMemo(() => (text.trim() ? readAsk(text) : null), [text]);
  const choice = a ? chooseSource(a.source, s.google) : null;
  const sameSource = !!choice && !choice.note && (choice.source === searchedSource || (choice.source === 'free' && searchedSource === 'osm'));
  const problem = error ? askProblem(text) : null;
  const places = [...new Set(s.history.map(h => h.place))].slice(0, 4);

  /* A chip is the words it came from: pressing it selects them in the box, ready to retype. */
  const select = (part: string) => {
    const el = box.current;
    if (!el) return;
    el.focus();
    const at = part ? el.value.toLowerCase().indexOf(part.toLowerCase()) : -1;
    if (at >= 0) el.setSelectionRange(at, at + part.length);
    else el.setSelectionRange(0, 0);
  };
  const setAndFocus = (next: string) => {
    setText(next);
    window.setTimeout(() => { const el = box.current; if (el) { el.focus(); el.setSelectionRange(next.length, next.length); } }, 20);
  };
  const addPlace = (p: string) => setAndFocus(`${text.trim().replace(/\s+(?:in|near|around)$/i, '')} in ${p}`);
  const addTrade = (t: string) => setAndFocus(`${t} in ${problem?.place ?? ''}`);

  const SrcIcon = choice ? SOURCE_ICON[choice.source] : MapPin;
  const Trade = tradeIcon(a?.trade ?? '');
  const hintId = `aip-ask-hint-${variant}`;

  return (
    <form className="aip-ask" data-variant={variant} onSubmit={e => { e.preventDefault(); onGo(); }}>
      <div className="aip-ask-card" data-busy={s.busy || undefined}>
        <textarea
          ref={box}
          id={variant === 'hero' ? 'aip-ask' : 'aip-ask-bar'}
          className="aip-ask-input"
          rows={1}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onGo(); }
          }}
          aria-label="Who to look for"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? hintId : undefined}
          data-field="prospects.ask prospects.trade prospects.place"
          placeholder={variant === 'hero' ? 'Find dentists in Leeds with a website…' : 'Search again — e.g. cafés near Bristol'}
          autoComplete="off"
          spellCheck={false}
        />
        <div className="aip-ask-foot">
          <div className="aip-understood" aria-label="What was understood">
            {a && (enough(a.trade)
              ? <button type="button" className="aip-uchip" onClick={() => select(a.trade)} title="Press to change the kind of business"><Trade size={12} /> {cap(a.trade)}</button>
              : <button type="button" className="aip-uchip" data-missing onClick={() => select('')}>Kind of business?</button>)}
            {a && (enough(a.place)
              ? <button type="button" className="aip-uchip" onClick={() => select(a.place)} title="Press to change the place"><MapPin size={12} /> {cap(a.place)}</button>
              : <button type="button" className="aip-uchip" data-missing onClick={() => setAndFocus(`${text.trim()} in `)}>Where?</button>)}
            {a?.want.website && <span className="aip-uchip" data-want><Globe size={12} /> with a website</span>}
            {a?.want.email && <span className="aip-uchip" data-want><MailCheck size={12} /> with an email</span>}
            {a?.want.phone && <span className="aip-uchip" data-want><Phone size={12} /> with a phone</span>}
            {choice && !sameSource && (
              <span className="aip-uchip" data-src={choice.source}
                title={choice.note || 'Where this searches — say "registered companies" or "with reviews" in the sentence to change it'}>
                <SrcIcon size={12} /> {SOURCE_LABEL[choice.source]}
              </span>
            )}
            {!a && variant === 'hero' && (
              <span className="aip-ask-kbd"><kbd>Enter</kbd> to search · <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line</span>
            )}
          </div>
          <MicButton onResult={r => setAndFocus(r.text)} />
          <button type="submit" className="aip-go" aria-label="Search" disabled={s.busy}>
            {s.busy ? <Loader size={16} className="spin" /> : variant === 'hero' ? <ArrowUp size={17} /> : <Sparkles size={15} />} <span>Search</span>
          </button>
        </div>
      </div>
      {error && (
        <div className="aip-ask-error" id={hintId} role="alert">
          <span>{error}</span>
          {problem?.field === 'place' && places.length > 0 && (
            <span className="aip-fixes">{places.map(p => <button key={p} type="button" className="aip-fix" onClick={() => addPlace(p)}>in {p}</button>)}</span>
          )}
          {problem?.field === 'trade' && problem.place && (
            <span className="aip-fixes">{COMMON_TRADES.map(t => <button key={t} type="button" className="aip-fix" onClick={() => addTrade(t)}>{t}</button>)}</span>
          )}
        </div>
      )}
      {!error && choice?.note && <div className="aip-ask-note" role="status">{choice.note}</div>}
    </form>
  );
}

export function StartScreen({ s, text, setText, onGo, error, onExample, verifierReady }: {
  s: ProspectSearch; text: string; setText: (t: string) => void; onGo: () => void; error: string;
  onExample: (x: string) => void; verifierReady: boolean;
}) {
  /* Only the ways of asking that work here are taught — "registered companies"
     where the register is on, "with reviews" where Google is. */
  const canRegister = !!s.google?.register.available;
  const canRatings = !!s.google?.available;
  return (
    <div className="aip-start">
      <span className="aip-blob aip-blob-a" aria-hidden="true" />
      <span className="aip-blob aip-blob-b" aria-hidden="true" />
      <h3 className="aip-hero">Who do you want to sell to?</h3>
      <p className="aip-hero-sub">
        Say it in a sentence. AI Prospecting finds the businesses live, reads each one's website for the address it
        publishes, and checks every address.
      </p>
      <Composer s={s} text={text} setText={setText} onGo={onGo} error={error} variant="hero" />
      <div className="aip-examples" aria-label="Try one">
        {EXAMPLES.map(x => {
          const Icon = tradeIcon(x);
          return (
            <button key={x} type="button" className="aip-example" onClick={() => onExample(x)}>
              <span className="aip-ex-icon" data-tone={tradeTone(x)}><Icon size={13} /></span> {x}
            </button>
          );
        })}
      </div>
      {(canRegister || canRatings) && (
        <p className="aip-ask-tip">
          <Sparkles size={12} />
          <span>
            Add {canRegister && <><q>registered companies</q> for the company register with directors</>}
            {canRegister && canRatings && ', or '}{canRatings && <><q>with reviews</q> for ratings</>} — otherwise it searches all businesses.
          </span>
        </p>
      )}

      <div className="aip-start-more">
        <div className="aip-live-promise" role="note">
          <span className="aip-live-dot" aria-hidden="true" />
          <span>
            <strong>Every lead is freshly baked — searched live from the internet the moment you ask.</strong>{' '}
            Not pulled from a database of leads that has sat for years with nobody knowing who is still trading: each website is
            read and each address checked right then, and <strong>every result carries the time it was found.</strong>
          </span>
        </div>
        <div className="aip-steps3">
          <div className="aip-step3" data-tone="violet">
            <span className="aip-step3-icon"><Search size={16} /></span>
            <b>1. Find</b>
            <span>Businesses by trade and town, searched live.</span>
            <span className="aip-illu aip-illu-find" aria-hidden="true"><i /><i /><i /><MapPin size={13} /><MapPin size={10} /></span>
          </div>
          <div className="aip-step3" data-tone="orange">
            <span className="aip-step3-icon"><Database size={16} /></span>
            <b>2. Enrich</b>
            <span>The address, website and phone each business publishes, read from its own site at the time of the search.</span>
            <span className="aip-illu aip-illu-enrich" aria-hidden="true"><Building2 size={14} /><i /><i /><Globe size={12} /><MailCheck size={12} /></span>
          </div>
          <div className="aip-step3" data-tone="green">
            <span className="aip-step3-icon"><ShieldCheck size={16} /></span>
            <b>3. Verify</b>
            <span>Every address checked for format, domain and mail server{verifierReady ? ', and the mailbox itself,' : ''} — risky and dead ones flagged before you send.</span>
            <span className="aip-illu aip-illu-verify" aria-hidden="true"><MailCheck size={20} /><BadgeCheck size={14} /></span>
          </div>
        </div>
        <div className="aip-trust">
          <span><Zap size={16} /><b>Live business data</b><small>Searched when you ask, time-stamped</small></span>
          <span><ShieldCheck size={16} /><b>Checked email addresses</b><small>Fewer bounces, a safer domain</small></span>
          <span><Users size={16} /><b>Ready to outreach</b><small>Lists, workflows, AI projects, campaigns</small></span>
        </div>
      </div>
    </div>
  );
}

/** "How it works" — what each step does, which sources, and what it will not do. */
export function HowItWorks({ onClose }: { onClose: () => void }) {
  return (
    <div className="aip-modal" role="dialog" aria-modal="true" aria-label="How AI Prospecting works" onClick={onClose}>
      <div className="aip-modal-card" onClick={e => e.stopPropagation()}>
        <div className="aip-card-head">
          <span className="aip-card-title"><PlayCircle size={15} /> How AI Prospecting works</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="aip-icon-btn" aria-label="Close" onClick={onClose}><X size={14} /></button>
        </div>
        <ol className="aip-how-list">
          <li><b>You say who, in one sentence.</b> "Dentists in Leeds with a website" — the kind of business, the place, and anything to narrow it to ("with a website / an email / a phone"). What it understood is shown under your words before it searches.</li>
          <li><b>It searches live.</b> All businesses by default; say "registered companies" for the company register with directors, or "with reviews" for businesses with ratings — where those are switched on. Asked at that moment, never a stored list.</li>
          <li><b>It reads their websites.</b> The address each business chose to publish, from its own pages, right then. Never a guessed firstname@ address.</li>
          <li><b>It checks every address.</b> Format, domain and mail server; with a verifier connected, whether the mailbox exists. Each result is tagged with the day it was checked — Contact verified (the mailbox answered), Contact checked (domain and mail server), Risky, Invalid.</li>
          <li><b>You choose where they go.</b> Tick them and save to a contact list, or add them to a workflow, an AI project or an email campaign. Nobody is emailed until you start something that emails.</li>
        </ol>
        <p className="aip-fine" style={{ padding: '0 18px 16px' }}>
          Never LinkedIn, Apollo or bought data — their terms forbid this use. Found businesses never asked to hear from you,
          so campaigns and Autopilot treat them as strangers: small batches, your approval first.
        </p>
      </div>
    </div>
  );
}

/** "Need ideas?" — ready-made searches by what you sell. */
export function Ideas({ onPick, onClose }: { onPick: (trade: string) => void; onClose: () => void }) {
  return (
    <div className="aip-modal" role="dialog" aria-modal="true" aria-label="Search ideas" onClick={onClose}>
      <div className="aip-modal-card" onClick={e => e.stopPropagation()}>
        <div className="aip-card-head">
          <span className="aip-card-title"><Sparkles size={15} /> Who buys what you sell</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="aip-icon-btn" aria-label="Close" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="aip-ideas">
          {IDEAS.map(g => (
            <div key={g.sell}>
              <b>If you sell {g.sell.toLowerCase()}</b>
              <div className="aip-examples" style={{ justifyContent: 'flex-start' }}>
                {g.trades.map(t => {
                  const Icon = tradeIcon(t);
                  return <button key={t} type="button" className="aip-example" onClick={() => onPick(t)}><span className="aip-ex-icon" data-tone={tradeTone(t)}><Icon size={13} /></span> {t}</button>;
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="aip-fine" style={{ padding: '0 18px 16px' }}>Pick one, then say where — it starts the sentence for you.</p>
      </div>
    </div>
  );
}
