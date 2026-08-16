<?php
/**
 * places-search.php — the Google Places key lives here, not in the browser.
 *
 * Every other AI key in this app sits in localStorage and is sent from the page.
 * That is tolerable for a free quota; it is not for Places, which bills per
 * request. A key readable by anything running in the tab, or lifted from a
 * built bundle, is somebody else's search budget spent on your card.
 *
 * So the key is written once by a signed-in owner, stored in the same guarded
 * store as the booking SMTP password, and never sent back — not to render a
 * settings field, not to confirm it saved. The browser asks this endpoint to
 * search; the key never leaves the server.
 *
 * POST JSON:
 *   { action: 'status',   token }                        → { configured, keyHint }
 *   { action: 'save-key', token, key }                   → { success }
 *   { action: 'clear-key',token }                        → { success }
 *   { action: 'search',   token, query, maxResults? }    → { places: [...] }
 */
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: {$origin}");
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Vary: Origin');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

require_once __DIR__ . '/_db.php';

$d = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $d['action'] ?? 'search';

/* Same gate as the other endpoints that reach out to the network on request:
   without it this is an open, billable search API on a public URL. */
crm_require_session_for_socket($d['token'] ?? '');

const PLACES_STORE = 'ai_places';

function pl_out($data) { echo json_encode($data); exit; }

function pl_key() {
    $cfg = crm_store_load(PLACES_STORE, []);
    return is_array($cfg) ? trim($cfg['key'] ?? '') : '';
}

if ($action === 'status') {
    $key = pl_key();
    pl_out([
        'success' => true,
        'configured' => $key !== '',
        // Enough to recognise which key is in place, never enough to use it.
        'keyHint' => $key === '' ? '' : substr($key, 0, 6) . '…' . substr($key, -4),
    ]);
}

if ($action === 'save-key') {
    $key = trim($d['key'] ?? '');
    if ($key === '') pl_out(['success' => false, 'error' => 'Paste the API key first.']);
    if (strlen($key) < 20 || preg_match('/\s/', $key)) {
        pl_out(['success' => false, 'error' => 'That does not look like a Google API key — they are one long string with no spaces.']);
    }
    if (!crm_store_save(PLACES_STORE, ['key' => $key, 'savedAt' => gmdate('c')])) {
        pl_out(['success' => false, 'error' => 'The server could not write to api/data/. Set that folder to 755 and try again.']);
    }
    pl_out(['success' => true]);
}

if ($action === 'clear-key') {
    crm_store_save(PLACES_STORE, []);
    pl_out(['success' => true]);
}

if ($action !== 'search') pl_out(['success' => false, 'error' => 'Unknown action.']);

/* ── Search ────────────────────────────────────────────────────────────── */

$key = pl_key();
if ($key === '') {
    pl_out(['success' => false, 'code' => 'no_key',
            'error' => 'No Google Places key is set. Add one in Settings → Email & SMS → Prospect search.']);
}

$query = trim($d['query'] ?? '');
if ($query === '') pl_out(['success' => false, 'error' => 'Nothing to search for.']);
/* Places bills per request and returns 20 per page; more than one page of
   results is a deliberate decision, not a default. */
$max = max(1, min(20, intval($d['maxResults'] ?? 20)));

$endpoint = getenv('CRM_PLACES_ENDPOINT') ?: 'https://places.googleapis.com/v1/places:searchText';

/* Only the fields the agent actually uses. The field mask is what Places bills
   on, so asking for everything costs more for data nothing reads. */
$fields = implode(',', [
    'places.id', 'places.displayName', 'places.formattedAddress',
    'places.nationalPhoneNumber', 'places.internationalPhoneNumber',
    'places.websiteUri', 'places.rating', 'places.userRatingCount',
    'places.businessStatus', 'places.primaryTypeDisplayName',
]);

$payload = json_encode(['textQuery' => $query, 'maxResultCount' => $max]);

$ch = curl_init($endpoint);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 25,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'X-Goog-Api-Key: ' . $key,
        'X-Goog-FieldMask: ' . $fields,
    ],
]);
$body = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

if ($body === false) {
    pl_out(['success' => false, 'error' => 'Could not reach Google Places: ' . $curlErr]);
}

$json = json_decode($body, true);

if ($status >= 400) {
    /* Google's own words, which name the actual problem — a key restricted to
       the wrong referrer, billing not enabled, the API not turned on — far
       better than a generic failure. */
    $msg = $json['error']['message'] ?? ('Google Places returned ' . $status);
    $hint = '';
    if (stripos($msg, 'API key not valid') !== false) $hint = ' Check the key was copied in full.';
    elseif (stripos($msg, 'not been used') !== false || stripos($msg, 'disabled') !== false) {
        $hint = ' Enable the Places API (New) for this project in the Google Cloud console.';
    } elseif (stripos($msg, 'billing') !== false) {
        $hint = ' Places requires billing to be enabled on the Google Cloud project.';
    } elseif (stripos($msg, 'referer') !== false || stripos($msg, 'referrer') !== false) {
        $hint = ' This key is restricted to browser referrers; it is used from the server, so allow this server\'s IP instead.';
    }
    pl_out(['success' => false, 'status' => $status, 'error' => $msg . $hint]);
}

$places = [];
foreach (($json['places'] ?? []) as $p) {
    $places[] = [
        'id' => $p['id'] ?? '',
        'name' => $p['displayName']['text'] ?? '',
        'address' => $p['formattedAddress'] ?? '',
        'phone' => $p['nationalPhoneNumber'] ?? ($p['internationalPhoneNumber'] ?? ''),
        'website' => $p['websiteUri'] ?? '',
        'rating' => isset($p['rating']) ? (float)$p['rating'] : null,
        'ratingCount' => isset($p['userRatingCount']) ? (int)$p['userRatingCount'] : null,
        'businessStatus' => $p['businessStatus'] ?? '',
        'category' => $p['primaryTypeDisplayName']['text'] ?? '',
    ];
}

pl_out(['success' => true, 'places' => $places, 'query' => $query]);
