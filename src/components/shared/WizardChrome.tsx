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
import { Fragment, type ReactNode } from 'react';
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

/** One box on the board. */
export interface FlowNode {
  /** What it is, in two or three words. */
  label: string;
  /** What it will hold, in the customer's own terms. One short line. */
  detail: string;
}

/**
 * The right-hand pane: the workflow being built, following the form.
 *
 * ── Why this replaced a decorative stage ──
 *
 * The first version of this pane was floating cards that meant nothing. It
 * looked alive and said nothing, which is the worse half of both options — it
 * took the width of a whole column to be pretty.
 *
 * This shows the thing being assembled: the emails in the sequence, the stages
 * of the launch, the pages of the shop, with the step in hand lit and the ones
 * after it ghosted. The pane answers the question somebody is actually holding
 * at each step — "what am I agreeing to?" — and answers it from the same
 * values the form has collected rather than with a picture of a different
 * product.
 *
 * ── Why it is tilted ──
 *
 * Flat, a column of boxes is a list, and a list beside a form reads as a
 * second form. Tilted on two axes with the nodes at different depths it reads
 * as a board being looked at, which is what it is. The dotted field behind is
 * what makes the tilt legible; over a flat colour the same rotation looks like
 * a skewed rectangle.
 *
 * ── What it must never do ──
 *
 * Invent. Every node is passed in by the wizard that owns it, out of what the
 * form has already collected, so it cannot promise a step the product will not
 * build. A pane that drifts from the form is worse than no pane, because it is
 * read as a preview.
 */
export function WizardFlow({
  nodes, activeIndex, caption,
}: {
  nodes: FlowNode[];
  /** Which node the form is on. Clamped, so an off-by-one cannot blank it. */
  activeIndex: number;
  /** One line under the board saying what it is. */
  caption?: ReactNode;
}) {
  const at = Math.min(Math.max(activeIndex, 0), Math.max(nodes.length - 1, 0));

  /* Slide the board so the live node sits near the middle of the pane. A node
     and its link come to roughly 86px; the first two do not move it, or the
     board lurches on the very first step of the wizard. */
  const shift = Math.max(0, at - 1) * 86;

  return (
    <div className="wz-stage" aria-hidden="true">
      <div className="wz-board">
        <div
          className="wz-flow"
          style={{ transform: `rotateY(-15deg) rotateX(7deg) translateZ(-30px) translateY(${-shift}px)` }}
        >
          {nodes.map((n, i) => {
            const state = i < at ? 'done' : i === at ? 'now' : 'todo';
            return (
              <Fragment key={`${n.label}-${i}`}>
                <div className={`wz-node wz-node-${state}`}>
                  <span className="wz-node-icon">{state === 'done' ? '✓' : i + 1}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="wz-node-label">{n.label}</span>
                    <span className="wz-node-detail">{n.detail}</span>
                  </span>
                </div>
                {i < nodes.length - 1 && (
                  <span className="wz-link"><span className="wz-link-dot" /></span>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
      {caption && <p className="wz-board-caption">{caption}</p>}
    </div>
  );
}

/**
 * Content and board side by side, inside the card.
 *
 * The children are the form. The board is passed rather than composed inside,
 * so a wizard with no workflow worth drawing simply does not pass one and gets
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
