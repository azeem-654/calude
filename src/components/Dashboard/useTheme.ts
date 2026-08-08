import { useEffect, useState } from 'react';
import type { Theme } from './marketTheme';

function read(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/**
 * The current app theme, kept in step with the `data-theme` attribute that
 * services/theme.ts flips on <html>. Watching the attribute rather than reading
 * localStorage means the board repaints the moment the user hits the toggle,
 * without the theme service needing to know the board exists.
 */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(read);

  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setTheme(read());
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  return theme;
}
