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
$enc       = $data['encryption']     ?? 'tls';
$fromName  = $data['fromName']       ?? 'CRMPro';
$fromEmail = $data['fromEmail']      ?? $user;
$to        = trim($data['to']        ?? '');
$subject   = $data['subject']        ?? 'CRMPro Test';
$html      = $data['html']           ?? '<p>Test email from CRMPro.</p>';

if (!$to) {
    echo json_encode(['success' => false, 'message' => 'Recipient address is required']);
    exit;
}

/* ── helper functions ── */
function smtp_r($conn) {
    $buf = '';
    while ($line = fgets($conn, 1024)) {
        $buf .= $line;
        if (isset($line[3]) && $line[3] === ' ') break;
    }
    return $buf;
}
function smtp_code($s) { return (int)substr(trim($s), 0, 3); }
function smtp_w($conn, $s) { fwrite($conn, $s . "\r\n"); }

/* ── build MIME message ── */
function build_mime($fromName, $fromEmail, $to, $subject, $html, $host) {
    $msgId = md5(uniqid('', true)) . '@' . preg_replace('/[^a-z0-9\.\-]/i', '', $host);
    $date  = date('r');
    $enc_subject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $enc_from    = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
    $body = "From: {$enc_from} <{$fromEmail}>\r\n"
          . "To: <{$to}>\r\n"
          . "Subject: {$enc_subject}\r\n"
          . "Date: {$date}\r\n"
          . "Message-ID: <{$msgId}>\r\n"
          . "MIME-Version: 1.0\r\n"
          . "Content-Type: text/html; charset=UTF-8\r\n"
          . "Content-Transfer-Encoding: base64\r\n"
          . "\r\n"
          . chunk_split(base64_encode($html));
    // Dot-stuffing
    return preg_replace('/^\.$/m', '..', $body);
}

/* ── attempt socket SMTP ── */
$smtpError = '';
if ($host && $user && $pass) {
    $ctx = stream_context_create([
        'ssl' => ['verify_peer' => false, 'verify_peer_name' => false, 'allow_self_signed' => true],
    ]);
    $wrapper = $enc === 'ssl' ? "ssl://{$host}" : $host;
    $conn = @stream_socket_client("{$wrapper}:{$port}", $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);

    if ($conn) {
        stream_set_timeout($conn, 15);
        $greeting = smtp_r($conn);
        if (smtp_code($greeting) === 220) {
            smtp_w($conn, "EHLO mail.test"); smtp_r($conn);

            if ($enc === 'tls') {
                smtp_w($conn, "STARTTLS");
                if (smtp_code(smtp_r($conn)) === 220) {
                    @stream_socket_enable_crypto($conn, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLS_CLIENT);
                    smtp_w($conn, "EHLO mail.test"); smtp_r($conn);
                }
            }

            smtp_w($conn, "AUTH LOGIN");
            $ap = smtp_r($conn);
            if (smtp_code($ap) === 334) {
                smtp_w($conn, base64_encode($user)); smtp_r($conn);
                smtp_w($conn, base64_encode($pass));
                $ar = smtp_r($conn);
            } else {
                smtp_w($conn, 'AUTH PLAIN ' . base64_encode("\0{$user}\0{$pass}"));
                $ar = smtp_r($conn);
            }

            if (smtp_code($ar) === 235) {
                smtp_w($conn, "MAIL FROM: <{$fromEmail}>");
                if (smtp_code(smtp_r($conn)) === 250) {
                    smtp_w($conn, "RCPT TO: <{$to}>");
                    if (smtp_code(smtp_r($conn)) === 250) {
                        smtp_w($conn, "DATA");
                        if (smtp_code(smtp_r($conn)) === 354) {
                            $body = build_mime($fromName, $fromEmail, $to, $subject, $html, $host);
                            fwrite($conn, $body . "\r\n.\r\n");
                            $sent = smtp_r($conn);
                            smtp_w($conn, "QUIT");
                            fclose($conn);
                            if (smtp_code($sent) === 250) {
                                echo json_encode(['success' => true, 'message' => "Email sent via {$host}:{$port}"]);
                                exit;
                            }
                            $smtpError = 'DATA rejected: ' . trim($sent);
                        } else { $smtpError = 'RCPT rejected'; fclose($conn); }
                    } else { $smtpError = 'MAIL FROM rejected'; fclose($conn); }
                } else { $smtpError = 'Auth failed: ' . trim($ar); fclose($conn); }
            } else { $smtpError = 'Auth failed: ' . trim($ar); fclose($conn); }
        } else { $smtpError = 'Bad greeting: ' . trim($greeting); fclose($conn); }
    } else {
        $smtpError = "Cannot connect to {$host}:{$port} ({$errstr})";
    }
}

/* ── fallback: PHP mail() via server sendmail ── */
if (function_exists('mail') && $fromEmail) {
    $headers  = "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <{$fromEmail}>\r\n";
    $headers .= "Reply-To: {$fromEmail}\r\n";
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "Content-Transfer-Encoding: base64\r\n";
    $headers .= "X-Mailer: CRMPro";

    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $encodedBody    = chunk_split(base64_encode($html));

    $ok = @mail($to, $encodedSubject, $encodedBody, $headers, "-f{$fromEmail}");
    if ($ok) {
        $note = $smtpError ? " (SMTP failed: {$smtpError}; used server mail)" : '';
        echo json_encode(['success' => true, 'message' => "Email queued via server mail{$note}"]);
        exit;
    }
    $smtpError .= ($smtpError ? '; ' : '') . 'PHP mail() also failed';
}

echo json_encode(['success' => false, 'message' => $smtpError ?: 'No sending method available — configure SMTP host/user/pass']);
