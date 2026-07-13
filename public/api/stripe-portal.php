<?php
/**
 * stripe-portal.php — creates a Stripe Billing Portal session so a client can
 * manage their own subscription & payment method. Uses the agency's
 * server-side Stripe secret; the client's stored customer id comes from the
 * webhook (checkout.session.completed).
 *
 * POST JSON { token, accountId, returnUrl } → { success, url, error }
 */
require __DIR__ . '/_db.php';
crm_cors();

$d = json_decode(file_get_contents('php://input'), true) ?? [];
function out($x) { echo json_encode($x); exit; }

$pdo = crm_pdo();
if (!$pdo) out(['success' => false, 'error' => 'Cloud database not configured.']);

$user = crm_user_from_token($d['token'] ?? '');
$accountId = $d['accountId'] ?? '';
if (!$user || !crm_can_access($user, $accountId)) out(['success' => false, 'error' => 'Not authorised.']);

$cfg = crm_config();
$secret = $cfg['stripe_secret'] ?? '';
if (!$secret) out(['success' => false, 'error' => 'Billing is not enabled for this account yet.']);

$rec = crm_billing_record($pdo, $accountId);
$customer = $rec['customer'] ?? '';
if (!$customer) out(['success' => false, 'error' => 'No active subscription found for this account yet.']);

$params = ['customer' => $customer];
if (!empty($d['returnUrl'])) $params['return_url'] = $d['returnUrl'];

$ch = curl_init('https://api.stripe.com/v1/billing_portal/sessions');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => http_build_query($params),
    CURLOPT_USERPWD => $secret . ':',
    CURLOPT_TIMEOUT => 20,
]);
$raw = curl_exec($ch);
if ($raw === false) out(['success' => false, 'error' => 'Stripe request failed: ' . curl_error($ch)]);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$resp = json_decode($raw, true);
if ($code >= 400 || isset($resp['error'])) out(['success' => false, 'error' => $resp['error']['message'] ?? "Stripe error (HTTP $code)"]);

out(['success' => true, 'url' => $resp['url'] ?? '']);
