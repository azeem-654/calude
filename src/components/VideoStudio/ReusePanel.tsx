/**
 * Reuse a recording beyond video: the Repurposing module's writers (social
 * posts, a blog article, a short email sequence — the same ones AI Autopilot's
 * content agents use, run on this recording's transcript) and a quiz for a
 * training recording.
 *
 * Everything written lands as a **draft** where its module keeps drafts
 * (Social posts, Blog, Email sequences), stamped as made by Video Studio;
 * nothing is posted or sent. The quiz is written only from what the recording
 * says: each question carries the moment it is answered, and a question whose
 * answer is not in the transcript is dropped on the server (`cleanQuiz`).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Share2, FileText, Mail, GraduationCap, Loader, Download, Copy, Play, Check, Wand2, ExternalLink } from 'lucide-react';
import { startRepurpose, startQuiz, clock, type QuizQuestion } from '../../services/videoStudio';
import type { EditorCtx } from './VideoEditor';

function quizText(title: string, qs: QuizQuestion[], answers: boolean): string {
  const L = 'ABCDEF';
  return [`${title} — quiz`, '', ...qs.flatMap((q, i) => [
    `${i + 1}. ${q.q}`,
    ...q.options.map((o, k) => `   ${L[k]}) ${o}`),
    ...(answers ? [`   Answer: ${L[q.answer]}${q.explain ? ` — ${q.explain}` : ''} (at ${clock(q.t)})`] : []),
    '',
  ])].join('\n');
}

function quizCsv(qs: QuizQuestion[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const width = Math.max(2, ...qs.map(q => q.options.length));
  const head = ['Question', ...Array.from({ length: width }, (_, k) => `Option ${k + 1}`), 'Correct option', 'Explanation', 'Answered at'];
  return [head.map(esc).join(','), ...qs.map(q => [q.q, ...Array.from({ length: width }, (_, k) => q.options[k] ?? ''), String(q.answer + 1), q.explain, clock(q.t)].map(esc).join(','))].join('\r\n');
}

function save(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function ReusePanel({ ctx }: { ctx: EditorCtx }) {
  const { view } = ctx;
  const ex = view.extras ?? {};
  const [posts, setPosts] = useState(ex.want?.repurpose?.posts ?? 3);
  const [blog, setBlog] = useState(ex.want?.repurpose?.blog ?? true);
  const [email, setEmail] = useState(ex.want?.repurpose?.email ?? true);
  const [err, setErr] = useState('');
  const [answers, setAnswers] = useState(false);
  const [copied, setCopied] = useState(false);
  const open = (k: string) => view.jobs.some(j => j.kind === k && (j.state === 'queued' || j.state === 'running'));
  const failed = (k: string) => [...view.jobs].reverse().find(j => j.kind === k)?.state === 'failed' ? [...view.jobs].reverse().find(j => j.kind === k)?.error : '';
  const transcribed = !!view.transcriptUrl || !!ctx.transcript;
  const writing = open('repurpose'), quizzing = open('quiz');
  const name = view.project.name;

  const repurpose = async () => {
    setErr('');
    const r = await startRepurpose(view.project.id, { posts, blog, email });
    if (!r.success) setErr(r.error ?? 'Could not start.'); else { ctx.say({ who: 'ai', text: 'Writing posts, an article and emails from this recording — they will be drafts.' }); await ctx.refresh(); }
  };
  const quiz = async () => {
    setErr('');
    const r = await startQuiz(view.project.id);
    if (!r.success) setErr(r.error ?? 'Could not start.'); else { ctx.say({ who: 'ai', text: 'Writing a quiz from what the recording teaches.' }); await ctx.refresh(); }
  };

  return (
    <div className="vs-col" data-testid="vs-reuse">
      <section className="vs-item" data-testid="vs-repurpose">
        <div className="vs-row"><Share2 size={15} color="#c084fc" /><b>Repurpose into posts, an article and emails</b></div>
        <p className="vs-kbd" style={{ margin: 0 }}>Written from this recording's words by the same writers AI Autopilot uses. Saved as drafts — nothing is posted or sent.</p>
        <div className="vs-row">
          <label className="vs-label" style={{ flex: 1, minWidth: 110 }}>Social posts
            <select className="vs-select" value={posts} onChange={e => setPosts(Number(e.target.value))}>{[0, 1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n === 0 ? 'None' : n}</option>)}</select>
          </label>
          <label className="vs-row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={blog} onChange={e => setBlog(e.target.checked)} /> <FileText size={13} /> Blog article</label>
          <label className="vs-row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={email} onChange={e => setEmail(e.target.checked)} /> <Mail size={13} /> 3 emails</label>
        </div>
        <button type="button" className="vs-btn ai sm" style={{ justifySelf: 'start' }} disabled={!transcribed || writing || (!posts && !blog && !email)} onClick={() => void repurpose()} data-act="repurpose">
          {writing ? <Loader size={13} className="spin" /> : <Wand2 size={13} />} {writing ? 'Writing…' : ex.repurposed ? 'Write another set' : 'Write them'}
        </button>
        {!transcribed && <span className="vs-kbd">Available once the recording is transcribed.</span>}
        {failed('repurpose') && <div className="vs-note bad">{failed('repurpose')}</div>}
        {ex.repurposed && (
          <div className="vs-col" style={{ gap: 6 }} data-testid="vs-repurposed">
            <span className="vs-kbd">Written {new Date(ex.repurposed.at).toLocaleString()}:</span>
            {ex.repurposed.links.map(l => (
              <Link key={`${l.kind}:${l.id}`} to={l.route} className="vs-btn sm" style={{ justifyContent: 'flex-start' }} data-kind={l.kind}>
                {l.kind === 'social-post' ? <Share2 size={13} /> : l.kind === 'blog-post' ? <FileText size={13} /> : <Mail size={13} />} {l.label} <ExternalLink size={11} />
              </Link>
            ))}
            {ex.repurposed.notes.map(n => <span key={n} className="vs-kbd">{n}</span>)}
          </div>
        )}
      </section>

      <section className="vs-item" data-testid="vs-quiz-panel">
        <div className="vs-row"><GraduationCap size={15} color="#c084fc" /><b>Quiz from a training recording</b></div>
        <p className="vs-kbd" style={{ margin: 0 }}>Multiple-choice questions on what the recording teaches, each with the moment it is answered. Questions the recording does not answer are left out.</p>
        <button type="button" className="vs-btn ai sm" style={{ justifySelf: 'start' }} disabled={!transcribed || quizzing} onClick={() => void quiz()} data-act="quiz">
          {quizzing ? <Loader size={13} className="spin" /> : <Wand2 size={13} />} {quizzing ? 'Writing the quiz…' : ex.quiz ? 'Write it again' : 'Write a quiz'}
        </button>
        {failed('quiz') && <div className="vs-note bad">{failed('quiz')}</div>}
        {ex.quizNote && <div className="vs-note">{ex.quizNote}</div>}
        {ex.quiz && ex.quiz.questions.length > 0 && (
          <>
            <div className="vs-row">
              <label className="vs-row" style={{ gap: 6, fontSize: 12.5 }}><input type="checkbox" checked={answers} onChange={e => setAnswers(e.target.checked)} /> Show answers</label>
              <span className="vs-spacer" />
              <button type="button" className="vs-btn sm" onClick={() => { void navigator.clipboard?.writeText(quizText(name, ex.quiz!.questions, true)); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={13} /> : <Copy size={13} />} Copy</button>
              <button type="button" className="vs-btn sm" onClick={() => save(`${name.replace(/[^\w -]+/g, '').trim() || 'quiz'} - quiz.txt`, quizText(name, ex.quiz!.questions, true), 'text/plain')} data-act="quiz-txt"><Download size={13} /> .txt</button>
              <button type="button" className="vs-btn sm" onClick={() => save(`${name.replace(/[^\w -]+/g, '').trim() || 'quiz'} - quiz.csv`, quizCsv(ex.quiz!.questions), 'text/csv')} data-act="quiz-csv"><Download size={13} /> .csv</button>
            </div>
            <ol className="vs-quiz" data-testid="vs-quiz">
              {ex.quiz.questions.map((q, i) => (
                <li key={i}>
                  <div className="vs-row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                    <b style={{ flex: 1, fontSize: 13 }}>{i + 1}. {q.q}</b>
                    <button type="button" className="vs-btn ghost sm" onClick={() => ctx.seek(Math.max(0, q.t - 1))} aria-label={`Play the answer at ${clock(q.t)}`}><Play size={12} /> {clock(q.t)}</button>
                  </div>
                  <ol type="A">{q.options.map((o, k) => <li key={k} className={answers && k === q.answer ? 'right' : ''} style={{ border: 0, padding: 0, listStyle: 'upper-alpha' }}>{o}</li>)}</ol>
                  {answers && q.explain && <small className="vs-kbd">{q.explain}</small>}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
      {err && <div className="vs-note bad" role="alert">{err}</div>}
    </div>
  );
}
