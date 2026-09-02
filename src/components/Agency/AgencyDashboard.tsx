import { useEffect, useMemo, useState } from 'react';
import {
  Building2, Plus, Search, ArrowRight, MoreVertical, Users, TrendingUp,
  DollarSign, Pause, Play, Trash2, Edit2, X, CheckCircle2, Zap, Star,
  MessageSquare, LogIn, Rocket, Palette, KeyRound, CreditCard, Copy, ExternalLink,
} from 'lucide-react';
import { createUser, getSession } from '../../services/auth';
import { loadStripeConfig, saveStripeConfig, billingFor, updateBilling, createCheckout, saveStripeSecretToServer, serverBillingEnabled } from '../../services/billing';
import type { StripeConfig } from '../../services/billing';
import { cloudStatus, isConfigured } from '../../services/serverData';
import { Database, Cloud, HardDrive, ChevronRight } from 'lucide-react';
import Header from '../Layout/Header';
import {
  loadSubAccounts, createSubAccount, updateSubAccount, deleteSubAccount,
  switchAccount, accountUsage, loadAgency, saveAgency, blankSubAccount, planById, PLANS,
  descendantsOf, resellAllowance, depthOf, childrenOf,
} from '../../services/tenancy';
import type { SubAccount, AccountStatus, PlanId } from '../../services/tenancy';
import { API_BASE } from '../../services/apiBase';
import { planUsage, releaseWorkspace, type PlanUsage } from '../../services/automation';
import { useApp } from '../../context/AppContext';

const INK = '#17191c';
const MUTED = '#8a8f98';
const FAINT = '#b0b4ba';
const CARD: React.CSSProperties = { background: '#fff', borderRadius: 18, boxShadow: '0 1px 2px rgba(23,25,28,0.05)' };
const FROST: React.CSSProperties = { background: 'rgba(255,255,255,0.6)', borderRadius: 20, padding: 20 };

const STATUS = {
  active:    { label: 'Active', bg: '#e9f4e6', color: '#3f9142' },
  trial:     { label: 'Trial', bg: '#eceff9', color: '#3e63dd' },
  paused:    { label: 'Paused', bg: '#fdf5e7', color: '#c77414' },
  cancelled: { label: 'Cancelled', bg: '#fceaea', color: '#e5484d' },
} as const;

/** How many workspaces this one has opened underneath it. */
const childCount = (id: string) => childrenOf(id).length;

export default function AgencyDashboard() {
  /*
   * Whose network is this?
   *
   * The dashboard used to list `loadSubAccounts()` — every workspace on the
   * install, whoever opened it. With one agency that was the same set. Now that
   * a sub-account can resell to its own sub-accounts, it is the difference
   * between a reseller seeing its own clients and seeing everybody's.
   *
   * It is *who you are*, not which workspace you happen to have open. The two
   * are not the same: `ensureDefaultAccount` selects the first sub-account on a
   * fresh browser so there is always somewhere to work, which had the master
   * account arriving at its own agency dashboard scoped to its first client's
   * network and told it had used 2 of 2 sub-accounts.
   *
   * The master's session carries no accountId; a reseller's carries its own.
   * `into` lets the master walk down a reseller's tree from there.
   */
  const home = getSession()?.user.accountId ?? null;
  const [into, setInto] = useState<string | null>(null);
  const parentId = into ?? home;
  const trail = useMemo(() => {
    const all = loadSubAccounts();
    const out: SubAccount[] = [];
    let at: string | null | undefined = parentId;
    const seen = new Set<string>();
    while (at && at !== home && !seen.has(at)) {
      seen.add(at);
      const node = all.find(a => a.id === at);
      if (!node) break;
      out.unshift(node);
      at = node.parentId ?? null;
    }
    return out;
  }, [parentId, home]);

  /*
   * The list is derived, not stored. Keeping it in state meant an effect to
   * re-read it whenever the viewer walked into another network, which is a
   * synchronous setState inside an effect — a cascading render, and the lint
   * rule that catches it is right. A counter that mutations bump says the same
   * thing without the round trip through state.
   */
  const [version, setVersion] = useState(0);
  /* `version` is not read inside — it is the invalidation key. descendantsOf
     reads localStorage, which React cannot see change, so a mutation has to say
     so explicitly. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const accounts = useMemo(() => descendantsOf(parentId), [parentId, version]);
  const reload = () => setVersion(v => v + 1);
  const [limitError, setLimitError] = useState('');
  const allowance = resellAllowance(parentId);
  const { addNotification } = useApp();

  /*
   * The server's count, alongside the browser's.
   *
   * `allowance` is worked out from local storage and is what greys the button
   * out; this is the number the server will actually refuse on. They should
   * agree, and when they do not it is worth saying so — a browser that thinks
   * there is room while the server does not is a customer about to meet an
   * error they cannot explain.
   */
  const [usage, setUsage] = useState<PlanUsage | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const u = await planUsage();
      if (alive) setUsage(u);
    })();
    return () => { alive = false; };
  }, [version]);
  const [agency, setAgencyState] = useState(loadAgency);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<SubAccount | undefined>();
  const [creating, setCreating] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editAgency, setEditAgency] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [billFor, setBillFor] = useState<SubAccount | undefined>();
  const [cloudOpen, setCloudOpen] = useState(false);
  const [cloud, setCloud] = useState<'cloud' | 'local'>(cloudStatus());

  const clients = accounts.filter(a => a.status !== undefined);
  const mrr = clients.filter(a => a.status === 'active').reduce((s, a) => s + a.price, 0);
  const activeCount = clients.filter(a => a.status === 'active').length;
  const trialCount = clients.filter(a => a.status === 'trial').length;

  const filtered = clients.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.businessName.toLowerCase().includes(search.toLowerCase()),
  );

  const saveAccount = (a: SubAccount) => {
    const exists = accounts.some(x => x.id === a.id);
    if (exists) {
      updateSubAccount(a.id, a);
      reload();
    } else {
      /* The plan's allowance is enforced in tenancy, which throws rather than
         silently dropping the workspace. Surfacing the reason is the whole
         point — "you are on Studio and both its sub-accounts are in use" is
         actionable, a button that does nothing is not. */
      try {
        createSubAccount({ ...a, parentId });
      } catch (e) {
        setLimitError(e instanceof Error ? e.message : 'Could not create that sub-account.');
        return;
      }
      reload();
    }
    setLimitError('');
    setEditing(undefined); setCreating(false);
  };
  const setStatus = (id: string, status: AccountStatus) => { updateSubAccount(id, { status }); reload(); setMenuFor(null); };
  const remove = async (id: string) => {
    if (!confirm('Delete this sub-account and ALL its data? This cannot be undone.')) return;
    /* Everything it resold goes with it locally; the server is told separately
       because that is what gives the plan slot back — deleting only in the
       browser would leave the allowance permanently spent. */
    const gone = [id, ...descendantsOf(id).map(a => a.id)];
    deleteSubAccount(id);
    reload();
    setMenuFor(null);
    const failed: string[] = [];
    for (const target of gone) {
      const r = await releaseWorkspace(target);
      if (!r.success) failed.push(target);
    }
    if (failed.length) {
      /* Said out loud rather than swallowed: the local copy is gone either way,
         and a slot that silently stayed taken is exactly the kind of thing
         somebody discovers when they cannot open their next client. */
      addNotification(`Deleted here, but the server still counts ${failed.length} of ${gone.length} against your plan. Try again when you are back online.`, 'error');
    }
    setUsage(await planUsage());
  };

  return (
    <div style={{ minHeight: '100vh' }} onClick={() => setMenuFor(null)}>
      <Header title="Agency" subtitle={`${agency.name} · ${activeCount} active client${activeCount === 1 ? '' : 's'}`} />

      <div style={{ padding: '14px 28px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 16 }}>
          {[
            { label: 'Monthly recurring revenue', value: `$${mrr.toLocaleString()}`, icon: DollarSign, dark: true },
            { label: 'Active clients', value: activeCount, icon: Building2 },
            { label: 'On trial', value: trialCount, icon: Rocket },
            { label: 'Total sub-accounts', value: clients.length, icon: Users },
          ].map(k => (
            <div key={k.label} style={{ ...CARD, padding: '20px 22px', background: k.dark ? INK : '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 11.5, color: k.dark ? 'rgba(255,255,255,0.6)' : MUTED, fontWeight: 600 }}>{k.label}</span>
                <div style={{ width: 32, height: 32, borderRadius: 999, background: k.dark ? 'rgba(255,255,255,0.12)' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <k.icon size={15} color={k.dark ? '#c7f441' : INK} />
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: k.dark ? '#fff' : INK }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 360 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: FAINT }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sub-accounts…" style={{ width: '100%', padding: '9px 12px 9px 36px', border: '1px solid #e6e9f0', borderRadius: 10, fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' }} />
          </div>
          <button onClick={() => setCloudOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: '1px solid #e6e9f0', borderRadius: 10, background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: cloud === 'cloud' ? '#3f9142' : '#c77414' }}>
            {cloud === 'cloud' ? <Cloud size={13} /> : <HardDrive size={13} />} {cloud === 'cloud' ? 'Cloud synced' : 'Local only'}
          </button>
          <button onClick={() => { setBillFor(undefined); setBillingOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: '1px solid #e6e9f0', borderRadius: 10, background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><CreditCard size={13} /> Billing</button>
          <button onClick={() => setEditAgency(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: '1px solid #e6e9f0', borderRadius: 10, background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><Edit2 size={13} /> Agency settings</button>
          <button
            onClick={() => { setLimitError(''); setCreating(true); setEditing(blankSubAccount()); }}
            disabled={!allowance.canCreate}
            title={allowance.canCreate ? '' : allowance.reason}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: allowance.canCreate ? INK : '#c9ced6', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: allowance.canCreate ? 'pointer' : 'not-allowed' }}
          ><Plus size={15} /> New Sub-Account</button>
        </div>

        {/*
          Where you are in the tree, and the way back up. Without this a master
          can see that a workspace resells to three others and has no way to
          look at them.
        */}
        {trail.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12.5 }}>
            <button onClick={() => setInto(null)} style={{ border: 'none', background: 'none', padding: '4px 8px', borderRadius: 8, cursor: 'pointer', color: MUTED, fontWeight: 700, fontSize: 12.5 }}>
              Your network
            </button>
            {trail.map((node, i) => (
              <span key={node.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <ChevronRight size={13} color={FAINT} />
                <button
                  onClick={() => setInto(node.id)}
                  disabled={i === trail.length - 1}
                  style={{ border: 'none', background: 'none', padding: '4px 8px', borderRadius: 8, cursor: i === trail.length - 1 ? 'default' : 'pointer', color: i === trail.length - 1 ? INK : MUTED, fontWeight: 700, fontSize: 12.5 }}
                >
                  {node.name}
                </button>
              </span>
            ))}
          </div>
        )}

        {/*
          What the plan allows, said plainly and before the button is pressed.
          A reseller on Studio has two to sell; knowing that it is two, and how
          many are left, is the thing they are paying attention to.
        */}
        {parentId !== null && (
          <div style={{ ...FROST, display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>
              {allowance.allowed < 0
                ? `${allowance.used} sub-account${allowance.used === 1 ? '' : 's'} · unlimited on this plan`
                : `${allowance.used} of ${allowance.allowed} sub-accounts used`}
            </span>
            {allowance.allowed >= 0 && (
              <span style={{ flex: '1 1 120px', height: 6, borderRadius: 999, background: '#e9ecf2', overflow: 'hidden', maxWidth: 220 }}>
                <span style={{ display: 'block', height: '100%', width: `${Math.min(100, (allowance.used / Math.max(1, allowance.allowed)) * 100)}%`, background: allowance.canCreate ? '#3f9142' : '#e5484d', borderRadius: 999 }} />
              </span>
            )}
            {!allowance.canCreate && <span style={{ fontSize: 12, color: '#e5484d', fontWeight: 600 }}>{allowance.reason}</span>}
          </div>
        )}

        {/* Shown only when the two counts disagree, so the ordinary case stays
            quiet and the exceptional one is impossible to miss. */}
        {usage && usage.limit >= 0 && usage.remaining === 0 && allowance.canCreate && (
          <div style={{ ...FROST, padding: '11px 16px', border: '1px solid #f6e2a8', background: '#fff9e6', color: '#8a6d00', fontSize: 12.5, fontWeight: 600 }}>
            {usage.note} The server will refuse another one until you close one or upgrade — Settings → Automation has the
            same figure.
          </div>
        )}

        {limitError && (
          <div style={{ ...FROST, padding: '11px 16px', border: '1px solid #f5c2c2', background: '#fdf3f3', color: '#b42318', fontSize: 12.5, fontWeight: 600 }}>
            {limitError}
          </div>
        )}

        {/* Sub-account grid */}
        {filtered.length === 0 ? (
          <div style={{ ...FROST, textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ width: 60, height: 60, borderRadius: 18, background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><Building2 size={26} color="#fff" /></div>
            <div style={{ fontSize: 17, fontWeight: 800, color: INK, marginBottom: 6 }}>No sub-accounts yet</div>
            <p style={{ fontSize: 13, color: MUTED, margin: '0 0 18px' }}>Create a workspace for each client you sell a subscription to.</p>
            <button onClick={() => { setLimitError(''); setCreating(true); setEditing(blankSubAccount()); }} disabled={!allowance.canCreate} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 22px', background: allowance.canCreate ? INK : '#c9ced6', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: allowance.canCreate ? 'pointer' : 'not-allowed' }}><Plus size={16} /> Create your first client</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: 16 }}>
            {filtered.map(a => {
              const u = accountUsage(a.id);
              const plan = planById(a.plan);
              const st = STATUS[a.status];
              /* Relative to the viewer, not to the master: a reseller looking
                 at its own network cares that a workspace is one of *its*
                 clients or one of theirs, not how far it is from the top. */
              const below = depthOf(a.id) - (parentId ? depthOf(parentId) : 0);
              const resold = childCount(a.id);
              return (
                <div key={a.id} style={{ ...CARD, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ height: 5, background: a.color }} />
                  <div style={{ padding: '16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 17, fontWeight: 800, flexShrink: 0 }}>{(a.businessName || a.name || '?')[0].toUpperCase()}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: INK, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                        <div style={{ fontSize: 12, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.businessName || a.industry || '—'}</div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                          {below > 1 && (
                            <span title="Opened by one of your sub-accounts, not by you" style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: '#eef1f6', color: '#5a6472' }}>
                              {below} levels down
                            </span>
                          )}
                          {resold > 0 && (
                            <button
                              onClick={e => { e.stopPropagation(); setInto(a.id); }}
                              title={`Open ${a.name}'s own network`}
                              style={{ border: 'none', cursor: 'pointer', fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: '#eaf3ec', color: '#3f9142' }}
                            >
                              resells to {resold} →
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ position: 'relative' }}>
                        <button onClick={e => { e.stopPropagation(); setMenuFor(menuFor === a.id ? null : a.id); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: FAINT, display: 'flex' }}><MoreVertical size={16} /></button>
                        {menuFor === a.id && (
                          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 28, right: 0, zIndex: 50, background: '#fff', borderRadius: 12, boxShadow: '0 12px 32px rgba(16,24,40,0.16)', minWidth: 170, overflow: 'hidden', padding: 4 }}>
                            <MenuItem icon={Edit2} label="Edit" onClick={() => { setEditing(a); setMenuFor(null); }} />
                            <MenuItem icon={CreditCard} label="Billing" onClick={() => { setBillFor(a); setBillingOpen(true); setMenuFor(null); }} />
                            {a.status === 'paused' || a.status === 'cancelled'
                              ? <MenuItem icon={Play} label="Activate" onClick={() => setStatus(a.id, 'active')} />
                              : <MenuItem icon={Pause} label="Pause billing" onClick={() => setStatus(a.id, 'paused')} />}
                            {a.status !== 'cancelled' && <MenuItem icon={X} label="Cancel" onClick={() => setStatus(a.id, 'cancelled')} />}
                            <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />
                            <MenuItem icon={Trash2} label="Delete" danger onClick={() => remove(a.id)} />
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '12px 0', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: st.bg, color: st.color }}>{st.label}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: '#f3f4f6', color: INK }}>{plan.name}</span>
                      {(() => { const b = billingFor(a.id); if (b.status === 'none') return null; const map: Record<string, [string, string, string]> = { active: ['#e9f4e6', '#3f9142', 'Paid'], checkout_sent: ['#eceff9', '#3e63dd', 'Checkout sent'], past_due: ['#fdf5e7', '#c77414', 'Past due'], cancelled: ['#fceaea', '#e5484d', 'Cancelled'] }; const m = map[b.status]; return m ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: m[0], color: m[1] }}><CreditCard size={9} />{m[2]}</span> : null; })()}
                      <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 800, color: INK }}>${a.price}<span style={{ fontSize: 11, color: FAINT, fontWeight: 600 }}>/mo</span></span>
                    </div>

                    {/* usage */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 6, padding: '10px 0', borderTop: '1px solid #f2f3f5', borderBottom: '1px solid #f2f3f5', marginBottom: 12 }}>
                      {[
                        { icon: Users, v: u.contacts, l: 'Contacts' },
                        { icon: TrendingUp, v: u.deals, l: 'Deals' },
                        { icon: MessageSquare, v: u.conversations, l: 'Inboxes' },
                        { icon: Star, v: u.reviews, l: 'Reviews' },
                      ].map(s => (
                        <div key={s.l} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: INK }}>{s.v}</div>
                          <div style={{ fontSize: 9.5, color: FAINT, fontWeight: 600 }}>{s.l}</div>
                        </div>
                      ))}
                    </div>

                    <button onClick={() => switchAccount(a.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', padding: '10px', background: INK, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      <LogIn size={14} /> Open workspace <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && <SubAccountModal account={editing} creating={creating} onSave={saveAccount} onClose={() => { setEditing(undefined); setCreating(false); }} />}
      {editAgency && <AgencyModal agency={agency} onSave={a => { saveAgency(a); setAgencyState(a); setEditAgency(false); }} onClose={() => setEditAgency(false)} />}
      {billingOpen && <BillingModal account={billFor} onClose={() => { setBillingOpen(false); reload(); }} />}
      {cloudOpen && <CloudModal current={cloud} onDone={s => setCloud(s)} onClose={() => setCloudOpen(false)} />}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: typeof Edit2; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: danger ? '#e5484d' : '#374151', borderRadius: 8, textAlign: 'left' }}
      onMouseEnter={e => (e.currentTarget.style.background = danger ? '#fceaea' : '#f6f7f8')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
      <Icon size={14} /> {label}
    </button>
  );
}

/* ── Create / edit sub-account ── */
const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #e6e9f0', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 600, color: '#475569', marginBottom: 5 };
const COLORS = ['#3e63dd', '#e5484d', '#3f9142', '#f59e0b', '#8b5cf6', '#0d9488', '#ec4899', '#17191c'];

function SubAccountModal({ account, creating, onSave, onClose }: { account: SubAccount; creating: boolean; onSave: (a: SubAccount) => void; onClose: () => void }) {
  const [a, setA] = useState<SubAccount>(account);
  const set = (patch: Partial<SubAccount>) => setA(prev => ({ ...prev, ...patch }));
  const setBrand = (patch: Partial<NonNullable<SubAccount['branding']>>) => setA(prev => ({ ...prev, branding: { ...prev.branding, ...patch } }));
  const canSave = a.name.trim() && a.contactEmail.trim();
  const pickPlan = (id: PlanId) => set({ plan: id, price: planById(id).price });

  // Client login provisioning
  const [loginPw, setLoginPw] = useState('');
  const [loginMsg, setLoginMsg] = useState('');
  const provision = async () => {
    if (!a.contactEmail.trim() || loginPw.length < 6) { setLoginMsg('Enter a contact email and a password of 6+ characters.'); return; }
    const res = await createUser({ email: a.contactEmail.trim(), password: loginPw, name: a.contactName || a.businessName || a.name, role: 'client', accountId: a.id });
    setLoginMsg(res.ok ? `✓ Login created for ${a.contactEmail}` : (res.error || 'Could not create login.'));
    if (res.ok) setLoginPw('');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 640, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px -12px rgba(16,24,40,0.28)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e9edf3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: INK, margin: 0 }}>{creating ? 'New Sub-Account' : 'Edit Sub-Account'}</h2>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 9, padding: 7, cursor: 'pointer', display: 'flex' }}><X size={16} color="#64748b" /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 14 }}>
            <div><label style={lbl}>Workspace name *</label><input style={inp} value={a.name} onChange={e => set({ name: e.target.value })} placeholder="Acme — Main Location" /></div>
            <div><label style={lbl}>Business name</label><input style={inp} value={a.businessName} onChange={e => set({ businessName: e.target.value })} placeholder="Acme Inc." /></div>
            <div><label style={lbl}>Contact name</label><input style={inp} value={a.contactName} onChange={e => set({ contactName: e.target.value })} placeholder="Jane Smith" /></div>
            <div><label style={lbl}>Contact email *</label><input style={inp} value={a.contactEmail} onChange={e => set({ contactEmail: e.target.value })} placeholder="jane@acme.com" /></div>
            <div><label style={lbl}>Phone</label><input style={inp} value={a.phone} onChange={e => set({ phone: e.target.value })} placeholder="+1 …" /></div>
            <div><label style={lbl}>Industry</label><input style={inp} value={a.industry} onChange={e => set({ industry: e.target.value })} placeholder="Dental · Real estate · Gym…" /></div>
          </div>

          <div>
            <label style={lbl}>Subscription plan</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 10 }}>
              {PLANS.map(p => (
                <button key={p.id} onClick={() => pickPlan(p.id)} style={{ textAlign: 'left', padding: 14, border: `2px solid ${a.plan === p.id ? INK : '#e6e9f0'}`, borderRadius: 14, background: a.plan === p.id ? '#f7f8f9' : '#fff', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: INK }}>{p.name}</span>
                    {a.plan === p.id && <CheckCircle2 size={15} color={INK} />}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>${p.price}<span style={{ fontSize: 11, color: FAINT, fontWeight: 600 }}>/mo</span></div>
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {p.features.slice(0, 3).map(f => <span key={f} style={{ fontSize: 10.5, color: MUTED, display: 'flex', alignItems: 'center', gap: 4 }}><Zap size={9} color={p.color} />{f}</span>)}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 14 }}>
            <div><label style={lbl}>Charged price ($/mo)</label><input style={inp} type="number" value={a.price} onChange={e => set({ price: Number(e.target.value) })} /></div>
            <div>
              <label style={lbl}>Status</label>
              <select style={{ ...inp, cursor: 'pointer' }} value={a.status} onChange={e => set({ status: e.target.value as AccountStatus })}>
                <option value="trial">Trial</option><option value="active">Active</option><option value="paused">Paused</option><option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Accent color</label>
              <div style={{ display: 'flex', gap: 5, paddingTop: 4, flexWrap: 'wrap' }}>
                {COLORS.map(c => <button key={c} onClick={() => set({ color: c })} style={{ width: 22, height: 22, borderRadius: 999, background: c, border: a.color === c ? '2px solid #17191c' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />)}
              </div>
            </div>
          </div>

          {/* White-label branding */}
          <div style={{ borderTop: '1px solid #f2f3f5', paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}><Palette size={14} color={INK} /><span style={{ fontSize: 13, fontWeight: 700, color: INK }}>White-label branding</span><span style={{ fontSize: 11, color: MUTED }}>— what this client sees</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div><label style={lbl}>App name</label><input style={inp} value={a.branding?.appName ?? ''} onChange={e => setBrand({ appName: e.target.value })} placeholder="crmpro (default)" /></div>
              <div><label style={lbl}>Logo image URL</label><input style={inp} value={a.branding?.logoUrl ?? ''} onChange={e => setBrand({ logoUrl: e.target.value })} placeholder="https://…/logo.png" /></div>
              <div style={{ gridColumn: '1 / 3' }}><label style={lbl}>Login headline</label><input style={inp} value={a.branding?.loginHeadline ?? ''} onChange={e => setBrand({ loginHeadline: e.target.value })} placeholder="Sign in to your workspace" /></div>
            </div>
          </div>

          {/* Client login */}
          <div style={{ borderTop: '1px solid #f2f3f5', paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}><KeyRound size={14} color={INK} /><span style={{ fontSize: 13, fontWeight: 700, color: INK }}>Client login</span><span style={{ fontSize: 11, color: MUTED }}>— locked to this workspace</span></div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}><label style={lbl}>Login email</label><input style={{ ...inp, background: '#f7f8f9' }} value={a.contactEmail} readOnly placeholder="set the contact email above" /></div>
              <div style={{ flex: 1 }}><label style={lbl}>Set password</label><input style={inp} type="text" value={loginPw} onChange={e => setLoginPw(e.target.value)} placeholder="6+ characters" /></div>
              <button onClick={provision} style={{ padding: '9px 16px', background: INK, color: '#fff', border: 'none', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Create login</button>
            </div>
            {loginMsg && <div style={{ fontSize: 12, color: loginMsg.startsWith('✓') ? '#3f9142' : '#e5484d', fontWeight: 600, marginTop: 8 }}>{loginMsg}</div>}
          </div>
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e9edf3', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '9px 16px', border: '1px solid #e6e9f0', borderRadius: 10, background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => onSave(a)} disabled={!canSave} style={{ padding: '9px 20px', border: 'none', borderRadius: 10, background: canSave ? INK : '#c7cbd1', color: '#fff', fontSize: 13, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed' }}>{creating ? 'Create Sub-Account' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function AgencyModal({ agency, onSave, onClose }: { agency: { name: string; ownerEmail: string }; onSave: (a: { name: string; ownerEmail: string }) => void; onClose: () => void }) {
  const [a, setA] = useState(agency);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 420, boxShadow: '0 24px 48px -12px rgba(16,24,40,0.28)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e9edf3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: INK, margin: 0 }}>Agency settings</h2>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 9, padding: 7, cursor: 'pointer', display: 'flex' }}><X size={16} color="#64748b" /></button>
        </div>
        <div style={{ padding: '20px 24px', display: 'grid', gap: 14 }}>
          <div><label style={lbl}>Agency name</label><input style={inp} value={a.name} onChange={e => setA({ ...a, name: e.target.value })} placeholder="My Agency" /></div>
          <div><label style={lbl}>Owner email</label><input style={inp} value={a.ownerEmail} onChange={e => setA({ ...a, ownerEmail: e.target.value })} placeholder="you@agency.com" /></div>
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e9edf3', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '9px 16px', border: '1px solid #e6e9f0', borderRadius: 10, background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => onSave(a)} style={{ padding: '9px 20px', border: 'none', borderRadius: 10, background: INK, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

/* ── Stripe billing modal ── */
function BillingModal({ account, onClose }: { account?: SubAccount; onClose: () => void }) {
  const [cfg, setCfg] = useState<StripeConfig>(loadStripeConfig);
  const [savedMsg, setSavedMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState(account ? billingFor(account.id).checkoutUrl ?? '' : '');
  const [err, setErr] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [srvBusy, setSrvBusy] = useState(false);
  const [srvMsg, setSrvMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [srvEnabled, setSrvEnabled] = useState(false);

  useEffect(() => { serverBillingEnabled().then(setSrvEnabled); }, []);

  const saveKeys = () => { saveStripeConfig(cfg); setCfg(loadStripeConfig()); setSavedMsg('Stripe keys saved'); setTimeout(() => setSavedMsg(''), 2500); };

  const saveToServer = async () => {
    const token = getSession()?.token;
    if (!token) { setSrvMsg({ ok: false, text: 'Sign in again to continue.' }); return; }
    if (!cfg.secretKey) { setSrvMsg({ ok: false, text: 'Enter your Stripe secret key first.' }); return; }
    setSrvBusy(true); setSrvMsg(null);
    const res = await saveStripeSecretToServer(token, cfg.secretKey, webhookSecret || undefined);
    setSrvBusy(false);
    if (res.ok) { setSrvEnabled(true); setSrvMsg({ ok: true, text: 'Saved — clients can now subscribe & manage billing themselves.' }); }
    else setSrvMsg({ ok: false, text: res.error || 'Could not save to server.' });
  };

  const subscribe = async () => {
    if (!account) return;
    setBusy(true); setErr(''); setCheckoutUrl('');
    const res = await createCheckout({ accountId: account.id, productName: `${planById(account.plan).name} — ${account.name}`, amount: account.price, customerEmail: account.contactEmail });
    setBusy(false);
    if (res.ok && res.url) setCheckoutUrl(res.url);
    else setErr(res.error || 'Could not create checkout.');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 48px -12px rgba(16,24,40,0.28)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e9edf3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#635bff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CreditCard size={17} color="#fff" /></div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: INK, margin: 0 }}>Stripe Billing</h2>
              <p style={{ fontSize: 12, color: MUTED, margin: '1px 0 0' }}>{account ? `Subscribe ${account.name}` : 'Connect your Stripe account'}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 9, padding: 7, cursor: 'pointer', display: 'flex' }}><X size={16} color="#64748b" /></button>
        </div>

        <div style={{ padding: '20px 24px', display: 'grid', gap: 16 }}>
          {/* Stripe keys */}
          <div style={{ border: '1px solid #e6e9f0', borderRadius: 14, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>Stripe API keys</span>
              {cfg.connected && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#e9f4e6', color: '#3f9142' }}>CONNECTED</span>}
            </div>
            <p style={{ fontSize: 11.5, color: MUTED, margin: '0 0 12px', lineHeight: 1.5 }}>From your Stripe dashboard → Developers → API keys. Keys stay in your browser and are only sent to your own server.</p>
            <div style={{ display: 'grid', gap: 10 }}>
              <div><label style={lbl}>Secret key (sk_…)</label><input style={inp} type="password" value={cfg.secretKey} onChange={e => setCfg({ ...cfg, secretKey: e.target.value })} placeholder="sk_live_… or sk_test_…" /></div>
              <div><label style={lbl}>Publishable key (pk_…) — optional</label><input style={inp} value={cfg.publishableKey} onChange={e => setCfg({ ...cfg, publishableKey: e.target.value })} placeholder="pk_live_…" /></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <button onClick={saveKeys} style={{ padding: '8px 16px', background: INK, color: '#fff', border: 'none', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Save keys</button>
              {savedMsg && <span style={{ fontSize: 12, color: '#3f9142', fontWeight: 600 }}>{savedMsg}</span>}
            </div>
          </div>

          {/* Webhook for auto-updating status */}
          <div style={{ border: '1px solid #e6e9f0', borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 4 }}>Auto-update status (webhook)</div>
            <p style={{ fontSize: 11.5, color: MUTED, margin: '0 0 10px', lineHeight: 1.5 }}>In Stripe → Developers → Webhooks, add this endpoint so paid / past-due / cancelled updates apply automatically:</p>
            <div style={{ display: 'flex', gap: 6 }}>
              <input readOnly value={`${window.location.origin}${import.meta.env.BASE_URL || '/'}api/stripe-webhook.php`} style={{ ...inp, fontSize: 12, background: '#f7f8f9' }} onFocus={e => e.currentTarget.select()} />
              <button onClick={e => { navigator.clipboard?.writeText(`${window.location.origin}${import.meta.env.BASE_URL || '/'}api/stripe-webhook.php`); (e.currentTarget as HTMLButtonElement).textContent = 'Copied'; }} style={{ padding: '0 14px', border: '1px solid #e6e9f0', borderRadius: 9, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: INK }}>Copy</button>
            </div>
            <p style={{ fontSize: 11, color: FAINT, margin: '8px 0 0', lineHeight: 1.5 }}>Then paste the webhook signing secret into <code style={{ fontFamily: 'monospace' }}>api/config.php</code> as <code style={{ fontFamily: 'monospace' }}>'stripe_webhook_secret'</code> — or use the box below. Statuses refresh on your next login/sync.</p>
          </div>

          {/* Client self-service — store secret server-side */}
          <div style={{ border: '1px solid #e6e9f0', borderRadius: 14, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>Client self-service billing</span>
              {srvEnabled && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#e9f4e6', color: '#3f9142' }}>ENABLED</span>}
            </div>
            <p style={{ fontSize: 11.5, color: MUTED, margin: '0 0 12px', lineHeight: 1.5 }}>Store your secret key securely on the server (in <code style={{ fontFamily: 'monospace' }}>config.php</code>, never exposed) so clients can subscribe and manage their own card from their <strong style={{ color: INK }}>Billing</strong> page. Requires the Cloud Database.</p>
            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Webhook signing secret (whsec_…) — optional</label>
              <input style={inp} type="password" value={webhookSecret} onChange={e => setWebhookSecret(e.target.value)} placeholder="whsec_…" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={saveToServer} disabled={srvBusy || !cfg.secretKey} style={{ padding: '8px 16px', background: cfg.secretKey ? '#635bff' : '#c7cbd1', color: '#fff', border: 'none', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: cfg.secretKey ? 'pointer' : 'not-allowed' }}>{srvBusy ? 'Saving…' : 'Save secret to server'}</button>
              {srvMsg && <span style={{ fontSize: 12, color: srvMsg.ok ? '#3f9142' : '#e5484d', fontWeight: 600 }}>{srvMsg.text}</span>}
            </div>
          </div>

          {/* Per-account subscription */}
          {account && (
            <div style={{ border: '1px solid #e6e9f0', borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 4 }}>Subscription for {account.name}</div>
              <p style={{ fontSize: 12, color: MUTED, margin: '0 0 12px' }}>{planById(account.plan).name} plan · <strong style={{ color: INK }}>${account.price}/mo</strong> · billed to {account.contactEmail || '(no email)'}</p>

              <button onClick={subscribe} disabled={busy || !cfg.secretKey || !account.contactEmail} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', padding: '11px', background: (cfg.secretKey && account.contactEmail) ? '#635bff' : '#c7cbd1', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: (cfg.secretKey && account.contactEmail) ? 'pointer' : 'not-allowed' }}>
                <CreditCard size={15} /> {busy ? 'Creating checkout…' : 'Create Stripe Checkout link'}
              </button>
              {!cfg.secretKey && <p style={{ fontSize: 11.5, color: '#c77414', margin: '8px 0 0' }}>Add your Stripe secret key above first.</p>}
              {!account.contactEmail && <p style={{ fontSize: 11.5, color: '#c77414', margin: '8px 0 0' }}>This client needs a contact email (set it in Edit).</p>}
              {err && <p style={{ fontSize: 12, color: '#e5484d', margin: '8px 0 0', fontWeight: 600 }}>{err}</p>}

              {checkoutUrl && (
                <div style={{ marginTop: 12, padding: '10px 12px', background: '#f7f8f9', borderRadius: 10 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: INK, marginBottom: 6 }}>Checkout link ready — send it to your client:</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input readOnly value={checkoutUrl} style={{ ...inp, fontSize: 12, background: '#fff' }} onFocus={e => e.currentTarget.select()} />
                    <button onClick={() => navigator.clipboard?.writeText(checkoutUrl)} title="Copy" style={{ padding: '0 12px', border: '1px solid #e6e9f0', borderRadius: 9, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Copy size={14} color={INK} /></button>
                    <a href={checkoutUrl} target="_blank" rel="noreferrer" title="Open" style={{ padding: '0 12px', border: '1px solid #e6e9f0', borderRadius: 9, background: '#fff', display: 'flex', alignItems: 'center' }}><ExternalLink size={14} color={INK} /></a>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button onClick={() => { updateBilling(account.id, { status: 'active' }); onClose(); }} style={{ flex: 1, padding: '7px', border: 'none', borderRadius: 8, background: '#e9f4e6', color: '#3f9142', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Mark as paid</button>
                    <button onClick={() => { updateBilling(account.id, { status: 'checkout_sent' }); onClose(); }} style={{ flex: 1, padding: '7px', border: '1px solid #e6e9f0', borderRadius: 8, background: '#fff', color: '#5c6066', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Mark as sent</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Cloud database status ── */
function CloudModal({ current, onDone, onClose }: { current: 'cloud' | 'local'; onDone: (s: 'cloud' | 'local') => void; onClose: () => void }) {
  const [form, setForm] = useState({ host: 'localhost', db: '', user: '', pass: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [configured, setConfigured] = useState(current === 'cloud');

  const install = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`${API_BASE}/api/install.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, token: getSession()?.token }) });
      const data = await r.json() as { success: boolean; error?: string };
      if (data.success) {
        setMsg({ ok: true, text: 'Connected! Cloud database is set up. Reloading to sync…' });
        setConfigured(true); onDone('cloud');
        setTimeout(() => window.location.reload(), 1400);
      } else setMsg({ ok: false, text: data.error || 'Install failed.' });
    } catch {
      setMsg({ ok: false, text: 'Could not reach install.php. Make sure the app is deployed to your host (this won\'t work in local preview).' });
    } finally { setBusy(false); }
  };

  const check = async () => {
    setBusy(true); const ok = await isConfigured(); setConfigured(ok); onDone(ok ? 'cloud' : 'local');
    setMsg({ ok, text: ok ? 'Cloud database is connected and syncing.' : 'Not connected yet — fill in your MySQL details below.' }); setBusy(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 48px -12px rgba(16,24,40,0.28)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e9edf3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Database size={17} color="#fff" /></div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: INK, margin: 0 }}>Cloud Database</h2>
              <p style={{ fontSize: 12, color: MUTED, margin: '1px 0 0' }}>Store data server-side so it follows every login.</p>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 9, padding: 7, cursor: 'pointer', display: 'flex' }}><X size={16} color="#64748b" /></button>
        </div>

        <div style={{ padding: '20px 24px', display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderRadius: 12, background: configured ? '#e9f4e6' : '#fdf5e7' }}>
            {configured ? <Cloud size={16} color="#3f9142" /> : <HardDrive size={16} color="#c77414" />}
            <span style={{ fontSize: 13, fontWeight: 700, color: configured ? '#3f9142' : '#c77414' }}>{configured ? 'Cloud sync is ON — data follows your logins.' : 'Local only — data lives in this browser.'}</span>
            <button onClick={check} disabled={busy} style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: INK, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Re-check</button>
          </div>

          {!configured && (
            <>
              <div style={{ fontSize: 12.5, color: '#5c6066', lineHeight: 1.6, background: '#f7f8f9', borderRadius: 12, padding: '12px 14px' }}>
                <strong style={{ color: INK }}>Nothing to set up:</strong> this deployment stores everything in Cloudflare D1, created and migrated with the app. Cloud sync is on for every workspace by default — there are no database details to enter.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={lbl}>MySQL host</label><input style={inp} value={form.host} onChange={e => setForm({ ...form, host: e.target.value })} placeholder="localhost" /></div>
                <div><label style={lbl}>Database name</label><input style={inp} value={form.db} onChange={e => setForm({ ...form, db: e.target.value })} placeholder="user_crm" /></div>
                <div><label style={lbl}>DB username</label><input style={inp} value={form.user} onChange={e => setForm({ ...form, user: e.target.value })} placeholder="user_crmuser" /></div>
                <div><label style={lbl}>DB password</label><input style={inp} type="password" value={form.pass} onChange={e => setForm({ ...form, pass: e.target.value })} placeholder="••••••••" /></div>
              </div>
            </>
          )}

          {msg && <div style={{ fontSize: 12.5, fontWeight: 600, color: msg.ok ? '#3f9142' : '#e5484d' }}>{msg.text}</div>}
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid #e9edf3', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '9px 16px', border: '1px solid #e6e9f0', borderRadius: 10, background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
          {!configured && <button onClick={install} disabled={busy || !form.db || !form.user} style={{ padding: '9px 20px', border: 'none', borderRadius: 10, background: (form.db && form.user) ? INK : '#c7cbd1', color: '#fff', fontSize: 13, fontWeight: 700, cursor: (form.db && form.user) ? 'pointer' : 'not-allowed' }}>{busy ? 'Connecting…' : 'Connect & install'}</button>}
        </div>
      </div>
    </div>
  );
}
