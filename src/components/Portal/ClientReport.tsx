/**
 * What a reseller's client sees when they open the link they were sent.
 *
 * ── No session, no app ──
 *
 * This renders outside AppProvider and outside the router's authenticated
 * tree, like the public shop. The visitor has never signed in and never will;
 * there is no workspace to load, no nav to draw, and nothing on this page can
 * be clicked through to the product. That is the point — it is a report, not a
 * reduced version of the app.
 *
 * ── Why it is deliberately plain ──
 *
 * The audience is a plumber opening a link on a phone between jobs. The
 * question is "is anything happening", and the answer has to survive being
 * skim-read in ten seconds: what is running, how far along it is, and the last
 * few things that were actually done. No charts nobody asked for, no vanity
 * numbers, and nothing that needs explaining.
 *
 * ── One expired link, one message ──
 *
 * A missing, revoked and expired link all render the same thing, because the
 * server answers all three identically on purpose. The screen tells them to ask
 * whoever sent it, which is the only useful action available to them.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Clock, Link2Off, Loader, Sparkles } from 'lucide-react';
import { API_BASE } from '../../services/apiBase';
import { usePageTitle } from '../../services/pageTitle';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

interface Report {
  client: string;
  label: string;
  projects: Array<{ name: string; objective: string; live: boolean; since: string }>;
  boards: Array<{ name: string; stages: Array<{ name: string; count: number }>; total: number; done: number }>;
  activity: Array<{ summary: string; detail: string; at: string }>;
  generatedAt: string;
}

const card: React.CSSProperties = {
  background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, overflow: 'hidden',
};

function when(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function ClientReport() {
  const { token = '' } = useParams();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  /* The client's own name in the tab, never the platform's. A report a reseller
     sent should not identify the software it came from. */
  usePageTitle(report ? `${report.client} — progress` : 'Progress report');

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/portal.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'view', portalToken: token }),
        });
        const data = await r.json() as { success?: boolean; report?: Report; error?: string };
        if (!live) return;
        if (data.success && data.report) setReport(data.report);
        else setError(data.error ?? 'This link is no longer available.');
      } catch {
        if (live) setError('Could not load this report. Try again in a moment.');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [token]);

  const page: React.CSSProperties = {
    minHeight: '100vh', background: '#f4f5f7',
    padding: 'clamp(16px, 5vw, 44px) clamp(16px, 4vw, 32px)',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  };

  if (loading) {
    return (
      <div style={{ ...page, display: 'grid', placeItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: MUTED, fontSize: 13.5 }}>
          <Loader size={15} className="spin" /> Loading your report…
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div style={{ ...page, display: 'grid', placeItems: 'center' }}>
        <div style={{ ...card, maxWidth: 380, padding: '30px 26px', textAlign: 'center' }}>
          <Link2Off size={22} color={MUTED} />
          <h1 style={{ margin: '10px 0 6px', fontSize: 16, fontWeight: 800, color: INK }}>
            This link is no longer available
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
            Ask whoever sent it for a new one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={{ maxWidth: 680, margin: '0 auto', display: 'grid', gap: 16 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 'clamp(21px, 4vw, 27px)', fontWeight: 800, color: INK, letterSpacing: '-0.025em' }}>
            {report.client}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED }}>
            Where your marketing has got to · updated {when(report.generatedAt)}
          </p>
        </header>

        {/* ── What is running ── */}
        {report.projects.map(p => (
          <section key={p.name} style={{ ...card, padding: '15px 17px' }}>
            <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: INK, flex: 1, minWidth: 140 }}>{p.name}</span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
                padding: '3px 10px', borderRadius: 999,
                background: p.live ? '#e8f6ee' : '#f1f5f9', color: p.live ? '#0f7b3d' : MUTED,
              }}>
                {p.live ? <Sparkles size={10} /> : <Clock size={10} />}
                {p.live ? 'Running' : 'Paused'}
              </span>
            </div>
            {p.objective && (
              <p style={{ margin: '7px 0 0', fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{p.objective}</p>
            )}
            <p style={{ margin: '7px 0 0', fontSize: 11.5, color: MUTED }}>Started {when(p.since)}</p>
          </section>
        ))}

        {/* ── How far along ── */}
        {report.boards.map(b => (
          <section key={b.name} style={card}>
            <div style={{ padding: '13px 17px', borderBottom: `1px solid ${LINE}`, background: '#fafbfc' }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>Progress</div>
              <div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>
                {b.total === 0
                  ? 'Nothing on the board yet — the first work is being set up.'
                  : `${b.done} of ${b.total} through to the end`}
              </div>
            </div>
            <div style={{ padding: '14px 17px', display: 'grid', gap: 9 }}>
              {b.stages.map(s => {
                const pct = b.total > 0 ? Math.round((s.count / b.total) * 100) : 0;
                return (
                  <div key={s.name} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, color: '#475569', width: 108, flexShrink: 0 }}>{s.name}</span>
                    <span style={{ flex: 1, height: 7, borderRadius: 99, background: '#eceef3', overflow: 'hidden', minWidth: 40 }}>
                      <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: ACCENT, borderRadius: 99 }} />
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: INK, width: 26, textAlign: 'right' }}>{s.count}</span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {/* ── What was actually done ── */}
        <section style={card}>
          <div style={{ padding: '13px 17px', borderBottom: `1px solid ${LINE}`, background: '#fafbfc' }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>What has been done</div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>
              The most recent work, newest first.
            </div>
          </div>
          <div style={{ padding: '6px 17px 14px' }}>
            {report.activity.length === 0 ? (
              <p style={{ margin: '10px 0', fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
                Nothing finished yet. The first work usually lands within a day of starting.
              </p>
            ) : report.activity.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderTop: i ? `1px solid ${LINE}` : 'none' }}>
                <CheckCircle2 size={14} color="#0f7b3d" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: INK, lineHeight: 1.45 }}>{a.summary}</div>
                  {a.detail && (
                    <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2, lineHeight: 1.55 }}>{a.detail}</div>
                  )}
                </div>
                <span style={{ fontSize: 11, color: MUTED, whiteSpace: 'nowrap', flexShrink: 0 }}>{when(a.at)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* No branding of ours. The reseller's client should not learn whose
            software this is from the footer of their own report. */}
        <p style={{ margin: 0, fontSize: 11, color: '#9aa1ad', textAlign: 'center', lineHeight: 1.6 }}>
          This is a read-only summary. Reply to whoever sent it if anything looks wrong.
        </p>
      </div>
    </div>
  );
}
