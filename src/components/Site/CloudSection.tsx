/**
 * "It runs in the cloud" — the site's answer to "does it stop when I close
 * my laptop?".
 *
 * Every line here is something the Worker's five-minute cron does with
 * nobody signed in (worker/src/index.ts `scheduled()`): Autopilot planning
 * and sending, workflow steps, follow-up emails and texts (including a one-off
 * email scheduled for later), inbox replies, daily prospect finders, review
 * checks and the morning digest. What still needs a person — pressing Post on
 * a social post, for one — is not listed, so nothing here is a promise the
 * product breaks. The in-app cloud badge proves the same claim live, from the
 * cron's own last run.
 */
import { Bell, Bot, Cloud, Inbox, Laptop, Mail, Search, Star, Workflow } from 'lucide-react';
import { useReveal } from './useReveal';

const RUNS = [
  { icon: Bot, label: 'Autopilot projects', where: 'plan and act on their own' },
  { icon: Workflow, label: 'Workflows', where: 'every step, on time' },
  { icon: Mail, label: 'Follow-ups', where: 'emails and texts go out' },
  { icon: Inbox, label: 'Inbox replies', where: 'leads answered' },
  { icon: Search, label: 'Prospect finders', where: 'new leads every day' },
  { icon: Star, label: 'Reviews', where: 'checked and answered' },
  { icon: Bell, label: 'Morning digest', where: 'what happened overnight' },
];

export default function CloudSection() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section className="dc-process dc-cloud" id="cloud" aria-label="Runs in the cloud">
      <div className="dc-chapter-head">
        <span className="dc-eyebrow">Live in the cloud</span>
        <h2>Close the laptop. <em>Your workflows keep working.</em></h2>
        <p>
          Protected Central runs on Cloudflare&rsquo;s global network, not on your computer. Every five minutes,
          day and night, the cloud picks up whatever is due — so your automations keep running when the app is
          closed, your computer is off, or you are asleep. Inside the app, a blinking cloud shows when it last ran.
        </p>
      </div>
      <div className="dc-cloud-scene reveal" ref={ref}>
        <div className="dc-cloud-top">
          <div className="dc-cloud-device" aria-hidden="true">
          <Laptop size={46} strokeWidth={1.5} />
          <small>Your computer: off</small>
        </div>
        <div className="dc-cloud-link" aria-hidden="true"><i /><i /><i /></div>
        <div className="dc-cloud-core">
          <span className="dc-cloud-icon" aria-hidden="true"><Cloud size={40} strokeWidth={1.6} /><b /></span>
          <strong>Running in the cloud</strong>
          <small>Checked every 5 minutes, 24/7</small>
        </div>
        </div>
        <ul className="dc-cloud-runs">
          {RUNS.map((r, i) => (
            <li key={r.label} style={{ ['--i' as string]: i }}>
              <span className="dc-tile-icon"><r.icon size={14} /></span>
              <b>{r.label}</b>
              <small>{r.where}</small>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
