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
 *   bulk_set{ accountId, items: {k:v} }    → { success, count, rejected: [...] }
 *   caps    { }                            → { success, matrix }
 *
 * Values are the raw JSON strings the frontend already stores in localStorage.
 *
 * Writes to permission-sensitive keys (see _perm.php) are diffed against what
 * is already stored and rejected if they touch a record the caller may not
 * touch. This is the only path to the server store, so the permission model is
 * enforced here rather than only in the UI.
 */
require __DIR__ . '/_db.php';
require __DIR__ . '/_perm.php';
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

    if ($action === 'caps') {
        out(['success' => true, 'matrix' => crm_capability_matrix($user)]);
    }

    if ($action === 'set') {
        $k = $d['key'] ?? ''; $v = $d['value'] ?? '';
        if (!$k) out(['success' => false, 'error' => 'key required']);
        $guard = crm_guard_write($pdo, $user, $accountId, $k, $v);
        if (!$guard['ok']) out(['success' => false, 'error' => $guard['error'], 'rejected' => [$k], 'authoritative' => [$k => $guard['value']]]);
        $stmt = $pdo->prepare(crm_upsert_sql($pdo));
        $stmt->execute([$accountId, $k, $guard['value'], crm_now()]);
        out(['success' => true]);
    }

    if ($action === 'delete') {
        $k = $d['key'] ?? '';
        $guard = crm_guard_write($pdo, $user, $accountId, $k, null);
        if (!$guard['ok']) out(['success' => false, 'error' => $guard['error'], 'rejected' => [$k]]);
        $stmt = $pdo->prepare('DELETE FROM crm_data WHERE account_id = ? AND k = ?');
        $stmt->execute([$accountId, $k]);
        out(['success' => true]);
    }

    if ($action === 'bulk_set') {
        $items = $d['items'] ?? [];
        if (!is_array($items)) out(['success' => false, 'error' => 'items must be an object']);
        $stmt = $pdo->prepare(crm_upsert_sql($pdo));
        $del = $pdo->prepare('DELETE FROM crm_data WHERE account_id = ? AND k = ?');
        // Guard every item first: a batch that contains a forbidden change is
        // applied without that item rather than being written wholesale, and the
        // caller is told exactly what was refused plus the authoritative value
        // so its local copy can be corrected instead of silently diverging.
        $rejected = [];
        $errors = [];
        $authoritative = [];
        $allowed = [];
        foreach ($items as $k => $v) {
            $guard = crm_guard_write($pdo, $user, $accountId, $k, $v);
            if ($guard['ok']) { $allowed[$k] = $guard['value']; continue; }
            $rejected[] = $k;
            $errors[] = $guard['error'];
            $authoritative[$k] = $guard['value'];
        }

        $pdo->beginTransaction();
        $n = 0;
        foreach ($allowed as $k => $v) {
            if ($v === null) { $del->execute([$accountId, $k]); }
            else { $stmt->execute([$accountId, $k, $v, crm_now()]); }
            $n++;
        }
        $pdo->commit();
        out([
            'success' => empty($rejected),
            'count' => $n,
            'rejected' => $rejected,
            'error' => $errors ? implode(' ', array_unique($errors)) : null,
            'authoritative' => $authoritative,
        ]);
    }

    out(['success' => false, 'error' => 'Unknown action.']);
} catch (Throwable $e) {
    out(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
}
