/**
 * The posts AI Autopilot wrote, on the screen it links to.
 *
 * Autopilot's content play drafts a whole post from the brand brief and marks
 * the action Done with a link to this module. It writes them to `crm_blog_posts`,
 * which — until this panel — nothing on the client read. So the board said a
 * post had been written, the link came here, and here said there was nothing.
 *
 * They are deliberately not turned into blog *projects*. A project is a
 * portfolio, a ranking strategy and a month plan; Autopilot has none of those
 * and inventing an empty one behind every draft would make the Blog screen look
 * busy and mean nothing. These are loose drafts and are shown as loose drafts.
 */
import { useMemo, useState } from 'react';
import { Bot, ChevronDown, ChevronRight, Copy, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  loadAutopilotPosts, deleteAutopilotPost, draftAsMarkdown,
  type AutopilotPost,
} from '../../services/autopilotDrafts';

const INK = '#17191c';
const MUTED = '#6b7480';
const LINE = '#e3e6eb';

export default function AutopilotDrafts({ onChanged }: { onChanged?: () => void }) {
  const { addNotification } = useApp();
  const [version, setVersion] = useState(0);
  const [openId, setOpenId] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const posts: AutopilotPost[] = useMemo(() => loadAutopilotPosts(), [version]);

  /* Nothing at all is the ordinary case for a workspace that has never run the
     content play, and an empty section explaining itself would be noise on a
     screen that already has a lot to say. */
  if (!posts.length) return null;

  function copy(p: AutopilotPost) {
    void navigator.clipboard.writeText(draftAsMarkdown(p))
      .then(() => addNotification('Draft copied as Markdown'))
      .catch(() => addNotification('The browser would not let the page copy that. Select the text instead.', 'error'));
  }

  function remove(p: AutopilotPost) {
    if (!window.confirm(`Delete the draft "${p.title}"?`)) return;
    if (!deleteAutopilotPost(p.id)) {
      addNotification('The browser refused to save that. Check that storage is not blocked for this site.', 'error');
      return;
    }
    setVersion(v => v + 1);
    onChanged?.();
    addNotification('Draft deleted');
  }

  return (
    <section style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{
          width: 26, height: 26, borderRadius: 9, backgroundColor: INK, color: '#c7f441',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}><Bot size={14} /></span>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: INK, letterSpacing: '-0.02em' }}>
          Drafts from AI Autopilot
        </h2>
        <span style={{
          fontSize: 10.5, fontWeight: 800, padding: '2px 9px', borderRadius: 999,
          backgroundColor: '#ecfdf5', color: '#16a34a',
        }}>{posts.length}</span>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: MUTED, lineHeight: 1.6, maxWidth: 760 }}>
        Autopilot writes one of these each time its content play runs. They are finished drafts and
        nothing has been published — copy one into whatever runs your site, or start a project above
        if you want a whole month planned around keywords instead of a post at a time.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {posts.map(p => {
          const open = openId === p.id;
          return (
            <article key={p.id} style={{
              backgroundColor: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 15px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setOpenId(open ? '' : p.id)}
                  aria-expanded={open}
                  className="press"
                  style={{
                    border: 'none', background: 'none', padding: 0, cursor: 'pointer', flex: '1 1 240px',
                    minWidth: 0, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
                    fontFamily: 'inherit', color: INK,
                  }}
                >
                  {open ? <ChevronDown size={14} color={MUTED} /> : <ChevronRight size={14} color={MUTED} />}
                  <span style={{
                    fontSize: 14, fontWeight: 700, letterSpacing: '-0.015em',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{p.title}</span>
                </button>
                <span style={{ fontSize: 10.5, color: MUTED }}>
                  {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ''}
                  {p.body ? ` · ${p.body.split(/\s+/).filter(Boolean).length} words` : ''}
                </span>
                <button onClick={() => copy(p)} className="press" aria-label={`Copy ${p.title}`} style={iconBtn()}>
                  <Copy size={13} />
                </button>
                <button onClick={() => remove(p)} className="press" aria-label={`Delete ${p.title}`} style={{ ...iconBtn(), color: '#c2410c' }}>
                  <Trash2 size={13} />
                </button>
              </div>

              {open && (
                <div style={{ borderTop: `1px solid ${LINE}`, padding: '14px 15px', backgroundColor: '#fbfbfc' }}>
                  {p.excerpt && (
                    <p style={{ margin: '0 0 10px', fontSize: 12.5, color: MUTED, lineHeight: 1.6, fontStyle: 'italic' }}>
                      {p.excerpt}
                    </p>
                  )}
                  {p.keywords.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      {p.keywords.map(k => (
                        <span key={k} style={{
                          fontSize: 10.5, padding: '2px 9px', borderRadius: 999,
                          backgroundColor: '#eef0f4', color: INK, fontWeight: 600,
                        }}>{k}</span>
                      ))}
                    </div>
                  )}
                  {/* The body as written, wrapped rather than rendered — it is Markdown from a
                      model and turning it into HTML here would mean sanitising it here too. */}
                  <pre style={{
                    margin: 0, fontSize: 12.5, lineHeight: 1.7, color: INK, whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word', fontFamily: 'inherit', maxHeight: 420, overflowY: 'auto',
                  }}>{p.body || 'This draft came back empty. Delete it and let the next run try again.'}</pre>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function iconBtn(): React.CSSProperties {
  return {
    width: 28, height: 28, borderRadius: 999, border: `1px solid ${LINE}`,
    backgroundColor: '#fff', color: INK, cursor: 'pointer', flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
}
