/**
 * The smaller tabs on a campaign: what it created, who it reached, what came
 * back, and what it is allowed to do.
 *
 * Each one shows what is genuinely known and says so plainly when that is
 * nothing. A tab that exists but has never had anything in it should explain
 * why, rather than render an empty box that reads like a loading failure.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight, Ban, CalendarClock, Info, Mail, MessageSquare, Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { setGuardrails, takeSaveError } from '../../services/aiCampaigns';
import { logDecision } from '../../services/aiDecisionLog';
import { campaignContacts, campaignMeetings, sequenceView } from '../../services/aiRollup';
import { describeReach } from '../../services/dueWork';
import {
  DEFAULT_GUARDRAILS, LINK_LABEL, PERMISSION_LABEL,
  type AICampaign, type AIGuardrails, type Permission,
} from '../../types/aiSalesAgent';
import { card, ghostBtn, primaryBtn } from './ui';

/* ── Shared shell ──────────────────────────────────────────────────────── */

export function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section style={{ ...card, padding: 'clamp(16px, 3vw, 22px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{title}</h2>
        {note && <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Nothing({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, fontSize: 13.5, color: '#64748b', lineHeight: 1.6 }}>{children}</p>;
}

/* ── Workflows ─────────────────────────────────────────────────────────── */

export function WorkflowsTab({ campaign }: { campaign: AICampaign }) {
  const navigate = useNavigate();
  const { sequences, contacts } = useApp();

  const live = (kind: string, id: string, fallback: string) => {
    if (kind === 'sequence') return sequences.find(x => x.id === id)?.name ?? fallback;
    if (kind === 'contact') return contacts.find(x => x.id === id)?.name ?? fallback;
    return fallback;
  };
  const gone = (kind: string, id: string) =>
    (kind === 'sequence' && !sequences.some(x => x.id === id))
    || (kind === 'contact' && !contacts.some(x => x.id === id));

  const grouped = useMemo(() => {
    const by = new Map<string, AICampaign['links']>();
    for (const l of campaign.links) by.set(l.kind, [...(by.get(l.kind) ?? []), l]);
    return [...by.entries()];
  }, [campaign.links]);

  return (
    <Panel
      title="What this campaign created"
      note="Each lives in the module that owns it — open one to edit it there.">
      {grouped.length === 0 ? (
        <Nothing>
          Nothing yet. Records appear here as the agent creates them, each linked to the real
          sequence, contact or appointment rather than a copy of it.
        </Nothing>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {grouped.map(([kind, links]) => (
            <div key={kind} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8' }}>
                {LINK_LABEL[kind as keyof typeof LINK_LABEL] ?? kind} · {links.length}
              </p>
              {links.map(l => {
                const missing = gone(l.kind, l.id);
                return (
                  <button key={`${l.kind}-${l.id}`} className="press"
                    onClick={() => l.route && !missing && navigate(l.route)}
                    disabled={!l.route || missing}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      padding: '9px 12px', borderRadius: 9, border: '1px solid #eef1f5',
                      backgroundColor: '#f8fafc', textAlign: 'left', width: '100%',
                      cursor: l.route && !missing ? 'pointer' : 'default', font: 'inherit',
                    }}>
                    <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: missing ? '#94a3b8' : '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {live(l.kind, l.id, l.label)}
                        {missing && <span style={{ fontWeight: 500, color: '#b91c1c' }}> · deleted</span>}
                      </span>
                      <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{l.id}</span>
                    </span>
                    {l.route && !missing && <ArrowUpRight size={14} color="#64748b" style={{ flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── Email ─────────────────────────────────────────────────────────────── */

export function EmailTab({ campaign }: { campaign: AICampaign }) {
  const navigate = useNavigate();
  const { contacts, sequences, appointments, bookings } = useApp();
  const views = sequenceView(campaign, { contacts, sequences, appointments, bookings });

  return (
    <Panel title="Email" note="Read live from the Email module — open a sequence there to change its wording or timing.">
      {views.length === 0 ? (
        <Nothing>
          No email sequence has been built for this campaign yet. Build it from the Overview tab
          once there are prospects with email addresses.
        </Nothing>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {views.map(s => (
            <div key={s.id} style={{ border: '1px solid #eef1f5', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <Mail size={14} color="#64748b" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{s.name}</span>
                </span>
                {s.status !== 'missing' && (
                  <button onClick={() => navigate('/marketing')} className="press" style={{ ...ghostBtn, padding: '5px 11px', fontSize: 12 }}>
                    Open in Marketing <ArrowUpRight size={12} />
                  </button>
                )}
              </div>
              {s.status === 'missing' ? (
                <p style={{ margin: 0, fontSize: 12.5, color: '#b91c1c' }}>
                  This sequence no longer exists in Marketing — it was deleted there.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 96px), 1fr))' }}>
                  <Stat label="Enrolled" value={s.enrolled} />
                  <Stat label="Still going" value={s.active} />
                  <Stat label="Finished" value={s.completed} />
                  <Stat label="Sent" value={s.sent} />
                  <Stat label="Opened" value={s.openRate === null ? null : s.opened} note={s.openRate === null ? undefined : `${s.openRate}%`} />
                  <Stat label="Replied" value={s.replyRate === null ? null : s.replied} note={s.replyRate === null ? undefined : `${s.replyRate}%`} />
                  <Stat label="Bounced" value={s.sent ? s.bounced : null} />
                </div>
              )}
            </div>
          ))}
          <p style={{ margin: 0, fontSize: 11.5, color: '#94a3b8', lineHeight: 1.6 }}>{describeReach()}</p>
        </div>
      )}
    </Panel>
  );
}

function Stat({ label, value, note }: { label: string; value: number | null; note?: string }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: value === null ? '#cbd5e1' : '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
        {value === null ? '—' : value.toLocaleString()}
      </p>
      <p style={{ margin: 0, fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#94a3b8' }}>
        {label}{note ? ` · ${note}` : ''}
      </p>
    </div>
  );
}

/* ── SMS ───────────────────────────────────────────────────────────────── */

export function SmsTab({ campaign }: { campaign: AICampaign }) {
  const wanted = !!campaign.strategy?.channels.includes('sms');
  const withPhone = campaignContacts(campaign, { contacts: useApp().contacts }).filter(c => c.phone?.trim()).length;

  return (
    <Panel title="SMS" note="What the plan asked for, and what this CRM can currently do about it.">
      {!wanted ? (
        <Nothing>The plan does not use SMS. Add it in the Strategy tab if you want to.</Nothing>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 9, padding: '11px 13px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9 }}>
            <Info size={14} color="#b45309" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ margin: 0, fontSize: 12.5, color: '#92400e', lineHeight: 1.6 }}>
                <strong>No SMS campaign has been created.</strong> This CRM can now send an
                individual text — with consent checks and STOP handling — but it has no SMS
                campaign engine to enrol people into, so the agent will not create a record that
                could never send.
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#92400e', lineHeight: 1.6 }}>
                {withPhone > 0
                  ? `${withPhone} of this campaign's contacts have a phone number, so they are reachable the moment there is something to enrol them in.`
                  : 'None of this campaign’s contacts has a phone number yet.'}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#64748b' }}>
            <MessageSquare size={13} />
            Texts always carry a way to opt out, and a number that replies STOP is never messaged again.
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ── Appointments ──────────────────────────────────────────────────────── */

export function AppointmentsTab({ campaign }: { campaign: AICampaign }) {
  const navigate = useNavigate();
  const { contacts, sequences, appointments, bookings } = useApp();
  const { appointments: appts, bookings: books } =
    campaignMeetings(campaign, { contacts, sequences, appointments, bookings });

  const rows = [
    ...appts.map(a => ({ id: a.id, who: a.contactName || 'Unknown', what: a.title, when: `${a.date} ${a.time}`, status: a.status, from: 'Appointment' })),
    ...books.map(b => ({ id: b.id, who: b.guestName, what: b.eventTypeName || 'Booking', when: `${b.slotDate} ${b.slotTime}`, status: b.status, from: 'Booking page' })),
  ].sort((a, b) => a.when.localeCompare(b.when));

  return (
    <Panel title="Appointments" note="Meetings with people this campaign put into your CRM, read from the Calendar.">
      {rows.length === 0 ? (
        <Nothing>
          None yet. A meeting appears here when someone this campaign contacted books one — matched
          on the contact, so meetings with people it never touched are left out.
        </Nothing>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {rows.map(r => (
            <div key={r.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid #eef1f5', borderRadius: 9, backgroundColor: '#f8fafc' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <CalendarClock size={14} color="#64748b" style={{ flexShrink: 0 }} />
                <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{r.who} · {r.what}</span>
                  <span style={{ fontSize: 11.5, color: '#94a3b8' }}>{r.when} · {r.from} · {r.status}</span>
                </span>
              </span>
              <button onClick={() => navigate('/calendar')} className="press" style={{ ...ghostBtn, padding: '5px 11px', fontSize: 12 }}>
                Calendar <ArrowUpRight size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── Leads list (the "Leads" tab's people view) ────────────────────────── */

export function ContactsTab({ campaign }: { campaign: AICampaign }) {
  const navigate = useNavigate();
  const { contacts } = useApp();
  const mine = campaignContacts(campaign, { contacts });

  return (
    <Panel title="In your CRM" note="Prospects this campaign promoted to real contacts.">
      {mine.length === 0 ? (
        <Nothing>None yet. Building the campaign turns qualified prospects into contacts.</Nothing>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {mine.map(c => (
            <button key={c.id} onClick={() => navigate('/contacts')} className="press"
              style={{
                display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', border: '1px solid #eef1f5', borderRadius: 9,
                backgroundColor: '#f8fafc', textAlign: 'left', width: '100%', cursor: 'pointer', font: 'inherit',
              }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Users size={14} color="#64748b" style={{ flexShrink: 0 }} />
                <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{c.name}</span>
                  <span style={{ fontSize: 11.5, color: '#94a3b8' }}>
                    {c.email || 'no email'} · {c.phone || 'no phone'}
                  </span>
                </span>
              </span>
              <ArrowUpRight size={13} color="#64748b" style={{ flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ── Settings ──────────────────────────────────────────────────────────── */

const PERMISSIONS: { key: keyof AIGuardrails; label: string; why: string }[] = [
  { key: 'createWorkflows', label: 'Create sequences and workflows', why: 'Building records is reversible; nothing is sent by creating one.' },
  { key: 'activateWorkflows', label: 'Start them running', why: 'A started sequence begins sending on its schedule.' },
  { key: 'sendEmail', label: 'Send email', why: 'Enrols people, which puts real messages in real inboxes.' },
  { key: 'sendSms', label: 'Send SMS', why: 'A text costs money per message and arrives on a phone.' },
  { key: 'bookAppointments', label: 'Book appointments', why: 'Puts meetings in your calendar without asking.' },
];

const LIMITS: { key: keyof AIGuardrails; label: string; suffix: string }[] = [
  { key: 'dailyNewProspects', label: 'New prospects a day', suffix: 'searched' },
  { key: 'maxEmailsPerDay', label: 'Emails a day', suffix: 'across this campaign' },
  { key: 'maxSmsPerDay', label: 'Texts a day', suffix: 'across this campaign' },
];

export function SettingsTab({ campaign, onChanged }: { campaign: AICampaign; onChanged: () => void }) {
  const { addNotification } = useApp();
  const [draft, setDraft] = useState<AIGuardrails>(campaign.guardrails);
  const dirty = JSON.stringify(draft) !== JSON.stringify(campaign.guardrails);

  const save = () => {
    if (!setGuardrails(campaign.id, draft)) {
      addNotification(takeSaveError() || 'That could not be saved.', 'error');
      return;
    }
    const changes = (Object.keys(draft) as (keyof AIGuardrails)[])
      .filter(k => draft[k] !== campaign.guardrails[k])
      .map(k => `${k}: ${campaign.guardrails[k]} → ${draft[k]}`);
    logDecision(campaign.id, {
      kind: 'approval',
      summary: 'Campaign controls changed',
      because: `Changed by a person: ${changes.join(', ')}.`,
    });
    onChanged();
    addNotification('Controls saved');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel title="What the agent may do on its own" note="Enforced when the campaign is built, not just hidden on this screen.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {PERMISSIONS.map(p => (
            <div key={p.key} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{p.label}</p>
                <p style={{ margin: 0, fontSize: 11.5, color: '#94a3b8', lineHeight: 1.5 }}>{p.why}</p>
              </div>
              <div role="group" aria-label={p.label} style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {(['off', 'approval', 'on'] as Permission[]).map(v => {
                  const on = draft[p.key] === v;
                  return (
                    <button key={v} onClick={() => setDraft(d => ({ ...d, [p.key]: v }))} className="press"
                      aria-pressed={on}
                      style={{
                        padding: '5px 11px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: `1px solid ${on ? '#17191c' : '#e2e8f0'}`,
                        backgroundColor: on ? '#17191c' : 'white',
                        color: on ? 'white' : '#475569',
                      }}>
                      {PERMISSION_LABEL[v]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Limits" note="Caps on what one day of this campaign can do.">
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))' }}>
          {LIMITS.map(l => (
            <label key={l.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{l.label}</span>
              <input
                type="number" min={0}
                value={draft[l.key] as number}
                onChange={e => setDraft(d => ({ ...d, [l.key]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13.5, outline: 'none', boxSizing: 'border-box', color: '#0f172a' }}
              />
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{l.suffix}</span>
            </label>
          ))}
        </div>
      </Panel>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => setDraft(campaign.guardrails)} disabled={!dirty} className="press"
          style={{ ...ghostBtn, opacity: dirty ? 1 : 0.45, cursor: dirty ? 'pointer' : 'not-allowed' }}>
          Undo changes
        </button>
        <button onClick={() => setDraft({ ...DEFAULT_GUARDRAILS })} className="press" style={ghostBtn}>
          <Ban size={13} /> Back to cautious defaults
        </button>
        <button onClick={save} disabled={!dirty} className="press"
          style={{ ...primaryBtn, opacity: dirty ? 1 : 0.45, cursor: dirty ? 'pointer' : 'not-allowed' }}>
          Save controls
        </button>
      </div>
    </div>
  );
}
