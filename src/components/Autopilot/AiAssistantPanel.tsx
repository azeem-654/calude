/**
 * The assistant beside the gallery.
 *
 * ── What it does and does not do ──
 *
 * It writes a workflow from a sentence, for a project. That is a real thing the
 * server already does — `build_workflow` on `/api/autopilot.php`, written
 * against the chosen client's own profile — and this is a second door onto it
 * rather than a new feature.
 *
 * It therefore needs a project to write *for*. A gallery is a place somebody
 * browses before deciding where anything goes, so the panel asks which project
 * rather than guessing, and says plainly when there are none yet. An assistant
 * that accepted the sentence and then had nowhere to put the answer would be a
 * box that swallows work.
 *
 * ── The bot ──
 *
 * `AutopilotBot`, the same one the project card uses, with the same rule: it is
 * awake when there is something it can do and asleep when there is not. A face
 * that looks busy on a screen where nothing can happen is the small lie that
 * makes people stop trusting the big numbers.
 */
import { useState } from 'react';
import { Sparkles, Loader, ArrowRight, Info } from 'lucide-react';
import AutopilotBot from './AutopilotBot';
import VoicePrompt from './VoicePrompt';
import { T, primaryBtn } from './theme';
import type { Project } from '../../services/projects';

/** Openers that produce a good workflow, phrased as somebody would say them. */
const QUICK: string[] = [
  'Post something to social media every day from our portfolio',
  'Chase a quote three times and then stop',
  'Text anybody whose call we missed, then email if they go quiet',
  'Ask for a review two days after the job is done',
  'Wake up customers who have not bought in six months',
  'Route urgent support tickets to a person and acknowledge the rest',
];

export default function AiAssistantPanel({
  projects, projectId, onProject, onBuild, building, answer, answerBad,
}: {
  projects: Project[];
  projectId: string;
  onProject: (id: string) => void;
  onBuild: (text: string) => void;
  building: boolean;
  answer: string;
  answerBad: boolean;
}) {
  const [prompt, setPrompt] = useState('');
  const ready = prompt.trim().length >= 8 && !!projectId && !building;

  return (
    <aside style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <section style={{
        background: '#fff', border: `1px solid ${T.line}`, borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
      }}>
        <header style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '13px 15px',
          background: 'linear-gradient(135deg, rgba(91,70,229,0.08), rgba(124,58,237,0.04))',
          borderBottom: `1px solid ${T.lineSoft}`,
        }}>
          <AutopilotBot size={34} awake={!!projectId} busy={building} />
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: T.ink }}>AI Assistant</span>
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, color: projectId ? T.good : T.muted, marginTop: 1,
            }}>
              {projectId && <span className="ap-live-dot" />}
              {/* The honest state. "Online" on a screen where it cannot do
                  anything is the small lie this panel is careful about. */}
              {building ? 'Writing it now…' : projectId ? 'Ready' : 'Choose a project first'}
            </span>
          </span>
        </header>

        <div style={{ padding: 15, display: 'grid', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
            Describe what you want to happen and it writes the steps — for that client, in their voice.
            It arrives as a draft, switched off.
          </p>

          {!projects.length ? (
            <p style={{
              margin: 0, padding: '11px 12px', borderRadius: 11, fontSize: 11.5, lineHeight: 1.55,
              background: T.warnSoft, border: `1px solid ${T.warn}33`, color: T.warn,
              display: 'flex', gap: 7,
            }}>
              <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>There are no projects yet. A workflow belongs to one, so make a project first and this
                can write for it.</span>
            </p>
          ) : (
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, color: T.muted, marginBottom: 4 }}>
                WHICH PROJECT
              </span>
              <select value={projectId} onChange={e => onProject(e.target.value)} style={{
                width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 10,
                border: `1px solid ${T.line}`, background: '#fff', color: T.ink,
                fontSize: 12.5, fontFamily: 'inherit', outline: 'none',
              }}>
                <option value="">— choose —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}

          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value.slice(0, 500))}
            rows={4}
            aria-label="Describe the workflow you want"
            placeholder={'Type your request here…\ne.g. "Create a social media workflow to post every week"'}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 11px', borderRadius: 11,
              border: `1px solid ${T.line}`, fontSize: 12.5, outline: 'none', resize: 'vertical',
              fontFamily: 'inherit', lineHeight: 1.5, color: T.ink, background: '#fff',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            {/* Renders nothing where the browser has no speech recognition, so
                nobody is offered a microphone that does not work. */}
            <VoicePrompt
              disabled={building}
              onText={heard => setPrompt(p => `${p.trim()} ${heard}`.trim().slice(0, 500))}
            />
            <span style={{ fontSize: 10, color: T.muted, flexShrink: 0, paddingTop: 9 }}>
              {prompt.length} / 500
            </span>
          </div>

          <button
            onClick={() => ready && onBuild(prompt.trim())}
            disabled={!ready}
            className={ready ? 'press ap-btn' : 'press'}
            style={{
              ...primaryBtn, width: '100%', justifyContent: 'center', padding: '11px 16px',
              background: ready ? primaryBtn.background : T.line,
              boxShadow: ready ? primaryBtn.boxShadow : 'none',
              cursor: ready ? 'pointer' : 'default',
            }}>
            {building ? <><Loader size={13} className="spin" /> Writing…</> : <><Sparkles size={13} /> Build with AI</>}
          </button>

          {answer && (
            <p style={{
              margin: 0, padding: '10px 12px', borderRadius: 11, fontSize: 11.5, lineHeight: 1.55,
              background: answerBad ? T.badSoft : T.goodSoft,
              border: `1px solid ${answerBad ? T.bad : T.good}33`,
              color: answerBad ? T.bad : '#15803d',
            }}>{answer}</p>
          )}
        </div>
      </section>

      {/* ── Quick prompts ── */}
      <section style={{
        background: '#fff', border: `1px solid ${T.line}`, borderRadius: 16, padding: 15,
        boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
      }}>
        <h4 style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 800, color: T.ink }}>Quick prompts</h4>
        <p style={{ margin: '0 0 10px', fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
          These fill the box so you can change them before anything is built.
        </p>
        <div style={{ display: 'grid', gap: 6 }}>
          {QUICK.map(q => (
            <button key={q} onClick={() => setPrompt(q)} className="press" style={{
              display: 'flex', gap: 8, alignItems: 'flex-start', textAlign: 'left', width: '100%',
              padding: '9px 11px', borderRadius: 11, border: `1px solid ${T.line}`,
              background: T.raised, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 11.5, color: T.ink, lineHeight: 1.5,
            }}>
              <Sparkles size={11} color={T.violet} style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ minWidth: 0 }}>{q}</span>
              <ArrowRight size={11} color={T.faint} style={{ flexShrink: 0, marginTop: 2, marginLeft: 'auto' }} />
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}
