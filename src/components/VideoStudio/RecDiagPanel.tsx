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

export function RecDiagPanel({ read }: { read: () => { s: DiagSnapshot; c: DiagContext } }) {
  const [d, setD] = useState(read);
  useEffect(() => { const t = setInterval(() => setD(read()), 1000); return () => clearInterval(t); }, [read]);
  const { s, c } = d;
  const rows: [string, string][] = [
    ['Where the time goes', `${s.bottleneck === 'none' ? 'nothing behind' : s.bottleneck} — ${s.why}`],
    ['Frames drawn', `${n0(s.fps)} / ${s.target} fps · draw ${ms(s.drawAvg)} (p95 ${ms(s.drawP95)}) · gaps >1.5 frames: ${s.gaps}, longest ${ms(s.longestGap)}`],
    ['Late ticks skipped (3 s)', `${s.dropped}`],
    ['Page busy (5 s)', s.longTasks ? `${s.longTasks} long tasks, longest ${ms(s.longTaskMax)}` : 'none (or not measurable in this browser)'],
    ['Camera', c.cam ? `${c.cam.w}×${c.cam.h} asked ${n0(c.cam.fps)} fps · delivers ${n0(s.camFps)} fps · picture age ${ms(s.camAge)} (p95 ${ms(s.camAgeP95)})` : 'off'],
    ['Screen', c.scr ? `${c.scr.w}×${c.scr.h} up to ${n0(c.scr.fps)} fps · delivers ${n0(s.scrFps)} fps · picture age ${ms(s.scrAge)}` : 'not shared'],
    ['Pointer notes', s.pointerMs ? `${ms(s.pointerMs)} a look` : '—'],
    ['Background finder', c.fx && c.fx.runs !== 'off' ? `${c.fx.runs === 'worker' ? 'in a worker' : 'on the page'} · ${c.fx.delegate} · ${c.fx.model} model · look ${ms(c.fx.cost)}, answer ${ms(c.fx.roundTrip)} · ${c.fx.looksPerSec.toFixed(1)}/s · ${c.fx.paired ? 'frame and outline paired' : 'last outline on newest frame'}` : 'off'],
    ['Output', `${c.out.w}×${c.out.h} · profile ${c.profile}`],
    ['Recorder', c.rec ? `${c.rec.state} · ${c.rec.mime} · ${(c.rec.bitrate / 1e6).toFixed(1)} Mb/s · ${c.rec.chunks} chunks, ${(c.rec.bytes / 1048576).toFixed(1)} MB · longest chunk gap ${(c.rec.chunkGapMax / 1000).toFixed(1)} s` : 'not recording'],
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
