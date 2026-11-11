/**
 * The business workspace's 12-month marketing plan, on its Overview.
 *
 * Twelve months in a row, this month marked — the agents write to it on
 * every run (worker/src/lib/projectAgents.ts `monthPlan`). When the plan is
 * the universal one (the AI could not write a tailored plan during the build,
 * or the customer chose it), it says so with the reason and offers to write a
 * tailored one; that replaces the plan on the brief and on every agent step
 * at once (routes/projects.ts `save_year`), so the next run follows it.
 */
import { useState } from 'react';
import { CalendarRange, Loader, Wand2 } from 'lucide-react';
import type { MarketingYear } from '../../services/marketingYear';
import { planYear } from '../../services/intake';
import { saveYear } from '../../services/projects';
import { aiJob } from '../../lib/gemini';
import { T } from './theme';

const label = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });
};

export default function YearPlan({ projectId, year, business, onSaved }: {
  projectId: string;
  year: MarketingYear;
  business: { companyName: string; description: string; audience?: string; offer?: string };
  onSaved?: (y: MarketingYear) => void;
}) {
  const [plan, setPlan] = useState(year);
  const [busy, setBusy] = useState(false);
  const [say, setSay] = useState('');
  const now = new Date().toISOString().slice(0, 7);
  const current = plan.months.find(m => m.month === now) ?? [...plan.months].reverse().find(m => m.month <= now) ?? plan.months[0];
  const [open, setOpen] = useState(current?.month ?? '');
  const shown = plan.months.find(m => m.month === open) ?? current;

  const rewrite = async () => {
    setBusy(true); setSay('');
    const { value: next, creditsOut } = await aiJob(() => planYear(business));
    if (next.source !== 'ai') {
      setSay(next.note || 'The AI could not write a tailored plan just now — the universal plan stays in place.');
    } else {
      /* The new months keep this plan's calendar: month 1 is still the month it started. */
      const dated: MarketingYear = { ...next, months: next.months.map((m, i) => ({ ...m, month: plan.months[i]?.month ?? m.month })) };
      const r = await saveYear(projectId, dated);
      if (r.success && r.year) {
        setPlan(r.year);
        onSaved?.(r.year);
        setSay(`Written for ${business.companyName || 'the business'}. ${r.workflows ? `The ${r.workflows === 1 ? 'agent follows' : `${r.workflows} agents follow`} it from the next run.` : ''}`);
      } else setSay(r.error ?? 'The new plan could not be saved.');
    }
    if (creditsOut) setSay(s => `${s} ${creditsOut}`.trim());
    setBusy(false);
  };

  return (
    <div style={{ border: `1px solid ${T.line}`, borderRadius: 14, padding: '12px 13px', background: T.panel, minWidth: 0 }} data-testid="year-plan">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.07em', color: T.muted, textTransform: 'uppercase', display: 'flex', gap: 6, alignItems: 'center' }}>
          <CalendarRange size={12} /> 12-month marketing plan · {plan.source === 'ai' ? 'written for this business' : 'universal plan'}
        </h4>
        {plan.source !== 'ai' && (
          <button onClick={() => void rewrite()} disabled={busy} data-field="year.rewrite"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, border: 'none', background: T.accent, color: '#fff', fontWeight: 700, fontSize: 12, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.7 : 1 }}>
            {busy ? <Loader size={12} className="spin" /> : <Wand2 size={12} />} {busy ? 'Writing…' : 'Write my plan'}
          </button>
        )}
      </div>
      {plan.source !== 'ai' && plan.note && !say && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{plan.note}</p>
      )}
      {say && <p role="status" style={{ margin: '0 0 8px', fontSize: 12, color: T.ink, lineHeight: 1.5 }}>{say}</p>}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
        {plan.months.map(m => {
          const isNow = m.month === current?.month;
          const isOpen = m.month === shown?.month;
          return (
            <button key={m.month} onClick={() => setOpen(m.month)} aria-pressed={isOpen}
              style={{ flex: '0 0 auto', minWidth: 92, maxWidth: 130, textAlign: 'left', padding: '7px 9px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                border: `1.5px solid ${isOpen ? T.accent : T.line}`, background: isNow ? T.accentSoft : 'transparent' }}>
              <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, color: isNow ? T.accent : T.muted }}>{label(m.month)}{isNow ? ' · now' : ''}</span>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.ink, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.theme}</span>
            </button>
          );
        })}
      </div>
      {shown && (
        <div style={{ marginTop: 8 }}>
          <p style={{ margin: '0 0 6px', fontSize: 12.5, color: T.ink, lineHeight: 1.5 }}><b>{shown.theme}.</b> {shown.focus}</p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
            {shown.ideas.map(i => <li key={i} style={{ fontSize: 12, color: T.ink, lineHeight: 1.45 }}>• {i}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
