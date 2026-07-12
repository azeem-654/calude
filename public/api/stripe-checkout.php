<?php
/**
 * stripe-checkout.php — creates a real Stripe Checkout Session (subscription).
 * Uses the Stripe REST API directly (no SDK needed). The agency's Stripe
 * SECRET key is passed per request and never stored server-side.
 *
 * POST JSON:
 *   { secretKey, mode:'subscription', priceId?, amount?, currency?, productName,
 *     customerEmail, successUrl, cancelUrl, accountId }
 * Returns: { success, url, id, error }
 *
 * Provide EITHER priceId (a Stripe Price you created) OR amount+productName
 * (we create an inline recurring price on the fly).
 */
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: {$origin}");
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Vary: Origin');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$d          = json_decode(file_get_contents('php://input'), true) ?? [];
$secret     = trim($d['secretKey'] ?? '');
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
