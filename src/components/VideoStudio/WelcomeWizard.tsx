/**
 * The studio's welcome: "What would you like to do?" — one card per job a
 * customer comes with, then only the choices that job has, then the upload.
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
import { useMemo, useState } from 'react';
import {
  Wand2, Scissors, Film, Layers, Share2, GraduationCap, Captions, Link2, Rocket, ArrowLeft, ArrowRight, Music2, AudioLines, Sparkles,
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

export default function WelcomeWizard({ compact, onGoal, onTab, onReady, onCancel, initial }: {
  compact?: boolean;
  initial?: GoalKey | '';
  onGoal?: (g: GoalKey) => void;
  onTab: (tab: 'quick-shorts' | 'repurpose') => void;
  onReady: (r: WizardResult) => void;
  onCancel?: () => void;
}) {
  const [goal, setGoal] = useState<GoalKey | ''>(initial ?? '');
  const g = GOALS.find(x => x.key === goal) ?? null;
  const [shorts, setShorts] = useState(4);
  const [len, setLen] = useState<'15-30' | '30-60' | '60-90'>('30-60');
  const [aspect, setAspect] = useState<'9:16' | '1:1' | '4:5'>('9:16');
  const [layout, setLayout] = useState<'crop' | 'fit'>('crop');
  const [cleanup, setCleanup] = useState<'conservative' | 'balanced' | 'aggressive'>('balanced');
  const [noise, setNoise] = useState<Noise>('medium');
  const [voice, setVoice] = useState(true);
  const [music, setMusic] = useState('');
  const [captions, setCaptions] = useState(true);
  const [thumbs, setThumbs] = useState(true);
  const [posts, setPosts] = useState(3);
  const [blog, setBlog] = useState(true);
  const [email, setEmail] = useState(true);
  const [quiz, setQuiz] = useState(false);
  const [language, setLanguage] = useState('');

  const pick = (k: GoalKey) => {
    const x = GOALS.find(y => y.key === k)!;
    if (x.tab) { onTab(x.tab); return; }
    setGoal(k);
    onGoal?.(k);
    if (k === 'quiz') { setQuiz(true); setCleanup('conservative'); setLayout('fit'); }
    if (k === 'shorts') setShorts(5);
    if (k === 'repurpose') setShorts(3);
    if (k === 'captions') { setNoise('off'); setVoice(false); setCleanup('conservative'); }
  };

  const result = useMemo<WizardResult | null>(() => {
    if (!g || g.tab) return null;
    const [min, max] = len.split('-').map(Number);
    const n = g.shorts ? shorts : 0;
    const settings: Partial<VideoRequest> & { language?: string } = {
      long: !!g.long, shorts: n, min, max, aspect, layout, cleanup, captions, thumbnails: thumbs, ...(language ? { language } : {}),
    };
    const parts = [
      g.long ? `Clean this recording (${cleanup} cleanup) and create one polished main video` : 'Find the best moments in this recording',
      n ? `${g.long ? 'and ' : ''}${n} Shorts of ${min}–${max} seconds` : '',
      captions ? 'with captions' : 'without captions',
      thumbs ? 'and PNG thumbnails' : '',
    ].filter(Boolean).join(' ');
    const extra = [
      noise !== 'off' ? `Remove the background noise (${noise}).` : '',
      voice ? 'Make the voice clearer.' : '',
      music ? `Add ${music} royalty-free background music.` : '',
      g.key === 'repurpose' ? `Write ${posts} social posts${blog ? ', a blog article' : ''}${email ? ' and a short email series' : ''} from it.` : '',
      quiz ? 'Write a quiz from what it teaches.' : '',
    ].filter(Boolean).join(' ');
    const want: Want = {
      ...(noise !== 'off' ? { denoise: noise } : {}), ...(voice ? { voice: true } : {}), ...(music ? { music: `${music} instrumental` } : {}),
      ...(g.key === 'repurpose' ? { repurpose: { posts, blog, email } } : {}), ...(quiz ? { quiz: true } : {}),
    };
    return { template: { key: g.key, name: g.title, blurb: g.blurb, prompt: `${parts}. ${extra}`.trim(), settings }, want };
  }, [g, shorts, len, aspect, layout, cleanup, noise, voice, music, captions, thumbs, posts, blog, email, quiz, language]);

  if (!g) {
    return (
      <div className="vs-welcome" data-testid="vs-welcome">
        {!compact && (
          <div>
            <h2>What would you like to do with your video?</h2>
            <p className="vs-sub" style={{ margin: '4px 0 0' }}>Choose a goal. You get only the questions it needs, then upload — nothing is published, and every cut can be undone.</p>
          </div>
        )}
        <div className="vs-goals">
          {GOALS.map(x => (
            <button key={x.key} type="button" className="vs-goal" onClick={() => pick(x.key)} data-goal={x.key} aria-pressed={false}>
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

  return (
    <div className="vs-welcome" data-testid="vs-wizard-options" data-goal={g.key}>
      <div className="vs-steps"><span><i>1</i> Goal</span><span>›</span><span className="on"><i>2</i> Choices</span><span>›</span><span><i>3</i> Upload</span></div>
      <div className="vs-row">
        <span className="vs-mark" style={{ width: 36, height: 36, borderRadius: 11 }}><g.icon size={18} /></span>
        <div style={{ flex: 1, minWidth: 220 }}><h2 style={{ fontSize: 20 }}>{g.title}</h2><span className="vs-kbd">{g.blurb}</span></div>
        <button type="button" className="vs-btn ghost sm" onClick={() => { setGoal(''); onCancel?.(); }}><ArrowLeft size={14} /> Other goals</button>
      </div>

      <div className="vs-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {g.shorts && (
          <div className="vs-card vs-col">
            <h3><Film size={14} /> Shorts</h3>
            <label className="vs-label">How many · {shorts}<input type="range" min={1} max={10} value={shorts} onChange={e => setShorts(Number(e.target.value))} aria-label="Number of Shorts" /></label>
            <div className="vs-label">Length<div className="vs-chips">{(['15-30', '30-60', '60-90'] as const).map(v => <Chip key={v} v={v} cur={len} set={setLen}>{v.replace('-', '–')} s</Chip>)}</div></div>
            <div className="vs-label">Shape<div className="vs-chips">{(['9:16', '1:1', '4:5'] as const).map(v => <Chip key={v} v={v} cur={aspect} set={setAspect}>{v === '9:16' ? '9:16 vertical' : v === '1:1' ? '1:1 square' : '4:5 portrait'}</Chip>)}</div></div>
            <div className="vs-label">Framing<div className="vs-chips"><Chip v="crop" cur={layout} set={setLayout}>Crop to the speaker</Chip><Chip v="fit" cur={layout} set={setLayout}>Keep the whole screen</Chip></div></div>
          </div>
        )}
        <div className="vs-card vs-col">
          <h3><Scissors size={14} /> Cleanup</h3>
          <div className="vs-chips">
            <Chip v="conservative" cur={cleanup} set={setCleanup}>Gentle</Chip><Chip v="balanced" cur={cleanup} set={setCleanup}>Balanced</Chip><Chip v="aggressive" cur={cleanup} set={setCleanup}>Thorough</Chip>
          </div>
          <span className="vs-kbd">Fillers and pauses are cut; repeats and false starts wait for you to approve. Numbers, prices and “not” are never cut.</span>
          <label className="vs-opt"><input type="checkbox" checked={captions} onChange={e => setCaptions(e.target.checked)} /> <span><b>Captions</b> burned in, plus SRT/VTT files</span></label>
          {g.key !== 'captions' && <label className="vs-opt"><input type="checkbox" checked={thumbs} onChange={e => setThumbs(e.target.checked)} /> <span><b>PNG thumbnails</b> with an exact headline</span></label>}
        </div>
        <div className="vs-card vs-col">
          <h3><AudioLines size={14} /> Sound</h3>
          <div className="vs-label">Background noise<div className="vs-chips" data-testid="vs-wiz-noise">{(['off', 'light', 'medium', 'strong'] as Noise[]).map(v => <Chip key={v} v={v} cur={noise} set={setNoise}>{v[0].toUpperCase() + v.slice(1)}</Chip>)}</div></div>
          <label className="vs-opt"><input type="checkbox" checked={voice} onChange={e => setVoice(e.target.checked)} /> <span><b>Clearer voice</b> — presence, softer “s”, even level</span></label>
          <div className="vs-label"><span><Music2 size={13} /> Background music (royalty-free)</span>
            <select className="vs-select" value={music} onChange={e => setMusic(e.target.value)} data-testid="vs-wiz-music">
              {MUSIC.map(m => <option key={m} value={m}>{m ? m[0].toUpperCase() + m.slice(1).replace('lofi', 'Lo-fi') : 'None'}</option>)}
            </select>
          </div>
          {music && <span className="vs-kbd">A {music} track is found in the open library (CC0, public domain or CC BY only) — change or remove it in the editor.</span>}
        </div>
        {(g.key === 'repurpose' || g.key === 'quiz' || g.key === 'both' || g.key === 'clean') && (
          <div className="vs-card vs-col">
            <h3><Sparkles size={14} /> Beyond video</h3>
            {g.key === 'repurpose' ? (
              <>
                <label className="vs-label">Social posts · {posts}<input type="range" min={0} max={6} value={posts} onChange={e => setPosts(Number(e.target.value))} aria-label="Social posts" /></label>
                <label className="vs-opt"><input type="checkbox" checked={blog} onChange={e => setBlog(e.target.checked)} /> <span><b>Blog article</b></span></label>
                <label className="vs-opt"><input type="checkbox" checked={email} onChange={e => setEmail(e.target.checked)} /> <span><b>3 emails</b> as a draft sequence</span></label>
                <span className="vs-kbd">Saved as drafts in Social posts, Blog and Email sequences — nothing is posted or sent.</span>
              </>
            ) : null}
            <label className="vs-opt"><input type="checkbox" checked={quiz} onChange={e => setQuiz(e.target.checked)} data-testid="vs-wiz-quiz" /> <span><b>A quiz</b> from what the video teaches</span></label>
          </div>
        )}
        <div className="vs-card vs-col">
          <h3>Language</h3>
          <select className="vs-select" value={language} onChange={e => setLanguage(e.target.value)}>
            <option value="">Detect automatically</option><option value="en">English</option><option value="tr">Turkish</option><option value="ur">Urdu</option>
          </select>
        </div>
      </div>
      <div className="vs-row">
        <span className="vs-spacer" />
        <button type="button" className="vs-btn ai" onClick={() => result && onReady(result)} data-testid="vs-wiz-next"><Wand2 size={15} /> Next: upload the video <ArrowRight size={15} /></button>
      </div>
    </div>
  );
}
