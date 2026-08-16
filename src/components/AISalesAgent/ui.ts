/**
 * Shared surface styles for the module.
 *
 * Kept in one place so the dashboard and the detail page cannot drift apart,
 * and sized in clamp()/minmax() rather than fixed pixels so the module holds
 * together on a phone without needing media queries — which inline styles
 * cannot carry.
 */
import type { CSSProperties } from 'react';
import type { AICampaignStatus } from '../../types/aiSalesAgent';

export const card: CSSProperties = {
  backgroundColor: 'white',
  borderRadius: 18,
  border: '1px solid #e6e9f0',
  boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
};

export const primaryBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  padding: '9px 17px', backgroundColor: '#17191c', color: 'white',
  border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export const ghostBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  padding: '9px 15px', backgroundColor: 'white', color: '#334155',
  border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export interface Tone { fg: string; bg: string }

/**
 * Status carries colour as well as words, so a list of campaigns can be read at
 * a glance — but never colour alone, since the label is always shown too.
 */
export const STATUS_TONE: Record<AICampaignStatus, Tone> = {
  draft:               { fg: '#64748b', bg: '#f1f5f9' },
  'awaiting-approval': { fg: '#b45309', bg: '#fef3c7' },
  running:             { fg: '#15803d', bg: '#dcfce7' },
  paused:              { fg: '#a16207', bg: '#fef9c3' },
  completed:           { fg: '#1d4ed8', bg: '#dbeafe' },
  stopped:             { fg: '#b91c1c', bg: '#fee2e2' },
};

export function statusPill(tone: Tone): CSSProperties {
  return {
    display: 'inline-block', flexShrink: 0,
    padding: '3px 10px', borderRadius: 999,
    fontSize: 11, fontWeight: 700, letterSpacing: '0.01em',
    color: tone.fg, backgroundColor: tone.bg,
    whiteSpace: 'nowrap',
  };
}

/** "3 minutes ago" — a log is easier to follow in relative time. */
export function ago(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * A name for a campaign nobody named, taken from the first thing the objective
 * says — so the list never fills up with "Untitled campaign".
 *
 * Cut on a word boundary. Slicing at a fixed length puts "…more than one
 * location tha" in the page heading, which reads as a rendering fault rather
 * than a name.
 */
export function nameFromObjective(text: string, max = 52): string {
  const first = text.split(/[.\n]/)[0].trim();
  if (!first) return 'Untitled campaign';
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  const boundary = cut.lastIndexOf(' ');
  return `${(boundary > max * 0.5 ? cut.slice(0, boundary) : cut).replace(/[,;:\s]+$/, '')}…`;
}
