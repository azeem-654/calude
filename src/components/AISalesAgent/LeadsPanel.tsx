/**
 * The prospects, and how much is actually known about each one.
 *
 * Google Places returns a name, an address, a phone number and often a website.
 * It does not return an email address. That is not a detail to bury three
 * screens down: a plan whose first channel is email, run against a lead list
 * with no email addresses in it, will send nothing at all — so the panel says
 * that at the top, in the sentence a person reads first.
 *
 * Each lead shows the signals that were checked and what the answer rested on,
 * including the ones that could not be answered. A qualification a person can
 * disagree with is worth more than a score they have to take on faith.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle, Check, ExternalLink, Loader, MapPin, Minus, Phone, Search, Users, X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { crmContacts, discover, googlePlaces, leadStats, leadsFor, placesStatus } from '../../services/aiDiscovery';
import { logDecision } from '../../services/aiDecisionLog';
import { linkRecord } from '../../services/aiCampaigns';
import type { AICampaign, AILead, SignalCheck } from '../../types/aiSalesAgent';
import { LEAD_SOURCE_LABEL } from '../../types/aiSalesAgent';
import { card, ghostBtn, primaryBtn } from './ui';

const VERDICT: Record<SignalCheck['verdict'], { icon: typeof Check; colour: string; label: string }> = {
  met: { icon: Check, colour: '#16a34a', label: 'Yes' },
  'not-met': { icon: X, colour: '#dc2626', label: 'No' },
  unknown: { icon: Minus, colour: '#94a3b8', label: 'Cannot tell' },
};

export default function LeadsPanel({ campaign, onChanged }: { campaign: AICampaign; onChanged: () => void }) {
  const { addNotification, contacts } = useApp();
  const [leads, setLeads] = useState<AILead[]>(() => leadsFor(campaign.id));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [open, setOpen] = useState<string>('');
  /* Which pool to search. Places finds businesses nobody has spoken to and
     publishes no email addresses; the CRM holds people who can actually be
     emailed. Neither is a substitute for the other, so it is a choice. */
  const [pool, setPool] = useState<'google-places' | 'crm'>('google-places');

  const reload = useCallback(() => setLeads(leadsFor(campaign.id)), [campaign.id]);
  const stats = useMemo(() => leadStats(leads), [leads]);

  const strategy = campaign.strategy;
  const wantsEmail = !!strategy?.channels.includes('email');

  const find = async () => {
    if (!strategy) return;
    setBusy(true); setProblem(''); setNeedsSetup(false);
    const source = pool === 'crm' ? crmContacts(contacts) : googlePlaces;
    const run = await discover(campaign.id, strategy, {
      source,
      /* Places is clamped to 20 a search by its own endpoint; the CRM can hand
         over as many as the campaign's daily cap allows. */
      limit: pool === 'crm' ? Math.max(1, campaign.guardrails.dailyNewProspects) : 20,
    });
    setBusy(false);

    if (!run.ok) {
      setProblem(run.error || 'The search failed.');
      setNeedsSetup(!!run.needsSetup);
      logDecision(campaign.id, {
        kind: 'error',
        summary: 'Prospect search failed',
        because: run.error || 'No reason was given.',
      });
      /* Refresh after writing, not before — the activity list is read from the
         store, so refreshing first shows the page as it was one action ago. */
      onChanged();
      return;
    }

    const found = run.added.length;
    const qualified = run.added.filter(l => l.status === 'qualified').length;
    const withEmail = run.added.filter(l => l.email).length;

    logDecision(campaign.id, {
      kind: 'discover',
      summary: found ? `Found ${found} ${found === 1 ? 'business' : 'businesses'}` : 'Found nothing new',
      because: pool === 'crm'
        ? `Read the contacts already in this workspace, matched against “${run.query}”.${run.duplicates ? ` ${run.duplicates} were already on the list.` : ''}`
        : `Searched Google Places for “${run.query}”.${run.duplicates ? ` ${run.duplicates} were already on the list.` : ''}`,
      counts: { found, 'already known': run.duplicates },
    });
    if (found) {
      logDecision(campaign.id, {
        kind: 'qualify',
        summary: `${qualified} of ${found} match the plan`,
        because: `Checked each against the plan's signals. ${found - qualified} failed something the listing settled outright; the rest had nothing against them. ${withEmail} of ${found} came with an email address.`,
        counts: { qualified, 'ruled out': found - qualified, 'with an email': withEmail },
      });
      /* The lead list is a thing this campaign is responsible for, so it is
         linked like anything else it creates. */
      linkRecord(campaign.id, {
        kind: 'lead-list',
        id: `${campaign.id}-leads`,
        label: pool === 'crm' ? 'Prospects from your contacts' : 'Prospects from Google Places',
      });
    }

    /* Everything written; now show it. */
    reload();
    onChanged();
    addNotification(found ? `${found} added, ${run.duplicates} already known` : 'Nothing new found');
  };

  const checkKey = async () => {
    const { configured } = await placesStatus();
    if (!configured) {
      setNeedsSetup(true);
      setProblem('No Google Places key is set on the server yet.');
    } else {
      setNeedsSetup(false);
      setProblem('');
      addNotification('A Places key is set — try the search again');
    }
  };

  if (!strategy) {
    return (
      <Panel title="Prospects">
        <p style={{ margin: 0, fontSize: 13.5, color: '#64748b', lineHeight: 1.6 }}>
          Approve a plan first. The search needs to know what kind of business to look for and where.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Prospects"
      note={leads.length ? `${stats.total} found · ${stats.qualified} match the plan` : 'Searched from the plan, never invented.'}
      action={
        <button onClick={find} disabled={busy} className="press"
          style={{ ...primaryBtn, opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? <><Loader size={14} className="spin" /> Searching…</> : <><Search size={14} /> {leads.length ? 'Find more' : 'Find prospects'}</>}
        </button>
      }>

      {/* Where to look. Stated as a choice with its consequence attached,
          because the two pools answer different questions. */}
      <div role="group" aria-label="Where to look for prospects"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {([
          { id: 'google-places' as const, label: 'Google Places', icon: MapPin, note: 'New local businesses. Phone and website, no email addresses.' },
          { id: 'crm' as const, label: 'Your contacts', icon: Users, note: `${contacts.filter(c => c.email?.trim() && c.status !== 'customer').length} people here can be emailed today.` },
        ]).map(p => {
          const on = pool === p.id;
          const Icon = p.icon;
          return (
            <button key={p.id} onClick={() => setPool(p.id)} className="press" aria-pressed={on}
              title={p.note}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${on ? '#17191c' : '#e2e8f0'}`,
                backgroundColor: on ? '#17191c' : 'white',
                color: on ? 'white' : '#475569',
              }}>
              <Icon size={13} /> {p.label}
            </button>
          );
        })}
        <span style={{ alignSelf: 'center', fontSize: 11.5, color: '#94a3b8', lineHeight: 1.5 }}>
          {pool === 'crm'
            ? 'Reads the contacts you already have. Customers are left out of cold outreach.'
            : 'Finds businesses nobody has spoken to. Places publishes no email addresses.'}
        </span>
      </div>

      {problem && (
        <div style={{ display: 'flex', gap: 9, padding: '11px 13px', backgroundColor: needsSetup ? '#fffbeb' : '#fef2f2', border: `1px solid ${needsSetup ? '#fde68a' : '#fecaca'}`, borderRadius: 9 }}>
          <AlertTriangle size={14} color={needsSetup ? '#b45309' : '#dc2626'} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ margin: 0, fontSize: 12.5, color: needsSetup ? '#92400e' : '#991b1b', lineHeight: 1.55 }}>{problem}</p>
            {needsSetup && (
              <p style={{ margin: 0, fontSize: 12, color: '#92400e', lineHeight: 1.55 }}>
                Add one in <strong>Settings → Email &amp; SMS → Prospect search</strong>. It is stored on the
                server and never sent back to the browser, because Places bills per search.
              </p>
            )}
            {needsSetup && (
              <div><button onClick={checkKey} className="press" style={ghostBtn}>Check again</button></div>
            )}
          </div>
        </div>
      )}

      {/*
        The consequence of this source, stated where it cannot be missed. A plan
        that opens on email against a list with no email addresses sends nothing.
      */}
      {leads.length > 0 && wantsEmail && stats.withEmail === 0 && (
        <div style={{ display: 'flex', gap: 9, padding: '11px 13px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9 }}>
          <AlertTriangle size={14} color="#b45309" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: 12.5, color: '#92400e', lineHeight: 1.6 }}>
            <strong>None of these {stats.total} businesses came with an email address.</strong> Google Places
            does not publish them. Your plan opens on email, so as things stand it has nobody to email.
            {stats.withPhone > 0 && ` ${stats.withPhone} have a phone number, so SMS or a call would reach them.`}
            {stats.withWebsite > 0 && ` ${stats.withWebsite} have a website with a contact page.`}
            {' '}Switch the source above to <strong>Your contacts</strong> to work people who already have an address.
          </p>
        </div>
      )}

      {leads.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13.5, color: '#64748b', lineHeight: 1.6 }}>
          Nothing yet. The search asks Google Places for{' '}
          <strong>{strategy.icp.industry || strategy.icp.description}</strong>
          {strategy.icp.location ? <> in <strong>{strategy.icp.location}</strong></> : null}
          {' '}and checks each result against the plan. Only real listings appear here.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Stat label="Found" value={stats.total} />
            <Stat label="Match the plan" value={stats.qualified} />
            <Stat label="Ruled out" value={stats.rejected} />
            <Stat label="With a phone" value={stats.withPhone} />
            <Stat label="With an email" value={stats.withEmail} tone={stats.withEmail === 0 ? 'warn' : undefined} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {leads.map(lead => (
              <LeadRow key={lead.id} lead={lead} expanded={open === lead.id}
                onToggle={() => setOpen(open === lead.id ? '' : lead.id)} />
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

/* ── Pieces ────────────────────────────────────────────────────────────── */

function Panel({ title, note, action, children }: {
  title: string; note?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section style={{ ...card, padding: 'clamp(16px, 3vw, 22px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{title}</h2>
          {note && <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>{note}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <div style={{
      padding: '7px 12px', borderRadius: 9, minWidth: 92,
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

function LeadRow({ lead, expanded, onToggle }: { lead: AILead; expanded: boolean; onToggle: () => void }) {
  const rejected = lead.status === 'rejected';
  const q = lead.qualification;
  const unknowns = q?.checks.filter(c => c.verdict === 'unknown').length ?? 0;

  return (
    <div style={{ border: '1px solid #eef1f5', borderRadius: 10, backgroundColor: rejected ? '#fcfcfd' : 'white', overflow: 'hidden' }}>
      <button onClick={onToggle} className="press"
        aria-expanded={expanded}
        style={{
          width: '100%', textAlign: 'left', padding: '11px 13px', border: 'none',
          backgroundColor: 'transparent', cursor: 'pointer', font: 'inherit',
          display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between',
        }}>
        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 220px' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: rejected ? '#94a3b8' : '#0f172a' }}>
            {lead.name}
          </span>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11.5, color: '#94a3b8' }}>
            {lead.address && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><MapPin size={11} />{lead.address}</span>}
            {lead.phone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Phone size={11} />{lead.phone}</span>}
          </span>
        </span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {unknowns > 0 && (
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{unknowns} unanswered</span>
          )}
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
            color: rejected ? '#b91c1c' : '#15803d',
            backgroundColor: rejected ? '#fee2e2' : '#dcfce7',
          }}>
            {rejected ? 'Ruled out' : `${q?.score ?? 0}% checked`}
          </span>
        </span>
      </button>

      {expanded && q && (
        <div style={{ padding: '0 13px 13px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11.5, color: '#64748b' }}>
            <span>From {LEAD_SOURCE_LABEL[lead.source]}</span>
            {lead.rating !== undefined && <span>{lead.rating} ★ from {lead.ratingCount} reviews</span>}
            {lead.website && (
              <a href={lead.website} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#2563eb' }}>
                Website <ExternalLink size={10} />
              </a>
            )}
            <span>
              Reachable on: {q.contactable.length ? q.contactable.join(', ') : 'nothing yet — no email or phone came back'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {q.checks.map((c, i) => {
              const v = VERDICT[c.verdict];
              const Icon = v.icon;
              return (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Icon size={13} color={v.colour} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: '#334155' }}>{c.signal}</p>
                    <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>{c.evidence}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
            The percentage covers only the signals a listing could settle. Anything marked
            “cannot tell” is left out of it rather than counted either way.
          </p>
        </div>
      )}
    </div>
  );
}
