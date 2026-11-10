/**
 * The Design Studio's saved thumbnail themes (/api/design-themes.php,
 * worker/src/lib/design/thumbThemes.ts) — listed and edited in the Graphics
 * Designer & Editor, used from AI Video Studio and the Shorts wizard.
 */
import { API_BASE } from './apiBase';
import { sessionToken } from './auth';
import { getActiveAccountId } from './tenancy';
import type { ThumbTheme, ThemeDesign, ThemeLogo } from '../../worker/src/lib/design/thumbThemes';

export type { ThumbTheme, ThemeDesign, ThemeLogo };
export { cleanDesign, cleanLogo, describeTheme, MAX_THEMES } from '../../worker/src/lib/design/thumbThemes';

type Answer<T> = ({ success: true } & T) | { success: false; error?: string; field?: string; code?: string };

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<Answer<T>> {
  try {
    const r = await fetch(`${API_BASE}/api/design-themes.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: sessionToken(), accountId: getActiveAccountId(), ...extra }),
    });
    return await r.json().catch(() => ({ success: false, error: `The server answered ${r.status}.` }));
  } catch { return { success: false, error: 'Could not reach the server — check the connection and try again.' }; }
}

export const listThemes = () => call<{ themes: ThumbTheme[] }>('list');
export const saveTheme = (theme: { name: string; description?: string; design: Partial<ThemeDesign> | Record<string, unknown>; logo?: Partial<ThemeLogo>; words?: number; source?: string }, id?: string) =>
  call<{ theme: ThumbTheme }>('save', { theme, ...(id ? { id } : {}) });
export const duplicateTheme = (id: string) => call<{ theme: ThumbTheme }>('duplicate', { id });
export const deleteTheme = (id: string) => call<Record<string, never>>('delete', { id });
