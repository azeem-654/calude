/**
 * The pieces every wizard is built from.
 *
 * ── Why these are shared and not copied ──
 *
 * The AI Autopilot project wizard and the email campaign wizard are the two
 * screens where somebody commits to something, and they looked like two
 * different products. Giving them a common backdrop, headline and primary
 * button is most of what makes them feel like one — and putting those three in
 * one file is what stops them drifting apart again the first time either is
 * touched.
 *
 * The styling lives in `wizard.css` rather than inline, because the loop
 * animations have to sit inside a `prefers-reduced-motion` block to be
 * reachable by a media query at all. See the note at the top of that file.
 */
import type { ReactNode } from 'react';
import './wizard.css';

/**
 * The scrim, and the two slow washes behind the card.
 *
 * The washes are `aria-hidden` and carry nothing: with motion off they are
 * still two soft shapes, and the wizard reads exactly the same. That is the
 * test for whether a loop is decoration rather than information.
 */
export function WizardBackdrop({
  label, onClose, children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      /* Only a press that starts *and* ends on the scrim closes it. A drag
         that began inside — selecting the text of an objective, say — used to
         throw the whole wizard away on release. */
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      className="wz-backdrop"
    >
      <span className="wz-wash wz-wash-a" aria-hidden="true" />
      <span className="wz-wash wz-wash-b" aria-hidden="true" />
      {children}
    </div>
  );
}

/**
 * A headline with one phrase carrying the accent.
 *
 * `accent` is a separate prop rather than markup in the string, so the phrase
 * that gets the colour is a decision each screen makes in its own words and
 * nobody has to write HTML into a title to get it.
 */
export function WizardTitle({
  lead, accent, tail, sub,
}: {
  lead: string;
  accent?: string;
  tail?: string;
  sub?: string;
}) {
  return (
    <div>
      <h2 className="wz-title">
        {lead}
        {accent && <> <span className="wz-accent">{accent}</span></>}
        {tail && <> {tail}</>}
      </h2>
      {sub && (
        <p style={{ margin: '9px 0 0', fontSize: 14.5, color: '#6b7280', lineHeight: 1.55, maxWidth: '60ch' }}>
          {sub}
        </p>
      )}
    </div>
  );
}

/**
 * The primary action: a pill with a badge on the end.
 *
 * The badge breathes while the button is idle and stops the moment it is
 * hovered or busy — a control that keeps idling after you have asked it to do
 * something looks like it did not hear you.
 */
export function WizardCta({
  label, icon, onClick, disabled, title, grow,
}: {
  label: ReactNode;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** The reason it is disabled, for the tooltip. */
  title?: string;
  /** Fill the row, for a footer where it is the only action. */
  grow?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="wz-cta"
      style={grow ? { flex: 1, justifyContent: 'center' } : undefined}
    >
      <span>{label}</span>
      <span className="wz-cta-badge" aria-hidden="true">{icon}</span>
    </button>
  );
}

/**
 * The split window: the form on the left, what it is building on the right.
 *
 * ── Why the stage is not a screenshot ──
 *
 * The obvious way to fill that pane is a picture of the finished thing. A
 * picture goes stale the week after it is taken, needs one per wizard, and
 * says nothing while somebody is halfway through. These are a handful of divs
 * that float and write themselves, so they cost nothing to keep true and they
 * are doing something the whole time the form is being filled in.
 *
 * Nothing in here is a control and nothing in here is information. Losing the
 * whole pane — which is what happens under 1040px, and what a reduced-motion
 * preference does to its movement — loses nothing but the mood.
 */
export function WizardStage({
  kind, title, lines, faces,
}: {
  /** What is being built, in two or three words. Sits above the brief. */
  kind: string;
  /** The heading inside the floating brief. */
  title: string;
  /** Two or three short lines. They are scene-setting, not instructions. */
  lines: string[];
  /** Initials for the avatar row. Empty for a wizard nobody collaborates in. */
  faces?: string[];
}) {
  const people = faces ?? [];
  return (
    <div className="wz-stage" aria-hidden="true">
      {/* A tilted card standing in for the thing being made. Bars rather than
          a blank rectangle: an empty white card reads as an image that failed
          to load. */}
      <div className="wz-float wz-float-preview">
        <span className="wz-bar wz-bar-lead" />
        <span className="wz-bar wz-bar-b" />
        <span className="wz-bar wz-bar-c" />
      </div>

      {people.length > 0 && (
        <div className="wz-faces">
          {people.map((f, i) => (
            <span key={f + i} className="wz-face" style={{
              background: ['#5b46e5', '#2dd4bf', '#f59e0b'][i % 3],
            }}>{f}</span>
          ))}
        </div>
      )}

      <div className="wz-float wz-float-brief">
        <span style={{
          display: 'block', fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em',
          color: '#94a3b8', textTransform: 'uppercase',
        }}>{kind}</span>
        <span style={{
          display: 'block', fontSize: 13, fontWeight: 800, color: '#0b0c0e', marginTop: 5,
          letterSpacing: '-0.01em',
        }}>{title}</span>
        {lines.map(l => (
          <span key={l} style={{
            display: 'block', fontSize: 11, color: '#6b7280', marginTop: 5, lineHeight: 1.5,
          }}>{l}</span>
        ))}
        <span className="wz-writing"><span /></span>
      </div>

      <div className="wz-float wz-float-tools">
        {[0, 1, 2, 3].map(i => (
          <span key={i} className={`wz-tool${i === 3 ? ' wz-tool-on' : ''}`}>
            <span style={{
              width: 9, height: 9, borderRadius: i % 2 ? 2 : 999,
              border: '1.6px solid currentColor', display: 'block',
            }} />
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Content and stage side by side, inside the card.
 *
 * The children are the form. The stage is passed rather than composed inside
 * so a wizard that has nothing worth showing can simply not pass one, and get
 * a single full-width column without a special case.
 */
export function WizardSplit({ stage, children }: { stage?: ReactNode; children: ReactNode }) {
  return (
    <div className="wz-split">
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        {children}
      </div>
      {stage}
    </div>
  );
}
