/**
 * The design step: what is asked, what it writes onto the workflows, and what
 * the server draws from it.
 *
 * Run with `npm run test:design`. Pure — no browser, no Worker, no model.
 *
 * The assertions that matter most are the negative ones, as in
 * test:intake: a project that makes no posts must not be asked for a post
 * layout, a blog-only project must not be asked for a logo, and a plain email
 * must come out exactly as it went in. A design question whose answer changed
 * nothing would be the product pretending.
 */
import {
  applyOps, buildBlueprint, briefOf, designQuestions, initialState, parseEdit, pendingQuestions,
  type IntakeState, type WorkspaceFacts, type Attachment,
} from '../src/services/projectIntake';
import { LAYOUTS, THEMES, readableInk, resolveTheme, contrast } from '../src/services/designOptions';
import {
  BLOG_FORMATS, EMAIL_LAYOUTS, PAGE_LAYOUTS, SOCIAL_LAYOUTS, drawSocial, pageBlocks, pageDesignOf, paletteOf, wrapEmail,
} from '../worker/src/lib/designLayouts';
import { findLogoCandidates } from '../worker/src/lib/brandLogo';
import { designFromPost } from '../worker/src/lib/projectAgents';

const out: string[] = [];
const ok = (n: string, p: boolean, d = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${p ? '' : ` — ${d}`}`);

const ONE: WorkspaceFacts = { portfolios: [{ id: 'pf1', name: 'Pike Plumbing', website: 'https://pikeplumbing.co.uk' }] };
const CTX = { companyName: 'Pike Plumbing', website: '', files: [] as Attachment[], links: [] };
const asked = (s: IntakeState) => designQuestions(s).map(q => q.id);
const set = (s: IntakeState, v: Record<string, string | string[]>) => {
  const st = applyOps(s, { set: v });
  for (const id of Object.keys(v)) if (!st.known[id]) st.known[id] = { value: v[id], source: 'you' };
  return st;
};

/* ── Every layout offered is one the server can draw ── */
{
  const pairs: [string, readonly string[], string[]][] = [
    ['social', SOCIAL_LAYOUTS, LAYOUTS.social.map(l => l.value)],
    ['page', PAGE_LAYOUTS, LAYOUTS.page.map(l => l.value)],
    ['email', EMAIL_LAYOUTS, LAYOUTS.email.map(l => l.value)],
    ['blog', BLOG_FORMATS, LAYOUTS.blog.map(l => l.value)],
  ];
  for (const [kind, server, client] of pairs) {
    const missing = client.filter(v => !server.includes(v));
    ok(`every ${kind} layout offered has a renderer`, !missing.length, missing.join(', '));
  }
}

/* ── Asked for what is built, and only that ── */
{
  const social = initialState('Create one professional image post every weekday for Instagram.', undefined, ONE, [], []);
  const q = asked(social);
  ok('social: asks for a post layout', q.includes('postLayout'), q.join(','));
  ok('social: asks for colours and a logo', q.includes('theme') && q.includes('logo'), q.join(','));
  ok('social: no page, email or article layout', !q.includes('pageLayout') && !q.includes('emailLayout') && !q.includes('blogLayout'), q.join(','));

  const blog = initialState('Create SEO blog content every week.', undefined, ONE, [], []);
  const b = asked(blog);
  ok('blog only: asks the article shape', b.includes('blogLayout'), b.join(','));
  ok('blog only: no logo, colours or post layout — articles are text', !b.includes('logo') && !b.includes('theme') && !b.includes('postLayout'), b.join(','));

  const shop = initialState('I have 80 products with images and prices. Build an e-commerce store.', undefined, ONE, [], []);
  ok('shop: no post, page or article layout it would not use', !['postLayout', 'pageLayout', 'blogLayout'].some(id => asked(shop).includes(id)), asked(shop).join(','));
  ok('shop: its order emails are plain until somebody chooses otherwise, so no logo question yet', !pendingQuestions(shop).some(x => x.id === 'logo'));

  const outreach = initialState('Email outreach to Amazon sellers in the UK offering a free listing audit, a 5-email sequence.', 'email-outreach', ONE, [], []);
  const o = asked(outreach);
  ok('outreach: asks how the emails look', o.includes('emailLayout'), o.join(','));
  const plainLogo = pendingQuestions(outreach).some(x => x.id === 'logo');
  ok('outreach, plain: no logo question (a plain email has none)', !plainLogo);
  const branded = set(outreach, { emailLayout: 'branded' });
  ok('outreach, branded: now asks for the logo', pendingQuestions(branded).some(x => x.id === 'logo'));

  const launch = initialState('Launch our new product with a page and social posts.', 'product-marketing', ONE, [], []);
  const before = asked(launch).includes('postLayout');
  const after = asked(set(launch, { launchChannels: ['social', 'page'] }));
  ok('launch: post layout appears once social is ticked', after.includes('postLayout') && after.includes('pageLayout'), `${before} → ${after.join(',')}`);
}

/* ── What the blueprint writes onto the steps ── */
{
  let s = initialState('Create one professional image post every weekday for Instagram.', undefined, ONE, [], []);
  s = set(s, { postLayout: 'offer', theme: 'luxury', designStyle: 'elegant', logo: 'site' });
  const bp = buildBlueprint(s, CTX);
  const node = bp.workflows.flatMap(w => w.nodes ?? []).find(n => n.config?.produces === 'social');
  ok('social step carries the layout', node?.config.layout === 'offer', JSON.stringify(node?.config));
  ok('social step carries colours, not a theme name', /^#[0-9a-f]{6}$/.test(node?.config.bg ?? '') && !!node?.config.ink, JSON.stringify(node?.config));
  ok('"elegant" sets a serif', node?.config.font === 'Georgia', node?.config.font);
  ok('logo "site" means use it', node?.config.logo === 'on');
  ok('the blueprint says what it chose', bp.design.some(d => d.label === 'Social posts' && d.value === 'Offer badge'), JSON.stringify(bp.design));
  const none = buildBlueprint(set(s, { logo: 'none' }), CTX).workflows.flatMap(w => w.nodes ?? []).find(n => n.config?.produces === 'social');
  ok('logo "none" switches it off', none?.config.logo === 'off');

  const blog = buildBlueprint(set(initialState('Create SEO blog content every week.', undefined, ONE, [], []), { blogLayout: 'qa' }), CTX);
  const bn = blog.workflows.flatMap(w => w.nodes ?? []).find(n => n.config?.produces === 'blog');
  ok('article step carries its shape', bn?.config.format === 'qa', JSON.stringify(bn?.config));

  const lead = set(initialState('Find leads for my agency: plumbers in Leeds, offer a free audit, book calls.', 'lead-generation', ONE, [], []), { pageLayout: 'minimal', theme: 'fresh' });
  const lbp = buildBlueprint(lead, CTX);
  ok('pages: the design rides on the brief', (briefOf(lbp, 'x').design as { page?: { layout?: string } })?.page?.layout === 'minimal', JSON.stringify(briefOf(lbp, 'x').design));
  const pd = pageDesignOf(JSON.stringify(briefOf(lbp, 'x')));
  ok('pages: the server reads it back', pd?.layout === 'minimal' && pd.palette.bg === '#0f5132', JSON.stringify(pd));
  const sends = lbp.workflows.flatMap(w => w.nodes ?? []).filter(n => n.type === 'send_email');
  ok('email steps carry the email layout', sends.length > 0 && sends.every(n => !!n.config.emailLayout), JSON.stringify(sends.map(n => n.config.emailLayout)));
}

/* ── Colours stay readable ── */
{
  const pale = resolveTheme('brand', '#fde68a');
  ok('a pale brand colour gets dark text', pale.ink === '#111827', JSON.stringify(pale));
  ok('…and is not faded into near-black under it', pale.bg2 === pale.bg);
  for (const t of THEMES) {
    const p = resolveTheme(t.value, '#5b7cfa');
    const worst = Math.min(contrast(p.ink, p.bg), contrast(p.ink, p.bg2));
    ok(`${t.value}: text is readable across the gradient (${worst.toFixed(1)}:1)`, worst >= 3, JSON.stringify(p));
  }
  ok('readableInk on white is dark', readableInk('#ffffff') === '#111827');
}

/* ── The server draws every layout inside the canvas ── */
{
  const cfg = (k: string) => ({ bg: '#101010', bg2: '#2a2418', ink: '#ffffff', accent: '#c9a54a', font: 'Georgia' } as Record<string, string>)[k] ?? '';
  const p = paletteOf(cfg);
  for (const l of SOCIAL_LAYOUTS) {
    for (const [W, H] of [[1080, 1080], [1200, 675]]) {
      const d = drawSocial(l, W, H, p, { headline: 'Boilers fixed today', company: 'Pike', badge: '20% off', cta: 'Book now' }, '/api/logo.php?p=x&s=y', 't');
      const texts = d.elements.filter(e => (e.data as { kind: string }).kind === 'text');
      const logo = d.elements.find(e => (e.data as { kind: string }).kind === 'image');
      const inside = d.elements.filter(e => (e.data as { kind: string }).kind !== 'shape')
        .every(e => (e.x as number) >= 0 && (e.y as number) >= -2 && (e.x as number) + (e.width as number) <= W + 1 && (e.y as number) + (e.height as number) <= H + 1);
      ok(`${l} ${W}×${H}: headline, logo, all inside`, texts.some(t => (t.data as { text: string }).text === 'Boilers fixed today') && !!logo && inside);
    }
  }
  const old = designFromPost({ platform: 'instagram', headline: 'Hi', body: 'b', hashtags: [] }, { id: 'x', brandColor: '#123456', company: 'Co', source: {}, now: 'n' });
  ok('a step with no design draws what it always drew', (old.background as { gradientStart: string }).gradientStart === '#123456'
    && !(old.elements as { data: { kind: string } }[]).some(e => e.data.kind === 'image'));
  const bad = designFromPost({ platform: 'instagram', headline: 'Hi', body: 'b', hashtags: [] },
    { id: 'x', brandColor: '#123456', company: 'Co', source: {}, now: 'n', design: { layout: 'nonsense', bg: 'javascript:alert(1)', font: 'Comic Sans' } });
  ok('an unknown layout, colour or font falls back rather than being written through',
    (bad.background as { gradientStart: string }).gradientStart === '#123456' && !JSON.stringify(bad).includes('javascript') && !JSON.stringify(bad).includes('Comic'));
}

/* ── Emails ── */
{
  const body = '<p>Hello</p><p><a href="https://x.test/book">Book a call</a></p>';
  ok('plain is left exactly as it was', wrapEmail(body, () => 'plain', { company: 'Pike', logoSrc: '' }) === body);
  const c = (k: string) => ({ emailLayout: 'branded', emailAccent: '#c9a54a' } as Record<string, string>)[k] ?? '';
  const html = wrapEmail(body, c, { company: 'Pike <script>', logoSrc: 'https://app.test/api/logo.php?p=1&s=2' });
  ok('branded: the first link becomes the button', /background:#c9a54a[^"]*"[^>]*>Book a call<\/a>/.test(html) || html.includes('>Book a call</a></td>'));
  ok('branded: the company name is escaped', !html.includes('<script>') && html.includes('Pike &lt;script&gt;'));
  ok('branded: the logo is an absolute image', html.includes('<img src="https://app.test/api/logo.php?p=1&amp;s=2"'));
}

/* ── Pages ── */
{
  const v = { headline: 'H', subhead: 'S', bullets: ['a', 'b'], cta: 'Go', sections: [{ heading: 'x', body: 'y' }] };
  const o = { company: 'Pike', formSlug: 'f', logoSrc: '/api/logo.php?p=1', fields: [] };
  const lead = pageBlocks(v, pageDesignOf(JSON.stringify({ design: { page: { layout: 'hero-form', bg: '#0f5132', bg2: '#2d8f5b', accent: '#c7f441', ink: '#ffffff' } } })), o);
  ok('lead capture: the form is right under the headline', lead.map(b => b.type).slice(0, 3).join(',') === 'navbar,hero,form', lead.map(b => b.type).join(','));
  ok('the logo goes in the navbar', lead[0].settings.navLogoImage === '/api/logo.php?p=1');
  ok('the hero wears the theme', String(lead[1].settings.bgGradient).includes('#0f5132'));
  const before = pageBlocks(v, null, { ...o, logoSrc: '' });
  ok('no design: the page every project had before', before.map(b => b.type).join(',') === 'navbar,hero,features,columns,form,footer' && String(before[1].settings.bgGradient).includes('#2563eb'));
}

/* ── Finding the logo on a page ── */
{
  const html = `<html><head>
    <meta property="og:image" content="/hero-photo.jpg">
    <link rel="icon" href="/favicon.ico">
    <link rel="apple-touch-icon" href="/apple.png">
    <script type="application/ld+json">{"@type":"Organization","logo":{"@type":"ImageObject","url":"https://cdn.pike.test/logo-ld.png"}}</script>
    </head><body><header><img class="site-logo" src="/img/pike-logo.svg" alt="Pike"></header>
    <footer><img src="/partners/brand-x.png" alt="partner"></footer></body></html>`;
  const c = findLogoCandidates(html, 'https://pike.test/');
  ok('JSON-LD first', c[0] === 'https://cdn.pike.test/logo-ld.png', c.join(' '));
  ok('then the header <img>', c[1] === 'https://pike.test/img/pike-logo.svg', c.join(' '));
  ok('the touch icon is a fallback', c.includes('https://pike.test/apple.png'));
  ok('never the og:image photograph, never a 16px .ico', !c.some(u => u.includes('hero-photo') || u.includes('favicon.ico')), c.join(' '));
  ok('a page with nothing marked finds nothing', findLogoCandidates('<p>hello</p>', 'https://x.test').length === 0);
}

/* ── Changing the look by saying so ── */
{
  const s = set(initialState('Create one professional image post every weekday for Instagram.', undefined, ONE, [], []), { postLayout: 'bold', theme: 'brand' });
  const bp = buildBlueprint(s, CTX);
  const e = parseEdit('Make the posts minimal with luxury colours', s, bp);
  ok('an edit changes the layout and the colours', e?.ops.set?.postLayout === 'minimal' && e?.ops.set?.theme === 'luxury', JSON.stringify(e));
  const n = parseEdit('no logo please', s, bp);
  ok('"no logo" is understood', n?.ops.set?.logo === 'none', JSON.stringify(n));
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${out.length - failed} passed, ${failed} failed`);
if (failed) process.exit(1);
