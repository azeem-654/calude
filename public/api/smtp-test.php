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
$enc   = $data['encryption']    ?? ($data['secure'] ? 'ssl' : 'tls');

if (!$host || !$user || !$pass) {
    echo json_encode(['success' => false, 'message' => 'Missing host, username, or password']);
    exit;
}

$ctx = stream_context_create([
    'ssl' => ['verify_peer' => false, 'verify_peer_name' => false, 'allow_self_signed' => true],
]);

$wrapper = $enc === 'ssl' ? "ssl://{$host}" : $host;

$conn = @stream_socket_client("{$wrapper}:{$port}", $errno, $errstr, 10, STREAM_CLIENT_CONNECT, $ctx);
if (!$conn) {
    echo json_encode(['success' => false, 'message' => "Cannot connect to {$host}:{$port} — {$errstr} ({$errno})"]);
    exit;
}
stream_set_timeout($conn, 10);

function smtp_read($conn) {
    $buf = '';
    while ($line = fgets($conn, 1024)) {
        $buf .= $line;
        if (substr($line, 3, 1) === ' ') break;
    }
    return $buf;
}
function smtp_code($resp) { return (int)substr(trim($resp), 0, 3); }

$greeting = smtp_read($conn);
if (smtp_code($greeting) !== 220) {
    fclose($conn);
    echo json_encode(['success' => false, 'message' => 'Bad server greeting: ' . trim($greeting)]);
    exit;
}

fwrite($conn, "EHLO mail.test\r\n");
$ehlo = smtp_read($conn);

// STARTTLS for TLS mode
if ($enc === 'tls') {
    fwrite($conn, "STARTTLS\r\n");
    $tls = smtp_read($conn);
    if (smtp_code($tls) === 220) {
        if (!stream_socket_enable_crypto($conn, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            fclose($conn);
            echo json_encode(['success' => false, 'message' => 'TLS handshake failed']);
            exit;
        }
        fwrite($conn, "EHLO mail.test\r\n");
        smtp_read($conn);
    }
}

// AUTH LOGIN
fwrite($conn, "AUTH LOGIN\r\n");
$authPrompt = smtp_read($conn);

if (smtp_code($authPrompt) === 334) {
    fwrite($conn, base64_encode($user) . "\r\n");
    smtp_read($conn);
    fwrite($conn, base64_encode($pass) . "\r\n");
    $authResp = smtp_read($conn);
} else {
    // Fallback: AUTH PLAIN
    fwrite($conn, 'AUTH PLAIN ' . base64_encode("\0{$user}\0{$pass}") . "\r\n");
    $authResp = smtp_read($conn);
}

fwrite($conn, "QUIT\r\n");
fclose($conn);

if (smtp_code($authResp) === 235) {
    echo json_encode(['success' => true, 'message' => "Authenticated to {$host}:{$port} successfully"]);
} else {
    echo json_encode(['success' => false, 'message' => 'Authentication failed: ' . trim($authResp),
        'suggestions' => ['Check your username and password', 'For Gmail use an App Password, not your account password', 'Make sure SMTP access is enabled for your account']]);
}
