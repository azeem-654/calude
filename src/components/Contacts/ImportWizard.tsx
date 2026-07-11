import React, { useState, useRef, useCallback } from 'react';
import {
  Upload, X, ChevronRight, ChevronLeft, CheckCircle, AlertCircle,
  Tag, Plus, Trash2, FileText, Zap, Eye, Users,
} from 'lucide-react';
import type { Contact } from '../../types';
import type { CustomFieldDef } from '../../context/AppContext';

/* ─── Types ─── */
interface Props {
  onClose: () => void;
  onImport: (contacts: Omit<Contact, 'id'>[], newFields: CustomFieldDef[]) => void;
  existingFields: CustomFieldDef[];
}

type StepId = 'upload' | 'map' | 'preview' | 'done';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'upload',  label: 'Upload' },
  { id: 'map',     label: 'Map Fields' },
  { id: 'preview', label: 'Preview' },
  { id: 'done',    label: 'Done' },
];

/* ─── CRM built-in field definitions ─── */
const CRM_FIELDS: { value: string; label: string; group: string }[] = [
  { value: 'name',     label: 'Full Name',    group: 'Identity' },
  { value: 'email',    label: 'Email',        group: 'Identity' },
  { value: 'phone',    label: 'Phone',        group: 'Identity' },
  { value: 'company',  label: 'Company',      group: 'Identity' },
  { value: 'jobTitle', label: 'Job Title',    group: 'Identity' },
  { value: 'website',  label: 'Website',      group: 'Identity' },
  { value: 'linkedin', label: 'LinkedIn URL', group: 'Identity' },
  { value: 'address',  label: 'Address',      group: 'Identity' },
  { value: 'status',   label: 'Status (lead/prospect/customer)', group: 'CRM' },
  { value: 'source',   label: 'Source',       group: 'CRM' },
  { value: 'tags',     label: 'Tags (semicolon-separated)', group: 'CRM' },
  { value: 'value',    label: 'Deal Value ($)', group: 'CRM' },
];

/* ─── CSV utils ─── */
function detectDelimiter(sample: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  let inQuote = false;
  for (const ch of sample.slice(0, 2000)) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (!inQuote && counts[ch] !== undefined) counts[ch]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === delimiter && !inQuote) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function autoDetectMapping(header: string): string {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/^(fullname|contactname|name|firstname|lastname)/.test(h)) return 'name';
  if (/email/.test(h)) return 'email';
  if (/^(phone|mobile|cell|tel)/.test(h)) return 'phone';
  if (/^(company|organization|org|employer)/.test(h)) return 'company';
  if (/^(jobtitle|title|role|position|occupation)/.test(h)) return 'jobTitle';
  if (/^(website|url|web|homepage)/.test(h)) return 'website';
  if (/linkedin/.test(h)) return 'linkedin';
  if (/^(address|location|city|state|zip)/.test(h)) return 'address';
  if (/status/.test(h)) return 'status';
  if (/^(source|leadsource|origin)/.test(h)) return 'source';
  if (/^(tag|label|category)/.test(h)) return 'tags';
  if (/^(value|revenue|deal|amount)/.test(h)) return 'value';
  return '__skip__';
}

function toSlug(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

/* ─── Pill component ─── */
function Pill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px 3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: '#eceef1', color: '#17191c',
    }}>
      {label}
      <button onClick={onRemove} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex', lineHeight: 1 }}>
        <X size={11} color="#a78bfa" />
      </button>
    </span>
  );
}

/* ─── Step progress bar ─── */
function StepBar({ current }: { current: StepId }) {
  const idx = STEPS.findIndex(s => s.id === current);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
      {STEPS.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <React.Fragment key={s.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
                background: done ? '#17191c' : active ? '#17191c' : '#f1f5f9',
                color: done || active ? '#fff' : '#94a3b8',
                border: active ? '3px solid #d5d8dd' : 'none',
                boxSizing: 'border-box',
              }}>
                {done ? <CheckCircle size={14} /> : i + 1}
              </div>
              <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? '#17191c' : done ? '#374151' : '#94a3b8', whiteSpace: 'nowrap' }}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < idx ? '#17191c' : '#e2e8f0', margin: '0 8px', minWidth: 20 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ─── Main component ─── */
export default function ImportWizard({ onClose, onImport, existingFields }: Props) {
  const [step, setStep] = useState<StepId>('upload');
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [delimiter, setDelimiter] = useState(',');

  // mapping: header → '__skip__' | '__new__' | crmField | 'cf:key'
  const [mapping, setMapping] = useState<Record<string, string>>({});
  // for columns mapped to '__new__': their proposed variable label
  const [newVarLabels, setNewVarLabels] = useState<Record<string, string>>({});

  const [applyTags, setApplyTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [dupStrategy, setDupStrategy] = useState<'skip' | 'update'>('skip');

  const [result, setResult] = useState<{ imported: number; skipped: number; newFields: CustomFieldDef[] } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  /* ─── File loading ─── */
  const loadFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv') && !file.type.includes('csv') && !file.type.includes('text')) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = (ev.target?.result as string) || '';
      const delim = detectDelimiter(text);
      setDelimiter(delim);
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return;
      const hdrs = parseCSVLine(lines[0], delim);
      const data = lines.slice(1).map(l => parseCSVLine(l, delim)).filter(r => r.some(c => c));
      setHeaders(hdrs);
      setRows(data);
      setFileName(file.name);

      // Auto-map
      const auto: Record<string, string> = {};
      hdrs.forEach(h => { auto[h] = autoDetectMapping(h); });
      setMapping(auto);
      setNewVarLabels({});
      setStep('map');
    };
    reader.readAsText(file);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) loadFile(f);
  };

  /* ─── Tag helpers ─── */
  const addTag = (t: string) => {
    const clean = t.trim();
    if (clean && !applyTags.includes(clean)) setApplyTags(prev => [...prev, clean]);
    setTagInput('');
  };

  /* ─── Compute new variable defs ─── */
  const getNewVarDefs = (): CustomFieldDef[] => {
    const defs: CustomFieldDef[] = [];
    headers.forEach(h => {
      if (mapping[h] !== '__new__') return;
      const label = newVarLabels[h]?.trim() || h;
      const key = toSlug(label) || toSlug(h);
      if (!key) return;
      // Don't duplicate existing custom fields
      const alreadyExists = existingFields.some(f => f.key === key) || defs.some(d => d.key === key);
      if (!alreadyExists) defs.push({ key, label, createdAt: new Date().toISOString() });
    });
    return defs;
  };

  /* ─── Do Import ─── */
  const doImport = () => {
    const newFieldDefs = getNewVarDefs();
    const allCustomFields = [...existingFields, ...newFieldDefs];
    const imported: Omit<Contact, 'id'>[] = [];
    let skipped = 0;

    rows.forEach(row => {
      const obj: Record<string, string> = {};
      const customFields: Record<string, string> = {};

      headers.forEach((h, i) => {
        const mapped = mapping[h];
        const val = row[i] || '';
        if (!mapped || mapped === '__skip__') return;

        if (mapped === '__new__') {
          const label = newVarLabels[h]?.trim() || h;
          const key = toSlug(label) || toSlug(h);
          if (key) customFields[key] = val;
          return;
        }

        // Check if it's an existing custom field mapping
        if (mapped.startsWith('cf:')) {
          const key = mapped.slice(3);
          customFields[key] = val;
          return;
        }

        obj[mapped] = val;
      });

      if (!obj.name && !obj.email) { skipped++; return; }

      const contact: Omit<Contact, 'id'> = {
        name: obj.name || obj.email?.split('@')[0] || 'Unknown',
        email: obj.email || '',
        phone: obj.phone || '',
        company: obj.company || '',
        jobTitle: obj.jobTitle || '',
        source: obj.source || 'CSV Import',
        status: (['lead','prospect','customer','churned'].includes((obj.status || '').toLowerCase())
          ? (obj.status.toLowerCase() as Contact['status'])
          : 'lead'),
        tags: [
          ...(obj.tags ? obj.tags.split(/[;,]/).map(t => t.trim()).filter(Boolean) : []),
          ...applyTags,
        ],
        website: obj.website || '',
        linkedin: obj.linkedin || '',
        address: obj.address || '',
        value: parseFloat(obj.value) || 0,
        createdAt: new Date().toISOString().split('T')[0],
        lastActivity: new Date().toISOString().split('T')[0],
        notes: [], tasks: [], activities: [],
        customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
      };

      // Merge existing custom fields from allCustomFields that are mapped
      allCustomFields.forEach(f => {
        if (obj[`cf:${f.key}`]) {
          if (!contact.customFields) (contact as any).customFields = {};
          contact.customFields![f.key] = obj[`cf:${f.key}`];
        }
      });

      imported.push(contact);
    });

    const res = { imported: imported.length, skipped, newFields: newFieldDefs };
    setResult(res);
    onImport(imported, newFieldDefs);
    setStep('done');
  };

  /* ─── Preview data ─── */
  const mappedHeaders = headers.filter(h => mapping[h] && mapping[h] !== '__skip__');
  const previewRows = rows.slice(0, 8);
  const willSkip = rows.filter(r => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { if (mapping[h] && mapping[h] !== '__skip__' && mapping[h] !== '__new__') obj[mapping[h]] = r[i] || ''; });
    return !obj.name && !obj.email;
  }).length;
  const newVarDefs = getNewVarDefs();

  /* ─── Render helpers ─── */
  const fieldLabel = (key: string): string => {
    if (key === '__skip__') return '— Skip —';
    if (key === '__new__') return '+ Create variable';
    if (key.startsWith('cf:')) {
      const f = existingFields.find(f => f.key === key.slice(3));
      return f ? `{{${f.key}}} ${f.label}` : key;
    }
    return CRM_FIELDS.find(f => f.value === key)?.label || key;
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 20, padding: 32, width: '100%', maxWidth: 760, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eceef1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Upload size={18} color="#17191c" />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>Import Contacts</h2>
            </div>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Import from CSV with field mapping and custom variable creation</p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', cursor: 'pointer', borderRadius: 8, padding: 7, display: 'flex' }}><X size={16} color="#64748b" /></button>
        </div>

        <StepBar current={step} />

        {/* ── Step 1: Upload ── */}
        {step === 'upload' && (
          <div>
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? '#17191c' : '#d5d8dd'}`,
                borderRadius: 16, padding: '52px 24px', textAlign: 'center',
                cursor: 'pointer', background: dragging ? '#f0f1f3' : '#fafbff',
                transition: 'all 0.15s',
              }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: '#eceef1', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Upload size={26} color="#17191c" />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                {dragging ? 'Drop your CSV here' : 'Drag & drop your CSV file'}
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>or click to browse — .csv files only</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 20px', background: '#17191c', color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700 }}>
                <FileText size={14} /> Choose File
              </div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleFileInput} />
            </div>

            {/* Tips */}
            <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ padding: '14px 16px', background: '#f0f9ff', borderRadius: 10, border: '1px solid #bae6fd' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Zap size={12} /> Auto-detected columns
                </div>
                <div style={{ fontSize: 12, color: '#0369a1', lineHeight: 1.7 }}>
                  Name, Email, Phone, Company, Job Title, Source, Status, Tags, Website, LinkedIn
                </div>
              </div>
              <div style={{ padding: '14px 16px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Tag size={12} /> Custom variables
                </div>
                <div style={{ fontSize: 12, color: '#166534', lineHeight: 1.7 }}>
                  Any unmapped column can become a <code style={{ fontFamily: 'monospace' }}>{'{{variable}}'}</code> usable in email templates
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16, padding: '12px 14px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a', fontSize: 12, color: '#92400e' }}>
              <strong>Tip:</strong> Delimiters (comma, semicolon, tab, pipe) are auto-detected. Tags should be semicolon-separated within their column.
            </div>
          </div>
        )}

        {/* ── Step 2: Map Fields ── */}
        {step === 'map' && (
          <div>
            {/* File info banner */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 20 }}>
              <FileText size={14} color="#17191c" />
              <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>{fileName}</span>
              <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>{rows.length} rows · {headers.length} columns · delimiter: <code style={{ fontFamily: 'monospace' }}>{delimiter === '\t' ? 'tab' : delimiter}</code></span>
            </div>

            {/* Stats bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
              {[
                { label: 'Total rows', value: rows.length, color: '#17191c', bg: '#f0f1f3' },
                { label: 'Mapped', value: Object.values(mapping).filter(v => v !== '__skip__').length, color: '#16a34a', bg: '#f0fdf4' },
                { label: 'Will skip', value: Object.values(mapping).filter(v => v === '__skip__').length, color: '#94a3b8', bg: '#f8fafc' },
              ].map(s => (
                <div key={s.label} style={{ padding: '10px 14px', background: s.bg, borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Field mapping rows */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Field Mapping</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {headers.map(h => {
                  const m = mapping[h] || '__skip__';
                  const isNew = m === '__new__';
                  const sampleVals = rows.slice(0, 3).map(r => r[headers.indexOf(h)]).filter(Boolean);

                  return (
                    <div key={h} style={{ display: 'grid', gridTemplateColumns: '1fr 24px 1fr', alignItems: 'start', gap: 8 }}>
                      {/* CSV column */}
                      <div style={{ padding: '9px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>{h}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sampleVals.join(' · ') || 'no data'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 10 }}>
                        <ChevronRight size={16} color="#d5d8dd" />
                      </div>

                      {/* Target field */}
                      <div>
                        <select
                          value={m}
                          onChange={e => setMapping(p => ({ ...p, [h]: e.target.value }))}
                          style={{
                            width: '100%', padding: '9px 10px', border: `1px solid ${isNew ? '#a78bfa' : m === '__skip__' ? '#e2e8f0' : '#17191c'}`,
                            borderRadius: 8, fontSize: 12, outline: 'none',
                            background: isNew ? '#f7f8f9' : m === '__skip__' ? '#f8fafc' : '#f0f1f3',
                            color: isNew ? '#17191c' : m === '__skip__' ? '#94a3b8' : '#17191c',
                            fontWeight: m !== '__skip__' ? 600 : 400,
                          }}>
                          <option value="__skip__">— Skip this column —</option>
                          <optgroup label="Standard CRM Fields">
                            {CRM_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                          </optgroup>
                          {existingFields.length > 0 && (
                            <optgroup label="Existing Custom Variables">
                              {existingFields.map(f => <option key={`cf:${f.key}`} value={`cf:${f.key}`}>{`{{${f.key}}} — ${f.label}`}</option>)}
                            </optgroup>
                          )}
                          <optgroup label="Create New">
                            <option value="__new__">+ Create new variable…</option>
                          </optgroup>
                        </select>

                        {isNew && (
                          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              value={newVarLabels[h] || ''}
                              onChange={e => setNewVarLabels(p => ({ ...p, [h]: e.target.value }))}
                              placeholder="Variable name (e.g. Industry)"
                              style={{ flex: 1, padding: '6px 10px', border: '1px solid #a78bfa', borderRadius: 6, fontSize: 12, outline: 'none', background: '#f7f8f9' }}
                            />
                            {newVarLabels[h] && (
                              <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#17191c', background: '#eceef1', padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap' }}>
                                {`{{${toSlug(newVarLabels[h]) || '…'}}}`}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Apply tags */}
            <div style={{ marginBottom: 20, padding: '14px 16px', background: '#fafbff', borderRadius: 10, border: '1px solid #e4e6ea' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Tag size={12} color="#17191c" /> Apply tags to all imported contacts
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {applyTags.map(t => <Pill key={t} label={t} onRemove={() => setApplyTags(prev => prev.filter(x => x !== t))} />)}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); } }}
                  placeholder="Type a tag and press Enter…"
                  style={{ flex: 1, padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none' }}
                />
                <button onClick={() => addTag(tagInput)}
                  style={{ padding: '7px 14px', background: '#17191c', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  <Plus size={13} />
                </button>
              </div>
            </div>

            {/* Duplicate strategy */}
            <div style={{ marginBottom: 24, padding: '14px 16px', background: '#fafbff', borderRadius: 10, border: '1px solid #e4e6ea' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Duplicate contacts (matched by email)
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {[
                  { id: 'skip', label: 'Skip', desc: 'Keep the existing contact unchanged' },
                  { id: 'update', label: 'Update', desc: 'Merge new data into existing contact' },
                ].map(opt => (
                  <button key={opt.id} onClick={() => setDupStrategy(opt.id as 'skip' | 'update')}
                    style={{
                      flex: 1, padding: '10px 14px', border: `2px solid ${dupStrategy === opt.id ? '#17191c' : '#e2e8f0'}`,
                      borderRadius: 9, background: dupStrategy === opt.id ? '#f0f1f3' : '#fff', cursor: 'pointer', textAlign: 'left',
                    }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: dupStrategy === opt.id ? '#17191c' : '#0f172a' }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setStep('upload')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, cursor: 'pointer', background: '#fff', color: '#374151', fontWeight: 600 }}>
                <ChevronLeft size={14} /> Back
              </button>
              <button onClick={() => setStep('preview')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: '#17191c', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Preview <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Preview ── */}
        {step === 'preview' && (
          <div>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'Total rows',    value: rows.length,             icon: <FileText size={14} />, color: '#17191c', bg: '#f0f1f3' },
                { label: 'Will import',   value: rows.length - willSkip,  icon: <Users size={14} />,    color: '#16a34a', bg: '#f0fdf4' },
                { label: 'Will skip',     value: willSkip,                icon: <AlertCircle size={14} />, color: willSkip > 0 ? '#d97706' : '#94a3b8', bg: willSkip > 0 ? '#fffbeb' : '#f8fafc' },
                { label: 'New variables', value: newVarDefs.length,       icon: <Tag size={14} />,      color: '#17191c', bg: '#f7f8f9' },
              ].map(s => (
                <div key={s.label} style={{ padding: '12px 14px', background: s.bg, borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ color: s.color, display: 'flex', justifyContent: 'center', marginBottom: 4 }}>{s.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500, marginTop: 1 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* New variables preview */}
            {newVarDefs.length > 0 && (
              <div style={{ marginBottom: 16, padding: '14px 16px', background: '#f7f8f9', borderRadius: 10, border: '1px solid #e4e6ea' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#17191c', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                  New variables to be created
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {newVarDefs.map(v => (
                    <div key={v.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: '#eceef1', borderRadius: 20 }}>
                      <span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: '#17191c' }}>{`{{${v.key}}}`}</span>
                      <span style={{ fontSize: 11, color: '#17191c' }}>— {v.label}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: '#17191c', marginTop: 8 }}>
                  These variables will be available in email templates for personalization.
                </div>
              </div>
            )}

            {/* Applied tags */}
            {applyTags.length > 0 && (
              <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Applying tags:</span>
                {applyTags.map(t => <Pill key={t} label={t} onRemove={() => setApplyTags(prev => prev.filter(x => x !== t))} />)}
              </div>
            )}

            {/* Data preview table */}
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Eye size={12} /> Data preview (first {previewRows.length} rows)
            </div>
            <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 24 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {mappedHeaders.map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                        <div>{h}</div>
                        <div style={{ fontSize: 10, fontWeight: 500, color: '#94a3b8' }}>{fieldLabel(mapping[h])}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, ri) => (
                    <tr key={ri} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      {mappedHeaders.map(h => {
                        const val = row[headers.indexOf(h)] || '';
                        return (
                          <td key={h} style={{ padding: '7px 12px', color: val ? '#0f172a' : '#cbd5e1', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {val || '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setStep('map')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 13, cursor: 'pointer', background: '#fff', color: '#374151', fontWeight: 600 }}>
                <ChevronLeft size={14} /> Back
              </button>
              <button onClick={doImport}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 24px', background: '#17191c', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Import {rows.length - willSkip} Contacts <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Done ── */}
        {step === 'done' && result && (
          <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <CheckCircle size={36} color="#16a34a" />
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>Import Complete!</h3>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#17191c' }}>{result.imported}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>contacts imported</div>
              </div>
              {result.skipped > 0 && (
                <div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#f59e0b' }}>{result.skipped}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>rows skipped</div>
                </div>
              )}
              {result.newFields.length > 0 && (
                <div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#17191c' }}>{result.newFields.length}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>new variables</div>
                </div>
              )}
            </div>

            {result.newFields.length > 0 && (
              <div style={{ padding: '16px 20px', background: '#f7f8f9', borderRadius: 12, border: '1px solid #e4e6ea', marginBottom: 24, textAlign: 'left' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#17191c', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                  New email personalization variables
                </div>
                {result.newFields.map(v => (
                  <div key={v.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #eceef1' }}>
                    <code style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#17191c', background: '#eceef1', padding: '2px 8px', borderRadius: 5 }}>
                      {`{{${v.key}}}`}
                    </code>
                    <span style={{ fontSize: 13, color: '#374151' }}>{v.label}</span>
                  </div>
                ))}
                <p style={{ fontSize: 12, color: '#17191c', margin: '10px 0 0' }}>
                  Use these tokens in Marketing → Campaign Wizard → Email editor to personalize messages.
                </p>
              </div>
            )}

            <button onClick={onClose}
              style={{ padding: '11px 32px', background: '#17191c', color: '#fff', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
