/**
 * The mail-settings paste reader (worker/src/lib/mailParse.ts), on the messy
 * shapes customers actually paste: a host's welcome email, a help page copied
 * whole, spreadsheets with and without headers, `email:password` dumps, a
 * screenshot's AI reading. No network.
 *
 *   npm run test:mailparse
 *
 * The thing most worth proving is grouping: which host, port and password
 * belong to which address. A setting attached to the wrong mailbox is worse
 * than a blank one, because it is believed and then refused.
 */
import {
  parseMailSettings, applyKnown, finalise, parseAutoconfig, providerForMx, providerForDomain,
  recordsFromAi, readSecurity, readLabel, needsLookup, SCREENSHOT_PROMPT, type MailRecord,
} from '../worker/src/lib/mailParse';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d: unknown = '') => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${n}${c ? '' : ` — ${JSON.stringify(d).slice(0, 600)}`}`); };
const by = (rs: MailRecord[], e: string) => rs.find(r => r.email === e);
const full = (rs: MailRecord[]) => rs.map(r => finalise(applyKnown(r)));

console.log('Free-form lines');
{
  const rs = parseMailSettings('john@acme.com:Secr3t!\nmary@acme.com:pa:ss:word\n');
  ok('email:password lines → one record each', rs.length === 2 && by(rs, 'john@acme.com')?.password === 'Secr3t!', rs);
  ok('a password containing ":" survives whole', by(rs, 'mary@acme.com')?.password === 'pa:ss:word', rs);
}
{
  const rs = parseMailSettings('sales@shop.co.uk  Hunter2  smtp.shop.co.uk 587  imap.shop.co.uk 993');
  const r = rs[0];
  ok('"email password smtp.host 587 imap.host 993" → hosts and ports by side', rs.length === 1 && r.password === 'Hunter2' && r.smtp.host === 'smtp.shop.co.uk' && r.smtp.port === 587 && r.imap.host === 'imap.shop.co.uk' && r.imap.port === 993, r);
}
{
  const rs = parseMailSettings('info@bakery.com password123 mail.bakery.com 465');
  const r = finalise(rs[0]);
  ok('one generic host serves both directions; 465 goes to sending only', r.smtp.host === 'mail.bakery.com' && r.imap.host === 'mail.bakery.com' && r.smtp.port === 465 && r.smtp.security === 'ssl' && r.imap.port === 993, r);
}
{
  const rs = parseMailSettings('a@x.io|p@ss w0rd|smtp.x.io|465|imap.x.io|993\nb@x.io|pw2|smtp.x.io|587|imap.x.io|143');
  ok('pipe-separated rows: a password with a space in it, ports by host', by(rs, 'a@x.io')?.password === 'p@ss w0rd' && by(rs, 'b@x.io')?.smtp.port === 587 && by(rs, 'b@x.io')?.imap.port === 143, rs);
}
{
  const rs = parseMailSettings('ceo@firm.com, 123456, smtp.firm.com');
  ok('a numeric password is the password, not a port', rs[0]?.password === '123456' && rs[0]?.smtp.host === 'smtp.firm.com', rs);
}
{
  const rs = parseMailSettings('1. tom@a.com  pass1\n2. ann@a.com  pass2\n- bob@a.com  pass3');
  ok('numbered and bulleted lists', rs.length === 3 && by(rs, 'bob@a.com')?.password === 'pass3', rs);
}
{
  const rs = parseMailSettings('x@y.com smtp.y.com:2525 STARTTLS');
  ok('"host:port" and an encryption word, no password', rs[0]?.smtp.host === 'smtp.y.com' && rs[0]?.smtp.port === 2525 && rs[0]?.smtp.security === 'tls' && !rs[0]?.password, rs);
}

console.log('\nSpreadsheets');
{
  const csv = 'Email,Password,SMTP Host,SMTP Port,IMAP Host,IMAP Port\nann@co.com,"pa,ss",smtp.co.com,465,imap.co.com,993\nben@co.com,pw2,smtp.co.com,587,imap.co.com,143\n';
  const rs = parseMailSettings(csv);
  ok('CSV with a header: two records', rs.length === 2, rs);
  ok('…a quoted password with a comma', by(rs, 'ann@co.com')?.password === 'pa,ss', rs);
  ok('…columns go to the right side', by(rs, 'ben@co.com')?.smtp.port === 587 && by(rs, 'ben@co.com')?.imap.host === 'imap.co.com' && by(rs, 'ben@co.com')?.imap.port === 143, rs);
}
{
  const tsv = 'Mailbox\tApp password\tServer\tPort\tSSL\nsupport@d.org\tabcd efgh ijkl mnop\tmail.d.org\t465\tYes\nhelp@d.org\tqrst uvwx\tmail.d.org\t465\tYes';
  const rs = parseMailSettings(tsv);
  const r = rs[0] && finalise(rs[0]);
  ok('TSV pasted from a sheet: app passwords with spaces, a "Server" column for both sides', rs.length === 2 && r?.password === 'abcd efgh ijkl mnop' && r?.smtp.host === 'mail.d.org' && r?.imap.host === 'mail.d.org' && r?.smtp.port === 465, rs);
  ok('…"SSL: Yes" reads as SSL', rs[0]?.smtp.security === 'ssl', rs[0]);
}
{
  const rs = parseMailSettings('username;password;outgoing server;incoming server\nmike@m.net;Pw!1;smtp.m.net;imap.m.net');
  ok('semicolon CSV with "username" holding the address', rs[0]?.email === 'mike@m.net' && rs[0]?.smtp.host === 'smtp.m.net' && rs[0]?.imap.host === 'imap.m.net' && rs[0]?.password === 'Pw!1', rs);
}

console.log('\nLabelled settings');
{
  const t = `SMTP server: smtp.hostinger.com  Port: 465  IMAP: imap.hostinger.com  Port: 993
Username: owner@brand.com
Password: Br4nd!pass`;
  const rs = parseMailSettings(t);
  const r = rs[0];
  ok('several pairs on one line: "SMTP server: …  Port: …  IMAP: …"', rs.length === 1 && r.email === 'owner@brand.com' && r.smtp.host === 'smtp.hostinger.com' && r.smtp.port === 465 && r.imap.host === 'imap.hostinger.com' && r.imap.port === 993, r);
  ok('…password from its label', r.password === 'Br4nd!pass', r);
}
{
  /* Google's help page, pasted: tab between label and value, ports on their own lines. */
  const t = `Incoming Mail (IMAP) Server\timap.gmail.com
Requires SSL: Yes
Port: 993
Outgoing Mail (SMTP) Server\tsmtp.gmail.com
Requires SSL: Yes
Requires TLS: Yes (if available)
Requires Authentication: Yes
Port for SSL: 465
Port for TLS/STARTTLS: 587
Full Name or Display Name\tYour name
Account Name, User name, or Email address\tjane.doe@gmail.com
Password\tYour Gmail password`;
  const rs = parseMailSettings(t);
  const r = rs[0];
  ok('Google\'s help page: one mailbox, the address from "Email address"', rs.length === 1 && r.email === 'jane.doe@gmail.com', rs);
  ok('…IMAP 993 SSL, SMTP 465 SSL', r?.imap.host === 'imap.gmail.com' && r?.imap.port === 993 && r?.smtp.host === 'smtp.gmail.com' && r?.smtp.port === 465 && r?.smtp.security === 'ssl', r);
  ok('…"Your Gmail password" is a placeholder, not a password', r && !r.password && !r.smtp.password, r);
}
{
  /* A host's welcome email: headers, prose, sections, a support address that is not a mailbox. */
  const t = `From: Hostinger <no-reply@hostinger.com>
To: owner@coolcafe.com
Subject: Your email account is ready

Hi there,

Your new mailbox info@coolcafe.com has been created. If you need help, contact support@hostinger.com.

Incoming server (IMAP)
Server: imap.hostinger.com
Port: 993
Security: SSL/TLS

Outgoing server (SMTP)
Server: smtp.hostinger.com
Port: 465
Security: SSL/TLS

Username: info@coolcafe.com
Password: the password you set in hPanel`;
  const rs = parseMailSettings(t);
  ok('welcome email: the mailbox, not the From/To headers or the support address', rs.length === 1 && rs[0].email === 'info@coolcafe.com', rs.map(r => r.email));
  const r = rs[0];
  ok('…sections give each direction its own server and port', r?.imap.host === 'imap.hostinger.com' && r?.imap.port === 993 && r?.smtp.host === 'smtp.hostinger.com' && r?.smtp.port === 465 && r?.smtp.security === 'ssl', r);
  ok('…the placeholder password is not taken', r && !r.password, r);
}
{
  const t = `Email: a@team.com
Password: one
Email: b@team.com
Password: two

Outgoing: mail.team.com:587
Incoming: mail.team.com:993`;
  const rs = parseMailSettings(t);
  ok('repeated Email/Password pairs in one block: one record each', rs.length === 2 && by(rs, 'a@team.com')?.password === 'one' && by(rs, 'b@team.com')?.password === 'two', rs);
  ok('…a settings block naming no address applies to both (same domain)', rs.every(r => r.smtp.host === 'mail.team.com' && r.smtp.port === 587 && r.imap.port === 993), rs);
}
{
  const t = `alpha@one.com:pw1
beta@two.com:pw2

SMTP: mail.one.com 465
IMAP: mail.one.com 993`;
  const rs = parseMailSettings(t);
  ok('a floating block whose host is one.com goes to the one.com address only', by(rs, 'alpha@one.com')?.smtp.host === 'mail.one.com' && !by(rs, 'beta@two.com')?.smtp.host, rs);
}
{
  const t = `a@x.com pw1
b@x.com pw2
SMTP host = smtp.provider.net
SMTP port = 587`;
  const rs = parseMailSettings(t);
  ok('settings in the same block as a list apply to every address in it', rs.length === 2 && rs.every(r => r.smtp.host === 'smtp.provider.net' && r.smtp.port === 587), rs);
}
{
  const t = 'Outgoing Server: smtp.office365.com (port 587, STARTTLS)\nIncoming: outlook.office365.com, 993, SSL\nEmail address - jo@contoso.com\nPassword - P@ss-w0rd: x';
  const rs = parseMailSettings(t);
  const r = rs[0];
  ok('values with brackets and commas; " - " as a separator', r?.email === 'jo@contoso.com' && r.smtp.host === 'smtp.office365.com' && r.smtp.port === 587 && r.smtp.security === 'tls' && r.imap.port === 993 && r.imap.security === 'ssl', r);
  ok('…a password containing ": " is kept whole', r?.password === 'P@ss-w0rd: x', r);
}
{
  const rs = parseMailSettings('POP3 server: pop.old.net\nPOP port: 995\nSMTP: smtp.old.net\nEmail: me@old.net\nPassword: x1');
  ok('POP3 settings are not taken as IMAP, and the customer is told', rs[0] && !rs[0].imap.host && rs[0].smtp.host === 'smtp.old.net' && rs[0].notes.some(n => /POP3/.test(n)), rs);
}
{
  const rs = parseMailSettings('<table><tr><td>SMTP Server</td><td>smtp.web.de</td></tr><tr><td>Port</td><td>587</td></tr><tr><td>E-Mail</td><td>k@web.de</td></tr></table>');
  ok('HTML copied from a web page', rs[0]?.email === 'k@web.de' && rs[0]?.smtp.host === 'smtp.web.de' && rs[0]?.smtp.port === 587, rs);
}
{
  const rs = parseMailSettings('Server: mail.nobody.com\nPort: 465\nUsername: apikey\nPassword: SG.xyz');
  ok('settings with no address at all: one record for the customer to finish', rs.length === 1 && !rs[0].email && rs[0].smtp.host === 'mail.nobody.com' && rs[0].smtp.username === 'apikey' && rs[0].password === 'SG.xyz', rs);
}
{
  /* cPanel's "Connect Devices" page, both its blocks, pasted whole. */
  const t = `Secure SSL/TLS Settings (Recommended)
Username:	info@site.com
Password:	Use the email account’s password.
Incoming Server:	mail.site.com
IMAP Port: 993 POP3 Port: 995
Outgoing Server:	mail.site.com
SMTP Port: 465
IMAP, POP3, and SMTP require authentication.

Non-SSL Settings (NOT Recommended)
Username:	info@site.com
Password:	Use the email account’s password.
Incoming Server:	mail.site.com
IMAP Port: 143 POP3 Port: 110
Outgoing Server:	mail.site.com
SMTP Port: 587`;
  const rs = parseMailSettings(t);
  const r = rs[0] && finalise(rs[0]);
  ok('cPanel page: one mailbox, the secure block\'s ports win, POP3 ports ignored', rs.length === 1 && r.imap.host === 'mail.site.com' && r.imap.port === 993 && r.imap.security === 'ssl' && r.smtp.port === 465 && r.smtp.security === 'ssl' && !r.password, rs);
}
{
  const rs = parseMailSettings('Name,Email,App Password\nAnn Lee,ann@gmail.com,aaaa bbbb cccc dddd\nBo Chu,bo@gmail.com,eeee ffff gggg hhhh');
  ok('a sheet with a Name column keeps names', by(rs, 'ann@gmail.com')?.name === 'Ann Lee' && by(rs, 'bo@gmail.com')?.password === 'eeee ffff gggg hhhh', rs);
}
ok('nothing in, nothing out', parseMailSettings('').length === 0 && parseMailSettings('hello there\n\nthanks').length === 0);
ok('duplicate addresses merge, first values kept', (() => { const rs = parseMailSettings('a@b.com:one\nA@B.com:two smtp.b.com'); return rs.length === 1 && rs[0].password === 'one' && rs[0].smtp.host === 'smtp.b.com'; })());

console.log('\nKnown providers and the last step');
{
  const rs = full(parseMailSettings('pat@gmail.com abcdefghijklmnop\nsam@yahoo.co.uk pw\nlee@icloud.com pw\nkim@outlook.com pw\nzed@proton.me pw'));
  const g = by(rs, 'pat@gmail.com')!;
  ok('Gmail filled from known settings, source named', g.smtp.host === 'smtp.gmail.com' && g.smtp.port === 465 && g.imap.host === 'imap.gmail.com' && /Gmail/.test(g.smtp.source) && g.provider === 'Gmail', g);
  ok('…with the app-password rule in plain words', g.notes.some(n => /app password/i.test(n)), g.notes);
  ok('Yahoo (a country domain), iCloud and Outlook too', by(rs, 'sam@yahoo.co.uk')?.smtp.host === 'smtp.mail.yahoo.com' && by(rs, 'lee@icloud.com')?.smtp.port === 587 && by(rs, 'kim@outlook.com')?.smtp.host === 'smtp-mail.outlook.com', rs);
  ok('Proton is named as not connectable, never filled with a host that cannot work', /Bridge/.test(by(rs, 'zed@proton.me')?.notes.join(' ') ?? ''), by(rs, 'zed@proton.me'));
  ok('every login defaults to the address, and the password reaches both sides', g.smtp.username === 'pat@gmail.com' && g.imap.username === 'pat@gmail.com' && g.smtp.password === 'abcdefghijklmnop' && g.imap.password === 'abcdefghijklmnop', g);
}
{
  const r = applyKnown(parseMailSettings('me@mydomain.com pw smtp.hostinger.com')[0]);
  ok('a pasted host names its provider and fills the other side', r.imap.host === 'imap.hostinger.com' && r.smtp.port === 465 && r.provider === 'Hostinger', r);
}
{
  const pasted = parseMailSettings('me@gmail.com pw smtp.gmail.com 587')[0];
  const r = finalise(applyKnown(pasted));
  ok('a pasted port beats the table\'s (587 kept, STARTTLS)', r.smtp.port === 587 && r.smtp.security === 'tls' && r.smtp.source === 'pasted', r);
}
{
  const r = finalise(parseMailSettings('SMTP: mail.a.com\nPort: 587\nSecurity: SSL\nEmail: x@a.com')[0]);
  ok('"SSL" beside 587 is corrected to STARTTLS, and said', r.smtp.security === 'tls' && r.notes.some(n => /587 uses STARTTLS/.test(n)), r);
  const r2 = finalise(parseMailSettings('x@b.com pw mail.b.com')[0]);
  ok('no port at all: the usual pairing, and said so', r2.smtp.port === 587 && r2.smtp.security === 'tls' && r2.imap.port === 993 && r2.notes.some(n => /no port was given/.test(n)), r2);
}
ok('custom domain: still needs a lookup; Gmail does not', needsLookup(parseMailSettings('a@custom.biz pw')[0]) && !needsLookup(applyKnown(parseMailSettings('a@gmail.com pw')[0])));
ok('MX → provider: Google, Microsoft 365, GoDaddy, Titan, Zoho EU region', providerForMx(['aspmx.l.google.com.'])?.id === 'google' && providerForMx(['acme-com.mail.protection.outlook.com'])?.id === 'microsoft365'
  && providerForMx(['mx1.secureserver.net'])?.id === 'godaddy' && providerForMx(['mx1.titan.email'])?.id === 'titan' && providerForMx(['mx.zoho.eu'])?.smtp.host === 'smtppro.zoho.eu');
ok('MX of an unknown host names nothing', providerForMx(['mx.someisp.example']) === null && providerForDomain('acme.com') === null);
ok('security words', readSecurity('SSL/TLS') === 'ssl' && readSecurity('STARTTLS') === 'tls' && readSecurity('Yes', 'Requires SSL') === 'ssl' && readSecurity('None') === 'none' && readSecurity('Yes (if available)', 'Requires TLS') === 'tls');
ok('labels', readLabel('Outgoing Mail (SMTP) Server')?.field === 'host' && readLabel('Outgoing Mail (SMTP) Server')?.side === 'smtp' && readLabel('Port for SSL')?.field === 'port' && readLabel('Subject') === null);

console.log('\nAutoconfig XML');
{
  const xml = `<?xml version="1.0"?><clientConfig version="1.1"><emailProvider id="example.net"><domain>example.net</domain>
<displayName>Example Mail</displayName><displayShortName>Example</displayShortName>
<incomingServer type="pop3"><hostname>pop.example.net</hostname><port>995</port><socketType>SSL</socketType><username>%EMAILADDRESS%</username></incomingServer>
<incomingServer type="imap"><hostname>imap.example.net</hostname><port>143</port><socketType>plain</socketType><username>%EMAILLOCALPART%</username></incomingServer>
<incomingServer type="imap"><hostname>imap.%EMAILDOMAIN%</hostname><port>993</port><socketType>SSL</socketType><username>%EMAILLOCALPART%</username></incomingServer>
<outgoingServer type="smtp"><hostname>smtp.example.net</hostname><port>587</port><socketType>STARTTLS</socketType><username>%EMAILADDRESS%</username></outgoingServer>
</emailProvider></clientConfig>`;
  const f = parseAutoconfig(xml, 'bob@example.net');
  ok('ISPDB XML: IMAP over SSL preferred to plain, placeholders filled, POP ignored', f?.imap?.host === 'imap.example.net' && f.imap.port === 993 && f.imap.security === 'ssl' && f.imap.username === 'local', f);
  ok('…SMTP 587 STARTTLS, provider name', f?.smtp?.host === 'smtp.example.net' && f.smtp.security === 'tls' && f.provider === 'Example', f);
  ok('…junk is no settings', parseAutoconfig('<html>404</html>', 'a@b.com') === null);
}

console.log('\nA screenshot\'s AI reading');
{
  const rs = recordsFromAi({
    text: 'Incoming server: imap.dom.com\nPort: 993\nOutgoing server: smtp.dom.com\nPort: 465',
    mailboxes: [{ email: 'Desk@Dom.com', password: '••••••', smtp: { host: 'smtp.dom.com', port: '465', security: 'SSL' }, imap: { host: 'not a host!', port: 993, security: 'ssl' } }],
  });
  const r = rs[0];
  ok('one record, the address lower-cased, the dotted password not taken', rs.length === 1 && r.email === 'desk@dom.com' && !r.password, rs);
  ok('…a field that is not a host is dropped, and the transcript fills it', r.imap.host === 'imap.dom.com' && r.smtp.port === 465 && r.smtp.source === 'screenshot', r);
  ok('…junk from the model is no record', recordsFromAi({ mailboxes: [{}] as never }).length === 0 && recordsFromAi({} as never).length === 0);
  ok('the screenshot prompt asks for JSON and forbids inventing', /JSON only/.test(SCREENSHOT_PROMPT) && /Do not invent/.test(SCREENSHOT_PROMPT));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
