/**
 * The camera and the shared screen read frame by frame from their tracks,
 * not through a <video> element.
 *
 * ── Why ──
 *
 * The recorder draws the screen and the camera onto its canvas from the
 * frame clock. Read through a <video>, what drawImage gets is whatever the
 * element last *painted* — and Chrome stops painting a video element of a
 * page that is not on screen. Recording another window is exactly when the
 * recorder's own tab is in the background, so the screen and the camera
 * froze, came back, froze again: the recording looked stuck, a frame held
 * then a jump. MediaStreamTrackProcessor hands over every frame the capture
 * makes, whether the page is seen or not, and without the element's own
 * buffering delay.
 *
 * Only the newest frame is kept; the one before is closed the moment a new
 * one arrives. A camera has a small pool of frames — one not closed stalls
 * it, which is the very freeze this is here to cure. Browsers without it
 * (Firefox, Safari) draw from the element as before.
 */
type Processor = new (init: { track: MediaStreamTrack; maxBufferSize?: number }) => { readable: ReadableStream<VideoFrame> };
const Proc = (): Processor | null => (globalThis as { MediaStreamTrackProcessor?: Processor }).MediaStreamTrackProcessor ?? null;

export const canReadTracks = () => typeof Proc() === 'function' && typeof VideoFrame !== 'undefined';

export class TrackFeed {
  frame: VideoFrame | null = null;
  videoWidth = 0;
  videoHeight = 0;
  /** Frames received — a feed whose count stops moving has stopped. */
  count = 0;
  readonly track: MediaStreamTrack;
  private reader: ReadableStreamDefaultReader<VideoFrame>;
  private dead = false;

  constructor(track: MediaStreamTrack) {
    this.track = track;
    const P = Proc()!;
    this.reader = new P({ track, maxBufferSize: 1 }).readable.getReader();
    void this.pump();
  }

  private async pump() {
    while (!this.dead) {
      let r: ReadableStreamReadResult<VideoFrame>;
      try { r = await this.reader.read(); } catch { break; }
      if (r.done) break;
      const f = r.value;
      if (this.dead) { f.close(); break; }
      const old = this.frame;
      this.frame = f;
      this.videoWidth = f.displayWidth; this.videoHeight = f.displayHeight;
      this.count++;
      old?.close();
    }
  }

  close() {
    this.dead = true;
    void this.reader.cancel().catch(() => {});
    this.frame?.close();
    this.frame = null;
    this.videoWidth = this.videoHeight = 0;
  }
}

/** What the compositor draws from: a feed of frames, or (where there is none) the element. */
export type Feed = HTMLVideoElement | TrackFeed;
export const pic = (f: Feed): CanvasImageSource => f instanceof TrackFeed ? f.frame! : f;
export const ready = (f: Feed | null): f is Feed => !!f && f.videoWidth > 0 && (!(f instanceof TrackFeed) || !!f.frame);

/** A feed for a stream's picture, or null where frames cannot be read (the element is used). */
export function feedOf(s: MediaStream | null): TrackFeed | null {
  const t = s?.getVideoTracks()[0];
  if (!t || t.readyState !== 'live' || !canReadTracks()) return null;
  try { return new TrackFeed(t); } catch { return null; }
}
