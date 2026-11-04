/**
 * /appsumo — where an AppSumo buyer turns their code into a plan.
 *
 * Two ways in: a code (typed here), or AppSumo's own Activate button
 * (Licensing v2), which returns through /api/appsumo-oauth.php to
 * /appsumo#license=<one-use claim>. The claim is taken off the address bar at
 * once, kept in this browser like a typed code, and spent on the signed-in
 * account.
 *
 * One page for three people:
 *  - signed out: what each tier includes, a box for the code (kept in this
 *    browser while they create an account or sign in), and the two doors. After
 *    sign-in AppSumoHandoff (App.tsx) brings them back here with it filled in.
 *  - a customer: redeem, see the tier, stack up to three codes.
 *  - the install owner: make codes for AppSumo, import AppSumo's, revoke a
 *    refunded one, see who redeemed what.
 *
 * The tiers are read from the server's plan table (kind `deal`), so nothing
 * on this page can promise a number the server does not enforce.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowRight, Check, Download, Loader2, Ticket } from 'lucide-react';
import { LogoMark } from '../shared/Logo';
import { getSession } from '../../services/auth';
import { appsumoCall as call, type AppsumoStanding as Standing } from '../../services/appsumo';
import { APP_ORIGIN, appHref, isMarketingHost } from '../../services/hosts';
import { usePageTitle } from '../../services/pageTitle';
import { featureLines } from '../../services/allowances';
import { usePlanTable } from '../Site/PricingParts';
import { FOUNDER, SUPPORT_EMAIL } from '../Site/company';

/** The code typed before signing in, carried across sign-up in this browser. */
export const PENDING_CODE_KEY = 'pc_appsumo_code';
export function pendingAppsumoCode(): string {
  try { return localStorage.getItem(PENDING_CODE_KEY) ?? ''; } catch { return ''; }
}
function keepCode(code: string) {
  try { if (code.trim()) localStorage.setItem(PENDING_CODE_KEY, code.trim()); else localStorage.removeItem(PENDING_CODE_KEY); } catch { /* storage off */ }
}

/** The one-use claim from AppSumo's Activate button, carried across sign-up the same way. */
const PENDING_LICENSE_KEY = 'pc_appsumo_license';
function pendingLicense(): string {
  try { return localStorage.getItem(PENDING_LICENSE_KEY) ?? ''; } catch { return ''; }
}
function keepLicense(claim: string) {
  try { if (claim) localStorage.setItem(PENDING_LICENSE_KEY, claim); else localStorage.removeItem(PENDING_LICENSE_KEY); } catch { /* storage off */ }
}
/** Anything waiting to be added to the account once signed in. */
export const pendingAppsumo = () => pendingAppsumoCode() || pendingLicense();

const LICENSE_ERRORS: Record<string, string> = {
  not_connected: 'AppSumo activation is not switched on here yet. Write to support with your AppSumo order and we will set your account up by hand.',
  expired: 'AppSumo’s sign-in link had already been used or expired. Press Activate on AppSumo once more.',
  no_license: 'AppSumo did not return a license for this sign-in. Press Activate on AppSumo once more; if it repeats, write to support.',
  unreachable: 'AppSumo could not be reached just now. Press Activate on AppSumo again in a minute.',
  deactivated: 'That AppSumo purchase was refunded, so it cannot be activated.',
  replaced: 'That AppSumo purchase was upgraded or downgraded since. Press Activate on AppSumo for the current one.',
};

/** Read #license= or #license-error= once, and take it off the address bar so it is never bookmarked or shared. */
function takeFragment(): string {
  const h = window.location.hash.replace(/^#/, '');
  const m = /^license(-error)?=([\w-]{1,80})$/.exec(h);
  if (!m) return '';
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  if (m[1]) return LICENSE_ERRORS[m[2]] ?? LICENSE_ERRORS.no_license;
  keepLicense(m[2]);
  return '';
}

const INK = '#17191c', MUTED = '#5b6157', LINE = '#e4e7e2', ACCENT = '#c8f24d';
const card: CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 20, minWidth: 0 };
const input: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: `1px solid ${LINE}`, borderRadius: 10, fontSize: 16, letterSpacing: '.04em', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' };
const primary: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderRadius: 10, border: 'none', background: INK, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', textDecoration: 'none' };
const ghost: CSSProperties = { ...primary, background: '#fff', color: INK, border: `1px solid ${LINE}` };
const errStyle: CSSProperties = { color: '#b42318', fontSize: 14, marginTop: 8 };

export default function AppSumoPage() {
  usePageTitle('Redeem your AppSumo code');
  const session = isMarketingHost() ? null : getSession();
  const table = usePlanTable();
  const tiers = table.plans.filter(p => p.kind === 'deal');
  const [fragErr] = useState(takeFragment);

  return (
    <div style={{ minHeight: '100vh', background: '#f6f7f4', color: INK, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px', maxWidth: 1040, margin: '0 auto', flexWrap: 'wrap' }}>
        <a href={isMarketingHost() ? '/' : appHref('/')} style={{ display: 'flex', alignItems: 'center', gap: 10, color: INK, textDecoration: 'none', fontWeight: 800, fontSize: 18 }}>
          <LogoMark size={30} /> Protected Central
        </a>
        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, background: '#fff4d6', color: '#7a4b00', padding: '4px 10px', borderRadius: 999 }}>AppSumo lifetime deal</span>
      </header>

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '8px 16px 64px' }}>
        {fragErr && <div role="alert" style={{ ...card, borderColor: '#f4c7c3', background: '#fff6f5', color: '#7a1c12', marginBottom: 14, fontSize: 15 }}>{fragErr}</div>}
        {!session ? <SignedOut /> : session.user.role === 'agency' && session.user.accountId === null ? <OwnerTools /> : <Redeem />}

        <section style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: 22, margin: '0 0 6px' }}>What each tier includes</h2>
          <p style={{ color: MUTED, margin: '0 0 16px', fontSize: 15 }}>
            One code is Tier 1. Redeem a second or third code on the same account to move up — up to three codes stack.
            Activated from your AppSumo account instead? You get the tier you bought there.
            Allowances marked "a month" start again on the 1st. Every feature of the product is included on every tier; the tiers differ only in how much.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            {tiers.map((p, i) => (
              <div key={p.id} style={card}>
                <div style={{ fontSize: 13, color: MUTED, fontWeight: 700 }}>{i + 1} {i ? 'codes' : 'code'}</div>
                <div style={{ fontSize: 20, fontWeight: 800, margin: '2px 0 12px' }}>{p.name}</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                  {[...featureLines(p), p.support].map(l => (
                    <li key={l} style={{ display: 'flex', gap: 8, fontSize: 14, lineHeight: 1.4 }}>
                      <Check size={16} style={{ flex: 'none', marginTop: 2, color: '#3f7d00' }} /> <span style={{ minWidth: 0 }}>{l}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 36, ...card }}>
          <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>Good to know</h2>
          <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', color: MUTED, fontSize: 14, lineHeight: 1.7 }}>
            <li>Lifetime access to the tier you redeem, including future updates to it. No card is asked for here.</li>
            <li>Codes are redeemed by the account that owns the workspace. Client logins under an agency use the agency's tier.</li>
            <li>Nothing sends until you approve it: emails and texts start as drafts, from your own mailbox and domain.</li>
            <li>Refunds are handled by AppSumo under its own policy. A refunded code stops counting toward your tier.</li>
            <li>Need more than Tier 3? Plan &amp; billing offers the monthly plans on top, and you keep your codes.</li>
            <li>Help: the help button inside the app, or <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: INK, fontWeight: 700, overflowWrap: 'anywhere' }}>{SUPPORT_EMAIL}</a>. Protected Central is built and run by its founder, {FOUNDER}.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

function SignedOut() {
  const [code, setCode] = useState(pendingAppsumoCode());
  const onMarketing = isMarketingHost();
  if (!onMarketing && pendingLicense()) {
    return (
      <section style={{ ...card, padding: 24 }}>
        <h1 style={{ fontSize: 30, lineHeight: 1.15, margin: '0 0 8px', letterSpacing: '-.02em' }}>Thanks for your AppSumo purchase</h1>
        <p style={{ color: MUTED, fontSize: 16, margin: '0 0 20px' }}>
          One step left: create your Protected Central account, or sign in to the one you have. Your purchase is added to it as soon as you are in — there is nothing to copy or type.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a style={primary} href={appHref('/signup')}>Create my account <ArrowRight size={16} /></a>
          <a style={ghost} href={appHref('/login')}>I already have one — sign in</a>
        </div>
      </section>
    );
  }
  return (
    <section style={{ ...card, padding: 24 }}>
      <h1 style={{ fontSize: 30, lineHeight: 1.15, margin: '0 0 8px', letterSpacing: '-.02em' }}>Redeem your AppSumo code</h1>
      <p style={{ color: MUTED, fontSize: 16, margin: '0 0 20px' }}>
        Create your Protected Central account (or sign in), then your code is added to it. It takes about a minute.
      </p>
      {onMarketing ? (
        <a style={primary} href={`${APP_ORIGIN}/appsumo`}>Redeem on app.protectedcentral.com <ArrowRight size={16} /></a>
      ) : (
        <>
          <label htmlFor="appsumo-code" style={{ fontWeight: 700, fontSize: 14, display: 'block', marginBottom: 6 }}>Your AppSumo code</label>
          <input id="appsumo-code" data-field="appsumo.code" style={input} value={code} placeholder="PC-XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false}
            onChange={e => { setCode(e.target.value); keepCode(e.target.value); }} />
          <p style={{ color: MUTED, fontSize: 13, margin: '6px 0 18px' }}>Kept in this browser while you sign up, then added for you.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a style={primary} href={appHref('/signup')}>Create my account <ArrowRight size={16} /></a>
            <a style={ghost} href={appHref('/login')}>I already have one — sign in</a>
          </div>
        </>
      )}
    </section>
  );
}

function Redeem() {
  const session = getSession();
  const [code, setCode] = useState(pendingAppsumoCode());
  const [st, setSt] = useState<Standing | null>(null);
  const [client, setClient] = useState(false);
  /* Busy from the start when a claim is waiting: the effect below spends it. */
  const [busy, setBusy] = useState(() => !!pendingLicense());
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    const claim = pendingLicense();
    if (!claim) {
      void call('status').then(r => {
        if (r.client) setClient(true);
        else if (r.success) setSt(r as unknown as Standing);
      });
      return;
    }
    /* Back from AppSumo's Activate button and signed in: spend the claim on this account. */
    void call('claim', { license: claim }).then(async r => {
      setBusy(false);
      /* Spent or refused, it is not tried again on the next visit; the message says what to do. */
      if (r.code !== 'rate_limited') keepLicense('');
      if (r.success) {
        const s = r as unknown as Standing;
        setSt(s);
        setDone(`AppSumo purchase activated — your account is on ${s.tier?.name ?? 'the AppSumo deal'}.`);
        return;
      }
      setErr(String(r.error ?? 'That did not work.'));
      const st = await call('status');
      if (st.client) setClient(true); else if (st.success) setSt(st as unknown as Standing);
    });
  }, []);

  const redeem = async () => {
    setBusy(true); setErr(''); setDone('');
    const r = await call('redeem', { code });
    setBusy(false);
    if (!r.success) { setErr(String(r.error ?? 'That did not work.')); return; }
    keepCode('');
    setCode('');
    const s = r as unknown as Standing;
    setSt(s);
    setDone(`Code redeemed — your account is on ${s.tier?.name ?? 'the AppSumo deal'}.`);
  };

  if (client) {
    return (
      <section style={card}>
        <h1 style={{ fontSize: 26, margin: '0 0 8px' }}>Codes go on the agency's account</h1>
        <p style={{ color: MUTED, margin: 0 }}>You are signed in as a client of an agency. Ask them to redeem the code on their own account; your workspace uses their tier.</p>
      </section>
    );
  }

  const full = !!st && st.codes >= st.max;
  const licensed = !!st?.license;
  return (
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
      <div style={{ ...card, padding: 24 }}>
        <h1 style={{ fontSize: 28, lineHeight: 1.15, margin: '0 0 6px', letterSpacing: '-.02em' }}>
          {licensed ? 'Your AppSumo purchase is active' : st?.codes ? 'Add another code' : 'Redeem your AppSumo code'}
        </h1>
        <p style={{ color: MUTED, margin: '0 0 18px' }}>Signed in as <b style={{ color: INK, overflowWrap: 'anywhere' }}>{session?.user.email}</b>. {licensed ? 'It is on this account.' : 'The code is added to this account.'}</p>
        {licensed ? (
          <p style={{ margin: 0 }}>Your tier follows your AppSumo purchase. To change it, upgrade or downgrade on AppSumo — this account follows within a minute.</p>
        ) : busy && !st ? (
          <p style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={16} className="spin" /> Adding your AppSumo purchase…</p>
        ) : full ? (
          <p style={{ margin: 0 }}>You hold {st!.max} codes — the most that stack. You are on the top tier.</p>
        ) : (
          <form onSubmit={e => { e.preventDefault(); if (!busy && code.trim()) void redeem(); }}>
            <label htmlFor="appsumo-code" style={{ fontWeight: 700, fontSize: 14, display: 'block', marginBottom: 6 }}>Your AppSumo code</label>
            <input id="appsumo-code" data-field="appsumo.code" style={input} value={code} placeholder="PC-XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false}
              onChange={e => { setCode(e.target.value); setErr(''); }} />
            {err && <div role="alert" style={errStyle}>{err}</div>}
            <button type="submit" style={{ ...primary, marginTop: 14, opacity: busy || !code.trim() ? 0.6 : 1 }} disabled={busy || !code.trim()}>
              {busy ? <Loader2 size={16} className="spin" /> : <Ticket size={16} />} Redeem code
            </button>
          </form>
        )}
        {done && <div role="status" style={{ marginTop: 14, padding: 12, borderRadius: 10, background: '#f1fbd9', fontWeight: 600 }}>{done}</div>}
        {err && licensed && <div role="alert" style={errStyle}>{err}</div>}
      </div>

      <div style={{ ...card, padding: 24 }}>
        <div style={{ fontSize: 13, color: MUTED, fontWeight: 700 }}>Your deal</div>
        {!st ? <Loader2 size={18} className="spin" /> : !st.tier ? (
          <p style={{ margin: '8px 0 0', color: MUTED }}>No code redeemed yet.</p>
        ) : (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 2px' }}>{st.tier.name}</div>
            <div style={{ color: MUTED, fontSize: 14, marginBottom: 12 }}>{st.license ? 'Activated from your AppSumo account' : `${st.codes} of ${st.max} codes`}</div>
            {st.activePlan && st.activePlan.source !== 'appsumo' && st.activePlan.source !== 'default' && (
              <p style={{ fontSize: 14, background: '#f6f7f4', padding: 10, borderRadius: 8 }}>
                A monthly plan is active on this account, so it applies while it lasts. If it ends, you go back to {st.tier.name}.
              </p>
            )}
            <a style={{ ...primary, background: ACCENT, color: INK }} href={appHref('/')}>Go to my dashboard <ArrowRight size={16} /></a>
          </>
        )}
      </div>
    </section>
  );
}

interface Licensing {
  webhook: boolean; oauth: boolean;
  counts: Record<string, number>;
  holders: { email: string; tier: number; lastAt: string }[];
  lastWebhook: { event: string; at: string } | null;
  lastRejected: { at: string; signed: boolean } | null;
}
interface Summary { counts: { unused: number; redeemed: number; revoked: number }; redeemers: { email: string; codes: number; planId: string | null; lastAt: string }[]; licensing?: Licensing }

/**
 * AppSumo's Activate button (Licensing v2), set up in its Partner Portal. The
 * page names which Cloudflare secrets are in place — never their values — and
 * the two addresses to paste, so the owner can see it is connected before a
 * buyer finds out it is not.
 */
function LicensingCard({ l }: { l: Licensing }) {
  const row = (okay: boolean, label: string, how: string) => (
    <li style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.45 }}>
      {okay ? <Check size={16} style={{ flex: 'none', marginTop: 2, color: '#3f7d00' }} /> : <span style={{ flex: 'none', width: 16, textAlign: 'center', color: '#b42318', fontWeight: 800 }}>!</span>}
      <span style={{ minWidth: 0 }}><b>{label}</b> — {okay ? 'set.' : how}</span>
    </li>
  );
  const url = (u: string) => <code style={{ display: 'block', background: '#f6f7f4', border: `1px solid ${LINE}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, overflowWrap: 'anywhere', marginTop: 4 }}>{u}</code>;
  return (
    <div style={card}>
      <h2 style={{ fontSize: 17, margin: '0 0 6px' }}>AppSumo's Activate button (Licensing)</h2>
      <p style={{ color: MUTED, fontSize: 14, margin: '0 0 12px' }}>
        The other way AppSumo hands buyers over: they press Activate on AppSumo and arrive here signed up, with their tier — no code to copy. Use it if AppSumo's Redemption step asks for Licensing rather than codes.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'grid', gap: 6 }}>
        {row(l.webhook, 'APPSUMO_API_KEY', 'not set. Copy the API key from the Partner Portal → your product, then Cloudflare → Workers & Pages → crmpro → Settings → Variables and Secrets → Add, type Secret.')}
        {row(l.oauth, 'APPSUMO_CLIENT_ID and APPSUMO_CLIENT_SECRET', 'not set. AppSumo shows them once both addresses below validate; add each as a Secret the same way.')}
      </ul>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Webhook URL</div>
      {url(`${APP_ORIGIN}/api/appsumo-webhook.php`)}
      <div style={{ fontSize: 13, fontWeight: 700, marginTop: 10 }}>OAuth Redirect URL</div>
      {url(`${APP_ORIGIN}/api/appsumo-oauth.php`)}
      <p style={{ color: MUTED, fontSize: 13, margin: '12px 0 0' }}>
        {l.lastWebhook ? `Last signed webhook: ${l.lastWebhook.event}, ${l.lastWebhook.at.slice(0, 16).replace('T', ' ')} UTC.` : 'No signed webhook has arrived yet.'}
        {' '}Licenses: {(l.counts.active ?? 0).toLocaleString('en-US')} active, {(l.counts.pending ?? 0).toLocaleString('en-US')} bought but not activated, {(l.counts.deactivated ?? 0).toLocaleString('en-US')} refunded.
        {' '}Refunds and tier changes arrive from AppSumo by themselves; there is nothing to revoke by hand.
      </p>
      {l.lastRejected && (!l.lastWebhook || l.lastRejected.at > l.lastWebhook.at) && (
        <p role="alert" style={{ ...errStyle, fontSize: 13 }}>
          A webhook was refused at {l.lastRejected.at.slice(0, 16).replace('T', ' ')} UTC because {l.lastRejected.signed ? 'its signature did not match APPSUMO_API_KEY' : 'it was not signed'}.
          If that was AppSumo, check the key is the one in the Partner Portal; AppSumo retries, so nothing is lost once it is right.
        </p>
      )}
    </div>
  );
}

function OwnerTools() {
  const [sum, setSum] = useState<Summary | null>(null);
  /* AppSumo's Redemption step takes between 1,000 and 10,000 codes. */
  const [count, setCount] = useState('1000');
  const [batch, setBatch] = useState('');
  const [paste, setPaste] = useState('');
  const [revoke, setRevoke] = useState('');
  const [made, setMade] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ field: string; text: string; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState('');

  const load = () => void call('summary').then(r => { if (r.success) setSum(r as unknown as Summary); });
  useEffect(load, []);

  const download = (codes: string[], name: string) => {
    /* AppSumo's upload wants one column, plain text and no header row. */
    const url = URL.createObjectURL(new Blob([`${codes.join('\n')}\n`], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${name}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const run = async (action: string, extra: Record<string, unknown>, field: string) => {
    setBusy(action); setMsg(null);
    const r = await call(action, extra);
    setBusy('');
    if (!r.success) { setMsg({ field: String(r.field ?? field), text: String(r.error ?? 'That did not work.') }); return; }
    if (action === 'generate') {
      const codes = (r.codes as string[]) ?? [];
      setMade(codes);
      download(codes, String(r.batch));
      setMsg({ field, ok: true, text: `${codes.length} codes made and downloaded as ${String(r.batch)}.csv. They are shown here once only — keep the file.` });
    } else if (action === 'import') {
      setPaste('');
      setMsg({ field, ok: true, text: `${String(r.count)} codes imported into ${String(r.batch)}. A code already here was left as it was.` });
    } else {
      setRevoke('');
      setMsg({ field, ok: true, text: r.already ? 'That code was already revoked.' : r.wasRedeemed ? `Revoked. ${String(r.email)} is now on ${r.planId ? String(r.planId).replace('appsumo_', 'AppSumo Tier ') : 'no AppSumo tier'}.` : 'Revoked. Nobody had redeemed it.' });
    }
    load();
  };
  const note = (field: string) => msg && msg.field === field
    ? <div role={msg.ok ? 'status' : 'alert'} style={msg.ok ? { marginTop: 8, fontSize: 14, color: '#3f6b00' } : errStyle}>{msg.text}</div> : null;

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <div style={{ ...card, padding: 24 }}>
        <h1 style={{ fontSize: 26, margin: '0 0 6px' }}>AppSumo codes</h1>
        <p style={{ color: MUTED, margin: 0 }}>
          You are the install owner. Make codes and upload the file to AppSumo's Redemption step, or import the list AppSumo gave you.
          Buyers redeem them at <b style={{ color: INK }}>{APP_ORIGIN}/appsumo</b>.
        </p>
        {sum && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            {(['unused', 'redeemed', 'revoked'] as const).map(k => (
              <div key={k} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 14px', minWidth: 110 }}>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{sum.counts[k].toLocaleString('en-US')}</div>
                <div style={{ fontSize: 13, color: MUTED, textTransform: 'capitalize' }}>{k}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        <div style={card}>
          <h2 style={{ fontSize: 17, margin: '0 0 10px' }}>Make codes</h2>
          <p style={{ color: MUTED, fontSize: 14, margin: '0 0 8px' }}>AppSumo takes 1,000 to 10,000. The file is one column with no header, as its upload asks.</p>
          <label style={{ fontSize: 13, fontWeight: 700 }}>How many
            <input data-field="appsumo.count" style={{ ...input, fontFamily: 'inherit', marginTop: 4 }} inputMode="numeric" value={count} onChange={e => setCount(e.target.value)} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginTop: 10 }}>Batch name (optional)
            <input style={{ ...input, fontFamily: 'inherit', marginTop: 4 }} value={batch} placeholder="appsumo-launch" onChange={e => setBatch(e.target.value)} />
          </label>
          <button type="button" style={{ ...primary, marginTop: 12 }} disabled={!!busy} onClick={() => void run('generate', { count: Number(count), batch }, 'appsumo.count')}>
            {busy === 'generate' ? <Loader2 size={16} className="spin" /> : <Download size={16} />} Make and download
          </button>
          {note('appsumo.count')}
          {made.length > 0 && (
            <textarea readOnly value={made.join('\n')} style={{ ...input, fontSize: 13, height: 120, marginTop: 10 }} aria-label="Codes just made" />
          )}
        </div>

        <div style={card}>
          <h2 style={{ fontSize: 17, margin: '0 0 10px' }}>Import AppSumo's codes</h2>
          <textarea data-field="appsumo.codes" style={{ ...input, fontSize: 13, height: 120 }} value={paste} placeholder="One code per line" onChange={e => setPaste(e.target.value)} />
          <button type="button" style={{ ...ghost, marginTop: 10 }} disabled={!!busy || !paste.trim()} onClick={() => void run('import', { codes: paste, batch }, 'appsumo.codes')}>
            {busy === 'import' ? <Loader2 size={16} className="spin" /> : null} Import
          </button>
          {note('appsumo.codes')}
        </div>

        <div style={card}>
          <h2 style={{ fontSize: 17, margin: '0 0 10px' }}>A refunded code</h2>
          <p style={{ color: MUTED, fontSize: 14, margin: '0 0 8px' }}>AppSumo lists refunded codes in the Partner Portal. Revoking one lowers that buyer's tier.</p>
          <input data-field="appsumo.revoke" style={input} value={revoke} placeholder="PC-XXXX-XXXX-XXXX" onChange={e => setRevoke(e.target.value)} />
          <button type="button" style={{ ...ghost, marginTop: 10 }} disabled={!!busy || !revoke.trim()} onClick={() => void run('revoke', { code: revoke }, 'appsumo.revoke')}>
            {busy === 'revoke' ? <Loader2 size={16} className="spin" /> : null} Revoke
          </button>
          {note('appsumo.revoke')}
        </div>
      </div>

      {sum?.licensing && <LicensingCard l={sum.licensing} />}

      {sum && (sum.redeemers.length > 0 || (sum.licensing?.holders.length ?? 0) > 0) && (
        <div style={{ ...card, overflowX: 'auto' }}>
          <h2 style={{ fontSize: 17, margin: '0 0 10px' }}>Who redeemed</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead><tr style={{ textAlign: 'left', color: MUTED }}><th style={{ padding: 6 }}>Account</th><th style={{ padding: 6 }}>How</th><th style={{ padding: 6 }}>Last</th></tr></thead>
            <tbody>
              {sum.redeemers.map(r => (
                <tr key={`c-${r.email}`} style={{ borderTop: `1px solid ${LINE}` }}>
                  <td style={{ padding: 6, overflowWrap: 'anywhere' }}>{r.email}</td>
                  <td style={{ padding: 6 }}>{r.codes} {r.codes === 1 ? 'code' : 'codes'}</td>
                  <td style={{ padding: 6, whiteSpace: 'nowrap' }}>{r.lastAt.slice(0, 10)}</td>
                </tr>
              ))}
              {(sum.licensing?.holders ?? []).map(r => (
                <tr key={`l-${r.email}`} style={{ borderTop: `1px solid ${LINE}` }}>
                  <td style={{ padding: 6, overflowWrap: 'anywhere' }}>{r.email}</td>
                  <td style={{ padding: 6 }}>Activated, Tier {r.tier}</td>
                  <td style={{ padding: 6, whiteSpace: 'nowrap' }}>{r.lastAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
