/**
 * AI Prospecting, beside every search: who in the owner's Lead Directory
 * matches it (routes/leaddir.ts `search`).
 *
 * The directory is the owner's own loaded lead files, searched by industry —
 * or, when the words are a role ("business owners", "CEOs"), by job title and
 * seniority — and place. It answers even when the business search itself
 * failed (a whole country, a map server that timed out), which is exactly when
 * somebody needs to know their own leads are there. Addresses and phones stay
 * masked here; showing someone in full and adding them happen on the Lead
 * Directory page, against the workspace's allowance. Nothing is drawn when the
 * directory is not open to this workspace, or nobody matches.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookUser, ArrowRight } from 'lucide-react';
import { dirCall, type DirPerson } from '../../services/leadDirectory';

export default function DirectoryMatches({ trade, place }: { trade: string; place: string }) {
  const navigate = useNavigate();
  const [hit, setHit] = useState<{ total: number; capped: boolean; people: DirPerson[] } | null>(null);
  useEffect(() => {
    let live = true;
    setHit(null);
    if (!trade.trim() && !place.trim()) return;
    /* A moment's pause: after a failed search the boxes it reads are the ones being typed in. */
    const t = window.setTimeout(() => {
      void dirCall('search', { industry: trade, place }).then(d => {
        if (!live || !d.success) return;
        const total = Number(d.total ?? 0);
        if (total > 0) setHit({ total, capped: d.capped === true, people: ((d.people as DirPerson[]) ?? []).slice(0, 5) });
      });
    }, 400);
    return () => { live = false; window.clearTimeout(t); };
  }, [trade, place]);
  if (!hit) return null;
  const open = () => navigate(`/lead-directory?industry=${encodeURIComponent(trade)}&place=${encodeURIComponent(place)}`);
  return (
    <section className="aip-card aip-dir" aria-label="From your lead directory" data-testid="directory-matches">
      <div className="aip-card-head">
        <span className="aip-card-title"><BookUser size={14} /> From your lead directory
          <span className="aip-pill">{hit.capped ? 'Over 5,000' : hit.total.toLocaleString('en-US')} {hit.total === 1 ? 'person matches' : 'people match'}</span>
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="aip-chip" data-accent="true" onClick={open}>See them all <ArrowRight size={12} /></button>
      </div>
      <ul className="aip-dir-list">
        {hit.people.map(p => (
          <li key={p.id}>
            <b>{p.name}</b>
            <span>{[p.title, p.company].filter(Boolean).join(' · ')}</span>
            <small>{[p.city, p.state, p.country].filter(Boolean).join(', ')}{p.email ? ` · ${p.email}` : ''}</small>
          </li>
        ))}
      </ul>
      <p className="aip-muted" style={{ margin: '0 16px 14px' }}>
        People from the lead files loaded into this app. Their addresses and phones show in full on the Lead Directory, where you add them to Contacts.
      </p>
    </section>
  );
}
