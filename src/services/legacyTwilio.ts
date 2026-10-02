/**
 * Twilio credentials this browser kept from before they moved to the server.
 *
 * Scheduling → Automations had its own Account SID, auth token and sending
 * number, stored in `crm_schedule.automations` — localStorage, synced in plain
 * text to the cloud, and resent with every booking-page publish. Settings kept
 * the workspace's sender under `crm_sms` the same way before that. None of
 * those copies was ever what a text was sent with: every sender reads the
 * workspace's encrypted record on the server.
 *
 * So, once, at start-up: whatever this browser still holds is handed to the
 * server as the sender if the workspace has none (the server encrypts it and
 * from then on only says "set"), and then it is removed from storage. The
 * server does the same to anything an older tab pushes later
 * (worker/src/lib/legacyTwilio.ts), so this is about the copy at rest here.
 */
import type { ScheduleAvailability } from '../types';
import { fetchSmsState, saveSmsConfig } from './smsStore';

interface Found { accountSid: string; authToken: string; fromNumber: string }

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The schedule with any Twilio field removed from its automations. Pure. */
export function withoutTwilio(s: ScheduleAvailability): ScheduleAvailability {
  const a = s.automations as unknown as Record<string, unknown> | undefined;
  if (!a || !('twilioSid' in a || 'twilioToken' in a || 'twilioFrom' in a)) return s;
  const { twilioSid: _s, twilioToken: _t, twilioFrom: _f, ...rest } = a;
  return { ...s, automations: rest as unknown as ScheduleAvailability['automations'] };
}

function read(key: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
  } catch { return null; }
}

/**
 * Hand any stored credentials to the server, then forget them.
 *
 * Bounded: start-up waits on it only when there is something to move, and
 * never longer than `timeoutMs`. The local copy is removed either way — a
 * token that could not be handed over is one the customer re-enters, which
 * is better than one that stays in plain text in the browser waiting for a
 * server that may never answer.
 */
export async function retireBrowserTwilio(timeoutMs = 5000): Promise<void> {
  const sched = read('crm_schedule');
  const legacy = read('crm_sms');
  const auto = (sched?.automations ?? null) as Record<string, unknown> | null;

  const found: Found = {
    accountSid: str(auto?.twilioSid) || str(legacy?.accountSid),
    authToken: str(auto?.twilioToken) || str(legacy?.authToken),
    fromNumber: str(auto?.twilioFrom) || str(legacy?.fromNumber),
  };
  const hasSchedCopy = !!auto && ('twilioSid' in auto || 'twilioToken' in auto || 'twilioFrom' in auto);
  if (!hasSchedCopy && !legacy) return;

  if (found.authToken) {
    const handOver = (async () => {
      const state = await fetchSmsState();
      /* The server's copy wins when there is one: it was saved through
         Settings, which is the newer and the only one ever used. */
      if (state.reachable && !state.sms?.hasCredentials) {
        await saveSmsConfig({
          accountSid: found.accountSid, authToken: found.authToken,
          fromNumber: /^\+[1-9]\d{6,14}$/.test(found.fromNumber) ? found.fromNumber : '',
        });
      }
    })();
    await Promise.race([handOver.catch(() => undefined), new Promise(r => setTimeout(r, timeoutMs))]);
  }

  try {
    if (sched && hasSchedCopy) {
      localStorage.setItem('crm_schedule', JSON.stringify(withoutTwilio(sched as unknown as ScheduleAvailability)));
    }
    if (legacy) localStorage.removeItem('crm_sms');
  } catch { /* storage refused: the server-side sweep still clears the cloud copy */ }
}
