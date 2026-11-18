/**
 * What an incubated module's address shows on the live app.
 *
 * A redirect to the dashboard would leave somebody holding an old bookmark
 * wondering whether they mistyped; a blank screen reads as broken. One honest
 * sentence says the module exists, is being tested, and is not open yet
 * (docs/INCUBATOR.md lists which ones and why).
 */
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';

export default function Incubated({ name, why }: { name: string; why?: string }) {
  const navigate = useNavigate();
  return (
    <div data-testid="incubated" style={{ maxWidth: 560, margin: '64px auto', padding: '0 16px', textAlign: 'center' }}>
      <div style={{ display: 'inline-flex', width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft, rgba(99,102,241,.12))', color: 'var(--accent, #6366f1)' }}>
        <Clock size={22} />
      </div>
      <h1 style={{ fontSize: 22, margin: '14px 0 6px' }}>{name} is coming soon</h1>
      <p style={{ color: 'var(--text-muted, #6b7280)', lineHeight: 1.55, margin: '0 0 18px' }}>
        {why ?? 'It is built and being tested, and is not open on your account yet.'}
      </p>
      <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>Back to the dashboard</button>
    </div>
  );
}
