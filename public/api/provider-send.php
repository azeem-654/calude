<?php
/**
 * Sending over HTTPS, from the server.
 *
 * Two separate problems are solved here, and they are worth naming because the
 * old arrangement had both.
 *
 * The first is ports. A shared host blocks outbound 25 almost always and 587
 * often, and when it does, SMTP simply cannot leave the building. Port 443 is
 * never blocked — blocking it would break the web — and every serious sending
 * service puts an HTTPS API behind it. So this is the route that works when
 * nothing else does.
 *
 * The second is that the app used to call those APIs *from the browser*. That
 * cannot work and should not work. It cannot, because none of these APIs send
 * an Access-Control-Allow-Origin header, so the browser refuses the request
 * before it is made — the send fails with "network error" and no amount of
 * checking the API key fixes it. And it should not, because the key travelled
 * from the customer's own browser, which means it sat in local storage where
 * any script on the page, any extension, and anyone who opens developer tools
 * could read it. A sending key is a licence to send as you, to anyone.
 *
 * Server-side, neither is true: there is no origin to check, and the key is
 * only ever handled between this host and the provider.
 *
 * Every provider here has a free tier that needs no card. The differences that
 * matter are noted against each one.
 */
header('Content-Type: application/json');
require_once __DIR__ . '/_db.php';
crm_cors();
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$data = json_decode(file_get_contents('php://input'), true) ?? [];
crm_require_session_for_socket($data['token'] ?? '');

/**
 * The same address rule the SMTP path uses.
 *
 * A JSON API will not let a carriage return smuggle in a second recipient the
 * way a raw socket would, but an address that is not an address is still a send
 * that gets counted and never arrives — so it is refused here for the same
 * reason, and with the same message.
 */
function crm_addr($value) {
    $value = trim((string) $value);
    if ($value === '' || strlen($value) > 254) return false;
    if (preg_match('/[\r\n\0<>,;]/', $value)) return false;
    return filter_var($value, FILTER_VALIDATE_EMAIL) ? $value : false;
}

$provider  = strtolower(trim((string) ($data['provider'] ?? '')));
$apiKey    = trim((string) ($data['apiKey'] ?? ''));
$apiSecret = trim((string) ($data['apiSecret'] ?? ''));
$domain    = trim((string) ($data['domain'] ?? ''));
$to        = trim((string) ($data['to'] ?? ''));
$subject   = (string) ($data['subject'] ?? '');
$html      = (string) ($data['html'] ?? '');
$fromName  = (string) ($data['fromName'] ?? 'CRM');
$fromEmail = trim((string) ($data['fromEmail'] ?? ''));
$replyTo   = trim((string) ($data['replyTo'] ?? ''));
$unsubUrl  = trim((string) ($data['unsubscribeUrl'] ?? ''));

$fail = function ($message, $extra = []) {
    echo json_encode(['success' => false, 'transport' => 'api', 'message' => $message] + $extra);
    exit;
};

if ($provider === '')          $fail('No provider was named.');
if ($apiKey === '')            $fail('An API key is required. Paste the one from your provider dashboard into Settings → Email & SMS.');
if ($to === '')                $fail('Recipient address is required');
if (crm_addr($to) === false)   $fail("\"{$to}\" is not a valid email address");
if ($fromEmail === '')         $fail('A sending address is required. Set one in Settings → Email & SMS.');
if (crm_addr($fromEmail) === false) $fail("\"{$fromEmail}\" is not a valid sending address.");
if ($replyTo !== '' && crm_addr($replyTo) === false) $fail("\"{$replyTo}\" is not a valid reply-to address");
if ($unsubUrl !== '' && (!filter_var($unsubUrl, FILTER_VALIDATE_URL) || preg_match('/[\r\n\0<>]/', $unsubUrl))) {
    $unsubUrl = '';
}
/* Header values must not span two lines, whichever transport carries them. */
$fromName = mb_substr(trim(str_replace(["\r", "\n", "\0"], ' ', $fromName)), 0, 120);
$subject  = mb_substr(trim(str_replace(["\r", "\n", "\0"], ' ', $subject)), 0, 300);
if ($subject === '') $subject = '(no subject)';

/**
 * One HTTPS request, with the failure modes separated.
 *
 * "Could not connect" and "the provider said no" need different answers from
 * the person reading the message, so they are never collapsed into one.
 */
function api_post($url, $headers, $body, $basicAuth = null) {
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'status' => 0, 'body' => '', 'error' => 'This server has no cURL extension, so it cannot reach an HTTPS API. Use SMTP instead, or ask your host to enable cURL.'];
    }
    $ch = curl_init($url);
    $opts = [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 25,
        CURLOPT_CONNECTTIMEOUT => 12,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_USERAGENT      => 'CRM-mailer',
    ];
    if ($basicAuth !== null) {
        $opts[CURLOPT_HTTPAUTH] = CURLAUTH_BASIC;
        $opts[CURLOPT_USERPWD]  = $basicAuth;
    }
    curl_setopt_array($ch, $opts);
    $resp   = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err    = curl_error($ch);
    curl_close($ch);

    if ($resp === false || $status === 0) {
        return ['ok' => false, 'status' => 0, 'body' => '', 'error' =>
            'Could not reach the provider over HTTPS' . ($err !== '' ? ": {$err}" : '') .
            '. Run the route check in Settings to see what this host allows.'];
    }
    return ['ok' => $status >= 200 && $status < 300, 'status' => $status, 'body' => (string) $resp, 'error' => ''];
}

/** Pull whatever the provider called its message id out of the reply. */
function api_id($body) {
    $j = json_decode($body, true);
    if (!is_array($j)) return 'sent';
    foreach (['id', 'MessageID', 'messageId', 'message_id', 'MessageId'] as $k) {
        if (!empty($j[$k]) && is_scalar($j[$k])) return (string) $j[$k];
    }
    if (!empty($j['Messages'][0]['To'][0]['MessageID'])) return (string) $j['Messages'][0]['To'][0]['MessageID'];
    if (!empty($j['data']['email_id']))                 return (string) $j['data']['email_id'];
    return 'sent';
}

/**
 * Say what the provider said, in a sentence that suggests what to do.
 *
 * A bare "HTTP 401" sends people to check their SMTP password. Naming the
 * cause — and the usual reason for it — is the difference between a support
 * ticket and a thirty-second fix.
 */
function api_error($provider, $status, $body) {
    $j = json_decode($body, true);
    $detail = '';
    if (is_array($j)) {
        foreach (['message', 'Message', 'error', 'ErrorMessage', 'detail'] as $k) {
            if (!empty($j[$k]) && is_string($j[$k])) { $detail = $j[$k]; break; }
        }
        if ($detail === '' && !empty($j['errors'][0]['message'])) $detail = (string) $j['errors'][0]['message'];
        if ($detail === '' && !empty($j['data']['error']))        $detail = (string) $j['data']['error'];
    }
    if ($detail === '') $detail = trim(mb_substr(strip_tags($body), 0, 240));

    $hint = '';
    if ($status === 401 || $status === 403) {
        $hint = ' The key was rejected — check you copied the whole thing, and that it is a sending key rather than a read-only one.';
    } elseif ($status === 422 || $status === 400) {
        $hint = ' Usually the sending address: most providers will only send from a domain you have verified with them.';
    } elseif ($status === 429) {
        $hint = ' You have hit the rate limit on your plan — wait a moment and try again.';
    }
    return ucfirst($provider) . " refused the message (HTTP {$status}). {$detail}{$hint}";
}

$fromHeader = $fromName !== '' ? "{$fromName} <{$fromEmail}>" : $fromEmail;
$reply      = $replyTo !== '' ? $replyTo : $fromEmail;
/* Gmail and Yahoo have required one-click unsubscribe on bulk mail since 2024.
   Every provider below takes custom headers, so the requirement is met on this
   route too rather than only on the SMTP one. */
$unsubHeaders = $unsubUrl !== ''
    ? ['List-Unsubscribe' => "<{$unsubUrl}>", 'List-Unsubscribe-Post' => 'List-Unsubscribe=One-Click']
    : [];

switch ($provider) {

    /* Brevo — 300 a day free, no card, and the friendliest to a shared host
       because it also offers port 2525 if SMTP ever becomes an option. */
    case 'brevo':
    case 'sendinblue': {
        $payload = [
            'sender'      => ['name' => $fromName ?: 'CRM', 'email' => $fromEmail],
            'to'          => [['email' => $to]],
            'subject'     => $subject,
            'htmlContent' => $html,
            'replyTo'     => ['email' => $reply],
        ];
        if ($unsubHeaders) $payload['headers'] = $unsubHeaders;
        $r = api_post('https://api.brevo.com/v3/smtp/email',
            ['api-key: ' . $apiKey, 'Content-Type: application/json', 'Accept: application/json'],
            json_encode($payload));
        break;
    }

    /* Resend — 3,000 a month free. Its onboarding@resend.dev sender works
       without verifying a domain, which makes it the fastest to a first send. */
    case 'resend': {
        $payload = [
            'from'     => $fromHeader,
            'to'       => [$to],
            'subject'  => $subject,
            'html'     => $html,
            'reply_to' => $reply,
        ];
        if ($unsubHeaders) $payload['headers'] = $unsubHeaders;
        $r = api_post('https://api.resend.com/emails',
            ['Authorization: Bearer ' . $apiKey, 'Content-Type: application/json'],
            json_encode($payload));
        break;
    }

    /* Mailjet — 200 a day free. Authenticates with a key *and* a secret, so a
       missing secret is called out rather than reported as a bad key. */
    case 'mailjet': {
        if ($apiSecret === '') $fail('Mailjet needs both an API key and an API secret — the secret is on the same page of your Mailjet account.');
        $msg = [
            'From'     => ['Email' => $fromEmail, 'Name' => $fromName ?: 'CRM'],
            'To'       => [['Email' => $to]],
            'Subject'  => $subject,
            'HTMLPart' => $html,
            'ReplyTo'  => ['Email' => $reply],
        ];
        if ($unsubHeaders) $msg['Headers'] = $unsubHeaders;
        $r = api_post('https://api.mailjet.com/v3.1/send',
            ['Content-Type: application/json'],
            json_encode(['Messages' => [$msg]]),
            $apiKey . ':' . $apiSecret);
        break;
    }

    /* SMTP2GO — 1,000 a month free. */
    case 'smtp2go': {
        $payload = [
            'api_key'    => $apiKey,
            'sender'     => $fromHeader,
            'to'         => [$to],
            'subject'    => $subject,
            'html_body'  => $html,
        ];
        $custom = [['header' => 'Reply-To', 'value' => $reply]];
        foreach ($unsubHeaders as $k => $v) $custom[] = ['header' => $k, 'value' => $v];
        $payload['custom_headers'] = $custom;
        $r = api_post('https://api.smtp2go.com/v3/email/send',
            ['Content-Type: application/json'],
            json_encode($payload));
        break;
    }

    /* SendGrid — 100 a day free. */
    case 'sendgrid': {
        $payload = [
            'personalizations' => [['to' => [['email' => $to]]]],
            'from'             => ['email' => $fromEmail, 'name' => $fromName ?: 'CRM'],
            'reply_to'         => ['email' => $reply],
            'subject'          => $subject,
            'content'          => [['type' => 'text/html', 'value' => $html]],
        ];
        if ($unsubHeaders) $payload['headers'] = $unsubHeaders;
        $r = api_post('https://api.sendgrid.com/v3/mail/send',
            ['Authorization: Bearer ' . $apiKey, 'Content-Type: application/json'],
            json_encode($payload));
        /* SendGrid acknowledges with 202 and an empty body. */
        break;
    }

    /* Postmark — 100 a month free, and the strictest about verified senders. */
    case 'postmark': {
        $payload = [
            'From'          => $fromHeader,
            'To'            => $to,
            'Subject'       => $subject,
            'HtmlBody'      => $html,
            'ReplyTo'       => $reply,
            'MessageStream' => 'outbound',
        ];
        if ($unsubHeaders) {
            $payload['Headers'] = [];
            foreach ($unsubHeaders as $k => $v) $payload['Headers'][] = ['Name' => $k, 'Value' => $v];
        }
        $r = api_post('https://api.postmarkapp.com/email',
            ['X-Postmark-Server-Token: ' . $apiKey, 'Content-Type: application/json', 'Accept: application/json'],
            json_encode($payload));
        break;
    }

    /* Mailgun — needs the sending domain as well as the key, and the EU region
       lives on a different host, so both are asked for rather than assumed. */
    case 'mailgun': {
        if ($domain === '') $fail('Mailgun needs the sending domain from your Mailgun dashboard as well as the API key.');
        if (preg_match('/[^a-z0-9\.\-]/i', $domain)) $fail("\"{$domain}\" is not a valid Mailgun domain.");
        $base = (stripos($apiSecret, 'eu') === 0 || stripos($domain, '.eu.') !== false)
            ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
        $form = [
            'from'     => $fromHeader,
            'to'       => $to,
            'subject'  => $subject,
            'html'     => $html,
            'h:Reply-To' => $reply,
        ];
        foreach ($unsubHeaders as $k => $v) $form['h:' . $k] = $v;
        $r = api_post("{$base}/v3/{$domain}/messages", [], http_build_query($form), 'api:' . $apiKey);
        break;
    }

    /* Mailtrap — a capture inbox for testing, not a delivery service. Mail sent
       here lands in the Mailtrap UI and reaches nobody, which is exactly what
       it is for: proving a campaign is well-formed without mailing customers. */
    case 'mailtrap': {
        $payload = [
            'from'     => ['email' => $fromEmail, 'name' => $fromName ?: 'CRM'],
            'to'       => [['email' => $to]],
            'subject'  => $subject,
            'html'     => $html,
        ];
        if ($unsubHeaders) $payload['headers'] = $unsubHeaders;
        $r = api_post('https://send.api.mailtrap.io/api/send',
            ['Authorization: Bearer ' . $apiKey, 'Content-Type: application/json'],
            json_encode($payload));
        break;
    }

    /* ActiveCampaign posts to the customer's own account subdomain, so the URL
       arrives from the browser. That makes it the one provider here where a
       hostile value would turn this endpoint into a request-forger against the
       host's own network — so the URL is matched against ActiveCampaign's two
       real domain shapes and nothing else is accepted. */
    case 'activecampaign': {
        $acUrl = rtrim(trim((string) ($data['apiUrl'] ?? '')), '/');
        if ($acUrl === '') $fail('ActiveCampaign needs your account URL, e.g. https://youraccount.api-us1.com');
        if (!preg_match('#^https://[a-z0-9][a-z0-9-]{0,62}\.(api-us\d+\.com|activehosted\.com)$#i', $acUrl)) {
            $fail("\"{$acUrl}\" is not an ActiveCampaign account URL. It looks like https://youraccount.api-us1.com — copy it from Settings → Developer in ActiveCampaign.");
        }
        $payload = ['email' => [
            'subject'  => $subject,
            'html'     => $html,
            'from'     => $fromEmail,
            'fromname' => $fromName ?: 'CRM',
            'reply_to' => $reply,
            'to'       => $to,
            'sender'   => ['name' => $fromName ?: 'CRM', 'email' => $fromEmail],
        ]];
        $r = api_post($acUrl . '/api/3/sendEmail',
            ['Api-Token: ' . $apiKey, 'Content-Type: application/json'],
            json_encode($payload));
        break;
    }

    default:
        $fail("\"{$provider}\" is not a sending provider this app knows. Choose one of: Brevo, Resend, Mailjet, SMTP2GO, SendGrid, Postmark, Mailgun, Mailtrap, ActiveCampaign.");
}

if (!empty($r['error'])) {
    echo json_encode(['success' => false, 'transport' => 'api', 'provider' => $provider, 'message' => $r['error']]);
    exit;
}

if ($r['ok']) {
    echo json_encode([
        'success'   => true,
        'transport' => 'api',
        'provider'  => $provider,
        'id'        => api_id($r['body']),
        'message'   => 'Accepted by ' . ucfirst($provider) . ' over HTTPS.',
    ]);
    exit;
}

echo json_encode([
    'success'   => false,
    'transport' => 'api',
    'provider'  => $provider,
    'status'    => $r['status'],
    'message'   => api_error($provider, $r['status'], $r['body']),
]);
