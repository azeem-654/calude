/**
 * The fields that should be a choice, not a blank box.
 *
 * ── The complaint this answers ──
 *
 * A trigger said "Only this form" above an empty text box with "Get a quote"
 * greyed into it. Nobody knew what to type: the name of a form they had made?
 * Where would they find it? What if they had not made one? And typing it was
 * worse than unhelpful — the engine matches a form trigger on the form's name,
 * so a typo, or renaming the form later, produced a workflow that never started
 * and said nothing about why.
 *
 * So wherever there is a real list — your forms, the tags already on your
 * contacts, the stages on your pipelines — this offers the list. Where there is
 * nothing to choose yet, it says so and lets it be made on the spot. Where a box
 * is genuinely free text, it says what goes in it and what happens if it is
 * left blank.
 *
 * ── How it plugs in ──
 *
 * `StepSettings` asks `renderGuided` for each field and falls back to the plain
 * control when this returns null. The field table stays the one description of
 * what a step takes; this only decides how some of those fields are asked.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Loader, X, Check, FileText, Tag as TagIcon, ExternalLink, Info,
  UserPlus, GitBranch, CalendarCheck, MailOpen, MousePointerClick, BookUser, Globe, Search, Rss, PlaySquare,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { listOf, saveOf, type EngageForm, type FormField } from '../../services/engagement';
import type { WorkflowNode } from '../../services/autopilot';
import type { FieldDef, GraphAccess } from './StepSettings';
import { AGENT_SOURCES, patchStep, pointReaderAt, readerOf } from './workflowNodes';
import { T, ghostBtn, primaryBtn } from './theme';

type Set = (key: string, value: string) => void;

const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 4 };
const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9,
  border: `1px solid ${T.line}`, fontSize: 12.5, outline: 'none', fontFamily: 'inherit',
  background: '#fff', color: T.ink,
};
const hint: React.CSSProperties = { display: 'block', fontSize: 10.5, color: T.muted, marginTop: 4, lineHeight: 1.5 };

/* ── Forms ───────────────────────────────────────────────────────────────── */

/**
 * The forms in this workspace, asked for once per panel.
 *
 * Drafts are listed too, marked, because somebody who has just made one and
 * not yet switched it on is looking for it — hiding it would read as "it did
 * not save". Choosing a draft says plainly that it is not collecting yet.
 */
function useForms() {
  const [forms, setForms] = useState<EngageForm[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const reload = async () => {
    const r = await listOf('form');
    if (!r.success) setError(String(r.error ?? 'Could not read your forms.'));
    setForms(r.success ? ((r.items ?? []) as EngageForm[]) : []);
    setLoaded(true);
  };
  useEffect(() => { void reload(); }, []);
  return { forms, loaded, error, reload, add: (f: EngageForm) => setForms(list => [f, ...list]) };
}

function FormTrigger({ node, set }: { node: WorkflowNode; set: Set }) {
  const { forms, loaded, error, add } = useForms();
  const [making, setMaking] = useState(false);
  const chosenId = String(node.config?.formId ?? '');
  const chosenName = String(node.config?.formName ?? '');
  /* Matched by id first and by name second, so a workflow saved before forms
     were chosen by id still finds its form. */
  const chosen = forms.find(f => f.id === chosenId) ?? forms.find(f => f.name === chosenName) ?? null;

  const pick = (f: EngageForm | null) => {
    set('formId', f?.id ?? '');
    set('formName', f?.name ?? '');
  };

  return (
    <div>
      <span style={lbl}>Which form starts it</span>
      <select
        value={chosen?.id ?? ''}
        onChange={e => pick(forms.find(f => f.id === e.target.value) ?? null)}
        style={inp}
        aria-label="Which form starts it"
      >
        <option value="">Any form in this workspace</option>
        {forms.map(f => (
          <option key={f.id} value={f.id}>
            {f.name}{f.status !== 'live' ? ' — draft, not collecting yet' : ''}
          </option>
        ))}
      </select>

      {!loaded && <span style={hint}><Loader size={10} className="spin" /> Reading your forms…</span>}
      {error && <span style={{ ...hint, color: T.bad }}>{error}</span>}

      {loaded && !forms.length && !error && (
        <span style={hint}>
          You have no forms yet, so this would start on any form — which today means none. Make one below
          and it is attached straight away.
        </span>
      )}
      {loaded && !!forms.length && !chosen && (
        <span style={hint}>
          Left on "any form", every form in this workspace starts it — the quote form, the newsletter
          sign-up and the complaints form alike. Pick one unless that is what you mean.
        </span>
      )}
      {chosen && chosen.status !== 'live' && (
        <span style={{ ...hint, color: T.warn }}>
          "{chosen.name}" is a draft. It takes nothing until it is switched on in Customer Engagement → Forms.
        </span>
      )}
      {chosen && chosen.status === 'live' && (
        <span style={hint}>
          Starts when somebody sends "{chosen.name}". Renaming the form later does not break this —
          it is attached by the form itself, not by its name.
        </span>
      )}

      <button type="button" onClick={() => setMaking(true)} style={{ ...ghostBtn, marginTop: 8, borderRadius: 9 }}>
        <Plus size={11} /> Make a new form
      </button>

      {making && (
        <FormQuickCreate
          onClose={() => setMaking(false)}
          onMade={f => { add(f); pick(f); setMaking(false); }}
        />
      )}
    </div>
  );
}

/** The questions a new form can ask, with the ones nearly every form wants ticked. */
const STARTER_FIELDS: { field: FormField; on: boolean; why: string }[] = [
  { field: { key: 'name', label: 'Your name', type: 'text', required: true }, on: true, why: 'So a reply can start with their name.' },
  { field: { key: 'email', label: 'Email', type: 'email', required: true }, on: true, why: 'Needed for any email step to reach them.' },
  { field: { key: 'phone', label: 'Phone', type: 'tel' }, on: false, why: 'Needed for any text or call step.' },
  { field: { key: 'company', label: 'Company', type: 'text' }, on: false, why: 'Useful for business customers.' },
  { field: { key: 'message', label: 'How can we help?', type: 'textarea' }, on: true, why: 'What they actually want.' },
];

/**
 * A form, made without leaving the step.
 *
 * ── What it makes, and what it does not ──
 *
 * A real form in Customer Engagement → Forms, switched on, attached to this
 * trigger the moment it is saved. What it cannot do on its own is appear on a
 * website: a form collects nothing until a page has a form block pointing at
 * it. That is said at the end, with the two places to do it, rather than left
 * for somebody to discover when no enquiries arrive.
 */
function FormQuickCreate({ onClose, onMade }: { onClose: () => void; onMade: (f: EngageForm) => void }) {
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [picked, setPicked] = useState<Record<string, boolean>>(
    () => Object.fromEntries(STARTER_FIELDS.map(s => [s.field.key, s.on])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [made, setMade] = useState<EngageForm | null>(null);

  const fields = STARTER_FIELDS.filter(s => picked[s.field.key]).map(s => s.field);
  const ready = name.trim().length >= 2 && fields.some(f => f.key === 'email' || f.key === 'phone');

  async function create() {
    if (!ready || saving) return;
    setSaving(true);
    setError('');
    const r = await saveOf('form', {
      name: name.trim(),
      headline: purpose.trim() || name.trim(),
      fields,
      submitLabel: 'Send',
      createPerson: true,
      /* Live, because the whole point of making it here is for this workflow
         to start on it. A draft would leave the trigger waiting on a form that
         refuses every submission. */
      status: 'live',
    });
    setSaving(false);
    if (!r.success || !r.item) { setError(String(r.error ?? 'The form could not be made.')); return; }
    setMade(r.item as EngageForm);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Make a new form"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        /* Above the step panel it opens from, which sits above the top bar. */
        position: 'fixed', inset: 0, zIndex: 450, background: 'rgba(15,17,23,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}>
      <div style={{
        width: 'min(460px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#fff',
        borderRadius: 16, boxShadow: '0 24px 60px -20px rgba(16,24,40,0.45)',
      }}>
        <header style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '14px 16px',
          borderBottom: `1px solid ${T.line}`,
        }}>
          <FileText size={15} color={T.accent} />
          <span style={{ flex: 1, fontSize: 14.5, fontWeight: 800, color: T.ink }}>
            {made ? 'Form made and attached' : 'Make a new form'}
          </span>
          <button onClick={onClose} aria-label="Close" style={{
            border: 'none', background: 'none', padding: 4, cursor: 'pointer', color: T.muted, display: 'flex',
          }}><X size={16} /></button>
        </header>

        {!made ? (
          <div style={{ padding: 16, display: 'grid', gap: 13 }}>
            <label>
              <span style={lbl}>1. What is it called?</span>
              <input value={name} onChange={e => setName(e.target.value)} style={inp}
                placeholder="Get a quote" autoFocus />
              <span style={hint}>Only you see this name. It is how you pick it on a page later.</span>
            </label>

            <label>
              <span style={lbl}>2. What is it for? (optional)</span>
              <input value={purpose} onChange={e => setPurpose(e.target.value)} style={inp}
                placeholder="Ask for a price on a boiler install" />
              <span style={hint}>Shown as the form's heading where the form is shown on its own.</span>
            </label>

            <div>
              <span style={lbl}>3. What should it ask?</span>
              <div style={{ display: 'grid', gap: 6 }}>
                {STARTER_FIELDS.map(s => (
                  <label key={s.field.key} style={{
                    display: 'flex', gap: 9, alignItems: 'flex-start', padding: '8px 10px',
                    border: `1px solid ${picked[s.field.key] ? T.accent : T.line}`, borderRadius: 10,
                    background: picked[s.field.key] ? T.accentSoft : '#fff', cursor: 'pointer',
                  }}>
                    <input type="checkbox" checked={!!picked[s.field.key]}
                      onChange={e => setPicked(p => ({ ...p, [s.field.key]: e.target.checked }))}
                      style={{ marginTop: 2 }} />
                    <span>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: T.ink }}>
                        {s.field.label}
                      </span>
                      <span style={{ display: 'block', fontSize: 10.5, color: T.muted, marginTop: 1 }}>{s.why}</span>
                    </span>
                  </label>
                ))}
              </div>
              {!fields.some(f => f.key === 'email' || f.key === 'phone') && (
                <span style={{ ...hint, color: T.warn }}>
                  Ask for at least an email or a phone — without one there is nobody to reply to.
                </span>
              )}
            </div>

            {error && <p style={{ margin: 0, fontSize: 12, color: T.bad }}>{error}</p>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={ghostBtn}>Cancel</button>
              <button onClick={() => void create()} disabled={!ready || saving} className={ready ? 'press ap-btn' : 'press'}
                style={{ ...primaryBtn, opacity: ready ? 1 : 0.55, cursor: ready && !saving ? 'pointer' : 'default' }}>
                {saving ? <><Loader size={12} className="spin" /> Making…</> : <><Check size={12} /> Make it and attach it</>}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 16, display: 'grid', gap: 12 }}>
            <p style={{
              margin: 0, padding: '10px 12px', borderRadius: 11, background: T.goodSoft,
              color: '#15803d', fontSize: 12.5, lineHeight: 1.55, display: 'flex', gap: 7,
            }}>
              <Check size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>"{made.name}" is live and this workflow now starts whenever it is sent.</span>
            </p>
            {/* The step people miss. Said now rather than discovered when no
                enquiries arrive. */}
            <div style={{
              padding: '10px 12px', borderRadius: 11, background: T.warnSoft,
              border: `1px solid ${T.warn}33`, fontSize: 12, lineHeight: 1.6, color: T.ink,
            }}>
              <strong style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.warn }}>
                <Info size={13} /> One more thing before it collects anything
              </strong>
              A form has to be on a page for anybody to fill it in. In a website or funnel, add a
              <strong> Form</strong> block and choose <strong>"{made.name}"</strong> under
              <strong> Collects into</strong>.
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <Link to="/websites" style={{ ...ghostBtn, textDecoration: 'none' }}>
                  Open Websites <ExternalLink size={10} />
                </Link>
                <Link to="/funnels" style={{ ...ghostBtn, textDecoration: 'none' }}>
                  Open Funnels <ExternalLink size={10} />
                </Link>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => onMade(made)} className="press ap-btn" style={primaryBtn}>
                <Check size={12} /> Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Tags and stages ─────────────────────────────────────────────────────── */

/**
 * Tags, chosen from the ones already on your contacts.
 *
 * A tag trigger matches the tag exactly as written, so "Enquiry", "enquiry "
 * and "enquries" are three different tags and only one of them is on anybody.
 * Offering the ones that exist is the difference between a workflow that
 * starts and one that waits for ever. A new tag can still be typed — the first
 * contact to get it is the first one it applies to.
 */
function TagPicker({ value, onChange, label, why }: {
  value: string; onChange: (v: string) => void; label: string; why: string;
}) {
  const { contacts } = useApp();
  const known = useMemo(() => {
    const count = new Map<string, number>();
    for (const c of contacts ?? []) {
      for (const t of c.tags ?? []) {
        const k = String(t).trim();
        if (k) count.set(k, (count.get(k) ?? 0) + 1);
      }
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
  }, [contacts]);

  const exists = !value || known.some(([t]) => t.toLowerCase() === value.trim().toLowerCase());

  return (
    <div>
      <span style={lbl}>{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} style={inp} placeholder="Type a tag, or pick one below"
        aria-label={label} />
      {known.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 7 }}>
          {known.map(([t, n]) => {
            const on = t.toLowerCase() === value.trim().toLowerCase();
            return (
              <button key={t} type="button" onClick={() => onChange(t)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999,
                fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${on ? T.accent : T.line}`,
                background: on ? T.accentSoft : '#fff', color: on ? T.accent : T.ink,
              }}>
                <TagIcon size={9} /> {t} <span style={{ color: T.faint, fontWeight: 600 }}>{n}</span>
              </button>
            );
          })}
        </div>
      )}
      <span style={hint}>{why}</span>
      {!exists && (
        <span style={{ ...hint, color: T.warn }}>
          No contact has "{value.trim()}" yet. That is fine for a new tag — just check it is not a
          misspelling of one above.
        </span>
      )}
    </div>
  );
}

/** Pipeline stages, grouped by pipeline, chosen rather than typed. */
function StagePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { pipelines } = useApp();
  const list = (pipelines ?? []).filter(p => (p.stages ?? []).length);
  return (
    <div>
      <span style={lbl}>Which stage starts it</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={inp} aria-label="Which stage starts it">
        <option value="">Any stage change</option>
        {list.map(p => (
          <optgroup key={p.id} label={p.name}>
            {p.stages.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </optgroup>
        ))}
      </select>
      <span style={hint}>
        {value
          ? `Starts when a deal is moved into "${value}". A deal already sitting there does not start it — only a move does.`
          : 'Left on "any", every move of every deal starts it. Pick the stage that means something, like Proposal or Won.'}
      </span>
      {!list.length && (
        <span style={{ ...hint, color: T.warn }}>
          There are no pipelines yet. Make one under Sales → Pipelines and its stages appear here.
        </span>
      )}
    </div>
  );
}

/* ── Personalisation ─────────────────────────────────────────────────────── */

const TOKENS: { token: string; label: string }[] = [
  { token: '{{firstName}}', label: 'First name' },
  { token: '{{name}}', label: 'Full name' },
  { token: '{{company}}', label: 'Company' },
  { token: '{{email}}', label: 'Email' },
];

/**
 * A message field with the personal details one click away.
 *
 * The tokens were only ever mentioned in a hint, spelled with double braces,
 * which is how "Hi {{firstname}}" — lower-case n, filled with nothing — ends up
 * in somebody's inbox. Clicking one inserts it correctly spelled.
 */
function TokenField({ field, node, set }: { field: FieldDef; node: WorkflowNode; set: Set }) {
  const value = String(node.config?.[field.key] ?? '');
  const area = field.kind === 'textarea';
  const insert = (t: string) => set(field.key, `${value}${value && !/\s$/.test(value) ? ' ' : ''}${t}`);
  const Tag = area ? 'textarea' : 'input';
  return (
    <label style={{ display: 'block' }}>
      <span style={lbl}>{field.label}</span>
      <Tag
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => set(field.key, e.target.value)}
        placeholder={field.placeholder}
        {...(area ? { rows: 6 } : {})}
        style={{ ...inp, ...(area ? { resize: 'vertical', lineHeight: 1.5 } : {}) }}
      />
      <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 10.5, color: T.muted }}>Insert:</span>
        {TOKENS.map(t => (
          <button key={t.token} type="button" onClick={e => { e.preventDefault(); insert(t.token); }} style={{
            padding: '2px 8px', borderRadius: 999, border: `1px solid ${T.line}`, background: '#fff',
            fontSize: 10.5, fontWeight: 700, color: T.accent, cursor: 'pointer', fontFamily: 'inherit',
          }}>{t.label}</button>
        ))}
      </span>
      {field.hint && <span style={hint}>{field.hint}</span>}
    </label>
  );
}

/**
 * The follow-up question for a person-started trigger: which form, which tag,
 * which stage. Returned for the chooser to put directly under the option that
 * was chosen, so the next thing to fill in is where the eye already is.
 */
function narrowingFor(node: WorkflowNode, set: Set): ReactNode | null {
  const event = String(node.config?.event ?? '');
  const value = String(node.config?.tag ?? '');
  const onChange = (v: string) => set('tag', v);
  if (event === 'form_submitted') return <FormTrigger node={node} set={set} />;
  if (event === 'deal_stage_changed') return <StagePicker value={value} onChange={onChange} />;
  if (event === 'tag_added') {
    return <TagPicker value={value} onChange={onChange} label="Which tag starts it"
      why="Starts the moment a contact is given this tag — by you, by a form, or by another workflow." />;
  }
  if (event === 'appointment_scheduled' || event === 'email_opened' || event === 'link_clicked') {
    const what = event === 'appointment_scheduled' ? 'appointment title' : 'email subject';
    return (
      <label style={{ display: 'block' }}>
        <span style={lbl}>Only when the {what} is</span>
        <input value={value} onChange={e => onChange(e.target.value)} style={inp}
          placeholder={event === 'appointment_scheduled' ? 'Free consultation' : 'Your quote is ready'} />
        <span style={hint}>
          Leave it blank for any {event === 'appointment_scheduled' ? 'appointment' : 'email'}. It must match the
          {' '}{what} exactly, ignoring capitals.
        </span>
      </label>
    );
  }
  return null;
}

/* ── What starts it ──────────────────────────────────────────────────────── */

const WHEN_PERSON: { value: string; label: string; sub: string; icon: typeof FileText }[] = [
  { value: 'form_submitted', label: 'They fill in a form', sub: 'On your site, a funnel, or the chat widget', icon: FileText },
  { value: 'contact_created', label: 'They become a contact', sub: 'However they arrived', icon: UserPlus },
  { value: 'tag_added', label: 'They are given a tag', sub: 'By you, a form, or another workflow', icon: TagIcon },
  { value: 'deal_stage_changed', label: 'Their deal moves stage', sub: 'On any of your pipelines', icon: GitBranch },
  { value: 'appointment_scheduled', label: 'They book an appointment', sub: 'Through your booking page', icon: CalendarCheck },
  { value: 'email_opened', label: 'They open an email', sub: 'One sent from their contact record', icon: MailOpen },
  { value: 'link_clicked', label: 'They click a link', sub: 'In an email sent from their record', icon: MousePointerClick },
];

const WHEN_READING: { source: string; icon: typeof FileText }[] = [
  { source: 'portfolio', icon: BookUser },
  { source: 'website', icon: Globe },
  { source: 'web', icon: Search },
  { source: 'rss', icon: Rss },
  { source: 'youtube', icon: PlaySquare },
];

/**
 * Every way a workflow can start, in two groups, as choices rather than a list.
 *
 * ── The two groups ──
 *
 * **When somebody does something** runs one person through the workflow each
 * time: the enquiry, the booking, the tag. **On a schedule, reading something**
 * runs with nobody in it, reads a source, and writes content from what it
 * finds. They are different kinds of workflow, and a flat list of eleven events
 * hides that — somebody picking "a web page" from a list beside "a form is
 * submitted" would reasonably expect the page to start the follow-up.
 *
 * ── Why the source is chosen here ──
 *
 * In the engine the source belongs to the AI step, not the trigger. But the
 * person thinks of the page as what starts it, so this is where they look for
 * it — and choosing it here points the agent at it too, adding one if there is
 * none, rather than leaving half the decision on a different step.
 */
function TriggerChooser({ node, set, graph }: { node: WorkflowNode; set: Set; graph?: GraphAccess }) {
  const event = String(node.config?.event ?? '');
  const reader = graph ? readerOf(graph.nodes) : null;
  const readingFrom = event === 'schedule' ? String(reader?.config?.source ?? '') : '';

  const pickReading = (source: string) => {
    set('event', 'schedule');
    if (!node.config?.cadence) set('cadence', 'daily');
    graph?.change(ns => pointReaderAt(ns, source));
  };

  const card = (on: boolean): React.CSSProperties => ({
    display: 'flex', gap: 9, alignItems: 'flex-start', width: '100%', textAlign: 'left',
    padding: '8px 10px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
    border: `1px solid ${on ? T.accent : T.line}`, background: on ? T.accentSoft : '#fff',
  });

  const src = readingFrom ? AGENT_SOURCES[readingFrom] : null;
  const setReader = (key: string, value: string) => {
    if (reader) graph?.change(ns => patchStep(ns, reader.id, { config: { [key]: value } }));
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <span style={lbl}>When somebody does something</span>
        <span style={{ ...hint, marginTop: 0, marginBottom: 7 }}>
          Runs each person through the workflow, one at a time, as it happens to them.
        </span>
        <div style={{ display: 'grid', gap: 5 }}>
          {WHEN_PERSON.map(o => {
            const on = event === o.value;
            const I = o.icon;
            return (
              <button key={o.value} type="button" onClick={() => set('event', o.value)} style={card(on)}
                aria-pressed={on}>
                <I size={14} color={on ? T.accent : T.muted} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: T.ink }}>{o.label}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: T.muted, marginTop: 1 }}>{o.sub}</span>
                </span>
                {on && <Check size={13} color={T.accent} style={{ marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            );
          }).flatMap((btn, i) => {
            const o = WHEN_PERSON[i];
            const follow = event === o.value ? narrowingFor(node, set) : null;
            return follow
              ? [btn, (
                <div key={`${o.value}-follow`} style={{
                  margin: '-1px 0 4px 12px', padding: '10px 11px', borderLeft: `2px solid ${T.accent}`,
                  background: '#fff', borderRadius: '0 10px 10px 0',
                }}>{follow}</div>
              )]
              : [btn];
          })}
        </div>
      </div>

      <div>
        <span style={lbl}>On a schedule, reading something</span>
        <span style={{ ...hint, marginTop: 0, marginBottom: 7 }}>
          Runs with nobody in it. It reads the source and writes posts, articles or emails from it, as drafts.
        </span>
        <div style={{ display: 'grid', gap: 5 }}>
          {WHEN_READING.map(o => {
            const meta = AGENT_SOURCES[o.source];
            if (!meta) return null;
            const on = readingFrom === o.source;
            const I = o.icon;
            return (
              <button key={o.source} type="button" onClick={() => pickReading(o.source)} style={card(on)}
                aria-pressed={on} disabled={!graph}>
                <I size={14} color={on ? T.accent : T.muted} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: T.ink }}>{meta.label}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: T.muted, marginTop: 1, lineHeight: 1.45 }}>
                    {meta.hint}
                  </span>
                </span>
                {on && <Check size={13} color={T.accent} style={{ marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* The one thing the chosen source needs, asked right here rather than
          on the agent step three boxes to the right. */}
      {src && reader && (src.needsUrl || src.needsPrompt) && (
        <div style={{
          padding: '10px 11px', borderRadius: 11, border: `1px solid ${T.accent}33`, background: '#fff',
        }}>
          {src.needsUrl && (
            <label style={{ display: 'block' }}>
              <span style={lbl}>{src.urlLabel ?? 'Address'}</span>
              <input value={String(reader.config?.sourceUrl ?? '')}
                onChange={e => setReader('sourceUrl', e.target.value)}
                placeholder={src.urlPlaceholder} style={inp} />
              {src.urlHint && <span style={hint}>{src.urlHint}</span>}
            </label>
          )}
          {src.needsPrompt && (
            <label style={{ display: 'block' }}>
              <span style={lbl}>What to search for</span>
              <textarea value={String(reader.config?.sourcePrompt ?? '')} rows={3}
                onChange={e => setReader('sourcePrompt', e.target.value)}
                placeholder="Latest UK boiler grant and heat pump scheme changes, from official or trade sources"
                style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
              <span style={hint}>
                Written as you would search for it, plus what you care about. It writes only from pages Google
                actually returns, and names them.
              </span>
            </label>
          )}
          <span style={{ ...hint, marginTop: 8 }}>
            What it writes, and how many, is set on the AI step after this one.
          </span>
        </div>
      )}
    </div>
  );
}

/* ── The dispatcher ──────────────────────────────────────────────────────── */

/**
 * The richer control for a field, or null for the plain one.
 *
 * Keyed on the step's type and the field's key, because the same key means
 * different things on different steps: `tag` on a trigger is "which tag starts
 * it", on an Add Tag step it is "which tag to put on".
 */
export function renderGuided(field: FieldDef, node: WorkflowNode, set: Set, graph?: GraphAccess): ReactNode | null {
  if (node.type === 'trigger' && field.key === 'event') {
    return <TriggerChooser node={node} set={set} graph={graph} />;
  }

  /* Asked under the chosen option by the chooser above, so not again here. */
  if (node.type === 'trigger' && (field.key === 'formName' || field.key === 'tag')) {
    return <></>;
  }

  if ((node.type === 'add_tag' || node.type === 'remove_tag') && field.key === 'tag') {
    return <TagPicker value={String(node.config?.tag ?? '')} onChange={v => set('tag', v)}
      label={node.type === 'add_tag' ? 'Which tag to add' : 'Which tag to take off'}
      why={node.type === 'add_tag'
        ? 'Other workflows can start on this tag, so it is a way of handing a contact on to the next one.'
        : 'Taking a tag off does not undo anything it already started.'} />;
  }

  if ((node.type === 'send_email' && (field.key === 'subject' || field.key === 'body'))
    || (node.type === 'send_sms' && field.key === 'message')) {
    return <TokenField field={field} node={node} set={set} />;
  }

  return null;
}
