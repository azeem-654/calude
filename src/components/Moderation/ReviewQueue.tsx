/**
 * The operator's review screen.
 *
 * ── What it is for ──
 *
 * Deciding, quickly, about somebody else's writing. So the content is the
 * biggest thing on each card and the machine's reasoning is small underneath —
 * the score and the matched terms are there to be checked when the decision is
 * not obvious, not to be read every time.
 *
 * ── Why the account is on the card ──
 *
 * Because the second decision is usually about the account, not the content.
 * One held campaign from a new workspace is a false positive; the fourth from
 * the same one is a business that should not be here. Showing whose it is, and
 * their current standing, next to the text is what makes that visible without
 * going and looking it up.
 *
 * ── The thing it deliberately does not show ──
 *
 * Anything refused as `illegal` arrives with an empty excerpt, and the card
 * says so rather than rendering a blank box. Nobody is being asked to weigh
 * that up, so nobody is shown it.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Check, Loader, MessageSquare, ShieldAlert, ShieldCheck, ShieldX, X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  decide, isInstallOwner, loadQueue, loadStandings, setStanding,
  type Category, type Counts, type ReviewItem, type StandingRow,
} from '../../services/moderation';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';

const CATEGORY_LABEL: Record<Category, string> = {
  adult: 'Sexual / adult',
  violence: 'Graphic violence',
  politics: 'Political campaigning',
  hate: 'Hateful',
  illegal: 'Sexualises children',
  none: 'Unclassified',
};

const CATEGORY_TONE: Record<Category, { bg: string; fg: string }> = {
  adult: { bg: '#fdf0f4', fg: '#9f1239' },
  violence: { bg: '#fff1e9', fg: '#9a3412' },
  politics: { bg: '#eef2ff', fg: '#3730a3' },
  hate: { bg: '#fef2f2', fg: '#991b1b' },
  illegal: { bg: '#1f2937', fg: '#fecaca' },
  none: { bg: '#f1f5f9', fg: '#475569' },
};

const SURFACE: Record<string, string> = {
  email: 'Email', sms: 'Text message', blog: 'Blog post', website: 'Website',
  product: 'Product', shop: 'Shop', social: 'Social post',
  portfolio: 'Client profile', reply: 'Automatic reply',
};

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function ReviewQueue() {
  const { addNotification } = useApp();
  const [tab, setTab] = useState<'held' | 'approved' | 'rejected'>('held');
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [counts, setCounts] = useState<Counts>({ held: 0, approved: 0, rejected: 0 });
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const owner = isInstallOwner();

  const refresh = useCallback(async (which: typeof tab) => {
    setLoading(true);
    const [q, s] = await Promise.all([loadQueue(which), loadStandings()]);
    setItems(q.items);
    setCounts(q.counts);
    setStandings(s);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(tab); }, [tab, refresh]);

  /*
   * Not a gate — the server refuses every action on this screen for anybody
   * else, and the nav does not offer it. This is so a stale bookmark shows a
   * sentence rather than an empty page that looks broken.
   */
  if (!owner) {
    return (
      <div style={{ maxWidth: 560, margin: '60px auto', textAlign: 'center', padding: 24 }}>
        <ShieldAlert size={22} color={MUTED} />
        <h1 style={{ fontSize: 17, fontWeight: 800, color: INK, margin: '10px 0 6px' }}>Not your screen</h1>
        <p style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.6, margin: 0 }}>
          Content review belongs to whoever runs this installation.
        </p>
      </div>
    );
  }

  const act = async (item: ReviewItem, status: 'approved' | 'rejected') => {
    setBusy(item.id);
    const r = await decide(item.id, status, notes[item.id] ?? '');
    setBusy('');
    if (!r.ok) { addNotification(r.error || 'Could not save that.', 'error'); return; }
    addNotification(status === 'approved' ? 'Approved — it will go out.' : 'Refused. It will not be sent.', 'success');
    void refresh(tab);
  };

  const punish = async (email: string, state: 'ok' | 'warned' | 'suspended') => {
    if (state === 'ok') {
      if (!window.confirm(`Clear the mark against ${email}? They will be able to send again.`)) return;
    } else {
      const verb = state === 'suspended' ? 'Suspend' : 'Warn';
      if (!window.confirm(`${verb} ${email}? They will be shown the reason you type next.`)) return;
    }
    let reason = '';
    if (state !== 'ok') {
      /* Required, and asked for here rather than refused by the server after
         the click. It is the sentence the account holder reads, and "your
         account is suspended" with nothing after it leaves them no way to fix
         it and no way to argue. */
      reason = window.prompt(`Why? ${email} will read this exactly as you write it.`) ?? '';
      if (!reason.trim()) { addNotification('Nothing changed — a reason is required.', 'error'); return; }
    }
    setBusy(email);
    const r = await setStanding(email, state, reason, '');
    setBusy('');
    if (!r.ok) { addNotification(r.error || 'Could not save that.', 'error'); return; }
    addNotification(
      state === 'ok' ? 'Cleared.' : state === 'warned' ? 'Warned.' : 'Suspended. They can still sign in and export.',
      'success',
    );
    void refresh(tab);
  };

  const tabBtn = (id: typeof tab, label: string, n: number): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px',
    borderRadius: 999, border: `1px solid ${tab === id ? INK : LINE}`,
    background: tab === id ? INK : '#fff', color: tab === id ? '#fff' : INK,
    fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    ...(n >= 0 ? {} : {}),
  });

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(16px, 3vw, 28px) 0 60px', display: 'grid', gap: 18 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 'clamp(20px, 3.4vw, 26px)', fontWeight: 800, color: INK, letterSpacing: '-0.025em' }}>
          Content review
        </h1>
        <p style={{ margin: '5px 0 0', fontSize: 13.5, color: MUTED, lineHeight: 1.6 }}>
          Anything the filter stopped on its way out. Nothing here has been sent or published.
          Approving it lets that exact wording through from now on.
        </p>
      </header>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setTab('held')} style={tabBtn('held', 'Waiting', counts.held)}>
          Waiting {counts.held > 0 && (
            <span style={{
              minWidth: 18, padding: '0 5px', borderRadius: 999, fontSize: 11,
              background: tab === 'held' ? '#fff' : '#b42318', color: tab === 'held' ? INK : '#fff',
            }}>{counts.held}</span>
          )}
        </button>
        <button onClick={() => setTab('approved')} style={tabBtn('approved', 'Approved', counts.approved)}>Approved</button>
        <button onClick={() => setTab('rejected')} style={tabBtn('rejected', 'Refused', counts.rejected)}>Refused</button>
      </div>

      {/* ── Accounts currently marked ── */}
      {standings.length > 0 && (
        <section style={{ border: `1px solid ${LINE}`, borderRadius: 14, background: '#fff', overflow: 'hidden' }}>
          <div style={{ padding: '11px 15px', background: '#fafbfc', borderBottom: `1px solid ${LINE}`, fontSize: 13, fontWeight: 800, color: INK }}>
            Accounts under a mark
          </div>
          <div style={{ padding: '4px 15px 12px' }}>
            {standings.map(s => (
              <div key={s.email} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 0', borderTop: `1px solid ${LINE}` }}>
                <span style={{ flex: 1, minWidth: 180 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK }}>{s.email}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 1 }}>
                    {s.state === 'suspended' ? 'Suspended' : 'Warned'} · {s.reason}
                    {/* Whether they have actually seen it. A warning nobody read
                        is not a warning, and it is the difference between a
                        second chance and an ambush. */}
                    {' · '}{s.seenAt ? 'seen' : 'not seen yet'}
                  </span>
                </span>
                <button onClick={() => void punish(s.email, 'ok')} disabled={busy === s.email} style={smallBtn}>
                  {busy === s.email ? <Loader size={11} className="spin" /> : <ShieldCheck size={11} />} Clear
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: MUTED, fontSize: 13 }}>
          <Loader size={14} className="spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, background: '#fff', padding: '30px 24px', textAlign: 'center' }}>
          <ShieldCheck size={20} color="#0f7b3d" />
          <p style={{ margin: '9px 0 0', fontSize: 13.5, color: INK, fontWeight: 700 }}>
            {tab === 'held' ? 'Nothing waiting' : tab === 'approved' ? 'Nothing approved yet' : 'Nothing refused'}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
            {tab === 'held' ? 'Everything customers have sent went straight out.' : 'Decisions you make will be listed here.'}
          </p>
        </div>
      ) : items.map(item => {
        const tone = CATEGORY_TONE[item.category] ?? CATEGORY_TONE.none;
        const refusedOutright = item.category === 'illegal';
        return (
          <article key={item.id} style={{ border: `1px solid ${LINE}`, borderRadius: 14, background: '#fff', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap', padding: '11px 15px', background: '#fafbfc', borderBottom: `1px solid ${LINE}` }}>
              <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: tone.bg, color: tone.fg }}>
                {CATEGORY_LABEL[item.category] ?? item.category}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>{SURFACE[item.surface] ?? item.surface}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11.5, color: MUTED }}>{when(item.createdAt)}</span>
            </div>

            <div style={{ padding: '14px 15px' }}>
              {refusedOutright ? (
                /* Not rendered. Deliberately, and said so. */
                <p style={{ margin: 0, fontSize: 13, color: '#991b1b', lineHeight: 1.6, fontWeight: 600 }}>
                  Refused automatically. The text was not kept and is not shown — there is no version of
                  this decision to make. It is listed here only so you know the attempt happened.
                </p>
              ) : (
                <pre style={{
                  margin: 0, padding: '12px 13px', background: '#f8fafc', border: `1px solid ${LINE}`,
                  borderRadius: 10, fontSize: 12.5, lineHeight: 1.65, color: INK,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 260, overflow: 'auto',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}>{item.excerpt}</pre>
              )}

              {/* Small, because it is for checking rather than reading. */}
              <p style={{ margin: '10px 0 0', fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
                Matched <strong style={{ color: '#475569' }}>{item.matched || '—'}</strong> · score {item.score}
                {item.aiVerdict && <> · second look said <strong style={{ color: '#475569' }}>{item.aiVerdict}</strong>{item.aiReason ? ` — ${item.aiReason}` : ''}</>}
                {!item.aiVerdict && <> · no second look ran, so it was held rather than guessed at</>}
              </p>

              <p style={{ margin: '7px 0 0', fontSize: 11.5, color: MUTED }}>
                {item.ownerEmail || 'unknown account'}
                {item.ownerState !== 'ok' && (
                  <span style={{ marginLeft: 6, fontWeight: 800, color: '#b42318' }}>· already {item.ownerState}</span>
                )}
              </p>

              {item.status !== 'held' && (
                <p style={{ margin: '9px 0 0', fontSize: 12, color: MUTED }}>
                  {item.status === 'approved' ? 'Approved' : 'Refused'} by {item.decidedBy || 'the system'}
                  {item.decidedAt ? ` · ${when(item.decidedAt)}` : ''}{item.note ? ` · "${item.note}"` : ''}
                </p>
              )}
            </div>

            {item.status === 'held' && (
              <div style={{ padding: '0 15px 14px', display: 'grid', gap: 9 }}>
                <label style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                  <MessageSquare size={13} color={MUTED} />
                  <input
                    value={notes[item.id] ?? ''}
                    onChange={e => setNotes(n => ({ ...n, [item.id]: e.target.value }))}
                    placeholder="A note for the record — shown to them if you refuse it"
                    style={{
                      flex: 1, padding: '8px 10px', border: `1px solid ${LINE}`, borderRadius: 9,
                      fontSize: 12.5, fontFamily: 'inherit', outline: 'none', minWidth: 0,
                    }}
                  />
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => void act(item, 'approved')} disabled={busy === item.id} style={{ ...smallBtn, background: '#0f7b3d', color: '#fff', border: 'none', padding: '8px 14px', fontSize: 12.5 }}>
                    {busy === item.id ? <Loader size={12} className="spin" /> : <Check size={12} />} Approve and send
                  </button>
                  <button onClick={() => void act(item, 'rejected')} disabled={busy === item.id} style={{ ...smallBtn, padding: '8px 14px', fontSize: 12.5, color: '#b42318' }}>
                    <X size={12} /> Refuse
                  </button>
                  <span style={{ flex: 1 }} />
                  {item.ownerEmail && item.ownerState === 'ok' && (<>
                    <button onClick={() => void punish(item.ownerEmail, 'warned')} disabled={busy === item.ownerEmail} style={smallBtn}>
                      <AlertTriangle size={11} /> Warn account
                    </button>
                    <button onClick={() => void punish(item.ownerEmail, 'suspended')} disabled={busy === item.ownerEmail} style={{ ...smallBtn, color: '#b42318' }}>
                      <ShieldX size={11} /> Suspend
                    </button>
                  </>)}
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

const smallBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px',
  border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff',
  color: INK, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
