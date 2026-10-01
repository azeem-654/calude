/* Protected Central — launch film, 16:9, about three minutes.
   Every frame is a pure function of time: window.render(t) paints second t.
   Built from the short ad in ../launch-ad: its helpers and seven of its
   product scenes are carried over verbatim (moved into place by `place`),
   and the rest is drawn for a wide frame — the window on the right, the
   words on the left, nothing cropped from a taller picture. */
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
/* Each cue remembers the scene being defined, so a scene moved to a new
   place in the film (`place`) takes its sounds with it. */
window.SFX = [];
let CUR_SCENE = null;
const sfx = (t, type, gain = 1) => window.SFX.push({ t, type, gain, sc: CUR_SCENE });

/* ── The left column: what this part of the product is, in words ──────── */
/* `~word` = blue→violet, `^word` = lime. Bullets are [icon, text]. */
const COPY = [];
const copy = (a, b, o) => COPY.push({ a, b, ...o });
function buildCopy() {
  const host = document.getElementById('copy');
  COPY.forEach(c => {
    const box = el('<div class="cp"></div>');
    if (c.kick) box.appendChild(el(`<div class="kick">${c.kick}</div>`));
    let wi = 0;
    c.lines.forEach(line => {
      const ln = el('<div class="line"></div>');
      const words = line.split(' ');
      words.forEach((w, i) => {
        let cls = '';
        if (w.startsWith('~')) { cls = 'grad-blue'; w = w.slice(1); } else if (w.startsWith('^')) { cls = 'grad-lime'; w = w.slice(1); }
        const s = el(`<span class="w ${cls}">${w}</span>`);
        s.dataset.i = wi++;
        ln.appendChild(s);
        if (i < words.length - 1) ln.appendChild(document.createTextNode(' '));
      });
      box.appendChild(ln);
    });
    if (c.sub) box.appendChild(el(`<div class="sub">${c.sub}</div>`));
    if (c.bullets) box.appendChild(el(`<div class="bl">${c.bullets.map(b => `<div class="b"><span class="bi">${ico(b[0], 19)}</span><span>${b[1]}</span></div>`).join('')}</div>`));
    c.el = box; c.words = wi;
    host.appendChild(box);
    CUR_SCENE = null;
    sfx(c.a, 'whoosh_soft', 0.3);
    const tS = c.a + 0.3 + wi * 0.05;
    (c.bullets || []).forEach((_, i) => sfx(tS + 0.45 + i * 0.35, 'tick', 0.18));
  });
}
function renderCopy(t) {
  COPY.forEach(c => {
    const on = t >= c.a - 0.01 && t <= c.b + 0.01;
    c.el.style.display = on ? 'block' : 'none';
    if (!on) return;
    const out = seg(t, c.b - 0.4, c.b, ei);
    const fade = (node, st) => {
      const p = seg(t, st, st + 0.55, eo5);
      node.style.opacity = String(p * (1 - out));
      node.style.transform = `translateY(${((1 - p) * 30 - out * 16).toFixed(1)}px)`;
      const bl = (1 - p) * 8 + out * 8;
      node.style.filter = bl > 0.05 ? `blur(${bl.toFixed(1)}px)` : 'none';
    };
    const k = q(c.el, '.kick'); if (k) fade(k, c.a);
    c.el.querySelectorAll('.w').forEach(w => fade(w, c.a + 0.15 + (+w.dataset.i) * 0.05));
    const tS = c.a + 0.3 + c.words * 0.05;
    const sub = q(c.el, '.sub'); if (sub) fade(sub, tS);
    c.el.querySelectorAll('.b').forEach((b, i) => fade(b, tS + 0.45 + i * 0.35));
  });
}

/* ── Scenes ──────────────────────────────────────────────────────────── */
const SCENES = [];
function scene(o) { SCENES.push(o); CUR_SCENE = o; return o; }
/* Move a scene written for the short ad to [na, nb] in this film, slowing
   it to fit. Its render keeps its own clock (`map`), and its sounds move
   with it. */
function place(sc, na, nb) {
  const oa = sc.a, ob = sc.b, k = (ob - oa) / (nb - na);
  sc.map = t => oa + (t - na) * k;
  sc.unmap = t => na + (t - oa) / k;
  sc.a = na; sc.b = nb;
  window.SFX.forEach(e => { if (e.sc === sc && !e.moved) { e.t = sc.unmap(e.t); e.moved = true; } });
}
const at = (sc, origT) => sc.unmap ? sc.unmap(origT) : origT;
function sceneFx(sc, t) {
  const r = sc.root;
  const on = t >= sc.a && t <= sc.b;
  r.style.display = on ? 'block' : 'none';
  if (!on) return false;
  const inP = sc.tin ? seg(t, sc.a, sc.a + sc.tin, eo) : 1;
  const outP = sc.tout ? seg(t, sc.b - sc.tout, sc.b, ei) : 0;
  const s = mix(sc.inScale ?? 0.9, 1, inP) * mix(1, sc.outScale ?? 1.16, outP);
  r.style.transformOrigin = sc.origin || '70% 50%';
  r.style.transform = `scale(${s.toFixed(4)})`;
  r.style.opacity = String(inP * (1 - outP));
  const blur = (1 - inP) * 10 + outP * 12;
  r.style.filter = blur > 0.05 ? `blur(${blur.toFixed(1)}px)` : 'none';
  return true;
}
const mount = (html) => { const r = el(`<div class="scene">${html}</div>`); document.getElementById('scenes').appendChild(r); return r; };
/* A product window on the right-hand side; the left column carries the words. */
const winScene = (a, b, id, crumb, body, o = {}) => {
  const sc = scene({ a, b, tin: 0.55, inScale: 0.86, tout: 0.45, origin: '72% 50%', outScale: 1.2, ...o });
  sc.root = mount(`<div class="win" id="${id}">${topbar(crumb)}<div class="wbody${o.grid ? ' gridbg' : ''}">${body}</div></div>`);
  return sc;
};
/* Type `text` into `node` between a and b. */
const typeInto = (node, text, t, a, b) => { const n = Math.floor(clamp((t - a) / (b - a)) * text.length); const s = text.slice(0, n); if (node.textContent !== s) node.textContent = s; return n; };
const setText = (node, s) => { if (node && node.textContent !== s) node.textContent = s; };

/* ── From the short ad: drawings used by the intro ──────────────────── */
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
/* ════ Scenes carried over from the short ad, at their original times. ════ */
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


/* ════════════════════════════════════════════════════════════════════════
   THE FILM — 16:9, about three minutes.
   Scenes from the short ad are moved into place with `place`; everything
   else below is drawn for this frame. The window sits on the right, the
   words on the left, and nothing is cropped from a taller picture.
   ════════════════════════════════════════════════════════════════════════ */
CUR_SCENE = null;
const T = {
  intro: [0, 6.4], s2: [6.0, 16.0], plan: [15.6, 27.6], canvas: [27.2, 39.2], s3: [38.8, 47.8],
  lib: [47.4, 54.4], guard: [54.0, 63.0], reply: [62.6, 71.6], s4: [71.2, 79.2], s5: [78.8, 86.8],
  s6: [86.4, 94.4], web: [94.0, 102.0], s7: [101.6, 109.6], live: [109.2, 117.2], s8: [116.8, 124.8],
  agency: [124.4, 132.4], dev: [132.0, 154.0], trust: [153.6, 160.6], s10: [160.2, 166.0],
  lock: [165.6, 168.3], cta: [167.9, 178.6],
  /* Drawn for v2; the start times only need to be apart, `place` moves them. */
  money: [300, 320.4], streams: [330, 348.9], blog: [360, 374.6], shorts: [380, 395.2],
  gallery: [400, 411.6], reviews: [420, 433.9], resell: [440, 452.5], affiliate: [460, 471.7],
};
/* Every scene is drawn against T, then moved to the slot its voice lines
   occupy (NT, from timing.mjs) once all of them exist — see the bottom. */
const NT = window.NT, NC = window.NC;
CUR_SCENE = null;

/* ── Intro: ten tools, then one ─────────────────────────────────────── */
const CX = 960, CY = 560;
const FRAGS = [
  { n: 'CRM', i: 'users', x: 120, y: 262, r: -6, kind: 'rows' },
  { n: 'Email', i: 'mail', x: 470, y: 236, r: 5, kind: 'list' },
  { n: 'Calendar', i: 'calendar', x: 1160, y: 240, r: -2, kind: 'grid' },
  { n: 'Q3 leads.xlsx', i: 'file-text', x: 1500, y: 290, r: 4, kind: 'sheet' },
  { n: 'Social', i: 'image', x: 90, y: 620, r: -5, kind: 'img' },
  { n: 'Tasks', i: 'list-checks', x: 450, y: 560, r: 3, kind: 'checks' },
  { n: 'Analytics', i: 'bar-chart-3', x: 1180, y: 600, r: -3, kind: 'bars' },
  { n: 'Support', i: 'life-buoy', x: 1540, y: 640, r: 6, kind: 'chat' },
  { n: 'Pipeline', i: 'kanban', x: 820, y: 700, r: -4, kind: 'cols' },
  { n: 'Inbox (214)', i: 'inbox', x: 800, y: 330, r: 2, kind: 'list' },
];
const s1 = scene({ a: T.intro[0], b: T.intro[1], tout: 0 });
s1.root = mount(`
  ${FRAGS.map((f, i) => `<div class="frag" id="fr${i}" style="left:${f.x}px;top:${f.y}px"><div class="fbar"><i></i><i></i><i></i><span style="margin-left:6px;display:flex;align-items:center;gap:6px">${ico(f.i, 15, '#5b6475')}${f.n}</span></div><div class="fbody">${fragBody(f.kind)}</div></div>`).join('')}
  <div class="big" id="s1h1" style="top:128px;font-size:66px">Your business shouldn't need <span class="grad-blue">10 different tools.</span></div>
  <div class="big" id="s1h2" style="top:860px;font-size:56px">Bring it all to <span class="grad-lime">one place.</span></div>
  <div class="abs" id="s1ring" style="left:${CX}px;top:${CY}px;width:10px;height:10px;border-radius:50%;border:3px solid rgba(214,249,111,.9);opacity:0"></div>
  <div class="abs" style="left:${CX}px;top:${CY}px;width:0;height:0;">
    <div id="s1mark" style="position:absolute;left:-110px;top:-110px;width:220px;height:220px">${LOGO(220, false)}</div>
  </div>
  <div class="big" id="s1word" style="top:${CY + 150}px;font-size:70px;opacity:0">Protected Central</div>
`);
s1.root.style.zIndex = 5;
FRAGS.forEach((f, i) => { f.el = q(s1.root, '#fr' + i); f.d = 0.1 + i * 0.08; sfx(f.d, 'pop', 0.25); });
sfx(2.9, 'bass_hit', 1); sfx(2.45, 'whoosh_in', 0.8);
s1.render = (t) => {
  const r = s1.root;
  FRAGS.forEach((f, i) => {
    const pin = seg(t, f.d, f.d + 0.35, back);
    const col = seg(t, 2.45 + i * 0.012, 2.9, ei);
    const jx = Math.sin(t * 2.3 + i * 1.7) * 16 + Math.sin(t * 5.1 + i) * 4;
    const jy = Math.cos(t * 1.9 + i * 2.1) * 12;
    const cx = CX - 150 - f.x, cy = CY - 80 - f.y;
    const x = jx * (1 - col) + cx * col, y = jy * (1 - col) + cy * col;
    const rot = f.r * (1 + Math.sin(t * 1.3 + i) * 0.4) * (1 - col);
    const sc = pin * mix(1, 0.12, col) * (1 + Math.sin(t * 3 + i) * 0.015);
    f.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
    f.el.style.opacity = String(clamp(pin * 1.3) * (1 - seg(t, 2.7, 2.92)));
  });
  const h1 = q(r, '#s1h1'); const p1 = seg(t, 0.25, 0.9, eo5) * (1 - seg(t, 2.4, 2.8));
  h1.style.opacity = String(p1); h1.style.transform = `translateY(${((1 - p1) * 24).toFixed(1)}px)`;
  const h2 = q(r, '#s1h2'); const p2 = seg(t, 3.5, 4.1, eo5) * (1 - seg(t, 4.9, 5.3));
  h2.style.opacity = String(p2); h2.style.transform = `translateY(${((1 - p2) * 24).toFixed(1)}px)`;
  const ring = q(r, '#s1ring');
  const rp = lin(t, 2.85, 3.6);
  ring.style.opacity = String(rp > 0 && rp < 1 ? (1 - rp) * 0.9 : 0);
  const d = 10 + eo(rp) * 1100;
  ring.style.width = ring.style.height = d.toFixed(1) + 'px';
  ring.style.borderWidth = (3 - rp * 2).toFixed(2) + 'px';
  ring.style.transform = 'translate(-50%,-50%)';
  const m = q(r, '#s1mark');
  const lp = seg(t, 2.85, 3.45, back);
  const zoom = seg(t, 5.8, 6.4, x => x * x * x * x);
  m.style.opacity = String(clamp(lp * 2));
  m.style.transformOrigin = '50% 50.3%';
  m.style.transform = `scale(${(lp * (1 + zoom * 40)).toFixed(3)}) rotate(${((1 - lp) * -12).toFixed(2)}deg)`;
  document.getElementById('g4').style.opacity = String(seg(t, 2.85, 3.2) * (1 - seg(t, 5.0, 6.0)) * 0.75);
  const w = q(r, '#s1word');
  const wp = seg(t, 3.15, 3.65, eo5);
  w.style.opacity = String(wp * (1 - seg(t, 5.4, 5.8)));
  w.style.transform = `translateY(${(1 - wp) * 26}px)`;
  r.style.opacity = String(1 - seg(t, 6.2, 6.4));
};

/* ── The words on the left, scene by scene ──────────────────────────── */
/* Each block spans its scene's voice (NC, from timing.mjs). */
const cp = (k, o) => copy(...NC[k], o);
cp('s2', { kick: 'AI Autopilot', lines: ['Tell AI', '~what ~you ~want.'], sub: 'Type it, say it, or point it at your website.',
  bullets: [['globe', 'Reads your business from your website'], ['message-circle-question', 'Asks only what it still needs'], ['sparkles', 'Builds workflows, agents and campaigns']] });
cp('plan', { kick: 'AI Autopilot · Blueprint', lines: ['See the plan', '~before ~it ~runs.'], sub: 'Change anything in plain words — or by voice.',
  bullets: [['list-checks', 'Every workflow, listed in order'], ['pen-line', 'Edit a sentence, the plan rebuilds'], ['shield-check', 'Nothing runs until you approve']] });
cp('canvas', { kick: 'AI agents', lines: ['AI agents inside', '~every ~workflow.'], sub: 'They read your website and the web, then write in your voice.',
  bullets: [['git-branch', 'Triggers, conditions, delays, branches'], ['database', 'AI steps with real data sources'], ['pencil', 'Edit any step in place']] });
cp('s3', { kick: 'Runs on its own', lines: ['Working', '~while ~you ~sleep.'], sub: 'The server runs every workflow every five minutes — tabs closed or not.',
  bullets: [['activity', 'Live status on every step'], ['scroll-text', 'A delivery log for every send'], ['mail', 'A daily digest of what happened']] });
cp('money', { kick: 'Autopilot · Your shop', lines: ['Sales that keep', '^coming ^in.'], sub: 'Paid straight into your own Stripe account — never ours.',
  bullets: [['camera', 'Posts your products on schedule'], ['link', 'A fresh payment link when an order stalls'], ['heart-handshake', 'Thanks every buyer the moment they pay']] });
cp('streams', { kick: 'Multiple projects', lines: ['Set up once.', '~Many ~streams.'], sub: 'Each project starts from a sentence or your voice — then keeps working.',
  bullets: [['camera', 'Social Media Growth'], ['shopping-bag', 'E-commerce Store'], ['target', 'Lead Generation'], ['newspaper', 'Blog & SEO']] });
cp('lib', { kick: 'Template library', lines: ['Start from', '^33 ^ready-made', '^AI ^workflows.'], sub: 'Built from what businesses ask for most.' });
cp('guard', { kick: 'Guardrails', lines: ['You stay', '~in ~control.'], sub: "Anything that sends waits for your yes — until you decide it doesn't have to.",
  bullets: [['sliders-horizontal', 'Off, Ask me or On — per ability'], ['check-circle-2', 'Approve from the board in one click'], ['scroll-text', 'Every action written down']] });
cp('reply', { kick: 'AI replies', lines: ['Every reply,', '~answered ~fast.'], sub: 'AI drafts the answer from your business profile. The sequence stops by itself.',
  bullets: [['inbox', 'Replies caught from your own mailbox'], ['pen-line', 'Drafted in your tone'], ['send', 'Sent on approval, or automatically']] });
cp('s4', { kick: 'CRM & pipeline', lines: ['Know every lead.', '~Every ~deal.'], sub: 'Stages you define. Value counted from your own records.',
  bullets: [['users', 'Contacts with their full history'], ['calendar-check', 'Deal tasks with due dates'], ['kanban', 'Weighted pipeline value']] });
cp('s5', { kick: 'Campaigns', lines: ["Campaigns that don't", 'stop at ~Send.'], sub: 'Multi-step sequences on your own mailbox and number.',
  bullets: [['mail', 'Email and SMS steps'], ['hand', 'Stops the moment someone replies'], ['clock', 'Sent by the server, on schedule']] });
cp('s6', { kick: 'Content Studio', lines: ['From idea', 'to ~finished ~asset.'], sub: 'Posts, articles and emails in your colours and your voice.',
  bullets: [['image', 'Posts sized for every platform'], ['file-text', 'Articles from your topics'], ['user-check', 'Reviewed before anything goes out']] });
cp('blog', { kick: 'Blog & SEO', lines: ['Articles that', '~rank ~on ~Google.'], sub: 'A month of posts around your keywords, published to WordPress.',
  bullets: [['calendar-days', 'A whole month planned at once'], ['list-checks', 'Nine SEO checks on every post'], ['send', 'Published on schedule']] });
cp('shorts', { kick: 'AI Shorts', lines: ['One long video.', '^A ^week ^of ^shorts.'], sub: 'AI finds the best moments and cuts them to 9:16.',
  bullets: [['scissors', 'Best moments, found and cut'], ['captions', 'Captions and hashtags written'], ['flame', 'A viral score on every clip']] });
cp('gallery', { kick: 'Websites & funnels', lines: ['^65 ^ready-built', 'templates.'], sub: '17 websites and 48 funnels, ready to make yours.',
  bullets: [['layout-template', 'Websites, stores and restaurants'], ['clipboard-list', 'Quote requests, quizzes, webinars'], ['play-circle', 'Video sales letters']] });
cp('web', { kick: 'Websites & funnels', lines: ['Live on', '~your ~domain.'], sub: 'In your brand, with forms that start the follow-up.',
  bullets: [['palette', 'Your colours, one click'], ['clipboard-list', 'Forms that start the follow-up'], ['globe', 'Published on your domain']] });
cp('reviews', { kick: 'Reputation', lines: ['Five stars,', '~on ~repeat.'], sub: 'Review requests by email, and AI replies in your tone.',
  bullets: [['mail', 'Ask happy customers in one click'], ['star', 'Google, Facebook, Yelp or Trustpilot'], ['sparkles', 'AI drafts every reply']] });
cp('s7', { kick: 'Appointments & support', lines: ['Sales. Support.', '^Connected.'], sub: 'Bookings, tickets and conversations in one timeline.',
  bullets: [['calendar', 'Booking pages with Google Meet'], ['ticket', 'Tickets with a reference'], ['message-square', 'AI chat on your website']] });
cp('live', { kick: 'Live help', lines: ['See their screen.', '~Fix ~it ~together.'], sub: 'Customers share their screen in one click. Nothing to install.',
  bullets: [['monitor', 'Straight from browser to browser'], ['mouse-pointer-click', 'Point, talk and chat'], ['video', 'Switch to Google Meet any time']] });
cp('s8', { kick: 'Dashboard', lines: ["See what's happening.", "~See ~what's ~next."], sub: 'Every module in one command centre.' });
cp('agency', { kick: 'For agencies', lines: ['Run it for', '~every ~client.'], sub: 'Each client in their own workspace — under your brand and your address.',
  bullets: [['building-2', 'Sub-accounts with their own data'], ['palette', 'Your logo, colours and domain'], ['file-bar-chart', 'Reports you can send your clients']] });
cp('resell', { kick: 'Resell it · white label', lines: ['Your price.', '^Your ^clients.'], sub: 'They pay you monthly, on your own Stripe or Creem account.',
  bullets: [['tag', 'Any price, set per client'], ['palette', 'Your brand, logo and domain'], ['wallet', 'Paid to you — we never hold it']] });
cp('affiliate', { kick: 'Affiliate program', lines: ['Earn ^40%,', '~for ~life.'], sub: 'Of every payment from every customer you refer — for as long as they keep paying.',
  bullets: [['link', 'One link to share'], ['bar-chart-3', 'Visits, sign-ups and commissions'], ['badge-dollar-sign', 'Every month they pay, you earn']] });
cp('dev', { kick: 'Always improving', lines: ['Always building', "^what's ^next."], sub: 'Around 130–150 updates a month — new AI tools, modules and fixes, landing in your workspace automatically.',
  bullets: [['sparkles', 'New AI tools and modules, all the time'], ['refresh-cw', 'No installs, no upgrades to run'], ['rocket', 'The latest, the day it ships']] });
cp('s10', { kick: 'One workspace', lines: ['One', '~intelligent', '~workspace.'] });

/* ── Blueprint ──────────────────────────────────────────────────────── */
const PLAN_Q = [['Who are your customers?', 'Homeowners around Austin'], ['How should we reach them?', 'Email, SMS and Instagram'], ['Where do people book?', 'Your booking page']];
const PLAN_W = [
  ['zap', 'Answer every new lead within minutes', 'Email · 4 steps'],
  ['file-clock', 'Follow up quotes that go quiet', 'Email · 3 steps'],
  ['camera', 'Post on Instagram every weekday', 'AI agent · daily'],
  ['star', 'Ask happy customers for a review', 'Email · 2 steps'],
  ['newspaper', 'An SEO article every week', 'AI agent · weekly'],
];
const EDIT_TXT = "Also text them if they don't open the email";
const B1 = T.plan[0];
const sPlan = winScene(...T.plan, 'wPlan', '<b>AI Autopilot</b><span>›</span>New project<span>›</span>Blueprint', `
  <div class="abs" style="left:28px;top:20px"><div class="h2">Your blueprint</div><div class="muted" style="font-size:16px;margin-top:4px;font-weight:550">Read it, change it in words, then build.</div></div>
  <div class="card abs" style="left:24px;top:104px;width:352px;height:398px;padding:20px">
    <div class="kicker">Only what it still needs</div>
    ${PLAN_Q.map((x, i) => `<div class="pq" style="margin-top:${i ? 14 : 16}px"><div style="font-size:15px;font-weight:750;color:#17191c">${x[0]}</div>
      <div style="margin-top:7px;height:44px;border-radius:12px;border:1.5px solid #e6e9f0;display:flex;align-items:center;padding:0 12px;font-size:16px;font-weight:650;color:#17191c;gap:8px"><span class="pa"></span><span class="pchk" style="margin-left:auto;opacity:0">${ico('check-circle-2', 18, '#16a34a')}</span></div></div>`).join('')}
  </div>
  <div class="abs" style="left:24px;top:522px;width:352px">
    <div class="btn abs" id="planBuild" style="left:0;top:0;padding:15px 22px;background:#5b46e5;color:#fff;font-size:19px;box-shadow:0 10px 24px rgba(91,70,229,.35)">${ico('sparkles', 20)}Approve &amp; build</div>
    <div class="muted abs" style="left:2px;top:70px;font-size:14px;font-weight:600">Nothing runs until you approve.</div>
  </div>
  <div class="card abs" style="left:392px;top:104px;width:544px;height:474px;padding:20px">
    <div class="kicker">Workflows Autopilot will build</div>
    ${PLAN_W.map((w, i) => `<div class="pw" style="margin-top:12px;display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;border:1.5px solid #e6e9f0;background:#fff">
      <span style="width:40px;height:40px;border-radius:12px;background:#f4f5ff;color:#5b46e5;display:flex;align-items:center;justify-content:center">${ico(w[0], 20)}</span>
      <div style="flex:1;min-width:0"><div style="font-size:16.5px;font-weight:760;color:#17191c">${w[1]}</div><div class="pm muted" style="font-size:13.5px;font-weight:650;margin-top:2px">${w[2]}</div></div>
      <span class="pupd pill" style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;font-size:12px;opacity:0">Updated</span>
      <span style="width:42px;height:24px;border-radius:12px;background:#5b46e5;position:relative;flex-shrink:0"><span style="position:absolute;right:3px;top:3px;width:18px;height:18px;border-radius:50%;background:#fff"></span></span></div>`).join('')}
  </div>
  <div class="abs" id="planEdit" style="left:392px;top:594px;width:544px;height:62px;border-radius:16px;background:#fff;border:2px solid #e0e3ff;display:flex;align-items:center;gap:12px;padding:0 14px;box-shadow:0 8px 24px rgba(91,70,229,.12)">
    ${ico('sparkles', 20, '#5b46e5')}<span style="flex:1;font-size:17px;font-weight:650;color:#17191c"><span id="planTxt"></span><span id="planPh" style="color:#9aa3b2;font-weight:550">Change it in words…</span></span>
    <span class="pill" style="background:#f4f5ff;color:#5b46e5;border:1px solid #e0e3ff">${ico('mic', 15)}Speak</span>
  </div>`);
PLAN_Q.forEach((_, i) => sfx(B1 + 0.9 + i * 1.0, 'key', 0.2));
PLAN_W.forEach((_, i) => sfx(B1 + 3.6 + i * 0.35, 'tick', 0.25));
for (let t = B1 + 6.2; t < B1 + 8.4; t += 0.09) sfx(t, 'key', 0.15);
sfx(B1 + 8.8, 'notify', 0.5); sfx(B1 + 10.3, 'click', 0.9);
sPlan.render = (t) => {
  const r = sPlan.root, L = t - B1;
  r.querySelectorAll('.pq').forEach((row, i) => {
    typeInto(q(row, '.pa'), PLAN_Q[i][1], L, 0.9 + i * 1.0, 1.6 + i * 1.0);
    q(row, '.pchk').style.opacity = String(seg(L, 1.65 + i * 1.0, 1.9 + i * 1.0));
  });
  r.querySelectorAll('.pw').forEach((row, i) => appear(row, L, 3.6 + i * 0.35, 0.45, 18, 0.98));
  const n = typeInto(q(r, '#planTxt'), EDIT_TXT, L, 6.2, 8.4);
  q(r, '#planPh').style.display = n ? 'none' : 'inline';
  const upd = seg(L, 8.8, 9.1);
  const row2 = r.querySelectorAll('.pw')[1];
  setText(q(row2, '.pm'), L >= 8.8 ? 'Email + SMS · 5 steps' : 'Email · 3 steps');
  q(row2, '.pupd').style.opacity = String(upd * (1 - seg(L, 10.8, 11.2)));
  row2.style.borderColor = L >= 8.8 && L < 10.4 ? '#a5b4fc' : '#e6e9f0';
  row2.style.boxShadow = L >= 8.8 && L < 10.4 ? '0 0 0 5px rgba(91,70,229,.10)' : 'none';
  q(r, '#planEdit').style.borderColor = L > 6.0 && L < 8.9 ? '#a5b4fc' : '#e0e3ff';
  const press = lin(L, 10.3, 10.5);
  q(r, '#planBuild').style.transform = `scale(${(1 - Math.sin(press * Math.PI) * 0.06 + Math.sin(L * 5) * 0.012 * seg(L, 9.4, 9.8)).toFixed(3)})`;
};

/* ── Canvas: an AI agent inside a workflow, and its settings ────────── */
const B2 = T.canvas[0];
const WFA = { title: 'New lead, researched and answered', icon: 'bot', nodes: [
  ['New form lead', 'trigger', 'user-plus', 0, 0], ['Research the lead', 'ai', 'search', 1, 0], ['Write the intro', 'ai', 'pen-line', 2, 0],
  ['Budget over $5k?', 'condition', 'git-branch', 3, 0], ['Send email', 'email', 'mail', 4, 0], ['Add to nurture', 'email', 'heart-handshake', 4, 1]],
  edges: [[0, 1], [1, 2], [2, 3], [3, 4, 'Yes'], [3, 5, 'No']],
  timing: i => B2 + 1.0 + [0, 0.55, 1.1, 1.65, 2.2, 7.6][i] };
const CANVAS_OUT = 'Hi Maria — thanks for asking about a kitchen remodel. I saw you are in East Austin; we finished two kitchens near you this spring. Could I call Thursday?';
const sCanvas = winScene(...T.canvas, 'wCanvas', 'AI Autopilot<span>›</span>Lead Engine<span>›</span><b>Workflow</b>', `
  <div class="abs" style="left:18px;right:18px;top:16px;height:300px;border-radius:18px;background:#fff;border:1px solid #e6e9f0;overflow:hidden">
    <div class="abs" style="left:18px;top:14px;display:flex;align-items:center;gap:10px;font-size:16px;font-weight:800">${ico('bot', 18, '#5b46e5')}${WFA.title}<span class="pill" style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;font-size:12px"><span class="dot" style="background:#22c55e"></span>Live</span></div>
    <div class="abs gridbg" style="left:0;right:0;top:48px;bottom:0;overflow:hidden">${wfCanvas(WFA, 'A')}</div>
    <div class="abs" id="selRing" style="border-radius:20px;border:3px solid #9333ea;box-shadow:0 0 0 6px rgba(147,51,234,.15);opacity:0;pointer-events:none"></div>
  </div>
  <div class="abs" id="cfg" style="left:18px;right:18px;top:332px;height:388px;border-radius:18px;background:#fff;border:1px solid #e6e9f0;overflow:hidden">
    <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid #eef0f4">
      <span style="width:34px;height:34px;border-radius:10px;background:#faf5ff;color:#9333ea;display:flex;align-items:center;justify-content:center">${ico('search', 18)}</span>
      <div><div class="kicker" style="color:#9333ea">AI agent · step settings</div><div style="font-size:17px;font-weight:800;color:#17191c">Research the lead</div></div>
      <span class="pill" style="margin-left:auto;background:#f4f5ff;color:#5b46e5;border:1px solid #e0e3ff">${ico('pencil', 14)}Editing in place</span>
    </div>
    <div class="abs" style="left:18px;top:84px;width:280px">
      <div class="kicker">Reads from</div>
      ${[['globe', 'Your website', 'acme-remodel.com'], ['search', 'Web search', 'News and reviews'], ['user', 'The contact record', 'Form answers']].map((s, i) => `<div class="src" style="margin-top:10px;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;border:1.5px solid #e6e9f0;opacity:0">
        ${ico(s[0], 18, '#9333ea')}<div style="flex:1"><div style="font-size:14.5px;font-weight:750">${s[1]}</div><div class="muted" style="font-size:12.5px;font-weight:600">${s[2]}</div></div>${ico('check-circle-2', 17, '#16a34a')}</div>`).join('')}
    </div>
    <div class="abs" style="left:318px;top:84px;width:250px">
      <div class="kicker">Instructions</div>
      <div id="cfgIns" style="margin-top:10px;height:176px;border-radius:12px;border:1.5px solid #e6e9f0;padding:12px;font-size:14.5px;line-height:1.45;font-weight:600;color:#334155"></div>
      <div style="margin-top:10px;display:flex;gap:8px"><span class="pill" style="background:#f6f7fb;border:1px solid #e6e9f0;color:#475569">Tone: friendly</span><span class="pill" style="background:#f6f7fb;border:1px solid #e6e9f0;color:#475569">Max 80 words</span></div>
    </div>
    <div class="abs" style="left:588px;right:18px;top:84px">
      <div style="display:flex;align-items:center;gap:8px"><div class="kicker">Test run</div><span id="cfgState" class="pill" style="margin-left:auto;font-size:12px;background:#f4f5ff;color:#5b46e5">Running…</span></div>
      <div style="margin-top:10px;height:230px;border-radius:12px;background:#faf5ff;border:1.5px solid #e9d5ff;padding:12px;font-size:14.5px;line-height:1.5;font-weight:600;color:#17191c"><span id="cfgOut"></span></div>
    </div>
  </div>`, { grid: true });
const CFG_INS = 'Read the website and the lead\'s answers. Find what they want and where they are. Write a short, warm intro that mentions both.';
WFA.nodes.forEach((n, i) => { sfx(WFA.timing(i), 'pulse', 0.35); sfx(WFA.timing(i) + PROC, 'tick', 0.22); });
sfx(B2 + 4.1, 'whoosh_soft', 0.5); for (let t = B2 + 6.9; t < B2 + 10.6; t += 0.1) sfx(t, 'key', 0.1); sfx(B2 + 10.7, 'notify', 0.5);
sCanvas.render = (t) => {
  const r = sCanvas.root, L = t - B2;
  const sc = 0.8;
  q(r, '#wfcA').style.transform = `translate(4px,-8px) scale(${sc})`;
  renderWf(r, WFA, 'A', t);
  const sel = q(r, '#selRing');
  const n1x = PAD + 1 * COLW, n1y = PAD;
  sel.style.left = (4 + n1x * sc - 6) + 'px'; sel.style.top = (48 - 8 + n1y * sc - 6) + 'px';
  sel.style.width = (NW * sc + 12) + 'px'; sel.style.height = (NH * sc + 12) + 'px';
  sel.style.opacity = String(seg(L, 3.9, 4.3) * (0.75 + 0.25 * Math.sin(t * 4)));
  const cfg = q(r, '#cfg');
  const cp = seg(L, 4.1, 4.9, eo5);
  cfg.style.opacity = String(cp); cfg.style.transform = `translateY(${((1 - cp) * 60).toFixed(1)}px)`;
  r.querySelectorAll('.src').forEach((s, i) => appear(s, L, 4.8 + i * 0.3, 0.4, 12, 0.98));
  typeInto(q(r, '#cfgIns'), CFG_INS, L, 5.4, 6.8);
  typeInto(q(r, '#cfgOut'), CANVAS_OUT, L, 6.9, 10.6);
  const done = L > 10.7;
  const st = q(r, '#cfgState');
  setText(st, done ? 'Ready' : 'Running…');
  st.style.background = done ? '#f0fdf4' : '#f4f5ff'; st.style.color = done ? '#16a34a' : '#5b46e5';
};

/* ── Template library ───────────────────────────────────────────────── */
const B3 = T.lib[0];
const LIB = [
  ['zap', 'Speed to Lead Response', 'Answer people fast'], ['phone-missed', 'Missed Call Text Back', 'Answer people fast'], ['file-clock', 'Quote Follow-up', 'Answer people fast'],
  ['calendar-x', 'Appointment No-Show Recovery', 'Appointments'], ['star', 'Client Review Request', 'Reviews'], ['refresh-cw', 'Cold Lead Re-activation', 'Win back'],
  ['camera', 'Daily Social Content', 'Content'], ['newspaper', 'SEO Blog Pipeline', 'Content'], ['shopping-cart', 'Abandoned Cart Recovery', 'Shop'],
];
const sLib = winScene(...T.lib, 'wLib', 'AI Autopilot<span>›</span><b>Template Gallery</b>', `
  <div class="abs" style="left:28px;top:20px;right:28px;display:flex;align-items:flex-end"><div><div class="h2">Template gallery</div><div class="muted" style="font-size:16px;margin-top:4px;font-weight:550">Pick one, and Autopilot fits it to your business.</div></div>
    <span class="pill" style="margin-left:auto;background:#f4f5ff;color:#5b46e5;border:1px solid #e0e3ff;font-size:14px">${ico('layout-grid', 15)}<span id="libN">0</span> templates</span></div>
  <div class="abs" style="left:24px;right:24px;top:104px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px">
    ${LIB.map((x, i) => `<div class="lt card" style="padding:16px;height:186px;position:relative;opacity:0">
      <span style="width:44px;height:44px;border-radius:13px;background:#f4f5ff;color:#5b46e5;display:flex;align-items:center;justify-content:center">${ico(x[0], 22)}</span>
      <div style="margin-top:12px;font-size:17px;font-weight:780;color:#17191c;line-height:1.25">${x[1]}</div>
      <div class="muted" style="margin-top:4px;font-size:13.5px;font-weight:650">${x[2]}</div>
      <div class="use abs" style="left:16px;bottom:14px;font-size:13.5px;font-weight:750;color:#5b46e5;display:flex;align-items:center;gap:6px;opacity:0">Use this template ${ico('arrow-right', 14)}</div></div>`).join('')}
  </div>`);
LIB.forEach((_, i) => sfx(B3 + 0.5 + i * 0.12, 'pop', 0.14));
sLib.render = (t) => {
  const r = sLib.root, L = t - B3;
  setText(q(r, '#libN'), String(Math.round(33 * seg(L, 0.4, 2.2, eo))));
  r.querySelectorAll('.lt').forEach((c, i) => {
    appear(c, L, 0.5 + i * 0.12, 0.45, 20, 0.95);
    const hot = i === 0 && L > 3.2;
    c.style.borderColor = hot ? '#a5b4fc' : '#e6e9f0';
    c.style.boxShadow = hot ? '0 0 0 5px rgba(91,70,229,.10), 0 16px 30px rgba(91,70,229,.14)' : 'none';
    q(c, '.use').style.opacity = String(hot ? seg(L, 3.2, 3.5) : 0);
  });
};

/* ── Guardrails and approvals ───────────────────────────────────────── */
const B4 = T.guard[0];
const WAIT = [['mail', 'Follow up 42 quiet quotes', 'Email · from support@acme-remodel.com'], ['camera', 'Post: 5 signs your kitchen needs a refresh', 'Instagram · tomorrow 9:00'], ['message-square', 'Reply to Maria Lopez', 'Email · drafted by AI']];
const GR = [['mail', 'Send emails', 1], ['camera', 'Post to social', 1], ['briefcase', 'Create deals', 2], ['globe', 'Buy domains', 0]];
const sGuard = winScene(...T.guard, 'wGuard', 'AI Autopilot<span>›</span><b>Board</b>', `
  <div class="abs" style="left:24px;top:20px;width:520px">
    <div style="display:flex;align-items:center;gap:10px"><div class="h2" style="font-size:26px">Waiting for you</div><span class="pill" id="waitN" style="background:#fff7ed;color:#c2410c;border:1px solid #fed7aa">3</span></div>
    ${WAIT.map((w, i) => `<div class="wt card" style="margin-top:14px;padding:16px;display:flex;align-items:center;gap:12px;position:relative;overflow:hidden">
      <span style="width:42px;height:42px;border-radius:12px;background:#f4f5ff;color:#5b46e5;display:flex;align-items:center;justify-content:center;flex-shrink:0">${ico(w[0], 20)}</span>
      <div style="flex:1;min-width:0"><div style="font-size:16px;font-weight:760;color:#17191c">${w[1]}</div><div class="muted" style="font-size:13px;font-weight:600;margin-top:2px">${w[2]}</div></div>
      <div class="wa" style="display:flex;gap:8px"><span class="btn wapp" style="padding:9px 14px;background:#16a34a;color:#fff;font-size:14px">${ico('check', 15)}Approve</span><span class="btn" style="padding:9px 12px;background:#f6f7fb;color:#475569;font-size:14px;border:1px solid #e6e9f0">Skip</span></div>
      <div class="wd abs" style="right:16px;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:8px;font-size:15px;font-weight:800;color:#16a34a;opacity:0">${ico('check-circle-2', 18)}Sent · 42</div></div>`).join('')}
    <div class="card" style="margin-top:18px;padding:14px 16px;display:flex;align-items:center;gap:10px;background:#f8fafc">${ico('scroll-text', 18, '#64748b')}<span style="font-size:14px;font-weight:650;color:#475569" id="ledger">Every action is written down, with who approved it.</span></div>
  </div>
  <div class="card abs" style="left:568px;top:20px;width:368px;padding:18px">
    <div class="kicker">What Autopilot may do</div>
    ${GR.map((g, i) => `<div class="gr" style="margin-top:14px"><div style="display:flex;align-items:center;gap:8px;font-size:15.5px;font-weight:750;color:#17191c">${ico(g[0], 17, '#5b46e5')}${g[1]}</div>
      <div style="margin-top:8px;display:grid;grid-template-columns:repeat(3,1fr);background:#f1f3f8;border-radius:11px;padding:3px;position:relative">
        <span class="gk abs" style="top:3px;bottom:3px;width:calc((100% - 6px)/3);border-radius:9px;background:#fff;box-shadow:0 1px 3px rgba(16,24,40,.12)"></span>
        ${['Off', 'Ask me', 'On'].map(o => `<span style="position:relative;text-align:center;font-size:13.5px;font-weight:750;padding:7px 0;color:#475569">${o}</span>`).join('')}</div></div>`).join('')}
  </div>`);
sfx(B4 + 4.4, 'click', 0.9); sfx(B4 + 4.6, 'notify', 0.5); sfx(B4 + 6.9, 'click', 0.7);
sGuard.render = (t) => {
  const r = sGuard.root, L = t - B4;
  r.querySelectorAll('.wt').forEach((c, i) => {
    appear(c, L, 0.5 + i * 0.3, 0.45, 18, 0.98);
    if (i === 0) {
      const d = seg(L, 4.5, 4.9);
      q(c, '.wa').style.opacity = String(1 - d);
      q(c, '.wd').style.opacity = String(d);
      c.style.background = d > 0.5 ? '#f0fdf4' : '#fff';
      c.style.borderColor = d > 0.5 ? '#bbf7d0' : '#e6e9f0';
      const press = lin(L, 4.35, 4.55);
      q(c, '.wapp').style.transform = `scale(${(1 - Math.sin(press * Math.PI) * 0.08).toFixed(3)})`;
    }
  });
  setText(q(r, '#waitN'), L > 4.6 ? '2' : '3');
  r.querySelectorAll('.gr').forEach((g, i) => {
    appear(g, L, 1.0 + i * 0.2, 0.4, 12, 1);
    let v = GR[i][2];
    if (i === 2) v = L > 6.9 ? 2 : 1;
    const k = q(g, '.gk');
    const from = i === 2 ? 1 : v, prog = i === 2 ? seg(L, 6.9, 7.2, eo) : 1;
    const pos = mix(from, v, prog);
    k.style.left = `calc(3px + ${pos.toFixed(3)} * (100% - 6px) / 3)`;
    k.style.background = v === 2 && prog > 0.5 ? '#ecfdf5' : v === 0 ? '#fff' : '#fff';
  });
};

/* ── AI replies ─────────────────────────────────────────────────────── */
const B5 = T.reply[0];
const REPLY = "Hi Maria — yes, Saturday at 10am works. I've pencilled you in for the quote visit; you'll get a reminder the day before. See you then!";
const sReply = winScene(...T.reply, 'wReply', '<b>Conversations</b><span>›</span>Inbox', `
  <div class="abs" style="left:0;top:0;bottom:0;width:300px;background:#fff;border-right:1px solid #e6e9f0">
    ${[['Maria Lopez', 'Is Saturday still available?', 1], ['Dan Whitaker', 'Thanks for the quote', 0], ['Priya Shah', 'Booked for next week', 0], ['Tom Becker', 'Do you do bathrooms?', 0]].map((m, i) => `<div style="padding:14px 16px;border-bottom:1px solid #f0f2f7;${i === 0 ? 'background:#f4f5ff;' : ''}display:flex;gap:10px">
      <span style="width:38px;height:38px;border-radius:50%;background:${['#fde68a', '#bfdbfe', '#bbf7d0', '#fbcfe8'][i]};display:flex;align-items:center;justify-content:center;font-weight:800;color:#17191c;flex-shrink:0">${m[0][0]}</span>
      <div style="min-width:0;flex:1"><div style="display:flex;align-items:center;gap:6px;font-size:15px;font-weight:${m[2] ? 800 : 700};color:#17191c">${m[0]}${m[2] ? '<span class="dot" style="background:#5b46e5;margin-left:auto"></span>' : ''}</div><div class="muted" style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m[1]}</div></div></div>`).join('')}
  </div>
  <div class="abs" style="left:320px;right:22px;top:18px">
    <div style="display:flex;align-items:center;gap:10px"><div style="font-size:20px;font-weight:800">Maria Lopez</div><span class="pill" id="seqStop" style="background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;opacity:0">${ico('circle-stop', 14)}Sequence stopped — she replied</span></div>
    <div class="card" id="inMsg" style="margin-top:14px;padding:14px 16px;border-radius:16px;max-width:520px"><div class="muted" style="font-size:12.5px;font-weight:700">Today, 9:41</div><div style="font-size:16px;font-weight:600;margin-top:4px;line-height:1.45">Hi! Is Saturday still available for the quote visit? Morning would be best.</div></div>
    <div id="draft" style="margin-top:18px;margin-left:60px;border-radius:18px;background:#f4f5ff;border:1.5px solid #c7d2fe;padding:16px 18px;opacity:0">
      <div style="display:flex;align-items:center;gap:8px"><span id="rbot">${BOT(30)}</span><span style="font-size:13.5px;font-weight:800;color:#5b46e5">AI draft · from your business profile</span></div>
      <div style="font-size:16px;font-weight:600;line-height:1.5;margin-top:8px;min-height:96px;color:#17191c"><span id="draftTxt"></span></div>
      <div style="display:flex;gap:8px;margin-top:10px;align-items:center"><span class="btn" id="sendBtn" style="padding:10px 16px;background:#5b46e5;color:#fff;font-size:15px">${ico('send', 15)}Send</span><span class="btn" style="padding:10px 14px;background:#fff;border:1px solid #e0e3ff;color:#5b46e5;font-size:15px">${ico('pencil', 14)}Edit</span>
      <span id="sent" style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:15px;font-weight:800;color:#16a34a;opacity:0">${ico('check-circle-2', 17)}Sent</span></div>
    </div>
  </div>`);
sfx(B5 + 1.0, 'notify', 0.5); sfx(B5 + 1.8, 'ai_on', 0.6); for (let t = B5 + 2.3; t < B5 + 6.2; t += 0.1) sfx(t, 'key', 0.1); sfx(B5 + 6.9, 'click', 0.9); sfx(B5 + 7.1, 'whoosh_soft', 0.5);
sReply.render = (t) => {
  const r = sReply.root, L = t - B5;
  appear(q(r, '#inMsg'), L, 0.6, 0.45, 16, 0.98);
  q(r, '#seqStop').style.opacity = String(seg(L, 1.2, 1.6));
  appear(q(r, '#draft'), L, 1.8, 0.5, 18, 0.98);
  typeInto(q(r, '#draftTxt'), REPLY, L, 2.3, 6.2);
  const press = lin(L, 6.85, 7.05);
  q(r, '#sendBtn').style.transform = `scale(${(1 - Math.sin(press * Math.PI) * 0.07).toFixed(3)})`;
  q(r, '#sent').style.opacity = String(seg(L, 7.1, 7.4));
  animBot(r, t, L > 2.2 && L < 6.3, 3);
};

/* ── Websites and funnels ───────────────────────────────────────────── */
const B6 = T.web[0];
const page = (hue, title, cta) => `<div style="position:absolute;inset:0;background:#fff">
  <div style="height:190px;background:linear-gradient(135deg,${hue[0]},${hue[1]});padding:22px 24px;color:#fff">
    <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;opacity:.95">${ico('sparkles', 14)}CleanPro Austin<span style="margin-left:auto;font-weight:650;opacity:.85">Services · Prices · Book</span></div>
    <div style="font-size:30px;font-weight:850;letter-spacing:-0.03em;margin-top:28px;line-height:1.1">${title}</div>
    <div style="display:inline-block;margin-top:14px;padding:9px 16px;border-radius:10px;background:#fff;color:${hue[1]};font-size:14px;font-weight:800">${cta}</div></div>
  <div style="padding:16px 22px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px">${[0, 1, 2].map(() => `<div style="height:74px;border-radius:12px;background:#f3f4f8"></div>`).join('')}</div>
  <div style="margin:0 22px;height:12px;border-radius:6px;background:#eef0f5;width:70%"></div><div style="margin:8px 22px;height:12px;border-radius:6px;background:#eef0f5;width:52%"></div></div>`;
const sWeb = winScene(...T.web, 'wWeb', '<b>Websites</b><span>›</span>CleanPro Austin', `
  <div class="abs" style="left:24px;top:20px;width:560px;height:430px;border-radius:18px;overflow:hidden;border:1px solid #e6e9f0;box-shadow:0 12px 30px rgba(16,24,40,.08)" id="webPage">
    <div style="height:34px;background:#f2f4f8;border-bottom:1px solid #e3e6ee;display:flex;align-items:center;gap:7px;padding:0 12px"><i style="width:9px;height:9px;border-radius:50%;background:#d4d8e2;display:inline-block"></i><i style="width:9px;height:9px;border-radius:50%;background:#d4d8e2;display:inline-block"></i><span id="webUrl" style="margin-left:10px;font-size:12.5px;font-weight:700;color:#64748b">draft · not published</span></div>
    <div style="position:absolute;left:0;right:0;top:34px;bottom:0">
      <div class="pg" style="position:absolute;inset:0">${page(['#0ea5e9', '#2563eb'], 'Spotless homes,<br>every single week.', 'Book a clean')}</div>
      <div class="pg" style="position:absolute;inset:0;opacity:0">${page(['#16a34a', '#0d9488'], 'Spotless homes,<br>every single week.', 'Book a clean')}</div>
    </div>
  </div>
  <div class="card abs" style="left:604px;top:20px;width:332px;padding:18px">
    <div class="kicker">Brand</div>
    <div style="display:flex;gap:10px;margin-top:12px">${['#2563eb', '#0d9488', '#7c3aed', '#e11d48'].map((c, i) => `<span class="sw" style="width:44px;height:44px;border-radius:12px;background:${c};${i === 0 ? 'box-shadow:0 0 0 3px #fff,0 0 0 5px #17191c' : ''}"></span>`).join('')}</div>
    <div class="kicker" style="margin-top:22px">Funnel</div>
    <div style="display:flex;align-items:center;gap:6px;margin-top:12px">${['Offer', 'Book', 'Thanks'].map((s, i) => `<span class="fs" style="flex:1;text-align:center;padding:10px 0;border-radius:11px;background:#f4f5ff;border:1px solid #e0e3ff;font-size:13.5px;font-weight:750;color:#5b46e5;opacity:0">${s}</span>${i < 2 ? ico('chevron-right', 14, '#9aa3b2') : ''}`).join('')}</div>
    <div class="kicker" style="margin-top:22px">Form on this page</div>
    <div style="margin-top:10px;font-size:14px;font-weight:650;color:#334155;display:flex;align-items:center;gap:8px">${ico('clipboard-list', 16, '#5b46e5')}Starts: New lead, researched and answered</div>
  </div>
  <div class="abs" style="left:24px;top:470px;width:560px;display:flex;align-items:center;gap:12px">
    <div class="btn" id="pubBtn" style="padding:14px 22px;background:#17191c;color:#fff;font-size:18px">${ico('globe', 18)}Publish to cleanpro-austin.com</div>
    <span id="live" style="display:flex;align-items:center;gap:6px;font-size:16px;font-weight:800;color:#16a34a;opacity:0">${ico('check-circle-2', 18)}Live</span>
  </div>`);
sfx(B6 + 2.4, 'click', 0.6); sfx(B6 + 5.2, 'click', 0.9); sfx(B6 + 5.4, 'sting', 0.5);
sWeb.render = (t) => {
  const r = sWeb.root, L = t - B6;
  const sw = seg(L, 2.4, 2.9);
  const pgs = r.querySelectorAll('.pg'); pgs[1].style.opacity = String(sw);
  r.querySelectorAll('.sw').forEach((s, i) => { s.style.boxShadow = (sw > 0.5 ? i === 1 : i === 0) ? '0 0 0 3px #fff,0 0 0 5px #17191c' : 'none'; });
  r.querySelectorAll('.fs').forEach((s, i) => appear(s, L, 3.2 + i * 0.3, 0.35, 10, 0.95));
  const press = lin(L, 5.15, 5.35);
  q(r, '#pubBtn').style.transform = `scale(${(1 - Math.sin(press * Math.PI) * 0.06).toFixed(3)})`;
  q(r, '#live').style.opacity = String(seg(L, 5.4, 5.7));
  setText(q(r, '#webUrl'), L > 5.4 ? 'https://cleanpro-austin.com' : 'draft · not published');
};

/* ── Live help ──────────────────────────────────────────────────────── */
const B7 = T.live[0];
const sLive = winScene(...T.live, 'wLive', '<b>Customer Engagement</b><span>›</span>Live help', `
  <div class="abs" style="left:0;top:0;bottom:0;width:300px;background:#fff;border-right:1px solid #e6e9f0;padding:16px">
    <div class="kicker">Waiting</div>
    <div class="card" id="req" style="margin-top:10px;padding:14px;border-color:#c7d2fe;background:#f8f9ff">
      <div style="display:flex;align-items:center;gap:8px"><span style="width:34px;height:34px;border-radius:50%;background:#fde68a;display:flex;align-items:center;justify-content:center;font-weight:800">M</span><div><div style="font-size:15px;font-weight:800">Maria Lopez</div><div class="muted" style="font-size:12.5px;font-weight:650">wants to share her screen</div></div></div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:10px"><span class="pill" style="background:#ecfdf5;color:#16a34a;border:1px solid #bbf7d0;font-size:11.5px">SIGNED IN</span><span class="btn" id="joinBtn" style="margin-left:auto;padding:8px 14px;background:#5b46e5;color:#fff;font-size:14px">${ico('monitor', 15)}Join</span></div>
    </div>
    <div class="muted" style="margin-top:14px;font-size:13px;font-weight:600;line-height:1.5">Viewing only. Nobody can click on the customer's computer, and nothing is recorded.</div>
  </div>
  <div class="abs" style="left:320px;right:20px;top:18px;bottom:20px">
    <div id="shared" style="position:absolute;left:0;right:0;top:0;height:470px;border-radius:16px;background:#0b1220;overflow:hidden;opacity:0">
      <div style="position:absolute;left:14px;top:12px;display:flex;align-items:center;gap:8px;color:#cbd5e1;font-size:12.5px;font-weight:700"><span class="dot" style="background:#ef4444"></span>Maria's screen · Chrome</div>
      <div style="position:absolute;left:16px;right:16px;top:40px;bottom:16px;border-radius:10px;background:#fff;overflow:hidden">
        <div style="height:50px;border-bottom:1px solid #eef0f4;display:flex;align-items:center;padding:0 16px;font-size:15px;font-weight:800">Invoice settings</div>
        <div style="padding:16px;display:grid;gap:12px">${['Business name', 'Tax number', 'Payment terms'].map(f => `<div><div style="font-size:12.5px;font-weight:700;color:#64748b">${f}</div><div style="height:36px;border-radius:9px;border:1.5px solid #e6e9f0;margin-top:5px"></div></div>`).join('')}
        <div style="display:flex;justify-content:flex-end"><span id="saveBtn" style="padding:9px 18px;border-radius:9px;background:#16a34a;color:#fff;font-size:14px;font-weight:800">Save</span></div></div>
      </div>
      <div id="ptr" class="abs" style="width:40px;height:40px;border-radius:50%;border:3px solid #f59e0b;box-shadow:0 0 0 6px rgba(245,158,11,.25);opacity:0"></div>
    </div>
    <div class="abs" id="lchat" style="left:0;right:0;top:486px;display:grid;gap:8px">
      <div class="lc" style="justify-self:end;background:#5b46e5;color:#fff;border-radius:14px;padding:9px 14px;font-size:14.5px;font-weight:650;opacity:0">The Save button is bottom right — just there.</div>
      <div class="lc" style="justify-self:start;background:#fff;border:1px solid #e6e9f0;border-radius:14px;padding:9px 14px;font-size:14.5px;font-weight:650;opacity:0">Found it — saved. Thank you!</div>
    </div>
  </div>`);
sfx(B7 + 1.6, 'click', 0.9); sfx(B7 + 1.9, 'whoosh_in', 0.5); sfx(B7 + 3.6, 'pop', 0.5); sfx(B7 + 4.4, 'notify', 0.4); sfx(B7 + 5.6, 'notify', 0.4);
sLive.render = (t) => {
  const r = sLive.root, L = t - B7;
  const press = lin(L, 1.55, 1.75);
  q(r, '#joinBtn').style.transform = `scale(${(1 - Math.sin(press * Math.PI) * 0.08).toFixed(3)})`;
  const sp = seg(L, 1.9, 2.5, eo5);
  const sh = q(r, '#shared'); sh.style.opacity = String(sp); sh.style.transform = `scale(${mix(0.94, 1, sp).toFixed(3)})`;
  const ptr = q(r, '#ptr');
  const pp = lin(L, 3.6, 5.2);
  ptr.style.left = '516px'; ptr.style.top = '392px';
  ptr.style.opacity = String(pp > 0 && pp < 1 ? 1 - pp * 0.6 : 0);
  ptr.style.transform = `translate(-50%,-50%) scale(${(1 + (pp * 3 % 1) * 0.6).toFixed(3)})`;
  r.querySelectorAll('.lc').forEach((c, i) => appear(c, L, 4.4 + i * 1.2, 0.4, 12, 0.96));
  q(r, '#saveBtn').style.boxShadow = L > 5.4 ? '0 0 0 4px rgba(22,163,74,.25)' : 'none';
  q(r, '#req').style.opacity = String(1 - seg(L, 2.0, 2.4) * 0.5);
};

/* ── Agencies ───────────────────────────────────────────────────────── */
const B8 = T.agency[0];
const CLIENTS = [['Bright Smiles Dental', '#0ea5e9', '2,418', 'Growth'], ['Austin Roofing Co.', '#ea580c', '1,206', 'Starter'], ['Green Leaf Landscaping', '#16a34a', '3,874', 'Growth'], ['Nova Fitness', '#7c3aed', '954', 'Starter'], ['Harbor Legal', '#0f766e', '612', 'Pro']];
const sAgency = winScene(...T.agency, 'wAgency', '<b>Agency</b><span>›</span>Sub-accounts', `
  <div class="abs" style="left:24px;top:20px;width:560px">
    <div style="display:flex;align-items:center;gap:10px"><div class="h2" style="font-size:26px">Your clients</div><span class="pill" style="margin-left:auto;background:#17191c;color:#fff">${ico('plus', 14)}New sub-account</span></div>
    ${CLIENTS.map((c, i) => `<div class="cl card" style="margin-top:12px;padding:13px 16px;display:flex;align-items:center;gap:12px;opacity:0">
      <span style="width:40px;height:40px;border-radius:12px;background:${c[1]};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:850">${c[0][0]}</span>
      <div style="flex:1"><div style="font-size:16px;font-weight:780">${c[0]}</div><div class="muted" style="font-size:13px;font-weight:650">${c[2]} contacts · own workspace</div></div>
      <span class="pill" style="background:#f4f5ff;color:#5b46e5;border:1px solid #e0e3ff">${c[3]}</span></div>`).join('')}
  </div>
  <div class="card abs" style="left:604px;top:20px;width:332px;padding:18px">
    <div class="kicker">Your brand</div>
    <div id="brandLogo" style="margin-top:12px;display:flex;align-items:center;gap:10px;padding:12px;border-radius:14px;border:1.5px solid #e6e9f0">
      <span id="bl1" style="display:flex;align-items:center;gap:8px;font-weight:800">${LOGO(30)}Protected Central</span>
      <span id="bl2" style="display:none;align-items:center;gap:8px;font-weight:850"><span style="width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,#f97316,#db2777);display:inline-block"></span>Summit Digital</span></div>
    <div class="kicker" style="margin-top:20px">Clients sign in at</div>
    <div id="dom" style="margin-top:10px;padding:12px;border-radius:12px;background:#f6f7fb;border:1px solid #e6e9f0;font-size:15px;font-weight:750;color:#17191c;display:flex;align-items:center;gap:8px">${ico('globe', 16, '#5b46e5')}<span id="domT">app.protectedcentral.com</span></div>
    <div class="kicker" style="margin-top:20px">Reports</div>
    <div style="margin-top:10px;font-size:14px;font-weight:650;color:#334155;display:flex;align-items:center;gap:8px">${ico('file-bar-chart', 16, '#5b46e5')}A monthly report for each client</div>
  </div>`);
CLIENTS.forEach((_, i) => sfx(B8 + 0.6 + i * 0.22, 'tick', 0.2)); sfx(B8 + 3.8, 'whoosh_soft', 0.5);
sAgency.render = (t) => {
  const r = sAgency.root, L = t - B8;
  r.querySelectorAll('.cl').forEach((c, i) => appear(c, L, 0.6 + i * 0.22, 0.45, 16, 0.98));
  const sw = L > 3.8;
  q(r, '#bl1').style.display = sw ? 'none' : 'flex'; q(r, '#bl2').style.display = sw ? 'flex' : 'none';
  setText(q(r, '#domT'), sw ? 'app.summitdigital.co' : 'app.protectedcentral.com');
  const flash = seg(L, 3.8, 4.0) * (1 - seg(L, 4.6, 5.2));
  q(r, '#dom').style.boxShadow = `0 0 0 ${(flash * 5).toFixed(1)}px rgba(91,70,229,.15)`;
  q(r, '#brandLogo').style.boxShadow = `0 0 0 ${(flash * 5).toFixed(1)}px rgba(91,70,229,.15)`;
};

/* ════════════════════════════════════════════════════════════════════════
   Drawn for v2. Every figure on these screens is an example and says so:
   the film shows what the product does, never what somebody will earn.
   ════════════════════════════════════════════════════════════════════════ */
const usd = (n, dp = 2) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const note = (txt, top = 690, right = 24) => `<div class="abs" style="left:24px;right:${right}px;top:${top}px;display:flex;align-items:center;gap:8px;font-size:13px;font-weight:650;color:#94a3b8">${ico('info', 14, '#94a3b8')}${txt}</div>`;
const press = (node, L, a) => { const p = lin(L, a, a + 0.2); node.style.transform = `scale(${(1 - Math.sin(p * Math.PI) * 0.07).toFixed(3)})`; };

/* ── Revenue on autopilot: a shop project, paid into the customer's own Stripe ── */
const BM = T.money[0];
const LOOP = [
  ['camera', 'Product post published', 'Instagram · 9:00 · by Autopilot'],
  ['mouse-pointer-click', 'Visitor opens your shop', 'spotless-shop.com/shop'],
  ['credit-card', 'Order paid', 'Kitchen Refresh Kit · $49.00'],
  ['heart-handshake', 'Thank-you email sent', 'The moment they paid'],
];
const PAYS = [[3.2, 49, 'Kitchen Refresh Kit'], [5.4, 129, 'Deep Clean Package'], [7.9, 19, 'Stain Remover Set'], [10.4, 79, 'Window Care Bundle'], [12.9, 49, 'Kitchen Refresh Kit'], [15.0, 129, 'Deep Clean Package'], [17.2, 79, 'Window Care Bundle']];
const BAL0 = 1240;
const ORD = [[3.2, 'maria@lopezhome.com', 'Kitchen Refresh Kit', 49], [5.4, 'dan.w@mailbox.org', 'Deep Clean Package', 129], [7.9, 'priya.s@gmail.com', 'Stain Remover Set', 19], [10.4, 'tom@beckerfamily.net', 'Window Care Bundle', 79]];
const sMoney = winScene(...T.money, 'wMoney', '<b>Online shop</b><span>›</span>Spotless Shop<span>›</span>Autopilot', `
  <div class="abs" style="left:24px;top:20px;width:540px">
    <div style="display:flex;align-items:center;gap:10px"><span id="mBot">${BOT(40)}</span><div><div style="font-size:21px;font-weight:820;color:#17191c">Autopilot · Spotless Shop</div><div class="muted" style="font-size:13.5px;font-weight:650">Runs every 5 minutes · <span id="mNext">next run in 4:59</span></div></div>
      <span class="pill" style="margin-left:auto;background:#ecfdf5;color:#16a34a;border:1px solid #bbf7d0"><span class="dot" style="background:#16a34a"></span>Running</span></div>
    <div class="card" style="margin-top:16px;padding:16px 18px;position:relative">
      <div class="abs" style="left:39px;top:40px;bottom:40px;width:3px;border-radius:2px;background:#eef0f5"><div id="mLine" style="width:100%;height:0;background:linear-gradient(#5b46e5,#16a34a);border-radius:2px"></div></div>
      ${LOOP.map((l, i) => `<div class="lp" style="display:flex;align-items:center;gap:14px;padding:11px 0;position:relative">
        <span class="lpi" style="width:44px;height:44px;border-radius:14px;background:#f4f5ff;color:#5b46e5;display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;z-index:1;border:2px solid #fff">${ico(l[0], 21)}</span>
        <div style="flex:1"><div style="font-size:16.5px;font-weight:780;color:#17191c">${l[1]}</div><div class="muted" style="font-size:13px;font-weight:620;margin-top:2px">${l[2]}</div></div>
        <span class="lpk" style="color:#16a34a;opacity:0">${ico('check-circle-2', 20)}</span></div>`).join('')}
    </div>
    <div class="card" id="mChase" style="margin-top:14px;padding:13px 16px;display:flex;align-items:center;gap:12px;opacity:0">
      <span style="width:38px;height:38px;border-radius:12px;background:#fff7ed;color:#c2410c;display:flex;align-items:center;justify-content:center">${ico('link', 18)}</span>
      <div style="flex:1"><div style="font-size:15px;font-weight:760">Order #1043 waited a day</div><div class="muted" style="font-size:12.5px;font-weight:620">Unpaid · Deep Clean Package</div></div>
      <span class="pill" id="mChaseP" style="background:#f4f5ff;color:#5b46e5;border:1px solid #e0e3ff">${ico('send', 13)}Fresh payment link sent</span></div>
    <div class="card" id="mAway" style="margin-top:14px;padding:13px 16px;display:flex;align-items:center;gap:12px;background:#0f172a;border-color:#0f172a;opacity:0">
      <span style="width:38px;height:38px;border-radius:12px;background:rgba(255,255,255,.08);color:#c8f24d;display:flex;align-items:center;justify-content:center">${ico('moon', 18)}</span>
      <div style="flex:1"><div style="font-size:15px;font-weight:760;color:#fff">You're offline</div><div style="font-size:12.5px;font-weight:620;color:#94a3b8">Laptop closed · Autopilot is still running</div></div></div>
    <div class="card" style="margin-top:14px;padding:12px 16px">
      <div class="kicker">Activity today · by Autopilot</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px">${[['camera', 'posts published', 1.2, 3], ['heart-handshake', 'buyers thanked', 3.4, 7], ['link', 'links re-sent', 8.6, 1]].map(a => `<div class="act" data-a="${a[2]}" data-n="${a[3]}" style="display:flex;align-items:center;gap:8px"><span style="color:#5b46e5">${ico(a[0], 17)}</span><div><b class="actn" style="font-size:20px;font-variant-numeric:tabular-nums">0</b><div class="muted" style="font-size:11.5px;font-weight:650">${a[1]}</div></div></div>`).join('')}</div></div>
  </div>
  <div class="card abs" style="left:588px;top:20px;width:348px;padding:16px 16px 6px">
    <div style="display:flex;align-items:center"><div style="font-size:18px;font-weight:820">Orders</div><span class="muted" style="margin-left:auto;font-size:12.5px;font-weight:700">Online shop</span></div>
    ${ORD.map(o => `<div class="od" style="display:flex;align-items:center;gap:8px;padding:10px 0;border-top:1px solid #f0f2f7;margin-top:8px;opacity:0">
      <div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${o[1]}</div><div class="muted" style="font-size:12px;font-weight:650">1 × ${o[2]}</div></div>
      <b style="font-size:14px;font-variant-numeric:tabular-nums">${usd(o[3])}</b><span class="pill ost" style="font-size:11.5px;min-width:58px;justify-content:center">pending</span></div>`).join('')}
  </div>
  ${note('Example figures. Payments go to your own Stripe or Creem account — Protected Central never holds them.', 676, 400)}`);
/* The money is shown where it really lands: the customer's own Stripe app on
   their phone, outside the Protected Central window — this app has no balance
   screen and does not pretend to. */
sMoney.root.appendChild(el(`<div class="abs" id="mPhone" style="left:1452px;top:548px;width:330px;height:520px;border-radius:44px;background:#0b0f19;padding:12px;box-shadow:0 40px 80px -20px rgba(0,0,0,.6),0 0 0 2px #262b38">
  <div style="position:absolute;inset:12px;border-radius:34px;overflow:hidden;background:linear-gradient(180deg,#1e1b4b,#0f172a 60%)">
    <div style="display:flex;justify-content:space-between;padding:14px 22px 0;font-size:13px;font-weight:700;color:#e2e8f0"><span>9:41</span><span style="display:flex;gap:5px;align-items:center">${ico('wifi', 14)}${ico('battery-full', 16)}</span></div>
    <div style="padding:22px 20px 0;color:#fff"><div style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#a5b4fc">YOUR STRIPE ACCOUNT</div>
      <div style="font-size:13px;font-weight:650;color:#94a3b8;margin-top:10px">Balance today</div>
      <div id="mBal" style="font-size:40px;font-weight:860;letter-spacing:-0.04em;font-variant-numeric:tabular-nums;transform-origin:0 50%">${usd(BAL0)}</div>
      <div id="mGain" style="font-size:13px;font-weight:780;color:#86efac;height:18px"></div></div>
    <div id="mFeed" style="position:absolute;left:12px;right:12px;top:186px;bottom:16px;overflow:hidden">
      ${PAYS.map(p => `<div class="py" style="position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:16px;background:rgba(255,255,255,.1);backdrop-filter:blur(6px);opacity:0">
        <span style="width:30px;height:30px;border-radius:8px;background:#635bff;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:900;font-size:16px">S</span>
        <div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:800;color:#fff">Payment received · ${usd(p[1])}</div><div style="font-size:11.5px;font-weight:600;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p[2]} · now</div></div></div>`).join('')}
    </div>
  </div></div>`));
LOOP.forEach((_, i) => sfx(BM + 0.9 + i * 0.5, 'tick', 0.2));
PAYS.forEach(p => sfx(BM + p[0], 'coin', 0.75));
sfx(BM + 8.6, 'notify', 0.35); sfx(BM + 14.2, 'whoosh_soft', 0.4);
sMoney.render = (t) => {
  const r = sMoney.root, L = t - BM;
  /* The loop lights step by step, then keeps cycling — one pass per payment. */
  const lps = r.querySelectorAll('.lp');
  lps.forEach((n, i) => appear(n, L, 0.6 + i * 0.5, 0.4, 12, 0.98));
  const cyc = L < 2.6 ? -1 : Math.floor(((L - 2.6) / 0.6)) % 4;
  lps.forEach((n, i) => {
    const on = L >= 0.9 + i * 0.5;
    q(n, '.lpk').style.opacity = String(on ? 1 : 0);
    const ic = q(n, '.lpi'); const hot = cyc === i;
    ic.style.background = hot ? '#5b46e5' : '#f4f5ff'; ic.style.color = hot ? '#fff' : '#5b46e5';
    ic.style.boxShadow = hot ? '0 0 0 6px rgba(91,70,229,.15)' : 'none';
  });
  q(r, '#mLine').style.height = (seg(L, 0.9, 2.6, eio) * 100).toFixed(1) + '%';
  const nxt = Math.max(0, 299 - Math.floor(L * 7) % 300);
  setText(q(r, '#mNext'), `next run in ${Math.floor(nxt / 60)}:${String(nxt % 60).padStart(2, '0')}`);
  appear(q(r, '#mChase'), L, 8.3, 0.45, 14, 0.98);
  q(r, '#mChaseP').style.opacity = String(seg(L, 8.6, 8.9));
  appear(q(r, '#mAway'), L, 14.0, 0.5, 14, 0.98);
  r.querySelectorAll('.act').forEach(a => {
    const st = +a.dataset.a, n = +a.dataset.n;
    /* Buyers thanked follows the payments; the others count up once. */
    const v = a.dataset.n === '7' ? PAYS.filter(p => L >= p[0] + 0.6).length : Math.round(n * seg(L, st, st + 1.2));
    setText(q(a, '.actn'), String(v));
  });
  r.querySelectorAll('.od').forEach((n, i) => {
    appear(n, L, 1.2 + i * 0.25, 0.4, 10, 0.98);
    const paid = L >= ORD[i][0]; const st = q(n, '.ost');
    setText(st, paid ? 'paid' : 'pending');
    st.style.background = paid ? '#ecfdf5' : '#fff7ed'; st.style.color = paid ? '#16a34a' : '#c2410c'; st.style.border = `1px solid ${paid ? '#bbf7d0' : '#fed7aa'}`;
  });
  const ph = q(r, '#mPhone'); const pp = seg(L, 2.4, 3.1, eo5);
  ph.style.opacity = String(pp); ph.style.transform = `translateY(${((1 - pp) * 80).toFixed(1)}px) rotate(${(mix(6, -3, pp) + Math.sin(t * 0.9) * 0.6).toFixed(2)}deg)`;
  /* Payments arrive at the top and push the older ones down. */
  let bal = BAL0, last = null;
  PAYS.forEach(p => { if (L >= p[0]) { bal += p[1]; last = p; } });
  const tick = last ? seg(L, last[0], last[0] + 0.5, eo) : 1;
  const shown = last ? bal - last[1] * (1 - tick) : bal;
  setText(q(r, '#mBal'), usd(shown));
  q(r, '#mBal').style.transform = `scale(${(1 + (last ? Math.sin(Math.PI * seg(L, last[0], last[0] + 0.35)) * 0.05 : 0)).toFixed(3)})`;
  q(r, '#mBal').style.transformOrigin = '0 50%';
  setText(q(r, '#mGain'), bal > BAL0 ? `+${usd(bal - BAL0)} since you logged off` : '');
  const arrived = PAYS.filter(p => L >= p[0]).length;
  r.querySelectorAll('.py').forEach((n, i) => {
    const p = PAYS[i]; const k = seg(L, p[0], p[0] + 0.45, back);
    const slot = arrived - 1 - i; // 0 = newest
    const y = slot * 62;
    n.style.opacity = String(L >= p[0] ? clamp(k) * (slot > 5 ? 0 : 1) : 0);
    const slide = PAYS.filter(x => L >= x[0] && x[0] > p[0]).reduce((s, x) => s + (1 - seg(L, x[0], x[0] + 0.4, eo)), 0);
    n.style.transform = `translateY(${(y - slide * 62).toFixed(1)}px) scale(${mix(0.9, 1, clamp(k)).toFixed(3)})`;
  });
  animBot(r, t, true, 11);
};

/* ── Many projects, many streams ─────────────────────────────────────── */
const BS = T.streams[0];
const PROJ = [
  ['camera', 'Social Media Growth', '“Post every weekday from my website”', 'mic', 'Set up by voice', '#2a78d6', 0.9],
  ['shopping-bag', 'E-commerce Store', '“Sell my cleaning kits online”', 'keyboard', 'Set up by text', '#eb6834', 4.6],
  ['target', 'Lead Generation', '“Find landlords in Austin and book calls”', 'mic', 'Set up by voice', '#1baf7a', 5.9],
  ['newspaper', 'Blog & SEO', '“An article a week that ranks”', 'keyboard', 'Set up by text', '#eda100', 7.1],
];
/* Under the cards, the report the product draws: Reports → Revenue by
   project (RevenueByProject.tsx) — stacked bars by project, in its own
   palette, with the period switch. The figures are an example, and say so. */
const WK = 12;
const WEEKLY = [[180, 220, 240, 300, 310, 360, 380, 420, 450, 470, 520, 560], [0, 0, 260, 380, 420, 510, 560, 640, 700, 760, 820, 900], [0, 0, 0, 0, 310, 360, 480, 520, 600, 680, 720, 790], [0, 0, 0, 0, 0, 0, 140, 210, 260, 330, 380, 460]];
const CH_W = 640, CH_H = 190, CH_MAX = 3000;
const sStreams = winScene(...T.streams, 'wStreams', '<b>AI Autopilot</b><span>›</span>Your projects', `
  <div class="abs" style="left:24px;top:18px;right:24px;display:flex;align-items:center"><div class="h2" style="font-size:26px">Your projects</div>
    <span class="pill" id="sCount" style="margin-left:12px;background:#f4f5ff;color:#5b46e5;border:1px solid #e0e3ff">1 running</span>
    <span class="btn" style="margin-left:auto;padding:9px 14px;background:#17191c;color:#fff;font-size:14px">${ico('plus', 15)}New project</span></div>
  <div class="abs" style="left:24px;right:24px;top:72px;display:grid;grid-template-columns:1fr 1fr;gap:14px">
    ${PROJ.map(p => `<div class="pj card" style="padding:14px 16px;opacity:0;position:relative;overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px"><span style="width:40px;height:40px;border-radius:12px;background:${p[5]}1a;color:${p[5]};display:flex;align-items:center;justify-content:center">${ico(p[0], 20)}</span>
        <div style="flex:1;min-width:0"><div style="font-size:16.5px;font-weight:800;color:#17191c">${p[1]}</div><div class="muted" style="font-size:12.5px;font-weight:620;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p[2]}</div></div>
        <span class="pill" style="background:#ecfdf5;color:#16a34a;border:1px solid #bbf7d0;font-size:12px"><span class="dot" style="background:#16a34a;width:7px;height:7px"></span>Running</span></div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:10px"><span class="once pill" style="background:#f6f7fb;color:#475569;border:1px solid #e6e9f0;font-size:12px">${ico(p[3], 13)}${p[4]} · once</span></div>
    </div>`).join('')}
  </div>
  <div class="card abs" style="left:24px;right:24px;top:330px;height:344px;padding:16px 18px">
    <div style="display:flex;align-items:center;gap:10px"><div style="font-size:17px;font-weight:700;color:#0f172a">Revenue by project</div>
      <span class="muted" style="font-size:12.5px;font-weight:650">Reports</span>
      <div style="margin-left:auto;display:flex;gap:4px;padding:3px;border:1px solid #e6e9f0;border-radius:10px">${['30 days', '90 days', '12 months'].map((x, i) => `<span style="padding:5px 10px;border-radius:8px;font-size:12.5px;font-weight:650;${i === 1 ? 'background:#eceef1;color:#17191c' : 'color:#64748b'}">${x}</span>`).join('')}</div></div>
    <div style="display:flex;gap:28px;margin-top:10px">
      <div><div class="muted" style="font-size:12px;font-weight:650">Revenue, last 90 days</div><div id="sTot" style="font-size:30px;font-weight:820;letter-spacing:-0.03em;color:#0b0b0b;font-variant-numeric:tabular-nums">$0</div></div>
      <div><div class="muted" style="font-size:12px;font-weight:650">Projects earning</div><div id="sProj" style="font-size:30px;font-weight:820;letter-spacing:-0.03em;color:#0b0b0b">0</div></div></div>
    <svg class="abs" style="left:18px;bottom:20px" width="${CH_W}" height="${CH_H}" viewBox="0 0 ${CH_W} ${CH_H}">
      ${[0, 1, 2, 3].map(i => `<line x1="0" x2="${CH_W}" y1="${(CH_H / 3) * i}" y2="${(CH_H / 3) * i}" stroke="#e1e0d9" stroke-width="1"/>`).join('')}
      ${Array.from({ length: WK }, (_, w) => PROJ.map((p, i) => `<rect class="bar" data-w="${w}" data-i="${i}" x="${(w * (CH_W / WK) + 7).toFixed(1)}" width="${(CH_W / WK - 14).toFixed(1)}" y="${CH_H}" height="0" fill="${p[5]}" rx="2"/>`).join('')).join('')}
    </svg>
    <div class="abs" style="right:20px;bottom:24px;width:228px;display:grid;gap:9px">${PROJ.map(p => `<div class="sr" style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#334155;opacity:0"><i style="width:10px;height:10px;border-radius:3px;background:${p[5]};display:inline-block"></i>${p[1]}<b class="sv" style="margin-left:auto;font-variant-numeric:tabular-nums">$0</b></div>`).join('')}</div>
  </div>
  ${note('Example figures — what each project brings in depends on your offer, audience and market.')}`);
PROJ.forEach(p => sfx(BS + p[6], 'pop', 0.4)); sfx(BS + 9.6, 'shimmer', 0.6);
PROJ.forEach(p => sfx(BS + p[6] + 0.4, 'coin', 0.3));
sStreams.render = (t) => {
  const r = sStreams.root, L = t - BS;
  const n = PROJ.filter(p => L >= p[6]).length;
  setText(q(r, '#sCount'), `${Math.max(1, n)} running`);
  r.querySelectorAll('.pj').forEach((c, i) => {
    appear(c, L, PROJ[i][6], 0.5, 22, 0.92);
    const glow = seg(L, 9.6 + i * 0.25, 10.0 + i * 0.25) * (1 - seg(L, 13.5, 14.5));
    q(c, '.once').style.background = glow > 0.5 ? '#f7fee7' : '#f6f7fb';
    q(c, '.once').style.borderColor = glow > 0.5 ? '#bef264' : '#e6e9f0';
    q(c, '.once').style.color = glow > 0.5 ? '#3f6212' : '#475569';
  });
  /* Each project's layer grows in when its card appears, and the stack keeps
     climbing — one report, every project in it. */
  const grow = PROJ.map(p => seg(L, p[6] + 0.3, p[6] + 1.6, eo));
  const base = new Array(WK).fill(0);
  let tot = 0;
  r.querySelectorAll('.bar').forEach(bar => {
    const w = +bar.dataset.w, i = +bar.dataset.i;
    const v = WEEKLY[i][w] * grow[i] * seg(L, 0.3 + w * 0.05, 1.0 + w * 0.05, eo);
    const h = (v / CH_MAX) * CH_H;
    bar.setAttribute('y', (CH_H - base[w] - h).toFixed(1)); bar.setAttribute('height', Math.max(0, h).toFixed(1));
    base[w] += h;
  });
  r.querySelectorAll('.sr').forEach((row, i) => {
    const sum = WEEKLY[i].reduce((a, x) => a + x, 0) * grow[i];
    tot += sum;
    row.style.opacity = String(seg(L, PROJ[i][6] + 0.2, PROJ[i][6] + 0.6));
    setText(q(row, '.sv'), usd(sum, 0));
  });
  setText(q(r, '#sTot'), usd(tot, 0));
  setText(q(r, '#sProj'), String(PROJ.filter((p, i) => grow[i] > 0.05).length));
};

/* ── Blog & SEO: a month planned, nine checks, published to WordPress ── */
const BB = T.blog[0];
const CHECKS = ['Long enough to be worth indexing', 'The keyword is in the title', 'The keyword appears early', 'The keyword is in a heading', 'Not stuffed', 'Links to a page that earns', 'Title fits in a search result', 'Description fits and sells', 'Broken into sections'];
const WEEKS = [['Pillar', '5 signs your kitchen needs a refresh'], ['Supporting', 'Quartz or granite? An honest guide'], ['Supporting', 'What a remodel costs in Austin'], ['Supporting', 'Small kitchens, big ideas']];
const sBlog = winScene(...T.blog, 'wBlog', '<b>Blog &amp; SEO</b><span>›</span>October plan', `
  <div class="abs" style="left:24px;top:20px;width:540px">
    <div class="kicker">Month plan · 1 post a week</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px">${WEEKS.map((w, i) => `<div class="wk card" style="padding:10px;opacity:0;border-radius:14px">
      <div style="font-size:11.5px;font-weight:800;color:${i ? '#64748b' : '#5b46e5'}">WEEK ${i + 1} · ${w[0].toUpperCase()}</div><div style="font-size:13px;font-weight:700;color:#17191c;margin-top:4px;line-height:1.3">${w[1]}</div></div>`).join('')}</div>
    <div class="card" id="bArt" style="margin-top:16px;padding:18px 20px;opacity:0">
      <span class="pill" style="background:#f4f5ff;color:#5b46e5;border:1px solid #e0e3ff;font-size:12.5px">${ico('key-round', 13)}Keyword: kitchen remodel austin</span>
      <div style="font-size:26px;font-weight:840;letter-spacing:-0.025em;color:#17191c;margin-top:12px;line-height:1.15">5 Signs Your Kitchen Needs a Remodel — An Austin Guide</div>
      <div class="muted" style="font-size:13px;font-weight:650;margin-top:8px">1,240 words · 6 min read · 1.1% density · 5 headings · 2 internal links</div>
      <div style="margin-top:14px;display:grid;gap:8px">${[92, 100, 84, 'h', 96, 100, 70, 'h', 94, 88, 62].map(w => w === 'h' ? `<div style="height:16px;border-radius:6px;background:#e3e7f3;width:58%;margin-top:6px"></div>` : `<div style="height:10px;border-radius:6px;background:#f1f3f8;width:${w}%"></div>`).join('')}</div>
      <div style="display:flex;gap:8px;margin-top:14px"><span class="pill" style="background:#f6f7fb;color:#475569;border:1px solid #e6e9f0">${ico('sparkles', 13)}Written from your portfolio</span></div>
    </div>
    <div class="abs" style="left:0;top:600px;display:flex;align-items:center;gap:12px">
      <div class="btn" id="bPub" style="padding:13px 20px;background:#17191c;color:#fff;font-size:17px">${ico('send', 17)}Schedule the month</div>
      <span id="bLive" style="display:flex;align-items:center;gap:6px;font-size:15px;font-weight:800;color:#16a34a;opacity:0">${ico('check-circle-2', 18)}4 posts scheduled · WordPress</span></div>
  </div>
  <div class="card abs" style="left:588px;top:20px;width:348px;padding:16px 18px">
    <div style="display:flex;align-items:center"><div class="kicker">SEO checks</div><span class="pill" id="bAll" style="margin-left:auto;background:#ecfdf5;color:#16a34a;border:1px solid #bbf7d0;font-size:12px;opacity:0">All checks pass</span></div>
    ${CHECKS.map(c => `<div class="ck" style="display:flex;align-items:center;gap:9px;margin-top:9px;font-size:13.5px;font-weight:680;color:#334155">
      <span class="cki" style="width:20px;height:20px;border-radius:50%;border:2px solid #e2e8f0;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff"></span>${c}</div>`).join('')}
  </div>
  <div class="card abs" id="bSerp" style="left:588px;top:404px;width:348px;padding:14px 18px;opacity:0">
    <div class="kicker">In a search result</div>
    <div style="font-size:12.5px;font-weight:650;color:#475569;margin-top:10px">acme-remodel.com › blog › kitchen-remodel-signs</div>
    <div style="font-size:17px;font-weight:700;color:#1a0dab;margin-top:3px;line-height:1.25">5 Signs Your Kitchen Needs a Remodel — An Austin Guide</div>
    <div style="font-size:13px;font-weight:550;color:#4d5156;margin-top:4px;line-height:1.45">Peeling cabinets, too little storage, a layout that fights you? Here's how Austin homeowners know it's time — and what it costs.</div>
  </div>`);
WEEKS.forEach((_, i) => sfx(BB + 0.5 + i * 0.3, 'tick', 0.2)); sfx(BB + 2.0, 'whoosh_soft', 0.4);
CHECKS.forEach((_, i) => sfx(BB + 4.0 + i * 0.42, 'tick', 0.22)); sfx(BB + 7.9, 'success', 0.5);
sfx(BB + 11.7, 'click', 0.9); sfx(BB + 11.9, 'notify', 0.45);
sBlog.render = (t) => {
  const r = sBlog.root, L = t - BB;
  r.querySelectorAll('.wk').forEach((c, i) => appear(c, L, 0.5 + i * 0.3, 0.4, 14, 0.96));
  appear(q(r, '#bArt'), L, 2.0, 0.5, 18, 0.98);
  r.querySelectorAll('.ck').forEach((c, i) => {
    const on = L >= 4.0 + i * 0.42; const ic = q(c, '.cki');
    ic.style.background = on ? '#16a34a' : 'transparent'; ic.style.borderColor = on ? '#16a34a' : '#e2e8f0';
    ic.innerHTML = on ? ICONS['check'] : '';
    c.style.opacity = String(0.45 + 0.55 * seg(L, 3.6 + i * 0.42, 4.0 + i * 0.42));
  });
  q(r, '#bAll').style.opacity = String(seg(L, 7.9, 8.2));
  appear(q(r, '#bSerp'), L, 8.6, 0.5, 16, 0.98);
  press(q(r, '#bPub'), L, 11.6);
  q(r, '#bLive').style.opacity = String(seg(L, 11.9, 12.2));
};

/* ── AI Shorts: one long video in, vertical clips out ────────────────── */
const BV = T.shorts[0];
const STEPS_V = [[0.8, 'Uploading video to Gemini AI...'], [2.4, 'Finding viral moments...'], [4.6, 'Generating captions & scoring virality...'], [6.6, 'Done! Your clips are ready.']];
const CLIPS = [
  [94, 'The #1 mistake new owners make', ['THE', 'BIGGEST', 'MISTAKE?'], ['#1d4ed8', '#7c3aed'], 0.08],
  [91, 'Why cheap quotes cost more', ['CHEAP', 'COSTS', 'MORE'], ['#be123c', '#f97316'], 0.27],
  [88, 'Ask any contractor these 3 things', ['ASK', 'THESE', '3 THINGS'], ['#0f766e', '#22c55e'], 0.45],
  [86, 'What 500 kitchens taught us', ['500', 'KITCHENS', 'LATER'], ['#334155', '#0ea5e9'], 0.63],
  [79, 'The 10-minute weekly habit', ['10', 'MINUTES', 'A WEEK'], ['#9333ea', '#db2777'], 0.82],
];
const WAVE = Array.from({ length: 120 }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11 + 1) + 0.35 * Math.sin(i * 1.7)));
const sShorts = winScene(...T.shorts, 'wShorts', '<b>AI Shorts</b><span>›</span>Marketing Podcast Ep. 42', `
  <div class="card abs" style="left:24px;right:24px;top:20px;padding:16px 18px">
    <div style="display:flex;align-items:center;gap:12px">
      <span style="width:44px;height:44px;border-radius:12px;background:#17191c;color:#fff;display:flex;align-items:center;justify-content:center">${ico('film', 21)}</span>
      <div><div style="font-size:17px;font-weight:800">Marketing Podcast Ep. 42.mp4</div><div class="muted" style="font-size:13px;font-weight:650">48:12 · uploaded from your computer</div></div>
      <div style="margin-left:auto;display:flex;gap:6px">${['9:16 Portrait', 'Max 60s', 'All moments'].map(x => `<span class="pill" style="background:#f6f7fb;color:#475569;border:1px solid #e6e9f0;font-size:12px">${x}</span>`).join('')}</div></div>
    <div style="position:relative;margin-top:14px;height:54px;border-radius:12px;background:#f6f7fb;overflow:hidden">
      <div style="position:absolute;inset:6px 10px;display:flex;align-items:center;gap:2px">${WAVE.map(h => `<i style="flex:1;height:${(h * 100).toFixed(0)}%;border-radius:2px;background:#cbd5e1"></i>`).join('')}</div>
      ${CLIPS.map(c => `<div class="hl abs" style="top:4px;bottom:4px;left:${(c[4] * 100).toFixed(1)}%;width:6%;border-radius:8px;background:rgba(249,115,22,.22);border:2px solid #f97316;opacity:0"></div>`).join('')}
      <div id="vScan" class="abs" style="top:0;bottom:0;width:3px;background:#5b46e5;box-shadow:0 0 12px #5b46e5"></div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:14px;font-weight:720;color:#5b46e5"><span id="vBot">${BOT(24)}</span><span id="vStep"></span></div>
  </div>
  <div class="abs" style="left:24px;right:24px;top:228px;display:grid;grid-template-columns:repeat(5,1fr);gap:16px">
    ${CLIPS.map(c => `<div class="cv" style="opacity:0">
      <div style="position:relative;height:300px;border-radius:16px;overflow:hidden;background:linear-gradient(160deg,${c[3][0]},${c[3][1]})">
        <div class="abs" style="left:50%;top:34%;width:96px;height:96px;margin-left:-48px;border-radius:50%;background:rgba(255,255,255,.18)"></div>
        <div class="abs" style="left:50%;top:58%;width:150px;height:120px;margin-left:-75px;border-radius:75px 75px 0 0;background:rgba(255,255,255,.14)"></div>
        <span class="pill abs" style="left:8px;top:8px;background:${c[0] >= 85 ? '#16a34a' : '#d97706'};color:#fff;font-size:12px;padding:4px 9px">${ico('flame', 12)}${c[0]}</span>
        <div class="cap abs" style="left:8px;right:8px;bottom:26px;text-align:center;font-size:21px;font-weight:900;letter-spacing:-0.01em;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.45)">${c[2].map(w => `<span class="cw">${w}</span>`).join(' ')}</div>
      </div>
      <div style="font-size:13.5px;font-weight:760;color:#17191c;margin-top:8px;line-height:1.3">${c[1]}</div>
      <div class="muted" style="font-size:12px;font-weight:650;margin-top:2px">#remodel #homeowner #diy</div></div>`).join('')}
  </div>
  <div class="abs" style="left:24px;right:24px;top:640px;display:flex;align-items:center;gap:10px">
    <span class="pill" style="background:#f4f5ff;color:#5b46e5;border:1px solid #e0e3ff">${ico('captions', 14)}Auto-captions · Bold Yellow</span>
    <span class="pill" style="background:#f4f5ff;color:#5b46e5;border:1px solid #e0e3ff">${ico('hash', 14)}Titles & hashtags written</span>
    <span class="btn" id="vPub" style="margin-left:auto;padding:10px 16px;background:#17191c;color:#fff;font-size:14.5px">${ico('send', 15)}Publish to social</span></div>`);
sfx(BV + 0.8, 'whoosh_soft', 0.4); sfx(BV + 2.4, 'ai_on', 0.5);
CLIPS.forEach((c, i) => sfx(BV + 2.8 + i * 0.35, 'tick', 0.22));
CLIPS.forEach((c, i) => sfx(BV + 6.8 + i * 0.3, 'pop', 0.35)); sfx(BV + 6.6, 'success', 0.45);
sShorts.render = (t) => {
  const r = sShorts.root, L = t - BV;
  const st = STEPS_V.filter(s => L >= s[0]).pop();
  setText(q(r, '#vStep'), st ? st[1] : '');
  q(r, '#vScan').style.left = (seg(L, 2.4, 6.4, x => x) * 100).toFixed(2) + '%';
  q(r, '#vScan').style.opacity = String(seg(L, 2.3, 2.5) * (1 - seg(L, 6.3, 6.6)));
  r.querySelectorAll('.hl').forEach((h, i) => { h.style.opacity = String(seg(L, 2.8 + i * 0.35, 3.1 + i * 0.35)); });
  r.querySelectorAll('.cv').forEach((c, i) => {
    appear(c, L, 6.8 + i * 0.3, 0.5, 26, 0.9);
    /* Karaoke captions: the word being said turns yellow. */
    c.querySelectorAll('.cw').forEach((w, j) => {
      const k = Math.floor(((L - 7.5 - i * 0.2) / 0.45)) % 4;
      w.style.color = L > 7.5 && k === j ? '#facc15' : '#fff';
    });
  });
  q(r, '#vPub').style.boxShadow = L > 12.5 ? '0 0 0 5px rgba(91,70,229,.18)' : 'none';
  animBot(r, t, L > 2.3 && L < 6.6, 13);
};

/* ── Website and funnel gallery: the real template names ─────────────── */
const BG = T.gallery[0];
const TPL = [
  ['Business Website', 'Full Websites', ['#2563eb', '#0ea5e9'], 5.0],
  ['Online Store', 'Full Websites', ['#16a34a', '#84cc16'], 5.9],
  ['Restaurant / Cafe', 'Full Websites', ['#b45309', '#f59e0b'], 6.6],
  ['Fitness Studio', 'Full Websites', ['#be123c', '#fb7185'], 99],
  ['Free Quote Request', 'Lead Capture', ['#0f766e', '#2dd4bf'], 7.5],
  ['Quiz Funnel', 'Lead Capture', ['#7c3aed', '#c084fc'], 8.3],
  ['Webinar Registration', 'Event Pages', ['#1e293b', '#6366f1'], 9.2],
  ['Video Sales Letter', 'Sales Pages', ['#9f1239', '#e11d48'], 10.3],
];
const thumb = (c, i) => `<div style="position:absolute;inset:0;background:#fff">
  <div style="height:${i % 3 === 0 ? 74 : 62}px;background:linear-gradient(135deg,${c[0]},${c[1]});padding:10px 12px">
    <div style="height:6px;width:40%;border-radius:3px;background:rgba(255,255,255,.7)"></div>
    <div style="height:9px;width:${70 - (i % 3) * 10}%;border-radius:4px;background:#fff;margin-top:12px"></div>
    <div style="height:9px;width:${50 - (i % 2) * 10}%;border-radius:4px;background:rgba(255,255,255,.85);margin-top:5px"></div></div>
  <div style="padding:9px 12px;display:grid;grid-template-columns:repeat(${i % 2 ? 2 : 3},1fr);gap:6px">${Array.from({ length: i % 2 ? 2 : 3 }, () => `<div style="height:34px;border-radius:7px;background:#f1f3f8"></div>`).join('')}</div>
  <div style="margin:0 12px;height:7px;border-radius:4px;background:#eef0f5;width:64%"></div></div>`;
const sGallery = winScene(...T.gallery, 'wGallery', '<b>Websites</b><span>›</span>Templates', `
  <div class="abs" style="left:24px;top:18px;right:24px;display:flex;align-items:flex-end"><div><div class="h2">Start from a template</div><div class="muted" style="font-size:15px;margin-top:4px;font-weight:550">17 websites and 48 funnels, built in your name and colours.</div></div>
    <span class="pill" style="margin-left:auto;background:#f4f5ff;color:#5b46e5;border:1px solid #e0e3ff;font-size:14px">${ico('layout-template', 15)}<span id="gN">0</span> templates</span></div>
  <div class="abs" style="left:24px;right:24px;top:100px;display:flex;gap:8px">${['All', 'Lead Capture', 'Sales Pages', 'Landing Pages', 'Event Pages', 'Full Websites', 'Seasonal'].map((x, i) => `<span class="pill" style="background:${i ? '#fff' : '#17191c'};color:${i ? '#475569' : '#fff'};border:1px solid ${i ? '#e6e9f0' : '#17191c'}">${x}</span>`).join('')}</div>
  <div class="abs" style="left:24px;right:24px;top:150px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px">
    ${TPL.map((x, i) => `<div class="gt card" style="padding:8px;opacity:0;border-radius:16px">
      <div style="position:relative;height:178px;border-radius:11px;overflow:hidden;border:1px solid #eef0f5">${thumb(x[2], i)}</div>
      <div style="padding:8px 4px 2px"><div style="font-size:14.5px;font-weight:780;color:#17191c">${x[0]}</div><div class="muted" style="font-size:12px;font-weight:650;margin-top:1px">${x[1]}</div></div></div>`).join('')}
  </div>
  <div class="abs" id="gUse" style="left:24px;right:24px;top:660px;display:flex;align-items:center;gap:10px;opacity:0">
    <span style="font-size:15px;font-weight:750;color:#334155">Free Quote Request</span><span class="muted" style="font-size:14px;font-weight:600">· 3 pages · form starts “New lead, answered fast”</span>
    <span class="btn" style="margin-left:auto;padding:10px 16px;background:#5b46e5;color:#fff;font-size:14.5px">Use this template ${ico('arrow-right', 15)}</span></div>`);
TPL.forEach((x, i) => sfx(BG + 0.6 + i * 0.12, 'pop', 0.14)); TPL.forEach(x => { if (x[3] < 50) sfx(BG + x[3], 'tick', 0.25); });
sGallery.render = (t) => {
  const r = sGallery.root, L = t - BG;
  setText(q(r, '#gN'), String(Math.round(65 * seg(L, 0.5, 4.2, eo))));
  r.querySelectorAll('.gt').forEach((c, i) => {
    appear(c, L, 0.6 + i * 0.12, 0.45, 18, 0.95);
    const a = TPL[i][3]; const hot = seg(L, a, a + 0.25) * (1 - seg(L, a + 0.9, a + 1.3));
    const pick = i === 4 && L > 10.9;
    c.style.borderColor = pick ? '#a5b4fc' : hot > 0.05 ? '#c7d2fe' : '#e6e9f0';
    c.style.boxShadow = pick ? '0 0 0 5px rgba(91,70,229,.12), 0 16px 30px rgba(91,70,229,.16)' : `0 ${(hot * 14).toFixed(1)}px ${(hot * 28).toFixed(1)}px rgba(91,70,229,${(hot * 0.18).toFixed(3)})`;
    c.style.transform += ` translateY(${(-hot * 6).toFixed(1)}px)`;
  });
  q(r, '#gUse').style.opacity = String(seg(L, 10.9, 11.2));
};

/* ── Reputation: ask by email, answer with AI ────────────────────────── */
const BR = T.reviews[0];
const ASK = [['Maria Lopez', 'Kitchen remodel · finished yesterday'], ['Dan Whitaker', 'Bathroom refit · finished Monday'], ['Priya Shah', 'Cabinet repaint · finished Friday'], ['Tom Becker', 'Flooring · finished last week']];
const SITES = [['Google', 5.6], ['Facebook', 6.3], ['Yelp', 7.0], ['Trustpilot', 7.6]];
const RREPLY = "Thank you so much, Maria! We loved working on your kitchen, and we're thrilled it came in exactly on quote. Enjoy every meal in it!";
const sReviews = winScene(...T.reviews, 'wReviews', '<b>Reputation</b><span>›</span>Request Reviews', `
  <div class="card abs" style="left:24px;top:20px;width:470px;padding:18px">
    <div style="font-size:20px;font-weight:820">Request Reviews</div>
    <div class="muted" style="font-size:13.5px;font-weight:620;margin-top:3px">Ask happy customers to leave a review by email.</div>
    ${ASK.map(a => `<div class="ak" style="display:flex;align-items:center;gap:10px;margin-top:12px;padding:10px 12px;border-radius:13px;border:1px solid #eef0f5;opacity:0">
      <span style="width:20px;height:20px;border-radius:6px;background:#5b46e5;color:#fff;display:flex;align-items:center;justify-content:center">${ico('check', 13)}</span>
      <div style="flex:1"><div style="font-size:15px;font-weight:760">${a[0]}</div><div class="muted" style="font-size:12.5px;font-weight:620">${a[1]}</div></div>
      <span class="aks" style="display:flex;align-items:center;gap:5px;font-size:13px;font-weight:800;color:#16a34a;opacity:0">${ico('send', 13)}Sent</span></div>`).join('')}
    <div class="kicker" style="margin-top:16px">Send them to</div>
    <div style="display:flex;gap:6px;margin-top:8px">${SITES.map(s => `<span class="st pill" style="background:#fff;color:#475569;border:1px solid #e6e9f0">${s[0]}</span>`).join('')}</div>
    <div class="btn" id="rSend" style="margin-top:16px;padding:12px 18px;background:#17191c;color:#fff;font-size:15.5px">${ico('mail', 16)}Send 4 requests</div>
  </div>
  <div class="card abs" id="rMail" style="left:24px;top:540px;width:470px;padding:14px 18px;opacity:0;background:#f8fafc">
    <div class="muted" style="font-size:12px;font-weight:700">EMAIL THEY RECEIVE</div>
    <div style="font-size:15px;font-weight:780;margin-top:4px">How was your experience with Acme Remodel?</div>
    <span class="pill" style="margin-top:10px;background:#5b46e5;color:#fff;font-size:13px">Leave a review ${ico('arrow-right', 13)}</span></div>
  <div class="abs" style="left:518px;top:20px;width:418px">
    <div class="card" id="rRev" style="padding:18px;opacity:0">
      <div style="display:flex;align-items:center;gap:10px"><span style="width:40px;height:40px;border-radius:50%;background:#fde68a;display:flex;align-items:center;justify-content:center;font-weight:800">M</span>
        <div><div style="font-size:15.5px;font-weight:800">Maria L.</div><div class="muted" style="font-size:12.5px;font-weight:650">Google · an example review</div></div>
        <style>.sx svg{fill:currentColor}</style><span style="margin-left:auto;color:#f59e0b;display:flex;gap:1px">${[0, 1, 2, 3, 4].map(() => `<span class="sx" style="opacity:0">${ico('star', 18)}</span>`).join('')}</span></div>
      <div style="font-size:15px;font-weight:600;line-height:1.5;margin-top:12px;color:#17191c">Our kitchen looks incredible. On time, tidy every day, and the final bill matched the quote exactly.</div>
      <div class="btn" id="rAi" style="margin-top:12px;padding:9px 14px;background:#f4f5ff;color:#5b46e5;border:1px solid #e0e3ff;font-size:14px">${ico('sparkles', 15)}AI reply</div>
    </div>
    <div id="rBox" style="margin-top:14px;border-radius:18px;background:#f4f5ff;border:1.5px solid #c7d2fe;padding:16px 18px;opacity:0">
      <div style="display:flex;align-items:center;gap:8px"><span id="rvBot">${BOT(28)}</span><span style="font-size:13.5px;font-weight:800;color:#5b46e5">Your reply · drafted by AI in your tone</span></div>
      <div style="font-size:15px;font-weight:600;line-height:1.5;margin-top:8px;min-height:92px;color:#17191c"><span id="rTxt"></span></div>
      <span class="btn" id="rPost" style="margin-top:8px;padding:9px 16px;background:#5b46e5;color:#fff;font-size:14.5px">Post</span>
    </div>
  </div>`);
ASK.forEach((_, i) => sfx(BR + 0.6 + i * 0.25, 'tick', 0.2)); sfx(BR + 3.9, 'click', 0.9);
ASK.forEach((_, i) => sfx(BR + 4.2 + i * 0.2, 'pop', 0.3)); SITES.forEach(s => sfx(BR + s[1], 'tick', 0.25));
sfx(BR + 8.4, 'notify', 0.4); sfx(BR + 9.3, 'click', 0.8); sfx(BR + 9.5, 'ai_on', 0.5);
for (let x = BR + 9.9; x < BR + 12.6; x += 0.1) sfx(x, 'key', 0.09);
sReviews.render = (t) => {
  const r = sReviews.root, L = t - BR;
  r.querySelectorAll('.ak').forEach((c, i) => {
    appear(c, L, 0.6 + i * 0.25, 0.4, 12, 0.98);
    q(c, '.aks').style.opacity = String(seg(L, 4.2 + i * 0.2, 4.4 + i * 0.2));
  });
  press(q(r, '#rSend'), L, 3.85);
  appear(q(r, '#rMail'), L, 4.6, 0.45, 14, 0.98);
  r.querySelectorAll('.st').forEach((c, i) => {
    const on = L >= SITES[i][1] && L < SITES[i][1] + 0.7 || (i === 0 && L >= 8.2);
    c.style.background = on ? '#17191c' : '#fff'; c.style.color = on ? '#fff' : '#475569'; c.style.borderColor = on ? '#17191c' : '#e6e9f0';
  });
  appear(q(r, '#rRev'), L, 8.3, 0.5, 18, 0.98);
  r.querySelectorAll('.sx').forEach((s, i) => { s.style.opacity = String(seg(L, 8.6 + i * 0.08, 8.8 + i * 0.08)); });
  press(q(r, '#rAi'), L, 9.25);
  appear(q(r, '#rBox'), L, 9.5, 0.45, 16, 0.98);
  typeInto(q(r, '#rTxt'), RREPLY, L, 9.9, 12.6);
  q(r, '#rPost').style.boxShadow = L > 12.7 ? '0 0 0 5px rgba(91,70,229,.2)' : 'none';
  animBot(r, t, L > 9.5 && L < 12.7, 17);
};

/* ── Reselling at your own price, white label ────────────────────────── */
const BRS = T.resell[0];
const RCL = [['Bright Smiles Dental', '#0ea5e9', 97, 'Paid'], ['Austin Roofing Co.', '#ea580c', 297, 'Paid'], ['Green Leaf Landscaping', '#16a34a', 0, 'new'], ['Nova Fitness', '#7c3aed', 149, 'Paid'], ['Harbor Legal', '#0f766e', 197, 'Paid']];
const BADGE = { Paid: ['#ecfdf5', '#16a34a', '#bbf7d0'], 'Link sent': ['#eff6ff', '#2563eb', '#bfdbfe'], 'No price': ['#f6f7fb', '#64748b', '#e6e9f0'] };
const sResell = winScene(...T.resell, 'wResell', '<b>Summit Digital</b><span>›</span>Charge your clients', `
  <div class="abs" style="left:24px;top:20px;width:540px">
    <div style="display:flex;align-items:center;gap:10px"><span style="width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#f97316,#db2777)"></span><div class="h2" style="font-size:24px">Your clients</div>
      <span class="pill" style="margin-left:auto;background:#f6f7fb;color:#475569;border:1px solid #e6e9f0">${ico('globe', 13)}app.summitdigital.co</span></div>
    ${RCL.map((c, i) => `<div class="rc card" style="margin-top:12px;padding:12px 14px;display:flex;align-items:center;gap:12px;opacity:0">
      <span style="width:38px;height:38px;border-radius:11px;background:${c[1]};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:850">${c[0][0]}</span>
      <div style="flex:1;min-width:0"><div style="font-size:15.5px;font-weight:780">${c[0]}</div><div class="muted" style="font-size:12.5px;font-weight:650">Own workspace · your brand</div></div>
      <span class="rp" style="font-size:16px;font-weight:820;font-variant-numeric:tabular-nums;color:#17191c;min-width:92px;text-align:right">${c[2] ? usd(c[2], 0) + '/mo' : ''}</span>
      <span class="pill rb" style="min-width:86px;justify-content:center">${c[3]}</span></div>`).join('')}
  </div>
  <div class="card abs" style="left:588px;top:20px;width:348px;padding:18px">
    <div style="font-size:19px;font-weight:820">Charge your clients</div>
    <div class="muted" style="font-size:13px;font-weight:620;margin-top:3px">Your price, paid into your own account.</div>
    <div style="margin-top:14px;padding:12px;border-radius:13px;background:#f6f7fb;border:1px solid #e6e9f0;display:flex;align-items:center;gap:8px">
      <span style="font-size:17px;font-weight:850;color:#635bff">stripe</span><span class="pill" style="background:#ecfdf5;color:#16a34a;border:1px solid #bbf7d0;font-size:11.5px">LIVE</span>
      <span style="margin-left:auto;display:flex;align-items:center;gap:5px;font-size:13px;font-weight:780;color:#16a34a">${ico('check-circle-2', 15)}Connected</span></div>
    <div class="kicker" style="margin-top:16px">Green Leaf Landscaping</div>
    <div style="font-size:13px;font-weight:700;color:#475569;margin-top:8px">Your price per month</div>
    <div style="display:flex;gap:8px;margin-top:6px"><div id="rsIn" style="flex:1;height:44px;border-radius:11px;border:2px solid #c7d2fe;display:flex;align-items:center;padding:0 12px;font-size:19px;font-weight:800;font-variant-numeric:tabular-nums">$<span id="rsV"></span><span id="rsCar" style="width:2px;height:22px;background:#5b46e5;margin-left:2px"></span></div>
      <span style="height:44px;border-radius:11px;border:1px solid #e6e9f0;display:flex;align-items:center;padding:0 12px;font-weight:750;color:#475569">USD</span></div>
    <div class="btn" id="rsLink" style="margin-top:12px;width:100%;justify-content:center;padding:11px 0;background:#17191c;color:#fff;font-size:14.5px">${ico('link', 15)}Create a monthly payment link</div>
    <div id="rsUrl" style="margin-top:10px;padding:9px 11px;border-radius:10px;background:#f4f5ff;border:1px solid #e0e3ff;font-size:12.5px;font-weight:700;color:#5b46e5;opacity:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">checkout.stripe.com/c/pay/cs_live_a1Qz…</div>
    <div style="margin-top:14px;font-size:13px;font-weight:650;color:#475569;line-height:1.5" id="rsNote">Your clients pay you, on your own Stripe or Creem account, at the price you set. <b style="color:#17191c">Protected Central never holds this money.</b></div>
  </div>
  <div class="abs" id="wlCard" style="left:24px;top:452px;width:540px;opacity:0">
    <div class="kicker">White label · what your clients see</div>
    <div style="margin-top:10px;border-radius:16px;border:1px solid #e6e9f0;overflow:hidden;box-shadow:0 12px 30px rgba(16,24,40,.08)">
      <div style="height:30px;background:#f2f4f8;border-bottom:1px solid #e3e6ee;display:flex;align-items:center;gap:6px;padding:0 12px">${[0, 1, 2].map(() => '<i style="width:8px;height:8px;border-radius:50%;background:#d4d8e2;display:inline-block"></i>').join('')}<span style="margin-left:8px;font-size:12px;font-weight:700;color:#64748b">${ico('lock', 11)} app.summitdigital.co</span></div>
      <div style="display:flex;align-items:center;gap:18px;padding:18px 22px;background:linear-gradient(135deg,#fff7ed,#fdf2f8)">
        <div style="display:flex;align-items:center;gap:10px"><span style="width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#f97316,#db2777)"></span><span style="font-size:19px;font-weight:850">Summit Digital</span></div>
        <div style="margin-left:auto;width:220px;display:grid;gap:7px"><div style="height:30px;border-radius:8px;background:#fff;border:1px solid #e6e9f0;font-size:12px;font-weight:600;color:#94a3b8;display:flex;align-items:center;padding:0 10px">you@greenleaf.co</div>
          <div style="height:30px;border-radius:8px;background:linear-gradient(90deg,#f97316,#db2777);color:#fff;font-size:12.5px;font-weight:800;display:flex;align-items:center;justify-content:center">Sign in</div></div></div>
    </div></div>
  ${note('Example prices — you choose your own.')}`);
RCL.forEach((_, i) => sfx(BRS + 0.5 + i * 0.2, 'tick', 0.18));
for (let x = BRS + 3.3; x < BRS + 3.7; x += 0.15) sfx(x, 'key', 0.18);
for (let x = BRS + 4.9; x < BRS + 5.4; x += 0.15) sfx(x, 'key', 0.18);
sfx(BRS + 7.0, 'click', 0.9); sfx(BRS + 7.3, 'pop', 0.4); sfx(BRS + 9.6, 'coin', 0.8);
sResell.render = (t) => {
  const r = sResell.root, L = t - BRS;
  /* $97, then the reseller thinks better of it: $297. */
  const v = L < 3.3 ? '' : L < 4.6 ? '97'.slice(0, Math.ceil((L - 3.3) / 0.18)) : L < 4.9 ? '' : '297'.slice(0, Math.ceil((L - 4.9) / 0.15));
  setText(q(r, '#rsV'), v);
  q(r, '#rsCar').style.opacity = L < 6.0 && Math.floor(L * 2.5) % 2 ? '1' : '0';
  press(q(r, '#rsLink'), L, 6.95);
  q(r, '#rsUrl').style.opacity = String(seg(L, 7.3, 7.6));
  q(r, '#rsNote').style.background = L > 10.3 ? 'rgba(200,242,77,.18)' : 'transparent';
  appear(q(r, '#wlCard'), L, 1.7, 0.5, 18, 0.98);
  r.querySelectorAll('.rc').forEach((c, i) => {
    appear(c, L, 0.5 + i * 0.2, 0.4, 14, 0.98);
    let st = RCL[i][3], price = RCL[i][2];
    if (i === 2) { st = L > 9.6 ? 'Paid' : L > 7.4 ? 'Link sent' : 'No price'; price = L > 5.6 ? 297 : 0; }
    const b = BADGE[st]; const rb = q(c, '.rb');
    setText(rb, st); rb.style.background = b[0]; rb.style.color = b[1]; rb.style.border = `1px solid ${b[2]}`;
    setText(q(c, '.rp'), price ? usd(price, 0) + '/mo' : '—');
    c.style.boxShadow = i === 2 && L > 9.6 && L < 11 ? '0 0 0 5px rgba(22,163,74,.14)' : 'none';
  });
};

/* ── Affiliate program: 40%, every month they pay ────────────────────── */
const BA = T.affiliate[0];
const AST = [['Visits through your link', 214, 0], ['Sign-ups', 9, 0], ['Paying customers', 2, 0], ['Held (refund window)', 157.6, 2], ['Payable now', 38.8, 2], ['Paid to you', 38.8, 2]];
const COMM = [['Oct 1', 'j•••@brightsmiles.com', 97, 'Held', 1], ['Sep 28', 'm•••@novafit.io', 297, 'Held', 0], ['Sep 1', 'j•••@brightsmiles.com', 97, 'Payable', 1], ['Aug 1', 'j•••@brightsmiles.com', 97, 'Paid', 1]];
const CST = { Held: ['#fff7ed', '#c2410c', '#fed7aa'], Payable: ['#eff6ff', '#2563eb', '#bfdbfe'], Paid: ['#ecfdf5', '#16a34a', '#bbf7d0'] };
const sAff = winScene(...T.affiliate, 'wAff', '<b>Affiliate program</b>', `
  <div class="abs" style="left:24px;top:18px;right:24px"><div class="h2" style="font-size:26px">Affiliate program</div>
    <div class="muted" style="font-size:14.5px;font-weight:600;margin-top:3px">40% of every payment from customers you refer, for as long as they keep paying.</div></div>
  <div class="card abs" style="left:24px;right:24px;top:96px;padding:14px 16px;display:flex;align-items:center;gap:12px">
    <span class="kicker" style="white-space:nowrap">Your link</span>
    <div style="flex:1;padding:10px 12px;border-radius:11px;background:#f6f7fb;border:1px solid #e6e9f0;font-size:16px;font-weight:750;color:#17191c">protectedcentral.com/?ref=sam-k3f9</div>
    <span class="btn" id="aCopy" style="padding:10px 16px;background:#5b46e5;color:#fff;font-size:14.5px">${ico('copy', 15)}<span id="aCopyT">Copy link</span></span></div>
  <div class="abs" style="left:24px;right:24px;top:182px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
    ${AST.map(a => `<div class="as card" style="padding:12px 14px;opacity:0"><div class="muted" style="font-size:12.5px;font-weight:700">${a[0]}</div><div class="av" style="font-size:26px;font-weight:850;letter-spacing:-0.03em;margin-top:2px;font-variant-numeric:tabular-nums">0</div></div>`).join('')}
  </div>
  <div class="card abs" style="left:24px;right:24px;top:376px;padding:6px 0 4px">
    <div style="display:grid;grid-template-columns:90px 1fr 120px 130px 110px;padding:10px 18px;font-size:12px;font-weight:800;letter-spacing:.06em;color:#94a3b8;text-transform:uppercase"><span>Date</span><span>Customer</span><span>They paid</span><span>Commission</span><span>Status</span></div>
    ${COMM.map(c => `<div class="cm" style="display:grid;grid-template-columns:90px 1fr 120px 130px 110px;align-items:center;padding:11px 18px;border-top:1px solid #f0f2f7;font-size:15px;font-weight:680;color:#17191c;opacity:0">
      <span class="muted" style="font-weight:750">${c[0]}</span><span class="cn">${c[1]}</span><span style="font-variant-numeric:tabular-nums">${usd(c[2])}</span>
      <span style="font-weight:850;color:#5b46e5;font-variant-numeric:tabular-nums">${usd(c[2] * 0.4)} <span style="font-size:12px;color:#94a3b8;font-weight:750">40%</span></span>
      <span><span class="pill" style="background:${CST[c[3]][0]};color:${CST[c[3]][1]};border:1px solid ${CST[c[3]][2]}">${c[3]}</span></span></div>`).join('')}
  </div>
  ${note('Example figures. Commissions are held 30 days for refunds, then paid — see the affiliate terms.')}`);
sfx(BA + 1.9, 'click', 0.8); sfx(BA + 2.1, 'success', 0.4);
AST.forEach((_, i) => sfx(BA + 2.8 + i * 0.15, 'tick', 0.18));
COMM.forEach((_, i) => sfx(BA + 5.2 + i * 0.5, 'coin', 0.45));
sAff.render = (t) => {
  const r = sAff.root, L = t - BA;
  press(q(r, '#aCopy'), L, 1.85);
  setText(q(r, '#aCopyT'), L > 2.05 && L < 4.5 ? 'Copied' : 'Copy link');
  r.querySelectorAll('.as').forEach((c, i) => {
    appear(c, L, 2.8 + i * 0.15, 0.4, 12, 0.97);
    const a = AST[i]; const v = a[1] * seg(L, 3.0 + i * 0.15, 4.8 + i * 0.15, eo);
    setText(q(c, '.av'), a[2] ? usd(v) : fmt(v));
  });
  r.querySelectorAll('.cm').forEach((c, i) => {
    appear(c, L, 5.2 + i * 0.5, 0.4, 12, 0.98);
    /* "Not just the first month": the same customer, month after month. */
    const same = COMM[i][4] && L > 7.6 && L < 10.4;
    c.style.background = same ? '#f7fee7' : 'transparent';
    q(c, '.cn').style.fontWeight = same ? '850' : '680';
  });
};

/* ── Always improving: what actually shipped ────────────────────────── */
/* Real releases, newest first, from the repository's history. The pace
   (130–150 a month) is September's: 142 commits reached testing in the
   twenty days the history covers — re-check it before re-rendering. */
const SHIPPED = [
  ['Oct 1', 'Revenue by project: what each Autopilot project earned', 'New'],
  ['Oct 1', 'Reviews read from Google, answered with AI', 'New module'],
  ['Oct 1', 'Affiliate program: 40% of every payment, for life', 'New'],
  ['Oct 1', 'Resell at your own price, paid to your own account', 'Agency'],
  ['Sep 30', 'Onboarding emails for every trial, and a daily sign-ups digest', 'New'],
  ['Sep 30', '7-day free trial and instant sign-up with a code', 'New'],
  ['Sep 28', 'Send through Brevo, Resend, SendGrid, Mailgun, Mailjet or Postmark', 'Integration'],
  ['Sep 26', 'Live help: customers share their screen in one click', 'New module'],
  ['Sep 25', 'Pick a real website or funnel template inside the AI wizard', 'AI'],
  ['Sep 24', 'Describe it, and Autopilot asks only what it still needs', 'AI'],
  ['Sep 24', 'Workflow emails written for your business, with an email editor', 'AI'],
  ['Sep 24', 'AI picks the best model your key offers, automatically', 'AI'],
  ['Sep 24', '2-step sign-in, an audit log and a Security & Privacy centre', 'Security'],
  ['Sep 23', 'The AI Workflow Template Gallery', 'AI'],
  ['Sep 23', 'AI agents that read your sources and write on a schedule', 'AI'],
  ['Sep 20', 'Autopilot keeps working, every five minutes', 'AI'],
  ['Sep 18', 'Customer Engagement: website chat, tickets and AI agents', 'New module'],
  ['Sep 17', 'Shop: variants, discount codes, tax and order lookup', 'New module'],
  ['Sep 16', 'Prospect search, and sign in with Google', 'New'],
  ['Sep 14', 'White label: clients sign in at your own address', 'Agency'],
];
const TAG = { AI: ['#f4f5ff', '#5b46e5', '#e0e3ff'], 'New module': ['#ecfdf5', '#16a34a', '#bbf7d0'], New: ['#eff6ff', '#2563eb', '#bfdbfe'], Integration: ['#fdf2f8', '#db2777', '#fbcfe8'], Security: ['#fff7ed', '#c2410c', '#fed7aa'], Agency: ['#f0fdfa', '#0f766e', '#99f6e4'] };
const B9 = T.dev[0];
const sDev = winScene(...T.dev, 'wDev', "<b>What's new</b><span>›</span>Recently shipped", `
  <div class="abs" style="left:24px;top:20px;right:24px;display:flex;align-items:center;gap:16px">
    <div><div class="h2">Recently shipped</div><div class="muted" style="font-size:16px;margin-top:4px;font-weight:550">Every update arrives in your workspace on its own.</div></div>
    <div style="margin-left:auto;text-align:right"><div style="font-size:52px;font-weight:860;letter-spacing:-0.04em;color:#5b46e5;line-height:1;font-variant-numeric:tabular-nums" id="devN">130–150</div><div class="muted" style="font-size:13.5px;font-weight:750">updates every month</div></div>
  </div>
  <div class="abs" style="left:24px;right:24px;top:118px;bottom:112px;overflow:hidden;border-radius:18px;background:#fff;border:1px solid #e6e9f0">
    <div id="devList" style="position:absolute;left:0;right:0;top:0">
      ${SHIPPED.map(s => { const c = TAG[s[2]]; return `<div class="sh" style="display:flex;align-items:center;gap:16px;height:62px;padding:0 20px;border-bottom:1px solid #f0f2f7">
        <span style="width:66px;font-size:14px;font-weight:800;color:#64748b;font-variant-numeric:tabular-nums">${s[0]}</span>
        <span style="width:10px;height:10px;border-radius:50%;background:${c[1]};box-shadow:0 0 0 4px ${c[0]}"></span>
        <span style="flex:1;font-size:17px;font-weight:720;color:#17191c">${s[1]}</span>
        <span class="pill" style="background:${c[0]};color:${c[1]};border:1px solid ${c[2]}">${s[2]}</span></div>`; }).join('')}
    </div>
  </div>
  <div class="abs" style="left:24px;right:24px;bottom:22px;height:74px;border-radius:18px;background:#f4f5ff;border:1px solid #e0e3ff;display:flex;align-items:center;gap:16px;padding:0 18px">
    <span id="devBot">${BOT(54)}</span>
    <div style="flex:1"><div style="font-size:16px;font-weight:800;color:#17191c">In the works now</div><div class="muted" style="font-size:13.5px;font-weight:650">New AI tools and modules, built and tested before they reach you.</div></div>
    <div style="width:220px;height:8px;border-radius:4px;background:#e0e3ff;overflow:hidden"><div id="devBar" style="height:100%;width:0;background:linear-gradient(90deg,#5b46e5,#8b7cf5)"></div></div>
  </div>`);
SHIPPED.forEach((_, i) => sfx(B9 + 1.0 + i * 0.55, 'tick', 0.16)); sfx(B9 + 0.6, 'whoosh_soft', 0.5); sfx(B9 + 11.5, 'notify', 0.4);
sDev.render = (t) => {
  const r = sDev.root, L = t - B9;
  { const n = q(r, '#devN'); const p = seg(L, 0.6, 1.4, eo5); n.style.opacity = String(p); n.style.transform = `scale(${mix(0.8, 1, p).toFixed(3)})`; n.style.transformOrigin = '100% 50%'; }
  r.querySelectorAll('.sh').forEach((row, i) => appear(row, L, 1.0 + i * 0.55, 0.45, 14, 1));
  /* Six rows show at a time; the list climbs as new ones arrive. */
  const shown = clamp((L - 1.0) / 0.55 + 1, 0, SHIPPED.length);
  const over = Math.max(0, shown - 7.4);
  q(r, '#devList').style.transform = `translateY(${(-over * 62).toFixed(1)}px)`;
  q(r, '#devBar').style.width = (((L * 0.09) % 1) * 100).toFixed(1) + '%';
  animBot(r, t, true, 7);
};

/* ── Trust — wording from docs/SECURITY.md §7 only ──────────────────── */
const TRUST = [
  ['shield-check', 'Workspaces kept separate', 'Access checked on the server, every request'],
  ['key-round', 'Connected credentials encrypted', 'AES-256-GCM, never sent back to a browser'],
  ['fingerprint', '2-step sign-in', 'With an authenticator app'],
  ['scroll-text', 'Security activity log', 'Every sign-in and change, kept 180 days'],
];
const B10 = T.trust[0];
const s9 = scene({ a: T.trust[0], b: T.trust[1], tin: 0.7, inScale: 1.06, tout: 0.5, origin: '50% 50%', outScale: 0.92 });
s9.root = mount(`
  <div class="big" id="s9h" style="top:150px;font-size:72px">Your business. <span class="grad-lime">Your workspace.</span></div>
  <div class="big" id="s9s" style="top:246px;font-size:30px;font-weight:540;letter-spacing:-0.015em;color:rgba(226,232,255,.75)">Privacy and protection built into the experience.</div>
  <div class="abs" id="s9mark" style="left:230px;top:420px;width:300px;height:300px">
    <div class="abs" style="left:-110px;top:-110px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba(200,242,77,.28),rgba(200,242,77,0) 65%)" id="s9glow"></div>
    ${LOGO(300, false)}
  </div>
  <div class="abs" style="left:700px;right:150px;top:370px;display:grid;grid-template-columns:1fr 1fr;gap:18px">
    ${TRUST.map(x => `<div class="tr" style="padding:24px;border-radius:22px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10)">
      <span style="width:56px;height:56px;border-radius:16px;background:rgba(200,242,77,.12);color:#c8f24d;display:flex;align-items:center;justify-content:center">${ico(x[0], 28)}</span>
      <div style="font-size:26px;font-weight:780;color:#fff;letter-spacing:-0.015em;margin-top:16px">${x[1]}</div><div style="font-size:18px;font-weight:550;color:rgba(226,232,255,.62);margin-top:4px">${x[2]}</div></div>`).join('')}
  </div>`);
TRUST.forEach((x, i) => sfx(B10 + 1.2 + i * 0.25, 'tick', 0.25)); sfx(B10 + 0.3, 'whoosh_soft', 0.4);
s9.render = (t) => {
  const r = s9.root, L = t - B10;
  ['#s9h', '#s9s'].forEach((s, i) => { const p = seg(L, 0.2 + i * 0.35, 0.8 + i * 0.35, eo5); const n = q(r, s); n.style.opacity = String(p); n.style.transform = `translateY(${((1 - p) * 26).toFixed(1)}px)`; });
  const m = q(r, '#s9mark');
  const p = seg(L, 0.5, 1.3, eo5);
  m.style.opacity = String(p);
  m.style.transform = `translateY(${((1 - p) * 30 + Math.sin(t * 1.2) * 6).toFixed(1)}px) scale(${mix(0.8, 1, p).toFixed(3)})`;
  q(r, '#s9glow').style.opacity = String(0.6 + 0.4 * Math.sin(t * 1.8));
  r.querySelectorAll('.tr').forEach((row, i) => appear(row, L, 1.2 + i * 0.25, 0.55, 24, 0.98));
};

/* ── The lockup, then the offer ─────────────────────────────────────── */
const s10b = scene({ a: T.lock[0], b: T.lock[1], tin: 0.45, inScale: 0.9, tout: 0.45, outScale: 1.06 });
s10b.root = mount(`<div class="abs" style="left:0;right:0;top:450px;display:flex;align-items:center;justify-content:center;gap:28px">${LOGO(140)}<span style="font-size:96px;font-weight:840;color:#fff;letter-spacing:-0.045em">Protected Central</span></div>`);
s10b.render = () => {};
sfx(T.lock[0] + 0.05, 'whoosh_soft', 0.5);
const B11 = T.cta[0];
const s11 = scene({ a: T.cta[0], b: T.cta[1], tin: 0.6, inScale: 0.94 });
s11.root = mount(`
  <div class="abs" id="ctaGlow" style="left:560px;top:140px;width:800px;height:800px;border-radius:50%;background:radial-gradient(circle,rgba(91,70,229,.45),rgba(91,70,229,0) 65%)"></div>
  <div class="abs cta" style="left:0;right:0;top:150px;display:flex;align-items:center;justify-content:center;gap:18px">${LOGO(70)}<span style="font-size:42px;font-weight:820;color:#fff;letter-spacing:-0.04em">Protected Central</span></div>
  <div class="big cta" style="top:252px;font-size:84px">Start your <span class="grad-lime">7-Day Free Trial</span></div>
  <div class="big cta" style="top:362px;color:rgba(226,232,255,.8);font-size:34px;font-weight:560;letter-spacing:-0.02em;line-height:1.3">No card. No complicated setup. Start building with AI.</div>
  <div class="abs cta" style="left:0;right:0;top:470px;display:flex;justify-content:center"><div class="cta-btn" id="ctaBtn" style="position:relative;overflow:hidden">TRY PROTECTED CENTRAL FREE ${ico('arrow-right', 34)}<span id="shine" class="abs" style="top:-20px;bottom:-20px;width:120px;left:-160px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.75),rgba(255,255,255,0));transform:skewX(-18deg)"></span></div></div>
  <div class="big cta" style="top:650px;font-size:48px;font-weight:780;letter-spacing:-0.025em">ProtectedCentral.com</div>
  <div class="big cta" style="top:724px;font-size:34px;font-weight:650;letter-spacing:-0.02em;color:rgba(226,232,255,.62)">Describe it. <span class="grad-blue" style="font-weight:780">AI builds it.</span></div>
`);
sfx(B11 + 0.1, 'impact', 0.9); sfx(B11 + 2.0, 'click', 0.8); sfx(B11 + 2.25, 'sting', 1);
s11.render = (t) => {
  const r = s11.root, L = t - B11;
  r.querySelectorAll('.cta').forEach((c, i) => {
    const a = 0.1 + [0, 0.18, 0.5, 0.75, 1.0, 1.2][i];
    const p = seg(L, a, a + 0.55, eo5);
    c.style.opacity = String(p);
    c.style.transform = `translateY(${((1 - p) * 30).toFixed(1)}px)`;
    c.style.filter = p < 0.99 ? `blur(${((1 - p) * 8).toFixed(1)}px)` : 'none';
  });
  const press = lin(L, 1.95, 2.15);
  q(r, '#ctaBtn').style.transform = `scale(${(1 - Math.sin(press * Math.PI) * 0.05).toFixed(3)})`;
  q(r, '#shine').style.left = (-160 + seg(L, 1.35, 2.05, eio) * 820).toFixed(1) + 'px';
  q(r, '#ctaGlow').style.transform = `scale(${(1 + Math.sin(t * 1.5) * 0.05).toFixed(3)})`;
};

/* ── Every scene into the slot its voice occupies ─────────────────────── */
/* Must run after every scene and its sounds exist: `place` moves the cues
   registered so far, and the toasts and cursor below are timed with `at`. */
CUR_SCENE = null;
[[s2, 's2'], [sPlan, 'plan'], [sCanvas, 'canvas'], [s3, 's3'], [sMoney, 'money'], [sStreams, 'streams'],
 [sLib, 'lib'], [sGuard, 'guard'], [sReply, 'reply'], [s4, 's4'], [s5, 's5'], [s6, 's6'], [sBlog, 'blog'],
 [sShorts, 'shorts'], [sGallery, 'gallery'], [sWeb, 'web'], [sReviews, 'reviews'], [s7, 's7'], [sLive, 'live'],
 [s8, 's8'], [sAgency, 'agency'], [sResell, 'resell'], [sAff, 'affiliate'], [sDev, 'dev'], [s9, 'trust'],
 [s10, 's10'], [s10b, 'lock'], [s11, 'cta']].forEach(([sc, k]) => place(sc, ...NT[k]));

/* ── Toasts and cursor ───────────────────────────────────────────────── */
CUR_SCENE = null;
const TOASTS = [
  [at(s4, 19.55), at(s4, 21.2), 'Lead qualified.'], [at(s5, 22.95), at(s5, 24.5), 'Campaign ready.'],
  [at(s6, 30.65), at(s6, 32.3), 'New content asset created.'], [at(s7, 35.5), at(s7, 36.9), 'Ticket routed to Support.'],
  [at(sPlan, B1 + 10.6), at(sPlan, B1 + 11.8), 'Building 5 workflows…'], [at(sReply, B5 + 7.3), at(sReply, B5 + 8.6), 'Reply sent to Maria.'],
];
TOASTS.forEach(x => sfx(x[0], 'notify', 0.45));
function renderToast(t) {
  const el_ = document.getElementById('toast');
  const cur = TOASTS.find(x => t >= x[0] && t <= x[1]);
  if (!cur) { el_.style.opacity = '0'; return; }
  setText(document.getElementById('toastText'), cur[2]);
  const p = seg(t, cur[0], cur[0] + 0.4, back), o = seg(t, cur[1] - 0.3, cur[1]);
  el_.style.opacity = String(clamp(p) * (1 - o));
  el_.style.transform = `translateY(${((1 - p) * 30 + o * 10).toFixed(1)}px) scale(${mix(0.9, 1, p).toFixed(3)})`;
  animBot(el_, t, false, 9);
}
/* Window-body coordinates → stage: the window is at (860,140), its body 66px lower. */
const WX = 860, WY = 206;
/* The short ad's cursor was in portrait coordinates, window at (60,696). */
const fromPortrait = (x, y) => [x - 60 + 860, y - 696 + 140];
/* Cursor paths are written in each scene's own (nominal) time, then moved
   with the scene. */
const mv = (sc, path) => path.map(([t, x, y]) => [at(sc, t), x, y]);
const PATHS = [
  mv(s2, [[7.6, 1940, 1000], [8.25, ...fromPortrait(524, 1186)], [8.9, ...fromPortrait(532, 1196)], [9.6, 1940, 1000]]),
  mv(sPlan, [[B1 + 9.4, 1940, 900], [B1 + 10.2, WX + 120, WY + 546], [B1 + 10.9, WX + 124, WY + 552], [B1 + 11.5, 1940, 980]]),
  mv(sGuard, [[B4 + 3.4, 1940, 700], [B4 + 4.3, WX + 405, WY + 110], [B4 + 6.8, WX + 860, WY + 267], [B4 + 7.6, 1940, 900]]),
  mv(sReply, [[B5 + 5.9, 1940, 900], [B5 + 6.8, WX + 420, WY + 420], [B5 + 7.6, WX + 426, WY + 426], [B5 + 8.2, 1940, 980]]),
  mv(sWeb, [[B6 + 4.3, 1940, 900], [B6 + 5.1, WX + 180, WY + 496], [B6 + 5.9, WX + 186, WY + 500], [B6 + 6.4, 1940, 980]]),
  mv(sLive, [[B7 + 0.6, 1940, 700], [B7 + 1.5, WX + 256, WY + 160], [B7 + 2.2, WX + 262, WY + 166], [B7 + 2.8, 1940, 900]]),
  mv(sBlog, [[BB + 10.6, 1940, 900], [BB + 11.5, WX + 130, WY + 624], [BB + 12.2, WX + 136, WY + 628], [BB + 12.9, 1940, 980]]),
  mv(sReviews, [[BR + 3.0, 1940, 900], [BR + 3.8, WX + 120, WY + 410], [BR + 4.4, WX + 126, WY + 414], [BR + 8.6, WX + 600, WY + 300], [BR + 9.2, WX + 586, WY + 236], [BR + 9.9, WX + 592, WY + 240], [BR + 10.5, 1940, 980]]),
  mv(sResell, [[BRS + 2.6, 1940, 900], [BRS + 3.2, WX + 700, WY + 268], [BRS + 6.2, WX + 700, WY + 276], [BRS + 6.9, WX + 760, WY + 326], [BRS + 7.6, WX + 766, WY + 330], [BRS + 8.2, 1940, 980]]),
  mv(sAff, [[BA + 1.0, 1940, 700], [BA + 1.8, WX + 860, WY + 136], [BA + 2.5, WX + 866, WY + 140], [BA + 3.1, 1940, 900]]),
  mv(s11, [[B11 + 1.2, 1940, 900], [B11 + 1.9, 1020, 530], [B11 + 3.4, 1026, 536]]),
];
const CLICKS = [[at(s2, 8.66), ...fromPortrait(531, 1191)], [at(sPlan, B1 + 10.3), WX + 122, WY + 550], [at(sGuard, B4 + 4.4), WX + 405, WY + 110], [at(sGuard, B4 + 6.9), WX + 860, WY + 267],
  [at(sReply, B5 + 6.9), WX + 424, WY + 424], [at(sWeb, B6 + 5.2), WX + 184, WY + 498], [at(sLive, B7 + 1.6), WX + 260, WY + 164], [at(sBlog, BB + 11.6), WX + 133, WY + 626],
  [at(sReviews, BR + 3.9), WX + 123, WY + 412], [at(sReviews, BR + 9.3), WX + 589, WY + 238], [at(sResell, BRS + 7.0), WX + 763, WY + 328], [at(sAff, BA + 1.9), WX + 863, WY + 138], [at(s11, B11 + 2.0), 1024, 534]];
function renderCursor(t) {
  const c = document.getElementById('cursor');
  let segm = null;
  for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) if (t >= p[i][0] && t <= p[i + 1][0]) segm = [p[i], p[i + 1]];
  if (!segm) c.style.opacity = '0';
  else {
    const pr = eio(lin(t, segm[0][0], segm[1][0]));
    c.style.opacity = '1';
    c.style.left = mix(segm[0][1], segm[1][1], pr) + 'px'; c.style.top = mix(segm[0][2], segm[1][2], pr) + 'px';
  }
  const rp = document.getElementById('ripple');
  const cl = CLICKS.find(k => t >= k[0] && t < k[0] + 0.5);
  if (cl) {
    const p = lin(t, cl[0], cl[0] + 0.5);
    rp.style.left = cl[1] - 10 + 'px'; rp.style.top = cl[2] - 10 + 'px';
    rp.style.opacity = String(1 - p); rp.style.transform = `scale(${1 + eo(p) * 4})`;
  } else rp.style.opacity = '0';
}

/* ── Ground ──────────────────────────────────────────────────────────── */
function renderBg(t) {
  const g1 = document.getElementById('g1'), g2 = document.getElementById('g2'), g3 = document.getElementById('g3');
  const calm = seg(t, NT.trust[0], NT.trust[0] + 0.7) * (1 - seg(t, NT.trust[1] - 0.5, NT.trust[1] + 0.3));
  const cta = seg(t, NT.cta[0], NT.cta[0] + 0.9);
  g1.style.transform = `translate(${Math.sin(t * 0.21) * 160}px, ${Math.cos(t * 0.17) * 110}px)`;
  g2.style.transform = `translate(${Math.cos(t * 0.19) * 150}px, ${Math.sin(t * 0.23) * 100}px)`;
  g3.style.transform = `translate(${Math.sin(t * 0.27) * 200}px, ${Math.cos(t * 0.2) * 60}px)`;
  const intro = seg(t, 0, 1.2);
  g1.style.opacity = String((0.34 + 0.08 * Math.sin(t * 0.7)) * intro * (1 - calm * 0.6) * (1 + cta * 0.3));
  g2.style.opacity = String((0.3 + 0.08 * Math.cos(t * 0.6)) * intro * (1 - calm * 0.5));
  g3.style.opacity = String(0.16 * intro * (1 - calm));
  document.getElementById('dots').style.transform = `translateY(${(-t * 6) % 34}px)`;
}

/* ── Where to go, while the product is on screen ───────────────────────── */
/* An ad is watched in part far more often than in full. The address and the
   offer stay in the lower left through every product scene, so somebody who
   stops at minute two still knows both; they step aside for the full-screen
   scenes at the end, which say it larger. */
document.getElementById('lt').innerHTML = `${LOGO(30)}protectedcentral.com<span style="opacity:.55">·</span><b>7-day free trial</b>`;
function renderLowerThird(t) {
  const a = NT.s2[0] + 1.2, b = NT.trust[0];
  const p = seg(t, a, a + 0.6, eo5) * (1 - seg(t, b - 0.5, b));
  const n = document.getElementById('lt');
  n.style.opacity = String(p);
  n.style.transform = `translateY(${((1 - p) * 14).toFixed(1)}px)`;
}

/* ── Render ──────────────────────────────────────────────────────────── */
buildCopy();
window.render = (t) => {
  renderBg(t);
  SCENES.forEach(sc => { if (sceneFx(sc, t)) sc.render(sc.map ? sc.map(t) : t); });
  renderCopy(t);
  renderToast(t);
  renderLowerThird(t);
  renderCursor(t);
};
window.SFX.forEach(e => { delete e.sc; delete e.moved; });
window.SFX.sort((a, b) => a.t - b.t);
window.render(0);
window.READY = document.fonts.ready.then(() => true);
