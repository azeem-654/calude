/**
 * Merge fields, as the senders fill them (lib/mergeFields.ts).
 */
import { personalise, textToHtml } from '../src/lib/mergeFields.ts';

let pass = 0; let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const biz = { myCompany: 'Sellerpass Global', website: 'https://sellerpass.example', bookingLink: 'https://app.example/book/sp', senderName: 'Sam' };
const who = { name: 'Rita Walker', company: 'Walker Brands', email: 'rita@example.com' };

eq('person fields come from the contact', personalise('Hi {{firstName}} at {{company}}', who), 'Hi Rita at Walker Brands');
eq('an edited contact is what is sent', personalise('Hi {{firstName}}', { ...who, name: 'Rita-Mae Walker' }), 'Hi Rita-Mae');
eq('business fields', personalise('From {{myCompany}}: {{bookingLink}}', who, biz), 'From Sellerpass Global: https://app.example/book/sp');
eq('a line whose business field is empty is dropped', personalise('Hello {{firstName}},\nPick a time: {{bookingLink}}\nThanks', who, { ...biz, bookingLink: '' }), 'Hello Rita,\nThanks');
eq('an unknown field is blanked, not sent as braces', personalise('Code {{discountCode}}!', who), 'Code !');
eq('paragraphs become paragraphs', textToHtml('One\n\nTwo\nlines'), '<p style="margin:0 0 14px;line-height:1.55">One</p><p style="margin:0 0 14px;line-height:1.55">Two<br>lines</p>');
eq('HTML is left alone', textToHtml('<p>Already</p>'), '<p>Already</p>');
eq('text is escaped', textToHtml('a < b & c'), '<p style="margin:0 0 14px;line-height:1.55">a &lt; b &amp; c</p>');
eq('bare links become links', textToHtml('See https://x.example/a'), '<p style="margin:0 0 14px;line-height:1.55">See <a href="https://x.example/a">https://x.example/a</a></p>');

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
