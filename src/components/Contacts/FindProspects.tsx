/**
 * Finding businesses to approach — in the free directory, or on Google Maps.
 *
 * ── Free first ──
 *
 * The owner asked for prospect search that costs them nothing. The free
 * directory (OpenStreetMap's businesses through Geoapify, or OpenStreetMap's
 * own servers for trades Geoapify has no category for — worker/src/lib/
 * geoapify.ts) is what this screen opens on, and its results may be kept.
 * Google Maps is the second tab: more businesses in thinly mapped places,
 * on the owner's key and budget, and Google's terms restrict keeping them.
 *
 * ── Why Google, and why it is the owner's key ──
 *
 * This shipped on OpenStreetMap alone and was held back from the live app,
 * because how useful it was depended on how well the customer's own town had
 * been mapped — thin for a sole trader in a suburb. Google Maps has them. The
 * install owner provides one key for every customer (Settings → Platform
 * services); nobody here is asked for one. The server guards it: a budget per
 * workspace, nothing after a trial ends, and each refusal says which.
 *
 * OpenStreetMap stays as the second choice. It costs nobody anything and its
 * results may be kept, which is worth having one tap away — and it is what
 * this screen offers when Google cannot be searched right now.
 *
 * ── Saying what it is not good at ──
 *
 * Neither map publishes email addresses. That is said before the search, and
 * the next step reads each ticked business's own website for the address it
 * chose to publish — never a guessed `firstname@`.
 *
 * ── The bit that is not ours to decide ──
 *
 * Whether these people may be emailed. The confirmation before importing is
 * clause 3 of the acceptable use policy; it lives in `ImportPanel`
 * (Prospecting/ProspectParts.tsx) with the rest of this dialog's insides,
 * which the Prospecting page draws too — one implementation, so the two can
 * never word the rule differently or stamp an import differently.
 */
import { useState } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useProspectSearch, outcomeText, sourceLine } from '../Prospecting/useProspectSearch';
import {
  Attribution, ImportPanel, ResultsTable, SearchBoxes, SearchHint, SearchHistory, SearchProblems, SourceTabs,
} from '../Prospecting/ProspectParts';
import { suggestListName } from '../../services/prospectImport';

const INK = '#17191c';
const MUTED = '#6b7280';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

export default function FindProspects({ onClose, onImported }: {
  onClose: () => void;
  /** Told after an import, so the screen behind can re-read its lists. */
  onImported?: () => void;
}) {
  const { addNotification } = useApp();
  const navigate = useNavigate();
  const s = useProspectSearch();
  const [version, setVersion] = useState(0);

  return (
    <div role="dialog" aria-label="Find businesses" style={{
      position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.45)', zIndex: 200,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: 'clamp(12px, 4vw, 44px) clamp(12px, 4vw, 24px)', overflowY: 'auto',
    }}>
      <div style={{ width: '100%', maxWidth: 680, background: '#fff', borderRadius: 18, overflow: 'hidden', minWidth: 0 }}>
        <header style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '15px 18px', borderBottom: `1px solid ${LINE}` }}>
          <Search size={16} color={ACCENT} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: INK }}>Find businesses</span>
            <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 1 }}>{sourceLine(s)}</span>
          </span>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 0, padding: 4, cursor: 'pointer', color: MUTED }}>
            <X size={17} />
          </button>
        </header>

        <div style={{ padding: 18, display: 'grid', gap: 13, minWidth: 0 }}>
          <SourceTabs s={s} />
          <SearchBoxes s={s} />
          {!s.results && !s.error && !s.googleDown && <SearchHint s={s} />}
          <SearchProblems s={s} />
          {!s.results && <SearchHistory s={s} limit={4} />}

          {s.results && s.results.length > 0 && (<>
            <ResultsTable s={s} maxHeight={340} />
            <ImportPanel s={s} initial="none" listsVersion={version}
              suggested={suggestListName(s.searched?.trade ?? '', s.searched?.place ?? '')}
              onDone={r => {
                if ('error' in r) return;
                setVersion(v => v + 1);
                addNotification(outcomeText(r), 'success');
                onImported?.();
                onClose();
              }} />
            <Attribution s={s} />
          </>)}

          {/* The page has the history, the saved lists and the shortcuts into
              campaigns and Autopilot; this dialog is the quick way in. */}
          <button type="button" className="pp-link" style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 5, color: MUTED }}
            onClick={() => { onClose(); navigate('/prospecting'); }}>
            Open AI Prospecting for saved searches, email checks and your lists <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
