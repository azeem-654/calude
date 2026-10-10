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
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Building2, Check, Copy, ExternalLink, Image as ImageIcon, Loader, Phone, Plus, Trash2, Upload, Video, X,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { getSession } from '../../../services/auth';
import { customerBusinessName } from '../../../services/tenancy';
import {
  bookingSlugFor, checkBookingSlug, clearBookingMedia, publishBookingConfig, uploadBookingMedia, type BookingMediaKind,
} from '../../../services/booking';
import { allZones, offsetLabel, slugProblem, slugify, videoEmbedOf } from '../../../services/bookingTime';
import BookingCard from '../../Scheduling/BookingCard';
import './bookingSetup.css';

const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']] as const;
type DayKey = typeof DAYS[number][0];
const LENGTHS = [15, 30, 45, 60, 90];
const PLACES = [
  { value: 'Video call', icon: Video },
  { value: 'Phone call', icon: Phone },
  { value: 'In person', icon: Building2 },
];
const MAX_BULLETS = 8;
const VIDEO_MAX_MB = 25;

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/**
 * A picture made small enough to keep, in the browser: at most `side` pixels
 * a side, a JPEG for a photo and a PNG for a logo (logos are often cut out,
 * and JPEG has no transparency). The server checks the result by its bytes
 * whatever this does; this is only so a 12-megapixel phone photo is not sent.
 */
async function shrink(file: File, side: number, type: 'image/jpeg' | 'image/png'): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('unreadable'));
      i.src = url;
    });
    let w = img.naturalWidth, h = img.naturalHeight;
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

export default function BookingSetup({ business, autoPublish = true }: { business?: string; autoPublish?: boolean }) {
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
  const upload = async (kind: BookingMediaKind, file: File | undefined) => {
    if (!file) return;
    if (!signedIn) { setM(kind, { error: 'Sign in to upload — the file is kept on the server, not in this browser.' }); return; }
    setM(kind, { busy: true });
    let blob: Blob = file;
    if (kind === 'video') {
      if (file.size > VIDEO_MAX_MB * 1048576) {
        setM(kind, { error: `That clip is ${(file.size / 1048576).toFixed(1)} MB. Keep it under ${VIDEO_MAX_MB} MB — about a minute — or paste a YouTube, Vimeo or Loom link instead.` });
        return;
      }
    } else {
      try { blob = await shrink(file, kind === 'logo' ? 600 : 512, kind === 'logo' ? 'image/png' : 'image/jpeg'); }
      catch { setM(kind, { error: 'That picture could not be read here — use a JPEG or PNG.' }); return; }
    }
    const r = await uploadBookingMedia(kind, blob);
    if (!r.ok) { setM(kind, { error: r.error }); return; }
    setM(kind, {});
    updateSchedule({ [URL_KEY[kind]]: r.url } as Partial<typeof schedule>);
  };
  const remove = async (kind: BookingMediaKind) => {
    setM(kind, { busy: true });
    updateSchedule({ [URL_KEY[kind]]: '' } as Partial<typeof schedule>);
    const ok = signedIn ? await clearBookingMedia(kind) : true;
    setM(kind, ok ? {} : { error: 'Taken off the page, but the file could not be deleted just now.' });
  };
  const [videoMode, setVideoMode] = useState<'link' | 'upload'>(schedule.videoFileUrl ? 'upload' : 'link');
  const embed = videoEmbedOf(schedule.videoUrl);

  /* ── Words ── */
  const bullets = schedule.bullets ?? [];
  const setBullet = (i: number, v: string) => updateSchedule({ bullets: bullets.map((b, j) => (j === i ? v : b)) });

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

  const name = business || customerBusinessName() || '';
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

          <div className="bks-group">
            <h4>What it says</h4>
            <label className="bks-field">
              <span>Title</span>
              <input className="bks-input" data-field="booking.title" value={schedule.title} maxLength={120}
                onChange={e => updateSchedule({ title: e.target.value })} placeholder="Intro call" />
            </label>
            <label className="bks-field">
              <span>Who they meet</span>
              <input className="bks-input" data-field="booking.hostName" value={schedule.hostName ?? ''} maxLength={80}
                onChange={e => updateSchedule({ hostName: e.target.value })} placeholder={name || 'Your name'} />
            </label>
            <label className="bks-field">
              <span>Description</span>
              <textarea className="bks-input" data-field="booking.description" rows={3} maxLength={1500} value={schedule.description}
                onChange={e => updateSchedule({ description: e.target.value })} placeholder="A quick call to see whether we are a fit." />
            </label>
            <div className="bks-field" data-field="booking.bullets">
              <span className="bks-label">What they get <small style={{ fontWeight: 500, color: '#6b7280' }}>— one point a line</small></span>
              <div className="bks-bullets">
                {bullets.map((b, i) => (
                  <div key={i} className="bks-bullet">
                    <input className="bks-input" value={b} maxLength={160} aria-label={`Point ${i + 1}`}
                      onChange={e => setBullet(i, e.target.value)} placeholder="A plan for your next 90 days" />
                    <button type="button" className="bks-icon" aria-label={`Remove point ${i + 1}`}
                      onClick={() => updateSchedule({ bullets: bullets.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
                  </div>
                ))}
                <button type="button" className="bks-add" disabled={bullets.length >= MAX_BULLETS}
                  onClick={() => updateSchedule({ bullets: [...bullets, ''] })}><Plus size={13} /> Add a point</button>
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
            {pub === 'live' && <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#5b46e5', display: 'inline-flex', gap: 4, alignItems: 'center' }}>Open the live page <ExternalLink size={11} /></a>}
          </div>
          <div className="bkp" data-preview="" data-noinvert="">
            <BookingCard cfg={previewCfg} businessName={name} busy={noBusy} preview />
          </div>
          <figcaption>The page your visitors get — times shown in the zone of whoever opens it.</figcaption>
        </figure>
      </div>
    </section>
  );
}
