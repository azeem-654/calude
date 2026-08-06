<?php
/**
 * install.php — one-time cloud-database installer (Freehostia MySQL).
 *
 * Tests the provided MySQL credentials, writes api/config.php (0600), and
 * creates the crm_data table. Refuses to run once config.php exists (so it
 * can't be used to overwrite a live config). Run it from the app's
 * "Cloud Database" setup screen.
 *
 * Requires an agency session once any user account exists, so that a public
 * endpoint cannot be used to point a running install at someone else's
 * database. Before the first account is created there is nothing to protect
 * and no way to authenticate, so first-run setup stays open.
 *
 * POST JSON { token, host, db, user, pass } → { success, error }
 */
require __DIR__ . '/_db.php';   // for crm_cors() and the guarded user store
crm_cors();

$cfgFile = __DIR__ . '/config.php';
if (file_exists($cfgFile)) {
    echo json_encode(['success' => false, 'error' => 'Already installed. Delete api/config.php first to reinstall.']);
    exit;
}

$d = json_decode(file_get_contents('php://input'), true) ?? [];

$users = crm_store_load('users', ['users' => []]);
if (!empty($users['users'])) {
    $me = crm_user_from_token($d['token'] ?? '');
    if (!$me || ($me['role'] ?? '') !== 'agency') {
        echo json_encode(['success' => false, 'error' => 'Sign in as an agency user to connect the database.']);
        exit;
    }
}

$host = trim($d['host'] ?? 'localhost');
$dbn  = trim($d['db']   ?? '');
$user = trim($d['user'] ?? '');
$pass = $d['pass'] ?? '';

if (!$dbn || !$user) { echo json_encode(['success' => false, 'error' => 'Database name and user are required.']); exit; }

try {
    $pdo = new PDO("mysql:host={$host};dbname={$dbn};charset=utf8mb4", $user, $pass,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 8]);
} catch (Throwable $e) {
    echo json_encode(['success' => false, 'error' => 'Could not connect: ' . $e->getMessage()]);
    exit;
}

try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS crm_data (
        account_id VARCHAR(64) NOT NULL,
        k          VARCHAR(191) NOT NULL,
        v          LONGTEXT,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (account_id, k),
        INDEX idx_account (account_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
} catch (Throwable $e) {
    echo json_encode(['success' => false, 'error' => 'Could not create table: ' . $e->getMessage()]);
    exit;
}

$php = "<?php\nreturn " . var_export(['host' => $host, 'db' => $dbn, 'user' => $user, 'pass' => $pass], true) . ";\n";
if (@file_put_contents($cfgFile, $php) === false) {
    echo json_encode(['success' => false, 'error' => 'Connected & table created, but could not write api/config.php (check folder permissions).']);
    exit;
}
@chmod($cfgFile, 0600);

echo json_encode(['success' => true]);
