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

/**
 * ── Signature verification. Required, not optional. ──
 *
 * This endpoint's whole job is to write "this account has paid" into the
 * database, and it is a public URL. Verification used to be skipped whenever no
 * signing secret was configured — which is the state every install is in until
 * someone pastes one in — so a single unauthenticated POST naming any account
 * id granted that account an active subscription. It is checked and it does:
 *
 *   curl -d '{"type":"checkout.session.completed",
 *             "data":{"object":{"client_reference_id":"acct_x"}}}' .../stripe-webhook.php
 *   → crm_billing_status_acct_x = {"status":"active"}
 *
 * So an unconfigured endpoint now refuses everything rather than trusting
 * everything. Stripe surfaces the failure and this message in the webhook's
 * delivery log, which is where whoever set it up will be looking.
 */
$cfg = crm_config();
$secret = $cfg['stripe_webhook_secret'] ?? '';
if (!$secret) {
    http_response_code(503);
    echo 'webhook-not-configured: set stripe_webhook_secret in api/config.php before enabling this endpoint';
    exit;
}
$sig = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';
if (!verify_stripe_sig($payload, $sig, $secret)) { http_response_code(400); echo 'bad-signature'; exit; }

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
    // Use the shared upsert rather than inline MySQL. The hand-written version
    // here used ON DUPLICATE KEY UPDATE and NOW(), neither of which SQLite
    // accepts, so this endpoint alone could not run on the SQLite driver the
    // rest of the code supports — which is also the reason it had never been
    // exercised by a test.
    $stmt = $pdo->prepare(crm_upsert_sql($pdo));
    $stmt->execute(['__agency__', "crm_billing_status_{$accountId}", $val, crm_now()]);
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
