/* Protected Central — launch ad. Every frame is a pure function of time:
   window.render(t) paints the stage for second t, so a frame capture is exact
   and a cutdown is just a different list of times. */

/* ── Maths ───────────────────────────────────────────────────────────── */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lin = (t, a, b) => clamp((t - a) / (b - a));
const eo = x => 1 - Math.pow(1 - x, 3);
const eo5 = x => 1 - Math.pow(1 - x, 5);
const ei = x => x * x * x;
const eio = x => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const back = x => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const seg = (t, a, b, e = eo) => e(lin(t, a, b));
const mix = (a, b, p) => a + (b - a) * p;
const fmt = n => Math.round(n).toLocaleString('en-US');

/* ── Brand pieces, lifted from the product ───────────────────────────── */
const ico = (n, sz, col) => `<span class="ico" style="font-size:${sz}px;${col ? 'color:' + col : ''}">${ICONS[n] || ''}</span>`;
let gid = 0;
/* src/components/shared/Logo.tsx */
function LOGO(sz, tile = true) {
  const id = 'pcg' + (gid++);
  return `<svg width="${sz}" height="${sz}" viewBox="0 0 32 32" style="display:block;overflow:visible"><defs><linearGradient id="${id}" x1="6" y1="3" x2="26" y2="29" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#d6f96f"/><stop offset="0.55" stop-color="#c8f24d"/><stop offset="1" stop-color="#8fd9c4"/></linearGradient></defs>${tile ? '<rect width="32" height="32" rx="7.5" fill="#0f1210"/>' : ''}<path fill="url(#${id})" fill-rule="evenodd" d="M16 4.6 L25.4 8.1 V16.2 C25.4 21.6 21.6 25.9 16 27.9 C10.4 25.9 6.6 21.6 6.6 16.2 V8.1 Z M16 12.2 a3.9 3.9 0 1 0 0 7.8 a3.9 3.9 0 1 0 0 -7.8 Z"/></svg>`;
}
/* src/components/Autopilot/AutopilotBot.tsx, with its state driven by time. */
function BOT(sz) {
  const id = 'apb' + (gid++);
  return `<svg class="bot" viewBox="0 0 64 64" width="${sz}" height="${sz}" style="display:block;overflow:visible"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6d5ef0"/><stop offset="100%" stop-color="#4a36d6"/></linearGradient><radialGradient id="${id}h"><stop offset="0" stop-color="#22c55e" stop-opacity=".7"/><stop offset="1" stop-color="#22c55e" stop-opacity="0"/></radialGradient></defs>
  <circle class="b-halo" cx="32" cy="7" r="8" fill="url(#${id}h)"/>
  <line x1="32" y1="9" x2="32" y2="16" stroke="#5b46e5" stroke-width="2.4" stroke-linecap="round"/>
  <circle class="b-ant" cx="32" cy="7" r="3.4" fill="#22c55e"/>
  <rect x="11" y="16" width="42" height="34" rx="12" fill="url(#${id})"/>
  <rect x="6" y="27" width="4.5" height="11" rx="2.2" fill="#8b7cf5"/><rect x="53.5" y="27" width="4.5" height="11" rx="2.2" fill="#8b7cf5"/>
  <rect x="17" y="23" width="30" height="19" rx="9" fill="#12103a"/>
  <g class="b-eyes"><g class="b-gaze"><circle cx="26" cy="32.5" r="3.6" fill="#7dd3fc"/><circle cx="38" cy="32.5" r="3.6" fill="#7dd3fc"/></g></g>
  <clipPath id="${id}c"><rect x="17" y="23" width="30" height="19" rx="9"/></clipPath>
  <rect class="b-scan" clip-path="url(#${id}c)" x="17" y="23" width="7" height="19" rx="3.5" fill="#7dd3fc" opacity="0"/>
  <rect x="28" y="38.5" width="8" height="1.8" rx="0.9" fill="#3b3a6b"/></svg>`;
}
function animBot(root, t, busy = false, seed = 0) {
  root.querySelectorAll('svg.bot').forEach((svg, i) => {
    const tt = t + seed + i * 1.7;
    const period = 3.2, ph = tt % period;
    const blink = ph < 0.16 ? 1 - Math.sin((ph / 0.16) * Math.PI) * 0.9 : 1;
    const gx = busy ? Math.sin(tt * 4.2) * 2.6 : Math.sin(tt * 1.25) * 2.4 + Math.sin(tt * 0.53) * 0.8;
    const gy = busy ? Math.cos(tt * 3.1) * 0.6 : 0;
    svg.querySelector('.b-eyes').setAttribute('transform', `translate(0 32.5) scale(1 ${blink.toFixed(3)}) translate(0 -32.5)`);
    svg.querySelector('.b-gaze').setAttribute('transform', `translate(${gx.toFixed(2)} ${gy.toFixed(2)})`);
    const pulse = 0.5 + 0.5 * Math.sin(tt * (busy ? 9 : 3.2));
    svg.querySelector('.b-ant').setAttribute('r', (3.2 + pulse * 0.6).toFixed(2));
    svg.querySelector('.b-halo').setAttribute('opacity', (0.25 + pulse * 0.75).toFixed(2));
    const sc = svg.querySelector('.b-scan');
    if (busy) { const s = (tt * 1.4) % 1; sc.setAttribute('x', (13 + s * 34).toFixed(2)); sc.setAttribute('opacity', '0.28'); }
    else sc.setAttribute('opacity', '0');
  });
}

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const q = (root, s) => root.querySelector(s);
const setT = (node, s) => { if (node) node.style.transform = s; };
const show = (node, o) => { if (node) node.style.opacity = String(clamp(o)); };
function appear(node, t, a, dur = 0.45, dy = 22, sc = 0.97) {
  const p = seg(t, a, a + dur, eo);
  node.style.opacity = String(p);
  node.style.transform = `translateY(${(1 - p) * dy}px) scale(${mix(sc, 1, p)})`;
  return p;
}
const topbar = (crumb) => `<div class="topbar"><div class="brand">${LOGO(32)}Protected Central</div><div class="crumb">${crumb}</div><span class="pill demo">DEMO WORKSPACE</span></div>`;

/* ── Sound cues, read by the audio mixer ─────────────────────────────── */
window.SFX = [];
const sfx = (t, type, gain = 1) => window.SFX.push({ t, type, gain });

/* ── Headlines ───────────────────────────────────────────────────────── */
/* `~word` = blue→violet, `^word` = lime. A line starting `>` is a subline. */
const HEADS = [
  { a: 0.25, b: 2.05, lines: ["Your business shouldn't need", '~10 ~different ~tools.'] },
  { a: 2.95, b: 3.75, lines: ['Bring it all', 'to ^one ^place.'] },
  { a: 4.45, b: 8.55, lines: ['Tell AI', 'what ~you ~want.'] },
  { a: 8.8, b: 10.95, lines: ['Protected Central', '~builds ~the ~system.'] },
  { a: 11.45, b: 17.0, lines: ['~AI ~agents +', 'real workflows.', '>Working while you work.'], subDelay: 1.1 },
  { a: 17.45, b: 22.0, lines: ['Know every lead.', '~Every ~deal. ~Every ~next ~step.'] },
  { a: 22.45, b: 27.0, lines: ["Campaigns that don't", 'stop at ~Send.'] },
  { a: 27.45, b: 33.0, lines: ['Content moves from idea', 'to ~finished ~asset.'] },
  { a: 33.45, b: 36.45, lines: ['Sales. Marketing.', 'Content. Support.'] },
  { a: 36.6, b: 38.0, lines: ['^Connected.'], big: true },
  { a: 38.45, b: 40.7, lines: ["See what's", '~happening.'] },
  { a: 40.85, b: 43.0, lines: ["See what's", '~next.'] },
  { a: 43.45, b: 45.35, lines: ['Your business.', '^Your ^workspace.'] },
  { a: 45.5, b: 47.05, lines: ['Privacy and protection', '>built into the experience.'], subDelay: 0.25 },
  { a: 47.45, b: 50.0, lines: ['One ~intelligent', '~workspace.'] },
];
function buildHeads() {
  const head = document.getElementById('head');
  HEADS.forEach(h => {
    const box = el('<div class="hl"></div>');
    let wi = 0;
    h.lines.forEach(line => {
      const sub = line.startsWith('>');
      const ln = el(`<div class="line${sub ? ' sub' : ''}"></div>`);
      if (h.big) ln.style.fontSize = '104px';
      const words = (sub ? line.slice(1) : line).split(' ');
      words.forEach((w, i) => {
        let cls = '';
        if (w.startsWith('~')) { cls = 'grad-blue'; w = w.slice(1); }
        else if (w.startsWith('^')) { cls = 'grad-lime'; w = w.slice(1); }
        const s = el(`<span class="w ${cls}">${w}</span>`);
        s.dataset.i = wi++; s.dataset.sub = sub ? '1' : '';
        ln.appendChild(s);
        if (i < words.length - 1) ln.appendChild(document.createTextNode(' '));
      });
      box.appendChild(ln);
    });
    h.el = box; head.appendChild(box);
    sfx(h.a, 'whoosh_soft', 0.35);
  });
}
function renderHeads(t) {
  HEADS.forEach(h => {
    const on = t >= h.a - 0.01 && t <= h.b + 0.01;
    h.el.style.display = on ? 'flex' : 'none';
    if (!on) return;
    const out = seg(t, h.b - 0.32, h.b, ei);
    h.el.querySelectorAll('.w').forEach(w => {
      const i = +w.dataset.i;
      const st = h.a + i * 0.055 + (w.dataset.sub ? (h.subDelay ?? 0.3) : 0);
      const p = seg(t, st, st + 0.5, eo5);
      w.style.opacity = String(p * (1 - out));
      w.style.transform = `translateY(${((1 - p) * 38 - out * 18).toFixed(1)}px) scale(${mix(0.96, 1, p).toFixed(3)})`;
      w.style.filter = `blur(${((1 - p) * 10 + out * 8).toFixed(1)}px)`;
    });
  });
}

/* ── Scenes ──────────────────────────────────────────────────────────── */
const SCENES = [];
function scene(o) { SCENES.push(o); return o; }
function sceneFx(sc, t) {
  const r = sc.root;
  const on = t >= sc.a && t <= sc.b;
  r.style.display = on ? 'block' : 'none';
  if (!on) return false;
  const inP = sc.tin ? seg(t, sc.a, sc.a + sc.tin, eo) : 1;
  const outP = sc.tout ? seg(t, sc.b - sc.tout, sc.b, ei) : 0;
  const s = mix(sc.inScale ?? 0.9, 1, inP) * mix(1, sc.outScale ?? 1.16, outP);
  r.style.transformOrigin = sc.origin || '50% 55%';
  r.style.transform = `scale(${s.toFixed(4)})`;
  r.style.opacity = String(inP * (1 - outP));
  const blur = (1 - inP) * 10 + outP * 12;
  r.style.filter = blur > 0.05 ? `blur(${blur.toFixed(1)}px)` : 'none';
  return true;
}
const mount = (html) => { const r = el(`<div class="scene">${html}</div>`); document.getElementById('scenes').appendChild(r); return r; };

/* S1 — ten tools, then one. */
const FRAGS = [
  { n: 'CRM', i: 'users', x: 70, y: 720, r: -6, kind: 'rows' },
  { n: 'Email', i: 'mail', x: 700, y: 690, r: 5, kind: 'list' },
  { n: 'Calendar', i: 'calendar', x: 390, y: 800, r: -2, kind: 'grid' },
  { n: 'Q3 leads.xlsx', i: 'file-text', x: 40, y: 1060, r: 4, kind: 'sheet' },
  { n: 'Social', i: 'image', x: 720, y: 1000, r: -5, kind: 'img' },
  { n: 'Tasks', i: 'list-checks', x: 360, y: 1110, r: 3, kind: 'checks' },
  { n: 'Analytics', i: 'bar-chart-3', x: 110, y: 1330, r: -3, kind: 'bars' },
  { n: 'Support', i: 'life-buoy', x: 690, y: 1320, r: 6, kind: 'chat' },
  { n: 'Pipeline', i: 'kanban', x: 400, y: 1410, r: -4, kind: 'cols' },
  { n: 'Inbox (214)', i: 'inbox', x: 250, y: 1560, r: 2, kind: 'list' },
];
function fragBody(k) {
  const rows = (n, w) => Array.from({ length: n }, (_, i) => `<div class="row" style="width:${w ? w[i % w.length] : 100}%"></div>`).join('');
  if (k === 'grid') return `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px">${Array.from({ length: 15 }, (_, i) => `<div style="height:22px;border-radius:5px;background:${[2, 6, 11].includes(i) ? '#c7d2fe' : '#eef0f5'}"></div>`).join('')}</div>`;
  if (k === 'sheet') return `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:2px">${Array.from({ length: 16 }, (_, i) => `<div style="height:18px;background:${i < 4 ? '#dcfce7' : '#f3f4f6'}"></div>`).join('')}</div>`;
  if (k === 'img') return `<div style="height:96px;border-radius:10px;background:linear-gradient(135deg,#fbcfe8,#c4b5fd)"></div>${rows(1, [60])}`;
  if (k === 'bars') return `<div style="display:flex;align-items:flex-end;gap:7px;height:90px">${[40, 62, 35, 80, 55, 92, 70].map(h => `<div style="flex:1;height:${h}%;border-radius:4px;background:#bfdbfe"></div>`).join('')}</div>`;
  if (k === 'chat') return `<div class="row" style="width:70%;height:22px;border-radius:11px"></div><div class="row" style="width:55%;height:22px;border-radius:11px;margin-left:auto;background:#ddd6fe"></div><div class="row" style="width:62%;height:22px;border-radius:11px"></div>`;
  if (k === 'cols') return `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px">${Array.from({ length: 4 }, (_, c) => `<div style="display:grid;gap:4px">${Array.from({ length: 3 - (c % 2) }, () => '<div style="height:18px;border-radius:4px;background:#e0e7ff"></div>').join('')}</div>`).join('')}</div>`;
  if (k === 'checks') return Array.from({ length: 4 }, (_, i) => `<div style="display:flex;gap:7px;align-items:center"><div style="width:14px;height:14px;border-radius:4px;border:2px solid #cbd5e1;background:${i < 1 ? '#86efac' : '#fff'}"></div><div class="row" style="flex:1"></div></div>`).join('');
  if (k === 'rows') return Array.from({ length: 4 }, () => `<div style="display:flex;gap:8px;align-items:center"><div style="width:20px;height:20px;border-radius:50%;background:#e0e7ff"></div><div class="row" style="flex:1"></div></div>`).join('');
  return rows(5, [100, 80, 92, 70, 85]);
}
const s1 = scene({ a: 0, b: 4.4, tout: 0 });
s1.root = mount(`
  ${FRAGS.map((f, i) => `<div class="frag" id="fr${i}" style="left:${f.x}px;top:${f.y}px"><div class="fbar"><i></i><i></i><i></i><span style="margin-left:6px;display:flex;align-items:center;gap:6px">${ico(f.i, 15, '#5b6475')}${f.n}</span></div><div class="fbody">${fragBody(f.kind)}</div></div>`).join('')}
  <div class="abs" id="s1ring" style="left:540px;top:1000px;width:10px;height:10px;border-radius:50%;border:3px solid rgba(214,249,111,.9);opacity:0"></div>
  <div class="abs" id="s1logo" style="left:540px;top:1000px;width:0;height:0;">
    <div id="s1mark" style="position:absolute;left:-110px;top:-110px;width:220px;height:220px">${LOGO(220, false)}</div>
  </div>
  <div class="abs" id="s1word" style="left:0;right:0;top:1150px;text-align:center;color:#fff;font-size:66px;font-weight:800;letter-spacing:-0.04em;opacity:0">Protected Central</div>
`);
s1.root.style.zIndex = 5;
FRAGS.forEach((f, i) => { f.el = q(s1.root, '#fr' + i); f.d = 0.05 + i * 0.07; sfx(f.d, 'pop', 0.25); });
sfx(2.28, 'bass_hit', 1); sfx(1.85, 'whoosh_in', 0.8);
s1.render = (t) => {
  const r = s1.root;
  FRAGS.forEach((f, i) => {
    const pin = seg(t, f.d, f.d + 0.35, back);
    const col = seg(t, 1.85 + i * 0.012, 2.3, ei);
    const jx = Math.sin(t * 2.3 + i * 1.7) * 14 + Math.sin(t * 5.1 + i) * 4;
    const jy = Math.cos(t * 1.9 + i * 2.1) * 12;
    const cx = 540 - 150 - f.x, cy = 1000 - 80 - f.y;
    const x = jx * (1 - col) + cx * col, y = jy * (1 - col) + cy * col;
    const rot = f.r * (1 + Math.sin(t * 1.3 + i) * 0.4) * (1 - col);
    const sc = pin * mix(1, 0.12, col) * (1 + Math.sin(t * 3 + i) * 0.015);
    f.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
    f.el.style.opacity = String(clamp(pin * 1.3) * (1 - seg(t, 2.1, 2.32)));
  });
  const ring = q(r, '#s1ring');
  const rp = lin(t, 2.25, 3.0);
  ring.style.opacity = String(rp > 0 && rp < 1 ? (1 - rp) * 0.9 : 0);
  // Grow the box, not a transform: scaling would thicken the border into a disc.
  const d = 10 + eo(rp) * 900;
  ring.style.width = ring.style.height = d.toFixed(1) + 'px';
  ring.style.borderWidth = (3 - rp * 2).toFixed(2) + 'px';
  ring.style.transform = 'translate(-50%,-50%)';
  const m = q(r, '#s1mark');
  const lp = seg(t, 2.25, 2.85, back);
  const zoom = seg(t, 3.85, 4.4, x => x * x * x * x);
  const s = lp * (1 + zoom * 40);
  m.style.opacity = String(clamp(lp * 2));
  // Zoom through the hole in the shield: its centre is (16,16.1) of 32.
  m.style.transformOrigin = '50% 50.3%';
  m.style.transform = `scale(${s.toFixed(3)}) rotate(${((1 - lp) * -12).toFixed(2)}deg)`;
  const glow = document.getElementById('g4');
  glow.style.opacity = String(seg(t, 2.25, 2.6) * (1 - seg(t, 3.4, 4.1)) * 0.75);
  const w = q(r, '#s1word');
  const wp = seg(t, 2.55, 3.05, eo5);
  w.style.opacity = String(wp * (1 - seg(t, 3.6, 3.9)));
  w.style.transform = `translateY(${(1 - wp) * 26}px)`;
  w.style.letterSpacing = `${mix(0.02, -0.04, wp)}em`;
  s1.root.style.opacity = String(1 - seg(t, 4.2, 4.4));
};

/* S2 — AI Autopilot. */
const PROMPT = 'Find potential customers, nurture them, create campaigns and keep my content moving.';
const STEPS2 = [
  ['Understanding your business…', 8.85, 9.35],
  ['Designing workflows…', 9.3, 9.85],
  ['Creating AI agents…', 9.75, 10.3],
  ['Preparing campaigns…', 10.2, 10.75],
];
const s2 = scene({ a: 3.9, b: 11.45, tin: 0.55, inScale: 0.82, tout: 0.5, origin: '30% 72%', outScale: 1.5 });
s2.root = mount(`<div class="win" id="w2">${topbar('<b>AI Autopilot</b><span>›</span>New project')}
 <div class="wbody">
  <div class="abs" style="left:28px;top:22px"><div class="h2">AI Autopilot</div><div class="muted" style="font-size:16px;margin-top:4px;font-weight:550">Describe it. Autopilot plans the system and builds it.</div></div>
  <div class="card abs" style="left:28px;top:112px;width:560px;height:596px">
    <div class="kicker abs" style="left:24px;top:22px">What should this project do?</div>
    <div class="abs" id="pbox" style="left:24px;top:52px;width:512px;height:214px;border-radius:16px;border:2px solid #e6e9f0;padding:18px 20px;font-size:25px;font-weight:620;line-height:1.36;letter-spacing:-0.015em;color:#17191c;background:#fff">
      <span id="ptext"></span><span id="caret" style="display:inline-block;width:3px;height:30px;background:#5b46e5;vertical-align:-5px;margin-left:2px"></span>
      <span id="phold" class="abs" style="left:20px;top:18px;color:#9aa3b2;font-weight:500">e.g. Find customers and keep them warm…</span>
    </div>
    <div class="abs" style="left:24px;top:286px;display:flex;gap:10px">
      <span class="pill" style="background:#f4f5ff;color:#5b46e5;border:1px solid #e0e3ff;font-size:14px;padding:9px 14px">${ico('mic', 16)}Speak it</span>
      <span class="pill" style="background:#f6f7fb;color:#6b7280;border:1px solid #e6e9f0;font-size:14px;padding:9px 14px">${ico('file-text', 16)}Add files</span>
    </div>
    <div class="abs btn" id="buildBtn" style="right:24px;top:280px;padding:14px 22px;background:#5b46e5;color:#fff;font-size:19px;box-shadow:0 10px 24px rgba(91,70,229,.35)">${ico('sparkles', 20)}Build with AI</div>
    <div class="abs" id="steps2" style="left:24px;top:356px;right:24px">
      ${STEPS2.map((s, i) => `<div class="st" style="display:flex;align-items:center;gap:14px;height:54px;border-bottom:1px solid #f0f2f7;opacity:0">
        <span class="sti" style="width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center"></span>
        <span style="font-size:19px;font-weight:700;color:#17191c;flex:1">${s[0]}</span>
        <span style="width:110px;height:6px;border-radius:3px;background:#eef0ff;overflow:hidden"><span class="stb" style="display:block;height:100%;width:0;background:linear-gradient(90deg,#5b46e5,#8b7cf5)"></span></span>
      </div>`).join('')}
    </div>
  </div>
  <div class="abs" style="left:604px;top:112px;width:328px;height:596px;border-radius:20px;background:#f4f5ff;border:1px solid #e0e3ff;overflow:hidden">
    <div class="abs" id="botglow" style="left:44px;top:70px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,rgba(91,70,229,.35),rgba(91,70,229,0) 70%)"></div>
    <div class="abs" style="left:0;right:0;top:22px;display:flex;justify-content:center"><span class="pill" id="botState" style="background:#fff;border:1px solid #e0e3ff;color:#16a34a;font-size:13.5px"><span class="dot" style="background:#22c55e"></span><span id="botStateT">Ready</span></span></div>
    <div class="abs" id="bigbot" style="left:64px;top:84px">${BOT(200)}</div>
    <div class="abs" id="bubble" style="left:22px;right:22px;top:318px;background:#fff;border-radius:18px;padding:16px 18px;box-shadow:0 8px 24px rgba(91,70,229,.14);border:1px solid #e0e3ff;font-size:19px;font-weight:720;color:#17191c;text-align:center;min-height:60px"><span id="bubbleT">Tell me what you want.</span></div>
    <div class="abs" style="left:22px;right:22px;top:430px;display:grid;gap:10px" id="caps">
      ${[['workflow', 'Workflows'], ['bot', 'AI agents'], ['megaphone', 'Campaigns'], ['palette', 'Content']].map(c => `<div class="cap" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:12px;background:#fff;border:1px solid #e6e9f0;font-size:15.5px;font-weight:720;color:#9aa3b2">${ico(c[0], 17)}<span style="flex:1">${c[1]}</span><span class="capd"></span></div>`).join('')}
    </div>
  </div>
 </div></div>`);
sfx(8.66, 'click', 1); sfx(8.8, 'ai_on', 0.9);
STEPS2.forEach(s => sfx(s[2], 'tick', 0.5));
for (let t = 5.35; t < 8.2; t += 0.085) sfx(t, 'key', 0.18);
s2.render = (t) => {
  const r = s2.root;
  const w = q(r, '#w2');
  const tilt = 1 - seg(t, 3.95, 4.9, eo);
  const zoom = seg(t, 5.0, 6.1, eio) * (1 - seg(t, 8.9, 9.6, eio) * 0.6);
  w.style.transformOrigin = '38% 42%';
  w.style.transform = `perspective(2200px) rotateX(${(tilt * 14).toFixed(2)}deg) translateY(${(tilt * 60).toFixed(1)}px) scale(${(1 + zoom * 0.075).toFixed(4)})`;
  const n = Math.floor(clamp((t - 5.35) / (8.15 - 5.35)) * PROMPT.length);
  q(r, '#ptext').textContent = PROMPT.slice(0, n);
  q(r, '#phold').style.opacity = n > 0 ? '0' : '1';
  const typing = t > 5.3 && t < 8.2;
  q(r, '#caret').style.opacity = t < 8.6 && (typing || Math.floor(t * 2.2) % 2 === 0) && t > 4.9 ? '1' : '0';
  q(r, '#pbox').style.borderColor = t > 4.95 && t < 8.7 ? '#a5b4fc' : '#e6e9f0';
  q(r, '#pbox').style.boxShadow = t > 4.95 && t < 8.7 ? '0 0 0 5px rgba(91,70,229,.10)' : 'none';
  const press = lin(t, 8.62, 8.8);
  const btn = q(r, '#buildBtn');
  btn.style.transform = `scale(${(1 - Math.sin(press * Math.PI) * 0.06).toFixed(3)})`;
  btn.style.background = t > 8.66 ? '#4a36d6' : '#5b46e5';
  const busy = t > 8.8;
  STEPS2.forEach((s, i) => {
    const row = r.querySelectorAll('#steps2 .st')[i];
    appear(row, t, s[1] - 0.1, 0.35, 14, 1);
    const p = lin(t, s[1], s[2]);
    row.querySelector('.stb').style.width = (eo(p) * 100).toFixed(1) + '%';
    const icoEl = row.querySelector('.sti');
    const st = t >= s[2] ? 'done' : t >= s[1] ? 'run' : 'wait';
    if (icoEl.dataset.st !== st) {
      icoEl.dataset.st = st;
      icoEl.innerHTML = st === 'done' ? `<span class="chk">${ico('check', 16)}</span>` : st === 'run' ? '<span class="spin"></span>' : '<span style="width:20px;height:20px;border-radius:50%;border:2.5px solid #e6e9f0;display:block"></span>';
    }
    const sp = icoEl.querySelector('.spin'); if (sp) sp.style.transform = `rotate(${(t * 720) % 360}deg)`;
    const done = r.querySelectorAll('.cap')[i];
    const on = t >= s[2];
    done.style.color = on ? '#17191c' : '#9aa3b2';
    done.style.borderColor = on ? '#c7d2fe' : '#e6e9f0';
    done.querySelector('.capd').innerHTML = on ? `<span class="chk" style="width:22px;height:22px;font-size:13px">${ico('check', 13)}</span>` : '';
  });
  const state = t < 5.3 ? ['Ready', '#16a34a'] : t < 8.7 ? ['Listening', '#0ea5e9'] : t < 10.8 ? ['Thinking', '#5b46e5'] : ['Built', '#16a34a'];
  q(r, '#botStateT').textContent = state[0];
  q(r, '#botState').style.color = state[1];
  q(r, '#botState .dot').style.background = state[1];
  const bubble = t < 5.3 ? 'Tell me what you want.' : t < 8.75 ? 'Listening…' : t < 9.6 ? 'Understanding your goal…' : t < 10.55 ? 'Building your workflows…' : 'Research complete.';
  const bt = q(r, '#bubbleT');
  if (bt.textContent !== bubble) bt.textContent = bubble;
  const bb = q(r, '#bubble');
  const changes = [5.3, 8.75, 9.6, 10.55];
  const lastC = changes.filter(c => t >= c).pop() ?? -9;
  const bp = seg(t, lastC, lastC + 0.3, back);
  bb.style.transform = `scale(${mix(0.92, 1, bp).toFixed(3)})`;
  const g = q(r, '#botglow');
  g.style.opacity = String(busy ? 0.6 + 0.4 * Math.sin(t * 7) : 0.35 + 0.15 * Math.sin(t * 2));
  g.style.transform = `scale(${busy ? 1.08 + 0.06 * Math.sin(t * 7) : 1})`;
  const bot = q(r, '#bigbot');
  bot.style.transform = `translateY(${(Math.sin(t * 1.6) * 5).toFixed(1)}px)`;
  animBot(r, t, busy || typing);
};

/* S3 — workflows, running. */
const TONE = {
  trigger: ['#7c3aed', '#f5f3ff', 'Trigger'], ai: ['#9333ea', '#faf5ff', 'AI agent'], condition: ['#c2410c', '#fff7ed', 'Condition'],
  wait: ['#db2777', '#fdf2f8', 'Delay'], email: ['#2563eb', '#eff6ff', 'Email'], sms: ['#0d9488', '#f0fdfa', 'SMS'],
  deal: ['#16a34a', '#f0fdf4', 'Action'], review: ['#0369a1', '#eff6ff', 'Approval'], done: ['#16a34a', '#f0fdf4', 'Output'],
};
const COLW = 214, ROWH = 150, PAD = 40, NW = 176, NH = 104;
const WF = [
  { title: 'Lead qualification', icon: 'user-plus', start: 11.45, step: 0.42, nodes: [
    ['New Lead', 'trigger', 'user-plus', 0, 0], ['AI Agent', 'ai', 'bot', 1, 0], ['Qualify', 'ai', 'brain', 2, 0], ['If / Else', 'condition', 'git-branch', 3, 0],
    ['Email', 'email', 'mail', 4, 0], ['Delay 2 days', 'wait', 'hourglass', 5, 0], ['SMS', 'sms', 'message-square', 6, 0], ['Create Deal', 'deal', 'briefcase', 7, 0],
    ['Nurture Campaign', 'email', 'heart-handshake', 4, 1]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4, 'Yes'], [4, 5], [5, 6], [6, 7], [3, 8, 'No']],
    /* The No branch runs for a second lead, later. */
    timing: i => i === 8 ? 14.75 : 11.45 + (i <= 7 ? i : 0) * 0.42 },
  { title: 'Content engine', icon: 'pen-line', nodes: [
    ['Content Research', 'ai', 'search', 0, 0], ['AI Writer', 'ai', 'pen-line', 1, 0], ['Image Creation', 'ai', 'image', 2, 0], ['Human Review', 'review', 'user-check', 3, 0], ['Ready to Publish', 'done', 'send', 4, 0]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]], timing: i => 15.15 + i * 0.36 },
  { title: 'Missed appointment recovery', icon: 'calendar-x', nodes: [
    ['Appt. Missed', 'trigger', 'calendar-x', 0, 0], ['Follow-up', 'email', 'mail', 1, 0], ['SMS', 'sms', 'message-square', 2, 0], ['Condition', 'condition', 'git-branch', 3, 0], ['Rebook', 'deal', 'calendar-check', 4, 0]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4, 'Yes']], timing: i => 15.4 + i * 0.36 },
];
const PROC = 0.24;
function wfCanvas(wf, k) {
  const cols = Math.max(...wf.nodes.map(n => n[3])) + 1, rows = Math.max(...wf.nodes.map(n => n[4])) + 1;
  const W = PAD * 2 + (cols - 1) * COLW + NW, H = PAD * 2 + (rows - 1) * ROWH + NH;
  wf.W = W; wf.H = H;
  const pos = n => ({ x: PAD + n[3] * COLW, y: PAD + n[4] * ROWH });
  const paths = wf.edges.map(e => {
    const a = pos(wf.nodes[e[0]]), b = pos(wf.nodes[e[1]]);
    if (a.y === b.y) return `M${a.x + NW} ${a.y + NH / 2} L${b.x} ${b.y + NH / 2}`;
    return `M${a.x + NW / 2} ${a.y + NH} L${a.x + NW / 2} ${b.y + NH / 2 - 16} Q${a.x + NW / 2} ${b.y + NH / 2} ${a.x + NW / 2 + 16} ${b.y + NH / 2} L${b.x} ${b.y + NH / 2}`;
  });
  return `<div class="wfcanvas" id="wfc${k}" style="width:${W}px;height:${H}px">
    <svg class="abs" width="${W}" height="${H}" style="left:0;top:0;overflow:visible">
      ${paths.map((d, i) => `<path class="edge" data-i="${i}" d="${d}" fill="none" stroke="#d5d9e3" stroke-width="3" stroke-linecap="round"/>`).join('')}
      ${paths.map((d, i) => `<circle class="pulse" data-i="${i}" r="8" fill="#5b46e5" opacity="0" style="filter:drop-shadow(0 0 8px rgba(91,70,229,.9))"/>`).join('')}
    </svg>
    ${wf.edges.filter(e => e[2]).map(e => { const a = pos(wf.nodes[e[0]]); const yes = e[2] === 'Yes'; return `<span class="pill abs" style="font-size:12px;padding:3px 10px;left:${yes ? a.x + NW + 4 : a.x + NW / 2 + 8}px;top:${yes ? a.y + NH / 2 - 30 : a.y + NH + 18}px;background:${yes ? '#ecfdf5' : '#fef2f2'};color:${yes ? '#16a34a' : '#dc2626'};border:1px solid ${yes ? '#bbf7d0' : '#fecaca'}">${e[2]}</span>`; }).join('')}
    ${wf.nodes.map((n, i) => { const p = pos(n); const tn = TONE[n[1]]; return `<div class="node" data-i="${i}" style="left:${p.x}px;top:${p.y}px"><div class="nh"><span class="ni" style="background:${tn[1]};color:${tn[0]}">${ico(n[2], 17)}</span><span class="nk" style="color:${tn[0]}">${tn[2]}</span></div><div class="nn">${n[0]}</div><div class="ns"></div></div>`; }).join('')}
  </div>`;
}
const s3 = scene({ a: 10.95, b: 17.45, tin: 0.55, inScale: 0.7, tout: 0.5, origin: '82% 50%', outScale: 1.45 });
s3.root = mount(`<div class="win" id="w3">${topbar('AI Autopilot<span>›</span><b>Lead Engine</b>')}
  <div class="wbody gridbg">
   ${WF.map((wf, k) => `<div class="wfcard" id="wf${k}"><div class="wfh">${ico(wf.icon, 19, '#5b46e5')}${wf.title}<span class="pill" style="margin-left:auto;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;font-size:12.5px"><span class="dot" style="background:#22c55e"></span>Live</span></div><div class="abs" style="left:0;right:0;top:56px;bottom:0;overflow:hidden">${wfCanvas(wf, k)}</div></div>`).join('')}
  </div></div>`);
WF.forEach((wf, k) => wf.nodes.forEach((n, i) => { const t0 = wf.timing(i); sfx(t0, 'pulse', k === 0 ? 0.45 : 0.22); sfx(t0 + PROC, 'tick', k === 0 ? 0.3 : 0.15); }));
sfx(14.25, 'whoosh_soft', 0.5);
function renderWf(root, wf, k, t) {
  const c = q(root, '#wfc' + k);
  c.querySelectorAll('.node').forEach(nd => {
    const i = +nd.dataset.i; const t0 = wf.timing(i);
    const st = t < t0 ? 'wait' : t < t0 + PROC ? 'proc' : 'done';
    if (nd.dataset.st !== st) {
      nd.dataset.st = st; nd.className = 'node ' + st;
      nd.querySelector('.ns').innerHTML = st === 'wait' ? '<span style="color:#9aa3b2">WAITING</span>' : st === 'proc' ? '<span class="spin" style="width:13px;height:13px;border-width:2px"></span><span style="color:#5b46e5">PROCESSING</span>' : `<span style="color:#16a34a;display:flex;align-items:center;gap:4px">${ico('check-circle-2', 13)}COMPLETED</span>`;
    }
    const sp = nd.querySelector('.spin'); if (sp) sp.style.transform = `rotate(${(t * 900) % 360}deg)`;
    const pop = seg(t, t0, t0 + 0.2, back);
    nd.style.transform = st === 'proc' ? `scale(${mix(1, 1.06, Math.sin(lin(t, t0, t0 + PROC) * Math.PI))})` : 'none';
    void pop;
  });
  c.querySelectorAll('path.edge').forEach(p => {
    const i = +p.dataset.i; const e = wf.edges[i];
    const a = wf.timing(e[0]) + PROC, b = wf.timing(e[1]);
    const pl = c.querySelector(`circle.pulse[data-i="${i}"]`);
    const pr = lin(t, a, b);
    if (t > a && t < b) {
      const L = p.getTotalLength(); const pt = p.getPointAtLength(eio(pr) * L);
      pl.setAttribute('cx', pt.x); pl.setAttribute('cy', pt.y); pl.setAttribute('opacity', '1');
    } else pl.setAttribute('opacity', '0');
    p.setAttribute('stroke', t >= b ? '#a5b4fc' : '#d5d9e3');
  });
}
s3.render = (t) => {
  const r = s3.root;
  const B = seg(t, 14.2, 15.05, eio);
  const inner = 916;
  // Card A: full height, camera following the run → a compact overview at the top.
  const A = WF[0];
  const cardA = q(r, '#wf0');
  const hA = mix(694, 236, B);
  cardA.style.top = '20px'; cardA.style.height = hA + 'px';
  const sBig = 1.22, sSmall = (inner - 16) / A.W;
  const s = mix(sBig, sSmall, B);
  const activeT = clamp((t - 11.45) / 0.42, 0, 7);
  const focusX = PAD + activeT * COLW + NW / 2;
  const panBig = clamp(inner / 2 - focusX * sBig, inner - A.W * sBig, 0);
  const x = mix(panBig, 8, B);
  const yBig = (694 - 56 - A.H * sBig) / 2 - 20, ySmall = -4;
  q(r, '#wfc0').style.transform = `translate(${x.toFixed(1)}px,${mix(yBig, ySmall, B).toFixed(1)}px) scale(${s.toFixed(4)})`;
  [1, 2].forEach(k => {
    const card = q(r, '#wf' + k), wf = WF[k];
    const top = k === 1 ? 272 : 488;
    const p = seg(t, 14.55 + (k - 1) * 0.2, 15.2 + (k - 1) * 0.2, eo5);
    card.style.top = top + 'px'; card.style.height = '200px';
    card.style.opacity = String(p);
    card.style.transform = `translateY(${((1 - p) * 120).toFixed(1)}px)`;
    const sk = (inner - 20) / wf.W;
    q(r, '#wfc' + k).style.transform = `translate(6px,-6px) scale(${sk.toFixed(4)})`;
  });
  WF.forEach((wf, k) => renderWf(r, wf, k, t));
  const w = q(r, '#w3');
  w.style.transform = `scale(${(1 + seg(t, 15.4, 17.4, eio) * 0.03).toFixed(4)})`;
};

/* S4 — CRM and pipeline. */
const KPI4 = [['users', 'Contacts', 48720, '', '+6.2% this month', '#2563eb'], ['target', 'New leads', 12480, '', '+18.9% this month', '#7c3aed'], ['dollar-sign', 'Pipeline value', 1.24, '$M', '+22.4% this quarter', '#16a34a'], ['calendar-check', 'Appointments', 318, '', '+41 this week', '#0d9488']];
const STAGES = [['New lead', 3912], ['Contacted', 2406], ['Qualified', 1318], ['Proposal', 486], ['Won', 212]];
const DEALS = [
  [0, 'Maya Chen', 'Brightline Dental', '$8,400'], [0, 'Leo Park', 'Parkside Fitness', '$3,200'], [0, 'Ava Collins', 'Collins & Co.', '$5,750'], [0, 'Noah Reyes', 'Reyes Roofing', '$12,900'],
  [1, 'Ethan Wright', 'Wright Legal', '$9,600'], [1, 'Isla Morgan', 'Morgan Studio', '$4,100'], [1, 'Kai Tanaka', 'Tanaka Imports', '$18,300'],
  [2, 'Sofia Ramirez', 'Ramirez Realty', '$21,500'], [2, 'Liam Foster', 'Foster Logistics', '$7,800'], [2, 'Zara Ali', 'Ali Skincare', '$6,300'],
  [3, 'Omar Haddad', 'Northwind Supply', '$24,000'], [3, 'Grace Kim', 'Kim Architects', '$15,200'],
  [4, 'Hana Sato', 'Sato Bakery', '$2,900'], [4, 'Ben Carter', 'Carter Motors', '$31,000'],
];
const MOVES = { 0: [1, 18.35, 18.95], 10: [4, 19.15, 19.75] };
const s4 = scene({ a: 16.95, b: 22.45, tin: 0.55, inScale: 0.82, tout: 0.5, origin: '42% 62%', outScale: 1.35 });
s4.root = mount(`<div class="win" id="w4">${topbar('<b>Contacts</b><span>›</span>Pipelines')}
  <div class="wbody">
   ${KPI4.map((k, i) => `<div class="kpi" id="k4${i}" style="left:${22 + i * 229}px;top:20px;width:217px;height:128px"><div class="kl">${ico(k[0], 17, k[5])}${k[1]}</div><div class="kv">0</div><div class="kd">${k[4]}</div></div>`).join('')}
   <div class="abs" style="left:22px;top:168px;display:flex;align-items:center;gap:10px;font-size:19px;font-weight:800;letter-spacing:-0.01em">${ico('kanban', 20, '#5b46e5')}Sales pipeline<span class="muted" style="font-weight:600;font-size:15px">· $1.24M open</span></div>
   <div class="abs" id="board" style="left:22px;top:210px;width:916px;height:504px">
     ${STAGES.map((s, i) => `<div class="col" style="left:${i * 186}px"><div class="ch"><span>${s[0]}</span><span style="color:#17191c">${fmt(s[1])}</span></div></div>`).join('')}
     ${DEALS.map((d, i) => `<div class="deal" id="dl${i}"><div class="dn">${d[1]}</div><div class="dc">${d[2]}</div><div class="dv">${d[3]}<span class="bdg"></span></div></div>`).join('')}
   </div>
  </div></div>`);
KPI4.forEach((k, i) => sfx(17.3 + i * 0.12, 'pop', 0.3));
sfx(18.35, 'whoosh_soft', 0.35); sfx(19.15, 'whoosh_soft', 0.35); sfx(19.75, 'success', 0.6); sfx(20.25, 'success', 0.5);
s4.render = (t) => {
  const r = s4.root;
  KPI4.forEach((k, i) => {
    const node = q(r, '#k4' + i);
    appear(node, t, 17.25 + i * 0.1, 0.45, 18);
    const p = seg(t, 17.45 + i * 0.1, 18.9 + i * 0.1, eo5);
    node.querySelector('.kv').textContent = k[3] === '$M' ? '$' + (k[2] * p).toFixed(2) + 'M' : fmt(k[2] * p);
  });
  const colCount = [0, 0, 0, 0, 0];
  const slot = [];
  // Where each card sits now; a moving card leaves its old column when it lifts.
  DEALS.forEach((d, i) => {
    const mv = MOVES[i];
    const col = mv && t >= mv[1] ? mv[0] : d[0];
    slot[i] = { col };
  });
  const order = DEALS.map((d, i) => i).sort((a, b) => {
    const ma = MOVES[a], mb = MOVES[b];
    const pa = ma && t >= ma[1] ? -1 : a, pb = mb && t >= mb[1] ? -1 : b;
    return pa - pb;
  });
  order.forEach(i => { slot[i].row = colCount[slot[i].col]++; });
  DEALS.forEach((d, i) => {
    const node = q(r, '#dl' + i);
    const tx = slot[i].col * 186 + 8, ty = 40 + slot[i].row * 100;
    const prev = node._p || { x: tx, y: ty };
    const mv = MOVES[i];
    let x = tx, y = ty, lift = 0;
    if (mv && t >= mv[1] && t <= mv[2] + 0.001) {
      const p = seg(t, mv[1], mv[2], eio);
      const fx = d[0] * 186 + 8, fy = 40 + DEALS.filter((o, j) => o[0] === d[0] && j < i).length * 100;
      x = mix(fx, tx, p); y = mix(fy, ty, p) - Math.sin(p * Math.PI) * 40; lift = Math.sin(p * Math.PI);
    } else if (!mv || t < mv[1]) {
      x = tx; y = ty;
    }
    // Others slide to their new slot rather than jumping.
    const settle = Object.values(MOVES).map(m => seg(t, m[1], m[1] + 0.45, eo));
    void prev; void settle;
    node.style.left = x.toFixed(1) + 'px'; node.style.top = y.toFixed(1) + 'px';
    node.style.zIndex = lift > 0 ? 5 : 1;
    node.style.boxShadow = lift > 0 ? `0 ${10 + lift * 20}px ${24 + lift * 20}px rgba(30,40,90,.22)` : '';
    node.style.transform = `rotate(${(lift * 3).toFixed(2)}deg) scale(${(1 + lift * 0.05).toFixed(3)})`;
    const inP = seg(t, 17.5 + d[0] * 0.08 + (i % 4) * 0.04, 17.95 + d[0] * 0.08 + (i % 4) * 0.04);
    node.style.opacity = String(inP);
    const b = node.querySelector('.bdg');
    let badge = '';
    if (i === 7) badge = t < 20.25 ? '<span class="pill" style="font-size:11px;padding:2px 8px;background:#eef0ff;color:#5b46e5">Qualified</span>' : '<span class="pill" style="font-size:11px;padding:2px 8px;background:#16a34a;color:#fff">Opportunity</span>';
    if (i === 10 && t > 19.75) badge = `<span class="pill" style="font-size:11px;padding:2px 8px;background:#f0fdf4;color:#16a34a">${ico('check', 11)}Won</span>`;
    if (b.innerHTML !== badge) b.innerHTML = badge;
    if (i === 7) {
      const g = seg(t, 20.2, 20.5) * (1 - seg(t, 21.3, 21.8));
      node.style.boxShadow = `0 0 0 ${(g * 5).toFixed(1)}px rgba(22,163,74,.25), 0 ${g * 14}px ${g * 30}px rgba(22,163,74,.25)`;
      node.style.borderColor = g > 0.1 ? '#86efac' : '#e6e9f0';
    }
  });
  q(r, '#w4').style.transform = `scale(${(1 + seg(t, 17, 22.4, eio) * 0.035).toFixed(4)})`;
};

/* S5 — campaigns. */
const SEQ = [
  ['mail', '#2563eb', '#eff6ff', 'Email 1', '“Your listing is leaving money on the table”', 'Sent', '12,480 delivered', 22.95],
  ['hourglass', '#db2777', '#fdf2f8', 'Wait 2 days', 'Then the next step, for everyone who has not replied', 'Done', '', 23.45],
  ['mail', '#2563eb', '#eff6ff', 'Email 2', '“3 fixes top sellers make first”', 'Scheduled', 'Tomorrow · 9:00 AM', 23.95],
  ['message-square', '#0d9488', '#f0fdfa', 'SMS follow-up', 'To contacts who opted in to texts', 'Queued', '4,212 contacts', 24.45],
  ['bot', '#9333ea', '#faf5ff', 'AI follow-up', 'Answers replies and books calls', 'Running', '86 conversations', 24.95],
];
const STAT5 = [['Sent', 12480, ''], ['Opened', 6114, '49.0%'], ['Replied', 1027, '8.2%'], ['Booked', 146, '']];
const s5 = scene({ a: 21.95, b: 27.45, tin: 0.55, inScale: 0.82, tout: 0.5, origin: '50% 40%', outScale: 1.35 });
s5.root = mount(`<div class="win" id="w5">${topbar('<b>Marketing</b><span>›</span>Campaigns')}
  <div class="wbody">
    <div class="abs" style="left:22px;top:18px;display:flex;gap:8px" id="tabs5">
      ${['Email campaigns', 'SMS campaigns', 'Sequences', 'Automations'].map((x, i) => `<span class="pill tab5" style="font-size:14.5px;padding:9px 15px;background:${i === 2 ? '#17191c' : '#fff'};color:${i === 2 ? '#fff' : '#6b7280'};border:1px solid ${i === 2 ? '#17191c' : '#e6e9f0'}">${x}</span>`).join('')}
    </div>
    <div class="card abs" id="c5h" style="left:22px;top:76px;width:916px;height:168px;padding:20px 22px">
      <div style="display:flex;align-items:center;gap:12px"><span style="width:42px;height:42px;border-radius:12px;background:#fff7ed;color:#c2410c;display:flex;align-items:center;justify-content:center">${ico('megaphone', 22)}</span>
        <div><div style="font-size:23px;font-weight:820;letter-spacing:-0.02em">Amazon Seller Growth Campaign</div><div class="muted" style="font-size:15px;font-weight:600;margin-top:2px">Audience · <b style="color:#17191c">12,480 prospects</b></div></div>
        <span class="pill" style="margin-left:auto;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0"><span class="dot" id="live5" style="background:#22c55e"></span>Running</span></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:18px">
        ${STAT5.map((s, i) => `<div style="background:#f6f7fb;border-radius:14px;padding:10px 14px"><div class="muted" style="font-size:13px;font-weight:700">${s[0]}</div><div style="display:flex;align-items:baseline;gap:8px"><span class="sv" id="sv${i}" style="font-size:27px;font-weight:820;letter-spacing:-0.03em;font-variant-numeric:tabular-nums">0</span><span style="font-size:13px;font-weight:750;color:#16a34a">${s[2]}</span></div></div>`).join('')}
      </div>
    </div>
    <div class="card abs" style="left:22px;top:260px;width:916px;height:454px;padding:18px 22px">
      <div class="kicker">Sequence</div>
      <div class="abs" style="left:43px;top:70px;width:3px;height:340px;background:#eef0f5;border-radius:2px"><div id="seqfill" style="width:100%;height:0;background:linear-gradient(#5b46e5,#8b7cf5);border-radius:2px"></div></div>
      <div class="abs" id="seqpulse" style="left:37px;top:70px;width:15px;height:15px;border-radius:50%;background:#5b46e5;box-shadow:0 0 14px 4px rgba(91,70,229,.6);opacity:0"></div>
      ${SEQ.map((s, i) => `<div class="abs sq" style="left:22px;right:22px;top:${48 + i * 80}px;height:66px;display:flex;align-items:center;gap:16px">
        <span style="width:44px;height:44px;border-radius:13px;background:${s[2]};color:${s[1]};display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 0 0 1px #e6e9f0;z-index:1">${ico(s[0], 21)}</span>
        <div style="flex:1;min-width:0"><div style="font-size:19px;font-weight:800;letter-spacing:-0.01em">${s[3]}</div><div class="muted" style="font-size:14px;font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s[4]}</div></div>
        <div style="text-align:right"><span class="sqs"></span><div class="muted" style="font-size:12.5px;font-weight:650;margin-top:4px">${s[6]}</div></div>
      </div>`).join('')}
    </div>
  </div></div>`);
SEQ.forEach(s => sfx(s[7], 'tick', 0.4));
s5.render = (t) => {
  const r = s5.root;
  appear(q(r, '#c5h'), t, 22.2, 0.5, 20);
  STAT5.forEach((s, i) => {
    const p = seg(t, 22.5 + i * 0.12, 25.8 + i * 0.12, eo);
    const live = t > 25.8 ? Math.floor((t - 25.8) * [9, 5, 2, 0.7][i]) : 0;
    q(r, '#sv' + i).textContent = fmt(s[1] * p + live);
  });
  const states = {
    Sent: ['#16a34a', '#f0fdf4', 'check'], Done: ['#16a34a', '#f0fdf4', 'check'], Scheduled: ['#2563eb', '#eff6ff', 'clock'], Queued: ['#b45309', '#fffbeb', 'clock'], Running: ['#5b46e5', '#eef0ff', 'loader'],
  };
  r.querySelectorAll('.sq').forEach((row, i) => {
    const s = SEQ[i];
    appear(row, t, s[7] - 0.45, 0.4, 16, 1);
    const on = t >= s[7];
    const st = row.querySelector('.sqs');
    const key = on ? s[5] : 'wait';
    if (st.dataset.k !== key) {
      st.dataset.k = key;
      const c = states[s[5]];
      st.innerHTML = on ? `<span class="pill" style="font-size:13.5px;padding:6px 12px;background:${c[1]};color:${c[0]}"><span class="lx">${ico(c[2], 14)}</span>${s[5]}</span>` : '<span class="pill" style="font-size:13.5px;padding:6px 12px;background:#f6f7fb;color:#9aa3b2">Pending</span>';
      if (on) st.animStart = t;
    }
    const lx = st.querySelector('.lx');
    if (lx && s[5] === 'Running') lx.style.transform = `rotate(${(t * 360) % 360}deg)`;
    if (lx) lx.style.display = 'inline-flex';
    const pp = on ? seg(t, s[7], s[7] + 0.3, back) : 1;
    st.style.display = 'inline-block';
    st.style.transform = `scale(${mix(0.8, 1, pp).toFixed(3)})`;
  });
  const fill = seg(t, 22.95, 24.95, x => x);
  q(r, '#seqfill').style.height = (fill * 100).toFixed(1) + '%';
  const pu = q(r, '#seqpulse');
  pu.style.opacity = t > 22.95 ? String(0.7 + 0.3 * Math.sin(t * 8)) : '0';
  pu.style.top = (70 + fill * 320 - 6).toFixed(1) + 'px';
  q(r, '#live5').style.opacity = String(0.4 + 0.6 * Math.abs(Math.sin(t * 3)));
  q(r, '#w5').style.transform = `scale(${(1 + seg(t, 22, 27.4, eio) * 0.03).toFixed(4)})`;
};

/* S6 — content. */
const JOBS = [
  ['file-text', '#2563eb', 'Blog post', '7 Ways AI Can Transform Customer Follow-Up', [[27.55, 0], [28.7, 63], [30.0, 100]], ['Gathering information…', 'Writing the draft…', 'Blog created']],
  ['image', '#db2777', 'Social image', 'Stop Losing Leads After the First Reply', [[27.85, 0], [29.05, 82], [30.25, 100]], ['Generating visual…', 'Sizing for each network…', 'Social asset created']],
];
const OUTS = [['file-text', 'Blog created'], ['mail', 'Email created'], ['image', 'Social asset created'], ['film', 'Short-form content prepared']];
function creative(kind) {
  const h = kind === 'ig' ? 262 : kind === 'fb' ? 196 : 226;
  const light = kind === 'li';
  const bg = light ? 'linear-gradient(160deg,#ffffff,#eef0ff)' : kind === 'fb' ? 'linear-gradient(135deg,#0b1030,#3b2a9a)' : 'linear-gradient(150deg,#101433,#4a36d6 70%,#7c3aed)';
  const ink = light ? '#17191c' : '#fff';
  return `<div style="height:${h}px;border-radius:14px;background:${bg};position:relative;overflow:hidden;padding:16px;border:1px solid ${light ? '#e0e3ff' : 'transparent'}">
    <div style="position:absolute;right:-40px;top:-40px;width:170px;height:170px;border-radius:50%;background:radial-gradient(circle,rgba(200,242,77,${light ? .35 : .45}),rgba(200,242,77,0) 70%)"></div>
    <div style="display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:850;letter-spacing:.1em;color:${light ? '#5b46e5' : '#c8f24d'}">DEMO CO. · GROWTH</div>
    <div style="font-size:${kind === 'fb' ? 21 : 24}px;font-weight:850;letter-spacing:-0.03em;line-height:1.08;color:${ink};margin-top:10px;max-width:${kind === 'fb' ? 190 : 230}px">Stop Losing Leads After the First Reply</div>
    <div style="position:absolute;left:16px;bottom:14px;display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;background:${light ? '#5b46e5' : '#c8f24d'};color:${light ? '#fff' : '#0f1210'};font-size:11.5px;font-weight:850">See how ${ICONS['arrow-right'] ? `<span class="ico" style="font-size:12px">${ICONS['arrow-right']}</span>` : ''}</div>
    ${kind === 'fb' ? `<div style="position:absolute;right:14px;bottom:14px;display:flex;align-items:flex-end;gap:5px;height:80px">${[30, 45, 38, 62, 80].map(v => `<div style="width:12px;height:${v}%;border-radius:3px;background:rgba(200,242,77,.85)"></div>`).join('')}</div>` : ''}
  </div>`;
}
const s6 = scene({ a: 26.95, b: 33.45, tin: 0.55, inScale: 0.82, tout: 0.5, origin: '50% 70%', outScale: 1.3 });
s6.root = mount(`<div class="win" id="w6">${topbar('<b>Content Studio</b><span>›</span>Social Creator')}
  <div class="wbody">
    <div class="card abs" id="jobs" style="left:22px;top:18px;width:916px;height:222px;padding:16px 20px">
      <div style="display:flex;align-items:center;gap:10px"><span class="dot" id="jobdot" style="background:#5b46e5;width:10px;height:10px"></span><span class="kicker" style="color:#5b46e5">AI working now</span><span style="margin-left:auto" id="jobbot">${BOT(40)}</span></div>
      ${JOBS.map((j, i) => `<div class="job" style="display:flex;align-items:center;gap:14px;margin-top:${i ? 12 : 8}px;padding:12px 14px;border-radius:14px;background:#f9fafc;border:1px solid #f0f2f7">
        <span style="width:40px;height:40px;border-radius:11px;background:#fff;border:1px solid #e6e9f0;color:${j[1]};display:flex;align-items:center;justify-content:center">${ico(j[0], 20)}</span>
        <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:800;color:#9aa3b2;letter-spacing:.06em;text-transform:uppercase">Creating ${j[2]}</div><div style="font-size:17.5px;font-weight:780;letter-spacing:-0.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">“${j[3]}”</div>
          <div style="display:flex;align-items:center;gap:10px;margin-top:7px"><span style="flex:1;height:7px;border-radius:4px;background:#eef0f5;overflow:hidden"><span class="jb" style="display:block;height:100%;width:0;background:linear-gradient(90deg,#5b46e5,#8b7cf5)"></span></span><span class="js muted" style="font-size:13px;font-weight:700;width:200px;white-space:nowrap"></span><span class="jp" style="font-size:15px;font-weight:820;width:48px;text-align:right;font-variant-numeric:tabular-nums">0%</span></div></div>
      </div>`).join('')}
    </div>
    <div class="abs" id="carousel" style="left:22px;top:258px;width:916px;height:318px;overflow:hidden">
      <div id="ctrack" class="abs" style="left:0;top:0;display:flex;gap:16px;align-items:flex-start">
        ${[['ig', 'Instagram', '1:1'], ['fb', 'Facebook', '1.91:1'], ['li', 'LinkedIn', '1.2:1']].map(c => `<div class="cr card" style="width:294px;padding:10px;border-radius:18px">${creative(c[0])}<div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding:0 2px"><span style="font-size:14.5px;font-weight:780">${c[1]} <span class="muted" style="font-weight:600;font-size:12.5px">${c[2]}</span></span><span class="pill" style="font-size:10.5px;letter-spacing:.06em;padding:4px 9px;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0">${ico('check', 11)}READY TO PUBLISH</span></div></div>`).join('')}
      </div>
    </div>
    <div class="abs" style="left:22px;top:592px;width:916px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${OUTS.map(o => `<div class="out card" style="display:flex;align-items:center;gap:10px;padding:13px 14px;border-radius:14px;font-size:16px;font-weight:750">${ico(o[0], 18, '#5b46e5')}<span style="flex:1">${o[1]}</span><span class="chk" style="width:24px;height:24px">${ico('check', 14)}</span></div>`).join('')}
    </div>
  </div></div>`);
sfx(30.05, 'success', 0.6); sfx(30.3, 'success', 0.5);
[0, 1, 2].forEach(i => sfx(30.15 + i * 0.17, 'pop', 0.4));
OUTS.forEach((o, i) => sfx(31.1 + i * 0.28, 'tick', 0.35));
s6.render = (t) => {
  const r = s6.root;
  appear(q(r, '#jobs'), t, 27.2, 0.5, 18);
  r.querySelectorAll('.job').forEach((row, i) => {
    const j = JOBS[i], k = j[4];
    let pct = 0; let stI = 0;
    if (t < k[1][0]) { pct = mix(0, k[1][1], seg(t, k[0][0], k[1][0], eio)); stI = 0; }
    else { pct = mix(k[1][1], 100, seg(t, k[1][0], k[2][0], eio)); stI = t >= k[2][0] ? 2 : 1; }
    if (t < k[0][0]) pct = 0;
    row.querySelector('.jb').style.width = pct.toFixed(1) + '%';
    row.querySelector('.jp').textContent = Math.round(pct) + '%';
    row.querySelector('.js').textContent = j[5][stI];
    row.querySelector('.js').style.color = stI === 2 ? '#16a34a' : '#6b7280';
  });
  q(r, '#jobdot').style.opacity = String(0.4 + 0.6 * Math.abs(Math.sin(t * 4)));
  animBot(q(r, '#jobs'), t, t < 30.3, 2);
  r.querySelectorAll('.cr').forEach((c, i) => {
    const p = seg(t, 30.1 + i * 0.17, 30.7 + i * 0.17, back);
    c.style.opacity = String(clamp(p * 1.4));
    c.style.transform = `translateY(${((1 - p) * 60).toFixed(1)}px) scale(${mix(0.85, 1, p).toFixed(3)})`;
  });
  const pan = seg(t, 31.2, 33.2, eio);
  q(r, '#ctrack').style.transform = `scale(${(1 + pan * 0.02).toFixed(4)})`;
  r.querySelectorAll('.out').forEach((o, i) => appear(o, t, 31.05 + i * 0.28, 0.35, 12, 0.96));
};

/* S7 — appointments, support, one timeline. */
const EVENTS = [
  ['calendar-check', '#0d9488', 'Booking confirmed — Priya S. · Thu 10:30'],
  ['ticket', '#c2410c', 'Ticket #4821 assigned to Support'],
  ['video', '#2563eb', 'Google Meet scheduled — 2:00 PM'],
  ['mail', '#2563eb', 'Email 2 scheduled — Amazon Seller Growth'],
  ['image', '#db2777', 'Social asset ready to publish'],
  ['briefcase', '#16a34a', 'Deal won — Northwind Supply · $24,000'],
  ['user-check', '#7c3aed', 'Lead qualified — Sofia Ramirez'],
];
const CAL = [[0, 1, 1, 'Intro call'], [0, 4, 1, 'Demo'], [1, 0, 2, 'Strategy'], [1, 5, 1, 'Follow-up'], [2, 2, 1, 'Consult'], [2, 5, 2, 'Onboarding'], [3, 3, 1, 'Review'], [4, 0, 1, 'Call'], [4, 3, 2, 'Workshop']];
const s7 = scene({ a: 32.95, b: 38.45, tin: 0.55, inScale: 0.82, tout: 0.5, origin: '50% 50%', outScale: 0.8 });
s7.root = mount(`<div class="win" id="w7">${topbar('<b>Workspace</b><span>›</span>Today')}
  <div class="wbody">
    <div class="card abs c7" id="c7a" style="left:22px;top:16px;width:916px;height:282px;padding:14px 18px">
      <div style="display:flex;align-items:center;gap:10px;font-size:18px;font-weight:800">${ico('calendar', 19, '#0d9488')}Appointments<span class="muted" style="font-size:14px;font-weight:600">This week</span><span style="margin-left:auto;font-size:26px;font-weight:840;letter-spacing:-0.03em;font-variant-numeric:tabular-nums" id="apptN">0</span><span class="muted" style="font-size:14px;font-weight:650">booked</span></div>
      <div class="abs" style="left:18px;right:18px;top:52px;display:grid;grid-template-columns:repeat(5,1fr);gap:8px">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(d => `<div style="font-size:12.5px;font-weight:800;color:#9aa3b2;letter-spacing:.06em;text-transform:uppercase">${d}</div>`).join('')}</div>
      <div class="abs" id="calg" style="left:18px;right:18px;top:78px;height:192px;background-image:linear-gradient(#f0f2f7 1px,transparent 1px);background-size:100% 32px">
        ${CAL.map(c => `<div class="abs" style="left:calc(${c[0] * 20}% + 2px);width:calc(20% - 10px);top:${c[1] * 32 + 2}px;height:${c[2] * 32 - 4}px;border-radius:8px;background:#f0fdfa;border-left:4px solid #14b8a6;font-size:12.5px;font-weight:750;color:#0f766e;padding:5px 8px">${c[3]}</div>`).join('')}
        <div class="abs" id="newbk" style="left:calc(60% + 2px);width:calc(20% - 10px);top:${1 * 32 + 2}px;height:${2 * 32 - 4}px;border-radius:8px;background:#5b46e5;color:#fff;font-size:12.5px;font-weight:800;padding:5px 8px;box-shadow:0 10px 24px rgba(91,70,229,.4)">New booking<br><span style="font-weight:600;opacity:.85">Priya S. · 10:30</span></div>
      </div>
    </div>
    <div class="card abs c7" id="c7b" style="left:22px;top:312px;width:916px;height:214px;padding:14px 18px">
      <div style="display:flex;align-items:center;gap:10px;font-size:18px;font-weight:800">${ico('life-buoy', 19, '#c2410c')}Support</div>
      <div id="tk" style="margin-top:10px;display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;background:#f9fafc;border:1px solid #f0f2f7">
        <span style="width:38px;height:38px;border-radius:11px;background:#fff7ed;color:#c2410c;display:flex;align-items:center;justify-content:center">${ico('ticket', 19)}</span>
        <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:800;color:#9aa3b2;letter-spacing:.06em">NEW TICKET · #4821</div><div style="font-size:16.5px;font-weight:760">“I can’t find last month’s invoice”</div></div>
        <div id="tks" style="display:flex;gap:6px"></div>
      </div>
      <div id="vs" style="margin-top:10px;display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;background:#f9fafc;border:1px solid #f0f2f7">
        <span style="width:38px;height:38px;border-radius:11px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center">${ico('video', 19)}</span>
        <div style="flex:1"><div style="font-size:16.5px;font-weight:760">Video support requested</div></div>
        <div id="vss"></div>
      </div>
    </div>
    <div class="card abs c7" id="c7c" style="left:22px;top:540px;width:916px;height:174px;padding:14px 18px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;font-size:18px;font-weight:800">${ico('activity', 19, '#5b46e5')}Activity<span class="pill" style="margin-left:auto;background:#eef0ff;color:#5b46e5;font-size:12px"><span class="dot" style="background:#5b46e5"></span>Live</span></div>
      <div class="abs" style="left:18px;right:18px;top:52px;bottom:0;overflow:hidden"><div id="feed" class="abs" style="left:0;right:0;top:0">
        ${EVENTS.map(e => `<div style="display:flex;align-items:center;gap:12px;height:40px;font-size:15.5px;font-weight:700;color:#17191c">${ico(e[0], 17, e[1])}<span>${e[2]}</span></div>`).join('')}
      </div></div>
    </div>
    <div class="abs" id="link7" style="left:4px;top:40px;width:4px;height:0;border-radius:2px;background:linear-gradient(#14b8a6,#c2410c,#5b46e5);box-shadow:0 0 16px rgba(91,70,229,.6)"></div>
  </div></div>`);
sfx(33.85, 'pop', 0.6); sfx(34.7, 'pop', 0.4); sfx(35.45, 'success', 0.5); sfx(36.35, 'success', 0.5); sfx(36.6, 'shimmer', 0.6);
s7.render = (t) => {
  const r = s7.root;
  ['#c7a', '#c7b', '#c7c'].forEach((s, i) => appear(q(r, s), t, 33.15 + [0, 1.35, 2.7][i], 0.5, 26));
  q(r, '#apptN').textContent = fmt(mix(0, 317, seg(t, 33.3, 34.3)) + (t > 33.95 ? 1 : 0));
  const nb = q(r, '#newbk');
  const bp = seg(t, 33.75, 34.2, back);
  nb.style.opacity = String(clamp(bp * 2));
  nb.style.transform = `translateY(${((1 - bp) * -40).toFixed(1)}px) scale(${mix(1.2, 1, bp).toFixed(3)})`;
  const tk = q(r, '#tks');
  const tstate = t < 35.0 ? '' : t < 35.45 ? 'cls' : 'done';
  if (tk.dataset.s !== tstate) {
    tk.dataset.s = tstate;
    tk.innerHTML = tstate === 'cls' ? '<span class="pill" style="background:#eef0ff;color:#5b46e5;font-size:12.5px"><span class="spin" style="width:13px;height:13px;border-width:2px"></span>AI classifying…</span>'
      : tstate === 'done' ? '<span class="pill" style="background:#fef2f2;color:#dc2626;font-size:12.5px">Priority: High</span><span class="pill" style="background:#f0fdf4;color:#16a34a;font-size:12.5px">Assigned to Support</span>' : '';
  }
  const sp = tk.querySelector('.spin'); if (sp) sp.style.transform = `rotate(${(t * 720) % 360}deg)`;
  appear(q(r, '#tk'), t, 34.55, 0.35, 12, 1);
  appear(q(r, '#vs'), t, 35.8, 0.35, 12, 1);
  const vss = q(r, '#vss');
  const vst = t < 36.3 ? '' : 'on';
  if (vss.dataset.s !== vst) { vss.dataset.s = vst; vss.innerHTML = vst ? `<span class="pill" style="background:#eff6ff;color:#2563eb;font-size:12.5px">${ico('video', 13)}Google Meet scheduled · 2:00 PM</span>` : ''; }
  const f = q(r, '#feed');
  f.style.transform = `translateY(${(-seg(t, 36.4, 38.2, eio) * 120 + 0).toFixed(1)}px)`;
  const lk = q(r, '#link7');
  const lp = seg(t, 36.55, 37.25, eio);
  lk.style.height = (lp * 640).toFixed(1) + 'px';
  lk.style.opacity = String(lp);
  q(r, '#w7').style.transform = `scale(${(1 - seg(t, 33, 38.4, eio) * 0.03).toFixed(4)})`;
};

/* S8 — the command centre. */
const KPI8 = [['bot', 'AI agents running', 14, '#9333ea'], ['workflow', 'Workflows active', 26, '#5b46e5'], ['zap', 'Tasks automated', 1280, '#c2410c', 'this week'], ['palette', 'Assets created', 3842, '#db2777']];
const AREA = [18, 22, 21, 27, 31, 30, 36, 41, 39, 46, 52, 55, 61, 66, 72];
const BARS = [62, 70, 66, 78, 84, 81, 92];
const s8 = scene({ a: 37.95, b: 43.45, tin: 0.6, inScale: 1.22, tout: 0.5, origin: '50% 50%', outScale: 0.92 });
function areaPath(w, h, arr) {
  const max = 80; const pts = arr.map((v, i) => [i * (w / (arr.length - 1)), h - (v / max) * h]);
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; const cx = (x0 + x1) / 2; d += ` C${cx} ${y0} ${cx} ${y1} ${x1} ${y1}`; }
  return { line: d, fill: d + ` L${w} ${h} L0 ${h} Z` };
}
const AP = areaPath(860, 150, AREA);
s8.root = mount(`<div class="win" id="w8">${topbar('<b>Dashboard</b>')}
  <div class="wbody">
    ${KPI8.map((k, i) => `<div class="kpi" id="k8${i}" style="left:${22 + i * 229}px;top:18px;width:217px;height:124px"><div class="kl">${ico(k[0], 17, k[3])}${k[1]}</div><div style="display:flex;align-items:baseline;gap:8px"><div class="kv">0</div>${i < 2 ? '<span class="dot k8live" style="background:#22c55e;width:10px;height:10px"></span>' : `<span class="muted" style="font-size:13px;font-weight:650">${k[4] || 'total'}</span>`}</div></div>`).join('')}
    <div class="card abs" id="c8a" style="left:22px;top:158px;width:916px;height:280px;padding:16px 20px">
      <div style="display:flex;align-items:center;gap:12px"><div><div class="muted" style="font-size:14px;font-weight:700">Pipeline value</div><div style="font-size:34px;font-weight:840;letter-spacing:-0.035em" id="pv">$0.00M</div></div>
        <span class="pill" style="background:#f0fdf4;color:#16a34a;font-size:13.5px">${ico('trending-up', 14)}+38.4% engagement</span>
        <div style="margin-left:auto;display:flex;gap:18px;text-align:right"><div><div class="muted" style="font-size:12.5px;font-weight:700">Emails processed</div><div style="font-size:19px;font-weight:820" id="em8">0</div></div><div><div class="muted" style="font-size:12.5px;font-weight:700">SMS activities</div><div style="font-size:19px;font-weight:820" id="sm8">0</div></div></div></div>
      <svg class="abs" width="860" height="150" style="left:28px;top:112px;overflow:visible"><defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b46e5" stop-opacity=".28"/><stop offset="1" stop-color="#5b46e5" stop-opacity="0"/></linearGradient><clipPath id="acl"><rect id="aclr" x="0" y="-20" width="0" height="200"/></clipPath></defs>
        <g clip-path="url(#acl)"><path d="${AP.fill}" fill="url(#ag)"/><path d="${AP.line}" fill="none" stroke="#5b46e5" stroke-width="3.5" stroke-linecap="round"/></g>
        <circle id="adot" r="7" fill="#fff" stroke="#5b46e5" stroke-width="3.5" opacity="0"/></svg>
    </div>
    <div class="card abs" id="c8b" style="left:22px;top:454px;width:450px;height:260px;padding:16px 20px">
      <div style="display:flex;align-items:center;gap:8px;font-size:16px;font-weight:800">${ico('workflow', 17, '#5b46e5')}Workflow executions</div>
      <div style="font-size:30px;font-weight:840;letter-spacing:-0.03em;margin-top:4px"><span id="wc">0</span>%<span class="muted" style="font-size:14px;font-weight:650;margin-left:8px">completion</span></div>
      <div class="abs" style="left:20px;right:20px;bottom:18px;height:120px;display:flex;align-items:flex-end;gap:12px">${BARS.map((b, i) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end"><div class="bar8" data-h="${b}" style="width:100%;height:0;border-radius:7px;background:${i === 6 ? 'linear-gradient(#8b7cf5,#5b46e5)' : '#e0e3ff'}"></div><span style="font-size:11px;font-weight:750;color:#9aa3b2">${'MTWTFSS'[i]}</span></div>`).join('')}</div>
    </div>
    <div class="card abs" id="c8c" style="left:488px;top:454px;width:450px;height:260px;padding:16px 20px">
      <div style="display:flex;align-items:center;gap:8px;font-size:16px;font-weight:800">${ico('clock', 17, '#0d9488')}Up next</div>
      ${[['mail', '#2563eb', 'Email 2 · Amazon Seller Growth', '9:00'], ['calendar-check', '#0d9488', 'Call · Brightline Dental', '10:30'], ['user-check', '#0369a1', 'Review 3 social assets', '11:00'], ['bar-chart-3', '#7c3aed', 'Weekly digest', 'Fri']].map(u => `<div class="up" style="display:flex;align-items:center;gap:10px;height:44px;border-bottom:1px solid #f0f2f7;font-size:15px;font-weight:720">${ico(u[0], 17, u[1])}<span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u[2]}</span><span class="muted" style="font-size:13.5px;font-weight:750">${u[3]}</span></div>`).join('')}
    </div>
  </div></div>`);
KPI8.forEach((k, i) => sfx(38.3 + i * 0.1, 'pop', 0.28)); sfx(40.8, 'shimmer', 0.4);
s8.render = (t) => {
  const r = s8.root;
  KPI8.forEach((k, i) => {
    const n = q(r, '#k8' + i); appear(n, t, 38.2 + i * 0.1, 0.45, 16);
    const live = i === 2 ? Math.floor(Math.max(0, t - 39.8) * 3) : 0;
    n.querySelector('.kv').textContent = fmt(k[2] * seg(t, 38.35 + i * 0.1, 39.8 + i * 0.1, eo5) + live);
  });
  r.querySelectorAll('.k8live').forEach(d => d.style.opacity = String(0.35 + 0.65 * Math.abs(Math.sin(t * 3))));
  appear(q(r, '#c8a'), t, 38.4, 0.5, 20);
  appear(q(r, '#c8b'), t, 38.7, 0.5, 20);
  appear(q(r, '#c8c'), t, 38.85, 0.5, 20);
  const ap = seg(t, 38.7, 40.3, eio);
  q(r, '#aclr').setAttribute('width', (ap * 880).toFixed(1));
  const ad = q(r, '#adot');
  const path = r.querySelector('#c8a svg g path:nth-child(2)');
  if (ap > 0.01) { const L = path.getTotalLength(); const pt = path.getPointAtLength(ap * L); ad.setAttribute('cx', pt.x); ad.setAttribute('cy', pt.y); ad.setAttribute('opacity', '1'); } else ad.setAttribute('opacity', '0');
  q(r, '#pv').textContent = '$' + (1.24 * seg(t, 38.7, 40.3, eo)).toFixed(2) + 'M';
  q(r, '#em8').textContent = fmt(72400 * seg(t, 38.8, 40.4, eo));
  q(r, '#sm8').textContent = fmt(18650 * seg(t, 38.9, 40.5, eo));
  q(r, '#wc').textContent = (97.8 * seg(t, 39, 40.4, eo)).toFixed(1);
  r.querySelectorAll('.bar8').forEach((b, i) => { b.style.height = (+b.dataset.h * seg(t, 39 + i * 0.07, 39.6 + i * 0.07, back)).toFixed(1) + '%'; });
  const nx = seg(t, 40.85, 41.3) * (1 - seg(t, 42.6, 43.2));
  const c = q(r, '#c8c');
  c.style.boxShadow = `0 0 0 ${(nx * 4).toFixed(1)}px rgba(13,148,136,.25), 0 ${nx * 20}px ${nx * 40}px rgba(13,148,136,.2)`;
  r.querySelectorAll('.up').forEach((u, i) => { const p = seg(t, 40.95 + i * 0.12, 41.3 + i * 0.12); u.style.background = `rgba(240,253,250,${(p * (1 - seg(t, 42.4, 43)) * (i === 0 ? 1 : 0.5)).toFixed(2)})`; });
  q(r, '#w8').style.transform = `scale(${(1 - seg(t, 38, 43.4, eio) * 0.04).toFixed(4)})`;
};

/* S9 — trust. Wording from docs/SECURITY.md §7 only. */
const TRUST = [
  ['shield-check', 'Workspaces kept separate', 'Access checked on the server, every request'],
  ['key-round', 'Connected credentials encrypted', 'AES-256-GCM, never sent back to a browser'],
  ['fingerprint', '2-step sign-in', 'With an authenticator app'],
  ['scroll-text', 'Security activity log', 'Every sign-in and change, kept 180 days'],
];
const s9 = scene({ a: 42.95, b: 47.45, tin: 0.7, inScale: 1.08, tout: 0.5, origin: '50% 50%', outScale: 0.9 });
s9.root = mount(`
  <div class="abs" id="s9mark" style="left:430px;top:700px;width:220px;height:220px">
    <div class="abs" style="left:-80px;top:-80px;width:380px;height:380px;border-radius:50%;background:radial-gradient(circle,rgba(200,242,77,.28),rgba(200,242,77,0) 65%)" id="s9glow"></div>
    ${LOGO(220, false)}
  </div>
  <div class="abs" id="s9list" style="left:110px;right:110px;top:990px;display:grid;gap:14px">
    ${TRUST.map(x => `<div class="tr" style="display:flex;align-items:center;gap:18px;padding:18px 22px;border-radius:20px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10)">
      <span style="width:52px;height:52px;border-radius:15px;background:rgba(200,242,77,.12);color:#c8f24d;display:flex;align-items:center;justify-content:center">${ico(x[0], 26)}</span>
      <div><div style="font-size:24px;font-weight:780;color:#fff;letter-spacing:-0.015em">${x[1]}</div><div style="font-size:17px;font-weight:550;color:rgba(226,232,255,.62);margin-top:2px">${x[2]}</div></div>
      <span style="margin-left:auto;color:#c8f24d">${ico('lock', 22)}</span></div>`).join('')}
  </div>`);
TRUST.forEach((x, i) => sfx(44.0 + i * 0.25, 'tick', 0.25)); sfx(43.3, 'whoosh_soft', 0.4);
s9.render = (t) => {
  const r = s9.root;
  const m = q(r, '#s9mark');
  const p = seg(t, 43.1, 43.9, eo5);
  m.style.opacity = String(p);
  m.style.transform = `translateY(${((1 - p) * 30 + Math.sin(t * 1.2) * 6).toFixed(1)}px) scale(${mix(0.8, 1, p).toFixed(3)})`;
  q(r, '#s9glow').style.opacity = String(0.6 + 0.4 * Math.sin(t * 1.8));
  r.querySelectorAll('.tr').forEach((row, i) => appear(row, t, 43.9 + i * 0.25, 0.55, 24, 0.98));
};

/* S10 — the whole thing. */
const MODS = [['users', 'CRM'], ['sparkles', 'AI Autopilot'], ['megaphone', 'Campaigns'], ['workflow', 'Automations'], ['palette', 'Content Studio'], ['kanban', 'Pipelines'], ['calendar', 'Appointments'], ['bar-chart-3', 'Analytics'], ['life-buoy', 'Support']];
const s10 = scene({ a: 46.95, b: 52.4, tin: 0.7, inScale: 1.3, tout: 0.55, origin: '50% 50%', outScale: 0.85 });
s10.root = mount(`<div class="win" id="w10" style="height:800px">${topbar('<b>Dashboard</b>')}
  <div class="wbody">
    <div class="abs" style="left:0;top:0;bottom:0;width:250px;background:#fff;border-right:1px solid #e6e9f0;padding:16px 12px">
      ${MODS.map(m => `<div class="mod" style="display:flex;align-items:center;gap:12px;height:52px;padding:0 12px;border-radius:12px;font-size:17px;font-weight:720;color:#3b4252">${ico(m[0], 20)}${m[1]}</div>`).join('')}
    </div>
    <div class="abs" style="left:270px;right:20px;top:18px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${[['Contacts', '48,720'], ['Pipeline', '$1.24M'], ['Workflows active', '26'], ['AI agents running', '14']].map(k => `<div class="card" style="padding:14px 16px;border-radius:16px"><div class="muted" style="font-size:13px;font-weight:700">${k[0]}</div><div style="font-size:28px;font-weight:840;letter-spacing:-0.03em">${k[1]}</div></div>`).join('')}
    </div>
    <div class="card abs" style="left:270px;right:20px;top:228px;height:250px;padding:14px 16px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:8px;font-size:15px;font-weight:800">${ico('workflow', 16, '#5b46e5')}Running now<span class="pill" style="margin-left:auto;background:#f0fdf4;color:#16a34a;font-size:11.5px"><span class="dot" style="background:#22c55e"></span>Live</span></div>
      <svg class="abs" width="630" height="190" style="left:14px;top:50px;overflow:visible">
        ${[0, 1, 2].map(k => `<path id="rl${k}" d="M20 ${30 + k * 62} L610 ${30 + k * 62}" stroke="#e6e9f0" stroke-width="3" stroke-linecap="round"/>${[0, 1, 2, 3, 4].map(j => `<rect x="${20 + j * 140 - 18}" y="${30 + k * 62 - 18}" width="36" height="36" rx="10" fill="${['#f5f3ff', '#faf5ff', '#eff6ff', '#fdf2f8', '#f0fdf4'][(j + k) % 5]}" stroke="${['#ddd6fe', '#e9d5ff', '#bfdbfe', '#fbcfe8', '#bbf7d0'][(j + k) % 5]}" stroke-width="1.5"/>`).join('')}<circle class="rp" data-k="${k}" r="7" fill="#5b46e5" style="filter:drop-shadow(0 0 6px rgba(91,70,229,.9))"/>`).join('')}
      </svg>
    </div>
    <div class="card abs" style="left:270px;right:20px;top:494px;height:220px;padding:14px 16px;background:#f4f5ff;border-color:#e0e3ff">
      <div class="abs" style="left:20px;top:26px">${BOT(150)}</div>
      <div class="abs" style="left:196px;right:18px;top:26px;display:grid;gap:10px" id="botmsgs">
        ${['Lead qualified.', 'Campaign ready.', 'New content asset created.'].map(m => `<div class="bm" style="background:#fff;border:1px solid #e0e3ff;border-radius:14px;padding:11px 14px;font-size:16px;font-weight:740">${m}</div>`).join('')}
      </div>
    </div>
  </div></div>`);
MODS.forEach((m, i) => sfx(47.5 + i * 0.2, 'tick', 0.18));
s10.render = (t) => {
  const r = s10.root;
  const pull = seg(t, 46.95, 48.4, eo);
  q(r, '#w10').style.transform = `scale(${mix(1.08, 1, pull).toFixed(4)})`;
  r.querySelectorAll('.mod').forEach((m, i) => {
    const a = 47.45 + i * 0.2; const on = seg(t, a, a + 0.15) * (1 - seg(t, a + 0.35, a + 0.6));
    const settled = i === 1 && t > 49.4;
    m.style.background = settled ? '#eef0ff' : `rgba(238,240,255,${on.toFixed(2)})`;
    m.style.color = settled || on > 0.5 ? '#5b46e5' : '#3b4252';
  });
  r.querySelectorAll('.rp').forEach(c => {
    const k = +c.dataset.k; const p = ((t * 0.55 + k * 0.37) % 1);
    c.setAttribute('cx', (20 + p * 590).toFixed(1)); c.setAttribute('cy', 30 + k * 62);
  });
  r.querySelectorAll('.bm').forEach((b, i) => appear(b, t, 47.9 + i * 0.45, 0.4, 14, 0.96));
  animBot(r, t, false, 5);
};

/* The lockup after "One intelligent workspace." */
const s10b = scene({ a: 49.95, b: 52.4, tin: 0.45, inScale: 0.9, tout: 0.45, outScale: 1.06 });
s10b.root = mount(`<div class="abs" style="left:0;right:0;top:470px;display:flex;align-items:center;justify-content:center;gap:24px">${LOGO(120)}<span style="font-size:80px;font-weight:840;color:#fff;letter-spacing:-0.045em">Protected Central</span></div>`);
s10b.render = () => {};
sfx(50.0, 'whoosh_soft', 0.5);

/* CTA */
const s11 = scene({ a: 51.95, b: 56, tin: 0.6, inScale: 0.94 });
s11.root = mount(`
  <div class="abs" id="ctaGlow" style="left:140px;top:640px;width:800px;height:800px;border-radius:50%;background:radial-gradient(circle,rgba(91,70,229,.45),rgba(91,70,229,0) 65%)"></div>
  <div class="abs cta" style="left:0;right:0;top:470px;display:flex;align-items:center;justify-content:center;gap:18px">${LOGO(84)}<span style="font-size:48px;font-weight:820;color:#fff;letter-spacing:-0.04em">Protected Central</span></div>
  <div class="abs cta" style="left:0;right:0;top:612px;text-align:center;color:#fff;font-size:88px;font-weight:860;letter-spacing:-0.05em;line-height:1">Start your</div>
  <div class="abs cta" style="left:0;right:0;top:708px;text-align:center;font-size:104px;font-weight:880;letter-spacing:-0.055em;line-height:1.05"><span class="grad-lime">7-Day Free Trial</span></div>
  <div class="abs cta" style="left:0;right:0;top:870px;text-align:center;color:rgba(226,232,255,.8);font-size:36px;font-weight:560;letter-spacing:-0.02em;line-height:1.3">No complicated setup.<br>Start building with AI.</div>
  <div class="abs cta" id="ctaBtnW" style="left:0;right:0;top:1040px;display:flex;justify-content:center"><div class="cta-btn" id="ctaBtn" style="position:relative;overflow:hidden">TRY PROTECTED CENTRAL FREE ${ico('arrow-right', 34)}<span id="shine" class="abs" style="top:-20px;bottom:-20px;width:120px;left:-160px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.75),rgba(255,255,255,0));transform:skewX(-18deg)"></span></div></div>
  <div class="abs cta" style="left:0;right:0;top:1206px;text-align:center;color:#fff;font-size:44px;font-weight:780;letter-spacing:-0.025em">ProtectedCentral.com</div>
  <div class="abs cta" style="left:0;right:0;top:1296px;text-align:center;font-size:34px;font-weight:650;letter-spacing:-0.02em;color:rgba(226,232,255,.62)">Describe it. <span class="grad-blue" style="font-weight:780">AI builds it.</span></div>
`);
sfx(52.0, 'impact', 0.9); sfx(53.95, 'click', 0.8); sfx(54.2, 'sting', 1);
s11.render = (t) => {
  const r = s11.root;
  r.querySelectorAll('.cta').forEach((c, i) => {
    const a = 52.05 + [0, 0.15, 0.28, 0.6, 0.8, 1.0, 1.15][i];
    const p = seg(t, a, a + 0.55, eo5);
    c.style.opacity = String(p);
    c.style.transform = `translateY(${((1 - p) * 30).toFixed(1)}px)`;
    c.style.filter = p < 0.99 ? `blur(${((1 - p) * 8).toFixed(1)}px)` : 'none';
  });
  const press = lin(t, 53.9, 54.1);
  q(r, '#ctaBtn').style.transform = `scale(${(1 - Math.sin(press * Math.PI) * 0.05).toFixed(3)})`;
  q(r, '#shine').style.left = (-160 + seg(t, 53.3, 54.0, eio) * 820).toFixed(1) + 'px';
  q(r, '#ctaGlow').style.transform = `scale(${(1 + Math.sin(t * 1.5) * 0.05).toFixed(3)})`;
};

/* ── Toasts and cursor ───────────────────────────────────────────────── */
const TOASTS = [[19.55, 21.2, 'Lead qualified.'], [22.95, 24.5, 'Campaign ready.'], [30.65, 32.3, 'New content asset created.'], [35.5, 36.9, 'Ticket routed to Support.']];
TOASTS.forEach(x => sfx(x[0], 'notify', 0.55));
function renderToast(t) {
  const el_ = document.getElementById('toast');
  const cur = TOASTS.find(x => t >= x[0] && t <= x[1]);
  if (!cur) { el_.style.opacity = '0'; return; }
  const tt = document.getElementById('toastText');
  if (tt.textContent !== cur[2]) tt.textContent = cur[2];
  const p = seg(t, cur[0], cur[0] + 0.4, back), o = seg(t, cur[1] - 0.3, cur[1]);
  el_.style.opacity = String(clamp(p) * (1 - o));
  el_.style.transform = `translateY(${((1 - p) * 30 + o * 10).toFixed(1)}px) scale(${mix(0.9, 1, p).toFixed(3)})`;
  animBot(el_, t, false, 9);
}
/* Cursor path: [time, x, y]. */
const CUR = [[7.6, 1120, 1420], [8.25, 524, 1186], [8.9, 532, 1196], [9.6, 1120, 1450], [53.2, 1120, 1500], [53.85, 738, 1080], [55.2, 744, 1088]];
function renderCursor(t) {
  const c = document.getElementById('cursor');
  let seg_ = null;
  for (let i = 0; i < CUR.length - 1; i++) if (t >= CUR[i][0] && t <= CUR[i + 1][0] && !(i === 3)) seg_ = [CUR[i], CUR[i + 1]];
  if (!seg_) { c.style.opacity = '0'; } else {
    const p = eio(lin(t, seg_[0][0], seg_[1][0]));
    const x = mix(seg_[0][1], seg_[1][1], p), y = mix(seg_[0][2], seg_[1][2], p);
    c.style.opacity = '1'; c.style.left = x + 'px'; c.style.top = y + 'px';
  }
  const rp = document.getElementById('ripple');
  const clicks = [[8.66, 531, 1191], [53.95, 745, 1085]];
  const cl = clicks.find(k => t >= k[0] && t < k[0] + 0.5);
  if (cl) {
    const p = lin(t, cl[0], cl[0] + 0.5);
    rp.style.left = cl[1] - 10 + 'px'; rp.style.top = cl[2] - 10 + 'px';
    rp.style.opacity = String(1 - p); rp.style.transform = `scale(${1 + eo(p) * 4})`;
  } else rp.style.opacity = '0';
}

/* ── Ground ──────────────────────────────────────────────────────────── */
function renderBg(t) {
  const g1 = document.getElementById('g1'), g2 = document.getElementById('g2'), g3 = document.getElementById('g3');
  const calm = seg(t, 42.9, 43.6) * (1 - seg(t, 46.8, 47.6));
  const cta = seg(t, 51.9, 52.8);
  g1.style.transform = `translate(${Math.sin(t * 0.21) * 120}px, ${Math.cos(t * 0.17) * 160}px)`;
  g2.style.transform = `translate(${Math.cos(t * 0.19) * 110}px, ${Math.sin(t * 0.23) * 140}px)`;
  g3.style.transform = `translate(${Math.sin(t * 0.27) * 160}px, ${Math.cos(t * 0.2) * 80}px)`;
  const intro = seg(t, 0, 1.2);
  g1.style.opacity = String((0.34 + 0.08 * Math.sin(t * 0.7)) * intro * (1 - calm * 0.6) * (1 + cta * 0.3));
  g2.style.opacity = String((0.3 + 0.08 * Math.cos(t * 0.6)) * intro * (1 - calm * 0.5));
  g3.style.opacity = String(0.16 * intro * (1 - calm));
  document.getElementById('dots').style.transform = `translateY(${(-t * 6) % 34}px)`;
}

/* ── Render ──────────────────────────────────────────────────────────── */
buildHeads();
window.render = (t) => {
  renderBg(t);
  SCENES.forEach(sc => { if (sceneFx(sc, t)) sc.render(t); });
  renderHeads(t);
  renderToast(t);
  renderCursor(t);
};
window.DURATION = 55.8;
document.getElementById('toastBot').innerHTML = BOT(40);
window.SFX.sort((a, b) => a.t - b.t);
window.render(0);
window.READY = document.fonts.ready.then(() => true);
