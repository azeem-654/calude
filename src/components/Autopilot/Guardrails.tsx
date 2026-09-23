/**
 * What a project is allowed to do, as controls rather than as a readout.
 *
 * ── Why this had to change ──
 *
 * It listed seven permissions and let you change none of them. A screen that
 * shows somebody a setting they cannot touch is worse than not showing it: they
 * go looking for where it *can* be changed, find nothing, and conclude it is
 * decided for them. The only place these could be set was the creation wizard,
 * which is a one-time screen — so a customer who wanted to let a settled client
 * send without approval had to delete the project and start again.
 *
 * ── Why three states and not a switch ──
 *
 * "Asks first" is the whole point of the feature and it is neither on nor off.
 * A two-state control would force every permission into "never" or "without
 * telling me", and the middle one is where nearly everything sensible sits.
 *
 * ── Why each one saves on its own ──
 *
 * One switch, one request, applied as soon as it is pressed. A form with a Save
 * button can be left half-changed and closed, and the customer walks away
 * believing sending is off. What is on the screen here is what the server has.
 * A refused change puts the switch back and says why, rather than leaving a
 * setting shown as granted that is not.
 */
import { useState } from 'react';
import { AlertTriangle, Loader } from 'lucide-react';
import { setGuardrail } from '../../services/projects';
import { T } from './theme';

type Level = 'off' | 'approval' | 'on';

const LEVELS: { value: Level; label: string; hint: string }[] = [
  { value: 'off', label: 'Off', hint: 'It cannot do this, however it is asked.' },
  { value: 'approval', label: 'Asks first', hint: 'It prepares the work and waits on this card.' },
  { value: 'on', label: 'On its own', hint: 'It goes ahead without telling you first.' },
];

/**
 * What each permission actually governs.
 *
 * Written out rather than derived from the key, because "Send Sms" tells
 * somebody nothing about what they are agreeing to. The `risk` flag marks the
 * ones that reach a real person or spend real money — those get a warning when
 * set to run unattended, because that is the setting somebody regrets.
 */
const ABOUT: Record<string, { label: string; what: string; risk?: boolean }> = {
  createWorkflows: {
    label: 'Write workflows',
    what: 'Draft new workflows for this client. Drafts never run until switched on.',
  },
  activateWorkflows: {
    label: 'Switch workflows on',
    what: 'Make a drafted workflow live, so it starts running people through it.',
    risk: true,
  },
  sendEmail: {
    label: 'Send email',
    what: "Email this client's contacts from the address on this project.",
    risk: true,
  },
  sendSms: {
    label: 'Send texts',
    what: 'Text contacts. Texts cost money per message and cannot be recalled.',
    risk: true,
  },
  bookAppointments: {
    label: 'Book appointments',
    what: 'Put appointments in the calendar when somebody picks a slot.',
  },
  findProspects: {
    label: 'Find new prospects',
    what: 'Build a list of people who are not yet contacts of this client.',
    risk: true,
  },
  publishContent: {
    label: 'Publish content',
    what: 'Put a written post on the connected site rather than leaving it a draft.',
    risk: true,
  },
};

const about = (key: string) => ABOUT[key] ?? {
  label: key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()),
  what: 'This version does not describe this permission.',
};

export default function Guardrails({ projectId, guardrails, onChanged }: {
  projectId: string;
  guardrails: Record<string, string>;
  onChanged: () => void;
}) {
  /* The value being written, so the row can show it as chosen while the server
     is still thinking. Cleared on the answer either way. */
  const [busy, setBusy] = useState<string>('');
  const [pending, setPending] = useState<Record<string, Level>>({});
  const [error, setError] = useState('');

  async function set(key: string, value: Level) {
    if (busy) return;
    setBusy(key);
    setPending(p => ({ ...p, [key]: value }));
    setError('');
    const r = await setGuardrail(projectId, key, value);
    setBusy('');
    if (!r.success) {
      /* Put it back. A switch that stays where it was pushed after the server
         refused it is a screen saying a permission was granted when it was
         not — which is the exact failure this whole feature exists to prevent. */
      setPending(p => { const n = { ...p }; delete n[key]; return n; });
      setError(String(r.error ?? 'That could not be changed.'));
      return;
    }
    onChanged();
  }

  const keys = Object.keys(guardrails ?? {});

  return (
    <div>
      <h4 style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 800, color: T.ink }}>
        What this project is allowed to do
      </h4>
      <p style={{ margin: '0 0 10px', fontSize: 11.5, color: T.muted, lineHeight: 1.55 }}>
        Each of these applies to this project only. Changing one takes effect on the next pass — within
        five minutes — and nothing already waiting for you is sent by turning something on.
      </p>

      {error && (
        <p style={{
          margin: '0 0 9px', padding: '9px 11px', borderRadius: 10, fontSize: 11.5, lineHeight: 1.5,
          background: T.badSoft, border: `1px solid ${T.bad}33`, color: T.bad,
        }}>{error}</p>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {keys.map(key => {
          const meta = about(key);
          const value = (pending[key] ?? guardrails[key] ?? 'off') as Level;
          return (
            <div key={key} style={{
              padding: '10px 12px', border: `1px solid ${T.line}`, borderRadius: 12, background: T.raised,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{meta.label}</span>
                {busy === key && <Loader size={11} className="spin" color={T.accent} />}
              </div>
              <p style={{ margin: '2px 0 8px', fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
                {meta.what}
              </p>

              <div role="radiogroup" aria-label={meta.label}
                style={{ display: 'inline-flex', gap: 3, padding: 3, borderRadius: 999, background: T.lineSoft }}>
                {LEVELS.map(l => {
                  const on = value === l.value;
                  return (
                    <button
                      key={l.value}
                      role="radio"
                      aria-checked={on}
                      title={l.hint}
                      disabled={!!busy}
                      onClick={() => { if (!on) void set(key, l.value); }}
                      style={{
                        padding: '5px 12px', borderRadius: 999, border: 'none', cursor: busy ? 'default' : 'pointer',
                        fontFamily: 'inherit', fontSize: 11, fontWeight: 800,
                        background: on
                          ? (l.value === 'on' ? T.goodSoft : l.value === 'approval' ? T.warnSoft : '#fff')
                          : 'transparent',
                        color: on
                          ? (l.value === 'on' ? T.good : l.value === 'approval' ? T.warn : T.ink)
                          : T.muted,
                        boxShadow: on ? '0 1px 2px rgba(16,24,40,0.10)' : 'none',
                      }}
                    >{l.label}</button>
                  );
                })}
              </div>

              {/* Said at the moment it is chosen, not in a paragraph at the top
                  that nobody reads twice. */}
              {meta.risk && value === 'on' && (
                <p style={{
                  margin: '8px 0 0', display: 'flex', gap: 6, alignItems: 'flex-start',
                  fontSize: 10.5, color: T.warn, lineHeight: 1.5,
                }}>
                  <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                  This now happens without asking you. You will see it in the project's activity after the
                  fact rather than before.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
