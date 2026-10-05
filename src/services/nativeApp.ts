/**
 * The Protected Central phone apps (mobile/), as the web app sees them.
 *
 * Both apps are Capacitor shells that load app.protectedcentral.com itself —
 * the same bundle, the same cookie session, every release live the moment it
 * deploys. They say which they are in the user agent
 * ("ProtectedCentralApp/1.0 (support; ios)", capacitor.config.json), so this
 * works before the native bridge has loaded and in a test with no bridge.
 *
 * What changes inside an app, and why:
 *  - **No Google sign-in.** Google refuses OAuth inside an embedded web view
 *    (403 disallowed_useragent); the email code and password remain.
 *  - **No plan purchases.** Apple (3.1.1) and Google Play require their own
 *    billing for subscriptions bought in an app; selling ours there would get
 *    both apps rejected. Plans stay on the website, and the app does not point
 *    at it (outside the US that is refused too). Everything else works.
 *  - **Push notifications**, registered with /api/push.php, and a tapped alert
 *    opens the screen it is about.
 *  - The support app opens on the inbox rather than the dashboard.
 */

export type AppShell = 'web' | 'customer' | 'support';

/* "; push" is added when the build can receive alerts: always on iPhone, and on
   Android only when the build carries google-services.json (mobile/build.sh) —
   asking Android's plugin without it crashes the app. */
const UA = /ProtectedCentralApp\/[\d.]+ \((customer|support); (android|ios)(; push)?\)/;

function parsed(): { shell: AppShell; platform: 'android' | 'ios' | ''; push: boolean } {
  const m = typeof navigator !== 'undefined' ? UA.exec(navigator.userAgent) : null;
  return m ? { shell: m[1] as AppShell, platform: m[2] as 'android' | 'ios', push: !!m[3] } : { shell: 'web', platform: '', push: false };
}

export const appShell = (): AppShell => parsed().shell;
export const nativePlatform = () => parsed().platform;
export const inNativeApp = () => parsed().shell !== 'web';
/** Plans are bought on the website, never in a store app. */
export const canBuyPlans = () => !inNativeApp();

/* ── The bridge Capacitor injects into the page (no @capacitor import in the bundle) ── */

interface PushPlugin {
  checkPermissions(): Promise<{ receive: string }>;
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  addListener(event: string, cb: (x: Record<string, unknown>) => void): Promise<{ remove: () => void }>;
  createChannel?(c: Record<string, unknown>): Promise<void>;
}
const plugins = () => (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins ?? {};
const pushPlugin = () => plugins().PushNotifications as PushPlugin | undefined;

let deviceToken = '';
let listening = false;

/**
 * Ask for permission (once — the system remembers the answer) and register this
 * phone for the active workspace. Called after sign-in and on every workspace
 * switch, so the alerts follow the workspace that is open.
 */
export async function registerPush(post: (body: Record<string, unknown>) => Promise<unknown>, go: (route: string) => void): Promise<'on' | 'denied' | 'unavailable'> {
  const P = pushPlugin();
  if (!inNativeApp() || !P || !parsed().push) return 'unavailable';
  if (!listening) {
    listening = true;
    await P.addListener('registration', t => {
      deviceToken = String(t.value ?? '');
      if (deviceToken) void post({ action: 'register', deviceToken, platform: nativePlatform(), app: appShell() });
    });
    /* A tapped alert: open what it is about. */
    await P.addListener('pushNotificationActionPerformed', a => {
      const n = (a.notification ?? {}) as { data?: { route?: string } };
      const route = String(n.data?.route ?? '');
      if (route.startsWith('/')) go(route);
    });
    /* Android draws calls on their own, louder channel (lib/push.ts sends channel_id). */
    if (nativePlatform() === 'android' && P.createChannel) {
      await P.createChannel({ id: 'calls', name: 'Calls and screen shares', importance: 5, sound: 'default', vibration: true }).catch(() => undefined);
      await P.createChannel({ id: 'messages', name: 'Chats and tickets', importance: 4, vibration: true }).catch(() => undefined);
    }
  }
  let perm = await P.checkPermissions().catch(() => ({ receive: 'denied' }));
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await P.requestPermissions().catch(() => ({ receive: 'denied' }));
  if (perm.receive !== 'granted') return 'denied';
  /* register() fires 'registration' again with the same token, which re-files it under the workspace now open. */
  await P.register().catch(() => undefined);
  if (deviceToken) void post({ action: 'register', deviceToken, platform: nativePlatform(), app: appShell() });
  return 'on';
}

/** Signing out on the phone: stop sending this workspace's alerts here. */
export async function unregisterPush(post: (body: Record<string, unknown>) => Promise<unknown>): Promise<void> {
  if (deviceToken) await post({ action: 'unregister', deviceToken }).catch(() => undefined);
}
