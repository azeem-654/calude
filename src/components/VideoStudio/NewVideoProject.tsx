/**
 * A new video project: "What would you like AI to do with this video?"
 *
 * One large box (typed or spoken — the Autopilot voice engine), presets for
 * the common asks, the file, and what was understood said back before
 * anything runs. Advanced settings stay folded unless opened. The upload is
 * resumable and its bar is bytes the server confirmed.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Wand2, ChevronDown, ChevronUp, Loader, Film, AlertCircle, Bot } from 'lucide-react';
import VoiceControl from '../Autopilot/voice/VoiceControl';
import {
  createVideoProject, parseRequest, describeRequest, uploadVideo, bytesLabel, SHORTS_MAX,
  type Template, type VideoRequest, type UploadProgress, type Want,
} from '../../services/videoStudio';
import { fetchBoard, type Project } from '../../services/projects';

const PRESETS: { label: string; text: string }[] = [
  { label: 'Clean + long video + 4 Shorts', text: 'Clean this recording, remove filler words and long gaps, create one polished main video and four Shorts, add captions and create PNG thumbnails.' },
  { label: '5 Shorts only', text: 'Create five 30–60 second Shorts from this video with captions and PNG thumbnails.' },
  { label: 'Just clean it', text: 'Clean this recording: remove filler words and long gaps. Keep it natural. No Shorts.' },
  { label: 'Captions + thumbnails', text: 'Add captions and create PNG thumbnails for this video. Light cleanup only.' },
];

/** What the welcome wizard asked for beyond the video itself, said in words. */
function wantWords(w: Want): string[] {
  return [
    w.denoise ? `${w.denoise} noise reduction` : '',
    w.voice ? 'clearer voice' : '',
    w.music ? `${w.music.replace(/ instrumental$/, '')} royalty-free music` : '',
    w.repurpose ? [w.repurpose.posts ? `${w.repurpose.posts} social posts` : '', w.repurpose.blog ? 'a blog article' : '', w.repurpose.email ? '3 emails' : ''].filter(Boolean).join(', ') + ' (drafts)' : '',
    w.quiz ? 'a quiz' : '',
  ].filter(Boolean);
}

export default function NewVideoProject({ template, want, autopilotProjectId, onCancel, onCreated }: {
  template: Template | null;
  want?: Want;
  autopilotProjectId: string;
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const [prompt, setPrompt] = useState(template?.prompt ?? '');
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [settings, setSettings] = useState<Partial<VideoRequest> & { language?: string }>(template?.settings ?? {});
  const [apProjects, setApProjects] = useState<Project[]>([]);
  const [ap, setAp] = useState(autopilotProjectId);
  const [busy, setBusy] = useState<'' | 'creating' | 'uploading'>('');
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void fetchBoard().then(b => setApProjects(b.projects as Project[])); }, []);
  useEffect(() => { if (template) { setPrompt(template.prompt); setSettings(template.settings); } }, [template]);

  /* What will be made, from the words — the same reading the server does. */
  const understood = useMemo(() => {
    const r = { ...parseRequest(prompt || 'clean this recording and create three shorts', settings), ...settings } as VideoRequest;
    return { ...r, understood: describeRequest(r) };
  }, [prompt, settings]);

  const pick = (f: File | null | undefined) => {
    if (!f) return;
    setError('');
    if (!/\.(mp4|m4v|mov|mkv|webm)$/i.test(f.name)) { setError('Choose an MP4, MOV, MKV or WebM video.'); return; }
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 80));
  };

  const start = async () => {
    if (!file) { setError('Choose the video first.'); return; }
    setError('');
    setBusy('creating');
    const c = await createVideoProject({ name: name.trim() || file.name, prompt: prompt.trim(), settings, autopilotProjectId: ap || undefined, want });
    if (!c.success) { setBusy(''); setError(c.error ?? 'The project could not be created.'); return; }
    setBusy('uploading');
    const up = await uploadVideo(c.id, file, setProgress);
    setBusy('');
    if (!up.ok) { setError(`${up.error} The project is saved — open it and choose the same file to resume.`); return; }
    onCreated(c.id);
  };

  const set = (patch: Partial<VideoRequest> & { language?: string }) => setSettings(s => ({ ...s, ...patch }));
  const pct = progress ? Math.round((progress.sent / Math.max(1, progress.total)) * 100) : 0;

  return (
    <div className="vs-new" data-testid="vs-new-project">
      <div className="vs-col">
        {template && want && <div className="vs-steps"><span><i>1</i> Goal</span><span>›</span><span><i>2</i> Choices</span><span>›</span><span className="on"><i>3</i> Upload</span></div>}
        <div className="vs-prompt">
          <div className="vs-prompt-in">
            <label htmlFor="vs-prompt" style={{ fontWeight: 800, fontSize: 17, display: 'flex', gap: 8, alignItems: 'center' }}>
              <Wand2 size={18} color="#c084fc" /> {template && want ? template.name : 'What would you like AI to do with this video?'}
            </label>
            <textarea id="vs-prompt" data-field="video.prompt" value={prompt} disabled={listening || !!busy}
              placeholder="Clean this recording, remove filler words and long gaps, create one polished main video and four Shorts, add captions and create PNG thumbnails."
              onChange={e => setPrompt(e.target.value)} />
            <div className="vs-row">
              <VoiceControl compact onListening={setListening} onResult={r => setPrompt(p => (p ? `${p} ` : '') + r.text)} disabled={!!busy} />
              <span className="vs-spacer" />
              <span className="vs-kbd">Typed or spoken — it is put in the box for you to check, never sent on its own.</span>
            </div>
            <div className="vs-chips">
              {PRESETS.map(p => <button key={p.label} type="button" className="vs-chip" aria-pressed={prompt === p.text} onClick={() => setPrompt(p.text)}>{p.label}</button>)}
            </div>
          </div>
        </div>

        <div className={`vs-drop ${over ? 'over' : ''}`} role="button" tabIndex={0} data-field="video.file"
          onClick={() => inputRef.current?.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
          onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}>
          <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.m4v,.mkv,.webm" hidden data-testid="vs-file"
            onChange={e => pick(e.target.files?.[0])} />
          {file ? <Film size={28} color="#c084fc" /> : <Upload size={28} color="#c084fc" />}
          <b>{file ? file.name : 'Upload your recording'}</b>
          <span className="vs-sub" style={{ margin: 0 }}>{file ? bytesLabel(file.size) : 'MP4, MOV, MKV or WebM · up to 12 GB · 16:9, 9:16, 1:1 or 4:5. Your original is kept untouched.'}</span>
        </div>

        {busy === 'uploading' && progress && (
          <div className="vs-card" style={{ display: 'grid', gap: 8 }} data-testid="vs-upload-progress">
            <div className="vs-row"><b>Uploading</b><span className="vs-spacer" /><span>{bytesLabel(progress.sent)} of {bytesLabel(progress.total)} · {pct}%</span></div>
            <div className="vs-bar"><i style={{ width: `${pct}%` }} /></div>
            <span className="vs-sub" style={{ margin: 0 }}>{progress.resumed ? 'Picked up where the last upload stopped. ' : ''}Keep this tab open until it finishes; if it stops, choose the same file again to resume.</span>
          </div>
        )}
        {error && <div className="vs-note bad" role="alert"><AlertCircle size={16} /> {error}</div>}
      </div>

      <div className="vs-col">
        <div className="vs-card" style={{ display: 'grid', gap: 10 }}>
          <h2>What will be made</h2>
          <div className="vs-understood" data-testid="vs-understood">{understood.understood.map(u => <span key={u}>{u}</span>)}{want && wantWords(want).map(u => <span key={u} className="also">{u}</span>)}</div>
          <label className="vs-label">Project name
            <input className="vs-input" data-field="video.name" value={name} onChange={e => setName(e.target.value)} placeholder="Weekly podcast — episode 12" />
          </label>
          <label className="vs-label"><span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Bot size={13} /> Save into an AI Autopilot project (optional)</span>
            <select className="vs-select" data-field="video.autopilot" value={ap} onChange={e => setAp(e.target.value)}>
              <option value="">No — keep it in Video Studio</option>
              {apProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <button type="button" className="vs-btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => setAdvanced(a => !a)} aria-expanded={advanced}>
            {advanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Advanced settings
          </button>
          {advanced && (
            <div className="vs-col" data-testid="vs-advanced">
              <div className="vs-row">
                <label className="vs-label" style={{ flex: 1 }}>Shorts
                  <input className="vs-input" type="number" min={0} max={SHORTS_MAX} value={understood.shorts} onChange={e => set({ shorts: Math.max(0, Math.min(SHORTS_MAX, Number(e.target.value))) })} />
                </label>
                <label className="vs-label" style={{ flex: 1 }}>Shortest (s)
                  <input className="vs-input" type="number" min={10} max={170} value={understood.min} onChange={e => set({ min: Number(e.target.value) })} />
                </label>
                <label className="vs-label" style={{ flex: 1 }}>Longest (s)
                  <input className="vs-input" type="number" min={15} max={180} value={understood.max} onChange={e => set({ max: Number(e.target.value) })} />
                </label>
              </div>
              <div className="vs-row">
                <label className="vs-label" style={{ flex: 1 }}>Cleanup
                  <select className="vs-select" value={understood.cleanup} onChange={e => set({ cleanup: e.target.value as VideoRequest['cleanup'] })}>
                    <option value="conservative">Conservative</option><option value="balanced">Balanced</option><option value="aggressive">Aggressive</option>
                  </select>
                </label>
                <label className="vs-label" style={{ flex: 1 }}>Shorts shape
                  <select className="vs-select" value={understood.aspect} onChange={e => set({ aspect: e.target.value as VideoRequest['aspect'] })}>
                    <option value="9:16">9:16 vertical</option><option value="1:1">1:1 square</option><option value="4:5">4:5 portrait</option>
                  </select>
                </label>
                <label className="vs-label" style={{ flex: 1 }}>Framing
                  <select className="vs-select" value={understood.layout} onChange={e => set({ layout: e.target.value as 'crop' | 'fit' })}>
                    <option value="crop">Crop to the speaker</option><option value="fit">Keep the whole screen</option>
                  </select>
                </label>
              </div>
              <div className="vs-row">
                <label className="vs-label" style={{ flex: 1 }}>Language
                  <select className="vs-select" value={settings.language ?? ''} onChange={e => set({ language: e.target.value || undefined })}>
                    <option value="">Detect automatically</option><option value="en">English</option><option value="tr">Turkish</option><option value="ur">Urdu</option>
                  </select>
                </label>
                <label className="vs-row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={understood.long} onChange={e => set({ long: e.target.checked })} /> Long video</label>
                <label className="vs-row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={understood.captions} onChange={e => set({ captions: e.target.checked })} /> Captions</label>
                <label className="vs-row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={understood.thumbnails} onChange={e => set({ thumbnails: e.target.checked })} /> Thumbnails</label>
              </div>
            </div>
          )}
          <div className="vs-row" style={{ marginTop: 4 }}>
            <button type="button" className="vs-btn ghost" onClick={onCancel} disabled={!!busy}>Cancel</button>
            <span className="vs-spacer" />
            <button type="button" className="vs-btn ai" onClick={() => void start()} disabled={!!busy || !file} data-testid="vs-start">
              {busy ? <Loader size={15} className="spin" /> : <Wand2 size={15} />} {busy === 'creating' ? 'Creating…' : busy === 'uploading' ? `Uploading ${pct}%` : 'Upload and start'}
            </button>
          </div>
          <p className="vs-kbd" style={{ margin: 0 }}>Nothing is published anywhere. Cuts are proposed with reasons, and you can restore anything — the original is never changed.</p>
        </div>
      </div>
    </div>
  );
}
