import { useState, useEffect } from 'react';
import { CreditCard, CheckCircle2, AlertTriangle, XCircle, Loader, ExternalLink, ShieldCheck, Sparkles } from 'lucide-react';
import { getSession } from '../../services/auth';
import { activeAccount, planById } from '../../services/tenancy';
import { billingFor, fetchBillingRecord, openBillingPortal, createClientCheckout, updateBilling } from '../../services/billing';
import type { BillingRecord } from '../../services/billing';

const INK = '#17191c';
const MUTED = '#8a8f98';
const FAINT = '#b0b4ba';

type Status = BillingRecord['status'];

const STATUS_META: Record<Status, { label: string; color: string; bg: string; Icon: typeof CheckCircle2 }> = {
  none:          { label: 'Not subscribed', color: '#8a8f98', bg: '#f1f2f4', Icon: CreditCard },
  checkout_sent: { label: 'Awaiting payment', color: '#b45309', bg: '#fef3c7', Icon: Loader },
  active:        { label: 'Active', color: '#047857', bg: '#d1fae5', Icon: CheckCircle2 },
  past_due:      { label: 'Past due', color: '#b45309', bg: '#fef3c7', Icon: AlertTriangle },
  cancelled:     { label: 'Cancelled', color: '#b91c1c', bg: '#fee2e2', Icon: XCircle },
};

export default function ClientBilling() {
  const session = getSession();
  const account = activeAccount();
  const accountId = account?.id || session?.user.accountId || '';
  const plan = account ? planById(account.plan) : null;
  const price = account?.price ?? plan?.price ?? 0;

  const [record, setRecord] = useState<BillingRecord>(() => billingFor(accountId));
  const [hasCustomer, setHasCustomer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'' | 'portal' | 'checkout'>('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!accountId || !session) { setLoading(false); return; }
      const remote = await fetchBillingRecord(accountId, session.token);
      if (!alive) return;
      if (remote) {
        setHasCustomer(remote.hasCustomer);
        updateBilling(accountId, { status: remote.status });
        setRecord(billingFor(accountId));
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [accountId, session]);

  const meta = STATUS_META[record.status] ?? STATUS_META.none;
  const isActive = record.status === 'active';

  async function manage() {
    if (!session) return;
    setBusy('portal'); setError('');
    const res = await openBillingPortal(accountId, session.token);
    setBusy('');
    if (res.ok && res.url) window.location.href = res.url;
    else setError(res.error || 'Could not open the billing portal.');
  }

  async function subscribe() {
    if (!session || !account) return;
    setBusy('checkout'); setError('');
    const res = await createClientCheckout({
      accountId, token: session.token,
      productName: `${plan?.name || 'Subscription'} plan — ${account.name}`,
      amount: price, customerEmail: account.contactEmail || session.user.email,
    });
    setBusy('');
    if (res.ok && res.url) window.location.href = res.url;
    else setError(res.error || 'Could not start checkout.');
  }

  if (!account) {
    return (
      <div style={{ padding: 40, maxWidth: 720, margin: '0 auto' }}>
        <div style={{ background: '#fff', borderRadius: 18, padding: 40, textAlign: 'center', color: MUTED }}>
          No workspace is selected.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 820, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <CreditCard size={22} color={INK} strokeWidth={2.4} />
        <h1 style={{ fontSize: 24, fontWeight: 800, color: INK, letterSpacing: '-0.03em', margin: 0 }}>Billing & Subscription</h1>
      </div>
      <p style={{ color: MUTED, fontSize: 14, margin: '0 0 24px' }}>
        Manage your plan and payment method for <strong style={{ color: INK }}>{account.name}</strong>.
      </p>

      {/* Plan / status card */}
      <div style={{ background: '#fff', borderRadius: 18, padding: 28, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, color: FAINT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current plan</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 30, fontWeight: 800, color: INK, letterSpacing: '-0.03em' }}>{plan?.name || 'Custom'}</span>
              <span style={{ fontSize: 16, color: MUTED, fontWeight: 600 }}>${price}<span style={{ fontSize: 13, color: FAINT }}>/mo</span></span>
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: meta.bg, color: meta.color, padding: '7px 13px', borderRadius: 999, fontSize: 13, fontWeight: 700 }}>
            {loading ? <Loader size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <meta.Icon size={14} strokeWidth={2.6} />}
            {loading ? 'Checking…' : meta.label}
          </div>
        </div>

        {plan && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '22px 0 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px 20px' }}>
            {plan.features.map(f => (
              <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: '#3f4247' }}>
                <CheckCircle2 size={15} color="#047857" strokeWidth={2.4} /> {f}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Actions */}
      <div style={{ background: '#fff', borderRadius: 18, padding: 28 }}>
        {isActive || hasCustomer ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: INK, marginBottom: 4 }}>Payment method & invoices</div>
            <p style={{ color: MUTED, fontSize: 13.5, margin: '0 0 18px', lineHeight: 1.5 }}>
              Update your card, download invoices, or cancel your subscription in the secure Stripe portal.
            </p>
            <button onClick={manage} disabled={busy === 'portal'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: INK, color: '#fff', border: 'none', borderRadius: 12, padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy === 'portal' ? 0.7 : 1 }}>
              {busy === 'portal' ? <Loader size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> : <ExternalLink size={15} strokeWidth={2.4} />}
              Manage billing & payment method
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: INK, marginBottom: 4 }}>Subscribe to activate your workspace</div>
            <p style={{ color: MUTED, fontSize: 13.5, margin: '0 0 18px', lineHeight: 1.5 }}>
              Start your <strong style={{ color: INK }}>{plan?.name}</strong> subscription at <strong style={{ color: INK }}>${price}/mo</strong>. You'll be taken to Stripe's secure checkout.
            </p>
            <button onClick={subscribe} disabled={busy === 'checkout'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: INK, color: '#fff', border: 'none', borderRadius: 12, padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy === 'checkout' ? 0.7 : 1 }}>
              {busy === 'checkout' ? <Loader size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Sparkles size={15} strokeWidth={2.4} />}
              Subscribe now
            </button>
          </>
        )}

        {error && (
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
            <AlertTriangle size={15} strokeWidth={2.4} /> {error}
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 7, color: FAINT, fontSize: 12 }}>
          <ShieldCheck size={14} strokeWidth={2.2} /> Payments are processed securely by Stripe. We never store your card details.
        </div>
      </div>
    </div>
  );
}
