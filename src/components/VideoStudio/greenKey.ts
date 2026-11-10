/**
 * The green screen, keyed in the preview (2026-11; before, the panel said
 * "the key is in the render" and the customer saw the green backdrop until
 * the file came back). A small WebGL program takes the playing element,
 * drops every pixel near the key colour onto the background colour and
 * takes the colour spill off the edges — the same three numbers the engine
 * gives FFmpeg's `chromakey` (colour, similarity, blend) and `despill`.
 *
 * FFmpeg measures similarity in the chroma plane: the distance between the
 * pixel's (U, V) and the key's, over the plane's span, is compared with
 * `similarity`; alpha fades over `blend` beyond it. The same formula runs
 * here per pixel on the graphics chip, so a key that is right in the
 * preview is right in the render.
 *
 * Without WebGL (`GreenKey.ok` false) the caller leaves the footage as it
 * is and the badge says the key is in the render, as before.
 */
export interface KeyParams { color: string; similarity: number; blend: number; bg: string }

const VS = `attribute vec2 p; varying vec2 t; void main(){ t = vec2((p.x+1.)/2., (1.-p.y)/2.); gl_Position = vec4(p,0.,1.); }`;
const FS = `precision mediump float; varying vec2 t; uniform sampler2D u; uniform vec3 key; uniform vec3 bg; uniform float sim; uniform float blend; uniform float blue;
vec2 uv(vec3 c){ return vec2(-0.14713*c.r - 0.28886*c.g + 0.436*c.b, 0.615*c.r - 0.51499*c.g - 0.10001*c.b); }
void main(){
  vec4 px = texture2D(u, t);
  float d = distance(uv(px.rgb), uv(key)) / 0.872;
  float a = blend > 0.0 ? clamp((d - sim) / blend, 0.0, 1.0) : step(sim, d);
  vec3 c = px.rgb;
  /* despill: the key colour's channel may not exceed the mean of the other two by much (mix 0.6). */
  float other = blue > 0.5 ? (c.r + c.g) / 2.0 : (c.r + c.b) / 2.0;
  if (blue > 0.5) { c.b = mix(c.b, min(c.b, other), 0.6); } else { c.g = mix(c.g, min(c.g, other), 0.6); }
  gl_FragColor = vec4(mix(bg, c, a), 1.0);
}`;

const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export class GreenKey {
  readonly ok: boolean;
  private gl: WebGLRenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  readonly canvas: HTMLCanvasElement;
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: false });
    this.ok = !!gl;
    if (!gl) return;
    this.gl = gl;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { this.ok = false; return; }
    this.prog = prog;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const p = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(p); gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    for (const n of ['u', 'key', 'bg', 'sim', 'blend', 'blue']) this.loc[n] = gl.getUniformLocation(prog, n);
  }
  /** Draw the element keyed; false when the element has no frame yet. */
  draw(v: HTMLVideoElement, k: KeyParams): boolean {
    const gl = this.gl;
    if (!gl || !this.prog || v.readyState < 2 || !v.videoWidth) return false;
    const w = Math.min(960, v.videoWidth), h = Math.round(w * v.videoHeight / v.videoWidth);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; gl.viewport(0, 0, w, h); }
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, v); } catch { return false; }
    const key = hexRgb(k.color), bg = hexRgb(k.bg);
    gl.uniform1i(this.loc.u, 0);
    gl.uniform3f(this.loc.key, key[0], key[1], key[2]);
    gl.uniform3f(this.loc.bg, bg[0], bg[1], bg[2]);
    gl.uniform1f(this.loc.sim, Math.max(0.001, k.similarity / 100));
    gl.uniform1f(this.loc.blend, Math.max(0, k.blend / 100));
    gl.uniform1f(this.loc.blue, key[2] > key[1] ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return true;
  }
  destroy() { const gl = this.gl; if (gl) { gl.getExtension('WEBGL_lose_context')?.loseContext(); } this.gl = null; }
}
