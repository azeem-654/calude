<?php
/**
 * _mail.php — shared server-side senders used by booking.php.
 *   crm_send_mail($smtp, $to, $subject, $html)  → raw-socket SMTP (same approach
 *     as smtp-send.php), with PHP mail() fallback when no SMTP config exists.
 *   crm_send_sms($twilio, $to, $body)           → Twilio REST via curl.
 * Not a public endpoint.
 */

function crm_send_mail($smtp, $to, $subject, $html) {
    $host = trim($smtp['host'] ?? '');
    $user = trim($smtp['user'] ?? ($smtp['username'] ?? ''));
    $pass = $smtp['pass'] ?? ($smtp['password'] ?? '');
    $port = intval($smtp['port'] ?? 587);
    $enc  = $smtp['encryption'] ?? 'tls';
    $fromName  = $smtp['fromName'] ?? 'Scheduling';
    $fromEmail = $smtp['fromEmail'] ?? $user;
    if (!$to) return false;

    $enc_subject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $enc_from    = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
    $headersBody = "From: {$enc_from} <{$fromEmail}>\r\n"
        . "To: <{$to}>\r\n"
        . "Subject: {$enc_subject}\r\n"
        . "Date: " . date('r') . "\r\n"
        . "Message-ID: <" . md5(uniqid('', true)) . "@booking>\r\n"
        . "MIME-Version: 1.0\r\n"
        . "Content-Type: text/html; charset=UTF-8\r\n"
        . "Content-Transfer-Encoding: base64\r\n"
        . "\r\n"
        . chunk_split(base64_encode($html));
    $mime = preg_replace('/^\.$/m', '..', $headersBody);

    if ($host && $user && $pass) {
        $ok = crm_smtp_socket($host, $port, $enc, $user, $pass, $fromEmail, $to, $mime);
        if ($ok) return true;
    }
    // Fallback: PHP mail()
    $hdr = "From: {$enc_from} <{$fromEmail}>\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8";
    return @mail($to, $subject, $html, $hdr);
}

function crm_smtp_socket($host, $port, $enc, $user, $pass, $from, $to, $mime) {
    $r = function ($c) { $b = ''; while ($l = fgets($c, 1024)) { $b .= $l; if (isset($l[3]) && $l[3] === ' ') break; } return $b; };
    $code = function ($s) { return (int)substr(trim($s), 0, 3); };
    $w = function ($c, $s) { fwrite($c, $s . "\r\n"); };

    $remote = ($enc === 'ssl' ? "ssl://{$host}" : $host);
    $conn = @stream_socket_client("{$remote}:{$port}", $errno, $errstr, 15);
    if (!$conn) return false;
    stream_set_timeout($conn, 15);
    try {
        if ($code($r($conn)) !== 220) return false;
        $w($conn, "EHLO booking"); $r($conn);
        if ($enc === 'tls') {
            $w($conn, "STARTTLS");
            if ($code($r($conn)) !== 220) return false;
            if (!stream_socket_enable_crypto($conn, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) return false;
            $w($conn, "EHLO booking"); $r($conn);
        }
        $w($conn, "AUTH LOGIN"); $r($conn);
        $w($conn, base64_encode($user)); $r($conn);
        $w($conn, base64_encode($pass));
        if ($code($r($conn)) !== 235) return false;
        $w($conn, "MAIL FROM:<{$from}>");
        if ($code($r($conn)) !== 250) return false;
        $w($conn, "RCPT TO:<{$to}>");
        $c = $code($r($conn));
        if ($c !== 250 && $c !== 251) return false;
        $w($conn, "DATA");
        if ($code($r($conn)) !== 354) return false;
        fwrite($conn, $mime . "\r\n.\r\n");
        if ($code($r($conn)) !== 250) return false;
        $w($conn, "QUIT");
        return true;
    } finally {
        fclose($conn);
    }
}

/** Twilio SMS. $twilio = ['sid'=>, 'token'=>, 'from'=>]. */
function crm_send_sms($twilio, $to, $body) {
    $sid = trim($twilio['sid'] ?? '');
    $token = trim($twilio['token'] ?? '');
    $from = trim($twilio['from'] ?? '');
    if (!$sid || !$token || !$from || !$to) return false;
    $ch = curl_init("https://api.twilio.com/2010-04-01/Accounts/{$sid}/Messages.json");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query(['From' => $from, 'To' => $to, 'Body' => $body]),
        CURLOPT_USERPWD => "{$sid}:{$token}",
        CURLOPT_TIMEOUT => 15,
    ]);
    curl_exec($ch);
    $codeHttp = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $codeHttp >= 200 && $codeHttp < 300;
}
