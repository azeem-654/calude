<?php
/**
 * track.php — real email open/click tracking.
 *
 * The SPA has no server of its own, so opens and clicks could never be
 * detected from the browser alone. This endpoint closes that gap: outbound
 * emails embed a 1x1 pixel and wrap their links, both pointing here, and the
 * app polls `events` to fold the results back into each contact's history.
 *
 * Storage mirrors booking.php — MySQL when the cloud DB is installed,
 * otherwise a server-side JSON file so it works with zero configuration.
 *
 *   GET  ?o=<emailId>&a=<accountId>            → 1x1 GIF, records an open
 *   GET  ?c=<emailId>&a=<accountId>&u=<url>    → 302 to url, records a click
 *   GET  ?events=1&a=<accountId>&since=<iso>   → JSON of events for syncing
 */
require __DIR__ . '/_db.php';

const TRK = '__track__';
const TRK_FILE = __DIR__ . '/data/track.json';

function trk_file_load() {
    if (!file_exists(TRK_FILE)) return ['events' => []];
    $j = json_decode(@file_get_contents(TRK_FILE), true);
    return is_array($j) && isset($j['events']) ? $j : ['events' => []];
}
function trk_file_save($data) {
    $dir = dirname(TRK_FILE);
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $fp = @fopen(TRK_FILE, 'c+');
    if (!$fp) return false;
    flock($fp, LOCK_EX);
    ftruncate($fp, 0);
    fwrite($fp, json_encode($data));
    flock($fp, LOCK_UN);
    fclose($fp);
    return true;
}

/** Append one tracking event, capped so the store cannot grow without bound. */
function trk_record($pdo, $account, $emailId, $kind, $url = '') {
    $ev = [
        'emailId' => $emailId,
        'account'  => $account,
        'kind'     => $kind,              // 'open' | 'click'
        'url'      => $url,
        'at'       => gmdate('c'),
        'ua'       => substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 180),
    ];
    if (!$pdo) {
        $f = trk_file_load();
        $f['events'][] = $ev;
        if (count($f['events']) > 5000) $f['events'] = array_slice($f['events'], -5000);
        trk_file_save($f);
        return;
    }
    $s = $pdo->prepare('INSERT INTO crm_data (account_id, k, v, updated_at) VALUES (?,?,?,?)');
    $s->execute([TRK, 'ev_' . uniqid('', true), json_encode($ev), date('Y-m-d H:i:s')]);
}

function trk_events($pdo, $account, $since) {
    $out = [];
    if (!$pdo) {
        foreach (trk_file_load()['events'] as $e) {
            if (($e['account'] ?? '') === $account && (!$since || ($e['at'] ?? '') > $since)) $out[] = $e;
        }
        return $out;
    }
    $s = $pdo->prepare("SELECT v FROM crm_data WHERE account_id = ? AND k LIKE 'ev_%'");
    $s->execute([TRK]);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $e = json_decode($row['v'], true);
        if (!$e) continue;
        if (($e['account'] ?? '') === $account && (!$since || ($e['at'] ?? '') > $since)) $out[] = $e;
    }
    return $out;
}

$pdo = crm_pdo();
$account = substr((string)($_GET['a'] ?? ''), 0, 80);

/* ── Open pixel ── */
if (isset($_GET['o'])) {
    $id = substr((string)$_GET['o'], 0, 120);
    if ($id && $account) trk_record($pdo, $account, $id, 'open');
    header('Content-Type: image/gif');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    // 1x1 transparent GIF
    echo base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
    exit;
}

/* ── Click redirect ── */
if (isset($_GET['c'])) {
    $id  = substr((string)$_GET['c'], 0, 120);
    $url = (string)($_GET['u'] ?? '');
    // Only ever redirect to absolute http(s) URLs — never an open redirect to
    // javascript:, data: or a protocol-relative host.
    $ok = preg_match('#^https?://[^\s"<>]+$#i', $url) === 1;
    if ($id && $account) trk_record($pdo, $account, $id, 'click', $ok ? $url : '');
    header('Location: ' . ($ok ? $url : '/'), true, 302);
    exit;
}

/* ── Event feed for the app to sync ── */
crm_cors();
header('Content-Type: application/json');
if (isset($_GET['events'])) {
    $since = substr((string)($_GET['since'] ?? ''), 0, 40);
    echo json_encode(['success' => true, 'events' => trk_events($pdo, $account, $since)]);
    exit;
}

echo json_encode(['success' => false, 'error' => 'Unknown action']);
