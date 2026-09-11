/**
 * The board: one column per project, one card per thing Autopilot did.
 *
 * ── Why a board and not a list ──
 *
 * A sub-account runs several pushes at once — find dental clients, sell
 * supplements, win Amazon consultancy work — and the question it asks on
 * opening this screen is "what is happening for each of my clients", not "what
 * happened most recently". A single stream answers the second question and
 * buries the first: four projects interleaved is four stories told a sentence
 * at a time. Columns keep each one whole.
 *
 * ── The cards are real records ──
 *
 * Each one links into the module that owns it, so "wrote a follow-up sequence"
 * opens the sequence. Nothing here is a copy: the card is the ledger entry and
 * the link is where the thing actually lives.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Check, Clock, AlertTriangle, ExternalLink, Pause, Play, MoreHorizontal, Trash2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  fetchBoard, setProjectStatus, deleteProject, KIND_LABEL,
  type Project, type Card, type Portfolio,
} from '../../services/projects';
import { approveAction, rejectAction } from '../../services/autopilot';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';

/** A dot per project, so a column is identifiable at a glance rather than by
 *  reading its heading. The palette repeats after six; a workspace with more
 *  than six live projects has bigger problems than colour collisions. */
const DOTS = ['#6366f1', '#f59e0b', '#0ea5e9', '#10b981', '#ec4899', '#8b5cf6'];

const STATUS_TONE: Record<Card['status'], { bg: string; fg: string; label: string }> = {
  awaiting: { bg: '#fff7e6', fg: '#7a4d00', label: 'Waiting for you' },
  pending:  { bg: '#eef2f8', fg: '#3a4a63', label: 'Queued' },
  done:     { bg: '#e8f6ee', fg: '#0f7b3d', label: 'Done' },
  failed:   { bg: '#fdf3f3', fg: '#b42318', label: 'Did not work' },
  skipped:  { bg: '#f2f3f5', fg: '#6b7280', label: 'Skipped' },
};

function CardTile({ card, onOpen, onDecide, busy }: {
  card: Card;
  onOpen: (route: string) => void;
  onDecide: (id: string, approve: boolean) => void;
  busy: boolean;
}) {
  const tone = STATUS_TONE[card.status] ?? STATUS_TONE.pending;
  const why = card.detail?.trim() || card.because?.trim() || '';
  return (
    <div style={{
      background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14,
      padding: 13, display: 'grid', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700,
          padding: '3px 8px', borderRadius: 999, background: tone.bg, color: tone.fg,
        }}>
          {card.status === 'done' ? <Check size={10} />
            : card.status === 'failed' ? <AlertTriangle size={10} />
              : <Clock size={10} />}
          {tone.label}
        </span>
        {Object.entries(card.counts ?? {}).slice(0, 1).map(([k, v]) => (
          <span key={k} style={{ fontSize: 10.5, color: MUTED }}>{v} {k}</span>
        ))}
      </div>

      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: INK, lineHeight: 1.4 }}>
        {card.summary}
      </p>
      {why && (
        <p style={{
          margin: 0, fontSize: 11.5, lineHeight: 1.5,
          color: card.status === 'failed' ? '#b42318' : MUTED,
        }}>
          {why.length > 160 ? why.slice(0, 160) + '…' : why}
        </p>
      )}

      {/* The only thing on this board blocked on a person. Both answers are
          offered plainly: a card you can only say yes to is not a decision. */}
      {card.status === 'awaiting' && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button disabled={busy} onClick={() => onDecide(card.id, true)} style={{
            flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none',
            background: INK, color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
          }}>Approve</button>
          <button disabled={busy} onClick={() => onDecide(card.id, false)} style={{
            padding: '7px 10px', borderRadius: 8, border: `1px solid ${LINE}`,
            background: '#fff', color: MUTED, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
          }}>No</button>
        </div>
      )}

      {card.linkRoute && (
        <button
          onClick={() => onOpen(card.linkRoute!)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
            padding: '5px 10px', borderRadius: 8, border: `1px solid ${LINE}`,
            background: '#fff', color: INK, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
          }}>
          <ExternalLink size={11} /> {card.linkLabel || 'Open'}
        </button>
      )}
    </div>
  );
}

export default function ProjectBoard({ onNewProject }: { onNewProject: () => void }) {
  const navigate = useNavigate();
  const { addNotification } = useApp();
  const [projects, setProjects] = useState<Project[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [board, setBoard] = useState<Record<string, Card[]>>({});
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);

  const load = async () => {
    const r = await fetchBoard();
    setProjects(r.projects);
    setPortfolios(r.portfolios);
    setBoard(r.board);
    setLoading(false);
    if (r.error) addNotification(r.error, 'error');
  };
  useEffect(() => {
    /* Same guard as the screen above: a board left mid-fetch must not set
       state after it has gone. */
    let live = true;
    void (async () => {
      const r = await fetchBoard();
      if (!live) return;
      setProjects(r.projects);
      setPortfolios(r.portfolios);
      setBoard(r.board);
      setLoading(false);
      if (r.error) addNotification(r.error, 'error');
    })();
    return () => { live = false; };
  }, [addNotification]);

  const decide = async (id: string, approve: boolean) => {
    setDeciding(true);
    const r = approve ? await approveAction(id) : await rejectAction(id);
    setDeciding(false);
    if (!r.success) { addNotification(r.error ?? 'Could not record that.', 'error'); return; }
    /* Approving queues it for the next tick rather than doing it here — two
       places that can send is how something gets sent twice. */
    addNotification(approve ? 'Approved — Autopilot carries it out on the next run.' : 'Left undone.', 'success');
    void load();
  };

  const toggle = async (p: Project) => {
    const next = p.status === 'running' || p.status === 'learning' ? 'paused' : 'running';
    const r = await setProjectStatus(p.id, next);
    if (!r.success) { addNotification(r.error ?? 'Could not change that.', 'error'); return; }
    setMenu(null);
    void load();
  };

  const remove = async (p: Project) => {
    if (!window.confirm(`Delete "${p.name}" and everything Autopilot recorded for it? The campaigns and posts it already made stay where they are.`)) return;
    const r = await deleteProject(p.id);
    if (!r.success) { addNotification(r.error ?? 'Could not delete that.', 'error'); return; }
    setMenu(null);
    addNotification(`"${p.name}" deleted.`, 'success');
    void load();
  };

  if (loading) {
    return <p style={{ fontSize: 13, color: MUTED, padding: '20px 0' }}>Loading your projects…</p>;
  }

  if (!projects.length) {
    return (
      <div style={{
        background: '#fff', border: `1px dashed ${LINE}`, borderRadius: 18,
        padding: '38px 24px', textAlign: 'center', display: 'grid', gap: 10, justifyItems: 'center',
      }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: INK }}>No projects yet</h3>
        <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.6, maxWidth: 460 }}>
          A project is one push for one client — find dental patients, sell a range of products,
          win consultancy work. Each one runs on its own and reports here.
        </p>
        <button onClick={onNewProject} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4,
          padding: '11px 20px', borderRadius: 999, border: 'none',
          background: INK, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>
          <Plus size={14} /> Start your first project
        </button>
        {!portfolios.length && (
          <p style={{ margin: '2px 0 0', fontSize: 11.5, color: MUTED }}>
            You will be asked which client it is for, and can add one there.
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
      {projects.map((p, i) => {
        const cards = board[p.id] ?? [];
        const dot = DOTS[i % DOTS.length];
        const live = p.status === 'running' || p.status === 'learning';
        return (
          <section key={p.id} style={{
            flex: '0 0 320px', maxWidth: 320, background: '#f7f8fa',
            border: `1px solid ${LINE}`, borderRadius: 18, padding: 12,
            display: 'grid', gap: 10, alignContent: 'start',
          }}>
            <header style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: dot, flexShrink: 0 }} />
                <h3 style={{
                  margin: 0, fontSize: 13.5, fontWeight: 800, color: INK, flex: 1,
                  minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{p.name}</h3>
                <span style={{ fontSize: 11, color: MUTED, fontWeight: 700 }}>{cards.length}</span>
                <button onClick={() => setMenu(menu === p.id ? null : p.id)} aria-label={`Options for ${p.name}`}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: MUTED, padding: 2, display: 'flex' }}>
                  <MoreHorizontal size={15} />
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#475569', background: '#eceef1', padding: '2px 7px', borderRadius: 999 }}>
                  {KIND_LABEL[p.kind] ?? p.kind}
                </span>
                {p.portfolioName && (
                  <span style={{ fontSize: 11, color: MUTED, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.portfolioName}
                  </span>
                )}
                {!live && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#7a4d00', background: '#fff7e6', padding: '2px 7px', borderRadius: 999 }}>
                    Paused
                  </span>
                )}
                {p.awaiting > 0 && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#7a4d00', background: '#fff7e6', padding: '2px 7px', borderRadius: 999 }}>
                    {p.awaiting} waiting
                  </span>
                )}
              </div>

              {menu === p.id && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '6px 0 2px' }}>
                  <button onClick={() => void toggle(p)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px',
                    borderRadius: 8, border: `1px solid ${LINE}`, background: '#fff',
                    fontSize: 11.5, fontWeight: 700, color: INK, cursor: 'pointer',
                  }}>
                    {live ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Resume</>}
                  </button>
                  <button onClick={() => void remove(p)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px',
                    borderRadius: 8, border: `1px solid ${LINE}`, background: '#fff',
                    fontSize: 11.5, fontWeight: 700, color: '#b42318', cursor: 'pointer',
                  }}>
                    <Trash2 size={11} /> Delete
                  </button>
                </div>
              )}
            </header>

            {p.lastError && (
              <p style={{ margin: 0, padding: '8px 10px', borderRadius: 9, background: '#fdf3f3', color: '#b42318', fontSize: 11.5, lineHeight: 1.5 }}>
                {p.lastError.slice(0, 180)}
              </p>
            )}

            {cards.length === 0 ? (
              <p style={{ margin: 0, padding: '18px 10px', textAlign: 'center', fontSize: 12, color: MUTED, lineHeight: 1.55 }}>
                {live
                  ? 'Nothing yet — Autopilot plans each project once a day, and the first plan lands within a day of starting it.'
                  : 'Paused. Resume it and Autopilot will pick it up on the next plan.'}
              </p>
            ) : (
              cards.map(c => (
                <CardTile key={c.id} card={c} busy={deciding}
                  onOpen={r => navigate(r)} onDecide={(id, ok) => void decide(id, ok)} />
              ))
            )}
          </section>
        );
      })}

      {/* The way to add another, in the place somebody looks for it. */}
      <button onClick={onNewProject} style={{
        flex: '0 0 200px', minHeight: 120, background: 'transparent',
        border: `1px dashed ${LINE}`, borderRadius: 18, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 6, color: MUTED, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
      }}>
        <Plus size={18} /> New project
      </button>
    </div>
  );
}
