import { useState } from 'react';
import {
  Check, X, ExternalLink, RefreshCw, AlertCircle, ChevronRight,
  Users, Mail, Zap, ArrowUpDown,
} from 'lucide-react';

/* ─── Types ─── */
interface AppConnection {
  provider: string;
  apiKey: string;
  apiUrl?: string;
  listId?: string;
  connectedAt?: string;
}

const LS_KEY = 'crm_email_apps';

function loadConnections(): Record<string, AppConnection> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
function saveConnections(c: Record<string, AppConnection>) {
  localStorage.setItem(LS_KEY, JSON.stringify(c));
}

/* ─── ActiveCampaign Panel ─── */
function ActiveCampaignPanel({ conn, onSave, onDisconnect, contacts }: {
  conn?: AppConnection;
  onSave: (c: AppConnection) => void;
  onDisconnect: () => void;
  contacts: { name?: string; email: string; status?: string }[];
}) {
  const [apiKey, setApiKey] = useState(conn?.apiKey || '');
  const [apiUrl, setApiUrl] = useState(conn?.apiUrl || '');
  const [listId, setListId] = useState(conn?.listId || '');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');

  const normalize = (u: string) => u.replace(/\/$/, '');

  const testConnection = async () => {
    if (!apiKey || !apiUrl) { setTestResult({ ok: false, msg: 'API key and Account URL are required.' }); return; }
    setTesting(true); setTestResult(null);
    try {
      const url = `${normalize(apiUrl)}/api/3/account`;
      const resp = await fetch(url, { headers: { 'Api-Token': apiKey } });
      if (resp.ok) {
        const data = await resp.json() as { account?: { name?: string } };
        setTestResult({ ok: true, msg: `Connected to "${data.account?.name || 'your account'}" ✓` });
      } else {
        setTestResult({ ok: false, msg: `HTTP ${resp.status} — check your API key and URL.` });
      }
    } catch {
      setTestResult({ ok: false, msg: 'Could not reach ActiveCampaign. Check CORS or your URL.' });
    }
    setTesting(false);
  };

  const handleSave = () => {
    onSave({ provider: 'activecampaign', apiKey, apiUrl: normalize(apiUrl), listId, connectedAt: new Date().toISOString() });
  };

  const syncContacts = async () => {
    if (!conn) return;
    setSyncing(true); setSyncResult('');
    let ok = 0, fail = 0;
    for (const c of contacts.slice(0, 100)) {
      if (!c.email) { fail++; continue; }
      try {
        const body = {
          contact: {
            email: c.email,
            firstName: c.name?.split(' ')[0] || '',
            lastName: c.name?.split(' ').slice(1).join(' ') || '',
          },
        };
        const resp = await fetch(`${normalize(conn.apiUrl || '')}/api/3/contact/sync`, {
          method: 'POST',
          headers: { 'Api-Token': conn.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (resp.ok) ok++;
        else fail++;
      } catch { fail++; }
    }
    setSyncResult(`Synced ${ok} contacts${fail > 0 ? `, ${fail} failed` : ''}.`);
    setSyncing(false);
  };

  return (
    <div>
      {conn ? (
        /* Connected state */
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#ecfdf5', borderRadius: 10, border: '1px solid #bbf7d0', marginBottom: 20 }}>
            <Check size={16} color="#16a34a" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>Connected to ActiveCampaign</div>
              <div style={{ fontSize: 11, color: '#4ade80' }}>{conn.apiUrl} · Connected {conn.connectedAt ? new Date(conn.connectedAt).toLocaleDateString() : 'recently'}</div>
            </div>
            <button onClick={onDisconnect}
              style={{ padding: '5px 12px', border: '1px solid #fca5a5', borderRadius: 7, background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Disconnect
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
            {[
              { label: 'Contacts to sync', value: contacts.length, icon: <Users size={18} color="#17191c" />, color: '#17191c' },
              { label: 'Email lists', value: conn.listId ? '1 linked' : 'None linked', icon: <Mail size={18} color="#3b82f6" />, color: '#3b82f6' },
              { label: 'Sync status', value: syncResult ? 'Done' : 'Idle', icon: <Zap size={18} color="#22c55e" />, color: '#22c55e' },
            ].map(s => (
              <div key={s.label} style={{ background: '#fff', borderRadius: 10, padding: '14px 16px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: `${s.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{s.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{s.value}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>Sync Contacts to ActiveCampaign</div>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 14px', lineHeight: 1.6 }}>
              Push your {contacts.length} CRM contacts to ActiveCampaign (up to 100 at a time). Each contact will be created or updated.
            </p>
            {conn.listId && (
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                List ID: <strong>{conn.listId}</strong>
              </div>
            )}
            <button onClick={syncContacts} disabled={syncing}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: syncing ? '#e2e8f0' : '#17191c', color: syncing ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: syncing ? 'wait' : 'pointer' }}>
              <RefreshCw size={14} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
              {syncing ? 'Syncing…' : `Sync ${contacts.length} contacts →`}
            </button>
            {syncResult && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                <Check size={13} /> {syncResult}
              </div>
            )}
          </div>

          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 20px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>Link Default List</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={listId}
                onChange={e => setListId(e.target.value)}
                placeholder="ActiveCampaign List ID (e.g. 1)"
                style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none' }}
              />
              <button onClick={() => onSave({ ...conn, listId })}
                style={{ padding: '8px 16px', background: '#17191c', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Save
              </button>
            </div>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 0' }}>Find your List ID in ActiveCampaign → Contacts → Lists.</p>
          </div>
        </div>
      ) : (
        /* Setup form */
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#1c64f215', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🔵</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Connect ActiveCampaign</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Sync contacts and manage email lists</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Account URL</label>
              <input
                value={apiUrl}
                onChange={e => setApiUrl(e.target.value)}
                placeholder="https://youraccountname.api-us1.com"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>Found in Settings → Developer → API Access in ActiveCampaign.</p>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Your ActiveCampaign API key"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>Settings → Developer → API Access → Key.</p>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Default List ID <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span></label>
              <input
                value={listId}
                onChange={e => setListId(e.target.value)}
                placeholder="e.g. 1"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {testResult && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: testResult.ok ? '#ecfdf5' : '#fef2f2', border: `1px solid ${testResult.ok ? '#bbf7d0' : '#fecaca'}`, borderRadius: 8, fontSize: 13, color: testResult.ok ? '#166534' : '#dc2626' }}>
                {testResult.ok ? <Check size={15} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
                {testResult.msg}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={testConnection} disabled={testing}
                style={{ flex: 1, padding: '9px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: testing ? 'wait' : 'pointer' }}>
                {testing ? '⟳ Testing…' : 'Test Connection'}
              </button>
              <button onClick={handleSave} disabled={!apiKey || !apiUrl}
                style={{ flex: 1, padding: '9px', background: (!apiKey || !apiUrl) ? '#e2e8f0' : '#17191c', color: (!apiKey || !apiUrl) ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: (!apiKey || !apiUrl) ? 'not-allowed' : 'pointer' }}>
                Connect →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── App card (not yet integrated) ─── */
function ComingSoonApp({ name, icon, desc, badge }: { name: string; icon: string; desc: string; badge?: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14, opacity: 0.8 }}>
      <div style={{ fontSize: 28, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{name}</span>
          {badge && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#fef3c7', color: '#d97706', fontWeight: 700 }}>{badge}</span>}
        </div>
        <div style={{ fontSize: 12, color: '#64748b' }}>{desc}</div>
      </div>
      <ChevronRight size={16} color="#cbd5e1" />
    </div>
  );
}

/* ─── Main EmailApps component ─── */
export default function EmailApps({ contacts }: { contacts: { name?: string; email: string; status?: string }[] }) {
  const [connections, setConnections] = useState<Record<string, AppConnection>>(loadConnections);
  const [selectedApp, setSelectedApp] = useState<string | null>('activecampaign');

  const saveConn = (conn: AppConnection) => {
    const next = { ...connections, [conn.provider]: conn };
    setConnections(next);
    saveConnections(next);
  };

  const disconnectConn = (provider: string) => {
    const next = { ...connections };
    delete next[provider];
    setConnections(next);
    saveConnections(next);
  };

  const acConn = connections['activecampaign'];

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Email Apps</h2>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Connect your favourite email marketing platforms to sync contacts, lists, and campaign data.</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Connected Apps', value: Object.keys(connections).length, color: '#17191c', icon: <Check size={18} color="#17191c" /> },
          { label: 'Contacts Ready', value: contacts.length, color: '#3b82f6', icon: <Users size={18} color="#3b82f6" /> },
          { label: 'Sync Available', value: Object.keys(connections).length > 0 ? 'Yes' : 'None', color: '#22c55e', icon: <ArrowUpDown size={18} color="#22c55e" /> },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', borderRadius: 12, padding: '16px 18px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: `${s.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
        {/* App list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Email Platforms</div>
          {[
            { id: 'activecampaign', name: 'ActiveCampaign', icon: '🔵', connected: !!acConn },
            { id: 'mailchimp',      name: 'Mailchimp',      icon: '🐵', connected: false },
            { id: 'klaviyo',        name: 'Klaviyo',        icon: '🟣', connected: false },
            { id: 'brevo',          name: 'Brevo (Sendinblue)', icon: '🟦', connected: false },
            { id: 'convertkit',     name: 'Kit (ConvertKit)', icon: '🟠', connected: false },
            { id: 'getresponse',    name: 'GetResponse',    icon: '🟢', connected: false },
          ].map(app => (
            <button
              key={app.id}
              onClick={() => setSelectedApp(app.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 10, border: `1px solid ${selectedApp === app.id ? '#d5d8dd' : '#e2e8f0'}`,
                background: selectedApp === app.id ? '#f0f1f3' : '#fff', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 18 }}>{app.icon}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: selectedApp === app.id ? '#17191c' : '#374151' }}>{app.name}</span>
              {app.connected && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />}
            </button>
          ))}

          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 14, marginBottom: 6 }}>Transactional Email</div>
          {[
            { id: 'sendgrid_app', name: 'SendGrid', icon: '📨' },
            { id: 'postmark',     name: 'Postmark', icon: '📮' },
          ].map(app => (
            <button key={app.id} onClick={() => setSelectedApp(app.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 10, border: `1px solid ${selectedApp === app.id ? '#d5d8dd' : '#e2e8f0'}`, background: selectedApp === app.id ? '#f0f1f3' : '#fff', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: 18 }}>{app.icon}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: selectedApp === app.id ? '#17191c' : '#374151' }}>{app.name}</span>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div>
          {selectedApp === 'activecampaign' && (
            <ActiveCampaignPanel
              conn={acConn}
              onSave={saveConn}
              onDisconnect={() => disconnectConn('activecampaign')}
              contacts={contacts}
            />
          )}
          {selectedApp && selectedApp !== 'activecampaign' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '32px', textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 14 }}>
                  {selectedApp === 'mailchimp' ? '🐵' : selectedApp === 'klaviyo' ? '🟣' : selectedApp === 'brevo' ? '🟦' : selectedApp === 'convertkit' ? '🟠' : selectedApp === 'getresponse' ? '🟢' : '📧'}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 8, textTransform: 'capitalize' }}>
                  {selectedApp.replace(/_/g, ' ')} Integration
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', background: '#fef3c7', borderRadius: 20, fontSize: 12, fontWeight: 700, color: '#d97706', marginBottom: 14 }}>
                  <Zap size={12} /> Coming Soon
                </div>
                <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, maxWidth: 340, margin: '0 auto' }}>
                  We're building native {selectedApp.replace(/_/g, ' ')} support. In the meantime, use our SMTP/API settings in <strong>Settings → Email & SMS</strong> to send campaigns.
                </p>
                <a
                  href="#/settings"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 18, padding: '9px 18px', background: '#17191c', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
                >
                  Go to Settings <ExternalLink size={13} />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
