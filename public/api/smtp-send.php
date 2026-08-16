<?php
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: {$origin}");
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

require_once __DIR__ . '/_db.php';

$data      = json_decode(file_get_contents('php://input'), true) ?? [];
crm_require_session_for_socket($data['token'] ?? '');
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
// Opt-in only, for an internal relay with a self-signed certificate.
$insecure  = !empty($data['allowInsecure']);

if (!$to) {
    echo json_encode(['success' => false, 'message' => 'Recipient address is required']);
    exit;
}
// A malformed address used to be handed to RCPT TO and reported as sent, so a
// campaign counted deliveries that never left the building.
if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'message' => "\"{$to}\" is not a valid email address"]);
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
/**
 * TLS policy.
 *
 * Certificates are verified by default. They were not, which meant an attacker
 * presenting any self-signed certificate could sit in the middle of the
 * connection and read the customer's mailbox password. `allowInsecure` exists
 * for the genuine case of an internal relay with a self-signed certificate, and
 * has to be chosen deliberately.
 */
    $ctx = stream_context_create([
        'ssl' => [
            'verify_peer'       => !$insecure,
            'verify_peer_name'  => !$insecure,
            'allow_self_signed' => $insecure,
            'SNI_enabled'       => true,
            'peer_name'         => $host,
        ],
    ]);
    $wrapper = $enc === 'ssl' ? "ssl://{$host}" : $host;
    $conn = @stream_socket_client("{$wrapper}:{$port}", $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);

    if ($conn) {
        stream_set_timeout($conn, 15);
        $greeting = smtp_r($conn);
        if (smtp_code($greeting) === 220) {
            smtp_w($conn, "EHLO mail.test"); smtp_r($conn);

            // Fail closed. If TLS was asked for and does not actually engage,
            // stop here — continuing would put the account password on the
            // wire in the clear while the UI still said the link was secure.
            // Fail closed, and do not fall through to the mail() path either:
            // if the user asked for an encrypted link and it did not happen,
            // the honest outcome is to stop and say so, not to send anyway.
            if ($enc === 'tls') {
                smtp_w($conn, "STARTTLS");
                if (smtp_code(smtp_r($conn)) !== 220) {
                    fclose($conn);
                    echo json_encode(['success' => false, 'message' =>
                        'The server refused STARTTLS, so the connection would not have been encrypted and your password was not sent. Use SSL on port 465, or choose "None" only on a server you control.']);
                    exit;
                }
                if (!@stream_socket_enable_crypto($conn, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    fclose($conn);
                    echo json_encode(['success' => false, 'message' =>
                        'The TLS handshake failed — the certificate could not be verified, so nothing was sent. Try SSL on port 465, or check the host name matches the certificate.']);
                    exit;
                }
                smtp_w($conn, "EHLO mail.test"); smtp_r($conn);
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

            /**
             * Each stage names itself.
             *
             * These labels were previously shifted by one nesting level, so a
             * rejected recipient was reported as "MAIL FROM rejected" and a
             * rejected sender as "Auth failed: 235 Authentication succeeded" —
             * an auth failure quoting the successful auth response as its own
             * evidence. Someone whose recipient bounced would go and rotate a
             * working mailbox password. The server's own reply is quoted in
             * every case, because that sentence is the actual diagnosis.
             */
            if (smtp_code($ar) === 235) {
                smtp_w($conn, "MAIL FROM: <{$fromEmail}>");
                $mf = smtp_r($conn);
                if (smtp_code($mf) === 250) {
                    smtp_w($conn, "RCPT TO: <{$to}>");
                    $rc = smtp_r($conn);
                    if (smtp_code($rc) === 250) {
                        smtp_w($conn, "DATA");
                        $dt = smtp_r($conn);
                        if (smtp_code($dt) === 354) {
                            $body = build_mime($fromName, $fromEmail, $to, $subject, $html, $host);
                            fwrite($conn, $body . "\r\n.\r\n");
                            $sent = smtp_r($conn);
                            smtp_w($conn, "QUIT");
                            fclose($conn);
                            if (smtp_code($sent) === 250) {
                                echo json_encode(['success' => true, 'message' => "Email sent via {$host}:{$port}"]);
                                exit;
                            }
                            $smtpError = 'The server rejected the message body: ' . trim($sent);
                        } else {
                            $smtpError = 'The server refused to accept message data (DATA): ' . trim($dt);
                            fclose($conn);
                        }
                    } else {
                        $smtpError = "The server rejected the recipient \"{$to}\" (RCPT TO): " . trim($rc);
                        fclose($conn);
                    }
                } else {
                    $smtpError = "The server rejected the from address \"{$fromEmail}\" (MAIL FROM): " . trim($mf)
                        . '. Most hosts require this to be an address on the authenticated account.';
                    fclose($conn);
                }
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
