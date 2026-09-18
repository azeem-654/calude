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
