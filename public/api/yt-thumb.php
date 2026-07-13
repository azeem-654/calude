<?php
/**
 * yt-thumb.php — proxies a YouTube video thumbnail with CORS headers so the
 * app can draw it onto a <canvas> for clip exports (direct i.ytimg.com loads
 * taint the canvas). Restricted to valid 11-char YouTube video ids — this is
 * NOT a general-purpose proxy.
 *
 * GET ?id=<videoId> → image/jpeg
 */
$id = $_GET['id'] ?? '';
if (!preg_match('/^[a-zA-Z0-9_-]{11}$/', $id)) { http_response_code(400); exit('bad id'); }

header('Access-Control-Allow-Origin: *');
header('Cache-Control: public, max-age=86400');

foreach (['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault'] as $q) {
    $ch = curl_init("https://i.ytimg.com/vi/{$id}/{$q}.jpg");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 10,
    ]);
    $img = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code === 200 && $img !== false && strlen($img) > 1000) {
        header('Content-Type: image/jpeg');
        echo $img;
        exit;
    }
}
http_response_code(404);
echo 'not found';
