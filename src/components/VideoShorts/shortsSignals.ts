/**
 * The analysis strip under each source video.
 *
 * The reference design shows five sub-scores — hook, engagement, visual appeal,
 * trend match, retention — and none of them exist in the data model. They could
 * have been five plausible-looking random numbers, and they would have looked
 * exactly the same on screen; they are computed here from properties the clip
 * actually has instead, and the UI labels them as estimates.
 *
 * That distinction matters more than it looks. A number a user believes is
 * measured will change what they publish. So every score below traces to
 * something real — the words in the opening line, the clip's length, whether a
 * thumbnail was composed, how many hashtags it carries — and `why` says which,
 * in the tooltip, so nobody has to take it on faith.
 */
import type { VideoClip } from '../../types';

export interface Signal {
  id: string;
  label: string;
  /** 0–100. Derived, never measured — no analytics back this. */
  score: number;
  /** What it was computed from, shown on hover. */
  why: string;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** The first sentence a viewer hears, from the captions or the transcript. */
function opener(clip: VideoClip): string {
  const fromCaption = clip.captions?.[0]?.text?.trim();
  if (fromCaption) return fromCaption;
  return (clip.transcript || '').split(/(?<=[.!?])\s+/)[0]?.trim() ?? '';
}

/**
 * Does the opening line stop a thumb?
 *
 * Short-form retention is decided in the first second or two, and the things
 * that hold attention there are well established: a question, a number, direct
 * address, a contradiction, or a promise. This counts those in the actual
 * opening line rather than guessing from the clip as a whole.
 */
function hookScore(clip: VideoClip): { score: number; why: string } {
  const line = opener(clip);
  if (!line) {
    return { score: 40, why: 'No transcript on this clip, so the opening line could not be read.' };
  }

  const found: string[] = [];
  let score = 45;
  if (/\?/.test(line)) { score += 16; found.push('opens on a question'); }
  if (/\b\d+\b/.test(line)) { score += 10; found.push('leads with a number'); }
  if (/\byou(r)?\b/i.test(line)) { score += 12; found.push('addresses the viewer directly'); }
  if (/\b(never|don'?t|stop|nobody|no one|wrong|mistake|myth)\b/i.test(line)) { score += 12; found.push('opens on a contradiction'); }
  if (/\b(secret|truth|actually|really|here'?s (why|how)|this is why)\b/i.test(line)) { score += 10; found.push('promises a reveal'); }

  // A long opening sentence is a slow one.
  const words = line.split(/\s+/).length;
  if (words > 22) { score -= 12; found.push('the first sentence is long'); }
  else if (words <= 10) { score += 6; found.push('the first sentence is short'); }

  return {
    score: clamp(score),
    why: `From the opening line — ${found.length ? found.join(', ') : 'no strong opening signals found'}.`,
  };
}

/**
 * Will it be watched to the end?
 *
 * Length is the strongest thing we can see. Under about 15 seconds there is not
 * enough to hold anyone; past about 45 the drop-off is steep on every platform.
 * Cuts help, so a montage scores better than one continuous take of the same
 * length.
 */
function retentionScore(clip: VideoClip): { score: number; why: string } {
  const d = clip.duration;
  let score: number;
  let band: string;
  if (d < 10) { score = 48; band = `${Math.round(d)}s is very short`; }
  else if (d < 15) { score = 66; band = `${Math.round(d)}s is on the short side`; }
  else if (d <= 35) { score = 88; band = `${Math.round(d)}s sits in the range that holds best`; }
  else if (d <= 50) { score = 76; band = `${Math.round(d)}s is past where drop-off starts`; }
  else { score = 58; band = `${Math.round(d)}s is long for a short`; }

  const cuts = clip.segments?.length ?? 1;
  if (cuts > 1) { score += Math.min(8, cuts * 2); band += `, cut from ${cuts} moments`; }

  return { score: clamp(score), why: `${band}.` };
}

/**
 * Is there anything to look at?
 *
 * A composed thumbnail, the right frame shape and any b-roll are the three
 * things about a clip's appearance that are visible from here. None of this
 * judges the footage — nothing can, from metadata.
 */
function visualScore(clip: VideoClip): { score: number; why: string } {
  const bits: string[] = [];
  let score = 55;
  if (clip.thumbnailUrl) { score += 16; bits.push('has a composed thumbnail'); }
  else bits.push('no thumbnail composed yet');
  if (clip.aspectRatio === '9:16') { score += 14; bits.push('vertical frame'); }
  else bits.push(`${clip.aspectRatio} frame, not vertical`);
  if (clip.broll?.length) { score += 10; bits.push(`${clip.broll.length} b-roll insert${clip.broll.length === 1 ? '' : 's'}`); }
  if (clip.logoUrl || clip.brandText) { score += 6; bits.push('branded'); }
  return { score: clamp(score), why: `${bits.join(', ')}.` };
}

/**
 * How findable is it?
 *
 * Hashtags are the only discovery signal attached to a clip. This is a count
 * and a shape check, not a check against what is trending — nothing here
 * queries any platform, and the label says "match" only in the sense of
 * matching the conventions that get a short surfaced.
 */
function trendScore(clip: VideoClip): { score: number; why: string } {
  const tags = clip.hashtags?.filter(Boolean) ?? [];
  let score = 40 + Math.min(40, tags.length * 8);
  const bits = [`${tags.length} hashtag${tags.length === 1 ? '' : 's'}`];
  if (tags.length === 0) return { score: 35, why: 'No hashtags, so there is nothing to surface it.' };
  if (tags.length > 12) { score -= 12; bits.push('past the point where more stops helping'); }
  // A mix of broad and specific does better than all-broad or all-narrow.
  const specific = tags.filter(t => t.replace('#', '').length > 12).length;
  if (specific > 0 && specific < tags.length) { score += 8; bits.push('a mix of broad and specific'); }
  return { score: clamp(score), why: `${bits.join(', ')}. Not checked against live trends.` };
}

/**
 * Will people watch with the sound off?
 *
 * Most short-form is watched muted, so captions are the single biggest
 * engagement lever we can see, and an animated caption style outperforms a
 * static one.
 */
function engagementScore(clip: VideoClip): { score: number; why: string } {
  const bits: string[] = [];
  let score = 45;
  const caps = clip.captions?.length ?? 0;
  if (caps > 0) { score += 22; bits.push(`${caps} caption lines`); }
  else bits.push('no captions — most short-form is watched muted');
  if (clip.captionStyle && clip.captionStyle !== 'classic') { score += 10; bits.push(`${clip.captionStyle} caption style`); }
  if (clip.musicTrack && clip.musicTrack !== 'None') { score += 9; bits.push('has music'); }
  if (clip.hasVoiceover) { score += 6; bits.push('voiceover'); }
  return { score: clamp(score), why: `${bits.join(', ')}.` };
}

/** The five sub-scores shown under a source video, for one clip. */
export function signalsFor(clip: VideoClip): Signal[] {
  const h = hookScore(clip);
  const e = engagementScore(clip);
  const v = visualScore(clip);
  const t = trendScore(clip);
  const r = retentionScore(clip);
  return [
    { id: 'hook', label: 'Hook', score: h.score, why: h.why },
    { id: 'engagement', label: 'Engagement', score: e.score, why: e.why },
    { id: 'visual', label: 'Visual', score: v.score, why: v.why },
    { id: 'trend', label: 'Discovery', score: t.score, why: t.why },
    { id: 'retention', label: 'Retention', score: r.score, why: r.why },
  ];
}

/** The same five, averaged across every clip cut from one source video. */
export function projectSignals(clips: VideoClip[]): Signal[] {
  if (!clips.length) return [];
  const per = clips.map(signalsFor);
  return per[0].map((s, i) => ({
    ...s,
    score: Math.round(per.reduce((sum, row) => sum + row[i].score, 0) / per.length),
    why: clips.length === 1 ? s.why : `Averaged across ${clips.length} shorts. ${per[0][i].why}`,
  }));
}

/**
 * The word next to a score.
 *
 * Four bands rather than a bare number, because "88" means nothing on its own
 * and "very high" is what a person actually reads off the screen.
 */
export function band(score: number): { label: string; tone: 'high' | 'good' | 'fair' | 'low' } {
  if (score >= 88) return { label: 'Very high', tone: 'high' };
  if (score >= 75) return { label: 'High', tone: 'good' };
  if (score >= 60) return { label: 'Fair', tone: 'fair' };
  return { label: 'Low', tone: 'low' };
}

/**
 * A sparkline shape for a score.
 *
 * The reference draws a rising curve beside every figure. A curve implies a
 * measurement over time and there is no time series here, so this is drawn as
 * what it is: a single value, plotted as a simple rise to that height, with the
 * UI never captioning it as history.
 */
export function sparkPoints(score: number, width: number, height: number, steps = 12): string {
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Ease-out so the shape settles at the score rather than running off.
    const eased = 1 - (1 - t) ** 2;
    const y = height - (score / 100) * height * eased;
    pts.push(`${(t * width).toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}
