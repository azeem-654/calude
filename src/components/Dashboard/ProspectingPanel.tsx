/**
 * AI Prospecting, on the dashboard — a box to say who to sell to, and what
 * prospecting has already produced.
 *
 * The box does not search here: it hands the sentence to /prospecting as
 * `?q=`, where the run is shown step by step and the results can be ticked and
 * saved. A second, smaller search screen on the dashboard would be a second
 * implementation of the one thing that must stamp imports identically.
 *
 * The figures are counted from Contacts — prospects, how many have an
 * address, and how many of those addresses a mail server confirmed — so they
 * are true of this workspace and say nothing that was not checked.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUp, Clock, MailCheck, ShieldCheck, Sparkles, Users, ListChecks } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { loadSearches } from '../../services/prospectImport';
import { loadLists } from '../../services/contactLists';
import { askTitle } from '../../services/aiProspecting';
import '../Prospecting/aiProspecting.css';

export default function ProspectingPanel() {
  const { contacts } = useApp();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const recent = useMemo(() => loadSearches().slice(0, 3), []);
  const stats = useMemo(() => {
    const prospects = contacts.filter(c => c.status === 'prospect');
    return {
      lists: loadLists().filter(l => l.origin === 'prospecting').length,
      prospects: prospects.length,
      withEmail: prospects.filter(c => c.email).length,
      verified: contacts.filter(c => c.customFields?.emailStatus === 'valid').length,
    };
  }, [contacts]);

  const go = (q: string) => navigate(q.trim() ? `/prospecting?q=${encodeURIComponent(q.trim())}` : '/prospecting');

  return (
    <section className="aip-vars aip-dash" data-noinvert aria-label="AI Prospecting" data-testid="prospecting-panel">
      <div className="aip-dash-copy">
        <span className="aip-dash-title"><span className="aip-mark" aria-hidden="true"><Sparkles size={14} /></span> AI Prospecting</span>
        <p>Say who you want to sell to. It finds the businesses, reads the email address each one publishes, and checks it before you send.</p>
        <form className="aip-dash-box" onSubmit={e => { e.preventDefault(); go(text); }}>
          <input value={text} onChange={e => setText(e.target.value)} aria-label="Who do you want to sell to?" placeholder="Find dentists in Leeds with a website…" />
          <button type="submit" className="aip-send" aria-label="Start prospecting"><ArrowUp size={16} /></button>
        </form>
        {recent.length > 0 && (
          <div className="aip-dash-recent">
            {recent.map(r => (
              <button key={`${r.source}|${r.trade}|${r.place}`} type="button" className="aip-chip" onClick={() => go(`${r.trade} in ${r.place}`)}>
                <Clock size={11} /> {askTitle(r.trade, r.place)} · {r.count}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="aip-dash-stats">
        {[
          { Icon: ListChecks, n: stats.lists, label: 'lead lists' },
          { Icon: Users, n: stats.prospects, label: 'prospects in Contacts' },
          { Icon: MailCheck, n: stats.withEmail, label: 'with an email' },
          { Icon: ShieldCheck, n: stats.verified, label: 'mailboxes verified' },
        ].map(({ Icon, n, label }) => (
          <div key={label} className="aip-dash-stat"><Icon size={14} /><b>{n}</b><span>{label}</span></div>
        ))}
        <button type="button" className="aip-chip aip-dash-open" onClick={() => go('')}>Open AI Prospecting <ArrowRight size={12} /></button>
      </div>
    </section>
  );
}
