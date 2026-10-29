/**
 * The businesses a design can be made for, from what the customer has
 * already told the product — so a template opens with their name, logo,
 * colours, services and contact details in it rather than as a blank form.
 *
 * Two places hold that: each AI Autopilot business workspace's profile
 * (crm_portfolios, read from the server — an agency has one per client) and
 * the workspace's own onboarding profile. Nothing is filled in that the
 * customer did not write; a missing field stays empty and the editor asks.
 */
import { fetchBoard } from '../../../services/projects';
import { loadOnboarding } from '../../../services/onboarding';
import { hex } from '../../../../worker/src/lib/design/spec';
import type { Business } from '../../../../worker/src/lib/design/content';

const split = (v: string) => v.split(/\n|;|,(?![^(]*\))|\s·\s/).map(x => x.replace(/^[-•*\d.)\s]+/, '').trim()).filter(x => x.length > 1 && x.length < 60).slice(0, 6);
const pick = (p: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) { const v = p[k]; if (typeof v === 'string' && v.trim()) return v.trim(); }
  return '';
};

function fromProfile(id: string | undefined, fallbackName: string, p: Record<string, unknown>): Business {
  return {
    id,
    name: pick(p, 'companyName', 'businessName', 'name') || fallbackName,
    industry: pick(p, 'industry', 'trade', 'category'),
    description: pick(p, 'description', 'whatYouDo', 'about'),
    services: split(pick(p, 'services', 'products', 'offerings')),
    website: pick(p, 'website', 'url').replace(/^https?:\/\//, '').replace(/\/$/, ''),
    phone: pick(p, 'phone', 'telephone'),
    email: pick(p, 'email'),
    address: pick(p, 'address', 'location', 'city'),
    logo: /^(data:image\/|https:\/\/)/.test(pick(p, 'logoUrl', 'logo')) ? pick(p, 'logoUrl', 'logo') : '',
    colors: { primary: hex(pick(p, 'brandColor', 'color', 'bg'), '#3e63dd'), secondary: hex(pick(p, 'brandColor2', 'bg2'), '') || undefined, accent: hex(pick(p, 'accent', 'accentColor'), '') || undefined },
    offer: pick(p, 'offer'),
  };
}

let cached: { at: number; list: Business[] } | null = null;

/** The workspace's businesses, the onboarding profile first when it names one. */
export async function loadBusinesses(force = false): Promise<Business[]> {
  if (!force && cached && Date.now() - cached.at < 60_000) return cached.list;
  const out: Business[] = [];
  try {
    const ob = loadOnboarding().profile as unknown as Record<string, unknown>;
    if (pick(ob, 'companyName')) out.push(fromProfile('workspace', 'My business', ob));
  } catch { /* no onboarding yet */ }
  const board = await fetchBoard().catch(() => ({ portfolios: [] as { id: string; name: string; profile: Record<string, string> }[] }));
  for (const p of (board.portfolios ?? []) as { id: string; name: string; profile: Record<string, string> }[]) {
    const b = fromProfile(p.id, p.name, p.profile ?? {});
    if (!out.some(x => x.name.toLowerCase() === b.name.toLowerCase())) out.push(b);
    else { const i = out.findIndex(x => x.name.toLowerCase() === b.name.toLowerCase()); out[i] = { ...out[i], ...Object.fromEntries(Object.entries(b).filter(([, v]) => (Array.isArray(v) ? v.length : !!v))), id: b.id } as Business; }
  }
  if (!out.length) out.push(fromProfile(undefined, '', {}));
  cached = { at: Date.now(), list: out };
  return out;
}

/** What a business profile is missing that designs commonly use — said on screen, never guessed. */
export function profileGaps(b: Business): string[] {
  return [
    !b.name && 'business name', !b.logo && 'logo', !b.services.length && 'services or products',
    !b.website && 'website', !b.phone && 'phone number',
  ].filter(Boolean) as string[];
}
