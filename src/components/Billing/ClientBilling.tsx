/**
 * Plan & billing — where a customer chooses a plan and pays for it.
 *
 * Every trial customer arrives here from the trial bar's "Choose a plan", so
 * this screen has to offer a choice. It used to show one "current plan" read
 * from this browser's registry (whatever placeholder plan it held, at that
 * plan's price) and a single "Subscribe now" for it — and for a new customer,
 * whose workspace was not in the registry at all, only "No workspace is
 * selected".
 *
 * What it says about the account comes from the server (`myAccount`, the same
 * reader as the trial bar): paid, on trial, ended, or the install owner. The
 * old status came from `stripe-config.php`'s `record`, an action that endpoint
 * never had, so it could only ever say "Not subscribed" — even to somebody who
 * had paid.
 *
 * The processor is never named. The server withholds it from sub-accounts on
 * purpose (billing.ts `config`): a reseller's customers should not learn whose
 * rails the product runs on, and it may not be Stripe at all.
 */
import { canBuyPlans } from '../../services/nativeApp';
import { useState, useEffect } from 'react';
import { CreditCard, CheckCircle2, AlertTriangle, Loader, ExternalLink, ShieldCheck, Clock, Lock } from 'lucide-react';
import { getSession } from '../../services/auth';
import { activeAccount, PLANS } from '../../services/tenancy';
import { billingFor, openBillingPortal, createClientCheckout } from '../../services/billing';
import { fetchOperatorBilling } from '../../services/operatorBilling';
import { myAccount, onMyAccount, type MyAccount } from '../../services/customers';

const INK = '#17191c';
const MUTED = '#8a8f98';
const FAINT = '#b0b4ba';

export default function ClientBilling() {
  const session = getSession();
  const account = activeAccount();
  const accountId = account?.id || session?.user.accountId || '';

  /* undefined while asking; null when the server could not be asked. */
  const [acct, setAcct] = useState<MyAccount | null | undefined>(undefined);
  /* Whether the operator has connected a processor at all. null: unknown, so
     the buttons stay live and the server's own refusal says why. */
  const [payments, setPayments] = useState<boolean | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    void myAccount(true).then(a => { if (alive) setAcct(a); });
    const off = onMyAccount(a => { if (alive) setAcct(a); });
    void fetchOperatorBilling().then(r => { if (alive) setPayments(r.success ? !!r.billing?.connected : null); });
    return () => { alive = false; off(); };
  }, []);

  const trial = acct?.trial;
  const paid = trial?.kind === 'paid';
  const owner = trial?.kind === 'owner';
  /* Only meaningful for accounts older than trials, which the server cannot
     yet answer for: a checkout started from this browser and not finished. */
  const awaiting = !trial || trial.kind === 'legacy' ? billingFor(accountId).status === 'checkout_sent' : false;

  async function manage() {
    if (!session) return;
    setBusy('portal'); setError('');
    const res = await openBillingPortal(accountId, session.token);
    setBusy('');
    if (res.ok && res.url) window.location.href = res.url;
    else setError(res.error || 'Could not open the billing portal.');
  }

  async function subscribe(planId: string, planName: string) {
    if (!session || !accountId) return;
    setBusy(planId); setError('');
    const res = await createClientCheckout({
      accountId, token: session.token, planId,
      productName: `${planName} plan${account?.name ? ` — ${account.name}` : ''}`,
      customerEmail: account?.contactEmail || session.user.email,
    });
    setBusy('');
    if (res.ok && res.url) window.location.href = res.url;
    else setError(res.error || 'Could not start checkout.');
  }

  if (!accountId) {
    return (
      <div style={{ padding: 40, maxWidth: 720, margin: '0 auto' }}>
        <div style={{ background: '#fff', borderRadius: 18, padding: 40, textAlign: 'center', color: MUTED }}>
          No workspace is selected.
        </div>
      </div>
    );
  }

  const status = acct === undefined
    ? { Icon: Loader, label: 'Checking…', color: MUTED, bg: '#f1f2f4', line: '' }
    : owner
      ? { Icon: ShieldCheck, label: 'Install owner', color: '#047857', bg: '#d1fae5', line: 'You run this installation, so this account is never billed. How your customers pay you is set in Settings → Billing.' }
      : paid
        ? { Icon: CheckCircle2, label: 'Subscribed', color: '#047857', bg: '#d1fae5', line: 'Your subscription is active. Thank you.' }
        : trial?.kind === 'trial'
          ? { Icon: Clock, label: trial.daysLeft === 1 ? 'Last day of your trial' : `${trial.daysLeft} days left in your trial`, color: '#3f4a1d', bg: '#f3f8e6', line: 'No card needed until you choose a plan. Everything you make during the trial stays yours.' }
          : trial?.kind === 'ended'
            ? { Icon: Lock, label: 'Trial ended', color: '#b91c1c', bg: '#fee2e2', line: 'Choose a plan to switch the AI back on — everything you made is still here.' }
            : awaiting
              ? { Icon: Loader, label: 'Awaiting payment', color: '#b45309', bg: '#fef3c7', line: 'A checkout was started from this browser and has not been confirmed yet.' }
              : { Icon: CreditCard, label: 'Not subscribed', color: MUTED, bg: '#f1f2f4', line: 'Choose a plan below.' };

  return (
    <div style={{ padding: 'clamp(18px, 4vw, 32px) clamp(14px, 4vw, 40px)', maxWidth: 920, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <CreditCard size={22} color={INK} strokeWidth={2.4} />
        <h1 style={{ fontSize: 24, fontWeight: 800, color: INK, letterSpacing: '-0.03em', margin: 0 }}>Plan &amp; billing</h1>
      </div>
      <p style={{ color: MUTED, fontSize: 14, margin: '0 0 22px' }}>
        Your plan and payment method{account?.name ? <> for <strong style={{ color: INK }}>{account.name}</strong></> : null}.
      </p>

      <div style={{ background: '#fff', borderRadius: 18, padding: 'clamp(18px, 4vw, 28px)', marginBottom: 18 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: status.bg, color: status.color, padding: '7px 13px', borderRadius: 999, fontSize: 13, fontWeight: 700 }}>
          <status.Icon size={14} strokeWidth={2.6} className={status.Icon === Loader ? 'spin' : undefined} /> {status.label}
        </div>
        {status.line && <p style={{ color: '#3f4247', fontSize: 14, lineHeight: 1.55, margin: '12px 0 0' }}>{status.line}</p>}

        {paid && canBuyPlans() && (
          <div style={{ marginTop: 18 }}>
            <p style={{ color: MUTED, fontSize: 13.5, margin: '0 0 14px', lineHeight: 1.5 }}>
              Update your card, download invoices or cancel in the payment provider's secure portal.
            </p>
            <button onClick={manage} disabled={busy === 'portal'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: INK, color: '#fff', border: 'none', borderRadius: 12, padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy === 'portal' ? 0.7 : 1 }}>
              {busy === 'portal' ? <Loader size={15} className="spin" /> : <ExternalLink size={15} strokeWidth={2.4} />}
              Manage billing &amp; payment method
            </button>
          </div>
        )}
      </div>

      {/* In the phone apps plans are not sold (services/nativeApp.ts — the stores' billing rules). */}
      {!canBuyPlans() && !owner && (
        <p style={{ color: MUTED, fontSize: 13.5, lineHeight: 1.55, margin: '0 0 18px' }}>
          Plans and payments are not available in the app. Everything in your workspace works here the same as anywhere else.
        </p>
      )}
      {!paid && !owner && acct !== undefined && canBuyPlans() && (
        <>
          <div style={{ fontSize: 15, fontWeight: 800, color: INK, margin: '4px 0 12px' }}>Choose a plan</div>
          {payments === false && (
            <div role="status" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#fef3c7', color: '#92400e', padding: '12px 14px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.5, marginBottom: 14 }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Subscriptions cannot be started yet — payments have not been switched on for this app. Nothing is lost while you wait: everything you make stays in your workspace.</span>
            </div>
          )}
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {PLANS.map((p, i) => (
              <div key={p.id} style={{ background: '#fff', border: i === 1 ? `2px solid ${INK}` : '1px solid #e3e6ea', borderRadius: 16, padding: 18, display: 'grid', gap: 10, alignContent: 'start' }}>
                <div style={{ fontWeight: 800, color: INK }}>{p.name}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: INK }}>${p.price}<small style={{ fontSize: 13, color: MUTED, fontWeight: 600 }}>/month</small></div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6, fontSize: 13, color: '#3f4247' }}>
                  {p.features.map(f => (
                    <li key={f} style={{ display: 'flex', gap: 7 }}><CheckCircle2 size={14} color="#047857" style={{ flexShrink: 0, marginTop: 2 }} /> {f}</li>
                  ))}
                </ul>
                <button type="button" disabled={!!busy || payments === false} onClick={() => void subscribe(p.id, p.name)}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, padding: '11px 14px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                    border: `1px solid ${INK}`, background: i === 1 ? INK : '#fff', color: i === 1 ? '#c8f24d' : INK,
                    cursor: busy || payments === false ? 'default' : 'pointer', opacity: payments === false ? 0.45 : 1 }}>
                  {busy === p.id ? <Loader size={15} className="spin" /> : <>Choose {p.name}</>}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {error && (
        <div role="alert" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
          <AlertTriangle size={15} strokeWidth={2.4} style={{ flexShrink: 0 }} /> {error}
        </div>
      )}

      {!owner && (
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 7, color: FAINT, fontSize: 12 }}>
          <ShieldCheck size={14} strokeWidth={2.2} style={{ flexShrink: 0 }} /> You pay on the payment provider's secure checkout. This app never sees or stores your card.
        </div>
      )}
    </div>
  );
}
