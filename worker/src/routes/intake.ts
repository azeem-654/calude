/**
 * /api/intake.php — understanding a new project before anybody is questioned.
 *
 * The New Project wizard starts from a sentence, a few files and maybe a
 * website. This is the part that reads them. Three actions:
 *
 *   understand  the request, its attachments and linked pages → which of the
 *               catalogue's solutions it is, what it already answers, the
 *               questions only a custom request needs, and a draft business
 *               profile if the material describes one
 *   refine      one sentence of feedback on a blueprint ("remove LinkedIn")
 *               → a change to the answers, in the same vocabulary
 *   transcribe  a recording from the microphone → the words, punctuated
 *
 * ── What the model may decide, and what it may not ──
 *
 * It chooses among things the client sent: solution keys from the catalogue,
 * answers to the catalogue's own questions. It never names a workflow the
 * engine cannot run — a custom workflow it proposes is checked again on the
 * client (`customToSpec`) before it can become part of a blueprint. The reason
 * is the one the whole product is built on: plausible success with nothing
 * behind it is worse than no feature.
 *
 * ── When there is no model ──
 *
 * `code: 'no_ai'` and nothing else. The wizard has a deterministic path for
 * every one of these and says on screen that it matched words rather than
 * understood them. Returning a guess from here would hide which one happened.
 *
 * ── Files ──
 *
 * Carried inline to Gemini, never stored. There is no file store in this
 * deployment, and a customer's brochure has no business being kept by the step
 * that reads it once.
 */
import { body, fail, json } from '../lib/http';
import { canAccess, userFromToken, type Env } from '../lib/db';
import { askGeminiParts, loadAiKey, type AiPart } from '../lib/ai';
import { readSite } from '../lib/readSite';
import { rateLimit } from '../lib/rateLimit';

interface CatalogueQuestion { id: string; prompt: string; type: string; options?: { value: string; label: string }[] }
interface Catalogue {
  solutions?: { key: string; label: string; blurb: string }[];
  questions?: CatalogueQuestion[];
  templates?: { key: string; name: string; blurb: string }[];
}

interface Req {
  token?: string;
  accountId?: string;
  action?: string;
  prompt?: string;
  files?: { name?: string; mime?: string; data?: string }[];
  texts?: { name?: string; text?: string }[];
  urls?: string[];
  portfolioId?: string;
  catalogue?: Catalogue;
  candidates?: string[];
  /* refine */
  state?: Record<string, unknown>;
  instruction?: string;
  /* transcribe */
  audio?: string;
  mime?: string;
  language?: string;
  /* write_emails */
  business?: { companyName?: string; description?: string; audience?: string; offer?: string; website?: string; tone?: string };
  strategy?: { workflow?: string; purpose?: string; objective?: string; booking?: boolean; instruction?: string };
  projectId?: string;
  emails?: { id?: string; intent?: string; subject?: string; body?: string }[];
}

/* Limits, each with its reason. */
const MAX_FILES = 4;
/** Base64 characters per file — about 3 MB of image or PDF. */
const MAX_FILE_CHARS = 4_200_000;
const MAX_TOTAL_CHARS = 12_000_000;
/** About four minutes of 16 kHz mono WAV, which is longer than anybody talks to a form. */
const MAX_AUDIO_CHARS = 11_000_000;
const FILE_TYPES = /^(image\/(png|jpe?g|webp|gif|heic|heif)|application\/pdf)$/i;
const AUDIO_TYPES = /^audio\/(wav|x-wav|wave|webm|ogg|mp4|mpeg|mp3|aac|flac|x-m4a|m4a)(;.*)?$/i;

const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

function parseJson<T>(text: string): T | null {
  try { return JSON.parse(text) as T; } catch { /* fall through */ }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)) as T; } catch { return null; }
}

export async function handleIntake(req: Request, env: Env): Promise<Response> {
  const d = await body<Req>(req);
  const user = await userFromToken(env.DB, d.token);
  if (!user) return fail('Sign in again — this needs a current session.', 401, { code: 'unauthorised' });
  const accountId = String(d.accountId ?? '').trim();
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(accountId)) return fail('A valid workspace is required.');
  if (!(await canAccess(env.DB, user, accountId))) return fail('That workspace is not yours.', 403);

  const act = String(d.action ?? '');
  if (!['understand', 'refine', 'transcribe', 'write_emails'].includes(act)) return fail('Unknown action.');

  /*
   * Budgets per workspace, per hour.
   *
   * Every call here spends the operator's model quota, and the wizard makes a
   * handful per project. Forty understandings an hour is several projects'
   * worth of changing one's mind; sixty recordings is a minute of talking
   * every minute. Past either, the wizard keeps working on its own logic.
   */
  const verdict = await rateLimit(env, {
    what: act === 'transcribe' ? 'intake-voice' : 'intake', who: accountId,
    max: act === 'transcribe' ? 60 : 40, windowSeconds: 3600,
  });
  if (!verdict.allowed) {
    return fail(`That is a lot of requests in an hour — try again in ${Math.ceil(verdict.retryAfter / 60)} minutes.`, 429, { code: 'rate_limited' });
  }

  const key = await loadAiKey(env, accountId);
  if (!key) return fail('The AI is not available on this install right now.', 200, { code: 'no_ai' });

  if (act === 'transcribe') return transcribe(key, d);
  if (act === 'write_emails') return writeEmails(env, key, accountId, d);
  if (act === 'refine') return refine(key, d);
  return understand(env, key, accountId, d);
}

/* ── write_emails ───────────────────────────────────────────────────────── */

/**
 * The emails in a workflow, written for this business.
 *
 * ── Why ──
 *
 * The New Project wizard builds its email workflows from gallery templates,
 * and a template's emails were written for one trade: an Amazon FBA agency's
 * reactivation campaign went out telling people to check their boiler
 * pressure before winter. Each email is rewritten here from the client's
 * business profile and the project's strategy, keeping what the step is *for*
 * (its intent: "useful first, not an offer", "ask once whether to stop") and
 * the order of the sequence.
 *
 * ── What the model may not do ──
 *
 * Invent. Only facts in the profile may be used — no made-up discounts,
 * statistics, awards or clients. Merge fields must come from the known list;
 * anything else is removed rather than sent as "{{discountCode}}". And every
 * email opens by saying who is writing and why, in a sentence drawn from the
 * profile — a cold email that does not is the one that gets reported.
 */
const MERGE = new Set(['firstName', 'lastName', 'name', 'company', 'jobTitle', 'email', 'phone', 'myCompany', 'website', 'bookingLink', 'senderName']);

async function writeEmails(env: Env, key: string, accountId: string, d: Req): Promise<Response> {
  const emails = (d.emails ?? []).slice(0, 12).map(e => ({
    id: clip(e.id, 60), intent: clip(e.intent, 160), subject: clip(e.subject, 200), body: clip(e.body, 3000),
  })).filter(e => e.id);
  if (!emails.length) return fail('There are no emails to write.');
  let b = d.business ?? {};
  /* From the step editor, the business is the project's own profile — read
     here, scoped to this workspace, rather than trusted from the browser. */
  if (!b.companyName && d.projectId) {
    const row = await env.DB.prepare(
      `SELECT p.name AS name, p.profile AS profile, j.objective AS objective FROM crm_projects j
         JOIN crm_portfolios p ON p.id = j.portfolio_id AND p.account_id = j.account_id
        WHERE j.id = ? AND j.account_id = ?`,
    ).bind(clip(d.projectId, 80), accountId).first<{ name: string; profile: string; objective: string }>();
    if (row) {
      let prof: Record<string, string> = {};
      try { prof = JSON.parse(row.profile || '{}') as Record<string, string>; } catch { prof = {}; }
      b = { companyName: prof.companyName || row.name, description: prof.description, audience: prof.audience, offer: prof.offer, website: prof.website, tone: prof.tone };
      d.strategy = { ...(d.strategy ?? {}), objective: d.strategy?.objective || row.objective };
    }
  }
  const company = clip(b.companyName, 160);
  const what = clip(b.description, 1200);
  if (!company || what.length < 8) return fail('The business profile needs a name and what the business does before emails can be written from it.');
  const st = d.strategy ?? {};

  const prompt = [
    'You write short, plain, human sales and follow-up emails for a small business. Rewrite each email below for THIS business.',
    '',
    'The business (the sender):',
    `- Name: ${company}`,
    `- What it does: ${what}`,
    b.audience ? `- Who it sells to: ${clip(b.audience, 400)}` : '',
    b.offer ? `- What it offers: ${clip(b.offer, 400)}` : '',
    b.website ? `- Website: ${clip(b.website, 200)}` : '',
    b.tone ? `- Tone: ${clip(b.tone, 100)}` : '',
    '',
    'The campaign:',
    st.workflow ? `- Workflow: ${clip(st.workflow, 160)}` : '',
    st.purpose ? `- What it is for: ${clip(st.purpose, 400)}` : '',
    st.objective ? `- The project objective: ${clip(st.objective, 400)}` : '',
    st.instruction ? `- The person editing asked: "${clip(st.instruction, 300)}" — do that, within the rules below.` : '',
    st.booking ? '- The goal includes booking a call or appointment: where an email asks for a meeting, give the booking link as {{bookingLink}} on its own line.' : '- Do not mention booking links.',
    '',
    'Rules:',
    '- Keep each email\'s intent and its place in the sequence. The recipient is a contact of the business; greet them with {{firstName}}.',
    '- Open every email with one sentence saying who is writing and why, drawn from the business description (e.g. "I\'m writing from {{myCompany}} — we help … with …").',
    '- Make it specific to what this business actually sells and to whom. Nothing from any other trade.',
    '- Use only facts given above. Never invent prices, discounts, statistics, awards, guarantees, client names or deadlines.',
    `- Merge fields allowed, exactly as written: ${[...MERGE].map(m => `{{${m}}}`).join(', ')}. No others.`,
    '- 60 to 140 words per body. Plain text, blank line between paragraphs, no markdown, no signature block beyond "{{senderName}}" or the business name on its last line.',
    '- Subjects under 60 characters, no clickbait, no ALL CAPS, no emoji.',
    '',
    'The emails, as JSON:',
    JSON.stringify(emails),
    '',
    'Return JSON only: {"emails":[{"id":"…","subject":"…","body":"…"}]} with the same ids in the same order.',
  ].filter(Boolean).join('\n');

  const ai = await askGeminiParts(key, [{ text: prompt }], 0.6, { fast: true, timeoutMs: 45_000 });
  if (!ai.ok) return fail(ai.error);
  const r = parseJson<{ emails?: { id?: string; subject?: string; body?: string }[] }>(ai.text);
  const ids = new Set(emails.map(e => e.id));
  /* Merge fields not on the list are removed, not sent as literal braces. */
  const clean = (t: string) => t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => (MERGE.has(k) ? `{{${k}}}` : ''));
  const out = (r?.emails ?? [])
    .filter(e => ids.has(String(e.id ?? '')))
    .map(e => ({ id: String(e.id), subject: clean(clip(e.subject, 160)), body: clean(clip(e.body, 4000)) }))
    .filter(e => e.subject && e.body.length > 40);
  if (!out.length) return fail('The AI did not return usable emails. The template wording has been kept — edit it on the workflow.');
  return json({ success: true, emails: out });
}

/* ── transcribe ─────────────────────────────────────────────────────────── */

/**
 * The words somebody said, as they said them.
 *
 * ── Why this exists alongside the browser's own recogniser ──
 *
 * The browser's is fast and shows words while somebody talks, which is why it
 * stays as the live preview. It is also a narrow thing: it is told one locale,
 * it drops a sentence at the first long pause, it does not punctuate, and on
 * Firefox it does not exist. A multilingual model given the whole recording
 * afterwards hears an accent as an accent rather than as a different word, and
 * gets the full sentence rather than the part before somebody drew breath.
 *
 * It is asked for a verbatim transcript, not a summary — the customer is about
 * to read it back and edit it, and a tidied paraphrase would put words in
 * their mouth that they then have to notice and remove.
 */
async function transcribe(key: string, d: Req): Promise<Response> {
  const mime = clip(d.mime, 80).toLowerCase();
  const audio = String(d.audio ?? '');
  if (!AUDIO_TYPES.test(mime)) return fail('That recording is in a format this cannot read.');
  if (!audio || audio.length > MAX_AUDIO_CHARS || !/^[A-Za-z0-9+/=]+$/.test(audio.slice(0, 2000))) {
    return fail(audio.length > MAX_AUDIO_CHARS ? 'That recording is too long — keep it under about four minutes.' : 'There was no recording to read.');
  }
  const lang = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(String(d.language ?? '')) ? String(d.language) : '';

  const prompt = [
    'Transcribe this recording exactly as spoken.',
    'The speaker is describing, in their own words, what they want an AI marketing and automation product to do for their business.',
    'Rules:',
    '- Verbatim: keep their words and word order. Do not summarise, rephrase, correct grammar or add anything.',
    '- Add sentence punctuation and capitalisation. Write numbers as digits when they are quantities ("80 products", "3 times a week").',
    '- Speakers may have any accent — Indian, Pakistani, Nigerian, British, American, Australian, and others. Transcribe what they said, not what a US speaker would have said.',
    '- Brand and platform names are common: Instagram, LinkedIn, Facebook, TikTok, YouTube, Shopify, WooCommerce, Amazon, Google, Protected Central.',
    '- Drop filler sounds (um, uh) and false starts only when they carry no meaning.',
    '- If a word is genuinely unintelligible, write [unclear] in its place rather than guessing.',
    lang ? `- The speaker's browser is set to ${lang}; they may still speak another language — if so, transcribe in that language.` : '',
    '',
    'Return JSON: {"text":"...","language":"BCP-47 code of what was spoken","clarity":"clear" | "partly" | "unclear"}',
    'clarity is "unclear" when you could not make out most of it, "partly" when some words were [unclear].',
  ].filter(Boolean).join('\n');

  const parts: AiPart[] = [
    { text: prompt },
    { inlineData: { mimeType: mime.split(';')[0].replace('x-wav', 'wav').replace('wave', 'wav'), data: audio } },
  ];
  /* No thinking, and a limit per model — see askGeminiParts. A voice note
     is transcribed, not reasoned about, and somebody is waiting on it. */
  const started = Date.now();
  const ai = await askGeminiParts(key, parts, 0, { fast: true, timeoutMs: 25_000 });
  if (!ai.ok) return fail(ai.error);
  const r = parseJson<{ text?: string; language?: string; clarity?: string }>(ai.text);
  const ms = Date.now() - started;
  const text = clip(r?.text, 6000);
  const clarity = ['clear', 'partly', 'unclear'].includes(String(r?.clarity)) ? String(r?.clarity) : 'partly';
  if (!text) return json({ success: true, text: '', language: clip(r?.language, 12), clarity: 'unclear', ms });
  return json({ success: true, text, language: clip(r?.language, 12), clarity, ms });
}

/* ── understand ─────────────────────────────────────────────────────────── */

async function understand(env: Env, key: string, accountId: string, d: Req): Promise<Response> {
  const prompt = clip(d.prompt, 4000);
  if (prompt.length < 4 && !(d.files ?? []).length && !(d.urls ?? []).length) {
    return fail('Say what you would like Autopilot to do.');
  }
  const cat = d.catalogue ?? {};
  if (JSON.stringify(cat).length > 60_000) return fail('The catalogue sent was too large.');
  const solutions = (cat.solutions ?? []).slice(0, 40);
  const questions = (cat.questions ?? []).slice(0, 120);
  const templates = (cat.templates ?? []).slice(0, 80);
  const solutionKeys = new Set(solutions.map(s => s.key));
  const questionIds = new Set(questions.map(q => q.id));

  /* ── The material ── */
  const parts: AiPart[] = [];
  const sources: { what: string; ok: boolean; error?: string }[] = [];

  let total = 0;
  for (const f of (d.files ?? []).slice(0, MAX_FILES)) {
    const mime = clip(f.mime, 60).toLowerCase();
    const data = String(f.data ?? '');
    const name = clip(f.name, 120) || 'attachment';
    if (!FILE_TYPES.test(mime) || !data || data.length > MAX_FILE_CHARS || total + data.length > MAX_TOTAL_CHARS) {
      sources.push({ what: name, ok: false, error: !FILE_TYPES.test(mime) ? 'not an image or PDF' : 'too large to read' });
      continue;
    }
    total += data.length;
    parts.push({ text: `Attached file: ${name}` });
    parts.push({ inlineData: { mimeType: mime, data } });
    sources.push({ what: name, ok: true });
  }
  const texts = (d.texts ?? []).slice(0, 3).map(t => ({ name: clip(t.name, 120), text: clip(t.text, 20_000) })).filter(t => t.text);
  for (const t of texts) sources.push({ what: t.name || 'text', ok: true });

  /* Up to three pages, read in parallel. A page that cannot be read is named
     rather than silently ignored — a customer who pasted their site and got a
     profile of nothing should be told the site was the problem. */
  const urls = [...new Set((d.urls ?? []).map(u => clip(u, 400)).filter(Boolean))].slice(0, 3);
  const pages = await Promise.all(urls.map(u => readSite(u)));
  pages.forEach((p, i) => sources.push({ what: urls[i], ok: p.ok, error: p.ok ? undefined : p.error }));

  let portfolio = '';
  const pid = clip(d.portfolioId, 80);
  if (pid) {
    const row = await env.DB.prepare('SELECT name, profile FROM crm_portfolios WHERE id = ? AND account_id = ?')
      .bind(pid, accountId).first<{ name: string; profile: string }>();
    if (row) portfolio = `${row.name}: ${String(row.profile).slice(0, 3000)}`;
  }

  const instruction = [
    'You are the intake step of Protected Central AI Autopilot, a marketing and automation product for small businesses and agencies.',
    'A customer has described, in their own words, what they want Autopilot to do. Understand the request BEFORE any question is asked.',
    '',
    'WHAT THE PRODUCT CAN ACTUALLY DO (never promise more):',
    '- Scheduled AI agents that read a business profile, a web page, a Google search, an RSS feed or a YouTube channel, and write: social post designs (branded image + caption + hashtags, as drafts in Social Creator), blog article drafts, or email campaigns (drafts).',
    '- Contact workflows: when a form is filled / contact created / tag added / deal stage changes / appointment booked → wait, branch, send email, send SMS, tag, create a task, assign.',
    '- A daily planner that can write landing pages and websites, email sequences, find new leads (with approval), book meetings, chase unpaid orders, thank buyers.',
    '- Commerce: products (imported from CSV), a public shop page, checkout via the customer\'s own payment processor.',
    '- It does NOT publish to social networks, does NOT connect to Shopify or WooCommerce directly (CSV export works), does NOT film or edit video, does NOT make phone calls.',
    '',
    'SOLUTIONS (choose 1, or 2 if the request clearly spans both; "custom" only if none fits):',
    ...solutions.map(s => `- ${s.key}: ${s.label} — ${s.blurb}`),
    '',
    'QUESTIONS the wizard can ask (fill "facts" ONLY for ones the request or material actually answers — never guess):',
    ...questions.map(q => `- ${q.id} (${q.type}): ${q.prompt}${q.options?.length ? ` [${q.options.map(o => o.value).join(' | ')}]` : ''}`),
    '',
    'EXISTING WORKFLOW TEMPLATES (for context on what is ready-made):',
    ...templates.map(t => `- ${t.key}: ${t.name}`),
    '',
    d.candidates?.length ? `A keyword match suggested: ${d.candidates.slice(0, 3).join(', ')}. Use your own judgement.` : '',
    portfolio ? `THE BUSINESS, ALREADY ON FILE: ${portfolio}` : '',
    '',
    'Return JSON with exactly these keys:',
    '{',
    '  "summary": "one sentence, second person, of what they want — e.g. You want one branded image post every weekday, prepared for Instagram and Facebook.",',
    '  "name": "a short project name (3-5 words), using the business name if known",',
    '  "objective": "one sentence: the outcome, measurable if they gave a number",',
    '  "solutionKeys": ["..."],',
    '  "match": "strong" | "partial" | "custom",',
    '  "facts": { "<questionId>": "value" or ["values"] },',
    '  "profile": {"companyName":"","description":"","audience":"","offer":"","industry":"","tone":"","locations":"","website":""},',
    '  "extraQuestions": [ {"id":"x_...","prompt":"...","type":"single"|"multi"|"text","options":[{"value":"","label":""}],"need":"required"|"optional"} ],',
    '  "customWorkflows": [ {"name":"...","purpose":"...","kind":"agent"|"contact","produces":"social"|"blog"|"email_campaign","source":"portfolio"|"website"|"web"|"rss"|"youtube","sourceUrl":"","sourcePrompt":"","cadence":"daily"|"weekdays"|"3-week"|"weekly"|"monthly","instruction":"for contact workflows: when X happens, do Y"} ],',
    '  "unsupported": ["things they asked for that the product cannot do, in plain words"]',
    '}',
    '',
    'Rules:',
    '- facts values must be one of the listed option values for single/multi/layout/theme/logo questions. For "business" use "website" if a website was given, "upload" if an attached file describes the business.',
    '- Design (theme, postLayout, pageLayout, emailLayout, blogLayout, designStyle): only when the request says how it should look ("luxury", "a sale post", "plain emails"). Otherwise leave them out — the customer is asked.',
    '- profile: fill ONLY from the material (website text, files, prompt). Empty strings when not stated. Never invent.',
    '- extraQuestions: only when match is "custom" or something essential is not covered by the listed questions. At most 3. Plain words. Prefer options with a sensible default.',
    '- customWorkflows: only for "custom" or for a clearly requested piece no solution covers. At most 3. Each must be something the product can do.',
    '- Everything in the customer\'s language and spelling.',
  ].filter(Boolean).join('\n');

  parts.unshift({ text: instruction });
  parts.push({ text: `THE CUSTOMER'S REQUEST:\n${prompt || '(no text — see the attachments)'}` });
  for (const t of texts) parts.push({ text: `Attached ${t.name || 'text'}:\n${t.text}` });
  pages.forEach((p, i) => {
    if (p.ok) parts.push({ text: `Web page ${urls[i]}${p.title ? ` — ${p.title}` : ''}:\n${p.text}` });
  });

  const ai = await askGeminiParts(key, parts, 0.2);
  if (!ai.ok) return fail(ai.error, 200, { code: 'ai_failed', sources });

  const raw = parseJson<Record<string, unknown>>(ai.text);
  if (!raw) return fail('The AI answered with something that could not be read.', 200, { code: 'ai_failed', sources });

  /* ── Checked against what was offered ── */
  const keys = (Array.isArray(raw.solutionKeys) ? raw.solutionKeys : []).map(String).filter(k => solutionKeys.has(k)).slice(0, 2);
  const facts: Record<string, string | string[]> = {};
  const rawFacts = (raw.facts && typeof raw.facts === 'object') ? raw.facts as Record<string, unknown> : {};
  for (const [id, v] of Object.entries(rawFacts)) {
    if (!questionIds.has(id)) continue;
    facts[id] = Array.isArray(v) ? v.map(x => clip(x, 200)).slice(0, 10) : clip(v, 400);
  }
  const p = (raw.profile && typeof raw.profile === 'object') ? raw.profile as Record<string, unknown> : {};
  const profile = Object.fromEntries(
    ['companyName', 'description', 'audience', 'offer', 'industry', 'tone', 'locations', 'website'].map(k => [k, clip(p[k], 1500)]),
  );
  const extraQuestions = (Array.isArray(raw.extraQuestions) ? raw.extraQuestions : []).slice(0, 3).map((q, i) => {
    const x = q as Record<string, unknown>;
    const type = ['single', 'multi', 'text'].includes(String(x.type)) ? String(x.type) : 'text';
    const options = (Array.isArray(x.options) ? x.options : []).slice(0, 8).map(o => {
      const oo = o as Record<string, unknown>;
      return { value: clip(oo.value, 60), label: clip(oo.label, 80) };
    }).filter(o => o.value && o.label);
    return {
      id: `x_${String(x.id ?? i).replace(/[^a-z0-9_]/gi, '').slice(0, 30) || i}`,
      prompt: clip(x.prompt, 200),
      type: type !== 'text' && !options.length ? 'text' : type,
      options,
      need: x.need === 'required' ? 'required' : 'optional',
    };
  }).filter(q => q.prompt);
  const customWorkflows = (Array.isArray(raw.customWorkflows) ? raw.customWorkflows : []).slice(0, 3).map(w => {
    const x = w as Record<string, unknown>;
    return {
      name: clip(x.name, 80), purpose: clip(x.purpose, 300),
      kind: x.kind === 'agent' ? 'agent' : 'contact',
      produces: clip(x.produces, 20), source: clip(x.source, 20), sourceUrl: clip(x.sourceUrl, 300),
      sourcePrompt: clip(x.sourcePrompt, 300), cadence: clip(x.cadence, 20), instruction: clip(x.instruction, 900),
    };
  }).filter(w => w.name || w.purpose);

  return json({
    success: true,
    understanding: {
      summary: clip(raw.summary, 400),
      name: clip(raw.name, 80),
      objective: clip(raw.objective, 400),
      solutionKeys: keys,
      match: ['strong', 'partial', 'custom'].includes(String(raw.match)) ? String(raw.match) : (keys.length ? 'partial' : 'custom'),
      facts,
      profile,
      extraQuestions,
      customWorkflows,
      unsupported: (Array.isArray(raw.unsupported) ? raw.unsupported : []).slice(0, 4).map(u => clip(u, 200)).filter(Boolean),
    },
    sources,
  });
}

/* ── refine ─────────────────────────────────────────────────────────────── */

/**
 * One sentence of feedback on a blueprint, as a change to its answers.
 *
 * The model is not handed the blueprint to rewrite. It is handed the answers
 * the blueprint was built from and asked which to change — so whatever it says,
 * the result is rebuilt by the same code that built the original, and cannot be
 * a workflow that code would not have made.
 */
async function refine(key: string, d: Req): Promise<Response> {
  const instruction = clip(d.instruction, 1000);
  if (instruction.length < 3) return fail('Say what you would like changed.');
  const state = d.state ?? {};
  if (JSON.stringify(state).length > 40_000) return fail('That blueprint is too large to edit here.');
  const cat = d.catalogue ?? {};
  const solutions = (cat.solutions ?? []).slice(0, 40);
  const questions = (cat.questions ?? []).slice(0, 120);

  const prompt = [
    'You edit a project blueprint in Protected Central AI Autopilot by changing the ANSWERS it was built from.',
    'The customer said:', `"${instruction}"`,
    '',
    'Current state (solutions, answers, workflows by key and name, project name, objective):',
    JSON.stringify(state),
    '',
    'Questions and their allowed values:',
    ...questions.map(q => `- ${q.id} (${q.type})${q.options?.length ? `: ${q.options.map(o => o.value).join(' | ')}` : ''}`),
    'Schedule questions (frequency, blogFrequency) also accept a single day: mon|tue|wed|thu|fri|sat|sun.',
    '',
    'Solutions that can be added or removed:',
    ...solutions.map(s => `- ${s.key}: ${s.label}`),
    '',
    'Return JSON:',
    '{"set":{"<questionId>": value},"addSolutions":[],"removeSolutions":[],"removeWorkflows":["<workflow key>"],"name":"","objective":"","reply":"one short sentence saying what you changed, or that you could not"}',
    'Only include what the customer asked to change. If the request is impossible with these options, change nothing and say so in reply.',
  ].join('\n');

  const ai = await askGeminiParts(key, [{ text: prompt }], 0.1);
  if (!ai.ok) return fail(ai.error, 200, { code: 'ai_failed' });
  const raw = parseJson<Record<string, unknown>>(ai.text);
  if (!raw) return fail('The AI answered with something that could not be read.', 200, { code: 'ai_failed' });

  const ids = new Set(questions.map(q => q.id));
  const set: Record<string, string | string[]> = {};
  for (const [id, v] of Object.entries((raw.set && typeof raw.set === 'object') ? raw.set as Record<string, unknown> : {})) {
    if (ids.has(id)) set[id] = Array.isArray(v) ? v.map(x => clip(x, 200)).slice(0, 10) : clip(v, 400);
  }
  const sk = new Set(solutions.map(s => s.key));
  const list = (v: unknown) => (Array.isArray(v) ? v : []).map(x => clip(x, 60)).filter(Boolean).slice(0, 6);
  return json({
    success: true,
    ops: {
      set,
      addSolutions: list(raw.addSolutions).filter(k => sk.has(k)),
      removeSolutions: list(raw.removeSolutions).filter(k => sk.has(k)),
      removeWorkflows: list(raw.removeWorkflows),
      name: clip(raw.name, 120),
      objective: clip(raw.objective, 600),
    },
    reply: clip(raw.reply, 300),
  });
}
