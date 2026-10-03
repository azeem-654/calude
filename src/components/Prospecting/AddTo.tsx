/**
 * "Add to…" — the ticked businesses into a workflow, an AI Autopilot project
 * or an email campaign that already exists, in one go.
 *
 * Every route first imports them (once each, stamped, on a contact list, after
 * the acceptable-use box) through the same `importChosen` as "Save as list",
 * then hands the contacts to the target the way that target already takes
 * people — never a second way in:
 *
 * - **Workflow** — `enrol_contacts` on the server (lib/automationEngine.ts
 *   `enrolInto`), only into a switched-on workflow. The workflow engine does
 *   not read the suppression list, so anybody on it is left out here and the
 *   count says so.
 * - **AI project** — the project's audience is a contact list
 *   (`brief.audience.listId`), and the cron re-reads it: adding to the list IS
 *   adding to the project, cold people still in batches of 20 that wait for
 *   approval. A project with a brief but no list is given this one, by
 *   re-saving it with every target it already had (saveProject resets what it
 *   is not sent). A project from before briefs is not touched.
 * - **Email campaign** — a draft is pointed at the list (the wizard reads it
 *   back at launch, through its own gate); a scheduled one has its sequence,
 *   and the new people are enrolled for the scheduled time, skipping the
 *   suppressed and the bouncing. One already sending or finished is refused:
 *   its recipients are a fact about the past.
 */
import { useEffect, useMemo, useState } from 'react';
import { Bot, GitBranch, Loader, Mail, Plus, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { fetchBoard, saveProject, type Project } from '../../services/projects';
import { enrolContacts } from '../../services/engagement';
import { enrollInSequence } from '../../services/contactEmail';
import { isSuppressed } from '../../services/deliverability';
import { flushNow } from '../../services/serverData';
import { recordProjectProspects } from '../../services/finders';
import { loadLists } from '../../services/contactLists';
import type { Contact } from '../../types';
import { Notice, RuleConfirm } from './ProspectParts';
import type { ListChoice, ProspectSearch } from './useProspectSearch';

export type AddMode = 'workflow' | 'project' | 'campaign';

const TITLE: Record<AddMode, string> = { workflow: 'Add to a workflow', project: 'Add to an AI project', campaign: 'Add to an email campaign' };
const ICON = { workflow: GitBranch, project: Bot, campaign: Mail };

/** May this contact be emailed by something we start? */
const mailable = (c: Contact) => !!c.email && !isSuppressed(c.email) && c.customFields?.emailStatus !== 'invalid';

interface Option { id: string; name: string; note: string; ok: boolean }

export default function AddTo({ s, mode, suggested, onClose, onDone, go }: {
  s: ProspectSearch;
  mode: AddMode;
  /** The list name to use when one has to be made — "Dentists — Leeds, Oct". */
  suggested: string;
  onClose: () => void;
  onDone: (message: string) => void;
  go: (to: string) => void;
}) {
  const { automations, campaigns, sequences, updateCampaign } = useApp();
  const [projects, setProjects] = useState<Project[] | null>(mode === 'project' ? null : []);
  const [projectError, setProjectError] = useState('');
  const [target, setTarget] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const Icon = ICON[mode];

  useEffect(() => {
    if (mode !== 'project') return;
    let live = true;
    void fetchBoard().then(r => { if (!live) return; setProjects(r.projects as Project[]); setProjectError(r.error); });
    return () => { live = false; };
  }, [mode]);

  const options: Option[] = useMemo(() => {
    if (mode === 'workflow') {
      return automations.map(a => ({
        id: a.id, name: a.name, ok: a.status === 'active',
        note: a.status === 'active' ? 'On — they start at its first step' : `${a.status === 'draft' ? 'A draft' : 'Paused'} — switch it on in Marketing → Automations first`,
      }));
    }
    if (mode === 'project') {
      return (projects ?? []).map(p => {
        const aud = (p.brief as { audience?: { listId?: string; listName?: string } } | null | undefined)?.audience;
        return {
          id: p.id, name: p.name, ok: !!p.brief,
          note: aud?.listId ? `Adds them to its list “${aud.listName || 'audience'}”` : p.brief ? 'Makes this list the people it writes to' : 'Made before projects had an audience — open it on the board to choose one',
        };
      });
    }
    return campaigns.filter(c => c.type === 'email').map(c => ({
      id: c.id, name: c.name,
      ok: c.status === 'draft' || (c.status === 'scheduled' && !!c.sequenceId),
      note: c.status === 'draft' ? `Draft — ${c.audienceListId ? `adds them to “${c.audienceListName ?? 'its list'}”` : 'its audience becomes this list'}`
        : c.status === 'scheduled' ? (c.sequenceId ? `Scheduled${c.scheduledAt ? ` for ${new Date(c.scheduledAt).toLocaleString()}` : ''} — they are added to it` : 'Scheduled without a send plan — open it to change who')
          : `${c.status === 'completed' ? 'Sent' : c.status === 'active' ? 'Sending now' : 'Paused'} — who it went to cannot change; start a new one`,
    }));
  }, [mode, automations, projects, campaigns]);

  const chosen = options.find(o => o.id === target && o.ok);
  const n = s.chosen.length;

  /** Import onto the right list for the target, and return the contacts. */
  const importFor = (listId?: string) => {
    let choice: ListChoice;
    const sameName = loadLists().find(l => l.type === 'static' && l.name === suggested);
    if (listId && loadLists().some(l => l.id === listId && l.type === 'static')) choice = { mode: 'existing', id: listId };
    else if (sameName) choice = { mode: 'existing', id: sameName.id };
    else choice = { mode: 'new', name: suggested };
    return s.importChosen(choice);
  };

  const run = async () => {
    setErr('');
    if (!chosen) { setErr(`Choose ${mode === 'workflow' ? 'a workflow' : mode === 'project' ? 'a project' : 'a campaign'}.`); return; }
    setBusy(true);
    try {
      if (mode === 'workflow') {
        const r = importFor();
        if ('error' in r) { setErr(r.error); return; }
        const people = r.contacts.filter(c => !c.email || !isSuppressed(c.email));
        await flushNow();
        const e = await enrolContacts(chosen.id, people.map(c => ({ id: c.id, name: c.name, email: c.email, phone: c.phone })));
        if (!e.success) { setErr(e.error ?? 'The workflow could not take them.'); return; }
        const left = r.contacts.length - people.length;
        onDone(`${e.started ?? 0} started “${e.name ?? chosen.name}”${e.already ? `, ${e.already} were already in it` : ''}${left ? `, ${left} left out because they asked not to be emailed` : ''}. They are on the list “${r.list?.name}” too.`);
        return;
      }

      if (mode === 'project') {
        const p = (projects ?? []).find(x => x.id === chosen.id)!;
        const brief = (p.brief ?? {}) as Record<string, unknown> & { audience?: { listId?: string } };
        const r = importFor(brief.audience?.listId);
        if ('error' in r) { setErr(r.error); return; }
        await flushNow();
        if (!brief.audience?.listId || brief.audience.listId !== r.list?.id) {
          let goals: string[] = [];
          try { goals = JSON.parse(p.goals || '[]') as string[]; } catch { goals = []; }
          const saved = await saveProject({
            id: p.id, name: p.name, objective: p.objective, portfolioId: p.portfolioId, kind: p.kind,
            revenueTarget: p.revenueTarget, volumeTarget: p.volumeTarget, goals,
            brief: { ...brief, audience: { listId: r.list!.id, listName: r.list!.name } },
          });
          if (!saved.success) { setErr(`They were saved on “${r.list?.name}”, but the project could not be pointed at it: ${saved.error ?? 'no answer'}.`); return; }
        }
        /* Counted on the project's Prospects tab beside what its daily finder adds. */
        await recordProjectProspects(p.id, r.contacts.map(c => ({
          ref: `contact:${c.id}`, contactId: c.id, name: c.name, email: c.email, phone: c.phone, website: c.website ?? '',
          address: c.address ?? '', category: c.tags?.[1] ?? '', emailStatus: c.customFields?.emailStatus ?? '',
          foundAt: c.customFields?.foundAt ?? '', query: s.searched ? `${s.searched.trade}|${s.searched.place}` : '',
        })));
        const reach = r.contacts.filter(mailable).length;
        onDone(`${r.contacts.length} on “${p.name}”'s list “${r.list?.name}” — ${reach} can be emailed. Autopilot proposes them in batches of 20 and asks you before each one, because they never asked to hear from you.`);
        return;
      }

      const c = campaigns.find(x => x.id === chosen.id)!;
      const r = importFor(c.audienceListId);
      if ('error' in r) { setErr(r.error); return; }
      if (c.status === 'draft') {
        if (!c.audienceListId || c.audienceListId !== r.list?.id) {
          updateCampaign(c.id, { audience: 'list', audienceListId: r.list!.id, audienceListName: r.list!.name });
        }
        onDone(`“${c.name}” will go to the list “${r.list?.name}” (${r.contacts.length} added). It is still a draft — the campaign checks every address again when you launch it.`);
        return;
      }
      const seq = sequences.find(x => x.id === c.sequenceId);
      if (!seq) { setErr('That campaign\'s send plan is missing — open it in Marketing to fix it.'); return; }
      const ok = r.contacts.filter(mailable);
      for (const person of ok) enrollInSequence(person, seq, { firstSendAt: c.scheduledAt });
      const had = new Set((c.recipients ?? []).map(x => x.id));
      const recipients = [...(c.recipients ?? []), ...ok.filter(x => !had.has(x.id)).map(x => ({ id: x.id, name: x.name, email: x.email }))];
      updateCampaign(c.id, { recipients, recipientCount: recipients.length });
      const skipped = r.contacts.length - ok.length;
      onDone(`${ok.length} added to “${c.name}”${c.scheduledAt ? `, going out ${new Date(c.scheduledAt).toLocaleString()}` : ''}${skipped ? `. ${skipped} left out — no address, an address that bounces, or somebody who asked not to be emailed` : ''}.`);
    } finally {
      setBusy(false);
    }
  };

  const fresh = mode === 'workflow'
    ? { label: 'Make a new workflow', to: '/marketing?tab=automations' }
    : null;

  return (
    <section className="aip-card" aria-label={TITLE[mode]}>
      <div className="aip-card-head">
        <span className="aip-card-title"><Icon size={14} /> {TITLE[mode]} <span className="aip-pill">{n} ticked</span></span>
        <span style={{ flex: 1 }} />
        <button type="button" className="aip-icon-btn" aria-label="Close" onClick={onClose}><X size={14} /></button>
      </div>
      <div style={{ padding: '0 16px 16px', display: 'grid', gap: 10 }}>
        {mode === 'project' && projects === null && <span className="aip-muted"><Loader size={12} className="spin" /> Reading your projects…</span>}
        {projectError && <Notice text={projectError} />}
        {projects !== null && !options.length && (
          <span className="aip-muted">
            {mode === 'workflow' ? 'You have no workflows yet.' : mode === 'project' ? 'You have no AI projects yet.' : 'You have no email campaigns yet.'}
          </span>
        )}
        <div role="radiogroup" aria-label={TITLE[mode]} className="aip-targets" data-field={`addto.${mode}`}>
          {options.map(o => (
            <label key={o.id} className="pp-choice" data-on={target === o.id} style={{ opacity: o.ok ? 1 : 0.55 }}>
              <input type="radio" name={`aip-${mode}`} checked={target === o.id} disabled={!o.ok} onChange={() => setTarget(o.id)} />
              <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
                <b style={{ fontSize: 13, color: 'var(--pp-ink)', overflowWrap: 'anywhere' }}>{o.name}</b>
                <small className="aip-muted">{o.note}</small>
              </span>
            </label>
          ))}
        </div>
        <div className="aip-row">
          {fresh && <button type="button" className="aip-chip" onClick={() => go(fresh.to)}><Plus size={12} /> {fresh.label}</button>}
          {mode !== 'workflow' && (
            <span className="aip-muted">Or save them as a list and start a new {mode === 'project' ? 'project' : 'campaign'} from it — the list's buttons on the left.</span>
          )}
        </div>
        <RuleConfirm confirmed={confirmed} onChange={setConfirmed} />
        {err && <Notice text={err} />}
        <button type="button" className="aip-btn" data-accent="true" disabled={busy || !n || !confirmed || !chosen} onClick={() => void run()}
          style={{ justifyContent: 'center', padding: '10px 14px' }}
          title={!n ? 'Tick the businesses first' : !chosen ? 'Choose where they go' : !confirmed ? 'Confirm the rule above first' : undefined}>
          {busy ? <Loader size={14} className="spin" /> : <Icon size={14} />} {chosen ? `Add ${n} to “${chosen.name}”` : `Add ${n}`}
        </button>
      </div>
    </section>
  );
}
