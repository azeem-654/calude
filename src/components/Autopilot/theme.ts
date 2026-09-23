/**
 * The AI Autopilot screen's own palette.
 *
 * ── Why this screen is dark when the rest of the app is not ──
 *
 * Everything else here is a CRM: lists, forms, tables, read in daylight for
 * hours. This screen is a control room — a graph of machinery, with live state
 * moving on it — and the things that have to stand out are a running workflow,
 * a step that failed and a decision waiting on somebody. Those read as light on
 * dark and wash out on white.
 *
 * ── The bit that is not obvious ──
 *
 * The app's dark mode is a single `filter: invert(1) hue-rotate(180deg)` on
 * `<html>`, which is a blunt but working answer for a product styled with
 * inline colours. A screen authored dark would be *inverted to light* by it —
 * so the Autopilot root carries `data-noinvert`, which the same stylesheet
 * inverts back. The sums:
 *
 *   light app → no filter → renders as authored → dark ✓
 *   dark app  → inverted, then inverted back by data-noinvert → dark ✓
 *
 * Getting that wrong is not subtle: the whole screen flips to white the moment
 * somebody switches the app's theme, and only in that one place.
 */

export const T = {
  /* The ground. Blue-black rather than grey-black: a pure neutral makes the
     accent colours look like they are floating on a different surface. */
  bg: '#0b1020',
  /* A project card. One step up from the ground so a stack of six reads as six
     things rather than as one long page. */
  panel: '#121a2e',
  /* Anything sitting on a panel — a workflow row, a node, an input. */
  raised: '#18223a',
  /* The AI column, which is meant to feel like a different kind of object. */
  aside: '#141d33',

  line: '#243050',
  lineSoft: '#1b2440',

  ink: '#e9eefb',
  muted: '#8f9dbd',
  faint: '#65748f',

  accent: '#5b7cfa',
  accentSoft: '#1e2a4d',
  violet: '#8b6cf6',

  good: '#34d399',
  goodSoft: '#0f2f26',
  warn: '#fbbf24',
  warnSoft: '#332611',
  bad: '#f87171',
  badSoft: '#3a1c1f',
} as const;

/**
 * A node's colour on a dark ground.
 *
 * The light palette's tints are unusable here — `#f5f3ff` on `#121a2e` is a
 * white brick. Each one is a saturated foreground with a dark, low-alpha bed of
 * the same hue, which is what keeps a row of six nodes legible as six *kinds*
 * rather than six white rectangles.
 */
export const NODE_DARK: Record<string, { fg: string; bg: string; edge: string }> = {
  trigger:      { fg: '#a78bfa', bg: 'rgba(139,108,246,0.14)', edge: 'rgba(139,108,246,0.35)' },
  ai:           { fg: '#c084fc', bg: 'rgba(192,132,252,0.14)', edge: 'rgba(192,132,252,0.35)' },
  wait:         { fg: '#f472b6', bg: 'rgba(244,114,182,0.13)', edge: 'rgba(244,114,182,0.32)' },
  condition:    { fg: '#fbbf24', bg: 'rgba(251,191,36,0.13)',  edge: 'rgba(251,191,36,0.32)' },
  send_email:   { fg: '#60a5fa', bg: 'rgba(96,165,250,0.14)',  edge: 'rgba(96,165,250,0.34)' },
  send_sms:     { fg: '#2dd4bf', bg: 'rgba(45,212,191,0.13)',  edge: 'rgba(45,212,191,0.32)' },
  add_tag:      { fg: '#34d399', bg: 'rgba(52,211,153,0.13)',  edge: 'rgba(52,211,153,0.32)' },
  remove_tag:   { fg: '#f87171', bg: 'rgba(248,113,113,0.13)', edge: 'rgba(248,113,113,0.32)' },
  create_task:  { fg: '#34d399', bg: 'rgba(52,211,153,0.13)',  edge: 'rgba(52,211,153,0.32)' },
  assign_to:    { fg: '#38bdf8', bg: 'rgba(56,189,248,0.13)',  edge: 'rgba(56,189,248,0.32)' },
  update_field: { fg: '#94a3b8', bg: 'rgba(148,163,184,0.12)', edge: 'rgba(148,163,184,0.3)' },
  integration:  { fg: '#818cf8', bg: 'rgba(129,140,248,0.14)', edge: 'rgba(129,140,248,0.34)' },
  end:          { fg: '#8f9dbd', bg: 'rgba(143,157,189,0.1)',  edge: 'rgba(143,157,189,0.26)' },
};

export const nodeDark = (type: string) => NODE_DARK[type] ?? NODE_DARK.end;

/* ── Shapes used often enough to be worth naming ── */

export const card: React.CSSProperties = {
  background: T.panel,
  border: `1px solid ${T.line}`,
  borderRadius: 18,
};

export const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 11px',
  borderRadius: 10,
  border: `1px solid ${T.line}`,
  background: T.raised,
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
  background: T.raised,
  color: T.ink,
  fontSize: 11.5,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  flexShrink: 0,
};

export const primaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '10px 17px',
  borderRadius: 11,
  border: 'none',
  background: T.accent,
  color: '#fff',
  fontSize: 12.5,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
