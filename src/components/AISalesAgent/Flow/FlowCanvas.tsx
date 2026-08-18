/**
 * The campaign as a canvas you can rearrange.
 *
 * Nodes drag, ports join with wires, the view pans and zooms, and pressing Run
 * walks the wires calling the services that already own each step. The graph is
 * a view onto the campaign rather than a copy of it: move every node into a
 * pile and the campaign is unchanged; delete the graph and the campaign is
 * still there.
 *
 * Pointer events throughout rather than mouse events, so a finger on a tablet
 * drags a node the same way a mouse does. Positions are kept in canvas
 * coordinates and converted at the edges, which is what keeps dragging correct
 * at any zoom — the usual bug here is a node that moves twice as fast as the
 * pointer once you have zoomed out.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Ban, Crosshair, Eye, FileText, Hammer, Loader, Mail, Maximize2,
  Minus, Play, Plus, Search, Sparkles, Target, Trash2, Wand2,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import {
  addNode, canConnect, configureNode, connect, defaultGraph, disconnect, loadGraph,
  moveNode, problems, removeNode, runOrder, runnable, saveGraph, toggleNode,
} from '../../../services/aiFlow';
import { nodeStatus, runFlow } from '../../../services/aiFlowRun';
import { NODE_SPECS, type FlowEdge, type FlowGraph, type FlowNode, type FlowNodeKind, type FlowStepResult } from '../../../types/aiFlow';
import type { AICampaign } from '../../../types/aiSalesAgent';
import './flow.css';

/* ── Geometry ─────────────────────────────────────────────────────────── */

const NODE_W = 216;
/** Head plus body; ports are placed against this. */
const NODE_H = 108;
const PORT_TOP = 62;
const PORT_GAP = 22;

const ICON: Record<FlowNodeKind, typeof Play> = {
  objective: FileText, plan: Target, prospects: Search, build: Hammer,
  sequence: Mail, send: Play, measure: Eye, rewrite: Wand2,
};

const portY = (i: number) => PORT_TOP + i * PORT_GAP;

function outPoint(n: FlowNode, port: string) {
  const i = Math.max(0, NODE_SPECS[n.kind].outputs.findIndex(p => p.id === port));
  return { x: n.x + NODE_W, y: n.y + portY(i) };
}
function inPoint(n: FlowNode, port: string) {
  const i = Math.max(0, NODE_SPECS[n.kind].inputs.findIndex(p => p.id === port));
  return { x: n.x, y: n.y + portY(i) };
}

/** A cubic that leaves to the right and arrives from the left. */
function wirePath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const reach = Math.max(48, Math.min(190, Math.abs(b.x - a.x) * 0.55));
  return `M ${a.x} ${a.y} C ${a.x + reach} ${a.y}, ${b.x - reach} ${b.y}, ${b.x} ${b.y}`;
}

/* ── The canvas ───────────────────────────────────────────────────────── */

interface Drag {
  kind: 'node' | 'pan' | 'wire';
  id?: string;
  /** Pointer offset from the node's own origin, in canvas units. */
  dx?: number;
  dy?: number;
  from?: { node: string; port: string };
  at?: { x: number; y: number };
}

export default function FlowCanvas({ campaign, onChanged }: { campaign: AICampaign; onChanged: () => void }) {
  const app = useApp();
  const { addNotification } = app;

  const [graph, setGraph] = useState<FlowGraph>(() => loadGraph(campaign.id));
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<FlowStepResult[]>([]);
  const [adding, setAdding] = useState(false);

  const surface = useRef<HTMLDivElement | null>(null);

  /* Every change is written straight through; there is no separate save button
     to forget to press, and the graph is small. */
  const commit = useCallback((next: FlowGraph) => {
    setGraph(next);
    saveGraph(next);
  }, []);

  const status = useMemo(
    () => nodeStatus(campaign.id, app),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campaign, app.contacts, app.sequences, app.appointments, app.bookings, log],
  );
  const issues = useMemo(() => problems(graph), [graph]);
  const willRun = useMemo(() => new Set(runnable(graph).map(n => n.id)), [graph]);

  /** Screen coordinates to canvas coordinates. */
  const toCanvas = useCallback((e: { clientX: number; clientY: number }) => {
    const box = surface.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return { x: (e.clientX - box.left - view.x) / view.z, y: (e.clientY - box.top - view.y) / view.z };
  }, [view]);

  /* ── Pointer ── */

  const onPointerDownNode = (e: React.PointerEvent, node: FlowNode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const at = toCanvas(e);
    setSelected(node.id);
    setDrag({ kind: 'node', id: node.id, dx: at.x - node.x, dy: at.y - node.y });
  };

  const onPointerDownPort = (e: React.PointerEvent, node: FlowNode, port: string) => {
    e.stopPropagation();
    /*
     * Deliberately no pointer capture here. Capturing on the port the wire
     * leaves from sends every later pointer event back to that same element,
     * so the port it is dropped on never sees the pointerup and the wire can
     * never land. Moves and releases bubble to the canvas instead, which
     * covers the whole area anyway.
     */
    setDrag({ kind: 'wire', from: { node: node.id, port } });
    setPointer(toCanvas(e));
  };

  /** Would the wire being dragged land on this port? */
  const wouldAccept = (node: FlowNode, port: string) =>
    drag?.kind === 'wire' && !!drag.from && canConnect(graph, drag.from, { node: node.id, port }).ok;

  const onPointerDownSurface = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setSelected(null);
    setAdding(false);
    setDrag({ kind: 'pan', at: { x: e.clientX - view.x, y: e.clientY - view.y } });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.kind === 'pan' && drag.at) {
      setView(v => ({ ...v, x: e.clientX - drag.at!.x, y: e.clientY - drag.at!.y }));
      return;
    }
    const at = toCanvas(e);
    if (drag.kind === 'node' && drag.id) {
      /* Local state while dragging, written once on release — saving on every
         frame would put a hundred writes through storage for one gesture. */
      setGraph(g => moveNode(g, drag.id!, { x: at.x - (drag.dx ?? 0), y: at.y - (drag.dy ?? 0) }));
    } else if (drag.kind === 'wire') {
      setPointer(at);
    }
  };

  const onPointerUp = () => {
    if (drag?.kind === 'node') saveGraph(graph);
    setDrag(null);
  };

  /** Finish a wire on the port it was released over. */
  const dropOnPort = (e: React.PointerEvent, node: FlowNode, port: string) => {
    e.stopPropagation();
    if (drag?.kind !== 'wire' || !drag.from) return;
    const check = canConnect(graph, drag.from, { node: node.id, port });
    if (!check.ok) { addNotification(check.reason ?? 'Those two will not join.', 'error'); setDrag(null); return; }
    const next = connect(graph, drag.from, { node: node.id, port });
    if (next) commit(next);
    setDrag(null);
  };

  /* Zoom about the pointer, so the thing under the cursor stays under it. */
  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      const px = e.clientX - box.left;
      const py = e.clientY - box.top;
      setView(v => {
        const z = Math.max(0.45, Math.min(1.6, v.z * (e.deltaY > 0 ? 0.92 : 1.08)));
        const k = z / v.z;
        return { z, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /* Delete removes whatever is selected. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        commit(removeNode(graph, selected));
        setSelected(null);
      }
      if (e.key === 'Escape') { setDrag(null); setAdding(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, graph, commit]);

  /** Fit every node into view. */
  const fit = useCallback(() => {
    const box = surface.current?.getBoundingClientRect();
    if (!box || !graph.nodes.length) return;
    const xs = graph.nodes.map(n => n.x);
    const ys = graph.nodes.map(n => n.y);
    const minX = Math.min(...xs) - 40;
    const minY = Math.min(...ys) - 40;
    const maxX = Math.max(...xs) + NODE_W + 40;
    const maxY = Math.max(...ys) + NODE_H + 40;
    const z = Math.max(0.45, Math.min(1.2, Math.min(box.width / (maxX - minX), box.height / (maxY - minY))));
    setView({ z, x: (box.width - (maxX - minX) * z) / 2 - minX * z, y: (box.height - (maxY - minY) * z) / 2 - minY * z });
  }, [graph.nodes]);

  useEffect(() => { fit(); /* once, on the first paint */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Running ── */

  const run = async () => {
    setBusy(true);
    setLog([]);
    const live: FlowStepResult[] = [];
    const result = await runFlow(campaign.id, graph, app, step => {
      live.push(step);
      setRunning(step.nodeId);
      setLog([...live]);
    });
    setRunning(null);
    setBusy(false);
    if (result.stoppedBecause) addNotification(result.stoppedBecause, 'error');
    else addNotification(result.ok ? 'The flow ran to the end.' : 'The flow ran, and something did not work.', result.ok ? 'success' : 'error');
    onChanged();
  };

  const addAt = (kind: FlowNodeKind) => {
    const box = surface.current?.getBoundingClientRect();
    const at = box
      ? { x: (box.width / 2 - view.x) / view.z - NODE_W / 2, y: (box.height / 2 - view.y) / view.z - NODE_H / 2 }
      : { x: 80, y: 80 };
    const next = addNode(graph, kind, at);
    if (!next) { addNotification(`There can only be one ${NODE_SPECS[kind].title} node.`, 'error'); return; }
    commit(next);
    /* Selected on arrival. Without this the toolbar's Skip and Remove still
       point at whatever was selected before, so adding a node and pressing
       Remove deletes something else entirely. */
    setSelected(next.nodes.at(-1)?.id ?? null);
    setAdding(false);
  };

  const byId = useMemo(() => new Map(graph.nodes.map(n => [n.id, n])), [graph.nodes]);
  const liveEdge = (e: FlowEdge) => running !== null && (e.to === running || e.from === running);

  return (
    <div
      className="flow"
      ref={surface}
      style={{ height: 'clamp(460px, 70vh, 760px)' }}
      onPointerDown={onPointerDownSurface}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="flow-grid" style={{
        backgroundSize: `${26 * view.z}px ${26 * view.z}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }} />

      <div className="flow-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
        <svg className="flow-wires" width="4000" height="3000">
          {graph.edges.map(e => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            const d = wirePath(outPoint(a, e.fromPort), inPoint(b, e.toPort));
            return (
              <g key={e.id} className="flow-wire-group" data-live={liveEdge(e)}>
                <path className="flow-wire-glow" d={d} />
                <path className="flow-wire" d={d} />
                <path
                  className="flow-wire-hit" d={d}
                  onPointerDown={ev => { ev.stopPropagation(); commit(disconnect(graph, e.id)); }}
                >
                  <title>Click to unjoin</title>
                </path>
              </g>
            );
          })}

          {drag?.kind === 'wire' && drag.from && byId.get(drag.from.node) && (
            <path className="flow-wire-draft"
              d={wirePath(outPoint(byId.get(drag.from.node)!, drag.from.port), pointer)} />
          )}
        </svg>

        {graph.nodes.map(node => {
          const spec = NODE_SPECS[node.kind];
          const Icon = ICON[node.kind];
          const s = status[node.kind] ?? { value: '—' };
          const nodeIssues = issues.filter(p => p.nodeId === node.id);
          return (
            <div
              key={node.id}
              className="flow-node"
              style={{ left: node.x, top: node.y }}
              data-selected={selected === node.id}
              data-dragging={drag?.kind === 'node' && drag.id === node.id}
              data-running={running === node.id}
              data-disabled={!!node.disabled}
              onPointerDown={e => onPointerDownNode(e, node)}
            >
              {nodeIssues.length > 0 && (
                <span className="flow-problem" title={nodeIssues.map(p => p.message).join(' ')}>
                  <AlertTriangle size={9} />
                </span>
              )}

              <div className="flow-node-head">
                <span className="flow-node-icon"><Icon size={14} strokeWidth={2.1} /></span>
                <span style={{ minWidth: 0 }}>
                  <span className="flow-node-title" style={{ display: 'block' }}>{spec.title}</span>
                  <span className="flow-node-sub">{spec.subtitle}</span>
                </span>
              </div>

              <div className="flow-node-body">
                <div className="flow-node-value">{s.value}</div>
                {s.note && <div className="flow-node-note">{s.note}</div>}

                {node.kind === 'prospects' && (
                  <select
                    value={node.config?.source ?? 'crm'}
                    onPointerDown={e => e.stopPropagation()}
                    onChange={e => commit(configureNode(graph, node.id, { source: e.target.value }))}
                    style={{
                      marginTop: 9, width: '100%', padding: '5px 7px', borderRadius: 7,
                      background: '#10140f', color: '#eef1ea', border: '1px solid #2a302a',
                      font: 'inherit', fontSize: 11,
                    }}
                  >
                    <option value="crm">Your contacts</option>
                    <option value="google-places">Google Places</option>
                  </select>
                )}
              </div>

              {spec.inputs.map((p, i) => (
                <span key={p.id}>
                  <span
                    className="flow-port"
                    style={{ left: -7, top: portY(i) - 6 }}
                    data-wired={graph.edges.some(e => e.to === node.id && e.toPort === p.id)}
                    data-armed={wouldAccept(node, p.id)}
                    onPointerUp={e => dropOnPort(e, node, p.id)}
                    onPointerDown={e => e.stopPropagation()}
                    title={p.label}
                  />
                  <span className="flow-port-label" style={{ left: 12, top: portY(i) }}>{p.label}</span>
                </span>
              ))}

              {spec.outputs.map((p, i) => (
                <span key={p.id}>
                  <span
                    className="flow-port"
                    style={{ right: -7, top: portY(i) - 6 }}
                    data-wired={graph.edges.some(e => e.from === node.id && e.fromPort === p.id)}
                    onPointerDown={e => onPointerDownPort(e, node, p.id)}
                    title={p.label}
                  />
                  <span className="flow-port-label" style={{ right: 12, top: portY(i) }}>{p.label}</span>
                </span>
              ))}
            </div>
          );
        })}
      </div>

      {/* ── Chrome ── */}

      <div className="flow-bar flow-bar-top" onPointerDown={e => e.stopPropagation()}>
        <button className="flow-btn flow-btn-primary" onClick={run} disabled={busy}>
          {busy ? <><Loader size={13} className="spin" /> Running…</> : <><Play size={13} /> Run the flow</>}
        </button>
        <button className="flow-btn" data-on={adding} onClick={() => setAdding(a => !a)}>
          <Plus size={13} /> Add a node
        </button>
        {selected && (
          <>
            <button className="flow-btn" onClick={() => { commit(toggleNode(graph, selected)); }}>
              <Ban size={13} /> {byId.get(selected)?.disabled ? 'Enable' : 'Skip'}
            </button>
            <button className="flow-btn" onClick={() => { commit(removeNode(graph, selected)); setSelected(null); }}>
              <Trash2 size={13} /> Remove
            </button>
          </>
        )}
      </div>

      {adding && (
        <div className="flow-bar" style={{ top: 62, left: 12, flexDirection: 'column', alignItems: 'stretch' }}
          onPointerDown={e => e.stopPropagation()}>
          {(Object.keys(NODE_SPECS) as FlowNodeKind[]).map(kind => {
            const spec = NODE_SPECS[kind];
            const taken = !!spec.unique && graph.nodes.some(n => n.kind === kind);
            const Icon = ICON[kind];
            return (
              <button key={kind} className="flow-btn" disabled={taken} onClick={() => addAt(kind)}
                style={{ justifyContent: 'flex-start' }}>
                <Icon size={13} /> {spec.title}
                {taken && <span style={{ marginLeft: 'auto', fontSize: 10 }}>on the canvas</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="flow-bar flow-bar-right" onPointerDown={e => e.stopPropagation()}>
        <button className="flow-btn" onClick={() => { commit(defaultGraph(campaign.id)); setLog([]); setTimeout(fit, 0); }}>
          <Sparkles size={13} /> Reset the layout
        </button>
      </div>

      <div className="flow-bar flow-bar-zoom" onPointerDown={e => e.stopPropagation()}>
        <button className="flow-btn" aria-label="Zoom in" onClick={() => setView(v => ({ ...v, z: Math.min(1.6, v.z * 1.15) }))}><Plus size={14} /></button>
        <button className="flow-btn" aria-label="Zoom out" onClick={() => setView(v => ({ ...v, z: Math.max(0.45, v.z / 1.15) }))}><Minus size={14} /></button>
        <button className="flow-btn" aria-label="Fit to view" onClick={fit}><Maximize2 size={14} /></button>
        <button className="flow-btn" aria-label="Centre" onClick={() => setView(v => ({ ...v, x: 0, y: 0 }))}><Crosshair size={14} /></button>
      </div>

      {log.length > 0 && (
        <div className="flow-log" onPointerDown={e => e.stopPropagation()}>
          {log.map((s, i) => (
            <div key={`${s.nodeId}-${i}`} className="flow-log-row">
              <span style={{ color: s.ok ? 'var(--wire-lit)' : 'var(--danger)', flexShrink: 0 }}>
                {s.ok ? '✓' : '✕'}
              </span>
              <span style={{ minWidth: 0 }}>
                <b>{NODE_SPECS[s.kind].title}</b> — <span>{s.summary}</span>
                {s.detail && <div style={{ color: 'var(--text-faint)', marginTop: 2 }}>{s.detail}</div>}
              </span>
            </div>
          ))}
        </div>
      )}

      {log.length === 0 && (
        <p className="flow-hint">
          Drag a node · pull a wire from a port · {willRun.size} of {runOrder(graph).order.length} will run
        </p>
      )}
    </div>
  );
}
