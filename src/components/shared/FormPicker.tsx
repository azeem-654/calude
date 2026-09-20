/**
 * Which form does this block collect into?
 *
 * ── Why a block has to name one ──
 *
 * A submission has to say which workspace it belongs to, and a public page
 * cannot be trusted to say — that is the rule the whole engagement route is
 * built on. An engagement form's slug is unique across the install and maps to
 * exactly one workspace, so choosing a form here is what makes the block's
 * submit button able to do anything at all.
 *
 * Shared by the website builder and the funnel builder, because the question
 * and the consequence of leaving it blank are identical in both.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { listOf, type EngageForm } from '../../services/engagement';

export default function FormPicker({
  value, onChange, style,
}: { value: string; onChange: (slug: string) => void; style?: React.CSSProperties }) {
  const [forms, setForms] = useState<EngageForm[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await listOf('form');
      setForms(r.success ? ((r.items ?? []) as EngageForm[]).filter(f => f.status === 'live') : []);
      setLoaded(true);
    })();
  }, []);

  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 9px', border: '1px solid #e2e8f0', borderRadius: 6,
    fontSize: 12, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff',
    ...style,
  };

  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>
        Collects into
      </label>
      <select value={value} onChange={e => onChange(e.target.value)} style={inp}>
        <option value="">— not connected —</option>
        {forms.map(f => <option key={f.id} value={f.slug}>{f.name}</option>)}
      </select>

      {loaded && !forms.length && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: '#b45309', lineHeight: 1.5 }}>
          You have no live forms yet. Make one in{' '}
          <Link to="/engagement?tab=forms" style={{ color: '#4f46e5', fontWeight: 700 }}>
            Customer Engagement → Forms <ExternalLink size={9} style={{ display: 'inline' }} />
          </Link>
          {' '}and it will appear here.
        </p>
      )}

      {loaded && !!forms.length && !value && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: '#b45309', lineHeight: 1.5, display: 'flex', gap: 5 }}>
          <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 2 }} />
          {/* The honest version of what used to happen silently. */}
          <span>Until you pick one, this form cannot take an enquiry — the page says so rather than losing it.</span>
        </p>
      )}

      {value && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
          Submissions become a contact, a deal on your pipeline, and start any automation listening for
          this form.
        </p>
      )}
    </div>
  );
}
