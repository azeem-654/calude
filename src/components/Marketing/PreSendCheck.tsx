/**
 * PreSendCheck.tsx — the gate a campaign passes through before it goes out.
 *
 * A campaign is the one place where a mistake is expensive: a thousand sends
 * to a stale list can cost a sending reputation that took months to build. So
 * this runs the same checks the single-contact composer runs, but across the
 * whole audience, and it removes what must not be sent to rather than merely
 * warning about it.
 */
import { useMemo, useState } from 'react';
import {
  ShieldCheck, ShieldAlert, AlertTriangle, Info, Check, X, Send, Beaker, Loader,
} from 'lucide-react';
import type { Contact } from '../../types';
import { preSendCheck, sendableRecipients, loadSettings } from '../../services/deliverability';
import { loadSeeds } from '../../services/warmup';
import { sendToContact } from '../../services/contactEmail';

const INK = '#17191c';

const LEVEL_META = {
  block: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: X, label: 'Blocking' },
  warn:  { color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: AlertTriangle, label: 'Warning' },
  info:  { color: '#4f46e5', bg: '#eef2ff', border: '#c7d2fe', icon: Info, label: 'Note' },
} as const;

interface Props {
  audience: Contact[];
  subject: string;
  body: string;
  /** Called with the recipients that survived the checks. */
  onProceed: (recipients: Contact[]) => void;
  onCancel: () => void;
  onNotify: (text: string, kind?: 'success' | 'error' | 'info') => void;
}

export default function PreSendCheck({ audience, subject, body, onProceed, onCancel, onNotify }: Props) {
  const [seeding, setSeeding] = useState(false);
  const [seedDone, setSeedDone] = useState(false);
  const [override, setOverride] = useState(false);

  const settings = useMemo(() => loadSettings(), []);
  const report = useMemo(() => preSendCheck(audience, subject, body, settings), [audience, subject, body, settings]);
  const willSend = useMemo(() => sendableRecipients(audience, settings), [audience, settings]);
  const seeds = useMemo(() => loadSeeds(), []);

  const blocking = report.issues.filter(i => i.level === 'block');
  // Removing bad addresses is not an obstacle — it is the check doing its job.
  const hardBlocks = blocking.filter(i => !i.title.includes('will not be sent to'));
  const canProceed = willSend.length > 0 && (hardBlocks.length === 0 || override);

  const card: React.CSSProperties = { background: '#fff', borderRadius: 14, border: '1px solid #e6e9f0', padding: 16, marginBottom: 12 };
  const btn = (primary = false, danger = false): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: primary ? '10px 18px' : '9px 14px',
    border: primary ? 'none' : `1px solid ${danger ? '#fecaca' : '#e2e8f0'}`, borderRadius: 10,
    background: primary ? INK : danger ? '#fef2f2' : '#fff',
    color: primary ? '#fff' : danger ? '#dc2626' : '#475569',
    fontSize: 13, fontWeight: primary ? 700 : 600, cursor: 'pointer',
  });

  const contentColor = report.content.band === 'good' ? '#16a34a' : report.content.band === 'ok' ? '#d97706' : '#dc2626';

  return (
    <div>
      {/* Headline */}
      <div style={{ ...card, borderColor: canProceed ? '#bbf7d0' : '#fecaca', background: canProceed ? '#f0fdf4' : '#fef2f2' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {canProceed
            ? <ShieldCheck size={20} color="#16a34a" style={{ flexShrink: 0, marginTop: 1 }} />
            : <ShieldAlert size={20} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />}
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: canProceed ? '#166534' : '#991b1b' }}>
              {canProceed
                ? `Ready to send to ${willSend.length} of ${audience.length}`
                : hardBlocks.length ? 'Fix these before sending' : 'Nobody left to send to'}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: canProceed ? '#166534' : '#991b1b', lineHeight: 1.55 }}>
              {audience.length - willSend.length > 0
                ? `${audience.length - willSend.length} recipient${audience.length - willSend.length === 1 ? '' : 's'} will be skipped — suppressed, bounced or undeliverable. They are removed automatically because sending to them is what damages a sender score.`
                : 'Every recipient passed. Nothing has been suppressed or flagged.'}
            </p>
          </div>
        </div>
      </div>

      {/* Audience breakdown */}
      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
          {[
            ['Audience', String(audience.length), ''],
            ['Will send', String(willSend.length), ''],
            ['Skipped', String(report.blocked.length), 'invalid or suppressed'],
            ['Risky', String(report.risky.length), settings.blockRisky ? 'also skipped' : 'sent with caution'],
          ].map(([label, value, note]) => (
            <div key={label} style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #eef0f3' }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: INK, marginTop: 2 }}>{value}</div>
              {note && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{note}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Issues */}
      {report.issues.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            {report.issues.length} thing{report.issues.length === 1 ? '' : 's'} to know
          </div>
          {report.issues.map((issue, i) => {
            const m = LEVEL_META[issue.level];
            const Icon = m.icon;
            return (
              <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '9px 11px', borderRadius: 10, background: m.bg, border: `1px solid ${m.border}`, marginBottom: 7 }}>
                <Icon size={14} color={m.color} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: m.color }}>{issue.title}</div>
                  <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2, lineHeight: 1.5 }}>{issue.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Content */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: contentColor }}>Spam risk {report.content.score}/100</span>
          <span style={{ fontSize: 12, color: '#475569' }}>{report.content.summary}</span>
        </div>
        {report.content.issues.length > 0 && (
          <div style={{ marginTop: 9 }}>
            {report.content.issues.slice(0, 5).map((issue, i) => (
              <div key={i} style={{ borderTop: '1px solid #f1f5f9', paddingTop: 7, marginTop: 7 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#0f172a' }}>
                  {issue.label}
                  {issue.matches.length > 0 && <span style={{ fontWeight: 500, color: '#64748b' }}> — {issue.matches.slice(0, 4).join(', ')}</span>}
                </div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 2, lineHeight: 1.5 }}>{issue.advice}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Seed test */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 7 }}>
              <Beaker size={14} /> Seed test
            </div>
            <p style={{ margin: '3px 0 0', fontSize: 11.5, color: '#94a3b8', lineHeight: 1.5 }}>
              {seeds.length
                ? `Send this exact message to your ${seeds.length} seed mailbox${seeds.length === 1 ? '' : 'es'} first. Check where it lands before committing the full ${willSend.length}.`
                : 'No seed mailboxes configured. Add them in Settings → Email Deliverability → Warmup & providers to test placement before a big send.'}
            </p>
          </div>
          {seeds.length > 0 && (
            <button disabled={seeding || seedDone} style={btn()}
              title="Send this campaign to the seed mailboxes only"
              onClick={async () => {
                setSeeding(true);
                let ok = 0;
                for (const s of seeds) {
                  const out = await sendToContact(
                    { id: `seed-${s.id}`, name: 'Seed mailbox', email: s.email } as never,
                    { subject: `[SEED] ${subject}`, body, ignoreDeliverability: true },
                  );
                  if (out.ok) ok++;
                }
                setSeeding(false);
                setSeedDone(true);
                onNotify(ok === seeds.length
                  ? `Seed test sent to ${ok} mailbox${ok === 1 ? '' : 'es'} — check placement before launching.`
                  : `Only ${ok} of ${seeds.length} seed sends succeeded.`, ok === seeds.length ? 'success' : 'error');
              }}>
              {seeding ? <Loader size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Beaker size={13} />}
              {seedDone ? 'Seed test sent' : seeding ? 'Sending…' : 'Send seed test'}
            </button>
          )}
        </div>
      </div>

      {/* Override + actions */}
      {hardBlocks.length > 0 && (
        <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 12 }}>
          <input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)}
            style={{ marginTop: 2, accentColor: '#dc2626', cursor: 'pointer' }} />
          <span style={{ fontSize: 12, color: '#991b1b', lineHeight: 1.5 }}>
            Send anyway. I understand {hardBlocks.length === 1 ? 'this issue' : 'these issues'} can get this domain filtered,
            and that recovering a sender reputation takes far longer than fixing {hardBlocks.length === 1 ? 'it' : 'them'}.
          </span>
        </label>
      )}

      <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={btn()} title="Go back and change the campaign">Back</button>
        <button disabled={!canProceed} title={canProceed ? `Send to ${willSend.length} recipients` : 'Resolve the blocking issues first'}
          onClick={() => onProceed(willSend)}
          style={{ ...btn(true), opacity: canProceed ? 1 : 0.45, cursor: canProceed ? 'pointer' : 'not-allowed' }}>
          <Send size={14} /> Send to {willSend.length}
        </button>
      </div>
    </div>
  );
}
