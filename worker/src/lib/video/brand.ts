/**
 * The brand a video is made in — read from what the workspace already holds.
 *
 * The portfolio (the Autopilot project's, else the workspace's first) and the
 * onboarding profile already know the company, what it does, the website,
 * the brand colour and the logo. Video Studio reads those rather than asking
 * again; its own Brand Kit only adds what is video-specific (an accent, a
 * call to action, social handles) or overrides a colour.
 *
 * The logo is a data URL on the portfolio (a ≤320 px PNG the browser made);
 * the engine can only fetch URLs, so it is copied once into the workspace's
 * own corner of R2 and handed over with a signed link.
 */
import type { Env } from '../db';
import { dataGet, nowIso } from '../db';
import { workspacePrefix } from './store';

export interface VideoBrand {
  company: string;
  description: string;
  website: string;
  color: string;
  accent: string;
  cta: string;
  handles: string;
  logoKey: string;
  /** Where each value came from, for the Brand Kit screen. */
  from: Record<string, 'portfolio' | 'onboarding' | 'video kit' | 'default'>;
}

export interface VideoKit { color?: string; accent?: string; cta?: string; handles?: string; useLogo?: boolean }

const HEX = /^#[0-9a-fA-F]{6}$/;
const parse = <T>(s: string | null | undefined, d: T): T => { try { return s ? JSON.parse(s) as T : d; } catch { return d; } };

export async function kitOf(env: Env, accountId: string): Promise<VideoKit> {
  const row = await env.DB.prepare('SELECT kit FROM crm_video_brand WHERE account_id = ?').bind(accountId).first<{ kit: string }>().catch(() => null);
  return parse<VideoKit>(row?.kit, {});
}

export async function saveKit(env: Env, accountId: string, kit: VideoKit): Promise<VideoKit> {
  const clean: VideoKit = {
    ...(kit.color && HEX.test(kit.color) ? { color: kit.color } : {}),
    ...(kit.accent && HEX.test(kit.accent) ? { accent: kit.accent } : {}),
    ...(typeof kit.cta === 'string' ? { cta: kit.cta.trim().slice(0, 140) } : {}),
    ...(typeof kit.handles === 'string' ? { handles: kit.handles.trim().slice(0, 200) } : {}),
    ...(typeof kit.useLogo === 'boolean' ? { useLogo: kit.useLogo } : {}),
  };
  await env.DB.prepare(
    `INSERT INTO crm_video_brand (account_id, kit, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET kit = excluded.kit, updated_at = excluded.updated_at`,
  ).bind(accountId, JSON.stringify(clean), nowIso()).run();
  return clean;
}

async function sha(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function brandOf(env: Env, accountId: string, autopilotProjectId?: string | null): Promise<VideoBrand> {
  let profile: Record<string, string> = {};
  let fromPortfolio = false;
  if (autopilotProjectId) {
    const row = await env.DB.prepare(
      'SELECT f.profile FROM crm_projects p JOIN crm_portfolios f ON f.id = p.portfolio_id AND f.account_id = p.account_id WHERE p.id = ? AND p.account_id = ?',
    ).bind(autopilotProjectId, accountId).first<{ profile: string }>().catch(() => null);
    profile = parse(row?.profile, {});
    fromPortfolio = !!row;
  }
  if (!profile.companyName) {
    const row = await env.DB.prepare('SELECT profile FROM crm_portfolios WHERE account_id = ? ORDER BY created_at LIMIT 1')
      .bind(accountId).first<{ profile: string }>().catch(() => null);
    if (row) { profile = { ...parse<Record<string, string>>(row.profile, {}), ...profile }; fromPortfolio = true; }
  }
  const ob = parse<Record<string, unknown>>(await dataGet(env.DB, accountId, 'crm_onboarding').catch(() => null), {});
  const obp = { ...(ob as Record<string, string>), ...((ob.profile as Record<string, string>) ?? {}) };
  const kit = await kitOf(env, accountId);
  const from: VideoBrand['from'] = {};
  const pick = (name: string, ...vals: [string | undefined, VideoBrand['from'][string]][]) => {
    for (const [v, src] of vals) if (v && String(v).trim()) { from[name] = src; return String(v).trim(); }
    from[name] = 'default';
    return '';
  };
  const src = fromPortfolio ? 'portfolio' as const : 'onboarding' as const;
  const color = pick('color', [kit.color, 'video kit'], [HEX.test(profile.brandColor ?? '') ? profile.brandColor : undefined, src], [HEX.test(obp.brandColor ?? '') ? obp.brandColor : undefined, 'onboarding']) || '#5b46e5';
  const brand: VideoBrand = {
    company: pick('company', [profile.companyName, src], [obp.companyName, 'onboarding']),
    description: pick('description', [profile.description, src], [obp.description, 'onboarding']),
    website: pick('website', [profile.website, src], [obp.website, 'onboarding']),
    color,
    accent: pick('accent', [kit.accent, 'video kit']) || '#a3e635',
    cta: pick('cta', [kit.cta, 'video kit'], [profile.cta ?? profile.callToAction, src]),
    handles: pick('handles', [kit.handles, 'video kit'], [profile.socials, src]),
    logoKey: '',
    from,
  };
  const logo = String(profile.logoUrl ?? '');
  if (kit.useLogo !== false && env.VIDEO && /^data:image\/png;base64,/.test(logo) && logo.length < 600_000) {
    const key = `${workspacePrefix(accountId)}brand/logo-${await sha(logo)}.png`;
    if (!(await env.VIDEO.head(key))) {
      const bytes = Uint8Array.from(atob(logo.slice(logo.indexOf(',') + 1)), c => c.charCodeAt(0));
      await env.VIDEO.put(key, bytes, { httpMetadata: { contentType: 'image/png' } });
    }
    brand.logoKey = key;
    from.logo = src;
  } else from.logo = 'default';
  return brand;
}
