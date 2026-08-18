/**
 * The panel beside the canvas: what the selected node actually controls.
 *
 * This is the difference between a diagram and an editor. Every control here
 * writes to the real record — the objective on the campaign, the cadence on the
 * strategy, the permissions in the guardrails, the status of the live sequence
 * in Marketing — through the same services the tabs use. Nothing is a setting
 * that only this screen knows about.
 *
 * Nodes with nothing to configure say so and show what they know instead,
 * rather than displaying an empty form that implies something is missing.
 */
import { useState } from 'react';
import { ArrowUpRight, Ban, Copy, Info, Trash2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { setGuardrails, setStrategy, takeSaveError, updateCampaign } from '../../../services/aiCampaigns';
import { propagatePause } from '../../../services/aiRollup';
import { NODE_SPECS, type FlowNode } from '../../../types/aiFlow';
import type { AICampaign, AIChannel } from '../../../types/aiSalesAgent';

interface Props {
  campaign: AICampaign;
  node: FlowNode | null;
  /** How many nodes are selected, when it is more than one. */
  multiple: number;
  status: { value: string; note?: string } | undefined;
  onRename: (label: string) => void;
  onConfig: (config: Record<string, string>) => void;
  onSkip: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCampaignChanged: () => void;
  onOpenTab: (tab: string) => void;
}

const label: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 5,
};
const field: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '7px 10px',
  border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12.5,
  color: '#0f172a', background: 'white', font: 'inherit', outline: 'none',
};

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: 13 }}>{children}</div>;
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: '6px 0 0', fontSize: 11, lineHeight: 1.55, color: '#94a3b8' }}>{children}</p>
  );
}

export default function Inspector(p: Props) {
  const { campaign, node } = p;
  const { addNotification, sequences, updateSequence } = useApp();

  /*
   * Text is edited locally and written on blur: saving every keystroke through
   * storage makes typing feel like wading. The panel is keyed on the node and
   * the stored text by its parent, so a different node — or a change made
   * somewhere else — remounts it rather than being synced in an effect.
   */
  const [objective, setObjective] = useState(campaign.objective);
  const [name, setName] = useState(node?.config?.label ?? '');

  if (p.multiple > 1) {
    return (
      <aside className="flow-inspector">
        <h3 className="flow-inspector-title">{p.multiple} nodes selected</h3>
        <p style={{ margin: '0 0 14px', fontSize: 12, lineHeight: 1.6, color: '#64748b' }}>
          Drag any one of them to move the group. Use the align and spread tools in the toolbar,
          or Delete to remove them all.
        </p>
        <button className="flow-side-btn" onClick={p.onDuplicate}><Copy size={13} /> Duplicate</button>
        <button className="flow-side-btn danger" onClick={p.onDelete}><Trash2 size={13} /> Delete</button>
      </aside>
    );
  }

  if (!node) {
    return (
      <aside className="flow-inspector">
        <h3 className="flow-inspector-title">Nothing selected</h3>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.65, color: '#64748b' }}>
          Click a node to edit what it does. Drag from a port to join two of them, click a wire to
          unjoin it, and drag the empty canvas to select several at once.
        </p>
        <div className="flow-keys">
          {[
            ['Undo / redo', '⌘Z · ⇧⌘Z'],
            ['Duplicate', '⌘D'],
            ['Delete', 'Del'],
            ['Fit to view', '1'],
            ['Pan', 'Space + drag'],
            ['Deselect', 'Esc'],
          ].map(([what, key]) => (
            <div key={what} className="flow-key-row"><span>{what}</span><kbd>{key}</kbd></div>
          ))}
        </div>
      </aside>
    );
  }

  const spec = NODE_SPECS[node.kind];
  const strategy = campaign.strategy;

  const saveStrategy = (patch: Partial<NonNullable<AICampaign['strategy']>>) => {
    if (!strategy) { addNotification('Work out a plan first — run the Plan node.', 'error'); return; }
    if (!setStrategy(campaign.id, { ...strategy, ...patch })) {
      addNotification(takeSaveError() || 'That could not be saved.', 'error');
      return;
    }
    p.onCampaignChanged();
  };

  const saveGuardrails = (patch: Partial<AICampaign['guardrails']>) => {
    if (!setGuardrails(campaign.id, { ...campaign.guardrails, ...patch })) {
      addNotification(takeSaveError() || 'That could not be saved.', 'error');
      return;
    }
    p.onCampaignChanged();
  };

  return (
    <aside className="flow-inspector">
      <h3 className="flow-inspector-title">{spec.title}</h3>
      <p style={{ margin: '0 0 14px', fontSize: 11.5, color: '#94a3b8' }}>{spec.subtitle}</p>

      <Row>
        <label style={label} htmlFor="flow-node-name">Name on the canvas</label>
        <input
          id="flow-node-name" style={field} value={name} placeholder={spec.title}
          onChange={e => setName(e.target.value)}
          onBlur={() => p.onRename(name.trim())}
        />
      </Row>

      {node.kind === 'objective' && (
        <Row>
          <label style={label} htmlFor="flow-objective">What you asked for</label>
          <textarea
            id="flow-objective" rows={6} style={{ ...field, resize: 'vertical', lineHeight: 1.6 }}
            value={objective}
            onChange={e => setObjective(e.target.value)}
            onBlur={() => {
              const text = objective.trim();
              if (text === campaign.objective) return;
              if (!updateCampaign(campaign.id, { objective: text })) {
                addNotification(takeSaveError() || 'That could not be saved.', 'error');
                return;
              }
              addNotification('Objective saved');
              p.onCampaignChanged();
            }}
          />
          <Note>Kept word for word. Changing it does not re-plan on its own — run the Plan node again if you want the strategy revisited.</Note>
        </Row>
      )}

      {node.kind === 'plan' && (
        strategy ? (
          <>
            <Row>
              <label style={label} htmlFor="flow-followups">Follow-ups after the first message</label>
              <input id="flow-followups" type="number" min={0} max={8} style={field}
                value={strategy.cadence.followUps}
                onChange={e => saveStrategy({ cadence: { ...strategy.cadence, followUps: Math.max(0, Math.min(8, Number(e.target.value) || 0)) } })} />
            </Row>
            <Row>
              <label style={label} htmlFor="flow-interval">Days between messages</label>
              <input id="flow-interval" type="number" min={1} max={30} style={field}
                value={strategy.cadence.intervalDays}
                onChange={e => saveStrategy({ cadence: { ...strategy.cadence, intervalDays: Math.max(1, Math.min(30, Number(e.target.value) || 1)) } })} />
            </Row>
            <Row>
              <label style={label} htmlFor="flow-target">How many prospects</label>
              <input id="flow-target" type="number" min={1} style={field}
                value={strategy.targetCount}
                onChange={e => saveStrategy({ targetCount: Math.max(1, Number(e.target.value) || 1) })} />
            </Row>
            <Row>
              <span style={label}>Channels</span>
              <div role="group" aria-label="Channels" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['email', 'sms', 'calendar'] as AIChannel[]).map(ch => {
                  const on = strategy.channels.includes(ch);
                  return (
                    <button key={ch} className="flow-chip" data-on={on} aria-pressed={on}
                      onClick={() => saveStrategy({
                        channels: on ? strategy.channels.filter(c => c !== ch) : [...strategy.channels, ch],
                      })}>
                      {ch}
                    </button>
                  );
                })}
              </div>
              <Note>Changing these here changes the plan itself, the same as editing it on the Strategy tab.</Note>
            </Row>
            <button className="flow-side-btn" onClick={() => p.onOpenTab('strategy')}>
              Open the full plan <ArrowUpRight size={12} />
            </button>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: '#64748b' }}>
            There is no plan yet. Run this node — or the whole flow — and the cadence, the audience
            and the offer become editable here.
          </p>
        )
      )}

      {node.kind === 'prospects' && (
        <>
          <Row>
            <label style={label} htmlFor="flow-source">Where to look</label>
            <select id="flow-source" style={field} value={node.config?.source ?? 'crm'}
              onChange={e => p.onConfig({ source: e.target.value })}>
              <option value="crm">Your contacts</option>
              <option value="google-places">Google Places</option>
            </select>
            <Note>
              {node.config?.source === 'google-places'
                ? 'Finds businesses nobody has spoken to. Places publishes no email addresses.'
                : 'Reads the contacts you already have. Customers are left out of cold outreach.'}
            </Note>
          </Row>
          <Row>
            <label style={label} htmlFor="flow-daily">New prospects a day</label>
            <input id="flow-daily" type="number" min={1} style={field}
              value={campaign.guardrails.dailyNewProspects}
              onChange={e => saveGuardrails({ dailyNewProspects: Math.max(1, Number(e.target.value) || 1) })} />
          </Row>
          <button className="flow-side-btn" onClick={() => p.onOpenTab('leads')}>
            See the prospects <ArrowUpRight size={12} />
          </button>
        </>
      )}

      {node.kind === 'build' && (
        <>
          <Row>
            <span style={label}>May it send email?</span>
            <Permission value={campaign.guardrails.sendEmail} onPick={v => saveGuardrails({ sendEmail: v })} />
            <Note>Enrolling people is what puts real messages in real inboxes, so it starts behind approval.</Note>
          </Row>
          <Row>
            <span style={label}>May it start sequences running?</span>
            <Permission value={campaign.guardrails.activateWorkflows} onPick={v => saveGuardrails({ activateWorkflows: v })} />
          </Row>
          <button className="flow-side-btn" onClick={() => p.onOpenTab('settings')}>
            All the controls <ArrowUpRight size={12} />
          </button>
        </>
      )}

      {node.kind === 'sequence' && (
        <>
          {(() => {
            const link = campaign.links.find(l => l.kind === 'sequence');
            const seq = link ? sequences.find(s => s.id === link.id) : undefined;
            if (!seq) {
              return <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: '#64748b' }}>
                Nothing has been built yet, so there is no sequence to change. Run the Build node first.
              </p>;
            }
            return (
              <>
                <Row>
                  <span style={label}>Status in Marketing</span>
                  <div role="group" aria-label="Sequence status" style={{ display: 'flex', gap: 6 }}>
                    {(['draft', 'active', 'paused'] as const).map(st => (
                      <button key={st} className="flow-chip" data-on={seq.status === st} aria-pressed={seq.status === st}
                        onClick={() => {
                          if (st === 'paused' || st === 'active') {
                            propagatePause(campaign, { sequences, updateSequence }, st === 'paused' ? 'paused' : 'active');
                          } else {
                            updateSequence(seq.id, { status: 'draft' });
                          }
                          addNotification(`“${seq.name}” is now ${st}`);
                          p.onCampaignChanged();
                        }}>
                        {st}
                      </button>
                    ))}
                  </div>
                  <Note>This is the real sequence in Marketing. Pausing it here stops the sending, not just the label.</Note>
                </Row>
                <Row>
                  <span style={label}>Messages</span>
                  <p style={{ margin: 0, fontSize: 12.5, color: '#0f172a' }}>
                    {seq.steps.length} step{seq.steps.length === 1 ? '' : 's'} · {seq.enrolledCount ?? 0} enrolled
                  </p>
                </Row>
                <button className="flow-side-btn" onClick={() => p.onOpenTab('email')}>
                  Edit the wording <ArrowUpRight size={12} />
                </button>
              </>
            );
          })()}
        </>
      )}

      {node.kind === 'send' && (
        <>
          <Row>
            <label style={label} htmlFor="flow-cap">Emails a day</label>
            <input id="flow-cap" type="number" min={0} style={field}
              value={campaign.guardrails.maxEmailsPerDay}
              onChange={e => saveGuardrails({ maxEmailsPerDay: Math.max(0, Number(e.target.value) || 0) })} />
            <Note>A real limit, not a label: messages over it are held back for the next day rather than dropped. Zero stops sending.</Note>
          </Row>
          <Row>
            <label style={label} htmlFor="flow-sms-cap">Texts a day</label>
            <input id="flow-sms-cap" type="number" min={0} style={field}
              value={campaign.guardrails.maxSmsPerDay}
              onChange={e => saveGuardrails({ maxSmsPerDay: Math.max(0, Number(e.target.value) || 0) })} />
          </Row>
        </>
      )}

      {(node.kind === 'measure' || node.kind === 'rewrite') && (
        <div style={{ display: 'flex', gap: 9, padding: '11px 12px', borderRadius: 9, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <Info size={14} color="#94a3b8" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.6, color: '#475569' }}>
            {node.kind === 'measure'
              ? 'There is nothing to set here. The figures are read from whichever module owns each one, every time they are shown.'
              : 'Nothing to set. This node works out which half of the funnel is failing and proposes new wording — you approve it on the Email tab before it goes anywhere.'}
          </p>
        </div>
      )}

      {node.kind === 'rewrite' && (
        <button className="flow-side-btn" style={{ marginTop: 12 }} onClick={() => p.onOpenTab('email')}>
          Read the proposal <ArrowUpRight size={12} />
        </button>
      )}

      <div className="flow-inspector-foot">
        <button className="flow-side-btn" onClick={p.onSkip}>
          <Ban size={13} /> {node.disabled ? 'Include in the run' : 'Skip in the run'}
        </button>
        <button className="flow-side-btn" onClick={p.onDuplicate}><Copy size={13} /> Duplicate</button>
        <button className="flow-side-btn danger" onClick={p.onDelete}><Trash2 size={13} /> Delete</button>
      </div>
    </aside>
  );
}

function Permission({ value, onPick }: { value: 'off' | 'approval' | 'on'; onPick: (v: 'off' | 'approval' | 'on') => void }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {(['off', 'approval', 'on'] as const).map(v => (
        <button key={v} className="flow-chip" data-on={value === v} aria-pressed={value === v} onClick={() => onPick(v)}>
          {v === 'off' ? 'Never' : v === 'approval' ? 'Ask me' : 'Allowed'}
        </button>
      ))}
    </div>
  );
}
