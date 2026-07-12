<?php
/**
 * auth.php — lightweight account auth for the CRM client portal.
 *
 * Stores users in api/data/users.json (created 0600). Passwords are bcrypt
 * hashed. Sessions are opaque tokens kept in the same file with an expiry.
 *
 * POST JSON { action, ... }:
 *   bootstrap  { email, password, name }                      → create the first (agency) owner
 *   login      { email, password }                            → { token, user }
 *   me         { token }                                      → { user }
 *   logout     { token }                                      → { ok }
 *   create_user{ token, email, password, name, role, accountId } (agency only)
 *   list_users { token }                                      (agency only)
 *   delete_user{ token, email }                               (agency only)
 *   set_password{ token, email, password }                    (agency, or self)
 */
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: {$origin}");
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Vary: Origin');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$DIR  = __DIR__ . '/data';
$FILE = $DIR . '/users.json';
if (!is_dir($DIR)) @mkdir($DIR, 0700, true);

function db_load($FILE) {
    if (!file_exists($FILE)) return ['users' => [], 'sessions' => []];
    $j = json_decode(file_get_contents($FILE), true);
    return is_array($j) ? $j : ['users' => [], 'sessions' => []];
}
function db_save($FILE, $db) {
    file_put_contents($FILE, json_encode($db), LOCK_EX);
    @chmod($FILE, 0600);
}
function out($x) { echo json_encode($x); exit; }
function tok() { return bin2hex(random_bytes(24)); }
function pub($u) { return ['email' => $u['email'], 'name' => $u['name'], 'role' => $u['role'], 'accountId' => $u['accountId'] ?? null]; }

function user_by_token($db, $token) {
    $s = $db['sessions'][$token] ?? null;
    if (!$s || $s['exp'] < time()) return null;
    foreach ($db['users'] as $u) if ($u['email'] === $s['email']) return $u;
    return null;
}

$d      = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $d['action'] ?? '';
$db     = db_load($FILE);

if ($action === 'bootstrap') {
    if (count($db['users']) > 0) out(['success' => false, 'error' => 'Already initialised.']);
    $email = strtolower(trim($d['email'] ?? ''));
    if (!$email || !($d['password'] ?? '')) out(['success' => false, 'error' => 'Email and password required.']);
    $db['users'][] = ['email' => $email, 'name' => $d['name'] ?? 'Owner', 'role' => 'agency', 'accountId' => null, 'hash' => password_hash($d['password'], PASSWORD_BCRYPT)];
    db_save($FILE, $db);
    out(['success' => true]);
}

if ($action === 'login') {
    $email = strtolower(trim($d['email'] ?? ''));
    foreach ($db['users'] as $u) {
        if ($u['email'] === $email && password_verify($d['password'] ?? '', $u['hash'])) {
            $t = tok();
            $db['sessions'][$t] = ['email' => $email, 'exp' => time() + 60 * 60 * 24 * 30];
            db_save($FILE, $db);
            out(['success' => true, 'token' => $t, 'user' => pub($u)]);
        }
    }
    out(['success' => false, 'error' => 'Invalid email or password.']);
}

if ($action === 'me') {
    $u = user_by_token($db, $d['token'] ?? '');
    out($u ? ['success' => true, 'user' => pub($u)] : ['success' => false, 'error' => 'Session expired.']);
}

if ($action === 'logout') {
    unset($db['sessions'][$d['token'] ?? '']);
    db_save($FILE, $db);
    out(['success' => true]);
}

/* ── agency-only below ── */
$me = user_by_token($db, $d['token'] ?? '');
if (!$me || $me['role'] !== 'agency') out(['success' => false, 'error' => 'Not authorised.']);

if ($action === 'list_users') {
    out(['success' => true, 'users' => array_map('pub', $db['users'])]);
}
if ($action === 'create_user') {
    $email = strtolower(trim($d['email'] ?? ''));
    if (!$email || !($d['password'] ?? '')) out(['success' => false, 'error' => 'Email and password required.']);
    foreach ($db['users'] as $u) if ($u['email'] === $email) out(['success' => false, 'error' => 'That email already exists.']);
    $db['users'][] = ['email' => $email, 'name' => $d['name'] ?? '', 'role' => $d['role'] ?? 'client', 'accountId' => $d['accountId'] ?? null, 'hash' => password_hash($d['password'], PASSWORD_BCRYPT)];
    db_save($FILE, $db);
    out(['success' => true]);
}
if ($action === 'delete_user') {
    $db['users'] = array_values(array_filter($db['users'], fn($u) => $u['email'] !== strtolower(trim($d['email'] ?? ''))));
    db_save($FILE, $db);
    out(['success' => true]);
}
if ($action === 'set_password') {
    $email = strtolower(trim($d['email'] ?? ''));
    foreach ($db['users'] as &$u) if ($u['email'] === $email) { $u['hash'] = password_hash($d['password'] ?? '', PASSWORD_BCRYPT); db_save($FILE, $db); out(['success' => true]); }
    out(['success' => false, 'error' => 'User not found.']);
}

out(['success' => false, 'error' => 'Unknown action.']);
