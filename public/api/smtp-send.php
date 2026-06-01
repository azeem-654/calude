<?php
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: {$origin}");
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$data      = json_decode(file_get_contents('php://input'), true) ?? [];
$host      = trim($data['host']      ?? '');
$port      = intval($data['port']    ?? 587);
$user      = trim($data['username']  ?? '');
$pass      = $data['password']       ?? '';
$enc       = $data['encryption']     ?? ($data['secure'] ? 'ssl' : 'tls');
$fromName  = $data['fromName']       ?? 'CRMPro';
$fromEmail = $data['fromEmail']      ?? $user;
$to        = trim($data['to']        ?? '');
$subject   = $data['subject']        ?? 'CRMPro SMTP Test';
$html      = $data['html']           ?? '<p>Test email from CRMPro.</p>';

if (!$host || !$user || !$pass || !$to) {
    echo json_encode(['success' => false, 'message' => 'Missing required fields']);
    exit;
}

$ctx = stream_context_create([
    'ssl' => ['verify_peer' => false, 'verify_peer_name' => false, 'allow_self_signed' => true],
]);

$wrapper = $enc === 'ssl' ? "ssl://{$host}" : $host;
$conn = @stream_socket_client("{$wrapper}:{$port}", $errno, $errstr, 10, STREAM_CLIENT_CONNECT, $ctx);
if (!$conn) {
    echo json_encode(['success' => false, 'message' => "Cannot connect to {$host}:{$port} — {$errstr}"]);
    exit;
}
stream_set_timeout($conn, 10);

function r($conn) {
    $buf = '';
    while ($line = fgets($conn, 1024)) {
        $buf .= $line;
        if (substr($line, 3, 1) === ' ') break;
    }
    return $buf;
}
function code($s) { return (int)substr(trim($s), 0, 3); }
function w($conn, $s) { fwrite($conn, $s . "\r\n"); }

$greeting = r($conn);
if (code($greeting) !== 220) { fclose($conn); echo json_encode(['success'=>false,'message'=>'Bad greeting']); exit; }

w($conn, "EHLO mail.test"); r($conn);

if ($enc === 'tls') {
    w($conn, "STARTTLS");
    if (code(r($conn)) === 220) {
        stream_socket_enable_crypto($conn, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLS_CLIENT);
        w($conn, "EHLO mail.test"); r($conn);
    }
}

w($conn, "AUTH LOGIN");
$ap = r($conn);
if (code($ap) === 334) {
    w($conn, base64_encode($user)); r($conn);
    w($conn, base64_encode($pass));
    $ar = r($conn);
} else {
    w($conn, 'AUTH PLAIN ' . base64_encode("\0{$user}\0{$pass}"));
    $ar = r($conn);
}
if (code($ar) !== 235) {
    fclose($conn);
    echo json_encode(['success' => false, 'message' => 'Auth failed: ' . trim($ar)]);
    exit;
}

w($conn, "MAIL FROM: <{$fromEmail}>");
if (code(r($conn)) !== 250) { fclose($conn); echo json_encode(['success'=>false,'message'=>'MAIL FROM rejected']); exit; }

w($conn, "RCPT TO: <{$to}>");
if (code(r($conn)) !== 250) { fclose($conn); echo json_encode(['success'=>false,'message'=>"Recipient {$to} rejected"]); exit; }

w($conn, "DATA");
if (code(r($conn)) !== 354) { fclose($conn); echo json_encode(['success'=>false,'message'=>'DATA command failed']); exit; }

$msgId = md5(uniqid('', true)) . '@' . $host;
$date  = date('r');
$encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
$body = "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <{$fromEmail}>\r\n"
      . "To: <{$to}>\r\n"
      . "Subject: {$encodedSubject}\r\n"
      . "Date: {$date}\r\n"
      . "Message-ID: <{$msgId}>\r\n"
      . "MIME-Version: 1.0\r\n"
      . "Content-Type: text/html; charset=UTF-8\r\n"
      . "Content-Transfer-Encoding: base64\r\n"
      . "\r\n"
      . chunk_split(base64_encode($html));
// Dot-stuffing: lines starting with . must be doubled
$body = preg_replace('/^\.$/m', '..', $body);
fwrite($conn, $body . "\r\n.\r\n");
$sent = r($conn);

w($conn, "QUIT");
fclose($conn);

if (code($sent) === 250) {
    echo json_encode(['success' => true, 'message' => "Email sent to {$to} via {$host}:{$port}"]);
} else {
    echo json_encode(['success' => false, 'message' => 'Send failed: ' . trim($sent)]);
}
