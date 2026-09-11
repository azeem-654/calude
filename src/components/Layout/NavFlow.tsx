/**
 * The traces from AI Autopilot to every other module.
 *
 * ── What was wrong with the first version ──
 *
 * One horizontal line across the whole pill row with a dot sliding along it.
 * It read as a progress bar that had got loose, because a single straight line
 * between seven things does not say "connected to each of them" — it says
 * "underlined". What it needed to look like is what it actually is: one module
 * wired into each of the others, with traffic on the wires.
 *
 * So: a lane under the pills, a bus running along it, and a drop from the
 * bottom of every pill into that bus — the shape of a circuit board, which is
 * the shape of the thing. Packets travel out from Autopilot's drop to each
 * module's, and back, along the real path rather than in a straight line.
 *
 * ── Why it is not always moving ──
 *
 * The traffic is tied to `running` on the pulse. With no project running there
 * is nothing flowing between these modules, and an animation implying there is
 * would be a moving picture of a claim that is not true. The traces stay drawn
 * and go quiet, which is the honest state and also reads as "idle" rather than
 * "broken".
 *
 * Everything here is measured, never assumed: the pills are translatable,
 * the row is centred, and the whole thing wraps below 1280px — at which point
 * a bus drawn through the middle of a wrapped row connects nothing, so it is
 * not drawn at all.
 */
import { useEffect, useState } from 'react';

/** Where one pill's drop meets the bus. */
interface Tap {
  id: string;
  /** Centre of the pill, in row coordinates. */
  x: number;
  /** Bottom edge of the pill — where its branch leaves. */
  top: number;
  /** Where that branch lands. Staggered, so neighbours do not overlap. */
  y: number;
}

interface Geometry {
  width: number;
  height: number;
  hero: Tap;
  taps: Tap[];
  busY: number;
}

/**
 * How far a branch slants toward the trunk before it lands.
 *
 * Straight-down stubs meeting a straight trunk read as tick marks under a
 * line. Slanting each one toward Autopilot makes the same connection read as
 * flow *into* something — a herringbone, which is what a bus with taps on it
 * actually looks like.
 */
const SLANT = 7;

/** How far below the pills each branch lands, so they do not all share one row. */
const STEPS = [0, 4, 8];

/**
 * The path a packet travels: down out of the module, in along the trunk, and up
 * into Autopilot's own drop.
 *
 * Written from the module towards Autopilot rather than the other way round, so
 * a packet at `keyPoints 0` starts at the module — "reporting in" — and the
 * reverse reads as "being told". One path, two directions, no second copy of
 * the geometry to keep in step.
 *
 * Invisible: what gets *drawn* is the trunk once and one stub per module. The
 * first version stroked this whole path seven times, which laid seven copies of
 * the trunk on top of each other and turned the diagram back into the single
 * thick line it was meant to replace.
 */
function motionPath(from: Tap, hero: Tap, busY: number): string {
  const dir = hero.x > from.x ? 1 : -1;
  const x = from.x + dir * SLANT;
  return [
    `M ${from.x} ${from.top}`,
    `L ${x} ${from.y}`,
    `L ${x} ${busY}`,
    `L ${hero.x} ${busY}`,
    `L ${hero.x} ${hero.top}`,
  ].join(' ');
}

/**
 * The visible branch: out of one module, slanting toward Autopilot, then
 * straight down onto the trunk.
 *
 * The slant is what makes it read as flow rather than as a tick mark; the drop
 * is what makes it visibly *land* on the trunk. Without the drop the staggered
 * branches ended in mid-air and the packets looked like they were floating.
 */
function branch(from: Tap, hero: Tap, busY: number): string {
  const dir = hero.x > from.x ? 1 : -1;
  const x = from.x + dir * SLANT;
  return `M ${from.x} ${from.top} L ${x} ${from.y} L ${x} ${busY}`;
}

export default function NavFlow({
  row, heroId, live,
}: {
  /** The pill row. Every pill inside it carries data-nav-group. */
  row: HTMLElement | null;
  heroId: string;
  /** True when at least one project would act on the next tick. */
  live: boolean;
}) {
  const [geo, setGeo] = useState<Geometry | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [reduced, setReduced] = useState(false);

  /* Only where the row is a single line. Below that it wraps to two or three,
     and a bus along the bottom would pass under the wrong pills. */
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1281px)');
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => { setEnabled(mq.matches); setReduced(rm.matches); };
    sync();
    mq.addEventListener('change', sync);
    rm.addEventListener('change', sync);
    return () => { mq.removeEventListener('change', sync); rm.removeEventListener('change', sync); };
  }, []);

  useEffect(() => {
    if (!row || !enabled) { setGeo(null); return; }

    const measure = () => {
      const pills = Array.from(row.querySelectorAll<HTMLElement>('[data-nav-group]'));
      const rowBox = row.getBoundingClientRect();
      let hero: Tap | null = null;
      const taps: Tap[] = [];

      for (const el of pills) {
        const id = el.dataset.navGroup ?? '';
        const b = el.getBoundingClientRect();
        const tap: Tap = {
          id,
          x: Math.round(b.left - rowBox.left + b.width / 2),
          top: Math.round(b.bottom - rowBox.top),
          y: 0,
        };
        if (id === heroId) hero = tap; else taps.push(tap);
      }

      /* A row with no hero, or a hero and nothing to wire it to, has no flow
         to draw — better nothing than a diagram of one thing. */
      if (!hero || taps.length === 0) { setGeo(null); return; }

      const height = Math.round(rowBox.height);
      /* The trunk sits near the bottom of the lane the row's padding leaves
         below the pills. If that padding ever goes, so does the diagram —
         measured rather than assumed, so it disappears instead of drawing
         through the pills. */
      const lane = height - hero.top;
      if (lane < 12) { setGeo(null); return; }
      const busY = height - 4;

      /* Ordered by distance from Autopilot, then stepped: adjacent branches
         land at different depths, so seven of them read as seven rather than
         as one thick line. */
      taps.sort((a, b) => Math.abs(a.x - hero.x) - Math.abs(b.x - hero.x));
      taps.forEach((t, i) => { t.y = busY - STEPS[i % STEPS.length]; });
      hero.y = busY;

      setGeo({ width: Math.round(rowBox.width), height, hero, taps, busY });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    for (const el of row.querySelectorAll<HTMLElement>('[data-nav-group]')) ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [row, heroId, enabled]);

  if (!geo) return null;

  const flowing = live && !reduced;

  return (
    <svg
      className="nav-flow"
      aria-hidden="true"
      width={geo.width}
      height={geo.height}
      viewBox={`0 0 ${geo.width} ${geo.height}`}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'visible' }}
    >
      {/* The bus itself, faded at both ends so it does not stop dead against
          the inside of the capsule. */}
      <defs>
        {/*
          * userSpaceOnUse, not the default.
          *
          * The trunk is a horizontal line, so its object bounding box is zero
          * pixels tall — and a gradient defined in bounding-box units on a
          * zero-height box does not paint. The trunk simply was not there, and
          * the branches appeared to end in mid-air with packets floating along
          * a line nobody could see.
          */}
        <linearGradient id="nav-bus-fade" gradientUnits="userSpaceOnUse"
          x1={0} x2={geo.width} y1={0} y2={0}>
          <stop offset="0" stopColor="#6d4aec" stopOpacity="0" />
          <stop offset="0.06" stopColor="#6d4aec" stopOpacity={flowing ? 0.6 : 0.26} />
          <stop offset="0.94" stopColor="#6d4aec" stopOpacity={flowing ? 0.6 : 0.26} />
          <stop offset="1" stopColor="#6d4aec" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* The trunk, drawn once. Every branch feeds into it. */}
      <path
        d={`M ${Math.min(...geo.taps.map(t => t.x), geo.hero.x) - 4} ${geo.busY} H ${Math.max(...geo.taps.map(t => t.x), geo.hero.x) + 4}`}
        fill="none" stroke="url(#nav-bus-fade)" strokeWidth={1.6} strokeLinecap="round"
      />

      {geo.taps.map((t, i) => {
        const id = `nav-trace-${t.id}`;
        /* Alternating, so at any moment some packets are going out to the
           modules and some are coming back — which is what the wiring means. */
        const inbound = i % 2 === 1;
        const dur = 2.4 + (i % 4) * 0.55;
        const delay = (i * 0.72) % 3.4;
        return (
          <g key={t.id}>
            {/* The path packets follow. Never stroked — see motionPath. */}
            <path id={id} d={motionPath(t, geo.hero, geo.busY)} fill="none" stroke="none" />
            {/* The branch out of this module, slanting into the trunk. */}
            <path d={branch(t, geo.hero, geo.busY)} fill="none" stroke="#6d4aec" strokeWidth={1.3}
              strokeLinejoin="round" strokeLinecap="round" opacity={flowing ? 0.5 : 0.24} />
            {/* Where it meets the trunk, so a branch lands on something. */}
            <circle cx={t.x + (geo.hero.x > t.x ? SLANT : -SLANT)} cy={geo.busY} r={1.8}
              fill="#6d4aec" opacity={flowing ? 0.75 : 0.32} />
            {flowing && (
              <circle r={2.6} fill={inbound ? '#22b07d' : '#7c3aed'} opacity={0.95}>
                <animateMotion
                  dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite"
                  keyPoints={inbound ? '0;1' : '1;0'} keyTimes="0;1" calcMode="linear"
                >
                  <mpath href={`#${id}`} />
                </animateMotion>
                {/* Fades at both ends of its run, so a packet never appears or
                    vanishes on a hard edge in the middle of a trace. */}
                <animate attributeName="opacity" dur={`${dur}s`} begin={`${delay}s`}
                  repeatCount="indefinite" values="0;1;1;0" keyTimes="0;0.14;0.8;1" />
              </circle>
            )}
          </g>
        );
      })}

      {/* Autopilot's own drop, drawn last and heavier: every trace ends here,
          and it should look like the junction rather than one more branch. */}
      <line x1={geo.hero.x} y1={geo.hero.top} x2={geo.hero.x} y2={geo.busY}
        stroke="#6d4aec" strokeWidth={2} strokeLinecap="round" opacity={flowing ? 0.7 : 0.32} />
      <circle cx={geo.hero.x} cy={geo.busY} r={3.1} fill="#6d4aec" opacity={flowing ? 0.9 : 0.4} />
      {flowing && (
        <circle cx={geo.hero.x} cy={geo.busY} r={3.1} fill="none" stroke="#6d4aec" strokeWidth={1.2}>
          <animate attributeName="r" values="3.1;8;3.1" dur="2.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0;0.5" dur="2.6s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  );
}
