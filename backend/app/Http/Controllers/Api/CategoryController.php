<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CategoryController extends Controller
{
    use ApiHelpers;

    /* ── GET /categories ─────────────────────────────────────────────────── */
    public function index(Request $request)
    {
        $this->requireRole($request, InventoryService::ALL_ROLES);
        $rows = DB::select('SELECT name FROM categories ORDER BY name ASC');
        return $this->json(array_map(fn($r) => $r->name, $rows));
    }

    /* ── POST /categories ────────────────────────────────────────────────── */
    public function store(Request $request)
    {
        $this->requireRole($request, ['inventory_manager']);
        $data = $this->body($request);
        $this->requireFields($data, ['name']);
        $name = trim($data['name']);
        if (str_contains($name, '/')) {
            return $this->json(['error' => 'Create each category separately; combined category names are not supported.'], 422);
        }
        DB::insert('INSERT IGNORE INTO categories (name) VALUES (?)', [$name]);
        return $this->json(['message' => 'Category saved.', 'name' => $name], 201);
    }

    /* ── DELETE /categories/{id} ────────────────────────────────────────── */
    public function destroy(Request $request, string $id)
    {
        $this->requireRole($request, ['admin/owner', 'admin']);
        DB::delete('DELETE FROM categories WHERE id = ?', [$id]);
        return $this->json(['message' => 'Category deleted.']);
    }
}
