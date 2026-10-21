/**
 * The upload-and-prepare progress screen's numbers.
 *
 * ── Real first, then a creep that cannot lie ──
 *
 * The whole journey (upload → prepare → transcribe → find fillers and
 * retakes) is one bar, cut into bands. Inside a band the position is real
 * whenever there is something real to read: bytes that have left the
 * browser, the engine's byte count for a fetch, FFmpeg's clock, pieces
 * transcribed. Between two real readings the number creeps on — that is
 * what keeps a 20-minute upload from looking frozen — but only towards the
 * end of the band it is in, slowing as it gets near, so it never passes the
 * next real milestone and never says 100% before the server says "done".
 */
import { useEffect, useRef, useState } from 'react';
import type { ProjectView } from '../../services/videoStudio';

export type Origin = 'file' | 'youtube' | 'link';
export interface Band { key: string; label: string; from: number; to: number }

export function bandsFor(origin: Origin): Band[] {
  const first = origin === 'file' ? { key: 'upload', label: 'Uploading' } : origin === 'youtube' ? { key: 'fetch_url', label: 'Fetching from YouTube' } : { key: 'fetch_link', label: 'Fetching from the link' };
  return [
    { ...first, from: 0, to: 35 },
    { key: 'prepare', label: 'Preparing the video', from: 35, to: 52 },
    { key: 'transcribe', label: 'Transcribing', from: 52, to: 88 },
    { key: 'analyze', label: 'Finding fillers and retakes', from: 88, to: 99.6 },
  ];
}

export interface Reading {
  /** Where the bar really is, 0–100. */
  value: number;
  /** The band it is in (bands.length when everything is done). */
  index: number;
  /** How far the creep may go: just short of the band's end. */
  ceiling: number;
  /** The band's own real percentage, when there is one. */
  stagePct: number | null;
  done: boolean;
  /** A stage the server says failed, with its sentence. */
  failed: string;
  /** Transcription was not needed (no sound) or not possible: said, and the editor opens without it. */
  skipped: string[];
}

const stageOf = (v: ProjectView | null, key: string) => v?.stages.find(s => s.key === key) ?? null;

export function readProgress(bands: Band[], v: ProjectView | null, upload: { sent: number; total: number } | null): Reading {
  const skipped: string[] = [];
  let failed = '';
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    const st = stageOf(v, b.key);
    let finished = false, pct: number | null = null;
    if (i === 0) {
      finished = !!v && (st?.state === 'done' || !!v.source.probe || stageOf(v, 'prepare')?.state === 'active' || stageOf(v, 'prepare')?.state === 'done');
      if (b.key === 'upload' && upload) pct = (upload.sent / Math.max(1, upload.total)) * 100;
      else if (b.key === 'fetch_link' && v?.source.link?.bytes) pct = (v.source.link.got / v.source.link.bytes) * 100;
      else pct = st?.pct ?? null;
    } else {
      finished = st?.state === 'done' || st?.state === 'skipped';
      if (st?.state === 'skipped') skipped.push(b.key);
      pct = st?.state === 'active' ? st.pct : null;
    }
    if (st?.state === 'failed') failed = st.note || v?.project.error || `${b.label} stopped.`;
    if (!finished) {
      const p = pct === null ? 0 : Math.max(0, Math.min(100, pct));
      return { value: b.from + ((b.to - b.from) * p) / 100, index: i, ceiling: b.to - 0.3, stagePct: pct, done: false, failed: failed || (v?.project.status === 'failed' ? v.project.error : ''), skipped };
    }
  }
  return { value: 100, index: bands.length, ceiling: 100, stagePct: 100, done: true, failed: '', skipped };
}

/**
 * The number on screen: catches up with a real reading quickly, creeps on
 * between readings at the pace the real ones have been arriving (or a slow
 * default), and slows as it nears the ceiling so it never reaches it.
 */
export function useCreep(real: number, ceiling: number, done: boolean): number {
  const [shown, setShown] = useState(real);
  const st = useRef({ d: real, real, at: performance.now(), rate: 0 });
  useEffect(() => {
    const s = st.current, now = performance.now();
    if (real > s.real) {
      const inst = (real - s.real) / Math.max(0.25, (now - s.at) / 1000);
      s.rate = s.rate ? s.rate * 0.6 + inst * 0.4 : inst;
    }
    if (real !== s.real) { s.real = real; s.at = now; }
  }, [real]);
  useEffect(() => {
    let last = performance.now();
    const t = window.setInterval(() => {
      const s = st.current, now = performance.now(), dt = (now - last) / 1000;
      last = now;
      if (done) { s.d = 100; setShown(100); return; }
      if (s.d < s.real) s.d = Math.min(s.real, s.d + Math.max(0.1, (s.real - s.d) * 0.35));
      else {
        const room = ceiling - s.d;
        if (room > 0.05) {
          /* Most of the pace real readings have shown, at least a slow tick — and never more than a small share of what is left. */
          const pace = Math.max(0.08, Math.min(s.rate * 0.85, 2.5));
          s.d += Math.min(pace * dt, room * 0.045 * dt);
        }
      }
      setShown(Math.min(done ? 100 : 99.9, s.d));
    }, 100);
    return () => clearInterval(t);
  }, [ceiling, done]);
  return shown;
}

/** Time left in the step in hand, from the pace of real readings; null until it can be said. */
export function useEta(value: number | null, total: number): number | null {
  const hist = useRef<{ t: number; v: number }[]>([]);
  const [eta, setEta] = useState<number | null>(null);
  useEffect(() => {
    if (value === null) { hist.current = []; setEta(null); return; }
    const now = performance.now() / 1000;
    const h = hist.current;
    if (h.length && value < h[h.length - 1].v) h.length = 0;
    h.push({ t: now, v: value });
    while (h.length > 2 && now - h[0].t > 30) h.shift();
    const a = h[0], b = h[h.length - 1];
    if (h.length < 3 || b.t - a.t < 3 || b.v <= a.v) { setEta(null); return; }
    const rate = (b.v - a.v) / (b.t - a.t);
    const left = (total - b.v) / rate;
    setEta(Number.isFinite(left) && left >= 0 && left < 6 * 3600 ? left : null);
  }, [value, total]);
  return eta;
}

export function etaWords(s: number): string {
  if (s < 10) return 'a few seconds left';
  if (s < 60) return `about ${Math.round(s / 5) * 5} s left`;
  const m = Math.floor(s / 60), r = Math.round((s % 60) / 10) * 10;
  return m >= 10 ? `about ${Math.round(s / 60)} min left` : `about ${m} min${r ? ` ${r} s` : ''} left`;
}
