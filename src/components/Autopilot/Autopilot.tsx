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
import { Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import ReplyQueue from './ReplyQueue';
import ProjectBoard from './ProjectBoard';
import NewProject from './NewProject';
import { fetchBoard, type Portfolio } from '../../services/projects';
import { fetchReplies, sendDraft, discardDraft, type ReplyDraft } from '../../services/replies';
import SetupProgress from '../Setup/SetupProgress';
import ClientLinks from './ClientLinks';
import TemplateGallery from './TemplateGallery';
import { T } from './theme';


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
  const [params, setParams] = useSearchParams();
  const setupOrder = params.get('setup') ?? '';
  /* Which of the two views. In the URL so it is linkable and survives a
     reload — somebody sent a colleague "look at the template gallery" should
     get the template gallery. */
  const view = params.get('view') === 'templates' ? 'templates' : 'projects';

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
    /*
     * Deliberately *without* `data-noinvert`.
     *
     * The app's dark mode is one `filter: invert(1)` on <html>, and anything
     * carrying that attribute is inverted back — i.e. opted out of theming.
     * This screen carried it while it was authored dark, which is exactly why
     * it was the one screen that did not change when somebody switched the
     * theme. It is authored light now and themes with everything else.
     */
    <div style={{ minHeight: '100vh', background: T.bg, color: T.ink }}>
      <div style={{
        padding: 'clamp(16px, 3vw, 28px) clamp(16px, 3vw, 32px) 0',
        borderBottom: `1px solid ${T.lineSoft}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 320px' }}>
            <h1 style={{
              margin: 0, fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 800,
              color: T.ink, letterSpacing: '-0.03em',
            }}>AI Autopilot</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: T.muted, lineHeight: 1.55 }}>
              Create, manage and automate your marketing, content and sales with AI.
            </p>
          </div>

          {/* What the machine turns into what, in four words. It is the product
              in one line, and it is the line somebody repeats to a colleague. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: T.muted, fontSize: 11.5 }}>
            <Sparkles size={15} color={T.violet} />
            <span style={{ lineHeight: 1.45 }}>
              Ideas<br />Workflows<br />Revenue<br />
              <strong style={{ color: T.ink }}>On Autopilot</strong>
            </span>
          </div>
        </div>

        {/* ── Two views, not two pages ──
            The gallery and the board share the header, the theme and the data
            they are about. A separate route would mean a second screen with its
            own copy of "AI Autopilot" at the top and its own idea of what a
            project is. The query param keeps it linkable and survives a
            reload, which a piece of component state would not. */}
        <div role="tablist" aria-label="AI Autopilot sections"
          style={{ display: 'flex', gap: 3, marginTop: 14 }}>
          {([
            { id: 'projects', label: 'Projects' },
            { id: 'templates', label: 'Templates' },
          ] as const).map(v => {
            const on = view === v.id;
            return (
              <button key={v.id} role="tab" aria-selected={on}
                onClick={() => setParams(p => {
                  const next = new URLSearchParams(p);
                  if (v.id === 'projects') next.delete('view'); else next.set('view', v.id);
                  return next;
                }, { replace: true })}
                style={{
                  padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 13.5, fontWeight: on ? 800 : 600,
                  color: on ? T.accent : T.muted,
                  borderBottom: `2px solid ${on ? T.accent : 'transparent'}`, marginBottom: -1,
                }}>{v.label}</button>
            );
          })}
        </div>
      </div>

      {view === 'templates' ? (
        <TemplateGallery onBack={() => setParams(p => {
          const next = new URLSearchParams(p);
          next.delete('view');
          return next;
        }, { replace: true })} />
      ) : (
      <div style={{ padding: '18px clamp(16px, 3vw, 32px) 60px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading && <p style={{ fontSize: 13, color: T.muted }}>Loading…</p>}

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
          <p style={{ fontSize: 12.5, color: T.muted, margin: 0 }}>
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
      )}
    </div>
  );
}
