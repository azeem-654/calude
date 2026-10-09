/**
 * The inspector's panels that are not about words: the picture (shape and
 * framing of whatever is selected), the sound (noise reduction, voice) and
 * the music.
 *
 * Sound settings are heard in the rendered file, not in the preview — the
 * browser plays the original sound, and the panel says so rather than
 * pretending a filter is running. Music is heard in the preview at its
 * volume (without the ducking, which only the render does).
 *
 * Music comes from two places, and both say where it came from: the open
 * library (Openverse — only CC0, public-domain and CC BY tracks, which allow
 * a business to put them under its videos; CC BY's credit is written into
 * each video's description), or the customer's own file with the rights
 * confirmed in a box they tick.
 */
import { useEffect, useRef, useState } from 'react';
import { Search, Play, Pause, Music2, Upload, Trash2, Loader, ExternalLink, Check, Wand2, Volume2, Mic, Sparkles, Clapperboard } from 'lucide-react';
import {
  searchMusic, chooseMusic, uploadMusic, renderOutputs, clock,
  type FoundTrack, type Denoise, type Aspect, type Op,
} from '../../services/videoStudio';
import type { EditorCtx } from './VideoEditor';

function RenderHint({ ctx }: { ctx: EditorCtx }) {
  const stale = ctx.view.outputs.filter(o => o.stale);
  if (!stale.length) return null;
  return (
    <div className="vs-note warn">
      <Clapperboard size={15} />
      <span style={{ flex: 1 }}>{stale.length} video{stale.length === 1 ? '' : 's'} changed — render again to hear and see it in the files.</span>
      <button type="button" className="vs-btn ai sm" onClick={() => void renderOutputs(ctx.view.project.id, stale.map(o => o.id)).then(() => ctx.refresh())} data-act="render-stale">Render</button>
    </div>
  );
}

/* ── Video: shape and framing of what is selected ─────────────────────────── */

export function VideoPanel({ ctx }: { ctx: EditorCtx }) {
  const { doc } = ctx;
  const clip = ctx.activeClip ? doc.clips.find(c => c.id === ctx.activeClip) ?? null : null;
  if (clip) {
    const n = doc.clips.findIndex(c => c.id === clip.id) + 1;
    const set = (patch: Extract<Op, { op: 'clip.update' }>['patch'], note: string) =>
      void ctx.apply([{ op: 'clip.update', id: clip.id, patch }], note);
    return (
      <div className="vs-col" data-testid="vs-video-panel">
        <div className="vs-row"><b>Short {n}</b><span className="vs-kbd">{clock(clip.s)}–{clock(clip.e)}</span><span className="vs-spacer" />
          <button type="button" className="vs-btn ghost sm" onClick={() => ctx.setActiveClip(null)}>Long video</button></div>
        <label className="vs-label">Title
          <input className="vs-input" defaultValue={clip.title} key={`${clip.id}:${clip.title}`} onBlur={e => { const v = e.target.value.trim(); if (v && v !== clip.title) set({ title: v }, 'Renamed a Short'); }} />
        </label>
        <div className="vs-label">Shape
          <div className="vs-chips">{(['9:16', '1:1', '4:5', '16:9'] as const).map(a => <button key={a} type="button" className="vs-chip" aria-pressed={clip.aspect === a} onClick={() => set({ aspect: a }, `Short ${n}: ${a}`)}>{a}</button>)}</div>
        </div>
        <div className="vs-label">Framing
          <div className="vs-chips">
            <button type="button" className="vs-chip" aria-pressed={clip.reframe.mode === 'crop'} onClick={() => set({ reframe: { mode: 'crop' } }, 'Crop to the speaker')}>Crop to the speaker</button>
            <button type="button" className="vs-chip" aria-pressed={clip.reframe.mode === 'fit'} onClick={() => set({ reframe: { mode: 'fit' } }, 'Keep the whole screen')}>Whole screen</button>
          </div>
        </div>
        {clip.reframe.mode === 'crop' && (
          <label className="vs-label">Crop position · {Math.round(clip.reframe.x * 100)}%
            <input type="range" min={0} max={100} defaultValue={Math.round(clip.reframe.x * 100)} key={`${clip.id}:${clip.reframe.x}`} aria-label="Crop position"
              onPointerUp={e => set({ reframe: { x: Number((e.target as HTMLInputElement).value) / 100 } }, 'Moved the crop')}
              onKeyUp={e => set({ reframe: { x: Number((e.target as HTMLInputElement).value) / 100 } }, 'Moved the crop')} />
          </label>
        )}
        <p className="vs-kbd" style={{ margin: 0 }}>Trim it in the Shorts list (left) or mark a stretch on the timeline.</p>
        <RenderHint ctx={ctx} />
      </div>
    );
  }
  const L = doc.long;
  const setL = (patch: { on?: boolean; aspect?: Aspect; reframe?: { mode?: 'crop' | 'fit' | 'source'; x?: number } }, note: string) => void ctx.apply([{ op: 'long.set', patch }], note);
  return (
    <div className="vs-col" data-testid="vs-video-panel">
      <label className="vs-row" style={{ gap: 8, fontSize: 13 }}><input type="checkbox" checked={L.on} onChange={e => setL({ on: e.target.checked }, e.target.checked ? 'Long video on' : 'Long video off')} /> Make the cleaned long video</label>
      <div className="vs-label">Shape
        <div className="vs-chips">{(['source', '16:9', '9:16', '1:1', '4:5'] as const).map(a => <button key={a} type="button" className="vs-chip" aria-pressed={L.aspect === a} onClick={() => setL({ aspect: a, ...(a === 'source' ? { reframe: { mode: 'source' } } : L.reframe.mode === 'source' ? { reframe: { mode: 'fit' } } : {}) }, `Long video: ${a}`)}>{a === 'source' ? 'As recorded' : a}</button>)}</div>
      </div>
      {L.aspect !== 'source' && (
        <div className="vs-label">Framing
          <div className="vs-chips">
            <button type="button" className="vs-chip" aria-pressed={L.reframe.mode === 'crop'} onClick={() => setL({ reframe: { mode: 'crop' } }, 'Crop')}>Crop</button>
            <button type="button" className="vs-chip" aria-pressed={L.reframe.mode === 'fit'} onClick={() => setL({ reframe: { mode: 'fit' } }, 'Fit')}>Whole picture</button>
          </div>
        </div>
      )}
      {L.reframe.mode === 'crop' && (
        <label className="vs-label">Crop position · {Math.round(L.reframe.x * 100)}%
          <input type="range" min={0} max={100} defaultValue={Math.round(L.reframe.x * 100)} key={L.reframe.x} aria-label="Crop position"
            onPointerUp={e => setL({ reframe: { x: Number((e.target as HTMLInputElement).value) / 100 } }, 'Moved the crop')} />
        </label>
      )}
      {ctx.view.source.probe && <p className="vs-kbd" style={{ margin: 0 }}>Recorded at {ctx.view.source.probe.width}×{ctx.view.source.probe.height}, {Math.round(ctx.view.source.probe.fps)} fps, {ctx.view.source.probe.vcodec.toUpperCase()}.</p>}
      <RenderHint ctx={ctx} />
    </div>
  );
}

/* ── Audio ────────────────────────────────────────────────────────────────── */

const NOISE: { key: Denoise; label: string; note: string }[] = [
  { key: 'off', label: 'Off', note: 'The sound as recorded.' },
  { key: 'light', label: 'Light', note: 'A little hiss and hum taken out; the voice untouched.' },
  { key: 'medium', label: 'Medium', note: 'Fans, air-conditioning and room noise reduced. Right for most recordings.' },
  { key: 'strong', label: 'Strong', note: 'Heavy, steady noise. Can make a voice sound thinner — listen before you publish.' },
];

export function AudioPanel({ ctx }: { ctx: EditorCtx }) {
  const a = ctx.doc.audio;
  const set = (patch: Partial<typeof a>, note: string) => void ctx.apply([{ op: 'audio.set', patch }], note);
  const vol = Math.round((a.volume ?? 1) * 100);
  return (
    <div className="vs-col" data-testid="vs-audio-panel">
      <div className="vs-label">Background noise reduction
        <div className="vs-chips" role="radiogroup" aria-label="Noise reduction">
          {NOISE.map(n => <button key={n.key} type="button" role="radio" aria-checked={a.denoise === n.key} className="vs-chip" aria-pressed={a.denoise === n.key} data-denoise={n.key} onClick={() => set({ denoise: n.key }, `Noise reduction: ${n.label.toLowerCase()}`)}>{n.label}</button>)}
        </div>
        <span className="vs-kbd" style={{ fontWeight: 500 }}>{NOISE.find(n => n.key === a.denoise)?.note} Steady noise is what it removes; a dog barking or a door is not.</span>
      </div>
      <label className="vs-opt"><input type="checkbox" checked={!!a.voice} onChange={e => set({ voice: e.target.checked }, e.target.checked ? 'Voice clarity on' : 'Voice clarity off')} />
        <span><Mic size={13} /> <b>Voice clarity</b><br /><small className="vs-kbd">Presence lifted, harsh “s” sounds softened, levels evened out.</small></span></label>
      <label className="vs-label"><span><Volume2 size={13} /> Voice level · {vol}%</span>
        <input type="range" min={50} max={150} step={5} defaultValue={vol} key={vol} aria-label="Voice level"
          onPointerUp={e => set({ volume: Number((e.target as HTMLInputElement).value) / 100 }, 'Voice level')} onKeyUp={e => set({ volume: Number((e.target as HTMLInputElement).value) / 100 }, 'Voice level')} />
      </label>
      <label className="vs-opt"><input type="checkbox" checked={a.loudnorm} onChange={e => set({ loudnorm: e.target.checked }, e.target.checked ? 'Loudness evened out' : 'Loudness as recorded')} />
        <span><b>Even loudness</b><br /><small className="vs-kbd">Every video at the level the platforms expect (−14 LUFS).</small></span></label>
      <div className="vs-note"><Sparkles size={15} /> <span>These are applied when the videos render — the preview plays the recording's own sound. Or just ask the assistant: “remove the background noise in all the videos”.</span></div>
      <RenderHint ctx={ctx} />
    </div>
  );
}

/* ── Music ────────────────────────────────────────────────────────────────── */

const MOODS = ['Calm', 'Upbeat', 'Corporate', 'Inspiring', 'Lo-fi', 'Cinematic', 'Acoustic', 'Piano'];

export function MusicPanel({ ctx }: { ctx: EditorCtx }) {
  const { doc, view } = ctx;
  const m = doc.music ?? null;
  const [q, setQ] = useState('');
  const [tracks, setTracks] = useState<FoundTrack[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');
  const [hearing, setHearing] = useState('');
  const [rights, setRights] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [applyTo, setApplyTo] = useState<'all' | 'long' | 'shorts'>(m?.applyTo ?? 'all');
  const ear = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => { ear.current?.pause(); }, []);

  const find = async (text: string) => {
    setSearching(true); setErr('');
    const r = await searchMusic(view.project.id, `${text || 'calm'} instrumental`.trim());
    setSearching(false);
    if (r.success) setTracks(r.tracks ?? []); else { setTracks(null); setErr(r.error ?? 'The music library could not be searched.'); }
  };
  const hear = (t: FoundTrack) => {
    if (hearing === t.id) { ear.current?.pause(); setHearing(''); return; }
    ear.current?.pause();
    const a = new Audio(t.previewUrl);
    a.volume = 0.8;
    a.onended = () => setHearing('');
    a.onerror = () => { setHearing(''); setErr('That track could not be played.'); };
    ear.current = a;
    void a.play().catch(() => setHearing(''));
    setHearing(t.id);
  };
  const choose = async (t: FoundTrack) => {
    setBusyId(t.id); setErr('');
    ear.current?.pause(); setHearing('');
    const r = await chooseMusic(view.project.id, ctx.version, t.id, applyTo);
    setBusyId('');
    if (!r.success) { setErr(r.error ?? 'That track could not be added.'); return; }
    ctx.say({ who: 'ai', text: r.reply });
    await ctx.refresh();
  };
  const upload = async () => {
    if (!file) return;
    setUploading(true); setErr('');
    const r = await uploadMusic(view.project.id, ctx.version, file, rights);
    setUploading(false);
    if (!r.ok) { setErr(r.error); return; }
    setFile(null); setRights(false);
    ctx.say({ who: 'ai', text: `“${file.name}” is under your videos now. Render to hear it in the files.` });
    await ctx.refresh();
  };
  const patch = (p: Partial<NonNullable<typeof m>>, note: string) => void ctx.apply([{ op: 'music.patch', patch: p }], note);

  return (
    <div className="vs-col" data-testid="vs-music-panel">
      {m ? (
        <div className="vs-item" data-testid="vs-music-current">
          <div className="vs-row"><Music2 size={15} color="#2dd4bf" /><b style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</b>
            <button type="button" className="vs-btn ghost sm danger" aria-label="Remove the music" onClick={() => void ctx.apply([{ op: 'music.remove' }], 'Music removed')} data-act="music-remove"><Trash2 size={13} /></button></div>
          <span className="vs-meta"><span>{m.artist}</span><span className="vs-badge working">{m.license}</span>{m.licenseUrl && <a href={m.licenseUrl} target="_blank" rel="noreferrer">licence <ExternalLink size={10} /></a>}{m.sourceUrl && <a href={m.sourceUrl} target="_blank" rel="noreferrer">source <ExternalLink size={10} /></a>}</span>
          {m.attribution && <small className="vs-kbd">Credit added to each video's description: {m.attribution}</small>}
          {view.musicUrl && <audio controls src={view.musicUrl} preload="none" style={{ width: '100%', height: 34 }} />}
          <label className="vs-label">Volume under the voice · {Math.round(m.volume * 100)}%
            <input type="range" min={2} max={60} defaultValue={Math.round(m.volume * 100)} key={m.volume} aria-label="Music volume" data-field="video.musicVolume"
              onPointerUp={e => patch({ volume: Number((e.target as HTMLInputElement).value) / 100 }, 'Music volume')} onKeyUp={e => patch({ volume: Number((e.target as HTMLInputElement).value) / 100 }, 'Music volume')} />
          </label>
          <div className="vs-row">
            <label className="vs-label" style={{ flex: 1 }}>Fade in · {m.fadeIn}s
              <input type="range" min={0} max={10} step={0.5} defaultValue={m.fadeIn} key={`i${m.fadeIn}`} onPointerUp={e => patch({ fadeIn: Number((e.target as HTMLInputElement).value) }, 'Music fade-in')} />
            </label>
            <label className="vs-label" style={{ flex: 1 }}>Fade out · {m.fadeOut}s
              <input type="range" min={0} max={15} step={0.5} defaultValue={m.fadeOut} key={`o${m.fadeOut}`} onPointerUp={e => patch({ fadeOut: Number((e.target as HTMLInputElement).value) }, 'Music fade-out')} />
            </label>
          </div>
          <div className="vs-row">
            <label className="vs-row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={m.duck} onChange={e => patch({ duck: e.target.checked }, e.target.checked ? 'Music dips under speech' : 'Music at a steady level')} /> Dip under speech</label>
            <label className="vs-row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={m.loop} onChange={e => patch({ loop: e.target.checked }, e.target.checked ? 'Music loops' : 'Music plays once')} /> Loop</label>
          </div>
          <div className="vs-chips" role="radiogroup" aria-label="Music applies to">
            {([['all', 'All videos'], ['long', 'Long video only'], ['shorts', 'Shorts only']] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={m.applyTo === k} className="vs-chip" aria-pressed={m.applyTo === k} onClick={() => patch({ applyTo: k }, `Music on: ${l.toLowerCase()}`)}>{l}</button>
            ))}
          </div>
        </div>
      ) : (
        <p className="vs-sub" style={{ margin: 0 }}>No music yet. Find a royalty-free track below, or upload your own.</p>
      )}

      <div className="vs-label">{m ? 'Change the track' : 'Royalty-free music'}
        <div className="vs-row" style={{ flexWrap: 'nowrap' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#8a8d99' }} />
            <input className="vs-input" style={{ paddingLeft: 30 }} placeholder="Mood or style — calm, upbeat, piano…" value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void find(q); }} data-field="video.music" data-testid="vs-music-q" />
          </div>
          <button type="button" className="vs-btn ai sm" onClick={() => void find(q)} disabled={searching} data-testid="vs-music-search">{searching ? <Loader size={13} className="spin" /> : <Search size={13} />} Find</button>
        </div>
      </div>
      <div className="vs-chips">{MOODS.map(w => <button key={w} type="button" className="vs-chip" onClick={() => { setQ(w.toLowerCase()); void find(w.toLowerCase()); }}>{w}</button>)}</div>
      {!m && (
        <div className="vs-chips" role="radiogroup" aria-label="Put the music under">
          {([['all', 'All videos'], ['long', 'Long video'], ['shorts', 'Shorts']] as const).map(([k, l]) => <button key={k} type="button" className="vs-chip" aria-pressed={applyTo === k} onClick={() => setApplyTo(k)}>{l}</button>)}
        </div>
      )}
      {err && <div className="vs-note bad" role="alert">{err}</div>}
      {tracks && !tracks.length && <p className="vs-sub" style={{ margin: 0 }}>Nothing found with a licence that allows business use. Try another mood.</p>}
      {tracks && tracks.length > 0 && (
        <div className="vs-list" data-testid="vs-music-results">
          {tracks.map(t => (
            <div key={t.id} className="vs-track" data-track={t.id}>
              <button type="button" className="pl" onClick={() => hear(t)} aria-label={hearing === t.id ? `Stop ${t.title}` : `Listen to ${t.title}`}>{hearing === t.id ? <Pause size={15} /> : <Play size={15} />}</button>
              <div style={{ minWidth: 0 }}>
                <b title={t.title}>{t.title}</b>
                <small>{t.artist}{t.duration ? ` · ${clock(t.duration)}` : ''} · <span style={{ color: t.licenseCode === 'by' ? '#fbbf24' : '#34d399' }}>{t.license}</span>{t.provider ? ` · ${t.provider}` : ''}</small>
              </div>
              <button type="button" className="vs-btn sm" disabled={!!busyId} onClick={() => void choose(t)} data-act="use-track">{busyId === t.id ? <Loader size={13} className="spin" /> : <Check size={13} />} Use</button>
            </div>
          ))}
        </div>
      )}
      <p className="vs-kbd" style={{ margin: 0 }}>From <a href="https://openverse.org" target="_blank" rel="noreferrer">Openverse</a>. Only CC0, public-domain and CC BY tracks are shown — licences that allow a business to use them in its videos. A CC BY track's credit is written into every video's description for you.</p>

      <details className="vs-item">
        <summary style={{ cursor: 'pointer', fontWeight: 650, fontSize: 13 }}><Upload size={13} /> Upload your own track</summary>
        <div className="vs-col" style={{ marginTop: 8 }}>
          <input type="file" accept="audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/flac,.mp3,.m4a,.wav,.ogg,.flac" data-field="video.musicFile" data-testid="vs-music-file"
            onChange={e => setFile(e.target.files?.[0] ?? null)} />
          <label className="vs-row" style={{ gap: 8, fontSize: 12.5, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={rights} onChange={e => setRights(e.target.checked)} data-field="video.musicRights" />
            <span>I own this track or have a licence to use it in my videos.</span>
          </label>
          <button type="button" className="vs-btn sm" style={{ justifySelf: 'start' }} disabled={!file || uploading} onClick={() => void upload()}>{uploading ? <Loader size={13} className="spin" /> : <Wand2 size={13} />} Use this track</button>
        </div>
      </details>
      <RenderHint ctx={ctx} />
    </div>
  );
}
