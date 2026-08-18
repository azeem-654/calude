/**
 * Undo and redo for the canvas.
 *
 * A stack of whole graphs rather than a list of reversible operations. The
 * graph is a few hundred bytes, editing it is not a hot path, and "put the
 * previous one back" cannot drift out of step with the edits the way a set of
 * hand-written inverse operations eventually does.
 *
 * Dragging is the awkward case: one gesture produces a state change per frame,
 * and each of those must not become its own undo step. The canvas calls
 * `begin()` when a drag starts and `commit()` when it ends, and everything
 * between is a preview that never touches the stack.
 */
import { useCallback, useRef, useState } from 'react';
import type { FlowGraph } from '../../../types/aiFlow';

/** Deep enough to cover a session's worth of edits, shallow enough to bound. */
const LIMIT = 60;

export interface History {
  graph: FlowGraph;
  /** Record an edit as its own undo step. */
  push: (next: FlowGraph) => void;
  /** Show a change without recording it — for a drag in progress. */
  preview: (next: FlowGraph) => void;
  /** Remember where a gesture started, so undo returns to before it. */
  begin: () => void;
  /** End a gesture, recording one step for the whole of it. */
  commit: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Replace everything, e.g. after loading another campaign's graph. */
  reset: (next: FlowGraph) => void;
}

export function useFlowHistory(initial: FlowGraph, onChange: (g: FlowGraph) => void): History {
  const [graph, setGraph] = useState(initial);
  const past = useRef<FlowGraph[]>([]);
  const future = useRef<FlowGraph[]>([]);
  const gestureStart = useRef<FlowGraph | null>(null);
  const [depth, setDepth] = useState({ past: 0, future: 0 });

  const settle = useCallback((next: FlowGraph) => {
    setGraph(next);
    onChange(next);
  }, [onChange]);

  const push = useCallback((next: FlowGraph) => {
    setGraph(current => {
      past.current = [...past.current, current].slice(-LIMIT);
      future.current = [];
      setDepth({ past: past.current.length, future: 0 });
      return next;
    });
    onChange(next);
  }, [onChange]);

  const preview = useCallback((next: FlowGraph) => setGraph(next), []);

  const begin = useCallback(() => {
    setGraph(current => { gestureStart.current = current; return current; });
  }, []);

  const commit = useCallback(() => {
    const before = gestureStart.current;
    gestureStart.current = null;
    if (!before) return;
    setGraph(current => {
      /* A gesture that changed nothing — a click that did not move a node —
         should not leave an undo step that appears to do nothing. */
      if (JSON.stringify(before) === JSON.stringify(current)) return current;
      past.current = [...past.current, before].slice(-LIMIT);
      future.current = [];
      setDepth({ past: past.current.length, future: 0 });
      onChange(current);
      return current;
    });
  }, [onChange]);

  const undo = useCallback(() => {
    setGraph(current => {
      const previous = past.current.pop();
      if (!previous) return current;
      future.current = [...future.current, current].slice(-LIMIT);
      setDepth({ past: past.current.length, future: future.current.length });
      onChange(previous);
      return previous;
    });
  }, [onChange]);

  const redo = useCallback(() => {
    setGraph(current => {
      const next = future.current.pop();
      if (!next) return current;
      past.current = [...past.current, current].slice(-LIMIT);
      setDepth({ past: past.current.length, future: future.current.length });
      onChange(next);
      return next;
    });
  }, [onChange]);

  const reset = useCallback((next: FlowGraph) => {
    past.current = [];
    future.current = [];
    setDepth({ past: 0, future: 0 });
    settle(next);
  }, [settle]);

  return {
    graph, push, preview, begin, commit, undo, redo, reset,
    canUndo: depth.past > 0,
    canRedo: depth.future > 0,
  };
}
