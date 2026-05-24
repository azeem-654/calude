import { useState, useCallback } from 'react';

export function useHistory<T>(initial: T) {
  const [history, setHistory] = useState<T[]>([initial]);
  const [index, setIndex] = useState(0);

  const state = history[index];

  const push = useCallback((next: T) => {
    setHistory(prev => {
      const trimmed = prev.slice(0, index + 1);
      return [...trimmed, next].slice(-50); // keep last 50 states
    });
    setIndex(prev => Math.min(prev + 1, 49));
  }, [index]);

  const undo = useCallback(() => {
    setIndex(i => Math.max(0, i - 1));
  }, []);

  const redo = useCallback(() => {
    setIndex(i => i + 1);
  }, []);

  const canUndo = index > 0;
  const canRedo = index < history.length - 1;

  return { state, push, undo, redo, canUndo, canRedo };
}
