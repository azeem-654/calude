/**
 * Scheduling → Booking page: every booking page this workspace has.
 *
 * One account can run several businesses (business workspaces), and each may
 * want its own page — or several (a free inspection, a quote visit). The
 * account's own page is the first chip and is edited exactly as before
 * (`crm_schedule`, published by Scheduling's own effect). The others live in
 * `crm_booking_pages` (migration 0099): the AI Autopilot wizard makes one for
 * each business it sets up, and "New booking page" makes another here. Each
 * is edited with the same BookingSetup editor, which publishes it as it
 * changes.
 *
 * A new page starts with the owner's availability only (one person, one
 * diary) — never another page's words or pictures.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader, Plus, Trash2 } from 'lucide-react';
import type { ScheduleAvailability } from '../../types';
import { useApp } from '../../context/AppContext';
import {
  bookingSlugFor, deleteBookingPage, listBookingPages, newBookingPageId, publishBookingConfig, type BookingPageSummary,
} from '../../services/booking';
import { getSession } from '../../services/auth';
import { fetchBoard } from '../../services/projects';
import BookingSetup from '../Autopilot/newProject/BookingSetup';

interface Page { id: string; projectId: string | null; schedule: ScheduleAvailability }

export default function BookingPages() {
  const { schedule: accountSchedule } = useApp();
  const [pages, setPages] = useState<Page[] | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [current, setCurrent] = useState<string>('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const signedIn = !!getSession()?.token;

  useEffect(() => {
    if (!signedIn) { setPages([]); return; }
    let alive = true;
    void listBookingPages().then(r => {
      if (!alive) return;
      if (!r) { setError('The booking pages could not be loaded just now — your main page is below.'); setPages([]); return; }
      setPages(r.pages.map((p: BookingPageSummary) => ({
        id: p.id, projectId: p.projectId,
        schedule: { ...accountSchedule, ...(p.config as Partial<ScheduleAvailability>), slug: p.slug } as ScheduleAvailability,
      })));
    });
    void fetchBoard().then(b => {
      if (alive) setProjects((b.projects as { id: string; name: string }[]).map(p => ({ id: p.id, name: p.name })));
    }).catch(() => {});
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const nameOf = (projectId: string | null) => projects.find(p => p.id === projectId)?.name ?? '';
  const page = useMemo(() => pages?.find(p => p.id === current) ?? null, [pages, current]);

  const create = async (projectId: string) => {
    const token = getSession()?.token;
    if (!token) return;
    const business = nameOf(projectId) || 'booking';
    const schedule: ScheduleAvailability = {
      ...accountSchedule,
      slug: bookingSlugFor({ ...accountSchedule, slug: '' }, business),
      title: '', description: '', hostName: '', hostRole: '', tagline: '', pointsTitle: '',
      points: [], bullets: [], discuss: [], tags: [], eventTypes: [],
      photoUrl: '', logoUrl: '', videoUrl: '', videoFileUrl: '', imageUrl: '',
      testimonial: null, help: '', accent: '', logoTone: '', logoRatio: 0, theme: 'midnight-lime',
    };
    const id = newBookingPageId();
    setBusy('new'); setError('');
    const r = await publishBookingConfig(token, schedule, { pageId: id, projectId: projectId || undefined, businessName: nameOf(projectId) || undefined });
    setBusy('');
    if (!r.ok) { setError(r.error ?? 'The page could not be made.'); return; }
    setPages(ps => [{ id, projectId: projectId || null, schedule }, ...(ps ?? [])]);
    setCurrent(id);
  };

  const remove = async (id: string) => {
    if (!window.confirm('Take this booking page down? Its link stops working. Bookings already made stay in your list.')) return;
    setBusy(id);
    const r = await deleteBookingPage(id);
    setBusy('');
    if (!r.ok) { setError(r.error ?? 'Not deleted.'); return; }
    setPages(ps => (ps ?? []).filter(p => p.id !== id));
    setCurrent('');
  };

  const [forProject, setForProject] = useState('');
  const chip = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--pc-accent, #5b46e5)' : 'var(--pc-border, rgba(100,116,139,.3))'}`,
    background: active ? 'color-mix(in srgb, var(--pc-accent, #5b46e5) 14%, transparent)' : 'transparent',
    color: 'inherit', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  });

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div role="tablist" aria-label="Your booking pages" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button type="button" role="tab" aria-selected={current === ''} style={chip(current === '')} onClick={() => setCurrent('')}>
          Main page{accountSchedule.slug ? ` · /book/${accountSchedule.slug}` : ''}
        </button>
        {pages === null && <Loader size={14} className="spin" aria-label="Loading booking pages" />}
        {(pages ?? []).map(p => (
          <button key={p.id} type="button" role="tab" aria-selected={current === p.id} style={chip(current === p.id)} onClick={() => setCurrent(p.id)}
            title={`/book/${p.schedule.slug}`}>
            {nameOf(p.projectId) || p.schedule.title || 'Booking page'} · /book/{p.schedule.slug}
          </button>
        ))}
        {signedIn && (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={forProject} onChange={e => setForProject(e.target.value)} aria-label="Which business workspace the new page is for"
              style={{ padding: '6px 8px', borderRadius: 8, fontSize: 12.5, border: '1px solid var(--pc-border, rgba(100,116,139,.3))', background: 'transparent', color: 'inherit', maxWidth: 220 }}>
              <option value="">Not tied to a business workspace</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="button" onClick={() => void create(forProject)} disabled={busy === 'new'} style={{ ...chip(false), borderStyle: 'dashed' }}>
              {busy === 'new' ? <Loader size={13} className="spin" /> : <Plus size={13} />} New booking page
            </button>
          </span>
        )}
      </div>
      {error && <div role="alert" style={{ fontSize: 12.5, color: '#b42318' }}>{error}</div>}

      {/* The main page: this screen's own effect publishes every change. */}
      {current === '' && <BookingSetup autoPublish={false} />}

      {page && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5 }}>
            <span>{nameOf(page.projectId) ? <>For the business workspace <b>{nameOf(page.projectId)}</b>.</> : 'Not tied to a business workspace.'} Its emails link here.</span>
            <button type="button" onClick={() => void remove(page.id)} disabled={busy === page.id}
              style={{ marginLeft: 'auto', display: 'inline-flex', gap: 5, alignItems: 'center', border: '1px solid rgba(180,35,24,.35)', color: '#b42318', background: 'transparent', borderRadius: 8, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>
              <Trash2 size={12} /> Take this page down
            </button>
          </div>
          <BookingSetup key={page.id} business={nameOf(page.projectId) || undefined}
            value={page.schedule}
            onChange={patch => setPages(ps => (ps ?? []).map(p => (p.id === page.id ? { ...p, schedule: { ...p.schedule, ...patch } } : p)))}
            page={{ pageId: page.id, projectId: page.projectId ?? undefined, businessName: nameOf(page.projectId) || undefined }} />
        </>
      )}
    </div>
  );
}
