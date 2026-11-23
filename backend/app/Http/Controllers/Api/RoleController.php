<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RoleController extends Controller
{
    use ApiHelpers;

    private function userRoleJoin(): string
    {
        return $this->userRolesEnabled()
            ? 'LEFT JOIN user_roles ur ON ur.role_id = r.id'
            : 'LEFT JOIN users u ON u.role = r.id';
    }

    private function userCountExpression(): string
    {
        return $this->userRolesEnabled() ? 'COUNT(DISTINCT ur.user_id)' : 'COUNT(u.id)';
    }

    private function userRolesEnabled(): bool
    {
        return !empty(DB::select("SHOW TABLES LIKE 'user_roles'"));
    }

    private function formatRole($r): array
    {
        $r = (array)$r;
        $permissions = [];
        if (!empty($r['permissions'])) {
            $decoded = json_decode($r['permissions'], true);
            if (is_array($decoded)) {
                $permissions = $decoded;
            }
        }
        return [
            'id' => $r['id'],
            'name' => $r['name'],
            'description' => $r['description'] ?? '',
            'permissions' => $permissions,
            'isSystem' => (bool)($r['is_system'] ?? 0),
            'userCount' => isset($r['user_count']) ? (int)$r['user_count'] : 0,
            'createdAt' => $r['created_at'] ?? null,
            'updatedAt' => $r['updated_at'] ?? null,
        ];
    }

    /* ── GET /roles/{id} ─────────────────────────────────────────────────── */
    public function show(Request $request, string $id)
    {
        $this->requireRole($request, InventoryService::ALL_ROLES);
        $join = $this->userRoleJoin();
        $cnt = $this->userCountExpression();
        $rows = DB::select(
            "SELECT r.*, {$cnt} AS user_count FROM roles r {$join} WHERE r.id = ? GROUP BY r.id",
            [$id]
        );
        if (empty($rows)) return $this->json(['error' => 'Role not found.'], 404);
        return $this->json($this->formatRole($rows[0]));
    }

    /* ── PUT /roles/{id} ──────────────────────────────────────────────────── */
    public function update(Request $request, string $id)
    {
        $this->requireRole($request, ['admin/owner', 'admin']);
        $data = $this->body($request);
        $this->requireFields($data, ['name']);
        $existing = DB::selectOne('SELECT * FROM roles WHERE id = ?', [$id]);
        if (!$existing) return $this->json(['error' => 'Role not found.'], 404);

        $name = trim($data['name']);
        if (empty($name)) return $this->json(['error' => 'Role name cannot be empty.'], 400);
        $description = trim($data['description'] ?? '');
        $permissions = isset($data['permissions']) && is_array($data['permissions'])
            ? json_encode(array_values(array_unique($data['permissions'])))
            : json_encode([]);

        DB::update('UPDATE roles SET name = ?, description = ?, permissions = ?, updated_at = NOW() WHERE id = ?', [$name, $description, $permissions, $id]);

        $join = $this->userRoleJoin();
        $cnt = $this->userCountExpression();
        $rows = DB::select("SELECT r.*, {$cnt} AS user_count FROM roles r {$join} WHERE r.id = ? GROUP BY r.id", [$id]);
        return $this->json($this->formatRole($rows[0]));
    }

    /* ── DELETE /roles/{id} ───────────────────────────────────────────────── */
    public function destroy(Request $request, string $id)
    {
        $this->requireRole($request, ['admin/owner', 'admin']);
        $existing = DB::selectOne('SELECT * FROM roles WHERE id = ?', [$id]);
        if (!$existing) return $this->json(['error' => 'Role not found.'], 404);
        if (!empty($existing->is_system)) return $this->json(['error' => 'System roles cannot be deleted.'], 400);

        if ($this->userRolesEnabled()) {
            $count = (int)DB::selectOne('SELECT COUNT(*) AS c FROM user_roles WHERE role_id = ?', [$id])->c;
        } else {
            $count = (int)DB::selectOne('SELECT COUNT(*) AS c FROM users WHERE role = ?', [$id])->c;
        }
        if ($count > 0) {
            return $this->json(['error' => "Cannot delete role because it is assigned to {$count} active staff member(s). Please reassign them first."], 400);
        }
        DB::delete('DELETE FROM roles WHERE id = ?', [$id]);
        return $this->json(['message' => 'Role deleted successfully.']);
    }

    /* ── GET /roles ──────────────────────────────────────────────────────── */
    public function index(Request $request)
    {
        $this->requireRole($request, InventoryService::ALL_ROLES);
        $join = $this->userRoleJoin();
        $cnt = $this->userCountExpression();
        $rows = DB::select("SELECT r.*, {$cnt} AS user_count FROM roles r {$join} GROUP BY r.id ORDER BY r.is_system DESC, r.name ASC");
        return $this->json(array_map(fn($r) => $this->formatRole($r), $rows));
    }

    /* ── POST /roles ─────────────────────────────────────────────────────── */
    public function store(Request $request)
    {
        $this->requireRole($request, ['admin/owner', 'admin']);
        $data = $this->body($request);
        $this->requireFields($data, ['name']);
        $name = trim($data['name']);
        if (empty($name)) return $this->json(['error' => 'Role name is required.'], 400);

        $slug = trim($data['id'] ?? '');
        if (empty($slug)) {
            $slug = preg_replace('/[^a-z0-9]+/i', '_', strtolower($name));
            $slug = trim($slug, '_');
        } else {
            $slug = preg_replace('/[^a-z0-9_\-]+/i', '_', strtolower($slug));
        }
        if (empty($slug)) {
            $slug = 'role_' . substr(md5(uniqid()), 0, 6);
        }

        $check = DB::selectOne('SELECT id FROM roles WHERE id = ?', [$slug]);
        if ($check) return $this->json(['error' => "A role with ID '{$slug}' already exists."], 409);

        $description = trim($data['description'] ?? '');
        $permissions = isset($data['permissions']) && is_array($data['permissions'])
            ? json_encode(array_values(array_unique($data['permissions'])))
            : json_encode([]);

        DB::insert('INSERT INTO roles (id, name, description, permissions, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, 0, NOW(), NOW())', [$slug, $name, $description, $permissions]);

        $row = DB::selectOne('SELECT r.*, 0 AS user_count FROM roles r WHERE r.id = ?', [$slug]);
        return $this->json($this->formatRole($row), 201);
    }
}
