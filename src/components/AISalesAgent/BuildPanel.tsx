/**
 * Turning the plan into records, with what will happen shown first.
 *
 * The preview is not a courtesy. "This will add 47 contacts and enrol nobody"
 * is worth knowing before pressing the button rather than after, and it is the
 * honest state of most campaigns built on Google Places data — which carries
 * phone numbers and no email addresses at all.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Check, Hammer, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { setStatus } from '../../services/aiCampaigns';
import { buildCampaign, previewBuild } from '../../services/aiOrchestrator';
import type { AICampaign } from '../../types/aiSalesAgent';
import { customerBusinessName } from '../../services/tenancy';
import { describeReach } from '../../services/dueWork';
import { card, ghostBtn, primaryBtn } from './ui';

export default function BuildPanel({ campaign, onChanged }: { campaign: AICampaign; onChanged: () => void }) {
  const navigate = useNavigate();
  const { contacts, bulkImportContacts, updateContacts, addSequence, updateSequence, addNotification } = useApp();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof buildCampaign> | null>(null);

  const preview = useMemo(() => previewBuild(campaign), [campaign]);
  const ready = campaign.status === 'ready' || campaign.status === 'running';

  if (!campaign.strategy) return null;

  const build = () => {
    setBusy(true);
    /* The customer's own business name signs the emails; without one they go
       unsigned rather than ending on the word "us" — or, worse, on the name of
       the CRM they were written in. */
    const r = buildCampaign(
      campaign,
      { contacts, bulkImportContacts, updateContacts, addSequence, updateSequence },
      new Date(),
      customerBusinessName(),
    );
    setBusy(false);
    setResult(r);
    if (r.ok) {
      /* Only now is it running: something exists that can actually do work. */
      setStatus(campaign.id, 'running');
      addNotification(sentence(r.created));
    } else {
      addNotification(r.error || 'Nothing could be built', 'error');
    }
    onChanged();
  };

  return (
    <section style={{ ...card, padding: 'clamp(16px, 3vw, 22px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Build the campaign</h2>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
            Creates real contacts and a real email sequence in the modules that own them.
          </p>
        </div>
        <button onClick={build} disabled={busy || !ready} className="press"
          style={{ ...primaryBtn, opacity: busy || !ready ? 0.45 : 1, cursor: busy || !ready ? 'not-allowed' : 'pointer' }}>
          <Hammer size={14} /> {campaign.links.some(l => l.kind === 'sequence') ? 'Build again' : 'Build it'}
        </button>
      </div>

      {!ready && (
        <p style={{ margin: 0, fontSize: 13.5, color: '#64748b' }}>
          Approve the plan first.
        </p>
      )}

      {ready && !result && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Figure label="Qualified" value={preview.qualified} />
            <Figure label="Already added" value={preview.alreadyPromoted} />
            <Figure label="Can be emailed" value={preview.withEmail} tone={preview.withEmail === 0 ? 'warn' : undefined} />
            <Figure label="Would be enrolled" value={preview.wouldEnrol} tone={preview.wouldEnrol === 0 ? 'warn' : undefined} />
          </div>
          {preview.blocked.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '11px 13px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9 }}>
              {preview.blocked.map((b, i) => (
                <p key={i} style={{ margin: 0, fontSize: 12.5, color: '#92400e', lineHeight: 1.55 }}>{b}</p>
              ))}
            </div>
          )}
          {/* Anyone planning "three follow-ups, three days apart" is owed the
              truth about when those actually leave. */}
          <p style={{ margin: 0, fontSize: 11.5, color: '#94a3b8', lineHeight: 1.6 }}>{describeReach()}</p>
        </>
      )}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {result.created.length > 0 && (
            <div style={{ display: 'flex', gap: 9, padding: '11px 13px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 9 }}>
              <Check size={14} color="#16a34a" style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ margin: 0, fontSize: 12.5, color: '#166534', lineHeight: 1.55 }}>
                {sentence(result.created)}
              </p>
            </div>
          )}
          {result.error && result.created.length === 0 && (
            <div style={{ display: 'flex', gap: 9, padding: '11px 13px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9 }}>
              <AlertTriangle size={14} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ margin: 0, fontSize: 12.5, color: '#991b1b', lineHeight: 1.55 }}>{result.error}</p>
            </div>
          )}
          {result.blocked.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '11px 13px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 9 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94a3b8' }}>
                What it did not do
              </p>
              {result.blocked.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 7 }}>
                  <Info size={12} color="#94a3b8" style={{ flexShrink: 0, marginTop: 3 }} />
                  <p style={{ margin: 0, fontSize: 12.5, color: '#475569', lineHeight: 1.55 }}>{b}</p>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {result.sequenceId && (
              <button onClick={() => navigate('/marketing')} className="press" style={ghostBtn}>
                Open in Marketing <ArrowUpRight size={13} />
              </button>
            )}
            {result.contactsAdded > 0 && (
              <button onClick={() => navigate('/contacts')} className="press" style={ghostBtn}>
                See the contacts <ArrowUpRight size={13} />
              </button>
            )}
            <button onClick={() => setResult(null)} className="press" style={ghostBtn}>Close</button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * "Created 60 existing contacts added to this campaign, 12 contacts" was the
 * old line: one lead-in verb pinned in front of phrases that carry their own.
 * Each phrase is now a clause, and they are joined as a sentence.
 */
function sentence(parts: string[]): string {
  if (!parts.length) return '';
  const capped = parts.map((p, i) => (i === 0 ? p[0].toUpperCase() + p.slice(1) : p));
  return `${capped.join('; ')}.`;
}

function Figure({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <div style={{
      padding: '7px 12px', borderRadius: 9, minWidth: 100,
      backgroundColor: tone === 'warn' ? '#fffbeb' : '#f8fafc',
      border: `1px solid ${tone === 'warn' ? '#fde68a' : '#eef1f5'}`,
    }}>
      <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: tone === 'warn' ? '#b45309' : '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
        {value.toLocaleString()}
      </p>
      <p style={{ margin: 0, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#94a3b8' }}>{label}</p>
    </div>
  );
}
