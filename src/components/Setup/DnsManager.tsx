/**
 * DNS, without leaving.
 *
 * ── Why the whole zone is edited and saved at once ──
 *
 * The server replaces the record set rather than patching it, so this screen
 * holds a draft and sends all of it. That also makes the dangerous operation
 * visible: deleting a row does not delete anything until Save, which is the
 * difference between "I clicked the wrong bin icon" and "our mail stopped".
 *
 * ── The guard rails that are actually here ──
 *
 * A zone is one MX record away from a business losing every email it is sent,
 * and the people using this screen are not network engineers. So: a warning
 * when an edit would leave no MX, a confirmation before saving a zone with
 * fewer records than it started with, and the priority field only where it
 * means something. What there is *not* is a validator pretending to know
 * whether a value is correct — the resolver decides that, and a green tick from
 * us would be a guess.
 */
import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Loader, AlertCircle, RotateCcw, Globe } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { listDns, listOwnedDomains, saveDns, type DnsRecord, type OwnedDomain } from '../../services/digitalSetup';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';

const TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'] as const;
/** The two that carry a priority. Shown for these and blank for the rest, so
 *  nobody types a number into a field their record type ignores. */
const HAS_PRIO = new Set(['MX', 'SRV']);

const cell: React.CSSProperties = {
  padding: '8px 9px', border: `1px solid ${LINE}`, borderRadius: 8,
  fontSize: 12.5, color: INK, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
};

export default function DnsManager() {
  const { addNotification } = useApp();
  const [domains, setDomains] = useState<OwnedDomain[]>([]);
  const [domain, setDomain] = useState('');
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [original, setOriginal] = useState<DnsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void (async () => {
      const list = await listOwnedDomains();
      if (!live) return;
      setDomains(list);
      setDomain(prev => prev || list[0]?.domain || '');
      setLoading(false);
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!domain) { setRecords([]); setOriginal([]); return; }
    let live = true;
    setLoading(true);
    void (async () => {
      const r = await listDns(domain);
      if (!live) return;
      setLoading(false);
      setError(r.error);
      setRecords(r.records);
      setOriginal(r.records);
    })();
    return () => { live = false; };
  }, [domain]);

  const patch = (i: number, next: Partial<DnsRecord>) => {
    setRecords(prev => prev.map((r, j) => j === i ? { ...r, ...next } : r));
  };

  const add = () => setRecords(prev => [...prev, { name: '', type: 'A', value: '', ttl: 3600 }]);
  const remove = (i: number) => setRecords(prev => prev.filter((_, j) => j !== i));

  const dirty = JSON.stringify(records) !== JSON.stringify(original);
  const losesMx = original.some(r => r.type === 'MX') && !records.some(r => r.type === 'MX');

  const save = async () => {
    /*
     * Two confirmations, and only for the two things that are actually
     * irreversible in effect. A dialog on every save trains people to dismiss
     * dialogs, which is worse than having none.
     */
    if (losesMx && !window.confirm(`${domain} will have no MX record, so it will stop receiving email. Save anyway?`)) return;
    if (records.length < original.length - 2
      && !window.confirm(`This removes ${original.length - records.length} records from ${domain}. Save anyway?`)) return;

    setSaving(true);
    const r = await saveDns(domain, records);
    setSaving(false);
    if (r.error) { setError(r.error); addNotification(r.error, 'error'); return; }
    setError('');
    setRecords(r.records);
    setOriginal(r.records);
    addNotification(`DNS for ${domain} saved. Changes can take a few minutes to spread.`, 'success');
  };

  if (loading && !domains.length) {
    return <p style={{ fontSize: 13, color: MUTED, padding: '20px 0' }}>Loading your domains…</p>;
  }

  if (!domains.length) {
    return (
      <div style={{ border: `1px dashed ${LINE}`, borderRadius: 16, padding: '30px 22px', textAlign: 'center' }}>
        <Globe size={20} color={MUTED} />
        <p style={{ margin: '8px 0 0', fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
          No domains in this workspace yet. Start a project and add a domain to it, and its records
          will be managed here.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Domain</label>
        <select value={domain} onChange={e => setDomain(e.target.value)}
          style={{ ...cell, width: 'auto', minWidth: 200, cursor: 'pointer' }}>
          {domains.map(d => <option key={d.domain} value={d.domain}>{d.domain}</option>)}
        </select>
        {dirty && (
          <button onClick={() => setRecords(original)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px',
            border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff',
            color: MUTED, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <RotateCcw size={12} /> Undo changes
          </button>
        )}
      </div>

      {error && <p style={{ margin: 0, fontSize: 12.5, color: '#b42318' }}>{error}</p>}

      {losesMx && (
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 11, background: '#fdf3f3', border: '1px solid #fecaca' }}>
          <AlertCircle size={15} color="#b42318" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 11.5, color: '#991b1b', lineHeight: 1.6 }}>
            There is no MX record left. Save this and {domain} will stop receiving email.
          </p>
        </div>
      )}

      {/* Its own scroller, because a zone with long TXT values is wider than a
          phone and the page itself must never scroll sideways. */}
      <div style={{ overflowX: 'auto', border: `1px solid ${LINE}`, borderRadius: 12, background: '#fff' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 620 }}>
          <thead>
            <tr style={{ background: '#fafbfc' }}>
              {['Name', 'Type', 'Value', 'TTL', 'Priority', ''].map(h => (
                <th key={h} style={{
                  textAlign: 'left', padding: '9px 10px', fontSize: 11, fontWeight: 700,
                  color: '#475569', borderBottom: `1px solid ${LINE}`, whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={i}>
                <td style={{ padding: 6, borderBottom: `1px solid ${LINE}`, minWidth: 110 }}>
                  <input value={r.name} placeholder="@" onChange={e => patch(i, { name: e.target.value })} style={cell} />
                </td>
                <td style={{ padding: 6, borderBottom: `1px solid ${LINE}` }}>
                  <select value={r.type} onChange={e => patch(i, { type: e.target.value })} style={{ ...cell, cursor: 'pointer' }}>
                    {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td style={{ padding: 6, borderBottom: `1px solid ${LINE}`, minWidth: 220 }}>
                  <input value={r.value} onChange={e => patch(i, { value: e.target.value })} style={cell} />
                </td>
                <td style={{ padding: 6, borderBottom: `1px solid ${LINE}`, width: 90 }}>
                  <input value={String(r.ttl)} inputMode="numeric"
                    onChange={e => patch(i, { ttl: Number(e.target.value.replace(/[^\d]/g, '')) || 3600 })} style={cell} />
                </td>
                <td style={{ padding: 6, borderBottom: `1px solid ${LINE}`, width: 90 }}>
                  {HAS_PRIO.has(r.type) ? (
                    <input value={String(r.prio ?? 10)} inputMode="numeric"
                      onChange={e => patch(i, { prio: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })} style={cell} />
                  ) : (
                    <span style={{ fontSize: 12, color: '#c7c9d3' }}>—</span>
                  )}
                </td>
                <td style={{ padding: 6, borderBottom: `1px solid ${LINE}`, width: 40 }}>
                  <button onClick={() => remove(i)} aria-label={`Delete ${r.type} record`} style={{
                    border: 'none', background: 'none', color: '#b42318', cursor: 'pointer', padding: 4, display: 'flex',
                  }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {!records.length && (
              <tr><td colSpan={6} style={{ padding: '18px 12px', fontSize: 12.5, color: MUTED, textAlign: 'center' }}>
                This zone has no records.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={add} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px',
          border: `1px solid ${LINE}`, borderRadius: 9, background: '#fff',
          color: INK, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <Plus size={13} /> Add a record
        </button>
        <button onClick={() => void save()} disabled={saving || !dirty} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px',
          border: 'none', borderRadius: 9, background: saving || !dirty ? '#c7c9d3' : INK,
          color: '#fff', fontSize: 12.5, fontWeight: 700,
          cursor: saving || !dirty ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
        }}>
          {saving ? <Loader size={13} className="spin" /> : <Save size={13} />} Save changes
        </button>
        {!dirty && <span style={{ fontSize: 11.5, color: MUTED, alignSelf: 'center' }}>Nothing to save</span>}
      </div>

      <p style={{ margin: 0, fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
        Leave <strong>Name</strong> empty for the domain itself. Changes are live within a few minutes,
        though some networks cache the old answer for as long as the TTL.
      </p>
    </div>
  );
}
