<?php
/**
 * stripe-webhook.php — receives Stripe events and updates each sub-account's
 * subscription status automatically (Paid / Past due / Cancelled).
 *
 * Set this URL as a webhook endpoint in your Stripe dashboard
 * (Developers → Webhooks) and paste the signing secret into api/config.php
 * as 'stripe_webhook_secret'. Subscribes to:
 *   checkout.session.completed, customer.subscription.updated,
 *   customer.subscription.deleted, invoice.payment_failed
 *
 * Status is written into the MySQL crm_data store under the agency-global
 * key `crm_billing_status_<accountId>` so the app reflects it on next sync.
 */
require __DIR__ . '/_db.php';

$pdo = crm_pdo();
if (!$pdo) { http_response_code(200); echo 'db-not-configured'; exit; }

$payload = file_get_contents('php://input');

/* ── Optional signature verification (recommended) ── */
$cfgFile = __DIR__ . '/config.php';
$cfg = file_exists($cfgFile) ? require $cfgFile : [];
$secret = $cfg['stripe_webhook_secret'] ?? '';
if ($secret) {
    $sig = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';
    if (!verify_stripe_sig($payload, $sig, $secret)) { http_response_code(400); echo 'bad-signature'; exit; }
}

$event = json_decode($payload, true);
if (!$event || !isset($event['type'])) { http_response_code(400); echo 'bad-payload'; exit; }

$type = $event['type'];
$obj  = $event['data']['object'] ?? [];

/* Resolve the sub-account id we tagged on the Checkout Session */
$accountId = $obj['client_reference_id'] ?? ($obj['metadata']['accountId'] ?? '');

$status = null;
switch ($type) {
    case 'checkout.session.completed':               $status = 'active'; break;
    case 'customer.subscription.updated':
        $s = $obj['status'] ?? '';
        $status = in_array($s, ['active', 'trialing']) ? 'active' : ($s === 'past_due' ? 'past_due' : ($s === 'canceled' ? 'cancelled' : null));
        break;
    case 'customer.subscription.deleted':            $status = 'cancelled'; break;
    case 'invoice.payment_failed':                   $status = 'past_due'; break;
    default: http_response_code(200); echo 'ignored'; exit;
}

/* Capture the Stripe customer id so the client can open the billing portal */
$customer = '';
if (isset($obj['customer'])) $customer = is_array($obj['customer']) ? ($obj['customer']['id'] ?? '') : $obj['customer'];

if ($accountId && $status) {
    // Merge with any existing record so we don't lose the customer id.
    $prev = crm_billing_record($pdo, $accountId);
    if (!$customer && !empty($prev['customer'])) $customer = $prev['customer'];
    $val = json_encode(['accountId' => $accountId, 'status' => $status, 'customer' => $customer, 'at' => date('c'), 'source' => 'stripe']);
    $stmt = $pdo->prepare('INSERT INTO crm_data (account_id, k, v, updated_at) VALUES (?,?,?,NOW())
                           ON DUPLICATE KEY UPDATE v = VALUES(v), updated_at = NOW()');
    $stmt->execute(['__agency__', "crm_billing_status_{$accountId}", $val]);
}

http_response_code(200);
echo 'ok';

function verify_stripe_sig($payload, $header, $secret) {
    if (!$header) return false;
    $parts = [];
    foreach (explode(',', $header) as $p) { $kv = explode('=', $p, 2); if (count($kv) === 2) $parts[trim($kv[0])] = trim($kv[1]); }
    $t = $parts['t'] ?? ''; $v1 = $parts['v1'] ?? '';
    if (!$t || !$v1) return false;
    $signed = hash_hmac('sha256', $t . '.' . $payload, $secret);
    // constant-time compare + 5-min tolerance
    return hash_equals($signed, $v1) && abs(time() - (int)$t) < 300;
}
