/**
 * Jump to any module by typing.
 *
 * The magnifying glass in the header did nothing at all before this — it had a
 * tooltip and no handler. It now opens this, and so does ⌘K / Ctrl-K, which is
 * where anybody who uses software expects it to be.
 *
 * It searches the same list the menu is built from, including the words people
 * actually use: "calendly" finds Booking pages, "smtp" finds Email & SMS setup.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Search, X } from 'lucide-react';
import { searchModules } from './navModel';

/* Mounted only while it is open, so every opening starts from a fresh box and
   a fresh highlight without an effect having to reset them. */
export default function CommandPalette({ onClose, isClient }: {
  onClose: () => void;
  isClient: boolean;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchModules(query, isClient), [query, isClient]);
  /* Clamp rather than reset: the arrow keys move this, and a query that shrinks
     the list must not leave the highlight pointing past the end. */
  const at = Math.min(cursor, Math.max(0, results.length - 1));

  useEffect(() => {
    const t = window.setTimeout(() => input.current?.focus(), 20);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(`[data-row="${at}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  const go = (path: string) => { onClose(); navigate(path); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(results.length - 1, (c > results.length - 1 ? results.length - 1 : c) + 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const pick = results[at];
      if (pick) go(pick.path);
    }
  };

  return (
    <div
      role="presentation"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        backgroundColor: 'rgba(23,25,28,0.34)',
        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 'clamp(48px, 12vh, 140px) 16px 16px',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Go to a module"
        onKeyDown={onKey}
        style={{
          width: 'min(560px, 100%)', backgroundColor: '#fff', borderRadius: 20,
          boxShadow: '0 30px 80px -20px rgba(23,25,28,0.45)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column', maxHeight: 'min(520px, 70vh)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid #eef0f2' }}>
          <Search size={17} color="#8a8f98" strokeWidth={2.2} />
          <input
            ref={input}
            value={query}
            onChange={e => { setQuery(e.target.value); setCursor(0); }}
            placeholder="Go to a module — try “deals”, “calendly”, “smtp”"
            aria-label="Search modules"
            style={{
              flex: 1, border: 'none', outline: 'none', fontSize: 14.5, color: '#17191c',
              fontFamily: 'inherit', background: 'none', minWidth: 0,
            }}
          />
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#8a8f98', display: 'flex', padding: 4 }}>
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>

        <div ref={listRef} style={{ overflowY: 'auto', padding: 8, flex: 1 }}>
          {results.length === 0 ? (
            <p style={{ margin: 0, padding: '22px 12px', fontSize: 13, color: '#8a8f98', lineHeight: 1.6 }}>
              Nothing here matches “{query}”. Every module is listed when the box is empty.
            </p>
          ) : results.map((item, i) => {
            const on = i === at;
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                type="button"
                data-row={i}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(item.path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: '10px 12px', border: 'none', borderRadius: 13, cursor: 'pointer',
                  textAlign: 'left', backgroundColor: on ? '#17191c' : 'transparent',
                }}
              >
                <span style={{
                  width: 32, height: 32, borderRadius: 999, flexShrink: 0,
                  backgroundColor: on ? 'rgba(255,255,255,0.14)' : '#f0f1f3',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={15} color={on ? '#fff' : '#17191c'} strokeWidth={2} />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: on ? '#fff' : '#17191c', letterSpacing: '-0.01em' }}>{item.label}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: on ? 'rgba(255,255,255,0.62)' : '#8a8f98', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.desc}</span>
                </span>
                {on && <CornerDownLeft size={13} color="rgba(255,255,255,0.7)" strokeWidth={2.4} />}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 16px', borderTop: '1px solid #eef0f2', fontSize: 11, color: '#8a8f98', fontWeight: 500 }}>
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
          <span><Kbd>↵</Kbd> open</span>
          <span><Kbd>esc</Kbd> close</span>
          <span style={{ marginLeft: 'auto' }}>{results.length} module{results.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 18, height: 18, padding: '0 4px', marginRight: 4,
      borderRadius: 5, border: '1px solid #e3e6ea', backgroundColor: '#f7f8f9',
      fontSize: 10, fontFamily: 'inherit', color: '#5c6066', fontWeight: 700,
    }}>{children}</kbd>
  );
}
