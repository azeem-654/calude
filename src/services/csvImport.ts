/**
 * csvImport.ts — CSV parsing, field auto-mapping, validation, dedupe and
 * AI segmentation for the onboarding wizard's contact import step.
 */

import type { Contact } from '../types';
import { sanitizeText, isValidEmail } from './onboarding';

/* ── CSV parser (handles quoted fields, commas, escaped quotes, CRLF) ── */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(f => f.trim() !== '')) rows.push(row); }
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map(h => h.trim());
  return { headers, rows: rows.slice(1) };
}

/* ── Field mapping ── */
export const CRM_FIELDS = [
  { id: 'ignore',    label: 'Ignore column' },
  { id: 'name',      label: 'Full name' },
  { id: 'firstName', label: 'First name' },
  { id: 'lastName',  label: 'Last name' },
  { id: 'email',     label: 'Email' },
  { id: 'phone',     label: 'Phone' },
  { id: 'company',   label: 'Company' },
  { id: 'jobTitle',  label: 'Job title' },
  { id: 'tags',      label: 'Tags (comma separated)' },
  { id: 'website',   label: 'Website' },
  { id: 'source',    label: 'Source' },
  { id: 'custom',    label: 'Custom field' },
] as const;
export type CrmFieldId = typeof CRM_FIELDS[number]['id'];

/** Fuzzy-match CSV headers to CRM fields. */
export function autoMapHeaders(headers: string[]): CrmFieldId[] {
  const used = new Set<CrmFieldId>();
  return headers.map(h => {
    const k = h.toLowerCase().replace(/[^a-z]/g, '');
    let id: CrmFieldId = 'custom';
    if (/^(fullname|name|contactname|contact)$/.test(k)) id = 'name';
    else if (/^(firstname|first|fname|givenname)$/.test(k)) id = 'firstName';
    else if (/^(lastname|last|lname|surname|familyname)$/.test(k)) id = 'lastName';
    else if (/(email|mail)/.test(k)) id = 'email';
    else if (/(phone|mobile|cell|tel)/.test(k)) id = 'phone';
    else if (/(company|organization|organisation|business|account)$/.test(k)) id = 'company';
    else if (/(jobtitle|title|position|role)$/.test(k)) id = 'jobTitle';
    else if (/(tags|labels|segments)$/.test(k)) id = 'tags';
    else if (/(website|url|site|domain)$/.test(k)) id = 'website';
    else if (/(source|origin|channel)$/.test(k)) id = 'source';
    // single-use fields fall back to custom when the header repeats
    if (id !== 'custom' && id !== 'tags' && used.has(id)) id = 'custom';
    used.add(id);
    return id;
  });
}

const normalizePhone = (p: string) => p.replace(/[^\d+]/g, '');

export interface ImportBuildResult {
  contacts: Omit<Contact, 'id'>[];
  invalid: number;
  duplicates: number;
  customHeaders: string[];      // CSV headers mapped as custom fields
  segments: { tag: string; count: number }[];
}

/**
 * Turn parsed rows into validated, deduped, auto-segmented contact records.
 * A row needs at least a valid email OR a phone with 7+ digits.
 */
export function buildContacts(
  headers: string[], rows: string[][], mapping: CrmFieldId[],
  existing: { email: string; phone: string }[],
): ImportBuildResult {
  const seenEmail = new Set(existing.map(c => c.email.toLowerCase()).filter(Boolean));
  const seenPhone = new Set(existing.map(c => normalizePhone(c.phone)).filter(p => p.length >= 7));
  const customHeaders = headers.filter((_, i) => mapping[i] === 'custom');
  const today = new Date().toISOString().split('T')[0];
  const contacts: Omit<Contact, 'id'>[] = [];
  let invalid = 0, duplicates = 0;
  const segCounts = new Map<string, number>();
  const bump = (tag: string) => segCounts.set(tag, (segCounts.get(tag) ?? 0) + 1);

  for (const row of rows) {
    const get = (id: CrmFieldId) => {
      const idx = mapping.findIndex((m, i) => m === id && row[i] !== undefined);
      return idx >= 0 ? sanitizeText(row[idx] ?? '', 200) : '';
    };
    const email = get('email').toLowerCase();
    const phone = normalizePhone(get('phone'));
    const emailOk = isValidEmail(email);
    const phoneOk = phone.length >= 7;
    if (!emailOk && !phoneOk) { invalid++; continue; }
    if ((emailOk && seenEmail.has(email)) || (phoneOk && seenPhone.has(phone))) { duplicates++; continue; }
    if (emailOk) seenEmail.add(email);
    if (phoneOk) seenPhone.add(phone);

    const firstName = get('firstName');
    const lastName = get('lastName');
    const name = get('name') || `${firstName} ${lastName}`.trim() || email.split('@')[0] || phone;
    const company = get('company');
    const csvTags = get('tags').split(',').map(t => sanitizeText(t, 30)).filter(Boolean);

    /* ── AI segmentation (deterministic heuristics → marketing-ready tags) ── */
    const segTags: string[] = [];
    if (emailOk && phoneOk) segTags.push('Hot Lead');
    if (phoneOk) segTags.push('SMS-Ready');
    if (emailOk) segTags.push('Email-Ready');
    if (company) segTags.push('B2B');
    else if (emailOk && /@(gmail|yahoo|hotmail|outlook|icloud|aol|proton)/.test(email)) segTags.push('B2C');
    else if (emailOk) segTags.push('B2B');
    segTags.forEach(bump);

    const customFields: Record<string, string> = {};
    mapping.forEach((m, i) => {
      if (m === 'custom' && (row[i] ?? '').trim()) customFields[headers[i]] = sanitizeText(row[i], 200);
    });

    contacts.push({
      name, email: emailOk ? email : '', phone: phoneOk ? get('phone') : '',
      status: 'lead', tags: [...new Set([...csvTags, ...segTags])],
      source: get('source') || 'CSV import', createdAt: today, lastActivity: today, value: 0,
      firstName: firstName || undefined, lastName: lastName || undefined,
      company: company || undefined, jobTitle: get('jobTitle') || undefined,
      website: get('website') || undefined,
      customFields: Object.keys(customFields).length ? customFields : undefined,
    });
  }

  const segments = [...segCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
  return { contacts, invalid, duplicates, customHeaders, segments };
}
