/* App icons, splash screens and store graphics for both apps, drawn from the
   product's own shield (src/components/shared/Logo.tsx) — node icons.mjs.
   The support app's icon carries a headset badge so the two are told apart
   on a home screen. */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import fs from 'node:fs';

const SHIELD = 'M16 4.6 L25.4 8.1 V16.2 C25.4 21.6 21.6 25.9 16 27.9 C10.4 25.9 6.6 21.6 6.6 16.2 V8.1 Z M16 12.2 a3.9 3.9 0 1 0 0 7.8 a3.9 3.9 0 1 0 0 -7.8 Z';
const grad = `<linearGradient id="g" x1="6" y1="3" x2="26" y2="29" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#d6f96f"/><stop offset=".55" stop-color="#c8f24d"/><stop offset="1" stop-color="#8fd9c4"/></linearGradient>
<radialGradient id="bg" cx="0.2" cy="0.1" r="1.1"><stop offset="0" stop-color="#22327f"/><stop offset=".55" stop-color="#0d1336"/><stop offset="1" stop-color="#070918"/></radialGradient>`;
/* Lucide "headset", for the support badge. */
const HEADSET = '<path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z"/><path d="M21 16v2a4 4 0 0 1-4 4h-5"/>';

const icon = (support, { full = true, scale = 0.62 } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="1024" height="1024">
<defs>${grad}</defs>
${full ? '<rect width="32" height="32" fill="url(#bg)"/>' : ''}
<g transform="translate(${16 - 16 * scale} ${16 - 16 * scale - (support ? 1.2 : 0)}) scale(${scale})"><path fill="url(#g)" fill-rule="evenodd" d="${SHIELD}"/></g>
${support ? `<g transform="translate(18.6 18.6)"><circle cx="5.2" cy="5.2" r="5.6" fill="#5b46e5" stroke="#070918" stroke-width="0.9"/><g transform="translate(1.6 1.6) scale(0.3)" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${HEADSET}</g></g>` : ''}
</svg>`;

const splash = (support) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732" width="2732" height="2732">
<defs>${grad.replace('x1="6" y1="3" x2="26" y2="29"', 'x1="6" y1="3" x2="26" y2="29"')}</defs>
<rect width="2732" height="2732" fill="url(#bg)"/>
<g transform="translate(1066 1000) scale(18.75)"><path fill="url(#g)" fill-rule="evenodd" d="${SHIELD}"/></g>
<text x="1366" y="1700" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="120" font-weight="800" fill="#ffffff" letter-spacing="-3">Protected Central${support ? ' Support' : ''}</text>
</svg>`;

/* Play's feature graphic, 1024×500. */
const feature = (support) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 500" width="1024" height="500">
<defs>${grad}</defs><rect width="1024" height="500" fill="url(#bg)"/>
<g transform="translate(60 110) scale(9)"><path fill="url(#g)" fill-rule="evenodd" d="${SHIELD}"/></g>
<text x="380" y="215" font-family="Inter, system-ui, sans-serif" font-size="50" font-weight="800" fill="#fff" letter-spacing="-1.5">Protected Central${support ? '' : ''}</text>
<text x="380" y="285" font-family="Inter, system-ui, sans-serif" font-size="29" font-weight="700" fill="#c8f24d">${support ? 'Answer every customer, anywhere' : 'Describe it. AI builds it.'}</text>
<text x="380" y="335" font-family="Inter, system-ui, sans-serif" font-size="24" fill="#aab0d6">${support ? 'Calls, screen shares, chats and tickets' : 'CRM, AI Autopilot, prospecting and more'}</text>
</svg>`;

const b = await pw.chromium.launch();
const page = await b.newPage();
const shoot = async (svg, w, h, out) => {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace(/width="\d+" height="\d+"/, `width="${w}" height="${h}"`)}</body></html>`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
};
for (const app of ['customer', 'support']) {
  const s = app === 'support';
  fs.mkdirSync(app, { recursive: true });
  await shoot(icon(s), 1024, 1024, `${app}/icon-1024.png`);
  await shoot(icon(s), 512, 512, `${app}/icon-512.png`);
  /* Android adaptive: foreground on transparent (the system masks it to a circle or squircle). */
  await shoot(icon(s, { full: false, scale: 0.44 }), 1024, 1024, `${app}/icon-foreground-1024.png`);
  await shoot(splash(s), 2732, 2732, `${app}/splash-2732.png`);
  await shoot(feature(s), 1024, 500, `${app}/feature-1024x500.png`);
}
await b.close();
console.log('ok');
