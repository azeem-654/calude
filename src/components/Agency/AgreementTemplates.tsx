/**
 * Agreement templates — the e-commerce service's Service Agreement and Scope
 * of Work, filled in per client on the owner's Growth service desk.
 *
 * Drafts are kept in the owner's own workspace (`crm_service_agreements`,
 * synced like every crm_* key) so a half-filled one survives a reload. Nothing
 * is sent anywhere: the owner downloads or prints the draft, has it reviewed,
 * and signs it outside the app. The text is in serviceAgreements.ts.
 */
import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, FileText, Plus, Printer, Trash2 } from 'lucide-react';
import { DRAFT_NOTICE, TBD, blankAgreement, scopeOfWork, serviceAgreement, toHtml, toText, type AgreementInput, type DraftDoc } from './serviceAgreements';
import { INK, LINE, MUTED, box, btn, grid, input, label, primary } from '../Jobs/JobsRevenue';
import { askConfirm } from '../shared/ConfirmDialog';

const KEY = 'crm_service_agreements';
interface Saved { id: string; updatedAt: string; input: AgreementInput }

const small: React.CSSProperties = { fontSize: 12.5, color: MUTED, margin: 0, lineHeight: 1.5 };

function load(): Saved[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function store(list: Saved[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota: the draft stays on screen */ }
}

const numOrNull = (v: string): number | null => {
  const t = v.replace(/[$,\s]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const centsOf = (v: string) => { const n = numOrNull(v); return n === null ? null : Math.round(n * 100); };
const showCents = (c: number | null) => (c === null ? '' : String(c / 100));
const showNum = (n: number | null) => (n === null ? '' : String(n));
const lines = (v: string) => v.split('\n').map(s => s.trim()).filter(Boolean);

export default function AgreementTemplates() {
  const [list, setList] = useState<Saved[]>(load);
  const [openId, setOpenId] = useState<string | null>(() => load()[0]?.id ?? null);
  const current = list.find(s => s.id === openId) ?? null;
  const [doc, setDoc] = useState<'agreement' | 'scope'>('agreement');
  const [copied, setCopied] = useState(false);

  useEffect(() => { store(list); }, [list]);

  const create = () => {
    const s: Saved = { id: `agr-${Date.now()}`, updatedAt: new Date().toISOString(), input: blankAgreement() };
    setList(l => [s, ...l]);
    setOpenId(s.id);
  };
  const set = (patch: Partial<AgreementInput>) => {
    if (!current) return;
    setList(l => l.map(s => (s.id === current.id ? { ...s, updatedAt: new Date().toISOString(), input: { ...s.input, ...patch } } : s)));
  };
  const remove = async () => {
    if (!current) return;
    if (!await askConfirm({ title: 'Delete this draft?', message: 'Only the draft in this app is deleted; anything you downloaded is untouched.', confirmLabel: 'Delete draft', danger: true })) return;
    const rest = list.filter(s => s.id !== current.id);
    setList(rest);
    setOpenId(rest[0]?.id ?? null);
  };

  const built: DraftDoc | null = useMemo(() => (current ? (doc === 'agreement' ? serviceAgreement(current.input) : scopeOfWork(current.input)) : null), [current, doc]);
  const fileBase = `${(current?.input.clientName || 'client').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'client'}-${doc === 'agreement' ? 'services-agreement' : 'scope-of-work'}-draft`;

  const download = () => {
    if (!built) return;
    const url = URL.createObjectURL(new Blob([toHtml(built)], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${fileBase}.html`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const print = () => {
    if (!built) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(toHtml(built));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };
  const copy = () => {
    if (!built) return;
    void navigator.clipboard?.writeText(toText(built)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  return (
    <div style={{ display: 'grid', gap: 12, minWidth: 0 }} data-testid="agreement-templates">
      <div style={{ ...box, borderColor: '#f4c7c3', background: '#fffbfa' }}>
        <p style={{ ...small, color: '#b42318', fontWeight: 600 }}>{DRAFT_NOTICE}</p>
        <p style={{ ...small, marginTop: 6 }}>For the e-commerce managed service. The fee basis, what the client pays separately, the client’s part and “no guarantee” come from the same words as the public page; everything else is yours to set. A term you leave empty is printed as “{TBD}”, and listed for the reviewer.</p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={primary} onClick={create} data-testid="agreement-new"><Plus size={13} /> New client draft</button>
        {list.map(s => (
          <button key={s.id} style={{ ...btn, ...(s.id === openId ? { borderColor: INK } : {}) }} onClick={() => setOpenId(s.id)} aria-pressed={s.id === openId}>
            <FileText size={13} /> {s.input.clientName || 'Unnamed client'}
          </button>
        ))}
      </div>

      {!current && <div style={box}><p style={small}>No drafts yet. Start one per client: fill in the terms you have agreed, then download or print the Service Agreement and the Scope of Work for review.</p></div>}

      {current && built && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', alignItems: 'start' }}>
          <div key={current.id} style={{ ...box, display: 'grid', gap: 14 }}>
            <Group title="Parties">
              <F l="Your legal name (provider)" f="agr.providerName" v={current.input.providerName} on={v => set({ providerName: v })} />
              <F l="Your address" f="agr.providerAddress" v={current.input.providerAddress} on={v => set({ providerAddress: v })} />
              <F l="Client’s legal name" f="agr.clientName" v={current.input.clientName} on={v => set({ clientName: v })} />
              <F l="Client’s address" f="agr.clientAddress" v={current.input.clientAddress} on={v => set({ clientAddress: v })} />
              <F l="Effective date" f="agr.effectiveDate" type="date" v={current.input.effectiveDate} on={v => set({ effectiveDate: v })} />
            </Group>
            <Group title="Term, renewal and notice">
              <F l="Initial term (months)" f="agr.term" num v={showNum(current.input.initialTermMonths)} on={v => set({ initialTermMonths: numOrNull(v) })} />
              <label style={label}>After the initial term
                <select style={input} data-field="agr.renewal" value={current.input.renewal} onChange={e => set({ renewal: e.target.value as AgreementInput['renewal'] })}>
                  <option value="monthly">Continues month to month</option>
                  <option value="same-term">Renews for the same term</option>
                  <option value="none">Ends — a renewal is signed separately</option>
                </select>
              </label>
              <F l="Notice to end (days)" f="agr.notice" num v={showNum(current.input.noticeDays)} on={v => set({ noticeDays: numOrNull(v) })} />
              <F l="Days to put a breach right" f="agr.cure" num v={showNum(current.input.cureDays)} on={v => set({ cureDays: numOrNull(v) })} />
            </Group>
            <Group title="Payment">
              <F l="Monthly fee ($)" f="agr.fee" num v={showCents(current.input.monthlyFeeCents)} on={v => set({ monthlyFeeCents: centsOf(v) })} />
              <F l="Setup fee ($, optional)" f="agr.setup" num v={showCents(current.input.setupFeeCents)} on={v => set({ setupFeeCents: centsOf(v) })} />
              <F l="Invoice day of the month" f="agr.invoiceDay" num v={showNum(current.input.invoiceDay)} on={v => set({ invoiceDay: numOrNull(v) })} />
              <F l="Invoices due within (days)" f="agr.paymentDays" num v={showNum(current.input.paymentDays)} on={v => set({ paymentDays: numOrNull(v) })} />
              <F l="Interest on overdue amounts (optional)" f="agr.interest" v={current.input.lateInterestPct} on={v => set({ lateInterestPct: v })} ph="e.g. 1% a month, or the legal maximum if lower" />
              <F l="Additional work ($ an hour)" f="agr.rate" num v={showCents(current.input.additionalWorkRateCents)} on={v => set({ additionalWorkRateCents: centsOf(v) })} />
            </Group>
            <Group title="Monthly scope">
              <F l="Platforms and marketplaces" f="agr.platforms" v={current.input.platforms} on={v => set({ platforms: v })} ph="e.g. Shopify store; Amazon and eBay seller accounts" />
              <F l="Products/listings a month (up to)" f="agr.products" num v={showNum(current.input.productsPerMonth)} on={v => set({ productsPerMonth: numOrNull(v) })} />
              <F l="Ad channels managed" f="agr.ads" v={current.input.adChannels} on={v => set({ adChannels: v })} ph="e.g. Google Shopping and Meta" />
              <F l="Monthly ad budget (client sets and pays)" f="agr.budget" v={current.input.monthlyAdBudget} on={v => set({ monthlyAdBudget: v })} ph="e.g. $3,000, reviewed monthly" />
              <F l="Email/SMS campaigns a month (up to)" f="agr.campaigns" num v={showNum(current.input.emailSmsCampaigns)} on={v => set({ emailSmsCampaigns: numOrNull(v) })} />
              <F l="Social/blog pieces a month (up to)" f="agr.content" num v={showNum(current.input.contentPieces)} on={v => set({ contentPieces: numOrNull(v) })} />
              <F l="Support hours and channels" f="agr.support" v={current.input.supportHours} on={v => set({ supportHours: v })} ph="e.g. Mon–Fri 9:00–17:00 ET, email and help desk" />
              <F l="Report by working day" f="agr.report" num v={showNum(current.input.reportDay)} on={v => set({ reportDay: numOrNull(v) })} />
              <A l="More deliverables (one a line)" f="agr.extraDeliverables" v={current.input.extraDeliverables} on={v => set({ extraDeliverables: v })} />
              <A l="More exclusions (one a line)" f="agr.extraExclusions" v={current.input.extraExclusions} on={v => set({ extraExclusions: v })} />
              <A l="More client responsibilities (one a line)" f="agr.extraDuties" v={current.input.extraClientDuties} on={v => set({ extraClientDuties: v })} />
            </Group>
            <Group title="Legal">
              <F l="Governing law (state or country)" f="agr.law" v={current.input.governingLaw} on={v => set({ governingLaw: v })} ph="Your lawyer’s choice" />
              <F l="Liability cap (months of fees)" f="agr.cap" num v={showNum(current.input.liabilityCapMonths)} on={v => set({ liabilityCapMonths: numOrNull(v) })} />
              <F l="Confidentiality lasts (years after the end)" f="agr.secrecy" num v={showNum(current.input.confidentialityYears ?? null)} on={v => set({ confidentialityYears: numOrNull(v) })} />
            </Group>
            <div><button style={btn} onClick={() => void remove()}><Trash2 size={13} /> Delete this draft</button></div>
          </div>

          <div style={{ ...box, display: 'grid', gap: 10, minWidth: 0 }}>
            <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['agreement', 'scope'] as const).map(k => (
                <button key={k} role="tab" aria-selected={doc === k} style={{ ...btn, ...(doc === k ? { background: INK, color: '#fff', borderColor: INK } : {}) }} onClick={() => setDoc(k)}>{k === 'agreement' ? 'Service Agreement' : 'Scope of Work'}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={btn} onClick={download} data-testid="agreement-download"><Download size={13} /> Download</button>
              <button style={btn} onClick={print}><Printer size={13} /> Print or save as PDF</button>
              <button style={btn} onClick={copy}><Copy size={13} /> {copied ? 'Copied' : 'Copy text'}</button>
            </div>
            {built.missing.length > 0 && (
              <p style={{ ...small, background: '#fff7e6', border: '1px solid #f0c36d', borderRadius: 9, padding: '8px 10px' }} data-testid="agreement-missing">
                <b>Still to agree ({built.missing.length}):</b> {built.missing.join(' · ')}
              </p>
            )}
            <article style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 'clamp(12px, 3vw, 22px)', maxHeight: 640, overflow: 'auto', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 13.5, lineHeight: 1.6, color: '#111', overflowWrap: 'anywhere' }} data-testid="agreement-preview">
              <p style={{ color: '#b42318', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, margin: '0 0 10px' }}>{DRAFT_NOTICE}</p>
              <h3 style={{ margin: '0 0 8px', fontSize: 17 }}>{built.title}</h3>
              {built.sections.map(s => {
                const intro = s.list && /^\d+\./.test(s.heading) ? 1 : 0;
                return (
                  <section key={s.heading}>
                    <h4 style={{ margin: '14px 0 4px', fontSize: 14 }}>{s.heading}</h4>
                    {(s.list ? s.paragraphs.slice(0, intro) : s.paragraphs).map((p, i) => <p key={i} style={{ margin: '0 0 6px' }}>{p}</p>)}
                    {s.list && <ul style={{ margin: '0 0 6px', paddingLeft: 20 }}>{s.paragraphs.slice(intro).map((p, i) => <li key={i}>{p}</li>)}</ul>}
                  </section>
                );
              })}
            </article>
          </div>
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
      <legend style={{ fontSize: 13, fontWeight: 800, color: INK, marginBottom: 8 }}>{title}</legend>
      <div style={grid}>{children}</div>
    </fieldset>
  );
}

function F({ l, f, v, on, num, type, ph }: { l: string; f: string; v: string; on: (v: string) => void; num?: boolean; type?: string; ph?: string }) {
  return <label style={label}>{l}<input style={input} data-field={f} value={v} type={type ?? 'text'} inputMode={num ? 'decimal' : undefined} placeholder={ph} onChange={e => on(e.target.value)} /></label>;
}

function A({ l, f, v, on }: { l: string; f: string; v: string[]; on: (v: string[]) => void }) {
  const [text, setText] = useState(v.join('\n'));
  return <label style={{ ...label, gridColumn: '1 / -1' }}>{l}<textarea style={{ ...input, minHeight: 64, resize: 'vertical' }} data-field={f} value={text} onChange={e => { setText(e.target.value); on(lines(e.target.value)); }} /></label>;
}
