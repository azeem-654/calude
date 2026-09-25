/**
 * Starting a project: describe it, and Autopilot works out the rest.
 *
 * ── What this replaced, and why ──
 *
 * The wizard used to be six fixed screens — "What is going wrong?", "What kind
 * of business?", "Your sending setup", "Domains and mailboxes" — and every
 * project went through all of them. Somebody who wanted one image post a day
 * was sized for mailboxes; somebody building a shop was asked about reply
 * rates. The questions were right for cold email and wrong for nearly
 * everything else, because the shape was fixed. (docs/AUTOPILOT-NEW-PROJECT.md
 * has the full audit.)
 *
 * Now:
 *
 *   Describe      one box: type, speak, attach files, add a website — or start
 *                 from a ready-made solution card
 *   Understand    the AI reads all of it (routes/intake.ts); without the AI,
 *                 words are matched to the catalogue and the screen says so
 *   Questions     only what is still missing for *this* project, a topic at a
 *                 time, most with "Let AI decide"
 *   Blueprint     the whole project on one screen, editable by sentence or voice
 *   Connections   only the systems this project uses
 *   Review        the counts, then "Build My Autopilot"
 *   Build         every step a real operation, the bar their weighted share
 *
 * The judgement lives in `services/projectSolutions.ts` (the catalogue and its
 * questions) and `services/projectIntake.ts` (matching, extraction, the
 * blueprint). This file holds the conversation and nothing it could get wrong
 * on its own.
 *
 * ── What is kept from before ──
 *
 * Buying domains and mailboxes, for an email project that asked for them — it
 * still happens right after the project is saved, because a purchase has to
 * name something that exists. Nothing is written until "Build My Autopilot",
 * so abandoning halfway leaves nothing behind.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader, Sparkles, Hammer, Mail } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getSession } from '../../services/auth';
import { loadOnboarding } from '../../services/onboarding';
import { WizardBackdrop, WizardCta } from '../shared/WizardChrome';
import DigitalSetupStep from '../Setup/DigitalSetupStep';
import AutopilotBot from './AutopilotBot';
import { readPortfolioFromUrl, readLogoFromUrl, type Portfolio } from '../../services/projects';
import type { LogoChoice } from '../../services/designOptions';
import { shrinkLogo, logoFromFile } from './newProject/logoImage';
import { checkReadiness, type Readiness } from '../../services/projectReadiness';
import { understand, refine } from '../../services/intake';
import { QUESTIONS, TEMPLATE_COUNT, solutionByKey, CUSTOM, type Question } from '../../services/projectSolutions';
import {
  allQuestions, answersOf, applies, applyOps, buildBlueprint, extractKnown, initialState,
  parseEdit, screensOf, urlsIn, validValue, withDefaults, describeAnswer, DESIGN_QUESTION_IDS, designQuestions,
  type Blueprint, type IntakeState, type KnownSource, type WorkspaceFacts, type Attachment,
} from '../../services/projectIntake';
import Describe, { type DescribeValue } from './newProject/Describe';
import Understanding, { type Stage } from './newProject/Understanding';
import Questions from './newProject/Questions';
import { screenBlocker, profileGap, profileSource, type ProfileCheck } from './newProject/questionRules';
import BlueprintView, { EditPanel, type EditMessage } from './newProject/BlueprintView';
import Requirements from './newProject/Requirements';
import Review from './newProject/Review';
import Build from './newProject/Build';
import { runBuild, planSteps, type BuildResult, type BuildStep } from './newProject/buildRunner';
import './newProject/newProject.css';

type Phase = 'describe' | 'understand' | 'questions' | 'blueprint' | 'requirements' | 'review' | 'build' | 'domains';

const PHASES: { key: Phase[]; label: string }[] = [
  { key: ['describe'], label: 'Describe' },
  { key: ['understand', 'questions'], label: 'Questions' },
  { key: ['blueprint'], label: 'Blueprint' },
  { key: ['requirements', 'review'], label: 'Connections' },
  { key: ['build', 'domains'], label: 'Build' },
];

const EXAMPLES = [
  'Study my company website and create one social image post every weekday.',
  'I have 10,000 previous customers. Create an email reactivation campaign.',
  'I have 80 products with images and prices. Build an e-commerce store.',
  'Follow up with customers who miss appointments and try to rebook them.',
  'Create SEO blog content every week.',
];

const pause = (ms: number) => new Promise(r => window.setTimeout(r, ms));

export default function NewProject({ portfolios, onClose, onCreated }: {
  portfolios: Portfolio[];
  onClose: () => void;
  /** Called with the new project's id when the customer goes into it. */
  onCreated: (projectId?: string) => void;
}) {
  const { addNotification } = useApp();
  const [phase, setPhase] = useState<Phase>('describe');
  const [describe, setDescribe] = useState<DescribeValue>({ prompt: '', picked: '', files: [], links: [], voicePending: false });

  /* ── What the workspace already knows ── */
  const ws: WorkspaceFacts = useMemo(() => {
    const ob = loadOnboarding().profile;
    const real = ob?.companyName && ob.companyName !== 'My Business' && ob.description ? ob : null;
    return {
      portfolios: portfolios.map(p => ({
        id: p.id, name: p.name, website: String(p.profile?.website ?? ''), description: String(p.profile?.description ?? ''),
      })),
      workspace: real ? { companyName: real.companyName, description: real.description, website: real.website ?? '' } : null,
    };
  }, [portfolios]);

  /* ── Understanding ── */
  const [state, setState] = useState<IntakeState | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [understood, setUnderstood] = useState(false);
  /* The business as read from its site or profile document, then corrected by
     the customer. Read where it is given — see ProfileFound in Questions. */
  const [profile, setProfile] = useState<ProfileCheck>({ draft: null, readFor: '', reading: false, error: '' });
  const profileDraft = profile.draft;

  /* ── The logo ──
   *
   * Kept beside the answers rather than in them: the answer says *which* logo
   * ('site', 'upload', 'none', 'auto'); the picture itself is tens of
   * kilobytes and has no business in the snapshot the blueprint editor sends
   * to the AI. The build writes it onto the client's portfolio, which is where
   * a project's logo lives (ProjectLogo.tsx). */
  const [logo, setLogo] = useState<LogoChoice>({ answer: '', dataUrl: '', from: '' });
  const [logoFinding, setLogoFinding] = useState(false);
  const [logoError, setLogoError] = useState('');
  const logoLookedAt = useRef('');

  /* ── Questions ── */
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const [screenIdx, setScreenIdx] = useState(0);

  /* ── Blueprint editing ── */
  const [log, setLog] = useState<EditMessage[]>([]);
  const [editing, setEditing] = useState(false);
  const aiDown = useRef(false);

  /* ── Connections and build ── */
  const [ready, setReady] = useState<Readiness | null>(null);
  const [steps, setSteps] = useState<BuildStep[]>([]);
  const [say, setSay] = useState('');
  const [result, setResult] = useState<BuildResult | null>(null);
  const building = phase === 'build' && !result;

  const files = describe.files;
  const links = describe.links;

  /* ── The screens of questions, from the answers so far ── */
  const screens = useMemo(() => {
    if (!state) return [];
    return screensOf(allQuestions(state).filter(q => asked.has(q.id) && applies(q, state.known)));
  }, [state, asked]);
  const screen = screens[Math.min(screenIdx, Math.max(0, screens.length - 1))];

  /* ── The business, as the blueprint needs to name it ── */
  const company = useMemo(() => {
    if (!state) return '';
    const b = String(state.known.business?.value ?? '');
    if (b.startsWith('existing:')) return portfolios.find(p => p.id === b.slice(9))?.name ?? '';
    if (b === 'workspace') return ws.workspace?.companyName ?? '';
    if (b === 'manual') return String(state.known.bizName?.value ?? '');
    if (profileDraft?.companyName) return profileDraft.companyName;
    /* Until the site is read, its name is the best guess at the business's —
       "pikeplumbing.co.uk" names a project better than nothing does. */
    try {
      const host = new URL(String(state.known.website?.value ?? '')).hostname.replace(/^www\./, '').split('.')[0];
      return host ? host.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '';
    } catch { return ''; }
  }, [state, portfolios, ws, profileDraft]);

  const bp: Blueprint | null = useMemo(() => (state ? buildBlueprint(state, {
    companyName: company, website: String(state.known.website?.value ?? ''), files, links,
  }) : null), [state, company, files, links]);

  /* ── Understand ── */
  const runUnderstanding = useCallback(async () => {
    const prompt = describe.prompt.trim();
    const urls = [...new Set([...links.map(l => l.url), ...urlsIn(prompt)])];
    const base = initialState(prompt, describe.picked || undefined, ws, files, links);
    const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
    const docs = files.filter(f => f.kind !== 'image');
    const imgs = files.filter(f => f.kind === 'image');
    const init: Stage[] = [
      { key: 'read', label: 'Understanding your request', state: 'now' },
      ...(urls.length ? [{ key: 'site', label: `Reading ${urls.map(host).slice(0, 2).join(' and ')}`, state: 'now' as const }] : []),
      ...(files.length ? [{ key: 'files', label: `Looking at ${[docs.length ? `${docs.length} document${docs.length === 1 ? '' : 's'}` : '', imgs.length ? `${imgs.length} image${imgs.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')}`, state: 'now' as const }] : []),
      { key: 'solutions', label: 'Checking Protected Central solutions', state: 'todo' },
      { key: 'templates', label: 'Searching workflow templates', state: 'todo' },
      { key: 'known', label: 'Checking what Protected Central already knows', state: 'todo' },
      { key: 'missing', label: 'Working out what is still needed', state: 'todo' },
    ];
    let cur = init;
    const mark = (key: string, patch: Partial<Stage>) => { cur = cur.map(s => (s.key === key ? { ...s, ...patch } : s)); setStages(cur); };
    setStages(cur);
    setUnderstood(false);
    setState(null);
    setProfile({ draft: null, readFor: '', reading: false, error: '' });

    const single = ws.portfolios.length === 1 ? ws.portfolios[0].id : undefined;
    const r = await understand({ prompt, files, urls, portfolioId: single, candidates: base.solutionKeys });

    let st: IntakeState = base;
    let readProfile = '';
    if (r.ok && r.understanding) {
      const u = r.understanding;
      const aiKeys = u.solutionKeys.filter(k => solutionByKey(k));
      let keys = aiKeys.length ? aiKeys : base.solutionKeys;
      if (describe.picked && describe.picked !== CUSTOM) keys = [describe.picked, ...aiKeys.filter(k => k !== describe.picked)].slice(0, 2);
      const known = extractKnown(prompt, keys, ws, files, links);
      const askedIds = new Set(allQuestions({ solutionKeys: keys, extraQuestions: [] }).map(q => q.id));
      for (const [id, v] of Object.entries(u.facts ?? {})) {
        const q = QUESTIONS[id];
        if (!q || !askedIds.has(id) || known[id]) continue;
        const clean = validValue(q, v);
        if (clean !== null && !(id === 'business' && String(clean).startsWith('existing:'))) {
          known[id] = { value: clean, source: 'ai', note: 'understood from what you gave me' };
        }
      }
      const hasProfile = !!(u.profile?.companyName || u.profile?.description);
      if (hasProfile) {
        /* Remembered with what it was read from, so the business screen knows
           this site has already been read and does not read it twice. */
        setProfile({ draft: u.profile, readFor: urls.length ? urls[0] : docs.map(f => f.id).join(','), reading: false, error: '' });
        readProfile = u.profile.description || u.profile.companyName;
      }
      if (hasProfile && !known.business && askedIds.has('business')) {
        if (urls.length) {
          known.business = { value: 'website', source: 'link', note: `read from ${host(urls[0])}` };
          known.website = { value: urls[0], source: 'link', note: 'the website you gave' };
        } else if (docs.length) {
          known.business = { value: 'upload', source: 'file', note: `read from ${docs[0].name}` };
        }
      }
      const extra: Question[] = keys.includes(CUSTOM) || u.match === 'custom'
        ? u.extraQuestions.map(q => ({ ...q, group: 'custom' as const, type: q.type, need: q.need }))
        : [];
      st = {
        ...base,
        solutionKeys: keys,
        strength: describe.picked && describe.picked !== CUSTOM ? (keys.length > 1 ? 'partial' : 'strong') : (aiKeys.length ? u.match : base.strength),
        known,
        extraQuestions: extra,
        customWorkflows: u.customWorkflows ?? [],
        unsupported: u.unsupported ?? [],
        summary: u.summary || base.summary,
        name: u.name || '',
        objective: u.objective || '',
        understoodBy: 'ai',
      };
      mark('read', { state: 'done', detail: u.summary || undefined });
    } else {
      aiDown.current = r.noAi;
      mark('read', {
        state: 'warn',
        detail: r.noAi ? 'The AI is not available right now, so I matched your words to our solutions instead.' : `The AI could not be reached (${r.error}), so I matched your words instead.`,
      });
    }
    const siteSources = r.sources.filter(s => /^https?:/.test(s.what));
    const fileSources = r.sources.filter(s => !/^https?:/.test(s.what));
    if (urls.length) {
      const bad = siteSources.filter(s => !s.ok);
      mark('site', r.ok
        ? (bad.length ? { state: 'warn', detail: `Could not read ${bad.map(b => host(b.what)).join(', ')}: ${bad[0].error}` } : { state: 'done', detail: readProfile || undefined })
        : { state: 'warn', detail: 'Not read — it will be read again while the project is built.' });
    }
    if (files.length) {
      const bad = fileSources.filter(s => !s.ok);
      mark('files', r.ok
        ? (bad.length ? { state: 'warn', detail: `${bad.map(b => `${b.what} (${b.error})`).join(', ')}` } : { state: 'done' })
        : { state: 'warn', detail: 'Kept for the build — spreadsheets and images are used either way.' });
    }

    /* The four quick ones. Each is real work — a catalogue search, a template
       count, a look at the workspace, the question list — and each is shown
       finishing rather than all at once, so it can be read. */
    const names = st.solutionKeys.map(k => solutionByKey(k)?.label ?? k);
    mark('solutions', { state: 'now' }); await pause(220);
    mark('solutions', { state: 'done', detail: st.strength === 'custom' ? 'No ready-made solution fits exactly — this will be custom.' : names.join(' + ') });
    const draft = buildBlueprint(withDefaults(st), { companyName: '', website: '', files, links });
    const fromTemplates = draft.workflows.filter(w => w.origin === 'template').length;
    mark('templates', { state: 'now' }); await pause(220);
    mark('templates', {
      state: 'done',
      detail: fromTemplates
        ? `${fromTemplates} of ${TEMPLATE_COUNT} ready-made workflow templates fit — they will be personalised.`
        : draft.workflows.length ? 'None fit exactly, so the workflows will be built for this project.' : 'Nothing recurring needed so far.',
    });
    mark('known', { state: 'now' }); await pause(220);
    const knownCount = Object.keys(st.known).length;
    mark('known', {
      state: 'done',
      detail: `${knownCount} thing${knownCount === 1 ? '' : 's'} already known${ws.portfolios.length ? ` · ${ws.portfolios.length} business profile${ws.portfolios.length === 1 ? '' : 's'} on file` : ''}`,
    });
    mark('missing', { state: 'now' }); await pause(220);
    const open = allQuestions(st).filter(q => applies(q, st.known) && !st.known[q.id]);
    mark('missing', { state: 'done', detail: open.length ? `${open.length} question${open.length === 1 ? '' : 's'} left` : 'Nothing — enough to draw up the plan' });

    setState(st);
    setUnderstood(true);
  }, [describe, files, links, ws]);

  /* ── Answering ── */
  const answer = useCallback((id: string, value: string | string[] | null, source: KnownSource = 'you') => {
    setState(s => {
      if (!s) return s;
      const known = { ...s.known };
      if (value === null) delete known[id];
      else if (Array.isArray(value) ? !value.length : !String(value).trim() && source === 'you' && QUESTIONS[id]?.need === 'optional') {
        known[id] = { value, source: 'you', note: 'skipped' };
      } else known[id] = { value, source, note: source === 'default' ? 'chosen for you' : undefined };
      return { ...s, known };
    });
  }, []);

  /* ── Finding the logo ──
   *
   * Asked of the website as soon as there is one — while the site is being
   * read for the profile, not as a separate chore — so by the time the logo
   * question comes round it usually has an answer. Found, it becomes a known
   * answer ("taken from your website") and the question is not asked; not
   * found, the question is asked with the upload button first. */
  const findLogo = useCallback(async (url: string, quiet = false) => {
    const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } })();
    logoLookedAt.current = url;
    setLogoFinding(true); setLogoError('');
    const r = await readLogoFromUrl(url);
    let error = '';
    if (r.success && r.logo) {
      const small = await shrinkLogo(r.logo);
      if (small.ok) {
        setLogo(l => ({ ...l, dataUrl: small.dataUrl, from: host }));
        setState(s => (s && (!s.known.logo || s.known.logo.source !== 'you' || s.known.logo.value === 'site')
          ? { ...s, known: { ...s.known, logo: { value: 'site', source: 'link', note: `found on ${host}` } } } : s));
      } else error = small.error;
    } else error = r.error || 'No logo was found on that site.';
    setLogoFinding(false);
    if (error && !quiet) setLogoError(error);
  }, []);

  const logoFile = useCallback(async (f: File) => {
    setLogoError('');
    const r = await logoFromFile(f);
    if (!r.ok) { setLogoError(r.error); return; }
    setLogo(l => ({ ...l, dataUrl: r.dataUrl, from: '' }));
  }, []);

  /* The client already on file may have a logo: that one is theirs, and is
     what the screens show until somebody finds or uploads another. Derived,
     not copied into state, so switching client switches the logo with it. */
  const chosenBusiness = String(state?.known.business?.value ?? '');
  const onFile = chosenBusiness.startsWith('existing:')
    ? String(portfolios.find(p => p.id === chosenBusiness.slice(9))?.profile?.logoUrl ?? '') : '';
  const shownLogo: LogoChoice = logo.dataUrl || !onFile ? logo : { ...logo, dataUrl: onFile, from: '' };

  /* The website to look on: the one given, or the one the profile says. */
  const logoSite = String(state?.known.website?.value ?? '') || String(profile.draft?.website ?? '')
    || (chosenBusiness.startsWith('existing:') ? String(ws.portfolios.find(p => p.id === chosenBusiness.slice(9))?.website ?? '') : '')
    || (chosenBusiness === 'workspace' ? ws.workspace?.website ?? '' : '');
  useEffect(() => {
    if (!state || !/^https?:\/\/[^/\s]+\.[^/\s]+/.test(logoSite) || logoLookedAt.current === logoSite || shownLogo.dataUrl) return;
    if (!designQuestions(state).some(q => q.id === 'logo')) return;
    const t = window.setTimeout(() => void findLogo(logoSite, true), 400);
    return () => window.clearTimeout(t);
  }, [state, logoSite, shownLogo.dataUrl, findLogo]);

  /* ── Reading the business, where it is given ── */
  const readingFor = useRef('');
  const readProfileNow = useCallback(async () => {
    if (!state) return;
    const business = String(state.known.business?.value ?? '');
    const source = profileSource(state, files);
    if (!source || readingFor.current === source) return;
    readingFor.current = source;
    setProfile(p => ({ ...p, reading: true, error: '' }));
    let draft: Record<string, string> | null = null;
    let error = '';
    if (business === 'website') {
      const r = await readPortfolioFromUrl(source);
      if (r.success && r.profile) draft = { ...(r.profile as Record<string, string>), website: source };
      else error = `Could not read that site${r.error ? ` — ${r.error}` : ''}. Check the address, or type the details in.`;
    } else {
      const docs = files.filter(f => f.kind === 'pdf' || f.kind === 'text');
      const u = await understand({ prompt: 'Describe the business in the attached document.', files: docs, urls: [], candidates: [] });
      if (u.ok && u.understanding?.profile) draft = { ...u.understanding.profile };
      else error = u.noAi ? 'The document could not be read without the AI. Type the details in instead.' : `Could not read the document${u.error ? ` — ${u.error}` : ''}.`;
    }
    readingFor.current = '';
    /* A reading that comes back is kept even with gaps: the empty fields are
       exactly what the screen then asks for. */
    setProfile({ draft, readFor: draft ? source : '', reading: false, error });
  }, [state, files]);

  const editProfile = useCallback((patch: Record<string, string>) => {
    if (!state) return;
    const source = profileSource(state, files);
    setProfile(p => ({ ...p, draft: { ...(p.draft ?? {}), ...patch }, readFor: source, error: '' }));
  }, [state, files]);

  /* Read the site once its address has settled — not on every keystroke, and
     not again once it has been read. */
  const source = state ? profileSource(state, files) : '';
  useEffect(() => {
    if (phase !== 'questions' || !source || profile.reading || profile.readFor === source || profile.error) return;
    if (String(state?.known.business?.value ?? '') === 'website' && !/^https?:\/\/[^/\s]+\.[^/\s]+/.test(source)) return;
    const t = window.setTimeout(() => void readProfileNow(), 900);
    return () => window.clearTimeout(t);
  }, [phase, source, profile.reading, profile.readFor, profile.error, readProfileNow, state]);

  /* A new address is a new question: forget the last one's failure. */
  useEffect(() => { setProfile(p => (p.error ? { ...p, error: '' } : p)); }, [source]);

  const gap = state ? profileGap(state, files, profile) : '';

  /* The business questions, asked again. Used when the reading came back
     short, and from Review if something about the business is still missing. */
  const businessIds = (st: IntakeState) => allQuestions(st).filter(q => q.group === 'business').map(q => q.id);

  const startQuestions = () => {
    if (!state) return;
    const open = allQuestions(state).filter(q => !state.known[q.id]).map(q => q.id);
    /* Every design question goes on the list, answered or not relevant yet:
       whether it is shown is decided screen by screen from the answers, and a
       project gains its posts (and so a post layout) from an answer given on
       an earlier screen. Known ones are filtered out when the screen is drawn. */
    for (const id of DESIGN_QUESTION_IDS) if (!state.known[id] && !open.includes(id)) open.push(id);
    /* Known is not the same as enough. A site that was read but did not say
       what the business is called still needs the business screen. */
    if (profileGap(state, files, profile)) open.unshift(...businessIds(state).filter(id => !open.includes(id)));
    setAsked(new Set(open));
    setScreenIdx(0);
    const first = screensOf(allQuestions(state).filter(q => open.includes(q.id) && applies(q, state.known)));
    setPhase(first.length ? 'questions' : 'blueprint');
  };

  /* ── Editing the blueprint ── */
  const edit = async (text: string) => {
    if (!state || !bp) return;
    setLog(l => [...l, { who: 'you', text }]);
    setEditing(true);
    let applied = false;
    if (!aiDown.current) {
      const snapshot = {
        solutionKeys: state.solutionKeys,
        answers: answersOf(withDefaults(state).known),
        workflows: bp.workflows.map(w => ({ key: w.key, name: w.name })),
        name: bp.name, objective: bp.objective,
      };
      const r = await refine({ instruction: text, state: snapshot });
      if (r.noAi) aiDown.current = true;
      const ops = r.ops;
      const changes = !!ops && (Object.keys(ops.set ?? {}).length || ops.addSolutions?.length || ops.removeSolutions?.length || ops.removeWorkflows?.length || ops.name || ops.objective);
      if (r.ok && ops && changes) {
        setState(s => (s ? applyOps(s, ops) : s));
        setLog(l => [...l, { who: 'ai', text: r.reply || 'Done — the blueprint is updated.' }]);
        applied = true;
      } else if (r.ok && r.reply && !parseEdit(text, state, bp)) {
        setLog(l => [...l, { who: 'bad', text: r.reply }]);
        setEditing(false);
        return;
      }
    }
    if (!applied) {
      const parsed = parseEdit(text, state, bp);
      if (parsed) {
        setState(s => (s ? applyOps(s, parsed.ops) : s));
        setLog(l => [...l, { who: 'ai', text: `Done: ${parsed.said}.` }]);
      } else {
        setLog(l => [...l, {
          who: 'bad',
          text: aiDown.current
            ? 'I could not work out what to change without the AI. Try something like "three posts a week", "remove LinkedIn", "add a blog every Friday" or "make approval mandatory".'
            : 'I could not work out what to change. Try saying it another way.',
        }]);
      }
    }
    setEditing(false);
  };

  const suggestions = useMemo(() => {
    if (!bp) return [];
    const out: string[] = [];
    const social = bp.workflows.find(w => w.channel === 'social');
    if (social) {
      out.push('Make it three posts a week');
      const plats = (social.nodes ?? []).map(n => n.config.platform).filter(Boolean);
      out.push(plats.includes('linkedin') ? 'Remove LinkedIn' : 'Add LinkedIn');
      if (!bp.workflows.some(w => w.channel === 'blog')) out.push('Add a blog every Friday');
      out.push('Create two image versions');
    }
    if (bp.design.some(d => d.label === 'Social posts')) out.push('Make the posts minimal with luxury colours');
    if (bp.channels.includes('shop')) out.push('Change the store theme to luxury');
    if (bp.channels.includes('email') && bp.outputs.some(o => /sequence/.test(o))) out.push('Make it a 3-email sequence');
    out.push('Make approval mandatory');
    return [...new Set(out)].slice(0, 5);
  }, [bp]);

  /* ── Connections: asked when the step is reached, not before ── */
  useEffect(() => {
    if (phase !== 'requirements' || ready || !bp) return;
    if (!bp.requirements.some(r => r === 'mailbox' || r === 'sms' || r === 'payments')) return;
    let alive = true;
    void checkReadiness().then(r => { if (alive) setReady(r); });
    return () => { alive = false; };
  }, [phase, ready, bp]);

  /* ── Build ── */
  const build = async () => {
    if (!state || !bp) return;
    const full = withDefaults(state);
    const input = {
      bp, state: full, files, portfolios, profileDraft, workspace: ws.workspace ?? null,
      logo: { ...shownLogo, answer: String(full.known.logo?.value ?? '') }, logoSite,
    };
    setPhase('build');
    setSteps(planSteps(input));
    setSay('I’m getting started.');
    const r = await runBuild(input, (st, line) => { setSteps(st); if (line) setSay(line); });
    setResult(r);
    if (r.fatal) addNotification(r.fatal, 'error');
    else addNotification(`"${bp.name}" is built.`, 'success');
  };

  const buyDomains = !!result?.projectId && String(state?.known.mailbox?.value ?? '') === 'buy';

  /* ── The footer ── */
  const blocker = (() => {
    if (phase === 'describe') {
      if (describe.voicePending) return 'Check the transcript first';
      if (describe.prompt.trim().length < 8 && !files.length) return describe.picked ? 'Say a little about what you want' : 'Describe what you want, or pick a solution';
      return '';
    }
    if (phase === 'understand') return understood ? '' : 'Understanding…';
    if (phase === 'questions' && screen && state) return screenBlocker(screen, state, files, profile);
    return '';
  })();

  const next = () => {
    if (blocker) return;
    if (phase === 'describe') { setPhase('understand'); void runUnderstanding(); return; }
    if (phase === 'understand') { startQuestions(); return; }
    if (phase === 'questions') {
      if (screenIdx + 1 < screens.length) setScreenIdx(i => i + 1);
      else setPhase('blueprint');
      return;
    }
    if (phase === 'blueprint') { setPhase('requirements'); return; }
    if (phase === 'requirements') { setPhase('review'); return; }
    if (phase === 'review') {
      /* Checked once more before anything is written. Rather than a disabled
         button, it takes them to the screen where the answer goes. */
      if (gap && state) {
        const ids = businessIds(state);
        const nextAsked = new Set([...asked, ...ids]);
        setAsked(nextAsked);
        const list = screensOf(allQuestions(state).filter(q => nextAsked.has(q.id) && applies(q, state.known)));
        setScreenIdx(Math.max(0, list.findIndex(sc => sc.questions.some(q => q.id === 'business'))));
        setPhase('questions');
        return;
      }
      void build();
    }
  };

  const back = () => {
    if (phase === 'understand') setPhase('describe');
    else if (phase === 'questions') { if (screenIdx > 0) setScreenIdx(i => i - 1); else setPhase('understand'); }
    else if (phase === 'blueprint') { if (screens.length) { setScreenIdx(screens.length - 1); setPhase('questions'); } else setPhase('understand'); }
    else if (phase === 'requirements') setPhase('blueprint');
    else if (phase === 'review') setPhase('requirements');
  };

  const close = () => {
    if (building) return;
    if (result?.projectId) { onCreated(result.projectId); return; }
    onClose();
  };

  const ctaLabel = (() => {
    if (blocker) return blocker;
    if (phase === 'describe') return 'Continue';
    if (phase === 'understand') return screens.length || (state && allQuestions(state).some(q => applies(q, state.known) && !state.known[q.id])) ? 'Answer a few questions' : 'See the blueprint';
    if (phase === 'questions') return screenIdx + 1 < screens.length ? 'Next' : 'See the blueprint';
    if (phase === 'blueprint') return 'Looks good — continue';
    if (phase === 'requirements') return 'Review';
    if (phase === 'review') return gap ? `First: ${gap.replace(/…$/, '').toLowerCase()}` : 'Build My Autopilot';
    return 'Continue';
  })();

  const phaseIndex = PHASES.findIndex(p => p.key.includes(phase));

  /* ── The companion pane ── */
  const side = (
    <aside className="np-side" aria-label="Autopilot">
      <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
        <AutopilotBot size={46} awake busy={phase === 'understand' && !understood} />
        <span style={{ minWidth: 0 }}>
          <b style={{ display: 'block', fontSize: 14, color: '#17191c' }}>Autopilot</b>
          <span style={{ display: 'block', fontSize: 12, color: '#6b7280', lineHeight: 1.45 }}>
            {phase === 'describe' ? 'Tell me the result. I’ll work out how.'
              : phase === 'understand' ? (understood ? 'Here’s what I took from that.' : 'Reading everything you gave me…')
                : phase === 'questions' ? 'Only what I still need.'
                  : phase === 'blueprint' ? 'Tell me anything to change.'
                    : phase === 'build' ? (result ? 'Done. It keeps running without this open.' : 'Building it now — every tick is a real record.')
                      : 'Almost there.'}
          </span>
        </span>
      </div>

      {phase === 'describe' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: '#6b7280', letterSpacing: '0.05em' }}>A GOOD REQUEST SAYS</span>
          {['The result you want', 'How often, if it repeats', 'Where it should end up', 'Anything I should read — attach it'].map(t => (
            <span key={t} style={{ fontSize: 13, color: '#334155' }}>• {t}</span>
          ))}
          <span style={{ fontSize: 11.5, fontWeight: 800, color: '#6b7280', letterSpacing: '0.05em', marginTop: 8 }}>TRY ONE</span>
          {EXAMPLES.map(e => (
            <button key={e} type="button" className="np-tool" style={{ textAlign: 'left', borderRadius: 12, fontSize: 12.5, fontWeight: 500 }}
              onClick={() => setDescribe(d => ({ ...d, prompt: e, voicePending: false }))}>{e}</button>
          ))}
        </div>
      )}

      {state && (phase === 'questions' || phase === 'requirements' || phase === 'review') && (
        <div style={{ display: 'grid', gap: 7 }}>
          <span style={{ fontSize: 13, color: '#17191c', lineHeight: 1.5, fontWeight: 600 }}>{state.summary}</span>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: '#6b7280', letterSpacing: '0.05em', marginTop: 6 }}>WHAT I KNOW SO FAR</span>
          {Object.entries(state.known).filter(([id]) => QUESTIONS[id]).slice(0, 12).map(([id, k]) => {
            const q = QUESTIONS[id];
            const text = describeAnswer(q, k.value, portfolios);
            if (!text) return null;
            return (
              <span key={id} style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.45 }}>
                <b style={{ color: '#17191c' }}>{text}</b> <span style={{ color: '#8b93a3' }}>— {q.prompt.replace(/\?$/, '').toLowerCase()}</span>
              </span>
            );
          })}
        </div>
      )}

      {phase === 'build' && result?.projectId && bp && (bp.manual.length > 0 || bp.setup.some(s => s.by === 'you')) && (
        <div style={{ display: 'grid', gap: 7 }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: '#6b7280', letterSpacing: '0.05em' }}>WHAT IS YOURS TO DO</span>
          {[...bp.setup.filter(s => s.by === 'you').map(s => s.label), ...bp.manual].map(t => (
            <span key={t} style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.5 }}>• {t}</span>
          ))}
        </div>
      )}

      {phase === 'blueprint' && bp && (
        <EditPanel log={log} busy={editing} suggestions={suggestions} onSend={t => void edit(t)} />
      )}
    </aside>
  );

  return (
    <WizardBackdrop label="New project" onClose={close}>
      <div className="wz-card np-card" onKeyDown={e => { if (e.key === 'Escape') close(); }}>
        <header className="np-head">
          <button type="button" onClick={close} disabled={building} style={{
            background: 'none', border: 0, padding: '4px 2px', cursor: building ? 'default' : 'pointer',
            color: building ? '#c3c9d4' : '#6b7280', fontSize: 14.5, fontFamily: 'inherit', fontWeight: 500, flexShrink: 0,
          }}>
            {result?.projectId ? 'Done' : 'Cancel'}
          </button>
          <nav className="np-phases" aria-label="Progress">
            {PHASES.map((p, i) => (
              <span key={p.label} className="np-phase" data-state={i === phaseIndex ? 'now' : i < phaseIndex ? 'done' : 'todo'}
                aria-current={i === phaseIndex ? 'step' : undefined}>
                <span className="np-phase-dot" /> <span className="np-phase-label">{p.label}</span>
              </span>
            ))}
          </nav>
          <span style={{ width: 46, flexShrink: 0 }} aria-hidden />
        </header>

        <div className="np-body">
          <main className="np-main">
            <div key={`${phase}-${screenIdx}`} className="np-rise">
              {phase === 'describe' && (
                <Describe value={describe} onChange={setDescribe} onError={m => addNotification(m, 'error')} />
              )}
              {phase === 'understand' && (
                <Understanding
                  stages={stages} state={state} finished={understood} portfolios={ws.portfolios}
                  questionCount={state ? allQuestions(state).filter(q => applies(q, state.known) && !state.known[q.id]).length : 0}
                  onChangeSolution={keys => setState(s => {
                    if (!s) return s;
                    const known = { ...extractKnown(s.prompt, keys, ws, files, links) };
                    for (const [id, k] of Object.entries(s.known)) if (!known[id]) known[id] = k;
                    return {
                      ...s, solutionKeys: keys, strength: keys[0] === CUSTOM ? 'custom' : 'strong', known,
                      summary: keys[0] === CUSTOM ? 'Built from scratch around what you described.' : `You chose ${solutionByKey(keys[0])?.label}.`,
                    };
                  })}
                />
              )}
              {phase === 'questions' && state && screen && (
                <Questions
                  design={{ logo: { logo: shownLogo, website: logoSite, finding: logoFinding, error: logoError }, onFind: u => void findLogo(u), onFile: f => void logoFile(f) }}
                  screen={screen} state={state} ws={ws} files={files} answer={answer}
                  profile={profile} onProfile={editProfile} onReadProfile={() => { setProfile(p => ({ ...p, error: '' })); void readProfileNow(); }}
                  onFiles={(atts: Attachment[]) => setDescribe(d => ({ ...d, files: [...d.files, ...atts] }))}
                  onLink={url => setDescribe(d => ({ ...d, links: [...d.links.filter(l => l.url !== url), { url, role: 'reference' }] }))}
                  index={screenIdx} total={screens.length}
                />
              )}
              {phase === 'blueprint' && bp && (
                <>
                  <BlueprintView bp={bp} onRename={name => setState(s => (s ? { ...s, name } : s))} />
                  <div className="np-only-narrow" style={{ marginTop: 20, padding: 16, borderRadius: 18, background: '#f7f6ff', border: '1px solid #e2ddff' }}>
                    <EditPanel log={log} busy={editing} suggestions={suggestions} onSend={t => void edit(t)} />
                  </div>
                </>
              )}
              {phase === 'requirements' && bp && (
                <Requirements ids={bp.requirements} ready={ready} mailboxPlan={String(state?.known.mailbox?.value ?? '')} />
              )}
              {phase === 'review' && bp && <Review bp={bp} />}
              {phase === 'build' && <Build steps={steps} say={say} result={result} reach={(bp?.workflows ?? []).filter(w => w.sends).map(w => ({ name: w.name, nodes: w.nodes }))} />}
              {phase === 'domains' && result?.projectId && (
                <DigitalSetupStep
                  companyName={company}
                  contactEmail={getSession()?.user?.email ?? ''}
                  projectId={result.projectId}
                  onOrder={() => { addNotification('Order placed. Watch it build.', 'success'); onCreated(result.projectId); }}
                />
              )}
            </div>
          </main>
          {side}
        </div>

        <footer className="np-foot">
          {['understand', 'questions', 'blueprint', 'requirements', 'review'].includes(phase) && (
            <button type="button" className="np-back" onClick={back} style={{ marginRight: 'auto' }}>
              <ArrowLeft size={15} /> <span className="np-back-label">Back</span>
            </button>
          )}
          {phase === 'build' ? (
            result ? (
              <>
                {buyDomains && (
                  <button type="button" className="np-back" onClick={() => setPhase('domains')}>
                    <Mail size={15} /> Choose domains and mailboxes
                  </button>
                )}
                {result.projectId && (
                  <WizardCta onClick={() => onCreated(result.projectId)} label="Open the project" icon={<ArrowRight size={15} />} />
                )}
                {!result.projectId && <WizardCta onClick={() => { setResult(null); setPhase('review'); }} label="Back to the review" icon={<ArrowLeft size={15} />} />}
              </>
            ) : (
              <WizardCta onClick={() => undefined} disabled label="Building…" icon={<Loader size={15} className="spin" />} />
            )
          ) : phase === 'domains' ? (
            <button type="button" className="np-back" onClick={() => onCreated(result?.projectId)}>Skip for now — open the project</button>
          ) : (
            <WizardCta
              onClick={next}
              disabled={!!blocker}
              title={blocker || undefined}
              label={ctaLabel}
              icon={phase === 'understand' && !understood ? <Loader size={15} className="spin" />
                : phase === 'review' ? <Hammer size={15} />
                  : phase === 'describe' ? <Sparkles size={15} /> : <ArrowRight size={15} />}
            />
          )}
        </footer>
      </div>
    </WizardBackdrop>
  );
}
