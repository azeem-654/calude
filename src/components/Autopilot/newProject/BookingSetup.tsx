/**
 * The booking page, made where it is chosen.
 *
 * Picking "Protected Central calendar and booking pages" in the AI Autopilot
 * wizard shows this: the page's address, what it says (title, who, a
 * description, the points a visitor gets), the host's photo, the logo, a short
 * video, and the hours — beside the page itself. The preview is not a picture
 * of a booking page: it is Scheduling/BookingCard, the component /book/<slug>
 * renders, fed this schedule — so the times in it are the slots these hours
 * make, in the zone of whoever is looking.
 *
 * It edits the same schedule the Scheduling screen does (`crm_schedule`) and
 * publishes with the same call (`publishBookingConfig`), as it is edited, so
 * the two can never disagree and `{{bookingLink}}` in an email has a page to
 * point at by the time the project is built. The Scheduling screen shows this
 * editor too, on its Booking page tab, with its own publishing switched off
 * (`autoPublish={false}`) because that screen already publishes every change.
 *
 * Pictures and the clip are uploaded to /api/booking-media.php, which decides
 * what they are from their bytes. A clip needs the VIDEO bucket; without it
 * the upload is refused by name and a YouTube, Vimeo or Loom link — which
 * always works — is offered instead.
 *
 * ── Filled in from the website ──
 *
 * "Fill it in from my website" asks the server to read the site
 * (routes/booking.ts `autofill`): the logo, a photo the site itself labels as
 * a person, a video link that is really on the page, and — when the AI is
 * there — the title, the host, the tagline, the description, the points with
 * their icons, what to discuss and the tags. It runs once by itself when the
 * editor opens on an empty page with a known website, filling only what is
 * empty; pressed, it replaces what it found. Pictures come back as data and
 * go through the same shrink and upload as a picture chosen by hand, so the
 * page shows only this workspace's own files. When the AI was not used the
 * panel says why and what was filled without it.
 *
 * ── The preview ──
 *
 * The real card, at a desktop width (1180px) scaled to the pane, or at a
 * phone's 390px — the layout is chosen by the card's own width (container
 * queries), so the pane would otherwise only ever show the phone layout.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Building2, Check, Copy, ExternalLink, Image as ImageIcon, Loader, Monitor, Phone, Plus, Smartphone, Sparkles, Trash2, Upload, Video, X,
} from 'lucide-react';
import type { ScheduleAvailability } from '../../../types';
import { useApp } from '../../../context/AppContext';
import { getSession } from '../../../services/auth';
import { customerBusinessName } from '../../../services/tenancy';
import {
  autofillBookingPage, bookingSlugFor, checkBookingSlug, clearBookingMedia, publishBookingConfig, uploadBookingMedia,
  type BookingAutofill, type BookingMediaKind,
} from '../../../services/booking';
import { allZones, offsetLabel, slugProblem, slugify, videoEmbedOf } from '../../../services/bookingTime';
import {
  ACCENT_SWATCHES, BOOKING_ICONS, cleanHex, DEFAULT_ACCENT, MAX_DISCUSS, MAX_POINTS, MAX_TAGS, POINTS_TITLE, type BookingIcon, type BookingPoint,
} from '../../../services/bookingContent';
import { loadOnboarding } from '../../../services/onboarding';
import BookingCard, { accentStyle } from '../../Scheduling/BookingCard';
import { BOOKING_ICON, PointIcon } from '../../Scheduling/bookingIcons';
import './bookingSetup.css';

const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']] as const;
type DayKey = typeof DAYS[number][0];
const LENGTHS = [15, 30, 45, 60, 90];
const PLACES = [
  { value: 'Video call', icon: Video },
  { value: 'Phone call', icon: Phone },
  { value: 'In person', icon: Building2 },
];
const VIDEO_MAX_MB = 25;
/* The width the desktop preview is laid out at, then scaled to the pane. */
const DESKTOP_W = 1180;
const PHONE_W = 390;
/* The schedule's titles nobody chose: a page still carrying one has no title of its own yet. */
const DEFAULT_TITLES = ['', '30 minute meeting', 'meeting'];
const DEFAULT_DESCRIPTIONS = ['', 'schedule a meeting with me.'];
const isDefault = (v: string | undefined, list: string[]) => list.includes((v || '').trim().toLowerCase());
/* Per workspace (the tenant patch prefixes crm_ keys): which site the editor already read by itself. */
const AUTOFILL_KEY = 'crm_booking_autofilled';

/** A data: URL back into bytes, without fetch (which a strict connect-src could refuse). */
function dataUrlBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;,]+);base64,(.*)$/.exec(dataUrl);
  if (!m) return null;
  try {
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch { return null; }
}

const hostOf = (u: string) => { try { return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, ''); } catch { return u; } };

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/**
 * A picture made small enough to keep, in the browser: at most `side` pixels
 * a side, a JPEG for a photo and a PNG for a logo (logos are often cut out,
 * and JPEG has no transparency). The server checks the result by its bytes
 * whatever this does; this is only so a 12-megapixel phone photo is not sent.
 */
async function shrink(file: Blob, side: number, type: 'image/jpeg' | 'image/png'): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('unreadable'));
      i.src = url;
    });
    let w = img.naturalWidth, h = img.naturalHeight;
    /* An SVG logo with no width of its own has none to report; draw it square. */
    if ((!w || !h) && file.type === 'image/svg+xml') { w = side; h = side; }
    if (!w || !h) throw new Error('unreadable');
    for (let s = side; ; s = Math.round(s * 0.8)) {
      const k = Math.min(1, s / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
      const c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('unreadable');
      if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch); }
      ctx.drawImage(img, 0, 0, cw, ch);
      const blob = await new Promise<Blob | null>(r => c.toBlob(r, type, 0.86));
      if (!blob) throw new Error('unreadable');
      if (blob.size <= 380_000 || s < 160) return blob;
      w = cw; h = ch;
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function BookingSetup({ business, website, autoPublish = true }: {
  business?: string;
  /** The business's website, when the screen showing this knows it; else the workspace profile's. */
  website?: string;
  autoPublish?: boolean;
}) {
  const { schedule, updateSchedule } = useApp();
  const signedIn = !!getSession()?.token;
  const [pub, setPub] = useState<'idle' | 'saving' | 'live' | 'refused' | 'local'>('idle');
  const [pubError, setPubError] = useState<{ message: string; field?: string }>({ message: '' });
  const timer = useRef<number | undefined>(undefined);

  /* A page needs its own address before anything else: the shared default 'meeting' belongs to whoever published first. */
  useEffect(() => {
    if (!schedule.slug || schedule.slug === 'meeting') updateSchedule({ slug: bookingSlugFor(schedule, business) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule.slug]);

  /* Published as it is edited, a moment after the last change — the link in the emails points at this page. */
  useEffect(() => {
    if (!autoPublish) return;
    const token = getSession()?.token;
    if (!token) { setPub('local'); return; }
    if (!schedule.slug || schedule.slug === 'meeting') return;
    setPub('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const r = await publishBookingConfig(token, schedule);
      setPubError({ message: r.error ?? '', field: r.field });
      setPub(r.ok ? 'live' : 'refused');
    }, 900);
    return () => window.clearTimeout(timer.current);
  }, [schedule, autoPublish]);

  /* ── The address ──
     Typed into a draft and checked with the server before it is used: an
     address another workspace holds would otherwise be saved, then refused
     on publish, and the page would be stuck unpublished. */
  const [slugDraft, setSlugDraft] = useState(schedule.slug === 'meeting' ? '' : schedule.slug);
  const [slugState, setSlugState] = useState<{ s: 'idle' | 'checking' | 'ok' | 'bad' | 'unknown'; msg?: string }>({ s: 'idle' });
  const slugTimer = useRef<number | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    /* Kept in step when the schedule's slug changes elsewhere (the default above, the Scheduling screen). */
    if (schedule.slug && schedule.slug !== 'meeting' && slugState.s !== 'checking' && slugState.s !== 'bad') setSlugDraft(schedule.slug);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule.slug]);
  const typeSlug = (raw: string) => {
    const v = raw.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 64);
    setSlugDraft(v);
    window.clearTimeout(slugTimer.current);
    const why = slugProblem(v.replace(/-+$/, ''));
    if (why) { setSlugState({ s: 'bad', msg: why }); return; }
    setSlugState({ s: 'checking' });
    slugTimer.current = window.setTimeout(async () => {
      const clean = v.replace(/-+$/, '');
      const token = getSession()?.token;
      if (!token) { setSlugState({ s: 'unknown', msg: 'Saved here — it is checked when you are signed in.' }); updateSchedule({ slug: clean }); return; }
      const r = await checkBookingSlug(token, clean);
      if (!r) { setSlugState({ s: 'unknown', msg: 'Could not check it just now — it is checked again when the page is saved.' }); updateSchedule({ slug: clean }); return; }
      if (!r.available) { setSlugState({ s: 'bad', msg: r.reason || 'That address is taken.' }); return; }
      setSlugState({ s: 'ok' });
      if (clean !== schedule.slug) updateSchedule({ slug: clean });
    }, 450);
  };
  const slugRefused = pub === 'refused' && pubError.field === 'booking.slug';

  /* ── Pictures and the clip ── */
  const [media, setMedia] = useState<Record<BookingMediaKind, { busy?: boolean; error?: string }>>({ photo: {}, logo: {}, video: {} });
  const setM = (k: BookingMediaKind, v: { busy?: boolean; error?: string }) => setMedia(m => ({ ...m, [k]: v }));
  const URL_KEY: Record<BookingMediaKind, 'photoUrl' | 'logoUrl' | 'videoFileUrl'> = { photo: 'photoUrl', logo: 'logoUrl', video: 'videoFileUrl' };
  /** A picture or clip onto the server; true when it is on the page. */
  const uploadBlob = async (kind: BookingMediaKind, file: Blob): Promise<boolean> => {
    if (!signedIn) { setM(kind, { error: 'Sign in to upload — the file is kept on the server, not in this browser.' }); return false; }
    setM(kind, { busy: true });
    let blob: Blob = file;
    if (kind === 'video') {
      if (file.size > VIDEO_MAX_MB * 1048576) {
        setM(kind, { error: `That clip is ${(file.size / 1048576).toFixed(1)} MB. Keep it under ${VIDEO_MAX_MB} MB — about a minute — or paste a YouTube, Vimeo or Loom link instead.` });
        return false;
      }
    } else {
      try { blob = await shrink(file, kind === 'logo' ? 600 : 512, kind === 'logo' ? 'image/png' : 'image/jpeg'); }
      catch { setM(kind, { error: 'That picture could not be read here — use a JPEG or PNG.' }); return false; }
    }
    const r = await uploadBookingMedia(kind, blob);
    if (!r.ok) { setM(kind, { error: r.error }); return false; }
    setM(kind, {});
    updateSchedule({ [URL_KEY[kind]]: r.url } as Partial<typeof schedule>);
    return true;
  };
  const upload = async (kind: BookingMediaKind, file: File | undefined) => { if (file) await uploadBlob(kind, file); };
  const remove = async (kind: BookingMediaKind) => {
    setM(kind, { busy: true });
    updateSchedule({ [URL_KEY[kind]]: '' } as Partial<typeof schedule>);
    const ok = signedIn ? await clearBookingMedia(kind) : true;
    setM(kind, ok ? {} : { error: 'Taken off the page, but the file could not be deleted just now.' });
  };
  const [videoMode, setVideoMode] = useState<'link' | 'upload'>(schedule.videoFileUrl ? 'upload' : 'link');
  const embed = videoEmbedOf(schedule.videoUrl);

  /* ── Words ── */
  /* The points as the editor holds them: empty lines kept while typing (the
     page drops them), a page from before icons read as ticks. Writing points
     clears the old plain lines, or removing the last point would bring them back. */
  const points: BookingPoint[] = schedule.points ?? (schedule.bullets ?? []).map(b => ({ icon: 'check' as BookingIcon, title: b, detail: '' }));
  const setPoints = (next: BookingPoint[]) => updateSchedule({ points: next, bullets: [] });
  const setPoint = (i: number, patch: Partial<BookingPoint>) => setPoints(points.map((pt, j) => (j === i ? { ...pt, ...patch } : pt)));
  const [iconFor, setIconFor] = useState<number | null>(null);
  const discuss = schedule.discuss ?? [];
  const tags = schedule.tags ?? [];
  const [tagDraft, setTagDraft] = useState('');
  const addTag = (raw: string) => {
    const t = raw.replace(/^#+/, '').trim().slice(0, 28);
    if (!t || tags.length >= MAX_TAGS || tags.some(x => x.toLowerCase() === t.toLowerCase())) { setTagDraft(''); return; }
    updateSchedule({ tags: [...tags, t] });
    setTagDraft('');
  };

  /* ── The page's colour ── */
  const brandColour = useMemo(() => cleanHex(loadOnboarding().profile?.brandColor), []);
  const accent = cleanHex(schedule.accent) || DEFAULT_ACCENT;
  const swatches = useMemo(() => [...new Set([...(brandColour ? [brandColour] : []), ...ACCENT_SWATCHES])], [brandColour]);

  /* ── Filled in from the website ── */
  const name = business || customerBusinessName() || '';
  const knownSite = (website || String(loadOnboarding().profile?.website ?? '')).trim();
  const [site, setSite] = useState(knownSite);
  useEffect(() => {
    /* A website learnt after the editor opened (the wizard reads it as it goes). */
    if (knownSite && !site) setSite(knownSite);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownSite]);
  const [fill, setFill] = useState<{ s: 'idle' | 'reading' | 'done' | 'error'; error?: string; field?: string; result?: BookingAutofill; filled?: string[]; auto?: boolean }>({ s: 'idle' });

  const runFill = async (mode: 'auto' | 'manual', from = site) => {
    const target = from.trim();
    if (!target) { setFill({ s: 'error', error: 'Give your website address first.', field: 'booking.website' }); return; }
    if (!signedIn) { setFill({ s: 'error', error: 'Sign in to read your website — it is read by the server, not this browser.', field: 'booking.website' }); return; }
    setFill({ s: 'reading', auto: mode === 'auto' });
    const r = await autofillBookingPage(target, name);
    if (!r.ok) { setFill({ s: 'error', error: r.error, field: r.field, auto: mode === 'auto' }); return; }
    const f = r.result.fill;
    const filled: string[] = [];
    const patch: Partial<ScheduleAvailability> = {};
    /* Read by itself, it only fills what is empty; pressed, it replaces what it found. */
    const may = (empty: boolean) => mode === 'manual' || empty;
    const put = <K extends keyof ScheduleAvailability>(k: K, v: ScheduleAvailability[K] | undefined, empty: boolean, label: string) => {
      const has = Array.isArray(v) ? v.length > 0 : !!v;
      if (has && may(empty)) { patch[k] = v as ScheduleAvailability[K]; filled.push(label); }
    };
    put('title', f.title, isDefault(schedule.title, DEFAULT_TITLES), 'title');
    put('hostName', f.hostName, !schedule.hostName?.trim(), 'your name');
    put('hostRole', f.hostRole, !schedule.hostRole?.trim(), 'role');
    put('tagline', f.tagline, !schedule.tagline?.trim(), 'tagline');
    put('description', f.description, isDefault(schedule.description, DEFAULT_DESCRIPTIONS), 'description');
    if (f.points?.length && may(!points.some(pt => pt.title.trim()))) {
      patch.points = f.points; patch.bullets = [];
      filled.push(`${f.points.length} points with icons`);
    }
    put('discuss', f.discuss, !discuss.some(d => d.trim()), `${f.discuss?.length ?? 0} things to discuss`);
    put('tags', f.tags, !tags.length, 'topic tags');
    put('videoUrl', f.videoUrl, !schedule.videoUrl?.trim() && !schedule.videoFileUrl, 'video link');
    if (Object.keys(patch).length) updateSchedule(patch);
    if (patch.videoUrl) setVideoMode('link');

    /* Pictures through the same shrink and upload as one chosen by hand. */
    const res = r.result;
    if (res.logo && may(!schedule.logoUrl)) {
      const b = dataUrlBlob(res.logo.dataUrl);
      if (b && await uploadBlob('logo', b)) filled.push('logo');
    }
    if (res.photo && may(!schedule.photoUrl)) {
      const b = dataUrlBlob(res.photo.dataUrl);
      if (b && await uploadBlob('photo', b)) filled.push(`photo (${res.photo.what})`);
    }
    setFill({ s: 'done', result: res, filled, auto: mode === 'auto' });
  };

  /* Once by itself: an empty page, a known website, signed in — and not a
     site this workspace's editor has already read (a page the owner emptied
     on purpose is not refilled every time it opens). */
  useEffect(() => {
    if (!signedIn || !knownSite) return;
    const empty = isDefault(schedule.description, DEFAULT_DESCRIPTIONS) && !schedule.tagline?.trim() && !points.some(pt => pt.title.trim())
      && !schedule.logoUrl && !schedule.photoUrl;
    if (!empty) return;
    let done = '';
    try { done = localStorage.getItem(AUTOFILL_KEY) ?? ''; } catch { /* private window: run, it is harmless */ }
    if (done === knownSite) return;
    try { localStorage.setItem(AUTOFILL_KEY, knownSite); } catch { /* see above */ }
    void runFill('auto', knownSite);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownSite, signedIn]);

  /* ── The preview's width ── */
  const [view, setView] = useState<'desktop' | 'phone'>('desktop');
  const frameRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, height: 0, left: 0 });
  useLayoutEffect(() => {
    const frame = frameRef.current, page = pageRef.current;
    if (!frame || !page) return;
    const W = view === 'desktop' ? DESKTOP_W : PHONE_W;
    const measure = () => {
      const avail = frame.clientWidth;
      const scale = Math.min(1, avail / W);
      setFit({ scale, height: Math.ceil(page.offsetHeight * scale), left: Math.max(0, (avail - W * scale) / 2) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame); ro.observe(page);
    return () => ro.disconnect();
  }, [view]);

  /* ── Hours ── */
  const hours = schedule.weekly.mon.enabled ? schedule.weekly.mon : (Object.values(schedule.weekly).find(d => d.enabled) ?? schedule.weekly.mon);
  const setDays = (key: DayKey) => updateSchedule({ weekly: { ...schedule.weekly, [key]: { ...schedule.weekly[key], enabled: !schedule.weekly[key].enabled } } });
  /* One set of hours for every open day — the basics. Different hours per day are on the Scheduling screen. */
  const setHours = (patch: { from?: string; to?: string }) => {
    const weekly = { ...schedule.weekly };
    for (const [k] of DAYS) weekly[k] = { ...weekly[k], ...patch };
    updateSchedule({ weekly });
  };
  const zones = useMemo(() => allZones(schedule.timezone), [schedule.timezone]);

  const base = `${window.location.origin}${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/book/`;
  const url = `${base}${schedule.slug}`;
  const noDays = !DAYS.some(([k]) => schedule.weekly[k].enabled);
  const badHours = toMin(hours.to) - toMin(hours.from) < schedule.duration;
  const previewCfg = useMemo(() => ({ ...schedule, businessName: name }), [schedule, name]);
  const noBusy = useMemo(() => [], []);

  const mediaBox = (kind: 'photo' | 'logo', label: string, hint: string) => {
    const src = kind === 'photo' ? schedule.photoUrl : schedule.logoUrl;
    const st = media[kind];
    return (
      <div className="bks-drop" data-field={`booking.${kind}`}>
        {src ? <img src={src} alt="" data-logo={kind === 'logo' ? '1' : undefined} /> : <span className="bks-drop-ph"><ImageIcon size={20} /></span>}
        <b>{label}</b>
        <div className="bks-btns">
          <label className="bks-btn" style={st.busy ? { opacity: .5, pointerEvents: 'none' } : undefined}>
            {st.busy ? <Loader size={12} className="spin" /> : <Upload size={12} />} {src ? 'Replace' : 'Upload'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden aria-label={`Upload ${label.toLowerCase()}`}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void upload(kind, f); }} />
          </label>
          {src && <button type="button" className="bks-btn" data-danger="" onClick={() => void remove(kind)} aria-label={`Remove ${label.toLowerCase()}`}><X size={12} /></button>}
        </div>
        {st.error ? <small className="bks-bad">{st.error}</small> : <small className="bks-hint">{hint}</small>}
      </div>
    );
  };

  return (
    <section className="bks" aria-label="Your booking page">
      <div className="bks-wrap">
        <div className="bks-form">
          <div className="bks-head">
            <b>Your booking page</b>
            <span>Make it yours here — the page beside this is the real one, and it changes as you type.</span>
          </div>

          <div className="bks-group">
            <h4>Address</h4>
            <div className="bks-field">
              <span className="bks-label">Booking link</span>
              <div className="bks-url" data-state={slugState.s === 'bad' || slugRefused ? 'bad' : undefined}>
                <span title={base}><bdi>{base.replace(/^https?:\/\//, '')}</bdi></span>
                <input data-field="booking.slug" value={slugDraft} maxLength={64} aria-label="Booking link"
                  aria-invalid={slugState.s === 'bad' || slugRefused}
                  onChange={e => typeSlug(e.target.value)}
                  onBlur={() => { if (slugDraft !== slugify(slugDraft) && slugDraft) typeSlug(slugify(slugDraft)); }}
                  placeholder="your-name" />
                <button type="button" title="Copy the link" aria-label="Copy the link"
                  onClick={() => { void navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => {}); }}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              {slugState.s === 'checking' && <small className="bks-hint"><Loader size={11} className="spin" /> Checking…</small>}
              {slugState.s === 'ok' && <small className="bks-good"><Check size={12} /> Available — this is your link.</small>}
              {slugState.s === 'bad' && <small className="bks-bad"><AlertTriangle size={12} /> {slugState.msg}</small>}
              {slugState.s === 'unknown' && <small className="bks-warn"><AlertTriangle size={12} /> {slugState.msg}</small>}
              {slugRefused && slugState.s !== 'bad' && <small className="bks-bad"><AlertTriangle size={12} /> {pubError.message}</small>}
              {slugState.s === 'idle' && !slugRefused && <small className="bks-hint">Links already sent stop working if you change it.</small>}
            </div>
          </div>

          <div className="bks-group bks-fill" data-state={fill.s}>
            <h4>From your website</h4>
            <div className="bks-fill-row">
              <input className="bks-input" data-field="booking.website" value={site} maxLength={300} aria-label="Your website"
                aria-invalid={fill.s === 'error' && fill.field === 'booking.website'}
                onChange={e => setSite(e.target.value)} placeholder="yourbusiness.com"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void runFill('manual'); } }} />
              <button type="button" className="bks-fill-btn" disabled={!site.trim() || fill.s === 'reading'} onClick={() => void runFill('manual')}>
                {fill.s === 'reading' ? <Loader size={14} className="spin" /> : <Sparkles size={14} />} Fill it in from my website
              </button>
            </div>
            {fill.s === 'idle' && <small className="bks-hint">Reads your site for your logo, a photo of you, a video, and — with AI — the words, points and icons. You can change all of it.</small>}
            {fill.s === 'reading' && <small className="bks-hint" role="status"><Loader size={11} className="spin" /> Reading {hostOf(site)}{fill.auto ? ' to fill in your page' : ''}…</small>}
            {fill.s === 'error' && <small className="bks-bad" role="alert"><AlertTriangle size={12} /> {fill.error}</small>}
            {fill.s === 'done' && fill.result && (
              <div className="bks-fill-done" role="status" data-testid="booking-autofill">
                {fill.filled && fill.filled.length > 0
                  ? <small className="bks-good"><Check size={12} /> {fill.auto ? 'Filled in' : 'Filled'} from {hostOf(fill.result.from)}: {fill.filled.join(', ')}.</small>
                  : <small className="bks-warn"><AlertTriangle size={12} /> Nothing new was found on {hostOf(fill.result.from)}{fill.auto ? '' : ' to fill in'}.</small>}
                {!fill.result.ai.used && <small className="bks-warn" data-testid="booking-autofill-noai"><AlertTriangle size={12} /> AI not used: {fill.result.ai.why}</small>}
                {fill.result.notes.map((n, i) => <small key={i} className="bks-hint">{n}</small>)}
                <small className="bks-hint">Everything below stays yours to change.</small>
              </div>
            )}
          </div>

          <div className="bks-group">
            <h4>What it says</h4>
            <label className="bks-field">
              <span>Title</span>
              <input className="bks-input" data-field="booking.title" value={schedule.title} maxLength={120}
                onChange={e => updateSchedule({ title: e.target.value })} placeholder="Intro call" />
            </label>
            <div className="bks-two">
              <label className="bks-field">
                <span>Who they meet</span>
                <input className="bks-input" data-field="booking.hostName" value={schedule.hostName ?? ''} maxLength={80}
                  onChange={e => updateSchedule({ hostName: e.target.value })} placeholder={name || 'Your name'} />
              </label>
              <label className="bks-field">
                <span>Their role</span>
                <input className="bks-input" data-field="booking.hostRole" value={schedule.hostRole ?? ''} maxLength={60}
                  onChange={e => updateSchedule({ hostRole: e.target.value })} placeholder="Founder" />
              </label>
            </div>
            <label className="bks-field">
              <span>Tagline <small className="bks-soft">— under your business name</small></span>
              <input className="bks-input" data-field="booking.tagline" value={schedule.tagline ?? ''} maxLength={120}
                onChange={e => updateSchedule({ tagline: e.target.value })} placeholder="Helping local businesses grow" />
            </label>
            <label className="bks-field">
              <span>Description</span>
              <textarea className="bks-input" data-field="booking.description" rows={3} maxLength={1500} value={schedule.description}
                onChange={e => updateSchedule({ description: e.target.value })} placeholder="A quick call to see whether we are a fit." />
            </label>
            <div className="bks-field" data-field="booking.tags">
              <span className="bks-label">Topics <small className="bks-soft">— up to {MAX_TAGS}, shown as pills</small></span>
              <div className="bks-tags">
                {tags.map((t, i) => (
                  <span key={i} className="bks-tag">{t}
                    <button type="button" aria-label={`Remove topic ${t}`} onClick={() => updateSchedule({ tags: tags.filter((_, j) => j !== i) })}><X size={11} /></button>
                  </span>
                ))}
                {tags.length < MAX_TAGS && (
                  <input className="bks-tag-input" value={tagDraft} maxLength={28} aria-label="Add a topic" placeholder="Add a topic"
                    onChange={e => { const v = e.target.value; if (/[,;]$/.test(v)) addTag(v.slice(0, -1)); else setTagDraft(v); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagDraft); } }}
                    onBlur={() => { if (tagDraft.trim()) addTag(tagDraft); }} />
                )}
              </div>
            </div>
          </div>

          <div className="bks-group">
            <h4>What they get</h4>
            <label className="bks-field">
              <span>Heading</span>
              <input className="bks-input" data-field="booking.pointsTitle" value={schedule.pointsTitle ?? ''} maxLength={80}
                onChange={e => updateSchedule({ pointsTitle: e.target.value })} placeholder={POINTS_TITLE} />
            </label>
            <div className="bks-field" data-field="booking.points">
              <span className="bks-label">Points <small className="bks-soft">— an icon, a bold line and a small line each</small></span>
              <div className="bks-bullets">
                {points.map((pt, i) => (
                  <div key={i} className="bks-point">
                    <div className="bks-point-icon">
                      <button type="button" className="bks-icon-pick" aria-label={`Icon for point ${i + 1}: ${BOOKING_ICON[pt.icon]?.label ?? 'Tick'}`}
                        aria-expanded={iconFor === i} onClick={() => setIconFor(iconFor === i ? null : i)} style={accentStyle({ accent })}>
                        <PointIcon icon={pt.icon} size={17} />
                      </button>
                      {iconFor === i && (
                        <div className="bks-icon-grid" role="group" aria-label={`Choose an icon for point ${i + 1}`}>
                          {BOOKING_ICONS.map(k => (
                            <button key={k} type="button" aria-label={BOOKING_ICON[k].label} title={BOOKING_ICON[k].label} aria-pressed={pt.icon === k}
                              onClick={() => { setPoint(i, { icon: k }); setIconFor(null); }}>
                              <PointIcon icon={k} size={16} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="bks-point-words">
                      <input className="bks-input" value={pt.title} maxLength={90} aria-label={`Point ${i + 1}`}
                        onChange={e => setPoint(i, { title: e.target.value })} placeholder="Get more booked jobs" />
                      <input className="bks-input bks-input-small" value={pt.detail} maxLength={160} aria-label={`Point ${i + 1} detail`}
                        onChange={e => setPoint(i, { detail: e.target.value })} placeholder="A short line under it (optional)" />
                    </div>
                    <button type="button" className="bks-icon" aria-label={`Remove point ${i + 1}`}
                      onClick={() => { setIconFor(null); setPoints(points.filter((_, j) => j !== i)); }}><Trash2 size={14} /></button>
                  </div>
                ))}
                <button type="button" className="bks-add" disabled={points.length >= MAX_POINTS}
                  onClick={() => setPoints([...points, { icon: 'check', title: '', detail: '' }])}><Plus size={13} /> Add a point</button>
              </div>
            </div>
            <div className="bks-field" data-field="booking.discuss">
              <span className="bks-label">What we can discuss <small className="bks-soft">— ticked, beside the video</small></span>
              <div className="bks-bullets">
                {discuss.map((d, i) => (
                  <div key={i} className="bks-bullet">
                    <input className="bks-input" value={d} maxLength={100} aria-label={`Topic to discuss ${i + 1}`}
                      onChange={e => updateSchedule({ discuss: discuss.map((x, j) => (j === i ? e.target.value : x)) })} placeholder="Your marketing plan" />
                    <button type="button" className="bks-icon" aria-label={`Remove topic to discuss ${i + 1}`}
                      onClick={() => updateSchedule({ discuss: discuss.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
                  </div>
                ))}
                <button type="button" className="bks-add" disabled={discuss.length >= MAX_DISCUSS}
                  onClick={() => updateSchedule({ discuss: [...discuss, ''] })}><Plus size={13} /> Add something to discuss</button>
              </div>
            </div>
          </div>

          <div className="bks-group">
            <h4>Colour</h4>
            <div className="bks-field" data-field="booking.accent">
              <span className="bks-label">The page's colour <small className="bks-soft">— the header band, the chosen day and time</small></span>
              <div className="bks-swatches" role="group" aria-label="Page colour">
                {swatches.map(c => (
                  <button key={c} type="button" className="bks-swatch" style={{ background: c }} aria-pressed={accent === c}
                    aria-label={c === brandColour ? `Your brand colour ${c}` : `Colour ${c}`} title={c === brandColour ? 'Your brand colour' : c}
                    onClick={() => updateSchedule({ accent: c })}>{accent === c && <Check size={13} color={c === '#ffffff' ? '#000' : '#fff'} />}</button>
                ))}
                <label className="bks-swatch bks-swatch-pick" title="Pick any colour" data-on={!swatches.includes(accent) ? '1' : undefined} style={!swatches.includes(accent) ? { background: accent } : undefined}>
                  <input type="color" value={accent} aria-label="Pick any colour" onChange={e => updateSchedule({ accent: cleanHex(e.target.value) })} />
                  {swatches.includes(accent) && <Plus size={13} />}
                </label>
              </div>
            </div>
          </div>

          <div className="bks-group">
            <h4>Photo, logo and video</h4>
            <div className="bks-media">
              {mediaBox('photo', 'Your photo', 'A face people will meet. JPEG or PNG.')}
              {mediaBox('logo', 'Logo', 'Shown at the top. PNG keeps a see-through background.')}
            </div>
            <div className="bks-field" data-field="booking.video">
              <span className="bks-label">A short video <small style={{ fontWeight: 500, color: '#6b7280' }}>— optional</small></span>
              <div className="bks-tabs" role="group" aria-label="Video">
                <button type="button" aria-pressed={videoMode === 'link'} onClick={() => setVideoMode('link')}>Paste a link</button>
                <button type="button" aria-pressed={videoMode === 'upload'} onClick={() => setVideoMode('upload')}>Upload a clip</button>
              </div>
              {videoMode === 'link' ? (
                <>
                  <input className="bks-input" data-field="booking.videoUrl" value={schedule.videoUrl ?? ''} maxLength={400}
                    aria-invalid={!!schedule.videoUrl && !embed}
                    onChange={e => updateSchedule({ videoUrl: e.target.value })} placeholder="A YouTube, Vimeo or Loom link" />
                  {schedule.videoUrl && !embed
                    ? <small className="bks-bad"><AlertTriangle size={12} /> Not a YouTube, Vimeo or Loom link, so it will not show on the page.</small>
                    : embed ? <small className="bks-good"><Check size={12} /> {embed.provider === 'youtube' ? 'YouTube' : embed.provider === 'vimeo' ? 'Vimeo' : 'Loom'} video — it plays on the page.</small>
                      : <small className="bks-hint">YouTube, Vimeo or Loom.</small>}
                  {schedule.videoFileUrl && <small className="bks-hint">An uploaded clip is set and shows instead of a link — remove it under “Upload a clip”.</small>}
                </>
              ) : (
                <>
                  <div className="bks-btns" style={{ justifyContent: 'flex-start' }}>
                    <label className="bks-btn" style={media.video.busy ? { opacity: .5, pointerEvents: 'none' } : undefined}>
                      {media.video.busy ? <Loader size={12} className="spin" /> : <Upload size={12} />} {media.video.busy ? 'Uploading…' : schedule.videoFileUrl ? 'Replace clip' : 'Choose a clip'}
                      <input type="file" accept="video/mp4,video/webm,video/quicktime" hidden aria-label="Upload a clip"
                        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void upload('video', f); }} />
                    </label>
                    {schedule.videoFileUrl && <button type="button" className="bks-btn" data-danger="" onClick={() => void remove('video')}><X size={12} /> Remove clip</button>}
                  </div>
                  {media.video.error
                    ? <small className="bks-bad"><AlertTriangle size={12} /> {media.video.error}</small>
                    : <small className="bks-hint">{schedule.videoFileUrl ? 'Your clip plays on the page.' : `MP4, MOV or WebM, up to ${VIDEO_MAX_MB} MB — about a minute.`}</small>}
                </>
              )}
            </div>
          </div>

          <div className="bks-group">
            <h4>When and where</h4>
            <div className="bks-field">
              <span className="bks-label">How long</span>
              <div className="bks-opts">
                {LENGTHS.map(m => (
                  <button key={m} type="button" className="bks-opt" aria-pressed={schedule.duration === m} onClick={() => updateSchedule({ duration: m })}>{m} min</button>
                ))}
              </div>
            </div>
            <div className="bks-field">
              <span className="bks-label">Where</span>
              <div className="bks-opts">
                {PLACES.map(pl => (
                  <button key={pl.value} type="button" className="bks-opt" aria-pressed={(schedule.location || 'Video call').toLowerCase() === pl.value.toLowerCase()} onClick={() => updateSchedule({ location: pl.value })}>
                    <pl.icon size={12} /> {pl.value}
                  </button>
                ))}
              </div>
            </div>
            <div className="bks-field" data-field="booking.days">
              <span className="bks-label">Days it takes bookings</span>
              <div className="bks-opts">
                {DAYS.map(([k, l]) => (
                  <button key={k} type="button" className="bks-opt" aria-pressed={schedule.weekly[k].enabled} onClick={() => setDays(k)}>{l}</button>
                ))}
              </div>
              {noDays && <small className="bks-warn"><AlertTriangle size={12} /> No days open — nobody could book.</small>}
            </div>
            <div className="bks-field">
              <span className="bks-label">Hours</span>
              <div className="bks-hours">
                <input type="time" className="bks-input" data-field="booking.from" value={hours.from} onChange={e => setHours({ from: e.target.value })} aria-label="From" />
                <span style={{ color: '#6b7280', fontSize: 13 }}>to</span>
                <input type="time" className="bks-input" data-field="booking.to" value={hours.to} onChange={e => setHours({ to: e.target.value })} aria-label="To" />
              </div>
              {badHours && <small className="bks-warn"><AlertTriangle size={12} /> Those hours are shorter than one {schedule.duration}-minute meeting.</small>}
            </div>
            <label className="bks-field">
              <span>Your time zone</span>
              <select className="bks-input" data-field="booking.timezone" value={schedule.timezone} onChange={e => updateSchedule({ timezone: e.target.value })}>
                {zones.map(z => <option key={z} value={z}>{z.replace(/_/g, ' ')} ({offsetLabel(Date.now(), z)})</option>)}
              </select>
              <small className="bks-hint">Your hours are in this zone. Visitors anywhere see them in their own time.</small>
            </label>
          </div>

          {autoPublish && (
            <span className="bks-status" data-state={pub}>
              {pub === 'saving' && <><Loader size={12} className="spin" /> Saving…</>}
              {pub === 'live' && <><Check size={12} /> Live at <a href={url} target="_blank" rel="noopener noreferrer">{url.replace(/^https?:\/\//, '')} <ExternalLink size={11} /></a></>}
              {pub === 'refused' && <><AlertTriangle size={12} /> Not published: {pubError.message || 'the server refused it.'}</>}
              {pub === 'local' && 'Saved here — it is published when you are signed in.'}
            </span>
          )}
          <span className="bks-hint">Different hours per day, meeting types and reminders are on the Scheduling screen.</span>
        </div>

        <figure className="bks-preview" aria-label="Preview of the booking page">
          <div className="bks-preview-bar">
            <b>Preview</b>
            <span className="bks-tabs" role="group" aria-label="Preview width">
              <button type="button" aria-pressed={view === 'desktop'} onClick={() => setView('desktop')}><Monitor size={12} /> Desktop</button>
              <button type="button" aria-pressed={view === 'phone'} onClick={() => setView('phone')}><Smartphone size={12} /> Phone</button>
            </span>
            {pub === 'live' && <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#5b46e5', display: 'inline-flex', gap: 4, alignItems: 'center' }}>Open the live page <ExternalLink size={11} /></a>}
          </div>
          <div className="bks-frame" ref={frameRef} data-view={view} style={{ height: fit.height || undefined }}>
            <div ref={pageRef} className="bkp" data-preview="" data-noinvert=""
              style={{ ...accentStyle(schedule), width: view === 'desktop' ? DESKTOP_W : PHONE_W, transform: `translateX(${fit.left}px) scale(${fit.scale})`, transformOrigin: 'top left' }}>
              <BookingCard cfg={previewCfg} businessName={name} busy={noBusy} preview />
            </div>
          </div>
          <figcaption>The page your visitors get{view === 'desktop' && fit.scale < 1 ? `, shown at ${Math.round(fit.scale * 100)}%` : ''} — times shown in the zone of whoever opens it.</figcaption>
        </figure>
      </div>
    </section>
  );
}
