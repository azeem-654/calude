/**
 * A template, in full, before anybody commits to it.
 *
 * ── Why this exists rather than a tooltip ──
 *
 * The lesson from every template gallery worth using: somebody has to see
 * exactly what they are about to get, before they get it. The row shows the
 * shape; this shows the whole thing — every step drawn, what has to be
 * connected, what comes out of it, and what it is honest to expect.
 *
 * The graph is the same `WorkflowCanvas` over the same `nodes` the engine
 * walks, so a preview cannot drift from what gets added. That is the property
 * that makes a preview worth trusting at all.
 */
import { X, Check, Loader, AlertTriangle, Zap, Info, Package, Building2 } from 'lucide-react';
import WorkflowCanvas from './WorkflowCanvas';
import { DIFFICULTY_LABEL, difficultyOf, outputsOf, setupMinutes } from './templateMeta';
import type { WorkflowTemplate } from './workflowTemplates';
import { T, ghostBtn, primaryBtn } from './theme';

function Panel({ icon: Icon, title, tone, children }: {
  icon: typeof Info;
  title: string;
  tone?: 'warn';
  children: React.ReactNode;
}) {
  const warn = tone === 'warn';
  return (
    <div style={{
      border: `1px solid ${warn ? `${T.warn}44` : T.line}`, borderRadius: 13, padding: '12px 14px',
      background: warn ? T.warnSoft : T.raised, color: T.ink,
    }}>
      <span style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7,
        fontSize: 11.5, fontWeight: 800, color: warn ? T.warn : T.ink,
      }}>
        <Icon size={12} /> {title}
      </span>
      {children}
    </div>
  );
}

const list: React.CSSProperties = { margin: 0, paddingLeft: 17, display: 'grid', gap: 4 };

export default function TemplatePreviewModal({
  template, adding, projectName, onUse, onClose,
}: {
  template: WorkflowTemplate;
  adding: string;
  projectName: string;
  onUse: () => void;
  onClose: () => void;
}) {
  const t = template;
  const busy = adding === t.key;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.name}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,17,23,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div style={{
        width: 'min(1000px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        background: '#fff', borderRadius: 18, overflow: 'hidden',
        boxShadow: '0 24px 70px -20px rgba(16,24,40,0.45)',
      }}>
        <header style={{
          display: 'flex', alignItems: 'flex-start', gap: 11, padding: '15px 17px',
          borderBottom: `1px solid ${T.line}`, flexShrink: 0,
        }}>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', fontSize: 16, fontWeight: 800, color: T.ink, letterSpacing: '-0.01em' }}>
              {t.name}
            </span>
            <span style={{ display: 'block', fontSize: 12.5, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>
              {t.description}
            </span>
          </span>
          <button onClick={onClose} aria-label="Close" style={{
            border: 'none', background: 'none', padding: 4, cursor: 'pointer', color: T.muted, display: 'flex',
          }}><X size={18} /></button>
        </header>

        <div style={{ overflowY: 'auto', padding: 17, flex: 1, minHeight: 0, display: 'grid', gap: 13 }}>
          {/* The problem, first. Somebody deciding whether they need this is
              matching it against a complaint, not against a feature list. */}
          <p style={{
            margin: 0, padding: '12px 14px', borderRadius: 13,
            background: T.accentSoft, border: `1px solid ${T.accent}22`,
            fontSize: 13, color: T.ink, lineHeight: 1.6,
          }}>{t.pain}</p>

          <p style={{ margin: 0, fontSize: 12.5, color: T.muted, lineHeight: 1.65 }}>{t.blurb}</p>

          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {[
              `${DIFFICULTY_LABEL[difficultyOf(t.nodes)]} to set up`,
              `About ${setupMinutes(t.nodes)} minutes`,
              `${t.nodes.length} steps`,
            ].map(x => (
              <span key={x} style={{
                padding: '4px 11px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                background: T.lineSoft, color: T.muted,
              }}>{x}</span>
            ))}
          </div>

          <div style={{ border: `1px solid ${T.line}`, borderRadius: 13, padding: 13, background: T.raised }}>
            <span style={{
              display: 'block', fontSize: 10.5, fontWeight: 800, color: T.muted,
              letterSpacing: '0.04em', marginBottom: 10,
            }}>THE WHOLE WORKFLOW</span>
            <WorkflowCanvas nodes={t.nodes} live={false} />
          </div>

          <div style={{
            display: 'grid', gap: 11,
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
          }}>
            <Panel icon={AlertTriangle} tone="warn" title="What it needs before it can run">
              <ul style={{ ...list }}>
                {t.needs.map(x => <li key={x} style={{ fontSize: 12, lineHeight: 1.55 }}>{x}</li>)}
              </ul>
            </Panel>

            <Panel icon={Package} title="What comes out of it">
              <ul style={{ ...list }}>
                {outputsOf(t.nodes).map(x => <li key={x} style={{ fontSize: 12, lineHeight: 1.55 }}>{x}</li>)}
              </ul>
            </Panel>

            <Panel icon={Zap} title="What is reasonable to expect">
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>{t.outcome}</p>
            </Panel>

            <Panel icon={Building2} title="Written for">
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>{t.industry.join(' · ')}</p>
            </Panel>
          </div>

          {t.evidence && (
            <Panel icon={Info} title="What the industry says">
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>{t.evidence.claim}</p>
              {/* The source travels with the number. All of these are vendor or
                  agency published rather than independent research, and a figure
                  with no source attached would be this product vouching for
                  somebody else's marketing. */}
              <p style={{ margin: '6px 0 0', fontSize: 10.5, color: T.faint }}>
                {t.evidence.source} — published by the industry, not measured by us.
              </p>
            </Panel>
          )}
        </div>

        <footer style={{
          display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap',
          padding: '13px 17px', borderTop: `1px solid ${T.line}`, flexShrink: 0,
        }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
            {projectName
              ? <>Adds to <strong style={{ color: T.ink }}>{projectName}</strong> as a draft. Every step is
                yours to change, and nothing reaches anybody until you switch it on.</>
              : 'Choose a project in the assistant panel first — a workflow belongs to one.'}
          </span>
          <button onClick={onClose} style={ghostBtn}>Keep looking</button>
          <button onClick={onUse} disabled={!!adding || !projectName} className="press ap-btn" style={{
            ...primaryBtn, opacity: adding || !projectName ? 0.6 : 1,
            cursor: adding || !projectName ? 'default' : 'pointer',
          }}>
            {busy ? <><Loader size={13} className="spin" /> Adding…</> : <><Check size={13} /> Use this template</>}
          </button>
        </footer>
      </div>
    </div>
  );
}
