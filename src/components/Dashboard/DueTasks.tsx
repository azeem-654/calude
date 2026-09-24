/**
 * "Due" on the dashboard: the deal tasks with a date coming up or gone.
 *
 * Only drawn when something is late, due today or due in the next three
 * days — a panel that always says "nothing due" is one people learn to skip,
 * and then miss the day it does not. The full list stays behind the badge in
 * the top bar and on the deal cards.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, ArrowRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { dueLabel, pendingTasks, taskSummary } from '../../services/dealTasks';

export default function DueTasks() {
  const { pipelines } = useApp();
  const navigate = useNavigate();
  const list = useMemo(() => pendingTasks(pipelines), [pipelines]);
  const sum = taskSummary(list);
  const urgent = list.filter(t => t.due === 'overdue' || t.due === 'today' || t.due === 'soon');
  if (!urgent.length) return null;
  const tone = sum.overdue ? { edge: '#fecaca', bg: '#fff7f7', fg: '#b42318' } : sum.today ? { edge: '#fde3b0', bg: '#fffaf0', fg: '#92400e' } : { edge: '#e2ddff', bg: '#f7f6ff', fg: '#4c39d1' };

  return (
    <section aria-label="Tasks due" style={{ borderRadius: 20, border: `1px solid ${tone.edge}`, background: tone.bg, padding: '16px 18px', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <CalendarClock size={18} color={tone.fg} />
        <b style={{ fontSize: 15, color: '#17191c' }}>
          {[sum.overdue && `${sum.overdue} overdue`, sum.today && `${sum.today} due today`, sum.soon && `${sum.soon} due soon`].filter(Boolean).join(' · ')}
        </b>
        <span style={{ fontSize: 12.5, color: '#6b7280' }}>of {sum.total} deal task{sum.total === 1 ? '' : 's'} still to do</span>
        <button type="button" onClick={() => navigate('/pipelines')} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12.5, fontWeight: 700, color: '#17191c', cursor: 'pointer', fontFamily: 'inherit' }}>
          Open deals <ArrowRight size={13} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 8 }}>
        {urgent.slice(0, 6).map(t => (
          <button key={t.id} type="button" onClick={() => navigate('/pipelines')} style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 12, border: '1px solid #eceef1', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', display: 'grid', gap: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 650, color: '#17191c', lineHeight: 1.35 }}>{t.title}</span>
            <span style={{ fontSize: 11.5, color: '#6b7280' }}>
              <b style={{ color: t.due === 'overdue' ? '#b42318' : t.due === 'today' ? '#b45309' : '#4c39d1' }}>{dueLabel(t)}</b> · {t.dealTitle}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
