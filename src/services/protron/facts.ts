/**
 * The browser half of identity.ts: reads what the app already holds about the
 * signed-in person (session, workspace, Settings → Profile, the onboarding
 * profile, Protron's prefs) and hands it to the pure `gatherFacts`.
 * Shared by the floating panel and the wizard's first screen.
 */
import { activeAccount } from '../tenancy';
import { getSession } from '../auth';
import { gatherFacts, type KnownFacts } from './identity';
import { loadPrefs, type Prefs } from './memory';

/** Everything already known about the customer, read fresh (identity.ts). */
export function readFacts(prefs: Prefs = loadPrefs()): KnownFacts {
  const s = getSession();
  const acct = activeAccount();
  const json = (k: string) => { try { return JSON.parse(localStorage.getItem(k) || 'null') as Record<string, unknown> | null; } catch { return null; } };
  const profile = json('crm_profile');
  const onboarding = (json('crm_onboarding')?.profile ?? null) as Record<string, unknown> | null;
  return gatherFacts({
    name: s?.user.name, email: s?.user.email,
    accountBusiness: acct?.businessName, accountIndustry: acct?.industry,
    profileCompany: typeof profile?.company === 'string' ? profile.company : '',
    onboardingCompany: typeof onboarding?.companyName === 'string' ? onboarding.companyName : '',
    onboardingWebsite: typeof onboarding?.website === 'string' ? onboarding.website : '',
    onboardingIndustry: typeof onboarding?.industry === 'string' ? onboarding.industry : '',
    business: prefs.business, siteCheck: prefs.siteCheck,
  });
}

