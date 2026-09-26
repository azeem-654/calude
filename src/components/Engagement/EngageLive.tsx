/**
 * Live help — watching a customer's screen and talking them through it.
 *
 * ── How it connects ──
 *
 * The customer presses "Share your screen" in a widget (public/widget.js),
 * picks what to share, and their browser posts one description of how to
 * reach it. Pressing Join here fetches that, answers it with this browser's
 * own, and from then on the two talk directly: the picture and both voices go
 * browser to browser and never through this install. The server keeps who
 * asked, who joined and how it ended — nothing that was on the screen.
 *
 * ── What it cannot do, said on the screen ──
 *
 * A web page can be seen, not driven. Nobody here can click or type on the
 * customer's computer — that needs software installed on it, which is what
 * remote-control products sell. What this offers instead is a pointer: a click
 * on the picture draws a ring in the same place on their page, when the thing
 * they shared is the browser tab the widget is in.
 *
 * ── When the direct route fails ──
 *
 * Some networks refuse a direct connection. With a TURN relay configured
 * (Cloudflare, see docs/OWNER-CHECKLIST.md) those get through; without one the
 * customer's page reports the failure and this screen offers a Google Meet,
 * made on the spot from the workspace's connected calendar, which the
 * customer's widget shows as a link within seconds.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Monitor, Mic, MicOff, PhoneOff, Maximize2, Video, ShieldCheck, Loader, Send, Info,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  liveAnswer, liveEnd, liveMeet, liveSession, liveSessions, type LiveSession,
} from '../../services/engagement';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e6e9f0';
const ACCENT = '#5b46e5';

interface Call {
  id: string;
  who: string;
  pc: RTCPeerConnection;
  mic: MediaStream | null;
  dc: RTCDataChannel | null;
  state: string;
}

/** Wait for this browser's own addresses, capped — see the widget's twin. */
function gathered(pc: RTCPeerConnection): Promise<void> {
  return new Promise(resolve => {
    if (pc.iceGatheringState === 'complete') { resolve(); return; }
    const t = window.setTimeout(resolve, 4000);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') { window.clearTimeout(t); resolve(); }
    });
  });
}

const ago = (iso: string | null) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const ENDED: Record<string, string> = {
  sharer: 'They stopped sharing',
  agent: 'Ended from here',
  expired: 'Nobody joined in time',
  left: 'Their page closed',
  failed: 'Could not connect',
};

export default function EngageLive({ onChange }: { onChange?: () => void }) {
  const { addNotification } = useApp();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [info, setInfo] = useState({ enabled: true, relay: false, meetReady: false });
  const [loaded, setLoaded] = useState(false);
  const [joining, setJoining] = useState('');
  const [call, setCall] = useState<Call | null>(null);
  const [callState, setCallState] = useState('');
  const [muted, setMuted] = useState(false);
  const [messages, setMessages] = useState<{ from: 'me' | 'them'; text: string }[]>([]);
  const [say, setSay] = useState('');
  const [ring, setRing] = useState<{ x: number; y: number; n: number } | null>(null);
  const [meetBusy, setMeetBusy] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const callRef = useRef<Call | null>(null);
  callRef.current = call;
  const remote = useRef<{ video: MediaStream | null; audio: MediaStream | null }>({ video: null, audio: null });
  const [tracks, setTracks] = useState(0);

  useEffect(() => {
    if (!call) return;
    if (video.current && remote.current.video && video.current.srcObject !== remote.current.video) {
      video.current.srcObject = remote.current.video;
    }
    if (audio.current && remote.current.audio && audio.current.srcObject !== remote.current.audio) {
      audio.current.srcObject = remote.current.audio;
    }
  }, [call, tracks]);

  const load = useCallback(async () => {
    const r = await liveSessions();
    if (r.success) {
      setSessions((r.sessions ?? []) as LiveSession[]);
      setInfo({ enabled: !!r.enabled, relay: !!r.relay, meetReady: !!r.meetReady });
    }
    setLoaded(true);
  }, []);

  /* Every five seconds while nobody is being helped — a waiting person should
     show up here about as fast as they would in a chat — and every fifteen
     during a call, when this only watches for the other side ending it. */
  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), call ? 15_000 : 5_000);
    return () => window.clearInterval(t);
  }, [load, call]);

  const hangUp = useCallback((notify: boolean) => {
    const c = callRef.current;
    if (!c) return;
    if (notify && c.dc?.readyState === 'open') {
      try { c.dc.send(JSON.stringify({ t: 'end' })); } catch { /* closing anyway */ }
    }
    c.mic?.getTracks().forEach(t => t.stop());
    try { c.pc.close(); } catch { /* already closed */ }
    if (notify) void liveEnd(c.id).then(() => { void load(); onChange?.(); });
    remote.current = { video: null, audio: null };
    setCall(null);
    setCallState('');
    setMessages([]);
  }, [load, onChange]);

  /* Leaving the screen mid-call ends it rather than leaving somebody sharing
     with a tab that is no longer looking. Through a ref and on unmount only:
     `hangUp` is rebuilt whenever the parent re-renders, and a cleanup keyed on
     it would end every call the moment the tab bar refreshed its counts. */
  const hangUpRef = useRef(hangUp);
  hangUpRef.current = hangUp;
  useEffect(() => () => hangUpRef.current(true), []);

  /* The other side ended it, or their page went away: the list knows first. */
  useEffect(() => {
    if (!call) return;
    const s = sessions.find(x => x.id === call.id);
    if (s && s.status === 'ended') {
      addNotification(ENDED[s.endedReason] ?? 'The session ended.', 'info');
      hangUp(false);
    }
  }, [sessions, call, hangUp, addNotification]);

  const join = async (s: LiveSession) => {
    setJoining(s.id);
    const r = await liveSession(s.id);
    const sess = r.session as { offer?: string; status?: string } | undefined;
    if (!r.success || !sess?.offer || sess.status !== 'waiting') {
      setJoining('');
      addNotification(r.error ?? (sess?.status !== 'waiting' ? 'That one has already started or ended.' : 'They are still choosing what to share — try again in a moment.'), 'error');
      void load();
      return;
    }

    remote.current = { video: null, audio: null };
    const pc = new RTCPeerConnection({ iceServers: (r.iceServers ?? []) as RTCIceServer[] });
    let mic: MediaStream | null = null;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      /* They can still be seen and typed to; said so rather than refused. */
      addNotification('No microphone — you can watch and type, but they will not hear you.', 'info');
    }
    const c: Call = { id: s.id, who: s.name || s.verifiedEmail || s.email || 'Customer', pc, mic, dc: null, state: 'connecting' };

    /* Kept, not attached. The tracks arrive during setRemoteDescription —
       before this call is on screen, so before the <video> exists — and a
       stream handed to an element that is not there yet is simply lost: the
       call connects and shows a black box. The effect below attaches them
       once the elements mount. */
    pc.ontrack = ev => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      if (ev.track.kind === 'video') remote.current.video = stream;
      if (ev.track.kind === 'audio') remote.current.audio = stream;
      setTracks(x => x + 1);
    };
    pc.ondatachannel = ev => {
      c.dc = ev.channel;
      ev.channel.onmessage = m => {
        try {
          const d = JSON.parse(String(m.data)) as { t?: string; text?: string };
          if (d.t === 'say' && d.text) setMessages(x => [...x, { from: 'them', text: String(d.text).slice(0, 2000) }]);
        } catch { /* not ours */ }
      };
    };
    pc.onconnectionstatechange = () => {
      c.state = pc.connectionState;
      setCallState(pc.connectionState);
    };

    try {
      /* The microphone is added before the answer so it is in the description;
         a track added later would need a second round of the handshake. */
      await pc.setRemoteDescription({ type: 'offer', sdp: sess.offer });
      const t = mic?.getAudioTracks()[0];
      const slot = pc.getTransceivers().find(x => x.receiver.track.kind === 'audio');
      if (t && slot) {
        slot.direction = 'sendrecv';
        await slot.sender.replaceTrack(t);
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await gathered(pc);
      const sent = await liveAnswer(s.id, pc.localDescription?.sdp ?? '');
      if (!sent.success) throw new Error(sent.error ?? 'Could not join.');
    } catch (e) {
      mic?.getTracks().forEach(t => t.stop());
      pc.close();
      setJoining('');
      addNotification(e instanceof Error ? e.message : 'Could not join.', 'error');
      void load();
      return;
    }

    setCall(c);
    setCallState('connecting');
    setMuted(false);
    setJoining('');
    void load();
    onChange?.();
  };

  const point = (e: React.MouseEvent<HTMLVideoElement>) => {
    const v = video.current;
    if (!v || !call?.dc || call.dc.readyState !== 'open' || !v.videoWidth) return;
    /* The picture is letterboxed inside the element, so the click is measured
       against the picture itself — otherwise every point on a wide screen
       shown in a tall box lands in the wrong place. */
    const box = v.getBoundingClientRect();
    const scale = Math.min(box.width / v.videoWidth, box.height / v.videoHeight);
    const w = v.videoWidth * scale;
    const h = v.videoHeight * scale;
    const x = (e.clientX - box.left - (box.width - w) / 2) / w;
    const y = (e.clientY - box.top - (box.height - h) / 2) / h;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    call.dc.send(JSON.stringify({ t: 'point', x, y }));
    setRing({ x: e.clientX - box.left, y: e.clientY - box.top, n: Date.now() });
  };

  useEffect(() => {
    if (!ring) return;
    const t = window.setTimeout(() => setRing(null), 1800);
    return () => window.clearTimeout(t);
  }, [ring]);

  const sendSay = () => {
    const text = say.trim();
    if (!text || !call?.dc || call.dc.readyState !== 'open') return;
    call.dc.send(JSON.stringify({ t: 'say', text: text.slice(0, 2000) }));
    setMessages(x => [...x, { from: 'me', text }]);
    setSay('');
  };

  const toggleMute = () => {
    const t = call?.mic?.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setMuted(!t.enabled);
  };

  const meet = async (id: string) => {
    setMeetBusy(true);
    const r = await liveMeet(id);
    setMeetBusy(false);
    if (!r.success || !r.meetUrl) {
      addNotification(r.error ?? 'Could not make a Google Meet.', 'error');
      return;
    }
    addNotification('Google Meet made — the link is on their screen now.', 'success');
    window.open(String(r.meetUrl), '_blank', 'noopener');
    void load();
  };

  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 18 };
  const btn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', border: `1px solid ${LINE}`,
    borderRadius: 9, background: '#fff', color: INK, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  };
  const primary: React.CSSProperties = { ...btn, background: ACCENT, color: '#fff', border: 'none' };

  const waiting = sessions.filter(s => s.status === 'waiting');
  const others = sessions.filter(s => s.status !== 'waiting').slice(0, 20);
  const current = call ? sessions.find(s => s.id === call.id) : undefined;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {call && (
        <div style={{ ...card, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{
              width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
              background: callState === 'connected' ? '#16a34a' : callState === 'failed' ? '#b42318' : '#d97706',
            }} />
            <strong style={{ fontSize: 14.5, color: INK }}>{call.who}</strong>
            <span style={{ fontSize: 12.5, color: MUTED }}>
              {callState === 'connected' ? 'Connected — you can see their screen'
                : callState === 'failed' ? 'Their network would not allow a direct connection'
                  : 'Connecting…'}
            </span>
            <span style={{ flex: 1 }} />
            <button style={btn} onClick={toggleMute} disabled={!call.mic}>
              {muted || !call.mic ? <MicOff size={13} /> : <Mic size={13} />} {!call.mic ? 'No microphone' : muted ? 'Unmute' : 'Mute'}
            </button>
            <button style={btn} onClick={() => void video.current?.requestFullscreen?.()}>
              <Maximize2 size={13} /> Full screen
            </button>
            <button style={btn} onClick={() => void meet(call.id)} disabled={meetBusy || !info.meetReady}
              title={info.meetReady ? 'Make a Google Meet and put the link on their screen' : 'Connect a Google Calendar under Meetings first'}>
              {meetBusy ? <Loader size={13} className="spin" /> : <Video size={13} />} {current?.meetUrl ? 'Open the Meet' : 'Switch to Google Meet'}
            </button>
            <button style={{ ...btn, color: '#b42318', borderColor: '#fecaca' }} onClick={() => hangUp(true)}>
              <PhoneOff size={13} /> End
            </button>
          </div>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))' }}>
            <div style={{ position: 'relative', gridColumn: '1 / -1', background: '#0b1020', borderRadius: 12, overflow: 'hidden', minHeight: 240 }}>
              <video ref={video} autoPlay playsInline muted onClick={point}
                style={{ display: 'block', width: '100%', height: 'min(68vh, 720px)', objectFit: 'contain', cursor: 'crosshair' }} />
              {ring && (
                <span key={ring.n} aria-hidden style={{
                  position: 'absolute', left: ring.x - 16, top: ring.y - 16, width: 32, height: 32,
                  borderRadius: '50%', border: `3px solid ${ACCENT}`, boxShadow: '0 0 0 6px rgba(91,70,229,0.3)',
                  pointerEvents: 'none',
                }} />
              )}
              {callState !== 'connected' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, color: '#cbd5e1', fontSize: 13.5, textAlign: 'center', lineHeight: 1.6 }}>
                  {callState === 'failed'
                    ? (info.meetReady
                      ? 'The direct connection failed. Press "Switch to Google Meet" — the link appears on their screen.'
                      : 'The direct connection failed, and no calendar is connected for a Google Meet fallback. Ask them to raise a ticket, or see the owner checklist for the TURN relay.')
                    : 'Waiting for their picture…'}
                </div>
              )}
            </div>
            <audio ref={audio} autoPlay />

            <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
              <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.55, display: 'flex', gap: 7 }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  Click on their screen to point — a ring appears in the same place on their page when what they
                  shared is the browser tab the chat is in. You can see and point; you cannot click or type on
                  their computer.
                </span>
              </div>
              {current?.topic && (
                <div style={{ fontSize: 13, color: INK, lineHeight: 1.55 }}><strong>They said:</strong> {current.topic}</div>
              )}
            </div>

            <div style={{ display: 'grid', gap: 7, alignContent: 'start' }}>
              <div style={{ display: 'grid', gap: 5, maxHeight: 180, overflowY: 'auto' }}>
                {messages.length === 0 && <span style={{ fontSize: 12, color: MUTED }}>Typed messages appear here and on their screen.</span>}
                {messages.map((m, i) => (
                  <span key={i} style={{
                    justifySelf: m.from === 'me' ? 'end' : 'start', maxWidth: '85%', padding: '7px 10px', borderRadius: 11,
                    fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                    background: m.from === 'me' ? ACCENT : '#f1f3f7', color: m.from === 'me' ? '#fff' : INK,
                  }}>{m.text}</span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                <input value={say} onChange={e => setSay(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendSay(); }}
                  placeholder="Type to them…" aria-label="Message to the customer"
                  style={{ flex: 1, minWidth: 0, padding: '8px 10px', border: `1px solid ${LINE}`, borderRadius: 9, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                <button style={primary} onClick={sendSay} aria-label="Send"><Send size={13} /></button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={card}>
        <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginBottom: 4 }}>
          <Monitor size={16} color={ACCENT} />
          <h3 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0 }}>Live help</h3>
        </div>
        <p style={{ fontSize: 13, color: MUTED, margin: '0 0 12px', lineHeight: 1.6, maxWidth: '76ch' }}>
          Customers who pressed <strong style={{ color: INK }}>Share your screen</strong> in a chat widget. Join one to
          see what they see and talk them through it. The picture goes between the two browsers, encrypted; it is not
          recorded, and this app never receives it.
        </p>

        {loaded && !info.enabled && (
          <Notice>
            No live widget offers screen sharing yet, so nobody can ask. Open <strong>Widgets</strong>, edit one, tick
            <strong> Share your screen</strong> and make it live.
          </Notice>
        )}
        {loaded && info.enabled && !info.relay && (
          <Notice>
            Connecting directly — which works on most home and office networks. A strict corporate firewall will
            refuse it; {info.meetReady ? 'for those, switch the call to Google Meet from here.' : 'connect a Google Calendar under Meetings so you can switch those to a Google Meet.'} The
            owner can add a relay that gets through those too (owner checklist, “Live help”).
          </Notice>
        )}

        {!loaded ? (
          <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Loading…</p>
        ) : waiting.length === 0 ? (
          <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nobody is waiting.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {waiting.map(s => <Row key={s.id} s={s}>
              <button style={primary} disabled={!!joining || !!call || !s.ready} onClick={() => void join(s)}
                title={s.ready ? '' : 'They are still choosing what to share'}>
                {joining === s.id ? <Loader size={13} className="spin" /> : <Monitor size={13} />}
                {s.ready ? 'Join' : 'Choosing what to share…'}
              </button>
            </Row>)}
          </div>
        )}
      </div>

      {others.length > 0 && (
        <div style={card}>
          <h3 style={{ fontSize: 14.5, fontWeight: 800, color: INK, margin: '0 0 10px' }}>Recent</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {others.map(s => <Row key={s.id} s={s}>
              <span style={{ fontSize: 12, color: MUTED }}>
                {s.status === 'live'
                  ? `With ${s.agentName || s.agentEmail}`
                  : `${ENDED[s.endedReason] ?? 'Ended'}${s.agentName || s.agentEmail ? ` · ${s.agentName || s.agentEmail}` : ''}`}
              </span>
            </Row>)}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ s, children }: { s: LiveSession; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
      border: `1px solid ${LINE}`, borderRadius: 12, padding: '11px 13px',
    }}>
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13.5, color: INK }}>{s.name || s.verifiedEmail || s.email || 'A visitor'}</strong>
          {s.verifiedEmail ? (
            <span title="Signed in to this app when they asked — this is who they are, not only what they typed"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 800, color: '#0f7b3d' }}>
              <ShieldCheck size={12} /> SIGNED IN{s.verifiedAccount ? ` · ${s.verifiedAccount}` : ''}
            </span>
          ) : s.email ? (
            <span style={{ fontSize: 11.5, color: MUTED }} title="Typed into the widget, not proved">{s.email}</span>
          ) : null}
          <span style={{ fontSize: 11.5, color: MUTED }}>{ago(s.createdAt)}</span>
        </div>
        {s.topic && <div style={{ fontSize: 12.5, color: '#334155', marginTop: 3, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{s.topic}</div>}
        {s.pageUrl && <div style={{ fontSize: 11, color: MUTED, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.pageUrl}</div>}
      </div>
      {children}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', gap: 9, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 11,
      background: '#f8fafc', border: `1px solid ${LINE}`, marginBottom: 12,
      fontSize: 12.5, color: '#475569', lineHeight: 1.6,
    }}>
      <Info size={15} color="#64748b" style={{ flexShrink: 0, marginTop: 2 }} />
      <span>{children}</span>
    </div>
  );
}
