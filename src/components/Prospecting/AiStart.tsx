/**
 * The first screen of AI Prospecting — "Who do you want to sell to?"
 *
 * ── The promise in bold, and why it is true ──
 *
 * "Freshly searched, live" is the headline because it is the difference a
 * customer can feel: a bought list is a database of businesses somebody
 * scraped years ago, half of them closed. This page asks its sources at the
 * moment of the search (`live` in useProspectSearch — every cache skipped),
 * reads each website then, checks each address then, and stamps every row
 * with that moment. The words are only allowed because the code does that.
 *
 * The composer here is the same search as the results screen's bar: one
 * sentence, or the two boxes (`prospects.trade` / `prospects.place`, the
 * fields a refusal can name).
 */
import { useState } from 'react';
import {
  ArrowUp, BadgeCheck, Building2, Calculator, Coffee, Database, Globe, Hammer, HeartPulse, Loader, MailCheck, MapPin,
  PlayCircle, Scissors, Search, ShieldCheck, Sparkles, Stethoscope, Users, Wrench, X, Zap, Car, Utensils, Dumbbell,
  Home, Scale, Camera, PawPrint,
} from 'lucide-react';
import type { ProspectSearch } from './useProspectSearch';
import type { ProspectSource } from '../../services/prospects';

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

const TRADES = ['dentists', 'accountants', 'plumbers', 'electricians', 'builders', 'roofers', 'cafés', 'restaurants', 'hair salons',
  'barbers', 'gyms', 'estate agents', 'solicitors', 'physiotherapists', 'vets', 'hotels', 'florists', 'bakeries', 'garages', 'photographers'];

export function Composer({ s, text, setText, onGo, error, sources }: {
  s: ProspectSearch; text: string; setText: (t: string) => void; onGo: () => void; error: string;
  sources: { id: ProspectSource; label: string; tip: string; Icon: typeof MapPin; off: boolean }[];
}) {
  const places = [...new Set(s.history.map(h => h.place))].slice(0, 12);
  return (
    <form className="aip-composer aip-composer-start" onSubmit={e => { e.preventDefault(); onGo(); }}>
      <div className="aip-composer-strip">
        <span className="aip-strip-label"><Sparkles size={12} /> Search</span>
        <div role="group" aria-label="Where to search" className="aip-sources">
          {sources.map(t => (
            <button key={t.id} type="button" aria-pressed={s.source === t.id} onClick={() => s.setSource(t.id)} title={t.tip} data-off={t.off || undefined}>
              <t.Icon size={11} /> {t.label}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <span className="aip-strip-tools" aria-label="Also used">
          <span title="Each business's own website is read, live, for the address it publishes"><Globe size={11} /> Websites</span>
          <span title="Every address is checked for format, domain and mail server"><MailCheck size={11} /> Address checks</span>
        </span>
      </div>
      <div className="aip-composer-box">
        <label className="aip-ask-line">
          <Search size={17} />
          <input id="aip-ask" value={text} onChange={e => setText(e.target.value)} aria-label="Who to look for"
            placeholder="Find dentists in Leeds with a website…" autoComplete="off" />
        </label>
        <div className="aip-composer-row">
          <label className="aip-pick">
            <Building2 size={14} />
            <input value={s.trade} onChange={e => s.setTrade(e.target.value)} data-field="prospects.trade" aria-label="What kind of business"
              placeholder="Kind of business" list="aip-trades" autoComplete="off" />
          </label>
          <label className="aip-pick">
            <MapPin size={14} />
            <input value={s.place} onChange={e => s.setPlace(e.target.value)} data-field="prospects.place" aria-label="Where"
              placeholder="Town or city" list="aip-places" autoComplete="off" />
          </label>
          <datalist id="aip-trades">{TRADES.map(t => <option key={t} value={t} />)}</datalist>
          <datalist id="aip-places">{places.map(p => <option key={p} value={p} />)}</datalist>
          <button type="submit" className="aip-go" aria-label="Search" disabled={s.busy}>
            {s.busy ? <Loader size={16} className="spin" /> : <ArrowUp size={17} />} <span>Search</span>
          </button>
        </div>
      </div>
      {error && <div className="aip-ask-error" role="alert">{error}</div>}
    </form>
  );
}

export function StartScreen({ s, text, setText, onGo, error, sources, onExample, verifierReady }: {
  s: ProspectSearch; text: string; setText: (t: string) => void; onGo: () => void; error: string;
  sources: { id: ProspectSource; label: string; tip: string; Icon: typeof MapPin; off: boolean }[];
  onExample: (x: string) => void; verifierReady: boolean;
}) {
  return (
    <div className="aip-start">
      <span className="aip-blob aip-blob-a" aria-hidden="true" />
      <span className="aip-blob aip-blob-b" aria-hidden="true" />
      <span className="aip-eyebrow"><Sparkles size={13} /> AI Prospecting</span>
      <h3 className="aip-hero">Who do you want to sell to?</h3>
      <p className="aip-hero-sub">
        Say it in a sentence. AI Prospecting finds the businesses, searches each one's own website for the
        address it publishes, and checks every address before you send to it.
      </p>
      <div className="aip-live-promise" role="note">
        <span className="aip-live-dot" aria-hidden="true" />
        <span>
          <strong>Every lead is freshly baked — searched live from the internet the moment you ask.</strong>{' '}
          Not pulled from a database of leads that has sat for years with nobody knowing who is still trading: each website is
          read and each address checked right then, and <strong>every result carries the time it was found.</strong>
        </span>
      </div>
      <div className="aip-examples">
        {EXAMPLES.map(x => {
          const Icon = tradeIcon(x);
          return (
            <button key={x} type="button" className="aip-example" onClick={() => onExample(x)}>
              <span className="aip-ex-icon" data-tone={tradeTone(x)}><Icon size={14} /></span> {x}
            </button>
          );
        })}
      </div>
      <div className="aip-steps3">
        <div className="aip-step3" data-tone="violet">
          <span className="aip-step3-icon"><Search size={18} /></span>
          <b>1. Find</b>
          <span>Businesses by trade and town, searched live.</span>
          <span className="aip-illu aip-illu-find" aria-hidden="true"><i /><i /><i /><MapPin size={14} /><MapPin size={11} /></span>
        </div>
        <div className="aip-step3" data-tone="orange">
          <span className="aip-step3-icon"><Database size={18} /></span>
          <b>2. Enrich</b>
          <span>The address, website and phone each business publishes, read from its own site at the time of the search.</span>
          <span className="aip-illu aip-illu-enrich" aria-hidden="true"><Building2 size={15} /><i /><i /><Globe size={13} /><MailCheck size={13} /></span>
        </div>
        <div className="aip-step3" data-tone="green">
          <span className="aip-step3-icon"><ShieldCheck size={18} /></span>
          <b>3. Verify</b>
          <span>Every address checked for format, domain and mail server{verifierReady ? ', and the mailbox itself,' : ''} — risky and dead ones flagged before you send.</span>
          <span className="aip-illu aip-illu-verify" aria-hidden="true"><MailCheck size={22} /><BadgeCheck size={16} /></span>
        </div>
      </div>
      <Composer s={s} text={text} setText={setText} onGo={onGo} error={error} sources={sources} />
      <div className="aip-trust">
        <span><Zap size={16} /><b>Live business data</b><small>Searched when you ask, time-stamped</small></span>
        <span><ShieldCheck size={16} /><b>Checked email addresses</b><small>Fewer bounces, a safer domain</small></span>
        <span><Users size={16} /><b>Ready to outreach</b><small>Lists, workflows, AI projects, campaigns</small></span>
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
          <li><b>You say who.</b> "Dentists in Leeds with a website" — or the two boxes. "With a website / an email / a phone" narrows what is shown.</li>
          <li><b>It searches live.</b> All businesses, registered companies with their directors, or businesses with ratings and reviews — asked at that moment, never a stored list.</li>
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
        <p className="aip-fine" style={{ padding: '0 18px 16px' }}>Pick one, then say where — it fills the box for you.</p>
      </div>
    </div>
  );
}
