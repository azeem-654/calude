/**
 * The round badge in the top bar: how many deal tasks are still to do.
 *
 * A project's to-do list lives on its deal card, which is a screen somebody
 * has to remember to open. This keeps the number in view everywhere in the
 * app, coloured by the most urgent thing in it — red if something is late,
 * amber if something is due today — and opens onto the next few tasks with
 * their dates. Once a day it also says so out loud (a notification) when
 * something is late or due today, so a deadline is not only a colour.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListChecks, ArrowRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { dueLabel, pendingTasks, taskSummary } from '../../services/dealTasks';

const REMINDED = 'crm_task_reminded_on';

export default function TaskBadge({ style }: { style: React.CSSProperties }) {
  const { pipelines, addNotification } = useApp();
  const navigate = useNavigate();
  const list = useMemo(() => pendingTasks(pipelines), [pipelines]);
  const sum = taskSummary(list);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  /* Once a day, per workspace (the key is workspace-scoped by tenancy). */
  useEffect(() => {
    if (!sum.overdue && !sum.today) return;
    const today = new Date().toISOString().slice(0, 10);
    let last = '';
    try { last = window.localStorage.getItem(REMINDED) ?? ''; } catch { return; }
    if (last === today) return;
    try { window.localStorage.setItem(REMINDED, today); } catch { /* storage off */ }
    const parts = [sum.overdue ? `${sum.overdue} overdue` : '', sum.today ? `${sum.today} due today` : ''].filter(Boolean).join(' and ');
    addNotification(`Deal tasks: ${parts}. Open the badge in the top bar to see them.`, 'info');
  }, [sum.overdue, sum.today, addNotification]);

  if (!sum.total) return null;
  const tone = sum.overdue ? '#e5484d' : sum.today ? '#f59e0b' : '#5b46e5';

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        title="Tasks to do in your deals"
        aria-label={`${sum.total} deal tasks to do${sum.overdue ? `, ${sum.overdue} overdue` : ''}${sum.today ? `, ${sum.today} due today` : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="icon-btn"
        style={{ ...style, position: 'relative' }}
      >
        <ListChecks size={16} strokeWidth={2.2} />
        <span style={{
          position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, padding: '0 5px', boxSizing: 'border-box',
          borderRadius: 999, background: tone, color: '#fff', fontSize: 11, fontWeight: 800,
          display: 'grid', placeItems: 'center', border: '2px solid #fff', lineHeight: 1,
        }}>{sum.total > 99 ? '99+' : sum.total}</span>
      </button>

      {open && (
        <div role="menu" aria-label="Deal tasks" style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 300, width: 340, maxWidth: 'calc(100vw - 24px)',
          background: '#fff', borderRadius: 18, padding: 8, boxShadow: '0 16px 40px -8px rgba(23,25,28,0.22)',
        }}>
          <div style={{ padding: '6px 10px 8px' }}>
            <b style={{ fontSize: 13, color: '#17191c' }}>{sum.total} task{sum.total === 1 ? '' : 's'} to do</b>
            <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>
              {[sum.overdue && `${sum.overdue} overdue`, sum.today && `${sum.today} due today`, sum.soon && `${sum.soon} in the next 3 days`].filter(Boolean).join(' · ') || 'Nothing due in the next few days'}
            </div>
          </div>
          <div style={{ display: 'grid', maxHeight: 320, overflowY: 'auto' }}>
            {list.slice(0, 8).map(t => (
              <button key={t.id} type="button" role="menuitem" onClick={() => { setOpen(false); navigate('/pipelines'); }}
                style={{ display: 'grid', gap: 2, textAlign: 'left', padding: '9px 10px', borderRadius: 11, border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f6f7f9'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                <span style={{ fontSize: 13, fontWeight: 650, color: '#17191c', lineHeight: 1.35 }}>{t.title}</span>
                <span style={{ fontSize: 11.5, color: '#6b7280' }}>
                  <b style={{ color: t.due === 'overdue' ? '#e5484d' : t.due === 'today' ? '#b45309' : '#6b7280', fontWeight: 700 }}>{dueLabel(t)}</b> · {t.dealTitle}
                </span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { setOpen(false); navigate('/pipelines'); }}
            style={{ width: '100%', marginTop: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, padding: '9px 10px', borderRadius: 11, border: '1px solid #eceef1', background: '#fff', fontSize: 12.5, fontWeight: 700, color: '#17191c', cursor: 'pointer', fontFamily: 'inherit' }}>
            Open deals <ArrowRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
