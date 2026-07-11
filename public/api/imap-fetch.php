<?php
/**
 * imap-fetch.php — pulls the most recent messages from a mailbox over IMAP.
 * Used by the Conversations module for a live inbox connection.
 *
 * POST JSON: { host, port, encryption('ssl'|'tls'|'none'), username, password, folder, limit, sinceUid }
 * Returns:   { success, messages:[{uid, from, fromName, to, subject, date, seen, snippet, body}], error }
 *
 * Requires the PHP IMAP extension (standard on cPanel / Freehostia).
 */
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: {$origin}");
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Vary: Origin');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

if (!function_exists('imap_open')) {
    echo json_encode(['success' => false, 'error' => 'The PHP IMAP extension is not enabled on this server.']);
    exit;
}

$d        = json_decode(file_get_contents('php://input'), true) ?? [];
$host     = trim($d['host']       ?? '');
$port     = intval($d['port']     ?? 993);
$enc      = $d['encryption']      ?? 'ssl';
$user     = trim($d['username']   ?? '');
$pass     = $d['password']        ?? '';
$folder   = $d['folder']          ?? 'INBOX';
$limit    = min(50, max(1, intval($d['limit'] ?? 20)));

if (!$host || !$user) {
    echo json_encode(['success' => false, 'error' => 'Mailbox host and username are required.']);
    exit;
}

$flags = '/imap';
if ($enc === 'ssl') $flags .= '/ssl';
elseif ($enc === 'tls') $flags .= '/tls';
else $flags .= '/notls';
$flags .= '/novalidate-cert';
$mailboxStr = '{' . $host . ':' . $port . $flags . '}' . $folder;

$imap = @imap_open($mailboxStr, $user, $pass, 0, 1);
if (!$imap) {
    echo json_encode(['success' => false, 'error' => 'Could not connect: ' . imap_last_error()]);
    exit;
}

function decode_mime($s) {
    if (!$s) return '';
    $out = '';
    foreach (imap_mime_header_decode($s) as $part) {
        $cs = strtoupper($part->charset);
        $out .= ($cs === 'DEFAULT' || $cs === 'UTF-8') ? $part->text : @iconv($cs, 'UTF-8//TRANSLIT', $part->text);
    }
    return $out;
}

function part_body($imap, $num, $part, $partNo) {
    $data = $partNo ? imap_fetchbody($imap, $num, $partNo) : imap_body($imap, $num);
    if ($part->encoding == 3) $data = base64_decode($data);
    elseif ($part->encoding == 4) $data = quoted_printable_decode($data);
    return $data;
}

function get_body($imap, $num) {
    $struct = imap_fetchstructure($imap, $num);
    if (empty($struct->parts)) {
        $body = part_body($imap, $num, $struct, '');
        return ['type' => ($struct->subtype ?? 'PLAIN'), 'body' => $body];
    }
    $html = ''; $text = '';
    $walk = function ($parts, $prefix) use (&$walk, $imap, $num) {
        $res = ['html' => '', 'text' => ''];
        foreach ($parts as $i => $part) {
            $no = $prefix ? $prefix . '.' . ($i + 1) : (string)($i + 1);
            if (!empty($part->parts)) {
                $sub = $walk($part->parts, $no);
                $res['html'] .= $sub['html']; $res['text'] .= $sub['text'];
            } else {
                $sub = strtoupper($part->subtype ?? '');
                if ($sub === 'HTML') $res['html'] .= part_body($imap, $num, $part, $no);
                elseif ($sub === 'PLAIN') $res['text'] .= part_body($imap, $num, $part, $no);
            }
        }
        return $res;
    };
    $r = $walk($struct->parts, '');
    if ($r['html']) return ['type' => 'HTML', 'body' => $r['html']];
    return ['type' => 'PLAIN', 'body' => $r['text']];
}

$total = imap_num_msg($imap);
$messages = [];
$start = max(1, $total - $limit + 1);
for ($i = $total; $i >= $start; $i--) {
    $ov = imap_fetch_overview($imap, $i, 0);
    if (empty($ov)) continue;
    $o = $ov[0];
    $fromRaw = decode_mime($o->from ?? '');
    $fromName = $fromRaw; $fromEmail = $fromRaw;
    if (preg_match('/^(.*)<(.+@.+)>$/', $fromRaw, $m)) {
        $fromName = trim(trim($m[1]), '"');
        $fromEmail = trim($m[2]);
    }
    $bodyInfo = get_body($imap, $i);
    $plain = trim(strip_tags($bodyInfo['type'] === 'HTML' ? $bodyInfo['body'] : nl2br($bodyInfo['body'])));
    $snippet = mb_substr(preg_replace('/\s+/', ' ', $plain), 0, 160);

    $messages[] = [
        'uid'      => (int)imap_uid($imap, $i),
        'from'     => $fromEmail,
        'fromName' => $fromName ?: $fromEmail,
        'to'       => decode_mime($o->to ?? ''),
        'subject'  => decode_mime($o->subject ?? '(no subject)'),
        'date'     => date('c', strtotime($o->date ?? 'now')),
        'seen'     => !empty($o->seen),
        'snippet'  => $snippet,
        'bodyType' => $bodyInfo['type'],
        'body'     => mb_substr($bodyInfo['body'], 0, 40000),
    ];
}

imap_close($imap);
echo json_encode(['success' => true, 'count' => count($messages), 'total' => $total, 'messages' => $messages]);
