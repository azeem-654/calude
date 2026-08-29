import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Scissors, Upload, Link, Play, Heart, Edit2, Trash2,
  Download, Share2, ArrowLeft, X, Check,
  Zap, Music, Mic, RefreshCw, Copy,
  Film, AlignLeft, SkipBack, SkipForward, Pause,
  Volume2, VolumeX, MoreHorizontal, Search, Layers,
  MonitorPlay, Smartphone, Square as SquareIcon, Send, Image as ImageIcon,
  Sparkles, Crop, Maximize2, Globe, FileText, Type, AlertCircle,
} from 'lucide-react';
import type { VideoProject, VideoClip, Caption, BRollClip, BrandPosition } from '../../types';
import { useApp } from '../../context/AppContext';
import Header, { Toasts } from '../Layout/Header';
import { hasGeminiKey, uploadFileToGemini, waitForFileActive, analyzeVideoWithGemini, generateHooks, translateClip, suggestBroll, generateScript } from '../../lib/gemini';
import type { GeminiAnalysis } from '../../lib/gemini';
import { exportClipToVideo, renderSyntheticClip, downloadBlob, canExportVideo, normalizeSegments, segmentsDuration } from '../../lib/videoExport';
import type { CaptionStyle, ExportResolution, SfxKind } from '../../lib/videoExport';
import { composeThumbnail, captureVideoFrame, downloadDataUrl, THUMB_PRESETS, THUMB_EMOJIS } from '../../lib/thumbnail';
import type { ThumbPreset } from '../../lib/thumbnail';
import ShortsFeed from './ShortsFeed';

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
      captionStyle: clip.captionStyle,
      focusX: clip.focusX,
      focusY: clip.focusY,
      enhanceSpeech: clip.enhanceSpeech,
      sfx: clip.sfx,
      music: clip.musicTrack,
      intro: clip.intro,
      outro: clip.outro,
      cardGradient: clip.thumbnailGradient,
      segments: clip.segments,
      brollImages: brollWindows(clip.broll ?? [], clip.duration),
      branding: brandingFromClip(clip),
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
    durationSec: clip.sceneImages?.length ? Math.min(clip.duration, 40) : Math.min(clip.duration, 15),
    backgroundImageUrl: ytId ? `${apiBase}/api/yt-thumb.php?id=${ytId}` : undefined,
    captionStyle: clip.captionStyle,
    sfx: clip.sfx,
    music: clip.musicTrack,
    intro: clip.intro,
    outro: clip.outro,
    sceneImages: clip.sceneImages,
    onProgress,
  });
  downloadBlob(result.blob, `${filename}.${result.fileExt}`);
}

/* ── Constants ── */

/* App "journey theme" tokens (monochrome). */
const INK = '#17191c';
const MUTED = '#8a8f98';

/** Sentinel error marking "no Gemini key configured" so the UI can offer a fix. */
const AI_KEY_MISSING = 'AI_KEY_MISSING';

/** Placement options offered for the logo and website/CTA overlays. */
const BRAND_POSITIONS: { id: BrandPosition; label: string; short: string }[] = [
  { id: 'top-left', label: 'Top left', short: '↖' },
  { id: 'top-center', label: 'Top center', short: '↑' },
  { id: 'top-right', label: 'Top right', short: '↗' },
  { id: 'bottom-left', label: 'Bottom left', short: '↙' },
  { id: 'bottom-center', label: 'Bottom center', short: '↓' },
  { id: 'bottom-right', label: 'Bottom right', short: '↘' },
];

/** Colour inputs need #rrggbb; brand backgrounds may be stored as rgba(). */
function hexFromRgba(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('#')) return value.slice(0, 7);
  const m = value.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!m) return undefined;
  return '#' + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('');
}

/** Collect a clip's logo/website overlay settings for the export renderer. */
function brandingFromClip(clip: VideoClip) {
  if (!clip.logoUrl && !clip.brandText?.trim()) return undefined;
  return {
    logoUrl: clip.logoUrl,
    logoPosition: clip.logoPosition,
    logoScale: clip.logoScale,
    logoOpacity: clip.logoOpacity,
    brandText: clip.brandText,
    brandTextPosition: clip.brandTextPosition,
    brandTextStyle: clip.brandTextStyle,
    brandTextColor: clip.brandTextColor,
    brandTextBg: clip.brandTextBg,
  };
}

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

const CAPTION_STYLES: { id: CaptionStyle; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'karaoke', label: 'Karaoke' },
  { id: 'bold', label: 'Bold Yellow' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'neon', label: 'Neon' },
];

const SFX_OPTIONS: { id: SfxKind; label: string; desc: string }[] = [
  { id: 'none', label: 'None', desc: 'No sound effect' },
  { id: 'riser', label: 'Riser', desc: 'Tension build at the start' },
  { id: 'whoosh', label: 'Whoosh', desc: 'Swoosh intro transition' },
  { id: 'pops', label: 'Pops', desc: 'Subtle pop on each caption' },
];

/* Social-platform size presets → the app's supported aspect ratios. */
const PLATFORM_PRESETS: { label: string; ratio: '9:16' | '1:1' | '16:9'; note: string }[] = [
  { label: 'Instagram Reel', ratio: '9:16', note: '1080×1920' },
  { label: 'Instagram Post', ratio: '1:1', note: '1080×1080' },
  { label: 'TikTok', ratio: '9:16', note: '1080×1920' },
  { label: 'YouTube Short', ratio: '9:16', note: '1080×1920' },
  { label: 'YouTube Video', ratio: '16:9', note: '1920×1080' },
  { label: 'Facebook Reel', ratio: '9:16', note: '1080×1920' },
  { label: 'Facebook Post', ratio: '1:1', note: '1080×1080' },
  { label: 'Facebook Ad', ratio: '1:1', note: '1080×1080' },
  { label: 'LinkedIn', ratio: '1:1', note: '1080×1080' },
];

const RESOLUTIONS: { id: ExportResolution; label: string }[] = [
  { id: '720p', label: '720p' },
  { id: '1080p', label: '1080p HD' },
  { id: '4k', label: '4K Upscale' },
];

/* AI Reframe: 3×3 focal-point grid. */
const FOCUS_POINTS = [0.15, 0.5, 0.85];

/* Auto background-music selection by the clip's mood/intent. */
function autoMusicForFocus(focus: 'emotional' | 'educational' | 'funny'): string {
  if (focus === 'emotional') return 'cinematic';
  if (focus === 'funny') return 'upbeat';
  return 'corporate'; // educational / default
}

/* Offline hook templates (used when no Gemini key / API unavailable). */
const HOOK_TEMPLATES = [
  'Wait for it…',
  'Nobody talks about this',
  "Here's what they don't tell you",
  'This changes everything',
  'Watch this before you scroll',
  "You're doing this wrong",
  'This took me years to learn',
  'The part at the end is wild',
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

/**
 * Build captions for a montage clip: each segment's OWN sentences are laid out
 * across that segment's window on the OUTPUT timeline (0..totalDur), so captions
 * match what's actually spoken in each stitched piece and never drift.
 */
function buildMontageCaptions(segments: { start: number; end: number; text?: string }[]): Caption[] {
  const caps: Caption[] = [];
  let outStart = 0;
  segments.forEach((seg, si) => {
    const len = seg.end - seg.start;
    const text = (seg.text ?? '').trim();
    if (text) {
      const words = text.split(/\s+/);
      const chunks: string[] = [];
      for (let i = 0; i < words.length; i += 4) chunks.push(words.slice(i, i + 4).join(' '));
      const per = len / Math.max(1, chunks.length);
      chunks.forEach((chunk, ci) => {
        caps.push({
          id: `cap-${si}-${ci}-${caps.length}`,
          startTime: outStart + ci * per,
          endTime: outStart + (ci + 1) * per,
          text: chunk,
          emoji: caps.length % 5 === 0 ? ['🔥', '💡', '🚀', '✨', '💪'][caps.length % 5] : undefined,
          highlighted: caps.length % 3 === 0,
          style: { fontSize: 22, color: '#ffffff', position: 'bottom' as const, fontWeight: '800' },
        });
      });
    }
    outStart += len;
  });
  return caps;
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
    // Demo montage: 3 segments from different parts of the source, each carrying
    // a COMPLETE sentence from the transcript so cuts land on sentence boundaries.
    const sentences = t.transcript.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
    const total = Math.max(dur, project.duration || dur);
    const anchors = [start, Math.min(total - 8, Math.round(total * 0.4)), Math.min(total - 8, Math.round(total * 0.72))];
    const picks = [0, Math.floor(sentences.length / 2), sentences.length - 1];
    const segments = anchors.map((a, k) => {
      const text = sentences[Math.min(picks[k], sentences.length - 1)] || t.transcript;
      // A touch longer so shorts have room to breathe (matches the "make it longer" ask).
      const segLen = Math.max(6, Math.min(11, Math.round(text.split(' ').length / 1.8)));
      return { start: Math.max(0, a), end: Math.max(0, a) + segLen, text };
    }).filter(s => s.end > s.start);
    const captions = buildMontageCaptions(segments);
    return {
      id: `clip-${project.id}-${i}`,
      projectId: project.id,
      title: t.title,
      description: `🔥 ${t.title}\n\n${t.transcript}\n\n👉 Save this for later!`,
      language: 'English',
      hashtags: ['#viral', '#shorts', '#tips', '#growth', '#mindset', `#${t.focus}`],
      startTime: start,
      endTime: start + dur,
      duration: Math.round(segments.reduce((s, sg) => s + (sg.end - sg.start), 0)) || dur,
      segments,
      thumbnailGradient: GRADIENTS[(i + 2) % GRADIENTS.length] as string,
      viralityScore: Math.max(55, t.score - Math.floor(Math.random() * 5)),
      transcript: t.transcript,
      captions,
      aspectRatio: ratio,
      status: 'neutral' as const,
      focus: t.focus,
      musicTrack: autoMusicForFocus(t.focus),
      musicAuto: true,
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
    const focus = (['emotional', 'educational', 'funny'] as const).includes(gc.focus as never)
      ? (gc.focus as 'emotional' | 'educational' | 'funny')
      : 'educational';
    const isEnglish = analysis.videoLanguage?.trim().toLowerCase() === 'english';
    // Montage segments cut from different parts of the source (falls back to the single span).
    // A small tail pad keeps the last word of each sentence from being clipped.
    const segments = (gc.segments ?? [])
      .filter(s => typeof s.start === 'number' && typeof s.end === 'number' && s.end > s.start)
      .map(s => ({ start: Math.max(0, s.start), end: s.end + 0.4, text: typeof s.text === 'string' ? s.text : undefined }));
    const isMontage = segments.length > 1;
    // Captions: montage → per-segment sentences on the output timeline (matches
    // what's actually said in each stitched piece). Single cut → source-time.
    const captions = isMontage && segments.some(s => s.text?.trim())
      ? buildMontageCaptions(segments)
      : generateCaptions(noSpeech ? (gc.description || gc.title) : gc.transcript, isMontage ? 0 : gc.startTime);
    const captionSource = noSpeech ? (gc.description || gc.title) : gc.transcript;
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
      duration: segments.length ? Math.round(segments.reduce((s, sg) => s + (sg.end - sg.start), 0)) : Math.max(dur, 5),
      segments: segments.length ? segments : undefined,
      thumbnailGradient: GRADIENTS[(i + 2) % GRADIENTS.length] as string,
      viralityScore: Math.min(99, Math.max(55, gc.viralityScore)),
      transcript: captionSource,
      captions,
      aspectRatio: project.settings.aspectRatio,
      status: 'neutral' as const,
      focus,
      musicTrack: autoMusicForFocus(focus),
      musicAuto: true,
      hasVoiceover: false,
      broll: [],
      publishedTo: [],
      views: 0,
      createdAt: new Date().toISOString(),
    };
  });
}

/* Editor side-panel ids (deep-linkable from the dashboard tools row). */
type EditorPanel = 'details' | 'thumb' | 'display' | 'captions' | 'audio' | 'broll' | 'brand' | 'publish';

const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:3001' : '';

/* Video Dubbing target languages (speechSynthesis codes for voice preview). */
const DUB_LANGUAGES: { name: string; code: string }[] = [
  { name: 'English', code: 'en' },
  { name: 'Spanish', code: 'es' },
  { name: 'French', code: 'fr' },
  { name: 'German', code: 'de' },
  { name: 'Portuguese', code: 'pt' },
  { name: 'Hindi', code: 'hi' },
  { name: 'Urdu', code: 'ur' },
  { name: 'Arabic', code: 'ar' },
  { name: 'Turkish', code: 'tr' },
];

/** Timed windows for AI image b-roll cutaways within a clip. */
function brollWindows(broll: BRollClip[], clipDuration: number): { url: string; start: number; end: number }[] {
  return broll.filter(b => b.imageUrl).slice(0, 6).map((b, i) => {
    const start = Math.min(2 + i * 4, Math.max(0.5, clipDuration - 3));
    return { url: b.imageUrl!, start, end: start + 2.5 };
  });
}

/* ── Auto thumbnails: a unique, click-optimized image per clip ── */
const YT_FRAME_VARIANTS = ['hq1', 'hq2', 'hq3', 'hqdefault'];

/** First few words of the title as a punchy thumbnail hook. */
function thumbHook(title: string): string {
  const words = title.replace(/["""]/g, '').split(/\s+/).filter(Boolean);
  return words.slice(0, 5).join(' ');
}

async function autoThumbnails(
  clips: VideoClip[],
  src: { sourceType: VideoProject['sourceType']; sourceUrl?: string; sourceBlobUrl?: string },
): Promise<VideoClip[]> {
  const ytId = src.sourceUrl ? getYouTubeId(src.sourceUrl) : null;
  const apiBase = import.meta.env.DEV ? 'http://localhost:3001' : '';
  const presets = THUMB_PRESETS.map(p => p.id);
  return Promise.all(clips.map(async (clip, i) => {
    try {
      let bgImageUrl: string | undefined;
      if (src.sourceBlobUrl && src.sourceType !== 'youtube') {
        // Real frame from inside this clip's own segment
        bgImageUrl = (await captureVideoFrame(src.sourceBlobUrl, clip.startTime + Math.min(2, clip.duration / 2))) ?? undefined;
      } else if (ytId) {
        // Rotate through YouTube's auto-generated frames so clips differ
        bgImageUrl = `${apiBase}/api/yt-thumb.php?id=${ytId}&f=${YT_FRAME_VARIANTS[i % YT_FRAME_VARIANTS.length]}`;
      }
      const thumbnailUrl = await composeThumbnail({
        bgImageUrl,
        gradient: clip.thumbnailGradient,
        headline: thumbHook(clip.title),
        emoji: THUMB_EMOJIS[i % THUMB_EMOJIS.length],
        preset: presets[i % presets.length],
        aspectRatio: clip.aspectRatio,
      });
      return { ...clip, thumbnailUrl };
    } catch { return clip; }
  }));
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

  // Composed custom thumbnail wins — unique and click-optimized per clip
  if (clip.thumbnailUrl) {
    return (
      <img
        src={clip.thumbnailUrl}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        alt=""
      />
    );
  }

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
function UploadModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (name: string, source: { type: 'upload' | 'youtube' | 'url'; url?: string; file?: File; duration: number; settings?: VideoProject['settings'] }) => void }) {
  const [tab, setTab] = useState<'upload' | 'youtube' | 'url'>('upload');
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [maxDur, setMaxDur] = useState<30 | 45 | 60>(60);
  const [focus, setFocus] = useState<'all' | 'emotional' | 'educational' | 'funny'>('all');
  const [ratio, setRatio] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * One gate for both ways in.
   *
   * Dragging a file in was checked; picking one through the browse dialog was
   * not — so a .txt file selected that way was accepted, named the project
   * after itself, and enabled "Generate AI Shorts". With a real Gemini key
   * configured it would have gone straight into the analysis pipeline.
   */
  const looksLikeVideo = (f: File) =>
    f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(f.name);

  const handleFile = (f: File) => {
    if (!looksLikeVideo(f)) {
      setFileError(`"${f.name}" is not a video. Choose an MP4, MOV, WebM, M4V, AVI or MKV file.`);
      return;
    }
    setFileError('');
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const canSubmit = (tab === 'upload' && file) || ((tab === 'youtube' || tab === 'url') && url.trim());

  const handleSubmit = async () => {
    if (!canSubmit) return;
    // URLs: real duration comes back from analysis. Uploads: read it from the file.
    let dur = 1800 + Math.floor(Math.random() * 3600);
    if (tab === 'upload' && file) {
      dur = await new Promise<number>(resolve => {
        const v = document.createElement('video');
        const objUrl = URL.createObjectURL(file);
        v.preload = 'metadata';
        v.onloadedmetadata = () => {
          const d = Math.round(v.duration || 0);
          URL.revokeObjectURL(objUrl);
          // Some recordings (e.g. MediaRecorder webm) report Infinity — fall back.
          resolve(Number.isFinite(d) && d > 0 ? d : 600);
        };
        v.onerror = () => { URL.revokeObjectURL(objUrl); resolve(600); };
        v.src = objUrl;
      });
    }
    onSubmit(name || 'My Video Project', {
      type: tab,
      url: tab !== 'upload' ? url : undefined,
      file: tab === 'upload' ? file ?? undefined : undefined,
      duration: dur,
      settings: { maxClipDuration: maxDur, focus, aspectRatio: ratio, autoCaption: true },
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
          {tab === 'upload' && fileError && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 12px', marginBottom: '16px', borderRadius: 9, backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}>
              <AlertCircle size={14} color="#dc2626" style={{ marginTop: 2, flexShrink: 0 }} />
              <p style={{ fontSize: 12.5, color: '#991b1b', margin: 0, lineHeight: 1.5 }}>{fileError}</p>
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
  const navigate = useNavigate();
  const stepIdx = PROCESSING_STEPS.findIndex(s => s.pct >= project.progress) ?? PROCESSING_STEPS.length - 1;
  const step = PROCESSING_STEPS[Math.max(0, stepIdx)];

  /* No AI key — the one blocker that makes clips irrelevant. Explain and fix it. */
  if (project.status === 'failed' && project.error === AI_KEY_MISSING) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '72px 40px', textAlign: 'center' }}>
        <div style={{ width: '80px', height: '80px', borderRadius: '20px', background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
          <Sparkles size={36} color="#c7f441" />
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px' }}>Connect AI to analyze this video</h2>
        <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 6px', maxWidth: '520px', lineHeight: 1.65 }}>
          AI Shorts needs a Google Gemini API key to actually watch your video and find the moments worth clipping.
        </p>
        <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 28px', maxWidth: '520px', lineHeight: 1.6 }}>
          Without it we won't invent clips — sample clips would have nothing to do with your video's content.
          A free key takes about 2 minutes to create.
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => navigate('/settings')}
            style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '11px 24px', background: INK, color: 'white', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
            <Sparkles size={15} color="#c7f441" /> Add API key in Settings
          </button>
          {onRetry && (
            <button onClick={onRetry} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '11px 24px', background: 'white', color: INK, border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
              <RefreshCw size={15} /> I've added it — retry
            </button>
          )}
          {onUseDemo && (
            <button onClick={onUseDemo} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '11px 24px', background: 'white', color: MUTED, border: '1px solid #e2e8f0', borderRadius: '9px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
              <Zap size={15} /> Just show me sample clips
            </button>
          )}
        </div>
      </div>
    );
  }

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
function ClipCard({ clip, onEdit, onEditThumb, onLike, onDislike, onTrash, onPublish, onDuplicate, sourceBlobUrl, sourceType, sourceUrl }: {
  clip: VideoClip;
  onEdit: () => void;
  onEditThumb: () => void;
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
                  { icon: ImageIcon, label: 'Edit thumbnail', action: () => { onEditThumb(); setShowMenu(false); } },
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

          <button onClick={handlePublish} disabled={mode === 'schedule' && !schedDate}
            style={{ width: '100%', padding: '12px', background: (mode === 'schedule' && !schedDate) ? '#c7cbd1' : `linear-gradient(135deg,${pl.color},${pl.color}cc)`, color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: (mode === 'schedule' && !schedDate) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Send size={15} /> {mode === 'now' ? `Publish to ${pl.label}` : schedDate ? `Schedule for ${schedDate}` : 'Pick a date to schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Clip Editor ── */
function ClipEditor({ clip, project, onBack, onSave, initialPanel }: { clip: VideoClip; project: VideoProject; onBack: () => void; onSave: (updates: Partial<VideoClip>) => void; initialPanel?: EditorPanel }) {
  const { addNotification } = useApp();
  const [localClip, setLocalClip] = useState(clip);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [activePanel, setActivePanel] = useState<EditorPanel>(initialPanel ?? 'details');
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
  const segIdxRef = useRef(0);

  // Montage segments (the clip plays these back-to-back on the output timeline).
  const segs = normalizeSegments(clip.segments, clip.startTime, clip.endTime);
  const isMontage = segs.length > 1;
  const segOutStart = segs.reduce<number[]>((acc, s, i) => { acc[i] = (acc[i - 1] ?? 0) + (i > 0 ? segs[i - 1].end - segs[i - 1].start : 0); return acc; }, []);
  const dur = isMontage ? segmentsDuration(segs) : localClip.duration;
  /** Map an output-timeline position (0..dur) to a source time. */
  const outToSource = (out: number): number => {
    let acc = 0;
    for (const s of segs) { const len = s.end - s.start; if (out < acc + len) return s.start + (out - acc); acc += len; }
    return segs[segs.length - 1].end;
  };
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
          playsinline: 1, start: Math.floor(segs[0].start), origin: window.location.origin,
        },
        events: {
          onReady: e => { if (!disposed) { segIdxRef.current = 0; e.target.seekTo(segs[0].start, true); e.target.pauseVideo(); setYtReady(true); } },
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

  /* Poll the YouTube player for the playhead; advance across montage segments. */
  useEffect(() => {
    if (!ytId || !ytReady) return;
    const int = window.setInterval(() => {
      const p = ytPlayerRef.current;
      if (!p) return;
      const t = p.getCurrentTime();
      if (isMontage) {
        const seg = segs[segIdxRef.current];
        setPlayhead(Math.max(0, Math.min(dur, segOutStart[segIdxRef.current] + (t - seg.start))));
        if (t >= seg.end - 0.1) {
          if (segIdxRef.current < segs.length - 1) { segIdxRef.current++; p.seekTo(segs[segIdxRef.current].start, true); }
          else { p.pauseVideo(); segIdxRef.current = 0; p.seekTo(segs[0].start, true); setPlaying(false); setPlayhead(0); }
        }
        return;
      }
      setPlayhead(Math.max(0, t - trimStart));
      if (t >= trimEnd) {
        p.pauseVideo();
        p.seekTo(trimStart, true);
        setPlaying(false);
        setPlayhead(0);
      }
    }, 250);
    return () => window.clearInterval(int);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytId, ytReady, trimStart, trimEnd, isMontage]);

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
          captionStyle: localClip.captionStyle,
          focusX: localClip.focusX,
          focusY: localClip.focusY,
          enhanceSpeech: localClip.enhanceSpeech,
          sfx: localClip.sfx,
          music: localClip.musicTrack,
          intro: localClip.intro,
          outro: localClip.outro,
          cardGradient: localClip.thumbnailGradient,
          resolution: exportRes,
          segments: localClip.segments,
          brollImages: brollWindows(localClip.broll ?? [], localClip.duration),
          branding: brandingFromClip(localClip),
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
          captionStyle: localClip.captionStyle,
          sfx: localClip.sfx,
          music: localClip.musicTrack,
          intro: localClip.intro,
          outro: localClip.outro,
          resolution: exportRes,
          sceneImages: localClip.sceneImages,
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

  // Seek real video to the montage's first segment (or trim start) when source loads
  const handleVideoLoaded = () => {
    segIdxRef.current = 0;
    if (videoRef.current) videoRef.current.currentTime = isMontage ? segs[0].start : trimStart;
  };

  // Update playhead from real video; advance across montage segments, stop at the end
  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    if (isMontage) {
      const seg = segs[segIdxRef.current];
      setPlayhead(Math.max(0, Math.min(dur, segOutStart[segIdxRef.current] + (v.currentTime - seg.start))));
      if (v.currentTime >= seg.end - 0.05) {
        if (segIdxRef.current < segs.length - 1) {
          segIdxRef.current++;
          v.currentTime = segs[segIdxRef.current].start;
        } else {
          v.pause();
          segIdxRef.current = 0;
          v.currentTime = segs[0].start;
          setPlaying(false);
          setPlayhead(0);
        }
      }
      return;
    }
    setPlayhead(Math.max(0, v.currentTime - trimStart));
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

  // AI Reframe: shift the crop window toward the chosen focal point.
  const focusX = localClip.focusX ?? 0.5;
  const focusY = localClip.focusY ?? 0.5;
  const ytShiftX = (0.5 - focusX) * Math.max(0, ytCover.w - previewWidth);
  const ytShiftY = (0.5 - focusY) * Math.max(0, ytCover.h - previewHeight);

  // Caption timing: montage captions are stored in OUTPUT time (per-segment
  // sentences), so match the playhead directly; single-cut clips use source time.
  const activeCaptionIdx = isMontage
    ? localClip.captions.findIndex(c => playhead >= c.startTime && playhead < c.endTime)
    : localClip.captions.findIndex(c => playhead >= c.startTime - localClip.startTime && playhead < c.endTime - localClip.startTime);

  /* Seek both the UI playhead and whichever real player is active. */
  const seekTo = (elapsed: number) => {
    const clamped = Math.max(0, Math.min(elapsed, dur));
    setPlayhead(clamped);
    if (isMontage) {
      // Map the output position back to a source time + the owning segment.
      let acc = 0, idx = 0;
      for (let i = 0; i < segs.length; i++) { const len = segs[i].end - segs[i].start; if (clamped < acc + len || i === segs.length - 1) { idx = i; break; } acc += len; }
      segIdxRef.current = idx;
      const src = outToSource(clamped);
      if (ytId) ytPlayerRef.current?.seekTo(src, true);
      else if (videoRef.current) videoRef.current.currentTime = src;
      return;
    }
    if (ytId) { ytPlayerRef.current?.seekTo(trimStart + clamped, true); return; }
    if (videoRef.current) videoRef.current.currentTime = trimStart + clamped;
  };

  /* ── Thumbnail editor state ── */
  const [thumbHeadline, setThumbHeadline] = useState(thumbHook(clip.title));
  const [thumbPreset, setThumbPreset] = useState<ThumbPreset>('bold');
  const [thumbEmoji, setThumbEmoji] = useState<string>('🔥');
  const [thumbFrame, setThumbFrame] = useState(0);
  const [framePreviews, setFramePreviews] = useState<(string | null)[]>([]);
  const [thumbPreview, setThumbPreview] = useState<string | null>(clip.thumbnailUrl ?? null);
  const [thumbBusy, setThumbBusy] = useState(false);

  /* Load candidate background frames when the Thumb tab is first opened. */
  useEffect(() => {
    if (activePanel !== 'thumb' || framePreviews.length > 0) return;
    const apiBase = import.meta.env.DEV ? 'http://localhost:3001' : '';
    if (ytId) {
      setFramePreviews(YT_FRAME_VARIANTS.map(f => `${apiBase}/api/yt-thumb.php?id=${ytId}&f=${f}`));
    } else if (project.sourceBlobUrl) {
      const offsets = [0.1, 0.35, 0.6, 0.85];
      Promise.all(offsets.map(o => captureVideoFrame(project.sourceBlobUrl!, trimStart + (trimEnd - trimStart) * o)))
        .then(setFramePreviews);
    } else {
      setFramePreviews([null]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePanel]);

  /* Live-compose the thumbnail preview whenever any option changes. */
  useEffect(() => {
    if (activePanel !== 'thumb' || framePreviews.length === 0) return;
    let cancelled = false;
    setThumbBusy(true);
    composeThumbnail({
      bgImageUrl: framePreviews[thumbFrame] ?? undefined,
      gradient: localClip.thumbnailGradient,
      headline: thumbHeadline || thumbHook(localClip.title),
      emoji: thumbEmoji || undefined,
      preset: thumbPreset,
      aspectRatio: localClip.aspectRatio,
    })
      .then(url => { if (!cancelled) setThumbPreview(url); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setThumbBusy(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePanel, thumbHeadline, thumbPreset, thumbEmoji, thumbFrame, framePreviews, localClip.aspectRatio]);

  const applyThumb = () => {
    if (!thumbPreview) return;
    set({ thumbnailUrl: thumbPreview });
    onSave({ thumbnailUrl: thumbPreview });
  };

  /* ── AI Hook state ── */
  const [hooks, setHooks] = useState<string[]>([]);
  const [hooksBusy, setHooksBusy] = useState(false);
  const [exportRes, setExportRes] = useState<ExportResolution>('1080p');

  /* ── Video Dubbing + AI B-Roll state ── */
  const [dubLang, setDubLang] = useState('Spanish');
  const [dubBusy, setDubBusy] = useState(false);
  const [brollBusy, setBrollBusy] = useState(false);

  const dubNow = async () => {
    if (!hasGeminiKey()) { addNotification('Video dubbing needs a Gemini API key configured (Settings).', 'error'); return; }
    setDubBusy(true);
    try {
      const res = await translateClip(
        { title: localClip.title, description: localClip.description, captions: localClip.captions.map(c => c.text) },
        dubLang,
      );
      const caps = localClip.captions.map((c, i) => ({ ...c, text: res.captions[i] ?? c.text }));
      set({ captions: caps, title: res.title, description: res.description, language: dubLang });
      addNotification(`Dubbed to ${dubLang} — captions, title & description translated. Exports burn the ${dubLang} captions.`, 'success');
    } catch (err) {
      addNotification(err instanceof Error ? err.message : 'Translation failed', 'error');
    } finally { setDubBusy(false); }
  };

  const speakDub = () => {
    const synth = window.speechSynthesis;
    if (!synth) { addNotification('Voice preview is not supported in this browser.', 'error'); return; }
    if (synth.speaking) { synth.cancel(); return; }
    const u = new SpeechSynthesisUtterance(localClip.captions.map(c => c.text).join('. '));
    u.lang = DUB_LANGUAGES.find(l => l.name === dubLang)?.code ?? 'en';
    const voice = synth.getVoices().find(v => v.lang.startsWith(u.lang));
    if (voice) u.voice = voice;
    synth.speak(u);
  };

  const suggestBrollNow = async () => {
    setBrollBusy(true);
    try {
      let suggestions: { keyword: string; title: string }[] = [];
      if (hasGeminiKey()) {
        try { suggestions = await suggestBroll(localClip.transcript || localClip.title); } catch { /* fall through */ }
      }
      if (!suggestions.length) {
        // Offline fallback: longest distinctive words from the transcript
        const words = (localClip.transcript || localClip.title).toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(word => word.length > 5);
        suggestions = [...new Set(words)].slice(0, 4).map(word => ({ keyword: word, title: word[0].toUpperCase() + word.slice(1) }));
      }
      if (!suggestions.length) { addNotification('Could not derive b-roll keywords for this clip.', 'error'); return; }
      const items: BRollClip[] = suggestions.map((sug, i) => ({
        id: `ai-br-${Date.now()}-${i}`,
        keyword: sug.keyword,
        title: sug.title,
        thumbnail: GRADIENTS[i % GRADIENTS.length],
        duration: 3,
        source: 'AI · stock image',
        imageUrl: `${API_BASE_URL}/api/img-proxy.php?q=${encodeURIComponent(sug.keyword)}&sig=${i + 1}`,
      }));
      set({ broll: [...localClip.broll.filter(b => !b.id.startsWith('ai-br-')), ...items] });
      addNotification(`${items.length} AI image b-roll cutaways added — they'll be burned into the export.`, 'success');
    } finally { setBrollBusy(false); }
  };

  const generateHooksNow = async () => {
    setHooksBusy(true);
    try {
      if (hasGeminiKey()) {
        const list = await generateHooks({ title: localClip.title, transcript: localClip.transcript, language: localClip.language });
        if (list.length) { setHooks(list); return; }
      }
      throw new Error('fallback');
    } catch {
      // Offline fallback: curated templates, shuffled
      const shuffled = [...HOOK_TEMPLATES].sort(() => Math.random() - 0.5).slice(0, 5);
      setHooks(shuffled);
    } finally {
      setHooksBusy(false);
    }
  };

  const applyHook = (h: string) => {
    const start = localClip.startTime;
    const hookCap: Caption = {
      id: `hook-${localClip.id}`,
      startTime: start,
      endTime: start + 2.2,
      text: h,
      emoji: '🔥',
      highlighted: true,
      style: { fontSize: 24, color: '#ffffff', position: 'bottom', fontWeight: '900' },
    };
    const rest = localClip.captions.filter(c => !c.id.startsWith('hook-'));
    set({ hook: h, captions: [hookCap, ...rest] });
    addNotification('Hook applied as the opening caption.');
  };

  const downloadThumb = async () => {
    const url = await composeThumbnail({
      bgImageUrl: framePreviews[thumbFrame] ?? undefined,
      gradient: localClip.thumbnailGradient,
      headline: thumbHeadline || thumbHook(localClip.title),
      emoji: thumbEmoji || undefined,
      preset: thumbPreset,
      aspectRatio: localClip.aspectRatio,
      width: 1080,
      quality: 0.9,
    });
    downloadDataUrl(url, `${localClip.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 40) || 'clip'}-thumbnail.jpg`);
    addNotification('Thumbnail downloaded (1080p).', 'success');
  };

  const handleSave = () => {
    onSave(localClip);
    onBack();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - var(--app-nav-h, 72px))', backgroundColor: '#0f172a', overflow: 'hidden' }}>
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
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <ScoreBadge score={localClip.viralityScore} size="lg" />
          <button onClick={() => setShowPublish(true)} style={{ padding: '11px 20px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px' }}>
            <Share2 size={16} /> Publish
          </button>
          <button onClick={handleSave} style={{ padding: '11px 20px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px' }}>
            <Check size={16} /> Save
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
                  <div style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(calc(-50% + ${ytShiftX}px), calc(-50% + ${ytShiftY}px))`, width: ytCover.w, height: ytCover.h, pointerEvents: 'none' }}>
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
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${focusX * 100}% ${focusY * 100}%` }}
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

              {/* Active caption overlay — styled per AI Captions preset */}
              {activeCaptionIdx >= 0 && (() => {
                const cap = localClip.captions[activeCaptionIdx];
                const cs = localClip.captionStyle ?? 'classic';
                const capProgress = Math.max(0, Math.min(1, (playhead - (cap.startTime - localClip.startTime)) / Math.max(0.001, cap.endTime - cap.startTime)));
                const base: React.CSSProperties = { display: 'inline-block', padding: '4px 8px', borderRadius: '4px', lineHeight: 1.3, fontWeight: 800, fontSize: cs === 'minimal' ? '11px' : '13px' };
                if (cs === 'karaoke') {
                  const words = `${cap.emoji ? cap.emoji + ' ' : ''}${cap.text}`.split(' ');
                  const activeW = Math.min(words.length - 1, Math.floor(capProgress * words.length));
                  return (
                    <div style={{ position: 'absolute', bottom: '16%', left: '8px', right: '8px', textAlign: 'center' }}>
                      <span style={{ ...base, background: 'rgba(0,0,0,0.75)' }}>
                        {words.map((word, i) => (
                          <span key={i} style={{ color: i === activeW ? '#17191c' : i < activeW ? '#ffe14d' : '#fff', background: i === activeW ? '#ffe14d' : 'none', borderRadius: 2, padding: i === activeW ? '0 2px' : 0 }}>{word}{' '}</span>
                        ))}
                      </span>
                    </div>
                  );
                }
                const styleMap: Record<string, React.CSSProperties> = {
                  classic: { ...base, background: 'rgba(0,0,0,0.75)', color: '#fff' },
                  bold: { ...base, background: 'none', color: '#ffe14d', textTransform: 'uppercase', WebkitTextStroke: '1px #000', textShadow: '0 2px 4px rgba(0,0,0,0.7)' },
                  minimal: { ...base, background: 'rgba(0,0,0,0.45)', color: 'rgba(255,255,255,0.95)' },
                  neon: { ...base, background: 'none', color: '#fff', textShadow: '0 0 8px #8b5cf6, 0 0 16px #8b5cf6' },
                };
                return (
                  <div style={{ position: 'absolute', bottom: '16%', left: '8px', right: '8px', textAlign: 'center' }}>
                    <span style={styleMap[cs] ?? styleMap.classic}>
                      {cap.emoji} {cs === 'bold' ? cap.text.toUpperCase() : cap.text}
                    </span>
                  </div>
                );
              })()}

              {/* Branding overlays — live preview of what gets burned into the export */}
              {localClip.logoUrl && (() => {
                const pos = localClip.logoPosition ?? 'top-right';
                const box: React.CSSProperties = { position: 'absolute', width: `${Math.round((localClip.logoScale ?? 0.16) * 100)}%`, opacity: localClip.logoOpacity ?? 1, pointerEvents: 'none' };
                if (pos.startsWith('top')) box.top = '4.5%'; else box.bottom = '4.5%';
                if (pos.endsWith('left')) box.left = '4.5%';
                else if (pos.endsWith('right')) box.right = '4.5%';
                else { box.left = '50%'; box.transform = 'translateX(-50%)'; }
                return <img src={localClip.logoUrl} alt="" style={{ ...box, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.35))' }} />;
              })()}
              {(localClip.brandText ?? '').trim() && (() => {
                const pos = localClip.brandTextPosition ?? 'bottom-center';
                const st = localClip.brandTextStyle ?? 'pill';
                const wrap: React.CSSProperties = { position: 'absolute', pointerEvents: 'none', display: 'flex' };
                if (pos.startsWith('top')) wrap.top = '4.5%'; else wrap.bottom = '4.5%';
                if (st === 'bar') { wrap.left = 0; wrap.right = 0; wrap.justifyContent = 'center'; }
                else if (pos.endsWith('left')) { wrap.left = '4.5%'; }
                else if (pos.endsWith('right')) { wrap.right = '4.5%'; }
                else { wrap.left = '50%'; wrap.transform = 'translateX(-50%)'; }
                const chip: React.CSSProperties = {
                  fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap',
                  color: localClip.brandTextColor ?? '#ffffff',
                  padding: st === 'plain' ? 0 : '4px 9px',
                  borderRadius: st === 'pill' ? 999 : 0,
                  background: st === 'plain' ? 'none' : (localClip.brandTextBg ?? 'rgba(15,23,42,0.72)'),
                  width: st === 'bar' ? '100%' : undefined,
                  textAlign: 'center',
                  textShadow: st === 'plain' ? '0 1px 3px rgba(0,0,0,0.8)' : undefined,
                };
                return <div style={wrap}><span style={chip}>{localClip.brandText}</span></div>;
              })()}

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
              {/* Montage scene boundary markers */}
              {isMontage && segOutStart.slice(1).map((o, i) => (
                <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${(o / dur) * 100}%`, width: '2px', background: 'rgba(129,140,248,0.9)', pointerEvents: 'none' }} />
              ))}
              {/* Playhead line */}
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(playhead / dur) * 100}%`, width: '2px', background: 'white', pointerEvents: 'none' }} />
            </div>

            {/* Trim / montage label */}
            {isMontage ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                <span style={{ fontSize: '11px', color: '#818cf8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}><Scissors size={11} /> Montage · {segs.length} scenes from across the video</span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Total: {fmtDuration(Math.floor(dur))}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Start: {fmtDuration(Math.floor(trimStart - clip.startTime))}</span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Duration: {fmtDuration(Math.floor(trimEnd - trimStart))}</span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>End: {fmtDuration(Math.floor(trimEnd - clip.startTime))}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div style={{ width: '390px', background: '#1e293b', borderLeft: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
          {/* Panel tabs — larger, scrollable */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, overflowX: 'auto' }}>
            {([
              { id: 'details', icon: Edit2, label: 'Details' },
              { id: 'thumb', icon: ImageIcon, label: 'Thumb' },
              { id: 'display', icon: MonitorPlay, label: 'Display' },
              { id: 'captions', icon: AlignLeft, label: 'Captions' },
              { id: 'audio', icon: Music, label: 'Audio' },
              { id: 'broll', icon: Film, label: 'B-Roll' },
              { id: 'brand', icon: Sparkles, label: 'Brand' },
              { id: 'publish', icon: Share2, label: 'Publish' },
            ] as const).map(tab => (
              <button key={tab.id} onClick={() => setActivePanel(tab.id)}
                style={{ flex: '1 0 auto', minWidth: '54px', padding: '14px 4px', border: 'none', background: activePanel === tab.id ? 'rgba(99,102,241,0.1)' : 'none', cursor: 'pointer', color: activePanel === tab.id ? '#a5b4fc' : '#94a3b8', borderBottom: `2.5px solid ${activePanel === tab.id ? '#6366f1' : 'transparent'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}>
                <tab.icon size={18} strokeWidth={2} />
                <span style={{ fontSize: '11px', fontWeight: 700 }}>{tab.label}</span>
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
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
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '7px' }}>
                    Title {localClip.language && localClip.language.toLowerCase() !== 'english' ? `(${localClip.language})` : ''}
                  </label>
                  <input value={localClip.title} onChange={e => set({ title: e.target.value })}
                    style={{ width: '100%', padding: '11px 13px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '9px', color: 'white', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '12px' }} />
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '7px' }}>
                    Description {localClip.language && localClip.language.toLowerCase() !== 'english' ? `(${localClip.language})` : ''}
                  </label>
                  <textarea value={localClip.description} onChange={e => set({ description: e.target.value })} rows={4}
                    style={{ width: '100%', padding: '11px 13px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '9px', color: 'white', fontSize: '13.5px', outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.55 }} />
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

                {/* Montage scenes — the sentences stitched into this short */}
                {isMontage && (
                  <div style={{ marginTop: '18px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '12px' }}>
                    <p style={{ margin: '0 0 4px', fontSize: '12px', fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Scissors size={13} color="#818cf8" /> Montage scenes ({segs.length})
                    </p>
                    <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 10px', lineHeight: 1.5 }}>Sentences pulled from across the video, stitched in order to deliver the title. Each cut lands on a sentence boundary.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {segs.map((s, si) => (
                        <div key={si} style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', padding: '8px 10px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 800, color: '#818cf8', flexShrink: 0, marginTop: '1px' }}>{si + 1}</span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: '11.5px', color: '#cbd5e1', lineHeight: 1.4 }}>{s.text || '(scene from the video)'}</span>
                            <span style={{ display: 'block', fontSize: '9.5px', color: '#64748b', marginTop: '2px' }}>{fmtDuration(Math.floor(s.start))}–{fmtDuration(Math.floor(s.end))} · {Math.round(s.end - s.start)}s</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Hook */}
                <div style={{ marginTop: '18px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={13} color="#f59e0b" /> AI Hook
                    </span>
                    <button onClick={generateHooksNow} disabled={hooksBusy}
                      style={{ fontSize: '11px', padding: '4px 10px', background: '#6366f120', color: '#818cf8', border: '1px solid #6366f130', borderRadius: '5px', cursor: hooksBusy ? 'wait' : 'pointer', fontWeight: 600 }}>
                      {hooksBusy ? 'Generating…' : hooks.length ? 'Regenerate' : 'Generate hooks'}
                    </button>
                  </div>
                  <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 8px', lineHeight: 1.5 }}>A scroll-stopping opening line shown as the first caption (first ~2 seconds).</p>
                  {localClip.hook && (
                    <div style={{ fontSize: '11.5px', color: '#ffe14d', fontWeight: 700, marginBottom: '8px' }}>Current: 🔥 {localClip.hook}</div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {hooks.map(h => (
                      <button key={h} onClick={() => applyHook(h)}
                        style={{ textAlign: 'left', padding: '8px 10px', background: localClip.hook === h ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${localClip.hook === h ? '#6366f1' : 'rgba(255,255,255,0.08)'}`, borderRadius: '6px', color: 'white', fontSize: '12px', cursor: 'pointer' }}>
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* THUMBNAIL PANEL */}
            {activePanel === 'thumb' && (
              <div>
                <p style={{ margin: '0 0 12px', color: 'white', fontWeight: 700, fontSize: '13px' }}>Custom Thumbnail</p>

                {/* Live preview */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
                  <div style={{ position: 'relative', width: localClip.aspectRatio === '16:9' ? 220 : localClip.aspectRatio === '1:1' ? 170 : 150, aspectRatio: localClip.aspectRatio.replace(':', '/'), borderRadius: '10px', overflow: 'hidden', background: localClip.thumbnailGradient, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                    {thumbPreview && <img src={thumbPreview} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                    {thumbBusy && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />}
                  </div>
                </div>

                {/* Headline */}
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Headline (short & punchy)</label>
                <input value={thumbHeadline} onChange={e => setThumbHeadline(e.target.value)} maxLength={48}
                  style={{ width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '13px', outline: 'none', boxSizing: 'border-box', marginBottom: '14px' }} />

                {/* Style presets */}
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Style</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '14px' }}>
                  {THUMB_PRESETS.map(p => (
                    <button key={p.id} onClick={() => setThumbPreset(p.id)}
                      style={{ padding: '8px', borderRadius: '7px', border: `1px solid ${thumbPreset === p.id ? '#6366f1' : 'rgba(255,255,255,0.1)'}`, background: thumbPreset === p.id ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)', color: thumbPreset === p.id ? '#a5b4fc' : '#94a3b8', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Emoji */}
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Emoji sticker</label>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  {['', ...THUMB_EMOJIS].map(e => (
                    <button key={e || 'none'} onClick={() => setThumbEmoji(e)}
                      style={{ width: 34, height: 34, borderRadius: '7px', border: `1px solid ${thumbEmoji === e ? '#6366f1' : 'rgba(255,255,255,0.1)'}`, background: thumbEmoji === e ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)', fontSize: e ? '16px' : '10px', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {e || 'none'}
                    </button>
                  ))}
                </div>

                {/* Background frame */}
                {framePreviews.filter(Boolean).length > 1 && (
                  <>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Background frame</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px', marginBottom: '16px' }}>
                      {framePreviews.map((f, i) => f ? (
                        <button key={i} onClick={() => setThumbFrame(i)}
                          style={{ padding: 0, height: 40, borderRadius: '6px', overflow: 'hidden', border: `2px solid ${thumbFrame === i ? '#6366f1' : 'transparent'}`, cursor: 'pointer', background: '#0f172a' }}>
                          <img src={f} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </button>
                      ) : null)}
                    </div>
                  </>
                )}

                <button onClick={applyThumb} disabled={!thumbPreview || thumbBusy}
                  style={{ width: '100%', padding: '10px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 700, cursor: thumbPreview ? 'pointer' : 'not-allowed', opacity: thumbPreview ? 1 : 0.5, marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
                  <Check size={14} /> Apply to clip
                </button>
                <button onClick={downloadThumb} disabled={thumbBusy}
                  style={{ width: '100%', padding: '10px', background: 'none', color: 'white', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
                  <Download size={14} /> Download thumbnail (1080p)
                </button>
              </div>
            )}

            {/* CAPTIONS PANEL */}
            {activePanel === 'captions' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <p style={{ margin: 0, color: 'white', fontWeight: 700, fontSize: '13px' }}>Auto-Captions</p>
                  <button
                    onClick={() => { set({ captions: generateCaptions(localClip.transcript || localClip.title, localClip.startTime) }); addNotification('Captions regenerated from the transcript.'); }}
                    style={{ fontSize: '11px', padding: '4px 8px', background: '#6366f120', color: '#6366f1', border: '1px solid #6366f130', borderRadius: '5px', cursor: 'pointer' }}>
                    <RefreshCw size={10} style={{ marginRight: '3px', verticalAlign: 'middle' }} /> Regenerate
                  </button>
                </div>

                {/* AI Captions: rendering style presets (preview + burned into exports) */}
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '10px', marginBottom: '10px' }}>
                  <p style={{ margin: '0 0 8px', color: '#94a3b8', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Caption style</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {CAPTION_STYLES.map(s => (
                      <button key={s.id} onClick={() => set({ captionStyle: s.id })}
                        style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${(localClip.captionStyle ?? 'classic') === s.id ? '#6366f1' : 'rgba(255,255,255,0.1)'}`, background: (localClip.captionStyle ?? 'classic') === s.id ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)', color: (localClip.captionStyle ?? 'classic') === s.id ? '#a5b4fc' : '#94a3b8', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: '10px', color: '#64748b', margin: '8px 0 0' }}>Karaoke highlights each word as it plays. Styles apply in the preview and exported video.</p>
                </div>

                {/* Caption position & size */}
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
                      <input type="number" min={14} max={36} value={localClip.captions[0]?.style?.fontSize ?? 22}
                        onChange={e => {
                          const fs = Math.max(14, Math.min(36, Number(e.target.value) || 22));
                          set({ captions: localClip.captions.map(c => ({ ...c, style: { ...c.style, fontSize: fs } })) });
                        }}
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

                {/* Video Dubbing */}
                <div style={{ marginTop: '16px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '12px' }}>
                  <p style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Globe size={13} color="#0ea5e9" /> Video Dubbing
                  </p>
                  <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 10px', lineHeight: 1.5 }}>
                    Translate the captions, title & description — the translated captions are burned into exports. Use the voice preview to hear the dub.
                  </p>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                    <select value={dubLang} onChange={e => setDubLang(e.target.value)}
                      style={{ flex: 1, padding: '7px 9px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontSize: '12px' }}>
                      {DUB_LANGUAGES.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
                    </select>
                    <button onClick={dubNow} disabled={dubBusy}
                      style={{ padding: '7px 14px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: dubBusy ? 'wait' : 'pointer' }}>
                      {dubBusy ? 'Translating…' : 'Dub'}
                    </button>
                  </div>
                  <button onClick={speakDub}
                    style={{ width: '100%', padding: '7px', background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', color: '#94a3b8', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Volume2 size={12} /> Voice preview (click again to stop)
                  </button>
                </div>
              </div>
            )}

            {/* AUDIO PANEL */}
            {/* DISPLAY PANEL — size, platform presets, reframe */}
            {activePanel === 'display' && (
              <div>
                {/* Platform presets */}
                <div style={{ marginBottom: '20px' }}>
                  <p style={{ color: 'white', fontWeight: 700, fontSize: '13px', margin: '0 0 4px' }}>Platform size</p>
                  <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 10px', lineHeight: 1.5 }}>Pick where you'll post — the clip is sized to that platform's recommended format.</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    {PLATFORM_PRESETS.map(p => {
                      const active = localClip.aspectRatio === p.ratio;
                      return (
                        <button key={p.label} onClick={() => set({ aspectRatio: p.ratio })}
                          style={{ padding: '8px 10px', borderRadius: '8px', border: `1px solid ${active ? '#6366f1' : 'rgba(255,255,255,0.1)'}`, background: active ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)', cursor: 'pointer', textAlign: 'left' }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: active ? '#a5b4fc' : '#cbd5e1' }}>{p.label}</div>
                          <div style={{ fontSize: '9.5px', color: '#64748b' }}>{p.ratio} · {p.note}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

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

                {/* AI Reframe: focal point for the crop */}
                <div style={{ marginBottom: '20px' }}>
                  <p style={{ color: 'white', fontWeight: 700, fontSize: '13px', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '6px' }}><Crop size={13} color="#818cf8" /> AI Reframe</p>
                  <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 10px', lineHeight: 1.5 }}>Pick where the subject is — the crop keeps that spot in frame (preview + export).</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', maxWidth: '140px' }}>
                    {FOCUS_POINTS.map(fy => FOCUS_POINTS.map(fx => {
                      const active = Math.abs((localClip.focusX ?? 0.5) - fx) < 0.01 && Math.abs((localClip.focusY ?? 0.5) - fy) < 0.01;
                      return (
                        <button key={`${fx}-${fy}`} onClick={() => set({ focusX: fx, focusY: fy })}
                          style={{ height: '34px', borderRadius: '6px', border: `1px solid ${active ? '#6366f1' : 'rgba(255,255,255,0.1)'}`, background: active ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ width: 7, height: 7, borderRadius: 99, background: active ? '#818cf8' : '#475569' }} />
                        </button>
                      );
                    }))}
                  </div>
                </div>
              </div>
            )}

            {activePanel === 'audio' && (
              <div>
                {/* Enhance Speech */}
                <div style={{ marginBottom: '20px' }}>
                  <p style={{ color: 'white', fontWeight: 700, fontSize: '13px', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}><Mic size={13} color="#22c55e" /> Enhance Speech</p>
                  <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.45, paddingRight: '10px' }}>Clean up the voice on export: cut rumble, even out volume, lift clarity.</span>
                    <button onClick={() => set({ enhanceSpeech: !localClip.enhanceSpeech })}
                      style={{ width: '36px', height: '20px', borderRadius: '10px', background: localClip.enhanceSpeech ? '#22c55e' : 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.15s', flexShrink: 0 }}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '8px', background: 'white', position: 'absolute', top: '2px', left: localClip.enhanceSpeech ? '18px' : '2px', transition: 'left 0.15s' }} />
                    </button>
                  </div>
                </div>

                {/* AI Sound Effect */}
                <div style={{ marginBottom: '20px' }}>
                  <p style={{ color: 'white', fontWeight: 700, fontSize: '13px', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}><Zap size={13} color="#f59e0b" /> AI Sound Effect</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                    {SFX_OPTIONS.map(o => {
                      const active = (localClip.sfx ?? 'none') === o.id;
                      return (
                        <button key={o.id} onClick={() => set({ sfx: o.id })}
                          style={{ padding: '8px 10px', borderRadius: '7px', border: `1px solid ${active ? '#6366f1' : 'rgba(255,255,255,0.08)'}`, background: active ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', textAlign: 'left' }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: active ? '#a5b4fc' : '#94a3b8' }}>{o.label}</div>
                          <div style={{ fontSize: '10px', color: '#64748b' }}>{o.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: '10px', color: '#64748b', margin: '8px 0 0' }}>Synthesized and mixed into the exported video's audio.</p>
                </div>

                {/* Background music — mood-matched, mixed into the export */}
                <div style={{ marginBottom: '22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <p style={{ color: 'white', fontWeight: 700, fontSize: '14px', margin: 0 }}>Background Music</p>
                    {localClip.musicAuto && localClip.musicTrack !== 'none' && (
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '99px', background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>AUTO · matched to mood</span>
                    )}
                  </div>
                  <p style={{ fontSize: '11.5px', color: '#64748b', margin: '0 0 10px', lineHeight: 1.5 }}>Auto-picked from the clip's mood and mixed under the voice on export. Change it any time.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {MUSIC_TRACKS.map(track => (
                      <button key={track.id} onClick={() => set({ musicTrack: track.id, musicAuto: false })}
                        style={{ padding: '12px 14px', borderRadius: '9px', border: `1.5px solid ${localClip.musicTrack === track.id ? '#6366f1' : 'rgba(255,255,255,0.08)'}`, background: localClip.musicTrack === track.id ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: localClip.musicTrack === track.id ? '#a5b4fc' : '#cbd5e1', fontSize: '13px', fontWeight: 600, textAlign: 'left' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {localClip.musicTrack === track.id && track.id !== 'none' ? <Volume2 size={15} color="#818cf8" /> : track.id === 'none' ? <VolumeX size={15} /> : <Music size={15} />}
                          {track.label}
                        </span>
                        {localClip.musicTrack === track.id && <Check size={15} color="#818cf8" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Intro & Outro cards */}
                <div style={{ marginBottom: '22px' }}>
                  <p style={{ color: 'white', fontWeight: 700, fontSize: '14px', margin: '0 0 4px' }}>Intro & Outro</p>
                  <p style={{ fontSize: '11.5px', color: '#64748b', margin: '0 0 12px', lineHeight: 1.5 }}>Optional title cards shown for ~2s at the start and end of the exported video.</p>
                  {/* Intro */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#cbd5e1' }}>Intro card</label>
                      <button onClick={() => set({ intro: localClip.intro !== undefined ? undefined : (localClip.hook || localClip.title).slice(0, 40) })}
                        style={{ width: '40px', height: '22px', borderRadius: '11px', background: localClip.intro !== undefined ? '#6366f1' : 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', position: 'relative' }}>
                        <div style={{ width: '18px', height: '18px', borderRadius: '9px', background: 'white', position: 'absolute', top: '2px', left: localClip.intro !== undefined ? '20px' : '2px', transition: 'left 0.15s' }} />
                      </button>
                    </div>
                    {localClip.intro !== undefined && (
                      <input value={localClip.intro} onChange={e => set({ intro: e.target.value })} maxLength={48} placeholder="e.g. Watch till the end"
                        style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                    )}
                  </div>
                  {/* Outro */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#cbd5e1' }}>Outro card</label>
                      <button onClick={() => set({ outro: localClip.outro !== undefined ? undefined : 'Follow for more 🔥' })}
                        style={{ width: '40px', height: '22px', borderRadius: '11px', background: localClip.outro !== undefined ? '#6366f1' : 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', position: 'relative' }}>
                        <div style={{ width: '18px', height: '18px', borderRadius: '9px', background: 'white', position: 'absolute', top: '2px', left: localClip.outro !== undefined ? '20px' : '2px', transition: 'left 0.15s' }} />
                      </button>
                    </div>
                    {localClip.outro !== undefined && (
                      <input value={localClip.outro} onChange={e => set({ outro: e.target.value })} maxLength={48} placeholder="e.g. Follow for more"
                        style={{ width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                    )}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <p style={{ color: 'white', fontWeight: 700, fontSize: '13px', margin: 0 }}>B-Roll Library</p>
                  <button onClick={suggestBrollNow} disabled={brollBusy}
                    style={{ fontSize: '11px', padding: '4px 10px', background: '#6366f120', color: '#818cf8', border: '1px solid #6366f130', borderRadius: '5px', cursor: brollBusy ? 'wait' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Sparkles size={11} /> {brollBusy ? 'Finding images…' : 'AI Image B-Roll'}
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 12px', lineHeight: 1.5 }}>
                  AI picks cutaway images matched to your clip's content — they're overlaid as cards and burned into the export.
                </p>
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
                          {b.imageUrl
                            ? <img src={b.imageUrl} alt="" style={{ width: '42px', height: '28px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0, background: '#0f172a' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                            : <div style={{ width: '28px', height: '28px', borderRadius: '4px', background: b.thumbnail, flexShrink: 0 }} />}
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: '11px', color: '#a5b4fc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
                            <span style={{ display: 'block', fontSize: '9px', color: '#64748b' }}>{b.source}</span>
                          </span>
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

            {/* BRAND PANEL — logo + website/CTA text burned onto the short */}
            {activePanel === 'brand' && (
              <div>
                {/* Logo */}
                <div style={{ marginBottom: '22px' }}>
                  <p style={{ color: 'white', fontWeight: 700, fontSize: '13px', margin: '0 0 4px' }}>Logo watermark</p>
                  <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 10px', lineHeight: 1.5 }}>
                    PNG with transparency works best. Burned into the downloaded video.
                  </p>
                  {localClip.logoUrl ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '10px' }}>
                      <div style={{ width: 54, height: 54, borderRadius: 8, background: 'repeating-conic-gradient(#334155 0% 25%, #1e293b 0% 50%) 50%/12px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                        <img src={localClip.logoUrl} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      </div>
                      <span style={{ flex: 1, fontSize: '11.5px', color: '#cbd5e1' }}>Logo added</span>
                      <button onClick={() => set({ logoUrl: undefined })}
                        style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.12)', color: '#fca5a5', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                        Remove
                      </button>
                    </div>
                  ) : (
                    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '18px', borderRadius: '10px', border: '1.5px dashed rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', marginBottom: '10px' }}>
                      <Upload size={18} color="#64748b" />
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#cbd5e1' }}>Upload logo</span>
                      <span style={{ fontSize: '10.5px', color: '#64748b' }}>PNG, JPG or SVG · max 2 MB</span>
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 2 * 1024 * 1024) { addNotification('Logo must be under 2 MB', 'error'); return; }
                        const reader = new FileReader();
                        reader.onload = () => set({ logoUrl: String(reader.result || '') });
                        reader.onerror = () => addNotification('Could not read that image', 'error');
                        reader.readAsDataURL(file);
                        e.target.value = '';
                      }} />
                    </label>
                  )}

                  {localClip.logoUrl && (
                    <>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', margin: '12px 0 6px' }}>Position</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', marginBottom: '12px' }}>
                        {BRAND_POSITIONS.map(pos => {
                          const active = (localClip.logoPosition ?? 'top-right') === pos.id;
                          return (
                            <button key={pos.id} onClick={() => set({ logoPosition: pos.id })} title={pos.label}
                              style={{ padding: '8px 4px', borderRadius: '7px', border: `1px solid ${active ? '#6366f1' : 'rgba(255,255,255,0.1)'}`, background: active ? 'rgba(99,102,241,0.16)' : 'rgba(255,255,255,0.04)', color: active ? '#a5b4fc' : '#94a3b8', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>
                              {pos.short}
                            </button>
                          );
                        })}
                      </div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                        Size — {Math.round((localClip.logoScale ?? 0.16) * 100)}% of width
                      </label>
                      <input type="range" min={6} max={35} value={Math.round((localClip.logoScale ?? 0.16) * 100)}
                        onChange={e => set({ logoScale: Number(e.target.value) / 100 })}
                        style={{ width: '100%', marginBottom: '10px', accentColor: '#6366f1' }} />
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                        Opacity — {Math.round((localClip.logoOpacity ?? 1) * 100)}%
                      </label>
                      <input type="range" min={20} max={100} value={Math.round((localClip.logoOpacity ?? 1) * 100)}
                        onChange={e => set({ logoOpacity: Number(e.target.value) / 100 })}
                        style={{ width: '100%', accentColor: '#6366f1' }} />
                    </>
                  )}
                </div>

                {/* Website / CTA text */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '18px' }}>
                  <p style={{ color: 'white', fontWeight: 700, fontSize: '13px', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Globe size={13} color="#818cf8" /> Website / CTA text
                  </p>
                  <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 10px', lineHeight: 1.5 }}>
                    Show your site, handle or a call to action on every frame.
                  </p>
                  <input
                    value={localClip.brandText ?? ''}
                    onChange={e => set({ brandText: e.target.value.slice(0, 60) })}
                    placeholder="yourbusiness.com"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '9px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'white', fontSize: '13px', outline: 'none', boxSizing: 'border-box', marginBottom: '4px' }}
                  />
                  <p style={{ fontSize: '10px', color: '#475569', margin: '0 0 12px', textAlign: 'right' }}>{(localClip.brandText ?? '').length}/60</p>

                  {(localClip.brandText ?? '').trim() && (
                    <>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', margin: '0 0 6px' }}>Position</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', marginBottom: '12px' }}>
                        {BRAND_POSITIONS.map(pos => {
                          const active = (localClip.brandTextPosition ?? 'bottom-center') === pos.id;
                          return (
                            <button key={pos.id} onClick={() => set({ brandTextPosition: pos.id })} title={pos.label}
                              style={{ padding: '8px 4px', borderRadius: '7px', border: `1px solid ${active ? '#6366f1' : 'rgba(255,255,255,0.1)'}`, background: active ? 'rgba(99,102,241,0.16)' : 'rgba(255,255,255,0.04)', color: active ? '#a5b4fc' : '#94a3b8', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>
                              {pos.short}
                            </button>
                          );
                        })}
                      </div>

                      <p style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', margin: '0 0 6px' }}>Style</p>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                        {(['pill', 'bar', 'plain'] as const).map(st => {
                          const active = (localClip.brandTextStyle ?? 'pill') === st;
                          return (
                            <button key={st} onClick={() => set({ brandTextStyle: st })}
                              style={{ flex: 1, padding: '9px 6px', borderRadius: '8px', border: `1px solid ${active ? '#6366f1' : 'rgba(255,255,255,0.1)'}`, background: active ? 'rgba(99,102,241,0.16)' : 'rgba(255,255,255,0.04)', color: active ? '#a5b4fc' : '#94a3b8', fontSize: '11px', fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>
                              {st}
                            </button>
                          );
                        })}
                      </div>

                      <div style={{ display: 'flex', gap: '10px' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '5px' }}>Text color</label>
                          <input type="color" value={localClip.brandTextColor ?? '#ffffff'} onChange={e => set({ brandTextColor: e.target.value })}
                            style={{ width: '100%', height: 32, padding: 2, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, cursor: 'pointer', background: 'transparent' }} />
                        </div>
                        {(localClip.brandTextStyle ?? 'pill') !== 'plain' && (
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '5px' }}>Background</label>
                            <input type="color" value={hexFromRgba(localClip.brandTextBg) ?? '#0f172a'} onChange={e => set({ brandTextBg: e.target.value })}
                              style={{ width: '100%', height: 32, padding: 2, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, cursor: 'pointer', background: 'transparent' }} />
                          </div>
                        )}
                      </div>
                    </>
                  )}
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
                  {/* Upscale: output resolution */}
                  <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
                    {RESOLUTIONS.map(r => (
                      <button key={r.id} onClick={() => setExportRes(r.id)}
                        style={{ flex: 1, padding: '7px 4px', borderRadius: '6px', border: `1px solid ${exportRes === r.id ? '#6366f1' : 'rgba(255,255,255,0.1)'}`, background: exportRes === r.id ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)', color: exportRes === r.id ? '#a5b4fc' : '#94a3b8', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        {r.id === '4k' && <Maximize2 size={10} />} {r.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleDownload}
                    disabled={exporting}
                    style={{ width: '100%', padding: '10px 12px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', cursor: exporting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', color: 'white', opacity: exporting ? 0.6 : 1 }}>
                    <Download size={14} color="#94a3b8" />
                    <div style={{ textAlign: 'left', flex: 1 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600 }}>{exporting ? `Exporting… ${exportPct}%` : `Download clip (${RESOLUTIONS.find(r => r.id === exportRes)?.label})`}</div>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>
                        {(() => {
                          const mult = exportRes === '4k' ? 2 : exportRes === '720p' ? 2 / 3 : 1;
                          const dims = localClip.aspectRatio === '9:16' ? [1080, 1920] : localClip.aspectRatio === '1:1' ? [1080, 1080] : [1920, 1080];
                          return `${Math.round(dims[0] * mult)}×${Math.round(dims[1] * mult)} · ${canRealExport ? 'exact crop + burned-in captions' : 'motion render (thumbnail + captions)'}`;
                        })()}
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
      {/* Editor has no <Header>, so it needs its own toast layer */}
      <Toasts />
    </div>
  );
}

/* ── Project View ── */
function ProjectView({ project, onBack, onEditClip, onRetry, onUseDemo }: { project: VideoProject; onBack: () => void; onEditClip: (clip: VideoClip, panel?: EditorPanel) => void; onRetry: () => void; onUseDemo: () => void }) {
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
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - var(--app-nav-h, 72px))', overflow: 'hidden' }}>
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
                <button
                  onClick={() => { updateVideoProject(project.id, { trashedClips: [] }); addNotification('Trash emptied.'); }}
                  style={{ fontSize: '12px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  Delete All Permanently
                </button>
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
                    onEditThumb={() => onEditClip(clip, 'thumb')}
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

/* ── Script to Video ── */
function ScriptToVideoModal({ onClose, onCreate }: { onClose: () => void; onCreate: (title: string, scenes: { caption: string; keyword: string }[]) => void }) {
  const [topic, setTopic] = useState('');
  const [script, setScript] = useState('');
  const [busy, setBusy] = useState<'' | 'write'>('');
  const [err, setErr] = useState('');

  const aiWrite = async () => {
    if (!topic.trim()) { setErr('Enter a topic first.'); return; }
    setBusy('write'); setErr('');
    try {
      if (!hasGeminiKey()) throw new Error('no-key');
      const r = await generateScript(topic.trim());
      setScript(r.scenes.map(s => s.caption).join('\n'));
    } catch {
      // Offline fallback: proven short-form structure filled with the topic
      setScript([
        `Stop scrolling — this is about ${topic.trim()}`,
        `Most people get ${topic.trim()} completely wrong`,
        "Here's the truth nobody tells you",
        'Step 1: start smaller than you think',
        'Step 2: stay consistent for 30 days',
        'The results speak for themselves',
        `Follow for more on ${topic.trim()}`,
      ].join('\n'));
    } finally { setBusy(''); }
  };

  const create = () => {
    const lines = script.split(/\n+/).map(l => l.trim()).filter(Boolean).slice(0, 10);
    if (lines.length < 2) { setErr('Write or generate a script first — one scene per line.'); return; }
    const scenes = lines.map(l => {
      const words = l.toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(word => word.length > 4);
      return { caption: l, keyword: words[0] || 'abstract' };
    });
    onCreate(topic.trim() || lines[0].slice(0, 50), scenes);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: '20px' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '16px', width: '560px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={18} /> Script to Video</h2>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>Turn a topic or script into a ready-to-download short — scenes, images & captions included</p>
          </div>
          <button onClick={onClose} style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Topic</label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. How to get more clients with email marketing"
              style={{ flex: 1, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', outline: 'none' }} />
            <button onClick={aiWrite} disabled={busy === 'write'}
              style={{ padding: '10px 16px', background: INK, color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
              <Sparkles size={14} /> {busy === 'write' ? 'Writing…' : 'AI write script'}
            </button>
          </div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Script — one scene per line (each becomes a timed caption with a matching image)</label>
          <textarea value={script} onChange={e => setScript(e.target.value)} rows={9}
            placeholder={'Stop scrolling — you need to hear this\nMost businesses waste their ad budget\nHere are 3 fixes that cost nothing…'}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13.5px', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, marginBottom: '8px' }} />
          {err && <p style={{ fontSize: '12px', color: '#e5484d', margin: '0 0 8px', fontWeight: 600 }}>{err}</p>}
          <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: '0 0 16px' }}>Each scene runs ~3s with an AI-matched stock image, bold captions, and an intro sound effect. You can edit everything afterwards.</p>
          <button onClick={create}
            style={{ width: '100%', padding: '12px', background: INK, color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Zap size={16} /> Create video
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Dashboard ── */
export default function VideoShorts() {
  const { videoProjects, addVideoProject, updateVideoProject, deleteVideoProject, updateVideoClip, addNotification } = useApp();
  const [view, setView] = useState<'dashboard' | 'project' | 'editor'>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [editorPanel, setEditorPanel] = useState<EditorPanel>('details');
  const [showUpload, setShowUpload] = useState(false);
  const [showScript, setShowScript] = useState(false);
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

  /* Merge composed thumbnails onto the CURRENT clips by id (never replace the
     array — the user may have trashed/edited clips while thumbs were rendering). */
  const applyThumbs = useCallback((projectId: string, withThumbs: VideoClip[]) => {
    const cur = videoProjectsRef.current.find(p => p.id === projectId);
    if (!cur) return;
    const thumbById = new Map(withThumbs.filter(c => c.thumbnailUrl).map(c => [c.id, c.thumbnailUrl!]));
    updateVideoProjectRef.current(projectId, {
      clips: cur.clips.map(c => thumbById.has(c.id) ? { ...c, thumbnailUrl: thumbById.get(c.id) } : c),
    });
  }, []);

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
          // Compose unique, click-optimized thumbnails in the background
          autoThumbnails(clips, project).then(withThumbs => applyThumbs(projectId, withThumbs));
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
  }, [applyThumbs]);

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

      const analysis = await analyzeVideoWithGemini(fileUri, mimeType, project.settings, project.duration);
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
      // Compose unique, click-optimized thumbnails in the background
      autoThumbnails(clips, project).then(withThumbs => applyThumbs(projectId, withThumbs));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Gemini]', msg);
      upd({ status: 'failed', processingStep: 'Failed', error: msg });
      addNotificationRef.current(`AI processing failed: ${msg}`, 'error');
    }
  }, [applyThumbs]);

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

  const handleNewProject = (name: string, source: { type: 'upload' | 'youtube' | 'url'; url?: string; file?: File; duration: number; settings?: VideoProject['settings'] }, forceDemo = false) => {
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
      settings: source.settings ?? { maxClipDuration: 60, focus: 'all', aspectRatio: '9:16', autoCaption: true },
      totalViews: 0,
      createdAt: new Date().toISOString(),
    };
    addVideoProject(project);
    // Immediately seed the ref so processWithGemini / startProcessing can find it before React flushes
    videoProjectsRef.current = [project, ...videoProjectsRef.current];
    setShowUpload(false);
    setSelectedProjectId(id);
    setView('project');

    if (forceDemo) {
      // Explicit "Try an example" — sample clips are expected here.
      startProcessing(id, 0);
    } else if (hasGeminiKey()) {
      processWithGemini(id, source);
    } else {
      // No AI key: never fabricate clips for a REAL user video — they wouldn't
      // match its content. Surface a clear, actionable state instead.
      updateVideoProject(id, {
        status: 'failed',
        progress: 0,
        processingStep: 'AI key required',
        error: AI_KEY_MISSING,
      });
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

  /* Script to Video: build a ready project from timed scenes. */
  const handleScriptVideo = (title: string, scenes: { caption: string; keyword: string }[]) => {
    const id = `proj-${Date.now()}`;
    const perScene = 3;
    const dur = scenes.length * perScene;
    const captions: Caption[] = scenes.map((s, i) => ({
      id: `sc-${id}-${i}`,
      startTime: i * perScene,
      endTime: (i + 1) * perScene,
      text: s.caption,
      highlighted: i === 0,
      style: { fontSize: 24, color: '#ffffff', position: 'bottom', fontWeight: '800' },
    }));
    const gradient = GRADIENTS[videoProjects.length % GRADIENTS.length];
    const clip: VideoClip = {
      id: `clip-${id}-0`,
      projectId: id,
      title,
      description: scenes.map(s => s.caption).join(' '),
      language: 'English',
      hashtags: ['#shorts', '#ai', '#viral'],
      startTime: 0,
      endTime: dur,
      duration: dur,
      thumbnailGradient: gradient,
      viralityScore: 78,
      transcript: scenes.map(s => s.caption).join(' '),
      captions,
      aspectRatio: '9:16',
      status: 'neutral',
      focus: 'educational',
      musicTrack: 'none',
      hasVoiceover: false,
      broll: [],
      publishedTo: [],
      views: 0,
      createdAt: new Date().toISOString(),
      captionStyle: 'bold',
      sfx: 'riser',
      sceneImages: scenes.map((s, i) => `${API_BASE_URL}/api/img-proxy.php?q=${encodeURIComponent(s.keyword)}&sig=${i + 1}`),
    };
    const project: VideoProject = {
      id, name: title, sourceType: 'upload', sourceName: 'Script to video',
      duration: dur, thumbnailGradient: gradient, status: 'ready', progress: 100,
      processingStep: 'Done', clips: [clip], trashedClips: [],
      settings: { maxClipDuration: 60, focus: 'all', aspectRatio: '9:16', autoCaption: true },
      totalViews: 0, createdAt: new Date().toISOString(), isDemo: false,
    };
    addVideoProject(project);
    videoProjectsRef.current = [project, ...videoProjectsRef.current];
    setShowScript(false);
    setSelectedProjectId(id);
    setView('project');
    autoThumbnails([clip], project).then(withThumbs => applyThumbs(id, withThumbs));
    addNotification('Script video created — open the clip to preview, edit, and download it.', 'success');
  };

  /* Tools row: deep-link into the clip editor at the tool's panel. */
  const openTool = (panel: EditorPanel) => {
    const proj = videoProjects.find(p => p.status === 'ready' && p.clips.length > 0);
    if (!proj) {
      addNotification('These tools work on a clip — create a project first.', 'info');
      setShowUpload(true);
      return;
    }
    setSelectedProjectId(proj.id);
    setSelectedClipId(proj.clips[0].id);
    setEditorPanel(panel);
    setView('editor');
  };

  /* Fallback when real AI analysis fails (e.g. Gemini quota exhausted): generate
     sample clips so the user still gets a usable, editable, downloadable result. */
  const handleUseDemo = useCallback((projectId: string) => {
    const timer = processingRefs.current.get(projectId);
    if (timer) { clearTimeout(timer); processingRefs.current.delete(projectId); }
    updateVideoProjectRef.current(projectId, { status: 'processing', progress: 0, processingStep: 'Generating sample clips...', error: undefined });
    startProcessing(projectId, 0);
  }, [startProcessing]);

  /* The dashboard's summary figures now live inside ShortsFeed, computed from
     the same projects — one place rather than two that could disagree. */

  /* ── Render: Editor ── */
  if (view === 'editor' && selectedProject && selectedClip) {
    return (
      <ClipEditor
        clip={selectedClip}
        project={selectedProject}
        initialPanel={editorPanel}
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
        onEditClip={(clip, panel) => { setSelectedClipId(clip.id); setEditorPanel(panel ?? 'details'); setView('editor'); }}
        onRetry={() => retryProcessing(selectedProject.id)}
        onUseDemo={() => handleUseDemo(selectedProject.id)}
      />
    );
  }

  /* ── Render: Dashboard ── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - var(--app-nav-h, 72px))', overflow: 'hidden' }}>
      <Header title="AI Shorts" subtitle="Cut a long video into short vertical clips" />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <ShortsFeed
          projects={videoProjects}
          tools={[
            { label: 'AI Captions', icon: Type, action: () => openTool('captions') },
            { label: 'AI Thumbnail', icon: ImageIcon, action: () => openTool('thumb') },
            { label: 'AI Image B-Roll', icon: Film, isNew: true, action: () => openTool('broll') },
            { label: 'Branding', icon: Sparkles, action: () => openTool('brand') },
            { label: 'Audio', icon: Music, action: () => openTool('audio') },
            { label: 'Upscale', icon: Maximize2, isNew: true, action: () => openTool('publish') },
            { label: 'Video dubbing', icon: Globe, isNew: true, action: () => openTool('captions') },
            { label: 'Script to video', icon: FileText, isNew: true, action: () => setShowScript(true) },
          ]}
          onOpenProject={p => { setSelectedProjectId(p.id); setView('project'); }}
          onEditClip={(p, clip) => {
            setSelectedProjectId(p.id);
            setSelectedClipId(clip.id);
            setEditorPanel('details');
            setView('editor');
          }}
          onNewProject={() => setShowUpload(true)}
          onTryExample={handleTryExample}
          onExportAll={p => { setSelectedProjectId(p.id); setView('project'); }}
        />
      </div>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onSubmit={handleNewProject} />}
      {showScript && <ScriptToVideoModal onClose={() => setShowScript(false)} onCreate={handleScriptVideo} />}

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
