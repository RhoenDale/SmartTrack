<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SettingsController extends Controller
{
    use ApiHelpers;

    /* ── GET /settings/public (no auth) ──────────────────────────────────── */
    public function public(Request $request)
    {
        $rows = DB::select("SELECT setting_key, value FROM tax_settings WHERE setting_key IN ('business_name', 'business_address')");
        $settings = [];
        foreach ($rows as $r) {
            $settings[$r->setting_key] = $r->value;
        }
        return $this->json([
            'businessName' => $settings['business_name'] ?? '',
            'businessAddress' => $settings['business_address'] ?? '',
        ]);
    }

    /* ── GET /settings/receipt (auth) ────────────────────────────────────── */
    public function receipt(Request $request)
    {
        $this->requireRole($request, InventoryService::ALL_ROLES);
        $rows = DB::select('SELECT setting_key, value FROM tax_settings');
        $settings = [];
        foreach ($rows as $r) {
            $settings[$r->setting_key] = $r->value;
        }
        return $this->json([
            'businessName' => $settings['business_name'] ?? '',
            'businessAddress' => $settings['business_address'] ?? '',
            'businessPhone' => $settings['business_phone'] ?? '',
            'businessTin' => $settings['business_tin'] ?? '',
            'orPrefix' => $settings['or_prefix'] ?? '',
        ]);
    }
}
