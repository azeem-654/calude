/**
 * Inside the phone apps only (services/nativeApp.ts): register this phone for
 * push alerts with the workspace that is open, open the screen a tapped alert
 * is about, and start the support app on its inbox. Draws nothing, and does
 * nothing at all in a browser.
 */
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API_BASE } from '../../services/apiBase';
import { sessionToken } from '../../services/auth';
import { getActiveAccountId } from '../../services/tenancy';
import { appShell, inNativeApp, registerPush } from '../../services/nativeApp';

const post = (b: Record<string, unknown>) => fetch(`${API_BASE}/api/push.php`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: sessionToken(), accountId: getActiveAccountId(), ...b }),
}).then(r => r.json()).catch(() => null);

export default function NativeBridge() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!inNativeApp()) return;
    /* The support app is for answering customers: it opens where they are. */
    if (appShell() === 'support' && (pathname === '/' || pathname === '/dashboard')) navigate('/engagement?tab=inbox', { replace: true });
    /* A moment after the workspace has loaded, so the permission question is not the first thing on screen. */
    const t = window.setTimeout(() => void registerPush(post, route => navigate(route)), 2500);
    return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
