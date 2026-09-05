import { useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import {
  X, Building2, Mail, Zap, Plus, Trash2, ToggleLeft, ToggleRight,
  ChevronRight, Server, Sparkles,
} from 'lucide-react';
import type { Mailbox, AutoReplyRule } from '../../services/mailboxService';
import { blankMailbox, blankRule } from '../../services/mailboxService';

const INK = '#17191c';
const MUTED = '#8a8f98';
const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #e6e9f0', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', backgroundColor: '#fff' };
const label: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 600, color: '#475569', marginBottom: 5 };
const COLORS = ['#3e63dd', '#e5484d', '#3f9142', '#f59e0b', '#8b5cf6', '#0d9488', '#ec4899', '#17191c'];

type Tab = 'company' | 'connection' | 'autoreply';

export default function MailboxSetup({ initial, onSave, onClose }: {
  initial?: Mailbox;
  onSave: (mb: Mailbox) => void;
  onClose: () => void;
}) {
  useEscapeKey(true, onClose);
  const [mb, setMb] = useState<Mailbox>(initial ?? blankMailbox());
  const [tab, setTab] = useState<Tab>('company');

  const set = (patch: Partial<Mailbox>) => setMb(prev => ({ ...prev, ...patch }));
  const setProfile = (patch: Partial<Mailbox['profile']>) => setMb(prev => ({ ...prev, profile: { ...prev.profile, ...patch } }));

  const addRule = () => set({ autoReplyRules: [...mb.autoReplyRules, blankRule()] });
  const updateRule = (id: string, patch: Partial<AutoReplyRule>) =>
    set({ autoReplyRules: mb.autoReplyRules.map(r => r.id === id ? { ...r, ...patch } : r) });
  const removeRule = (id: string) => set({ autoReplyRules: mb.autoReplyRules.filter(r => r.id !== id) });

  const canSave = mb.label.trim() && mb.address.trim();
  const save = () => {
    // default SMTP creds to IMAP creds if left blank
    const finalized: Mailbox = {
      ...mb,
      fromName: mb.fromName || mb.profile.companyName || mb.label,
      smtpHost: mb.smtpHost || mb.imapHost,
      smtpUser: mb.smtpUser || mb.imapUser,
      smtpPassword: mb.smtpPassword || mb.imapPassword,
    };
    onSave(finalized);
  };

  const TABS: { id: Tab; label: string; icon: typeof Mail }[] = [
    { id: 'company', label: 'Company Profile', icon: Building2 },
    { id: 'connection', label: 'Mailbox Connection', icon: Server },
    { id: 'autoreply', label: 'Auto-Reply', icon: Zap },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 680, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px -12px rgba(16,24,40,0.28)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: mb.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Mail size={19} color="#fff" />
              </div>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-0.02em' }}>{initial ? 'Edit Mailbox' : 'Connect a Mailbox'}</h2>
                <p style={{ fontSize: 12.5, color: MUTED, margin: '2px 0 0' }}>Each mailbox has its own company profile and auto-reply rules.</p>
              </div>
            </div>
            <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 9, padding: 7, display: 'flex', cursor: 'pointer' }}><X size={16} color="#64748b" /></button>
          </div>
          <div style={{ display: 'flex', gap: 20, borderBottom: '1px solid #e9edf3' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} aria-pressed={tab === t.id}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 2px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: tab === t.id ? INK : MUTED, borderBottom: tab === t.id ? `2px solid ${INK}` : '2px solid transparent', marginBottom: -1 }}>
                <t.icon size={14} /> {t.label}
                {t.id === 'autoreply' && mb.autoReplyRules.length > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 800, background: '#eceef1', color: INK, borderRadius: 999, padding: '1px 7px' }}>{mb.autoReplyRules.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 24px' }}>
          {/* ── Company profile ── */}
          {tab === 'company' && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div><label style={label}>Mailbox label *</label><input style={inp} value={mb.label} onChange={e => set({ label: e.target.value })} placeholder="e.g. Support — Acme" /></div>
                <div><label style={label}>Mailbox address *</label><input style={inp} value={mb.address} onChange={e => set({ address: e.target.value })} placeholder="support@acme.com" /></div>
                <div><label style={label}>Company name</label><input style={inp} value={mb.profile.companyName} onChange={e => setProfile({ companyName: e.target.value })} placeholder="Acme Inc." /></div>
                <div><label style={label}>Industry</label><input style={inp} value={mb.profile.industry} onChange={e => setProfile({ industry: e.target.value })} placeholder="SaaS · E-commerce · Agency…" /></div>
              </div>
              <div><label style={label}>What the company does</label><textarea style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} rows={2} value={mb.profile.description} onChange={e => setProfile({ description: e.target.value })} placeholder="Acme builds project-management software for remote teams." /></div>
              <div><label style={label}>Products / services offered</label><textarea style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} rows={2} value={mb.profile.products} onChange={e => setProfile({ products: e.target.value })} placeholder="Starter ($12/mo), Pro ($29/mo), Enterprise (custom). Free 14-day trial." /></div>
              <div>
                <label style={label}>Knowledge base / FAQ / policies <span style={{ fontWeight: 400, color: MUTED }}>— the AI only answers from this</span></label>
                <textarea style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} rows={5} value={mb.profile.knowledge} onChange={e => setProfile({ knowledge: e.target.value })}
                  placeholder={'• Refund policy: full refund within 30 days.\n• Support hours: Mon–Fri 9–6 ET.\n• We integrate with Slack, Zapier, Google Calendar.\n• Annual plans get 20% off.'} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={label}>Reply tone</label>
                  <select style={{ ...inp, cursor: 'pointer' }} value={mb.profile.tone} onChange={e => setProfile({ tone: e.target.value as Mailbox['profile']['tone'] })}>
                    {['friendly', 'professional', 'formal', 'casual', 'enthusiastic'].map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div><label style={label}>Business hours</label><input style={inp} value={mb.profile.businessHours} onChange={e => setProfile({ businessHours: e.target.value })} placeholder="Mon–Fri, 9am–6pm ET" /></div>
                <div><label style={label}>Website</label><input style={inp} value={mb.profile.website} onChange={e => setProfile({ website: e.target.value })} placeholder="https://acme.com" /></div>
                <div>
                  <label style={label}>Accent color</label>
                  <div style={{ display: 'flex', gap: 6, paddingTop: 4 }}>
                    {COLORS.map(c => (
                      <button key={c} onClick={() => set({ color: c })} style={{ width: 24, height: 24, borderRadius: 999, background: c, border: mb.color === c ? '2px solid #17191c' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
                    ))}
                  </div>
                </div>
              </div>
              <div><label style={label}>Signature (appended to every reply)</label><textarea style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} rows={3} value={mb.profile.signature} onChange={e => setProfile({ signature: e.target.value })} placeholder={'Best regards,\nThe Acme Support Team\nacme.com'} /></div>
            </div>
          )}

          {/* ── Connection ── */}
          {tab === 'connection' && (
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ padding: '12px 14px', background: '#f7f8f9', border: '1px solid #e9edf3', borderRadius: 12, fontSize: 12, color: '#5c6066', lineHeight: 1.6 }}>
                <strong style={{ color: INK }}>Live inbox.</strong> Incoming mail is fetched over IMAP. Outgoing replies use SMTP (defaults to the same server/credentials if left blank). Credentials are stored in your browser only.
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                  <Mail size={14} color={INK} /><span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>Incoming — IMAP</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                  <div><label style={label}>IMAP host</label><input style={inp} value={mb.imapHost} onChange={e => set({ imapHost: e.target.value })} placeholder="imap.yourdomain.com" /></div>
                  <div><label style={label}>Port</label><input style={inp} type="number" value={mb.imapPort} onChange={e => set({ imapPort: Number(e.target.value) })} /></div>
                  <div>
                    <label style={label}>Security</label>
                    <select style={{ ...inp, cursor: 'pointer' }} value={mb.imapEncryption} onChange={e => set({ imapEncryption: e.target.value as Mailbox['imapEncryption'] })}>
                      <option value="ssl">SSL</option><option value="tls">TLS</option><option value="none">None</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / 3' }}><label style={label}>Username</label><input style={inp} value={mb.imapUser} onChange={e => set({ imapUser: e.target.value })} placeholder="support@acme.com" /></div>
                  <div><label style={label}>Password</label><input style={inp} type="password" value={mb.imapPassword} onChange={e => set({ imapPassword: e.target.value })} placeholder="••••••••" /></div>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                  <Server size={14} color={INK} /><span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>Outgoing — SMTP</span>
                  <span style={{ fontSize: 11, color: MUTED }}>(leave blank to reuse IMAP settings)</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                  <div><label style={label}>SMTP host</label><input style={inp} value={mb.smtpHost} onChange={e => set({ smtpHost: e.target.value })} placeholder="smtp.yourdomain.com" /></div>
                  <div><label style={label}>Port</label><input style={inp} type="number" value={mb.smtpPort} onChange={e => set({ smtpPort: Number(e.target.value) })} /></div>
                  <div>
                    <label style={label}>Security</label>
                    <select style={{ ...inp, cursor: 'pointer' }} value={mb.smtpEncryption} onChange={e => set({ smtpEncryption: e.target.value as Mailbox['smtpEncryption'] })}>
                      <option value="tls">TLS</option><option value="ssl">SSL</option><option value="none">None</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / 3' }}><label style={label}>Username</label><input style={inp} value={mb.smtpUser} onChange={e => set({ smtpUser: e.target.value })} placeholder="(same as IMAP)" /></div>
                  <div><label style={label}>Password</label><input style={inp} type="password" value={mb.smtpPassword} onChange={e => set({ smtpPassword: e.target.value })} placeholder="(same as IMAP)" /></div>
                </div>
              </div>
            </div>
          )}

          {/* ── Auto-reply ── */}
          {tab === 'autoreply' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: '#f7f8f9', border: '1px solid #e9edf3', borderRadius: 12, fontSize: 12, color: '#5c6066', lineHeight: 1.6, marginBottom: 14 }}>
                <Sparkles size={16} color={INK} style={{ flexShrink: 0 }} />
                <span>The AI drafts replies grounded in <strong style={{ color: INK }}>this mailbox's</strong> company profile. Choose whether each rule <strong>auto-sends</strong> or leaves a <strong>draft for approval</strong>.</span>
              </div>

              {mb.autoReplyRules.length === 0 && (
                <div style={{ textAlign: 'center', padding: '28px 16px', color: MUTED }}>
                  <Zap size={26} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>No auto-reply rules yet</div>
                  <div style={{ fontSize: 12.5, marginTop: 2 }}>Add a rule to answer common emails automatically.</div>
                </div>
              )}

              {mb.autoReplyRules.map(rule => (
                <div key={rule.id} style={{ border: '1px solid #e6e9f0', borderRadius: 14, padding: 14, marginBottom: 10, background: rule.enabled ? '#fff' : '#fafbfc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <button onClick={() => updateRule(rule.id, { enabled: !rule.enabled })} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                      {rule.enabled ? <ToggleRight size={26} color={INK} /> : <ToggleLeft size={26} color="#cbd5e1" />}
                    </button>
                    <input style={{ ...inp, flex: 1, fontWeight: 600 }} value={rule.name} onChange={e => updateRule(rule.id, { name: e.target.value })} placeholder="Rule name (e.g. Welcome new enquiries)" />
                    <button onClick={() => removeRule(rule.id)} style={{ border: 'none', background: '#fceaea', borderRadius: 8, padding: 7, cursor: 'pointer', display: 'flex' }}><Trash2 size={13} color="#e5484d" /></button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={label}>When</label>
                      <select style={{ ...inp, cursor: 'pointer' }} value={rule.match.type} onChange={e => updateRule(rule.id, { match: { ...rule.match, type: e.target.value as AutoReplyRule['match']['type'] } })}>
                        <option value="first_contact">First email from a sender</option>
                        <option value="keyword">Subject/body contains keywords</option>
                        <option value="out_of_hours">Outside business hours</option>
                        <option value="negative_sentiment">Angry / negative message</option>
                        <option value="always">Every incoming email</option>
                      </select>
                    </div>
                    <div>
                      <label style={label}>Action</label>
                      <select style={{ ...inp, cursor: 'pointer' }} value={rule.mode} onChange={e => updateRule(rule.id, { mode: e.target.value as AutoReplyRule['mode'] })}>
                        <option value="draft">Draft reply for approval</option>
                        <option value="auto_send">Send automatically</option>
                      </select>
                    </div>
                    {rule.match.type === 'keyword' && (
                      <div style={{ gridColumn: '1 / 3' }}>
                        <label style={label}>Keywords (comma-separated)</label>
                        <input style={inp} value={(rule.match.keywords ?? []).join(', ')} onChange={e => updateRule(rule.id, { match: { ...rule.match, keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean) } })} placeholder="pricing, refund, demo, cancel" />
                      </div>
                    )}
                    <div style={{ gridColumn: '1 / 3' }}>
                      <label style={label}>Extra AI instruction <span style={{ fontWeight: 400, color: MUTED }}>(optional)</span></label>
                      <input style={inp} value={rule.instruction} onChange={e => updateRule(rule.id, { instruction: e.target.value })} placeholder="e.g. Always offer a 14-day trial and link the pricing page." />
                    </div>
                  </div>
                </div>
              ))}

              <button onClick={addRule} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', padding: 12, border: '2px dashed #d5d8dd', borderRadius: 12, background: 'none', color: INK, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 2 }}>
                <Plus size={15} /> Add auto-reply rule
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e9edf3', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {TABS.map((t, i) => (
              <span key={t.id} style={{ width: tab === t.id ? 18 : 6, height: 6, borderRadius: 999, background: TABS.findIndex(x => x.id === tab) >= i ? INK : '#d5d8dd', transition: 'width 0.2s' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '9px 16px', border: '1px solid #e6e9f0', borderRadius: 10, background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            {tab !== 'autoreply' ? (
              <button onClick={() => setTab(tab === 'company' ? 'connection' : 'autoreply')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', border: 'none', borderRadius: 10, background: INK, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Next <ChevronRight size={14} />
              </button>
            ) : (
              <button onClick={save} disabled={!canSave} style={{ padding: '9px 20px', border: 'none', borderRadius: 10, background: canSave ? INK : '#c7cbd1', color: '#fff', fontSize: 13, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed' }}>
                {initial ? 'Save Mailbox' : 'Connect Mailbox'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
