<?php
/**
 * blog-publish.php — puts an article on the customer's own WordPress site.
 *
 * Everything here runs on the server rather than in the browser, for two
 * independent reasons and either one alone would be enough:
 *
 *   1. The credential. A WordPress application password can create, edit and
 *      delete anything on a live site. Keeping it in localStorage would put it
 *      one XSS away from an attacker who could then deface the customer's
 *      business. It is stored in the server-side file store, never returned to
 *      the client, and only its presence is reported.
 *
 *   2. CORS. WordPress sends no cross-origin headers on /wp-json, so a browser
 *      fetch to it is blocked before it is even attempted. The request has to
 *      originate somewhere that is not a browser.
 *
 * POST JSON, all actions requiring a session token:
 *   connect     { token, accountId, targetId, siteUrl, username, password }
 *   status      { token, accountId, targetId }
 *   disconnect  { token, accountId, targetId }
 *   publish     { token, accountId, targetId, slug, title, html, excerpt,
 *                 status: 'publish'|'future'|'draft', date?, remoteId? }
 *   withdraw    { token, accountId, targetId, remoteId }
 */
require __DIR__ . '/_db.php';
crm_cors();

$d = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $d['action'] ?? '';
function out($x) { echo json_encode($x); exit; }

/* Every action writes to, or reads a credential for, someone's live site. */
$user = crm_user_from_token($d['token'] ?? '');
$accountId = $d['accountId'] ?? '';
if (!$user || !crm_can_access($user, $accountId)) out(['success' => false, 'error' => 'Not authorised.']);

$targetId = preg_replace('/[^A-Za-z0-9_\-]/', '', (string)($d['targetId'] ?? ''));
if ($targetId === '') out(['success' => false, 'error' => 'A target id is required.']);

$STORE = 'blog_targets';
$key = "{$accountId}:{$targetId}";

/**
 * Only a real http(s) host, and never one on this machine.
 *
 * Without this the endpoint is a server-side request forgery tool: an
 * authenticated user could point a "site" at 127.0.0.1 or at cloud metadata
 * and have our server fetch it for them from inside the network.
 */
function crm_blog_check_url($url) {
    $url = trim($url);
    if ($url === '') return 'A site address is required.';
    $p = parse_url($url);
    if (!$p || empty($p['scheme']) || empty($p['host'])) return 'That is not a complete web address.';
    if (!in_array(strtolower($p['scheme']), ['http', 'https'], true)) return 'The address must start with http:// or https://.';

    /**
     * An operator may allow private addresses — an agency whose staging
     * WordPress lives on the office network has a real need for it. It is a
     * decision made once, in a file only the server administrator can write,
     * and it is off unless they make it. It is deliberately not something a
     * request can ask for, because then it would not be a control at all.
     */
    $cfg = crm_config();
    if (!empty($cfg['blog_publish_allow_private'])) return '';

    $host = strtolower($p['host']);
    if ($host === 'localhost' || substr($host, -6) === '.local' || $host === '[::1]') return 'That address points at this server, not at a website.';

    $ip = filter_var($host, FILTER_VALIDATE_IP) ? $host : gethostbyname($host);
    if (filter_var($ip, FILTER_VALIDATE_IP)) {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return 'That address resolves to a private network, which this server will not fetch. An administrator can allow it with blog_publish_allow_private in api/config.php.';
        }
    }
    return '';
}

/** One authenticated call to a WordPress REST endpoint. */
function crm_wp($site, $user, $pass, $path, $method = 'GET', $body = null) {
    $url = rtrim($site, '/') . $path;
    $ch = curl_init($url);
    $headers = ['Accept: application/json'];
    if ($body !== null) $headers[] = 'Content-Type: application/json';
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_USERPWD        => $user . ':' . $pass,
        CURLOPT_TIMEOUT        => 30,
        // A redirect is not followed: it could be used to bounce the
        // credentialed request to a host the checks above already rejected.
        CURLOPT_FOLLOWLOCATION => false,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));

    $raw  = curl_exec($ch);
    $err  = curl_error($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($raw === false) return ['ok' => false, 'code' => 0, 'error' => $err ?: 'The site could not be reached.'];
    $json = json_decode($raw, true);
    if ($code >= 400) {
        $msg = is_array($json) && isset($json['message']) ? strip_tags($json['message']) : "The site returned HTTP {$code}";
        if ($code === 401 || $code === 403) {
            $msg = 'WordPress rejected the login. Check the username, and that the application password was pasted whole (it has spaces in it).';
        }
        if ($code === 404) {
            $msg = 'No WordPress REST API at that address. Check the site URL, and that the REST API has not been disabled by a security plugin.';
        }
        return ['ok' => false, 'code' => $code, 'error' => $msg];
    }
    return ['ok' => true, 'code' => $code, 'json' => $json];
}

$targets = crm_store_load($STORE, []);

/* ── connect ── */
if ($action === 'connect') {
    $siteUrl = rtrim(trim($d['siteUrl'] ?? ''), '/');
    $username = trim($d['username'] ?? '');
    $password = (string)($d['password'] ?? '');

    if ($msg = crm_blog_check_url($siteUrl)) out(['success' => false, 'error' => $msg]);
    if ($username === '' || $password === '') out(['success' => false, 'error' => 'A WordPress username and application password are both required.']);
    if (!crm_store_writable()) out(['success' => false, 'error' => 'The server cannot write to api/data, so the connection cannot be saved.']);

    // Prove it works before storing it. A credential saved without being
    // checked is a failure discovered later, in the middle of a run.
    $me = crm_wp($siteUrl, $username, $password, '/wp-json/wp/v2/users/me?context=edit');
    if (!$me['ok']) out(['success' => false, 'error' => $me['error']]);

    $caps = $me['json']['capabilities'] ?? [];
    if (empty($caps['publish_posts'])) {
        out(['success' => false, 'error' => 'That account can sign in but cannot publish posts. It needs the Author role or higher.']);
    }

    $targets[$key] = [
        'siteUrl'    => $siteUrl,
        'username'   => $username,
        'password'   => $password,
        'verifiedAt' => gmdate('c'),
        'wpUser'     => $me['json']['name'] ?? $username,
    ];
    if (!crm_store_save($STORE, $targets)) out(['success' => false, 'error' => 'The connection could not be saved.']);

    out(['success' => true, 'connectedAs' => $me['json']['name'] ?? $username, 'verifiedAt' => $targets[$key]['verifiedAt']]);
}

/* ── status ── */
if ($action === 'status') {
    $t = $targets[$key] ?? null;
    out([
        'success'     => true,
        'connected'   => (bool)$t,
        'siteUrl'     => $t['siteUrl'] ?? '',
        'username'    => $t['username'] ?? '',
        'connectedAs' => $t['wpUser'] ?? '',
        'verifiedAt'  => $t['verifiedAt'] ?? '',
    ]);
}

/* ── disconnect ── */
if ($action === 'disconnect') {
    unset($targets[$key]);
    crm_store_save($STORE, $targets);
    out(['success' => true]);
}

/* Everything past here needs the stored credential. */
$t = $targets[$key] ?? null;
if (!$t) out(['success' => false, 'error' => 'That site is not connected. Connect it first.']);

/* ── publish (create or update) ── */
if ($action === 'publish') {
    $status = in_array(($d['status'] ?? 'publish'), ['publish', 'future', 'draft'], true) ? $d['status'] : 'publish';
    $slug = preg_replace('/[^a-z0-9\-]/', '', strtolower((string)($d['slug'] ?? '')));
    $title = trim((string)($d['title'] ?? ''));
    $html = (string)($d['html'] ?? '');
    if ($title === '' || $html === '') out(['success' => false, 'error' => 'A title and a body are both required.']);

    $body = [
        'title'   => $title,
        'content' => $html,
        'status'  => $status,
        'excerpt' => (string)($d['excerpt'] ?? ''),
    ];
    if ($slug !== '') $body['slug'] = $slug;
    // WordPress needs a future date to accept status=future, and rejects the
    // combination without one.
    if (!empty($d['date'])) $body['date_gmt'] = gmdate('Y-m-d\TH:i:s', strtotime((string)$d['date']));
    if ($status === 'future' && empty($body['date_gmt'])) {
        out(['success' => false, 'error' => 'A scheduled post needs a date.']);
    }

    $remoteId = intval($d['remoteId'] ?? 0);
    $path = $remoteId > 0 ? "/wp-json/wp/v2/posts/{$remoteId}" : '/wp-json/wp/v2/posts';
    $r = crm_wp($t['siteUrl'], $t['username'], $t['password'], $path, 'POST', $body);
    if (!$r['ok']) out(['success' => false, 'error' => $r['error']]);

    out([
        'success'  => true,
        'remoteId' => $r['json']['id'] ?? null,
        'url'      => $r['json']['link'] ?? '',
        'status'   => $r['json']['status'] ?? $status,
        'date'     => $r['json']['date_gmt'] ?? '',
    ]);
}

/* ── withdraw ── */
if ($action === 'withdraw') {
    $remoteId = intval($d['remoteId'] ?? 0);
    if ($remoteId <= 0) out(['success' => false, 'error' => 'Nothing to withdraw — no remote id was recorded.']);

    // Back to draft, never deleted. The post keeps its id, its URL history and
    // anything a human edited on the site since; a delete would throw all of
    // that away to undo a publish, which is not a trade anyone would choose.
    $r = crm_wp($t['siteUrl'], $t['username'], $t['password'], "/wp-json/wp/v2/posts/{$remoteId}", 'POST', ['status' => 'draft']);
    if (!$r['ok']) out(['success' => false, 'error' => $r['error']]);
    out(['success' => true, 'status' => $r['json']['status'] ?? 'draft']);
}

out(['success' => false, 'error' => 'Unknown action.']);
