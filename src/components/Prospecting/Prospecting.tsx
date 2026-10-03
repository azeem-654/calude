/**
 * Prospecting — finding businesses to sell to, and keeping them in lists that
 * the rest of the product can use.
 *
 * ── Why a page, when there was a dialog ──
 *
 * "Find businesses" lived behind a button in Contacts, which is where you go
 * to look at people you already have. Finding new ones is a job of its own
 * that somebody does every week: the same searches again, the results into a
 * named list, and that list into a campaign or an Autopilot project. A
 * dialog that forgets everything on close cannot hold any of that.
 *
 * The search itself is not reimplemented here — `useProspectSearch` and
 * `ProspectParts` are the dialog's insides, shared, so the two can never
 * stamp an import differently or word the acceptable-use rule differently.
 *
 * ── The lists are Contacts' lists ──
 *
 * An import goes into a static list in `crm_contact_lists`, the same model
 * Contacts' list chips, the campaign wizard and the Autopilot wizard read, and
 * it syncs to the server with the rest of the workspace. Nothing here keeps a
 * second idea of what a list is. What Prospecting adds is `kind: 'cold'` on
 * the lists it makes, because it is the one place that knows for certain the
 * people on them never asked to hear from anybody.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Building2, CheckCircle2, ListChecks, Mail, Send, Users } from 'lucide-react';
import Header from '../Layout/Header';
import { useApp } from '../../context/AppContext';
import { useProspectSearch, outcomeText, sourceLine, type ImportOutcome } from './useProspectSearch';
import {
  Attribution, ImportPanel, ResultsTable, SearchBoxes, SearchHint, SearchHistory, SearchProblems, SourceTabs,
} from './ProspectParts';
import { suggestListName } from '../../services/prospectImport';
import { listKindOf, loadLists, type ContactList } from '../../services/contactLists';
import type { Contact } from '../../types';
import './prospecting.css';

const INK = '#17191c';
const MUTED = '#6b7280';

/** Where a list goes next — the same three everywhere a list is offered. */
function ListShortcuts({ list, go }: { list: ContactList; go: (to: string) => void }) {
  const id = encodeURIComponent(list.id);
  return (
    <div className="pp-actions">
      <button type="button" className="pp-btn" onClick={() => go(`/marketing?new=campaign&list=${id}`)}>
        <Send size={12} /> Send a campaign to this list
      </button>
      <button type="button" className="pp-btn" onClick={() => go(`/autopilot?new=1&list=${id}`)}>
        <Bot size={12} /> Use this list in a new Autopilot project
      </button>
      <button type="button" className="pp-btn" onClick={() => go(`/contacts?list=${id}`)}>
        <Users size={12} /> Open in Contacts
      </button>
    </div>
  );
}

const members = (l: ContactList, contacts: Contact[]) => {
  const ids = new Set(l.memberIds);
  return contacts.filter(c => ids.has(c.id));
};

export default function Prospecting() {
  const { contacts } = useApp();
  const navigate = useNavigate();
  const s = useProspectSearch();
  const [version, setVersion] = useState(0);
  const [done, setDone] = useState<ImportOutcome | null>(null);

  /* The lists this page made, and any other hand-picked list that holds
     prospects — somebody who moved a few into "Hot leads" by hand still
     thinks of them as found businesses. */
  const lists = useMemo(() => loadLists()
    .filter(l => l.type === 'static' && (l.origin === 'prospecting' || listKindOf(l, members(l, contacts)) === 'cold'))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [contacts, version]);

  const suggested = suggestListName(s.searched?.trade ?? s.trade, s.searched?.place ?? s.place);

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header title="Prospecting" subtitle="Find businesses to sell to, and keep them in lists" />
      <div style={{ padding: '14px clamp(16px, 3vw, 28px) 60px', maxWidth: 1320, boxSizing: 'border-box' }}>
        <div className="pp-page">
          <main style={{ display: 'grid', gap: 16, minWidth: 0 }}>
            <section className="pp-card" aria-label="Search" style={{ display: 'grid', gap: 13 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <SourceTabs s={s} />
                <span style={{ fontSize: 12, color: MUTED, minWidth: 0 }}>{sourceLine(s)}</span>
              </div>
              <SearchBoxes s={s} />
              {!s.results && !s.error && !s.googleDown && <SearchHint s={s} />}
              <SearchProblems s={s} />
              <SearchHistory s={s} />
            </section>

            {done && (
              <section className="pp-card" role="status" style={{ display: 'grid', gap: 10, borderColor: '#bbe5c8', background: '#f3fbf5' }}>
                <span style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, fontWeight: 700, color: '#14532d', lineHeight: 1.5 }}>
                  <CheckCircle2 size={17} style={{ flexShrink: 0, marginTop: 2 }} /> {outcomeText(done)}
                </span>
                {done.list
                  ? <ListShortcuts list={done.list} go={navigate} />
                  : <span style={{ fontSize: 12.5, color: '#166534' }}>They are in Contacts as prospects. Put them on a list next time to send to them as one group.</span>}
              </section>
            )}

            {s.results && s.results.length > 0 && (
              <section className="pp-card" aria-label="Results" style={{ display: 'grid', gap: 14 }}>
                <ResultsTable s={s} />
                <div style={{ borderTop: '1px solid #f0f2f6', paddingTop: 14 }}>
                  <ImportPanel s={s} initial="new" suggested={suggested} listsVersion={version}
                    onDone={r => {
                      if ('error' in r) return;
                      setDone(r);
                      setVersion(v => v + 1);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }} />
                </div>
                <Attribution s={s} />
              </section>
            )}

            {!s.results && !s.busy && !s.history.length && (
              <section className="pp-card" style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
                <Building2 size={22} color="#5b46e5" />
                <b style={{ fontSize: 15, color: INK }}>Start with a kind of business and a town</b>
                <span style={{ fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
                  “Dentists” in “Leeds”, “cafes” in “Bristol”. Tick the ones that fit, look up the email addresses they
                  publish, and put them in a list you can send a campaign to or hand to an Autopilot project.
                </span>
              </section>
            )}
          </main>

          <aside className="pp-side" aria-label="Your prospect lists">
            <section className="pp-card" style={{ display: 'grid', gap: 6 }}>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 800, color: INK }}>
                <ListChecks size={16} /> Your prospect lists
              </span>
              {!lists.length && (
                <span style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
                  None yet. Search above, tick the businesses that fit, and add them to a new list — it appears here,
                  in Contacts, and as an audience in campaigns and Autopilot projects.
                </span>
              )}
              {lists.map(l => {
                const m = members(l, contacts);
                const withEmail = m.filter(c => c.email).length;
                return (
                  <div key={l.id} className="pp-list-row" data-list={l.id}>
                    <span style={{ minWidth: 0 }}>
                      <b style={{ fontSize: 13.5, color: INK, overflowWrap: 'anywhere' }}>{l.name}</b>
                      <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                        {m.length} {m.length === 1 ? 'business' : 'businesses'} · <Mail size={10} style={{ verticalAlign: -1 }} /> {withEmail} with an email
                        {' · '}{new Date(l.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                      </span>
                    </span>
                    <ListShortcuts list={l} go={navigate} />
                  </div>
                );
              })}
            </section>
            <section className="pp-card" style={{ display: 'grid', gap: 8, fontSize: 12.5, color: '#334155', lineHeight: 1.6 }}>
              <b style={{ fontSize: 13.5, color: INK }}>Found businesses are strangers</b>
              <span>
                Nobody on these lists asked to hear from you, and the app treats them that way: Autopilot starts them
                a few at a time and asks you before each batch, and a campaign to one reminds you of the rule you agreed
                to when you added them.
              </span>
              <span style={{ color: MUTED }}>
                Neither map publishes many email addresses. “Look up email addresses” reads each business’s own website
                for the one it chose to publish — never a guessed one.
              </span>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
