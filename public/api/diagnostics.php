<?php
/**
 * diagnostics.php — what this server can actually do, reported in full.
 *
 * The connection tests elsewhere answer "did it work?". This one answers "how
 * far did it get, and what exactly did the server say", because that is the
 * only thing that tells you whether a failure is a wrong password, a blocked
 * port, a certificate that does not match, or a missing PHP extension.
 *
 * POST JSON: { token,
 *              smtp?: { host, port, encryption, username, password },
 *              imap?: { host, port, encryption, username, password, folder } }
 *
 * Returns:   { success, checks:[{id,label,status,detail}], report }
 *   status is one of pass | fail | warn | skip.
 *   `report` is the same information as plain text, for pasting into a bug
 *   report — it is assembled here so that what the user copies is exactly what
 *   the server saw.
 *
 * Passwords are never echoed, in either form. Everything else — host, port,
 * username, the server's own replies — is included, because withholding it is
 * what makes these failures so hard to diagnose in the first place.
 */
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: {$origin}");
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Vary: Origin');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

require_once __DIR__ . '/_db.php';

$d = json_decode(file_get_contents('php://input'), true) ?? [];
/* Same gate as the other socket-opening endpoints: this one reports the PHP
   build and what the host can reach, which is reconnaissance in the wrong
   hands. */
crm_require_session_for_socket($d['token'] ?? '');

$checks = [];
function chk($id, $label, $status, $detail = '') {
    global $checks;
    $checks[] = ['id' => $id, 'label' => $label, 'status' => $status, 'detail' => (string)$detail];
}

/* ── 1. The PHP build ────────────────────────────────────────────────────── */
chk('php_version', 'PHP version', version_compare(PHP_VERSION, '7.4', '>=') ? 'pass' : 'fail', PHP_VERSION);

$wanted = [
    'openssl'    => 'required for TLS on SMTP and IMAP',
    'imap'       => 'required to read the inbox in Conversations',
    'curl'       => 'used by the publishing and Stripe endpoints',
    'mbstring'   => 'used for header encoding',
    'pdo_mysql'  => 'one of the two supported stores',
    'pdo_sqlite' => 'the other supported store',
];
foreach ($wanted as $ext => $why) {
    $on = extension_loaded($ext);
    /* Only openssl is fatal on its own. A store is fatal only if *both* are
       missing, which is checked separately below. */
    $status = $on ? 'pass' : ($ext === 'openssl' ? 'fail' : 'warn');
    chk("ext_{$ext}", "PHP extension: {$ext}", $status, $on ? 'loaded' : "not loaded — {$why}");
}
if (!extension_loaded('pdo_mysql') && !extension_loaded('pdo_sqlite')) {
    chk('ext_pdo', 'A database driver', 'fail', 'Neither pdo_mysql nor pdo_sqlite is loaded, so no store can be opened.');
}
chk('imap_open', 'imap_open() callable', function_exists('imap_open') ? 'pass' : 'fail',
    function_exists('imap_open') ? 'yes' : 'no — Conversations cannot read a live inbox');
chk('php_mail', 'mail() available', function_exists('mail') ? 'pass' : 'warn',
    function_exists('mail') ? 'yes — used as a fallback when SMTP cannot connect' : 'no fallback if SMTP fails');
chk('allow_url_fopen', 'Outbound sockets permitted', ini_get('allow_url_fopen') ? 'pass' : 'warn',
    ini_get('allow_url_fopen') ? 'allow_url_fopen is on' : 'allow_url_fopen is off');

/* ── 2. This installation ────────────────────────────────────────────────── */
chk('config', 'api/config.php present', crm_is_configured() ? 'pass' : 'fail',
    crm_is_configured() ? 'yes' : 'no — run the setup wizard; without it the server has no database credentials');
chk('data_writable', 'api/data/ writable', crm_store_writable() ? 'pass' : 'fail',
    crm_store_writable() ? crm_store_dir() : crm_store_dir() . ' is not writable — set it to 755 in your file manager');
chk('accounts', 'Owner account exists', crm_has_accounts() ? 'pass' : 'warn',
    crm_has_accounts() ? 'yes' : 'no account yet — the socket endpoints are open until one is created');

/* ── 3. SMTP, one stage at a time ────────────────────────────────────────── */
function dg_read($conn) {
    $buf = '';
    while ($line = fgets($conn, 1024)) {
        $buf .= $line;
        if (isset($line[3]) && $line[3] === ' ') break;
    }
    return trim($buf);
}
function dg_code($r) { return (int)substr(trim($r), 0, 3); }

$smtp = $d['smtp'] ?? null;
if (!$smtp || !trim($smtp['host'] ?? '')) {
    chk('smtp', 'SMTP', 'skip', 'No SMTP host given — save the SMTP settings first.');
} else {
    $host = trim($smtp['host']);
    $port = intval($smtp['port'] ?? 587);
    $enc  = $smtp['encryption'] ?? 'tls';
    $user = trim($smtp['username'] ?? '');
    $pass = (string)($smtp['password'] ?? '');

    /* An address literal needs no lookup. gethostbyname() hands back what it
       was given both for "this is already an IP" and for "this name does not
       resolve", so without the literal check every IP-configured server is
       told its DNS is broken. */
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        chk('smtp_dns', "DNS: {$host}", 'pass', 'an address literal — no lookup needed');
    } else {
        $ip = @gethostbyname($host);
        chk('smtp_dns', "DNS: {$host}", ($ip && $ip !== $host) ? 'pass' : 'fail',
            ($ip && $ip !== $host) ? $ip : 'does not resolve from this server');
    }

    $ctx = stream_context_create(['ssl' => [
        'verify_peer' => true, 'verify_peer_name' => true,
        'allow_self_signed' => false, 'SNI_enabled' => true, 'peer_name' => $host,
    ]]);
    $wrapper = $enc === 'ssl' ? "ssl://{$host}" : $host;
    $t0 = microtime(true);
    $conn = @stream_socket_client("{$wrapper}:{$port}", $errno, $errstr, 12, STREAM_CLIENT_CONNECT, $ctx);
    $ms = (int)round((microtime(true) - $t0) * 1000);

    if (!$conn) {
        chk('smtp_connect', "TCP connect {$host}:{$port}", 'fail',
            ($errstr ?: "error {$errno}") . " (after {$ms} ms) — usually an outbound firewall on this port");
    } else {
        chk('smtp_connect', "TCP connect {$host}:{$port}", 'pass', "{$ms} ms" . ($enc === 'ssl' ? ', TLS established' : ''));
        stream_set_timeout($conn, 12);

        $greeting = dg_read($conn);
        chk('smtp_greeting', 'Server greeting', dg_code($greeting) === 220 ? 'pass' : 'fail', $greeting);

        if (dg_code($greeting) === 220) {
            fwrite($conn, "EHLO diagnostics\r\n");
            $ehlo = dg_read($conn);
            chk('smtp_ehlo', 'EHLO', dg_code($ehlo) === 250 ? 'pass' : 'fail', $ehlo);

            $ready = true;
            if ($enc === 'tls') {
                fwrite($conn, "STARTTLS\r\n");
                $st = dg_read($conn);
                if (dg_code($st) !== 220) {
                    chk('smtp_starttls', 'STARTTLS', 'fail', $st . ' — the connection would stay in the clear, so the password is not sent');
                    $ready = false;
                } elseif (!@stream_socket_enable_crypto($conn, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    chk('smtp_starttls', 'TLS handshake', 'fail', 'the certificate could not be verified — try SSL on port 465, or check the host name matches the certificate');
                    $ready = false;
                } else {
                    chk('smtp_starttls', 'STARTTLS + handshake', 'pass', $st);
                    fwrite($conn, "EHLO diagnostics\r\n");
                    dg_read($conn);
                }
            } else {
                chk('smtp_starttls', 'STARTTLS', 'skip', $enc === 'ssl' ? 'not needed — implicit TLS on connect' : 'encryption set to none');
            }

            if ($ready && $user !== '' && $pass !== '') {
                fwrite($conn, "AUTH LOGIN\r\n");
                $ap = dg_read($conn);
                if (dg_code($ap) === 334) {
                    fwrite($conn, base64_encode($user) . "\r\n"); dg_read($conn);
                    fwrite($conn, base64_encode($pass) . "\r\n");
                    $ar = dg_read($conn);
                } else {
                    fwrite($conn, 'AUTH PLAIN ' . base64_encode("\0{$user}\0{$pass}") . "\r\n");
                    $ar = dg_read($conn);
                }
                chk('smtp_auth', "AUTH as {$user}", dg_code($ar) === 235 ? 'pass' : 'fail', $ar);
            } elseif ($ready) {
                chk('smtp_auth', 'AUTH', 'skip', 'no username or password saved');
            }
        }
        @fwrite($conn, "QUIT\r\n");
        @fclose($conn);
    }
}

/* ── 4. IMAP ─────────────────────────────────────────────────────────────── */
$imap = $d['imap'] ?? null;
if (!function_exists('imap_open')) {
    chk('imap', 'IMAP', 'skip', 'The PHP IMAP extension is not loaded, so no mailbox test is possible.');
} elseif (!$imap || !trim($imap['host'] ?? '')) {
    chk('imap', 'IMAP', 'skip', 'No IMAP host given — save the incoming-mail settings first.');
} else {
    $ihost = trim($imap['host']);
    $iport = intval($imap['port'] ?? 993);
    $ienc  = $imap['encryption'] ?? 'ssl';
    $iuser = trim($imap['username'] ?? '');
    $ipass = (string)($imap['password'] ?? '');
    $ifold = $imap['folder'] ?: 'INBOX';

    $flags = '/imap' . ($ienc === 'ssl' ? '/ssl' : ($ienc === 'tls' ? '/tls' : '/notls')) . '/validate-cert';
    $mbox  = '{' . $ihost . ':' . $iport . $flags . '}' . $ifold;

    $t0 = microtime(true);
    $mb = @imap_open($mbox, $iuser, $ipass, 0, 1);
    $ms = (int)round((microtime(true) - $t0) * 1000);

    if (!$mb) {
        $why = (string)imap_last_error();
        $hint = stripos($why, 'certificate') !== false
            ? ' — the certificate could not be verified; check the host name matches it'
            : (stripos($why, 'auth') !== false || stripos($why, 'login') !== false
                ? ' — the mailbox rejected the username or password'
                : '');
        chk('imap_open', "IMAP sign-in {$ihost}:{$iport}", 'fail', $why . $hint . " (after {$ms} ms)");
    } else {
        chk('imap_open', "IMAP sign-in {$ihost}:{$iport}", 'pass', "as {$iuser}, {$ms} ms");
        $n = @imap_num_msg($mb);
        chk('imap_folder', "Folder {$ifold}", $n === false ? 'fail' : 'pass',
            $n === false ? 'could not be opened' : "{$n} message" . ($n === 1 ? '' : 's'));
        @imap_close($mb);
    }
}

/* ── 5. The same thing as pasteable text ─────────────────────────────────── */
$icon = ['pass' => '[ok]  ', 'fail' => '[FAIL]', 'warn' => '[warn]', 'skip' => '[skip]'];
$lines = [
    'CRM server diagnostics — ' . gmdate('Y-m-d H:i') . ' UTC',
    'Host: ' . ($_SERVER['HTTP_HOST'] ?? 'unknown') . '   PHP ' . PHP_VERSION . ' (' . PHP_OS . ')',
    str_repeat('-', 62),
];
foreach ($checks as $c) {
    /* One line per check, so the report stays scannable when pasted. A
       multi-line EHLO reply is joined rather than truncated — the capability
       list is often exactly what is needed. */
    $detail = trim(preg_replace('/\s*\R\s*/', ' | ', $c['detail']));
    $lines[] = ($icon[$c['status']] ?? '[?]   ') . ' ' . $c['label'] . ($detail !== '' ? ': ' . $detail : '');
}
$fails = count(array_filter($checks, function ($c) { return $c['status'] === 'fail'; }));
$lines[] = str_repeat('-', 62);
$lines[] = $fails ? "{$fails} check(s) failed." : 'No failures.';
$lines[] = 'No passwords appear in this report.';

echo json_encode([
    'success' => $fails === 0,
    'failures' => $fails,
    'checks'  => $checks,
    'report'  => implode("\n", $lines),
]);
