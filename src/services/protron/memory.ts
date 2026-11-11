/**
 * Protron's memory: the conversation, and the customer's preferences for it.
 *
 * ── Where it lives, and why there ──
 *
 * In this browser, under a key made of the signed-in person and the workspace
 * they are in. Two people sharing a computer, or one agency switching between
 * clients, each get their own conversation — the key changes with either, so
 * one client's business can never appear in another's chat. Nothing is sent
 * to the server to be kept; the AI provider sees only the turns of the
 * current question (brain.ts) and keeps nothing it is not told to.
 *
 * A server-side history (a table, synced across devices) would be the next
 * step; it was left out of the first version because it would be a second
 * copy of every customer conversation to secure, export and delete, and a
 * browser history does the job the brief needs — context that survives moving
 * between screens and reloads.
 *
 * Voice is never stored: only the text that came of it.
 */

export type Role = 'user' | 'protron';

export interface ActionCard {
  id: string;
  name: string;
  title: string;
  args: Record<string, string | string[] | boolean>;
  /** waiting: needs Confirm; done/failed/cancelled: settled; refused: never allowed. */
  status: 'waiting' | 'running' | 'done' | 'failed' | 'cancelled' | 'refused';
  confirmText?: string;
  result?: string;
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
}

export interface Prefs {
  proactive: boolean;
  speak: boolean;
  /** Where the launcher sits, as a fraction of the window, once moved. */
  dock: { x: number; y: number } | null;
  /** The customer's business, as they told it — company name and trade. */
  business: { name: string; about: string };
}

const MAX_TURNS = 60;
export const DEFAULT_PREFS: Prefs = { proactive: true, speak: false, dock: null, business: { name: '', about: '' } };

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

export function saveTurns(turns: Turn[]): void {
  try { localStorage.setItem(storeKey('chat'), JSON.stringify(turns.slice(-MAX_TURNS))); } catch { /* full or private mode: the conversation lasts this page */ }
}

export function clearTurns(): void {
  try { localStorage.removeItem(storeKey('chat')); } catch { /* nothing kept anyway */ }
}

export function loadPrefs(): Prefs {
  const p = read<Prefs>(storeKey('prefs'), DEFAULT_PREFS);
  return { ...DEFAULT_PREFS, ...p, business: { ...DEFAULT_PREFS.business, ...(p.business ?? {}) } };
}

export function savePrefs(p: Prefs): void {
  try { localStorage.setItem(storeKey('prefs'), JSON.stringify(p)); } catch { /* defaults next time */ }
}

export const newId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
