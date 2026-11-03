/**
 * The Screen Recorder's diagnostics panel (recDiag.ts says what it measures
 * and why). Hidden unless asked for — Ctrl+Shift+D in the recorder, or
 * `?recdiag=1` — for support and development, not customers. Re-renders only
 * itself, once a second: the recorder around it is never re-rendered by it.
 */
import { useEffect, useState } from 'react';
import type { DiagContext, DiagSnapshot } from './recDiag';

const ms = (v: number) => `${v.toFixed(1)} ms`;
const n0 = (v: number) => v.toFixed(0);

export function RecDiagPanel({ read, painted }: { read: () => { s: DiagSnapshot; c: DiagContext }; painted?: (now: number) => void }) {
  const [d, setD] = useState(read);
  useEffect(() => { const t = setInterval(() => setD(read()), 1000); return () => clearInterval(t); }, [read]);
  /* Only while the panel is open: the page's paints, so "drawn → on screen" is a measurement, not a guess. */
  useEffect(() => {
    if (!painted) return;
    let id = 0;
    const f = () => { painted(performance.now()); id = requestAnimationFrame(f); };
    id = requestAnimationFrame(f);
    return () => cancelAnimationFrame(id);
  }, [painted]);
  const { s, c } = d;
  const camLat = c.audio?.camLatency ?? null;
  const est = c.cam && Number.isFinite(s.toPaint) ? (camLat ?? 0) + s.camAge + s.toPaint : NaN;
  const rows: [string, string][] = [
    ['Where the time goes', `${s.bottleneck === 'none' ? 'nothing behind' : s.bottleneck} — ${s.why}`],
    ['Frames drawn', `${n0(s.fps)} / ${s.target} fps · draw ${ms(s.drawAvg)} (p95 ${ms(s.drawP95)}) · gaps >1.5 frames: ${s.gaps}, longest ${ms(s.longestGap)}`],
    ['Drawing paced by (3 s)', s.drive],
    ['Late ticks skipped (3 s)', `${s.dropped}`],
    ['Page busy (5 s)', s.longTasks ? `${s.longTasks} long tasks, longest ${ms(s.longTaskMax)}` : 'none (or not measurable in this browser)'],
    ['Camera', c.cam ? `${c.cam.w}×${c.cam.h} asked ${n0(c.cam.fps)} fps · delivers ${n0(s.camFps)} fps · picture age ${ms(s.camAge)} (p95 ${ms(s.camAgeP95)})` : 'off'],
    ['Camera frames (3 s)', c.cam ? (s.camShown + s.camRepeats ? `${s.camShown} shown · ${s.camRepeats} shown twice · ${s.camSkips} never shown` : 'counted while frames are read from the camera (Chrome, Edge)') : 'off'],
    ['Camera → preview', c.cam ? (Number.isFinite(est) ? `≈ ${ms(est)}: camera to page ${camLat === null ? 'not reported' : ms(camLat)} + page to drawn ${ms(s.camAge)} + drawn to painted ${ms(s.toPaint)} (p95 ${ms(s.toPaintP95)}) — plus the camera's exposure and the display's refresh, which no browser reports` : 'drawn-to-painted is measured only while this page is on screen') : 'off'],
    ['Screen', c.scr ? `${c.scr.w}×${c.scr.h} up to ${n0(c.scr.fps)} fps · delivers ${n0(s.scrFps)} fps · picture age ${ms(s.scrAge)}` : 'not shared'],
    ['Pointer notes', s.pointerMs ? `${ms(s.pointerMs)} a look` : '—'],
    ['Background finder', c.fx && c.fx.runs !== 'off' ? `${c.fx.runs === 'worker' ? 'in a worker' : 'on the page'} · ${c.fx.delegate} · ${c.fx.model} model · look ${ms(c.fx.cost)}, answer ${ms(c.fx.roundTrip)} · ${c.fx.looksPerSec.toFixed(1)}/s · ${c.fx.paired ? 'frame and outline paired' : 'last outline on newest frame'}${c.fx.ease ? ` · eased (level ${c.fx.ease}) to keep the camera live` : ''}` : 'off'],
    ['Output', `${c.out.w}×${c.out.h} · profile ${c.profile}`],
    ['Recorder', c.rec ? `${c.rec.state} · ${c.rec.mime} · ${(c.rec.bitrate / 1e6).toFixed(1)} Mb/s · ${c.rec.chunks} chunks, ${(c.rec.bytes / 1048576).toFixed(1)} MB · longest chunk gap ${(c.rec.chunkGapMax / 1000).toFixed(1)} s · ${c.rec.powerEfficient === null ? 'hardware encoding not reported' : c.rec.powerEfficient ? 'browser reports a power-efficient (hardware) encoder' : 'browser reports a software encoder'} · queue not exposed by MediaRecorder` : 'not recording'],
    ['Sound', c.audio ? `${c.audio.sampleRate} Hz · base ${ms(c.audio.baseLatency * 1000)} · out ${ms(c.audio.outputLatency * 1000)} · camera latency ${c.audio.camLatency === null ? 'not reported' : ms(c.audio.camLatency)} · voice delayed ${ms(c.audio.delayMs)} to meet the picture` : 'no sound'],
    ['Memory', s.heapMB === null ? 'not reported by this browser' : `${s.heapMB.toFixed(0)} MB script heap`],
    ['This computer', `${c.cores ?? '?'} cores${c.memory ? ` · ${c.memory} GB or more` : ''}`],
  ];
  return (
    <div className="vs-rec-diag" data-testid="rec-diag" data-json={JSON.stringify({ s, c })} role="region" aria-label="Recording diagnostics">
      <b>Recording diagnostics</b> <small>(Ctrl+Shift+D hides)</small>
      <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </div>
  );
}
