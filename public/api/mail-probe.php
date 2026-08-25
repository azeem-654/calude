<?php
/**
 * What can this server actually send mail through?
 *
 * On shared hosting the answer is rarely "everything". Outbound port 25 is
 * blocked almost universally, 587 very often, and some plans block every
 * outbound socket there is. None of that is visible from the browser: the
 * settings page says "connection failed" and stops, which tells you something
 * is wrong without telling you what to do instead.
 *
 * So this asks the server itself, and asks it about the routes that exist:
 *
 *   - Can it open an outbound socket at all?
 *   - Which of the mail ports get through — 587, 465, 2525, 25?
 *   - Can it reach an HTTPS mail API on 443? That port is never blocked,
 *     because blocking it would break the web.
 *   - Does it have a local `mail()` relay to fall back on?
 *
 * and then says which route to take. There is essentially always one: a host
 * that blocks every SMTP port still has 443, and every major sending service
 * has an HTTPS API behind it.
 *
 * Nothing here is guessed from the plan name or the host name. Every line of
 * the report is the result of actually trying it.
 */
header('Content-Type: application/json');
require_once __DIR__ . '/_db.php';
crm_cors();
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$data = json_decode(file_get_contents('php://input'), true) ?? [];
/* Opening outbound sockets is not something an anonymous caller gets to do. */
crm_require_session_for_socket($data['token'] ?? '');

/* A probe that hangs is a probe nobody waits for. Shared hosts drop blocked
   ports silently rather than refusing them, so the timeout *is* the result. */
const PROBE_TIMEOUT = 4;

/**
 * Try one TCP connection and report what happened, in words.
 */
function probe_port($host, $port, $ssl = false) {
    $started = microtime(true);
    $target  = ($ssl ? 'ssl://' : 'tcp://') . $host . ':' . $port;
    $ctx = stream_context_create(['ssl' => [
        'verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true, 'peer_name' => $host,
    ]]);
    $errno = 0; $errstr = '';
    $conn = @stream_socket_client($target, $errno, $errstr, PROBE_TIMEOUT, STREAM_CLIENT_CONNECT, $ctx);
    $ms = (int) round((microtime(true) - $started) * 1000);

    if (!$conn) {
        /* The distinction matters. "Refused" means something answered and said
           no — the port is reachable, the service is not there. A timeout means
           the packets went nowhere, which is what a firewall looks like. */
        $blocked = ($ms >= (PROBE_TIMEOUT * 1000) - 400) || stripos($errstr, 'timed out') !== false;
        return [
            'open'    => false,
            'ms'      => $ms,
            'reason'  => $blocked ? 'blocked' : 'refused',
            'detail'  => $errstr !== '' ? trim($errstr) : ($blocked ? 'no response before timeout' : 'connection refused'),
        ];
    }

    /* Connected — but an SMTP server that is going to talk to us says 220
       first. A transparent proxy that accepts the socket and says nothing is
       not a route to anywhere. */
    stream_set_timeout($conn, PROBE_TIMEOUT);
    $greeting = @fgets($conn, 512);
    @fwrite($conn, "QUIT\r\n");
    @fclose($conn);
    $code = (int) substr(trim((string) $greeting), 0, 3);

    return [
        'open'     => $code === 220,
        'ms'       => $ms,
        'reason'   => $code === 220 ? 'ok' : ($greeting === false ? 'no-greeting' : 'unexpected-greeting'),
        'detail'   => $greeting === false
            ? 'the socket opened but the server never said hello — usually a filtering proxy, not a mail server'
            : trim((string) $greeting),
    ];
}

/**
 * Can the server reach an HTTPS mail API?
 *
 * Only that it answers is checked — no credentials are sent, so a 401 or a 404
 * is a perfectly good result. What is being asked is whether packets on 443
 * leave the building.
 */
function probe_https($url) {
    $started = microtime(true);
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_NOBODY         => true,
            CURLOPT_TIMEOUT        => PROBE_TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => PROBE_TIMEOUT,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_USERAGENT      => 'CRM-mail-probe',
        ]);
        curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err    = curl_error($ch);
        curl_close($ch);
        $ms = (int) round((microtime(true) - $started) * 1000);
        return [
            'open'   => $status > 0,
            'ms'     => $ms,
            'status' => $status,
            'detail' => $status > 0 ? "answered HTTP {$status}" : ($err !== '' ? $err : 'no response'),
            'via'    => 'curl',
        ];
    }

    /* No cURL is unusual but not fatal — the stream wrappers can do it. */
    if (!ini_get('allow_url_fopen')) {
        return ['open' => false, 'ms' => 0, 'status' => 0, 'detail' => 'neither cURL nor allow_url_fopen is available', 'via' => 'none'];
    }
    $ctx = stream_context_create([
        'http' => ['method' => 'HEAD', 'timeout' => PROBE_TIMEOUT, 'ignore_errors' => true],
        'ssl'  => ['verify_peer' => true, 'verify_peer_name' => true],
    ]);
    $body = @file_get_contents($url, false, $ctx);
    $ms = (int) round((microtime(true) - $started) * 1000);
    $status = 0;
    if (!empty($http_response_header[0]) && preg_match('#\s(\d{3})\s#', $http_response_header[0], $m)) {
        $status = (int) $m[1];
    }
    return [
        'open'   => $status > 0 || $body !== false,
        'ms'     => $ms,
        'status' => $status,
        'detail' => $status > 0 ? "answered HTTP {$status}" : 'no response',
        'via'    => 'stream',
    ];
}

/* ── 1. What this PHP build can do at all ── */
$env = [
    'php'             => PHP_VERSION,
    'sockets'         => function_exists('stream_socket_client'),
    'curl'            => function_exists('curl_init'),
    'openssl'         => extension_loaded('openssl'),
    'allow_url_fopen' => (bool) ini_get('allow_url_fopen'),
    'mail'            => function_exists('mail') && !in_array('mail', array_map('trim', explode(',', (string) ini_get('disable_functions'))), true),
];

/* ── 2. The SMTP ports, against the relays people actually use ──
   Ports are blocked by the host, not per destination, so one reference relay
   per port answers the question. Two are tried where a port matters enough to
   be worth a second opinion. */
$portTargets = [
    ['label' => 'Brevo (587)',    'host' => 'smtp-relay.brevo.com', 'port' => 587,  'ssl' => false],
    ['label' => 'Brevo (2525)',   'host' => 'smtp-relay.brevo.com', 'port' => 2525, 'ssl' => false],
    ['label' => 'Gmail (587)',    'host' => 'smtp.gmail.com',       'port' => 587,  'ssl' => false],
    ['label' => 'Gmail (465 SSL)','host' => 'smtp.gmail.com',       'port' => 465,  'ssl' => true],
    ['label' => 'Mailjet (2525)', 'host' => 'in-v3.mailjet.com',    'port' => 2525, 'ssl' => false],
    ['label' => 'Plain SMTP (25)','host' => 'smtp-relay.brevo.com', 'port' => 25,   'ssl' => false],
];

/* The user's own server, if they have configured one — the most relevant test
   of all, and the one the settings page cannot make on their behalf. */
$ownHost = trim((string) ($data['host'] ?? ''));
$ownPort = (int) ($data['port'] ?? 0);
if ($ownHost !== '' && $ownPort > 0 && !preg_match('/[^a-z0-9\.\-]/i', $ownHost)) {
    array_unshift($portTargets, [
        'label' => "Your server ({$ownHost}:{$ownPort})",
        'host'  => $ownHost, 'port' => $ownPort, 'ssl' => $ownPort === 465,
        'own'   => true,
    ]);
}

$ports = [];
foreach ($portTargets as $t) {
    $r = probe_port($t['host'], $t['port'], $t['ssl']);
    $ports[] = $r + ['label' => $t['label'], 'host' => $t['host'], 'port' => $t['port'], 'own' => !empty($t['own'])];
}

/* ── 3. The HTTPS APIs, which is the route that survives a locked-down host ── */
$apiTargets = [
    ['label' => 'Brevo',   'url' => 'https://api.brevo.com/v3/account',   'key' => 'brevo'],
    ['label' => 'Resend',  'url' => 'https://api.resend.com/domains',     'key' => 'resend'],
    ['label' => 'Mailjet', 'url' => 'https://api.mailjet.com/v3/REST/sender', 'key' => 'mailjet'],
    ['label' => 'SMTP2GO', 'url' => 'https://api.smtp2go.com/v3/stats/email_summary', 'key' => 'smtp2go'],
];
$apis = [];
foreach ($apiTargets as $t) {
    $apis[] = probe_https($t['url']) + ['label' => $t['label'], 'key' => $t['key']];
}

/* ── 4. The verdict ──
   The ordering is deliberate: whatever the user already configured first, then
   the route with the fewest ways to go wrong. */
$openPorts   = array_values(array_filter($ports, fn($p) => $p['open']));
$openApis    = array_values(array_filter($apis,  fn($a) => $a['open']));
$ownWorks    = false;
foreach ($ports as $p) { if (!empty($p['own']) && $p['open']) { $ownWorks = true; break; } }

if ($ownWorks) {
    $route = 'smtp';
    $headline = 'Your own SMTP server is reachable from this host.';
    $advice = 'Nothing is blocking you. Save those settings and send — the Delivery check below will prove it end to end.';
} elseif ($openApis) {
    $route = 'api';
    $names = implode(', ', array_column($openApis, 'label'));
    $headline = $openPorts
        ? 'An HTTPS mail API is the most reliable route from this host.'
        : 'Every outbound SMTP port is blocked here — but the HTTPS route is open.';
    $advice = "This server can reach {$names} on port 443. Sign up for a free account with one of them, "
        . 'paste the API key into the provider settings, and mail goes out over HTTPS — the one port a host never blocks.';
} elseif ($openPorts) {
    $route = 'smtp';
    $best = $openPorts[0];
    $headline = "Port {$best['port']} is open from this host.";
    $advice = "Use a sending service on port {$best['port']} — {$best['label']} answered in {$best['ms']}ms.";
} elseif ($env['mail']) {
    $route = 'server-mail';
    $headline = 'No outbound route is open, but this host has a local mail relay.';
    $advice = 'Mail can go out through the server\'s own relay. It works, but it gives no delivery result and often lands '
        . 'in spam, because the domain has no SPF or DKIM record covering it. Worth asking your host to open port 2525.';
} else {
    $route = 'none';
    $headline = 'No sending route could be found from this host.';
    $advice = 'Every SMTP port is blocked, no HTTPS API is reachable, and there is no local mail relay. '
        . 'Ask your host to allow outbound connections on port 2525, or to allow HTTPS to api.brevo.com.';
}

echo json_encode([
    'success'  => true,
    'env'      => $env,
    'ports'    => $ports,
    'apis'     => $apis,
    'route'    => $route,
    'headline' => $headline,
    'advice'   => $advice,
    'checkedAt'=> gmdate('c'),
], JSON_UNESCAPED_SLASHES);
