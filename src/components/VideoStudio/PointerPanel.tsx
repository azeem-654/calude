/**
 * Pointer — following the pointer of a Screen Recorder recording.
 *
 * The recorder notes where the pointer went and clicked while recording
 * (read from the picture; nothing zooms then). After processing, the moments
 * worth following are proposed from what was said and where the pointer
 * clicked (pointer.ts `autoFocus`), and this panel is where the customer
 * keeps, removes or adds them — as many stretches of the timeline as they
 * like — and chooses how the pointer looks and sounds:
 *
 *   - the long video zooms in on the pointer inside each moment;
 *   - a Short of the recording is laid out round the pointer (camera on
 *     top when there was one) — the Video tab's layouts;
 *   - the pointer can be drawn over the video (ring, spotlight, big arrow,
 *     pointing hand, dot — or chosen per moment from the words), with a
 *     ripple at each click and, if wanted, a click sound, and a celebration
 *     or an error sound where the words say so.
 *
 * The preview shows the zoom and the drawn pointer; sounds are heard in the
 * render, and each can be played here before it is chosen. What the panel
 * cannot know it says: the pointer was read from the picture, so it is
 * close rather than exact, and the real pointer stays in the recording
 * underneath unless the browser hid it while recording.
 */
import { useRef } from 'react';
import { MousePointer2, Play, Plus, Trash2, Wand2, Volume2, Info } from 'lucide-react';
import {
  pointerOf, autoFocus, sentencesOf, clock, sfxSample, SFX_LENGTH, CURSOR_STYLES, CURSOR_LABEL, CLICK_SOUNDS, SOUND_LABEL,
  type CursorStyle, type ClickSound, type Moment, type Op,
} from '../../services/videoStudio';
import type { EditorCtx } from './VideoEditor';
import { RenderHint } from './InspectorPanels';

const COLOURS = ['#facc15', '#22d3ee', '#f472b6', '#a855f7', '#4ade80', '#ffffff', '#ef4444'];
const ZOOMS = [1.5, 1.8, 2.2, 2.6];

/** A sound effect played here, from the same formulas the engine renders it with. */
let audio: AudioContext | null = null;
export function playSfx(kind: keyof typeof SFX_LENGTH, volume = 0.6) {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const rate = audio.sampleRate, n = Math.ceil(SFX_LENGTH[kind] * rate);
    const buf = audio.createBuffer(1, n, rate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = sfxSample(kind, i / rate, Math.random() * 2 - 1) * volume;
    const src = audio.createBufferSource();
    src.buffer = buf; src.connect(audio.destination); src.start();
  } catch { /* no sound in this browser — the render still has it */ }
}

export default function PointerPanel({ ctx }: { ctx: EditorCtx }) {
  const { doc, view, transcript, duration } = ctx;
  const ref = view.extras?.screen;
  const p = pointerOf(doc);
  const listRef = useRef<HTMLDivElement>(null);
  const set = (patch: Extract<Op, { op: 'pointer.set' }>['patch'], note: string) => void ctx.apply([{ op: 'pointer.set', patch }], note);

  if (!ref) {
    return (
      <div className="vs-col" data-testid="vs-pointer-panel" data-state="none">
        <div className="vs-note"><Info size={15} /> <span>Following the pointer is for recordings made with the <b>Screen Recorder</b> (Media Library → Record), which notes where the pointer goes and clicks while you record. This video was uploaded, so there is no pointer to follow.</span></div>
      </div>
    );
  }
  const sentences = transcript ? sentencesOf(transcript.words) : [];
  /* The words selected in the script, if any — the quickest way to say "follow it here". */
  const selected = ctx.selection && transcript ? (() => {
    const a = transcript.words.find(w => w.i === Math.min(ctx.selection!.i0, ctx.selection!.i1)), b = transcript.words.find(w => w.i === Math.max(ctx.selection!.i0, ctx.selection!.i1));
    return a && b && b.e - a.s >= 0.5 ? { s: a.s, e: b.e } : null;
  })() : null;
  const here = (() => {
    const st = sentences.find(x => ctx.time >= x.s - 0.2 && ctx.time <= x.e + 0.2);
    return st ? { s: Math.max(0, st.s - 0.4), e: Math.min(duration, st.e + 0.6) } : { s: Math.max(0, ctx.time - 1), e: Math.min(duration, ctx.time + 4) };
  })();
  const again = () => {
    if (!ctx.screen) return;
    const auto = autoFocus(ctx.screen, sentences, duration);
    /* Picked again: the customer's own stretches stay, the earlier picks are replaced. */
    void ctx.apply([{ op: 'pointer.focus.set', list: [...p.focus.filter(r => r.by === 'you'), ...auto] }], `Picked ${auto.length} moment${auto.length === 1 ? '' : 's'} to follow the pointer`);
  };
  const auto = p.focus.filter(r => r.by === 'auto').length;

  return (
    <div className="vs-col" data-testid="vs-pointer-panel" data-state={p.on ? 'on' : 'off'} style={{ gap: 12 }}>
      <RenderHint ctx={ctx} />
      <label className="vs-rec-check" style={{ fontWeight: 700 }}>
        <input type="checkbox" checked={p.on} onChange={e => set({ on: e.target.checked }, e.target.checked ? 'Follow the pointer' : 'Stop following the pointer')} data-testid="vs-ptr-on" />
        <MousePointer2 size={15} /> Follow the pointer in the moments below
      </label>
      <div className="vs-chips">
        <label className="vs-opt"><input type="checkbox" checked={p.long} onChange={e => set({ long: e.target.checked }, e.target.checked ? 'Pointer: long video' : 'Pointer: not in the long video')} /> Long video (zooms in)</label>
        <label className="vs-opt"><input type="checkbox" checked={p.shorts} onChange={e => set({ shorts: e.target.checked }, e.target.checked ? 'Pointer: Shorts' : 'Pointer: not in the Shorts')} /> Shorts (pointer drawn)</label>
      </div>

      <div className="vs-col" style={{ gap: 6 }}>
        <div className="vs-row"><b>Moments to follow</b><span className="vs-kbd">{p.focus.length ? `${p.focus.length} · ${auto} picked, ${p.focus.length - auto} yours` : 'none yet'}</span></div>
        <small className="vs-kbd" style={{ fontWeight: 500 }}>
          {p.ran ? 'Picked from what you said (“click…”, “go to…”, “this button”) together with where the pointer clicked — only the main ones. Keep, remove or add your own: as many stretches as you like.' : 'Proposed once the recording is transcribed. You can add your own now.'}
        </small>
        <div className="vs-col" style={{ gap: 6 }} ref={listRef} data-testid="vs-ptr-list">
          {p.focus.map((r, i) => (
            <div key={r.id} className="vs-item vs-ptr-item" data-focus={r.id} data-by={r.by}>
              <div className="vs-row" style={{ gap: 6 }}>
                <button type="button" className="vs-btn ghost sm" onClick={() => ctx.seek(r.s)} title="Play from here"><Play size={12} /> {clock(r.s)}–{clock(r.e)}</button>
                <span className={`vs-badge ${r.by === 'auto' ? 'processing' : ''}`}>{r.by === 'auto' ? 'Picked' : 'Yours'}</span>
                <span className="vs-spacer" />
                <button type="button" className="vs-btn ghost sm" aria-label={`Remove moment ${i + 1}`} onClick={() => void ctx.apply([{ op: 'pointer.focus.remove', id: r.id }], `Stopped following the pointer at ${clock(r.s)}`)}><Trash2 size={13} /></button>
              </div>
              {r.why && <small className="vs-kbd" style={{ fontWeight: 500 }}>{r.why}</small>}
              <div className="vs-row" style={{ gap: 6 }}>
                <label className="vs-label" style={{ flex: 1, minWidth: 120 }}>Pointer
                  <select className="vs-select" value={r.cursor} disabled={p.cursor !== 'auto'} onChange={e => void ctx.apply([{ op: 'pointer.focus.update', id: r.id, patch: { cursor: e.target.value as CursorStyle } }], 'Pointer shape for a moment')}>
                    {CURSOR_STYLES.map(c => <option key={c} value={c}>{c === 'auto' ? 'From the words' : CURSOR_LABEL[c]}</option>)}
                  </select>
                </label>
                <label className="vs-label" style={{ flex: 1, minWidth: 120 }}>Sound at the end
                  <select className="vs-select" value={r.moment} disabled={!p.moments} onChange={e => void ctx.apply([{ op: 'pointer.focus.update', id: r.id, patch: { moment: e.target.value as Moment } }], 'Sound for a moment')}>
                    <option value="auto">From the words</option><option value="none">None</option><option value="celebrate">Celebration</option><option value="error">Error buzz</option>
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>
        <div className="vs-row" style={{ gap: 6 }}>
          <button type="button" className="vs-btn sm" data-act="ptr-add-here" onClick={() => void ctx.apply([{ op: 'pointer.focus.add', s: here.s, e: here.e }], `Follow the pointer ${clock(here.s)}–${clock(here.e)}`)}><Plus size={13} /> Follow it here ({clock(here.s)})</button>
          {selected && <button type="button" className="vs-btn sm" data-act="ptr-add-sel" onClick={() => void ctx.apply([{ op: 'pointer.focus.add', s: selected.s, e: selected.e }], `Follow the pointer ${clock(selected.s)}–${clock(selected.e)}`)}><Plus size={13} /> Follow it over the selected words</button>}
          <button type="button" className="vs-btn sm" data-act="ptr-again" disabled={!ctx.screen} onClick={again} title={ctx.screen ? 'Keeps yours, replaces the picked ones' : 'Loading the recording’s notes…'}><Wand2 size={13} /> Pick the moments again</button>
        </div>
        <small className="vs-kbd" style={{ fontWeight: 500 }}>On the timeline: drag across a stretch and press <b>Follow the pointer</b> (or F); drag a moment to move it, its edges to resize it.</small>
      </div>

      <div className="vs-label">How close the long video zooms
        <div className="vs-chips">{ZOOMS.map(z => <button key={z} type="button" className="vs-chip" aria-pressed={p.zoom === z} onClick={() => set({ zoom: z }, `Pointer zoom ${z}×`)} data-testid={`vs-ptr-zoom-${z}`}>{z}×</button>)}</div>
      </div>

      <div className="vs-label">The pointer drawn on the video
        <div className="vs-chips" role="radiogroup" aria-label="Pointer shape">
          {CURSOR_STYLES.map(c => <button key={c} type="button" className="vs-chip" role="radio" aria-checked={p.cursor === c} onClick={() => set({ cursor: c }, `Pointer: ${CURSOR_LABEL[c].toLowerCase()}`)} data-testid={`vs-ptr-cursor-${c}`}><CursorIcon kind={c} /> {CURSOR_LABEL[c]}</button>)}
        </div>
        <small className="vs-kbd" style={{ fontWeight: 500 }}>“Chosen for each moment” draws a hand where you click, a ring where you type, a spotlight where you point something out, an arrow otherwise — each moment can be changed above.</small>
      </div>
      <div className="vs-rec-sliders">
        <label>Size {Math.round(p.size * 100)}%<input type="range" min={0.6} max={2} step={0.1} value={p.size} onChange={e => set({ size: Number(e.target.value) }, 'Pointer size')} /></label>
      </div>
      <div className="vs-rec-swatches" role="group" aria-label="Pointer colour">
        {COLOURS.map(c => <button key={c} type="button" className="vs-rec-sw" style={{ background: c }} aria-pressed={p.color === c} aria-label={`Colour ${c}`} onClick={() => set({ color: c }, 'Pointer colour')} />)}
      </div>

      <div className="vs-label"><span><Volume2 size={13} /> Click sound</span>
        <div className="vs-chips">
          {CLICK_SOUNDS.map(k => (
            <span key={k} className="vs-ptr-sound">
              <button type="button" className="vs-chip" aria-pressed={p.click === k} onClick={() => set({ click: k }, `Click sound: ${SOUND_LABEL[k].toLowerCase()}`)} data-testid={`vs-ptr-click-${k}`}>{SOUND_LABEL[k]}</button>
              {k !== 'none' && <button type="button" className="vs-btn ghost sm" aria-label={`Hear ${SOUND_LABEL[k]}`} onClick={() => playSfx(k as Exclude<ClickSound, 'none'>, p.volume)}><Play size={11} /></button>}
            </span>
          ))}
        </div>
      </div>
      <label className="vs-rec-check">
        <input type="checkbox" checked={p.moments} onChange={e => set({ moments: e.target.checked }, e.target.checked ? 'Celebration and error sounds on' : 'Celebration and error sounds off')} data-testid="vs-ptr-moments" />
        A celebration where you say it worked (“done”, “that’s it”), an error buzz where you say something went wrong
      </label>
      <div className="vs-row" style={{ gap: 6 }}>
        <button type="button" className="vs-btn ghost sm" onClick={() => playSfx('celebrate', p.volume)}><Play size={11} /> Hear the celebration</button>
        <button type="button" className="vs-btn ghost sm" onClick={() => playSfx('error', p.volume)}><Play size={11} /> Hear the error buzz</button>
      </div>
      <div className="vs-rec-sliders">
        <label>Sound volume {Math.round(p.volume * 100)}%<input type="range" min={0} max={1} step={0.05} value={p.volume} onChange={e => set({ volume: Number(e.target.value) }, 'Sound effects volume')} /></label>
      </div>

      <div className="vs-note"><Info size={15} /> <span>
        The pointer was read from the picture while you recorded ({ref.moves} moves, {ref.clicks} likely clicks noted) — close, not exact. The drawn pointer sits over the real one, which stays in the video unless your browser could hide it while recording (Safari, Firefox).
        The preview shows the zoom and the drawn pointer; the sounds are heard in the rendered video.
      </span></div>
    </div>
  );
}

function CursorIcon({ kind }: { kind: CursorStyle }) {
  const s = { width: 14, height: 14, viewBox: '0 0 20 20', 'aria-hidden': true as const };
  if (kind === 'ring') return <svg {...s}><circle cx={10} cy={10} r={7} fill="none" stroke="currentColor" strokeWidth={2.4} /></svg>;
  if (kind === 'dot') return <svg {...s}><circle cx={10} cy={10} r={6} fill="currentColor" opacity={0.6} /></svg>;
  if (kind === 'spotlight') return <svg {...s}><rect x={1} y={1} width={18} height={18} rx={3} fill="currentColor" opacity={0.35} /><circle cx={10} cy={10} r={5} fill="#fff" /></svg>;
  if (kind === 'hand') return <svg {...s}><path d="M8 2h2l.3 7 1.3-.5 1.5.5 1.4-.3 1.4.6.6 4.2L15 18H8l-4-5.5 1.6-1.2L7 12.5z" fill="currentColor" /></svg>;
  if (kind === 'arrow') return <svg {...s}><path d="M4 2v14l3.6-3.2 2.4 5 2-1-2.4-5h4.8z" fill="currentColor" /></svg>;
  if (kind === 'none') return <svg {...s}><circle cx={10} cy={10} r={7} fill="none" stroke="currentColor" strokeWidth={2} /><path d="M5 15 15 5" stroke="currentColor" strokeWidth={2} /></svg>;
  return <Wand2 size={13} />;
}
