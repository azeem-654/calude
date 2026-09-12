/**
 * What Autopilot builds for a project before it starts sending.
 *
 * ── Why this screen did not exist ──
 *
 * The sending pool has been built and working for a long time: register
 * domains, write SPF/DKIM/DMARC, create mailboxes on them, warm those up, and
 * do it either on the customer's own registrar or on the operator's with the
 * cost billed on. The planner has the steps, the tick carries them out, and
 * there is a purchases ledger behind it.
 *
 * None of it ever ran. The tick reads its target from a project's own
 * `pool_target`, which was written once as '{}' at creation and never updated —
 * and the only endpoint that set a pool target wrote to `crm_autopilot`, the
 * one-per-workspace row the tick stopped reading when projects arrived. So
 * `poolFor()` returned nothing for every project, no infrastructure step was
 * ever planned, and the capability looked present in the schema while being
 * unreachable from the app.
 *
 * ── The one rule this screen keeps ──
 *
 * Zero means build nothing, and zero is the default. Autopilot does not go and
 * buy domains because somebody started a project; a number here is a customer
 * deciding to spend money, typed by them.
 */
import { useState } from 'react';
import { Globe, Loader, Check, AlertCircle, Mail, ShieldCheck, Flame } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { setProjectInfra, poolTargetOf, type Project } from '../../services/projects';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

/**
 * What will happen, in order, and why that order.
 *
 * Shown before anything is bought, because "Autopilot will set up your
 * infrastructure" is a sentence somebody has to trust, and a list of four
 * concrete steps is something they can judge.
 */
const STEPS = [
  { icon: Globe, label: 'Register the domains', sub: 'Lookalikes of your main one, so a bounce never touches it' },
  { icon: ShieldCheck, label: 'Authenticate them', sub: 'SPF, DKIM and DMARC written into DNS' },
  { icon: Mail, label: 'Create the mailboxes', sub: 'On each domain, connected and validated' },
  { icon: Flame, label: 'Warm them up', sub: 'Slowly, before anything real goes out — a cold mailbox sending fifty on day one goes to spam' },
];

export default function ProjectInfra({ project, onSaved }: {
  project: Project;
  onSaved: (projects: Project[]) => void;
}) {
  const { addNotification } = useApp();
  const current = poolTargetOf(project);
  const [domains, setDomains] = useState(String(current.domains));
  const [per, setPer] = useState(String(current.mailboxesPerDomain));
  const [mode, setMode] = useState<'byo' | 'managed'>(project.purchaseMode === 'managed' ? 'managed' : 'byo');
  const [busy, setBusy] = useState(false);

  const n = Math.min(Math.max(Math.round(Number(domains) || 0), 0), 20);
  const m = Math.min(Math.max(Math.round(Number(per) || 3), 1), 10);
  const on = n > 0;
  const changed = n !== current.domains || m !== current.mailboxesPerDomain
    || mode !== (project.purchaseMode === 'managed' ? 'managed' : 'byo');

  const save = async () => {
    setBusy(true);
    const r = await setProjectInfra({ id: project.id, purchaseMode: mode, domains: n, mailboxesPerDomain: m });
    setBusy(false);
    if (!r.success) { addNotification(r.error ?? 'Could not save that.', 'error'); return; }
    onSaved(r.projects ?? []);
    addNotification(
      n === 0
        ? 'Autopilot will not buy or build anything for this project.'
        : `Autopilot will build ${n} ${n === 1 ? 'domain' : 'domains'} with ${m} ${m === 1 ? 'mailbox' : 'mailboxes'} each. Each step waits for your approval before it spends anything.`,
      'success',
    );
  };

  const inp: React.CSSProperties = {
    width: 74, padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 9,
    fontSize: 14, color: INK, outline: 'none', fontFamily: 'inherit', textAlign: 'center',
  };

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, background: '#fff', overflow: 'hidden' }}>
      <div style={{ padding: '13px 15px', borderBottom: `1px solid ${LINE}`, background: '#fafbfc', display: 'flex', alignItems: 'center', gap: 9 }}>
        <Globe size={15} color={ACCENT} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>Domains and mailboxes</div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>
            What Autopilot builds for this project before it sends anything
          </div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
          background: on ? '#e8f5e9' : '#f1f5f9', color: on ? '#1e6b32' : MUTED,
        }}>
          {on ? `${current.domains || n} × ${current.mailboxesPerDomain || m}` : 'off'}
        </span>
      </div>

      <div style={{ padding: 15, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 }}>Domains</label>
            <input value={domains} inputMode="numeric"
              onChange={e => setDomains(e.target.value.replace(/[^\d]/g, ''))} style={inp} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 }}>Mailboxes on each</label>
            <input value={per} inputMode="numeric"
              onChange={e => setPer(e.target.value.replace(/[^\d]/g, ''))} style={inp} />
          </div>
          <p style={{ margin: 0, flex: 1, minWidth: 180, fontSize: 11.5, color: MUTED, lineHeight: 1.55 }}>
            {n === 0
              ? 'Zero means Autopilot buys and builds nothing. It will still write and send from a mailbox you connect yourself.'
              : `${n * m} sending ${n * m === 1 ? 'address' : 'addresses'} in total. Two domains with three each suits a small business; more than that is renewals you pay for and volume you do not have.`}
          </p>
        </div>

        {on && (
          <>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Who buys them?</label>
              <div style={{ display: 'grid', gap: 7 }}>
                {([
                  ['byo', 'I have my own registrar', 'Autopilot uses the accounts you connected under Settings → Infrastructure. You pay your provider directly and nothing goes through us.'],
                  ['managed', 'Buy them for me', 'We buy on your behalf and bill it on. Only available when this installation has a registrar connected.'],
                ] as const).map(([id, label, sub]) => (
                  <button key={id} onClick={() => setMode(id)} aria-pressed={mode === id}
                    style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', padding: '11px 12px',
                      borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1.5px solid ${mode === id ? ACCENT : LINE}`,
                      background: mode === id ? 'rgba(91,70,229,0.05)' : '#fff',
                    }}>
                    <span style={{ width: 16, height: 16, borderRadius: 999, marginTop: 2, flexShrink: 0, border: `1.5px solid ${mode === id ? ACCENT : '#cbd2df'}`, background: mode === id ? ACCENT : '#fff', display: 'grid', placeItems: 'center' }}>
                      {mode === id && <span style={{ width: 6, height: 6, borderRadius: 999, background: '#fff' }} />}
                    </span>
                    <span>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK }}>{label}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 2, lineHeight: 1.5 }}>{sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ padding: 12, borderRadius: 11, background: '#fafbfc', border: `1px solid ${LINE}` }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 9 }}>What it will do, in this order</div>
              <div style={{ display: 'grid', gap: 9 }}>
                {STEPS.map((st, i) => (
                  <div key={st.label} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <span style={{ width: 19, height: 19, borderRadius: 999, flexShrink: 0, background: '#eceef3', color: MUTED, display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 800, marginTop: 1 }}>{i + 1}</span>
                    <st.icon size={13} color={ACCENT} style={{ flexShrink: 0, marginTop: 3 }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK }}>{st.label}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 1, lineHeight: 1.5 }}>{st.sub}</span>
                    </span>
                  </div>
                ))}
              </div>
              {/* Asked every time, and the honest answer is "nothing". Leaving
                  it unsaid reads as a missing step rather than an absent cost. */}
              <p style={{ margin: '10px 0 0', paddingTop: 9, borderTop: `1px solid ${LINE}`, fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
                No hosting to buy. The site, funnels and shop this project builds are served by
                Protected Central itself — a domain here is for <em>sending</em>, and pointing one
                at a published site is a DNS record, not a separate bill.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 11, background: '#fffbeb', border: '1px solid #fde68a' }}>
              <AlertCircle size={15} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 11.5, color: '#78350f', lineHeight: 1.6 }}>
                Every step that costs money appears on the board and waits for you to approve it. Autopilot
                never buys a domain on its own, whichever option you pick above.
              </p>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => void save()} disabled={busy || !changed}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px',
              border: 'none', borderRadius: 9, background: busy || !changed ? '#c7c9d3' : INK,
              color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: busy || !changed ? 'not-allowed' : 'pointer',
            }}>
            {busy ? <Loader size={13} className="spin" /> : <Check size={13} />} Save
          </button>
          {!changed && <span style={{ fontSize: 11.5, color: MUTED }}>Nothing to save</span>}
        </div>
      </div>
    </div>
  );
}
