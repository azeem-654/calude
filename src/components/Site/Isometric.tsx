/**
 * The isometric diagrams on the product panels.
 *
 * Drawn rather than photographed, for a reason worth stating: a screenshot of a
 * dashboard on a marketing page is either real and instantly out of date, or
 * mocked up and quietly dishonest about what the product looks like. A diagram
 * claims to be a diagram. Each one shows the actual shape of the module it sits
 * on — what orbits what, what sits on top of what — so it carries information
 * rather than decoration.
 *
 * All five share one projection: a 2:1 isometric, x to the right and down, y to
 * the left and down. `cube()` returns the three visible faces of a box at a
 * grid position, which is the whole vocabulary.
 */

/** Half-width and half-height of one grid cell in the 2:1 projection. */
const W = 1;
const H = 0.5;

/** Grid coordinates to screen coordinates. */
function project(x: number, y: number, z: number, unit: number): [number, number] {
  return [(x - y) * W * unit, (x + y) * H * unit - z * unit];
}

interface Box {
  /** Grid position of the near-bottom corner. */
  x: number; y: number; z: number;
  /** Extent along each axis, in grid cells. */
  w?: number; d?: number; h?: number;
}

/** The three visible faces of a box, as SVG path data. */
function cube({ x, y, z, w = 1, d = 1, h = 1 }: Box, unit: number) {
  const p = (a: number, b: number, c: number) => project(a, b, c, unit).join(',');
  return {
    top: `M${p(x, y, z + h)} L${p(x + w, y, z + h)} L${p(x + w, y + d, z + h)} L${p(x, y + d, z + h)} Z`,
    left: `M${p(x, y + d, z + h)} L${p(x + w, y + d, z + h)} L${p(x + w, y + d, z)} L${p(x, y + d, z)} Z`,
    right: `M${p(x + w, y, z + h)} L${p(x + w, y + d, z + h)} L${p(x + w, y + d, z)} L${p(x + w, y, z)} Z`,
  };
}

function Solid({ box, unit, delay = 0 }: { box: Box; unit: number; delay?: number }) {
  const f = cube(box, unit);
  return (
    <g className="rise" style={{ animationDelay: `${delay}ms` }}>
      <path className="iso-top" d={f.top} />
      <path className="iso-right" d={f.right} />
      <path className="iso-left" d={f.left} />
    </g>
  );
}

function Wire({ box, unit, delay = 0, faint }: { box: Box; unit: number; delay?: number; faint?: boolean }) {
  const f = cube(box, unit);
  const cls = faint ? 'iso-wire-faint' : 'iso-wire';
  return (
    <g className="fade" style={{ animationDelay: `${delay}ms` }}>
      <path className={cls} d={f.top} />
      <path className={cls} d={f.right} />
      <path className={cls} d={f.left} />
    </g>
  );
}

/**
 * A small labelled marker, the way the reference pins names to a diagram.
 *
 * Coloured from CSS rather than here, so one marker works on a white card and
 * on a dark band without a second copy of the component.
 */
function Pill({ at, label, delay = 0 }: { at: [number, number]; label: string; delay?: number }) {
  const width = label.length * 5.6 + 26;
  return (
    <g className="fade" style={{ animationDelay: `${delay}ms` }} transform={`translate(${at[0]},${at[1]})`}>
      <rect className="iso-pill" x={-width / 2} y={-10} width={width} height={20} rx={10} />
      <circle className="iso-pill-dot" cx={-width / 2 + 13} cy={0} r={3.4} />
      <text className="iso-pill-text" x={-width / 2 + 22} y={3.6} fontSize={9}
        fontFamily="Inter, system-ui, sans-serif">{label}</text>
    </g>
  );
}

const svgProps = {
  /* Wide enough for the labels. They orbit at 132 and are up to ~55 wide, so a
     half-width of 160 put them outside the box — invisible the moment the card
     around them started clipping its overflow. */
  viewBox: '-200 -150 400 285',
  width: '100%',
  height: '100%',
  role: 'presentation' as const,
  style: { maxHeight: 300, overflow: 'visible' as const },
};

/* ── 1. The agent, and what it reaches into ───────────────────────────── */

/**
 * A core with the modules it drives orbiting it. This is the literal shape of
 * the AI Sales Agent: it decides, and the surrounding modules do.
 */
export function IsoAgent() {
  const ring = [
    { label: 'Prospects', a: -90 },
    { label: 'Email sequences', a: -32 },
    { label: 'Contacts', a: 32 },
    { label: 'Appointments', a: 90 },
    { label: 'Pipelines', a: 148 },
    { label: 'Performance', a: 212 },
  ];
  /* The orbit has to clear the solid at the centre. A cube of unit 34 reaches
     51 above and 17 below its own origin, so anything closer than ~78 on the
     short axis lands on top of it — which is exactly what a smaller ring did. */
  const cy = -18;
  const rx = 132;
  const ry = 84;

  return (
    <svg {...svgProps}>
      <ellipse className="draw iso-wire" cx={0} cy={cy} rx={rx} ry={ry} />
      <ellipse className="draw iso-wire-faint" style={{ animationDelay: '90ms' }} cx={0} cy={cy}
        rx={ry * 0.62} ry={rx * 0.78} transform={`rotate(28 0 ${cy})`} />
      <ellipse className="draw iso-wire-faint" style={{ animationDelay: '180ms' }} cx={0} cy={cy}
        rx={ry * 0.62} ry={rx * 0.78} transform={`rotate(-28 0 ${cy})`} />

      <g className="float" transform={`translate(0,${cy + 16})`}>
        <Solid box={{ x: -0.5, y: -0.5, z: 0, w: 1, d: 1, h: 1 }} unit={34} delay={140} />
      </g>

      {ring.map((r, i) => {
        const rad = (r.a * Math.PI) / 180;
        return (
          <Pill key={r.label} label={r.label} delay={340 + i * 70}
            at={[Math.cos(rad) * rx, cy + Math.sin(rad) * ry]} />
        );
      })}
    </svg>
  );
}

/* ── 2. Contacts and pipelines ────────────────────────────────────────── */

/** Records stacked into stages: the pipeline, seen side on. */
export function IsoPipeline() {
  const u = 30;
  return (
    <svg {...svgProps}>
      <g transform="translate(0,30)">
        <Wire box={{ x: -2.4, y: -2.4, z: -0.35, w: 4.8, d: 4.8, h: 0.35 }} unit={u} faint />
        <Solid box={{ x: -2, y: -0.5, z: 0, w: 1, d: 1, h: 0.5 }} unit={u} delay={120} />
        <Wire box={{ x: -0.7, y: -0.5, z: 0, w: 1, d: 1, h: 1.1 }} unit={u} delay={220} />
        <Wire box={{ x: 0.6, y: -0.5, z: 0, w: 1, d: 1, h: 1.8 }} unit={u} delay={320} />
        <Wire box={{ x: 1.9, y: -0.5, z: 0, w: 1, d: 1, h: 2.6 }} unit={u} delay={420} />
      </g>
      <Pill at={[-96, -46]} label="Lead" delay={520} />
      <Pill at={[104, -104]} label="Won" delay={640} />
    </svg>
  );
}

/* ── 3. Email and the sequence ────────────────────────────────────────── */

/** A cadence: the opening message lit, the follow-ups behind it in outline. */
export function IsoSequence() {
  const u = 30;
  const steps = [0, 1, 2, 3];
  return (
    <svg {...svgProps}>
      <g transform="translate(-20,34)">
        <Wire box={{ x: -2.6, y: -1.6, z: -0.3, w: 5.4, d: 3.2, h: 0.3 }} unit={u} faint />
        {steps.map(i => (
          i === 0
            ? <Solid key={i} box={{ x: -2.2 + i * 1.3, y: -0.5, z: 0, w: 1, d: 1, h: 2.2 }} unit={u} delay={140} />
            : <Wire key={i} box={{ x: -2.2 + i * 1.3, y: -0.5, z: 0, w: 1, d: 1, h: 2.2 - i * 0.45 }} unit={u} delay={140 + i * 110} />
        ))}
      </g>
      <Pill at={[-58, -104]} label="Opened" delay={560} />
      <Pill at={[96, -30]} label="Replied" delay={680} />
    </svg>
  );
}

/* ── 4. Sites, funnels and booking ────────────────────────────────────── */

/** Pages stacked into a funnel, narrowing as they go up. */
export function IsoFunnel() {
  const u = 32;
  return (
    <svg {...svgProps}>
      <g transform="translate(0,44)">
        <Wire box={{ x: -2.6, y: -2.6, z: -0.3, w: 5.2, d: 5.2, h: 0.3 }} unit={u} faint />
        <Wire box={{ x: -2, y: -2, z: 0, w: 4, d: 4, h: 0.4 }} unit={u} delay={100} />
        <Wire box={{ x: -1.4, y: -1.4, z: 0.5, w: 2.8, d: 2.8, h: 0.4 }} unit={u} delay={220} />
        <Wire box={{ x: -0.85, y: -0.85, z: 1.0, w: 1.7, d: 1.7, h: 0.4 }} unit={u} delay={340} />
        <g className="float">
          <Solid box={{ x: -0.45, y: -0.45, z: 1.6, w: 0.9, d: 0.9, h: 0.9 }} unit={u} delay={460} />
        </g>
      </g>
      <Pill at={[-108, 18]} label="Visitors" delay={560} />
      <Pill at={[92, -86]} label="Booked" delay={680} />
    </svg>
  );
}

/* ── 5. Content studio ────────────────────────────────────────────────── */

/** One source, several cuts of it — the shape of repurposing. */
export function IsoStudio() {
  const u = 30;
  const outs = [
    { x: 1.5, y: -1.4, h: 0.9 },
    { x: 1.5, y: 0.1, h: 1.3 },
    { x: 1.5, y: 1.6, h: 0.7 },
  ];
  return (
    <svg {...svgProps}>
      <g transform="translate(-14,26)">
        <Wire box={{ x: -3, y: -2.4, z: -0.3, w: 6.2, d: 4.8, h: 0.3 }} unit={u} faint />
        <g className="float">
          <Solid box={{ x: -2.4, y: -0.5, z: 0, w: 1.4, d: 1.4, h: 1.4 }} unit={u} delay={120} />
        </g>
        {outs.map((o, i) => (
          <Wire key={i} box={{ x: o.x, y: o.y, z: 0, w: 0.9, d: 0.9, h: o.h }} unit={u} delay={300 + i * 120} />
        ))}
      </g>
      <Pill at={[-104, -8]} label="One video" delay={520} />
      <Pill at={[86, -78]} label="Many posts" delay={640} />
    </svg>
  );
}

/* ── The hero object ──────────────────────────────────────────────────── */

/** A single solid on an empty field, for the top of the page. */
export function IsoHero() {
  return (
    <svg viewBox="-170 -130 340 240" width="100%" height="100%" role="presentation"
      style={{ maxHeight: 320, overflow: 'visible' }}>
      <ellipse className="draw iso-wire-faint" cx={0} cy={26} rx={140} ry={72} />
      <ellipse className="draw iso-wire" style={{ animationDelay: '120ms' }} cx={0} cy={26} rx={96} ry={50} />
      <g className="float">
        <Solid box={{ x: -0.5, y: -0.5, z: 0, w: 1, d: 1, h: 1 }} unit={58} delay={120} />
      </g>
    </svg>
  );
}
