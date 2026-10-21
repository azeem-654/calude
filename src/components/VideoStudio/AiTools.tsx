/**
 * AI Tools — Descript's panel, each tool wired to what Video Studio really
 * does, or greyed with the honest reason it cannot.
 *
 *   Sound good   cleanup (clarity, fillers, retakes, word gaps), Studio Sound,
 *                chapters from the transcript
 *   Look good    smooth jump cuts (a blend at each cut), the speaker followed,
 *                green screen, skin smoothing
 *   Repurpose    Shorts, highlights and a highlight reel from the transcript,
 *                captions translated
 *   Publish      / Write: scroll to the publishing section under the editor
 *                and write that piece there
 *
 * Every change is an operation through `ctx.apply` (so it shows at once and
 * undoes like any other); the AI asks go through /api/ai.php
 * (services/videoAi.ts). Nothing here claims a result it did not get.
 */
import { useMemo, useState } from 'react';
import {
  Sparkles, Wand2, AudioLines, Scissors, Mic, Repeat2, MoveHorizontal, ListOrdered, LayoutTemplate, Blend, Eye, ScanFace, Paintbrush, Smile, Cctv, ImagePlus, UserRound,
  Film, Star, Clapperboard, Languages, MonitorPlay, Image as ImageIcon, NotebookPen, Heading, FileText, Share2, PenLine, Lightbulb, ScrollText, ListTree, RefreshCw, Loader, Play, Plus, Download,
} from 'lucide-react';
import { runCleanup, clock, cuesOf, retimeWords, keepRanges, saveTranslation, motionOf, trackingOf, effectsOf } from '../../services/videoStudio';
import { aiChapters, aiHighlights, aiTranslate, toSrtText, toVttText, type Highlight } from '../../services/videoAi';
import type { EditorCtx } from './VideoEditor';

type Item = { key: string; label: string; icon: typeof Film; hint: string; off?: string; on?: boolean; run?: () => void | Promise<void> };

const LANGS = ['Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Turkish', 'Urdu', 'Arabic', 'Hindi', 'Dutch', 'Polish', 'Japanese', 'Chinese (Simplified)'];

export default function AiTools({ ctx, onCleanup }: { ctx: EditorCtx; onCleanup: () => void }) {
  const { doc, view, transcript, duration } = ctx;
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [highlights, setHighlights] = useState<Highlight[] | null>(null);
  const [lang, setLang] = useState('Spanish');
  const [showTranslate, setShowTranslate] = useState(false);
  const [tProgress, setTProgress] = useState(0);
  const words = useMemo(() => transcript?.words ?? [], [transcript]);
  const clip = ctx.activeClip ? doc.clips.find(c => c.id === ctx.activeClip) ?? null : null;
  const kind = clip ? 'short' as const : 'long' as const;
  const ai = ctx.caps?.find(c => c.key === 'ai');
  const aiOff = ai && ai.status !== 'working' ? `AI is not set up on this install — ${ai.note || 'the owner adds an AI key'}.` : '';
  const noWords = !words.length ? 'Needs the transcript, which is not ready yet.' : '';
  const faces = view.source.track?.summary?.faces ?? null;
  const motion = motionOf(doc, kind), fx = effectsOf(doc, kind);
  const prop = (k: string[]) => doc.cuts.filter(c => c.state === 'proposed' && k.includes(c.kind));
  const say = (tone: 'ok' | 'bad', text: string) => setNote({ tone, text });

  const wrap = (key: string, fn: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(key); setNote(null);
    try { await fn(); } catch (e) { say('bad', String((e as Error).message ?? e)); }
    setBusy('');
  };
  const cleanup = (preset: 'balanced' | 'aggressive', opts: { maxPause?: number | null } = {}, done = '') => wrap(`cleanup-${preset}`, async () => {
    const r = await runCleanup(view.project.id, ctx.version, preset, opts);
    if (!r.success) { say('bad', r.error ?? 'The cleanup could not run.'); return; }
    ctx.adopt(r.doc, r.docVersion);
    const n = r.doc.cuts.filter(c => c.state === 'proposed').length;
    say('ok', done || `${n} suggestion${n === 1 ? '' : 's'} to review — each with its reason. Nothing proposed is cut until you approve it.`);
    onCleanup();
  });
  const approveAll = (kinds: string[], what: string) => wrap(`approve-${what}`, async () => {
    const ids = prop(kinds).map(c => c.id);
    if (!ids.length) { say('ok', `No ${what} are waiting. The cleanup options can look again.`); onCleanup(); return; }
    if (await ctx.apply([{ op: 'cut.setMany', ids, state: 'approved' }], `Removed ${ids.length} ${what}`)) say('ok', `${ids.length} ${what} removed — struck through in the script; Restore puts any back.`);
  });
  const toggle = (key: string, ops: Parameters<EditorCtx['apply']>[0], label: string, tab?: Parameters<EditorCtx['setTab']>[0]) => wrap(key, async () => {
    if (await ctx.apply(ops, label)) { say('ok', `${label}.${tab ? ' Its settings are open.' : ''}`); if (tab) ctx.setTab(tab); }
  });
  const publish = (k: string) => () => { window.dispatchEvent(new CustomEvent('vs-publish-gen', { detail: k })); };

  const chapters = wrap('chapters', async () => {
    const r = await aiChapters(words, duration);
    if (!r.ok) { say('bad', `No chapters: ${r.error}`); return; }
    if (await ctx.apply([{ op: 'chapters.set', list: r.data }], `${r.data.length} chapters from the transcript`)) say('ok', `${r.data.length} chapters: ${r.data.map(c => `${clock(c.s)} ${c.title}`).join(' · ')} — they go into the long video's description.`);
  });
  const findHighlights = wrap('highlights', async () => {
    const r = await aiHighlights(words, clip ? [clip.s, clip.e] : [0, duration]);
    if (!r.ok) { say('bad', `No highlights: ${r.error}`); return; }
    setHighlights(r.data);
    say('ok', `${r.data.length} moments found — play each, make one a Short, or put them together as a reel.`);
  });
  const reel = (list: Highlight[]) => wrap('reel', async () => {
    const parts: [number, number][] = [];
    let total = 0;
    for (const h of [...list].sort((a, b) => a.s - b.s)) { if (total + (h.e - h.s) > 90) continue; parts.push([h.s, h.e]); total += h.e - h.s; }
    if (total < 3) { say('bad', 'The highlights are too short to make a reel.'); return; }
    if (await ctx.apply([{ op: 'clip.add', s: parts[0][0], e: parts[parts.length - 1][1], parts, title: 'Highlight reel', reason: `${parts.length} highlights, ${Math.round(total)} s` }], 'Highlight reel')) {
      say('ok', `A ${Math.round(total)}-second highlight reel of ${parts.length} moments is a new Short — choose it in the composition menu.`);
    }
  });
  const reelFromAi = wrap('reel-ai', async () => {
    const r = highlights ? { ok: true as const, data: highlights } : await aiHighlights(words, [0, duration]);
    if (!r.ok) { say('bad', `No reel: ${r.error}`); return; }
    setHighlights(r.data);
    await reel(r.data)();
  });
  const translate = wrap('translate', async () => {
    /* The long video's captions as it plays after the cuts — the clock of the rendered file. */
    const cues = cuesOf(retimeWords(words, keepRanges(duration, doc), doc.captionEdits), 'long');
    if (!cues.length) { say('bad', 'There are no captions to translate.'); return; }
    setTProgress(0);
    const r = await aiTranslate(cues.map(c => c.text), lang, setTProgress);
    if (!r.ok) { say('bad', `Not translated: ${r.error}`); return; }
    const out = cues.map((c, i) => ({ s: c.s, e: c.e, text: r.data[i] }));
    const saved = await saveTranslation(view.project.id, lang, out);
    if (!saved.success) { say('bad', saved.error ?? 'The translation could not be saved.'); return; }
    await ctx.refresh();
    say('ok', `${out.length} captions translated into ${lang} and kept with the video — download them below (they fit the long video as edited now).`);
  });

  const groups: [string, Item[]][] = [
    ['Sound good', [
      { key: 'clarity', label: 'Edit for clarity', icon: Wand2, hint: 'Fillers, retakes, false starts and long pauses proposed for you to approve', off: noWords, run: cleanup('aggressive') },
      { key: 'studio', label: 'Studio Sound', icon: AudioLines, hint: doc.audio.studio ? 'On — heard in the render' : 'Noise out, voice clearer, even loudness (in the render)', on: !!doc.audio.studio,
        run: toggle('studio', [{ op: 'audio.set', patch: { studio: !doc.audio.studio } }], doc.audio.studio ? 'Studio Sound off' : 'Studio Sound on', 'audio') },
      { key: 'fillers', label: 'Remove filler words', icon: Scissors, hint: `${prop(['filler']).length} waiting — removes them all; options in Cleanup`, off: noWords, run: approveAll(['filler'], 'filler words') },
      { key: 'tts', label: 'Generate audio', icon: Mic, hint: 'Speak new words in your voice', off: 'No text-to-speech voice is connected to Video Studio, so it cannot generate speech.' },
      { key: 'retakes', label: 'Remove retakes', icon: Repeat2, hint: `${prop(['retake', 'repeat', 'false_start']).length} waiting — keeps the best take`, off: noWords, run: approveAll(['retake', 'repeat', 'false_start'], 'retakes') },
      { key: 'gaps', label: 'Shorten word gaps', icon: MoveHorizontal, hint: 'Pauses over half a second shortened where the sound is quiet', off: noWords, run: cleanup('balanced', { maxPause: 0.5 }, 'Pauses longer than half a second are proposed shorter — review them in Cleanup.') },
      { key: 'chapters', label: 'Add chapters', icon: ListOrdered, hint: doc.long.chapters.length ? `${doc.long.chapters.length} chapters — write them again` : 'Chapters from where the talk turns', off: noWords || aiOff, run: chapters },
    ]],
    ['Look good', [
      { key: 'quick', label: 'Quick design', icon: LayoutTemplate, hint: 'A designed look applied in one go', off: 'Not available: there are no design templates to apply automatically yet. Caption styles are under Captions, looks under Properties → Adjust.' },
      { key: 'smooth', label: 'Smooth jump cuts', icon: Blend, hint: motion.transition === 'smooth' ? 'On — a short blend at each cut' : 'A short blend across each cut instead of a jump', on: motion.transition === 'smooth',
        run: toggle('smooth', [{ op: 'motion.set', target: kind, patch: { transition: motion.transition === 'smooth' ? 'none' : 'smooth' } }], motion.transition === 'smooth' ? 'Jump cuts left straight' : 'Jump cuts smoothed') },
      { key: 'eyes', label: 'Eye Contact', icon: Eye, hint: 'Gaze moved to the lens', off: 'No provider: eye-contact correction needs an AI video service with an HTTP API this server can call (researched 2026-10: NVIDIA Maxine is gRPC-only).' },
      { key: 'speaker', label: 'Center active speaker', icon: ScanFace, hint: trackingOf(doc, kind) === 'speaker' ? 'On — the crop follows who is talking' : 'The crop follows whoever is talking',
        on: trackingOf(doc, kind) === 'speaker', off: faces === null ? 'Faces have not been looked for in this recording yet.' : faces === 0 ? 'No faces were found in this recording, so there is no speaker to follow.' : '',
        run: toggle('speaker', [{ op: 'tracking.set', target: kind, mode: trackingOf(doc, kind) === 'speaker' ? 'off' : 'speaker' }], trackingOf(doc, kind) === 'speaker' ? 'Stopped following the speaker' : 'Following the speaker', 'tracking') },
      { key: 'green', label: 'Green screen', icon: Paintbrush, hint: fx.green?.on ? 'On — keyed in the render' : 'Keys out a green backdrop (in the render)', on: !!fx.green?.on,
        run: toggle('green', [{ op: 'effects.set', target: kind, effect: 'green', patch: { on: !fx.green?.on } }], fx.green?.on ? 'Green screen off' : 'Green screen on', 'effects') },
      { key: 'skin', label: 'Skin smoothing', icon: Smile, hint: fx.appearance?.on ? 'On — inside the face box, in the render' : 'Improve appearance inside the tracked face', on: !!fx.appearance?.on,
        run: toggle('skin', [{ op: 'effects.set', target: kind, effect: 'appearance', patch: { on: !fx.appearance?.on } }], fx.appearance?.on ? 'Skin smoothing off' : 'Skin smoothing on', 'effects') },
      { key: 'multicam', label: 'Automatic multicam', icon: Cctv, hint: 'Cut between camera angles', off: 'Needs two or more camera angles of the same take; a project holds one recording.' },
      { key: 'visuals', label: 'Generate visuals', icon: ImagePlus, hint: 'Pictures made for what is said', off: 'No image-generation provider is connected to Video Studio.' },
      { key: 'blurbg', label: 'Blur speaker background', icon: UserRound, hint: 'The speaker sharp, the room blurred', off: 'Needs a background-segmentation provider; none is connected. Green screen works when you filmed on green.' },
    ]],
    ['Repurpose', [
      { key: 'clips', label: 'Create clips', icon: Film, hint: `${doc.clips.length} Short${doc.clips.length === 1 ? '' : 's'} — add more or change them`, run: () => ctx.setTab('shorts') },
      { key: 'reel', label: 'Create highlight reel', icon: Clapperboard, hint: 'The strongest moments, back to back, as a new Short', off: noWords || aiOff, run: reelFromAi },
      { key: 'highlights', label: 'Find highlights', icon: Star, hint: 'Self-contained moments to cut into Shorts', off: noWords || aiOff, run: findHighlights },
      { key: 'translate', label: 'Translate', icon: Languages, hint: 'Captions in another language (SRT and VTT)', off: noWords || aiOff, run: () => setShowTranslate(t => !t) },
    ]],
    ['Publish', [
      { key: 'description', label: 'Draft YouTube description', icon: MonitorPlay, hint: 'Below the editor, editable', off: noWords || aiOff, run: publish('description') },
      { key: 'thumbnail', label: 'Generate YouTube thumbnail', icon: ImageIcon, hint: 'Designed PNGs; open one in Graphics Designer & Editor', run: () => ctx.setTab('exports') },
      { key: 'shownotes', label: 'Draft show notes', icon: NotebookPen, hint: 'Below the editor', off: noWords || aiOff, run: publish('shownotes') },
      { key: 'title', label: 'Draft a title', icon: Heading, hint: 'Below the editor', off: noWords || aiOff, run: publish('title') },
      { key: 'summary', label: 'Summarize', icon: FileText, hint: 'Below the editor', off: noWords || aiOff, run: publish('summary') },
      { key: 'social', label: 'Draft a social post', icon: Share2, hint: 'One per platform you tick', off: noWords || aiOff, run: publish('posts') },
      { key: 'blog', label: 'Draft a blog post', icon: PenLine, hint: 'Below the editor', off: noWords || aiOff, run: publish('blog') },
    ]],
    ['Write', [
      { key: 'brainstorm', label: 'Brainstorm', icon: Lightbulb, hint: 'Ideas from this video', off: aiOff, run: publish('write:brainstorm') },
      { key: 'script', label: 'Write a script', icon: ScrollText, hint: 'For a follow-up video', off: aiOff, run: publish('write:script') },
      { key: 'outline', label: 'Write an outline', icon: ListTree, hint: 'Of this video', off: aiOff, run: publish('write:outline') },
      { key: 'rewrite', label: 'Rewrite', icon: RefreshCw, hint: 'Your text, rewritten', off: aiOff, run: publish('write:rewrite') },
    ]],
  ];

  const translations = view.extras?.translations ?? {};
  const fileOf = (l: string, ext: 'srt' | 'vtt') => {
    const cues = translations[l]?.cues ?? [];
    const blob = new Blob([ext === 'srt' ? toSrtText(cues) : toVttText(cues)], { type: ext === 'srt' ? 'application/x-subrip' : 'text/vtt' });
    return URL.createObjectURL(blob);
  };

  return (
    <div className="vs-col" data-testid="vs-ai-tools">
      <div className="vse-improve" data-testid="vs-improve">
        <span className="vs-mark" style={{ width: 34, height: 34, borderRadius: 11 }}><Sparkles size={17} /></span>
        <div><b>Improve this video</b><small>Let AI plan your edits: fillers, retakes and long pauses proposed with reasons — nothing is cut until you say yes.</small></div>
        <button type="button" className="vs-btn ai sm" onClick={cleanup('aggressive')} disabled={!!busy || !!noWords} data-act="improve">{busy === 'cleanup-aggressive' ? <Loader size={13} className="spin" /> : 'Plan'}</button>
      </div>
      {note && <div className={`vs-note ${note.tone === 'bad' ? 'bad' : 'ok'}`} role="status" data-testid="vs-ai-note">{note.text}</div>}
      {groups.map(([g, items]) => (
        <div key={g} className="vs-tools-group" data-group={g}>
          <b>{g}</b>
          {items.map(it => (
            <button key={it.key} type="button" className={`vs-tool ${it.on ? 'on' : ''}`} data-tool={it.key} disabled={!!it.off || !it.run || (!!busy && busy !== it.key)} aria-pressed={it.on ?? undefined}
              title={it.off || it.hint} onClick={() => void it.run?.()}>
              <i><it.icon size={15} /></i>
              <span><b>{it.label}</b><small>{it.off || it.hint}</small></span>
              {busy && (busy === it.key || busy.startsWith(`${it.key}-`)) ? <Loader size={13} className="spin" /> : it.on ? <span className="vs-badge approved">On</span> : null}
            </button>
          ))}
          {g === 'Repurpose' && showTranslate && (
            <div className="vs-card vs-col" data-testid="vs-translate" style={{ padding: 10 }}>
              <label className="vs-label">Translate the captions into
                <select className="vs-select" value={lang} onChange={e => setLang(e.target.value)} data-testid="vs-translate-lang">{LANGS.map(l => <option key={l}>{l}</option>)}</select>
              </label>
              <button type="button" className="vs-btn ai sm" onClick={translate} disabled={!!busy} data-act="translate">{busy === 'translate' ? <><Loader size={13} className="spin" /> {tProgress} done</> : <><Languages size={13} /> Translate</>}</button>
              <span className="vs-kbd">Translated captions download as SRT and VTT timed to the long video as it is edited now — translate again after big edits. The captions burned into the video stay in the spoken language.</span>
            </div>
          )}
          {g === 'Repurpose' && Object.keys(translations).length > 0 && (
            <div className="vs-col" style={{ gap: 4 }} data-testid="vs-translations">
              {Object.entries(translations).map(([l, t]) => (
                <div key={l} className="vs-row" style={{ fontSize: 12.5 }}>
                  <Languages size={13} /> <b>{l}</b> · {t.cues.length} captions <span className="vs-spacer" />
                  <a className="vs-btn ghost sm" href={fileOf(l, 'srt')} download={`captions-${l.toLowerCase().replace(/\W+/g, '-')}.srt`}><Download size={12} /> SRT</a>
                  <a className="vs-btn ghost sm" href={fileOf(l, 'vtt')} download={`captions-${l.toLowerCase().replace(/\W+/g, '-')}.vtt`}><Download size={12} /> VTT</a>
                </div>
              ))}
            </div>
          )}
          {g === 'Repurpose' && highlights && (
            <div className="vs-col" style={{ gap: 6 }} data-testid="vs-highlights">
              {highlights.map((h, i) => (
                <div key={i} className="vs-item">
                  <div className="vs-row"><b style={{ fontSize: 13 }}>{h.title}</b><span className="vs-spacer" /><span className="vs-kbd">{clock(h.s)}–{clock(h.e)}</span></div>
                  {h.why && <small className="vs-kbd">{h.why}</small>}
                  <div className="vs-row">
                    <button type="button" className="vs-btn ghost sm" onClick={() => { ctx.seek(h.s); window.dispatchEvent(new Event('vs-play')); }}><Play size={12} /> Play</button>
                    <button type="button" className="vs-btn sm" onClick={() => void ctx.apply([{ op: 'clip.add', s: h.s, e: h.e, title: h.title, reason: h.why || 'A highlight' }], `Short: ${h.title}`)} disabled={h.e - h.s < 3}><Plus size={12} /> Make a Short</button>
                  </div>
                </div>
              ))}
              <button type="button" className="vs-btn sm" onClick={reel(highlights)} data-act="reel-from-list"><Clapperboard size={13} /> Put them together as a reel</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
