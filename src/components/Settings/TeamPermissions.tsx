/**
 * TeamPermissions.tsx — team members, their roles, and an honest read on
 * whether the permission rules are actually enforced.
 *
 * The rules themselves live in two places that must agree:
 *   src/services/contactPermissions.ts   what the UI offers
 *   public/api/_perm.php                 what the server accepts
 * This screen shows the matrix the server returned, so what you read here is
 * what the database will actually do — not a local guess.
 */
import { useEffect, useState } from 'react';
import {
  ShieldCheck, ShieldAlert, UserPlus, Trash2, KeyRound, RefreshCw,
  Check, X, Users,
} from 'lucide-react';
import { listUsers, createUser, deleteUser, setUserPassword, getSession, type AuthUser } from '../../services/auth';
import { fetchCapabilities, cachedCapabilities, cloudStatus, type ServerCapabilities } from '../../services/serverData';
import { useApp } from '../../context/AppContext';
import { loadSubAccounts } from '../../services/tenancy';

const INK = '#17191c';

const CAP_LABELS: Record<string, string> = {
  view: 'View contacts',
  edit: 'Edit contacts',
  delete: 'Delete contacts',
  export: 'Export to CSV',
  reassign: 'Change who owns a contact',
  merge: 'Merge duplicates',
  bulk_edit: 'Bulk actions',
  manage_lists: 'Create and edit lists',
};

export default function TeamPermissions() {
  const { addNotification } = useApp();
  const subaccounts = loadSubAccounts();
  const session = getSession();
  const isAgency = session?.user.role === 'agency';

  const [users, setUsers] = useState<AuthUser[]>([]);
  const [caps, setCaps] = useState<ServerCapabilities | null>(cachedCapabilities());
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'client' as 'agency' | 'client', accountId: '' });
  const [err, setErr] = useState('');

  const refresh = async () => {
    setLoading(true);
    const [list, matrix] = await Promise.all([listUsers(), fetchCapabilities()]);
    setUsers(list);
    if (matrix) setCaps(matrix);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const enforced = cloudStatus() === 'cloud' && !!caps?.enforced;

  const card: React.CSSProperties = { background: '#fff', borderRadius: 18, border: '1px solid #e6e9f0', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', padding: 20, marginBottom: 18 };
  const inp: React.CSSProperties = { padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };

  return (
    <div>
      {/* Enforcement status */}
      <div style={{ ...card, borderColor: enforced ? '#bbf7d0' : '#fde68a', background: enforced ? '#f0fdf4' : '#fffbeb' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {enforced ? <ShieldCheck size={20} color="#16a34a" style={{ flexShrink: 0, marginTop: 1 }} />
                    : <ShieldAlert size={20} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: enforced ? '#166534' : '#92400e' }}>
              {enforced ? 'Permissions are enforced on the server' : 'Permissions are not enforced yet'}
            </div>
            <p style={{ margin: '5px 0 0', fontSize: 12.5, color: enforced ? '#166534' : '#92400e', lineHeight: 1.55 }}>
              {enforced
                ? 'Every write goes through api/data.php, which checks role and ownership in api/_perm.php before touching the database. A user who edits the interface in devtools still cannot change records they do not own — the server refuses the write and this browser is resynced from the server’s copy.'
                : 'This workspace is running local-only, so the rules below shape the interface but nothing checks them. Connect the cloud database in Agency → Cloud Database to turn on real enforcement.'}
            </p>
          </div>
        </div>
      </div>

      {/* Capability matrix */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: INK }}>What your role can do</h3>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
              {caps ? `Reported by the server for ${caps.email || 'this session'} (${caps.role})`
                    : 'The server has not answered — showing nothing rather than guessing.'}
            </p>
          </div>
          <button onClick={() => void refresh()} title="Re-read the permission matrix from the server" disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 13px', border: '1px solid #e2e8f0', borderRadius: 9, background: '#fff', color: '#475569', fontSize: 12.5, fontWeight: 600, cursor: loading ? 'wait' : 'pointer' }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {caps ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
            {Object.entries(caps.capabilities).map(([cap, allowed]) => (
              <div key={cap} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', border: '1px solid #eef0f3', borderRadius: 10, background: '#f8fafc' }}>
                {allowed
                  ? <Check size={14} color="#16a34a" style={{ flexShrink: 0 }} />
                  : <X size={14} color="#dc2626" style={{ flexShrink: 0 }} />}
                <span style={{ fontSize: 12.5, color: allowed ? INK : '#94a3b8', fontWeight: allowed ? 600 : 500 }}>
                  {CAP_LABELS[cap] ?? cap}
                </span>
                {allowed && caps.ownerOnly.includes(cap) && caps.role !== 'agency' && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: '#4f46e5', background: '#eef2ff', padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                    own records
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 12.5, color: '#94a3b8' }}>
            Connect the cloud database to see the enforced matrix.
          </p>
        )}
      </div>

      {/* Team */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 7 }}>
              <Users size={15} /> Team members
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
              Agency users work across every workspace. Client users are bound to one and can only change contacts they own.
            </p>
          </div>
          {isAgency && (
            <button onClick={() => { setAdding(a => !a); setErr(''); }} title="Add a team member"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 15px', border: 'none', borderRadius: 9, background: INK, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              <UserPlus size={13} /> Add member
            </button>
          )}
        </div>

        {adding && isAgency && (
          <div style={{ border: '1px solid #e6e9f0', borderRadius: 12, padding: 14, marginBottom: 14, background: '#f8fafc' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
              <input value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setErr(''); }} placeholder="Full name" style={inp} />
              <input value={form.email} onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setErr(''); }} placeholder="Email" type="email" style={inp} />
              <input value={form.password} onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setErr(''); }} placeholder="Temporary password" type="text" style={inp} />
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as 'agency' | 'client' }))} title="Role" style={{ ...inp, cursor: 'pointer' }}>
                <option value="client">Client — one workspace, own records only</option>
                <option value="agency">Agency — full access to everything</option>
              </select>
              {form.role === 'client' && (
                <select value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))} title="Workspace" style={{ ...inp, cursor: 'pointer', gridColumn: '1 / -1' }}>
                  <option value="">Choose a workspace…</option>
                  {subaccounts.map(a => <option key={a.id} value={a.id}>{a.businessName || a.name}</option>)}
                </select>
              )}
            </div>
            {err && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 9 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => setAdding(false)} style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 9, background: '#fff', color: '#64748b', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button title="Create this team member"
                onClick={async () => {
                  if (!form.email.trim() || !form.password) { setErr('Email and a temporary password are required.'); return; }
                  if (form.password.length < 8) { setErr('Use at least 8 characters for the temporary password.'); return; }
                  if (form.role === 'client' && !form.accountId) { setErr('Pick the workspace this client belongs to.'); return; }
                  const res = await createUser({
                    email: form.email.trim(), password: form.password, name: form.name.trim() || form.email.trim(),
                    role: form.role, accountId: form.role === 'client' ? form.accountId : null,
                  });
                  if (!res.ok) { setErr(res.error || 'Could not create that user.'); return; }
                  addNotification(`${form.email.trim()} added as ${form.role}`);
                  setForm({ email: '', name: '', password: '', role: 'client', accountId: '' });
                  setAdding(false);
                  void refresh();
                }}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 9, background: INK, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                Create
              </button>
            </div>
          </div>
        )}

        {loading && <p style={{ margin: 0, fontSize: 12.5, color: '#94a3b8' }}>Loading team…</p>}

        {!loading && !users.length && (
          <p style={{ margin: 0, fontSize: 12.5, color: '#94a3b8' }}>
            No team members are stored on the server. {isAgency ? 'Add one above.' : 'Ask an agency user to add you.'}
          </p>
        )}

        {users.map(u => {
          const workspace = subaccounts.find(a => a.id === u.accountId);
          const isMe = u.email === session?.user.email;
          return (
            <div key={u.email} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: '1px solid #f1f5f9' }}>
              <div style={{ width: 34, height: 34, borderRadius: 999, background: u.role === 'agency' ? INK : '#e2e8f0', color: u.role === 'agency' ? '#fff' : '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                {(u.name || u.email).slice(0, 2).toUpperCase()}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>
                  {u.name || u.email}{isMe && <span style={{ marginLeft: 7, fontSize: 10.5, fontWeight: 700, color: '#4f46e5', background: '#eef2ff', padding: '2px 7px', borderRadius: 999 }}>you</span>}
                </div>
                <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
                  {u.email} · {u.role === 'agency' ? 'Agency — all workspaces' : `Client — ${workspace?.businessName || workspace?.name || u.accountId || 'no workspace'}`}
                </div>
              </div>
              {isAgency && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button title="Set a new password for this user"
                    onClick={async () => {
                      const pw = window.prompt(`New password for ${u.email} (at least 8 characters):`);
                      if (pw === null) return;
                      if (pw.length < 8) { addNotification('Password must be at least 8 characters.', 'error'); return; }
                      const res = await setUserPassword(u.email, pw);
                      addNotification(res.ok ? `Password updated for ${u.email}` : (res.error || 'Could not set the password.'), res.ok ? 'success' : 'error');
                    }}
                    style={{ padding: 7, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', display: 'flex', color: '#475569' }}>
                    <KeyRound size={13} />
                  </button>
                  <button title={isMe ? 'You cannot remove your own login' : `Remove ${u.email}`} disabled={isMe}
                    onClick={async () => {
                      if (!window.confirm(`Remove ${u.email}? They will not be able to sign in. Contacts they own are not deleted.`)) return;
                      const res = await deleteUser(u.email);
                      addNotification(res.ok ? `${u.email} removed` : (res.error || 'Could not remove that user.'), res.ok ? 'success' : 'error');
                      void refresh();
                    }}
                    style={{ padding: 7, border: `1px solid ${isMe ? '#e2e8f0' : '#fecaca'}`, borderRadius: 8, background: isMe ? '#fff' : '#fef2f2', cursor: isMe ? 'not-allowed' : 'pointer', display: 'flex', color: isMe ? '#cbd5e1' : '#dc2626' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
