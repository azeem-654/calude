import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, Film, Link2, Sparkles,
  Trash2, Upload, Users, X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getSession } from '../../services/auth';
import { createList, listMembers, loadLists, type ContactList } from '../../services/contactLists';
import {
  CHANNELS, GOALS, PLATFORM_LABEL, PLATFORM_ORDER, createCampaign, describeTargets,
  placementsFor, sanitizeText, sourceFromFile, sourceFromYouTube, stepProblem,
  validateUpload, type DraftCampaign,
} from '../../services/socialAutomation';
import type { Campaign, Channel, Placement } from '../../types/socialAutomation';

const INK = '#17191c';
const MUTED = '#8a8f98';
const FAINT = '#b0b4ba';
const RED = '#e5484d';

const CARD: React.CSSProperties = {
  backgroundColor: '#fff', borderRadius: 18, padding: 22,
  boxShadow: '0 1px 2px rgba(23,25,28,0.05)',
};

const STEPS = [
  { n: 1, label: 'Source', hint: 'The video and what it is about' },
  { n: 2, label: 'Destinations', hint: 'Where it all goes' },
  { n: 3, label: 'Audience', hint: 'Who hears from you' },
] as const;

function emptyDraft(): DraftCampaign {
  return {
    name: '',
    goal: 'educate',
    sources: [],
    title: '',
    description: '',
    placements: [],
    channels: [],
    audience: { listIds: [], contactCount: 0, skipped: false },
  };
}

interface Props {
  onDone: (campaign: Campaign) => void;
  onCancel: () => void;
}

export default function CampaignWizard({ onDone, onCancel }: Props) {
  const { contacts, addNotification, pipelines, appointments } = useApp();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<DraftCampaign>(emptyDraft);
  const [fileError, setFileError] = useState('');
  const [ytInput, setYtInput] = useState('');
  const [dragging, setDragging] = useState(false);
  const [lists, setLists] = useState<ContactList[]>(loadLists);
  const [newListName, setNewListName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<DraftCampaign>) => setDraft(d => ({ ...d, ...patch }));

  // Object URLs are only valid while this component owns them.
  useEffect(() => () => {
    for (const s of draft.sources) {
      if (s.blobUrl) { try { URL.revokeObjectURL(s.blobUrl); } catch { /* already gone */ } }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listCtx = useMemo(() => ({ pipelines, appointments }), [pipelines, appointments]);

  const memberCount = (list: ContactList) => {
    try { return listMembers(list, contacts, listCtx).length; } catch { return 0; }
  };

  const selectedCount = useMemo(() => {
    const ids = new Set<string>();
    for (const l of lists.filter(x => draft.audience.listIds.includes(x.id))) {
      for (const c of listMembers(l, contacts, listCtx)) ids.add(c.id);
    }
    return ids.size;
  }, [lists, draft.audience.listIds, contacts, listCtx]);

  /* ── Step 1: sources ── */

  function addFiles(files: FileList | File[]) {
    setFileError('');
    const added = [];
    for (const file of Array.from(files)) {
      const problem = validateUpload(file);
      if (problem) { setFileError(problem); continue; }
      added.push(sourceFromFile(file));
    }
    if (added.length) {
      const first = added[0];
      set({
        sources: [...draft.sources, ...added],
        // Seed the title from the first file, without clobbering a typed one.
        title: draft.title || first.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
      });
    }
  }

  function addYouTube() {
    setFileError('');
    const src = sourceFromYouTube(ytInput);
    if (!src) { setFileError('That does not look like a YouTube link. Paste the full watch, share or Shorts URL.'); return; }
    if (draft.sources.some(s => s.youtubeId === src.youtubeId)) {
      setFileError('That video is already on the list.');
      return;
    }
    set({ sources: [...draft.sources, src], title: draft.title || src.name });
    setYtInput('');
  }

  function removeSource(id: string) {
    const src = draft.sources.find(s => s.id === id);
    if (src?.blobUrl) { try { URL.revokeObjectURL(src.blobUrl); } catch { /* already gone */ } }
    set({ sources: draft.sources.filter(s => s.id !== id) });
  }

  /* ── Step 2: destinations ── */

  const togglePlacement = (p: Placement) => set({
    placements: draft.placements.includes(p)
      ? draft.placements.filter(x => x !== p)
      : [...draft.placements, p],
  });

  const toggleChannel = (c: Channel) => set({
    channels: draft.channels.includes(c)
      ? draft.channels.filter(x => x !== c)
      : [...draft.channels, c],
  });

  /* ── Step 3: audience ── */

  const toggleList = (id: string) => set({
    audience: {
      ...draft.audience,
      skipped: false,
      listIds: draft.audience.listIds.includes(id)
        ? draft.audience.listIds.filter(x => x !== id)
        : [...draft.audience.listIds, id],
    },
  });

  function makeList() {
    const name = sanitizeText(newListName, 60);
    if (!name) return;
    const session = getSession();
    // A static list built from everyone currently on file: the user can prune it
    // in Contacts afterwards, which beats forcing them to build rules in here.
    const list = createList({
      name, type: 'static',
      memberIds: contacts.map(c => c.id),
      createdBy: session?.user.email ?? 'owner',
    });
    setLists(loadLists());
    setNewListName('');
    toggleList(list.id);
    addNotification(`Segment "${name}" created with ${contacts.length} contact${contacts.length === 1 ? '' : 's'}`, 'success');
  }

  /* ── Submit ── */

  const problem = stepProblem(step, draft);

  function next() {
    if (problem) return;
    if (step < 3) { setStep((step + 1) as 1 | 2 | 3); return; }
    const session = getSession();
    const campaign = createCampaign(
      { ...draft, audience: { ...draft.audience, contactCount: selectedCount } },
      session?.user.email ?? 'owner',
    );
    addNotification(`Campaign "${campaign.name}" created — ${describeTargets(campaign)}`, 'success');
    onDone(campaign);
  }

  const primaryBtn = (disabled: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 22px',
    borderRadius: 999, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    backgroundColor: disabled ? '#d5d8dd' : INK, color: '#fff', fontSize: 13.5, fontWeight: 700,
  });

  return (
    <div style={{ padding: '4px 28px 40px', maxWidth: 1020 }}>
      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 20px', flexWrap: 'wrap' }}>
        {STEPS.map((s, i) => {
          const done = step > s.n;
          const active = step === s.n;
          return (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => { if (s.n < step) setStep(s.n); }}
                disabled={s.n > step}
                title={s.hint}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '8px 15px 8px 9px',
                  borderRadius: 999, border: `1px solid ${active ? INK : '#e4e7ec'}`,
                  backgroundColor: active ? INK : '#fff', cursor: s.n < step ? 'pointer' : 'default',
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: 999, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 11, fontWeight: 800,
                  backgroundColor: active ? '#fff' : done ? '#e9f4e6' : '#f0f1f3',
                  color: active ? INK : done ? '#3f9142' : MUTED,
                }}>
                  {done ? <Check size={12} strokeWidth={3} /> : s.n}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: active ? '#fff' : done ? INK : MUTED }}>
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && <span style={{ width: 18, height: 1, backgroundColor: '#dfe3e8' }} />}
            </div>
          );
        })}
        <button onClick={onCancel} style={{
          marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 999, border: '1px solid #e4e7ec',
          backgroundColor: '#fff', color: MUTED, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        }}>
          <X size={13} /> Cancel
        </button>
      </div>

      {/* ── Step 1 ── */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={CARD}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
              Start with a video
            </h3>
            <p style={{ fontSize: 13, color: MUTED, margin: '0 0 16px', lineHeight: 1.6 }}>
              Drop in a file or paste a YouTube link. Add more than one and they all become part of the same campaign.
            </p>

            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? INK : '#dfe3e8'}`, borderRadius: 16,
                padding: '30px 20px', textAlign: 'center', cursor: 'pointer',
                backgroundColor: dragging ? '#f7f8fa' : '#fcfcfd', transition: 'all 0.15s',
              }}
            >
              <Upload size={22} color={dragging ? INK : FAINT} style={{ marginBottom: 8 }} />
              <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 3px' }}>
                Drop a video here, or click to choose
              </p>
              <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>MP4, MOV, M4V or WebM · up to 500 MB</p>
              <input
                ref={fileRef} type="file" multiple accept="video/mp4,video/quicktime,video/x-m4v,video/webm"
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
              <span style={{ flex: 1, height: 1, backgroundColor: '#eceef1' }} />
              <span style={{ fontSize: 11, color: FAINT, fontWeight: 600 }}>OR</span>
              <span style={{ flex: 1, height: 1, backgroundColor: '#eceef1' }} />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Link2 size={14} color={FAINT} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  value={ytInput}
                  onChange={e => setYtInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addYouTube(); } }}
                  placeholder="https://www.youtube.com/watch?v=…"
                  aria-label="YouTube URL"
                  style={{
                    width: '100%', padding: '11px 12px 11px 34px', border: '1px solid #e4e7ec',
                    borderRadius: 11, fontSize: 13, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              <button onClick={addYouTube} style={{
                padding: '11px 18px', borderRadius: 11, border: '1px solid #e4e7ec',
                backgroundColor: '#fff', color: INK, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>
                Add link
              </button>
            </div>

            {fileError && (
              <p role="alert" style={{
                display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: RED,
                margin: '12px 0 0', fontWeight: 600,
              }}>
                <AlertTriangle size={13} /> {fileError}
              </p>
            )}

            {draft.sources.length > 0 && (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {draft.sources.map(s => (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px',
                    border: '1px solid #eceef1', borderRadius: 12, backgroundColor: '#fcfcfd',
                  }}>
                    <span style={{
                      width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                      backgroundColor: s.kind === 'youtube' ? '#fceaea' : '#eceff9',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Film size={15} color={s.kind === 'youtube' ? '#e5484d' : '#3e63dd'} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.name}
                      </span>
                      <span style={{ display: 'block', fontSize: 11.5, color: MUTED }}>
                        {s.kind === 'youtube' ? 'YouTube link' : `${((s.sizeBytes ?? 0) / 1024 / 1024).toFixed(1)} MB`}
                      </span>
                    </span>
                    <button onClick={() => removeSource(s.id)} aria-label={`Remove ${s.name}`} style={{
                      border: 'none', background: 'transparent', cursor: 'pointer', color: FAINT, padding: 4, lineHeight: 0,
                    }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={CARD}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
              What is it about?
            </h3>
            <p style={{ fontSize: 13, color: MUTED, margin: '0 0 16px', lineHeight: 1.6 }}>
              This is the context the AI writes from. The more specific you are, the less editing you will do later.
            </p>

            <label htmlFor="sa-title" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: INK, marginBottom: 5 }}>Video title</label>
            <input
              id="sa-title"
              value={draft.title}
              onChange={e => set({ title: e.target.value })}
              placeholder="Five mistakes that kill your first hire"
              maxLength={200}
              style={{
                width: '100%', padding: '11px 12px', border: '1px solid #e4e7ec', borderRadius: 11,
                fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 14,
              }}
            />

            <label htmlFor="sa-description" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: INK, marginBottom: 5 }}>
              Description <span style={{ fontWeight: 500, color: MUTED }}>— optional but worth it</span>
            </label>
            <textarea
              id="sa-description"
              value={draft.description}
              onChange={e => set({ description: e.target.value })}
              placeholder="Who it is for, what they will learn, and anything you want mentioned in the captions."
              rows={4}
              maxLength={5000}
              style={{
                width: '100%', padding: '11px 12px', border: '1px solid #e4e7ec', borderRadius: 11,
                fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={CARD}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
              What is this campaign for?
            </h3>
            <p style={{ fontSize: 13, color: MUTED, margin: '0 0 16px', lineHeight: 1.6 }}>
              The goal changes how everything is written — the captions, the emails, the calls to action.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
              {GOALS.map(g => {
                const on = draft.goal === g.value;
                return (
                  <button
                    key={g.value}
                    onClick={() => set({ goal: g.value })}
                    aria-pressed={on}
                    style={{
                      textAlign: 'left', padding: '12px 14px', borderRadius: 13, cursor: 'pointer',
                      border: `1.5px solid ${on ? INK : '#e4e7ec'}`,
                      backgroundColor: on ? '#f7f8fa' : '#fff',
                    }}
                  >
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK }}>{g.label}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 3, lineHeight: 1.45 }}>{g.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2 ── */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={CARD}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
              Social platforms
            </h3>
            <p style={{ fontSize: 13, color: MUTED, margin: '0 0 16px', lineHeight: 1.6 }}>
              Pick the surfaces you want. Each one gets its own caption, hashtag count and aspect ratio — a Reel is
              not written the way a LinkedIn post is.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {PLATFORM_ORDER.map(platform => {
                const rows = placementsFor(platform);
                const anyOn = rows.some(r => draft.placements.includes(r.placement));
                return (
                  <div key={platform}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: anyOn ? INK : MUTED }}>
                        {PLATFORM_LABEL[platform]}
                      </span>
                      <button
                        onClick={() => set({
                          placements: anyOn
                            ? draft.placements.filter(p => !rows.some(r => r.placement === p))
                            : [...new Set([...draft.placements, ...rows.map(r => r.placement)])],
                        })}
                        style={{
                          border: 'none', background: 'transparent', color: '#3e63dd',
                          fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0,
                        }}
                      >
                        {anyOn ? 'Clear' : 'Select all'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {rows.map(r => {
                        const on = draft.placements.includes(r.placement);
                        return (
                          <button
                            key={r.placement}
                            onClick={() => togglePlacement(r.placement)}
                            aria-pressed={on}
                            title={`${r.captionLimit} characters · ${r.hashtagMin}–${r.hashtagMax} hashtags · ${r.aspect}`}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px',
                              borderRadius: 999, cursor: 'pointer',
                              border: `1.5px solid ${on ? INK : '#e4e7ec'}`,
                              backgroundColor: on ? INK : '#fff',
                              color: on ? '#fff' : INK, fontSize: 12.5, fontWeight: 600,
                            }}
                          >
                            {on && <Check size={12} strokeWidth={3} />}
                            {r.surface}
                            <span style={{ fontSize: 10.5, color: on ? 'rgba(255,255,255,0.6)' : FAINT }}>{r.aspect}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={CARD}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
              Your own channels
            </h3>
            <p style={{ fontSize: 13, color: MUTED, margin: '0 0 16px', lineHeight: 1.6 }}>
              These send from your CRM, so they publish without any handoff.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
              {CHANNELS.map(c => {
                const on = draft.channels.includes(c.value);
                return (
                  <button
                    key={c.value}
                    onClick={() => toggleChannel(c.value)}
                    aria-pressed={on}
                    style={{
                      textAlign: 'left', padding: '12px 14px', borderRadius: 13, cursor: 'pointer',
                      border: `1.5px solid ${on ? INK : '#e4e7ec'}`,
                      backgroundColor: on ? '#f7f8fa' : '#fff',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: INK }}>
                      {on && <Check size={12} strokeWidth={3} />} {c.label}
                    </span>
                    <span style={{ display: 'block', fontSize: 11.5, color: MUTED, marginTop: 3, lineHeight: 1.45 }}>{c.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3 ── */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={CARD}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
              Who gets the email and SMS?
            </h3>
            <p style={{ fontSize: 13, color: MUTED, margin: '0 0 16px', lineHeight: 1.6 }}>
              {draft.channels.includes('email') || draft.channels.includes('sms')
                ? 'Pick the segments to send to. Social posts go out regardless — this only decides who is contacted directly.'
                : 'You have not selected email or SMS, so nothing will be sent to contacts. Pick a segment anyway if you plan to add them later.'}
            </p>

            {contacts.length === 0 ? (
              <div style={{
                border: '1px dashed #dfe3e8', borderRadius: 14, padding: '24px 20px', textAlign: 'center',
                backgroundColor: '#fcfcfd',
              }}>
                <Users size={22} color={FAINT} style={{ marginBottom: 8 }} />
                <p style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '0 0 4px' }}>No contacts yet</p>
                <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 14px', lineHeight: 1.55 }}>
                  Import contacts first, or carry on without them — the social posts, blog and landing page
                  do not need an audience, and you can send the email later.
                </p>
                <button
                  onClick={() => set({ audience: { listIds: [], contactCount: 0, skipped: true } })}
                  style={{
                    padding: '9px 18px', borderRadius: 999, border: `1px solid ${draft.audience.skipped ? INK : '#e4e7ec'}`,
                    backgroundColor: draft.audience.skipped ? INK : '#fff',
                    color: draft.audience.skipped ? '#fff' : INK, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {draft.audience.skipped ? 'Skipping the audience' : 'Continue without contacts'}
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lists.length === 0 && (
                    <p style={{ fontSize: 12.5, color: MUTED, margin: 0 }}>
                      You have {contacts.length} contact{contacts.length === 1 ? '' : 's'} but no segments yet. Create one below.
                    </p>
                  )}
                  {lists.map(l => {
                    const on = draft.audience.listIds.includes(l.id);
                    return (
                      <button
                        key={l.id}
                        onClick={() => toggleList(l.id)}
                        aria-pressed={on}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px',
                          borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                          border: `1.5px solid ${on ? INK : '#e4e7ec'}`,
                          backgroundColor: on ? '#f7f8fa' : '#fff',
                        }}
                      >
                        <span style={{
                          width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                          border: `1.5px solid ${on ? INK : '#d5d8dd'}`, backgroundColor: on ? INK : '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {on && <Check size={12} color="#fff" strokeWidth={3} />}
                        </span>
                        <span style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: l.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: INK }}>{l.name}</span>
                        <span style={{ fontSize: 11.5, color: MUTED }}>
                          {memberCount(l)} contact{memberCount(l) === 1 ? '' : 's'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <input
                    value={newListName}
                    onChange={e => setNewListName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); makeList(); } }}
                    placeholder="New segment for this campaign"
                    aria-label="New segment name"
                    style={{
                      flex: 1, padding: '10px 12px', border: '1px solid #e4e7ec', borderRadius: 11,
                      fontSize: 13, outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                  <button
                    onClick={makeList}
                    disabled={!newListName.trim()}
                    style={{
                      padding: '10px 16px', borderRadius: 11, border: '1px solid #e4e7ec',
                      backgroundColor: '#fff', color: newListName.trim() ? INK : FAINT,
                      fontSize: 12.5, fontWeight: 700, cursor: newListName.trim() ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Create segment
                  </button>
                </div>

                {draft.audience.listIds.length > 0 && (
                  <p style={{ fontSize: 12.5, color: INK, margin: '12px 0 0', fontWeight: 600 }}>
                    {selectedCount} contact{selectedCount === 1 ? '' : 's'} will receive this campaign
                    {draft.audience.listIds.length > 1 && ' (duplicates across segments counted once)'}.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Summary */}
          <div style={{ ...CARD, backgroundColor: '#f7f8fa' }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: INK, margin: '0 0 12px', letterSpacing: '-0.01em' }}>
              Ready to generate
            </h3>
            {([
              ['Video', draft.sources.length === 1 ? draft.sources[0].name : `${draft.sources.length} videos`],
              ['Title', draft.title || '—'],
              ['Goal', GOALS.find(g => g.value === draft.goal)?.label ?? draft.goal],
              ['Destinations', describeTargets(draft)],
              ['Audience', draft.audience.skipped ? 'Skipped for now'
                : draft.audience.listIds.length ? `${selectedCount} contacts across ${draft.audience.listIds.length} segment(s)`
                  : 'None selected'],
            ] as const).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 12, padding: '6px 0', fontSize: 12.5 }}>
                <span style={{ width: 110, color: MUTED, fontWeight: 600, flexShrink: 0 }}>{k}</span>
                <span style={{ color: INK, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
        {step > 1 && (
          <button onClick={() => setStep((step - 1) as 1 | 2 | 3)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 18px',
            borderRadius: 999, border: '1px solid #e4e7ec', backgroundColor: '#fff',
            color: INK, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
            <ArrowLeft size={14} /> Back
          </button>
        )}
        <button onClick={next} disabled={!!problem} style={primaryBtn(!!problem)}>
          {step === 3 ? <><Sparkles size={14} /> Create campaign</> : <>Next <ArrowRight size={14} /></>}
        </button>
        {problem && (
          <span role="status" style={{ fontSize: 12.5, color: MUTED, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={13} color={FAINT} /> {problem}
          </span>
        )}
      </div>
    </div>
  );
}
