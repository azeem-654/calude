/**
 * Customers → Lead lists (/lead-lists): the customer's own leads, folder by
 * folder — one per AI Autopilot project, then what was saved from AI
 * Prospecting, then every other list (services/leadLists.ts builds them).
 *
 * ── What it is not ──
 *
 * It replaced the Lead Directory, a screen where any customer could look
 * people up in a database by industry and place. This product finds leads
 * live and is not a lead seller or a data broker, so nothing here searches
 * anything but the contacts already in this workspace. The owner's licensed
 * data reaches a customer only through a project's daily prospecting, and
 * every such lead says "Licensed business data" in its Source column — the
 * answer a customer owes somebody who asks where their details came from.
 *
 * The page's place in it is held in the address (?folder=&list=), so Back
 * goes up a level and a link to a list opens on it.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight, ChevronRight, Crosshair, Download, ExternalLink, Folder, FolderOpen, Loader, Mail, RefreshCw, Rocket, Search, Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Contact } from '../../types';
import { fetchBoard } from '../../services/projects';
import { listMembers, loadLists } from '../../services/contactLists';
import { loadSearches } from '../../services/prospectImport';
import {
  CHECK_LABEL, LICENSED, buildFolders, checkOf, fetchProjectLinks, foundAtOf, matchLeads, sourceOf, toCsv, whoOf,
  type CheckState, type LeadFolder, type LeadListView, type ProjectLink,
} from '../../services/leadLists';
import './leadLists.css';

const fmtN = (n: number) => n.toLocaleString('en-US');
const fmtDate = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
};
const STATUS_LABEL: Record<string, string> = { running: 'Running', learning: 'Learning', paused: 'Paused', off: 'Off' };
const CHECK_ORDER: CheckState[] = ['valid', 'domain_ok', 'risky', 'invalid', 'none'];
const PAGE = 100;

function download(name: string, people: Contact[]) {
  const blob = new Blob([toCsv(people)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'leads'}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function LeadLists() {
  const navigate = useNavigate();
  const { contacts, pipelines, appointments } = useApp();
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = useState<{ id: string; name: string; status: string }[] | null>(null);
  const [links, setLinks] = useState<ProjectLink[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    const [b, l] = await Promise.all([fetchBoard(), fetchProjectLinks()]);
    setLoading(false);
    setProjects(b.projects.map(p => ({ id: p.id, name: p.name, status: p.status })));
    setLinks(l.links ?? []);
    /* Said, not hidden: without the server's answer a project's folder cannot know its lists. */
    setErr(b.error || l.error ? `Your projects could not all be read (${b.error || l.error}). Their leads are still under "Other lists".` : '');
  };
  useEffect(() => { void load(); }, []);

  const lists = useMemo(() => loadLists(), [contacts]); // re-read when Contacts change: the lists live beside them
  const ctx = useMemo(() => ({ pipelines, appointments }), [pipelines, appointments]);
  const folders = useMemo(() => buildFolders({
    projects: projects ?? [], links, lists, contacts, membersOf: l => listMembers(l, contacts, ctx),
  }), [projects, links, lists, contacts, ctx]);
  const everyone = useMemo(() => {
    const m = new Map<string, Contact>();
    for (const f of folders) for (const c of f.people) m.set(c.id, c);
    return [...m.values()];
  }, [folders]);

  const folderId = params.get('folder') ?? '';
  const listId = params.get('list') ?? '';
  const folder = folders.find(f => f.id === folderId) ?? null;
  const list = folder?.lists.find(l => l.id === listId) ?? null;
  const go = (f?: string, l?: string) => {
    const next = new URLSearchParams();
    if (f) next.set('folder', f);
    if (l) next.set('list', l);
    setParams(next);
    window.scrollTo({ top: 0 });
  };

  const projectFolders = folders.filter(f => f.kind === 'project');
  const otherFolders = folders.filter(f => f.kind !== 'project' && f.lists.length);
  const verified = everyone.filter(c => checkOf(c) === 'valid' || checkOf(c) === 'domain_ok').length;

  if (folderId && !folder && !loading) {
    return <Shell><Crumbs go={go} /><div className="ll-panel"><Empty title="That folder is not here any more" body="Its project may have been deleted, or the list moved." /></div></Shell>;
  }

  if (folder && list) {
    return (
      <Shell>
        <Crumbs go={go} folder={folder} list={list} />
        <ListView folder={folder} list={list} navigate={navigate} />
      </Shell>
    );
  }

  if (folder) {
    return (
      <Shell>
        <Crumbs go={go} folder={folder} />
        <FolderView folder={folder} open={l => go(folder.id, l)} navigate={navigate} />
      </Shell>
    );
  }

  return (
    <Shell>
      <section className="ll-hero">
        <div className="ll-hero-top">
          <span className="ll-mark" aria-hidden><FolderOpen size={22} /></span>
          <div className="ll-title">
            <h1>Lead lists</h1>
            <p>Your own prospects, kept in folders — one for each AI Autopilot project, with everything it has found, and one for what you saved from AI Prospecting. Every lead here is already in your Contacts.</p>
          </div>
        </div>
        <div className="ll-stats">
          <div className="ll-stat"><b data-testid="ll-total">{fmtN(everyone.length)}</b><span>Leads</span></div>
          <div className="ll-stat"><b>{fmtN(projectFolders.length + otherFolders.length)}</b><span>Folders</span></div>
          <div className="ll-stat"><b>{fmtN(verified)}</b><span>Emails that take mail</span></div>
        </div>
        <label className="ll-searchbox">
          <Search size={16} aria-hidden />
          <input data-testid="ll-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search your leads — a name, business, email or phone" aria-label="Search your leads" />
        </label>
      </section>

      {err && <div className="ll-alert" role="status">{err}</div>}

      {q.trim() ? (
        <SearchResults q={q} people={everyone} folders={folders} open={(f, l) => go(f, l)} />
      ) : (
        <>
          <section className="ll-section">
            <h2>Projects</h2>
            {loading && !projects ? (
              <div className="ll-panel"><div className="ll-empty"><Loader size={18} className="spin" /> Reading your projects…</div></div>
            ) : projectFolders.length ? (
              <div className="ll-grid">{projectFolders.map(f => <FolderCard key={f.id} f={f} open={() => go(f.id)} />)}</div>
            ) : (
              <div className="ll-panel">
                <Empty title="No projects yet" body="An AI Autopilot project that finds its own customers puts every lead it finds in a folder here, day by day.">
                  <button className="ll-btn primary" onClick={() => navigate('/autopilot?new=1')}><Rocket size={14} /> Start a project</button>
                </Empty>
              </div>
            )}
          </section>
          <section className="ll-section">
            <h2>Searches and other lists</h2>
            {otherFolders.length ? (
              <div className="ll-grid">{otherFolders.map(f => <FolderCard key={f.id} f={f} open={() => go(f.id)} />)}</div>
            ) : (
              <div className="ll-panel">
                <Empty title="Nothing saved yet" body="Search for businesses in AI Prospecting and save them to a list — it appears here.">
                  <button className="ll-btn" onClick={() => navigate('/prospecting')}><Crosshair size={14} /> Open AI Prospecting</button>
                </Empty>
              </div>
            )}
          </section>
          <p className="ll-note">
            New leads arrive from AI Prospecting and from your projects' daily prospecting, each with its source and the date it was found.
            Where a lead's source reads "{LICENSED}", it came from business data licensed to the operator of this app rather than from a website — the Source column and the export say so for every lead.
          </p>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="ll" data-testid="lead-lists">{children}</div>;
}

function Crumbs({ go, folder, list }: { go: (f?: string, l?: string) => void; folder?: LeadFolder; list?: LeadListView }) {
  return (
    <nav className="ll-crumbs" aria-label="Where you are">
      <button onClick={() => go()}>Lead lists</button>
      {folder && <><ChevronRight size={13} aria-hidden />{list ? <button onClick={() => go(folder.id)}>{folder.name}</button> : <span>{folder.name}</span>}</>}
      {list && <><ChevronRight size={13} aria-hidden /><span>{list.name}</span></>}
    </nav>
  );
}

const iconFor = (f: LeadFolder, size = 18) => (f.kind === 'project' ? <Rocket size={size} /> : f.kind === 'prospecting' ? <Crosshair size={size} /> : <Folder size={size} />);

function CheckBar({ people }: { people: Contact[] }) {
  const withEmail = people.filter(c => c.email);
  if (!withEmail.length) return <div className="ll-bar" aria-hidden />;
  const n = Object.fromEntries(CHECK_ORDER.map(k => [k, 0])) as Record<CheckState, number>;
  for (const c of withEmail) n[checkOf(c)]++;
  const said = CHECK_ORDER.filter(k => n[k]).map(k => `${n[k]} ${CHECK_LABEL[k].toLowerCase()}`).join(', ');
  return (
    <div className="ll-bar" role="img" aria-label={`Email checks: ${said}`} title={`Email checks: ${said}`}>
      {CHECK_ORDER.map(k => (n[k] ? <i key={k} className={`ll-c-${k}`} style={{ width: `${(n[k] / withEmail.length) * 100}%` }} /> : null))}
    </div>
  );
}

function FolderCard({ f, open }: { f: LeadFolder; open: () => void }) {
  const sub = f.kind === 'project' ? 'AI Autopilot project' : f.kind === 'prospecting' ? 'Searches you saved' : 'Lists you made';
  return (
    <button className="ll-folder" data-kind={f.kind} data-testid="ll-folder" onClick={open} aria-label={`Open ${f.name}, ${f.people.length} leads`}>
      <div className="ll-folder-head">
        <span className="ll-icon" aria-hidden>{iconFor(f)}</span>
        <div className="ll-folder-name">
          <b>{f.name}</b>
          <small>{sub}</small>
        </div>
        {f.status && <span className="ll-pill" data-s={f.status}>{STATUS_LABEL[f.status] ?? f.status}</span>}
      </div>
      <div className="ll-count"><b>{fmtN(f.people.length)}</b><span>{f.people.length === 1 ? 'lead' : 'leads'}</span></div>
      <CheckBar people={f.people} />
      <div className="ll-foot">
        <span>{f.lists.length} {f.lists.length === 1 ? 'list' : 'lists'}</span>
        <span>{f.lastAt ? `Latest ${fmtDate(f.lastAt)}` : 'Nothing found yet'}</span>
      </div>
    </button>
  );
}

function FolderView({ folder, open, navigate }: { folder: LeadFolder; open: (listId: string) => void; navigate: (to: string) => void }) {
  const searches = folder.kind === 'prospecting' ? loadSearches().filter(s => s.source !== 'google').slice(0, 8) : [];
  const projectId = folder.kind === 'project' ? folder.id.slice('project:'.length) : '';
  return (
    <div className="ll-panel" data-testid="ll-folder-view">
      <div className="ll-panel-head">
        <span className="ll-icon" aria-hidden style={{ background: '#eef0ff', color: '#4f46e5' }}>{iconFor(folder)}</span>
        <div className="ll-grow">
          <h2>{folder.name}</h2>
          <p>{fmtN(folder.people.length)} {folder.people.length === 1 ? 'lead' : 'leads'} in {folder.lists.length} {folder.lists.length === 1 ? 'list' : 'lists'}{folder.status ? ` · ${STATUS_LABEL[folder.status] ?? folder.status}` : ''}</p>
        </div>
        {!!folder.people.length && <button className="ll-btn" onClick={() => download(folder.name, folder.people)}><Download size={14} /> Export all</button>}
        {projectId && <button className="ll-btn" onClick={() => navigate(`/autopilot?project=${encodeURIComponent(projectId)}&tab=prospects`)}><Rocket size={14} /> Open the project</button>}
      </div>
      {folder.lists.length ? (
        <div className="ll-lists">
          {folder.lists.map(l => (
            <button key={l.id} className="ll-list" data-testid="ll-list" onClick={() => open(l.id)}>
              <b>{l.name}</b>
              <div className="ll-list-meta">
                <span>{fmtN(l.members.length)} {l.members.length === 1 ? 'lead' : 'leads'}</span>
                {l.cold && <span className="ll-pill" data-s="cold" title="People who have not asked to hear from you — sent to a few at a time, each batch approved">Prospects</span>}
                {l.smart && <span className="ll-pill">Smart list</span>}
                {!l.real && <span className="ll-pill" title="Found by this project but on none of its lists">Not on a list</span>}
                {l.createdAt && <span>· made {fmtDate(l.createdAt)}</span>}
              </div>
              <CheckBar people={l.members} />
            </button>
          ))}
        </div>
      ) : (
        <Empty title="Nothing found yet" body={projectId
          ? 'When this project finds people — its daily prospecting, or a search you connect to it — they land in its list, and here.'
          : 'Lists you make appear here.'}>
          {projectId && <button className="ll-btn" onClick={() => navigate(`/autopilot?project=${encodeURIComponent(projectId)}&tab=prospects`)}>Set up its prospecting <ArrowRight size={14} /></button>}
        </Empty>
      )}
      {!!searches.length && (
        <>
          <div className="ll-panel-head" style={{ paddingTop: 4 }}><div className="ll-grow"><p><strong>Recent searches</strong> — run one again, live, in AI Prospecting.</p></div></div>
          <div className="ll-chips">
            {searches.map(s => (
              <button key={`${s.source}|${s.trade}|${s.place}`} className="ll-chip" onClick={() => navigate(`/prospecting?q=${encodeURIComponent(`${s.trade} in ${s.place}`)}`)}>
                <RefreshCw size={12} aria-hidden /><span>{s.trade} in {s.place}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ListView({ folder, list, navigate }: { folder: LeadFolder; list: LeadListView; navigate: (to: string) => void }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => matchLeads(list.members, q), [list.members, q]);
  const projectId = folder.kind === 'project' ? folder.id.slice('project:'.length) : '';
  return (
    <div className="ll-panel" data-testid="ll-list-view">
      <div className="ll-panel-head">
        <span className="ll-icon" aria-hidden style={{ background: '#eef0ff', color: '#4f46e5' }}><Users size={18} /></span>
        <div className="ll-grow">
          <h2>{list.name}</h2>
          <p>{fmtN(list.members.length)} {list.members.length === 1 ? 'lead' : 'leads'} · in {folder.name}</p>
        </div>
      </div>
      <div className="ll-actions">
        <label className="ll-searchbox">
          <Search size={15} aria-hidden />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search this list" aria-label="Search this list" data-testid="ll-list-search" />
        </label>
        <button className="ll-btn" onClick={() => download(list.name, shown)} disabled={!shown.length} data-testid="ll-export"><Download size={14} /> Export CSV</button>
        {list.real ? (
          <>
            <button className="ll-btn" onClick={() => navigate(`/contacts?list=${encodeURIComponent(list.id)}`)}><ExternalLink size={14} /> Open in Contacts</button>
            <button className="ll-btn primary" onClick={() => navigate(`/marketing?new=campaign&list=${encodeURIComponent(list.id)}`)} data-testid="ll-campaign"><Mail size={14} /> Email this list</button>
          </>
        ) : projectId ? (
          <button className="ll-btn" onClick={() => navigate(`/autopilot?project=${encodeURIComponent(projectId)}&tab=prospects`)}><Rocket size={14} /> Open the project</button>
        ) : null}
      </div>
      <LeadTable people={shown} empty={q ? 'Nobody on this list matches that.' : 'Nobody is on this list yet.'} />
    </div>
  );
}

function SearchResults({ q, people, folders, open }: { q: string; people: Contact[]; folders: LeadFolder[]; open: (f: string, l: string) => void }) {
  const hits = useMemo(() => matchLeads(people, q), [people, q]);
  /* Where each one is, so a result can be opened in its list. */
  const where = useMemo(() => {
    const m = new Map<string, { folder: LeadFolder; list: LeadListView }>();
    for (const f of folders) for (const l of f.lists) for (const c of l.members) if (!m.has(c.id)) m.set(c.id, { folder: f, list: l });
    return m;
  }, [folders]);
  return (
    <div className="ll-panel" data-testid="ll-results">
      <div className="ll-panel-head">
        <div className="ll-grow">
          <h2>{fmtN(hits.length)} {hits.length === 1 ? 'lead matches' : 'leads match'} “{q.trim()}”</h2>
          <p>Searched among your own leads only.</p>
        </div>
        {!!hits.length && <button className="ll-btn" onClick={() => download(`Leads matching ${q.trim()}`, hits)}><Download size={14} /> Export CSV</button>}
      </div>
      <LeadTable people={hits} empty="None of your leads match that." where={c => {
        const w = where.get(c.id);
        return w ? <button className="ll-link" style={{ border: 0, background: 'none', padding: 0, font: 'inherit', cursor: 'pointer', textAlign: 'left' }} onClick={() => open(w.folder.id, w.list.id)}>{w.folder.name} › {w.list.name}</button> : null;
      }} />
    </div>
  );
}

function LeadTable({ people, empty, where }: { people: Contact[]; empty: string; where?: (c: Contact) => React.ReactNode }) {
  const [limit, setLimit] = useState(PAGE);
  if (!people.length) return <Empty title={empty} body="" />;
  const rows = people.slice(0, limit);
  return (
    <>
      <table className="ll-table">
        <thead>
          <tr><th>Lead</th><th>Email</th><th>Phone</th><th>Website</th><th>Source</th><th>Found</th>{where && <th>In</th>}</tr>
        </thead>
        <tbody>
          {rows.map(c => {
            const w = whoOf(c);
            const check = checkOf(c);
            const source = sourceOf(c);
            const site = (c.website ?? '').trim();
            const href = site && /^https?:\/\//i.test(site) ? site : site ? `https://${site}` : '';
            return (
              <tr key={c.id} data-testid="ll-row">
                <td data-label="Lead" className="ll-who">
                  <b>{w.person || c.email || 'Unnamed'}</b>
                  {(w.business || c.jobTitle) && <small>{[c.jobTitle, w.business].filter(Boolean).join(' · ')}</small>}
                </td>
                <td data-label="Email">
                  {c.email ? (
                    <span className="ll-email">
                      <span>{c.email}</span>
                      <span className="ll-pill" data-s={check} title={c.customFields?.emailCheckedAt ? `Checked ${fmtDate(c.customFields.emailCheckedAt)}` : undefined}>{CHECK_LABEL[check]}</span>
                    </span>
                  ) : <span className="ll-muted">—</span>}
                </td>
                <td data-label="Phone">{c.phone || <span className="ll-muted">—</span>}</td>
                <td data-label="Website">{href ? <a className="ll-link" href={href} target="_blank" rel="noreferrer noopener">{site.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')}</a> : <span className="ll-muted">—</span>}</td>
                <td data-label="Source">
                  {/* The provenance in full on hover — the sentence a customer can give somebody who asks. */}
                  <span className={source === LICENSED ? 'll-pill' : undefined} data-s={source === LICENSED ? 'licensed' : undefined} title={c.customFields?.provenance || undefined} data-testid="ll-source">{source}</span>
                </td>
                <td data-label="Found">{fmtDate(foundAtOf(c)) || <span className="ll-muted">—</span>}</td>
                {where && <td data-label="In">{where(c)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {people.length > limit && (
        <div className="ll-more">
          <span>Showing {fmtN(limit)} of {fmtN(people.length)}.</span>
          <button className="ll-btn" onClick={() => setLimit(limit + PAGE)}>Show {fmtN(Math.min(PAGE, people.length - limit))} more</button>
        </div>
      )}
    </>
  );
}

function Empty({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="ll-empty">
      <b>{title}</b>
      {body && <span>{body}</span>}
      {children && <div className="ll-empty-row">{children}</div>}
    </div>
  );
}
