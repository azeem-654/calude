<?php
/**
 * placement.php — inbox placement testing.
 *
 * Every other number in the deliverability module describes what the *sending*
 * server did. This one answers the question that actually matters: when a
 * message arrives at Gmail or Outlook, does it land in the inbox or in spam?
 * The only way to know is to look inside a mailbox, which needs IMAP — so seed
 * mailbox credentials live here, in the guarded store, and never reach the
 * browser.
 *
 * POST JSON { action, token, ... }:
 *   capabilities                 → whether this host has the IMAP extension
 *   seed_list                    → configured seeds (host and user, never the password)
 *   seed_set  { id, email, host, port, encryption, username, password }  (agency only)
 *   seed_remove { id }           (agency only)
 *   check     { id, marker }     → 'inbox' | 'spam' | 'missing' for that marker
 */
require __DIR__ . '/_db.php';
crm_cors();

$d      = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $d['action'] ?? '';

function out($x) { echo json_encode($x); exit; }

function plc_can_imap() { return function_exists('imap_open'); }

/* ── Seed credential store ───────────────────────────────────────────────── */

function plc_seeds() { return crm_store_load('placement_seeds', []); }
function plc_seeds_save($rows) { return crm_store_save('placement_seeds', $rows); }

/** Public view of a seed: everything except the password. */
function plc_public($id, $s) {
    return [
        'id' => $id,
        'email' => $s['email'] ?? '',
        'host' => $s['host'] ?? '',
        'port' => (int)($s['port'] ?? 993),
        'encryption' => $s['encryption'] ?? 'ssl',
        'username' => $s['username'] ?? '',
        'hasPassword' => !empty($s['password']),
    ];
}

/* ── Folder classification ───────────────────────────────────────────────── */

/**
 * Which of this mailbox's folders is the spam folder? Providers disagree —
 * Gmail uses [Gmail]/Spam, Outlook uses Junk, others use Junk E-mail — so the
 * folder list is read and matched rather than assumed.
 */
function plc_spam_folders($imap, $mailboxPrefix) {
    $out = [];
    $list = @imap_list($imap, $mailboxPrefix, '*');
    if (!is_array($list)) return ['Spam', 'Junk'];
    foreach ($list as $full) {
        $name = str_replace($mailboxPrefix, '', $full);
        if (preg_match('/(spam|junk|bulk|unwanted)/i', $name)) $out[] = $name;
    }
    return $out ?: ['Spam', 'Junk'];
}

/**
 * Search one folder for a marker. Returns true when a message containing it is
 * present. The marker goes in the subject, so TEXT search finds it whether the
 * body is HTML or plain.
 */
function plc_folder_has($host, $port, $flags, $user, $pass, $folder, $marker) {
    $box = '{' . $host . ':' . $port . $flags . '}' . $folder;
    $imap = @imap_open($box, $user, $pass, 0, 1);
    if (!$imap) return null;   // could not open — not the same as "not there"
    $hits = @imap_search($imap, 'TEXT "' . str_replace('"', '', $marker) . '"');
    @imap_close($imap);
    return is_array($hits) && count($hits) > 0;
}

/* ── Routing ─────────────────────────────────────────────────────────────── */

$user = crm_user_from_token($d['token'] ?? '');
if (!$user) out(['success' => false, 'error' => 'Not authenticated.']);

if ($action === 'capabilities') {
    out([
        'success' => true,
        'imap' => plc_can_imap(),
        'seeds' => count(plc_seeds()),
        'message' => plc_can_imap()
            ? 'This host can read seed mailboxes over IMAP, so placement can be detected automatically.'
            : 'This host does not have the PHP IMAP extension, so placement has to be recorded by hand after checking each mailbox.',
    ]);
}

if ($action === 'seed_list') {
    $rows = [];
    foreach (plc_seeds() as $id => $s) $rows[] = plc_public($id, $s);
    out(['success' => true, 'seeds' => $rows, 'imap' => plc_can_imap()]);
}

if ($action === 'seed_set') {
    if (($user['role'] ?? '') !== 'agency') out(['success' => false, 'error' => 'Only an agency user can store mailbox credentials.']);
    $id = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($d['id'] ?? ''));
    if ($id === '') out(['success' => false, 'error' => 'A seed id is required.']);
    $email = strtolower(trim((string)($d['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) out(['success' => false, 'error' => 'Enter the seed mailbox address.']);
    $host = trim((string)($d['host'] ?? ''));
    if (!preg_match('/^[a-z0-9.-]+\.[a-z]{2,}$/i', $host)) out(['success' => false, 'error' => 'Enter a valid IMAP host, e.g. imap.gmail.com.']);
    $port = (int)($d['port'] ?? 993);
    if ($port < 1 || $port > 65535) out(['success' => false, 'error' => 'That port is not valid.']);
    $enc = in_array($d['encryption'] ?? 'ssl', ['ssl', 'tls', 'none'], true) ? $d['encryption'] : 'ssl';
    $username = trim((string)($d['username'] ?? '')) ?: $email;
    $password = (string)($d['password'] ?? '');

    $rows = plc_seeds();
    // An empty password on an existing seed means "leave it as it was", so the
    // form does not have to echo a stored secret back to the browser.
    if ($password === '' && isset($rows[$id]['password'])) $password = $rows[$id]['password'];
    if ($password === '') out(['success' => false, 'error' => 'An app password is required to read the mailbox.']);

    $rows[$id] = compact('email', 'host', 'port', 'username', 'password') + ['encryption' => $enc];
    if (!plc_seeds_save($rows)) out(['success' => false, 'error' => 'Could not write api/data/. Set that folder to 755 on your host.']);
    out(['success' => true, 'seed' => plc_public($id, $rows[$id])]);
}

if ($action === 'seed_remove') {
    if (($user['role'] ?? '') !== 'agency') out(['success' => false, 'error' => 'Only an agency user can remove mailbox credentials.']);
    $id = (string)($d['id'] ?? '');
    $rows = plc_seeds();
    unset($rows[$id]);
    plc_seeds_save($rows);
    out(['success' => true]);
}

if ($action === 'check') {
    if (!plc_can_imap()) {
        out(['success' => false, 'code' => 'no_imap',
             'error' => 'This host does not have the PHP IMAP extension, so the mailbox cannot be read from here. Record the placement by hand instead.']);
    }
    $id = (string)($d['id'] ?? '');
    $marker = trim((string)($d['marker'] ?? ''));
    if ($marker === '' || strlen($marker) < 6) out(['success' => false, 'error' => 'A placement marker is required.']);

    $rows = plc_seeds();
    $s = $rows[$id] ?? null;
    if (!$s) out(['success' => false, 'error' => 'That seed mailbox is not configured.']);

    $flags = '/imap';
    if (($s['encryption'] ?? 'ssl') === 'ssl') $flags .= '/ssl';
    elseif (($s['encryption'] ?? '') === 'tls') $flags .= '/tls';
    else $flags .= '/notls';
    $flags .= '/novalidate-cert';

    $host = $s['host']; $port = (int)$s['port'];
    $u = $s['username']; $p = $s['password'];

    $inbox = plc_folder_has($host, $port, $flags, $u, $p, 'INBOX', $marker);
    if ($inbox === null) {
        out(['success' => false, 'code' => 'connect_failed',
             'error' => 'Could not sign in to that mailbox. Check the host, username and app password. Gmail and Outlook need an app password, not your normal one.']);
    }
    if ($inbox) out(['success' => true, 'placement' => 'inbox', 'folder' => 'INBOX']);

    // Not in the inbox: look wherever this provider files junk.
    $prefix = '{' . $host . ':' . $port . $flags . '}';
    $probe = @imap_open($prefix . 'INBOX', $u, $p, 0, 1);
    $spamFolders = $probe ? plc_spam_folders($probe, $prefix) : ['Spam', 'Junk'];
    if ($probe) @imap_close($probe);

    foreach ($spamFolders as $folder) {
        $found = plc_folder_has($host, $port, $flags, $u, $p, $folder, $marker);
        if ($found) out(['success' => true, 'placement' => 'spam', 'folder' => $folder]);
    }

    out(['success' => true, 'placement' => 'missing', 'folder' => null,
         'searched' => array_merge(['INBOX'], $spamFolders),
         'note' => 'The message was not in the inbox or any junk folder. It may still be in transit, or it may have been rejected outright.']);
}

out(['success' => false, 'error' => 'Unknown action.']);
