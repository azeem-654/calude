<?php
/**
 * img-proxy.php — proxies keyword stock images (loremflickr.com only) with
 * CORS headers so the app can draw them onto a <canvas> for B-roll cutaways
 * and script-to-video scenes. Keyword-validated; NOT a general-purpose proxy.
 *
 * GET ?q=<keyword>[&sig=<n>] → image/jpeg  (sig varies the returned image)
 */
$q = trim($_GET['q'] ?? '');
$sig = intval($_GET['sig'] ?? 0);
if (!preg_match('/^[a-zA-Z0-9 ,\-]{2,40}$/', $q)) { http_response_code(400); exit('bad keyword'); }

header('Access-Control-Allow-Origin: *');
header('Cache-Control: public, max-age=86400');

$kw = rawurlencode(str_replace(' ', ',', strtolower($q)));
$url = "https://loremflickr.com/800/450/{$kw}?lock={$sig}";

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 4,
    CURLOPT_TIMEOUT => 12,
]);
$img = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$type = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: 'image/jpeg';
curl_close($ch);

if ($code === 200 && $img !== false && strlen($img) > 500) {
    header("Content-Type: {$type}");
    echo $img;
    exit;
}
http_response_code(404);
echo 'not found';
