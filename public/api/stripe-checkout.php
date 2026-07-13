<?php
/**
 * stripe-checkout.php — creates a real Stripe Checkout Session (subscription).
 * Uses the Stripe REST API directly (no SDK needed).
 *
 * Two ways to authorise the Stripe secret:
 *   1. Agency passes `secretKey` (sk_…) directly per request (never stored).
 *   2. Client self-service: pass a session `token` instead; the secret is read
 *      from the server-side config (set once by the agency via stripe-config.php),
 *      and access is checked against the caller's account.
 *
 * POST JSON:
 *   { secretKey|token, mode:'subscription', priceId?, amount?, currency?,
 *     productName, customerEmail, successUrl, cancelUrl, accountId }
 * Returns: { success, url, id, error }
 *
 * Provide EITHER priceId (a Stripe Price you created) OR amount+productName
 * (we create an inline recurring price on the fly).
 */
require __DIR__ . '/_db.php';
crm_cors();

$d          = json_decode(file_get_contents('php://input'), true) ?? [];
$secret     = trim($d['secretKey'] ?? '');
$accountIdIn = $d['accountId'] ?? '';

/* Client self-service path: no key passed, resolve it server-side. */
if (!$secret && !empty($d['token'])) {
    $user = crm_user_from_token($d['token']);
    if (!$user || !crm_can_access($user, $accountIdIn)) { echo json_encode(['success' => false, 'error' => 'Not authorised.']); exit; }
    $cfg = crm_config();
    $secret = trim($cfg['stripe_secret'] ?? '');
    if (!$secret) { echo json_encode(['success' => false, 'error' => 'Billing is not enabled for this account yet.']); exit; }
}
$priceId    = trim($d['priceId'] ?? '');
$amount     = intval($d['amount'] ?? 0);          // in major units (dollars)
$currency   = strtolower($d['currency'] ?? 'usd');
$product    = $d['productName'] ?? 'Subscription';
$email      = trim($d['customerEmail'] ?? '');
$successUrl = $d['successUrl'] ?? '';
$cancelUrl  = $d['cancelUrl'] ?? '';
$accountId  = $d['accountId'] ?? '';

if (!$secret || strpos($secret, 'sk_') !== 0) { echo json_encode(['success' => false, 'error' => 'A valid Stripe secret key (sk_…) is required.']); exit; }
if (!$successUrl || !$cancelUrl) { echo json_encode(['success' => false, 'error' => 'success/cancel URLs required.']); exit; }
if (!$priceId && $amount <= 0) { echo json_encode(['success' => false, 'error' => 'Provide a Stripe price ID or an amount.']); exit; }

/* Build form-encoded params for the Checkout Session */
$params = [
    'mode' => 'subscription',
    'success_url' => $successUrl,
    'cancel_url' => $cancelUrl,
    'line_items[0][quantity]' => 1,
    'client_reference_id' => $accountId,
    'allow_promotion_codes' => 'true',
];
if ($email) $params['customer_email'] = $email;

if ($priceId) {
    $params['line_items[0][price]'] = $priceId;
} else {
    // Inline price: recurring monthly
    $params['line_items[0][price_data][currency]'] = $currency;
    $params['line_items[0][price_data][product_data][name]'] = $product;
    $params['line_items[0][price_data][unit_amount]'] = $amount * 100;      // cents
    $params['line_items[0][price_data][recurring][interval]'] = 'month';
}

$ch = curl_init('https://api.stripe.com/v1/checkout/sessions');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => http_build_query($params),
    CURLOPT_USERPWD => $secret . ':',
    CURLOPT_TIMEOUT => 25,
]);
$raw = curl_exec($ch);
if ($raw === false) { echo json_encode(['success' => false, 'error' => 'Stripe request failed: ' . curl_error($ch)]); exit; }
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$resp = json_decode($raw, true);
if ($code >= 400 || isset($resp['error'])) {
    echo json_encode(['success' => false, 'error' => $resp['error']['message'] ?? "Stripe error (HTTP $code)"]);
    exit;
}

echo json_encode(['success' => true, 'url' => $resp['url'] ?? '', 'id' => $resp['id'] ?? '']);
