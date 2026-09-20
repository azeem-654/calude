/**
 * The workflows belonging to one AI Autopilot project.
 *
 * ── Why a project has its own, rather than sharing the workspace's ──
 *
 * A sub-account runs several pushes at once — find dental clients, sell
 * supplements, win consultancy work — and each has its own follow-up. Listing
 * every workflow in the workspace against every project would mean the
 * plumbing client's "thanks for your enquiry" sitting next to the supplement
 * shop's abandoned-basket chase, with nothing but the name to tell them apart.
 *
 * `projectId` decides only which screen *lists* a workflow. The engine runs
 * every live graph identically wherever it was drawn — a workflow that behaved
 * differently depending on which screen made it would be the worst kind of
 * surprise.
 *
 * ── What this screen is and is not ──
 *
 * It is the plan and the state: the shape of each workflow, whether it is live,
 * and what it has actually done to real people. It is not a second editor —
 * "Open in the builder" goes to the one that already exists, because two
 * implementations of a node editor would drift the first time either changed.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Workflow, Plus, ChevronRight, Play, Pause, Zap, Clock, GitBranch,
  Mail, MessageSquare, Tag, Check, User, Edit2, X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Automation, AutomationNode } from '../../types/marketing';
import AutomationRuns from '../Marketing/AutomationRuns';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

/** One look per node type, shared by the chips and the legend. */
const NODE_LOOK: Record<string, { icon: typeof Zap; fg: string; bg: string; label: string }> = {
  trigger: { icon: Zap, fg: '#7c3aed', bg: '#f5f3ff', label: 'Starts when' },
  wait: { icon: Clock, fg: '#0891b2', bg: '#ecfeff', label: 'Wait' },
  condition: { icon: GitBranch, fg: '#b45309', bg: '#fffbeb', label: 'If' },
  send_email: { icon: Mail, fg: '#4f46e5', bg: '#eef2ff', label: 'Email' },
  send_sms: { icon: MessageSquare, fg: '#0d9488', bg: '#f0fdfa', label: 'Text' },
  add_tag: { icon: Tag, fg: '#16a34a', bg: '#f0fdf4', label: 'Tag' },
  remove_tag: { icon: Tag, fg: '#dc2626', bg: '#fef2f2', label: 'Untag' },
  create_task: { icon: Check, fg: '#9333ea', bg: '#fdf4ff', label: 'Task' },
  assign_to: { icon: User, fg: '#0369a1', bg: '#eff6ff', label: 'Assign' },
  update_field: { icon: Edit2, fg: '#374151', bg: '#f9fafb', label: 'Set' },
  end: { icon: X, fg: '#64748b', bg: '#f8fafc', label: 'End' },
};

const look = (t: string) => NODE_LOOK[t] ?? { icon: Workflow, fg: MUTED, bg: '#f4f5f7', label: t };

const id = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * The workflows worth offering a new project, and why these three.
 *
 * Each is a thing every trade actually does by hand and forgets to do: answer
 * the enquiry, chase the silence, thank the buyer. None of them sends without
 * a wait in front of it — an automation that fires the instant a form lands is
 * indistinguishable from an autoresponder, and the point is to look like a
 * person who got back to you quickly.
 */
function template(kind: 'welcome' | 'chase' | 'thanks', projectId: string): Omit<Automation, 'id'> {
  const base = { description: '', status: 'draft' as const, createdAt: new Date().toISOString(), enrolledCount: 0, completedCount: 0, projectId };
  const n = (nid: string, type: string, label: string, config: Record<string, string>, nextId: string | null, extra: Partial<AutomationNode> = {}): AutomationNode =>
    ({ id: nid, type: type as AutomationNode['type'], label, config, nextId, ...extra });

  if (kind === 'chase') {
    return {
      ...base, name: 'Chase an enquiry that went quiet',
      nodes: [
        n('n0', 'trigger', 'A form is submitted', { event: 'form_submitted' }, 'n1'),
        n('n1', 'wait', 'Wait 3 days', { days: '3' }, 'n2'),
        n('n2', 'condition', 'Already a customer?', { field: 'status', operator: 'equals', value: 'customer' }, null, { yesId: 'n5', noId: 'n3' }),
        n('n3', 'send_email', 'Still interested?', { subject: 'Still thinking it over, {{firstName}}?', body: 'Just checking you got my note — happy to answer anything.' }, 'n4'),
        n('n4', 'add_tag', 'Tag: chased', { tag: 'chased' }, 'n5'),
        n('n5', 'end', 'End', {}, null),
      ],
    };
  }
  if (kind === 'thanks') {
    return {
      ...base, name: 'Thank a new customer',
      nodes: [
        n('n0', 'trigger', 'A tag is added', { event: 'tag_added', tag: 'customer' }, 'n1'),
        n('n1', 'wait', 'Wait 1 day', { days: '1' }, 'n2'),
        n('n2', 'send_email', 'Thank you', { subject: 'Thanks, {{firstName}}', body: 'Really glad to be working with you. Anything you need, just reply.' }, 'n3'),
        n('n3', 'end', 'End', {}, null),
      ],
    };
  }
  return {
    ...base, name: 'Answer a new enquiry',
    nodes: [
      n('n0', 'trigger', 'A form is submitted', { event: 'form_submitted' }, 'n1'),
      n('n1', 'add_tag', 'Tag: enquiry', { tag: 'enquiry' }, 'n2'),
      /* Fifteen minutes, not instantly. Long enough not to read as a robot,
         short enough that somebody still has the page open. */
      n('n2', 'wait', 'Wait 15 minutes', { minutes: '15' }, 'n3'),
      n('n3', 'send_email', 'Acknowledge it', { subject: 'Thanks for getting in touch, {{firstName}}', body: 'I have your enquiry and will come back to you shortly.' }, 'n4'),
      n('n4', 'create_task', 'Remind me to call', { title: 'Call this enquiry back' }, 'n5'),
      n('n5', 'end', 'End', {}, null),
    ],
  };
}

const TEMPLATES: { kind: 'welcome' | 'chase' | 'thanks'; label: string; blurb: string }[] = [
  { kind: 'welcome', label: 'Answer a new enquiry', blurb: 'Tag it, wait a quarter of an hour, reply, and put a call on your list.' },
  { kind: 'chase', label: 'Chase one that went quiet', blurb: 'Three days later, unless they have already bought.' },
  { kind: 'thanks', label: 'Thank a new customer', blurb: 'A day after they are tagged as one.' },
];

/** The graph in reading order, following `nextId` rather than array order. */
function inOrder(nodes: AutomationNode[]): AutomationNode[] {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const out: AutomationNode[] = [];
  const seen = new Set<string>();
  let cur: AutomationNode | undefined = nodes.find(n => n.type === 'trigger') ?? nodes[0];
  /* `seen` is the same brake the engine has, for the same reason: `nextId` is
     drawn by hand and a graph pointing back at itself would hang the render. */
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.push(cur);
    const next: string | null = cur.nextId ?? cur.yesId ?? null;
    cur = next ? byId.get(next) : undefined;
  }
  return out;
}

export default function ProjectWorkflows({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const { automations, addAutomation, updateAutomation, addNotification } = useApp();
  const [openRuns, setOpenRuns] = useState('');

  const mine = automations.filter(a => a.projectId === projectId);

  function create(kind: 'welcome' | 'chase' | 'thanks') {
    const t = template(kind, projectId);
    addAutomation(t);
    /* Draft, never live. Every one of these sends something, and switching it
       on for somebody is exactly the permission a customer never granted. */
    addNotification(`"${t.name}" added as a draft — read it, then switch it on.`);
  }

  return (
    <section style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 15 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <Workflow size={15} color={ACCENT} />
        <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: INK }}>Workflows</h4>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: MUTED }}>{mine.length} for this project</span>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 11.5, color: MUTED, lineHeight: 1.55 }}>
        What happens on its own when somebody fills in a form, is tagged, or goes quiet. These run on the
        server every five minutes, so they keep working with the app closed.
      </p>

      {mine.length === 0 && (
        <div style={{ display: 'grid', gap: 7, marginBottom: 12 }}>
          {TEMPLATES.map(t => (
            <button key={t.kind} onClick={() => create(t.kind)} className="press" style={{
              display: 'flex', alignItems: 'flex-start', gap: 9, padding: '10px 12px', textAlign: 'left',
              border: `1px solid ${LINE}`, borderRadius: 11, background: '#fbfbfc', cursor: 'pointer',
              fontFamily: 'inherit', width: '100%',
            }}>
              <Plus size={13} color={ACCENT} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK }}>{t.label}</span>
                <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 1, lineHeight: 1.5 }}>{t.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {mine.map(a => {
          const live = a.status === 'active';
          const chain = inOrder(a.nodes ?? []);
          return (
            <article key={a.id} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 9 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>{a.name}</span>
                <span style={{
                  padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800,
                  background: live ? '#ecfdf5' : a.status === 'paused' ? '#fffbeb' : '#f1f5f9',
                  color: live ? '#16a34a' : a.status === 'paused' ? '#b45309' : '#64748b',
                }}>{live ? 'Live' : a.status === 'paused' ? 'Paused' : 'Draft'}</span>
                <span style={{ flex: 1 }} />
                <button onClick={() => updateAutomation(a.id, { status: live ? 'paused' : 'active' })}
                  className="press" style={pill()}>
                  {live ? <><Pause size={10} /> Pause</> : <><Play size={10} /> Switch on</>}
                </button>
                <button onClick={() => navigate('/marketing?tab=automations')} className="press" style={pill()}>
                  Edit <ChevronRight size={10} />
                </button>
              </div>

              {/* The shape of it, left to right. Enough to recognise a workflow
                  and check it is the one you meant, not enough to pretend this
                  is an editor. */}
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', marginBottom: 9 }}>
                {chain.map((nd, i) => {
                  const L = look(nd.type);
                  const Ic = L.icon;
                  return (
                    <span key={nd.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {i > 0 && <span aria-hidden style={{ width: 10, height: 1, background: '#d6dae1' }} />}
                      <span title={nd.label} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px',
                        borderRadius: 999, background: L.bg, color: L.fg, fontSize: 10.5, fontWeight: 700,
                        maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        <Ic size={10} /> {nd.label || L.label}
                      </span>
                    </span>
                  );
                })}
                {chain.length < (a.nodes?.length ?? 0) && (
                  /* A branch leaves nodes off the straight line, and a silent
                     omission would read as steps that are not there. */
                  <span style={{ fontSize: 10.5, color: MUTED }}>
                    +{(a.nodes?.length ?? 0) - chain.length} more on other branches
                  </span>
                )}
              </div>

              <button onClick={() => setOpenRuns(openRuns === a.id ? '' : a.id)} className="press" style={{
                ...pill(), borderStyle: 'dashed',
              }}>
                {openRuns === a.id ? 'Hide' : 'Show'} what it has done
              </button>

              {openRuns === a.id && (
                <div style={{ marginTop: 10 }}><AutomationRuns automationId={a.id} /></div>
              )}
            </article>
          );
        })}
      </div>

      {mine.length > 0 && (
        <button onClick={() => create('welcome')} className="press" style={{ ...pill(), marginTop: 10 }}>
          <Plus size={10} /> Add another
        </button>
      )}
    </section>
  );
}

function pill(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px',
    borderRadius: 999, border: `1px solid ${LINE}`, background: '#fff',
    fontSize: 10.5, fontWeight: 700, color: INK, cursor: 'pointer', fontFamily: 'inherit',
  };
}
