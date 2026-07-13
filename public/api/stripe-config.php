<?php
/**
 * stripe-config.php — agency stores the Stripe secret + webhook secret
 * server-side (in api/config.php) so client-facing checkout and the customer
 * portal work without ever exposing the key to clients.
 *
 * POST JSON:
 *   status { token }                              → { success, hasSecret }
 *   record { token, accountId }                   → { success, status, hasCustomer }
 *   save   { token, secretKey, webhookSecret }    (agency only) → { success }
 */
require __DIR__ . '/_db.php';
crm_cors();

$d = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $d['action'] ?? 'status';
function out($x) { echo json_encode($x); exit; }

$user = crm_user_from_token($d['token'] ?? '');

if ($action === 'status') {
    $cfg = crm_config();
    out(['success' => true, 'hasSecret' => !empty($cfg['stripe_secret'])]);
}

if ($action === 'record') {
    $accountId = $d['accountId'] ?? '';
    if (!$user || !crm_can_access($user, $accountId)) out(['success' => false, 'error' => 'Not authorised.']);
    $pdo = crm_pdo();
    if (!$pdo) out(['success' => true, 'status' => 'none', 'hasCustomer' => false]);
    $rec = crm_billing_record($pdo, $accountId);
    out(['success' => true, 'status' => $rec['status'] ?? 'none', 'hasCustomer' => !empty($rec['customer'])]);
}

if (!$user || $user['role'] !== 'agency') out(['success' => false, 'error' => 'Not authorised.']);

if ($action === 'save') {
    if (!crm_is_configured()) out(['success' => false, 'error' => 'Set up the Cloud Database first (config.php is created there).']);
    $patch = [];
    if (isset($d['secretKey'])) $patch['stripe_secret'] = trim($d['secretKey']);
    if (isset($d['webhookSecret'])) $patch['stripe_webhook_secret'] = trim($d['webhookSecret']);
    out(crm_config_write($patch) ? ['success' => true] : ['success' => false, 'error' => 'Could not write config.php.']);
}

out(['success' => false, 'error' => 'Unknown action.']);
