/**
 * The AI Autopilot screen's own palette.
 *
 * ── Why this is light, after a spell of being dark ──
 *
 * It was authored dark, on the argument that a board of live machinery reads
 * better on black. It does — but only on its own. Sitting inside an app whose
 * every other screen is white, it made Autopilot look like a different product
 * bolted on, and in the app's *dark* mode it was the one screen that did not
 * change when somebody switched the theme.
 *
 * So the rule is the boring one, and it is the right one: **this screen is
 * whatever theme the app is in.** It is authored light, like everything else,
 * and the app's dark mode inverts it along with the rest.
 *
 * ── The mechanism, because it is not obvious ──
 *
 * The app's dark mode is a single `filter: invert(1) hue-rotate(180deg)` on
 * `<html>` — blunt, but a working answer for a product styled with inline
 * colours. Anything carrying `data-noinvert` is inverted *back*, i.e. opted out
 * of theming. This screen therefore must **not** carry it: that attribute is
 * what pinned it dark in both themes.
 *
 * The exception is photographic content — a logo somebody uploaded, a post
 * thumbnail. Those still carry `data-noinvert`, because a customer's own
 * artwork rendered in negative is not a dark theme, it is a fault.
 */

export const T = {
  /* The ground the cards sit on. Barely tinted: a flat white page makes a
     white card invisible, and a grey one makes the whole screen feel dim. */
  bg: '#f6f7fb',
  /* A project card. */
  panel: '#ffffff',
  /* Anything sitting on a panel — a workflow row, a node, an input. */
  raised: '#f9fafc',
  /* The AI column, which is meant to feel like a different kind of object, so
     it takes a wash of the accent rather than another grey. */
  aside: '#f4f5ff',

  line: '#e6e9f0',
  lineSoft: '#f0f2f7',

  ink: '#17191c',
  muted: '#6b7280',
  faint: '#9aa3b2',

  accent: '#5b46e5',
  accentSoft: '#eef0ff',
  violet: '#7c3aed',

  good: '#16a34a',
  goodSoft: '#f0fdf4',
  /* Dark enough to read as text on its own tint. `#fbbf24` is a fine dot and
     an unreadable word. */
  warn: '#b45309',
  warnSoft: '#fffbeb',
  bad: '#dc2626',
  badSoft: '#fef2f2',
} as const;

/**
 * A node's colour.
 *
 * Kept as its own table rather than read from `NODE_LOOK` because this one also
 * carries an `edge` — the border a selected or hovered node takes — and a
 * two-field table that has to be joined with a three-field one at every call
 * site is how the two end up disagreeing.
 *
 * The name is `nodeTone`; `nodeDark` remains as an alias because it is called
 * in five files and renaming it in the same commit that changed every colour
 * would make the diff unreadable.
 */
export const NODE_TONE: Record<string, { fg: string; bg: string; edge: string }> = {
  trigger:      { fg: '#7c3aed', bg: '#f5f3ff', edge: '#ddd6fe' },
  ai:           { fg: '#9333ea', bg: '#faf5ff', edge: '#e9d5ff' },
  wait:         { fg: '#db2777', bg: '#fdf2f8', edge: '#fbcfe8' },
  condition:    { fg: '#c2410c', bg: '#fff7ed', edge: '#fed7aa' },
  send_email:   { fg: '#2563eb', bg: '#eff6ff', edge: '#bfdbfe' },
  send_sms:     { fg: '#0d9488', bg: '#f0fdfa', edge: '#99f6e4' },
  add_tag:      { fg: '#16a34a', bg: '#f0fdf4', edge: '#bbf7d0' },
  remove_tag:   { fg: '#dc2626', bg: '#fef2f2', edge: '#fecaca' },
  create_task:  { fg: '#16a34a', bg: '#f0fdf4', edge: '#bbf7d0' },
  assign_to:    { fg: '#0369a1', bg: '#eff6ff', edge: '#bae6fd' },
  update_field: { fg: '#475569', bg: '#f8fafc', edge: '#e2e8f0' },
  integration:  { fg: '#4f46e5', bg: '#eef2ff', edge: '#c7d2fe' },
  end:          { fg: '#64748b', bg: '#f8fafc', edge: '#e2e8f0' },
};

export const nodeTone = (type: string) => NODE_TONE[type] ?? NODE_TONE.end;
/** @deprecated Use `nodeTone`. Kept so one commit does not touch five files. */
export const nodeDark = nodeTone;

/* ── Shapes used often enough to be worth naming ── */

export const card: React.CSSProperties = {
  background: T.panel,
  border: `1px solid ${T.line}`,
  borderRadius: 18,
  /* A shadow rather than only a border: on a tinted ground a bordered white box
     reads as a hole, and a lifted one reads as a card. */
  boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 8px 24px -16px rgba(16,24,40,0.18)',
};

export const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 11px',
  borderRadius: 10,
  border: `1px solid ${T.line}`,
  background: '#fff',
  color: T.ink,
  fontSize: 12.5,
  outline: 'none',
  fontFamily: 'inherit',
};

export const ghostBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '6px 11px',
  borderRadius: 999,
  border: `1px solid ${T.line}`,
  background: '#fff',
  color: T.ink,
  fontSize: 11.5,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  flexShrink: 0,
};

/**
 * The button that does the main thing on whatever it is in.
 *
 * A gradient rather than a flat fill, and a real shadow in the accent's own
 * hue: a flat indigo rectangle is the default every admin panel ships with, and
 * this screen is the one somebody is deciding whether to trust. Pair it with
 * `className="ap-btn"` for the sheen that crosses it — the class is where the
 * motion lives, so `prefers-reduced-motion` can reach it.
 */
export const primaryBtn: React.CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '10px 17px',
  borderRadius: 11,
  border: 'none',
  background: 'linear-gradient(135deg, #6d5ef0, #4a36d6)',
  color: '#fff',
  fontSize: 12.5,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  boxShadow: '0 1px 2px rgba(74,54,214,0.24), 0 10px 22px -12px rgba(74,54,214,0.7)',
};
