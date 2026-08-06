<?php
/**
 * _db.php — shared helpers: MySQL connection, session/user resolution, and the
 * guarded JSON stores under api/data/.
 * Included by the endpoints. Not a public endpoint itself.
 */

/* ── Guarded file stores ───────────────────────────────────────────────────
 * api/data/ holds session tokens, password hashes and guest contact details.
 * On shared hosting there is no directory outside the web root to put them in,
 * and .htaccess is not guaranteed to be honoured — so every store is written
 * as a .php file beginning with an exit guard. Fetched directly it is executed,
 * returns 404 and prints nothing; read through these helpers the guard is
 * stripped and the JSON behind it is returned.
 */

const CRM_STORE_GUARD = "<?php http_response_code(404); exit; ?>\n";

function crm_store_dir() {
    $dir = __DIR__ . '/data';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    return $dir;
}

/** Absolute path of a store, e.g. crm_store_path('users') → …/data/users.php */
function crm_store_path($name) { return crm_store_dir() . '/' . $name . '.php'; }

/** Strip the exit guard, if present, and decode. Returns null when unusable. */
function crm_store_decode($raw) {
    if (!is_string($raw) || $raw === '') return null;
    if (strncmp($raw, '<?php', 5) === 0) {
        $end = strpos($raw, '?>');
        if ($end === false) return null;
        $raw = substr($raw, $end + 2);
    }
    $j = json_decode(trim($raw), true);
    return is_array($j) ? $j : null;
}

function crm_store_encode($data) { return CRM_STORE_GUARD . json_encode($data); }

/**
 * Read a store, migrating a legacy unguarded data/<name>.json in place. The
 * legacy file is rewritten as guarded and removed, so an install that predates
 * this can never keep serving its tokens as plain JSON.
 */
function crm_store_load($name, $fallback = []) {
    $path = crm_store_path($name);
    if (file_exists($path)) {
        $data = crm_store_decode(@file_get_contents($path));
        return $data === null ? $fallback : $data;
    }
    $legacy = crm_store_dir() . '/' . $name . '.json';
    if (file_exists($legacy)) {
        $data = crm_store_decode(@file_get_contents($legacy));
        if ($data !== null) {
            crm_store_save($name, $data);
            @unlink($legacy);
            return $data;
        }
    }
    return $fallback;
}

function crm_store_save($name, $data) {
    $path = crm_store_path($name);
    $ok = @file_put_contents($path, crm_store_encode($data), LOCK_EX) !== false;
    if ($ok) @chmod($path, 0600);
    return $ok;
}

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

/**
 * Upsert statement for the crm_data table that works on both MySQL (production)
 * and SQLite (local development and tests), so the same code path is exercised
 * either way instead of only being provable against a live MySQL host.
 */
function crm_upsert_sql($pdo) {
    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($driver === 'sqlite') {
        return 'INSERT INTO crm_data (account_id, k, v, updated_at) VALUES (?,?,?,?)
                ON CONFLICT(account_id, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at';
    }
    return 'INSERT INTO crm_data (account_id, k, v, updated_at) VALUES (?,?,?,?)
            ON DUPLICATE KEY UPDATE v = VALUES(v), updated_at = VALUES(updated_at)';
}

/** UTC timestamp in the format both drivers accept for a DATETIME column. */
function crm_now() { return gmdate('Y-m-d H:i:s'); }

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
    if (!$token) return null;
    $db = crm_store_load('users', null);
    if (!is_array($db)) return null;
    $s = $db['sessions'][$token] ?? null;
    if (!$s || ($s['exp'] ?? 0) < time()) return null;
    foreach (($db['users'] ?? []) as $u) {
        if ($u['email'] === $s['email']) {
            return [
                'email'     => $u['email'],
                'name'      => $u['name'] ?? '',
                'role'      => $u['role'],
                'accountId' => $u['accountId'] ?? null,
            ];
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
