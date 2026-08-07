/**
 * Deliverability.tsx — the control panel for the Email Deliverability engine.
 *
 * Authentication (SPF/DKIM/DMARC), blacklist status, sender reputation, the
 * suppression list, and the verification provider key. Every number shown here
 * comes from a real lookup or from mail this account actually sent — nothing
 * is illustrative.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, ShieldAlert, RefreshCw, Copy, Check, X, AlertTriangle, Info,
  Ban, Trash2, Plus, KeyRound, Gauge, Globe, ChevronRight, ExternalLink, Search,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getSession } from '../../services/auth';
import {
  loadSettings, saveSettings, hostCapabilities, checkAuthentication, checkBlacklists,
  setVerificationProvider, reputation, volumeAdvice, bestSendTime, loadSuppression,
  unsuppress, suppress, listHygiene,
  type AuthCheck, type BlacklistCheck, type HostCapabilities, type CheckStatus,
  type DeliverabilitySettings,
} from '../../services/deliverability';

const INK = '#17191c';

const STATUS_META: Record<CheckStatus, { color: string; bg: string; label: string }> = {
  pass:    { color: '#16a34a', bg: '#f0fdf4', label: 'Passing' },
  warn:    { color: '#d97706', bg: '#fffbeb', label: 'Needs attention' },
  error:   { color: '#dc2626', bg: '#fef2f2', label: 'Failing' },
  missing: { color: '#dc2626', bg: '#fef2f2', label: 'Not set up' },
  unknown: { color: '#64748b', bg: '#f8fafc', label: 'Unknown' },
};

/* ── DNS record generation ───────────────────────────────────────────────── */

interface DnsRecord { type: string; host: string; value: string; note: string; }

/**
 * The records a user must publish. Built from what they actually send through,
 * so the SPF include matches their provider rather than being generic advice.
 */
function generateRecords(domain: string, provider: string, smtpHost: string): DnsRecord[] {
  const includes: string[] = [];
  if (provider === 'resend') includes.push('include:_spf.resend.com');
  else if (provider === 'mailtrap') includes.push('include:_spf.mailtrap.io');
  else if (provider === 'activecampaign') includes.push('include:emsd1.com');
  else if (smtpHost) {
    // A bare SMTP host is authorised by name; a: is the correct mechanism.
    includes.push(`a:${smtpHost}`);
  }
  if (!includes.length) includes.push('a', 'mx');

  return [
    {
      type: 'TXT', host: '@',
      value: `v=spf1 ${includes.join(' ')} ~all`,
      note: 'Lists who may send as your domain. If you already have an SPF record, merge these mechanisms into it — never publish two.',
    },
    {
      type: 'TXT', host: '_dmarc',
      value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}; pct=100; adkim=r; aspf=r`,
      note: 'Start at p=none so you get reports without affecting delivery. Move to p=quarantine after a couple of clean weeks.',
    },
    {
      type: 'TXT', host: 'selector1._domainkey',
      value: 'v=DKIM1; k=rsa; p=<paste the public key your email provider gives you>',
      note: 'DKIM keys are issued by whoever sends your mail — copy the selector and key from their dashboard. The selector name must match theirs.',
    },
  ];
}

const REGISTRAR_GUIDES = [
  { name: 'Cloudflare', steps: ['Open your domain, then DNS → Records', 'Add record → Type TXT', 'Paste Name and Content exactly as shown', 'Set Proxy status to DNS only', 'Save — Cloudflare publishes within a minute'] },
  { name: 'GoDaddy', steps: ['My Products → your domain → DNS', 'Add → Type TXT', 'Name is the Host column below; Value is the record', 'Leave TTL at 1 hour', 'Save — allow up to an hour'] },
  { name: 'Namecheap', steps: ['Domain List → Manage → Advanced DNS', 'Add New Record → TXT Record', 'Host is the Host column; Value is the record', 'TTL Automatic', 'Save all changes'] },
  { name: 'Google Domains / Squarespace', steps: ['DNS → Custom records', 'Type TXT', 'Host name is the Host column', 'Paste the value, save'] },
];

/* ── Component ───────────────────────────────────────────────────────────── */

export default function Deliverability() {
  const { addNotification, contacts } = useApp();
  const session = getSession();
  const isAgency = session?.user.role === 'agency';

  const [settings, setSettings] = useState<DeliverabilitySettings>(() => loadSettings());
  const [caps, setCaps] = useState<HostCapabilities | null>(null);
  const [auth, setAuth] = useState<AuthCheck | null>(null);
  const [authErr, setAuthErr] = useState('');
  const [bl, setBl] = useState<BlacklistCheck | null>(null);
  const [blErr, setBlErr] = useState('');
  const [busy, setBusy] = useState<'' | 'auth' | 'bl' | 'key'>('');
  const [copied, setCopied] = useState('');
  const [guide, setGuide] = useState('Cloudflare');
  const [provider, setProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [suppressionFilter, setSuppressionFilter] = useState('');
  const [newSuppress, setNewSuppress] = useState('');
  const [suppressionVersion, setSuppressionVersion] = useState(0);

  const metrics = useMemo(() => reputation(), []);
  const hygiene = useMemo(() => listHygiene(contacts), [contacts, suppressionVersion]);
  const volume = useMemo(() => volumeAdvice(contacts.length, metrics), [contacts.length, metrics]);
  const timing = useMemo(() => bestSendTime(), []);
  const suppression = useMemo(() => loadSuppression(), [suppressionVersion]);

  useEffect(() => { void hostCapabilities().then(c => { setCaps(c); if (c) setProvider(c.provider); }); }, []);

  const persist = (patch: Partial<DeliverabilitySettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  const emailCfg = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('crm_email_config') || '{}'); } catch { return {}; }
  }, []);
  const smtpCfg = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('crm_smtp') || '{}'); } catch { return {}; }
  }, []);

  const records = useMemo(
    () => generateRecords(settings.sendingDomain || 'yourdomain.com', emailCfg.provider || '', smtpCfg.host || ''),
    [settings.sendingDomain, emailCfg.provider, smtpCfg.host],
  );

  const runAuth = async () => {
    if (!settings.sendingDomain) { setAuthErr('Enter your sending domain first.'); return; }
    setBusy('auth'); setAuthErr('');
    const res = await checkAuthentication(settings.sendingDomain);
    setBusy('');
    if (!res.ok) { setAuthErr(res.error || 'Check failed.'); setAuth(null); return; }
    setAuth(res.data!);
    const failing = ['spf', 'dkim', 'dmarc'].filter(k => {
      const s = (res.data as unknown as Record<string, { status: CheckStatus }>)[k].status;
      return s === 'error' || s === 'missing';
    });
    addNotification(failing.length
      ? `${failing.length} authentication record${failing.length === 1 ? '' : 's'} need${failing.length === 1 ? 's' : ''} fixing`
      : 'Authentication looks good', failing.length ? 'error' : 'success');
  };

  const runBlacklist = async () => {
    const host = settings.sendingDomain || smtpCfg.host;
    if (!host) { setBlErr('Set a sending domain or SMTP host first.'); return; }
    setBusy('bl'); setBlErr('');
    const res = await checkBlacklists(host);
    setBusy('');
    if (!res.ok) { setBlErr(res.error || 'Check failed.'); setBl(null); return; }
    setBl(res.data!);
    if (res.data!.listedCount) addNotification(`Listed on ${res.data!.listedCount} blacklist(s) — see the remediation links`, 'error');
  };

  const copy = async (value: string, id: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      setTimeout(() => setCopied(''), 1600);
    } catch { addNotification('Could not copy — select the text and copy manually.', 'error'); }
  };

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

  const bandColor = metrics.band === 'strong' ? '#16a34a' : metrics.band === 'watch' ? '#d97706' : '#dc2626';

  return (
    <div>
      {/* Sender reputation */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h3 style={h3}><Gauge size={15} /> Sender reputation</h3>
            <p style={sub}>Computed from the {metrics.sent} email{metrics.sent === 1 ? '' : 's'} this workspace has actually sent — not an estimate.</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: bandColor, lineHeight: 1 }}>{metrics.senderScore}</div>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: bandColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {metrics.band === 'strong' ? 'Strong' : metrics.band === 'watch' ? 'Watch' : 'At risk'}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginTop: 14 }}>
          {[
            ['Delivery rate', `${metrics.deliveryRate}%`, `${metrics.delivered} of ${metrics.sent}`],
            ['Open rate', `${metrics.openRate}%`, `${metrics.opened} opened`],
            ['Click rate', `${metrics.clickRate}%`, `${metrics.clicked} clicked`],
            ['Hard bounces', `${metrics.bounceRate}%`, `${metrics.hardBounces} bounced · target under 2%`],
            ['Spam complaints', `${metrics.complaintRate}%`, `${metrics.complaints} complaints · limit 0.3%`],
          ].map(([label, value, detail]) => (
            <div key={label} style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #eef0f3' }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: INK, marginTop: 2 }}>{value}</div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{detail}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>How the score is made up</div>
          {metrics.components.map(c => (
            <div key={c.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
              <span style={{ fontSize: 11.5, color: '#64748b' }}>{c.label} — {c.detail}</span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: c.points >= c.max * 0.7 ? '#16a34a' : c.points > 0 ? '#d97706' : '#dc2626', flexShrink: 0 }}>
                {c.points}/{c.max}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Sending domain + authentication */}
      <div style={card}>
        <h3 style={h3}><ShieldCheck size={15} /> Authentication (SPF, DKIM, DMARC)</h3>
        <p style={sub}>
          These three records tell Gmail and Outlook that mail claiming to be from your domain really is.
          Without them, most of what you send goes to spam regardless of content.
        </p>

        <div style={{ display: 'flex', gap: 9, marginTop: 14, flexWrap: 'wrap' }}>
          <input value={settings.sendingDomain} onChange={e => { persist({ sendingDomain: e.target.value.trim() }); setAuthErr(''); }}
            placeholder="yourdomain.com" title="The domain your email is sent from"
            style={{ ...inp, flex: 1, minWidth: 200 }} />
          <button onClick={() => void runAuth()} disabled={busy === 'auth'} title="Look up the live DNS records for this domain" style={btn(true)}>
            {busy === 'auth' ? <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Search size={13} />} Check records
          </button>
        </div>

        {caps && !caps.dns && (
          <div style={{ marginTop: 10, display: 'flex', gap: 8, fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '9px 11px' }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>This host has DNS lookups disabled, so records cannot be verified from here. The generator below still produces the correct records to publish.</span>
          </div>
        )}
        {authErr && <div style={{ marginTop: 10, fontSize: 12.5, color: '#dc2626' }}>{authErr}</div>}

        {auth && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {([['SPF', auth.spf], ['DKIM', auth.dkim], ['DMARC', auth.dmarc], ['MX', auth.mx]] as const).map(([label, r]) => {
              const meta = STATUS_META[r.status] ?? STATUS_META.unknown;
              return (
                <div key={label} style={{ border: `1px solid ${meta.color}33`, background: meta.bg, borderRadius: 11, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {r.status === 'pass' ? <Check size={14} color={meta.color} /> : <X size={14} color={meta.color} />}
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>{label}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{meta.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 1.5 }}>{r.message}</div>
                  {'record' in r && r.record && (
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 5, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all', background: '#fff', border: '1px solid #eef0f3', borderRadius: 7, padding: '6px 8px' }}>
                      {r.record}
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Checked {new Date(auth.checkedAt).toLocaleString()}.</div>
          </div>
        )}
      </div>

      {/* DNS record generator */}
      <div style={card}>
        <h3 style={h3}><Globe size={15} /> Records to publish</h3>
        <p style={sub}>Add these as TXT records at your DNS host. They are generated for your configured sending provider, so the SPF mechanism matches how your mail actually leaves.</p>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {records.map((r, i) => (
            <div key={i} style={{ border: '1px solid #e6e9f0', borderRadius: 11, padding: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#4f46e5', background: '#eef2ff', padding: '2px 8px', borderRadius: 999 }}>{r.type}</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>Host</span>
                <code style={{ fontSize: 12, fontWeight: 700, color: INK }}>{r.host}</code>
                <button onClick={() => void copy(r.value, `rec-${i}`)} title="Copy the record value"
                  style={{ ...btn(), marginLeft: 'auto', padding: '5px 10px' }}>
                  {copied === `rec-${i}` ? <Check size={12} color="#16a34a" /> : <Copy size={12} />} {copied === `rec-${i}` ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div style={{ fontSize: 11.5, fontFamily: 'ui-monospace, monospace', color: '#0f172a', background: '#f8fafc', border: '1px solid #eef0f3', borderRadius: 8, padding: '8px 10px', marginTop: 8, wordBreak: 'break-all' }}>
                {r.value}
              </div>
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 6, lineHeight: 1.5 }}>{r.note}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {REGISTRAR_GUIDES.map(g => (
              <button key={g.name} onClick={() => setGuide(g.name)} title={`Steps for ${g.name}`}
                style={{ padding: '5px 12px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${guide === g.name ? INK : '#e2e8f0'}`,
                  background: guide === g.name ? INK : '#fff', color: guide === g.name ? '#fff' : '#475569' }}>
                {g.name}
              </button>
            ))}
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, color: '#475569', lineHeight: 1.8 }}>
            {(REGISTRAR_GUIDES.find(g => g.name === guide) ?? REGISTRAR_GUIDES[0]).steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <p style={{ ...sub, marginTop: 8 }}>DNS changes usually appear within minutes but can take up to an hour. Re-run “Check records” after publishing.</p>
        </div>
      </div>

      {/* Blacklists */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={h3}><ShieldAlert size={15} /> Blacklist status</h3>
            <p style={sub}>Queries {caps?.blacklists ?? 5} public blocklists — Spamhaus, Barracuda, SpamCop, SORBS and PSBL — for the IPs behind your sending domain.</p>
          </div>
          <button onClick={() => void runBlacklist()} disabled={busy === 'bl'} title="Check the blocklists now" style={btn()}>
            {busy === 'bl' ? <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Search size={13} />} Check now
          </button>
        </div>
        {blErr && <div style={{ marginTop: 10, fontSize: 12.5, color: '#dc2626' }}>{blErr}</div>}
        {bl && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: bl.listedCount ? '#dc2626' : '#16a34a' }}>{bl.message}</div>
            {bl.ips.length > 0 && (
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 3 }}>Checked {bl.ips.join(', ')}</div>
            )}
            {bl.results.filter(r => r.listed).map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '9px 11px' }}>
                <Ban size={14} color="#dc2626" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#991b1b', flex: 1 }}><strong>{r.ip}</strong> is listed on {r.list}</span>
                <a href={r.delistUrl} target="_blank" rel="noreferrer" title={`Open the ${r.list} delisting page`}
                  style={{ ...btn(), textDecoration: 'none', padding: '5px 10px' }}>
                  <ExternalLink size={11} /> Delist
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Volume + timing advice */}
      <div style={card}>
        <h3 style={h3}><Info size={15} /> Sending guidance</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginTop: 12 }}>
          <div style={{ padding: 12, background: '#f8fafc', border: '1px solid #eef0f3', borderRadius: 11 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Safe volume today</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: INK, marginTop: 3 }}>{volume.dailyMax.toLocaleString()} <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>emails</span></div>
            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 5, lineHeight: 1.5 }}>{volume.reason}</div>
          </div>
          <div style={{ padding: 12, background: '#f8fafc', border: '1px solid #eef0f3', borderRadius: 11 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Best time to send</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: INK, marginTop: 3 }}>{timing.label}</div>
            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 5, lineHeight: 1.5 }}>{timing.reason}</div>
          </div>
          <div style={{ padding: 12, background: '#f8fafc', border: '1px solid #eef0f3', borderRadius: 11 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>List health</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: hygiene.cleanPercent >= 95 ? '#16a34a' : hygiene.cleanPercent >= 85 ? '#d97706' : '#dc2626', marginTop: 3 }}>{hygiene.cleanPercent}% clean</div>
            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 5, lineHeight: 1.5 }}>
              {hygiene.valid} valid · {hygiene.risky} risky · {hygiene.invalid} invalid · {hygiene.unchecked} unchecked
            </div>
          </div>
        </div>
      </div>

      {/* Thresholds */}
      <div style={card}>
        <h3 style={h3}><AlertTriangle size={15} /> Alert thresholds</h3>
        <p style={sub}>The pre-send check warns you when a number crosses these. The defaults are the levels providers themselves act on.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 14 }}>
          {([
            ['Bounce rate %', 'bounceThreshold', 'Above 2% and providers start throttling.'],
            ['Complaint rate %', 'complaintThreshold', 'Gmail acts around 0.3%. Keep well under it.'],
            ['Minimum sender score', 'minSenderScore', 'Below this, large sends are discouraged.'],
          ] as const).map(([label, key, hint]) => (
            <div key={key}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>{label}</label>
              <input type="number" step="0.05" min="0" value={settings[key]} title={hint}
                onChange={e => persist({ [key]: Number(e.target.value) } as Partial<DeliverabilitySettings>)}
                style={{ ...inp, width: '100%' }} />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{hint}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {([
            ['verifyBeforeSend', 'Verify addresses before每 send', 'Runs a check on each recipient before an email leaves.'],
            ['blockRisky', 'Block risky addresses, not just warn', 'Role addresses and unverified domains are skipped entirely.'],
          ] as const).map(([key, label, hint]) => (
            <label key={key} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="checkbox" checked={settings[key]} onChange={e => persist({ [key]: e.target.checked } as Partial<DeliverabilitySettings>)}
                style={{ marginTop: 2, accentColor: INK, cursor: 'pointer' }} />
              <span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>{label.replace('每', ' every')}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: '#94a3b8' }}>{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Verification provider */}
      <div style={card}>
        <h3 style={h3}><KeyRound size={15} /> Verification provider</h3>
        <p style={sub}>
          Optional. DNS, disposable and role checks work without one. A paid verifier adds mailbox-level
          certainty — it can tell you an address exists, which DNS alone cannot.
          {caps?.smtp === false && ' This host blocks outbound port 25, so mailbox probes here need a provider.'}
        </p>
        {caps?.providerConfigured && (
          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '9px 11px' }}>
            <Check size={14} /> <span><strong>{caps.provider}</strong> is connected. Verification results come from them.</span>
          </div>
        )}
        {isAgency ? (
          <div style={{ display: 'flex', gap: 9, marginTop: 12, flexWrap: 'wrap' }}>
            <select value={provider} onChange={e => setProvider(e.target.value)} title="Verification provider" style={{ ...inp, cursor: 'pointer' }}>
              <option value="">None — local checks only</option>
              <option value="zerobounce">ZeroBounce</option>
              <option value="kickbox">Kickbox</option>
            </select>
            {provider && (
              <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password"
                placeholder="API key" title="Stored on the server; never sent back to the browser"
                style={{ ...inp, flex: 1, minWidth: 200 }} />
            )}
            <button disabled={busy === 'key'} title="Save the provider key on the server" style={btn(true)}
              onClick={async () => {
                setBusy('key');
                const res = await setVerificationProvider(provider, apiKey);
                setBusy('');
                if (!res.ok) { addNotification(res.error || 'Could not save the key.', 'error'); return; }
                setApiKey('');
                addNotification(provider ? `${provider} connected` : 'Verification provider removed');
                setCaps(await hostCapabilities());
              }}>
              Save
            </button>
          </div>
        ) : (
          <p style={{ ...sub, marginTop: 10 }}>Only an agency user can change the verification key.</p>
        )}
        <p style={{ ...sub, marginTop: 10 }}>
          The key is written to <code>api/config.php</code> on the server and is never returned to the browser —
          this screen can only tell you whether one is present.
        </p>
      </div>

      {/* Suppression list */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={h3}><Ban size={15} /> Suppression list ({suppression.length})</h3>
            <p style={sub}>Addresses that will never be sent to again. Hard bounces and spam complaints are added automatically.</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 9, marginTop: 12, flexWrap: 'wrap' }}>
          <input value={newSuppress} onChange={e => setNewSuppress(e.target.value)} placeholder="Add an address to suppress"
            title="Manually suppress an address" style={{ ...inp, flex: 1, minWidth: 200 }} />
          <button title="Add this address to the suppression list" style={btn()}
            onClick={() => {
              const e = newSuppress.trim().toLowerCase();
              if (!e.includes('@')) { addNotification('Enter a full email address.', 'error'); return; }
              suppress(e, 'manual', 'Added by hand from the deliverability settings');
              setNewSuppress('');
              setSuppressionVersion(v => v + 1);
              addNotification(`${e} will not be emailed again`);
            }}>
            <Plus size={12} /> Suppress
          </button>
          {suppression.length > 8 && (
            <input value={suppressionFilter} onChange={e => setSuppressionFilter(e.target.value)} placeholder="Filter"
              title="Filter the suppression list" style={{ ...inp, width: 140 }} />
          )}
        </div>

        <div style={{ marginTop: 12, maxHeight: 320, overflowY: 'auto' }}>
          {!suppression.length && (
            <p style={{ ...sub, margin: 0 }}>Nothing suppressed yet. That is the healthy state.</p>
          )}
          {suppression
            .filter(s => !suppressionFilter || s.email.includes(suppressionFilter.toLowerCase()))
            .slice(0, 200)
            .map(s => (
              <div key={s.email} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid #f1f5f9' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: INK, wordBreak: 'break-all' }}>{s.email}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {s.reason.replace('_', ' ')} · {s.detail} · {new Date(s.at).toLocaleDateString()}
                    {s.hits > 1 ? ` · seen ${s.hits}×` : ''}
                  </div>
                </div>
                <button title={`Remove ${s.email} from the suppression list`}
                  onClick={() => { unsuppress(s.email); setSuppressionVersion(v => v + 1); addNotification(`${s.email} removed from suppression`); }}
                  style={{ padding: 7, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', display: 'flex', color: '#475569', flexShrink: 0 }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
        </div>
      </div>

      {/* Help */}
      <div style={{ ...card, background: '#f8fafc' }}>
        <h3 style={h3}><ChevronRight size={15} /> How this works</h3>
        <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.7, marginTop: 8 }}>
          <p style={{ margin: '0 0 8px' }}>
            <strong>Authentication</strong> is the foundation. Publish the three records above, then re-check.
            SPF says which servers may send as you, DKIM signs each message, DMARC tells receivers what to do
            when either fails — and sends you reports.
          </p>
          <p style={{ margin: '0 0 8px' }}>
            <strong>List hygiene</strong> is what keeps the score up. Every address is checked for syntax, a real
            mail server, disposable domains, role accounts and trap patterns. Anything that hard bounces is
            suppressed automatically and never sent to again.
          </p>
          <p style={{ margin: '0 0 8px' }}>
            <strong>The pre-send check</strong> runs before a campaign leaves: it removes suppressed and invalid
            addresses, scans the content for spam triggers, and warns when the send is larger than today's safe volume.
          </p>
          <p style={{ margin: 0 }}>
            <strong>What needs a paid service:</strong> mailbox-level verification when the host blocks port 25,
            and a seed-account warmup network. Both are optional — everything else here runs on this deployment as it stands.
          </p>
        </div>
      </div>
    </div>
  );
}
