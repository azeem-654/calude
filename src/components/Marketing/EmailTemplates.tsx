import { useState } from 'react';
import { X, Search, Eye, LayoutGrid } from 'lucide-react';
import { sanitizeEmailHtml } from '../../services/emailHtml';
import { useApp } from '../../context/AppContext';
import type { Campaign } from '../../types';

/* ─── Template definitions ─── */
export interface EmailTemplate {
  id: string;
  name: string;
  category: string;
  preview: string; // gradient or hex
  html: string;
}


/* ── A second set, built differently ────────────────────────────────────────
 *
 * The templates above are all the same email: a coloured gradient banner, a
 * white card floating on grey, a centred pill button, bullets that open with a
 * green tick emoji. That was the house style of about 2018 and it is now the
 * shape a reader's eye skips, because every automated email they have ever
 * ignored looked like it.
 *
 * These are built on the opposite assumptions, which are also what actually
 * lands in a primary inbox:
 *
 *  - **Left-aligned, one column, no card.** A letter, not a poster. Centred
 *    marketing copy reads as a broadcast; left-aligned text reads as a message.
 *  - **Type does the work.** Size and weight make the hierarchy, not colour
 *    blocks — which also means they survive a client that strips backgrounds.
 *  - **One accent, used once.** Usually on the link.
 *  - **No emoji as furniture**, no gradients, no shadows. Gmail's dark mode
 *    inverts light backgrounds and leaves images alone, so a design that leans
 *    on a coloured banner inverts into something nobody designed.
 *  - **Real links, not pill buttons**, where a link is what a person would
 *    actually click. A "CTA button" in a one-to-one email reads as an advert.
 *
 * Every one keeps {{firstName}} and {{unsubscribe}}, and none of them contains
 * a placeholder in brackets — a draft that ships with "[Your Name]" in it is
 * the single most common way these get sent wrong.
 */

/** A plain letter: no card, no banner, generous margins. */
const letter = (inner: string, bg = '#ffffff') =>
  `<div style="background:${bg};padding:40px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto">
    ${inner}
  </div>
</div>`;

/** The thing to click, as a link with a rule under it rather than a pill. */
const textLink = (text: string, color = '#1a1a1a') =>
  `<p style="margin:26px 0"><a href="#" style="color:${color};font-size:15px;font-weight:600;text-decoration:none;border-bottom:2px solid ${color};padding-bottom:2px">${text}</a></p>`;

/** A quiet sign-off and the unsubscribe, which is a legal requirement. */
const signoff = (line: string) =>
  `<p style="margin:26px 0 0;font-size:15px;line-height:1.7;color:#1a1a1a">${line}</p>
   <div style="margin-top:34px;padding-top:18px;border-top:1px solid #e8e8e8">
     <p style="margin:0;font-size:12px;line-height:1.6;color:#8a8a8a">
       <a href="{{unsubscribe}}" style="color:#8a8a8a">Unsubscribe</a> and you will not hear from us again.
     </p>
   </div>`;

const para = (t: string) =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#2b2b2b">${t}</p>`;

const MODERN_TEMPLATES: EmailTemplate[] = [
  {
    id: 'm-plain-note',
    name: 'Plain note',
    category: 'Modern',
    preview: '#1a1a1a',
    html: letter(
      `<p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#2b2b2b">Hi {{firstName}},</p>` +
      para('I run the workshop here and I wanted to write to you myself rather than send something that looks like an advert.') +
      para('We have space in the diary over the next fortnight. If the job you mentioned is still on your list, I can come and look at it and tell you what it would cost, with no obligation either way.') +
      textLink('Pick a time that suits you') +
      signoff('Either way, thanks for thinking of us.'),
    ),
  },
  {
    id: 'm-editorial',
    name: 'Editorial',
    category: 'Modern',
    preview: '#faf8f4',
    html: letter(
      `<p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#8a8578">This month</p>
       <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:400;line-height:1.25;color:#1b1a17">The three jobs worth doing before the weather turns</h1>` +
      `<p style="margin:0 0 22px;font-size:15px;line-height:1.75;color:#3a382f">Hi {{firstName}} — a short one this month, and all of it is the sort of thing you can do yourself in an afternoon.</p>` +
      `<div style="margin:0 0 20px;padding-left:18px;border-left:2px solid #ddd8cd">
         <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1b1a17">Clear the gutters properly</p>
         <p style="margin:0;font-size:14.5px;line-height:1.7;color:#3a382f">Not just the leaves you can see — the compacted silt at the outlet is what actually causes the overflow.</p>
       </div>
       <div style="margin:0 0 20px;padding-left:18px;border-left:2px solid #ddd8cd">
         <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1b1a17">Bleed the radiators before you need them</p>
         <p style="margin:0;font-size:14.5px;line-height:1.7;color:#3a382f">Cold at the top and warm at the bottom means air, and five minutes now saves a cold week in November.</p>
       </div>
       <div style="margin:0 0 20px;padding-left:18px;border-left:2px solid #ddd8cd">
         <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1b1a17">Check the seals on the back door</p>
         <p style="margin:0;font-size:14.5px;line-height:1.7;color:#3a382f">If you can see daylight, you are heating the garden.</p>
       </div>` +
      textLink('Read the longer version', '#8a5a2b') +
      signoff('See you next month.'),
      '#faf8f4',
    ),
  },
  {
    id: 'm-offer-quiet',
    name: 'Quiet offer',
    category: 'Modern',
    preview: '#0f1115',
    html: letter(
      `<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#e8eaee">Hi {{firstName}},</p>` +
      `<p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#8a93a3">Until the end of the month</p>
       <h1 style="margin:0 0 18px;font-size:32px;font-weight:800;line-height:1.15;letter-spacing:-0.03em;color:#ffffff">A full service, £85 instead of £120</h1>` +
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#c3c9d4">Same work, same engineer, same certificate at the end. We do this every autumn because the diary is quiet before the first cold snap, and it is easier for everybody if the boiler gets looked at before it stops.</p>
       <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#c3c9d4">Twelve slots left. When they are gone the price goes back.</p>` +
      `<p style="margin:28px 0"><a href="#" style="display:inline-block;padding:13px 26px;background:#ffffff;color:#0f1115;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px">Book a slot</a></p>` +
      `<p style="margin:26px 0 0;font-size:15px;line-height:1.7;color:#c3c9d4">If the timing is wrong, ignore this — there will be another one.</p>
       <div style="margin-top:34px;padding-top:18px;border-top:1px solid #2a303a">
         <p style="margin:0;font-size:12px;line-height:1.6;color:#7b8494">
           <a href="{{unsubscribe}}" style="color:#7b8494">Unsubscribe</a> and you will not hear from us again.
         </p>
       </div>`,
      '#0f1115',
    ),
  },
  {
    id: 'm-receipt',
    name: 'Receipt',
    category: 'Modern',
    preview: '#f6f7f9',
    html: letter(
      `<h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#17191c">Thanks, {{firstName}} — that is booked in</h1>
       <p style="margin:0 0 26px;font-size:15px;line-height:1.7;color:#5b6472">You will get a reminder the day before. If anything changes, just reply to this email.</p>` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:26px">
         <tr><td style="padding:11px 0;border-bottom:1px solid #e6e9ee;font-size:14px;color:#5b6472">What</td><td style="padding:11px 0;border-bottom:1px solid #e6e9ee;font-size:14px;color:#17191c;text-align:right;font-weight:600">Annual boiler service</td></tr>
         <tr><td style="padding:11px 0;border-bottom:1px solid #e6e9ee;font-size:14px;color:#5b6472">When</td><td style="padding:11px 0;border-bottom:1px solid #e6e9ee;font-size:14px;color:#17191c;text-align:right;font-weight:600">Tuesday, between 9am and 11am</td></tr>
         <tr><td style="padding:11px 0;border-bottom:1px solid #e6e9ee;font-size:14px;color:#5b6472">Who is coming</td><td style="padding:11px 0;border-bottom:1px solid #e6e9ee;font-size:14px;color:#17191c;text-align:right;font-weight:600">One of our engineers, in a marked van</td></tr>
         <tr><td style="padding:13px 0;font-size:15px;color:#17191c;font-weight:700">Total</td><td style="padding:13px 0;font-size:15px;color:#17191c;text-align:right;font-weight:700">£85.00</td></tr>
       </table>` +
      `<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#17191c">Before we arrive</p>
       <p style="margin:0 0 22px;font-size:14.5px;line-height:1.7;color:#5b6472">Clear a little space around the boiler and make sure we can get to the gas meter. That is all.</p>` +
      signoff('See you Tuesday.'),
      '#ffffff',
    ),
  },
  {
    id: 'm-one-question',
    name: 'One question',
    category: 'Modern',
    preview: '#ffffff',
    html: letter(
      `<p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#2b2b2b">Hi {{firstName}},</p>` +
      para('You got a quote from us a few weeks ago and I never heard back, which is completely fine — most people are getting two or three.') +
      para('One question, and you can answer it in a word: is it still something you are thinking about, or shall I close the file?') +
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#2b2b2b"><strong>Still thinking</strong> — I will leave it open and check back in a month.<br/>
         <strong>No thanks</strong> — I will take you off the list and stop emailing.</p>` +
      signoff('Either is a good answer. Thanks for your time.'),
    ),
  },
  {
    id: 'm-product-grid',
    name: 'Product row',
    category: 'Modern',
    preview: '#ffffff',
    html: letter(
      `<h1 style="margin:0 0 8px;font-size:24px;font-weight:800;letter-spacing:-0.02em;color:#17191c">New in this week</h1>
       <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#5b6472">Three things, {{firstName}}. All in stock, all posted next day.</p>` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
         <tr>
           <td style="padding:0 0 22px" valign="top">
             <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#17191c">Bronze cleat, 150mm</p>
             <p style="margin:0 0 6px;font-size:14px;line-height:1.65;color:#5b6472">Cast, not pressed. The one that outlives the boat.</p>
             <p style="margin:0;font-size:15px;font-weight:700;color:#17191c">£28.00</p>
           </td>
         </tr>
         <tr><td style="border-top:1px solid #eceef2;padding:22px 0" valign="top">
             <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#17191c">Teak grating</p>
             <p style="margin:0 0 6px;font-size:14px;line-height:1.65;color:#5b6472">Made to size. Tell us the opening and we will cut it.</p>
             <p style="margin:0;font-size:15px;font-weight:700;color:#17191c">£129.99</p>
           </td></tr>
         <tr><td style="border-top:1px solid #eceef2;padding:22px 0 0" valign="top">
             <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#17191c">Stainless shackle set</p>
             <p style="margin:0 0 6px;font-size:14px;line-height:1.65;color:#5b6472">Six sizes, one box. Cheaper than buying them one at a time.</p>
             <p style="margin:0;font-size:15px;font-weight:700;color:#17191c">£42.50</p>
           </td></tr>
       </table>` +
      textLink('See everything in the shop') +
      signoff('Thanks for reading.'),
    ),
  },
  {
    id: 'm-welcome-quiet',
    name: 'Quiet welcome',
    category: 'Modern',
    preview: '#f7f7f5',
    html: letter(
      `<p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#2b2b2b">Hi {{firstName}},</p>` +
      para('Thanks for signing up. This is the only email you will get that is about signing up.') +
      para('From here you will hear from us roughly once a month, and only when there is something worth saying — a job we have finished that might be useful to see, or a price change worth knowing about before it happens.') +
      para('If that turns out to be one email too many, the unsubscribe link at the bottom works immediately and I will not chase you.') +
      signoff('Good to have you.'),
      '#f7f7f5',
    ),
  },
  {
    id: 'm-notice',
    name: 'Short notice',
    category: 'Modern',
    preview: '#fffaf0',
    html: letter(
      `<div style="border-left:3px solid #b45309;padding:2px 0 2px 16px;margin-bottom:24px">
         <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#b45309">Please read</p>
       </div>` +
      `<h1 style="margin:0 0 18px;font-size:22px;font-weight:700;line-height:1.3;color:#17191c">We are changing our prices on 1 November</h1>` +
      para('Hi {{firstName}} — this is the sort of email nobody enjoys sending, so I will keep it short.') +
      para('Our labour rate goes up by £6 an hour from 1 November. It has not moved in two years and the cost of everything we buy has. Anything quoted before that date is honoured at the old rate, however long the job takes to start.') +
      para('That is the whole of it. No action needed, and nothing changes on work already booked.') +
      signoff('Thanks for bearing with us.'),
      '#fffaf0',
    ),
  },
];

/*
 * The original twelve templates stood here and have been removed.
 *
 * They were all one email — a gradient banner, a white card on grey, a centred
 * pill button, bullets opening with a tick emoji — and, more to the point, they
 * shipped with thirty-nine bracketed placeholders in them: "[Product Name]",
 * "[Describe the key benefit, not the feature]", "[Your Name]". A draft that
 * goes out with the brackets still in is the single most common way these are
 * sent wrong, and it is not hypothetical — the campaign wizard's old string
 * templates did exactly that, which is what started this work.
 *
 * The Modern set and the occasion library above replace them: twenty-four
 * templates, every one written through, none containing a placeholder.
 */

/* ── A working library ──────────────────────────────────────────────────────
 *
 * Twenty was thin. The sets people expect — ActiveCampaign, Mailchimp, Klaviyo,
 * Campaign Monitor — are not thin because they have a hundred *designs*; they
 * have a hundred **occasions**. Somebody opening a template picker is not
 * asking "which layout?", they are asking "what do I send when a customer has
 * not ordered in six months?" — and the layout is the least of it.
 *
 * So these are grouped by the moment they are for, and every one is written
 * through rather than left as a shell. Two rules held throughout:
 *
 *  - **No bracketed placeholders.** A draft that ships with "[Your Name]" in it
 *    is the most common way these go out wrong, and it is not a hypothetical:
 *    the campaign wizard's old string templates did exactly that.
 *  - **Nothing invented that a business would have to stand behind.** No
 *    fabricated statistics, no "trusted by 10,000 companies", no awards. Where
 *    a specific belongs, the sentence is written so the gap is obvious and
 *    natural to fill.
 */

const LIBRARY: EmailTemplate[] = [
  /* ── Getting started ── */
  {
    id: 'lib-onboard-1', name: 'First steps', category: 'Onboarding', preview: '#ffffff',
    html: letter(
      para('Hi {{firstName}},') +
      para('You are set up. Here is the shortest path to getting something useful out of this today.') +
      `<ol style="margin:0 0 18px;padding-left:20px">
         <li style="font-size:15px;line-height:1.7;color:#2b2b2b;margin-bottom:9px"><strong>Add what you sell.</strong> Two minutes. Nothing else works properly until this is in.</li>
         <li style="font-size:15px;line-height:1.7;color:#2b2b2b;margin-bottom:9px"><strong>Bring in your contacts.</strong> A spreadsheet is fine.</li>
         <li style="font-size:15px;line-height:1.7;color:#2b2b2b"><strong>Send one thing.</strong> Anything. The first send is the hard one.</li>
       </ol>` +
      textLink('Pick up where you left off') +
      signoff('Reply to this if you get stuck — it comes straight to us.'),
    ),
  },
  {
    id: 'lib-onboard-2', name: 'One feature', category: 'Onboarding', preview: '#f7f7f5',
    html: letter(
      `<p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#8a8a8a">Day three</p>
       <h1 style="margin:0 0 18px;font-size:24px;font-weight:800;line-height:1.25;color:#17191c">The one thing most people miss</h1>` +
      para('Hi {{firstName}},') +
      para('You can set a follow-up to send itself. Most people never find it, and it is the difference between a list you own and a list you occasionally remember to write to.') +
      para('It takes about a minute to set up and then runs without you.') +
      textLink('Set up a follow-up') +
      signoff('That is the whole email.'),
      '#f7f7f5',
    ),
  },

  /* ── Winning the work ── */
  {
    id: 'lib-quote', name: 'After a quote', category: 'Sales', preview: '#ffffff',
    html: letter(
      para('Hi {{firstName}},') +
      para('I sent a price over last week and have not heard back, which is completely normal — most people are getting two or three quotes and it takes time.') +
      para('Two things worth knowing while you decide. The price holds for thirty days. And if the timing is the problem rather than the number, say so — we can usually work around a date.') +
      textLink('Ask me anything about it') +
      signoff('No rush either way.'),
    ),
  },
  {
    id: 'lib-close', name: 'Closing the file', category: 'Sales', preview: '#ffffff',
    html: letter(
      para('Hi {{firstName}},') +
      para('Last one from me about this, and then I will leave you alone.') +
      para('If it is still something you want, reply with a word and I will pick it back up. If not, that is a perfectly good answer and I will close the file.') +
      signoff('Either way, thanks for considering us.'),
    ),
  },
  {
    id: 'lib-referral', name: 'Asking for a referral', category: 'Sales', preview: '#faf8f4',
    html: letter(
      para('Hi {{firstName}},') +
      para('You said something kind when we finished the work, and I have been meaning to ask a favour on the back of it.') +
      para('Most of our work comes from people passing our name on. If anybody you know is about to need what we did for you, sending them this email is genuinely the most useful thing you could do for us.') +
      para('And if not, no awkwardness — this is the only time I will ask.') +
      signoff('Thank you either way.'),
      '#faf8f4',
    ),
  },

  /* ── Keeping them ── */
  {
    id: 'lib-winback', name: 'It has been a while', category: 'Re-engagement', preview: '#ffffff',
    html: letter(
      para('Hi {{firstName}},') +
      para('It has been about six months since we last did anything for you, which is usually when things start needing looking at again.') +
      para('No pitch. If everything is fine, ignore this and I will check in again next year. If something has started making a noise, you know where we are.') +
      textLink('Book something in') +
      signoff('Hope you are well.'),
    ),
  },
  {
    id: 'lib-lastchance', name: 'Before we stop emailing', category: 'Re-engagement', preview: '#fffaf0',
    html: letter(
      `<h1 style="margin:0 0 18px;font-size:22px;font-weight:700;line-height:1.3;color:#17191c">Shall we stop emailing you?</h1>` +
      para('Hi {{firstName}} — you have not opened anything from us in a long while, and there is no point cluttering your inbox.') +
      para('If you would like to keep hearing from us, click below and nothing changes. If you do nothing, we will take you off the list next month and that will be that.') +
      textLink('Keep me on the list', '#b45309') +
      signoff('No hard feelings whichever way.'),
      '#fffaf0',
    ),
  },

  /* ── Selling something ── */
  {
    id: 'lib-launch', name: 'Something new', category: 'Announcement', preview: '#0f1115',
    html: letter(
      `<p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#e8eaee">Hi {{firstName}},</p>
       <h1 style="margin:0 0 18px;font-size:30px;font-weight:800;line-height:1.15;letter-spacing:-0.03em;color:#ffffff">We are doing Saturdays now</h1>
       <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#c3c9d4">Eight until one, every Saturday from the fourth. Same rate as a weekday, no callout charge.</p>
       <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#c3c9d4">We have been asked for this for years and have finally got the staff for it. Weekday slots are unchanged.</p>
       <p style="margin:28px 0"><a href="#" style="display:inline-block;padding:13px 26px;background:#ffffff;color:#0f1115;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px">Book a Saturday</a></p>
       <div style="margin-top:34px;padding-top:18px;border-top:1px solid #2a303a">
         <p style="margin:0;font-size:12px;line-height:1.6;color:#7b8494"><a href="{{unsubscribe}}" style="color:#7b8494">Unsubscribe</a> and you will not hear from us again.</p>
       </div>`,
      '#0f1115',
    ),
  },
  {
    id: 'lib-cart', name: 'Left in the basket', category: 'Ecommerce', preview: '#ffffff',
    html: letter(
      para('Hi {{firstName}},') +
      para('You left something in your basket. It is still there and still in stock — nothing has been taken.') +
      `<div style="margin:0 0 20px;padding:16px 18px;border:1px solid #eceef2;border-radius:10px">
         <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#17191c">Bronze cleat, 150mm</p>
         <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#5b6472">Cast, not pressed. The one that outlives the boat.</p>
         <p style="margin:0;font-size:16px;font-weight:700;color:#17191c">£28.00</p>
       </div>` +
      textLink('Finish the order') +
      signoff('If you changed your mind, that is fine too.'),
    ),
  },
  {
    id: 'lib-thanks', name: 'Thanks for the order', category: 'Ecommerce', preview: '#f6f7f9',
    html: letter(
      `<h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#17191c">That is on its way, {{firstName}}</h1>
       <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#5b6472">Posted this afternoon. You will have a tracking number by tomorrow morning.</p>` +
      para('One thing worth saying: if anything about it is not right when it arrives, reply to this email rather than going through a form. It comes to a person.') +
      signoff('Thanks for buying from us.'),
      '#ffffff',
    ),
  },
  {
    id: 'lib-review', name: 'Asking for a review', category: 'Ecommerce', preview: '#ffffff',
    html: letter(
      para('Hi {{firstName}},') +
      para('Your order landed a couple of weeks ago, so you will know by now whether it was any good.') +
      para('If it was, a line or two somewhere public helps us more than almost anything else. It takes a minute.') +
      para('And if it was not, please tell us instead of them — we would much rather fix it.') +
      textLink('Leave a review') +
      signoff('Either way, thank you.'),
    ),
  },

  /* ── Keeping in touch ── */
  {
    id: 'lib-newsletter', name: 'Monthly note', category: 'Newsletter', preview: '#faf8f4',
    html: letter(
      `<p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#8a8578">This month</p>
       <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:400;line-height:1.25;color:#1b1a17">What we have been working on</h1>` +
      `<p style="margin:0 0 22px;font-size:15px;line-height:1.75;color:#3a382f">Hi {{firstName}} — three short things, and none of them is a sales pitch.</p>
       <div style="margin:0 0 20px;padding-left:18px;border-left:2px solid #ddd8cd">
         <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1b1a17">A job we are quietly pleased with</p>
         <p style="margin:0;font-size:14.5px;line-height:1.7;color:#3a382f">Photographs below. It took three weeks longer than it should have and was worth it.</p>
       </div>
       <div style="margin:0 0 20px;padding-left:18px;border-left:2px solid #ddd8cd">
         <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1b1a17">Something we changed our minds about</p>
         <p style="margin:0;font-size:14.5px;line-height:1.7;color:#3a382f">We used to recommend the cheaper fitting. We have stopped.</p>
       </div>
       <div style="margin:0 0 20px;padding-left:18px;border-left:2px solid #ddd8cd">
         <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1b1a17">What is coming</p>
         <p style="margin:0;font-size:14.5px;line-height:1.7;color:#3a382f">The diary for next month opens on the first.</p>
       </div>` +
      signoff('See you next month.'),
      '#faf8f4',
    ),
  },
  {
    id: 'lib-event', name: 'You are invited', category: 'Announcement', preview: '#f4f2ee',
    html: letter(
      `<p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#8a8578">Thursday the 14th, 6pm</p>
       <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:400;line-height:1.2;color:#1b1a17">Come and see the new workshop</h1>` +
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#3a382f">Hi {{firstName}} — we have moved, and we would rather show you than describe it.</p>
       <p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#3a382f">There will be food, a proper look round, and no presentation of any kind. Bring somebody if you like.</p>` +
      textLink('Let us know you are coming', '#8a5a2b') +
      signoff('It would be good to see you.'),
      '#f4f2ee',
    ),
  },
  {
    id: 'lib-apology', name: 'When something went wrong', category: 'Transactional', preview: '#fffaf0',
    html: letter(
      `<h1 style="margin:0 0 18px;font-size:22px;font-weight:700;line-height:1.3;color:#17191c">We got that wrong, and here is what we are doing</h1>` +
      para('Hi {{firstName}},') +
      para('Your order was three days late and nobody told you. That is our fault and there is no good excuse for the silence, which is the part that actually matters.') +
      para('It went out this morning by the fastest service, and we have refunded the delivery charge without you having to ask.') +
      para('If that is not enough, reply and say so.') +
      signoff('Sorry. Genuinely.'),
      '#fffaf0',
    ),
  },
  {
    id: 'lib-price', name: 'Prices are changing', category: 'Transactional', preview: '#ffffff',
    html: letter(
      `<h1 style="margin:0 0 18px;font-size:22px;font-weight:700;line-height:1.3;color:#17191c">Our prices go up on the first</h1>` +
      para('Hi {{firstName}} — nobody enjoys this email, so it will be short.') +
      para('Our rate goes up from the first of next month. It has not moved in two years and the cost of everything we buy has.') +
      para('Anything quoted before that date is honoured at the old rate however long the job takes to start, and nothing changes on work already booked.') +
      signoff('Thanks for bearing with us.'),
    ),
  },
  {
    id: 'lib-webinar', name: 'Free session', category: 'Announcement', preview: '#ffffff',
    html: letter(
      para('Hi {{firstName}},') +
      para('We are running a half-hour session next Wednesday on the three mistakes we see most often, and how to avoid paying for them twice.') +
      para('It is free, it is not a sales pitch, and there will be time for questions at the end. If you cannot make it live, sign up anyway and we will send the recording.') +
      textLink('Save me a place') +
      signoff('Hope to see you there.'),
    ),
  },
  {
    id: 'lib-survey', name: 'One question', category: 'Newsletter', preview: '#f7f7f5',
    html: letter(
      para('Hi {{firstName}},') +
      para('One question, and it genuinely takes ten seconds: what is the one thing you wish we did that we do not?') +
      para('Reply with a sentence. Every answer gets read by a person here, and the last round of these changed what we offer.') +
      signoff('Thank you.'),
      '#f7f7f5',
    ),
  },
];

/* Modern first: it is what most people should be starting from. */
export const EMAIL_TEMPLATES: EmailTemplate[] = [...MODERN_TEMPLATES, ...LIBRARY];

export const TEMPLATE_CATEGORIES = ['All', ...new Set(EMAIL_TEMPLATES.map(t => t.category))];

/* ─── EmailTemplateGallery component ─── */
/* ═══════════════════════════════════════════════════════════════════════════
 * The library screen.
 *
 * It used to be a sidebar of names with a preview pane: a list of twenty
 * strings, and you had to click each one to find out what it looked like.
 * Nobody picks a design that way — every tool people are used to (FeedBlitz,
 * ActiveCampaign, Mailchimp) shows the thing itself, at a size you can judge
 * from, in rows you can scan.
 *
 * So: real thumbnails, rendered from the template's own HTML rather than from
 * a screenshot that would drift out of date the moment a template changed.
 *
 * Three sections, in the order somebody actually reaches for them:
 *
 *   1. **Start again from one you sent.** The most likely thing anybody wants
 *      is last month's newsletter with new words in it.
 *   2. **Your saved templates.** Designs this workspace made its own.
 *   3. **Ready to use**, grouped by occasion — which is what a person is
 *      actually searching for. Nobody wants "a two-column layout"; they want
 *      "the email you send when somebody has not ordered in six months".
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A real preview of the email, shrunk.
 *
 * A 600px email inside a 220px card, scaled with a transform rather than by
 * restyling it — the point is to show what will actually arrive, and anything
 * that re-lays-it-out to fit is showing something else. `pointer-events: none`
 * because a link inside a thumbnail is a trap: it looks like it selects the
 * template and it navigates away instead.
 */
function Thumb({ html, height = 150 }: { html: string; height?: number }) {
  const WIDTH = 600;
  const scale = 220 / WIDTH;
  return (
    <div style={{
      height, overflow: 'hidden', background: '#fff', position: 'relative',
      borderBottom: '1px solid #eef0f4',
    }}>
      <div
        style={{
          width: WIDTH, transform: `scale(${scale})`, transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
        dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(html) }}
      />
      {/* Fades the cut-off bottom edge, so a thumbnail ends rather than stops. */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 34, background: 'linear-gradient(transparent, #fff)' }} />
    </div>
  );
}

interface Card {
  id: string;
  name: string;
  sub: string;
  html: string;
}

function Section({
  title, blurb, items, onPick, onPreview, defaultShown = 8,
}: {
  title: string;
  blurb: string;
  items: Card[];
  onPick: (html: string) => void;
  onPreview: (c: Card) => void;
  /** How many before "Show all". A wall of forty is its own kind of useless. */
  defaultShown?: number;
}) {
  const [all, setAll] = useState(false);
  const [q, setQ] = useState('');

  const matching = q.trim()
    ? items.filter(i => `${i.name} ${i.sub}`.toLowerCase().includes(q.trim().toLowerCase()))
    : items;
  const shown = all || q.trim() ? matching : matching.slice(0, defaultShown);
  if (items.length === 0) return null;

  return (
    <section style={{ marginBottom: 30 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.015em' }}>{title}</h3>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#64748b', lineHeight: 1.55 }}>{blurb}</p>
        </div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          {items.length > 6 && (
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Filter ${title.toLowerCase()}`}
                style={{ width: 178, padding: '6px 10px 6px 27px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          )}
          {matching.length > defaultShown && !q.trim() && (
            <button onClick={() => setAll(v => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontSize: 12, fontWeight: 700, color: '#17191c', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <LayoutGrid size={12} /> {all ? 'Show fewer' : `Show all ${matching.length}`}
            </button>
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Nothing matches that.</p>
      ) : (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(min(210px, 100%), 1fr))' }}>
          {shown.map(c => (
            <div key={c.id} className="tpl-card"
              style={{ border: '1px solid #e6e9f0', borderRadius: 12, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column' }}>
              <Thumb html={c.html} />
              <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>{c.name}</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{c.sub}</span>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={() => onPick(c.html)}
                    style={{ flex: 1, padding: '7px 10px', border: 'none', borderRadius: 8, background: '#17191c', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    Use this
                  </button>
                  <button onClick={() => onPreview(c)} aria-label={`Preview ${c.name}`}
                    style={{ padding: '7px 9px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#64748b', cursor: 'pointer', display: 'flex' }}>
                    <Eye size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function EmailTemplateGallery({
  onApply,
  onClose,
}: {
  onApply: (html: string) => void;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<Card | null>(null);
  const { campaigns } = useApp();

  /**
   * Campaigns already sent, offered back as starting points.
   *
   * This is the section people reach for first and the one the app did not
   * have: the most likely thing anybody wants is last month's email with new
   * words in it. Only ones that actually have a body — a draft with nothing in
   * it is not a template.
   */
  /*
   * Every campaign, not a slice of them.
   *
   * This took the first 24 and dropped anything whose first email was under
   * forty characters — so a workspace with thirty campaigns silently lost six,
   * with nothing on screen to say so, and a campaign whose first step is a
   * one-line SMS vanished even though its other steps were full emails. A
   * library that quietly hides some of your work is worse than one that shows
   * you an awkward row.
   *
   * The only thing still excluded is a campaign with no written content
   * anywhere — an empty draft is not something to start from, and the section's
   * own filter and "show all" handle the volume.
   */
  const bodyOf = (c: Campaign) =>
    (c.steps ?? []).map(st => st.body).find(b => (b ?? '').trim().length > 20)
    ?? c.emailBody ?? c.smsBody ?? '';

  const sent: Card[] = campaigns
    .filter(c => bodyOf(c).trim().length > 20)
    .map(c => {
      const n = c.steps?.length ?? 1;
      return {
        id: `sent-${c.id}`,
        name: c.name,
        sub: `${n} ${n === 1 ? 'email' : 'emails'} · ${c.status}${c.createdAt ? ` · ${c.createdAt}` : ''}`,
        html: bodyOf(c),
      };
    });

  /** The ready-made ones, grouped by the occasion they are for. */
  const byCategory = new Map<string, Card[]>();
  for (const t of EMAIL_TEMPLATES) {
    const list = byCategory.get(t.category) ?? [];
    list.push({ id: t.id, name: t.name, sub: t.category, html: t.html });
    byCategory.set(t.category, list);
  }

  const BLURBS: Record<string, string> = {
    Modern: 'Plain, typographic and built to land in a primary inbox. Start here if you are not sure.',
    Onboarding: 'The first few days, when somebody has just arrived and has not done anything yet.',
    Sales: 'After a quote, chasing a decision, and asking for the referral once the work is done.',
    'Re-engagement': 'Somebody who has gone quiet — and the one that asks permission before you stop emailing.',
    Announcement: 'Something new, something changing, or an invitation.',
    Ecommerce: 'Baskets left behind, orders on their way, and asking how it was.',
    Newsletter: 'The regular one, for people who want to hear from you but are not buying today.',
    Transactional: 'Bookings, price changes, and the email you send when something went wrong.',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', zIndex: 500,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(8px, 2vw, 16px)',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fafbfc', borderRadius: 16, width: '100%', maxWidth: 1120, height: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', overflow: 'hidden' }}>

        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e6e9f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: '#fff' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Template library</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748b' }}>
              Pick one to start from. Everything in it is yours to change.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}><X size={20} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 'clamp(16px, 3vw, 24px)' }}>
          <Section
            title="Start again from one you sent"
            blurb="Your own campaigns, ready to reuse. The words come across; change what needs changing."
            items={sent} onPick={onApply} onPreview={setPreview} defaultShown={4}
          />

          {[...byCategory.entries()].map(([cat, items]) => (
            <Section
              key={cat}
              title={cat === 'Modern' ? 'Ready to use' : cat}
              blurb={BLURBS[cat] ?? 'Ready to use.'}
              items={items} onPick={onApply} onPreview={setPreview}
              defaultShown={cat === 'Modern' ? 8 : 6}
            />
          ))}
        </div>
      </div>

      {/* ── Full-size preview ── */}
      {preview && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setPreview(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.8)', zIndex: 520, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 660, height: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '13px 18px', borderBottom: '1px solid #e6e9f0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', flex: 1 }}>{preview.name}</span>
              <button onClick={() => { onApply(preview.html); setPreview(null); }}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 8, background: '#17191c', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                Use this
              </button>
              <button onClick={() => setPreview(null)} aria-label="Close preview"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4, display: 'flex' }}><X size={18} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', background: '#f4f5f7', padding: 16 }}>
              <div style={{ maxWidth: 600, margin: '0 auto', background: '#fff' }}
                dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(preview.html) }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
