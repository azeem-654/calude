import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Scissors, Upload, Link, Play, Heart, Edit2, Trash2,
  Download, Share2, Plus, ArrowLeft, X, Check, TrendingUp,
  Zap, Music, Mic, RefreshCw, Copy,
  Film, AlignLeft, SkipBack, SkipForward, Pause,
  Volume2, VolumeX, MoreHorizontal, Search, Layers,
  MonitorPlay, Smartphone, Square as SquareIcon, Send,
} from 'lucide-react';
import type { VideoProject, VideoClip, Caption, BRollClip } from '../../types';
import { useApp } from '../../context/AppContext';
import Header from '../Layout/Header';
import { hasGeminiKey, uploadFileToGemini, waitForFileActive, analyzeVideoWithGemini } from '../../lib/gemini';
import type { GeminiAnalysis } from '../../lib/gemini';
import { exportClipToVideo, renderSyntheticClip, downloadBlob, canExportVideo } from '../../lib/videoExport';

/* A real, public long-form video used for the one-click demo so anyone can try
   the module end-to-end without an API key or their own upload. */
const EXAMPLE_VIDEO = {
  url: 'https://www.youtube.com/watch?v=UF8uR6Z6KLc',
  name: 'Steve Jobs — Stanford Commencement (Example)',
  duration: 15 * 60 + 4,
};

/**
 * Downloads a clip as a real video file. Uses the uploaded source when we have
 * it (pixel-accurate crop + burned captions); otherwise renders a branded
 * synthetic clip so YouTube/demo clips are still downloadable.
 */
async function downloadClip(
  clip: VideoClip,
  project: VideoProject,
  onProgress: (pct: number) => void,
): Promise<void> {
  const filename = `${clip.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 50) || 'clip'}`;
  if (project.sourceBlobUrl && project.sourceType !== 'youtube') {
    const result = await exportClipToVideo({
      sourceBlobUrl: project.sourceBlobUrl,
      startTime: clip.startTime,
      endTime: clip.endTime,
      aspectRatio: clip.aspectRatio,
      captions: clip.captions,
      onProgress,
    });
    downloadBlob(result.blob, `${filename}.${result.fileExt}`);
    return;
  }
  // YouTube footage can't be captured in-browser, but the real thumbnail can
  // (via the CORS proxy) — render over it with motion instead of a flat gradient.
  const ytId = project.sourceUrl ? getYouTubeId(project.sourceUrl) : null;
  const apiBase = import.meta.env.DEV ? 'http://localhost:3001' : '';
  const result = await renderSyntheticClip({
    gradient: clip.thumbnailGradient,
    title: clip.title,
    captions: clip.captions,
    aspectRatio: clip.aspectRatio,
    durationSec: Math.min(clip.duration, 15),
    backgroundImageUrl: ytId ? `${apiBase}/api/yt-thumb.php?id=${ytId}` : undefined,
    onProgress,
  });
  downloadBlob(result.blob, `${filename}.${result.fileExt}`);
}

/* ── Constants ── */

/* App "journey theme" tokens (monochrome). */
const INK = '#17191c';
const MUTED = '#8a8f98';

const GRADIENTS = [
  'linear-gradient(135deg,#6366f1,#8b5cf6)',
  'linear-gradient(135deg,#06b6d4,#6366f1)',
  'linear-gradient(135deg,#ec4899,#8b5cf6)',
  'linear-gradient(135deg,#22c55e,#06b6d4)',
  'linear-gradient(135deg,#f97316,#ef4444)',
  'linear-gradient(135deg,#f59e0b,#f97316)',
  'linear-gradient(135deg,#14b8a6,#22c55e)',
  'linear-gradient(135deg,#0ea5e9,#6366f1)',
  'linear-gradient(135deg,#a855f7,#ec4899)',
  'linear-gradient(135deg,#dc2626,#7f1d1d)',
];

const MUSIC_TRACKS = [
  { id: 'none', label: 'No music' },
  { id: 'lofi', label: 'Lo-fi Chill Beats' },
  { id: 'upbeat', label: 'Upbeat Electronic' },
  { id: 'motivational', label: 'Motivational Rise' },
  { id: 'cinematic', label: 'Cinematic Drama' },
  { id: 'corporate', label: 'Corporate Clean' },
  { id: 'acoustic', label: 'Acoustic Guitar' },
  { id: 'hiphop', label: 'Hip-Hop Vibes' },
];

const PLATFORMS = [
  { id: 'youtube' as const, label: 'YouTube Shorts', color: '#ef4444', icon: '▶' },
  { id: 'tiktok' as const, label: 'TikTok', color: '#0f0f0f', icon: '♪' },
  { id: 'instagram' as const, label: 'Instagram Reels', color: '#e1306c', icon: '◈' },
  { id: 'facebook' as const, label: 'Facebook Reels', color: '#1877f2', icon: 'f' },
  { id: 'linkedin' as const, label: 'LinkedIn Video', color: '#0a66c2', icon: 'in' },
];

const BROLL_LIBRARY: BRollClip[] = [
  { id: 'br1', keyword: 'business', thumbnail: 'linear-gradient(135deg,#1e3a5f,#0ea5e9)', duration: 8, title: 'Business Meeting', source: 'Pexels' },
  { id: 'br2', keyword: 'growth', thumbnail: 'linear-gradient(135deg,#22c55e,#15803d)', duration: 6, title: 'Growth Chart', source: 'Unsplash' },
  { id: 'br3', keyword: 'technology', thumbnail: 'linear-gradient(135deg,#6366f1,#312e81)', duration: 10, title: 'Tech Office', source: 'Pexels' },
  { id: 'br4', keyword: 'success', thumbnail: 'linear-gradient(135deg,#f59e0b,#d97706)', duration: 5, title: 'Celebration', source: 'Pixabay' },
  { id: 'br5', keyword: 'people', thumbnail: 'linear-gradient(135deg,#ec4899,#9333ea)', duration: 7, title: 'Team Collaboration', source: 'Pexels' },
  { id: 'br6', keyword: 'nature', thumbnail: 'linear-gradient(135deg,#14b8a6,#0891b2)', duration: 12, title: 'Nature Timelapse', source: 'Unsplash' },
  { id: 'br7', keyword: 'city', thumbnail: 'linear-gradient(135deg,#475569,#0f172a)', duration: 9, title: 'City Skyline', source: 'Pexels' },
  { id: 'br8', keyword: 'product', thumbnail: 'linear-gradient(135deg,#f97316,#dc2626)', duration: 6, title: 'Product Showcase', source: 'Pixabay' },
  { id: 'br9', keyword: 'marketing', thumbnail: 'linear-gradient(135deg,#8b5cf6,#6366f1)', duration: 8, title: 'Digital Marketing', source: 'Pexels' },
  { id: 'br10', keyword: 'motivation', thumbnail: 'linear-gradient(135deg,#06b6d4,#6366f1)', duration: 11, title: 'Motivation Run', source: 'Unsplash' },
  { id: 'br11', keyword: 'finance', thumbnail: 'linear-gradient(135deg,#22c55e,#065f46)', duration: 7, title: 'Finance Charts', source: 'Pexels' },
  { id: 'br12', keyword: 'education', thumbnail: 'linear-gradient(135deg,#f59e0b,#92400e)', duration: 9, title: 'Study Session', source: 'Pixabay' },
];

const PROCESSING_STEPS = [
  { pct: 5, label: 'Uploading video...' },
  { pct: 18, label: 'Extracting audio track...' },
  { pct: 32, label: 'Transcribing with AI...' },
  { pct: 48, label: 'Analyzing content & key moments...' },
  { pct: 62, label: 'Detecting faces & reframing...' },
  { pct: 76, label: 'Generating auto-captions...' },
  { pct: 88, label: 'Scoring virality potential...' },
  { pct: 95, label: 'Finalizing clips...' },
  { pct: 100, label: 'Done! Your clips are ready.' },
];

/* ── Mock data generators ── */

function fmtDuration(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function fmtLongDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

function viralityColor(score: number) {
  if (score >= 85) return '#22c55e';
  if (score >= 70) return '#f59e0b';
  if (score >= 55) return '#f97316';
  return '#ef4444';
}

function generateCaptions(transcript: string, startTime: number): Caption[] {
  const words = transcript.split(' ');
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 4) {
    chunks.push(words.slice(i, i + 4).join(' '));
  }
  return chunks.map((text, i) => ({
    id: `cap-${Date.now()}-${i}`,
    startTime: startTime + i * 2.5,
    endTime: startTime + (i + 1) * 2.5,
    text,
    emoji: i % 5 === 0 ? ['🔥', '💡', '🚀', '✨', '💪'][i % 5] : undefined,
    highlighted: i % 3 === 0,
    style: { fontSize: 22, color: '#ffffff', position: 'bottom' as const, fontWeight: '800' },
  }));
}

function generateClips(project: VideoProject): VideoClip[] {
  const templates = [
    { title: 'The #1 mistake most people make (and how to avoid it)', focus: 'educational' as const, score: 94, transcript: 'The number one mistake I see people make is trying to do everything at once. You need to focus on one thing at a time. Pick the most important task and work on it until it is done.' },
    { title: 'This single insight changed my entire perspective', focus: 'emotional' as const, score: 91, transcript: 'When I first discovered this I could not believe how simple it was. Everything clicked into place. This is the insight that most successful people share but rarely talk about.' },
    { title: '3 proven strategies that actually work in 2025', focus: 'educational' as const, score: 88, transcript: 'Here are three strategies that are working right now. First focus on your core audience. Second create content they actually want. Third be consistent every single day.' },
    { title: 'Nobody talks about this secret to rapid growth', focus: 'educational' as const, score: 85, transcript: 'I want to share something that most gurus never talk about. The secret to rapid growth is not what you think. It is about the systems you build not the tactics you use.' },
    { title: 'Why 95% of people fail (and what the 5% do differently)', focus: 'emotional' as const, score: 82, transcript: 'The difference between success and failure comes down to one thing. Most people give up right before they break through. The top five percent keep going when everyone else stops.' },
    { title: 'How I went from zero to results in just 90 days', focus: 'emotional' as const, score: 79, transcript: 'Ninety days ago I had nothing. No audience no product no revenue. By applying these exact principles I completely transformed my results and you can too.' },
    { title: 'The truth about what it really takes to succeed', focus: 'emotional' as const, score: 76, transcript: 'People ask me all the time what does it really take. And I tell them the truth. It takes showing up every day even when you do not feel like it. Especially when you do not feel like it.' },
    { title: 'Stop wasting time on these 5 things immediately', focus: 'funny' as const, score: 73, transcript: 'I wasted years doing things that did not move the needle. Here are five things you should stop doing right now. You will thank me later I promise.' },
    { title: 'This is the fastest way to level up your skills', focus: 'educational' as const, score: 70, transcript: 'If you want to level up faster than anyone else here is what you do. You find someone who is ten steps ahead and you do exactly what they did. Not what they say. What they did.' },
    { title: 'The mindset shift that unlocks everything', focus: 'emotional' as const, score: 67, transcript: 'Everything changed for me when I shifted from asking why to asking how. Why this is not working versus how can I make this work. That one shift changes everything.' },
    { title: 'Brutally honest advice nobody wants to hear', focus: 'funny' as const, score: 64, transcript: 'Here is some advice that nobody wants to hear but everybody needs. Stop making excuses. Stop waiting for the perfect moment. The perfect moment is right now.' },
    { title: 'How the algorithm actually works in 2025', focus: 'educational' as const, score: 61, transcript: 'Let me break down exactly how the algorithm works. It is not about posting more content. It is about creating content that keeps people watching. Retention is king.' },
  ];

  const maxClips = Math.min(templates.length, 6 + Math.floor(project.duration / 600));
  const ratio = project.settings.aspectRatio;

  return templates.slice(0, maxClips).map((t, i) => {
    const dur = [30, 38, 45, 52, 58][i % 5] as number;
    const start = Math.floor(i * (project.duration / maxClips));
    const captions = generateCaptions(t.transcript, start);
    return {
      id: `clip-${project.id}-${i}`,
      projectId: project.id,
      title: t.title,
      description: `🔥 ${t.title}\n\n${t.transcript}\n\n👉 Save this for later!`,
      language: 'English',
      hashtags: ['#viral', '#shorts', '#tips', '#growth', '#mindset', `#${t.focus}`],
      startTime: start,
      endTime: start + dur,
      duration: dur,
      thumbnailGradient: GRADIENTS[(i + 2) % GRADIENTS.length] as string,
      viralityScore: Math.max(55, t.score - Math.floor(Math.random() * 5)),
      transcript: t.transcript,
      captions,
      aspectRatio: ratio,
      status: 'neutral' as const,
      focus: t.focus,
      musicTrack: 'none',
      hasVoiceover: false,
      broll: [],
      publishedTo: [],
      views: 0,
      createdAt: new Date().toISOString(),
    };
  });
}

/** Convert Gemini analysis into VideoClip objects. */
function geminiClipsToVideoClips(analysis: GeminiAnalysis, project: VideoProject): VideoClip[] {
  return analysis.clips.map((gc, i) => {
    const dur = Math.round(gc.endTime - gc.startTime);
    // Speech-free videos: the model may still return a placeholder transcript.
    // Never burn that into captions — narrate from the description/title instead.
    const noSpeech = !gc.transcript?.trim() || /no (spoken|speech|dialogue|audio)|^\(.*\)$/i.test(gc.transcript.trim());
    const captionSource = noSpeech ? (gc.description || gc.title) : gc.transcript;
    const captions = generateCaptions(captionSource, gc.startTime);
    const focus = (['emotional', 'educational', 'funny'] as const).includes(gc.focus as never)
      ? (gc.focus as 'emotional' | 'educational' | 'funny')
      : 'educational';
    const isEnglish = analysis.videoLanguage?.trim().toLowerCase() === 'english';
    return {
      id: `clip-${project.id}-${i}`,
      projectId: project.id,
      title: gc.title,
      description: gc.description || `🔥 ${gc.title}\n\n${gc.transcript}\n\n${gc.reason}\n\n👉 Save this for later!`,
      language: analysis.videoLanguage || 'English',
      titleTranslated: !isEnglish ? gc.titleTranslated : undefined,
      descriptionTranslated: !isEnglish ? gc.descriptionTranslated : undefined,
      hashtags: gc.hashtags.slice(0, 8),
      startTime: gc.startTime,
      endTime: gc.endTime,
      duration: Math.max(dur, 5),
      thumbnailGradient: GRADIENTS[(i + 2) % GRADIENTS.length] as string,
      viralityScore: Math.min(99, Math.max(55, gc.viralityScore)),
      transcript: captionSource,
      captions,
      aspectRatio: project.settings.aspectRatio,
      status: 'neutral' as const,
      focus,
      musicTrack: 'none',
      hasVoiceover: false,
      broll: [],
      publishedTo: [],
      views: 0,
      createdAt: new Date().toISOString(),
    };
  });
}

/* ── YouTube ID extractor ── */
function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

/* ── YouTube IFrame Player API loader (singleton) ── */
interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  destroy: () => void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: {
    videoId: string;
    width?: string | number;
    height?: string | number;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (e: { target: YTPlayer }) => void;
      onStateChange?: (e: { data: number; target: YTPlayer }) => void;
    };
  }) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
}
declare global {
  interface Window { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void }
}
let ytApiPromise: Promise<YTNamespace> | null = null;
function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ytApiPromise) {
    ytApiPromise = new Promise(resolve => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT!); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
  }
  return ytApiPromise;
}

/* ── Clip thumbnail for card grid ── */
function ClipThumbnail({
  clip, sourceBlobUrl, sourceType, sourceUrl,
}: {
  clip: VideoClip;
  sourceBlobUrl?: string;
  sourceType: VideoProject['sourceType'];
  sourceUrl?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const seek = () => { v.currentTime = clip.startTime; };
    if (v.readyState >= 1) { seek(); } else { v.addEventListener('loadedmetadata', seek, { once: true }); }
  }, [clip.startTime, sourceBlobUrl]);

  if (sourceType === 'youtube' && sourceUrl) {
    const ytId = getYouTubeId(sourceUrl);
    if (ytId) {
      return (
        <img
          src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          alt=""
        />
      );
    }
  }

  if (sourceBlobUrl) {
    return (
      <video
        ref={videoRef}
        src={sourceBlobUrl}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        muted
        playsInline
        preload="metadata"
        onError={() => { /* falls back to gradient bg */ }}
      />
    );
  }

  return null;
}

/* ── Score badge ── */
function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const c = viralityColor(score);
  const px = size === 'lg' ? '6px 12px' : size === 'sm' ? '2px 6px' : '3px 8px';
  const fs = size === 'lg' ? '14px' : size === 'sm' ? '10px' : '11px';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: `${c}18`, border: `1px solid ${c}40`, borderRadius: '6px', padding: px, flexShrink: 0 }}>
      <Zap size={size === 'lg' ? 13 : 10} color={c} />
      <span style={{ fontSize: fs, fontWeight: 800, color: c }}>{score}</span>
    </div>
  );
}

/* ── Upload Modal ── */
function UploadModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (name: string, source: { type: 'upload' | 'youtube' | 'url'; url?: string; file?: File; duration: number }) => void }) {
  const [tab, setTab] = useState<'upload' | 'youtube' | 'url'>('upload');
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [maxDur, setMaxDur] = useState<30 | 45 | 60>(60);
  const [focus, setFocus] = useState<'all' | 'emotional' | 'educational' | 'funny'>('all');
  const [ratio, setRatio] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.type.startsWith('video/') || f.name.endsWith('.mp4') || f.name.endsWith('.mov'))) handleFile(f);
  };

  const canSubmit = (tab === 'upload' && file) || ((tab === 'youtube' || tab === 'url') && url.trim());

  const handleSubmit = () => {
    if (!canSubmit) return;
    const dur = 1800 + Math.floor(Math.random() * 3600);
    onSubmit(name || 'My Video Project', {
      type: tab,
      url: tab !== 'upload' ? url : undefined,
      file: tab === 'upload' ? file ?? undefined : undefined,
      duration: dur,
    });
  };

  const tabStyle = (t: typeof tab) => ({
    flex: 1, padding: '9px', border: 'none', borderRadius: '8px', cursor: 'pointer',
    backgroundColor: tab === t ? INK : 'transparent',
    color: tab === t ? 'white' : '#64748b',
    fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  } as React.CSSProperties);

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: '20px' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '16px', width: '560px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>New AI Shorts Project</h2>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>Upload a long-form video and let AI generate viral shorts</p>
          </div>
          <button onClick={onClose} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Source tabs */}
          <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '4px', borderRadius: '10px', marginBottom: '20px' }}>
            <button style={tabStyle('upload')} onClick={() => setTab('upload')}><Upload size={14} /> Upload File</button>
            <button style={tabStyle('youtube')} onClick={() => setTab('youtube')}>▶ YouTube URL</button>
            <button style={tabStyle('url')} onClick={() => setTab('url')}><Link size={14} /> Video URL</button>
          </div>

          {tab === 'upload' && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              style={{ border: `2px dashed ${dragging ? '#6366f1' : '#cbd5e1'}`, borderRadius: '12px', padding: '40px 20px', textAlign: 'center', cursor: 'pointer', backgroundColor: dragging ? '#f5f3ff' : '#f8fafc', transition: 'all 0.15s', marginBottom: '16px' }}>
              <input ref={fileRef} type="file" accept="video/mp4,video/mov,video/quicktime,video/*" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              {file ? (
                <>
                  <Film size={40} color="#6366f1" style={{ margin: '0 auto 12px' }} />
                  <p style={{ fontWeight: 700, color: '#0f172a', margin: '0 0 4px', fontSize: '14px' }}>{file.name}</p>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{(file.size / 1024 / 1024).toFixed(1)} MB · Click to change</p>
                </>
              ) : (
                <>
                  <Upload size={40} color="#94a3b8" style={{ margin: '0 auto 12px' }} />
                  <p style={{ fontWeight: 700, color: '#374151', margin: '0 0 4px' }}>Drop your video here</p>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px' }}>MP4, MOV up to 4GB</p>
                  <span style={{ fontSize: '12px', color: '#6366f1', fontWeight: 600 }}>or click to browse</span>
                </>
              )}
            </div>
          )}

          {(tab === 'youtube' || tab === 'url') && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                {tab === 'youtube' ? 'YouTube URL' : 'Video URL'}
              </label>
              <input
                value={url}
                onChange={e => { setUrl(e.target.value); if (!name) setName(tab === 'youtube' ? 'YouTube Video' : 'Video Project'); }}
                placeholder={tab === 'youtube' ? 'https://www.youtube.com/watch?v=...' : 'https://...'}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
              />
              {tab === 'youtube' && <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0' }}>Paste any public YouTube video link — podcasts, webinars, long-form content</p>}
            </div>
          )}

          {/* Project name */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Project Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Marketing Podcast Ep. 42"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* AI Settings */}
          <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 12px' }}>AI Settings</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Max Clip Duration</label>
                <select value={maxDur} onChange={e => setMaxDur(Number(e.target.value) as 30 | 45 | 60)} style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: 'white' }}>
                  <option value={30}>30 seconds</option>
                  <option value={45}>45 seconds</option>
                  <option value={60}>60 seconds</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Focus On</label>
                <select value={focus} onChange={e => setFocus(e.target.value as typeof focus)} style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: 'white' }}>
                  <option value="all">All moments</option>
                  <option value="emotional">Emotional</option>
                  <option value="educational">Educational</option>
                  <option value="funny">Funny</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Output Format</label>
                <select value={ratio} onChange={e => setRatio(e.target.value as typeof ratio)} style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: 'white' }}>
                  <option value="9:16">9:16 Portrait</option>
                  <option value="1:1">1:1 Square</option>
                  <option value="16:9">16:9 Landscape</option>
                </select>
              </div>
            </div>
          </div>

          <button onClick={handleSubmit} disabled={!canSubmit}
            style={{ width: '100%', padding: '12px', background: canSubmit ? INK : '#e2e8f0', color: canSubmit ? 'white' : '#94a3b8', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Zap size={16} /> Generate AI Shorts
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Processing Screen ── */
function ProcessingScreen({ project, onRetry, onUseDemo }: { project: VideoProject; onRetry?: () => void; onUseDemo?: () => void }) {
  const stepIdx = PROCESSING_STEPS.findIndex(s => s.pct >= project.progress) ?? PROCESSING_STEPS.length - 1;
  const step = PROCESSING_STEPS[Math.max(0, stepIdx)];

  if (project.status === 'failed') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 40px', textAlign: 'center' }}>
        <div style={{ width: '80px', height: '80px', borderRadius: '20px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
          <X size={36} color="#ef4444" />
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>AI processing failed</h2>
        <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 4px', maxWidth: '460px', lineHeight: 1.6 }}>
          {project.error || 'Something went wrong while analyzing your video.'}
        </p>
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 28px', maxWidth: '460px' }}>
          No fake clips were generated from your video. You can retry the AI, or generate sample clips to preview the workflow.
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {onRetry && (
            <button onClick={onRetry} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '11px 24px', background: INK, color: 'white', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
              <RefreshCw size={15} /> Retry AI
            </button>
          )}
          {onUseDemo && (
            <button onClick={onUseDemo} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '11px 24px', background: 'white', color: INK, border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
              <Zap size={15} /> Generate sample clips instead
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 40px', textAlign: 'center' }}>
      <div style={{ width: '80px', height: '80px', borderRadius: '20px', background: project.thumbnailGradient, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', boxShadow: '0 8px 30px rgba(99,102,241,0.3)' }}>
        <Scissors size={36} color="white" />
      </div>
      <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>AI is analyzing your video</h2>
      <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 32px', maxWidth: '400px' }}>
        Our AI is finding the most engaging moments, transcribing speech, and generating viral short clips.
      </p>
      <div style={{ width: '100%', maxWidth: '440px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#374151', marginBottom: '8px', fontWeight: 600 }}>
          <span>{step?.label ?? 'Processing...'}</span>
          <span>{project.progress}%</span>
        </div>
        <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${project.progress}%`, background: 'linear-gradient(90deg,#6366f1,#8b5cf6)', borderRadius: '4px', transition: 'width 0.5s ease' }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '400px' }}>
        {PROCESSING_STEPS.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: s.pct <= project.progress ? '#6366f1' : '#94a3b8', fontWeight: s.pct <= project.progress ? 600 : 400 }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '3px', background: s.pct <= project.progress ? '#6366f1' : '#e2e8f0' }} />
            {s.label.replace('...', '')}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Clip Card ── */
function ClipCard({ clip, onEdit, onLike, onDislike, onTrash, onPublish, onDuplicate, sourceBlobUrl, sourceType, sourceUrl }: {
  clip: VideoClip;
  onEdit: () => void;
  onLike: () => void;
  onDislike: () => void;
  onTrash: () => void;
  onPublish: () => void;
  onDuplicate: () => void;
  sourceBlobUrl?: string;
  sourceType: VideoProject['sourceType'];
  sourceUrl?: string;
}) {
  const { addNotification } = useApp();
  const [showMenu, setShowMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [showTranslated, setShowTranslated] = useState(false);
  const isLiked = clip.status === 'liked';
  const isDisliked = clip.status === 'disliked';
  const ratio = clip.aspectRatio === '9:16' ? '56.25%' : clip.aspectRatio === '1:1' ? '100%' : '177.78%';
  const isNonEnglish = !!clip.language && clip.language.toLowerCase() !== 'english';
  const hasTranslation = isNonEnglish && !!(clip.titleTranslated || clip.descriptionTranslated);
  const displayTitle = showTranslated && clip.titleTranslated ? clip.titleTranslated : clip.title;
  const displayDescription = showTranslated && clip.descriptionTranslated ? clip.descriptionTranslated : clip.description;

  const isSynthetic = sourceType === 'youtube' || !sourceBlobUrl;

  const handleDownload = async () => {
    setShowMenu(false);
    if (!canExportVideo()) {
      addNotification('Your browser does not support in-browser video export. Try Chrome or Edge.', 'error');
      return;
    }
    setExporting(true);
    setExportPct(0);
    try {
      await downloadClip(clip, { sourceBlobUrl, sourceType, sourceUrl } as VideoProject, setExportPct);
      addNotification(isSynthetic ? 'Downloaded! YouTube blocks capturing its footage, so this is a motion render of the clip (thumbnail + captions).' : 'Clip downloaded!', 'success');
    } catch (err) {
      addNotification(err instanceof Error ? err.message : 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', transition: 'box-shadow 0.15s', cursor: 'default' }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'}>
      {/* Thumbnail */}
      <div style={{ position: 'relative', paddingBottom: clip.aspectRatio === '9:16' ? '133%' : clip.aspectRatio === '1:1' ? '100%' : '56.25%', overflow: 'hidden', background: clip.thumbnailGradient, cursor: 'pointer' }} onClick={onEdit}>
        <ClipThumbnail clip={clip} sourceBlobUrl={sourceBlobUrl} sourceType={sourceType} sourceUrl={sourceUrl} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.25)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(255,255,255,0.5)' }}>
            <Play size={18} color="white" fill="white" />
          </div>
        </div>
        {/* Caption preview overlay */}
        <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8, background: 'rgba(0,0,0,0.6)', borderRadius: '4px', padding: '4px 6px' }}>
          <p style={{ margin: 0, fontSize: '9px', color: 'white', fontWeight: 800, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {clip.captions[0]?.text ?? clip.title}
          </p>
        </div>
        {/* Duration badge */}
        <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.5)', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', color: 'white', fontWeight: 700, backdropFilter: 'blur(4px)' }}>
          {fmtDuration(clip.duration)}
        </div>
        {/* Aspect ratio */}
        <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.5)', borderRadius: '4px', padding: '2px 6px', fontSize: '9px', color: 'white', fontWeight: 600, backdropFilter: 'blur(4px)' }}>
          {clip.aspectRatio}
        </div>
        {/* Focus tag */}
        <div style={{ position: 'absolute', bottom: 36, right: 8, background: clip.focus === 'emotional' ? '#ec4899' : clip.focus === 'funny' ? '#f59e0b' : '#6366f1', borderRadius: '4px', padding: '2px 5px', fontSize: '9px', color: 'white', fontWeight: 700 }}>
          {clip.focus}
        </div>
      </div>

      {/* Card content */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px', marginBottom: '4px' }}>
          <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', flex: 1 }}>
            {displayTitle}
          </p>
          <ScoreBadge score={clip.viralityScore} size="sm" />
        </div>

        {/* Description */}
        <p style={{ margin: '0 0 6px', fontSize: '11px', color: '#64748b', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {displayDescription}
        </p>

        {/* Language badge + translation toggle */}
        {isNonEnglish && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>
            <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: '#eef2ff', color: '#4f46e5', fontWeight: 700 }}>
              🌐 {clip.language}
            </span>
            {hasTranslation && (
              <button onClick={() => setShowTranslated(v => !v)}
                style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', background: showTranslated ? '#6366f1' : 'white', color: showTranslated ? 'white' : '#64748b', fontWeight: 700, cursor: 'pointer' }}>
                {showTranslated ? `Show ${clip.language}` : 'Show English'}
              </button>
            )}
          </div>
        )}

        {/* Published platforms */}
        {clip.publishedTo.length > 0 && (
          <div style={{ display: 'flex', gap: '3px', marginBottom: '8px', flexWrap: 'wrap' }}>
            {clip.publishedTo.map(p => {
              const pl = PLATFORMS.find(x => x.id === p.platform);
              return pl ? (
                <span key={p.platform} style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: `${pl.color}18`, color: pl.color, fontWeight: 600, border: `1px solid ${pl.color}30` }}>
                  {pl.label.split(' ')[0]}
                </span>
              ) : null;
            })}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '4px', justifyContent: 'space-between' }}>
          <button onClick={onLike} title="Like" style={{ flex: 1, padding: '6px', borderRadius: '6px', border: '1px solid #e2e8f0', background: isLiked ? '#fdf2f8' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isLiked ? '#ec4899' : '#64748b' }}>
            <Heart size={13} fill={isLiked ? '#ec4899' : 'none'} />
          </button>
          <button onClick={onEdit} title="Edit" style={{ flex: 1, padding: '6px', borderRadius: '6px', border: '1px solid #6366f130', background: '#f5f3ff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1' }}>
            <Edit2 size={13} />
          </button>
          <button onClick={onPublish} title="Publish" style={{ flex: 1, padding: '6px', borderRadius: '6px', border: '1px solid #22c55e30', background: '#f0fdf4', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e' }}>
            <Share2 size={13} />
          </button>
          <div style={{ position: 'relative', flex: 1 }}>
            <button onClick={() => setShowMenu(!showMenu)} style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
              <MoreHorizontal size={13} />
            </button>
            {showMenu && (
              <div style={{ position: 'absolute', bottom: '110%', right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, minWidth: '140px', padding: '4px' }}>
                {[
                  { icon: Download, label: isSynthetic ? 'Download (branded)' : 'Download HD', action: handleDownload },
                  { icon: Copy, label: 'Duplicate', action: () => { onDuplicate(); setShowMenu(false); } },
                  { icon: Trash2, label: 'Move to Trash', action: () => { onTrash(); setShowMenu(false); }, danger: true },
                ].map(item => (
                  <button key={item.label} onClick={item.action}
                    style={{ width: '100%', padding: '8px 10px', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: item.danger ? '#ef4444' : '#374151', borderRadius: '5px', textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc'}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}>
                    <item.icon size={12} /> {item.label}
                  </button>
                ))}
              </div>
            )}
            {exporting && (
              <div style={{ position: 'absolute', bottom: '110%', right: 0, background: '#0f172a', color: 'white', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 100, minWidth: '150px', padding: '10px 12px', fontSize: '11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontWeight: 600 }}>
                  <span>Exporting…</span><span>{exportPct}%</span>
                </div>
                <div style={{ height: '5px', background: 'rgba(255,255,255,0.15)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${exportPct}%`, background: '#6366f1', borderRadius: '3px', transition: 'width 0.2s' }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Publish Modal ── */
function PublishModal({ clip, onClose, onPublish }: { clip: VideoClip; onClose: () => void; onPublish: (data: VideoClip['publishedTo'][0]) => void }) {
  const [platform, setPlatform] = useState<VideoClip['publishedTo'][0]['platform']>('youtube');
  const [mode, setMode] = useState<'now' | 'schedule'>('now');
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('09:00');
  const [title, setTitle] = useState(clip.title);
  const [desc, setDesc] = useState(clip.description);
  const [tags, setTags] = useState(clip.hashtags.join(' '));

  const pl = PLATFORMS.find(p => p.id === platform)!;

  const handlePublish = () => {
    onPublish({
      platform,
      title,
      description: desc,
      status: mode === 'now' ? 'published' : 'scheduled',
      publishedAt: mode === 'now' ? new Date().toISOString() : undefined,
      scheduledAt: mode === 'schedule' ? `${schedDate}T${schedTime}:00` : undefined,
    });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '520px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Publish to Social Media</h3>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0' }}>Share your short clip directly to your channels</p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Platform selector */}
          <p style={{ fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px' }}>Platform</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
            {PLATFORMS.map(p => (
              <button key={p.id} onClick={() => setPlatform(p.id)}
                style={{ padding: '8px 14px', borderRadius: '8px', border: `2px solid ${platform === p.id ? p.color : '#e2e8f0'}`, background: platform === p.id ? `${p.color}12` : 'white', color: platform === p.id ? p.color : '#64748b', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Title */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* Description */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Description / Caption</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4} style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>

          {/* Tags */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Hashtags</label>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="#viral #shorts #tips" style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* Schedule */}
          <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '14px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              {(['now', 'schedule'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  style={{ flex: 1, padding: '8px', borderRadius: '7px', border: 'none', background: mode === m ? '#6366f1' : 'transparent', color: mode === m ? 'white' : '#64748b', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                  {m === 'now' ? '⚡ Publish Now' : '📅 Schedule'}
                </button>
              ))}
            </div>
            {mode === 'schedule' && (
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Date</label>
                  <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} min={new Date().toISOString().split('T')[0]}
                    style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Time</label>
                  <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)}
                    style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
            )}
          </div>

          <button onClick={handlePublish} style={{ width: '100%', padding: '12px', background: `linear-gradient(135deg,${pl.color},${pl.color}cc)`, color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Send size={15} /> {mode === 'now' ? `Publish to ${pl.label}` : `Schedule for ${schedDate || 'selected date'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Clip Editor ── */
function ClipEditor({ clip, project, onBack, onSave }: { clip: VideoClip; project: VideoProject; onBack: () => void; onSave: (updates: Partial<VideoClip>) => void }) {
  const { addNotification } = useApp();
  const [localClip, setLocalClip] = useState(clip);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [activePanel, setActivePanel] = useState<'details' | 'captions' | 'audio' | 'broll' | 'publish'>('details');
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [editingCapIdx, setEditingCapIdx] = useState<number | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [trimStart, setTrimStart] = useState(clip.startTime);
  const [trimEnd, setTrimEnd] = useState(clip.endTime);
  const [brollSearch, setBrollSearch] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const [ytReady, setYtReady] = useState(false);

  const dur = localClip.duration;
  const ytId = (project.sourceType === 'youtube' && project.sourceUrl) ? getYouTubeId(project.sourceUrl) : null;
  const hasRealVideo = !!(project.sourceBlobUrl || ytId);

  /* ── YouTube: real player via the IFrame API so our own controls drive it
        (controls hidden → no YouTube chrome/avatar in the preview). ── */
  useEffect(() => {
    if (!ytId || !ytContainerRef.current) return;
    let disposed = false;
    const mountEl = document.createElement('div');
    ytContainerRef.current.appendChild(mountEl);
    loadYouTubeApi().then(YT => {
      if (disposed) return;
      ytPlayerRef.current = new YT.Player(mountEl, {
        videoId: ytId,
        width: '100%',
        height: '100%',
        playerVars: {
          controls: 0, rel: 0, iv_load_policy: 3, fs: 0, disablekb: 1,
          playsinline: 1, start: Math.floor(trimStart), origin: window.location.origin,
        },
        events: {
          onReady: e => { if (!disposed) { e.target.seekTo(trimStart, true); e.target.pauseVideo(); setYtReady(true); } },
          onStateChange: e => {
            if (disposed) return;
            if (e.data === YT.PlayerState.ENDED) setPlaying(false);
          },
        },
      });
    });
    return () => {
      disposed = true;
      try { ytPlayerRef.current?.destroy(); } catch { /* already gone */ }
      ytPlayerRef.current = null;
      setYtReady(false);
    };
    // trimStart intentionally excluded: seeks are handled live, not by remounting
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytId]);

  /* Poll the YouTube player for the playhead + stop at the trim end. */
  useEffect(() => {
    if (!ytId || !ytReady) return;
    const int = window.setInterval(() => {
      const p = ytPlayerRef.current;
      if (!p) return;
      const t = p.getCurrentTime();
      setPlayhead(Math.max(0, t - trimStart));
      if (t >= trimEnd) {
        p.pauseVideo();
        p.seekTo(trimStart, true);
        setPlaying(false);
        setPlayhead(0);
      }
    }, 250);
    return () => window.clearInterval(int);
  }, [ytId, ytReady, trimStart, trimEnd]);

  const set = (updates: Partial<VideoClip>) => setLocalClip(prev => ({ ...prev, ...updates }));

  const canRealExport = !!project.sourceBlobUrl && project.sourceType !== 'youtube';

  const handleDownload = async () => {
    if (!canExportVideo()) {
      addNotification('Your browser does not support in-browser video export. Try Chrome or Edge.', 'error');
      return;
    }
    setExporting(true);
    setExportPct(0);
    try {
      if (canRealExport) {
        const result = await exportClipToVideo({
          sourceBlobUrl: project.sourceBlobUrl!,
          startTime: trimStart,
          endTime: trimEnd,
          aspectRatio: localClip.aspectRatio,
          captions: localClip.captions,
          onProgress: setExportPct,
        });
        downloadBlob(result.blob, `${localClip.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 50)}.${result.fileExt}`);
      } else {
        const apiBase = import.meta.env.DEV ? 'http://localhost:3001' : '';
        const result = await renderSyntheticClip({
          gradient: localClip.thumbnailGradient,
          title: localClip.title,
          captions: localClip.captions,
          aspectRatio: localClip.aspectRatio,
          durationSec: Math.min(trimEnd - trimStart, 15),
          backgroundImageUrl: ytId ? `${apiBase}/api/yt-thumb.php?id=${ytId}` : undefined,
          onProgress: setExportPct,
        });
        downloadBlob(result.blob, `${localClip.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 50) || 'clip'}.${result.fileExt}`);
      }
      addNotification(canRealExport ? 'Clip downloaded!' : 'Downloaded! YouTube blocks capturing its footage, so this is a motion render of the clip (thumbnail + captions).', 'success');
    } catch (err) {
      addNotification(err instanceof Error ? err.message : 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  // Seek real video to trim start when source loads
  const handleVideoLoaded = () => {
    if (videoRef.current) videoRef.current.currentTime = trimStart;
  };

  // Update playhead from real video and stop at trimEnd
  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    const elapsed = v.currentTime - trimStart;
    setPlayhead(Math.max(0, elapsed));
    if (v.currentTime >= trimEnd) {
      v.pause();
      v.currentTime = trimStart;
      setPlaying(false);
      setPlayhead(0);
    }
  };

  // Drive real video / YouTube player from playing state
  useEffect(() => {
    if (ytId) {
      const p = ytPlayerRef.current;
      if (!p || !ytReady) return;
      if (playing) p.playVideo(); else p.pauseVideo();
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    if (playing) { v.play().catch(() => setPlaying(false)); }
    else { v.pause(); }
  }, [playing, ytId, ytReady]);

  const handlePublish = (data: VideoClip['publishedTo'][0]) => {
    const publishedTo = [...localClip.publishedTo.filter(p => p.platform !== data.platform), data];
    set({ publishedTo });
    onSave({ publishedTo });
  };

  const filteredBroll = BROLL_LIBRARY.filter(b =>
    brollSearch === '' || b.keyword.includes(brollSearch.toLowerCase()) || b.title.toLowerCase().includes(brollSearch.toLowerCase())
  );

  const ratioIcon = localClip.aspectRatio === '9:16' ? <Smartphone size={14} /> : localClip.aspectRatio === '1:1' ? <SquareIcon size={14} /> : <MonitorPlay size={14} />;
  const previewWidth = localClip.aspectRatio === '9:16' ? 200 : localClip.aspectRatio === '1:1' ? 240 : 340;
  const previewHeight = localClip.aspectRatio === '9:16' ? 355 : localClip.aspectRatio === '1:1' ? 240 : 191;

  // Cover-crop the 16:9 YouTube player to fill the clip's frame (like a real short),
  // which also crops out most of YouTube's corner branding.
  const ytCover = previewWidth / previewHeight < 16 / 9
    ? { w: Math.ceil(previewHeight * (16 / 9)), h: previewHeight }
    : { w: previewWidth, h: Math.ceil(previewWidth * (9 / 16)) };

  const activeCaptionIdx = localClip.captions.findIndex(c => playhead >= c.startTime - localClip.startTime && playhead < c.endTime - localClip.startTime);

  /* Seek both the UI playhead and whichever real player is active. */
  const seekTo = (elapsed: number) => {
    const clamped = Math.max(0, Math.min(elapsed, trimEnd - trimStart));
    setPlayhead(clamped);
    if (ytId) { ytPlayerRef.current?.seekTo(trimStart + clamped, true); return; }
    if (videoRef.current) videoRef.current.currentTime = trimStart + clamped;
  };

  const handleSave = () => {
    onSave(localClip);
    onBack();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#0f172a', overflow: 'hidden' }}>
      {/* Editor topbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: '#1e293b', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onBack} style={{ padding: '7px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: '14px' }}>{localClip.title}</div>
            <div style={{ color: '#64748b', fontSize: '11px' }}>{project.name} · {fmtDuration(localClip.duration)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <ScoreBadge score={localClip.viralityScore} size="md" />
          <button onClick={() => setShowPublish(true)} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Share2 size={14} /> Publish
          </button>
          <button onClick={handleSave} style={{ padding: '8px 16px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Check size={14} /> Save
          </button>
        </div>
      </div>

      {/* Editor body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Center: video preview + timeline */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '24px', overflow: 'hidden' }}>
          {/* Phone/screen frame with video preview */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <div style={{ position: 'relative', width: `${previewWidth}px`, height: `${previewHeight}px`, borderRadius: '12px', overflow: 'hidden', background: localClip.thumbnailGradient, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', flexShrink: 0 }}>
              {/* Real video / YouTube player (IFrame API, chrome hidden) */}
              {ytId ? (
                <>
                  <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: ytCover.w, height: ytCover.h, pointerEvents: 'none' }}>
                    <div ref={ytContainerRef} style={{ width: '100%', height: '100%' }} />
                  </div>
                  {/* Poster overlay hides YouTube chrome (title bar, avatar, big play button) whenever paused */}
                  {!playing && (
                    <div onClick={() => ytReady && setPlaying(true)} style={{ position: 'absolute', inset: 0, cursor: ytReady ? 'pointer' : 'wait', background: '#000' }}>
                      <img src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} alt=""
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.15)' }}>
                        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(8px)', border: '2px solid rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: ytReady ? 1 : 0.5 }}>
                          <Play size={22} color="white" fill="white" />
                        </div>
                      </div>
                    </div>
                  )}
                  {/* While playing, we own the surface: click pauses, and YouTube hover UI never triggers */}
                  {playing && <div onClick={() => setPlaying(false)} style={{ position: 'absolute', inset: 0, cursor: 'pointer' }} />}
                </>
              ) : project.sourceBlobUrl ? (
                <video
                  ref={videoRef}
                  src={project.sourceBlobUrl}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  playsInline
                  muted={false}
                  preload="auto"
                  onLoadedMetadata={handleVideoLoaded}
                  onTimeUpdate={handleTimeUpdate}
                />
              ) : null}
              {/* Play/pause overlay — only for non-YouTube (YouTube has its own controls) */}
              {!ytId && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: hasRealVideo ? 'none' : 'auto' }}>
                {!playing && (
                  <button onClick={() => setPlaying(true)} style={{ pointerEvents: 'all', width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)', border: '2px solid rgba(255,255,255,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                    <Play size={22} fill="white" />
                  </button>
                )}
                {playing && (
                  <button onClick={() => setPlaying(false)} style={{ pointerEvents: 'all', width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)', border: '2px solid rgba(255,255,255,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                    <Pause size={22} />
                  </button>
                )}
              </div>
              )}

              {/* Active caption overlay */}
              {activeCaptionIdx >= 0 && (
                <div style={{ position: 'absolute', bottom: '16%', left: '8px', right: '8px', textAlign: 'center' }}>
                  <span style={{ display: 'inline-block', background: 'rgba(0,0,0,0.75)', color: 'white', fontSize: '13px', fontWeight: 800, padding: '4px 8px', borderRadius: '4px', lineHeight: 1.3 }}>
                    {localClip.captions[activeCaptionIdx]?.emoji} {localClip.captions[activeCaptionIdx]?.text}
                  </span>
                </div>
              )}

              {/* Aspect ratio label */}
              <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '3px', backdropFilter: 'blur(4px)' }}>
                {localClip.aspectRatio}
              </div>

              {/* Music indicator */}
              {localClip.musicTrack !== 'none' && (
                <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: '9px', fontWeight: 600, padding: '2px 6px', borderRadius: '3px', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Music size={8} /> {MUSIC_TRACKS.find(m => m.id === localClip.musicTrack)?.label}
                </div>
              )}
            </div>
          </div>

          {/* Timeline / trimmer */}
          <div style={{ width: '100%', maxWidth: '600px', background: '#1e293b', borderRadius: '12px', padding: '16px', flexShrink: 0 }}>
            {/* Playback controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '12px' }}>
              <button onClick={() => seekTo(0)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><SkipBack size={16} /></button>
              <button onClick={() => setPlaying(!playing)} style={{ width: '36px', height: '36px', borderRadius: '50%', border: 'none', background: INK, cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {playing ? <Pause size={16} /> : <Play size={16} fill="white" />}
              </button>
              <button onClick={() => { seekTo(trimEnd - trimStart); setPlaying(false); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><SkipForward size={16} /></button>
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>{fmtDuration(Math.floor(playhead))} / {fmtDuration(dur)}</span>
            </div>

            {/* Waveform + playhead */}
            <div style={{ position: 'relative', height: '48px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', overflow: 'hidden', cursor: 'pointer' }}
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect();
                seekTo(((e.clientX - rect.left) / rect.width) * dur);
              }}>
              {/* Waveform bars */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: '1px', padding: '0 2px' }}>
                {Array.from({ length: 80 }, (_, i) => {
                  const h = 20 + Math.sin(i * 0.4) * 10 + Math.sin(i * 1.2) * 8 + Math.random() * 12;
                  const active = i / 80 < playhead / dur;
                  return <div key={i} style={{ flex: 1, height: `${h}px`, borderRadius: '1px', background: active ? '#6366f1' : 'rgba(255,255,255,0.15)' }} />;
                })}
              </div>
              {/* Playhead line */}
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(playhead / dur) * 100}%`, width: '2px', background: 'white', pointerEvents: 'none' }} />
            </div>

            {/* Trim handles label */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
              <span style={{ fontSize: '11px', color: '#64748b' }}>Start: {fmtDuration(Math.floor(trimStart - clip.startTime))}</span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>Duration: {fmtDuration(Math.floor(trimEnd - trimStart))}</span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>End: {fmtDuration(Math.floor(trimEnd - clip.startTime))}</span>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div style={{ width: '320px', background: '#1e293b', borderLeft: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
          {/* Panel tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
            {([
              { id: 'details', icon: Edit2, label: 'Details' },
              { id: 'captions', icon: AlignLeft, label: 'Captions' },
              { id: 'audio', icon: Music, label: 'Audio' },
              { id: 'broll', icon: Film, label: 'B-Roll' },
              { id: 'publish', icon: Share2, label: 'Publish' },
            ] as const).map(tab => (
              <button key={tab.id} onClick={() => setActivePanel(tab.id)}
                style={{ flex: 1, padding: '12px 0', border: 'none', background: 'none', cursor: 'pointer', color: activePanel === tab.id ? '#6366f1' : '#64748b', borderBottom: `2px solid ${activePanel === tab.id ? '#6366f1' : 'transparent'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', transition: 'all 0.15s' }}>
                <tab.icon size={15} />
                <span style={{ fontSize: '10px', fontWeight: 600 }}>{tab.label}</span>
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {/* DETAILS PANEL */}
            {activePanel === 'details' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <p style={{ margin: 0, color: 'white', fontWeight: 700, fontSize: '13px' }}>Title & Description</p>
                  {localClip.language && (
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: localClip.language.toLowerCase() === 'english' ? 'rgba(34,197,94,0.15)' : 'rgba(99,102,241,0.15)', color: localClip.language.toLowerCase() === 'english' ? '#22c55e' : '#818cf8', fontWeight: 700 }}>
                      🌐 {localClip.language}
                    </span>
                  )}
                </div>

                {/* Original-language title/description */}
                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                    Title {localClip.language && localClip.language.toLowerCase() !== 'english' ? `(${localClip.language})` : ''}
                  </label>
                  <input value={localClip.title} onChange={e => set({ title: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '13px', outline: 'none', boxSizing: 'border-box', marginBottom: '10px' }} />
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                    Description {localClip.language && localClip.language.toLowerCase() !== 'english' ? `(${localClip.language})` : ''}
                  </label>
                  <textarea value={localClip.description} onChange={e => set({ description: e.target.value })} rows={4}
                    style={{ width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '12px', outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }} />
                </div>

                {/* English translation, only for non-English videos */}
                {localClip.language && localClip.language.toLowerCase() !== 'english' && (
                  <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '8px', padding: '12px' }}>
                    <p style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🇬🇧 English Translation</p>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>Title</label>
                    <input value={localClip.titleTranslated ?? ''} onChange={e => set({ titleTranslated: e.target.value })}
                      placeholder="English title translation"
                      style={{ width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '13px', outline: 'none', boxSizing: 'border-box', marginBottom: '10px' }} />
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>Description</label>
                    <textarea value={localClip.descriptionTranslated ?? ''} onChange={e => set({ descriptionTranslated: e.target.value })} rows={4}
                      placeholder="English description translation"
                      style={{ width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '12px', outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }} />
                  </div>
                )}
              </div>
            )}

            {/* CAPTIONS PANEL */}
            {activePanel === 'captions' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <p style={{ margin: 0, color: 'white', fontWeight: 700, fontSize: '13px' }}>Auto-Captions</p>
                  <button style={{ fontSize: '11px', padding: '4px 8px', background: '#6366f120', color: '#6366f1', border: '1px solid #6366f130', borderRadius: '5px', cursor: 'pointer' }}>
                    <RefreshCw size={10} style={{ marginRight: '3px', verticalAlign: 'middle' }} /> Regenerate
                  </button>
                </div>

                {/* Caption style */}
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '10px', marginBottom: '14px' }}>
                  <p style={{ margin: '0 0 8px', color: '#94a3b8', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Style</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Position</label>
                      <select style={{ width: '100%', padding: '5px 7px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px', color: 'white', fontSize: '12px' }}
                        value={localClip.captions[0]?.style?.position ?? 'bottom'}
                        onChange={e => {
                          const pos = e.target.value as 'top' | 'middle' | 'bottom';
                          set({ captions: localClip.captions.map(c => ({ ...c, style: { ...c.style, position: pos } })) });
                        }}>
                        <option value="top">Top</option>
                        <option value="middle">Middle</option>
                        <option value="bottom">Bottom</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>Font Size</label>
                      <input type="number" min={14} max={36} defaultValue={22}
                        style={{ width: '100%', padding: '5px 7px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px', color: 'white', fontSize: '12px', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                </div>

                {/* Caption lines */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {localClip.captions.map((cap, i) => (
                    <div key={cap.id} style={{ background: activeCaptionIdx === i ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)', borderRadius: '6px', padding: '8px 10px', border: `1px solid ${activeCaptionIdx === i ? '#6366f140' : 'transparent'}` }}>
                      {editingCapIdx === i ? (
                        <div>
                          <input autoFocus value={cap.text} onChange={e => {
                            const caps = [...localClip.captions];
                            caps[i] = { ...caps[i], text: e.target.value };
                            set({ captions: caps });
                          }} onBlur={() => setEditingCapIdx(null)}
                            style={{ width: '100%', background: '#0f172a', border: '1px solid #6366f1', borderRadius: '4px', padding: '4px 6px', color: 'white', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px' }}>{fmtDuration(Math.floor(cap.startTime - clip.startTime))}</div>
                            <div style={{ fontSize: '12px', color: 'white', fontWeight: cap.highlighted ? 700 : 400 }}>{cap.emoji} {cap.text}</div>
                          </div>
                          <button onClick={() => setEditingCapIdx(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', flexShrink: 0 }}><Edit2 size={11} /></button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AUDIO PANEL */}
            {activePanel === 'audio' && (
              <div>
                {/* Aspect ratio */}
                <div style={{ marginBottom: '20px' }}>
                  <p style={{ color: 'white', fontWeight: 700, fontSize: '13px', margin: '0 0 10px' }}>Aspect Ratio</p>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {([['9:16', 'Portrait', Smartphone], ['1:1', 'Square', SquareIcon], ['16:9', 'Landscape', MonitorPlay]] as const).map(([r, label, Icon]) => (
                      <button key={r} onClick={() => set({ aspectRatio: r })}
                        style={{ flex: 1, padding: '10px 6px', borderRadius: '8px', border: `2px solid ${localClip.aspectRatio === r ? '#6366f1' : 'rgba(255,255,255,0.08)'}`, background: localClip.aspectRatio === r ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <Icon size={16} color={localClip.aspectRatio === r ? '#6366f1' : '#64748b'} />
                        <span style={{ fontSize: '10px', color: localClip.aspectRatio === r ? '#6366f1' : '#64748b', fontWeight: 600 }}>{r}</span>
                        <span style={{ fontSize: '9px', color: '#475569' }}>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Background music */}
                <div style={{ marginBottom: '20px' }}>
                  <p style={{ color: 'white', fontWeight: 700, fontSize: '13px', margin: '0 0 10px' }}>Background Music</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {MUSIC_TRACKS.map(track => (
                      <button key={track.id} onClick={() => set({ musicTrack: track.id })}
                        style={{ padding: '10px 12px', borderRadius: '7px', border: `1px solid ${localClip.musicTrack === track.id ? '#6366f1' : 'rgba(255,255,255,0.08)'}`, background: localClip.musicTrack === track.id ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: localClip.musicTrack === track.id ? '#a5b4fc' : '#94a3b8', fontSize: '12px', textAlign: 'left' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {localClip.musicTrack === track.id && track.id !== 'none' ? <Volume2 size={12} color="#6366f1" /> : track.id === 'none' ? <VolumeX size={12} /> : <Music size={12} />}
                          {track.label}
                        </span>
                        {localClip.musicTrack === track.id && <Check size={12} color="#6366f1" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* AI Voiceover */}
                <div>
                  <p style={{ color: 'white', fontWeight: 700, fontSize: '13px', margin: '0 0 10px' }}>AI Voiceover</p>
                  <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>Replace original audio with AI voice</span>
                      <button onClick={() => set({ hasVoiceover: !localClip.hasVoiceover })}
                        style={{ width: '36px', height: '20px', borderRadius: '10px', background: localClip.hasVoiceover ? '#6366f1' : 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.15s' }}>
                        <div style={{ width: '16px', height: '16px', borderRadius: '8px', background: 'white', position: 'absolute', top: '2px', left: localClip.hasVoiceover ? '18px' : '2px', transition: 'left 0.15s' }} />
                      </button>
                    </div>
                    {localClip.hasVoiceover && (
                      <div>
                        <select style={{ width: '100%', padding: '7px 9px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '12px', marginBottom: '8px' }}>
                          <option>Sarah (Natural Female)</option>
                          <option>James (Deep Male)</option>
                          <option>Emma (British Female)</option>
                          <option>Marcus (Energetic Male)</option>
                        </select>
                        <button style={{ width: '100%', padding: '8px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <Mic size={12} /> Generate Voiceover
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* B-ROLL PANEL */}
            {activePanel === 'broll' && (
              <div>
                <p style={{ color: 'white', fontWeight: 700, fontSize: '13px', margin: '0 0 12px' }}>B-Roll Library</p>
                <div style={{ position: 'relative', marginBottom: '12px' }}>
                  <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                  <input value={brollSearch} onChange={e => setBrollSearch(e.target.value)} placeholder="Search footage..."
                    style={{ width: '100%', padding: '8px 8px 8px 30px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', color: 'white', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                </div>

                {/* Added B-roll */}
                {localClip.broll.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <p style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>Added</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {localClip.broll.map(b => (
                        <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(99,102,241,0.1)', borderRadius: '6px', padding: '6px 8px', border: '1px solid rgba(99,102,241,0.2)' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '4px', background: b.thumbnail, flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: '11px', color: '#a5b4fc' }}>{b.title}</span>
                          <button onClick={() => set({ broll: localClip.broll.filter(x => x.id !== b.id) })} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><X size={12} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {filteredBroll.map(b => {
                    const isAdded = localClip.broll.some(x => x.id === b.id);
                    return (
                      <button key={b.id} onClick={() => {
                        if (isAdded) set({ broll: localClip.broll.filter(x => x.id !== b.id) });
                        else set({ broll: [...localClip.broll, b] });
                      }}
                        style={{ padding: 0, border: `2px solid ${isAdded ? '#6366f1' : 'transparent'}`, borderRadius: '7px', overflow: 'hidden', cursor: 'pointer', background: 'none', textAlign: 'left' }}>
                        <div style={{ height: '60px', background: b.thumbnail, position: 'relative' }}>
                          {isAdded && (
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(99,102,241,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Check size={16} color="white" />
                            </div>
                          )}
                          <div style={{ position: 'absolute', bottom: '3px', right: '4px', fontSize: '9px', color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>{b.duration}s</div>
                        </div>
                        <div style={{ padding: '4px 6px', background: 'rgba(255,255,255,0.04)' }}>
                          <div style={{ fontSize: '10px', color: '#94a3b8', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{b.title}</div>
                          <div style={{ fontSize: '9px', color: '#64748b' }}>{b.source}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PUBLISH PANEL */}
            {activePanel === 'publish' && (
              <div>
                <p style={{ color: 'white', fontWeight: 700, fontSize: '13px', margin: '0 0 14px' }}>Publishing Status</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                  {PLATFORMS.map(pl => {
                    const published = localClip.publishedTo.find(p => p.platform === pl.id);
                    return (
                      <div key={pl.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '10px 12px', border: `1px solid ${published ? pl.color + '40' : 'rgba(255,255,255,0.06)'}` }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: pl.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: 'white', flexShrink: 0 }}>
                          {pl.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', color: 'white', fontWeight: 600 }}>{pl.label}</div>
                          {published ? (
                            <div style={{ fontSize: '10px', color: published.status === 'published' ? '#22c55e' : '#f59e0b', fontWeight: 600 }}>
                              {published.status === 'published' ? '✓ Published' : `Scheduled: ${published.scheduledAt ? new Date(published.scheduledAt).toLocaleDateString() : 'pending'}`}
                            </div>
                          ) : (
                            <div style={{ fontSize: '10px', color: '#64748b' }}>Not published</div>
                          )}
                        </div>
                        <button onClick={() => setShowPublish(true)} style={{ padding: '5px 10px', background: published ? 'rgba(255,255,255,0.06)' : pl.color, color: 'white', border: 'none', borderRadius: '5px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                          {published ? 'Update' : 'Publish'}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '12px' }}>
                  <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>Export</p>
                  <button
                    onClick={handleDownload}
                    disabled={exporting}
                    style={{ width: '100%', padding: '10px 12px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', cursor: exporting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', color: 'white', opacity: exporting ? 0.6 : 1 }}>
                    <Download size={14} color="#94a3b8" />
                    <div style={{ textAlign: 'left', flex: 1 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600 }}>{exporting ? `Exporting… ${exportPct}%` : canRealExport ? 'Download HD (1080p)' : 'Download clip (1080p)'}</div>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>
                        {`${localClip.aspectRatio === '9:16' ? '1080×1920' : localClip.aspectRatio === '1:1' ? '1080×1080' : '1920×1080'} · ${canRealExport ? 'exact crop + burned-in captions' : 'motion render (thumbnail + captions)'}`}
                      </div>
                    </div>
                  </button>
                  {exporting && (
                    <div style={{ height: '5px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
                      <div style={{ height: '100%', width: `${exportPct}%`, background: '#6366f1', borderRadius: '3px', transition: 'width 0.2s' }} />
                    </div>
                  )}
                  <button disabled title="Coming soon — requires a real source file path, not available for browser uploads yet"
                    style={{ width: '100%', padding: '10px 12px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: '8px', color: 'white', opacity: 0.4 }}>
                    <Layers size={14} color="#94a3b8" />
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600 }}>Export XML</div>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>Premiere Pro / DaVinci — coming soon</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showPublish && <PublishModal clip={localClip} onClose={() => setShowPublish(false)} onPublish={handlePublish} />}
    </div>
  );
}

/* ── Project View ── */
function ProjectView({ project, onBack, onEditClip, onRetry, onUseDemo }: { project: VideoProject; onBack: () => void; onEditClip: (clip: VideoClip) => void; onRetry: () => void; onUseDemo: () => void }) {
  const { updateVideoProject, updateVideoClip, trashVideoClip, restoreVideoClip, deleteVideoClip, addNotification } = useApp();
  const [sortBy, setSortBy] = useState<'virality' | 'duration' | 'date'>('virality');
  const [filterFocus, setFilterFocus] = useState<'all' | 'emotional' | 'educational' | 'funny'>('all');
  const [showTrash, setShowTrash] = useState(false);
  const [publishClip, setPublishClip] = useState<VideoClip | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(project.name);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [exportingAll, setExportingAll] = useState(false);
  const [exportAllStatus, setExportAllStatus] = useState('');

  const clips = [...project.clips]
    .filter(c => filterFocus === 'all' || c.focus === filterFocus)
    .sort((a, b) => {
      if (sortBy === 'virality') return b.viralityScore - a.viralityScore;
      if (sortBy === 'duration') return a.duration - b.duration;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const likedCount = project.clips.filter(c => c.status === 'liked').length;
  const avgScore = project.clips.length ? Math.round(project.clips.reduce((s, c) => s + c.viralityScore, 0) / project.clips.length) : 0;

  const handleExportAll = async () => {
    if (!canExportVideo()) {
      addNotification('Your browser does not support in-browser video export. Try Chrome or Edge.', 'error');
      return;
    }
    setExportingAll(true);
    let done = 0;
    for (const clip of clips) {
      setExportAllStatus(`Exporting ${done + 1}/${clips.length}: ${clip.title}`);
      try {
        await downloadClip(clip, project, () => {});
        done++;
      } catch (err) {
        addNotification(`Failed to export "${clip.title}": ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
      }
    }
    setExportingAll(false);
    setExportAllStatus('');
    addNotification(`Exported ${done} of ${clips.length} clips.`, done > 0 ? 'success' : 'error');
  };

  const handleDuplicate = (clip: VideoClip) => {
    const dup: VideoClip = { ...clip, id: `clip-dup-${Date.now()}`, title: `${clip.title} (copy)`, createdAt: new Date().toISOString() };
    updateVideoProject(project.id, { clips: [...project.clips, dup] });
    addNotification('Clip duplicated');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header title={project.name} subtitle={`${fmtLongDuration(project.duration)} · ${project.clips.length} clips generated${project.language ? ` · 🌐 ${project.language}` : ''}`} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {/* Project header bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '13px', color: '#374151', fontWeight: 500 }}>
              <ArrowLeft size={14} /> All Projects
            </button>
            {/* Stats pills */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { label: 'Clips', value: project.clips.length },
                { label: 'Liked', value: likedCount, color: '#ec4899' },
                { label: 'Avg Score', value: avgScore, color: viralityColor(avgScore) },
              ].map(s => (
                <div key={s.label} style={{ padding: '4px 10px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: s.color ?? '#374151' }}>{s.value}</span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={() => setShowTrash(!showTrash)} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', background: showTrash ? '#fef2f2' : 'white', color: showTrash ? '#dc2626' : '#64748b', cursor: 'pointer', fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Trash2 size={13} /> Trash ({project.trashedClips.length})
            </button>
            <button onClick={handleExportAll} disabled={exportingAll || project.status !== 'ready' || clips.length === 0}
              title="Download every clip as a video file"
              style={{ padding: '8px 14px', background: INK, color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: (exportingAll || clips.length === 0) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '5px', opacity: (exportingAll || clips.length === 0) ? 0.6 : 1 }}>
              <Download size={13} /> {exportingAll ? 'Exporting…' : 'Export All'}
            </button>
          </div>
        </div>

        {exportingAll && (
          <div style={{ padding: '8px 14px', background: '#f5f3ff', border: '1px solid #e0e7ff', borderRadius: '8px', marginBottom: '16px', fontSize: '12px', color: '#4f46e5', fontWeight: 500 }}>
            {exportAllStatus}
          </div>
        )}

        {project.status !== 'ready' ? (
          <ProcessingScreen project={project} onRetry={onRetry} onUseDemo={onUseDemo} />
        ) : project.isDemo ? (
          <div style={{ padding: '10px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={14} />
            <strong>Demo mode:</strong> these are sample clips for previewing the workflow — not analyzed from the actual video. Upload your own video (with a Gemini key configured) for real AI analysis. You can still edit and download these.
          </div>
        ) : null}
        {project.status === 'ready' && (showTrash ? (
          /* TRASH VIEW */
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Trashed Clips</h3>
              {project.trashedClips.length > 0 && (
                <button style={{ fontSize: '12px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Delete All Permanently</button>
              )}
            </div>
            {project.trashedClips.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                <Trash2 size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                <p style={{ margin: 0, fontWeight: 600 }}>Trash is empty</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                {project.trashedClips.map(clip => (
                  <div key={clip.id} style={{ background: 'white', borderRadius: '10px', border: '1px solid #fee2e2', overflow: 'hidden', opacity: 0.8 }}>
                    <div style={{ height: '80px', background: clip.thumbnailGradient, opacity: 0.6 }} />
                    <div style={{ padding: '8px 10px' }}>
                      <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: 600, color: '#374151', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{clip.title}</p>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => restoreVideoClip(project.id, clip.id)} style={{ flex: 1, padding: '5px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '5px', color: '#16a34a', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Restore</button>
                        <button onClick={() => setDeleteConfirm(clip.id)} style={{ padding: '5px 7px', background: '#fff5f5', border: '1px solid #fee2e2', borderRadius: '5px', color: '#dc2626', cursor: 'pointer' }}><Trash2 size={11} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* CLIPS GRID */
          <>
            {/* Sort/filter bar */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>Sort:</span>
                {(['virality', 'duration', 'date'] as const).map(s => (
                  <button key={s} onClick={() => setSortBy(s)}
                    style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: sortBy === s ? '#6366f1' : 'white', color: sortBy === s ? 'white' : '#374151', fontSize: '12px', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize' }}>
                    {s}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>Focus:</span>
                {(['all', 'emotional', 'educational', 'funny'] as const).map(f => (
                  <button key={f} onClick={() => setFilterFocus(f)}
                    style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: filterFocus === f ? '#f5f3ff' : 'white', color: filterFocus === f ? '#6366f1' : '#374151', fontSize: '12px', fontWeight: filterFocus === f ? 600 : 400, cursor: 'pointer', textTransform: 'capitalize' }}>
                    {f}
                  </button>
                ))}
              </div>
              <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#94a3b8' }}>{clips.length} clip{clips.length !== 1 ? 's' : ''}</div>
            </div>

            {clips.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', border: '2px dashed #e2e8f0', borderRadius: '12px', color: '#94a3b8' }}>
                <Film size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                <p style={{ margin: 0, fontWeight: 600 }}>No clips match the filter</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
                {clips.map(clip => (
                  <ClipCard
                    key={clip.id}
                    clip={clip}
                    onEdit={() => onEditClip(clip)}
                    onLike={() => updateVideoClip(project.id, clip.id, { status: clip.status === 'liked' ? 'neutral' : 'liked' })}
                    onDislike={() => updateVideoClip(project.id, clip.id, { status: 'disliked' })}
                    onTrash={() => trashVideoClip(project.id, clip.id)}
                    onPublish={() => setPublishClip(clip)}
                    onDuplicate={() => handleDuplicate(clip)}
                    sourceBlobUrl={project.sourceBlobUrl}
                    sourceType={project.sourceType}
                    sourceUrl={project.sourceUrl}
                  />
                ))}
              </div>
            )}
          </>
        ))}
      </div>

      {publishClip && (
        <PublishModal
          clip={publishClip}
          onClose={() => setPublishClip(null)}
          onPublish={data => {
            updateVideoClip(project.id, publishClip.id, { publishedTo: [...publishClip.publishedTo.filter(p => p.platform !== data.platform), data] });
            addNotification(data.status === 'published' ? `Published to ${data.platform}!` : `Scheduled for ${data.platform}`);
            setPublishClip(null);
          }}
        />
      )}

      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', width: '340px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 8px' }}>Delete Permanently?</h4>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px' }}>This clip cannot be recovered.</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '13px', cursor: 'pointer', background: 'white' }}>Cancel</button>
              <button onClick={() => { deleteVideoClip(project.id, deleteConfirm); setDeleteConfirm(null); }} style={{ padding: '8px 16px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main Dashboard ── */
export default function VideoShorts() {
  const { videoProjects, addVideoProject, updateVideoProject, deleteVideoProject, updateVideoClip, addNotification } = useApp();
  const [view, setView] = useState<'dashboard' | 'project' | 'editor'>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const processingRefs = useRef<Map<string, number>>(new Map());
  // Always-current ref so timers can read latest state without stale closures
  const videoProjectsRef = useRef(videoProjects);
  useEffect(() => { videoProjectsRef.current = videoProjects; }, [videoProjects]);
  const updateVideoProjectRef = useRef(updateVideoProject);
  useEffect(() => { updateVideoProjectRef.current = updateVideoProject; }, [updateVideoProject]);
  const addNotificationRef = useRef(addNotification);
  useEffect(() => { addNotificationRef.current = addNotification; }, [addNotification]);

  const selectedProject = videoProjects.find(p => p.id === selectedProjectId) ?? null;
  const selectedClip = selectedProject?.clips.find(c => c.id === selectedClipId) ?? null;

  /* ── Processing simulation ── */
  const startProcessing = useCallback((projectId: string, fromProgress = 0) => {
    // Resume from the right step so page-navigation doesn't restart from 0
    let stepIdx = Math.max(0, PROCESSING_STEPS.findIndex(s => s.pct > fromProgress));
    const tick = () => {
      const step = PROCESSING_STEPS[stepIdx];
      if (!step) return;
      updateVideoProjectRef.current(projectId, { progress: step.pct, processingStep: step.label });
      if (step.pct >= 100) {
        processingRefs.current.delete(projectId);
        // Use the always-current ref so we never get stale videoProjects
        const project = videoProjectsRef.current.find(p => p.id === projectId);
        if (project) {
          const clips = generateClips({ ...project, status: 'ready', progress: 100 });
          updateVideoProjectRef.current(projectId, { status: 'ready', progress: 100, processingStep: 'Done!', clips, isDemo: true });
        } else {
          updateVideoProjectRef.current(projectId, { status: 'ready', progress: 100, processingStep: 'Done! Your clips are ready.', isDemo: true });
        }
        addNotificationRef.current('Sample clips generated — preview, edit, and download them. Upload your own video for real AI analysis.', 'info');
        return;
      }
      stepIdx++;
      const delay = 260 + Math.random() * 180;
      const timer = window.setTimeout(tick, delay);
      processingRefs.current.set(projectId, timer);
    };
    const timer = window.setTimeout(tick, 200);
    processingRefs.current.set(projectId, timer);
  }, []);

  /* Cleanup timers on unmount */
  useEffect(() => {
    return () => { processingRefs.current.forEach(t => clearTimeout(t)); };
  }, []);

  /* Resume processing for any in-progress projects on mount.
     Runs after the cleanup in StrictMode, so guard with a flag. */
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      videoProjectsRef.current.forEach(p => {
        if ((p.status === 'processing' || p.status === 'uploading') && !processingRefs.current.has(p.id)) {
          startProcessing(p.id, p.progress);
        }
      });
    }, 100);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [startProcessing]);

  /* ── Real Gemini processing ── */
  const processWithGemini = useCallback(async (
    projectId: string,
    source: { type: 'upload' | 'youtube' | 'url'; url?: string; file?: File }
  ) => {
    const upd = (patch: Partial<VideoProject>) => updateVideoProjectRef.current(projectId, patch);
    try {
      let fileUri: string;
      // null mimeType = YouTube URL (Gemini's YouTube understanding rejects a mimeType on the part)
      let mimeType: string | null = 'video/mp4';

      if (source.type === 'upload' && source.file) {
        upd({ status: 'uploading', progress: 8, processingStep: 'Uploading video to Gemini AI...' });
        fileUri = await uploadFileToGemini(source.file);
        mimeType = source.file.type || 'video/mp4';
        upd({ progress: 30, processingStep: 'Video uploaded — AI analyzing content...' });
        await waitForFileActive(fileUri);
      } else if (source.type === 'youtube' && source.url) {
        if (!getYouTubeId(source.url)) {
          throw new Error('That doesn\'t look like a valid YouTube URL.');
        }
        fileUri = source.url;
        mimeType = null;
        upd({ status: 'processing', progress: 25, processingStep: 'Fetching video from YouTube...' });
      } else if (source.type === 'url' && source.url) {
        // Gemini's fileData.fileUri only reliably supports YouTube URLs and File API
        // URIs — arbitrary direct video URLs must be fetched client-side and
        // re-uploaded through the File API, same as a local upload.
        upd({ status: 'uploading', progress: 10, processingStep: 'Fetching video from URL...' });
        let blob: Blob;
        try {
          const res = await fetch(source.url, { mode: 'cors' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          blob = await res.blob();
        } catch {
          throw new Error('Could not download the video from that URL (likely blocked by CORS). Please download the file and upload it directly instead.');
        }
        const file = new File([blob], source.url.split('/').pop() || 'video.mp4', { type: blob.type || 'video/mp4' });
        upd({ progress: 20, processingStep: 'Uploading video to Gemini AI...' });
        fileUri = await uploadFileToGemini(file);
        mimeType = file.type || 'video/mp4';
        upd({ progress: 32, processingStep: 'Video uploaded — AI analyzing content...' });
        await waitForFileActive(fileUri);
      } else {
        throw new Error('No video source provided');
      }

      upd({ status: 'processing', progress: 45, processingStep: 'Finding viral moments...' });
      const project = videoProjectsRef.current.find(p => p.id === projectId);
      if (!project) throw new Error('Project not found');

      const analysis = await analyzeVideoWithGemini(fileUri, mimeType, project.settings);
      if (!analysis.clips || analysis.clips.length === 0) {
        throw new Error('The AI could not find any clip-worthy moments in this video. Try a longer or more eventful video.');
      }

      upd({ progress: 80, processingStep: 'Generating captions & scoring virality...' });
      await new Promise(r => setTimeout(r, 600));

      const clips = geminiClipsToVideoClips(analysis, project);
      const realDuration = analysis.totalDuration > 0 ? analysis.totalDuration : project.duration;

      upd({
        status: 'ready',
        progress: 100,
        processingStep: 'Done! Your clips are ready.',
        clips,
        duration: realDuration,
        language: analysis.videoLanguage || 'English',
        error: undefined,
        isDemo: false,
      });
      addNotificationRef.current(`AI Shorts ready! ${clips.length} clips generated from your video.`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Gemini]', msg);
      upd({ status: 'failed', processingStep: 'Failed', error: msg });
      addNotificationRef.current(`AI processing failed: ${msg}`, 'error');
    }
  }, []);

  /** Reconstructs the original source (file/url) from a stored project so it can be reprocessed. */
  const retryProcessing = useCallback(async (projectId: string) => {
    const project = videoProjectsRef.current.find(p => p.id === projectId);
    if (!project) return;
    updateVideoProjectRef.current(projectId, { status: 'uploading', progress: 0, processingStep: 'Retrying...', error: undefined });
    try {
      if (project.sourceType === 'upload' && project.sourceBlobUrl) {
        const blob = await fetch(project.sourceBlobUrl).then(r => r.blob());
        const file = new File([blob], project.sourceName || 'video.mp4', { type: blob.type || 'video/mp4' });
        await processWithGemini(projectId, { type: 'upload', file });
      } else {
        await processWithGemini(projectId, { type: project.sourceType, url: project.sourceUrl });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      updateVideoProjectRef.current(projectId, { status: 'failed', processingStep: 'Failed', error: msg });
    }
  }, [processWithGemini]);

  const handleNewProject = (name: string, source: { type: 'upload' | 'youtube' | 'url'; url?: string; file?: File; duration: number }, forceDemo = false) => {
    const id = `proj-${Date.now()}`;
    const blobUrl = source.file ? URL.createObjectURL(source.file) : undefined;
    const project: VideoProject = {
      id, name,
      sourceType: source.type,
      sourceName: source.url ?? name,
      sourceUrl: source.url,
      sourceBlobUrl: blobUrl,
      duration: source.duration,
      thumbnailGradient: GRADIENTS[videoProjects.length % GRADIENTS.length] as string,
      status: 'uploading',
      progress: 0,
      processingStep: 'Starting...',
      clips: [],
      trashedClips: [],
      settings: { maxClipDuration: 60, focus: 'all', aspectRatio: '9:16', autoCaption: true },
      totalViews: 0,
      createdAt: new Date().toISOString(),
    };
    addVideoProject(project);
    // Immediately seed the ref so processWithGemini / startProcessing can find it before React flushes
    videoProjectsRef.current = [project, ...videoProjectsRef.current];
    setShowUpload(false);
    setSelectedProjectId(id);
    setView('project');

    if (hasGeminiKey() && !forceDemo) {
      processWithGemini(id, source);
    } else {
      startProcessing(id, 0);
    }
  };

  /* One-click demo: create a project from a real public YouTube video and
     generate sample shorts immediately. Always uses the demo generator (not
     Gemini) so it works instantly and reliably regardless of API key or
     YouTube-ingestion limits. */
  const handleTryExample = () => {
    handleNewProject(EXAMPLE_VIDEO.name, {
      type: 'youtube',
      url: EXAMPLE_VIDEO.url,
      duration: EXAMPLE_VIDEO.duration,
    }, true);
  };

  /* Fallback when real AI analysis fails (e.g. Gemini quota exhausted): generate
     sample clips so the user still gets a usable, editable, downloadable result. */
  const handleUseDemo = useCallback((projectId: string) => {
    const timer = processingRefs.current.get(projectId);
    if (timer) { clearTimeout(timer); processingRefs.current.delete(projectId); }
    updateVideoProjectRef.current(projectId, { status: 'processing', progress: 0, processingStep: 'Generating sample clips...', error: undefined });
    startProcessing(projectId, 0);
  }, [startProcessing]);

  /* Stats */
  const totalClips = videoProjects.reduce((s, p) => s + p.clips.length, 0);
  const avgScore = totalClips > 0
    ? Math.round(videoProjects.reduce((s, p) => s + p.clips.reduce((ss, c) => ss + c.viralityScore, 0), 0) / totalClips)
    : 0;
  const totalViews = videoProjects.reduce((s, p) => s + p.totalViews, 0);
  const publishedCount = videoProjects.reduce((s, p) => s + p.clips.filter(c => c.publishedTo.some(pub => pub.status === 'published')).length, 0);

  /* ── Render: Editor ── */
  if (view === 'editor' && selectedProject && selectedClip) {
    return (
      <ClipEditor
        clip={selectedClip}
        project={selectedProject}
        onBack={() => setView('project')}
        onSave={updates => {
          updateVideoClip(selectedProject.id, selectedClip.id, updates);
          addNotification('Clip saved!');
        }}
      />
    );
  }

  /* ── Render: Project ── */
  if (view === 'project' && selectedProject) {
    return (
      <ProjectView
        project={selectedProject}
        onBack={() => setView('dashboard')}
        onEditClip={clip => { setSelectedClipId(clip.id); setView('editor'); }}
        onRetry={() => retryProcessing(selectedProject.id)}
        onUseDemo={() => handleUseDemo(selectedProject.id)}
      />
    );
  }

  /* ── Render: Dashboard ── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header title="AI Shorts Engine" subtitle="Turn long-form videos into viral short clips automatically" />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
          {[
            { label: 'Total Projects', value: videoProjects.length, icon: Film, color: '#6366f1' },
            { label: 'Clips Generated', value: totalClips, icon: Scissors, color: '#8b5cf6' },
            { label: 'Avg Virality Score', value: avgScore ? `${avgScore}/100` : '—', icon: Zap, color: viralityColor(avgScore || 0) },
            { label: 'Published Clips', value: publishedCount, icon: Share2, color: '#22c55e' },
          ].map(stat => (
            <div key={stat.label} style={{ background: 'white', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e2e8f0', display: 'flex', gap: '14px', alignItems: 'center' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: `${stat.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <stat.icon size={22} color={stat.color} />
              </div>
              <div>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 4px', fontWeight: 500 }}>{stat.label}</p>
                <p style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{stat.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>Your Projects</h2>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button onClick={handleTryExample}
              style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 16px', background: 'white', color: INK, border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              <Play size={14} fill={INK} /> Try example video
            </button>
            <button onClick={() => setShowUpload(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: INK, color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(23,25,28,0.25)' }}>
              <Plus size={16} /> New Project
            </button>
          </div>
        </div>

        {/* Project grid */}
        {videoProjects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 40px', border: '2px dashed #e2e8f0', borderRadius: '16px', color: '#94a3b8' }}>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>✂️</div>
            <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#374151', margin: '0 0 8px' }}>No projects yet</h3>
            <p style={{ fontSize: '14px', margin: '0 0 24px', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>
              Upload a webinar, podcast, Zoom recording, or YouTube video and let AI generate viral short clips automatically.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '24px' }}>
              {['Webinars', 'Podcasts', 'YouTube Videos', 'Zoom Calls', 'Interviews', 'Tutorials'].map(t => (
                <span key={t} style={{ padding: '6px 12px', background: '#f1f2f4', color: INK, borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>{t}</span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={handleTryExample}
                style={{ padding: '12px 24px', background: INK, color: 'white', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Play size={16} fill="white" /> Try with an example video
              </button>
              <button onClick={() => setShowUpload(true)}
                style={{ padding: '12px 24px', background: 'white', color: INK, border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '15px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Upload size={16} /> Upload your own
              </button>
            </div>
            <p style={{ fontSize: '12px', color: MUTED, margin: '16px 0 0' }}>
              No API key needed — the example generates sample shorts you can preview, edit, and download.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '18px' }}>
            {videoProjects.map(project => {
              const likedCount = project.clips.filter(c => c.status === 'liked').length;
              const pubCount = project.clips.filter(c => c.publishedTo.some(p => p.status === 'published')).length;
              const avgV = project.clips.length
                ? Math.round(project.clips.reduce((s, c) => s + c.viralityScore, 0) / project.clips.length)
                : 0;

              return (
                <div key={project.id} style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                  onClick={() => { setSelectedProjectId(project.id); setView('project'); }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 24px rgba(0,0,0,0.1)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'}>
                  {/* Thumbnail */}
                  <div style={{ height: '140px', background: project.thumbnailGradient, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {project.status === 'ready' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {project.clips.slice(0, 3).map((c, i) => (
                          <div key={c.id} style={{ width: 48, height: 80, borderRadius: '6px', background: c.thumbnailGradient, border: '2px solid rgba(255,255,255,0.4)', transform: `rotate(${(i - 1) * 4}deg)`, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', flexShrink: 0 }} />
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '50%', border: '3px solid rgba(255,255,255,0.4)', borderTopColor: 'white', margin: '0 auto 8px', animation: 'spin 1s linear infinite' }} />
                        <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '12px', margin: 0, fontWeight: 600 }}>{project.processingStep}</p>
      </div>
                    )}
                    {/* Status badge */}
                    <div style={{ position: 'absolute', top: '10px', right: '10px', padding: '3px 9px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, backdropFilter: 'blur(4px)', background: project.status === 'ready' ? 'rgba(34,197,94,0.8)' : 'rgba(249,115,22,0.8)', color: 'white' }}>
                      {project.status === 'ready' ? '● Ready' : `${project.progress}%`}
                    </div>
                    {/* Duration */}
                    <div style={{ position: 'absolute', bottom: '10px', left: '10px', padding: '2px 7px', borderRadius: '4px', fontSize: '10px', color: 'rgba(255,255,255,0.9)', fontWeight: 600, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
                      {fmtLongDuration(project.duration)}
                    </div>
                    {/* Source type */}
                    <div style={{ position: 'absolute', bottom: '10px', right: '10px', padding: '2px 7px', borderRadius: '4px', fontSize: '10px', color: 'rgba(255,255,255,0.9)', fontWeight: 600, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      {project.sourceType === 'youtube' ? '▶' : project.sourceType === 'url' ? <Link size={9} /> : <Upload size={9} />}
                      {project.sourceType}
                    </div>
                  </div>

                  {/* Card content */}
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
                      <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>{project.name}</h3>
                      <button onClick={e => { e.stopPropagation(); setDeleteConfirm(project.id); }}
                        style={{ padding: '4px', border: 'none', background: 'none', cursor: 'pointer', color: '#cbd5e1', flexShrink: 0 }}
                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'}
                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#cbd5e1'}>
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                      {[
                        { label: 'Clips', value: project.clips.length, icon: '✂️' },
                        { label: 'Liked', value: likedCount, icon: '❤️' },
                        { label: 'Published', value: pubCount, icon: '📤' },
                      ].map(s => (
                        <div key={s.label} style={{ textAlign: 'center', padding: '6px', background: '#f8fafc', borderRadius: '6px' }}>
                          <div style={{ fontSize: '14px', marginBottom: '1px' }}>{s.icon}</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{s.value}</div>
                          <div style={{ fontSize: '10px', color: '#94a3b8' }}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {project.clips.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Zap size={12} color={viralityColor(avgV)} />
                          <span style={{ fontSize: '12px', fontWeight: 700, color: viralityColor(avgV) }}>Avg score: {avgV}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '-4px' }}>
                          {project.clips.slice(0, 4).map((c, i) => (
                            <div key={c.id} style={{ width: '20px', height: '20px', borderRadius: '50%', background: c.thumbnailGradient, border: '2px solid white', marginLeft: i > 0 ? '-6px' : 0, position: 'relative', zIndex: 4 - i }} />
                          ))}
                          {project.clips.length > 4 && <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#f1f5f9', border: '2px solid white', marginLeft: '-6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700, color: '#64748b' }}>+{project.clips.length - 4}</div>}
                        </div>
                      </div>
                    )}

                    <div style={{ marginTop: '10px', fontSize: '11px', color: '#94a3b8' }}>
                      {new Date(project.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Spinning animation style */}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onSubmit={handleNewProject} />}

      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', width: '360px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 8px' }}>Delete Project?</h4>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px' }}>All clips and settings will be permanently deleted. This cannot be undone.</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', background: 'white' }}>Cancel</button>
              <button onClick={() => { deleteVideoProject(deleteConfirm); setDeleteConfirm(null); }} style={{ padding: '9px 18px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
