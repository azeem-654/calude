import { useState } from 'react';
import { X, Search, Eye } from 'lucide-react';
import { sanitizeEmailHtml } from '../../services/emailHtml';

/* ─── Template definitions ─── */
export interface EmailTemplate {
  id: string;
  name: string;
  category: string;
  preview: string; // gradient or hex
  html: string;
}

const btn = (text: string, color = '#6366f1') =>
  `<div style="text-align:center;margin:28px 0"><a href="#" style="display:inline-block;padding:14px 36px;background:${color};color:#ffffff;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.3px">${text} →</a></div>`;

const wrap = (inner: string, bg = '#f8fafc') =>
  `<div style="background:${bg};padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08)">
    ${inner}
  </div>
</div>`;

const header = (title: string, sub: string, bg: string, color = '#fff') =>
  `<div style="background:${bg};padding:40px 40px 32px;text-align:center">
    <h1 style="color:${color};font-size:28px;font-weight:800;margin:0 0 8px;line-height:1.2">${title}</h1>
    <p style="color:${color === '#fff' ? 'rgba(255,255,255,0.85)' : '#64748b'};font-size:15px;margin:0;line-height:1.5">${sub}</p>
  </div>`;

const body = (content: string) =>
  `<div style="padding:32px 40px;font-size:14px;line-height:1.8;color:#374151">${content}</div>`;

const footer = (unsubColor = '#94a3b8') =>
  `<div style="padding:20px 40px;border-top:1px solid #f1f5f9;text-align:center">
    <p style="color:${unsubColor};font-size:11px;margin:0">You received this because you're subscribed · <a href="{{unsubscribe}}" style="color:${unsubColor}">Unsubscribe</a></p>
  </div>`;

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  /* ── Welcome ── */
  {
    id: 'welcome-warm',
    name: 'Warm Welcome',
    category: 'Welcome',
    preview: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    html: wrap(
      header('Welcome, {{firstName}}! 🎉', "We're so glad you're here.", 'linear-gradient(135deg,#6366f1,#8b5cf6)') +
      body(`<p>Hi {{firstName}},</p><p>Thank you for joining us! We're thrilled to have you on board and can't wait to show you everything we've built for you.</p><p>Here's what to expect:</p><ul style="padding-left:20px"><li style="margin-bottom:8px">✅ <strong>Personalized experience</strong> — tailored just for you</li><li style="margin-bottom:8px">✅ <strong>Expert support</strong> — we're here whenever you need us</li><li style="margin-bottom:8px">✅ <strong>Exclusive updates</strong> — you'll be first to know</li></ul>` +
        btn('Get Started →', '#6366f1') +
        `<p style="color:#64748b;font-size:13px">Questions? Just reply to this email — a real human reads every message.</p><p>Warmly,<br/><strong>The Team</strong></p>`) +
      footer(),
    ),
  },
  {
    id: 'welcome-minimal',
    name: 'Clean Welcome',
    category: 'Welcome',
    preview: '#0f172a',
    html: wrap(
      `<div style="padding:40px 40px 24px;text-align:center"><div style="width:56px;height:56px;border-radius:14px;background:#0f172a;display:inline-flex;align-items:center;justify-content:center;margin-bottom:20px"><span style="font-size:28px">👋</span></div><h1 style="color:#0f172a;font-size:26px;font-weight:800;margin:0 0 6px">Hi, {{firstName}}</h1><p style="color:#64748b;font-size:15px;margin:0">Your account is ready.</p></div>` +
      body(`<p>We've been expecting you.</p><p>Your account is all set up and ready to go. Here's your quick-start checklist:</p><div style="background:#f8fafc;border-radius:10px;padding:20px 24px;margin:20px 0"><p style="margin:0 0 10px;font-weight:700;font-size:13px;color:#0f172a;text-transform:uppercase;letter-spacing:0.04em">Getting started</p><div style="display:flex;gap:10px;margin-bottom:10px;align-items:center"><div style="width:20px;height:20px;border-radius:50%;background:#6366f1;color:white;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">1</div><span style="font-size:13px;color:#374151">Complete your profile</span></div><div style="display:flex;gap:10px;margin-bottom:10px;align-items:center"><div style="width:20px;height:20px;border-radius:50%;background:#6366f1;color:white;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">2</div><span style="font-size:13px;color:#374151">Explore the dashboard</span></div><div style="display:flex;gap:10px;align-items:center"><div style="width:20px;height:20px;border-radius:50%;background:#6366f1;color:white;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">3</div><span style="font-size:13px;color:#374151">Invite your team</span></div></div>` +
        btn('Open Dashboard', '#0f172a') +
        `<p>Talk soon,<br/><strong>The Team</strong></p>`) +
      footer(),
    ),
  },

  /* ── Promotional ── */
  {
    id: 'promo-flash',
    name: 'Flash Sale',
    category: 'Promotional',
    preview: 'linear-gradient(135deg,#ef4444,#f97316)',
    html: wrap(
      `<div style="background:linear-gradient(135deg,#ef4444,#f97316);padding:36px 40px;text-align:center"><p style="color:rgba(255,255,255,0.9);font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 10px">Limited time offer</p><h1 style="color:#fff;font-size:48px;font-weight:900;margin:0;line-height:1">50% OFF</h1><p style="color:rgba(255,255,255,0.9);font-size:18px;margin:8px 0 0">Ends in 24 hours, {{firstName}}</p></div>` +
      body(`<p style="text-align:center;font-size:16px;color:#0f172a">This is the deal you've been waiting for.</p><div style="background:#fff9f0;border:2px dashed #f97316;border-radius:12px;padding:20px;text-align:center;margin:20px 0"><p style="font-size:13px;color:#64748b;margin:0 0 8px">Use code at checkout</p><p style="font-size:28px;font-weight:900;color:#ea580c;letter-spacing:0.1em;margin:0">SAVE50</p></div><p>Don't let this slip by — here's what you get:</p><ul style="padding-left:20px"><li style="margin-bottom:8px">Everything included, nothing held back</li><li style="margin-bottom:8px">Cancel anytime, zero risk</li><li style="margin-bottom:8px">Priority support included</li></ul>` +
        btn('Claim Your 50% Off', '#ef4444') +
        `<p style="text-align:center;color:#94a3b8;font-size:12px">Offer expires in 24 hours. No extensions.</p>`) +
      footer(),
    ),
  },
  {
    id: 'promo-launch',
    name: 'Product Launch',
    category: 'Promotional',
    preview: 'linear-gradient(135deg,#0ea5e9,#6366f1)',
    html: wrap(
      header('🚀 Introducing [Product Name]', 'The solution you\'ve been waiting for is finally here.', 'linear-gradient(135deg,#0ea5e9,#6366f1)') +
      body(`<p>Hi {{firstName}},</p><p>Today is the day. After months of building, testing, and refining — we're ready to share <strong>[Product Name]</strong> with the world.</p><div style="background:#f0f9ff;border-left:4px solid #0ea5e9;border-radius:0 10px 10px 0;padding:16px 20px;margin:20px 0"><p style="margin:0;font-size:14px;font-weight:600;color:#0c4a6e">"[A compelling quote about the product from a beta user or key insight]"</p></div><p><strong>What makes this different:</strong></p><ul style="padding-left:20px"><li style="margin-bottom:8px"><strong>Feature 1</strong> — [Describe the key benefit, not the feature]</li><li style="margin-bottom:8px"><strong>Feature 2</strong> — [How this saves time / money / frustration]</li><li style="margin-bottom:8px"><strong>Feature 3</strong> — [The thing competitors can't do]</li></ul>` +
        btn('See it in Action', '#0ea5e9') +
        `<p>We're launching with early-bird pricing — don't wait.<br/><br/>Best,<br/><strong>[Your Name]</strong></p>`) +
      footer(),
    ),
  },

  /* ── Newsletter ── */
  {
    id: 'newsletter-digest',
    name: 'Weekly Digest',
    category: 'Newsletter',
    preview: '#1e293b',
    html: wrap(
      `<div style="background:#1e293b;padding:24px 40px;display:flex;justify-content:space-between;align-items:center"><span style="color:#fff;font-size:18px;font-weight:800">[Your Brand]</span><span style="color:#94a3b8;font-size:12px">Week of [Date]</span></div>` +
      body(`<h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 4px">This Week's Highlights</h2><p style="color:#64748b;font-size:13px;margin:0 0 24px">The best of [your niche], curated for you.</p>` +
        ['📌 Story 1 Title', '📌 Story 2 Title', '📌 Story 3 Title'].map(title =>
          `<div style="border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin-bottom:14px"><h3 style="color:#0f172a;font-size:15px;font-weight:700;margin:0 0 6px">${title}</h3><p style="color:#64748b;font-size:13px;margin:0 0 10px">A short description of the story and why it matters to your audience. Keep it to 2-3 sentences max.</p><a href="#" style="color:#6366f1;font-size:12px;font-weight:600;text-decoration:none">Read more →</a></div>`
        ).join('') +
        `<div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:10px;padding:20px 24px;text-align:center;margin:20px 0"><p style="color:rgba(255,255,255,0.9);font-size:13px;margin:0 0 6px">Know someone who'd love this?</p><p style="color:#fff;font-size:15px;font-weight:700;margin:0">Share the newsletter →</p></div>`) +
      footer(),
      '#f1f5f9',
    ),
  },
  {
    id: 'newsletter-tips',
    name: 'Tips & Insights',
    category: 'Newsletter',
    preview: 'linear-gradient(135deg,#10b981,#0ea5e9)',
    html: wrap(
      header('💡 3 Things Worth Knowing This Week', 'Quick insights to help you grow.', 'linear-gradient(135deg,#10b981,#0ea5e9)') +
      body(`<p>Hi {{firstName}},</p><p>Here are this week's three most useful things I found:</p>` +
        [
          { num: '01', title: 'Tip #1 Title', content: 'Describe your first insight here. Keep it practical and actionable — one thing they can do right now.' },
          { num: '02', title: 'Tip #2 Title', content: 'Your second insight. Use data, examples, or a story to make it concrete.' },
          { num: '03', title: 'Tip #3 Title', content: 'Your third insight. End with why this matters for your reader specifically.' },
        ].map(t =>
          `<div style="display:flex;gap:16px;margin-bottom:24px;align-items:flex-start"><div style="font-size:28px;font-weight:900;color:#e2e8f0;min-width:40px;line-height:1">${t.num}</div><div><h3 style="margin:0 0 4px;font-size:15px;font-weight:700;color:#0f172a">${t.title}</h3><p style="margin:0;font-size:13px;color:#64748b;line-height:1.7">${t.content}</p></div></div>`
        ).join('') +
        btn('See All Tips', '#10b981') +
        `<p>Until next week,<br/><strong>[Your Name]</strong></p>`) +
      footer(),
    ),
  },

  /* ── Follow-up ── */
  {
    id: 'followup-gentle',
    name: 'Gentle Follow-up',
    category: 'Follow-up',
    preview: '#f59e0b',
    html: wrap(
      `<div style="padding:32px 40px 0"><h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0">Just checking in, {{firstName}}</h2></div>` +
      body(`<p>I wanted to follow up on my last message about <strong>[Topic]</strong>.</p><p>Life gets busy — totally get it. I just wanted to make sure this didn't get buried.</p><div style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:0 10px 10px 0;padding:16px 20px;margin:20px 0"><p style="margin:0;font-size:14px;color:#78350f"><strong>Quick reminder:</strong> [One sentence on the value or opportunity]</p></div><p>If now's not the right time, just let me know and I'll check back in later. No pressure.</p>` +
        btn('Pick Up Where We Left Off', '#f59e0b') +
        `<p>Talk soon,<br/><strong>[Your Name]</strong></p>`) +
      footer(),
    ),
  },
  {
    id: 'followup-demo',
    name: 'Demo / Call Request',
    category: 'Follow-up',
    preview: '#6366f1',
    html: wrap(
      `<div style="padding:32px 40px 0"><h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 4px">Ready for a quick call, {{firstName}}?</h2><p style="color:#64748b;font-size:14px;margin:0">15 minutes. No pressure. Huge value.</p></div>` +
      body(`<p>Hi {{firstName}},</p><p>I'd love to show you exactly how <strong>[Product/Service]</strong> could help with [specific challenge].</p><p>Here's what we'll cover in 15 minutes:</p><ul style="padding-left:20px"><li style="margin-bottom:8px">Your current process and where the gaps are</li><li style="margin-bottom:8px">How [Product] solves [specific problem]</li><li style="margin-bottom:8px">Real results from companies like yours</li></ul><div style="background:#f5f3ff;border-radius:12px;padding:20px 24px;text-align:center;margin:20px 0"><p style="color:#6d28d9;font-size:14px;font-weight:600;margin:0 0 4px">Book a 15-minute call</p><p style="color:#8b5cf6;font-size:12px;margin:0">Choose a time that works for you</p></div>` +
        btn('Book My Spot', '#6366f1') +
        `<p>Or just reply with a day and time that works — I'll make it happen.<br/><br/>Best,<br/><strong>[Your Name]</strong></p>`) +
      footer(),
    ),
  },

  /* ── Re-engagement ── */
  {
    id: 'reengagement-miss',
    name: 'We Miss You',
    category: 'Re-engagement',
    preview: 'linear-gradient(135deg,#ec4899,#8b5cf6)',
    html: wrap(
      header('We miss you, {{firstName}} 💌', "It's been a while. Let's catch up.", 'linear-gradient(135deg,#ec4899,#8b5cf6)') +
      body(`<p>Hi {{firstName}},</p><p>We noticed you haven't been around lately, and we genuinely miss you.</p><p>A lot has changed since you last visited:</p><ul style="padding-left:20px"><li style="margin-bottom:8px">🆕 [New Feature 1] — [Brief description]</li><li style="margin-bottom:8px">🆕 [New Feature 2] — [Brief description]</li><li style="margin-bottom:8px">📈 [Improvement] — [Result or benefit]</li></ul><div style="background:#fdf2f8;border-radius:12px;padding:20px 24px;text-align:center;margin:20px 0"><p style="font-size:15px;font-weight:700;color:#be185d;margin:0 0 4px">We've prepared something special for your return</p><p style="font-size:13px;color:#9d174d;margin:0">[Describe the offer or incentive]</p></div>` +
        btn('Come Back →', '#ec4899') +
        `<p>We hope to see you soon.<br/><br/>Warmly,<br/><strong>[Your Name]</strong></p>`) +
      footer(),
    ),
  },
  {
    id: 'reengagement-offer',
    name: 'Win-Back Offer',
    category: 'Re-engagement',
    preview: '#0f172a',
    html: wrap(
      `<div style="background:#0f172a;padding:40px;text-align:center"><h1 style="color:#fff;font-size:28px;font-weight:800;margin:0 0 8px">We want you back, {{firstName}}</h1><p style="color:#94a3b8;font-size:14px;margin:0">Here's a little something to make it worth your while.</p></div>` +
      body(`<p style="text-align:center;font-size:16px;color:#0f172a">As a valued member, we're offering you:</p><div style="border:2px solid #0f172a;border-radius:16px;padding:24px;text-align:center;margin:20px 0"><p style="font-size:36px;font-weight:900;color:#0f172a;margin:0">30% OFF</p><p style="color:#64748b;font-size:13px;margin:6px 0 0">your next [purchase/subscription/order]</p></div><p style="text-align:center;color:#64748b;font-size:13px">Use code <strong style="color:#0f172a">COMEBACK30</strong> at checkout. Valid for 7 days only.</p>` +
        btn('Claim My 30% Off', '#0f172a') +
        `<p style="text-align:center;color:#94a3b8;font-size:12px">Offer expires in 7 days. Cannot be combined with other offers.</p>`) +
      footer('#64748b'),
    ),
  },

  /* ── Announcement ── */
  {
    id: 'announce-feature',
    name: 'New Feature',
    category: 'Announcement',
    preview: 'linear-gradient(135deg,#10b981,#0ea5e9)',
    html: wrap(
      header('⚡ New: [Feature Name]', 'The update you\'ve been asking for.', 'linear-gradient(135deg,#10b981,#0ea5e9)') +
      body(`<p>Hi {{firstName}},</p><p>Your feedback has been heard. Today we're rolling out <strong>[Feature Name]</strong> — and it's exactly what you asked for.</p><div style="display:grid;gap:12px;margin:20px 0">` +
        [['⚡ Faster', 'Describe the speed improvement'], ['🎯 Smarter', 'Describe the intelligence upgrade'], ['🔒 Safer', 'Describe the security improvement']].map(([icon, desc]) =>
          `<div style="background:#f0fdf4;border-radius:10px;padding:14px 18px;display:flex;gap:12px;align-items:center"><span style="font-size:20px">${icon.split(' ')[0]}</span><div><strong style="color:#0f172a;font-size:13px">${icon}</strong><p style="color:#64748b;font-size:12px;margin:2px 0 0">${desc}</p></div></div>`
        ).join('') +
        `</div>` +
        btn('Try [Feature Name] Now', '#10b981') +
        `<p>As always, let us know what you think.<br/><br/>The Team</p>`) +
      footer(),
    ),
  },
  {
    id: 'announce-event',
    name: 'Event Invitation',
    category: 'Announcement',
    preview: 'linear-gradient(135deg,#f59e0b,#ef4444)',
    html: wrap(
      `<div style="background:linear-gradient(135deg,#f59e0b,#ef4444);padding:40px;text-align:center"><p style="color:rgba(255,255,255,0.9);font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px">You're invited</p><h1 style="color:#fff;font-size:30px;font-weight:800;margin:0 0 12px">[Event Name]</h1><p style="color:rgba(255,255,255,0.9);font-size:16px;margin:0">📅 [Date] &nbsp;·&nbsp; 🕐 [Time] &nbsp;·&nbsp; 📍 [Location / Online]</p></div>` +
      body(`<p>Hi {{firstName}},</p><p>We'd love to have you join us for <strong>[Event Name]</strong>.</p><p>Here's what you can expect:</p><ul style="padding-left:20px"><li style="margin-bottom:8px">[Session or agenda item 1]</li><li style="margin-bottom:8px">[Session or agenda item 2]</li><li style="margin-bottom:8px">[Networking / bonus activity]</li></ul><div style="background:#fffbeb;border-radius:10px;padding:16px 20px;text-align:center;margin:20px 0"><p style="color:#92400e;font-size:13px;font-weight:600;margin:0">⚠️ Spots are limited — reserve yours today</p></div>` +
        btn('Reserve My Spot', '#f59e0b') +
        `<p>Can't make it? Reply and we'll send you the recording.<br/><br/>Hope to see you there,<br/><strong>[Your Name]</strong></p>`) +
      footer(),
    ),
  },

  /* ── Transactional ── */
  {
    id: 'transactional-confirm',
    name: 'Order Confirmed',
    category: 'Transactional',
    preview: '#22c55e',
    html: wrap(
      `<div style="padding:36px 40px;text-align:center;border-bottom:1px solid #f1f5f9"><div style="width:60px;height:60px;border-radius:50%;background:#dcfce7;display:inline-flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:16px">✅</div><h1 style="color:#0f172a;font-size:24px;font-weight:800;margin:0 0 4px">Order Confirmed!</h1><p style="color:#64748b;font-size:14px;margin:0">Thanks, {{firstName}}. Here are your details.</p></div>` +
      body(`<div style="background:#f8fafc;border-radius:10px;padding:20px 24px;margin-bottom:20px"><h3 style="color:#0f172a;font-size:14px;font-weight:700;margin:0 0 14px;text-transform:uppercase;letter-spacing:0.04em">Order Summary</h3><div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#64748b;font-size:13px">Product / Service</span><span style="color:#0f172a;font-size:13px;font-weight:600">[Item Name]</span></div><div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#64748b;font-size:13px">Order #</span><span style="color:#0f172a;font-size:13px;font-weight:600">#[OrderID]</span></div><div style="border-top:1px solid #e2e8f0;margin:12px 0"></div><div style="display:flex;justify-content:space-between"><span style="color:#0f172a;font-size:14px;font-weight:700">Total</span><span style="color:#0f172a;font-size:16px;font-weight:800">$[Amount]</span></div></div>` +
        btn('View Your Order', '#22c55e') +
        `<p style="text-align:center;color:#94a3b8;font-size:12px">Questions? Contact support at [email] or reply to this message.</p>`) +
      footer(),
    ),
  },
];

export const TEMPLATE_CATEGORIES = ['All', ...new Set(EMAIL_TEMPLATES.map(t => t.category))];

/* ─── EmailTemplateGallery component ─── */
export default function EmailTemplateGallery({
  onApply,
  onClose,
}: {
  onApply: (html: string) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<EmailTemplate | null>(null);

  const filtered = EMAIL_TEMPLATES.filter(t => {
    if (category !== 'All' && t.category !== category) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.category.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', zIndex: 500,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 980, height: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Email Templates</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Pick a ready-made design and customize it to fit your campaign</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}><X size={20} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: preview ? '300px 1fr' : '1fr', flex: 1, overflow: 'hidden' }}>
          {/* Left: gallery */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: preview ? '1px solid #e2e8f0' : 'none' }}>
            {/* Search + filter */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates…"
                  style={{ width: '100%', padding: '7px 12px 7px 30px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {TEMPLATE_CATEGORIES.map(c => (
                  <button key={c} onClick={() => setCategory(c)}
                    style={{ padding: '4px 10px', borderRadius: 20, border: '1px solid', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderColor: category === c ? '#6366f1' : '#e2e8f0', background: category === c ? '#6366f1' : '#fff', color: category === c ? '#fff' : '#64748b' }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Template grid */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: preview ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {filtered.map(t => {
                  const isSelected = preview?.id === t.id;
                  return (
                    <div key={t.id} onClick={() => setPreview(t === preview ? null : t)}
                      style={{ borderRadius: 10, border: `2px solid ${isSelected ? '#6366f1' : '#e2e8f0'}`, overflow: 'hidden', cursor: 'pointer', transition: 'all 0.12s', boxShadow: isSelected ? '0 0 0 3px rgba(99,102,241,0.15)' : 'none' }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = '#c4b5fd'; }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0'; }}
                    >
                      {/* Preview swatch */}
                      <div style={{ height: 90, background: t.preview, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 32 }}>{t.category === 'Welcome' ? '👋' : t.category === 'Promotional' ? '🎯' : t.category === 'Newsletter' ? '📰' : t.category === 'Follow-up' ? '📩' : t.category === 'Re-engagement' ? '💌' : t.category === 'Announcement' ? '📣' : '✅'}</span>
                        {isSelected && (
                          <div style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="10" height="8" viewBox="0 0 10 8"><path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </div>
                        )}
                        <div style={{ position: 'absolute', bottom: 6, left: 8, background: '#fff', borderRadius: 5, padding: '2px 7px', fontSize: 10, fontWeight: 600, color: '#374151' }}>
                          {t.category}
                        </div>
                      </div>
                      <div style={{ padding: '8px 10px', background: '#fff' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{t.name}</div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                          <button onClick={e => { e.stopPropagation(); setPreview(t); }}
                            style={{ padding: '3px 8px', background: '#f1f5f9', border: 'none', borderRadius: 5, fontSize: 10, color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Eye size={10} /> Preview
                          </button>
                          <button onClick={e => { e.stopPropagation(); onApply(t.html); }}
                            style={{ padding: '3px 8px', background: '#6366f1', border: 'none', borderRadius: 5, fontSize: 10, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                            Use
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: preview panel */}
          {preview && (
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{preview.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{preview.category} template</div>
                </div>
                <button onClick={() => { onApply(preview.html); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Use This Template →
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', background: '#f1f5f9', padding: '20px 16px' }}>
                <div style={{ maxWidth: 620, margin: '0 auto', background: '#fff', borderRadius: 10, boxShadow: '0 2px 16px rgba(0,0,0,0.08)', overflow: 'hidden' }}
                  dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(preview.html.replace(/{{firstName}}/g, 'John').replace(/{{email}}/g, 'john@example.com')) }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
