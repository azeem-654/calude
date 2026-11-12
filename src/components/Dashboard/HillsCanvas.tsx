/**
 * Rolling green hills, flown over slowly — the dashboard hero's ground.
 *
 * The owner's reference (2026-11-12) was a video of a camera gliding low
 * over soft, grassy hills under a pale mint sky. This is an original,
 * procedural take on that idea, not the footage: one WebGL fragment shader
 * that ray-marches a height field made of layered value noise, shades it
 * with two greens and a fine "fur" noise, and fades it into the sky with
 * distance. The camera moves forward a little each frame.
 *
 * ── Cost ──
 *
 * Drawn at a reduced resolution (≤ 0.75 of the CSS size, capped at 1200 px
 * wide) and stretched — the hills are soft, so nobody sees the difference,
 * and a phone stays cool. It stops drawing when the hero is off screen
 * (`active` false), when the tab is hidden, and when the page has scrolled
 * far enough that the ground has faded out. Under reduced motion one frame
 * is drawn and nothing moves. Without WebGL the CSS sky and a painted hill
 * line underneath stand in (dashboard.css `.dash-hero-fallback`).
 */
import { useEffect, useRef, useState } from 'react';

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
uniform vec2 r;
uniform float t;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.02 + 7.1; a *= 0.5; } return v; }
float height(vec2 p){ return fbm(p * 0.16) * 3.4 + noise(p * 0.7) * 0.22; }
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * r) / r.y;
  vec3 sky = mix(vec3(0.86, 0.92, 0.90), vec3(0.95, 0.97, 0.96), clamp(uv.y + 0.5, 0.0, 1.0));
  /* Above the tallest crest, the horizon a little under the middle: sky
     behind the words, hills across the lower part. */
  vec3 ro = vec3(0.0, 4.3, t);
  vec3 rd = normalize(vec3(uv.x, uv.y + 0.03, 1.15));
  float d = 0.4; float hit = 0.0; vec3 pos = ro;
  for (int i = 0; i < 90; i++) {
    pos = ro + rd * d;
    float h = height(pos.xz);
    float gap = pos.y - h;
    if (gap < 0.004 * d) { hit = 1.0; break; }
    d += max(0.03 + d * 0.006, gap * 0.5);
    if (d > 60.0) break;
  }
  /* A ray that ran out of steps grazing a far crest is ground, not sky —
     drawn as sky it left a speckled seam along the horizon. */
  if (hit < 0.5 && d <= 60.0) hit = 1.0;
  vec3 col = sky;
  if (hit > 0.5) {
    vec2 e = vec2(0.06, 0.0);
    vec3 n = normalize(vec3(height(pos.xz - e.xy) - height(pos.xz + e.xy), 2.0 * e.x, height(pos.xz - e.yx) - height(pos.xz + e.yx)));
    float sun = clamp(dot(n, normalize(vec3(-0.4, 0.8, -0.35))), 0.0, 1.0);
    /* Fine grass where it is near, fading out with distance so it never shimmers. */
    float near = clamp(1.0 - d / 22.0, 0.0, 1.0);
    float fur = mix(0.5, noise(pos.xz * 6.0) * 0.6 + noise(pos.xz * 15.0) * 0.4, near);
    vec3 deep = vec3(0.04, 0.24, 0.12);
    vec3 lit = vec3(0.32, 0.62, 0.30);
    col = mix(deep, lit, sun * 0.85 + 0.1) * (0.8 + 0.3 * fur);
    col = mix(col, col * vec3(1.08, 1.12, 0.9), smoothstep(2.0, 3.6, pos.y));
    float fog = 1.0 - exp(-d * 0.032);
    col = mix(col, sky, clamp(fog, 0.0, 1.0));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
}

export default function HillsCanvas({ active, still }: { active: boolean; still: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const state = useRef({ active, still });
  useEffect(() => { state.current = { active, still }; }, [active, still]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false }) as WebGLRenderingContext | null;
    if (!gl) { setFailed(true); return; }
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) { setFailed(true); return; }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { setFailed(true); return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(prog, 'r');
    const uT = gl.getUniformLocation(prog, 't');

    const size = () => {
      const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      const scale = Math.min(0.75, 1200 / w);
      const W = Math.max(64, Math.round(w * scale)), H = Math.max(48, Math.round(h * scale));
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      /* Every draw: a buffer resized without it kept the old viewport and
         left a strip of the canvas unpainted. */
      gl.viewport(0, 0, W, H);
      gl.uniform2f(uR, W, H);
    };
    /* A fixed starting point, so the first frame (and the still one) is always a good view. */
    let flown = 4;
    let last = performance.now();
    let raf = 0;
    const draw = () => { size(); gl.uniform1f(uT, flown); gl.drawArrays(gl.TRIANGLES, 0, 3); };
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { active: on, still: frozen } = state.current;
      if (on && !frozen && !document.hidden) { flown += dt * 0.55; draw(); }
      raf = requestAnimationFrame(frame);
    };
    draw();
    raf = requestAnimationFrame(frame);
    /* The hero settles its height after the first paint (fonts, the greeting),
       so the canvas is watched itself, not only the window. */
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    ro?.observe(canvas);
    const lost = (e: Event) => { e.preventDefault(); setFailed(true); };
    canvas.addEventListener('webglcontextlost', lost);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      canvas.removeEventListener('webglcontextlost', lost);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  if (failed) return <div className="dash-hero-fallback" aria-hidden="true" />;
  return <canvas ref={ref} className="dash-hero-canvas" aria-hidden="true" data-noinvert="" />;
}
