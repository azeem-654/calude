/**
 * "See how AI Prospecting works" — a short drawn film on AI Prospecting's
 * New search screen (owner, 2026-11-13: "how it finds prospects, and how it
 * automatically adds prospects day by day without you handling things").
 *
 * The same player as the home page's films (shared/DemoFilm.tsx): one
 * sentence → the live search, step by step → businesses with their checked
 * addresses → Connect to AI Autopilot → the daily finder adding new ones each
 * run day, skipping anyone already in Contacts or unsubscribed → the list's
 * email sequence, cold prospects in small batches waiting for approval.
 *
 * ── Honesty ──
 *
 * "Illustration · example values" in the frame. No counts: a run adds "new
 * businesses", never "12 new leads". Addresses read **Contact checked** —
 * format, domain and mail server — which is what the free check proves; the
 * screen's "Contact verified" means a mailbox verifier said so, and most
 * installs have none, so the film never shows it. Every label is the
 * screen's own: "All businesses", "With email", "Connect to AI Autopilot".
 *
 * ── Where it sits ──
 *
 * Under the hairline on the New search screen, never above the sentence box:
 * the box stays the first thing on screen at 1280×720 and 390×720
 * (test:prospecting measures it). Collapsible; whether it is folded is a
 * per-browser convenience, so it lives in localStorage and the page works
 * without it.
 */
import { useState } from 'react';
import {
  Calendar, Check, ChevronDown, Clock, Globe, Inbox, Link2, Mail, MailCheck, MapPin, PlayCircle,
  Search, ShieldCheck, Sparkles, Stethoscope, UserX, Users, Zap,
} from 'lucide-react';
import DemoFilm, { Typed, click, move, on, type, type FilmStep, type RailItem } from '../shared/DemoFilm';
import './prospectingDemo.css';

const RAIL: RailItem[] = [
  { id: 'prospecting', icon: Search, label: 'Prospecting' },
  { id: 'contacts', icon: Users, label: 'Contacts' },
  { id: 'autopilot', icon: Sparkles, label: 'AI Autopilot' },
  { id: 'campaigns', icon: Mail, label: 'Campaigns' },
  { id: 'inbox', icon: Inbox, label: 'Inbox' },
];

const STEPS: FilmStep[] = [
  {
    title: 'Say who you want',
    caption: 'Describe the businesses you want in one sentence. It shows what it understood before it searches.',
    crumb: 'AI Prospecting · New search',
    rail: 'prospecting',
    ms: 7600,
    cues: [
      move(200, 'box', 800, 'Describing who to find'), click(1100, 'box'), type(1150, 'q', 1900),
      on(2300, 'u0'), on(2700, 'u1'), on(3100, 'u2'),
      move(3700, 'go', 700, 'Searching'), click(4500, 'go'), on(4600, 'busy'),
    ],
  },
  {
    title: 'It searches live',
    caption: 'It searches all businesses that match, reads each one’s website for the address it publishes, and checks every address.',
    crumb: 'AI Prospecting · Results',
    rail: 'prospecting',
    ms: 7400,
    cues: [
      on(200, 'l0'), on(1500, 'l1'), on(3000, 'l2'),
      on(600, 'p0'), on(1000, 'p1'), on(1400, 'p2'), on(1800, 'p3'),
      on(4300, 'chk'),
    ],
  },
  {
    title: 'Businesses and emails',
    caption: 'Businesses with an email come first, each address marked Contact checked: format, domain and mail server.',
    crumb: 'AI Prospecting · Results',
    rail: 'prospecting',
    ms: 7600,
    cues: [
      on(150, 'r0'), on(450, 'r1'), on(750, 'r2'), on(1050, 'r3'),
      move(2300, 'cn', 1000, 'Connect to AI Autopilot'), click(3500, 'cn'),
    ],
  },
  {
    title: 'Connected',
    caption: 'Connect the search to a business workspace: when it runs, which list the businesses join, and the email sequence after.',
    crumb: 'Connect to AI Autopilot',
    rail: 'autopilot',
    ms: 8200,
    cues: [
      on(200, 'c0'), on(700, 'c1'), on(1200, 'c2'), on(1700, 'c3'),
      move(2500, 'ok', 1000, 'Connecting'), click(3700, 'ok'), on(3850, 'done'),
    ],
  },
  {
    title: 'Every morning, new ones',
    caption: 'Every run day the daily finder searches again and adds new businesses by itself — never anyone already in your Contacts or unsubscribed.',
    crumb: 'Contacts · Leeds dentists',
    rail: 'contacts',
    ms: 9800,
    cues: [
      on(300, 'd0'), on(1300, 'd1'), on(2300, 'd2'), on(3300, 'd3'), on(4300, 'd4'), on(5100, 'd5'), on(5400, 'd6'),
      on(6000, 's0'), on(6600, 's1'),
    ],
  },
  {
    title: 'Into the sequence',
    caption: 'New businesses join the email sequence. Cold prospects go in small batches, each waiting for your OK before the first email.',
    crumb: 'AI Autopilot · Clearview Dental Lab',
    rail: 'autopilot',
    ms: 8400,
    cues: [
      on(150, 'n0'), on(500, 'e0'), on(650, 'n1'), on(1000, 'e1'), on(1150, 'n2'), on(1500, 'e2'), on(1650, 'n3'),
      on(2600, 'batch'),
      move(3400, 'appr', 1000, 'Approving the batch'), click(4600, 'appr'), on(4750, 'sent'),
    ],
  },
];

const ROWS = [
  { k: 'r0', p: 'p0', name: 'Park Lane Dental', mail: 'reception@parklanedental.example', ok: true },
  { k: 'r1', p: 'p1', name: 'Kirkstall Smiles', mail: 'hello@kirkstallsmiles.example', ok: true },
  { k: 'r2', p: 'p2', name: 'Headingley Dental Care', mail: 'info@headingleydental.example', ok: true },
  { k: 'r3', p: 'p3', name: 'Roundhay Family Dentists', mail: 'team@roundhaydentists.example', ok: false },
];

const WEEK = [
  { k: 'd0', d: 'Mon', who: ['Chapel Allerton Dental', 'Moortown Smile Studio'] },
  { k: 'd1', d: 'Tue', who: ['Armley Dental Practice'] },
  { k: 'd2', d: 'Wed', who: ['Horsforth Dental', 'Meanwood Dentists'] },
  { k: 'd3', d: 'Thu', who: ['Pudsey Smile Centre'] },
  { k: 'd4', d: 'Fri', who: ['Oakwood Dental', 'Garforth Dental Care'] },
  { k: 'd5', d: 'Sat', who: [] },
  { k: 'd6', d: 'Sun', who: [] },
];

const FOLD_KEY = 'pc_prospecting_demo_folded';

function readFolded(): boolean {
  try { return localStorage.getItem(FOLD_KEY) === '1'; } catch { return false; }
}

export default function ProspectingDemo() {
  const [folded, setFolded] = useState(readFolded);
  const toggle = () => {
    setFolded(f => {
      try { localStorage.setItem(FOLD_KEY, f ? '0' : '1'); } catch { /* private window: it simply is not remembered */ }
      return !f;
    });
  };
  return (
    <div className="psd" data-folded={folded ? '1' : '0'}>
      <button type="button" className="psd-head" onClick={toggle} aria-expanded={!folded}>
        <PlayCircle size={16} />
        <span className="psd-head-t"><b>See how AI Prospecting works</b><small>From one sentence to new prospects every morning · about a minute</small></span>
        <span className="psd-head-x">{folded ? 'Show' : 'Hide'} <ChevronDown size={14} /></span>
      </button>
      {!folded && (
        <DemoFilm steps={STEPS} rail={RAIL} className="psd-film" exLabel="Illustration · example values" label="How AI Prospecting works — an illustration with example values">
          {({ scene }) => (
            <>
              {/* 1 · One sentence */}
              <section {...scene(0, 'psd-s1')}>
                <b className="psd-hero">Who do you want to sell to?</b>
                <div className="psd-box apd-t" data-k="box">
                  <span className="psd-q"><span className="psd-ph">Dentists in Leeds with a website</span><Typed k="q" text="Dentists in Leeds with a website" /></span>
                  <span className="psd-go apd-t" data-k="go"><Search size={16} /></span>
                </div>
                <div className="psd-chips">
                  <span className="psd-uchip apd-r" data-k="u0"><Stethoscope size={12} /> Dentists</span>
                  <span className="psd-uchip apd-r" data-k="u1"><MapPin size={12} /> Leeds</span>
                  <span className="psd-uchip is-want apd-r" data-k="u2"><Globe size={12} /> with a website</span>
                </div>
                <span className="apd-st is-ai apd-r" data-k="busy"><Zap size={12} /> Searching live…</span>
              </section>

              {/* 2 · The live search, step by step */}
              <section {...scene(1, 'psd-s2')}>
                <div className="apd-card psd-log">
                  <div className="apd-card-h"><span className="apd-ic is-ai"><Zap size={16} /></span><span><b>Searching live</b><small>All businesses · Dentists in Leeds</small></span></div>
                  {[
                    ['l0', 'Searched for dentists in Leeds'],
                    ['l1', 'Read every website for the address it publishes'],
                    ['l2', 'Checked every address — format, domain, mail server'],
                  ].map(([k, t]) => <div key={k} className="psd-line" data-k={k}><span className="apd-tick-s"><Check size={11} strokeWidth={3} /></span>{t}</div>)}
                </div>
                <div className="apd-card psd-found">
                  <b className="psd-found-h">Found</b>
                  {ROWS.map((r, i) => (
                    <div key={r.p} className={`psd-pin apd-r${i > 1 ? ' apd-wide-only' : ''}`} data-k={r.p}><MapPin size={13} /> {r.name}</div>
                  ))}
                  <span className="apd-st is-ok apd-r" data-k="chk"><MailCheck size={12} /> Addresses checked</span>
                </div>
              </section>

              {/* 3 · Businesses and their addresses */}
              <section {...scene(2, 'psd-s3')}>
                <div className="apd-card psd-res">
                  <div className="psd-res-h">
                    <b>Results</b>
                    <span className="apd-st">All businesses</span>
                    <span className="apd-st is-ai">With email</span>
                    <span className="apd-btn is-primary apd-t psd-cn" data-k="cn"><Link2 size={14} /> Connect to AI Autopilot</span>
                  </div>
                  {ROWS.map((r, i) => (
                    <div key={r.k} className={`psd-row apd-r${i > 2 ? ' apd-wide-only' : ''}`} data-k={r.k}>
                      <b>{r.name}</b>
                      <span className="psd-mail">{r.mail}</span>
                      {r.ok
                        ? <span className="apd-st is-ok"><Check size={11} strokeWidth={3} /> Contact checked</span>
                        : <span className="apd-st is-warn">Risky</span>}
                    </div>
                  ))}
                </div>
              </section>

              {/* 4 · Connect to AI Autopilot */}
              <section {...scene(3, 'psd-s4')}>
                <div className="apd-card psd-conn">
                  <div className="apd-card-h"><span className="apd-ic is-ai"><Link2 size={16} /></span><span><b>Connect to AI Autopilot</b><small>Dentists in Leeds with a website</small></span></div>
                  {[
                    ['c0', Sparkles, 'Business workspace', 'Clearview Dental Lab'],
                    ['c1', Clock, 'Runs', 'Every weekday, from 8:00 am'],
                    ['c2', Users, 'New businesses join', 'Contacts · list “Leeds dentists”'],
                    ['c3', Mail, 'Then', 'Email sequence · Introduce the lab'],
                  ].map(([k, Icon, l, v], i) => {
                    const I = Icon as typeof Mail;
                    return (
                      <div key={k as string} className={`psd-set apd-r${i === 3 ? ' apd-wide-only' : ''}`} data-k={k as string}>
                        <I size={14} /><span>{l as string}</span><b>{v as string}</b>
                      </div>
                    );
                  })}
                  <div className="psd-foot">
                    <span className="apd-st is-ok apd-r" data-k="done"><Check size={12} strokeWidth={3} /> Connected — the first run starts today</span>
                    <span className="apd-btn is-primary apd-t" data-k="ok">Connect</span>
                  </div>
                </div>
              </section>

              {/* 5 · Day by day */}
              <section {...scene(4, 'psd-s5')}>
                <div className="psd-cal-h"><Calendar size={15} /> <b>Daily finder</b> · runs every weekday morning, by itself</div>
                <div className="psd-week">
                  {WEEK.map((d, i) => (
                    <div key={d.k} className={`psd-day apd-r${d.who.length ? '' : ' is-off'}${i === 6 ? ' apd-wide-only' : ''}`} data-k={d.k}>
                      <span className="psd-day-h">{d.d}</span>
                      {d.who.length
                        ? d.who.map((w, j) => <span key={w} className={`psd-new${j > 0 ? ' apd-wide-only' : ''}`}>+ {w}</span>)
                        : <span className="psd-none">No run</span>}
                    </div>
                  ))}
                </div>
                <div className="psd-skips">
                  <span className="apd-st apd-r" data-k="s0"><Users size={12} /> Already in your Contacts — skipped</span>
                  <span className="apd-st apd-r" data-k="s1"><UserX size={12} /> Unsubscribed — never added</span>
                </div>
              </section>

              {/* 6 · Into the email sequence */}
              <section {...scene(5, 'psd-s6')}>
                <div className="apd-card psd-flow">
                  <div className="apd-card-h"><span className="apd-ic is-ai"><Mail size={16} /></span><span><b>Email sequence · Introduce the lab</b><small>Clearview Dental Lab · from your own mailbox</small></span></div>
                  <div className="psd-nodes">
                    {[
                      ['n0', Users, 'New business added'],
                      ['n1', Mail, 'Email 1 · Introduce the lab'],
                      ['n2', Clock, 'Wait three days'],
                      ['n3', Mail, 'Email 2 · A short follow-up'],
                    ].map(([k, Icon, t], i) => {
                      const I = Icon as typeof Mail;
                      return (
                        <div key={k as string} className="psd-node-w">
                          {i > 0 && <span className="psd-edge" data-k={`e${i - 1}`} />}
                          <span className="psd-node apd-r" data-k={k as string}><I size={14} /> {t as string}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="apd-card psd-batch apd-r" data-k="batch">
                  <div className="psd-batch-h"><ShieldCheck size={15} /> <b>A small batch is waiting for your OK</b></div>
                  <span className="psd-batch-t">New businesses from this week’s runs</span>
                  <div className="psd-foot">
                    <span className="apd-btn is-primary apd-t" data-k="appr">Approve</span>
                  </div>
                  <span className="apd-st is-ok apd-r psd-sent" data-k="sent"><Check size={12} strokeWidth={3} /> Approved — sending from your mailbox</span>
                </div>
              </section>
            </>
          )}
        </DemoFilm>
      )}
    </div>
  );
}
