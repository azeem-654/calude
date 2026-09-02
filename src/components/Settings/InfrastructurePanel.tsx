/**
 * Settings → Infrastructure.
 *
 * The screen where an agency connects the accounts that let this app set a
 * client up rather than tell them what to go and set up: a registrar to buy the
 * domain, a DNS host to authenticate the mail, a mail provider to create the
 * mailbox.
 *
 * Two things it deliberately does not do. It never shows a saved credential —
 * a filled field renders as dots and sending it back blank means "keep it".
 * And it never claims a connection it has not proved: connecting runs a real
 * call to the provider and shows what the provider said, so "Connected" on this
 * screen means somebody's API answered, not that a form validated.
 */
import { useEffect, useState } from 'react';
import {
  Globe, Server, Mail, Check, X, Loader, RefreshCw, Search, ShieldCheck,
  AlertTriangle, ExternalLink, Plus, Trash2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  loadProviders, connectProvider, disconnectProvider, testProvider,
  dnsRecords, dnsApply, searchDomains, registerDomain, createMailbox,
  type ProviderSpec, type ConnectedProvider, type ProviderKind,
  type DnsRecord, type DomainResult,
} from '../../services/infrastructure';
import { loadSettings, saveSettings } from '../../services/deliverability';
import { saveMailbox } from '../../services/mailboxStore';

const INK = '#17191c';
const MUTED = '#5b6472';
const LINE = '#e6e9f0';

const KIND_META: Record<ProviderKind, { title: string; icon: typeof Globe; blurb: string }> = {
  registrar: { title: 'Domains', icon: Globe, blurb: 'Search for a domain and register it without leaving the app.' },
  dns: { title: 'DNS', icon: Server, blurb: 'Write SPF, DKIM and DMARC, and point a domain at a site you publish.' },
  mailbox: { title: 'Mailboxes', icon: Mail, blurb: 'Create a real mailbox on the domain and fill in its sending settings.' },
};

function Card({ children, pad = 18 }: { children: React.ReactNode; pad?: number }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: pad, boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
      {children}
    </div>
  );
}

function Status({ p }: { p: ConnectedProvider }) {
  const good = p.status === 'ok';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
      padding: '3px 9px', borderRadius: 999,
      background: good ? '#e8f5e9' : p.status === 'failed' ? '#fdecec' : '#f1f3f7',
      color: good ? '#1e6b32' : p.status === 'failed' ? '#b42318' : '#5b6472',
    }}>
      {good ? <Check size={11} /> : p.status === 'failed' ? <X size={11} /> : null}
      {good ? 'Connected' : p.status === 'failed' ? 'Not working' : 'Untested'}
    </span>
  );
}

/* ── One kind: pick a provider, fill its fields, connect ─────────────────── */

function KindSection({ kind, specs, connected, onChanged }: {
  kind: ProviderKind;
  specs: ProviderSpec[];
  connected: ConnectedProvider | null;
  onChanged: () => void;
}) {
  const { addNotification } = useApp();
  const meta = KIND_META[kind];
  const [open, setOpen] = useState(false);
  /*
   * Which provider is selected is derived, not stored — until somebody picks a
   * different one, at which point their choice is. Keeping it in state and
   * re-syncing it from props in an effect meant a render with the old value,
   * then a second render to correct it, every time the connection reloaded.
   */
  const [picked, setPicked] = useState<string | null>(null);
  const chosen = picked ?? connected?.provider ?? specs[0]?.id ?? '';
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');

  const spec = specs.find(s => s.id === chosen);

  const save = async () => {
    if (!spec) return;
    setBusy('save');
    const r = await connectProvider(kind, spec.id, values);
    setBusy('');
    addNotification(r.message ?? (r.success ? 'Connected.' : 'That did not connect.'), r.success ? 'success' : 'error');
    if (r.success) { setValues({}); setOpen(false); }
    onChanged();
  };

  const check = async () => {
    setBusy('test');
    const r = await testProvider(kind);
    setBusy('');
    addNotification(r.message ?? r.error ?? '', r.success ? 'success' : 'error');
    onChanged();
  };

  const drop = async () => {
    if (!window.confirm(`Disconnect ${connected?.name}? The stored credentials are deleted.`)) return;
    await disconnectProvider(kind);
    addNotification('Disconnected.');
    onChanged();
  };

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ width: 36, height: 36, borderRadius: 11, background: '#f1f3f7', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <meta.icon size={17} color={INK} />
        </span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: INK }}>{meta.title}</h3>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
            {connected ? `${connected.name} — ${connected.note || 'connected'}` : meta.blurb}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {connected && <Status p={connected} />}
          {connected && (
            <button onClick={check} disabled={!!busy} style={btnGhost}>
              {busy === 'test' ? <Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : <RefreshCw size={12} />} Test
            </button>
          )}
          <button onClick={() => setOpen(v => !v)} style={btnDark}>
            {connected ? 'Change' : <><Plus size={12} /> Connect</>}
          </button>
          {connected && (
            <button onClick={drop} title="Disconnect" style={{ ...btnGhost, color: '#b42318' }}><Trash2 size={12} /></button>
          )}
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${LINE}`, paddingTop: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {specs.map(s => (
              <button key={s.id} onClick={() => { setPicked(s.id); setValues({}); }}
                style={{
                  textAlign: 'left', padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                  border: `1.5px solid ${chosen === s.id ? INK : LINE}`,
                  background: chosen === s.id ? '#f7f8fa' : '#fff', flex: '1 1 200px', minWidth: 0,
                }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK }}>{s.name}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 2, lineHeight: 1.45 }}>{s.blurb}</span>
              </button>
            ))}
          </div>

          {spec && (
            <>
              {spec.fields.length === 0 && (
                <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 12px' }}>
                  Nothing to connect — the app will show you what to create and check it once it exists.
                </p>
              )}
              {spec.fields.map(f => {
                const already = connected?.provider === spec.id && connected.filled.includes(f.key);
                return (
                  <label key={f.key} style={{ display: 'block', marginBottom: 12 }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: INK, marginBottom: 5 }}>
                      {f.label}{f.optional && <span style={{ color: MUTED, fontWeight: 500 }}> — optional</span>}
                    </span>
                    <input
                      type={f.secret ? 'password' : 'text'}
                      value={values[f.key] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                      placeholder={already ? '•••••••••• (saved — leave blank to keep)' : ''}
                      style={input}
                    />
                    {f.hint && <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 4 }}>{f.hint}</span>}
                  </label>
                );
              })}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={save} disabled={busy === 'save'} style={btnDark}>
                  {busy === 'save' ? <><Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> Testing…</> : 'Save and test'}
                </button>
                {spec.docs && (
                  <a href={spec.docs} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: MUTED, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Where to get this <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

/* ── Buying a domain ─────────────────────────────────────────────────────── */

function DomainSearch({ connected }: { connected: ConnectedProvider | null }) {
  const { addNotification } = useApp();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<DomainResult[]>([]);
  const [owned, setOwned] = useState<{ domain: string; expiresAt: string | null }[]>([]);
  const [note, setNote] = useState('');
  const [buying, setBuying] = useState('');

  const run = async () => {
    if (!q.trim()) return;
    setBusy(true); setNote('');
    const r = await searchDomains(q);
    setBusy(false);
    setResults(r.results); setOwned(r.owned);
    setNote(r.error ?? r.message);
  };

  const buy = async (domain: string, price: number | null) => {
    const ask = price != null
      ? `Register ${domain} for ${price.toFixed(2)}? This charges your registrar account.`
      : `Register ${domain}? This charges your registrar account.`;
    if (!window.confirm(ask)) return;
    setBuying(domain);
    const r = await registerDomain(domain, 1, true);
    setBuying('');
    addNotification(r.message ?? r.error ?? '', r.success ? 'success' : 'error');
    if (r.success) run();
  };

  return (
    <Card>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: INK }}>Find a domain</h3>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
        {connected
          ? 'Type a name or a full domain. Prices come from your registrar, not from us.'
          : 'Connect a registrar above to search and register from here.'}
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && run()}
          placeholder="acme, or acme.com" style={{ ...input, flex: '1 1 220px' }} />
        <button onClick={run} disabled={busy || !connected} style={btnDark}>
          {busy ? <Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Search size={12} />} Search
        </button>
      </div>

      {note && (
        <p style={{ fontSize: 12.5, color: MUTED, margin: '12px 0 0', lineHeight: 1.5 }}>{note}</p>
      )}

      {results.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {results.map(r => (
            <li key={r.domain} style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              padding: '10px 12px', borderRadius: 12, border: `1px solid ${LINE}`,
              background: r.available ? '#fbfdfb' : '#fafbfc',
            }}>
              <span style={{ flex: 1, minWidth: 140, fontSize: 13.5, fontWeight: 700, color: r.available ? INK : '#98a1ae' }}>
                {r.domain}
              </span>
              <span style={{ fontSize: 12, color: MUTED }}>
                {r.available ? (r.price != null ? `${r.price.toFixed(2)} / year` : 'Available') : (r.note || 'Taken')}
              </span>
              {r.available && (
                <button onClick={() => buy(r.domain, r.price)} disabled={buying === r.domain} style={btnDark}>
                  {buying === r.domain ? <Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : 'Register'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {owned.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>Domains you already hold</span>
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {owned.map(o => (
              <li key={o.domain} style={{ fontSize: 12.5, padding: '6px 10px', borderRadius: 999, background: '#f1f3f7', color: INK, fontWeight: 600 }}>
                {o.domain}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/* ── The records a domain needs ──────────────────────────────────────────── */

function DnsPanel() {
  const { addNotification } = useApp();
  const deliver = loadSettings();
  const [domain, setDomain] = useState(deliver.sendingDomain ?? '');
  const [selector, setSelector] = useState((deliver.dkimSelectors?.[0] ?? 'default'));
  const [spfInclude, setSpfInclude] = useState('');
  /*
   * The hosting leg.
   *
   * "Hosting" for a site this app publishes is one DNS record: point the
   * customer's domain at the host that serves it. Off by default because most
   * domains are set up for mail first and a stray CNAME on www is not a
   * harmless extra.
   */
  const [host, setHost] = useState(false);
  const [siteTarget, setSiteTarget] = useState(window.location.hostname);
  const [busy, setBusy] = useState('');
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [canApply, setCanApply] = useState(false);
  const [checked, setChecked] = useState(false);

  const check = async () => {
    if (!domain.trim()) return;
    setBusy('check');
    const r = await dnsRecords({ domain, selector, spfInclude, dmarcMailto: `dmarc@${domain.trim()}`, siteTarget: host ? siteTarget : '' });
    setBusy('');
    setRecords(r.records); setCanApply(r.canApply); setChecked(true);
    if (r.error) addNotification(r.error, 'error');

    /*
     * Checking a domain here is also choosing it.
     *
     * The sending domain is one fact, and it was only settable on the
     * Deliverability panel — so somebody could authenticate a domain on this
     * screen and still have the app send as nothing, with the setup checklist
     * correctly reporting the step outstanding. Whichever screen you name the
     * domain on, it is the workspace's sending domain.
     */
    const clean = domain.trim().toLowerCase();
    const current = loadSettings();
    if (clean && current.sendingDomain !== clean) {
      saveSettings({ ...current, sendingDomain: clean });
    }
  };

  const apply = async (purposes?: string[]) => {
    setBusy('apply');
    const r = await dnsApply({ domain, selector, spfInclude, dmarcMailto: `dmarc@${domain.trim()}`, siteTarget: host ? siteTarget : '', purposes });
    setBusy('');
    addNotification(r.message ?? r.error ?? '', r.success ? 'success' : 'error');
    check();
  };

  const missing = records.filter(r => r.checked && !r.present);

  return (
    <Card>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: INK }}>Authenticate a domain</h3>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
        SPF, DKIM and DMARC are what stop your mail landing in spam. This reads what is live right now — not what we
        think we wrote — and, with Cloudflare connected, writes what is missing.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <label>
          <span style={labelText}>Sending domain</span>
          <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="yourbusiness.com" style={input} />
        </label>
        <label>
          <span style={labelText}>DKIM selector</span>
          <input value={selector} onChange={e => setSelector(e.target.value)} placeholder="default" style={input} />
        </label>
        <label>
          <span style={labelText}>SPF include</span>
          <input value={spfInclude} onChange={e => setSpfInclude(e.target.value)} placeholder="spf.brevo.com" style={input} />
        </label>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12.5, color: INK, fontWeight: 600 }}>
        <input type="checkbox" checked={host} onChange={e => setHost(e.target.checked)} />
        Also point www at a site published here
      </label>
      {host && (
        <>
          <input value={siteTarget} onChange={e => setSiteTarget(e.target.value)} placeholder="app.protectedcentral.com" style={{ ...input, marginTop: 8 }} />
          <p style={{ fontSize: 11.5, color: MUTED, margin: '6px 0 0', lineHeight: 1.5 }}>
            The record is only half of it: the domain also has to be added to the Cloudflare account this app runs on
            before it will answer. Until then the CNAME resolves and the site does not.
          </p>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button onClick={check} disabled={busy === 'check' || !domain.trim()} style={btnDark}>
          {busy === 'check' ? <Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : <ShieldCheck size={12} />} Check what is live
        </button>
        {checked && canApply && missing.length > 0 && (
          <button onClick={() => apply(missing.map(m => m.purpose))} disabled={busy === 'apply'} style={btnDark}>
            {busy === 'apply' ? <Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : null}
            Write the {missing.length} missing record{missing.length === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {checked && !canApply && (
        <p style={{
          margin: '12px 0 0', fontSize: 12.5, lineHeight: 1.55, color: '#8a6d00',
          background: '#fff9e6', border: '1px solid #f6e2a8', borderRadius: 10, padding: '9px 11px',
        }}>
          <AlertTriangle size={12} style={{ verticalAlign: -1, marginRight: 5 }} />
          No Cloudflare DNS connection, so these have to be added by hand at whoever hosts this domain's DNS. The exact
          values are below — copy them across and check again.
        </p>
      )}

      {records.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {records.map(r => (
            <li key={`${r.type}-${r.name}-${r.value}`} style={{
              padding: '11px 12px', borderRadius: 12,
              border: `1px solid ${r.present ? '#cfe6d2' : LINE}`,
              background: r.present ? '#fbfdfb' : '#fff',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: '#f1f3f7', color: INK }}>
                  {r.type}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: INK, wordBreak: 'break-all' }}>{r.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: !r.checked ? '#8a6d00' : r.present ? '#1e6b32' : '#b42318' }}>
                  {!r.checked ? 'Could not check' : r.present ? (r.matches ? 'Live' : 'Live, but different') : 'Missing'}
                </span>
              </div>
              <code style={{
                display: 'block', marginTop: 7, fontSize: 11.5, color: MUTED, wordBreak: 'break-all',
                background: '#f7f8fa', borderRadius: 8, padding: '7px 9px', lineHeight: 1.5,
              }}>
                {r.value}
              </code>
              {r.present && !r.matches && (
                <span style={{ display: 'block', fontSize: 11.5, color: '#8a6d00', marginTop: 6, lineHeight: 1.5 }}>
                  Already there: <code style={{ wordBreak: 'break-all' }}>{r.current}</code> — left alone unless you replace it.
                </span>
              )}
              <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 6, lineHeight: 1.5 }}>{r.why}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── Creating a mailbox ──────────────────────────────────────────────────── */

function MailboxPanel({ connected }: { connected: ConnectedProvider | null }) {
  const { addNotification } = useApp();
  const deliver = loadSettings();
  const [domain, setDomain] = useState(deliver.sendingDomain ?? '');
  const [local, setLocal] = useState('hello');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ address: string; password: string } | null>(null);

  const create = async () => {
    setBusy(true);
    const r = await createMailbox(domain, local, name || undefined);
    setBusy(false);

    if (r.success && r.smtp && r.imap && r.password) {
      /* Straight into the workspace's mail settings — the point of doing this
         here rather than in a provider's dashboard is that the credentials
         never have to be copied by hand. */
      const saved = await saveMailbox({
        smtp: { host: r.smtp.host, port: r.smtp.port, user: r.smtp.username, pass: r.password, encryption: r.smtp.encryption },
        from: { name: name || local, email: r.address ?? '' },
        imap: { host: r.imap.host, port: r.imap.port, user: r.imap.username, pass: r.password, folder: r.imap.folder },
      });
      setMade({ address: r.address ?? '', password: r.password });
      addNotification(
        saved.success
          ? `${r.address} created and set as this workspace's mailbox.`
          : `${r.address} created, but its details could not be saved here: ${saved.error ?? ''}`,
        saved.success ? 'success' : 'error',
      );
      return;
    }

    addNotification(r.message ?? r.error ?? 'That did not work.', r.code === 'manual' ? 'info' : 'error');
  };

  return (
    <Card>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: INK }}>Create a mailbox</h3>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
        {connected && connected.provider !== 'manual'
          ? 'Creates the address on your mail provider and saves its sending details to this workspace in one step.'
          : 'No mail provider is connected that can create mailboxes. This will tell you the address to create, and where to paste its details.'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <label>
          <span style={labelText}>Address</span>
          <input value={local} onChange={e => setLocal(e.target.value)} placeholder="hello" style={input} />
        </label>
        <label>
          <span style={labelText}>Domain</span>
          <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="yourbusiness.com" style={input} />
        </label>
        <label>
          <span style={labelText}>Display name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Acme Support" style={input} />
        </label>
      </div>

      <button onClick={create} disabled={busy || !domain.trim() || !local.trim()} style={{ ...btnDark, marginTop: 12 }}>
        {busy ? <Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Mail size={12} />}
        Create {local || 'hello'}@{domain || 'yourdomain.com'}
      </button>

      {made && (
        <div style={{ marginTop: 14, padding: '12px 13px', borderRadius: 12, background: '#fbfdfb', border: '1px solid #cfe6d2' }}>
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK }}>{made.address}</span>
          {/*
            Shown once, on purpose. The provider will not display it again and
            neither will this app — it is stored encrypted on the server for
            sending, and nothing reads it back out.
          */}
          <span style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 5, lineHeight: 1.5 }}>
            Password (shown once — save it if you want to sign in to the mailbox directly):
          </span>
          <code style={{ display: 'block', marginTop: 5, fontSize: 12.5, background: '#f7f8fa', borderRadius: 8, padding: '7px 9px', wordBreak: 'break-all' }}>
            {made.password}
          </code>
        </div>
      )}
    </Card>
  );
}

/* ── The panel ───────────────────────────────────────────────────────────── */

export default function InfrastructurePanel() {
  const [specs, setSpecs] = useState<ProviderSpec[]>([]);
  const [connected, setConnected] = useState<ConnectedProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* Bumped by anything that changes what is connected, so there is one loader
     rather than a copy of it behind every button. */
  const [reload, setReload] = useState(0);
  const refresh = () => setReload(k => k + 1);

  useEffect(() => {
    /* Guarded: this is a round trip, and Settings is twelve tabs somebody can
       click straight past. */
    let alive = true;
    (async () => {
      const r = await loadProviders();
      if (!alive) return;
      setSpecs(r.catalogue); setConnected(r.providers); setError(r.error ?? '');
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [reload]);

  const byKind = (k: ProviderKind) => connected.find(c => c.kind === k) ?? null;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: MUTED, fontSize: 13, padding: 20 }}>
        <Loader size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Loading your providers…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>Infrastructure</h2>
        <p style={{ margin: '5px 0 0', fontSize: 13, color: MUTED, lineHeight: 1.55, maxWidth: 640 }}>
          Connect the accounts that let this app set a client up end to end — buy the domain, authenticate it, create the
          mailbox. Credentials are encrypted on the server and never sent back to a browser, including this one.
        </p>
      </div>

      {error && (
        <div style={{ fontSize: 12.5, color: '#b42318', background: '#fdecec', border: '1px solid #f7cdc9', borderRadius: 10, padding: '9px 11px' }}>
          {error}
        </div>
      )}

      {(['registrar', 'dns', 'mailbox'] as ProviderKind[]).map(k => (
        <KindSection key={k} kind={k} specs={specs.filter(s => s.kind === k)} connected={byKind(k)} onChanged={refresh} />
      ))}

      <DomainSearch connected={byKind('registrar')} />
      <DnsPanel />
      <MailboxPanel connected={byKind('mailbox')} />
    </div>
  );
}

/* ── Shared bits of style ────────────────────────────────────────────────── */

const input: React.CSSProperties = {
  width: '100%', padding: '9px 11px', borderRadius: 10, border: `1px solid ${LINE}`,
  fontSize: 13, color: INK, background: '#fff', boxSizing: 'border-box',
};

const labelText: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, color: INK, marginBottom: 5,
};

const btnBase: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px',
  borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: 'none',
};

const btnDark: React.CSSProperties = { ...btnBase, background: INK, color: '#fff' };
const btnGhost: React.CSSProperties = { ...btnBase, background: '#f1f3f7', color: INK };
