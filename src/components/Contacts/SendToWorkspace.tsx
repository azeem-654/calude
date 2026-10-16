/**
 * Contacts → "Send to AI Autopilot": a list, or the ticked contacts, handed to
 * an AI Autopilot business workspace to write to.
 *
 * What it does is said on each choice before it is pressed, and the work is
 * services/sendToWorkspace.ts — the same as AI Prospecting's "Add to an AI
 * Autopilot business workspace", so the two cannot disagree.
 */
import { useEffect, useMemo, useState } from 'react';
import { Bot, Loader, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Contact } from '../../types';
import type { ContactList } from '../../services/contactLists';
import { fetchBoard, type Project } from '../../services/projects';
import { mailable, sendToWorkspace, workspaceOptions } from '../../services/sendToWorkspace';

export default function SendToWorkspace({ people, from, label, createdBy, onClose, onDone }: {
  people: Contact[];
  /** The list being sent, when a whole one is. */
  from: ContactList | null;
  /** "the list “Dentists — Leeds”" or "3 ticked contacts". */
  label: string;
  createdBy: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    void fetchBoard().then(r => { if (!live) return; setProjects(r.projects as Project[]); setLoadError(r.error); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [busy, onClose]);

  const options = useMemo(() => workspaceOptions(projects ?? []), [projects]);
  const chosen = options.find(o => o.id === target && o.ok);
  const reach = people.filter(mailable).length;
  const cold = people.filter(c => c.status === 'prospect').length;

  const run = async () => {
    setErr('');
    const p = (projects ?? []).find(x => x.id === chosen?.id);
    if (!p) { setErr('Choose a business workspace.'); return; }
    setBusy(true);
    try {
      const r = await sendToWorkspace({ project: p, people, from, createdBy });
      if (!r.ok) { setErr(r.message); return; }
      onDone(r.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cl-modal-back" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="cl-modal" role="dialog" aria-modal="true" aria-label="Send to AI Autopilot" data-testid="cl-send-dialog">
        <h2><Bot size={18} color="#4f46e5" /> Send to AI Autopilot</h2>
        <p>
          {label}: {people.length} {people.length === 1 ? 'contact' : 'contacts'}, {reach} of whom can be emailed.
          The business workspace you choose writes to them as part of its plan{cold ? ' — people who never asked to hear from you are proposed 20 at a time, and each batch waits for your approval' : ''}.
        </p>
        {projects === null && <p><Loader size={12} className="spin" /> Reading your business workspaces…</p>}
        {loadError && <div className="cl-error">{loadError}</div>}
        {projects !== null && !options.length && <p>You have no AI Autopilot business workspaces yet.</p>}
        <div role="radiogroup" aria-label="Business workspace" data-field="contacts.sendTo" style={{ display: 'grid', gap: 8 }}>
          {options.map(o => (
            <label key={o.id} className="cl-choice" data-on={target === o.id} aria-disabled={!o.ok}>
              <input type="radio" name="cl-send" checked={target === o.id} disabled={!o.ok} onChange={() => setTarget(o.id)} />
              <span style={{ minWidth: 0 }}><b>{o.name}</b><small>{o.note}</small></span>
            </label>
          ))}
        </div>
        {err && <div className="cl-error" role="alert">{err}</div>}
        <div className="cl-modal-foot">
          <button type="button" className="cl-btn" onClick={() => navigate(from?.type === 'static' ? `/autopilot?new=1&list=${encodeURIComponent(from.id)}` : '/autopilot?new=1')}
            title={from?.type === 'static' ? 'Start a new business workspace that writes to this list' : 'Start a new business workspace'}>
            <Plus size={14} /> New business workspace
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="cl-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="cl-btn primary" onClick={() => void run()} disabled={busy || !chosen} data-testid="cl-send-go">
            {busy ? <Loader size={14} className="spin" /> : <Bot size={14} />} {chosen ? `Send to “${chosen.name}”` : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
