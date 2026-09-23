/**
 * One template in the gallery, with its whole workflow drawn.
 *
 * ── Why the preview is the row rather than a link off it ──
 *
 * The question somebody is answering while scrolling a library is "is this the
 * shape of the thing I need?", and no amount of description answers it as fast
 * as seeing the steps. A row that shows three tags and a sentence makes them
 * open six templates to find one; a row that shows the graph makes them open
 * the right one first.
 *
 * ── Why the preview is the real graph ──
 *
 * It is `WorkflowCanvas` over the template's own `nodes` — the same component
 * the project card uses, over the same array the engine walks. A preview drawn
 * from a separate description would be a second source of truth about what a
 * template does, and the first time anybody edited one of them it would start
 * lying.
 */
import { Clock, Gauge, Layers, Sparkles, Eye, Check, Wand2, Loader } from 'lucide-react';
import WorkflowCanvas from './WorkflowCanvas';
import { DIFFICULTY_LABEL, difficultyOf, setupMinutes, usesAi, type Difficulty } from './templateMeta';
import type { WorkflowTemplate } from './workflowTemplates';
import { T, ghostBtn, primaryBtn } from './theme';

const DIFFICULTY_TONE: Record<Difficulty, { bg: string; fg: string }> = {
  easy: { bg: '#ecfdf5', fg: '#047857' },
  medium: { bg: '#fffbeb', fg: '#b45309' },
  advanced: { bg: '#fef2f2', fg: '#b91c1c' },
};

function Badge({ icon: Icon, children, tone }: {
  icon?: typeof Clock;
  children: React.ReactNode;
  tone?: { bg: string; fg: string };
}) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
      padding: '3px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 700,
      background: tone?.bg ?? T.lineSoft, color: tone?.fg ?? T.muted,
    }}>
      {Icon && <Icon size={10.5} />}
      {children}
    </span>
  );
}

export default function TemplateRow({
  template, uses, adding, onPreview, onUse, onCustomise,
}: {
  template: WorkflowTemplate;
  /**
   * How many times this has actually been used on this install.
   *
   * Null means "never", which is drawn as nothing at all rather than as a zero.
   * A gallery of thirty rows each reading "0 uses" is a gallery telling somebody
   * not to bother.
   */
  uses: number | null;
  adding: string;
  onPreview: () => void;
  onUse: () => void;
  onCustomise: () => void;
}) {
  const t = template;
  const difficulty = difficultyOf(t.nodes);
  const busy = adding === t.key;

  return (
    <article style={{
      background: '#fff', border: `1px solid ${T.line}`, borderRadius: 16, overflow: 'hidden',
      boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
    }}>
      <div style={{ display: 'flex', gap: 13, padding: '14px 16px 12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* The mark. Tinted by category so a scroll through thirty rows has
            something to navigate by other than the words. */}
        <span style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: `linear-gradient(135deg, ${T.accent}, ${T.violet})`, color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}><Layers size={17} /></span>

        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.ink, letterSpacing: '-0.01em' }}>
              {t.name}
            </h3>
            {t.featured && (
              <Badge tone={{ bg: T.accentSoft, fg: T.accent }} icon={Sparkles}>Popular</Badge>
            )}
          </div>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>
            {t.description}
          </p>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
            <Badge icon={Gauge} tone={DIFFICULTY_TONE[difficulty]}>{DIFFICULTY_LABEL[difficulty]}</Badge>
            <Badge icon={Clock}>{setupMinutes(t.nodes)} min setup</Badge>
            <Badge icon={Layers}>{t.nodes.length} steps</Badge>
            {usesAi(t.nodes) && <Badge icon={Sparkles} tone={{ bg: '#faf5ff', fg: '#7e22ce' }}>AI</Badge>}
            {/* Only when there is something true to say. */}
            {uses !== null && uses > 0 && (
              <Badge>{uses === 1 ? 'Used once here' : `Used ${uses} times here`}</Badge>
            )}
            {t.industry.slice(0, 3).map(i => <Badge key={i}>{i}</Badge>)}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 6, flexShrink: 0, minWidth: 148 }}>
          <button onClick={onUse} disabled={!!adding} className="press ap-btn"
            style={{ ...primaryBtn, justifyContent: 'center', padding: '8px 14px', opacity: adding && !busy ? 0.6 : 1 }}>
            {busy ? <><Loader size={12} className="spin" /> Adding…</> : <><Check size={12} /> Use Template</>}
          </button>
          <button onClick={onPreview} style={{ ...ghostBtn, justifyContent: 'center', borderRadius: 10, padding: '7px 14px' }}>
            <Eye size={12} /> Preview
          </button>
          <button onClick={onCustomise} style={{
            ...ghostBtn, justifyContent: 'center', borderRadius: 10, padding: '7px 14px',
            background: T.accentSoft, borderColor: `${T.accent}33`, color: T.accent,
          }}>
            <Wand2 size={12} /> Customize with AI
          </button>
        </div>
      </div>

      {/* ── The workflow itself ── */}
      <div style={{
        borderTop: `1px solid ${T.lineSoft}`, background: T.raised,
        padding: '12px 16px 14px',
      }}>
        <WorkflowCanvas nodes={t.nodes} live={false} compact />
      </div>
    </article>
  );
}
