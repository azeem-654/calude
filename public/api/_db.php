<?php
/**
 * _db.php — shared helpers: MySQL connection + session/user resolution.
 * Included by data.php and install.php. Not a public endpoint.
 */

/** Returns a PDO to the CRM database, or null if not configured / unreachable. */
function crm_pdo() {
    static $pdo = null; static $tried = false;
    if ($tried) return $pdo;
    $tried = true;
    $cfgFile = __DIR__ . '/config.php';
    if (!file_exists($cfgFile)) return null;
    $cfg = require $cfgFile;   // returns ['host'=>,'db'=>,'user'=>,'pass'=>] (or sqlite for dev/tests)
    try {
        if (($cfg['driver'] ?? '') === 'sqlite') {
            $pdo = new PDO('sqlite:' . $cfg['file'], null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        } else {
            $pdo = new PDO(
                "mysql:host={$cfg['host']};dbname={$cfg['db']};charset=utf8mb4",
                $cfg['user'], $cfg['pass'],
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 8]
            );
        }
    } catch (Throwable $e) { $pdo = null; }
    return $pdo;
}

function crm_is_configured() { return file_exists(__DIR__ . '/config.php'); }

/** Load the full config array (DB creds + optional stripe keys), or []. */
function crm_config() {
    $f = __DIR__ . '/config.php';
    if (!file_exists($f)) return [];
    $c = require $f;
    return is_array($c) ? $c : [];
}
/** Merge keys into config.php (preserving existing), 0600. */
function crm_config_write($patch) {
    $f = __DIR__ . '/config.php';
    $cur = crm_config();
    $merged = array_merge($cur, $patch);
    $php = "<?php\nreturn " . var_export($merged, true) . ";\n";
    if (@file_put_contents($f, $php) === false) return false;
    @chmod($f, 0600);
    return true;
}
/** Read a stored per-account billing record (customer id + status) from crm_data. */
function crm_billing_record($pdo, $accountId) {
    try {
        $stmt = $pdo->prepare('SELECT v FROM crm_data WHERE account_id = ? AND k = ?');
        $stmt->execute(['__agency__', "crm_billing_status_{$accountId}"]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ? (json_decode($row['v'], true) ?: []) : [];
    } catch (Throwable $e) { return []; }
}

/** Resolve the current user from a session token stored by auth.php (data/users.json). */
function crm_user_from_token($token) {
    $file = __DIR__ . '/data/users.json';
    if (!$token || !file_exists($file)) return null;
    $db = json_decode(file_get_contents($file), true);
    if (!is_array($db)) return null;
    $s = $db['sessions'][$token] ?? null;
    if (!$s || ($s['exp'] ?? 0) < time()) return null;
    foreach (($db['users'] ?? []) as $u) {
        if ($u['email'] === $s['email']) {
            return ['email' => $u['email'], 'role' => $u['role'], 'accountId' => $u['accountId'] ?? null];
        }
    }
    return null;
}

/** Agency can touch any account; clients only their own. */
function crm_can_access($user, $accountId) {
    if (!$user) return false;
    if ($user['role'] === 'agency') return true;
    return $user['accountId'] === $accountId;
}

function crm_cors() {
    header('Content-Type: application/json');
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Vary: Origin');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
}
