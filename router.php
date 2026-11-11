<?php
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (strpos($uri, '/SmartTrack/api') === 0 || strpos($uri, '/api') === 0) {
    require __DIR__ . '/api/index.php';
    return true;
}
return false;
