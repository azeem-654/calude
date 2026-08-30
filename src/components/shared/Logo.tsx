import { useId } from 'react';
/**
 * The Protected Central mark.
 *
 * The same shield-with-a-hole as public/favicon.svg, as a component so the nav,
 * the login screen, the loading gate and the marketing header all show one
 * logo. They used to show a generic `Layers` glyph from the icon set — the same
 * picture several thousand other products use — which is not a logo, it is a
 * placeholder that nobody replaced.
 *
 * `tile` draws the dark rounded square behind it. On a light surface that is
 * what gives the mark its contrast; on the dark bands of the marketing site the
 * mark alone is better, so the tile comes off.
 */
export function LogoMark({ size = 28, tile = true }: { size?: number; tile?: boolean }) {
  /* Unique per instance: two of these on one page sharing a gradient id would
     have the second silently paint with the first one's stops. useId rather
     than a random string, so the value survives a re-render instead of
     invalidating the gradient on every paint. */
  const id = `pc${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Protected Central" style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id={id} x1="6" y1="3" x2="26" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d6f96f" />
          <stop offset="0.55" stopColor="#c8f24d" />
          <stop offset="1" stopColor="#8fd9c4" />
        </linearGradient>
      </defs>
      {tile && <rect width="32" height="32" rx="7.5" fill="#0f1210" />}
      <path
        fill={`url(#${id})`}
        fillRule="evenodd"
        d="M16 4.6 L25.4 8.1 V16.2 C25.4 21.6 21.6 25.9 16 27.9 C10.4 25.9 6.6 21.6 6.6 16.2 V8.1 Z
           M16 12.2 a3.9 3.9 0 1 0 0 7.8 a3.9 3.9 0 1 0 0 -7.8 Z"
      />
    </svg>
  );
}

/** The mark with the name beside it, which is how it appears almost everywhere. */
export function Logo({ size = 28, tile = true, name = 'Protected Central', color = '#12151a', fontSize = 17 }: {
  size?: number; tile?: boolean; name?: string; color?: string; fontSize?: number;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
      <LogoMark size={size} tile={tile} />
      <span style={{ fontSize, fontWeight: 700, color, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{name}</span>
    </span>
  );
}
