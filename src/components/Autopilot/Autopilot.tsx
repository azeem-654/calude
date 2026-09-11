/**
 * AI Autopilot — every project, and everything it has done for each.
 *
 * The app has a lot of modules and every one of them is operated by hand. This
 * is the screen for the other way round: you say what you want to happen, and
 * this is the account of what was done about it.
 *
 * ── Why a board of projects ──
 *
 * A sub-account runs several pushes at once — find dental patients for one
 * client, sell a supplement range for another, win consultancy work for a
 * third. The question somebody asks on opening this screen is "what is
 * happening for each of my clients", and a single stream answers a different
 * one: four projects interleaved is four stories told a sentence at a time.
 * Columns keep each one whole.
 *
 * This screen also absorbed the AI Sales Agent. That module had the same job —
 * an objective, a plan, a set of generated campaigns — in a different menu, and
 * two brains side by side is the thing most likely to leave a customer unable
 * to say which one to open.
 *
 * ── What comes before the board ──
 *
 * Replies. A person is waiting at the other end of one of those, and a campaign
 * approval is not; anything blocked on a human that also has a human waiting
 * goes first.
 *
 * Every card carries its *reason*. "Sent 40 emails" is a claim; "because these
 * 40 were tagged new-lead and had not been contacted in 30 days" is something
 * you can check and disagree with. A system that acts on a business without
 * asking each time has to be arguable, or it is merely opaque.
 */
import { useCallback, useEffect, useState } from 'react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import ReplyQueue from './ReplyQueue';
import ProjectBoard from './ProjectBoard';
import NewProject from './NewProject';
import { fetchBoard, type Portfolio } from '../../services/projects';
import { fetchReplies, sendDraft, discardDraft, type ReplyDraft } from '../../services/replies';

const MUTED = '#6b7280';

export default function Autopilot() {
  const { addNotification } = useApp();
  const [drafts, setDrafts] = useState<ReplyDraft[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  /* The board loads itself. This is bumped only when a project is created, so
     a new column appears without the whole screen reloading. */
  const [boardKey, setBoardKey] = useState(0);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    /* Together, so the page cannot show a reply queue beside a board that has
       not arrived, or the reverse. */
    const [board, rep] = await Promise.all([fetchBoard(), fetchReplies()]);
    setPortfolios(board.portfolios);
    setDrafts(rep.drafts);
    setLoading(false);
  }, []);

  useEffect(() => {
    /* Nothing is set after the screen has gone: leaving a project mid-fetch
       otherwise lands a state update on an unmounted component. */
    let live = true;
    void (async () => {
      const [board, rep] = await Promise.all([fetchBoard(), fetchReplies()]);
      if (!live) return;
      setPortfolios(board.portfolios);
      setDrafts(rep.drafts);
      setLoading(false);
    })();
    return () => { live = false; };
  }, []);

  const decideDraft = async (id: string, yes: boolean, subject?: string, bodyText?: string) => {
    setBusy(true);
    const r = yes ? await sendDraft(id, subject, bodyText) : await discardDraft(id);
    setBusy(false);
    if (!r.success) { addNotification(r.error ?? 'Could not do that.', 'error'); return; }
    if (r.drafts) setDrafts(r.drafts);
    addNotification(r.message ?? (yes ? 'Sent.' : 'Discarded.'), 'success');
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header
        title="AI Autopilot"
        subtitle="One project per client. Say what each should achieve; it does the rest."
      />

      <div style={{ padding: '18px clamp(16px, 3vw, 32px) 60px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading && <p style={{ fontSize: 13, color: MUTED }}>Loading…</p>}

        {/* A customer is waiting at the other end of one of these. */}
        <ReplyQueue
          drafts={drafts}
          busy={busy}
          onSend={(id, subject, bodyText) => void decideDraft(id, true, subject, bodyText)}
          onDiscard={id => void decideDraft(id, false)}
        />

        <ProjectBoard key={boardKey} onNewProject={() => setCreating(true)} />

        {creating && (
          <NewProject
            portfolios={portfolios}
            onClose={() => setCreating(false)}
            onCreated={() => { setCreating(false); setBoardKey(k => k + 1); void load(); }}
          />
        )}
      </div>
    </div>
  );
}
