<?php
/**
 * sms-send.php — the SMS transport the campaigns never had.
 *
 * Campaign records have carried an smsBody field for as long as they have
 * existed and nothing has ever sent it. crm_send_sms() existed too, with a
 * single caller: booking reminders. This is the missing piece between them.
 *
 * Two things here are not optional.
 *
 * Consent. A text message arrives on a phone that is usually in someone's
 * pocket, and the rules around it are stricter than email in most countries.
 * Every recipient is checked against an opt-out list before anything is sent,
 * STOP and its usual variants add a number to that list permanently, and the
 * list is keyed on the number's digits so +1 (512) 555-0143 and 15125550143
 * cannot be treated as two different people.
 *
 * A way out. Every message this endpoint sends carries opt-out wording unless
 * the caller has already put some in the body, because a cold text with no way
 * to stop it is the fastest route to a complaint that costs the sending number.
 *
 * POST JSON:
 *   { action:'send',   token, to, body, campaignId? }
 *   { action:'optout', token, phone, reason? }      — used by an inbound handler
 *   { action:'status', token, phone }               — is this number suppressed?
 */
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: {$origin}");
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Vary: Origin');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

require_once __DIR__ . '/_db.php';
require_once __DIR__ . '/_mail.php';

const SMS_OPTOUT_STORE = 'sms_optout';
/** Twilio's own limit for a single segmented message. */
const SMS_MAX_LEN = 1600;

$d = json_decode(file_get_contents('php://input'), true) ?? [];
crm_require_session_for_socket($d['token'] ?? '');

function sms_out($data) { echo json_encode($data); exit; }

/**
 * Digits only, so one person is one person.
 *
 * "+1 (512) 555-0143", "15125550143" and "512-555-0143" are the same phone.
 * Storing an opt-out under the string a form happened to submit means the next
 * message, formatted differently, sails straight past it.
 */
function sms_key($phone) {
    $digits = preg_replace('/\D+/', '', (string)$phone);
    // Keep the last 10 digits, which is the part that identifies the line
    // regardless of how the country code was written.
    return strlen($digits) > 10 ? substr($digits, -10) : $digits;
}

function sms_optouts() {
    $rows = crm_store_load(SMS_OPTOUT_STORE, []);
    return is_array($rows) ? $rows : [];
}

function sms_is_suppressed($phone) {
    $key = sms_key($phone);
    if ($key === '') return false;
    foreach (sms_optouts() as $row) {
        if (($row['key'] ?? '') === $key) return $row;
    }
    return false;
}

function sms_suppress($phone, $reason) {
    $key = sms_key($phone);
    if ($key === '') return false;
    $rows = sms_optouts();
    foreach ($rows as $row) if (($row['key'] ?? '') === $key) return true;   // already out
    $rows[] = ['key' => $key, 'phone' => (string)$phone, 'reason' => $reason, 'at' => gmdate('c')];
    return crm_store_save(SMS_OPTOUT_STORE, $rows);
}

/** The words people actually send when they want it to stop. */
function sms_is_stop_word($text) {
    $t = strtoupper(trim(preg_replace('/[^A-Za-z ]/', '', (string)$text)));
    return in_array($t, ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'OPT OUT', 'REMOVE'], true);
}

$action = $d['action'] ?? 'send';

if ($action === 'optout') {
    $phone = $d['phone'] ?? '';
    if (sms_key($phone) === '') sms_out(['success' => false, 'error' => 'A phone number is required.']);
    sms_suppress($phone, $d['reason'] ?? 'Replied STOP');
    sms_out(['success' => true, 'suppressed' => true]);
}

if ($action === 'status') {
    $row = sms_is_suppressed($d['phone'] ?? '');
    sms_out(['success' => true, 'suppressed' => (bool)$row, 'since' => $row['at'] ?? null, 'reason' => $row['reason'] ?? null]);
}

/**
 * A reply came in. This is the half of consent that actually matters: an
 * opt-out list nothing ever adds to is decoration.
 *
 * Point a Twilio inbound webhook at this, or call it from wherever replies are
 * read. A STOP word suppresses the number; anything else is reported back so
 * the caller can treat it as a real reply.
 */
if ($action === 'inbound') {
    $from = $d['from'] ?? ($d['phone'] ?? '');
    $text = $d['body'] ?? '';
    if (sms_key($from) === '') sms_out(['success' => false, 'error' => 'A sender number is required.']);

    if (sms_is_stop_word($text)) {
        sms_suppress($from, 'Replied “' . trim(mb_substr((string)$text, 0, 40)) . '”');
        sms_out(['success' => true, 'stop' => true, 'suppressed' => true,
                 'message' => 'That number will not be texted again.']);
    }
    sms_out(['success' => true, 'stop' => false, 'suppressed' => false]);
}

if ($action !== 'send') sms_out(['success' => false, 'error' => 'Unknown action.']);

/* ── Sending ───────────────────────────────────────────────────────────── */

$to = trim($d['to'] ?? '');
$body = trim($d['body'] ?? '');

if (sms_key($to) === '') {
    sms_out(['success' => false, 'error' => 'A recipient phone number is required.']);
}
if ($body === '') {
    sms_out(['success' => false, 'error' => 'The message is empty.']);
}
if (mb_strlen($body) > SMS_MAX_LEN) {
    sms_out(['success' => false, 'error' => 'The message is longer than ' . SMS_MAX_LEN . ' characters, which Twilio will refuse.']);
}

/* Checked before the credentials are even read: an opted-out number must not be
   messaged even if everything else about the request is perfect. */
$suppressed = sms_is_suppressed($to);
if ($suppressed) {
    sms_out([
        'success' => false, 'code' => 'opted_out',
        'error' => 'That number has opted out of messages' . (!empty($suppressed['at']) ? ' since ' . substr($suppressed['at'], 0, 10) : '') . '. It cannot be texted again.',
    ]);
}

/* The sender's own words are trusted if they already offered a way out. */
$hasOptOut = preg_match('/\b(stop|unsubscribe|opt ?out)\b/i', $body);
$outgoing = $hasOptOut ? $body : $body . ' Reply STOP to opt out.';
if (mb_strlen($outgoing) > SMS_MAX_LEN) $outgoing = $body;   // no room; send as given

$twilio = [
    'sid'   => trim($d['accountSid'] ?? ''),
    'token' => trim($d['authToken'] ?? ''),
    'from'  => trim($d['fromNumber'] ?? ''),
];
if (!$twilio['sid'] || !$twilio['token'] || !$twilio['from']) {
    sms_out(['success' => false, 'code' => 'no_config',
             'error' => 'SMS is not configured. Add the Twilio account SID, auth token and sending number in Settings → Email & SMS.']);
}

$endpoint = getenv('CRM_TWILIO_ENDPOINT');
if ($endpoint) {
    /* Test seam: the same request, sent somewhere a test can inspect. Never set
       in production, where crm_send_sms talks to Twilio directly. */
    $ch = curl_init(rtrim($endpoint, '/') . "/2010-04-01/Accounts/{$twilio['sid']}/Messages.json");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query(['From' => $twilio['from'], 'To' => $to, 'Body' => $outgoing]),
        CURLOPT_USERPWD => "{$twilio['sid']}:{$twilio['token']}",
        CURLOPT_TIMEOUT => 15,
    ]);
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $ok = $status >= 200 && $status < 300;
    if (!$ok) {
        $parsed = json_decode((string)$raw, true);
        sms_out(['success' => false, 'status' => $status,
                 'error' => $parsed['message'] ?? ('The SMS provider returned ' . $status)]);
    }
} else {
    $ok = crm_send_sms($twilio, $to, $outgoing);
    if (!$ok) {
        sms_out(['success' => false,
                 'error' => 'Twilio refused the message. Check the account SID, auth token and that the sending number can text this country.']);
    }
}

sms_out([
    'success' => true,
    'to' => $to,
    'characters' => mb_strlen($outgoing),
    /* Twilio bills per segment, and a message that quietly became three is a
       bill three times the size. */
    'segments' => (int)ceil(mb_strlen($outgoing) / (preg_match('/[^\x20-\x7E]/', $outgoing) ? 70 : 160)),
    'optOutAdded' => !$hasOptOut,
]);
