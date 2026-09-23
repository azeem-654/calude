/**
 * The last few things this project actually made, as a row of bubbles.
 *
 * ── The question it answers ──
 *
 * "Is this thing doing anything?" A project card can show a live workflow, a
 * tick count and a green switch and still leave somebody unable to answer it,
 * because none of those is a *thing they can open*. A post, a draft, a page —
 * something with a name, that exists, that can be looked at — is the only
 * evidence that convinces anybody.
 *
 * So each bubble is a record that exists and a route to it. Clicking one leaves
 * Autopilot and lands on the record in whichever module owns it. There is no
 * bubble for anything that was not made: a run that read an empty feed produced
 * nothing, and a bubble saying "checked the feed" would be the screen padding
 * itself out.
 *
 * ── Why it is not a live feed ──
 *
 * It looks like one, and it deliberately is not. The items are whatever the
 * last poll returned, newest first; nothing is animated *in* on a timer, and
 * the drift on the rail carries no information. Somebody with reduced motion
 * turned on sees the same bubbles, still.
 */
import { useNavigate } from 'react-router-dom';
import { FileText, Image as ImageIcon, Mail, Globe, Film, Sparkles, ChevronRight } from 'lucide-react';
import { T } from './theme';

export interface Produced {
  id: string;
  /** What it is, as the link kind names it: social-post, blog-post, sequence… */
  kind: string;
  label: string;
  route: string;
  at: string;
}

/** The icon for a kind, and the module it belongs to in the customer's words. */
const KINDS: Record<string, { icon: typeof FileText; where: string }> = {
  'social-post': { icon: ImageIcon, where: 'Social Creator' },
  'blog-post': { icon: FileText, where: 'Blog' },
  sequence: { icon: Mail, where: 'Campaigns' },
  campaign: { icon: Mail, where: 'Campaigns' },
  website: { icon: Globe, where: 'Websites' },
  funnel: { icon: Globe, where: 'Funnels' },
  short: { icon: Film, where: 'Shorts' },
};

const kindOf = (k: string) => KINDS[k] ?? { icon: Sparkles, where: 'the app' };

export default function ProducedRail({ items }: { items: Produced[] }) {
  const navigate = useNavigate();
  if (!items.length) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
      borderBottom: `1px solid ${T.lineSoft}`, background: T.raised,
      overflowX: 'auto', scrollbarWidth: 'thin',
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
        fontSize: 10.5, fontWeight: 800, color: T.muted, letterSpacing: '0.02em',
      }}>
        <Sparkles size={11} color={T.violet} /> Made so far
      </span>

      {items.slice(0, 12).map((it, i) => {
        const k = kindOf(it.kind);
        const Ic = k.icon;
        return (
          <button
            key={it.id}
            onClick={() => navigate(it.route)}
            className="press ap-bubble-in"
            title={`${it.label} — opens in ${k.where}`}
            /* Staggered so the row reads left to right as it appears rather
               than arriving as one block. One pass, not a loop. */
            style={{
              animationDelay: `${Math.min(i, 8) * 45}ms`,
              display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
              maxWidth: 230, padding: '5px 11px 5px 8px', borderRadius: 999,
              border: `1px solid ${T.line}`, background: '#fff', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 11, fontWeight: 700, color: T.ink,
            }}
          >
            <span style={{
              width: 18, height: 18, borderRadius: 999, flexShrink: 0,
              background: T.accentSoft, color: T.accent,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}><Ic size={10} /></span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {it.label}
            </span>
            {/* Where it went, said on the bubble rather than discovered by
                clicking: the whole point is that these live somewhere else. */}
            <span style={{ fontSize: 9.5, fontWeight: 700, color: T.muted, flexShrink: 0 }}>
              {k.where}
            </span>
            <ChevronRight size={11} color={T.faint} style={{ flexShrink: 0 }} />
          </button>
        );
      })}
    </div>
  );
}
