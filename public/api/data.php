<?php
/**
 * data.php — account-scoped key/value store so each workspace's CRM data
 * lives server-side and follows the login across devices.
 *
 * POST JSON { action, token, ... }:
 *   ping                                  → { success, configured }
 *   get_all { accountId }                 → { success, rows: { key: value } }
 *   set     { accountId, key, value }      → { success }
 *   delete  { accountId, key }             → { success }
 *   bulk_set{ accountId, items: {k:v} }    → { success, count }
 *
 * Values are the raw JSON strings the frontend already stores in localStorage.
 */
require __DIR__ . '/_db.php';
crm_cors();

$d = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $d['action'] ?? '';

function out($x) { echo json_encode($x); exit; }

if ($action === 'ping') {
    $pdo = crm_pdo();
    out(['success' => true, 'configured' => crm_is_configured() && $pdo !== null]);
}

$pdo = crm_pdo();
if (!$pdo) out(['success' => false, 'configured' => false, 'error' => 'Cloud database not configured.']);

$user = crm_user_from_token($d['token'] ?? '');
if (!$user) out(['success' => false, 'error' => 'Not authenticated.']);

$accountId = $d['accountId'] ?? '';
if (!$accountId || !crm_can_access($user, $accountId)) out(['success' => false, 'error' => 'Not authorised for this workspace.']);

try {
    if ($action === 'get_all') {
        $stmt = $pdo->prepare('SELECT k, v FROM crm_data WHERE account_id = ?');
        $stmt->execute([$accountId]);
        $rows = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) $rows[$r['k']] = $r['v'];
        out(['success' => true, 'rows' => $rows]);
    }

    if ($action === 'set') {
        $k = $d['key'] ?? ''; $v = $d['value'] ?? '';
        if (!$k) out(['success' => false, 'error' => 'key required']);
        $stmt = $pdo->prepare('INSERT INTO crm_data (account_id, k, v, updated_at) VALUES (?,?,?,NOW())
                               ON DUPLICATE KEY UPDATE v = VALUES(v), updated_at = NOW()');
        $stmt->execute([$accountId, $k, $v]);
        out(['success' => true]);
    }

    if ($action === 'delete') {
        $stmt = $pdo->prepare('DELETE FROM crm_data WHERE account_id = ? AND k = ?');
        $stmt->execute([$accountId, $d['key'] ?? '']);
        out(['success' => true]);
    }

    if ($action === 'bulk_set') {
        $items = $d['items'] ?? [];
        if (!is_array($items)) out(['success' => false, 'error' => 'items must be an object']);
        $stmt = $pdo->prepare('INSERT INTO crm_data (account_id, k, v, updated_at) VALUES (?,?,?,NOW())
                               ON DUPLICATE KEY UPDATE v = VALUES(v), updated_at = NOW()');
        $del = $pdo->prepare('DELETE FROM crm_data WHERE account_id = ? AND k = ?');
        $pdo->beginTransaction();
        $n = 0;
        foreach ($items as $k => $v) {
            if ($v === null) { $del->execute([$accountId, $k]); }
            else { $stmt->execute([$accountId, $k, $v]); }
            $n++;
        }
        $pdo->commit();
        out(['success' => true, 'count' => $n]);
    }

    out(['success' => false, 'error' => 'Unknown action.']);
} catch (Throwable $e) {
    out(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
}
