<?php
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: {$origin}");
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$data  = json_decode(file_get_contents('php://input'), true) ?? [];
$host  = trim($data['host']     ?? '');
$port  = intval($data['port']   ?? 587);
$user  = trim($data['username'] ?? '');
$pass  = $data['password']      ?? '';
$enc   = $data['encryption']    ?? 'tls';

function t_read($conn) {
    $buf = '';
    while ($line = fgets($conn, 1024)) {
        $buf .= $line;
        if (isset($line[3]) && $line[3] === ' ') break;
    }
    return $buf;
}
function t_code($r) { return (int)substr(trim($r), 0, 3); }

$smtpError    = '';
$phpMailAvail = function_exists('mail');

/* ── try socket SMTP ── */
if ($host && $user && $pass) {
    $ctx = stream_context_create([
        'ssl' => ['verify_peer' => false, 'verify_peer_name' => false, 'allow_self_signed' => true],
    ]);
    $wrapper = $enc === 'ssl' ? "ssl://{$host}" : $host;
    $conn = @stream_socket_client("{$wrapper}:{$port}", $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);

    if ($conn) {
        stream_set_timeout($conn, 15);
        $greeting = t_read($conn);
        if (t_code($greeting) === 220) {
            fwrite($conn, "EHLO mail.test\r\n"); t_read($conn);

            if ($enc === 'tls') {
                fwrite($conn, "STARTTLS\r\n");
                if (t_code(t_read($conn)) === 220) {
                    if (!@stream_socket_enable_crypto($conn, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                        fclose($conn);
                        $smtpError = 'TLS handshake failed — try SSL on port 465 instead';
                    } else {
                        fwrite($conn, "EHLO mail.test\r\n"); t_read($conn);
                    }
                }
            }

            if (!$smtpError) {
                fwrite($conn, "AUTH LOGIN\r\n");
                $ap = t_read($conn);
                if (t_code($ap) === 334) {
                    fwrite($conn, base64_encode($user) . "\r\n"); t_read($conn);
                    fwrite($conn, base64_encode($pass) . "\r\n");
                    $ar = t_read($conn);
                } else {
                    fwrite($conn, 'AUTH PLAIN ' . base64_encode("\0{$user}\0{$pass}") . "\r\n");
                    $ar = t_read($conn);
                }
                fwrite($conn, "QUIT\r\n");
                fclose($conn);

                if (t_code($ar) === 235) {
                    echo json_encode(['success' => true, 'message' => "Connected and authenticated to {$host}:{$port}"]);
                    exit;
                }
                $smtpError = 'Auth failed: ' . trim($ar) . ' — check username/password';
            }
        } else {
            fclose($conn);
            $smtpError = 'Bad server greeting: ' . trim($greeting);
        }
    } else {
        $smtpError = "Cannot connect to {$host}:{$port} ({$errstr}) — port may be blocked by hosting firewall";
    }
} else {
    $smtpError = 'Host, username, and password are required';
}

/* ── build helpful suggestions ── */
$suggestions = [];
if (strpos($smtpError, 'Cannot connect') !== false || strpos($smtpError, 'blocked') !== false) {
    $suggestions[] = 'Outbound SMTP ports may be blocked — emails will still send via server mail relay automatically';
    $suggestions[] = "Try port 465 with SSL encryption instead of port {$port}";
    $suggestions[] = 'For Freehostia/cPanel: use mail.' . preg_replace('/^mail\./', '', $host) . ' port 465 SSL';
}
if (strpos($smtpError, 'Auth failed') !== false || strpos($smtpError, 'check username') !== false) {
    $suggestions[] = 'Verify the email account password (not the cPanel hosting password)';
    $suggestions[] = 'For Gmail: use an App Password — google.com/myaccount → Security → App passwords';
    $suggestions[] = 'Make sure SMTP/IMAP is enabled for this email account in your mail control panel';
}

$note = $phpMailAvail
    ? 'Note: Server mail() is available — actual email sending will still work even if SMTP socket test fails'
    : '';

echo json_encode([
    'success'     => false,
    'message'     => $smtpError,
    'suggestions' => $suggestions,
    'note'        => $note,
]);
