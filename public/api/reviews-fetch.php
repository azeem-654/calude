<?php
/**
 * reviews-fetch.php — pulls live reviews from the Google Places Details API.
 * Only a Google API key + Place ID are required (no OAuth), so this is a real,
 * working path for Google reviews. Used by the Reputation module.
 *
 * POST JSON: { googleApiKey, placeId }
 * Returns:   { success, rating, total, reviews:[{author, rating, content, time}], error }
 */
header('Content-Type: application/json');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: {$origin}");
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Vary: Origin');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$d       = json_decode(file_get_contents('php://input'), true) ?? [];
$key     = trim($d['googleApiKey'] ?? '');
$placeId = trim($d['placeId'] ?? '');

if (!$key || !$placeId) {
    echo json_encode(['success' => false, 'error' => 'Google API key and Place ID are required.']);
    exit;
}

$url = 'https://maps.googleapis.com/maps/api/place/details/json'
     . '?place_id=' . urlencode($placeId)
     . '&fields=' . urlencode('reviews,rating,user_ratings_total,name')
     . '&reviews_sort=newest'
     . '&key=' . urlencode($key);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 20,
    CURLOPT_SSL_VERIFYPEER => true,
]);
$raw = curl_exec($ch);
if ($raw === false) {
    echo json_encode(['success' => false, 'error' => 'Request failed: ' . curl_error($ch)]);
    exit;
}
curl_close($ch);

$data = json_decode($raw, true);
if (($data['status'] ?? '') !== 'OK') {
    echo json_encode(['success' => false, 'error' => 'Google API: ' . ($data['status'] ?? 'unknown') . ' ' . ($data['error_message'] ?? '')]);
    exit;
}

$result  = $data['result'] ?? [];
$reviews = [];
foreach (($result['reviews'] ?? []) as $r) {
    $reviews[] = [
        'author'  => $r['author_name'] ?? 'Anonymous',
        'rating'  => (int)($r['rating'] ?? 0),
        'content' => $r['text'] ?? '',
        'time'    => date('c', (int)($r['time'] ?? time())),
    ];
}

echo json_encode([
    'success' => true,
    'name'    => $result['name'] ?? '',
    'rating'  => $result['rating'] ?? 0,
    'total'   => $result['user_ratings_total'] ?? 0,
    'reviews' => $reviews,
]);
