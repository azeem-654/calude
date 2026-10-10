/**
 * A video's edit as an editor's timeline — Final Cut Pro 7 XML ("xmeml"),
 * which Premiere Pro and DaVinci Resolve both import. Pure; the browser makes
 * the file, so nothing is stored.
 *
 * The timeline is the cut list itself: one clip per kept stretch of the
 * original recording, back to back. It points at the recording by its file
 * name — the editor asks the customer to find it on their own disk ("relink"),
 * because their copy, not ours, is the one they will finish from. Captions,
 * music, zooms and colour are the render's and are not in the XML; it says so
 * in the sequence's name rather than pretending they travel.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toXmeml(o: {
  name: string; sourceName: string; keeps: [number, number][]; fps: number; width: number; height: number; duration: number; hasAudio: boolean;
}): string {
  const fps = Math.round(o.fps) || 30;
  const f = (t: number) => Math.round(t * fps);
  const total = o.keeps.reduce((n, [a, b]) => n + f(b) - f(a), 0);
  const file = (first: boolean) => first
    ? `<file id="src-1"><name>${esc(o.sourceName)}</name><pathurl>file://localhost/${encodeURIComponent(o.sourceName)}</pathurl><rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate><duration>${f(o.duration)}</duration>` +
      `<media><video><samplecharacteristics><width>${o.width}</width><height>${o.height}</height></samplecharacteristics></video>${o.hasAudio ? '<audio><channelcount>2</channelcount></audio>' : ''}</media></file>`
    : '<file id="src-1"/>';
  let at = 0;
  const video: string[] = [], audio: string[] = [];
  o.keeps.forEach(([a, b], i) => {
    const len = f(b) - f(a);
    const common = `<name>${esc(o.sourceName)}</name><duration>${f(o.duration)}</duration><rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate><start>${at}</start><end>${at + len}</end><in>${f(a)}</in><out>${f(b)}</out>`;
    video.push(`<clipitem id="v-${i + 1}">${common}${file(i === 0)}</clipitem>`);
    if (o.hasAudio) audio.push(`<clipitem id="a-${i + 1}">${common}<file id="src-1"/><sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack></clipitem>`);
    at += len;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE xmeml>',
    '<xmeml version="4">',
    `<sequence id="seq-1"><name>${esc(o.name)} — cuts only (captions, music and effects are in the rendered file)</name><duration>${total}</duration>`,
    `<rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>`,
    `<media><video><format><samplecharacteristics><width>${o.width}</width><height>${o.height}</height><rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate></samplecharacteristics></format><track>${video.join('')}</track></video>`,
    o.hasAudio ? `<audio><track>${audio.join('')}</track></audio>` : '',
    '</media></sequence>',
    '</xmeml>',
  ].join('\n');
}

/**
 * The AI's editorial reading of a Short (hook, clarity, relevance,
 * completeness, each 1–5) as one figure out of 100 and four letter grades.
 * It is how well the passage stands alone as a Short — never a forecast of
 * views; a Short chosen by rule or by hand has no score and is not given one.
 */
export function editorialScore(s: { hook: number; clarity: number; relevance: number; completeness: number } | null): { total: number; grades: { label: string; grade: string }[] } | null {
  if (!s) return null;
  const g = (n: number) => (n >= 4.75 ? 'A' : n >= 4.25 ? 'A-' : n >= 3.75 ? 'B+' : n >= 3.25 ? 'B' : n >= 2.75 ? 'B-' : n >= 2.25 ? 'C' : 'D');
  const total = Math.round(((s.hook * 0.35 + s.clarity * 0.2 + s.relevance * 0.25 + s.completeness * 0.2) - 1) / 4 * 100);
  return { total, grades: [{ label: 'Hook', grade: g(s.hook) }, { label: 'Flow', grade: g(s.clarity) }, { label: 'Value', grade: g(s.relevance) }, { label: 'Whole', grade: g(s.completeness) }] };
}
