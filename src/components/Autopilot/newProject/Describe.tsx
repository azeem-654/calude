/**
 * Step one: "What would you like Autopilot to do?"
 *
 * One box, and everything that helps describe a result goes into or beside it:
 * typing, speaking, files, a website, a reference link. Below it, the ready-made
 * solutions — a shortcut, never a gate. Nobody has to pick a category before
 * they can say what they want; a card only pre-fills the box and tells the
 * matcher which way to lean.
 *
 * Speech lands in the box and holds the Continue button until somebody has read
 * it ("Looks right", or editing it themselves). See voice/VoiceReview.tsx.
 */
import { useRef, useState } from 'react';
import {
  Paperclip, Link2, X, FileText, Image as ImageIcon, Table, Sparkles, Megaphone, Search, Mail,
  PenLine, Newspaper, ShoppingBag, LifeBuoy, TrendingUp, CalendarCheck, UserPlus, RefreshCcw,
  Star, Home, Briefcase, Users, Rocket, Video, MapPin, Wand2,
} from 'lucide-react';
import { SOLUTIONS, CUSTOM } from '../../../services/projectSolutions';
import type { Attachment, LinkRef } from '../../../services/projectIntake';
import VoiceControl from '../voice/VoiceControl';
import VoiceReview from '../voice/VoiceReview';
import type { VoiceResult } from '../voice/useVoiceInput';
import { MAX_FILES, readAttachment } from './attachments';

const SOLUTION_ICON: Record<string, typeof Search> = {
  'social-growth': Megaphone, 'lead-generation': Search, 'email-outreach': Mail,
  'content-marketing': PenLine, 'blog-seo': Newspaper, 'ecommerce-store': ShoppingBag,
  'customer-support': LifeBuoy, 'sales-followup': TrendingUp, 'appointment-booking': CalendarCheck,
  'client-onboarding': UserPlus, 'customer-reactivation': RefreshCcw, reputation: Star,
  'real-estate': Home, 'agency-operations': Briefcase, recruitment: Users,
  'product-marketing': Rocket, 'video-content': Video, 'local-business': MapPin, custom: Wand2,
};

export interface DescribeValue {
  prompt: string;
  picked: string;
  files: Attachment[];
  links: LinkRef[];
  /** A transcript nobody has confirmed yet. Continue waits for it. */
  voicePending: boolean;
}

export default function Describe({ value, onChange, onError }: {
  value: DescribeValue;
  onChange: (v: DescribeValue) => void;
  onError: (msg: string) => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [reading, setReading] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkRole, setLinkRole] = useState<LinkRef['role']>('website');
  /* The last transcript, so "Say it again" and "Clear it" can take out exactly
     what the microphone put in and nothing the customer typed. */
  const [heard, setHeard] = useState<{ before: string; text: string; result: VoiceResult } | null>(null);
  const [listen, setListen] = useState(0);
  const [listening, setListening] = useState(false);
  const appendNext = useRef(false);
  const set = (patch: Partial<DescribeValue>) => onChange({ ...value, ...patch });

  const addFiles = async (list: FileList | File[]) => {
    const files = [...list].slice(0, Math.max(0, MAX_FILES - value.files.length));
    if (!files.length) { onError(`That is the most files one request can hold (${MAX_FILES}).`); return; }
    setReading(n => n + files.length);
    const added: Attachment[] = [];
    for (const f of files) {
      const r = await readAttachment(f);
      if (r.ok) added.push(r.att); else onError(r.error);
      setReading(n => n - 1);
    }
    if (added.length) onChange({ ...value, files: [...value.files, ...added] });
  };

  const addLink = () => {
    let u = linkUrl.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    try { new URL(u); } catch { onError('That does not look like a web address.'); return; }
    set({ links: [...value.links.filter(l => l.url !== u), { url: u, role: linkRole }] });
    setLinkUrl('');
    setLinkOpen(false);
  };

  const onVoice = (r: VoiceResult) => {
    const before = appendNext.current || !heard ? value.prompt : heard.before;
    appendNext.current = false;
    const joined = before.trim() ? `${before.trim()} ${r.text}` : r.text;
    setHeard({ before, text: r.text, result: r });
    set({ prompt: joined, voicePending: true });
  };

  const pick = (key: string) => {
    const s = SOLUTIONS.find(x => x.key === key);
    const wasExample = SOLUTIONS.some(x => x.example && x.example === value.prompt.trim());
    const prompt = key === CUSTOM
      ? (wasExample ? '' : value.prompt)
      : (!value.prompt.trim() || wasExample ? (s?.example ?? '') : value.prompt);
    set({ picked: value.picked === key ? '' : key, prompt });
    window.setTimeout(() => box.current?.focus(), 0);
  };

  const images = value.files.filter(f => f.kind === 'image');

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <div>
        <h2 className="wz-title">What would you like <span className="wz-accent">Autopilot</span> to do?</h2>
        <p style={{ margin: '9px 0 0', fontSize: 15, color: '#6b7280', lineHeight: 1.55, maxWidth: '60ch' }}>
          Tell us the result you want. You don&rsquo;t need to know how to build it.
        </p>
      </div>

      <div
        className="np-prompt"
        data-drag={drag ? '1' : '0'}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files); }}
      >
        <textarea
          ref={box}
          aria-label="What would you like Autopilot to do?"
          value={value.prompt}
          readOnly={listening}
          onChange={e => {
            /* Editing the words yourself is reviewing them. */
            set({ prompt: e.target.value, voicePending: false });
            if (heard) setHeard(null);
          }}
          placeholder="e.g. Learn about my company and create one professional image post every weekday."
          rows={4}
          maxLength={4000}
        />

        {(value.files.length > 0 || value.links.length > 0 || reading > 0) && (
          <div className="np-chips" style={{ padding: '0 14px 4px' }}>
            {value.links.map(l => (
              <span key={l.url} className="np-chip">
                <Link2 size={13} />
                <span>{l.role === 'website' ? 'Website' : 'Reference'}: {l.url.replace(/^https?:\/\//, '')}</span>
                <button type="button" aria-label={`Remove ${l.url}`} onClick={() => set({ links: value.links.filter(x => x.url !== l.url) })}><X size={12} /></button>
              </span>
            ))}
            {images.length > 8 ? (
              <span className="np-chip">
                <ImageIcon size={13} /><span>{images.length} images</span>
                <button type="button" aria-label="Remove all images" onClick={() => set({ files: value.files.filter(f => f.kind !== 'image') })}><X size={12} /></button>
              </span>
            ) : images.map(f => (
              <span key={f.id} className="np-chip">
                {f.dataUrl ? <img src={f.dataUrl} alt="" /> : <ImageIcon size={13} />}
                <span>{f.name}</span>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => set({ files: value.files.filter(x => x.id !== f.id) })}><X size={12} /></button>
              </span>
            ))}
            {value.files.filter(f => f.kind !== 'image').map(f => (
              <span key={f.id} className="np-chip">
                {f.kind === 'sheet' ? <Table size={13} /> : <FileText size={13} />}
                <span>{f.name}</span>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => set({ files: value.files.filter(x => x.id !== f.id) })}><X size={12} /></button>
              </span>
            ))}
            {reading > 0 && <span className="np-chip"><span>Reading {reading} file{reading === 1 ? '' : 's'}…</span></span>}
          </div>
        )}

        <div className="np-tools">
          <button type="button" className="np-tool" onClick={() => picker.current?.click()}>
            <Paperclip size={14} /> Files &amp; images
          </button>
          <input ref={picker} type="file" multiple hidden
            accept="image/*,application/pdf,.pdf,.csv,.tsv,.txt,.md,.json,.xlsx,.xls,.docx,.doc"
            onChange={e => { if (e.target.files?.length) void addFiles(e.target.files); e.target.value = ''; }} />
          <button type="button" className="np-tool" onClick={() => setLinkOpen(o => !o)} aria-expanded={linkOpen}>
            <Link2 size={14} /> Website or link
          </button>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11.5, color: '#9aa3b2' }}>{value.prompt.length > 3000 ? `${value.prompt.length}/4000` : ''}</span>
        </div>

        {linkOpen && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', padding: '0 12px 12px' }}>
            <select value={linkRole} onChange={e => setLinkRole(e.target.value as LinkRef['role'])} className="np-input"
              style={{ width: 'auto', flex: '0 0 auto', padding: '10px 12px' }} aria-label="What kind of link">
              <option value="website">My website</option>
              <option value="reference">A reference or example</option>
            </select>
            <input className="np-input" style={{ flex: '1 1 200px', padding: '10px 12px' }} value={linkUrl} autoFocus
              onChange={e => setLinkUrl(e.target.value)} placeholder="yourcompany.com"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} aria-label="Web address" />
            <button type="button" className="np-tool" onClick={addLink}>Add</button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <VoiceControl onResult={onVoice} listenSignal={listen} onListening={setListening} />
        {heard && value.voicePending && (
          <VoiceReview
            note={heard.result.note}
            doubtful={heard.result.doubtful}
            onLooksRight={() => { set({ voicePending: false }); setHeard(null); }}
            onRetry={() => { set({ prompt: heard.before, voicePending: false }); appendNext.current = false; setListen(n => n + 1); }}
            onAppend={() => { set({ voicePending: false }); appendNext.current = true; setHeard(null); setListen(n => n + 1); }}
            onClear={() => { set({ prompt: heard.before, voicePending: false }); setHeard(null); }}
          />
        )}
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#17191c' }}>Or start from a ready-made solution</h3>
          <span style={{ fontSize: 12.5, color: '#6b7280' }}>Each one is a starting point — Autopilot still asks only what it needs.</span>
        </div>
        <div className="np-cards">
          {SOLUTIONS.map(s => {
            const Icon = SOLUTION_ICON[s.key] ?? Sparkles;
            const on = value.picked === s.key;
            return (
              <button key={s.key} type="button" className="np-sol" aria-pressed={on} data-custom={s.key === CUSTOM ? '1' : '0'} onClick={() => pick(s.key)}>
                <span className="np-sol-icon"><Icon size={17} /></span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 750, color: '#17191c' }}>{s.label}</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 1.45 }}>{s.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
