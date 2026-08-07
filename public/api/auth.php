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

require_once __DIR__ . '/_db.php';   // guarded store helpers

// Kept as a parameter so the call sites below stay unchanged; the store name is
// what actually identifies the file now (api/data/users.php, exit-guarded).
$FILE = 'users';

function db_load($FILE) {
    $db = crm_store_load($FILE, ['users' => [], 'sessions' => []]);
    if (!isset($db['users']))    $db['users'] = [];
    if (!isset($db['sessions'])) $db['sessions'] = [];
    return $db;
}
function db_save($FILE, $db) {
    // Drop expired sessions on every write so the token file cannot grow
    // without bound and stale tokens cannot be replayed.
    $now = time();
    $db['sessions'] = array_filter($db['sessions'] ?? [], fn($s) => ($s['exp'] ?? 0) > $now);
    return crm_store_save($FILE, $db);
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

/* Public: has setup already happened, and can we write at all? The browser
   cannot answer either question on its own — it only knows its own storage —
   and guessing produced a setup screen that could never succeed. */
/* The demo login. It exists so the app can be tried without setting up a real
   owner first, and is deliberately kept separate from real accounts: it does
   not count towards "is this workspace set up", so signing up properly stays
   available while it exists. Delete it from Settings → Team & Permissions, or
   remove api/data/users.php, to get rid of it. */
const TEST_USERNAME = 'test';
const TEST_PASSWORD = 'test123';

function is_test_user($u) { return !empty($u['isTest']); }

/** Users excluding the demo login — what "set up" actually means. */
function real_users($db) { return array_values(array_filter($db['users'] ?? [], fn($u) => !is_test_user($u))); }

if ($action === 'status') {
    $real = real_users($db);
    out([
        'success'     => true,
        'initialised' => count($real) > 0,
        'writable'    => crm_store_writable(),
        'accounts'    => count($real),
        'testLogin'   => ['username' => TEST_USERNAME, 'password' => TEST_PASSWORD],
    ]);
}

/**
 * Validate a registration the way a real sign-up should: a usable name, a
 * genuinely well-formed email, and a password that is not trivially guessable.
 * Returns an error string, or '' when the details are acceptable.
 */
function signup_problem($name, $email, $password) {
    if (strlen(trim($name)) < 2) return 'Enter your name.';
    if (strlen(trim($name)) > 80) return 'That name is too long.';
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return 'Enter a valid email address.';
    if (strlen($email) > 254) return 'That email address is too long.';
    if (strlen($password) < 8) return 'Use a password of at least 8 characters.';
    if (strlen($password) > 200) return 'That password is too long.';
    if (!preg_match('/[a-zA-Z]/', $password) || !preg_match('/[0-9]/', $password)) {
        return 'Include at least one letter and one number in your password.';
    }
    $weak = ['password', 'password1', '12345678', 'qwertyui', 'letmein1', 'welcome1', 'iloveyou', 'admin123'];
    if (in_array(strtolower($password), $weak, true)) return 'That password is too common. Choose something harder to guess.';
    // Only match on something distinctive. A four-letter local part like
    // "real" or "mark" appears inside ordinary strong passwords, and rejecting
    // those trains people to think the rules are arbitrary.
    if (strlen(trim($name)) >= 5 && stripos($password, trim($name)) !== false) return 'Do not put your name in your password.';
    $local = explode('@', $email)[0];
    if (strlen($local) >= 5 && stripos($password, $local) !== false) return 'Do not put your email address in your password.';
    return '';
}

if ($action === 'bootstrap') {
    if (count(real_users($db)) > 0) {
        out(['success' => false, 'error' => 'An owner account already exists on this server. Sign in instead.', 'code' => 'already_initialised']);
    }
    $email = strtolower(trim($d['email'] ?? ''));
    $name  = trim($d['name'] ?? '');
    $problem = signup_problem($name, $email, (string)($d['password'] ?? ''));
    if ($problem !== '') out(['success' => false, 'error' => $problem, 'code' => 'invalid']);
    foreach ($db['users'] as $u) {
        if ($u['email'] === $email) out(['success' => false, 'error' => 'An account with that email already exists.', 'code' => 'duplicate']);
    }
    if (!crm_store_writable()) {
        out(['success' => false, 'code' => 'not_writable',
             'error' => 'The server cannot write to api/data/. Set that folder to 755 (or 777) in your host file manager and try again.']);
    }
    $db['users'][] = ['email' => $email, 'name' => $name, 'role' => 'agency', 'accountId' => null,
                      'hash' => password_hash($d['password'], PASSWORD_BCRYPT), 'createdAt' => gmdate('c')];
    if (!db_save($FILE, $db)) {
        out(['success' => false, 'code' => 'not_writable',
             'error' => 'Could not save the account — api/data/ is not writable. Set that folder to 755 in your host file manager and try again.']);
    }
    // Read it back: a write that reported success but stored nothing would
    // otherwise leave you unable to sign in with no explanation.
    $check = db_load($FILE);
    if (!count(real_users($check))) {
        out(['success' => false, 'code' => 'not_writable', 'error' => 'The account did not persist. Check that api/data/ is writable on your host.']);
    }
    out(['success' => true]);
}

if ($action === 'login') {
    $ident = strtolower(trim($d['email'] ?? ''));
    $pass  = (string)($d['password'] ?? '');

    // The demo login is provisioned on first use rather than shipped in the
    // repo, so a fresh install has no account until someone asks for one.
    if ($ident === TEST_USERNAME && $pass === TEST_PASSWORD) {
        $has = false;
        foreach ($db['users'] as $u) if (is_test_user($u)) { $has = true; break; }
        if (!$has && crm_store_writable()) {
            $db['users'][] = [
                'email' => 'test@example.test', 'username' => TEST_USERNAME,
                'name' => 'Test Account', 'role' => 'agency', 'accountId' => null,
                'isTest' => true, 'hash' => password_hash(TEST_PASSWORD, PASSWORD_BCRYPT),
                'createdAt' => gmdate('c'),
            ];
            db_save($FILE, $db);
        }
    }

    foreach ($db['users'] as $u) {
        $matches = $u['email'] === $ident || (isset($u['username']) && strtolower($u['username']) === $ident);
        if ($matches && password_verify($pass, $u['hash'])) {
            $t = tok();
            // Sessions key off the account's own email, not what was typed —
            // signing in by username must resolve to the same identity.
            $db['sessions'][$t] = ['email' => $u['email'], 'exp' => time() + 60 * 60 * 24 * 30];
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
