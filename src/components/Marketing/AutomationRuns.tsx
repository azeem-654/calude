/**
 * Who is inside an automation, and what it has done to them.
 *
 * ── Why this had to exist at the same moment the engine did ──
 *
 * The builder has always shown "Enrolled: 0". Until the engine was written that
 * zero was the truth and also a lie: nothing was enrolled because nothing ever
 * ran, and the screen could not tell that apart from an automation nobody had
 * triggered yet. A customer had no way to find out which.
 *
 * So the engine and this were built together. A number on its own would repeat
 * the same problem one layer up — "3 active" says nothing about whether the
 * emails went. Every run opens into the list of nodes it passed through and
 * what each one actually did, including the ones that were skipped and why.
 */
import { useEffect, useState } from 'react';
import { Activity, ChevronDown, ChevronRight, Loader, RefreshCw } from 'lucide-react';
import {
  automationRuns, automationLog,
  type AutomationRun, type AutomationLogEntry,
} from '../../services/engagement';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';

const TONE: Record<string, { bg: string; fg: string; label: string }> = {
  active: { bg: '#eef2ff', fg: '#4338ca', label: 'Running' },
  done: { bg: '#ecfdf5', fg: '#16a34a', label: 'Finished' },
  stopped: { bg: '#f1f5f9', fg: '#64748b', label: 'Stopped' },
  failed: { bg: '#fef2f2', fg: '#b42318', label: 'Failed' },
};

export default function AutomationRuns({ automationId }: { automationId?: string }) {
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [totals, setTotals] = useState<{ status: string; n: number }[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState('');
  const [entries, setEntries] = useState<AutomationLogEntry[]>([]);
  const [entriesBusy, setEntriesBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    const r = await automationRuns(automationId);
    setBusy(false);
    if (!r.success) { setError(r.error ?? 'Could not read what the automations have done.'); return; }
    setError('');
    setRuns((r.runs ?? []) as AutomationRun[]);
    setTotals((r.totals ?? []) as { status: string; n: number }[]);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [automationId]);

  async function open(run: AutomationRun) {
    if (openId === run.id) { setOpenId(''); return; }
    setOpenId(run.id);
    setEntriesBusy(true);
    const r = await automationLog(run.id);
    setEntriesBusy(false);
    setEntries(r.success ? ((r.entries ?? []) as AutomationLogEntry[]) : []);
  }

  const count = (s: string) => totals.find(t => t.status === s)?.n ?? 0;

  return (
    <section style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <Activity size={16} color="#4338ca" />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: INK }}>What has actually run</h3>
        <span style={{ flex: 1 }} />
        <button onClick={() => void load()} disabled={busy} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px',
          border: `1px solid ${LINE}`, borderRadius: 9, background: '#fff', color: INK,
          fontSize: 12.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
        }}>
          {busy ? <Loader size={13} className="spin" /> : <RefreshCw size={13} />} Refresh
        </button>
      </div>

      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: MUTED, lineHeight: 1.6, maxWidth: 720 }}>
        Automations run on the server every five minutes, so they keep going with the app closed. A step
        that could not run — no mail server, no phone number on the contact — is <strong>skipped and named</strong>
        {' '}rather than counted as sent.
      </p>

      {error && (
        <p style={{
          margin: '0 0 12px', padding: '10px 13px', borderRadius: 10, background: '#fef2f2',
          border: '1px solid #fecaca', color: '#b42318', fontSize: 12.5,
        }}>{error}</p>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {(['active', 'done', 'stopped', 'failed'] as const).map(s => (
          <span key={s} style={{
            padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
            background: TONE[s].bg, color: TONE[s].fg,
          }}>{count(s)} {TONE[s].label.toLowerCase()}</span>
        ))}
      </div>

      {!busy && !runs.length && (
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
          Nobody has entered one yet. An automation starts when its trigger happens — a form is submitted,
          a contact is created — so switch one to <strong>Active</strong> and send yourself a test through
          the form it listens to.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {runs.map(run => {
          const tone = TONE[run.status] ?? TONE.stopped;
          const isOpen = openId === run.id;
          return (
            <article key={run.id} style={{ border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
              <button onClick={() => void open(run)} aria-expanded={isOpen} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px',
                background: '#fbfbfc', border: 'none', cursor: 'pointer', textAlign: 'left',
                fontFamily: 'inherit', flexWrap: 'wrap',
              }}>
                {isOpen ? <ChevronDown size={14} color={MUTED} /> : <ChevronRight size={14} color={MUTED} />}
                <span style={{ fontSize: 13, fontWeight: 700, color: INK, minWidth: 0 }}>
                  {run.contactName || run.contactEmail || run.contactId}
                </span>
                {!automationId && (
                  <span style={{ fontSize: 11.5, color: MUTED }}>in “{run.automationName}”</span>
                )}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: MUTED }}>{run.stepsTaken} step{run.stepsTaken === 1 ? '' : 's'}</span>
                <span style={{
                  padding: '2px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 800,
                  background: tone.bg, color: tone.fg,
                }}>{tone.label}</span>
              </button>

              {isOpen && (
                <div style={{ padding: '12px 13px', borderTop: `1px solid ${LINE}` }}>
                  <p style={{ margin: '0 0 10px', fontSize: 11.5, color: MUTED }}>
                    Started by {run.triggerKind.replace(/_/g, ' ')}
                    {run.triggerRef ? ` — “${run.triggerRef}”` : ''}.
                    {run.detail ? ` ${run.detail}` : ''}
                  </p>
                  {entriesBusy ? (
                    <p style={{ margin: 0, fontSize: 12, color: MUTED }}>Reading the history…</p>
                  ) : !entries.length ? (
                    <p style={{ margin: 0, fontSize: 12, color: MUTED }}>
                      Nothing has been carried out yet — the next step is due {new Date(run.dueAt).toLocaleString()}.
                    </p>
                  ) : (
                    <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {entries.map(e => (
                        <li key={e.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                          <span style={{
                            marginTop: 4, width: 7, height: 7, borderRadius: 999, flexShrink: 0,
                            background: e.status === 'ok' ? '#16a34a' : e.status === 'failed' ? '#b42318' : '#94a3b8',
                          }} />
                          <span style={{ fontSize: 12.5, color: INK, lineHeight: 1.55 }}>
                            <strong style={{ fontWeight: 700 }}>{e.nodeType.replace(/_/g, ' ') || 'step'}</strong>
                            {' — '}{e.detail}
                            <span style={{ color: MUTED }}> · {new Date(e.createdAt).toLocaleString()}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
