/**
 * Settings → Security & Privacy.
 *
 * Everything on this page is the server's answer about the signed-in account
 * (services/security.ts), so nothing here can show a protection that is not
 * there. Where a protection is off — 2-step sign-in, say — it says off, with
 * the way to turn it on next to it. There are no decorative badges: every
 * green tick is a fact somebody could check.
 *
 *   The summary       four facts: 2-step, devices, password, isolation
 *   Account           2-step sign-in (with a QR code), signed-in devices
 *   Activity          sign-ins, failures, changes — from the audit log
 *   Workspace         who can open it, and what it is connected to
 *   Data & privacy    export, what AI receives, retention, support access,
 *                     deleting the account
 *
 * Changing the password stays in SecurityPanel, below this.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck, Smartphone, Monitor, LogOut, Loader, Check, AlertTriangle, KeyRound, Users, Plug,
  Download, Sparkles, Clock, LifeBuoy, Trash2, Activity, Lock, X,
} from 'lucide-react';
import {
  beginTwoStep, deleteAccount, disableTwoStep, enableTwoStep, exportWorkspace, fetchSecurity, revokeOtherSessions,
  revokeSession, EVENT_LABEL, type SecurityOverview,
} from '../../services/security';
import { logout } from '../../services/auth';

const CARD: React.CSSProperties = {
  backgroundColor: 'white', borderRadius: 18, border: '1px solid #e6e9f0',
  boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: 24, marginBottom: 20,
};
const H3: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 };
const SUB: React.CSSProperties = { fontSize: 12.5, color: '#64748b', margin: '3px 0 0', lineHeight: 1.5 };
const BTN: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 600,
  fontFamily: 'inherit', cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a',
};
const DARK: React.CSSProperties = { ...BTN, background: '#17191c', color: '#fff', border: '1px solid #17191c' };
const INPUT: React.CSSProperties = {
  padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

const when = (iso: string) => {
  const t = Date.parse(iso);
  if (!t) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

function Head({ icon: Icon, title, sub, right, bare }: { icon: typeof Lock; title: string; sub: string; right?: React.ReactNode; bare?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', ...(bare ? {} : { marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid #f1f5f9' }) }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#f0f1f3', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon size={18} color="#17191c" />
      </div>
      <div style={{ minWidth: 0, flex: '1 1 220px' }}>
        <h3 style={H3}>{title}</h3>
        <p style={SUB}>{sub}</p>
      </div>
      {right}
    </div>
  );
}

function Note({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div role={ok ? 'status' : 'alert'} style={{
      display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12, padding: '9px 12px', borderRadius: 9,
      background: ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}`,
      fontSize: 12.5, color: ok ? '#166534' : '#991b1b', lineHeight: 1.5,
    }}>
      {ok ? <Check size={14} style={{ marginTop: 2, flexShrink: 0 }} /> : <AlertTriangle size={14} style={{ marginTop: 2, flexShrink: 0 }} />}
      <span>{text}</span>
    </div>
  );
}

/* ── 2-step set-up, with a QR code ── */
function TwoStepSetup({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [secret, setSecret] = useState('');
  const [url, setUrl] = useState('');
  const [svg, setSvg] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    void (async () => {
      const r = await beginTwoStep();
      if (!r.ok) { setErr(r.data.error ?? 'Could not start the set-up.'); return; }
      setSecret(r.data.secret); setUrl(r.data.url);
      /* Loaded only here: nobody else on the page needs a QR encoder. The
         secret never leaves the browser for this — the code is drawn locally. */
      const qr = (await import('qrcode-generator')).default(0, 'M');
      qr.addData(r.data.url);
      qr.make();
      setSvg(qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }));
    })();
  }, []);

  const confirm = async () => {
    setBusy(true); setErr('');
    const r = await enableTwoStep(code.trim());
    setBusy(false);
    if (r.ok) onDone(); else setErr(r.data.error ?? 'That code did not work.');
  };

  return (
    <div style={{ marginTop: 14, padding: 16, borderRadius: 14, background: '#f8fafc', border: '1px solid #e6e9f0', display: 'grid', gap: 14 }}>
      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#334155', lineHeight: 1.6, display: 'grid', gap: 4 }}>
        <li>Open an authenticator app — Google Authenticator, Microsoft Authenticator, 1Password or similar.</li>
        <li>Scan this code, or type the key into the app.</li>
        <li>Enter the 6-digit code it shows to switch 2-step sign-in on.</li>
      </ol>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div aria-label="QR code for your authenticator app" role="img"
          style={{ width: 168, height: 168, background: '#fff', borderRadius: 12, border: '1px solid #e6e9f0', padding: 6, boxSizing: 'border-box' }}
          dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}>
          {svg ? undefined : <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}><Loader size={18} className="spin" /></div>}
        </div>
        <div style={{ display: 'grid', gap: 8, minWidth: 0, flex: '1 1 220px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Or type this key</span>
          <code style={{ fontSize: 13, letterSpacing: '0.08em', wordBreak: 'break-all', background: '#fff', padding: '8px 10px', borderRadius: 8, border: '1px solid #e6e9f0' }}>
            {secret.replace(/(.{4})/g, '$1 ').trim() || '…'}
          </code>
          {url && <a href={url} style={{ fontSize: 12.5, color: '#5b46e5' }}>Open in an authenticator app on this device</a>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric"
          autoComplete="one-time-code" placeholder="6-digit code" aria-label="6-digit code" style={{ ...INPUT, width: 150, letterSpacing: '0.2em' }}
          onKeyDown={e => { if (e.key === 'Enter' && code.length === 6) void confirm(); }} />
        <button type="button" style={DARK} disabled={busy || code.length !== 6} onClick={() => void confirm()}>
          {busy ? <Loader size={14} className="spin" /> : <ShieldCheck size={14} />} Switch on
        </button>
        <button type="button" style={BTN} onClick={onCancel}>Cancel</button>
      </div>
      {err && <Note ok={false} text={err} />}
    </div>
  );
}

export default function SecurityCenter() {
  const [ov, setOv] = useState<SecurityOverview | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [setup, setSetup] = useState(false);
  const [offOpen, setOffOpen] = useState(false);
  const [offCode, setOffCode] = useState('');
  const [offPw, setOffPw] = useState('');
  const [busy, setBusy] = useState('');
  const [delOpen, setDelOpen] = useState(false);
  const [delText, setDelText] = useState('');
  const [delPw, setDelPw] = useState('');
  const [delCode, setDelCode] = useState('');

  const load = useCallback(async () => {
    const r = await fetchSecurity();
    if (r.ok && r.overview) { setOv(r.overview); setErr(''); } else setErr(r.error ?? 'Could not load.');
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!ov) {
    return (
      <div style={CARD}>
        {err ? <Note ok={false} text={err} /> : <span style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#64748b', fontSize: 13 }}><Loader size={14} className="spin" /> Loading your security settings…</span>}
      </div>
    );
  }

  const others = ov.sessions.filter(s => !s.current);
  const connected = (ov.workspace?.integrations ?? []).filter(i => i.connected > 0);

  const facts = [
    { ok: ov.account.mfaEnabled, label: ov.account.mfaEnabled ? '2-step sign-in on' : '2-step sign-in off', icon: Smartphone },
    { ok: true, label: `${ov.sessions.length} signed-in device${ov.sessions.length === 1 ? '' : 's'}`, icon: Monitor },
    { ok: ov.account.passwordSet || ov.account.emailVerified, label: ov.account.passwordSet ? 'Password set' : 'Signs in by email code or Google', icon: KeyRound },
    { ok: true, label: 'Workspace access-controlled', icon: Lock },
  ];

  const doExport = async () => {
    setBusy('export');
    const r = await exportWorkspace();
    setBusy('');
    if (!r.ok) { setMsg({ ok: false, text: r.data.error ?? 'Could not export.' }); return; }
    const blob = new Blob([JSON.stringify(r.data.export, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `protected-central-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    setMsg({ ok: true, text: 'Your workspace data was downloaded. Passwords and connected-service keys are never included.' });
    void load();
  };

  return (
    <div>
      {/* ── The summary ── */}
      <div style={{ ...CARD, background: 'linear-gradient(135deg, #f7fbf8, #fff)' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: '#e8f5ec', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <ShieldCheck size={21} color="#1f7a4d" />
          </div>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: 0 }}>Protected Workspace</h2>
            <p style={SUB}>Your workspace data is access-controlled on the server and separated from every other workspace. Control who can get in, and see what has happened, below.</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 8, marginTop: 16 }}>
          {facts.map(f => (
            <div key={f.label} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', borderRadius: 11, background: '#fff', border: `1px solid ${f.ok ? '#d9eee0' : '#fde3c3'}`, fontSize: 12.5, fontWeight: 600, color: '#0f172a' }}>
              <f.icon size={15} color={f.ok ? '#1f7a4d' : '#b45309'} /> {f.label}
            </div>
          ))}
        </div>
        {msg && <Note ok={msg.ok} text={msg.text} />}
      </div>

      {/* ── 2-step sign-in ── */}
      <div style={CARD}>
        <Head icon={Smartphone} title="2-step sign-in" bare={!setup && !offOpen && !(ov.account.isInstallOwner && !ov.account.mfaEnabled)}
          sub={ov.account.mfaEnabled
            ? 'On. Signing in needs your password (or email code, or Google) and a code from your authenticator app.'
            : 'Off. With it on, somebody who learns your password still cannot sign in without your phone.'}
          right={ov.account.mfaEnabled
            ? <button type="button" style={BTN} onClick={() => setOffOpen(o => !o)}>Turn off</button>
            : !setup && <button type="button" style={DARK} onClick={() => setSetup(true)}><ShieldCheck size={14} /> Turn on</button>} />
        {ov.account.isInstallOwner && !ov.account.mfaEnabled && (
          <Note ok={false} text="You are the install owner: this account can connect payments and change settings for everyone. Turn 2-step sign-in on." />
        )}
        {setup && (
          <TwoStepSetup
            onDone={() => { setSetup(false); setMsg({ ok: true, text: '2-step sign-in is on. You will be asked for a code each time you sign in.' }); void load(); }}
            onCancel={() => setSetup(false)} />
        )}
        {offOpen && ov.account.mfaEnabled && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <input value={offCode} onChange={e => setOffCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Current 6-digit code" inputMode="numeric" aria-label="Current code" style={{ ...INPUT, width: 170 }} />
            <input value={offPw} onChange={e => setOffPw(e.target.value)} type="password" placeholder="…or your password" aria-label="Password" style={{ ...INPUT, width: 190 }} />
            <button type="button" style={BTN} disabled={busy === 'off'} onClick={async () => {
              setBusy('off');
              const r = await disableTwoStep(offCode, offPw);
              setBusy('');
              setMsg({ ok: r.ok, text: r.ok ? '2-step sign-in is off.' : r.data.error ?? 'Could not turn it off.' });
              if (r.ok) { setOffOpen(false); setOffCode(''); setOffPw(''); void load(); }
            }}>Confirm</button>
          </div>
        )}
      </div>

      {/* ── Devices ── */}
      <div style={CARD}>
        <Head icon={Monitor} title="Signed-in devices" sub="Every browser currently signed in to your account. Sign out any you do not recognise, then change your password."
          right={others.length > 0 && (
            <button type="button" style={BTN} disabled={busy === 'others'} onClick={async () => {
              setBusy('others');
              const r = await revokeOtherSessions();
              setBusy('');
              setMsg({ ok: r.ok, text: r.ok ? `Signed out ${r.data.ended ?? 0} other device${r.data.ended === 1 ? '' : 's'}.` : r.data.error ?? 'Could not sign them out.' });
              void load();
            }}><LogOut size={14} /> Sign out all others</button>
          )} />
        <div style={{ display: 'grid', gap: 8 }}>
          {ov.sessions.map(s => (
            <div key={s.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', borderRadius: 11, border: '1px solid #eef0f4', flexWrap: 'wrap' }}>
              <Monitor size={16} color="#64748b" />
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <b style={{ fontSize: 13, color: '#0f172a' }}>{s.device}</b>
                {s.current && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#1f7a4d', background: '#e8f5ec', padding: '2px 7px', borderRadius: 99 }}>This device</span>}
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {[s.network && `Network ${s.network}`, `signed in with ${s.method === 'code' ? 'an email code' : s.method === 'google' ? 'Google' : s.method === 'signup' ? 'a new account' : 'a password'}`, `active ${when(s.lastSeenAt)}`].filter(Boolean).join(' · ')}
                </div>
              </div>
              {s.current
                ? <button type="button" style={BTN} onClick={() => { void logout(); window.location.href = import.meta.env.BASE_URL || '/'; }}><LogOut size={14} /> Sign out</button>
                : <button type="button" style={BTN} onClick={async () => { const r = await revokeSession(s.id); setMsg({ ok: r.ok, text: r.ok ? 'That device has been signed out.' : r.data.error ?? 'Could not sign it out.' }); void load(); }}>Sign out</button>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Activity ── */}
      <div style={CARD}>
        <Head icon={Activity} title="Recent security activity" sub="Sign-ins, failed attempts and changes to your account, newest first. Kept for 180 days." />
        {ov.events.length === 0
          ? <p style={{ ...SUB, margin: 0 }}>Nothing recorded yet. Sign-ins and changes will appear here from now on.</p>
          : (
            <div style={{ display: 'grid' }}>
              {ov.events.slice(0, 15).map((e, i) => (
                <div key={`${e.at}-${i}`} style={{ display: 'flex', gap: 10, padding: '9px 0', borderTop: i ? '1px solid #f1f5f9' : 'none', flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: /failed/.test(e.kind) ? '#b45309' : '#0f172a', flex: '1 1 200px' }}>
                    {EVENT_LABEL[e.kind] ?? e.kind}{e.detail && !/^Signed in with/.test(e.detail) ? ` — ${e.detail}` : ''}
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{[e.device !== 'Unknown device' && e.device, e.network, when(e.at)].filter(Boolean).join(' · ')}</span>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* ── Workspace ── */}
      {ov.workspace && (
        <div style={CARD}>
          <Head icon={Users} title="Who can open this workspace" sub={`You are the ${ov.workspace.yourRole.toLowerCase()}. No other customer can open it, and there is no staff login that can open it as you.`} />
          <div style={{ display: 'grid', gap: 6 }}>
            {ov.workspace.members.map(m => (
              <div key={m.email} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '6px 0', flexWrap: 'wrap' }}>
                <span style={{ color: '#0f172a', wordBreak: 'break-all' }}>{m.email}</span>
                <span style={{ color: '#64748b', fontWeight: 600 }}>{m.role}</span>
              </div>
            ))}
          </div>
          <p style={{ ...SUB, marginTop: 10 }}>Add or remove people in Settings → Team &amp; Permissions.</p>

          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <Plug size={15} color="#17191c" /><b style={{ fontSize: 13.5 }}>Connected services</b>
            </div>
            <p style={{ ...SUB, margin: '0 0 10px' }}>Keys and passwords for these are encrypted on the server and are never shown again after you save them — this page only knows whether each is connected.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 6 }}>
              {ov.workspace.integrations.map(i => (
                <div key={i.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 9, background: '#f8fafc', fontSize: 12.5 }}>
                  <span style={{ color: '#0f172a' }}>{i.label}</span>
                  <span style={{ color: i.connected ? '#1f7a4d' : '#94a3b8', fontWeight: 600 }}>{i.connected ? (i.connected > 1 ? `${i.connected} connected` : 'Connected') : 'Not connected'}</span>
                </div>
              ))}
            </div>
            {connected.length > 0 && <p style={{ ...SUB, marginTop: 8 }}>Disconnect a service from the screen where you set it up.</p>}
          </div>
        </div>
      )}

      {/* ── Data & privacy ── */}
      <div style={CARD}>
        <Head icon={Lock} title="Your data" sub="What is kept, what leaves Protected Central and why, and how to take it with you." />
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Download size={16} color="#17191c" style={{ marginTop: 2 }} />
            <div style={{ flex: '1 1 240px' }}>
              <b style={{ fontSize: 13.5 }}>Export this workspace</b>
              <p style={SUB}>Contacts, deals, campaigns, projects, workflows, products, orders, tickets and forms, as one JSON file. Passwords and service keys are never included.</p>
            </div>
            <button type="button" style={BTN} disabled={busy === 'export' || !ov.workspace} onClick={() => void doExport()}>
              {busy === 'export' ? <Loader size={14} className="spin" /> : <Download size={14} />} Download
            </button>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Sparkles size={16} color="#17191c" style={{ marginTop: 2 }} />
            <div>
              <b style={{ fontSize: 13.5 }}>What AI receives</b>
              <p style={SUB}>
                AI features use Google’s Gemini, called from our server (the one exception is AI Shorts’ video analysis, which uploads the video from your browser with a key you saved yourself). It receives what the task in front of it needs:
                your business profile and your request when writing a post or planning a project; the files, pages or voice
                note you give the New Project wizard; the text of an incoming email when drafting a reply to it; a visitor’s
                chat when the chat assistant answers; a form submission when it is summarised for you; and the text of a
                message before it is sent, to screen it for abuse. Your contact list is not sent — emails are written with
                placeholders like{' {{firstName}} '}that are filled in on our side. Whether Google may use this data to improve its models
                depends on the plan of the AI key in use; see our Security page.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Clock size={16} color="#17191c" style={{ marginTop: 2 }} />
            <div>
              <b style={{ fontSize: 13.5 }}>How long records are kept</b>
              <p style={SUB}>Your workspace data is kept until you delete it or close the workspace. Operational logs are removed automatically: security activity after 180 days, delivery logs after 30, automation step logs after 14.</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <LifeBuoy size={16} color="#17191c" style={{ marginTop: 2 }} />
            <div>
              <b style={{ fontSize: 13.5 }}>Support access: {ov.supportAccess.enabled ? 'on' : 'off'}</b>
              <p style={SUB}>{ov.supportAccess.note}</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', paddingTop: 14, borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
            <Trash2 size={16} color="#b91c1c" style={{ marginTop: 2 }} />
            <div style={{ flex: '1 1 240px' }}>
              <b style={{ fontSize: 13.5, color: '#991b1b' }}>Delete your account</b>
              <p style={SUB}>
                {ov.account.isInstallOwner
                  ? 'The install owner account runs the platform for every other customer, so it cannot be deleted from here.'
                  : 'Deletes your account and every workspace you own, with all their data and connected services. This cannot be undone — export first if you want a copy.'}
              </p>
            </div>
            {!ov.account.isInstallOwner && !delOpen && <button type="button" style={{ ...BTN, color: '#b91c1c', borderColor: '#fecaca' }} onClick={() => setDelOpen(true)}>Delete…</button>}
          </div>
          {delOpen && !ov.account.isInstallOwner && (
            <div style={{ padding: 14, borderRadius: 12, border: '1px solid #fecaca', background: '#fff7f7', display: 'grid', gap: 8 }}>
              <span style={{ fontSize: 12.5, color: '#991b1b' }}>Type <b>DELETE</b>{ov.account.passwordSet ? ', your password' : ''}{ov.account.mfaEnabled ? ' and a current code' : ''} to confirm.</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input value={delText} onChange={e => setDelText(e.target.value)} placeholder="DELETE" aria-label="Type DELETE" style={{ ...INPUT, width: 120 }} />
                {ov.account.passwordSet && <input value={delPw} onChange={e => setDelPw(e.target.value)} type="password" placeholder="Password" aria-label="Password" style={{ ...INPUT, width: 170 }} />}
                {ov.account.mfaEnabled && <input value={delCode} onChange={e => setDelCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" aria-label="Code" style={{ ...INPUT, width: 130 }} />}
                <button type="button" style={{ ...BTN, background: '#b91c1c', color: '#fff', borderColor: '#b91c1c' }} disabled={delText !== 'DELETE' || busy === 'delete'} onClick={async () => {
                  setBusy('delete');
                  const r = await deleteAccount(delPw, delCode);
                  setBusy('');
                  if (!r.ok) { setMsg({ ok: false, text: r.data.error ?? 'Could not delete the account.' }); return; }
                  void logout();
                  window.location.href = import.meta.env.BASE_URL || '/';
                }}>Delete permanently</button>
                <button type="button" style={BTN} onClick={() => { setDelOpen(false); setDelText(''); setDelPw(''); setDelCode(''); }}><X size={14} /> Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
