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
import { useSearchParams } from 'react-router-dom';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import ReplyQueue from './ReplyQueue';
import ProjectBoard from './ProjectBoard';
import NewProject from './NewProject';
import { fetchBoard, type Portfolio } from '../../services/projects';
import { fetchReplies, sendDraft, discardDraft, type ReplyDraft } from '../../services/replies';
import SetupProgress from '../Setup/SetupProgress';
import ClientLinks from './ClientLinks';

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

  /*
   * Where somebody lands coming back from paying.
   *
   * The checkout sends them to /autopilot?setup=<order>, so this screen is the
   * first thing after a payment and the progress list has to be the first thing
   * on it — a customer who has just been charged and sees an ordinary board
   * with no acknowledgement assumes something went wrong.
   */
  const [params] = useSearchParams();
  const setupOrder = params.get('setup') ?? '';

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

        {setupOrder && setupOrder !== 'cancelled' && (
          <SetupProgress
            orderId={setupOrder}
            /* The last provisioning step starts the content engine, so the
               board has a new column's worth of work to show by the time this
               fires. */
            onDone={() => { setBoardKey(k => k + 1); void load(); }}
          />
        )}
        {setupOrder === 'cancelled' && (
          <p style={{ fontSize: 12.5, color: MUTED, margin: 0 }}>
            That payment was cancelled, so nothing was bought. Your project is running either way.
          </p>
        )}

        {/* A customer is waiting at the other end of one of these, whichever
            view they are looking at. */}
        <ReplyQueue
          drafts={drafts}
          busy={busy}
          onSend={(id, subject, bodyText) => void decideDraft(id, true, subject, bodyText)}
          onDiscard={id => void decideDraft(id, false)}
        />

        {/* One interface. A project *is* its workflows, its agents, its content
            and its numbers, and splitting them across a second top-level tab
            asked somebody to hold two mental models of the same thing. */}
        <ProjectBoard key={boardKey} onNewProject={() => setCreating(true)} />

        {/* Below the board, because it is what somebody does *after* looking at
            the work rather than instead of it. Collapsed by default so it costs
            nothing to the people who never share anything. */}
        {portfolios.length > 0 && <ClientLinks portfolios={portfolios} />}

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
