/**
 * The client's own mark, on their project.
 *
 * ── Why it belongs to the client and not the project ──
 *
 * An agency running two pushes for the same plumber should upload their logo
 * once. It is stored on the portfolio — the record that *is* the client — so a
 * second project for them arrives already wearing it, and changing it changes
 * both. A copy per project would be two files to keep in step, and one of them
 * would always be last year's.
 *
 * ── Why a data URL, and why it is capped ──
 *
 * There is no file store in this deployment, and inventing one for a logo would
 * be a bucket, a signing route and a lifecycle policy for something measured in
 * kilobytes. The image goes inline with the rest of the client's profile, which
 * is also what makes it available to anything already reading that profile
 * without a second fetch.
 *
 * The cap is the price of that trade: the profile travels with every board
 * load, so a four-megabyte photograph makes the whole screen slow rather than
 * just this corner. 400KB is generous for a logo and small enough to be
 * invisible — and the message says the number, because "too large" tells
 * somebody nothing about what to do next.
 */
import { useRef, useState } from 'react';
import { ImagePlus, Loader, X } from 'lucide-react';
import { savePortfolio, type Portfolio } from '../../services/projects';

const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

/** 400KB. See the note above on why there is a number here at all. */
const MAX_BYTES = 400_000;

export default function ProjectLogo({
  portfolio, projectName, onSaved, onError, size = 52,
}: {
  /** Null when the project has no client — then this is a letter and nothing more. */
  portfolio: Portfolio | null;
  projectName: string;
  onSaved: () => void;
  onError: (message: string) => void;
  size?: number;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);

  const logo = String(portfolio?.profile?.logoUrl ?? '');

  /* A colour taken from the client's own name, so the same client is the same
     colour on every device and after every reload — which is what makes it
     useful for finding your place in a stack of six. */
  const name = portfolio?.name || projectName;
  const palette = [
    { bg: '#fef3c7', fg: '#b45309' }, { bg: '#ede9fe', fg: '#6d28d9' },
    { bg: '#dcfce7', fg: '#15803d' }, { bg: '#dbeafe', fg: '#1d4ed8' },
    { bg: '#fce7f3', fg: '#be185d' }, { bg: '#ccfbf1', fg: '#0f766e' },
  ];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const tint = palette[h % palette.length];
  const letter = (name.trim()[0] ?? '?').toUpperCase();

  async function store(dataUrl: string) {
    if (!portfolio) { onError('This project has no client yet, so there is nowhere to keep a logo.'); return; }
    setBusy(true);
    const r = await savePortfolio({
      id: portfolio.id,
      name: portfolio.name,
      /* The whole profile back, with the logo changed. Sending only the logo
         would replace the profile with one key and lose everything the writers
         read — which is the sort of thing discovered weeks later, in bland copy
         nobody can explain. */
      profile: { ...portfolio.profile, logoUrl: dataUrl },
    });
    setBusy(false);
    if (!r.success) { onError(String(r.error ?? 'That could not be saved.')); return; }
    onSaved();
  }

  function pick(file: File | undefined) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { onError(`${file.name} is not an image.`); return; }
    if (file.size > MAX_BYTES) {
      onError(
        `That logo is ${Math.round(file.size / 1024)}KB and the limit is ${MAX_BYTES / 1000}KB. `
        + 'It is stored with the client and loaded every time this screen opens, so a large one slows the whole page.',
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => void store(String(reader.result ?? ''));
    reader.onerror = () => onError('That image could not be read.');
    reader.readAsDataURL(file);
  }

  const label = logo ? `Change the logo for ${name}` : `Upload a logo for ${name}`;

  return (
    <span
      style={{ position: 'relative', width: size, height: size, flexShrink: 0, display: 'inline-flex' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        onClick={() => input.current?.click()}
        disabled={busy || !portfolio}
        aria-label={label}
        title={portfolio ? label : 'This project has no client yet.'}
        style={{
          width: size, height: size, borderRadius: 15, padding: 0, overflow: 'hidden',
          border: `1px solid ${LINE}`, background: logo ? '#fff' : tint.bg,
          cursor: busy || !portfolio ? 'default' : 'pointer', position: 'relative',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
        {logo
          ? <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: size * 0.4, fontWeight: 800, color: tint.fg }}>{letter}</span>}

        {/* The prompt only on hover, so a screen of six projects is not six
            "upload" badges shouting at somebody who has already done it. */}
        {(hover || busy) && portfolio && (
          <span style={{
            position: 'absolute', inset: 0, background: 'rgba(15,17,23,0.55)', color: '#fff',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {busy ? <Loader size={15} className="spin" /> : <ImagePlus size={15} />}
          </span>
        )}
      </button>

      {logo && hover && !busy && portfolio && (
        <button
          onClick={() => void store('')}
          aria-label={`Remove the logo for ${name}`}
          style={{
            position: 'absolute', top: -5, right: -5, width: 19, height: 19, borderRadius: 999,
            border: `1px solid ${LINE}`, background: '#fff', color: '#b42318',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          }}><X size={10} /></button>
      )}

      {!logo && !hover && portfolio && (
        /* A quiet dot rather than a badge: enough to say something can be done
           here, not enough to read as an error on a screen that is working. */
        <span aria-hidden style={{
          position: 'absolute', right: -2, bottom: -2, width: 14, height: 14, borderRadius: 999,
          background: '#fff', border: `1px solid ${LINE}`, color: ACCENT,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}><ImagePlus size={8} /></span>
      )}

      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }}
        style={{ display: 'none' }}
        aria-hidden
        tabIndex={-1}
      />
    </span>
  );
}
