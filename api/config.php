<?php
/**
 * SmartTrack — Configuration
 * Edit DB_PASS if you've set a MySQL root password in XAMPP.
 */

define('DB_HOST', '127.0.0.1');
define('DB_PORT', '3306');
define('DB_NAME', 'smarttrack');
define('DB_USER', 'root');
define('DB_PASS', '');          // default XAMPP root has no password

// Session-based auth token lifetime (seconds)
define('SESSION_LIFETIME', 86400); // 24 hours

// App timezone
date_default_timezone_set('Asia/Manila');
