/**
 * VerifyPlacement.tsx — bulk list verification and inbox placement testing.
 *
 * These are the two slow jobs in the deliverability module. Verification runs
 * as a durable queue that survives closing the tab; placement sends a marked
 * message to seed mailboxes and then reads those mailboxes over IMAP to find
 * out where it actually landed.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ListChecks, Play, Pause, RefreshCw, Trash2, Inbox, AlertTriangle, Check, X,
  Send, KeyRound, Plus, MailQuestion,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { healthFor } from '../../services/deliverability';
import { loadSeeds, providerName, type Seed } from '../../services/warmup';
import { sendToContact } from '../../services/contactEmail';
import {
  loadJob, queueVerification, pauseJob, resumeJob, clearJob, runQueuePass,
  jobProgress, jobSummary, placementCapabilities, listPlacementSeeds,
  savePlacementSeed, removePlacementSeed, startPlacementRun, checkPlacement,
  loadPlacementRuns, runSummary, placementSubject, placementBody,
  type VerifyJob, type PlacementSeedConfig, type PlacementRun,
} from '../../services/verifyQueue';

const INK = '#17191c';

const PLACEMENT_META = {
  inbox:   { label: 'Inbox',        color: '#16a34a', bg: '#dcfce7' },
  spam:    { label: 'Spam',         color: '#dc2626', bg: '#fef2f2' },
  missing: { label: 'Not delivered', color: '#d97706', bg: '#fef3c7' },
  pending: { label: 'Waiting',      color: '#64748b', bg: '#f1f5f9' },
} as const;

/** Sensible IMAP defaults, so the form is mostly filled in already. */
const IMAP_PRESETS: Record<string, { host: string; port: number; note: string }> = {
  'gmail.com':    { host: 'imap.gmail.com', port: 993, note: 'Gmail needs an app password — your normal password will not work.' },
  'outlook.com':  { host: 'outlook.office365.com', port: 993, note: 'Outlook needs an app password with IMAP enabled on the account.' },
  'hotmail.com':  { host: 'outlook.office365.com', port: 993, note: 'Outlook needs an app password with IMAP enabled on the account.' },
  'yahoo.com':    { host: 'imap.mail.yahoo.com', port: 993, note: 'Yahoo needs an app password generated in Account Security.' },
  'icloud.com':   { host: 'imap.mail.me.com', port: 993, note: 'iCloud needs an app-specific password.' },
};

export default function VerifyPlacement() {
  const { addNotification, contacts } = useApp();

  const [job, setJob] = useState<VerifyJob | null>(() => loadJob());
  /* A ref, not state: putting the in-flight flag in the effect's dependencies
     made the effect re-run the moment it was set, which cancelled its own
     callback and left the flag stuck — the queue then stopped after one batch. */
  const passInFlight = useRef(false);
  const [caps, setCaps] = useState<{ imap: boolean; seeds: number; message: string } | null>(null);
  const [configs, setConfigs] = useState<PlacementSeedConfig[]>([]);
  const [runs, setRuns] = useState<PlacementRun[]>(() => loadPlacementRuns());
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const seeds = useMemo(() => loadSeeds(), [runs.length]);
  const unchecked = useMemo(
    () => contacts.filter(c => c.email && !healthFor(c.email)),
    [contacts, job?.finishedAt],
  );

  useEffect(() => {
    void placementCapabilities().then(setCaps);
    void listPlacementSeeds().then(setConfigs);
  }, []);

  /* Drive the queue while this screen is open. The dashboard job keeps it
     moving when it is not — this just makes progress visible. */
  useEffect(() => {
    if (!job || job.status !== 'running' || passInFlight.current) return;
    passInFlight.current = true;
    let cancelled = false;
    void runQueuePass().then(next => {
      passInFlight.current = false;
      if (!cancelled) setJob(next);   // which re-runs this effect for the next batch
    });
    return () => { cancelled = true; };
  }, [job]);

  const card: React.CSSProperties = { background: '#fff', borderRadius: 18, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: 20, marginBottom: 18 };
  const inp: React.CSSProperties = { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };
  const h3: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 7 };
  const sub: React.CSSProperties = { margin: '3px 0 0', fontSize: 12, color: '#94a3b8', lineHeight: 1.5 };
  const btn = (primary = false): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: primary ? '9px 15px' : '8px 13px',
    border: primary ? 'none' : '1px solid #e2e8f0', borderRadius: 9,
    background: primary ? INK : '#fff', color: primary ? '#fff' : '#475569',
    fontSize: 12.5, fontWeight: primary ? 700 : 600, cursor: 'pointer',
  });

  const progress = job ? jobProgress(job) : null;
  const latestRun = runs[0];

  return (
    <div>
      {/* Bulk verification */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={h3}><ListChecks size={15} /> Bulk verification</h3>
            <p style={sub}>
              Checks every address against DNS, disposable and role lists, and your verification provider
              if one is connected. It runs in the background and picks up where it left off, so closing
              this tab does not lose the work.
            </p>
          </div>
        </div>

        {job && job.status !== 'done' && progress && (
          <div style={{ marginTop: 14, padding: 12, background: '#f8fafc', border: '1px solid #eef0f3', borderRadius: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>
                {job.label} — {progress.done} of {progress.total}
                {job.status === 'paused' && <span style={{ color: '#d97706' }}> (paused)</span>}
              </span>
              <div style={{ display: 'flex', gap: 7 }}>
                {job.status === 'running' ? (
                  <button onClick={() => setJob(pauseJob())} title="Pause the queue" style={btn()}><Pause size={12} /> Pause</button>
                ) : (
                  <button onClick={() => setJob(resumeJob())} title="Resume the queue" style={btn()}><Play size={12} /> Resume</button>
                )}
                <button onClick={() => { clearJob(); setJob(null); }} title="Discard this job"
                  style={{ ...btn(), color: '#dc2626', borderColor: '#fecaca' }}><X size={12} /> Cancel</button>
              </div>
            </div>
            <div style={{ height: 6, background: '#e6e9f0', borderRadius: 3, marginTop: 10, overflow: 'hidden' }}>
              <div style={{ width: `${progress.percent}%`, height: '100%', background: INK, transition: 'width .3s' }} />
            </div>
            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 7 }}>
              {jobSummary(job)}
              {job.error && <span style={{ color: '#dc2626' }}> {job.error}</span>}
            </div>
          </div>
        )}

        {job?.status === 'done' && (
          <div style={{ marginTop: 14, padding: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check size={14} color="#16a34a" />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#166534' }}>{job.label} finished</span>
              <button onClick={() => { clearJob(); setJob(null); }} title="Dismiss" style={{ ...btn(), marginLeft: 'auto', padding: '4px 10px' }}>Dismiss</button>
            </div>
            <div style={{ fontSize: 12, color: '#166534', marginTop: 5 }}>{jobSummary(job)}</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button disabled={!!job && job.status !== 'done'} style={btn(true)}
            title={`Check the ${unchecked.length} addresses that have never been verified`}
            onClick={() => {
              if (!unchecked.length) { addNotification('Every address has already been checked.', 'info'); return; }
              setJob(queueVerification(unchecked.map(c => c.email), 'Unchecked contacts'));
              addNotification(`Verifying ${unchecked.length} addresses in the background`);
            }}>
            <ListChecks size={13} /> Verify {unchecked.length} unchecked
          </button>
          <button disabled={!!job && job.status !== 'done'} style={btn()}
            title="Re-check every address in the database"
            onClick={() => {
              const all = contacts.map(c => c.email).filter(Boolean);
              if (!all.length) { addNotification('There are no addresses to check.', 'error'); return; }
              setJob(queueVerification(all, 'Whole contact database'));
              addNotification(`Verifying all ${all.length} addresses in the background`);
            }}>
            <RefreshCw size={13} /> Re-check all {contacts.filter(c => c.email).length}
          </button>
        </div>
      </div>

      {/* Inbox placement */}
      <div style={card}>
        <h3 style={h3}><Inbox size={15} /> Inbox placement test</h3>
        <p style={sub}>
          Sends a marked message to your seed mailboxes, then reads those mailboxes to find out whether it
          landed in the inbox or in spam. Every other number in this module describes what the sending
          server did; this is the only one that says where the message ended up.
        </p>

        {caps && !caps.imap && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '9px 11px' }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{caps.message} You can still run the test — open each mailbox yourself and record the result in the warmup panel.</span>
          </div>
        )}

        {!seeds.length && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: '#64748b' }}>
            Add seed mailboxes in <strong>Warmup &amp; providers</strong> first — a Gmail, an Outlook and a
            Yahoo address give you a reading across the providers most of your contacts use.
          </div>
        )}

        {seeds.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button disabled={sending} style={btn(true)} title="Send a marked test message to every seed mailbox"
                onClick={async () => {
                  setSending(true);
                  const run = startPlacementRun(seeds);
                  let sent = 0;
                  for (const s of seeds) {
                    const out = await sendToContact(
                      { id: `seed-${s.id}`, name: 'Seed mailbox', email: s.email } as never,
                      { subject: placementSubject(run.marker), body: placementBody(run.marker), ignoreDeliverability: true },
                    );
                    if (out.ok) sent++;
                  }
                  setRuns(loadPlacementRuns());
                  setSending(false);
                  addNotification(sent === seeds.length
                    ? `Test sent to all ${sent} seed mailboxes. Give it a minute, then check placement.`
                    : `Sent to ${sent} of ${seeds.length} seeds — check your email provider settings.`,
                    sent === seeds.length ? 'success' : 'error');
                }}>
                <Send size={13} /> {sending ? 'Sending…' : `Send test to ${seeds.length} seed${seeds.length === 1 ? '' : 's'}`}
              </button>

              {latestRun && (
                <button disabled={checking || !caps?.imap} style={btn()}
                  title={caps?.imap ? 'Read each seed mailbox and record where the message landed' : 'This host has no IMAP extension, so mailboxes cannot be read from here'}
                  onClick={async () => {
                    setChecking(true);
                    await checkPlacement(latestRun);
                    setRuns(loadPlacementRuns());
                    setChecking(false);
                    addNotification('Placement checked');
                  }}>
                  <MailQuestion size={13} /> {checking ? 'Checking…' : 'Check placement'}
                </button>
              )}
            </div>

            {latestRun && (
              <div style={{ marginTop: 14 }}>
                {(() => {
                  const s = runSummary(latestRun);
                  return (
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: s.decided ? (s.inboxRate >= 80 ? '#16a34a' : s.inboxRate >= 50 ? '#d97706' : '#dc2626') : '#64748b' }}>
                      {s.decided
                        ? `${s.inboxRate}% inbox placement — ${s.inbox} inbox, ${s.spam} spam, ${s.missing} not delivered`
                        : 'Sent. Wait a minute for delivery, then check placement.'}
                    </div>
                  );
                })()}
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                  Marker <code>{latestRun.marker}</code> · sent {new Date(latestRun.startedAt).toLocaleString()}
                </div>

                <div style={{ marginTop: 10 }}>
                  {latestRun.results.map(r => {
                    const m = PLACEMENT_META[r.placement];
                    return (
                      <div key={r.seedId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #f1f5f9' }}>
                        <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 800, background: m.bg, color: m.color, whiteSpace: 'nowrap' }}>{m.label}</span>
                        <span style={{ fontSize: 12.5, color: INK, flex: 1, wordBreak: 'break-all' }}>{r.email}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
                          {r.folder ? r.folder : providerName(r.provider as never)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {latestRun.results.some(r => r.error) && (
                  <div style={{ fontSize: 11.5, color: '#dc2626', marginTop: 8 }}>
                    {latestRun.results.find(r => r.error)?.error}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Seed mailbox credentials */}
      <div style={card}>
        <h3 style={h3}><KeyRound size={15} /> Seed mailbox access</h3>
        <p style={sub}>
          To detect placement automatically the server needs to read each seed mailbox. Credentials are
          stored on the server and never sent back to this browser — use an <strong>app password</strong>,
          not your normal one, and prefer mailboxes that exist only for this purpose.
        </p>

        {seeds.map(seed => {
          const cfg = configs.find(c => c.id === seed.id);
          const domain = seed.email.split('@')[1] ?? '';
          const preset = IMAP_PRESETS[domain];
          const open = editing === seed.id;
          return (
            <div key={seed.id} style={{ borderTop: '1px solid #f1f5f9', paddingTop: 11, marginTop: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: INK, wordBreak: 'break-all' }}>{seed.email}</span>
                {cfg?.hasPassword
                  ? <span style={{ fontSize: 10.5, fontWeight: 800, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: 999 }}>Connected</span>
                  : <span style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 999 }}>No access</span>}
                <button onClick={() => setEditing(open ? null : seed.id)} style={{ ...btn(), marginLeft: 'auto', padding: '5px 11px' }}
                  title={cfg?.hasPassword ? 'Change these credentials' : 'Give the server access to this mailbox'}>
                  {open ? 'Close' : cfg?.hasPassword ? 'Change' : 'Connect'}
                </button>
                {cfg?.hasPassword && (
                  <button title="Remove the stored credentials"
                    onClick={async () => { await removePlacementSeed(seed.id); setConfigs(await listPlacementSeeds()); addNotification('Mailbox access removed'); }}
                    style={{ padding: 7, border: '1px solid #fecaca', borderRadius: 8, background: '#fef2f2', cursor: 'pointer', display: 'flex', color: '#dc2626' }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              {open && <SeedForm seed={seed} cfg={cfg} preset={preset}
                onSaved={async () => { setConfigs(await listPlacementSeeds()); setEditing(null); addNotification(`${seed.email} connected`); }}
                onError={m => addNotification(m, 'error')} />}
            </div>
          );
        })}

        {!seeds.length && <p style={{ ...sub, marginTop: 10 }}>No seed mailboxes yet — add them in Warmup &amp; providers.</p>}
      </div>
    </div>
  );
}

/* ── Credential form ─────────────────────────────────────────────────────── */

function SeedForm({ seed, cfg, preset, onSaved, onError }: {
  seed: Seed;
  cfg?: PlacementSeedConfig;
  preset?: { host: string; port: number; note: string };
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [host, setHost] = useState(cfg?.host || preset?.host || '');
  const [port, setPort] = useState(String(cfg?.port ?? preset?.port ?? 993));
  const [encryption, setEncryption] = useState<'ssl' | 'tls' | 'none'>(cfg?.encryption ?? 'ssl');
  const [username, setUsername] = useState(cfg?.username || seed.email);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const inp: React.CSSProperties = { padding: '8px 11px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 12.5, outline: 'none', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box', width: '100%' };

  return (
    <div style={{ marginTop: 10, padding: 12, background: '#f8fafc', border: '1px solid #eef0f3', borderRadius: 11 }}>
      {preset && <div style={{ fontSize: 11.5, color: '#92400e', marginBottom: 9 }}>{preset.note}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 9 }}>
        <input value={host} onChange={e => setHost(e.target.value)} placeholder="IMAP host" title="IMAP server" style={inp} />
        <input value={port} onChange={e => setPort(e.target.value)} placeholder="993" inputMode="numeric" title="Port" style={inp} />
        <select value={encryption} onChange={e => setEncryption(e.target.value as 'ssl' | 'tls' | 'none')} title="Encryption" style={{ ...inp, cursor: 'pointer' }}>
          <option value="ssl">SSL</option>
          <option value="tls">TLS</option>
          <option value="none">None</option>
        </select>
        <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" title="Usually the full address" style={inp} />
        <input value={password} onChange={e => setPassword(e.target.value)} type="password"
          placeholder={cfg?.hasPassword ? 'App password (leave blank to keep)' : 'App password'}
          title="Stored on the server, never returned to the browser" style={inp} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <button disabled={busy} title="Save these credentials on the server"
          onClick={async () => {
            const p = Number(port);
            if (!host.trim()) { onError('Enter the IMAP host.'); return; }
            if (!Number.isFinite(p) || p < 1 || p > 65535) { onError('That port is not valid.'); return; }
            if (!cfg?.hasPassword && !password) { onError('An app password is required.'); return; }
            setBusy(true);
            const res = await savePlacementSeed({
              id: seed.id, email: seed.email, host: host.trim(), port: p,
              encryption, username: username.trim() || seed.email, password,
            });
            setBusy(false);
            if (!res.ok) { onError(res.error || 'Could not save.'); return; }
            setPassword('');
            onSaved();
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 15px', border: 'none', borderRadius: 9, background: INK, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={12} /> {busy ? 'Saving…' : 'Save access'}
        </button>
      </div>
    </div>
  );
}
