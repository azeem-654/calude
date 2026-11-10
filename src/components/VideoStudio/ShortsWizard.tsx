/**
 * The Shorts wizard (2026-11) — what "New short composition" opens instead
 * of dropping a centre crop on the canvas. Five steps:
 *
 *   1  What is in the recording: length, shape, speech, scenes, the kind of
 *      recording and the people found (the analysis behind the framing).
 *   2  How to make them: let the AI decide (default — no fixed number), a
 *      topic or moment in words, or a time range.
 *   3  Only what changes the result: platform, shape, words' language,
 *      captions, framing, logo, thumbnail, call to action, length.
 *   4  The proposals, each with its checks, why, words and thumbnail idea:
 *      approve, reject, move its ends (checked again here, on whole
 *      sentences), edit its words; find another; ask again.
 *   5  Make them: the Shorts are saved, their words written, their renders
 *      and thumbnails queued — and followed here until they are done.
 *
 * Every rule about what may be proposed lives in shortsWizard.ts, shared
 * with the Worker; the server checks the approved Shorts again.
 */
import { useEffect, useMemo, useState } from 'react';
import { X, Wand2, Search, Clock3, Check, Loader, AlertCircle, ChevronLeft, ChevronRight, Film, RotateCcw, Plus, Play, ThumbsDown, ThumbsUp, Sparkles } from 'lucide-react';
import {
  proposeShorts, createShorts, trackNow, clock, sentencesOf, snapRange, checksFor, lengthOf, cleanPrefs, PLATFORMS, DEFAULT_PREFS, CATEGORIES,
  knownOf, framingOptions, resolveFraming, STRATEGY_LABEL, KIND_LABEL,
  type WizardPrefs, type Proposal, type Rejected, type ProposeMode, type Platform, type FrameStrategy,
} from '../../services/videoStudio';
import type { EditorCtx } from './VideoEditor';

type Step = 1 | 2 | 3 | 4 | 5;
const STEPS: [Step, string][] = [[1, 'Recording'], [2, 'How'], [3, 'Style'], [4, 'Review'], [5, 'Make']];
const PREFS_KEY = 'crm_vs_wizard_prefs';

/** "1:23", "83" or "1:02:03" → seconds; NaN when it is not a time. */
export function parseClock(t: string): number {
  const parts = t.trim().split(':').map(Number);
  if (!parts.length || parts.some(n => !Number.isFinite(n) || n < 0)) return NaN;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

interface Card extends Proposal { state: 'approved' | 'rejected' | 'open'; edited: boolean; trimPauses: boolean }

export default function ShortsWizard({ ctx, onClose }: { ctx: EditorCtx; onClose: () => void }) {
  const { view, transcript, duration } = ctx;
  const probe = view.source.probe;
  const [step, setStep] = useState<Step>(1);
  const [mode, setMode] = useState<ProposeMode>('auto');
  const [query, setQuery] = useState('');
  const words = transcript?.words ?? [];
  const sentences = useMemo(() => sentencesOf(words), [words]);
  /* The stretch the customer marked in the script, or the half-minute from the playhead. */
  const sel = ctx.selection && words.length ? [words[Math.min(ctx.selection.i0, ctx.selection.i1)].s, words[Math.max(ctx.selection.i0, ctx.selection.i1)].e] : [ctx.time, Math.min(duration, ctx.time + 30)];
  const [from, setFrom] = useState(clock(sel[0]));
  const [to, setTo] = useState(clock(sel[1]));
  const [prefs, setPrefs] = useState<WizardPrefs>(() => { try { return cleanPrefs(JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') ?? DEFAULT_PREFS); } catch { return DEFAULT_PREFS; } });
  const [ownLength, setOwnLength] = useState(!!prefs.min);
  const [cards, setCards] = useState<Card[]>([]);
  const [rejected, setRejected] = useState<Rejected[]>([]);
  const [verdict, setVerdict] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [by, setBy] = useState<'ai' | 'rules' | ''>('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState<{ text: string; field?: string } | null>(null);
  const [made, setMade] = useState<string[]>([]);
  const [madeNote, setMadeNote] = useState('');

  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private window */ } }, [prefs]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, busy]);

  /* ── Step 1: what the recording holds ── */
  const t = view.source.track;
  const known = knownOf(ctx.track, t?.summary);
  const jobOf = (k: string) => view.jobs.filter(j => j.kind === k);
  const running = (k: string) => jobOf(k).some(j => j.state === 'queued' || j.state === 'running');
  const speech = words.reduce((n, w) => n + (w.e - w.s), 0);
  const ready = !!transcript && sentences.length > 0;
  const facts: [string, string][] = [
    ['Length', duration ? clock(duration) : '—'],
    ['Shape', probe ? `${probe.width}×${probe.height}${probe.width > probe.height ? ' (landscape)' : probe.width < probe.height ? ' (portrait)' : ' (square)'}` : '—'],
    ['Speech', ready ? `${clock(speech)} in ${sentences.length} sentences${transcript?.language ? ` · ${transcript.language}` : ''}` : running('transcribe') ? 'Transcribing…' : 'No transcript yet'],
    ['Kind of recording', known.analysed && known.kind ? KIND_LABEL[known.kind] : running('track') ? 'Analysing…' : 'Not analysed yet'],
    ['People seen', known.analysed || t?.ready ? (known.people.length ? `${known.people.length} (${known.people.map(p => `${Math.round(p.share * 100)}% of the time`).join(', ')})` : 'None') : '—'],
    ['Scene changes', ctx.track?.analysis ? String(ctx.track.analysis.cuts.length) : '—'],
    ['Shorts already made', String(ctx.doc.clips.length)],
  ];

  /* ── Proposals ── */
  const range = lengthOf({ ...prefs, ...(ownLength ? {} : { min: undefined, max: undefined }) });
  const ask = async (exclude: [number, number][] = [], keep: Card[] = []) => {
    setErr(null);
    let rg: [number, number] | undefined;
    if (mode === 'range') {
      const a = parseClock(from), b = parseClock(to);
      if (!(b > a)) { setErr({ text: 'Give a start and an end, like 1:20 and 2:05 — the end after the start.', field: 'video.shortsRange' }); return; }
      rg = [a, b];
    }
    if (mode === 'topic' && !query.trim()) { setErr({ text: 'Say what the Short should be about.', field: 'video.shortsTopic' }); return; }
    setBusy('propose');
    const r = await proposeShorts(view.project.id, { mode, query: query.trim(), range: rg, exclude, prefs: { ...prefs, ...(ownLength ? {} : { min: undefined, max: undefined }) } });
    setBusy('');
    if (!r.success) { setErr({ text: r.error ?? 'The proposals could not be made.', field: (r as { field?: string }).field }); return; }
    const fresh = r.proposals.map(p => ({ ...p, state: 'approved' as const, edited: false, trimPauses: true }));
    setCards([...keep, ...fresh].sort((x, y) => x.s - y.s));
    setRejected(keep.length ? rs => [...rs, ...r.rejected] : r.rejected);
    setVerdict(fresh.length ? r.verdict : (r.verdict || (keep.length ? 'Nothing else in the recording holds up as a Short of its own.' : 'No passage holds up as a Short of its own.')));
    setNotes(r.notes);
    setBy(r.by);
    setStep(4);
  };
  const patch = (id: string, p: Partial<Card>) => setCards(cs => cs.map(c => c.id === id ? { ...c, ...p } : c));
  /* Its ends moved: on whole sentences and checked again, here, with the same rules the server applies. */
  const move = (c: Card, which: 's' | 'e', v: string) => {
    const n = parseClock(v);
    if (!Number.isFinite(n)) return;
    const snap = snapRange(sentences, which === 's' ? n : c.s, which === 'e' ? n : c.e);
    if (!snap) return;
    patch(c.id, { s: snap.s, e: snap.e, checks: checksFor(sentences, snap.a, snap.b, range, words), transcript: sentences.slice(snap.a, snap.b + 1).map(x => x.text).join(' ').slice(0, 600), edited: true });
  };
  const approved = cards.filter(c => c.state === 'approved');

  const make = async () => {
    setBusy('make'); setErr(null);
    const items = approved.map(c => ({ s: c.s, e: c.e, title: c.title, topic: c.topic, why: c.why, meta: c.meta, scores: c.scores, edited: c.edited, trimPauses: c.trimPauses }));
    const r = await createShorts(view.project.id, ctx.version, items, { ...prefs, ...(ownLength ? {} : { min: undefined, max: undefined }) });
    setBusy('');
    if (!r.success) { setErr({ text: r.error ?? 'The Shorts could not be made.', field: (r as { field?: string }).field }); if ((r as { doc?: unknown }).doc) await ctx.refresh(); return; }
    ctx.adopt(r.doc, r.docVersion);
    setMade(r.created);
    setMadeNote([r.skipped ? `${r.skipped} could not be made (no whole sentence of the right length).` : '', r.note].filter(Boolean).join(' '));
    setStep(5);
    void ctx.refresh();
  };

  const framingOpts = framingOptions(known);
  const composition = resolveFraming(prefs.framing === 'auto' ? undefined : { strategy: prefs.framing }, known);
  const logoSet = !!ctx.doc.logo;

  const card = (c: Card, i: number) => {
    const dur = c.e - c.s;
    return (
      <article key={c.id} className={`vs-wz-card ${c.state}`} data-testid="vs-wz-proposal" data-state={c.state} data-by={c.by}>
        <div className="vs-row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <span className="vs-wz-n">{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <input className="vs-input vs-wz-title" value={c.title} aria-label="Title" maxLength={100} onChange={e => patch(c.id, { title: e.target.value, edited: true })} data-field="video.shortsTitle" />
            <small className="vs-kbd">{c.topic} · {clock(c.s)}–{clock(c.e)} · {Math.round(dur)} s{c.by === 'rules' ? ' · chosen by rule' : c.by === 'you' ? ' · your stretch' : ''}</small>
          </div>
          <div className="vs-wz-acts">
            <button type="button" className="vs-btn ghost sm" title="Play it in the editor" aria-label="Play it" onClick={() => { ctx.seek(c.s); window.dispatchEvent(new CustomEvent('vs-play')); }}><Play size={13} /></button>
            <button type="button" className={`vs-btn sm ${c.state === 'approved' ? 'ai' : ''}`} aria-pressed={c.state === 'approved'} onClick={() => patch(c.id, { state: c.state === 'approved' ? 'open' : 'approved' })} data-act="wz-approve"><ThumbsUp size={13} /> {c.state === 'approved' ? 'Approved' : 'Approve'}</button>
            <button type="button" className="vs-btn ghost sm" aria-pressed={c.state === 'rejected'} onClick={() => patch(c.id, { state: c.state === 'rejected' ? 'open' : 'rejected' })} data-act="wz-reject"><ThumbsDown size={13} /> {c.state === 'rejected' ? 'Rejected' : 'Reject'}</button>
          </div>
        </div>
        <p className="vs-wz-why"><Sparkles size={12} /> {c.why}</p>
        <p className="vs-wz-desc">{c.description}</p>
        <ul className="vs-wz-checks">
          {c.checks.map(k => <li key={k.key} className={k.ok ? 'ok' : 'warn'} data-check={k.key}>{k.ok ? <Check size={11} /> : <AlertCircle size={11} />} {k.note}</li>)}
        </ul>
        <details className="vs-wz-more">
          <summary>What is said, the framing, the thumbnail and the words to publish</summary>
          <blockquote className="vs-wz-quote">{c.transcript}</blockquote>
          <div className="vs-wz-grid">
            <label className="vs-label">Starts at<input className="vs-input" defaultValue={clock(c.s)} key={`s${c.s}`} onBlur={e => move(c, 's', e.target.value)} aria-label="Starts at" /></label>
            <label className="vs-label">Ends at<input className="vs-input" defaultValue={clock(c.e)} key={`e${c.e}`} onBlur={e => move(c, 'e', e.target.value)} aria-label="Ends at" /></label>
          </div>
          <small className="vs-kbd">Moved ends snap to whole sentences and are checked again.{c.pauses.length ? ` ${c.pauses.length} long pause${c.pauses.length === 1 ? '' : 's'} inside.` : ''}</small>
          {c.pauses.length > 0 && <label className="vs-opt"><input type="checkbox" checked={c.trimPauses} onChange={e => patch(c.id, { trimPauses: e.target.checked })} /> Shorten the long pauses in this Short (the long video keeps them)</label>}
          <p className="vs-kbd" style={{ margin: '6px 0' }}><b>Framing:</b> {STRATEGY_LABEL[composition.strategy]} — {composition.note}</p>
          <p className="vs-kbd" style={{ margin: '6px 0' }}><b>Thumbnail:</b> “{c.thumb.text}” — {c.thumb.concept}</p>
          {c.scores && <p className="vs-kbd" style={{ margin: '6px 0' }}>Editorial estimates (not a prediction of views): hook {c.scores.hook}/5 · clarity {c.scores.clarity}/5 · relevance {c.scores.relevance}/5 · complete {c.scores.completeness}/5</p>}
          <label className="vs-label">Description<textarea className="vs-textarea" rows={3} value={c.meta.description} onChange={e => patch(c.id, { meta: { ...c.meta, description: e.target.value }, description: e.target.value, edited: true })} /></label>
          <label className="vs-label">Hashtags<input className="vs-input" value={c.meta.hashtags.join(' ')} onChange={e => patch(c.id, { meta: { ...c.meta, hashtags: e.target.value.split(/\s+/).filter(Boolean).map(h => `#${h.replace(/^#+/, '')}`) }, edited: true })} /></label>
          <label className="vs-label">Tags<input className="vs-input" value={c.meta.tags.join(', ')} onChange={e => patch(c.id, { meta: { ...c.meta, tags: e.target.value.split(',').map(x => x.trim()).filter(Boolean) }, edited: true })} /></label>
          <label className="vs-label">Call to action<input className="vs-input" value={c.meta.cta} onChange={e => patch(c.id, { meta: { ...c.meta, cta: e.target.value }, edited: true })} /></label>
          <label className="vs-label">Pinned comment<input className="vs-input" value={c.meta.pinnedComment} onChange={e => patch(c.id, { meta: { ...c.meta, pinnedComment: e.target.value }, edited: true })} /></label>
          <label className="vs-label">Thumbnail words<input className="vs-input" value={c.meta.thumbText ?? ''} maxLength={60} onChange={e => patch(c.id, { meta: { ...c.meta, thumbText: e.target.value }, thumb: { ...c.thumb, text: e.target.value }, edited: true })} /></label>
          {PLATFORMS[prefs.platform].category && (
            <label className="vs-label">Category<select className="vs-select" value={c.meta.category ?? ''} onChange={e => patch(c.id, { meta: { ...c.meta, category: e.target.value || undefined }, edited: true })}>
              <option value="">None</option>{CATEGORIES.map(x => <option key={x} value={x}>{x}</option>)}
            </select></label>
          )}
        </details>
      </article>
    );
  };

  const chips = <T extends string>(value: T, list: [T, string][], set: (v: T) => void, label: string, disabled?: (v: T) => string) => (
    <div className="vs-chips" role="radiogroup" aria-label={label}>
      {list.map(([v, l]) => { const why = disabled?.(v) ?? ''; return <button key={v} type="button" role="radio" className="vs-chip" aria-checked={value === v} aria-pressed={value === v} disabled={!!why} title={why || l} onClick={() => set(v)}>{l}</button>; })}
    </div>
  );

  return (
    <div className="vs-modal-back" role="dialog" aria-modal="true" aria-label="New Shorts" onClick={() => { if (!busy) onClose(); }}>
      <div className="vs-modal vs-wz" onClick={e => e.stopPropagation()} data-testid="vs-shorts-wizard" data-step={step}>
        <div className="vs-row" style={{ marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}><Film size={17} /> New Shorts</h2>
          <span className="vs-spacer" />
          <button type="button" className="vs-btn ghost sm" onClick={onClose} aria-label="Close" disabled={!!busy}><X size={16} /></button>
        </div>
        <ol className="vs-wz-steps" aria-label="Steps">
          {STEPS.map(([n, l]) => <li key={n} className={n === step ? 'on' : n < step ? 'done' : ''} aria-current={n === step ? 'step' : undefined}>{n < step ? <Check size={11} /> : n}. {l}</li>)}
        </ol>

        {step === 1 && (
          <section data-testid="vs-wz-step1">
            <p className="vs-sub">What the recording holds — Shorts are chosen from what is said, and framed from what was found in the picture.</p>
            <dl className="vs-wz-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            {known.analysed && known.why && <p className="vs-kbd">Read as {KIND_LABEL[known.kind!].toLowerCase()}: {known.why}.</p>}
            {!known.analysed && !running('track') && view.source.proxyUrl && (
              <div className="vs-note"><span style={{ flex: 1 }}>The picture has not been analysed for the pointer, the people and the action yet — Shorts are framed from it.</span>
                <button type="button" className="vs-btn sm" disabled={busy === 'track'} data-act="wz-analyse" onClick={() => { setBusy('track'); void trackNow(view.project.id).then(() => { setBusy(''); void ctx.refresh(); }); }}>{busy === 'track' ? <Loader size={13} className="spin" /> : <Wand2 size={13} />} Analyse now</button></div>
            )}
            {running('track') && <div className="vs-note"><Loader size={14} className="spin" /> Analysing the picture{jobOf('track').find(j => j.progress != null)?.progress != null ? ` · ${Math.round(jobOf('track').find(j => j.progress != null)!.progress!)}%` : '…'} — you can carry on; the framing follows when it is done.</div>}
            {!ready && <div className="vs-note warn">{running('transcribe') || running('prepare') ? 'The transcript is still being made — Shorts can be found once it is ready.' : 'There is no transcript to find Shorts in. Shorts are chosen from what is said.'}</div>}
          </section>
        )}

        {step === 2 && (
          <section data-testid="vs-wz-step2">
            <div className="vs-wz-ways" role="radiogroup" aria-label="How to make them">
              <button type="button" role="radio" aria-checked={mode === 'auto'} className="vs-wz-way" onClick={() => setMode('auto')} data-way="auto">
                <Wand2 size={18} /><b>Let AI decide <i className="vs-badge">Recommended</i></b>
                <small>Reads the whole recording and proposes every passage that works on its own — as many as there really are, or none, with the reason.</small>
              </button>
              <button type="button" role="radio" aria-checked={mode === 'topic'} className="vs-wz-way" onClick={() => setMode('topic')} data-way="topic">
                <Search size={18} /><b>A topic or a moment</b>
                <small>“The part where I explain pricing”, “the demo of the booking page”.</small>
              </button>
              <button type="button" role="radio" aria-checked={mode === 'range'} className="vs-wz-way" onClick={() => setMode('range')} data-way="range">
                <Clock3 size={18} /><b>A time range</b>
                <small>From one time to another, moved to whole sentences; long pauses shortened.</small>
              </button>
            </div>
            {mode === 'topic' && <label className="vs-label">What should it be about?<input className="vs-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="e.g. the part where I explain pricing" maxLength={300} data-field="video.shortsTopic" data-testid="vs-wz-topic" /></label>}
            {mode === 'range' && (
              <div className="vs-wz-grid" data-field="video.shortsRange">
                <label className="vs-label">Start<input className="vs-input" value={from} onChange={e => setFrom(e.target.value)} placeholder="1:20" data-testid="vs-wz-from" /></label>
                <label className="vs-label">End<input className="vs-input" value={to} onChange={e => setTo(e.target.value)} placeholder="2:05" data-testid="vs-wz-to" /></label>
                <label className="vs-label" style={{ gridColumn: '1 / -1' }}>What it is about (optional)<input className="vs-input" value={query} onChange={e => setQuery(e.target.value)} maxLength={300} /></label>
              </div>
            )}
          </section>
        )}

        {step === 3 && (
          <section data-testid="vs-wz-step3" className="vs-col">
            <div className="vs-label">Where it goes{chips<Platform>(prefs.platform, (Object.keys(PLATFORMS) as Platform[]).map(k => [k, PLATFORMS[k].label]), v => setPrefs(p => ({ ...p, platform: v })), 'Platform')}</div>
            <div className="vs-label">Shape{chips(prefs.aspect, [['9:16', '9:16 · 1080×1920'], ['4:5', '4:5'], ['1:1', '1:1']], v => setPrefs(p => ({ ...p, aspect: v })), 'Shape')}</div>
            <div className="vs-label">Framing{chips<FrameStrategy>(prefs.framing, framingOpts.map(o => [o.key, o.label]), v => setPrefs(p => ({ ...p, framing: v })), 'Framing', v => framingOpts.find(o => o.key === v)?.ok ? '' : framingOpts.find(o => o.key === v)?.why ?? '')}
              <small className="vs-kbd" style={{ fontWeight: 500 }}>{composition.note} You can change each Short’s framing afterwards in the Video panel.</small></div>
            <div className="vs-label">Captions{chips(prefs.captions, [['bold', 'Bold'], ['clean', 'Clean'], ['boxed', 'Boxed'], ['highlight', 'Word highlight'], ['off', 'None']], v => setPrefs(p => ({ ...p, captions: v })), 'Captions')}
              <small className="vs-kbd" style={{ fontWeight: 500 }}>Captions are in the language spoken; this sets their look for all Shorts.</small></div>
            <label className="vs-label">Language of the titles and descriptions<input className="vs-input" value={prefs.language} onChange={e => setPrefs(p => ({ ...p, language: e.target.value }))} placeholder={transcript?.language ? `As spoken (${transcript.language})` : 'As spoken'} maxLength={30} /></label>
            <label className="vs-opt"><input type="checkbox" checked={prefs.logo && logoSet} disabled={!logoSet} onChange={e => setPrefs(p => ({ ...p, logo: e.target.checked }))} /> Your logo on the Shorts{logoSet ? ' (one setting for every Short)' : ' — add a logo in the Logo panel first'}</label>
            <div className="vs-label">Thumbnail{chips(prefs.thumbnail, [['modern', 'Made with each Short'], ['none', 'Not now']], v => setPrefs(p => ({ ...p, thumbnail: v })), 'Thumbnail')}</div>
            <label className="vs-label">Call to action (optional)<input className="vs-input" value={prefs.cta} onChange={e => setPrefs(p => ({ ...p, cta: e.target.value }))} maxLength={140} placeholder="e.g. Book a free call at acme.com" /></label>
            <label className="vs-opt"><input type="checkbox" checked={ownLength} onChange={e => { setOwnLength(e.target.checked); if (e.target.checked && !prefs.min) setPrefs(p => ({ ...p, min: PLATFORMS[p.platform].ideal[0], max: PLATFORMS[p.platform].ideal[1] })); }} /> Set the length myself (otherwise {PLATFORMS[prefs.platform].ideal[0]}–{Math.min(75, PLATFORMS[prefs.platform].max)} s, as {PLATFORMS[prefs.platform].label} suggests)</label>
            {ownLength && (
              <div className="vs-wz-grid">
                <label className="vs-label">Shortest (s)<input className="vs-input" type="number" min={5} max={PLATFORMS[prefs.platform].max} value={prefs.min ?? 20} onChange={e => setPrefs(p => ({ ...p, min: Number(e.target.value) }))} /></label>
                <label className="vs-label">Longest (s)<input className="vs-input" type="number" min={10} max={PLATFORMS[prefs.platform].max} value={prefs.max ?? 60} onChange={e => setPrefs(p => ({ ...p, max: Number(e.target.value) }))} /></label>
              </div>
            )}
          </section>
        )}

        {step === 4 && (
          <section data-testid="vs-wz-step4" className="vs-col">
            {verdict && <div className={`vs-note ${cards.length ? '' : 'warn'}`} data-testid="vs-wz-verdict">{verdict}</div>}
            {notes.map(n => <p key={n} className="vs-kbd" style={{ margin: 0 }}>{n}</p>)}
            {cards.length > 0 && <p className="vs-sub" style={{ margin: 0 }}>{cards.length} proposed{by === 'ai' ? ' by the AI' : ''} · {approved.length} approved. Approve the ones you want, change their ends or words, then make them.</p>}
            {cards.map(card)}
            {rejected.length > 0 && (
              <details className="vs-wz-more" data-testid="vs-wz-rejected">
                <summary>{rejected.length} passage{rejected.length === 1 ? '' : 's'} considered and turned down</summary>
                <ul className="vs-wz-rej">{rejected.map((r, i) => <li key={i}><b>{clock(r.s)}–{clock(r.e)} · {r.title}</b> — {r.why}</li>)}</ul>
              </details>
            )}
            <div className="vs-row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {mode === 'auto' && <button type="button" className="vs-btn sm" disabled={!!busy} onClick={() => void ask(cards.map(c => [c.s, c.e]), cards)} data-act="wz-another">{busy === 'propose' ? <Loader size={13} className="spin" /> : <Plus size={13} />} Find another</button>}
              <button type="button" className="vs-btn ghost sm" disabled={!!busy} onClick={() => void ask()} data-act="wz-regenerate"><RotateCcw size={13} /> Ask again</button>
            </div>
          </section>
        )}

        {step === 5 && (
          <section data-testid="vs-wz-step5" className="vs-col">
            <p className="vs-sub">{made.length} Short{made.length === 1 ? '' : 's'} made. Each renders with its framing, captions{prefs.logo && logoSet ? ', logo' : ''} and words{prefs.thumbnail !== 'none' ? ', and gets a thumbnail' : ''}; you can keep editing while they do.</p>
            {madeNote && <div className="vs-note warn">{madeNote}</div>}
            {made.map(id => {
              const c = ctx.doc.clips.find(x => x.id === id);
              const o = view.outputs.find(x => x.clipId === id);
              const job = o && view.jobs.find(j => j.target === o.id && j.kind === 'render' && (j.state === 'queued' || j.state === 'running'));
              const th = o && view.jobs.find(j => j.target === o.id && j.kind === 'thumbnails' && (j.state === 'queued' || j.state === 'running'));
              return (
                <div key={id} className="vs-exp-row" data-testid="vs-wz-made">
                  <span className="vs-exp-ic"><Film size={16} /></span>
                  <div className="vs-exp-main"><b>{c?.title ?? 'Short'}</b>
                    <small>{job ? `Rendering — ${job.stage || 'waiting its turn'}${typeof job.progress === 'number' ? `, ${Math.round(job.progress)}%` : ''}` : o?.rendered ? `Made · ${clock(o.duration)}` : o?.status === 'failed' ? (o.error || 'The render stopped.') : 'Queued'}{th ? ' · thumbnail on its way' : o?.thumbs.length ? ' · thumbnail ready' : ''}</small>
                    {job && <div className={`vs-bar ${typeof job.progress === 'number' ? '' : 'indet'}`}><i style={{ width: `${job.progress ?? 35}%` }} /></div>}
                  </div>
                  <div className="vs-exp-acts"><button type="button" className="vs-btn sm" onClick={() => { ctx.setActiveClip(id); if (c) ctx.seek(c.s); onClose(); }}>Open</button></div>
                </div>
              );
            })}
          </section>
        )}

        {err && <div className="vs-note bad" role="alert" data-field-error={err.field}><AlertCircle size={15} /> {err.text}</div>}
        <div className="vs-row vs-wz-foot">
          {step > 1 && step < 5 && <button type="button" className="vs-btn ghost sm" disabled={!!busy} onClick={() => setStep((step - 1) as Step)}><ChevronLeft size={14} /> Back</button>}
          <span className="vs-spacer" />
          {step === 1 && <button type="button" className="vs-btn primary" disabled={!ready} onClick={() => setStep(2)} data-act="wz-next">Next <ChevronRight size={14} /></button>}
          {step === 2 && <button type="button" className="vs-btn primary" onClick={() => setStep(3)} data-act="wz-next">Next <ChevronRight size={14} /></button>}
          {step === 3 && <button type="button" className="vs-btn ai" disabled={!!busy} onClick={() => void ask()} data-act="wz-propose">{busy === 'propose' ? <><Loader size={14} className="spin" /> Reading the recording…</> : <><Wand2 size={14} /> {mode === 'auto' ? 'Find the Shorts' : mode === 'topic' ? 'Find it' : 'Make the proposal'}</>}</button>}
          {step === 4 && <button type="button" className="vs-btn ai" disabled={!!busy || !approved.length} onClick={() => void make()} data-act="wz-make">{busy === 'make' ? <><Loader size={14} className="spin" /> Making…</> : <>Make {approved.length || ''} Short{approved.length === 1 ? '' : 's'}</>}</button>}
          {step === 5 && <button type="button" className="vs-btn primary" onClick={onClose}>Done</button>}
        </div>
      </div>
    </div>
  );
}
