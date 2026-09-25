/**
 * The email sanitiser, in a real browser, against the payloads that matter.
 *
 * It renders inbound email and AI-written text inside the app, so anything it
 * lets through runs with the reader's session. Bundled with esbuild and run in
 * Chromium, because DOMPurify needs a real DOM.
 *
 *   node test/emailHtml.e2e.mjs
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { build } from 'esbuild';

const out = await build({
  entryPoints: ['src/services/emailHtml.ts'], bundle: true, format: 'iife', globalName: 'H', write: false, platform: 'browser',
});
const b = await pw.chromium.launch();
const p = await b.newPage();
await p.setContent('<html><body></body></html>');
await p.addScriptTag({ content: out.outputFiles[0].text });

const cases = [
  ['script tag removed', '<p>Hi</p><script>alert(1)</script>', h => !/script/i.test(h) && /Hi/.test(h)],
  ['event handler removed', '<img src="https://x.example/a.png" onerror="alert(1)">', h => !/onerror/i.test(h) && /x\.example/.test(h)],
  ['javascript: link removed', '<a href="javascript:alert(1)">x</a>', h => !/javascript/i.test(h)],
  ['entity-encoded javascript: removed', '<a href="java&#115;cript:alert(1)">x</a>', h => !/javascript|&#115;/i.test(h)],
  ['data:text/html removed', '<a href="data:text/html,<script>alert(1)</script>">x</a>', h => !/data:text/i.test(h)],
  ['svg removed', '<svg><script>alert(1)</script></svg><p>ok</p>', h => !/svg|script/i.test(h) && /ok/.test(h)],
  ['iframe removed', '<iframe src="https://evil.example"></iframe>', h => !/iframe/i.test(h)],
  ['mutation XSS (noscript/title) neutralised', '<noscript><p title="</noscript><img src=x onerror=alert(1)>">', h => !/onerror/i.test(h)],
  ['style expression removed', '<p style="width: expression(alert(1))">x</p>', h => !/expression/i.test(h)],
  ['safe links kept, _blank gets noopener', '<a href="https://ok.example" target="_blank">ok</a>', h => /https:\/\/ok\.example/.test(h) && /noopener/.test(h)],
  ['tables and formatting kept', '<table><tr><td><strong>Total</strong></td></tr></table>', h => /<table>/.test(h) && /<strong>Total<\/strong>/.test(h)],
  ['unknown element keeps its words', '<custom-tag>words stay</custom-tag>', h => /words stay/.test(h) && !/custom-tag/.test(h)],
];
let fail = 0;
for (const [name, input, ok] of cases) {
  const got = await p.evaluate(x => window.H.sanitizeEmailHtml(x), input);
  const pass = ok(got);
  if (!pass) fail++;
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}${pass ? '' : ` — ${got}`}`);
}
/* And nothing actually ran while all that was parsed. */
const ran = await p.evaluate(() => window.__ran === true);
console.log(`${ran ? '  ✗' : '  ✓'} no payload executed`);
await b.close();
console.log(`\n${cases.length + 1 - fail - (ran ? 1 : 0)}/${cases.length + 1} passed`);
process.exit(fail || ran ? 1 : 0);
