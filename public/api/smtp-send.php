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

/**
 * Every address that reaches a protocol is checked first.
 *
 * The recipient already was. The sender was not, and it goes into `MAIL FROM:`
 * and into the `From:` header — so a carriage return inside it wrote a second
 * line straight into the SMTP conversation. Anything after that CRLF is read by
 * the server as a command of its own, which is how a crafted sending address
 * adds recipients to somebody else's mail. The reply address is the same story
 * one header down.
 */
function crm_addr($value) {
    $value = trim((string) $value);
    if ($value === '' || strlen($value) > 254) return false;
    // Refused rather than escaped: no real address contains any of these, and
    // guessing at what somebody meant is how injections get through.
    if (preg_match('/[\r\n\0<>,;]/', $value)) return false;
    return filter_var($value, FILTER_VALIDATE_EMAIL) ? $value : false;
}

if (!$to) {
    echo json_encode(['success' => false, 'message' => 'Recipient address is required']);
    exit;
}
// A malformed address used to be handed to RCPT TO and reported as sent, so a
// campaign counted deliveries that never left the building.
if (crm_addr($to) === false) {
    echo json_encode(['success' => false, 'message' => "\"{$to}\" is not a valid email address"]);
    exit;
}
if (crm_addr($fromEmail) === false) {
    echo json_encode(['success' => false, 'message' =>
        "\"{$fromEmail}\" is not a valid sending address. Set one in Settings → Email & SMS."]);
    exit;
}
$replyTo = trim($data['replyTo'] ?? '');
if ($replyTo !== '' && crm_addr($replyTo) === false) {
    echo json_encode(['success' => false, 'message' => "\"{$replyTo}\" is not a valid reply-to address"]);
    exit;
}
/* A List-Unsubscribe header carries a URL and nothing else. */
$unsubUrl = trim($data['unsubscribeUrl'] ?? '');
if ($unsubUrl !== '' && (!filter_var($unsubUrl, FILTER_VALIDATE_URL) || preg_match('/[\r\n\0<>]/', $unsubUrl))) {
    $unsubUrl = '';
}
/* A display name is encoded into the header, but must not span two lines. */
$fromName = mb_substr(trim(str_replace(["\r", "\n", "\0"], ' ', (string) $fromName)), 0, 120);
$subject  = mb_substr(trim(str_replace(["\r", "\n", "\0"], ' ', (string) $subject)), 0, 300);

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
function build_mime($fromName, $fromEmail, $to, $subject, $html, $host, $replyTo = '', $unsubUrl = '') {
    $msgId = md5(uniqid('', true)) . '@' . (preg_replace('/[^a-z0-9\.\-]/i', '', $host) ?: 'localhost');
    $date  = date('r');
    $enc_subject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $enc_from    = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
    $body = "From: {$enc_from} <{$fromEmail}>\r\n"
          . "To: <{$to}>\r\n"
          . "Subject: {$enc_subject}\r\n"
          . "Date: {$date}\r\n"
          . "Message-ID: <{$msgId}>\r\n";
    /* A reply that lands in a mailbox nobody reads is a lost customer, so where
       replies should go is stated rather than left to the envelope. */
    $body .= 'Reply-To: <' . ($replyTo !== '' ? $replyTo : $fromEmail) . ">\r\n";
    if ($unsubUrl !== '') {
        /* Gmail and Yahoo have both required a one-click unsubscribe on bulk
           mail since 2024. Without these two headers a campaign is filtered
           before anybody gets to decide whether they wanted it. */
        $body .= "List-Unsubscribe: <{$unsubUrl}>\r\n";
        $body .= "List-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n";
    }
    $body .= "MIME-Version: 1.0\r\n"
          . "Content-Type: text/html; charset=UTF-8\r\n"
          . "Content-Transfer-Encoding: base64\r\n"
          . "\r\n"
          . chunk_split(base64_encode($html));
    // Dot-stuffing
    return preg_replace('/^\.$/m', '..', $body);
}

/**
 * One attempt against one host and port.
 *
 * Pulled out of the inline block it used to be so that a blocked port can be
 * retried on another one. The distinction the caller needs is in `retry`: a
 * connection that never opened says nothing about the password, so it is worth
 * trying elsewhere. A rejected login or a rejected recipient is a real answer —
 * the port worked — and retrying it on another port would only produce the same
 * refusal twice while looking like a network problem.
 */
function smtp_attempt($host, $port, $enc, $user, $pass, $fromName, $fromEmail, $to, $subject, $html, $replyTo, $unsubUrl, $insecure) {
    /**
     * TLS policy.
     *
     * Certificates are verified by default. They were not, which meant an
     * attacker presenting any self-signed certificate could sit in the middle
     * of the connection and read the customer's mailbox password.
     * `allowInsecure` exists for the genuine case of an internal relay with a
     * self-signed certificate, and has to be chosen deliberately.
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
    $errno = 0; $errstr = '';
    $conn = @stream_socket_client("{$wrapper}:{$port}", $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);

    if (!$conn) {
        return ['ok' => false, 'retry' => true, 'error' =>
            "Cannot connect to {$host}:{$port} (" . ($errstr !== '' ? trim($errstr) : 'no response') . ')'];
    }

    stream_set_timeout($conn, 15);
    $greeting = smtp_r($conn);
    if (smtp_code($greeting) !== 220) {
        fclose($conn);
        /* Something accepted the socket without being a mail server — a
           filtering proxy, usually. Another port may not have one in the way. */
        return ['ok' => false, 'retry' => true, 'error' => "Bad greeting from {$host}:{$port}: " . trim($greeting)];
    }

    smtp_w($conn, "EHLO mail.test"); smtp_r($conn);

    // Fail closed. If TLS was asked for and does not actually engage, stop
    // here — continuing would put the account password on the wire in the
    // clear while the UI still said the link was secure. Do not fall through
    // to the mail() path either: if the user asked for an encrypted link and
    // it did not happen, the honest outcome is to stop and say so.
    if ($enc === 'tls') {
        smtp_w($conn, "STARTTLS");
        /* Retryable, not fatal — but only because every remaining rung of the
           ladder is encrypted too when encryption was asked for (see
           smtp_port_ladder). Moving on sends nothing in the clear; it just
           tries a port whose submission service is configured properly. */
        if (smtp_code(smtp_r($conn)) !== 220) {
            fclose($conn);
            return ['ok' => false, 'retry' => true, 'error' =>
                "The server refused STARTTLS on port {$port}, so the connection would not have been encrypted and your password was not sent. Use SSL on port 465, or choose \"None\" only on a server you control."];
        }
        if (!@stream_socket_enable_crypto($conn, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            fclose($conn);
            return ['ok' => false, 'retry' => true, 'error' =>
                "The TLS handshake failed on port {$port} — the certificate could not be verified, so nothing was sent. Try SSL on port 465, or check the host name matches the certificate."];
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
     * These labels were previously shifted by one nesting level, so a rejected
     * recipient was reported as "MAIL FROM rejected" and a rejected sender as
     * "Auth failed: 235 Authentication succeeded" — an auth failure quoting the
     * successful auth response as its own evidence. Someone whose recipient
     * bounced would go and rotate a working mailbox password. The server's own
     * reply is quoted in every case, because that sentence is the diagnosis.
     */
    if (smtp_code($ar) !== 235) {
        fclose($conn);
        return ['ok' => false, 'retry' => false, 'error' => 'Auth failed: ' . trim($ar)];
    }

    smtp_w($conn, "MAIL FROM: <{$fromEmail}>");
    $mf = smtp_r($conn);
    if (smtp_code($mf) !== 250) {
        fclose($conn);
        return ['ok' => false, 'retry' => false, 'error' =>
            "The server rejected the from address \"{$fromEmail}\" (MAIL FROM): " . trim($mf)
            . '. Most hosts require this to be an address on the authenticated account.'];
    }

    smtp_w($conn, "RCPT TO: <{$to}>");
    $rc = smtp_r($conn);
    if (smtp_code($rc) !== 250) {
        fclose($conn);
        return ['ok' => false, 'retry' => false, 'error' =>
            "The server rejected the recipient \"{$to}\" (RCPT TO): " . trim($rc)];
    }

    smtp_w($conn, "DATA");
    $dt = smtp_r($conn);
    if (smtp_code($dt) !== 354) {
        fclose($conn);
        return ['ok' => false, 'retry' => false, 'error' =>
            'The server refused to accept message data (DATA): ' . trim($dt)];
    }

    $body = build_mime($fromName, $fromEmail, $to, $subject, $html, $host, $replyTo, $unsubUrl);
    fwrite($conn, $body . "\r\n.\r\n");
    $sent = smtp_r($conn);
    smtp_w($conn, "QUIT");
    fclose($conn);

    if (smtp_code($sent) === 250) {
        return ['ok' => true, 'retry' => false, 'error' => '', 'port' => $port];
    }
    return ['ok' => false, 'retry' => false, 'error' => 'The server rejected the message body: ' . trim($sent)];
}

/**
 * The ports to try, in order.
 *
 * The one the user chose always goes first — if it works, nothing else is
 * touched and the behaviour is exactly what it always was. The rest exist
 * because shared hosting blocks outbound mail ports, and which ones it blocks
 * varies by host and by plan:
 *
 *   587   the modern submission port, and the first thing a host blocks
 *   2525  no standard behind it, which is precisely why it is usually open —
 *         Brevo, Mailjet, SMTP2GO and SendGrid all listen on it for this reason
 *   465   implicit TLS, often open where 587 is not
 *   25    server-to-server, blocked essentially everywhere; tried last so the
 *         report can say it was tried
 *
 * Only a connection failure moves down the list. A refused password stops the
 * whole thing, because trying it three more times would lock the account.
 */
function smtp_port_ladder($chosen, $enc) {
    /* The rungs below the chosen one must never be less protected than what was
       asked for. Someone who selected TLS and hit a blocked port has not agreed
       to send their password in the clear on port 25 instead — so when
       encryption was requested, every fallback is encrypted, and port 25, which
       cannot be, is left off the list entirely.

       The reverse case is a server the user controls and has deliberately set
       to no encryption; there, adding a TLS rung would just fail four times. */
    $fallbacks = $enc === 'none'
        ? [[587, 'none'], [2525, 'none'], [25, 'none']]
        : [[587, 'tls'], [2525, 'tls'], [465, 'ssl']];

    $ladder = [[$chosen, $enc]];
    foreach ($fallbacks as $step) {
        if ($step[0] !== $chosen) $ladder[] = $step;
    }
    return $ladder;
}

/* ── attempt socket SMTP, walking down the ports until one gets through ── */
$smtpError = '';
$attempts  = [];
if ($host && $user && $pass) {
    foreach (smtp_port_ladder($port, $enc) as [$tryPort, $tryEnc]) {
        $r = smtp_attempt($host, $tryPort, $tryEnc, $user, $pass, $fromName, $fromEmail, $to, $subject, $html, $replyTo, $unsubUrl, $insecure);
        /* `retry` is kept because it is the difference between "nothing
           answered" and "something answered and said no", and the summary
           below is only allowed to blame the host for the first kind. */
        $attempts[] = ['port' => $tryPort, 'encryption' => $tryEnc, 'ok' => $r['ok'],
                       'reachable' => !$r['retry'], 'detail' => $r['error']];

        if ($r['ok']) {
            $moved = $tryPort !== $port;
            echo json_encode([
                'success'   => true,
                'transport' => 'smtp',
                'port'      => $tryPort,
                'attempts'  => $attempts,
                'message'   => $moved
                    /* Worth saying plainly: the send worked, but not the way it
                       was configured, and the setting should be corrected so
                       every later send does not pay for the blocked attempt. */
                    ? "Email accepted by {$host}:{$tryPort}. Port {$port} was blocked from this server, so port {$tryPort} was used instead — change the port in Settings to {$tryPort} to skip that delay next time."
                    : "Email accepted by {$host}:{$tryPort}",
            ]);
            exit;
        }

        $smtpError = $r['error'];
        if (!$r['retry']) break;   // a real answer; another port would repeat it
    }
}

/**
 * The host's own relay — but only when no SMTP server was asked for.
 *
 * This used to catch a failed SMTP send as well and report success anyway, so a
 * campaign counted deliveries that had gone out by a completely different route
 * from a domain the customer's SPF record does not cover, or nowhere at all.
 * If SMTP was configured and did not work, that is the answer.
 */
if ($host && $user && $pass) {
    /* Only when every single attempt failed to get an answer at all. A run
       that ended in "authentication credentials invalid" reached a mail server
       and was told no — saying "this host blocks SMTP" in the same breath as
       quoting that reply tells the customer to go and argue with their host
       about a wrong password. */
    $blockedEverywhere = count($attempts) > 1
        && !array_filter($attempts, fn($a) => $a['ok'] || $a['reachable']);
    echo json_encode([
        'success'   => false,
        'transport' => 'smtp',
        'attempts'  => $attempts,
        'message'   => ($smtpError ?: 'The message could not be sent over SMTP')
            . ($blockedEverywhere
                /* Four blocked ports is not a settings mistake, and telling
                   somebody to re-check their password would waste their
                   afternoon. This host does not allow outbound SMTP at all. */
                ? ' Ports ' . implode(', ', array_column($attempts, 'port')) . ' were all tried and none got through,'
                  . ' which means this server blocks outbound SMTP rather than anything being wrong with your details.'
                  . ' Run the route check in Settings → Email & SMS — sending over HTTPS still works from here.'
                : ''),
    ]);
    exit;
}

if (function_exists('mail') && $fromEmail) {
    $headers  = "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <{$fromEmail}>\r\n";
    $headers .= 'Reply-To: <' . ($replyTo !== '' ? $replyTo : $fromEmail) . ">\r\n";
    if ($unsubUrl !== '') {
        $headers .= "List-Unsubscribe: <{$unsubUrl}>\r\n";
        $headers .= "List-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n";
    }
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "Content-Transfer-Encoding: base64\r\n";
    $headers .= "X-Mailer: CRMPro";

    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $encodedBody    = chunk_split(base64_encode($html));

    $ok = @mail($to, $encodedSubject, $encodedBody, $headers, "-f{$fromEmail}");
    if ($ok) {
        echo json_encode([
            'success'   => true,
            'transport' => 'server-mail',
            'message'   => "Handed to this server's mail relay. Connect SMTP in Settings → Email & SMS for delivery you can see the result of.",
        ]);
        exit;
    }
}

echo json_encode([
    'success'   => false,
    'transport' => 'none',
    'message'   => 'No sending method available — add an SMTP host, username and password in Settings → Email & SMS',
]);
