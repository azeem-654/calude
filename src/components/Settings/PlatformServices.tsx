/**
 * Settings → Platform services: everything the install owner provides to every
 * customer, in one place, with its real state.
 *
 * ── Why a tab of its own ──
 *
 * The owner asked for one place where "the keys I provide as a service to all
 * my customers live". They had landed one feature at a time beside whatever
 * needed them — AI Engine, Integrations, Security, Billing, Domains & Email —
 * and nothing answered "is everything my customers depend on connected?".
 *
 * ── What it is not ──
 *
 * A second copy of any panel. The list reads /api/platform.php (state only,
 * never a secret) and points at the one panel that sets each thing. The two
 * that are purely install-wide Google settings — the Maps key and the sign-in
 * client — are embedded below, the same components as everywhere else; the
 * rest (the AI key, payments, system email, domains) open the tab that owns
 * them, because those panels also serve the owner's own workspace there.
 *
 * Shown only to the install owner. The server refuses the status call for
 * anybody else, so a customer forcing `?tab=platform` sees nothing useful.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, ChevronRight, Circle, Loader, RefreshCw, XCircle } from 'lucide-react';
import { API_BASE } from '../../services/apiBase';
import { sessionToken } from '../../services/auth';
import PlacesKeyPanel from './PlacesKeyPanel';
import AiKeysPanel from './AiKeysPanel';
import AiEngineCard from './AiEngineCard';
import GeoapifyKeyPanel from './GeoapifyKeyPanel';
import EmailVerifierPanel from './EmailVerifierPanel';
import CompaniesHousePanel from './CompaniesHousePanel';
import GoogleSignInPanel from './GoogleSignInPanel';
import LeadDirectoryAdmin from './LeadDirectoryAdmin';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';

type State = 'ok' | 'unchecked' | 'error' | 'off';

interface Service {
  id: string;
  name: string;
  powers: string;
  state: State;
  detail: string;
  checkedAt: string | null;
  lastError: string;
  where: { label: string; tab?: string };
  optional?: boolean;
}

const PILL: Record<State, { text: string; bg: string; fg: string; Icon: typeof CheckCircle }> = {
  ok: { text: 'Working', bg: '#e8f6ee', fg: '#0f7b3d', Icon: CheckCircle },
  unchecked: { text: 'Set, not checked', bg: '#f1f5f9', fg: '#475569', Icon: Circle },
  error: { text: 'Needs attention', bg: '#fef2f2', fg: '#b42318', Icon: XCircle },
  off: { text: 'Not set', bg: '#fff7ed', fg: '#9a3412', Icon: AlertTriangle },
};

/* The two embedded below, by service id, so "Set it" can scroll to them. */
const EMBEDDED: Record<string, string> = { google_places: 'platform-google-maps', google_oauth: 'platform-google-signin', email_verifier: 'platform-email-verifier', companies_house: 'platform-companies-house', lead_directory: 'platform-lead-directory' };

export default function PlatformServices({ openTab }: { openTab: (id: string) => void }) {
  const [services, setServices] = useState<Service[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/api/platform.php`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: sessionToken(), action: 'status' }),
      });
      const d = await r.json() as { success?: boolean; services?: Service[]; error?: string };
      if (d.success) { setServices(d.services ?? []); setError(''); } else setError(d.error ?? 'Could not read the services.');
    } catch {
      setError('Could not reach the server.');
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /* Optional extras that are simply not set are not "needing attention": a
     count that always reads 10 teaches the owner to ignore it. */
  const needs = (services ?? []).filter(s => s.state === 'error' || (s.state === 'off' && !s.optional)).length;

  return (
    <div style={{ display: 'grid', gap: 20, minWidth: 0 }}>
      <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 'clamp(16px, 3vw, 24px)', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0, flex: 1, minWidth: 180 }}>Platform services</h3>
          <button onClick={() => void load()} disabled={busy} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${LINE}`,
            background: '#fff', color: INK, fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
          }}>
            {busy ? <Loader size={12} className="spin" /> : <RefreshCw size={12} />} Refresh
          </button>
        </div>
        <p style={{ fontSize: 13, color: MUTED, margin: '6px 0 16px', lineHeight: 1.6 }}>
          The keys and accounts you provide to every customer, so none of them has to connect their own. Only you see
          this tab. Keys are encrypted on the server and never shown again — here you see whether each one works, when
          it was last proved, and what it powers.
          {services && (needs ? <strong style={{ color: '#9a3412' }}> {needs} need{needs === 1 ? 's' : ''} your attention.</strong> : <strong style={{ color: '#0f7b3d' }}> Everything is set.</strong>)}
        </p>

        {error && (
          <div role="alert" style={{ fontSize: 12.5, color: '#b42318', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 12px' }}>{error}</div>
        )}
        {!services && !error && <div style={{ fontSize: 12.5, color: MUTED }}><Loader size={12} className="spin" /> Reading…</div>}

        {services && (
          <div style={{ display: 'grid', gap: 8 }} data-testid="platform-services">
            {services.map(s => {
              const p = s.optional && s.state === 'off' ? { ...PILL.off, text: 'Optional, not set', bg: '#f1f5f9', fg: '#475569' } : PILL[s.state];
              const anchor = EMBEDDED[s.id];
              return (
                <div key={s.id} data-service={s.id} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '12px 14px', display: 'grid', gap: 4, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, flex: '1 1 200px', minWidth: 0 }}>{s.name}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: p.bg, color: p.fg }}>
                      <p.Icon size={10} /> {p.text}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.55 }}>Powers: {s.powers}</div>
                  <div style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.55 }}>{s.detail}</div>
                  {s.checkedAt && <div style={{ fontSize: 11.5, color: MUTED }}>Last proved working: {new Date(s.checkedAt).toLocaleString()}</div>}
                  {s.lastError && <div style={{ fontSize: 12, color: '#b42318', lineHeight: 1.5, overflowWrap: 'anywhere' }}>Last error: {s.lastError}</div>}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
                    {anchor ? (
                      <button onClick={() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} style={go}>
                        Set it below <ChevronRight size={12} />
                      </button>
                    ) : s.where.tab ? (
                      <button onClick={() => openTab(s.where.tab!)} style={go}>
                        Open {s.where.label.split(',')[0]} <ChevronRight size={12} />
                      </button>
                    ) : (
                      <span style={{ fontSize: 11.5, color: MUTED }}>Where: {s.where.label}</span>
                    )}
                    {s.where.tab && s.where.label.includes(',') && <span style={{ fontSize: 11.5, color: MUTED }}>{s.where.label.split(',').slice(1).join(',').trim()}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div id="platform-ai-main" style={{ scrollMarginTop: 16 }}><AiEngineCard /></div>
      <div id="platform-ai-keys" style={{ scrollMarginTop: 16 }}><AiKeysPanel /></div>
      <div id="platform-geoapify" style={{ scrollMarginTop: 16 }}><GeoapifyKeyPanel /></div>
      <div id="platform-companies-house" style={{ scrollMarginTop: 16 }}><CompaniesHousePanel /></div>
      <div id="platform-email-verifier" style={{ scrollMarginTop: 16 }}><EmailVerifierPanel /></div>
      <div id="platform-lead-directory" style={{ scrollMarginTop: 16 }}><LeadDirectoryAdmin /></div>
      <div id="platform-google-maps" style={{ scrollMarginTop: 16 }}><PlacesKeyPanel /></div>
      <div id="platform-google-signin" style={{ scrollMarginTop: 16 }}><GoogleSignInPanel /></div>
    </div>
  );
}

const go: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 11px', borderRadius: 9, border: `1px solid ${LINE}`,
  background: '#fff', color: INK, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
