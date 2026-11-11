/**
 * Protron's memory: the conversation, and the customer's preferences for it.
 *
 * ── Where it lives, and why there ──
 *
 * In this browser, under a key made of the signed-in person and the workspace
 * they are in, and on the server (/api/protron.php, one row per person per
 * workspace — services/protron/sync.ts) so it follows them to another device.
 * Two people sharing a computer, or one agency switching between clients, each
 * get their own conversation — the key changes with either, so one client's
 * business can never appear in another's chat. The browser copy opens the
 * panel instantly and works offline; the newer of the two wins on load.
 *
 * Voice is never stored: only the text that came of it.
 */

export type Role = 'user' | 'protron';

export interface ActionCard {
  id: string;
  name: string;
  title: string;
  args: Record<string, string | string[] | boolean | Record<string, string>>;
  /** waiting: needs Confirm; done/failed/cancelled: settled; refused: never allowed. */
  status: 'waiting' | 'running' | 'done' | 'failed' | 'cancelled' | 'refused';
  confirmText?: string;
  result?: string;
  /** What it is doing, step by step, as it does it — shown on the card live. */
  steps?: Step[];
  /** Boxes it filled, with what was there before, so Undo can put them back. */
  undo?: { key: string; previous: string }[];
}

export interface Step {
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
}

export interface Turn {
  id: string;
  role: Role;
  text: string;
  at: number;
  actions?: ActionCard[];
  suggestions?: string[];
  /** Where the customer was when this was said — the model is told it. */
  path?: string;
  /** Said without the AI (offline matching), so the screen can say so. */
  offline?: boolean;
  error?: boolean;
  /** Protron spoke first (the customer paused on a screen); no question came before it. */
  auto?: boolean;
}

export interface Prefs {
  proactive: boolean;
  speak: boolean;
  /** Where the launcher sits, as a fraction of the window, once moved. */
  dock: { x: number; y: number } | null;
  /** The customer's business, as they told it — company name and trade. */
  business: { name: string; about: string };
  /** commander: the AI voice through the robot filter; natural: the browser's own voice. */
  voice: 'commander' | 'natural';
  /** Seconds of nothing touched before Protron starts a conversation (0 = never). */
  idleSeconds: number;
}

const MAX_TURNS = 60;
export const DEFAULT_PREFS: Prefs = { proactive: true, speak: false, dock: null, business: { name: '', about: '' }, voice: 'commander', idleSeconds: 10 };
export const IDLE_CHOICES = [0, 10, 30, 120];

/** A short, stable id for the signed-in person, so the key does not carry their address. */
function personKey(): string {
  /* Read where auth.ts keeps it, without importing auth.ts (and the API base
     it pulls in), so this stays a pure module the tests can load. */
  let email = 'anon';
  try { email = (JSON.parse(localStorage.getItem('crm_session') || 'null') as { user?: { email?: string } } | null)?.user?.email ?? 'anon'; } catch { /* signed out */ }
  let h = 5381;
  for (let i = 0; i < email.length; i++) h = ((h << 5) + h + email.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const workspaceKey = (): string => {
  try { return localStorage.getItem('crm_active_account') || 'none'; } catch { return 'none'; }
};

export const storeKey = (kind: 'chat' | 'prefs', person = personKey(), workspace = workspaceKey()): string =>
  `pc_protron_${kind}_${person}_${workspace}`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch { return fallback; }
}

export function loadTurns(): Turn[] {
  try {
    const raw = localStorage.getItem(storeKey('chat'));
    const list = raw ? JSON.parse(raw) as Turn[] : [];
    return Array.isArray(list) ? list.slice(-MAX_TURNS) : [];
  } catch { return []; }
}

/** Kept in this browser and marked as not yet on the server (sync.ts saves it). */
export function saveTurns(turns: Turn[]): void {
  try {
    localStorage.setItem(storeKey('chat'), JSON.stringify(turns.slice(-MAX_TURNS)));
    localStorage.setItem(storeKey('chat') + '_dirty', '1');
  } catch { /* full or private mode: the conversation lasts this page */ }
}

/** The server's stamp of the copy this browser last saved or loaded. */
export function localStamp(): number {
  try { return Number(localStorage.getItem(storeKey('chat') + '_at') || 0); } catch { return 0; }
}

/** Whether this browser has turns the server has not got yet. */
export function isDirty(): boolean {
  try { return localStorage.getItem(storeKey('chat') + '_dirty') === '1'; } catch { return false; }
}

export function markSynced(at: number): void {
  try { localStorage.setItem(storeKey('chat') + '_at', String(at)); localStorage.removeItem(storeKey('chat') + '_dirty'); } catch { /* next save tries again */ }
}

/** Replaces this browser's copy with the server's. */
export function adoptTurns(turns: Turn[], at: number): void {
  try { localStorage.setItem(storeKey('chat'), JSON.stringify(turns.slice(-MAX_TURNS))); } catch { /* shown this page only */ }
  markSynced(at);
}

export function clearTurns(): void {
  try { localStorage.removeItem(storeKey('chat')); localStorage.removeItem(storeKey('chat') + '_dirty'); } catch { /* nothing kept anyway */ }
}

export function loadPrefs(): Prefs {
  const p = read<Prefs>(storeKey('prefs'), DEFAULT_PREFS);
  return normalisePrefs(p);
}

/** Prefs from anywhere (this browser, the server, an older version), made whole and in range. */
export function normalisePrefs(p: Partial<Prefs>): Prefs {
  const out = { ...DEFAULT_PREFS, ...p, business: { ...DEFAULT_PREFS.business, ...(p.business ?? {}) } };
  if (out.voice !== 'natural') out.voice = 'commander';
  if (!IDLE_CHOICES.includes(Number(out.idleSeconds))) out.idleSeconds = DEFAULT_PREFS.idleSeconds;
  return out;
}

export function savePrefs(p: Prefs): void {
  try { localStorage.setItem(storeKey('prefs'), JSON.stringify(p)); } catch { /* defaults next time */ }
}

export const newId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
