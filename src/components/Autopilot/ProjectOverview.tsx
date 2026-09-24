/**
 * A project's Overview: what it is for, and what it has done about it.
 *
 * ── Where it comes from ──
 *
 * The blueprint the customer approved in the wizard is stored on the project
 * (`crm_projects.brief`) and read back here, so the page says the same thing
 * the screen they agreed to said: its outputs, where they land, what waits for
 * approval, what stays with them. Beside that, the live facts — the workflows
 * that exist now and whether they are on, and the latest things it made, each
 * one a link to the real record.
 *
 * A project made before the brief existed has none, and the Overview says what
 * it can from the project itself rather than inventing a blueprint for it.
 */
import { useNavigate } from 'react-router-dom';
import {
  Target, PackageCheck, MapPin, UserCheck, Hand, Bot, Workflow as WorkflowIcon, Plus, ArrowRight,
  CheckCircle2, Circle, Info, Sparkles,
} from 'lucide-react';
import type { Project } from '../../services/projects';
import type { AgentRun, ProjectWorkflow } from '../../services/autopilot';
import { T } from './theme';

export interface OverviewAsset { id: string; name: string; kind: string; route: string; at: string }

const box: React.CSSProperties = {
  border: `1px solid ${T.line}`, borderRadius: 14, padding: '12px 13px', background: T.panel, minWidth: 0,
};
const h: React.CSSProperties = {
  margin: '0 0 8px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.07em', color: T.muted,
  textTransform: 'uppercase', display: 'flex', gap: 6, alignItems: 'center',
};

function List({ title, icon: Icon, items }: { title: string; icon: typeof Target; items: string[] }) {
  if (!items.length) return null;
  return (
    <div style={box}>
      <h4 style={h}><Icon size={12} /> {title}</h4>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 5 }}>
        {items.map(i => <li key={i} style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.5 }}>• {i}</li>)}
      </ul>
    </div>
  );
}

export default function ProjectOverview({ project, flows, runs, assets, onCreateWorkflow, onOpenWorkflows }: {
  project: Project;
  flows: ProjectWorkflow[];
  runs: AgentRun[];
  assets: OverviewAsset[];
  onCreateWorkflow: () => void;
  onOpenWorkflows: () => void;
}) {
  const navigate = useNavigate();
  const brief = project.brief ?? null;
  const plan = project.launchSteps ?? [];
  const failed = runs.filter(r => r.outcome === 'failed').slice(0, 2);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{
        borderRadius: 16, padding: '14px 16px', color: '#fff',
        background: 'radial-gradient(120% 140% at 0% 0%, #6d5ef0 0%, #4a36d6 50%, #1d1a3a 100%)',
      }}>
        <span style={{ display: 'flex', gap: 8, fontSize: 14, lineHeight: 1.55, fontWeight: 600 }}>
          <Target size={15} style={{ flexShrink: 0, marginTop: 3 }} /> {project.objective || 'No objective written yet.'}
        </span>
        {brief?.prompt && brief.prompt !== project.objective && (
          <span style={{ display: 'block', marginTop: 8, fontSize: 12, opacity: 0.8, lineHeight: 1.5 }}>
            You asked: &ldquo;{brief.prompt.slice(0, 240)}{brief.prompt.length > 240 ? '…' : ''}&rdquo;
          </span>
        )}
        <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 12, opacity: 0.92 }}>
          <span><b>{flows.length}</b> workflow{flows.length === 1 ? '' : 's'}</span>
          <span><b>{flows.filter(f => f.status === 'active').length}</b> on</span>
          <span><b>{assets.length}</b> thing{assets.length === 1 ? '' : 's'} made</span>
        </span>
      </div>

      {/* Workflows first, with the button always here — a new project must be
          able to add one before it has any. */}
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <h4 style={{ ...h, margin: 0, flex: 1 }}><WorkflowIcon size={12} /> Workflows</h4>
          <button onClick={onCreateWorkflow} className="press" style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 9,
            border: 'none', background: T.accent, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}><Plus size={12} /> Create workflow</button>
        </div>
        {flows.length ? (
          <div style={{ display: 'grid', gap: 6 }}>
            {flows.map(f => (
              <button key={f.id} onClick={onOpenWorkflows} className="press" style={{
                display: 'flex', gap: 8, alignItems: 'center', textAlign: 'left', padding: '8px 10px', borderRadius: 10,
                border: `1px solid ${T.lineSoft}`, background: T.raised, cursor: 'pointer', fontFamily: 'inherit', minWidth: 0,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, flexShrink: 0, background: f.status === 'active' ? T.good : T.faint }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span style={{ fontSize: 11, color: f.status === 'active' ? T.good : T.muted, fontWeight: 700, flexShrink: 0 }}>
                  {f.status === 'active' ? 'On' : f.status === 'paused' ? 'Paused' : 'Draft'}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>
            None yet. Create one with AI, from a template, or from scratch.
          </p>
        )}
      </div>

      {/* What it made — every tile a real record, every one clickable. */}
      <div style={box}>
        <h4 style={h}><PackageCheck size={12} /> Latest outputs</h4>
        {assets.length ? (
          <div style={{ display: 'grid', gap: 5 }}>
            {assets.slice(0, 6).map(a => (
              <button key={a.id} onClick={() => a.route && navigate(a.route)} className="press" style={{
                display: 'flex', gap: 8, alignItems: 'center', textAlign: 'left', padding: '7px 9px', borderRadius: 9,
                border: 'none', background: T.raised, cursor: a.route ? 'pointer' : 'default', fontFamily: 'inherit', minWidth: 0,
              }}>
                <Sparkles size={12} color={T.accent} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <b style={{ textTransform: 'capitalize' }}>{a.kind}</b> — {a.name}
                </span>
                {a.route && <ArrowRight size={12} color={T.muted} style={{ flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>
            Nothing made yet. The first output appears here, and in its own module, as soon as a workflow runs.
          </p>
        )}
        {failed.map(f => (
          <p key={f.id} style={{ margin: '8px 0 0', fontSize: 12, color: T.warn, lineHeight: 1.5 }}>Needs you: {f.detail}</p>
        ))}
      </div>

      {plan.length > 0 && (
        <div style={box}>
          <h4 style={h}><CheckCircle2 size={12} /> Set-up</h4>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
            {plan.map(s => (
              <li key={s.label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: T.ink, lineHeight: 1.5 }}>
                <Circle size={12} color={T.faint} style={{ flexShrink: 0, marginTop: 3 }} />
                <span style={{ minWidth: 0 }}>
                  {s.label}
                  {s.route && (
                    <button onClick={() => navigate(s.route)} style={{ marginLeft: 6, border: 'none', background: 'none', padding: 0, color: T.accent, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Go →
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {brief ? (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 230px), 1fr))' }}>
          <List title="Expected outputs" icon={PackageCheck} items={brief.outputs ?? []} />
          {(brief.destinations ?? []).length > 0 && (
            <div style={box}>
              <h4 style={h}><MapPin size={12} /> Where results land</h4>
              <div style={{ display: 'grid', gap: 5 }}>
                {(brief.destinations ?? []).map(d => (
                  <button key={d.label} onClick={() => navigate(d.route)} style={{ textAlign: 'left', border: 'none', background: 'none', padding: 0, color: T.accent, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {d.label} →
                  </button>
                ))}
              </div>
            </div>
          )}
          <List title="AI agents" icon={Bot} items={(brief.agents ?? []).map(a => `${a.name} — ${a.role}`)} />
          <List title="Waits for your approval" icon={UserCheck} items={brief.approvals ?? []} />
          <List title="Yours to do" icon={Hand} items={brief.manual ?? []} />
          <List title="Worth knowing" icon={Info} items={brief.limits ?? []} />
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: T.muted, lineHeight: 1.55 }}>
          This project was set up before blueprints were kept, so there is no plan to show here — its workflows and outputs above are the whole story.
        </p>
      )}
    </div>
  );
}
