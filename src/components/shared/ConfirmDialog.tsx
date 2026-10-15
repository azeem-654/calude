/**
 * The app's own "are you sure?" — in place of the browser's `window.confirm`,
 * which drew a grey box headed "app.protectedcentral.com says" over the app:
 * it named the host instead of the product, could not say what a button does
 * in words of its own, and looked like a warning from the browser itself.
 *
 * `askConfirm` is a drop-in for `window.confirm` that returns a promise, so a
 * call site changes from `if (!window.confirm(m)) return;` to
 * `if (!await askConfirm({ message: m })) return;`. It mounts its own root on
 * <body>, so no screen has to hold dialog state for it.
 */
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, HelpCircle } from 'lucide-react';

export interface ConfirmOptions {
  title?: string;
  message: string;
  /** The button that goes ahead — say what it does ("Delete project"), not "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red, with a warning mark: for what cannot be undone. */
  danger?: boolean;
}

function Dialog({ o, done }: { o: ConfirmOptions; done: (yes: boolean) => void }) {
  const go = useRef<HTMLButtonElement>(null);
  const no = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    /* Focus the safe choice for something destructive, so Enter does not delete. */
    (o.danger ? no : go).current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      if (e.key === 'Tab') {
        /* Two buttons: keep focus between them while the dialog is up. */
        const order = [no.current, go.current].filter(Boolean) as HTMLButtonElement[];
        const i = order.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();
        order[(i + (e.shiftKey ? order.length - 1 : 1)) % order.length]?.focus();
      }
    };
    window.addEventListener('keydown', key, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key, true); document.body.style.overflow = overflow; };
  }, [o.danger, done]);
  const tone = o.danger ? { bg: '#fef2f2', fg: '#dc2626', btn: 'linear-gradient(135deg,#ef4444,#dc2626)' } : { bg: '#eef2ff', fg: '#4f46e5', btn: 'linear-gradient(135deg,#6366f1,#4f46e5)' };
  return (
    <div className="pc-confirm-scrim" onMouseDown={e => { if (e.target === e.currentTarget) done(false); }}>
      <div className="pc-confirm" role="alertdialog" aria-modal="true" aria-labelledby="pc-confirm-title" aria-describedby="pc-confirm-msg">
        <div className="pc-confirm-icon" style={{ background: tone.bg, color: tone.fg }}>
          {o.danger ? <AlertTriangle size={20} /> : <HelpCircle size={20} />}
        </div>
        <div className="pc-confirm-body">
          <h2 id="pc-confirm-title">{o.title ?? (o.danger ? 'Are you sure?' : 'Please confirm')}</h2>
          <p id="pc-confirm-msg">{o.message}</p>
        </div>
        <div className="pc-confirm-actions">
          <button ref={no} type="button" className="pc-confirm-no" onClick={() => done(false)}>{o.cancelLabel ?? 'Cancel'}</button>
          <button ref={go} type="button" className="pc-confirm-go" style={{ background: tone.btn }} onClick={() => done(true)} data-testid="confirm-go">
            {o.confirmLabel ?? 'Continue'}
          </button>
        </div>
      </div>
      <style>{CSS}</style>
    </div>
  );
}

/** Ask, in the app's own dialog. Resolves true only when the go-ahead button is pressed. */
export function askConfirm(o: ConfirmOptions | string): Promise<boolean> {
  const opts = typeof o === 'string' ? { message: o } : o;
  return new Promise(resolve => {
    const host = document.createElement('div');
    host.setAttribute('data-confirm-dialog', '');
    document.body.appendChild(host);
    const root = createRoot(host);
    const back = document.activeElement as HTMLElement | null;
    let settled = false;
    const done = (yes: boolean) => {
      if (settled) return;
      settled = true;
      root.unmount();
      host.remove();
      back?.focus?.();
      resolve(yes);
    };
    root.render(<Dialog o={opts} done={done} />);
  });
}

const CSS = `
.pc-confirm-scrim{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.45);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);display:grid;place-items:center;padding:16px;animation:pcFade .14s ease-out}
.pc-confirm{width:min(440px,100%);background:#fff;border-radius:18px;box-shadow:0 30px 80px -20px rgba(15,23,42,.45),0 0 0 1px rgba(15,23,42,.06);padding:22px;display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-family:Inter,system-ui,sans-serif;animation:pcPop .16s ease-out}
.pc-confirm-icon{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;grid-row:span 1}
.pc-confirm-body h2{margin:2px 0 6px;font-size:17px;font-weight:800;color:#0f172a;line-height:1.3}
.pc-confirm-body p{margin:0;font-size:14px;line-height:1.55;color:#475569;overflow-wrap:anywhere}
.pc-confirm-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:10px;margin-top:16px;flex-wrap:wrap}
.pc-confirm-actions button{min-height:42px;padding:0 18px;border-radius:11px;font:700 14px Inter,system-ui,sans-serif;cursor:pointer}
.pc-confirm-no{background:#fff;border:1px solid #e2e8f0;color:#0f172a}
.pc-confirm-no:hover{background:#f8fafc}
.pc-confirm-go{border:0;color:#fff;box-shadow:0 8px 18px -8px rgba(79,70,229,.6)}
.pc-confirm-actions button:focus-visible{outline:3px solid #a5b4fc;outline-offset:2px}
@media (max-width:480px){.pc-confirm{grid-template-columns:1fr}.pc-confirm-actions{flex-direction:column-reverse}.pc-confirm-actions button{width:100%}}
@keyframes pcFade{from{opacity:0}}@keyframes pcPop{from{opacity:0;transform:translateY(6px) scale(.98)}}
@media (prefers-reduced-motion:reduce){.pc-confirm-scrim,.pc-confirm{animation:none}}
`;
