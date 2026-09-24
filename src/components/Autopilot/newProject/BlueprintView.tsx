/**
 * Step four: "Here's what Autopilot will build."
 *
 * The whole project on one screen, in the customer's terms: what it is for,
 * what it reads, what it makes, which AI agents do the work, the workflows and
 * their schedules, where results land, what waits for approval and what stays
 * with them. Every item is derived from the answers by `buildBlueprint`, so the
 * screen cannot promise anything the build will not create.
 *
 * Beside it, an assistant that edits it from a sentence. It changes the
 * answers, not the picture — so an edit is rebuilt by the same code, and there
 * is no way to talk it into a workflow the engine cannot run.
 */
import { useState } from 'react';
import {
  Target, Inbox, PackageCheck, Bot, Workflow, Clock, Plug, UserCheck, Hand, MapPin, Info,
  Sparkles, Send, Loader, Wand2, LayoutTemplate, Cpu,
} from 'lucide-react';
import type { Blueprint } from '../../../services/projectIntake';
import { REQUIREMENT_INFO } from '../../../services/projectSolutions';
import VoiceControl from '../voice/VoiceControl';

export interface EditMessage { who: 'you' | 'ai' | 'bad'; text: string }

const ORIGIN: Record<string, { label: string; tone: string; icon: typeof Wand2 }> = {
  template: { label: 'Ready-made, personalised', tone: 'good', icon: LayoutTemplate },
  generated: { label: 'Built for this project', tone: 'accent', icon: Cpu },
  ai: { label: 'Written by AI during the build', tone: 'accent', icon: Wand2 },
};

function Box({ title, icon: Icon, items, empty }: { title: string; icon: typeof Target; items: string[]; empty?: string }) {
  if (!items.length && !empty) return null;
  return (
    <div className="np-bp-box">
      <h4><Icon size={13} /> {title}</h4>
      {items.length ? (
        <ul>{items.map(i => <li key={i}><span style={{ color: '#8b93a3' }}>•</span><span>{i}</span></li>)}</ul>
      ) : <p style={{ margin: 0, fontSize: 13, color: '#8b93a3' }}>{empty}</p>}
    </div>
  );
}

export default function BlueprintView({ bp, onRename }: { bp: Blueprint; onRename: (name: string) => void }) {
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div>
        <h2 className="wz-title">Here&rsquo;s what Autopilot <span className="wz-accent">will build</span></h2>
        <p style={{ margin: '9px 0 0', fontSize: 14.5, color: '#6b7280', lineHeight: 1.55 }}>
          Read it through. Change anything by telling the assistant{' '}
          <span className="np-hide-wide">below</span> — no need to go back.
        </p>
      </div>

      <div className="np-bp-hero np-rise">
        <label style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', opacity: 0.75 }}>PROJECT</label>
        <input value={bp.name} onChange={e => onRename(e.target.value)} aria-label="Project name"
          style={{
            width: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none', outline: 'none',
            color: '#fff', font: 'inherit', fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 800,
            letterSpacing: '-0.02em', padding: '2px 0', borderBottom: '1px dashed rgba(255,255,255,0.35)',
          }} />
        <p style={{ margin: '10px 0 0', fontSize: 14.5, lineHeight: 1.55, opacity: 0.92, display: 'flex', gap: 8 }}>
          <Target size={16} style={{ flexShrink: 0, marginTop: 3 }} /> {bp.objective}
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 13, fontSize: 12.5, opacity: 0.9 }}>
          <span><b>{bp.workflows.length}</b> workflow{bp.workflows.length === 1 ? '' : 's'}</span>
          <span><b>{bp.agents.length}</b> AI agent{bp.agents.length === 1 ? '' : 's'}</span>
          <span><b>{bp.schedules.length}</b> schedule{bp.schedules.length === 1 ? '' : 's'}</span>
          <span>{bp.strength === 'strong' ? 'From a ready-made solution' : bp.strength === 'partial' ? 'Combined from ready-made parts' : 'Built from scratch'}</span>
        </div>
      </div>

      <div className="np-bp-grid">
        <Box title="Inputs" icon={Inbox} items={bp.inputs} empty="The business profile" />
        <Box title="Expected outputs" icon={PackageCheck} items={bp.outputs} />
        <Box title="Output destinations" icon={MapPin} items={bp.destinations.map(d => d.label)} />
      </div>

      <div className="np-bp-box">
        <h4><Workflow size={13} /> Workflows</h4>
        {bp.workflows.length ? (
          <div style={{ display: 'grid', gap: 9 }}>
            {bp.workflows.map(w => {
              const o = ORIGIN[w.origin];
              return (
                <div key={w.key} className="np-wf">
                  <div className="np-wf-top">
                    <span style={{ fontSize: 14.5, fontWeight: 750, color: '#17191c' }}>{w.name}</span>
                    <span className="np-badge" data-tone={o.tone} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><o.icon size={11} /> {o.label}</span>
                    {w.sends && <span className="np-badge" data-tone="warn">Waits for you before it sends</span>}
                  </div>
                  <span style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{w.purpose}</span>
                  <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: '#6b7280' }}>
                    {w.schedule && <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Clock size={12} /> {w.schedule}</span>}
                    {w.output && <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><PackageCheck size={12} /> {w.output.label}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: '#6b7280', lineHeight: 1.55 }}>
            No recurring workflow — this project is set-up work and the daily planner. You can add workflows to it at any time.
          </p>
        )}
      </div>

      <div className="np-bp-grid">
        <div className="np-bp-box">
          <h4><Bot size={13} /> AI agents</h4>
          {bp.agents.length ? (
            <ul>{bp.agents.map(a => (
              <li key={`${a.name}-${a.workflow}`} style={{ display: 'grid', gap: 2 }}>
                <b style={{ fontSize: 13.5 }}>{a.name}</b>
                <span style={{ fontSize: 12.5, color: '#6b7280' }}>{a.role}</span>
              </li>
            ))}</ul>
          ) : <p style={{ margin: 0, fontSize: 13, color: '#8b93a3' }}>None — the workflows here follow fixed steps.</p>}
        </div>
        <Box title="Schedules" icon={Clock} items={bp.schedules} empty="Runs when something happens, not on a clock" />
        <div className="np-bp-box">
          <h4><Plug size={13} /> Required integrations</h4>
          <ul>{bp.requirements.map(r => (
            <li key={r}><span style={{ color: '#8b93a3' }}>•</span><span>{REQUIREMENT_INFO[r].label}{REQUIREMENT_INFO[r].kind === 'included' ? ' — included' : REQUIREMENT_INFO[r].kind === 'optional' ? ' — optional' : ''}</span></li>
          ))}</ul>
        </div>
        <Box title="Human approvals" icon={UserCheck} items={bp.approvals} empty="None" />
        <Box title="Manual actions — yours" icon={Hand} items={bp.manual} empty="None" />
        {bp.setup.length > 0 && (
          <div className="np-bp-box">
            <h4><Sparkles size={13} /> Set-up</h4>
            <ul>{bp.setup.map(s => (
              <li key={s.key}><span className="np-badge" data-tone={s.by === 'autopilot' ? 'accent' : undefined}>{s.by === 'autopilot' ? 'Autopilot' : 'You'}</span><span>{s.label}</span></li>
            ))}</ul>
          </div>
        )}
      </div>

      {(bp.decided.length > 0 || bp.limits.length > 0) && (
        <div className="np-known">
          {bp.decided.length > 0 && (
            <>
              <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.05em', color: '#6b7280' }}>CHOSEN FOR YOU</span>
              {bp.decided.map(d => (
                <div key={d.question} className="np-known-row"><span>{d.question.replace(/\?$/, '')}:</span> <b>{d.answer}</b></div>
              ))}
            </>
          )}
          {bp.limits.map(l => (
            <div key={l} className="np-known-row" style={{ color: '#6b7280' }}><Info size={12} style={{ flexShrink: 0 }} /> {l}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The assistant beside the blueprint. */
export function EditPanel({ log, busy, suggestions, onSend }: {
  log: EditMessage[];
  busy: boolean;
  suggestions: string[];
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const send = (t = text) => { if (!t.trim() || busy) return; onSend(t.trim()); setText(''); };
  return (
    <div className="np-edit">
      <span style={{ fontSize: 13.5, fontWeight: 800, color: '#17191c', display: 'flex', gap: 7, alignItems: 'center' }}>
        <Sparkles size={15} color="#5b46e5" /> Edit with AI
      </span>
      <span style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.5 }}>Say what to change. The blueprint updates straight away.</span>
      {log.length > 0 && (
        <div className="np-edit-log" aria-live="polite">
          {log.map((m, i) => <div key={i} className="np-msg" data-who={m.who}>{m.text}</div>)}
        </div>
      )}
      <textarea className="np-input" rows={2} value={text} onChange={e => setText(e.target.value)}
        placeholder="e.g. Make this three posts per week"
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        aria-label="What should change?" style={{ resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <VoiceControl compact onResult={r => setText(t => (t.trim() ? `${t.trim()} ${r.text}` : r.text))} />
        <button type="button" onClick={() => send()} disabled={!text.trim() || busy} className="np-tool"
          style={{ background: text.trim() && !busy ? '#5b46e5' : '#eef0f5', color: text.trim() && !busy ? '#fff' : '#8b93a3', borderColor: 'transparent' }}>
          {busy ? <Loader size={13} className="spin" /> : <Send size={13} />} Update
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className="np-chips">
          {suggestions.map(s => (
            <button key={s} type="button" className="np-tool" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => send(s)} disabled={busy}>{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}
