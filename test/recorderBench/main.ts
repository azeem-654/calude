/*
 * The camera-background harness (test/recorderBench.e2e.mjs builds and drives it):
 * MediaPipe's sample portrait panned as a moving head (or still), a frame number
 * stamped on the shirt, drawn through CameraFx with the background removed to
 * pure green, and every third output frame scored against the ground-truth
 * mask of the frame actually shown: the share of the person drawn as
 * background (a blurred face), of the head alone, and of the room kept as
 * person (bleed); the share of frames drawn with their own outline
 * (`pairedShare`); plus the page-thread cost of a draw and stalls over 50 ms.
 * `tune=perf` runs the Performance trade (no pairing, the wider outline).
 */
import * as CF from 'SRC/components/VideoStudio/cameraFx';
const { CameraFx, NO_FX } = CF;
const W = 960, H = 540, SW = 1100;
const q = new URLSearchParams(location.search);
const MOVE = q.get('move') !== '0', SECS = Number(q.get('secs') || 15), BG = q.get('bg') || 'remove', TUNE = q.get('tune') || '';
const load = async (u: string) => createImageBitmap(await (await fetch(u)).blob());
const x0 = (k: number) => MOVE ? 70 + 70 * Math.sin(2 * Math.PI * (k / 30) / 1.5) : 70;
(async () => {
  const P = await load('/portrait.jpg'), M = await load('/mask.jpg');
  const SH = Math.round(P.height * SW / P.width);
  const big = new OffscreenCanvas(SW, SH); big.getContext('2d')!.drawImage(P, 0, 0, SW, SH);
  const bigM = new OffscreenCanvas(SW, SH); bigM.getContext('2d')!.drawImage(M, 0, 0, SW, SH);
  const src = document.createElement('canvas'); src.width = W; src.height = H;
  const sctx = src.getContext('2d')!;
  let k = -1;
  Object.defineProperty(src, 'videoWidth', { value: W }); Object.defineProperty(src, 'videoHeight', { value: H });
  Object.defineProperty(src, 'currentTime', { get: () => k / 30 });
  const drawSrc = (n: number) => {
    sctx.drawImage(big, -Math.round(x0(n)), 0);
    for (let b = 0; b < 8; b++) { sctx.fillStyle = (n % 256) >> b & 1 ? '#fff' : '#000'; sctx.fillRect(432 + b * 12, 510, 12, 12); }
  };
  const out = document.createElement('canvas'); out.width = W; out.height = H; document.body.appendChild(out);
  const octx = out.getContext('2d', { alpha: false, willReadFrequently: false })!;
  const fx = new CameraFx();
  /* A profile's own trade where the tree has it (perf, balanced, quality), else the older two-field shape. */
  const named = (CF as any).FX_TUNING?.[TUNE === 'perf' ? 'performance' : TUNE];
  if (TUNE && (fx as any).tuning) (fx as any).tuning = named ?? (TUNE === 'perf' ? { pair: false, maxRate: 15 } : { pair: true, maxRate: 30 });
  const cfg = { ...NO_FX, bg: BG as any, bgColor: '#00ff00', blur: 60 };
  const gt = new OffscreenCanvas(W, H), gctx = gt.getContext('2d', { willReadFrequently: true })!;
  const rd = document.createElement('canvas'); rd.width = W; rd.height = H; const rctx = rd.getContext('2d', { willReadFrequently: true })!;
  const t0 = performance.now(); let tick = 0;
  const drawMs: number[] = []; const res: { lost: number; lostHead: number; bleed: number; lag: number }[] = []; let undecoded = 0;
  const gaps: number[] = []; let lastTick = 0; let prevCls: Uint8Array | null = null; const flick: number[] = [];
  await new Promise<void>(done => {
    const step = () => {
      const now = performance.now();
      if (lastTick) gaps.push(now - lastTick); lastTick = now;
      const kk = Math.floor((now - t0) / (1000 / 30));
      if (kk !== k) { k = kk; drawSrc(k); }
      const a = performance.now();
      fx.draw(octx as any, src as any, { x: 0, y: 0, w: W, h: H }, false, cfg, null, false, now);
      const b = performance.now();
      const warm = now - t0 > 4000;
      if (warm) drawMs.push(b - a);
      if (warm && tick % 3 === 0 && BG === 'remove') {
        rctx.drawImage(out, 0, 0);
        const o = rctx.getImageData(0, 0, W, H).data;
        let bits = 0;
        for (let bb = 0; bb < 8; bb++) { const i = ((516) * W + 432 + bb * 12 + 6) * 4; if (o[i] > 128 && o[i + 1] > 128) bits |= 1 << bb; }
        let shown = -1;
        for (let c = k; c >= k - 20; c--) if ((c % 256) === bits) { shown = c; break; }
        if (shown < 0) undecoded++;
        else {
          gctx.clearRect(0, 0, W, H); gctx.drawImage(bigM, -Math.round(x0(shown)), 0);
          const g = gctx.getImageData(0, 0, W, H).data;
          let pin = 0, lost = 0, hin = 0, hlost = 0, bin = 0, bleed = 0;
          for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
            if (y >= 500) continue;
            const i = (y * W + x) * 4, gv = g[i] / 255;
            const green = o[i + 1] - Math.max(o[i], o[i + 2]);
            if (gv > 0.75) { pin++; if (green > 100) lost++; if (y < 420) { hin++; if (green > 100) hlost++; } }
            else if (gv < 0.25) { bin++; if (green < 60) bleed++; }
          }
          const fa = fx as any; res.push({ lost: lost / pin, lostHead: hlost / hin, bleed: bleed / bin, lag: k - shown, pairedNow: !!(fa.paired && fa.pairOk && now - fa.pairAt < 150), pairAge: now - (fa.pairAt ?? 0) } as any);
          if (!MOVE) {
            const cls = new Uint8Array((W / 2) * (H / 2)); let ch = 0, n = 0;
            for (let y = 0, j = 0; y < H; y += 2) for (let x = 0; x < W; x += 2, j++) { const i = (y * W + x) * 4; cls[j] = o[i + 1] - Math.max(o[i], o[i + 2]) > 80 ? 1 : 0; if (prevCls) { n++; if (cls[j] !== prevCls[j]) ch++; } }
            if (prevCls) flick.push(ch / n); prevCls = cls;
          }
        }
      }
      tick++;
      if (now - t0 > (SECS + 4) * 1000) { done(); return; }
      setTimeout(step, Math.max(0, t0 + tick * (1000 / 30) - performance.now()));
    };
    step();
  });
  const avg = (v: number[]) => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
  const p95 = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length * 0.95)] ?? 0; };
  const r = {
    move: MOVE, bg: BG, frames: res.length, undecoded,
    lostPct: avg(res.map(x => x.lost)) * 100, lostP95: p95(res.map(x => x.lost)) * 100,
    headLostPct: avg(res.map(x => x.lostHead)) * 100, headLostP95: p95(res.map(x => x.lostHead)) * 100,
    bleedPct: avg(res.map(x => x.bleed)) * 100, pairedShare: avg(res.map((x: any) => x.pairedNow ? 1 : 0)), lostWhenPaired: avg(res.filter((x: any) => x.pairedNow).map(x => x.lost)) * 100, lostWhenNot: avg(res.filter((x: any) => !x.pairedNow).map(x => x.lost)) * 100, pairAgeP95: p95(res.map((x: any) => x.pairAge)), flickerPct: avg(flick) * 100, lagFrames: avg(res.map(x => x.lag)),
    drawAvg: avg(drawMs), drawP95: p95(drawMs), tickGapP95: p95(gaps), longGaps: gaps.filter(g => g > 50).length,
    fx: (fx as any).stats ? (fx as any).stats() : { state: fx.state },
  };
  (window as any).__result = r;
  const img = out.toDataURL('image/png'); (window as any).__png = img;
})().catch(e => { (window as any).__result = { error: String(e) }; });
