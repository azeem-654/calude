import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Remounts the boundary when it changes, so navigating away clears an error. */
  resetKey?: string;
}

interface State {
  error: Error | null;
  /** Kept for the details panel — users paste this into support requests. */
  stack: string;
}

const INK = '#17191c';
const MUTED = '#8a8f98';

/**
 * Catches render errors so one broken screen cannot take down the whole app.
 *
 * Without this, any thrown error inside any component unmounts the entire React
 * tree and leaves a blank white page with no way back — the worst failure mode
 * for a product real customers are using. Here the rest of the shell survives,
 * the user gets a way out, and the error is recorded for support rather than
 * lost to the console.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const entry = {
      at: new Date().toISOString(),
      path: window.location.pathname + window.location.hash,
      message: error.message,
      stack: (info.componentStack || '').split('\n').slice(0, 12).join('\n'),
    };
    this.setState({ stack: entry.stack });
    // Keep the last few crashes so support can ask "what did it say?" and get a
    // real answer. Bounded so a crash loop cannot fill the user's storage.
    try {
      const key = 'crm_error_log';
      const prev = JSON.parse(localStorage.getItem(key) || '[]') as unknown[];
      localStorage.setItem(key, JSON.stringify([entry, ...prev].slice(0, 10)));
    } catch { /* storage full or unavailable — the screen below still works */ }
    console.error('Render error caught by boundary:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    // Navigating to another screen should clear the error rather than trapping
    // the user on the crash page.
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, stack: '' });
    }
  }

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28,
      }}>
        <div style={{
          maxWidth: 560, width: '100%', backgroundColor: '#fff', borderRadius: 18, padding: '28px 30px',
          boxShadow: '0 1px 2px rgba(23,25,28,0.05)',
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: 999, backgroundColor: '#fceaea',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
          }}>
            <AlertTriangle size={19} color="#e5484d" strokeWidth={2.2} />
          </div>

          <h2 style={{ fontSize: 19, fontWeight: 800, color: INK, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            This screen ran into a problem
          </h2>
          <p style={{ fontSize: 13.5, color: '#5c6066', margin: '0 0 6px', lineHeight: 1.6 }}>
            The rest of the app is still working, and nothing you have saved is affected. Reload this
            screen, or head back to the dashboard and carry on.
          </p>
          <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 20px', lineHeight: 1.6 }}>
            {error.message || 'An unexpected error occurred.'}
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px',
                borderRadius: 999, border: 'none', cursor: 'pointer',
                backgroundColor: INK, color: '#fff', fontSize: 13, fontWeight: 700,
              }}
            >
              <RefreshCw size={13} /> Reload this screen
            </button>
            <button
              onClick={() => { window.location.href = import.meta.env.BASE_URL || '/'; }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px',
                borderRadius: 999, border: '1px solid #e4e7ec', cursor: 'pointer',
                backgroundColor: '#fff', color: INK, fontSize: 13, fontWeight: 700,
              }}
            >
              <Home size={13} /> Back to dashboard
            </button>
          </div>

          {stack && (
            <details style={{ marginTop: 20 }}>
              <summary style={{ fontSize: 12, color: MUTED, cursor: 'pointer', fontWeight: 600 }}>
                Technical details
              </summary>
              <pre style={{
                marginTop: 10, padding: 12, backgroundColor: '#f7f8fa', borderRadius: 10,
                fontSize: 10.5, color: '#5c6066', overflowX: 'auto', lineHeight: 1.5, whiteSpace: 'pre-wrap',
              }}>{stack}</pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
