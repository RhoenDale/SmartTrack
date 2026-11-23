<?php
if ($method === 'GET' && $id === 'public') {
    $stmt = db()->query(
        "SELECT setting_key, value FROM tax_settings
         WHERE setting_key IN ('business_name', 'business_address')"
    );
    $settings = array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'value', 'setting_key');
    json_response([
        'businessName' => $settings['business_name'] ?? '',
        'businessAddress' => $settings['business_address'] ?? '',
    ]);
}

require_auth();

if ($method !== 'GET' || $id !== 'receipt') {
    json_response(['error' => 'Route not found.'], 404);
}

$stmt = db()->query('SELECT setting_key, value FROM tax_settings');
$settings = array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'value', 'setting_key');

json_response([
    'businessName' => $settings['business_name'] ?? '',
    'businessAddress' => $settings['business_address'] ?? '',
    'businessPhone' => $settings['business_phone'] ?? '',
    'businessTin' => $settings['business_tin'] ?? '',
    'orPrefix' => $settings['or_prefix'] ?? '',
]);