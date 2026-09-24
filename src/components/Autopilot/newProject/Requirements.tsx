/**
 * Step five: only the connections this project uses.
 *
 * Derived from the blueprint's `requirements`, so a social project lists the
 * AI, the business profile and the Social Creator — and nothing about
 * mailboxes, because nothing in it sends mail. The three things a customer
 * connects themselves (a mailbox, an SMS provider, payments) are checked with
 * the server, and "could not check" is its own state: reporting it as missing
 * would send somebody to reconnect a mailbox that works.
 *
 * Nothing here blocks the build. A project can start with a connection
 * missing; the step that needs it says so when it gets there, rather than the
 * whole project refusing to exist.
 */
import { CheckCircle2, CircleDashed, HelpCircle, ExternalLink, AlertCircle, Loader } from 'lucide-react';
import { REQUIREMENT_INFO, type RequirementId } from '../../../services/projectSolutions';
import type { Readiness } from '../../../services/projectReadiness';
import { contactCount } from './contactFacts';

const CHECKED: Partial<Record<RequirementId, keyof Readiness>> = { mailbox: 'mailbox', sms: 'sms', payments: 'payments' };

export default function Requirements({ ids, ready, mailboxPlan }: {
  ids: RequirementId[];
  ready: Readiness | null;
  /** The answer to "do you have an address to send from?", when it was asked. */
  mailboxPlan: string;
}) {
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div>
        <h2 className="wz-title">What this project <span className="wz-accent">connects to</span></h2>
        <p style={{ margin: '9px 0 0', fontSize: 14.5, color: '#6b7280', lineHeight: 1.55 }}>
          Only what this project uses. Anything not connected yet can be done later — the project still starts, and the step that needs it waits.
        </p>
      </div>
      <div style={{ display: 'grid', gap: 9 }}>
        {ids.map(id => {
          const info = REQUIREMENT_INFO[id];
          const key = CHECKED[id];
          /* Contacts is counted, not assumed: "Included" next to an empty list
             was how a project that emails people started with nobody in it. */
          const people = id === 'contacts' ? contactCount() : -1;
          const state = id === 'contacts' ? (people > 0 ? 'ready' : 'missing') : key ? (ready ? ready[key] : 'checking') : info.kind;
          const tone = state === 'ready' || state === 'included' ? { bg: '#e8f6ee', fg: '#0f7b3d', label: state === 'ready' ? 'Connected' : 'Included' }
            : state === 'missing' ? { bg: '#fff4ed', fg: '#9a3412', label: 'Not set up yet' }
              : state === 'optional' ? { bg: '#f1f5f9', fg: '#475569', label: 'Optional' }
                : state === 'checking' ? { bg: '#f1f5f9', fg: '#94a3b8', label: 'Checking…' }
                  : { bg: '#f1f5f9', fg: '#475569', label: 'Could not check' };
          const Icon = state === 'ready' || state === 'included' ? CheckCircle2 : state === 'missing' ? AlertCircle : state === 'checking' ? Loader : state === 'unknown' ? HelpCircle : CircleDashed;
          return (
            <div key={id} className="np-bp-box np-rise" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Icon size={18} color={tone.fg} className={state === 'checking' ? 'spin' : undefined} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 14.5, color: '#17191c' }}>{info.label}</b>
                  <span className="np-badge" style={{ background: tone.bg, color: tone.fg }}>{tone.label}</span>
                </span>
                <span style={{ display: 'block', fontSize: 13, color: '#6b7280', marginTop: 3, lineHeight: 1.5 }}>
                  {info.why}
                  {id === 'contacts' && (people > 0 ? ` ${people} in this workspace.` : ' None yet — import a list, or your forms and booking page will add people as they arrive.')}
                  {id === 'mailbox' && state === 'missing' && mailboxPlan === 'buy' && ' You chose to have one set up — domains and mailboxes are picked right after the project is created.'}
                  {state === 'unknown' && ' We could not reach the setting to check — that is not the same as it being missing.'}
                </span>
                {(state === 'missing' || state === 'optional') && info.route && (
                  <a href={id === 'contacts' ? '/contacts?import=1' : info.route} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 7, fontSize: 12.5, fontWeight: 700, color: '#5b46e5', textDecoration: 'none' }}>
                    Set this up <ExternalLink size={11} />
                  </a>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
