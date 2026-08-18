/**
 * The campaign as a canvas you can edit.
 *
 * Nodes drag, ports join with wires, the view pans and zooms, and pressing Run
 * walks the wires calling the services that already own each step. Beside it is
 * an inspector where the selected node's real settings live — the objective on
 * the campaign, the cadence on the strategy, the daily cap in the guardrails —
 * so this is a control surface rather than a diagram of one.
 *
 * The graph is a view onto the campaign, not a copy of it: move every node into
 * a pile and the campaign is unchanged; delete the graph and it is still there.
 *
 * Pointer events throughout rather than mouse events, so a finger on a tablet
 * drags a node the same way a mouse does. Positions are kept in canvas
 * coordinates and converted at the edges, which is what keeps dragging correct
 * at any zoom — the usual bug here is a node that moves twice as fast as the
 * pointer once you have zoomed out.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical,
  AlignStartHorizontal, AlignStartVertical, AlertTriangle, Copy, Eye, FileText, Grid3x3,
  Hammer, Hand, LayoutGrid, Loader, Magnet, Mail, Map as MapIcon, Maximize2, Minus, MousePointer2,
  Play, Plus, Redo2, Rows3, Search, Target, Trash2, Undo2, Wand2,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import {
  addNode, canConnect, configureNode, connect, disconnect, loadGraph,
  moveNode, problems, removeNode, runOrder, runnable, saveGraph, toggleNode,
} from '../../../services/aiFlow';
import {
  align, bounds, distribute, duplicate, NODE_H, NODE_W, snap, tidy, type Align,
} from '../../../services/aiFlowLayout';
import { flowId } from '../../../services/aiFlow';
import { nodeStatus, runFlow } from '../../../services/aiFlowRun';
import {
  NODE_SPECS, type FlowEdge, type FlowGraph, type FlowNode, type FlowNodeKind, type FlowStepResult,
} from '../../../types/aiFlow';
import type { AICampaign } from '../../../types/aiSalesAgent';
import { useFlowHistory } from './useFlowHistory';
import Inspector from './Inspector';
import './flow.css';

/* ── Geometry ─────────────────────────────────────────────────────────── */

const PORT_TOP = 62;
const PORT_GAP = 22;
const GRID = 20;

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

const overlaps = (n: FlowNode, box: { x1: number; y1: number; x2: number; y2: number }) =>
  n.x < Math.max(box.x1, box.x2) && n.x + NODE_W > Math.min(box.x1, box.x2)
  && n.y < Math.max(box.y1, box.y2) && n.y + NODE_H > Math.min(box.y1, box.y2);

/* ── The canvas ───────────────────────────────────────────────────────── */

type Tool = 'select' | 'pan';

interface Drag {
  kind: 'node' | 'pan' | 'wire' | 'marquee';
  /** Pointer offset from each dragged node's origin, in canvas units. */
  grab?: Map<string, { dx: number; dy: number }>;
  from?: { node: string; port: string };
  at?: { x: number; y: number };
  box?: { x1: number; y1: number; x2: number; y2: number };
  /** The node the gesture started on, for a click that turns out not to drag. */
  on?: string;
  /** Whether the pointer actually travelled. */
  moved?: boolean;
}

export default function FlowCanvas({ campaign, onChanged }: { campaign: AICampaign; onChanged: () => void }) {
  const app = useApp();
  const { addNotification } = app;
  const [, setParams] = useSearchParams();

  const history = useFlowHistory(loadGraph(campaign.id), saveGraph);
  const graph = history.graph;

  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  /*
   * The gesture lives in a ref as well as in state. A quick click fires
   * pointerdown and pointerup in the same task, before React has committed the
   * render that would put the new gesture into the handlers' closure — so the
   * pointerup would see the *previous* value and do nothing. The ref is the
   * source of truth for the handlers; the state exists so the marquee and the
   * half-drawn wire can be drawn.
   */
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  const setDrag = useCallback((next: Drag | null) => {
    dragRef.current = next;
    setDragState(next);
  }, []);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState<string[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<FlowStepResult[]>([]);
  const [menu, setMenu] = useState<'add' | 'align' | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [snapping, setSnapping] = useState(true);
  const [showMap, setShowMap] = useState(true);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const surface = useRef<HTMLDivElement | null>(null);

  const status = useMemo(
    () => nodeStatus(campaign.id, app),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campaign, app.contacts, app.sequences, app.appointments, app.bookings, log],
  );
  const issues = useMemo(() => problems(graph), [graph]);
  const willRun = useMemo(() => new Set(runnable(graph).map(n => n.id)), [graph]);
  const byId = useMemo(() => new Map(graph.nodes.map(n => [n.id, n])), [graph.nodes]);
  const chosen = useMemo(() => graph.nodes.filter(n => selected.includes(n.id)), [graph.nodes, selected]);

  /** Screen coordinates to canvas coordinates. */
  const toCanvas = useCallback((e: { clientX: number; clientY: number }) => {
    const box = surface.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return { x: (e.clientX - box.left - view.x) / view.z, y: (e.clientY - box.top - view.y) / view.z };
  }, [view]);

  const panning = tool === 'pan' || spaceHeld;

  /* ── Pointer ── */

  const onPointerDownNode = (e: React.PointerEvent, node: FlowNode) => {
    if (e.button !== 0 || panning) return;
    e.stopPropagation();
    setMenu(null);

    /* Shift adds to the selection; clicking a node that is already part of one
       keeps the group, so a multi-node drag does not collapse to one. */
    const next = e.shiftKey
      ? (selected.includes(node.id) ? selected.filter(id => id !== node.id) : [...selected, node.id])
      : (selected.includes(node.id) ? selected : [node.id]);
    setSelected(next);

    const at = toCanvas(e);
    const grab = new Map<string, { dx: number; dy: number }>();
    for (const n of graph.nodes) {
      if (next.includes(n.id)) grab.set(n.id, { dx: at.x - n.x, dy: at.y - n.y });
    }
    history.begin();
    setDrag({ kind: 'node', grab, on: node.id, moved: false });
  };

  const onPointerDownPort = (e: React.PointerEvent, node: FlowNode, port: string) => {
    e.stopPropagation();
    /*
     * Deliberately no pointer capture here. Capturing on the port the wire
     * leaves from sends every later pointer event back to that same element,
     * so the port it is dropped on never sees the pointerup and the wire can
     * never land. Moves and releases bubble to the canvas instead.
     */
    setDrag({ kind: 'wire', from: { node: node.id, port } });
    setPointer(toCanvas(e));
  };

  const onPointerDownSurface = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setMenu(null);
    if (panning) {
      setDrag({ kind: 'pan', at: { x: e.clientX - view.x, y: e.clientY - view.y } });
      return;
    }
    if (!e.shiftKey) setSelected([]);
    const at = toCanvas(e);
    setDrag({ kind: 'marquee', box: { x1: at.x, y1: at.y, x2: at.x, y2: at.y } });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === 'pan' && drag.at) {
      setView(v => ({ ...v, x: e.clientX - drag.at!.x, y: e.clientY - drag.at!.y }));
      return;
    }
    const at = toCanvas(e);
    if (drag.kind === 'node' && drag.grab) {
      if (!drag.moved) setDrag({ ...drag, moved: true });
      /* Previewed rather than recorded: one gesture is one undo step, not one
         per animation frame. */
      let next = graph;
      for (const [id, g] of drag.grab) {
        const x = at.x - g.dx;
        const y = at.y - g.dy;
        next = moveNode(next, id, snapping
          ? { x: Math.round(x / GRID) * GRID, y: Math.round(y / GRID) * GRID }
          : { x, y });
      }
      history.preview(next);
    } else if (drag.kind === 'wire') {
      setPointer(at);
    } else if (drag.kind === 'marquee' && drag.box) {
      const box = { ...drag.box, x2: at.x, y2: at.y };
      setDrag({ ...drag, box });
      setSelected(graph.nodes.filter(n => overlaps(n, box)).map(n => n.id));
    }
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    if (drag?.kind === 'node') {
      history.commit();
      /*
       * A click on a node that was part of a group, with nothing dragged,
       * narrows the selection to that one. Without this, once several are
       * selected there is no way to get back to editing just one of them —
       * the pointerdown deliberately keeps the group so a multi-node drag
       * works, and something has to undo that when it turns out to be a click.
       */
      if (!drag.moved && drag.on && selected.length > 1) setSelected([drag.on]);
    }
    setDrag(null);
  };

  /** Finish a wire on the port it was released over. */
  const dropOnPort = (e: React.PointerEvent, node: FlowNode, port: string) => {
    e.stopPropagation();
    const drag = dragRef.current;
    if (drag?.kind !== 'wire' || !drag.from) return;
    const check = canConnect(graph, drag.from, { node: node.id, port });
    if (!check.ok) { addNotification(check.reason ?? 'Those two will not join.', 'error'); setDrag(null); return; }
    const next = connect(graph, drag.from, { node: node.id, port });
    if (next) history.push(next);
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
        const z = Math.max(0.35, Math.min(2, v.z * (e.deltaY > 0 ? 0.92 : 1.08)));
        const k = z / v.z;
        return { z, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /**
   * Fit a set of nodes, or all of them, into view.
   *
   * The graph is a parameter rather than read from the closure so a command
   * that both rearranges and refits — Tidy — can fit the layout it just made.
   * Reading it from the closure fitted the *previous* arrangement, which put
   * half the nodes off the side of the canvas.
   */
  const fitTo = useCallback((g: FlowGraph, ids?: string[]) => {
    const box = surface.current?.getBoundingClientRect();
    const b = bounds(g, ids);
    if (!box || !b) return;
    const pad = 48;
    const w = b.maxX - b.minX + pad * 2;
    const h = b.maxY - b.minY + pad * 2;
    const z = Math.max(0.35, Math.min(1.4, Math.min(box.width / w, box.height / h)));
    setView({
      z,
      x: (box.width - w * z) / 2 - (b.minX - pad) * z,
      y: (box.height - h * z) / 2 - (b.minY - pad) * z,
    });
  }, []);

  const fit = useCallback((ids?: string[]) => fitTo(graph, ids), [fitTo, graph]);

  useEffect(() => { fit(); /* once, on the first paint */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Editing ── */

  const withSelection = (fn: (ids: string[]) => FlowGraph) => {
    if (!selected.length) { addNotification('Select a node first.', 'error'); return; }
    history.push(fn(selected));
  };

  const doDuplicate = useCallback(() => {
    if (!selected.length) return;
    const r = duplicate(graph, selected, kind => flowId(`n-${kind}`), kind => !!NODE_SPECS[kind as FlowNodeKind].unique);
    if (!r.added.length) {
      addNotification(`There can only be one ${r.refused.map(k => NODE_SPECS[k as FlowNodeKind].title).join(', ')} node.`, 'error');
      return;
    }
    history.push(r.graph);
    setSelected(r.added);
    if (r.refused.length) addNotification(`${r.refused.length} could not be copied — only one of those is allowed.`, 'info');
  }, [graph, selected, history, addNotification]);

  const doDelete = useCallback(() => {
    if (!selected.length) return;
    let next = graph;
    for (const id of selected) next = removeNode(next, id);
    history.push(next);
    setSelected([]);
  }, [graph, selected, history]);

  /* Keys. Every one of these is also a button, so nothing is keyboard-only. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
      const meta = e.metaKey || e.ctrlKey;

      if (e.code === 'Space' && !e.repeat) { setSpaceHeld(true); e.preventDefault(); return; }
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) history.redo(); else history.undo();
        return;
      }
      if (meta && e.key.toLowerCase() === 'd') { e.preventDefault(); doDuplicate(); return; }
      if (meta && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelected(graph.nodes.map(n => n.id)); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); doDelete(); return; }
      if (e.key === '1') { fit(); return; }
      if (e.key === '2') { fit(selected); return; }
      if (e.key === 'Escape') { setDrag(null); setMenu(null); setSelected([]); }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceHeld(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); };
  }, [graph, selected, history, doDuplicate, doDelete, fit, setDrag]);

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
    history.push(next);
    /* Selected on arrival, so the toolbar and the inspector act on the node
       just added rather than on whatever was selected beforehand. */
    setSelected([next.nodes[next.nodes.length - 1].id]);
    setMenu(null);
  };

  const liveEdge = (e: FlowEdge) => running !== null && (e.to === running || e.from === running);
  const one = chosen.length === 1 ? chosen[0] : null;

  return (
    <div className="flow-shell">
      <div
        className="flow"
        ref={surface}
        data-tool={panning ? 'pan' : 'select'}
        data-panning={drag?.kind === 'pan'}
        style={{ height: 'clamp(460px, 70vh, 760px)' }}
        onPointerDown={onPointerDownSurface}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="flow-grid" style={{
          backgroundSize: `${GRID * view.z}px ${GRID * view.z}px`,
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
                  <path className="flow-wire-hit" d={d}
                    onPointerDown={ev => { ev.stopPropagation(); history.push(disconnect(graph, e.id)); }}>
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
                data-selected={selected.includes(node.id)}
                data-dragging={drag?.kind === 'node' && selected.includes(node.id)}
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
                    <span className="flow-node-title" style={{ display: 'block' }}>
                      {node.config?.label?.trim() || spec.title}
                    </span>
                    <span className="flow-node-sub">{spec.subtitle}</span>
                  </span>
                </div>

                <div className="flow-node-body">
                  <div className="flow-node-value">{s.value}</div>
                  {s.note && <div className="flow-node-note">{s.note}</div>}
                </div>

                {spec.inputs.map((p, i) => (
                  <span key={p.id}>
                    <span
                      className="flow-port"
                      style={{ left: -7, top: portY(i) - 6 }}
                      data-wired={graph.edges.some(e => e.to === node.id && e.toPort === p.id)}
                      data-armed={drag?.kind === 'wire' && !!drag.from && canConnect(graph, drag.from, { node: node.id, port: p.id }).ok}
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

        {drag?.kind === 'marquee' && drag.box && (
          <div className="flow-marquee" style={{
            left: Math.min(drag.box.x1, drag.box.x2) * view.z + view.x,
            top: Math.min(drag.box.y1, drag.box.y2) * view.z + view.y,
            width: Math.abs(drag.box.x2 - drag.box.x1) * view.z,
            height: Math.abs(drag.box.y2 - drag.box.y1) * view.z,
          }} />
        )}

        {/* ── Toolbar ── */}

        <div className="flow-bar flow-bar-top" onPointerDown={e => e.stopPropagation()}>
          <button className="flow-btn flow-btn-primary" onClick={run} disabled={busy}>
            {busy ? <><Loader size={13} className="spin" /> Running…</> : <><Play size={13} /> Run</>}
          </button>

          <span className="flow-sep" />

          <button className="flow-btn" data-on={tool === 'select'} aria-label="Select tool" title="Select (V)"
            onClick={() => setTool('select')}><MousePointer2 size={14} /></button>
          <button className="flow-btn" data-on={tool === 'pan'} aria-label="Pan tool" title="Pan (Space)"
            onClick={() => setTool('pan')}><Hand size={14} /></button>

          <span className="flow-sep" />

          <button className="flow-btn" aria-label="Undo" title="Undo (⌘Z)" disabled={!history.canUndo}
            onClick={history.undo}><Undo2 size={14} /></button>
          <button className="flow-btn" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!history.canRedo}
            onClick={history.redo}><Redo2 size={14} /></button>

          <span className="flow-sep" />

          <button className="flow-btn" data-on={menu === 'add'} onClick={() => setMenu(m => (m === 'add' ? null : 'add'))}>
            <Plus size={13} /> Add
          </button>
          <button className="flow-btn" disabled={!selected.length} onClick={doDuplicate} title="Duplicate (⌘D)">
            <Copy size={13} /> Duplicate
          </button>
          <button className="flow-btn" data-on={menu === 'align'} disabled={selected.length < 2}
            onClick={() => setMenu(m => (m === 'align' ? null : 'align'))}>
            <AlignStartVertical size={13} /> Arrange
          </button>
          <button className="flow-btn" onClick={() => { const next = tidy(graph); history.push(next); fitTo(next); }}>
            <LayoutGrid size={13} /> Tidy
          </button>

          <span className="flow-sep" />

          <button className="flow-btn" aria-label="Snap to grid" data-on={snapping} onClick={() => setSnapping(s => !s)} title="Snap to grid">
            <Magnet size={14} />
          </button>
          <button className="flow-btn" aria-label="Minimap" data-on={showMap} onClick={() => setShowMap(s => !s)} title="Minimap">
            <MapIcon size={14} />
          </button>
          <button className="flow-btn" aria-label="Delete" disabled={!selected.length} onClick={doDelete} title="Delete (Del)">
            <Trash2 size={14} />
          </button>

          <span style={{ flex: 1 }} />
          <span className="flow-btn" style={{ cursor: 'default', color: 'var(--text-faint)' }}>
            {willRun.size} of {runOrder(graph).order.length} will run
          </span>
        </div>

        {menu === 'add' && (
          <div className="flow-menu" style={{ top: 58, left: 12 }} onPointerDown={e => e.stopPropagation()}>
            <span className="flow-menu-label">Add a node</span>
            {(Object.keys(NODE_SPECS) as FlowNodeKind[]).map(kind => {
              const spec = NODE_SPECS[kind];
              const taken = !!spec.unique && graph.nodes.some(n => n.kind === kind);
              const Icon = ICON[kind];
              return (
                <button key={kind} className="flow-btn" disabled={taken} onClick={() => addAt(kind)}>
                  <Icon size={13} /> {spec.title}
                  {taken && <span style={{ marginLeft: 'auto', fontSize: 10 }}>on the canvas</span>}
                </button>
              );
            })}
          </div>
        )}

        {menu === 'align' && (
          <div className="flow-menu" style={{ top: 58, left: 320 }} onPointerDown={e => e.stopPropagation()}>
            <span className="flow-menu-label">Align</span>
            {([
              ['left', 'Left edges', AlignStartVertical],
              ['centre-x', 'Centres', AlignCenterVertical],
              ['right', 'Right edges', AlignEndVertical],
              ['top', 'Top edges', AlignStartHorizontal],
              ['middle-y', 'Middles', AlignCenterHorizontal],
              ['bottom', 'Bottom edges', AlignEndHorizontal],
            ] as [Align, string, typeof Play][]).map(([how, what, Icon]) => (
              <button key={how} className="flow-btn" onClick={() => { withSelection(ids => align(graph, ids, how)); setMenu(null); }}>
                <Icon size={13} /> {what}
              </button>
            ))}
            <span className="flow-menu-label">Spread evenly</span>
            <button className="flow-btn" disabled={selected.length < 3}
              onClick={() => { withSelection(ids => distribute(graph, ids, 'x')); setMenu(null); }}>
              <Rows3 size={13} style={{ transform: 'rotate(90deg)' }} /> Across
            </button>
            <button className="flow-btn" disabled={selected.length < 3}
              onClick={() => { withSelection(ids => distribute(graph, ids, 'y')); setMenu(null); }}>
              <Rows3 size={13} /> Down
            </button>
            <span className="flow-menu-label">Grid</span>
            <button className="flow-btn" onClick={() => { withSelection(ids => snap(graph, ids, GRID)); setMenu(null); }}>
              <Grid3x3 size={13} /> Snap to grid
            </button>
          </div>
        )}

        <div className="flow-bar flow-bar-zoom" onPointerDown={e => e.stopPropagation()}>
          <button className="flow-btn" aria-label="Zoom out" onClick={() => setView(v => ({ ...v, z: Math.max(0.35, v.z / 1.15) }))}><Minus size={14} /></button>
          <button className="flow-btn" style={{ minWidth: 46, justifyContent: 'center' }}
            onClick={() => setView(v => ({ ...v, z: 1 }))} title="Back to 100%">
            {Math.round(view.z * 100)}%
          </button>
          <button className="flow-btn" aria-label="Zoom in" onClick={() => setView(v => ({ ...v, z: Math.min(2, v.z * 1.15) }))}><Plus size={14} /></button>
          <button className="flow-btn" aria-label="Fit to view" title="Fit (1)" onClick={() => fit()}><Maximize2 size={14} /></button>
        </div>

        {log.length > 0 ? (
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
        ) : showMap ? (
          <Minimap graph={graph} selected={selected} view={view} surface={surface} onJump={setView} />
        ) : (
          <p className="flow-hint">Drag a node · pull a wire from a port · space to pan</p>
        )}
      </div>

      <Inspector
        /* Remounted when the selection or the stored text changes, which is
           what keeps its local fields honest without an effect that syncs. */
        key={`${one?.id ?? 'none'}:${campaign.objective}`}
        campaign={campaign}
        node={one}
        multiple={chosen.length}
        status={one ? status[one.kind] : undefined}
        onRename={label => one && history.push(configureNode(graph, one.id, { label }))}
        onConfig={config => one && history.push(configureNode(graph, one.id, config))}
        onSkip={() => one && history.push(toggleNode(graph, one.id))}
        onDuplicate={doDuplicate}
        onDelete={doDelete}
        onCampaignChanged={onChanged}
        onOpenTab={tab => setParams(tab === 'overview' ? {} : { tab }, { replace: true })}
      />
    </div>
  );
}

/**
 * A small map of the whole graph.
 *
 * Useful once the canvas is bigger than the window, and it doubles as a way to
 * jump: clicking a spot centres the view there.
 */
function Minimap({ graph, selected, view, surface, onJump }: {
  graph: FlowGraph;
  selected: string[];
  view: { x: number; y: number; z: number };
  surface: React.RefObject<HTMLDivElement | null>;
  onJump: (v: { x: number; y: number; z: number }) => void;
}) {
  const b = bounds(graph);
  if (!b) return null;

  const pad = 60;
  const w = b.maxX - b.minX + pad * 2;
  const h = b.maxY - b.minY + pad * 2;
  const k = Math.min(168 / w, 108 / h);
  const at = (x: number, y: number) => ({ left: (x - b.minX + pad) * k, top: (y - b.minY + pad) * k });

  const box = surface.current?.getBoundingClientRect();
  const seen = box ? {
    ...at(-view.x / view.z, -view.y / view.z),
    width: (box.width / view.z) * k,
    height: (box.height / view.z) * k,
  } : null;

  return (
    <div className="flow-map" onPointerDown={e => {
      e.stopPropagation();
      const map = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const cx = (e.clientX - map.left) / k + b.minX - pad;
      const cy = (e.clientY - map.top) / k + b.minY - pad;
      const s = surface.current?.getBoundingClientRect();
      if (!s) return;
      onJump({ ...view, x: s.width / 2 - cx * view.z, y: s.height / 2 - cy * view.z });
    }}>
      {graph.nodes.map(n => (
        <span key={n.id} className="flow-map-node" data-selected={selected.includes(n.id)}
          style={{ ...at(n.x, n.y), width: Math.max(4, NODE_W * k), height: Math.max(3, NODE_H * k) }} />
      ))}
      {seen && <span className="flow-map-view" style={seen} />}
    </div>
  );
}
