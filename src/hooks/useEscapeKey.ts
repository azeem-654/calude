/**
 * Escape closes the thing on top.
 *
 * Every modal in the app closed on a backdrop click and on its own Cancel
 * button, and none closed on Escape — which is the one people reach for
 * without thinking, and the only one available from the keyboard.
 *
 * Bound on keydown at the document, and only while the modal is actually open,
 * so a stack of dialogs closes the top one rather than all of them at once.
 */
import { useEffect } from 'react';

export function useEscapeKey(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      /* Closes from anywhere inside the dialog, including a focused field.
         An earlier version blurred the field first and closed on the second
         press, on the theory that Escape in a text box means "undo my
         typing" — but in a modal it reads as the key simply not working.
         Predictable beats clever: one press, one close. */
      e.stopPropagation();
      onEscape();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, onEscape]);
}
