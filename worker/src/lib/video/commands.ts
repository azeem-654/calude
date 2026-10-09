/**
 * What somebody says to the editor, turned into operations on the edit
 * document (edit.ts `Op`) — or an honest "I can't do that yet".
 *
 * Read by pattern, the same way prospect-source commands are: every request
 * maps to the same validated operations the buttons use, so a sentence can
 * never do anything a button could not, and nothing here runs a shell or a
 * model with the power to. An unknown request is answered with what can be
 * asked, not guessed at.
 *
 * Undo and redo are the editor's own (versions); "undo" said here is
 * returned as `undo: true` for it to do.
 *
 * Pure: imported by the browser too.
 */
import type { Clip, Op, Sentence, VideoDoc, Word } from './edit';
import { findSection, type ShortOpts } from './shorts';

export interface CommandCtx {
  doc: VideoDoc;
  words: Word[];
  sentences: Sentence[];
  duration: number;
  /** The words currently selected in the transcript, if any. */
  selection?: { s: number; e: number } | null;
  /** The Short open in the editor, if any. */
  clipId?: string | null;
}

export interface CommandResult {
  ops: Op[];
  reply: string;
  undo?: boolean;
  redo?: boolean;
  /** A new thumbnail is asked for — the caller queues it. */
  thumbnail?: { target: string };
  /** Shorts to render again after this change. */
  rerender?: string[];
  understood: boolean;
}

const ORDINAL: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: -1 };

export const COMMAND_HELP = [
  'Remove the long pause at the beginning',
  'Restore my second example',
  'Make Short 3 faster',
  'Turn this section into another Short (select the words first)',
  'Find the section about pricing',
  'Make captions smaller · bigger · move captions to the top',
  'Create another thumbnail',
  'Keep this pause (select it first)',
  'Undo · Redo',
];

function clipByRef(t: string, clips: Clip[], current?: string | null): Clip | null {
  const n = t.match(/\b(?:short|clip|reel)\s*#?(\d{1,2})\b/);
  if (n) return clips[Number(n[1]) - 1] ?? null;
  const o = t.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last)\s+(?:short|clip|reel)\b/);
  if (o) return ORDINAL[o[1]] === -1 ? clips[clips.length - 1] ?? null : clips[ORDINAL[o[1]] - 1] ?? null;
  if (/\bthis (short|clip|reel)\b/.test(t) && current) return clips.find(c => c.id === current) ?? null;
  return null;
}

export function parseVideoCommand(input: string, ctx: CommandCtx): CommandResult {
  const t = ` ${input.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim()} `;
  const no = (reply: string): CommandResult => ({ ops: [], reply, understood: true });
  const opts: ShortOpts = { count: 1, min: ctx.doc.shorts.min, max: ctx.doc.shorts.max, aspect: ctx.doc.shorts.aspect };

  if (/^\s*(undo|go back|revert)\b/.test(t)) return { ops: [], reply: 'Undone.', undo: true, understood: true };
  if (/^\s*redo\b/.test(t)) return { ops: [], reply: 'Redone.', redo: true, understood: true };

  /* Music is not in this version. Saying so is the feature. */
  if (/\bmusic\b/.test(t)) return no('There is no background music in this project yet — music arrives in a later version, with uploaded tracks and their licences.');
  if (/\beye[- ]?contact\b/.test(t)) return no('Eye-contact correction needs a provider that is not set up, so it is not available. Nothing was changed.');

  /* The opening pause. */
  if (/\b(pause|silence|gap|wait|dead air)\b/.test(t) && /\b(beginning|start|opening|intro)\b/.test(t) && /\b(remove|cut|delete|trim|shorten|get rid)\b/.test(t)) {
    const first = ctx.words[0];
    if (!first || first.s < 0.6) return no('There is no long pause at the beginning — the first word starts straight away.');
    return { ops: [{ op: 'cut.add', s: 0, e: Math.max(0, first.s - 0.3), reason: 'Opening pause removed (you asked)' }], reply: `Removed the first ${(first.s - 0.3).toFixed(1)} s before you start speaking.`, understood: true };
  }

  /* Keep / protect the selection. */
  if (/\b(keep|protect|don't cut|do not cut|leave)\b/.test(t) && /\b(this|that|selection|selected|pause|part|section)\b/.test(t)) {
    if (!ctx.selection) return no('Select the part to keep in the transcript first, then ask again.');
    return { ops: [{ op: 'protect.add', s: ctx.selection.s, e: ctx.selection.e, note: 'Kept (you asked)' }, { op: 'cut.restoreRange', s: ctx.selection.s, e: ctx.selection.e }],
      reply: 'Protected — nothing in that part will be cut, now or by a later cleanup.', understood: true };
  }

  /* Restore the Nth example (or a selection). */
  if (/\b(restore|bring back|put back|undelete)\b/.test(t)) {
    if (/\b(this|that|selection|selected)\b/.test(t) && ctx.selection) {
      return { ops: [{ op: 'cut.restoreRange', s: ctx.selection.s, e: ctx.selection.e }], reply: 'Restored the selected part.', understood: true };
    }
    const m = t.match(/\b(first|second|third|fourth|fifth|last)\s+(example|story|point|question|tip)\b/);
    if (m) {
      const noun = m[2];
      const marks = noun === 'example' ? /\b(example|for instance|for example|e\.g\.)\b/i : new RegExp(`\\b${noun}`, 'i');
      const found = ctx.sentences.filter(s => marks.test(s.text));
      const k = ORDINAL[m[1]];
      const s = k === -1 ? found[found.length - 1] : found[k - 1];
      if (!s) return no(`I could not find a ${m[1]} ${noun} in the transcript — select it and say “restore this”.`);
      const next = ctx.sentences[s.i + 1];
      const end = next && next.s - s.e < 1.5 ? next.e : s.e;
      return { ops: [{ op: 'cut.restoreRange', s: s.s, e: end }], reply: `Restored the ${m[1]} ${noun} (“${s.text.slice(0, 70)}…”).`, understood: true };
    }
    return no('Say what to restore — “restore my second example” — or select it and say “restore this”.');
  }

  /* Faster: take the pauses and fillers out of one Short. */
  if (/\b(faster|tighter|snappier|quicker|speed up)\b/.test(t)) {
    const clip = clipByRef(t, ctx.doc.clips, ctx.clipId);
    if (!clip) return no('Which Short? Say “make Short 2 faster”.');
    const inside = ctx.doc.cuts.filter(c => c.by === 'rule' && c.state === 'proposed' && (c.kind === 'gap' || c.kind === 'filler') && c.s >= clip.s && c.e <= clip.e);
    const extra: Op[] = [];
    for (let j = 0; j + 1 < ctx.words.length; j++) {
      const a = ctx.words[j], b = ctx.words[j + 1];
      if (a.e < clip.s || b.s > clip.e) continue;
      if (b.s - a.e > 0.45 && !inside.some(c => c.s <= a.e + 0.2 && c.e >= b.s - 0.2)) extra.push({ op: 'cut.add', s: a.e + 0.12, e: b.s - 0.08, reason: `Pause tightened in “${clip.title}”` });
    }
    if (!inside.length && !extra.length) return no(`“${clip.title}” has no pauses or fillers left to take out.`);
    const ops: Op[] = [...(inside.length ? [{ op: 'cut.setMany' as const, ids: inside.map(c => c.id), state: 'approved' as const }] : []), ...extra];
    return { ops, reply: `Tightened “${clip.title}”: ${inside.length + extra.length} pause${inside.length + extra.length === 1 ? '' : 's'} and fillers taken out. It will render again.`, rerender: [clip.id], understood: true };
  }

  /* A new Short from the selection, or about a subject. */
  if (/\b(into|as|make)\b.*\b(another|new|a)\s+(short|clip|reel)\b/.test(t) && /\b(this|that|selection|selected)\b/.test(t)) {
    if (!ctx.selection) return no('Select the words for the new Short in the transcript first.');
    return { ops: [{ op: 'clip.add', s: ctx.selection.s, e: ctx.selection.e, title: 'Your selection', reason: 'Chosen by you' }], reply: 'Added a Short from your selection.', understood: true };
  }
  const about = t.match(/\b(?:about|on|covering|where i talk about|regarding)\s+(.{2,80}?)\s*[.?!]?\s*$/);
  if (about && /\b(find|make|create|another|short|clip|reel|section|part|strongest|best)\b/.test(t)) {
    const hit = findSection(about[1], ctx.sentences, opts);
    if (!hit) return no(`“${about[1].trim()}” is not talked about in this recording, so there is no section to make a Short from.`);
    const title = about[1].trim().replace(/^the\s+/, '');
    return { ops: [{ op: 'clip.add', s: hit.s, e: hit.e, title: title.charAt(0).toUpperCase() + title.slice(1), topic: hit.terms.join(' '), reason: `Where “${hit.terms.join(' ')}” is talked about most` }],
      reply: `Found it at ${Math.floor(hit.s / 60)}:${String(Math.floor(hit.s % 60)).padStart(2, '0')} — added as a new Short (${Math.round(hit.e - hit.s)} s).`, understood: true };
  }

  /* Remove a part by its subject: "remove the part about the weather". */
  const rm = t.match(/\b(?:remove|cut|delete)\s+(?:the\s+)?(?:part|section|bit|sentence|sentences)\s+(?:about|on|where i talk about)\s+(.{2,80}?)\s*[.?!]?\s*$/);
  if (rm) {
    const hit = findSection(rm[1], ctx.sentences, { ...opts, min: 1, max: 600 });
    if (!hit) return no(`I could not find “${rm[1].trim()}” in the transcript.`);
    return { ops: [{ op: 'cut.add', s: hit.s, e: hit.e, reason: `Part about “${rm[1].trim()}” removed (you asked)` }], reply: `Removed ${Math.round(hit.e - hit.s)} s about “${rm[1].trim()}”. Say “undo” to bring it back.`, understood: true };
  }

  /* Captions. */
  if (/\b(captions?|subtitles?)\b/.test(t)) {
    const target: 'long' | 'short' = /\b(long|main|full)\b/.test(t) ? 'long' : 'short';
    const st = ctx.doc.captions[target];
    if (/\b(smaller|less big|reduce|shrink)\b/.test(t)) return { ops: [{ op: 'caption.style', target, patch: { size: Math.max(0.6, Math.round((st.size - 0.15) * 100) / 100) } }], reply: `Captions smaller on the ${target === 'long' ? 'long video' : 'Shorts'}.`, understood: true };
    if (/\b(bigger|larger|increase)\b/.test(t)) return { ops: [{ op: 'caption.style', target, patch: { size: Math.min(1.6, Math.round((st.size + 0.15) * 100) / 100) } }], reply: `Captions bigger on the ${target === 'long' ? 'long video' : 'Shorts'}.`, understood: true };
    const pos = t.match(/\b(top|middle|center|centre|bottom)\b/);
    if (pos) { const p = pos[1] === 'top' ? 'top' : pos[1] === 'bottom' ? 'bottom' : 'middle'; return { ops: [{ op: 'caption.style', target, patch: { position: p } }], reply: `Captions moved to the ${p}.`, understood: true }; }
    if (/\b(off|remove|hide|no)\b/.test(t)) return { ops: [{ op: 'captions.set', on: false }], reply: 'Captions are off. The caption files stay available to download.', understood: true };
    if (/\b(on|add|show)\b/.test(t)) return { ops: [{ op: 'captions.set', on: true, burn: true }], reply: 'Captions are on.', understood: true };
    if (/\bbox(ed)?\b/.test(t)) return { ops: [{ op: 'caption.style', target, patch: { preset: 'boxed' } }], reply: 'Captions now sit on a box.', understood: true };
  }

  if (/\b(another|new|more|different)\s+thumbnails?\b|\bthumbnails?\s+again\b/.test(t)) {
    const clip = clipByRef(t, ctx.doc.clips, ctx.clipId);
    return { ops: [], reply: 'Making another set of thumbnails.', thumbnail: { target: clip ? clip.id : ctx.clipId ?? 'long' }, understood: true };
  }

  return { ops: [], reply: `I can't do that yet. You can ask: ${COMMAND_HELP.join(' · ')}.`, understood: false };
}
