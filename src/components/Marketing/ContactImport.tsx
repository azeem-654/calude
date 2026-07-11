import React, { useState, useCallback, useRef } from 'react';
import { Upload, FileText, Check, AlertCircle, ChevronDown, RefreshCw, RotateCcw } from 'lucide-react';
import type { Contact } from '../../types';
import type { FieldMapping, ImportSummary } from '../../types/marketing';

const CRM_FIELDS = [
  { value: '', label: '— Skip this column —' },
  { value: 'name', label: 'Full Name' },
  { value: 'email', label: 'Email Address *' },
  { value: 'phone', label: 'Phone Number' },
  { value: 'company', label: 'Company / Organization' },
  { value: 'status', label: 'Status (lead / prospect / customer)' },
  { value: 'source', label: 'Lead Source' },
  { value: 'tags', label: 'Tags (comma-separated)' },
  { value: 'value', label: 'Contact Value ($)' },
];

function detectDelimiter(line: string): string {
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = 0;
  let inQ = false;
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (!inQ && ch in counts) counts[ch]++;
  }
  for (const d of candidates) {
    if (counts[d] > bestCount) { bestCount = counts[d]; best = d; }
  }
  return best;
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === delimiter && !inQ) {
      result.push(cur.trim().replace(/^"|"$/g, ''));
      cur = '';
    } else cur += ch;
  }
  result.push(cur.trim().replace(/^"|"$/g, ''));
  return result;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const delim = detectDelimiter(lines[0]);
  const headers = parseCSVLine(lines[0], delim);
  const rows = lines.slice(1)
    .map(l => parseCSVLine(l, delim))
    .filter(r => r.some(v => v.trim()));
  return { headers, rows };
}

function autoDetect(headers: string[]): FieldMapping[] {
  const patterns: Record<string, RegExp[]> = {
    name: [/^(full.?)?name$/i, /^contact.?name$/i, /^person$/i],
    email: [/^e.?mail(.?address)?$/i],
    phone: [/^(phone|mobile|cell|tel)(.?number)?$/i],
    company: [/^(company|organization|business|account|firm|employer)$/i],
    status: [/^(status|stage|lead.?status|contact.?status)$/i],
    source: [/^(source|lead.?source|channel|origin|utm.?source)$/i],
    tags: [/^(tags?|labels?|categories|segments?)$/i],
    value: [/^(value|amount|revenue|worth|deal.?value)$/i],
  };
  return headers.map(h => {
    let crmField = '';
    for (const [field, pats] of Object.entries(patterns)) {
      if (pats.some(p => p.test(h.trim()))) { crmField = field; break; }
    }
    return { csvHeader: h, crmField };
  });
}

interface Props {
  contacts: Contact[];
  onBulkImport: (contacts: Omit<Contact, 'id'>[]) => void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function ContactImport({ contacts, onBulkImport, onNotify }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [dupStrategy, setDupStrategy] = useState<'skip' | 'update'>('skip');
  const [stage, setStage] = useState<'upload' | 'map' | 'importing' | 'done'>('upload');
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((f: File) => {
    if (!f.name.endsWith('.csv') && f.type !== 'text/csv' && f.type !== 'text/plain') {
      onNotify('Please upload a CSV file (.csv)', 'error');
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const result = parseCSV(text);
      if (result.headers.length === 0) { onNotify('CSV file appears empty', 'error'); return; }
      setParsed(result);
      setMappings(autoDetect(result.headers));
      setStage('map');
    };
    reader.readAsText(f);
  }, [onNotify]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  }, [processFile]);

  const handleImport = async () => {
    if (!parsed) return;
    setStage('importing');
    setProgress(0);

    const existingEmails = new Set(contacts.map(c => c.email.toLowerCase().trim()));
    let imported = 0, duplicates = 0, errors = 0;
    const toImport: Omit<Contact, 'id'>[] = [];
    const total = parsed.rows.length;

    for (let i = 0; i < total; i++) {
      if (i % 80 === 0) {
        setProgress(Math.round((i / total) * 90));
        await new Promise(r => setTimeout(r, 20));
      }
      const row = parsed.rows[i];
      try {
        const obj: Record<string, string> = {};
        mappings.forEach((m, idx) => { if (m.crmField) obj[m.crmField] = (row[idx] || '').trim(); });
        const email = (obj.email || '').toLowerCase().trim();
        if (!email || !email.includes('@')) { errors++; continue; }
        const isDup = existingEmails.has(email);
        if (isDup) {
          duplicates++;
          if (dupStrategy === 'skip') continue;
        }
        const contact: Omit<Contact, 'id'> = {
          name: obj.name || email.split('@')[0],
          email,
          phone: obj.phone || '',
          status: (['lead', 'prospect', 'customer', 'churned'].includes(obj.status)
            ? obj.status : 'lead') as Contact['status'],
          tags: obj.tags ? obj.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          source: obj.source || 'CSV Import',
          createdAt: new Date().toISOString().split('T')[0],
          lastActivity: new Date().toISOString().split('T')[0],
          value: parseFloat(obj.value) || 0,
        };
        toImport.push(contact);
        existingEmails.add(email);
        imported++;
      } catch { errors++; }
    }

    setProgress(95);
    await new Promise(r => setTimeout(r, 200));
    onBulkImport(toImport);
    setProgress(100);
    await new Promise(r => setTimeout(r, 300));
    setSummary({ total, imported, duplicates, errors });
    setStage('done');
    onNotify(`Successfully imported ${imported.toLocaleString()} contacts!`);
  };

  const reset = () => {
    setFile(null); setParsed(null); setMappings([]);
    setStage('upload'); setProgress(0); setSummary(null);
  };

  const sampleCSV = `name,email,phone,company,status,source,tags,value\nJohn Smith,john@example.com,555-1234,Acme Corp,lead,Website,"saas,trial",0\nJane Doe,jane@corp.com,555-5678,Corp Inc,customer,Referral,enterprise,5000\nBob Lee,bob@agency.io,555-9012,Agency Co,prospect,LinkedIn,"agency,hot",1200`;

  /* ── UPLOAD STAGE ── */
  if (stage === 'upload') return (
    <div style={{ padding: '28px' }}>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? '#17191c' : '#cbd5e1'}`,
          borderRadius: '16px', padding: '56px 40px', textAlign: 'center',
          cursor: 'pointer', backgroundColor: dragging ? '#f0f1f3' : '#fafafa',
          transition: 'all 0.2s',
        }}
      >
        <div style={{ width: '68px', height: '68px', borderRadius: '18px', backgroundColor: '#f0f1f3', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
          <Upload size={30} color="#17191c" />
        </div>
        <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          {dragging ? 'Drop it!' : 'Drop CSV here or click to browse'}
        </h3>
        <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 24px' }}>
          Supports comma, semicolon, tab, and pipe delimiters • Any number of rows
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {['name / email', 'phone / company', 'source / tags', 'status / value'].map(h => (
            <span key={h} style={{ padding: '5px 14px', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '20px', fontSize: '12px', color: '#475569' }}>{h}</span>
          ))}
        </div>
        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
      </div>

      <div style={{ marginTop: '24px', backgroundColor: 'white', borderRadius: '12px', padding: '20px 24px', border: '1px solid #e2e8f0' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#374151', margin: '0 0 10px' }}>Sample CSV Format</p>
        <pre style={{ fontSize: '11.5px', color: '#475569', backgroundColor: '#f8fafc', padding: '14px 16px', borderRadius: '8px', overflowX: 'auto', margin: 0, lineHeight: 1.6 }}>
          {sampleCSV}
        </pre>
      </div>
    </div>
  );

  /* ── MAP STAGE ── */
  if (stage === 'map' && parsed) {
    const emailMapped = mappings.some(m => m.crmField === 'email');
    return (
      <div style={{ padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: '#f0f1f3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileText size={22} color="#17191c" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', margin: 0 }}>{file?.name}</p>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '3px 0 0' }}>
              {parsed.rows.length.toLocaleString()} contacts · {parsed.headers.length} columns detected
            </p>
          </div>
          <button onClick={reset} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', background: 'white', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RotateCcw size={14} /> Different File
          </button>
        </div>

        {!emailMapped && (
          <div style={{ display: 'flex', gap: '10px', padding: '14px 18px', backgroundColor: '#fef2f2', borderRadius: '10px', border: '1px solid #fecaca', marginBottom: '20px', alignItems: 'center' }}>
            <AlertCircle size={18} color="#ef4444" />
            <p style={{ fontSize: '13px', color: '#dc2626', margin: 0 }}>Map at least one column to <strong>Email Address</strong> to enable import.</p>
          </div>
        )}

        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: 0 }}>Map Columns to CRM Fields</p>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CSV Column</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sample Values</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Maps To</th>
              </tr>
            </thead>
            <tbody>
              {parsed.headers.map((header, idx) => {
                const sample = parsed.rows.slice(0, 3).map(r => r[idx] || '').filter(Boolean).join(' · ');
                const m = mappings[idx];
                const autoMapped = m?.crmField !== '';
                return (
                  <tr key={header} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{header}</span>
                      {autoMapped && (
                        <span style={{ marginLeft: '8px', fontSize: '10px', padding: '2px 8px', backgroundColor: '#ecfdf5', color: '#15803d', borderRadius: '10px', fontWeight: 500 }}>auto</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>{sample || '—'}</span>
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      <div style={{ position: 'relative' }}>
                        <select
                          value={m?.crmField || ''}
                          onChange={e => setMappings(prev => prev.map((mp, i) => i === idx ? { ...mp, crmField: e.target.value } : mp))}
                          style={{ padding: '7px 28px 7px 10px', border: `1px solid ${autoMapped ? '#86efac' : '#e2e8f0'}`, borderRadius: '8px', fontSize: '13px', backgroundColor: autoMapped ? '#f0fdf4' : 'white', cursor: 'pointer', appearance: 'none', width: '220px', outline: 'none' }}
                        >
                          {CRM_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                        <ChevronDown size={13} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8' }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
          <AlertCircle size={18} color="#f59e0b" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: '0 0 2px' }}>Duplicate Handling</p>
            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>What to do when an email already exists in your CRM</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['skip', 'update'] as const).map(s => (
              <button key={s} onClick={() => setDupStrategy(s)}
                style={{ padding: '8px 16px', border: `2px solid ${dupStrategy === s ? '#17191c' : '#e2e8f0'}`, borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', backgroundColor: dupStrategy === s ? '#17191c' : 'white', color: dupStrategy === s ? 'white' : '#64748b', transition: 'all 0.15s' }}>
                {s === 'skip' ? 'Skip Duplicates' : 'Update Existing'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={reset} style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', background: 'white', color: '#64748b' }}>Cancel</button>
          <button onClick={handleImport} disabled={!emailMapped}
            style={{ padding: '10px 24px', backgroundColor: emailMapped ? '#17191c' : '#d5d8dd', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: emailMapped ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Upload size={15} /> Import {parsed.rows.length.toLocaleString()} Contacts
          </button>
        </div>
      </div>
    );
  }

  /* ── IMPORTING STAGE ── */
  if (stage === 'importing') return (
    <div style={{ padding: '80px 28px', textAlign: 'center' }}>
      <div style={{ width: '76px', height: '76px', borderRadius: '50%', backgroundColor: '#f0f1f3', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <RefreshCw size={30} color="#17191c" className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
      <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>Importing…</h3>
      <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 40px' }}>Processing {parsed?.rows.length.toLocaleString()} records</p>
      <div style={{ maxWidth: '420px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', color: '#64748b' }}>Progress</span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#17191c' }}>{progress}%</span>
        </div>
        <div style={{ height: '10px', backgroundColor: '#e2e8f0', borderRadius: '5px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: '#17191c', borderRadius: '5px', transition: 'width 0.3s ease' }} />
        </div>
      </div>
    </div>
  );

  /* ── DONE STAGE ── */
  if (stage === 'done' && summary) return (
    <div style={{ padding: '80px 28px', textAlign: 'center' }}>
      <div style={{ width: '76px', height: '76px', borderRadius: '50%', backgroundColor: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <Check size={36} color="#16a34a" />
      </div>
      <h3 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>Import Complete!</h3>
      <p style={{ fontSize: '15px', color: '#64748b', margin: '0 0 36px' }}>Your contacts have been added to the CRM.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', maxWidth: '520px', margin: '0 auto 36px' }}>
        {[
          { label: 'Total Rows', value: summary.total, color: '#17191c', bg: '#f0f1f3' },
          { label: 'Imported', value: summary.imported, color: '#16a34a', bg: '#ecfdf5' },
          { label: 'Duplicates', value: summary.duplicates, color: '#f59e0b', bg: '#fffbeb' },
          { label: 'Errors', value: summary.errors, color: '#ef4444', bg: '#fef2f2' },
        ].map(s => (
          <div key={s.label} style={{ backgroundColor: s.bg, borderRadius: '18px', padding: '20px 12px' }}>
            <p style={{ fontSize: '28px', fontWeight: 800, color: s.color, margin: '0 0 6px' }}>{s.value.toLocaleString()}</p>
            <p style={{ fontSize: '12px', color: '#64748b', margin: 0, fontWeight: 500 }}>{s.label}</p>
          </div>
        ))}
      </div>
      <button onClick={reset}
        style={{ padding: '11px 28px', backgroundColor: '#17191c', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
        <Upload size={16} /> Import Another File
      </button>
    </div>
  );

  return null;
}
