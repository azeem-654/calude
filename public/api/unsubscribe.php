<?php
/**
 * unsubscribe.php — the link at the bottom of every campaign, made real.
 *
 * `{{unsubscribe}}` used to merge to the literal string "#unsubscribe": an
 * anchor to nowhere. A recipient who wanted out of a customer's mailing list
 * had no way to get out, which is a legal problem in most of the world before
 * it is a deliverability one — and it is a serious deliverability one, because
 * somebody who cannot unsubscribe presses "report spam" instead, and that is
 * the single fastest way to lose a sending domain.
 *
 * Two ways in, both required by the mailbox providers:
 *
 *   GET  ?e=…&a=…&t=…   a page with one button, for the link in the footer
 *   POST same params    records it — used by that button, and by the one-click
 *                       unsubscribe (RFC 8058) that Gmail and Yahoo put in
 *                       their own UI from the List-Unsubscribe header
 *
 * The address is signed. Without that, the URL out of one person's email is a
 * template for unsubscribing anybody, and a competitor could quietly empty a
 * mailing list one address at a time.
 */
require __DIR__ . '/_db.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

/**
 * The signing key, made once and kept with the other server-side data.
 *
 * Not a constant in the source: this file ships to every install, and a key
 * everybody has is not a key.
 */
function unsub_secret() {
    $store = crm_store_load('unsub_key', []);
    if (!empty($store['key']) && is_string($store['key'])) return $store['key'];
    $key = bin2hex(random_bytes(32));
    crm_store_save('unsub_key', ['key' => $key]);
    return $key;
}

function unsub_sign($email, $account) {
    return substr(hash_hmac('sha256', strtolower(trim($email)) . '|' . $account, unsub_secret()), 0, 32);
}

function unsub_load() {
    $j = crm_store_load('unsubscribes', ['entries' => []]);
    return isset($j['entries']) && is_array($j['entries']) ? $j : ['entries' => []];
}

/* ── Reading the request ── */
$email   = trim($_GET['e'] ?? $_POST['e'] ?? '');
$account = trim($_GET['a'] ?? $_POST['a'] ?? '');
$campaign = trim($_GET['c'] ?? $_POST['c'] ?? '');
$token   = trim($_GET['t'] ?? $_POST['t'] ?? '');

/* The app asks for the list of who has opted out, to fold into its own
   suppression list. Same shape as track.php's events feed. */
if (isset($_GET['list'])) {
    header('Content-Type: application/json');
    $since = $_GET['since'] ?? '';
    $out = [];
    foreach (unsub_load()['entries'] as $e) {
        if ($account !== '' && ($e['account'] ?? '') !== $account) continue;
        if ($since !== '' && ($e['at'] ?? '') <= $since) continue;
        $out[] = $e;
    }
    echo json_encode(['entries' => $out]);
    exit;
}

/* A signing key exists so the app can build links; hand out the signature for
   an address the caller already proved it holds a session for. */
if (isset($_GET['sign'])) {
    header('Content-Type: application/json');
    crm_require_session_for_socket($_GET['token'] ?? '');
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(['success' => false, 'message' => 'A valid email address is required']);
        exit;
    }
    echo json_encode(['success' => true, 'signature' => unsub_sign($email, $account)]);
    exit;
}

$valid = $email !== ''
    && filter_var($email, FILTER_VALIDATE_EMAIL)
    && $token !== ''
    && hash_equals(unsub_sign($email, $account), $token);

/* ── Recording it ── */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!$valid) {
        http_response_code(400);
        echo page('That link is not valid', 'The address or its signature did not check out. Nothing has been changed.', false);
        exit;
    }

    $data = unsub_load();
    $already = false;
    foreach ($data['entries'] as $e) {
        if (strcasecmp($e['email'] ?? '', $email) === 0 && ($e['account'] ?? '') === $account) { $already = true; break; }
    }
    if (!$already) {
        $data['entries'][] = [
            'email'    => strtolower($email),
            'account'  => $account,
            'campaign' => substr($campaign, 0, 64),
            'at'       => gmdate('c'),
            'source'   => isset($_POST['List-Unsubscribe']) ? 'one-click' : 'link',
        ];
        /* Capped like the tracking store, oldest first. */
        if (count($data['entries']) > 5000) $data['entries'] = array_slice($data['entries'], -5000);
        crm_store_save('unsubscribes', $data);
    }

    /* One-click asks for a bare 200 and reads nothing. */
    if (isset($_POST['List-Unsubscribe'])) {
        header('Content-Type: text/plain');
        echo 'OK';
        exit;
    }
    echo page('You have been unsubscribed', 'You will not receive any more marketing email from this sender. It can take a moment to take effect.', true);
    exit;
}

/* ── The page with the button ── */
if (!$valid) {
    http_response_code(400);
    echo page('That link is not valid', 'It may have been copied incompletely. Try clicking the link in the email itself.', false);
    exit;
}
echo page(
    'Unsubscribe',
    'Press the button and ' . htmlspecialchars($email, ENT_QUOTES) . ' will stop receiving marketing email from this sender.',
    false,
    true
);

/**
 * One self-contained page.
 *
 * No stylesheet, no script, no font from anywhere else: this is opened from a
 * mail client by somebody who has already decided they do not want to hear from
 * you, and it has to work on the first try on any connection.
 */
function page($title, $body, $done, $withForm = false) {
    $t = htmlspecialchars($title, ENT_QUOTES);
    $b = $body; // already escaped by the caller where it contains user data
    $accent = $done ? '#16a34a' : '#17191c';
    $form = '';
    if ($withForm) {
        $e = htmlspecialchars($_GET['e'] ?? '', ENT_QUOTES);
        $a = htmlspecialchars($_GET['a'] ?? '', ENT_QUOTES);
        $c = htmlspecialchars($_GET['c'] ?? '', ENT_QUOTES);
        $tk = htmlspecialchars($_GET['t'] ?? '', ENT_QUOTES);
        $form = <<<HTML
<form method="post" style="margin-top:22px">
  <input type="hidden" name="e" value="{$e}">
  <input type="hidden" name="a" value="{$a}">
  <input type="hidden" name="c" value="{$c}">
  <input type="hidden" name="t" value="{$tk}">
  <button type="submit" style="border:none;border-radius:999px;padding:12px 26px;background:#17191c;color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">Unsubscribe me</button>
</form>
HTML;
    }
    return <<<HTML
<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{$t}</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f2f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:24px">
<div style="max-width:460px;width:100%;background:#fff;border-radius:18px;padding:32px 30px;box-shadow:0 1px 2px rgba(23,25,28,.06),0 20px 50px -30px rgba(23,25,28,.4)">
  <div style="width:40px;height:40px;border-radius:999px;background:{$accent};margin-bottom:18px"></div>
  <h1 style="margin:0 0 10px;font-size:21px;font-weight:800;color:#17191c;letter-spacing:-.02em">{$t}</h1>
  <p style="margin:0;font-size:14.5px;line-height:1.65;color:#5c6066">{$b}</p>
  {$form}
</div></body></html>
HTML;
}
