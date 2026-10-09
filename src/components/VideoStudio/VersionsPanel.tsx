/**
 * Version history: every saved change, newest first, with what it was and
 * who made it. Going back is the same as undo — the versions after it stay
 * as redo until a new change is made.
 */
import { useEffect, useState } from 'react';
import { History, Loader } from 'lucide-react';
import { listVersions } from '../../services/videoStudio';
import type { EditorCtx } from './VideoEditor';

export default function VersionsPanel({ ctx, onGo }: { ctx: EditorCtx; onGo: (v: number) => void }) {
  const [rows, setRows] = useState<{ version: number; note: string; created_by: string; created_at: string }[] | null>(null);
  useEffect(() => { void listVersions(ctx.view.project.id).then(r => setRows(r.success ? r.versions : [])); }, [ctx.view.project.id, ctx.version, ctx.view.maxVersion]);
  if (!rows) return <p className="vs-sub"><Loader size={14} className="spin" /> Loading…</p>;
  return (
    <div className="vs-list" data-testid="vs-versions">
      {rows.map(r => (
        <div key={r.version} className="vs-item" style={r.version === ctx.version ? { borderColor: '#5b46e5' } : r.version > ctx.version ? { opacity: .6 } : undefined}>
          <div className="vs-row">
            <History size={13} />
            <b style={{ fontSize: 13 }}>Version {r.version}</b>
            <span className="vs-meta">{new Date(r.created_at).toLocaleString()} · {r.created_by}</span>
            <span className="vs-spacer" />
            {r.version === ctx.version ? <span className="vs-badge approved">Current</span> : <button type="button" className="vs-btn sm" onClick={() => onGo(r.version)}>{r.version > ctx.version ? 'Redo to here' : 'Go back to this'}</button>}
          </div>
          <span style={{ fontSize: 13 }}>{r.note}</span>
        </div>
      ))}
    </div>
  );
}
