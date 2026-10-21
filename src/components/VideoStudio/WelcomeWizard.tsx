/**
 * The studio's welcome: "What would you like to do?" — one card per job a
 * customer comes with. A card goes straight to the upload screen with that
 * job's sensible defaults (`defaultResult`); its choices are folded into an
 * "Options" panel there (`GoalOptions`), never a step in the way.
 *
 * Every card ends in something the studio really does. Six of them are the
 * Video Studio pipeline with different settings (the same request the typed
 * sentence makes, plus `want`: sound, music, repurposing, a quiz). Two hand
 * over to the older modules now inside the studio — AI Shorts for a Short
 * from a link or a script, and Repurposing for a campaign across channels —
 * because neither needs a recording uploaded.
 *
 * Nothing is processed until the upload starts, and nothing is published.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Scissors, Film, Layers, Share2, GraduationCap, Captions, Link2, Rocket, Music2, AudioLines, Sparkles,
} from 'lucide-react';
import type { VideoRequest, Want, Template } from '../../services/videoStudio';

export type GoalKey = 'both' | 'clean' | 'shorts' | 'repurpose' | 'quiz' | 'captions' | 'quick' | 'campaign';

interface Goal {
  key: GoalKey; title: string; blurb: string; icon: typeof Film; tag?: string;
  /** Hands over to an older module's tab instead of uploading here. */
  tab?: 'quick-shorts' | 'repurpose';
  shorts?: boolean; long?: boolean;
}

export const GOALS: Goal[] = [
  { key: 'both', title: 'Clean a long video and make Shorts', blurb: 'Fillers and long pauses out, one polished video, distinct Shorts, captions and PNG thumbnails.', icon: Layers, tag: 'Most popular', shorts: true, long: true },
  { key: 'clean', title: 'Edit and clean a long video', blurb: 'Fillers, false starts and long pauses taken out; background noise reduced. One finished video.', icon: Scissors, long: true },
  { key: 'shorts', title: 'Turn a long video into Shorts', blurb: 'The best self-contained moments, each on its own topic, framed vertical with captions.', icon: Film, shorts: true },
  { key: 'repurpose', title: 'Repurpose into posts, emails and a blog', blurb: 'Shorts, plus social posts, an article and a short email series written from what you said.', icon: Share2, shorts: true, long: true },
  { key: 'quiz', title: 'Quiz from a training video', blurb: 'A cleaned training video and multiple-choice questions, each linked to where it is answered.', icon: GraduationCap, long: true },
  { key: 'captions', title: 'Captions and subtitles only', blurb: 'The same video with captions, plus SRT and VTT files. English, Turkish and Urdu.', icon: Captions, long: true },
  { key: 'quick', title: 'Quick Shorts from a link or script', blurb: 'No recording? The classic AI Shorts maker: a script, scenes and a vertical clip from a topic or link.', icon: Link2, tab: 'quick-shorts' },
  { key: 'campaign', title: 'A campaign across channels', blurb: 'The Repurposing module: one video idea out to clips, posts, emails, SMS and a blog as a campaign.', icon: Rocket, tab: 'repurpose' },
];

function Chip<T extends string | number>({ v, cur, set, children }: { v: T; cur: T; set: (v: T) => void; children: React.ReactNode }) {
  return <button type="button" className="vs-chip" aria-pressed={cur === v} onClick={() => set(v)}>{children}</button>;
}

export interface WizardResult { template: Template; want: Want }

type Noise = 'off' | 'light' | 'medium' | 'strong';
const MUSIC = ['', 'calm', 'upbeat', 'corporate', 'inspiring', 'lofi', 'cinematic', 'acoustic', 'piano'];

export interface Choices {
  shorts: number; len: '15-30' | '30-60' | '60-90'; aspect: '9:16' | '1:1' | '4:5'; layout: 'crop' | 'fit';
  cleanup: 'conservative' | 'balanced' | 'aggressive'; noise: Noise; voice: boolean; music: string; captions: boolean; thumbs: boolean;
  posts: number; blog: boolean; email: boolean; quiz: boolean; language: string;
}

/** Each goal's starting choices — what a press of its card means without any questions. */
export function defaultChoices(k: GoalKey): Choices {
  const c: Choices = { shorts: 4, len: '30-60', aspect: '9:16', layout: 'crop', cleanup: 'balanced', noise: 'medium', voice: true, music: '', captions: true, thumbs: true, posts: 3, blog: true, email: true, quiz: false, language: '' };
  if (k === 'quiz') { c.quiz = true; c.cleanup = 'conservative'; c.layout = 'fit'; }
  if (k === 'shorts') c.shorts = 5;
  if (k === 'repurpose') c.shorts = 3;
  if (k === 'captions') { c.noise = 'off'; c.voice = false; c.cleanup = 'conservative'; }
  return c;
}

/** The request a goal and its choices make — the same sentence and settings the typed request used to. */
export function buildResult(k: GoalKey, c: Choices): WizardResult | null {
  const g = GOALS.find(x => x.key === k);
  if (!g || g.tab) return null;
  const [min, max] = c.len.split('-').map(Number);
  const n = g.shorts ? c.shorts : 0;
  const settings: Partial<VideoRequest> & { language?: string } = {
    long: !!g.long, shorts: n, min, max, aspect: c.aspect, layout: c.layout, cleanup: c.cleanup, captions: c.captions, thumbnails: c.thumbs, ...(c.language ? { language: c.language } : {}),
  };
  const parts = [
    g.long ? `Clean this recording (${c.cleanup} cleanup) and create one polished main video` : 'Find the best moments in this recording',
    n ? `${g.long ? 'and ' : ''}${n} Shorts of ${min}–${max} seconds` : '',
    c.captions ? 'with captions' : 'without captions',
    c.thumbs ? 'and PNG thumbnails' : '',
  ].filter(Boolean).join(' ');
  const extra = [
    c.noise !== 'off' ? `Remove the background noise (${c.noise}).` : '',
    c.voice ? 'Make the voice clearer.' : '',
    c.music ? `Add ${c.music} royalty-free background music.` : '',
    g.key === 'repurpose' ? `Write ${c.posts} social posts${c.blog ? ', a blog article' : ''}${c.email ? ' and a short email series' : ''} from it.` : '',
    c.quiz ? 'Write a quiz from what it teaches.' : '',
  ].filter(Boolean).join(' ');
  const want: Want = {
    ...(c.noise !== 'off' ? { denoise: c.noise } : {}), ...(c.voice ? { voice: true } : {}), ...(c.music ? { music: `${c.music} instrumental` } : {}),
    ...(g.key === 'repurpose' ? { repurpose: { posts: c.posts, blog: c.blog, email: c.email } } : {}), ...(c.quiz ? { quiz: true } : {}),
  };
  return { template: { key: g.key, name: g.title, blurb: g.blurb, prompt: `${parts}. ${extra}`.trim(), settings }, want };
}

export const defaultResult = (k: GoalKey) => buildResult(k, defaultChoices(k));

/** "What would you like to do?" — a card per goal; a press goes straight to the upload. */
export function GoalGrid({ compact, onPick, onTab }: { compact?: boolean; onPick: (g: GoalKey) => void; onTab: (tab: 'quick-shorts' | 'repurpose') => void }) {
  return (
    <div className="vs-welcome" data-testid="vs-welcome">
      {!compact && (
        <div>
          <h2>What would you like to do with your video?</h2>
          <p className="vs-sub" style={{ margin: '4px 0 0' }}>Choose a goal, then drop your video in — nothing is published, and every cut can be undone.</p>
        </div>
      )}
      <div className="vs-goals">
        {GOALS.map(x => (
          <button key={x.key} type="button" className="vs-goal" onClick={() => x.tab ? onTab(x.tab) : onPick(x.key)} data-goal={x.key} aria-pressed={false}>
            {x.tag && <span className="tag">{x.tag}</span>}
            <span className="ic"><x.icon size={19} /></span>
            <b>{x.title}</b>
            <span>{x.blurb}</span>
            {x.tab && <span style={{ color: 'var(--accent)', fontWeight: 650 }}>Opens {x.tab === 'quick-shorts' ? 'Quick Shorts' : 'Repurpose'} →</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A goal's choices, folded on the upload screen; every change is the new request at once. */
export function GoalOptions({ goal, onChange }: { goal: GoalKey; onChange: (r: WizardResult) => void }) {
  const g = GOALS.find(x => x.key === goal)!;
  const [c, setC] = useState<Choices>(() => defaultChoices(goal));
  const set = <K extends keyof Choices>(k: K) => (v: Choices[K]) => setC(x => ({ ...x, [k]: v }));
  const result = useMemo(() => buildResult(goal, c), [goal, c]);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } if (result) onChange(result); }, [result]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="vs-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }} data-testid="vs-wizard-options" data-goal={g.key}>
      {g.shorts && (
        <div className="vs-card vs-col">
          <h3><Film size={14} /> Shorts</h3>
          <label className="vs-label">How many · {c.shorts}<input type="range" min={1} max={10} value={c.shorts} onChange={e => set('shorts')(Number(e.target.value))} aria-label="Number of Shorts" /></label>
          <div className="vs-label">Length<div className="vs-chips">{(['15-30', '30-60', '60-90'] as const).map(v => <Chip key={v} v={v} cur={c.len} set={set('len')}>{v.replace('-', '–')} s</Chip>)}</div></div>
          <div className="vs-label">Shape<div className="vs-chips">{(['9:16', '1:1', '4:5'] as const).map(v => <Chip key={v} v={v} cur={c.aspect} set={set('aspect')}>{v === '9:16' ? '9:16 vertical' : v === '1:1' ? '1:1 square' : '4:5 portrait'}</Chip>)}</div></div>
          <div className="vs-label">Framing<div className="vs-chips"><Chip v="crop" cur={c.layout} set={set('layout')}>Crop to the speaker</Chip><Chip v="fit" cur={c.layout} set={set('layout')}>Keep the whole screen</Chip></div></div>
        </div>
      )}
      <div className="vs-card vs-col">
        <h3><Scissors size={14} /> Cleanup</h3>
        <div className="vs-chips">
          <Chip v="conservative" cur={c.cleanup} set={set('cleanup')}>Gentle</Chip><Chip v="balanced" cur={c.cleanup} set={set('cleanup')}>Balanced</Chip><Chip v="aggressive" cur={c.cleanup} set={set('cleanup')}>Thorough</Chip>
        </div>
        <span className="vs-kbd">Fillers and pauses are cut; repeats and false starts wait for you to approve. Numbers, prices and “not” are never cut.</span>
        <label className="vs-opt"><input type="checkbox" checked={c.captions} onChange={e => set('captions')(e.target.checked)} /> <span><b>Captions</b> burned in, plus SRT/VTT files</span></label>
        {g.key !== 'captions' && <label className="vs-opt"><input type="checkbox" checked={c.thumbs} onChange={e => set('thumbs')(e.target.checked)} /> <span><b>PNG thumbnails</b> with an exact headline</span></label>}
      </div>
      <div className="vs-card vs-col">
        <h3><AudioLines size={14} /> Sound</h3>
        <div className="vs-label">Background noise<div className="vs-chips" data-testid="vs-wiz-noise">{(['off', 'light', 'medium', 'strong'] as Noise[]).map(v => <Chip key={v} v={v} cur={c.noise} set={set('noise')}>{v[0].toUpperCase() + v.slice(1)}</Chip>)}</div></div>
        <label className="vs-opt"><input type="checkbox" checked={c.voice} onChange={e => set('voice')(e.target.checked)} /> <span><b>Clearer voice</b> — presence, softer “s”, even level</span></label>
        <div className="vs-label"><span><Music2 size={13} /> Background music (royalty-free)</span>
          <select className="vs-select" value={c.music} onChange={e => set('music')(e.target.value)} data-testid="vs-wiz-music">
            {MUSIC.map(m => <option key={m} value={m}>{m ? m[0].toUpperCase() + m.slice(1).replace('lofi', 'Lo-fi') : 'None'}</option>)}
          </select>
        </div>
        {c.music && <span className="vs-kbd">A {c.music} track is found in the open library (CC0, public domain or CC BY only) — change or remove it in the editor.</span>}
      </div>
      {(g.key === 'repurpose' || g.key === 'quiz' || g.key === 'both' || g.key === 'clean') && (
        <div className="vs-card vs-col">
          <h3><Sparkles size={14} /> Beyond video</h3>
          {g.key === 'repurpose' ? (
            <>
              <label className="vs-label">Social posts · {c.posts}<input type="range" min={0} max={6} value={c.posts} onChange={e => set('posts')(Number(e.target.value))} aria-label="Social posts" /></label>
              <label className="vs-opt"><input type="checkbox" checked={c.blog} onChange={e => set('blog')(e.target.checked)} /> <span><b>Blog article</b></span></label>
              <label className="vs-opt"><input type="checkbox" checked={c.email} onChange={e => set('email')(e.target.checked)} /> <span><b>3 emails</b> as a draft sequence</span></label>
              <span className="vs-kbd">Saved as drafts in Social posts, Blog and Email sequences — nothing is posted or sent.</span>
            </>
          ) : null}
          <label className="vs-opt"><input type="checkbox" checked={c.quiz} onChange={e => set('quiz')(e.target.checked)} data-testid="vs-wiz-quiz" /> <span><b>A quiz</b> from what the video teaches</span></label>
        </div>
      )}
      <div className="vs-card vs-col">
        <h3>Language</h3>
        <select className="vs-select" value={c.language} onChange={e => set('language')(e.target.value)}>
          <option value="">Detect automatically</option><option value="en">English</option><option value="tr">Turkish</option><option value="ur">Urdu</option>
        </select>
      </div>
    </div>
  );
}
