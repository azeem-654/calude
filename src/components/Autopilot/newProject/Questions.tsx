/**
 * Step three: only what this project still needs, a few at a time.
 *
 * One topic per screen, three questions at most. Each says whether it is
 * required or optional; most offer "Let AI decide", which resolves to a named
 * choice the blueprint shows as "chosen for you" — so deciding nothing is a
 * real option, and never a hidden one. Optional questions can be skipped.
 *
 * The business question is the one with a shape of its own, because there are
 * five honest ways to answer it and a dropdown would hide four.
 */
import { useRef } from 'react';
import { Building2, Globe, Upload, PenLine, Sparkles, Check, Image as ImageIcon, UserCircle2, Loader, AlertTriangle, RefreshCcw } from 'lucide-react';
import { GROUP_TITLE, type Question } from '../../../services/projectSolutions';
import type { Attachment, IntakeState, KnownSource, Screen, WorkspaceFacts } from '../../../services/projectIntake';
import { readAttachment } from './attachments';
import { MANUAL_FIELDS, PROFILE_FIELDS, profileSource, type ProfileCheck } from './questionRules';
import { LayoutField, ThemeField, ColourField, LogoField, type LogoFieldState } from './DesignFields';
import { aiChoice } from '../../../services/projectIntake';
import { DEFAULT_THEME, KIND_OF, resolveTheme } from '../../../services/designOptions';

/** What the design questions need beyond the answers: the logo and how to get one. */
export interface DesignHooks {
  logo: LogoFieldState;
  onFind: (url: string) => void;
  onFile: (f: File) => void;
}

export default function Questions({ screen, state, ws, files, answer, onFiles, onLink, index, total, profile, onProfile, onReadProfile, design }: {
  screen: Screen;
  design: DesignHooks;
  /** The business as read so far, and the two ways to change it. */
  profile: ProfileCheck;
  onProfile: (patch: Record<string, string>) => void;
  onReadProfile: () => void;
  state: IntakeState;
  ws: WorkspaceFacts;
  files: Attachment[];
  answer: (id: string, value: string | string[] | null, source?: KnownSource) => void;
  onFiles: (atts: Attachment[]) => void;
  onLink: (url: string) => void;
  index: number;
  total: number;
}) {
  /*
   * "Let AI decide" for the whole screen, not only per question.
   *
   * A design screen is three or four decisions somebody may not want to make
   * at all; answering each with the same button is a chore. Only questions
   * still open are filled, so pressing it never overrides a choice already
   * made on this screen.
   */
  const open = screen.questions.filter(q => !state.known[q.id] && aiChoice(q) !== null && aiChoice(q) !== 'detect');
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#8b93a3', letterSpacing: '0.05em' }}>
            {index + 1} OF {total}
          </span>
          <h2 className="wz-title" style={{ marginTop: 4 }}>{GROUP_TITLE[screen.group]}</h2>
        </div>
        {open.length > 1 && (
          <button type="button" className="np-opt" data-ai="1" onClick={() => open.forEach(q => answer(q.id, aiChoice(q), 'default'))}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sparkles size={13} /> Let AI decide all of these</span>
          </button>
        )}
      </div>
      {screen.questions.map(q => (
        <Field key={q.id} q={q} state={state} ws={ws} files={files} answer={answer} onFiles={onFiles} onLink={onLink} design={design} />
      ))}
      {screen.questions.some(q => q.id === 'business') && (
        <ProfileFound state={state} files={files} profile={profile} onProfile={onProfile} onRead={onReadProfile} />
      )}
    </div>
  );
}

/**
 * What was read about the business, right under where it was given.
 *
 * The site is read here, the moment its address is in, rather than during the
 * build — so a reading that came back without a name, or could not open the
 * page at all, is answered on this screen with a field to type into, instead
 * of stopping the build at 35% with nowhere to put the answer.
 */
function ProfileFound({ state, files, profile, onProfile, onRead }: {
  state: IntakeState; files: Attachment[]; profile: ProfileCheck;
  onProfile: (patch: Record<string, string>) => void; onRead: () => void;
}) {
  const business = String(state.known.business?.value ?? '');
  if (business !== 'website' && business !== 'upload') return null;
  const source = profileSource(state, files);
  if (!source) return null;
  const what = business === 'website' ? 'the website' : 'the profile';
  const fresh = profile.readFor === source && !!profile.draft;

  if (profile.reading) {
    return (
      <div className="np-q" role="status" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, display: 'flex' }}>
        <Loader size={16} className="spin" color="#5b46e5" />
        <span style={{ fontSize: 14, color: '#334155' }}>Reading {what} — this takes a few seconds…</span>
      </div>
    );
  }
  if (!fresh) {
    return (
      <div className="np-q" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {profile.error && (
          <span style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 13, color: '#9a3412', flex: '1 1 260px' }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {profile.error}
          </span>
        )}
        <button type="button" className="np-tool" onClick={onRead}>
          <RefreshCcw size={14} /> {profile.error ? 'Try again' : `Read ${what} now`}
        </button>
        {profile.error && (
          <button type="button" className="np-skip" onClick={() => onProfile({ companyName: '', description: '' })}>
            Type it in instead
          </button>
        )}
      </div>
    );
  }
  const draft = profile.draft ?? {};
  const missing = PROFILE_FIELDS.filter(f => f.need && !String(draft[f.id] ?? '').trim());
  return (
    <div className="np-q">
      <div className="np-q-head">
        <span style={{ fontSize: 17, fontWeight: 750, color: '#17191c' }}>What I found</span>
        <span className="np-need" data-need={missing.length ? 'required' : 'optional'}>
          {missing.length ? `${missing.length} TO ADD` : 'LOOKS COMPLETE'}
        </span>
      </div>
      <p style={{ margin: '-4px 0 0', fontSize: 13, color: '#6b7280', lineHeight: 1.55 }}>
        {missing.length
          ? `${what.charAt(0).toUpperCase()}${what.slice(1)} did not say everything. Fill in what is missing — every post and email is written from this.`
          : 'Check it reads right — every post and email is written from this. Change anything that is off.'}
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        {PROFILE_FIELDS.map(f => {
          const v = String(draft[f.id] ?? '');
          const gap = f.need && !v.trim();
          return (
            <label key={f.id} style={{ display: 'grid', gap: 5, fontSize: 12.5, fontWeight: 700, color: gap ? '#b45309' : '#475569' }}>
              <span>{f.label}{gap ? ' — needed' : ''}</span>
              {f.id === 'description'
                ? <textarea className="np-input" rows={2} value={v} placeholder={f.placeholder}
                    onChange={e => onProfile({ [f.id]: e.target.value })} style={gap ? { borderColor: '#f59e0b' } : undefined} />
                : <input className="np-input" value={v} placeholder={f.placeholder}
                    onChange={e => onProfile({ [f.id]: e.target.value })} style={gap ? { borderColor: '#f59e0b' } : undefined} />}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function Field({ q, state, ws, files, answer, onFiles, onLink, design }: {
  q: Question; state: IntakeState; ws: WorkspaceFacts; files: Attachment[];
  design: DesignHooks;
  answer: (id: string, value: string | string[] | null, source?: KnownSource) => void;
  onFiles: (atts: Attachment[]) => void;
  onLink: (url: string) => void;
}) {
  const known = state.known[q.id];
  const val = known?.value;
  const vals = Array.isArray(val) ? val : val ? [val] : [];
  const byAi = known?.source === 'default';
  const aiValue = q.aiDecides;
  const picker = useRef<HTMLInputElement>(null);

  const head = (
    <div className="np-q-head">
      <span style={{ fontSize: 17, fontWeight: 750, color: '#17191c', letterSpacing: '-0.01em' }}>{q.prompt}</span>
      <span className="np-need" data-need={q.need}>{q.need === 'required' ? 'NEEDED' : 'OPTIONAL'}</span>
    </div>
  );
  const help = q.help ? <p style={{ margin: '-4px 0 0', fontSize: 13, color: '#6b7280', lineHeight: 1.55 }}>{q.help}</p> : null;
  const aiButton = aiValue !== undefined && aiValue !== 'detect' ? (
    <button type="button" className="np-opt" data-ai="1" aria-pressed={byAi}
      onClick={() => answer(q.id, byAi ? null : aiValue, 'default')}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sparkles size={13} /> Let AI decide</span>
    </button>
  ) : aiValue === 'detect' ? (
    <button type="button" className="np-opt" data-ai="1" aria-pressed={vals[0] === 'detect'}
      onClick={() => answer(q.id, vals[0] === 'detect' ? null : 'detect', 'default')}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sparkles size={13} /> Let AI work it out</span>
    </button>
  ) : null;
  const skipped = known?.note === 'skipped';
  const skip = q.need !== 'optional' ? null : skipped ? (
    <span style={{ fontSize: 12.5, color: '#6b7280' }}>Skipped{aiValue !== undefined ? ' — Autopilot will choose' : ''}.</span>
  ) : !vals.length ? (
    <button type="button" className="np-skip" onClick={() => answer(q.id, q.type === 'multi' ? [] : '', 'you')}>Skip for now</button>
  ) : null;

  /* ── The business ── */
  if (q.type === 'business') {
    const opts: { value: string; label: string; hint: string; icon: typeof Globe }[] = [
      ...ws.portfolios.map(p => ({ value: `existing:${p.id}`, label: p.name, hint: 'Already in Protected Central', icon: Building2 })),
      ...(ws.workspace?.companyName ? [{ value: 'workspace', label: `My ${ws.workspace.companyName} profile`, hint: 'From your account setup', icon: UserCircle2 }] : []),
      { value: 'website', label: 'Read my website', hint: 'Autopilot reads it now', icon: Globe },
      { value: 'upload', label: 'Upload a company profile', hint: 'A PDF, brochure or document', icon: Upload },
      { value: 'manual', label: 'Type it in', hint: 'Three short lines', icon: PenLine },
    ];
    const docs = files.filter(f => f.kind === 'pdf' || f.kind === 'text');
    return (
      <div className="np-q">
        {head}{help}
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))' }}>
          {opts.map(o => {
            const on = vals[0] === o.value;
            return (
              <button key={o.value} type="button" className="np-sol" aria-pressed={on} onClick={() => answer(q.id, o.value, 'you')}>
                <span className="np-sol-icon"><o.icon size={16} /></span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#17191c' }}>{o.label}</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#6b7280', marginTop: 2 }}>{o.hint}</span>
                </span>
                {on && <Check size={15} color="#5b46e5" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
        {vals[0] === 'upload' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="np-tool" onClick={() => picker.current?.click()}><Upload size={14} /> Choose a file</button>
            <input ref={picker} type="file" hidden accept="application/pdf,.pdf,.txt,.md"
              onChange={async e => {
                const f = e.target.files?.[0]; e.target.value = '';
                if (!f) return;
                const r = await readAttachment(f);
                if (r.ok) onFiles([r.att]);
              }} />
            <span style={{ fontSize: 12.5, color: docs.length ? '#0f7b3d' : '#6b7280' }}>
              {docs.length ? `Using ${docs.map(d => d.name).join(', ')}` : 'PDF or text, up to 3 MB'}
            </span>
          </div>
        )}
        {vals[0] === 'manual' && (
          <div style={{ display: 'grid', gap: 10 }}>
            {MANUAL_FIELDS.map(f => (
              <label key={f.id} style={{ display: 'grid', gap: 5, fontSize: 12.5, fontWeight: 700, color: '#475569' }}>
                {f.label}
                <input className="np-input" value={String(state.known[f.id]?.value ?? '')} placeholder={f.placeholder}
                  onChange={e => answer(f.id, e.target.value, 'you')} />
              </label>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── Design ── */
  const said = (id: string) => { const v = state.known[id]?.value; return String(Array.isArray(v) ? v[0] ?? '' : v ?? ''); };
  const palette = resolveTheme(said('theme') || DEFAULT_THEME, said('brandColor'), said('designStyle'));
  const logoShown = said('logo') === 'none' ? '' : design.logo.logo.dataUrl;
  if (q.type === 'layout') {
    return (
      <div className="np-q">
        {head}{help}
        <LayoutField kind={KIND_OF[q.id] ?? 'social'} value={vals[0] ?? ''} byAi={byAi} aiValue={String(aiValue ?? '')}
          onPick={v => answer(q.id, v, 'you')} onAi={() => answer(q.id, byAi ? null : aiValue ?? null, 'default')}
          palette={palette} logo={logoShown} />
        {skip}
      </div>
    );
  }
  if (q.type === 'theme') {
    return (
      <div className="np-q">
        {head}{help}
        <ThemeField value={vals[0] ?? ''} byAi={byAi} brandColor={said('brandColor')} words={said('designStyle')}
          onPick={v => answer(q.id, v, 'you')} onAi={() => answer(q.id, byAi ? null : aiValue ?? null, 'default')} />
      </div>
    );
  }
  if (q.type === 'logo') {
    return (
      <div className="np-q">
        {head}{help}
        <LogoField value={vals[0] ?? ''} byAi={byAi} st={design.logo}
          onFind={url => { answer(q.id, 'site', 'you'); design.onFind(url); }}
          onFile={f => { answer(q.id, 'upload', 'you'); design.onFile(f); }}
          onNone={() => answer(q.id, 'none', 'you')}
          onAi={() => answer(q.id, byAi ? null : 'auto', 'default')} />
      </div>
    );
  }
  if (q.id === 'brandColor') {
    return (
      <div className="np-q">
        {head}{help}
        <ColourField value={String(val ?? '')} placeholder={q.placeholder} onChange={v => answer(q.id, v, 'you')} />
        {skip}
      </div>
    );
  }

  /* ── Style examples ── */
  if (q.type === 'inspiration') {
    const imgs = files.filter(f => f.kind === 'image');
    return (
      <div className="np-q">
        {head}{help}
        <div className="np-opts">
          <button type="button" className="np-opt" onClick={() => picker.current?.click()}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ImageIcon size={13} /> Upload examples</span>
            <small>Images, a design, a brand guide</small>
          </button>
          <input ref={picker} type="file" hidden multiple accept="image/*,application/pdf"
            onChange={async e => {
              const list = [...(e.target.files ?? [])]; e.target.value = '';
              const out: Attachment[] = [];
              for (const f of list.slice(0, 6)) { const r = await readAttachment(f); if (r.ok) out.push(r.att); }
              if (out.length) { onFiles(out); answer(q.id, 'attached', 'you'); }
            }} />
          <button type="button" className="np-opt" data-ai="1" aria-pressed={vals[0] === 'ai'} onClick={() => answer(q.id, 'ai', 'default')}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sparkles size={13} /> Skip — let AI decide</span>
            <small>From your brand, industry and audience</small>
          </button>
        </div>
        <input className="np-input" placeholder="…or paste a link to a post or site you like"
          onKeyDown={e => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const u = (e.target as HTMLInputElement).value.trim();
            if (!u) return;
            onLink(/^https?:\/\//.test(u) ? u : `https://${u}`);
            answer(q.id, 'link', 'you');
            (e.target as HTMLInputElement).value = '';
          }} aria-label="Link to an example" />
        {(imgs.length > 0 || vals[0] === 'link') && (
          <span style={{ fontSize: 12.5, color: '#0f7b3d' }}>
            {vals[0] === 'link' ? 'Link added as a reference. ' : ''}{imgs.length ? `${imgs.length} example image${imgs.length === 1 ? '' : 's'} attached.` : ''}
          </span>
        )}
      </div>
    );
  }

  /* ── Choices ── */
  if (q.type === 'single' || q.type === 'multi') {
    const toggle = (v: string) => {
      if (q.type === 'single') { answer(q.id, vals[0] === v && !byAi ? null : v, 'you'); return; }
      const base = byAi ? [] : vals;
      const next = base.includes(v) ? base.filter(x => x !== v) : [...base.filter(x => x !== 'none' || v === 'none'), v].filter(x => v === 'none' ? x === 'none' : x !== 'none');
      answer(q.id, next.length ? next : null, 'you');
    };
    return (
      <div className="np-q">
        {head}{help}
        <div className="np-opts">
          {(q.options ?? []).map(o => {
            const on = vals.includes(o.value);
            return (
              <button key={o.value} type="button" className="np-opt" aria-pressed={on} onClick={() => toggle(o.value)}>
                <span>{o.label}{byAi && on ? ' ✦' : ''}</span>
                {o.hint && <small>{o.hint}</small>}
              </button>
            );
          })}
          {aiButton}
        </div>
        {byAi && <span style={{ fontSize: 12, color: '#5b46e5' }}>✦ chosen for you — press any option to change it</span>}
        {skip}
      </div>
    );
  }

  /* ── Words ── */
  return (
    <div className="np-q">
      {head}{help}
      <input className="np-input" inputMode={q.type === 'number' ? 'numeric' : undefined}
        value={byAi ? '' : String(val ?? '')} placeholder={q.placeholder}
        onChange={e => answer(q.id, e.target.value, 'you')} aria-label={q.prompt} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {aiButton && <div className="np-opts">{aiButton}</div>}
        {skip}
      </div>
    </div>
  );
}
