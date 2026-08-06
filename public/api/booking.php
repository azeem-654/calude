<?php
/**
 * booking.php — server-side scheduling so the public booking page works for
 * real visitors (bookings used to live only in the visitor's localStorage).
 *
 * Storage: crm_data rows under account_id '__booking__':
 *   cfg_public   — published schedule (safe fields only; served to visitors)
 *   cfg_private  — SMTP + Twilio + automation settings (never returned)
 *   bk_<id>      — individual bookings
 *
 * POST JSON { action, ... }:
 *   publish      {token, public, private}          (owner) → {success}
 *   config       {}                                → {success, config}
 *   slots        {date}                            → {success, booked:[{time,duration}]}
 *   create       {slotDate, slotTime, guestName, guestEmail, guestPhone?, notes?,
 *                 timezone?, eventTypeId?}         → {success, id, key}
 *   get          {id, key}                         → {success, booking}
 *   cancel       {id, key}                         → {success}
 *   reschedule   {id, key, slotDate, slotTime}     → {success}
 *   list         {token}                           (owner) → {success, bookings}
 *   set_status   {token, id, status}               (owner) → {success}
 *   run_automations {}                             → {success, sent}
 *
 * Reminders/follow-ups run opportunistically on config/create/run_automations
 * calls (poor-man's cron — every booking-page visit and app load processes
 * anything due).
 */
require __DIR__ . '/_db.php';
require __DIR__ . '/_mail.php';
crm_cors();

$d = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $d['action'] ?? '';
function out($x) { echo json_encode($x); exit; }

// MySQL when the cloud DB is installed; otherwise a server-side JSON file
// (same zero-config storage auth.php uses) so booking works out of the box.
$pdo = crm_pdo();

const BK = '__booking__';
// Stored as an exit-guarded PHP file (see _db.php): this holds guest names,
// emails and phone numbers, which must not be fetchable as a plain JSON file.
function bk_file_load() {
    $j = crm_store_load('booking', ['kv' => []]);
    return isset($j['kv']) && is_array($j['kv']) ? $j : ['kv' => []];
}
function bk_file_save($data) {
    $fp = @fopen(crm_store_path('booking'), 'c+');
    if (!$fp) return false;
    flock($fp, LOCK_EX);
    ftruncate($fp, 0);
    fwrite($fp, crm_store_encode($data));
    flock($fp, LOCK_UN);
    fclose($fp);
    @chmod(crm_store_path('booking'), 0600);
    return true;
}

function bk_get($pdo, $k) {
    if (!$pdo) { $f = bk_file_load(); return $f['kv'][$k] ?? null; }
    $s = $pdo->prepare('SELECT v FROM crm_data WHERE account_id = ? AND k = ?');
    $s->execute([BK, $k]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    return $row ? (json_decode($row['v'], true) ?: null) : null;
}
function bk_set($pdo, $k, $v) {
    if (!$pdo) { $f = bk_file_load(); $f['kv'][$k] = $v; bk_file_save($f); return; }
    // REPLACE INTO is portable across MySQL and SQLite (dev/tests).
    $s = $pdo->prepare('REPLACE INTO crm_data (account_id, k, v, updated_at) VALUES (?,?,?,?)');
    $s->execute([BK, $k, json_encode($v), date('Y-m-d H:i:s')]);
}
function bk_all_bookings($pdo) {
    if (!$pdo) {
        $f = bk_file_load();
        $out = [];
        foreach ($f['kv'] as $k => $v) { if (strpos($k, 'bk_') === 0 && is_array($v)) $out[] = $v; }
        return $out;
    }
    $s = $pdo->prepare("SELECT v FROM crm_data WHERE account_id = ? AND k LIKE 'bk_%'");
    $s->execute([BK]);
    $out = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $b = json_decode($row['v'], true);
        if ($b) $out[] = $b;
    }
    return $out;
}

/** Meeting start as DateTime in the OWNER's timezone. */
function bk_start($booking, $cfg) {
    $tz = $cfg['timezone'] ?? 'UTC';
    try { return new DateTime("{$booking['slotDate']} {$booking['slotTime']}", new DateTimeZone($tz)); }
    catch (Throwable $e) { return new DateTime("{$booking['slotDate']} {$booking['slotTime']}"); }
}

function bk_fmt_when($booking, $cfg) {
    $start = bk_start($booking, $cfg);
    return $start->format('l, F j, Y') . ' at ' . $start->format('g:i A') . ' (' . ($cfg['timezone'] ?? 'UTC') . ')';
}

/** Send guest-facing email using published private SMTP config. */
function bk_mail($priv, $to, $subject, $html) {
    $smtp = $priv['smtp'] ?? [];
    return crm_send_mail($smtp, $to, $subject, $html);
}

function bk_email_shell($title, $bodyHtml) {
    return "<div style=\"font-family:sans-serif;max-width:520px;margin:0 auto;padding:28px 22px\">"
        . "<div style=\"background:#17191c;border-radius:12px;padding:22px;color:#fff;text-align:center;margin-bottom:22px\"><h1 style=\"margin:0;font-size:20px\">{$title}</h1></div>"
        . $bodyHtml
        . "</div>";
}

function bk_details_block($b, $cfg) {
    $loc = $b['location'] ?? ($cfg['location'] ?? '');
    return "<div style=\"background:#f8fafc;border-radius:10px;padding:18px;border:1px solid #e2e8f0;margin:16px 0\">"
        . "<p style=\"margin:0 0 8px\"><strong>Meeting:</strong> " . htmlspecialchars($b['eventTypeName'] ?? ($cfg['title'] ?? 'Meeting')) . "</p>"
        . "<p style=\"margin:0 0 8px\"><strong>When:</strong> " . bk_fmt_when($b, $cfg) . "</p>"
        . "<p style=\"margin:0 0 8px\"><strong>Duration:</strong> " . intval($b['duration'] ?? ($cfg['duration'] ?? 30)) . " minutes</p>"
        . ($loc ? "<p style=\"margin:0\"><strong>Location:</strong> " . htmlspecialchars($loc) . "</p>" : '')
        . "</div>";
}

function bk_manage_url($b) {
    $proto = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return "{$proto}://{$host}/book?manage={$b['id']}.{$b['manageKey']}";
}

/* ── Automations pass (reminders + follow-ups) ── */
function bk_run_automations($pdo) {
    $cfg  = bk_get($pdo, 'cfg_public') ?? [];
    $priv = bk_get($pdo, 'cfg_private') ?? [];
    $auto = $priv['automations'] ?? [];
    $sent = 0;
    $now = new DateTime('now', new DateTimeZone($cfg['timezone'] ?? 'UTC'));
    foreach (bk_all_bookings($pdo) as $b) {
        if (($b['status'] ?? '') !== 'confirmed') continue;
        $start = bk_start($b, $cfg);
        $end = (clone $start)->modify('+' . intval($b['duration'] ?? ($cfg['duration'] ?? 30)) . ' minutes');
        $changed = false;

        // Reminder (email + optional SMS) N minutes before start
        $remMin = intval($auto['reminderMinutes'] ?? 60);
        if (!empty($auto['reminderEmail']) && empty($b['reminded']) && $now < $start) {
            $diff = $start->getTimestamp() - $now->getTimestamp();
            if ($diff <= $remMin * 60) {
                bk_mail($priv, $b['guestEmail'], 'Reminder: ' . ($b['eventTypeName'] ?? 'Your meeting') . ' is coming up',
                    bk_email_shell('⏰ Meeting Reminder',
                        "<p>Hi <strong>" . htmlspecialchars($b['guestName']) . "</strong>, this is a reminder about your upcoming meeting.</p>"
                        . bk_details_block($b, $cfg)
                        . "<p style=\"font-size:13px;color:#64748b\">Need to make changes? <a href=\"" . bk_manage_url($b) . "\">Reschedule or cancel</a>.</p>"));
                if (!empty($auto['reminderSms']) && !empty($b['guestPhone'])) {
                    crm_send_sms($priv['twilio'] ?? [], $b['guestPhone'],
                        'Reminder: ' . ($b['eventTypeName'] ?? 'your meeting') . ' at ' . $start->format('g:i A') . ' (' . ($cfg['timezone'] ?? '') . '). ' . ($b['location'] ?? ($cfg['location'] ?? '')));
                }
                $b['reminded'] = true; $changed = true; $sent++;
            }
        }

        // Follow-up after the meeting ends
        if (!empty($auto['followupEmail']) && empty($b['followedUp']) && $now > (clone $end)->modify('+5 minutes')) {
            $msg = trim($auto['followupText'] ?? '') ?: 'Thanks for meeting with us! If you have any questions or want to book a follow-up, just reply to this email.';
            bk_mail($priv, $b['guestEmail'], 'Thanks for your time — ' . ($b['eventTypeName'] ?? 'Meeting'),
                bk_email_shell('🙌 Thank You', "<p>Hi <strong>" . htmlspecialchars($b['guestName']) . "</strong>,</p><p>" . nl2br(htmlspecialchars($msg)) . "</p>"));
            $b['followedUp'] = true; $changed = true; $sent++;
        }

        if ($changed) bk_set($pdo, 'bk_' . $b['id'], $b);
    }
    return $sent;
}

/* ── Actions ── */

if ($action === 'publish') {
    $user = crm_user_from_token($d['token'] ?? '');
    if (!$user) out(['success' => false, 'error' => 'Not authorised.']);
    if (isset($d['public']) && is_array($d['public'])) bk_set($pdo, 'cfg_public', $d['public']);
    if (isset($d['private']) && is_array($d['private'])) bk_set($pdo, 'cfg_private', $d['private']);
    out(['success' => true]);
}

if ($action === 'config') {
    $cfg = bk_get($pdo, 'cfg_public');
    // Piggyback the automation pass on booking-page visits.
    try { bk_run_automations($pdo); } catch (Throwable $e) { /* never block */ }
    out(['success' => true, 'config' => $cfg]);
}

if ($action === 'slots') {
    $date = preg_replace('/[^0-9\-]/', '', $d['date'] ?? '');
    $booked = [];
    foreach (bk_all_bookings($pdo) as $b) {
        if ($b['slotDate'] === $date && ($b['status'] ?? '') !== 'cancelled') {
            $booked[] = ['time' => $b['slotTime'], 'duration' => intval($b['duration'] ?? 30)];
        }
    }
    out(['success' => true, 'booked' => $booked]);
}

if ($action === 'create') {
    $cfg  = bk_get($pdo, 'cfg_public') ?? [];
    $priv = bk_get($pdo, 'cfg_private') ?? [];
    $name  = trim($d['guestName'] ?? '');
    $email = trim($d['guestEmail'] ?? '');
    $date  = preg_replace('/[^0-9\-]/', '', $d['slotDate'] ?? '');
    $time  = preg_replace('/[^0-9:]/', '', $d['slotTime'] ?? '');
    if (!$name || !filter_var($email, FILTER_VALIDATE_EMAIL) || !$date || !$time) {
        out(['success' => false, 'error' => 'Name, valid email, date and time are required.']);
    }
    // Reject double-booking
    foreach (bk_all_bookings($pdo) as $b) {
        if ($b['slotDate'] === $date && $b['slotTime'] === $time && ($b['status'] ?? '') !== 'cancelled') {
            out(['success' => false, 'error' => 'That time was just booked — please pick another slot.']);
        }
    }
    // Resolve event type
    $et = null;
    foreach (($cfg['eventTypes'] ?? []) as $e) { if (($e['id'] ?? '') === ($d['eventTypeId'] ?? '')) { $et = $e; break; } }
    $booking = [
        'id' => bin2hex(random_bytes(6)),
        'manageKey' => bin2hex(random_bytes(8)),
        'eventTypeId' => $et['id'] ?? '',
        'eventTypeName' => $et['name'] ?? ($cfg['title'] ?? 'Meeting'),
        'duration' => intval($et['duration'] ?? ($cfg['duration'] ?? 30)),
        'location' => $et['location'] ?? ($cfg['location'] ?? ''),
        'slotDate' => $date,
        'slotTime' => $time,
        'guestName' => $name,
        'guestEmail' => $email,
        'guestPhone' => trim($d['guestPhone'] ?? ''),
        'notes' => trim($d['notes'] ?? ''),
        'status' => 'confirmed',
        'timezone' => trim($d['timezone'] ?? ''),
        'createdAt' => date('c'),
        'reminded' => false,
        'followedUp' => false,
    ];
    bk_set($pdo, 'bk_' . $booking['id'], $booking);

    $auto = $priv['automations'] ?? [];
    // Guest confirmation
    if (!isset($auto['confirmEmail']) || $auto['confirmEmail']) {
        bk_mail($priv, $email, 'Confirmed: ' . $booking['eventTypeName'],
            bk_email_shell('✅ Meeting Confirmed',
                "<p>Hi <strong>" . htmlspecialchars($name) . "</strong>, your meeting is confirmed.</p>"
                . bk_details_block($booking, $cfg)
                . "<p style=\"font-size:13px;color:#64748b\">Need to make changes? <a href=\"" . bk_manage_url($booking) . "\">Reschedule or cancel</a>.</p>"));
    }
    // Owner notification
    if (!empty($auto['ownerNotify']) && !empty($auto['ownerEmail'])) {
        bk_mail($priv, $auto['ownerEmail'], 'New booking: ' . $name . ' — ' . $booking['eventTypeName'],
            bk_email_shell('📅 New Booking',
                "<p><strong>" . htmlspecialchars($name) . "</strong> (" . htmlspecialchars($email) . ($booking['guestPhone'] ? ', ' . htmlspecialchars($booking['guestPhone']) : '') . ") booked:</p>"
                . bk_details_block($booking, $cfg)
                . ($booking['notes'] ? "<p><strong>Notes:</strong> " . htmlspecialchars($booking['notes']) . "</p>" : '')));
    }
    try { bk_run_automations($pdo); } catch (Throwable $e) { /* ignore */ }
    out(['success' => true, 'id' => $booking['id'], 'key' => $booking['manageKey']]);
}

/* Guest manage (id + key, no auth) */
if ($action === 'get' || $action === 'cancel' || $action === 'reschedule') {
    $id = preg_replace('/[^a-f0-9]/', '', $d['id'] ?? '');
    $b = $id ? bk_get($pdo, 'bk_' . $id) : null;
    if (!$b || !hash_equals($b['manageKey'] ?? '', $d['key'] ?? '')) out(['success' => false, 'error' => 'Booking not found.']);
    $cfg = bk_get($pdo, 'cfg_public') ?? [];
    $priv = bk_get($pdo, 'cfg_private') ?? [];

    if ($action === 'get') { unset($b['manageKey']); out(['success' => true, 'booking' => $b]); }

    if ($action === 'cancel') {
        $b['status'] = 'cancelled';
        bk_set($pdo, 'bk_' . $id, $b);
        bk_mail($priv, $b['guestEmail'], 'Cancelled: ' . $b['eventTypeName'],
            bk_email_shell('Booking Cancelled', "<p>Hi <strong>" . htmlspecialchars($b['guestName']) . "</strong>, your meeting has been cancelled.</p>" . bk_details_block($b, $cfg)));
        $auto = $priv['automations'] ?? [];
        if (!empty($auto['ownerNotify']) && !empty($auto['ownerEmail'])) {
            bk_mail($priv, $auto['ownerEmail'], 'Cancelled: ' . $b['guestName'] . ' — ' . $b['eventTypeName'],
                bk_email_shell('❌ Booking Cancelled', "<p><strong>" . htmlspecialchars($b['guestName']) . "</strong> cancelled:</p>" . bk_details_block($b, $cfg)));
        }
        out(['success' => true]);
    }

    // reschedule
    $date = preg_replace('/[^0-9\-]/', '', $d['slotDate'] ?? '');
    $time = preg_replace('/[^0-9:]/', '', $d['slotTime'] ?? '');
    if (!$date || !$time) out(['success' => false, 'error' => 'New date and time required.']);
    foreach (bk_all_bookings($pdo) as $other) {
        if ($other['id'] !== $id && $other['slotDate'] === $date && $other['slotTime'] === $time && ($other['status'] ?? '') !== 'cancelled') {
            out(['success' => false, 'error' => 'That time was just booked — please pick another slot.']);
        }
    }
    $b['slotDate'] = $date; $b['slotTime'] = $time; $b['status'] = 'confirmed'; $b['reminded'] = false;
    bk_set($pdo, 'bk_' . $id, $b);
    bk_mail($priv, $b['guestEmail'], 'Rescheduled: ' . $b['eventTypeName'],
        bk_email_shell('🔁 Booking Rescheduled', "<p>Hi <strong>" . htmlspecialchars($b['guestName']) . "</strong>, your meeting has been moved.</p>" . bk_details_block($b, $cfg)
            . "<p style=\"font-size:13px;color:#64748b\"><a href=\"" . bk_manage_url($b) . "\">Manage this booking</a></p>"));
    out(['success' => true]);
}

/* Owner actions */
if ($action === 'list' || $action === 'set_status') {
    $user = crm_user_from_token($d['token'] ?? '');
    if (!$user) out(['success' => false, 'error' => 'Not authorised.']);
    if ($action === 'list') {
        try { bk_run_automations($pdo); } catch (Throwable $e) { /* ignore */ }
        out(['success' => true, 'bookings' => bk_all_bookings($pdo)]);
    }
    $id = preg_replace('/[^a-f0-9]/', '', $d['id'] ?? '');
    $b = $id ? bk_get($pdo, 'bk_' . $id) : null;
    if (!$b) out(['success' => false, 'error' => 'Booking not found.']);
    $status = in_array($d['status'] ?? '', ['confirmed', 'cancelled', 'completed'], true) ? $d['status'] : null;
    if (!$status) out(['success' => false, 'error' => 'Bad status.']);
    $b['status'] = $status;
    bk_set($pdo, 'bk_' . $id, $b);
    out(['success' => true]);
}

if ($action === 'run_automations') {
    $n = 0;
    try { $n = bk_run_automations($pdo); } catch (Throwable $e) { /* ignore */ }
    out(['success' => true, 'sent' => $n]);
}

out(['success' => false, 'error' => 'Unknown action.']);
