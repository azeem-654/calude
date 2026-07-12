import { useState } from 'react';
import {
  Building2, Plus, Search, ArrowRight, MoreVertical, Users, TrendingUp,
  DollarSign, Pause, Play, Trash2, Edit2, X, CheckCircle2, Zap, Star,
  MessageSquare, LogIn, Rocket,
} from 'lucide-react';
import Header from '../Layout/Header';
import {
  loadSubAccounts, saveSubAccounts, createSubAccount, updateSubAccount, deleteSubAccount,
  switchAccount, accountUsage, loadAgency, saveAgency, blankSubAccount, planById, PLANS,
} from '../../services/tenancy';
import type { SubAccount, AccountStatus, PlanId } from '../../services/tenancy';

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

export default function AgencyDashboard() {
  const [accounts, setAccounts] = useState<SubAccount[]>(loadSubAccounts);
  const [agency, setAgencyState] = useState(loadAgency);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<SubAccount | undefined>();
  const [creating, setCreating] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editAgency, setEditAgency] = useState(false);

  const persist = (list: SubAccount[]) => { setAccounts(list); saveSubAccounts(list); };

  const clients = accounts.filter(a => a.status !== undefined);
  const mrr = clients.filter(a => a.status === 'active').reduce((s, a) => s + a.price, 0);
  const activeCount = clients.filter(a => a.status === 'active').length;
  const trialCount = clients.filter(a => a.status === 'trial').length;

  const filtered = clients.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.businessName.toLowerCase().includes(search.toLowerCase()),
  );

  const saveAccount = (a: SubAccount) => {
    const exists = accounts.some(x => x.id === a.id);
    if (exists) { updateSubAccount(a.id, a); setAccounts(loadSubAccounts()); }
    else { createSubAccount(a); setAccounts(loadSubAccounts()); }
    setEditing(undefined); setCreating(false);
  };
  const setStatus = (id: string, status: AccountStatus) => { updateSubAccount(id, { status }); setAccounts(loadSubAccounts()); setMenuFor(null); };
  const remove = (id: string) => { if (confirm('Delete this sub-account and ALL its data? This cannot be undone.')) { deleteSubAccount(id); setAccounts(loadSubAccounts()); setMenuFor(null); } };

  return (
    <div style={{ minHeight: '100vh' }} onClick={() => setMenuFor(null)}>
      <Header title="Agency" subtitle={`${agency.name} · ${activeCount} active client${activeCount === 1 ? '' : 's'}`} />

      <div style={{ padding: '14px 28px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
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
          <button onClick={() => setEditAgency(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: '1px solid #e6e9f0', borderRadius: 10, background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><Edit2 size={13} /> Agency settings</button>
          <button onClick={() => { setCreating(true); setEditing(blankSubAccount()); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: INK, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}><Plus size={15} /> New Sub-Account</button>
        </div>

        {/* Sub-account grid */}
        {filtered.length === 0 ? (
          <div style={{ ...FROST, textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ width: 60, height: 60, borderRadius: 18, background: INK, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><Building2 size={26} color="#fff" /></div>
            <div style={{ fontSize: 17, fontWeight: 800, color: INK, marginBottom: 6 }}>No sub-accounts yet</div>
            <p style={{ fontSize: 13, color: MUTED, margin: '0 0 18px' }}>Create a workspace for each client you sell a subscription to.</p>
            <button onClick={() => { setCreating(true); setEditing(blankSubAccount()); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 22px', background: INK, color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}><Plus size={16} /> Create your first client</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {filtered.map(a => {
              const u = accountUsage(a.id);
              const plan = planById(a.plan);
              const st = STATUS[a.status];
              return (
                <div key={a.id} style={{ ...CARD, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ height: 5, background: a.color }} />
                  <div style={{ padding: '16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 17, fontWeight: 800, flexShrink: 0 }}>{(a.businessName || a.name || '?')[0].toUpperCase()}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: INK, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                        <div style={{ fontSize: 12, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.businessName || a.industry || '—'}</div>
                      </div>
                      <div style={{ position: 'relative' }}>
                        <button onClick={e => { e.stopPropagation(); setMenuFor(menuFor === a.id ? null : a.id); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: FAINT, display: 'flex' }}><MoreVertical size={16} /></button>
                        {menuFor === a.id && (
                          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 28, right: 0, zIndex: 50, background: '#fff', borderRadius: 12, boxShadow: '0 12px 32px rgba(16,24,40,0.16)', minWidth: 170, overflow: 'hidden', padding: 4 }}>
                            <MenuItem icon={Edit2} label="Edit" onClick={() => { setEditing(a); setMenuFor(null); }} />
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '12px 0' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: st.bg, color: st.color }}>{st.label}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: '#f3f4f6', color: INK }}>{plan.name}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 800, color: INK }}>${a.price}<span style={{ fontSize: 11, color: FAINT, fontWeight: 600 }}>/mo</span></span>
                    </div>

                    {/* usage */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, padding: '10px 0', borderTop: '1px solid #f2f3f5', borderBottom: '1px solid #f2f3f5', marginBottom: 12 }}>
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
  const canSave = a.name.trim() && a.contactEmail.trim();

  const pickPlan = (id: PlanId) => set({ plan: id, price: planById(id).price });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 640, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px -12px rgba(16,24,40,0.28)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e9edf3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: INK, margin: 0 }}>{creating ? 'New Sub-Account' : 'Edit Sub-Account'}</h2>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 9, padding: 7, cursor: 'pointer', display: 'flex' }}><X size={16} color="#64748b" /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div><label style={lbl}>Workspace name *</label><input style={inp} value={a.name} onChange={e => set({ name: e.target.value })} placeholder="Acme — Main Location" /></div>
            <div><label style={lbl}>Business name</label><input style={inp} value={a.businessName} onChange={e => set({ businessName: e.target.value })} placeholder="Acme Inc." /></div>
            <div><label style={lbl}>Contact name</label><input style={inp} value={a.contactName} onChange={e => set({ contactName: e.target.value })} placeholder="Jane Smith" /></div>
            <div><label style={lbl}>Contact email *</label><input style={inp} value={a.contactEmail} onChange={e => set({ contactEmail: e.target.value })} placeholder="jane@acme.com" /></div>
            <div><label style={lbl}>Phone</label><input style={inp} value={a.phone} onChange={e => set({ phone: e.target.value })} placeholder="+1 …" /></div>
            <div><label style={lbl}>Industry</label><input style={inp} value={a.industry} onChange={e => set({ industry: e.target.value })} placeholder="Dental · Real estate · Gym…" /></div>
          </div>

          <div>
            <label style={lbl}>Subscription plan</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
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
