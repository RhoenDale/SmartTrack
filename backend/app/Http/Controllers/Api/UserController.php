<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Middleware\AuthenticateToken;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UserController extends Controller
{
    use ApiHelpers;

    private function softDeleteEnabled(): bool
    {
        return !empty(DB::select("SHOW COLUMNS FROM users LIKE 'deleted_at'"));
    }

    private function userRolesEnabled(): bool
    {
        return !empty(DB::select("SHOW TABLES LIKE 'user_roles'"));
    }

    private function userRoleExists(string $role): bool
    {
        return DB::selectOne('SELECT id FROM roles WHERE id = ? LIMIT 1', [$role]) !== null;
    }

    private function userRolesFromRequest(array $data, array $allowedRoles): array
    {
        if (array_key_exists('roles', $data)) {
            if (!is_array($data['roles'])) {
                return abort(response()->json(['error' => 'Roles must be provided as a list.'], 422));
            }
            $roles = $data['roles'];
        } elseif (isset($data['role']) && is_string($data['role'])) {
            $roles = [$data['role']];
        } else {
            return abort(response()->json(['error' => 'Select at least one role.'], 422));
        }

        $roles = array_values(array_unique(array_filter($roles, 'is_string')));
        if (!$roles) {
            return abort(response()->json(['error' => 'Select at least one valid role.'], 422));
        }
        foreach ($roles as $role) {
            if (!in_array($role, $allowedRoles, true)) {
                return abort(response()->json(['error' => 'You are not allowed to assign one or more selected roles.'], 403));
            }
        }
        return $roles;
    }

    private function replaceUserRoles(string $userId, array $roles): void
    {
        DB::delete('DELETE FROM user_roles WHERE user_id = ?', [$userId]);
        foreach ($roles as $role) {
            DB::insert('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [$userId, $role]);
        }
    }

    private function adminCanManageUser(array $authUser, string $userId, string $fallbackRole): bool
    {
        // admin/owner can manage anyone
        if (AuthenticateToken::userHasRole($authUser, 'admin/owner')) {
            return true;
        }
        // plain admin can manage cashiers and inventory managers only
        $roles = AuthenticateToken::getUserRoleIds($userId, $fallbackRole);
        return count(array_diff($roles, ['cashier', 'inventory_manager'])) === 0;
    }

    /* ── PUT /users/{id}/password ─────────────────────────────────────────── */
    public function changePassword(Request $request, string $id)
    {
        $authUser = $this->user($request);
        $isSelf = $authUser && $authUser['id'] === $id;
        if (!$isSelf) {
            $this->requireRole($request, ['admin/owner', 'admin']);
            $authUser = $this->user($request);
        }
        $target = DB::selectOne('SELECT id, role FROM users WHERE id = ?', [$id]);
        if (!$target) return $this->json(['error' => 'User not found.'], 404);
        if (!$isSelf && !AuthenticateToken::userHasRole($authUser, 'admin/owner') && !$this->adminCanManageUser($authUser, $id, $target->role)) {
            return $this->json(['error' => 'Admins can only change passwords for cashiers and inventory managers.'], 403);
        }
        $data = $this->body($request);
        $this->requireFields($data, ['password']);
        if (!is_string($data['password']) || strlen($data['password']) < 6) {
            return $this->json(['error' => 'Password must be at least 6 characters.'], 422);
        }
        DB::update('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?', [password_hash($data['password'], PASSWORD_BCRYPT), $id]);
        return $this->json(['message' => 'Password updated.']);
    }

    /* ── POST /users/{id}/reset-password ─────────────────────────────────── */
    public function resetPassword(Request $request, string $id)
    {
        $authUser = $this->requireRole($request, ['admin/owner', 'admin']);
        if ($authUser['id'] === $id) return $this->json(['error' => 'Use the change-password form to update your own password.'], 403);
        $tu = DB::selectOne('SELECT role FROM users WHERE id = ?', [$id]);
        if (!$tu) return $this->json(['error' => 'User not found.'], 404);
        if (!AuthenticateToken::userHasRole($authUser, 'admin/owner') && !$this->adminCanManageUser($authUser, $id, $tu->role)) {
            return $this->json(['error' => 'Admins can only reset passwords for cashiers and inventory managers.'], 403);
        }
        DB::update('UPDATE users SET password = "", updated_at = NOW() WHERE id = ?', [$id]);
        return $this->json(['message' => 'Password has been reset. User must set a new password.']);
    }

    /* ── POST /users/{id}/restore ─────────────────────────────────────────── */
    public function restore(Request $request, string $id)
    {
        $this->requireRole($request, ['admin/owner', 'admin']);
        if (!$this->softDeleteEnabled()) return $this->json(['error' => 'Recycle bin migration not applied yet.'], 500);
        $target = DB::selectOne('SELECT id, role FROM users WHERE id = ? AND deleted_at IS NOT NULL', [$id]);
        if (!$target) return $this->json(['error' => 'User not found in recycle bin.'], 404);
        $authUser = $this->user($request);
        if (!AuthenticateToken::userHasRole($authUser, 'admin/owner') && !$this->adminCanManageUser($authUser, $id, $target->role)) {
            return $this->json(['error' => 'Admins can only restore cashiers and inventory managers.'], 403);
        }
        DB::update("UPDATE users SET deleted_at = NULL, deleted_by = NULL, delete_note = NULL, status = 'inactive', updated_at = NOW() WHERE id = ?", [$id]);
        return $this->json(['message' => 'User restored. Status is inactive — activate when ready.']);
    }

    /* ── DELETE /users/{id}/purge ─────────────────────────────────────────── */
    public function purge(Request $request, string $id)
    {
        $this->requireRole($request, ['admin/owner']);
        if (!$this->softDeleteEnabled()) return $this->json(['error' => 'Recycle bin migration not applied yet.'], 500);
        $exists = DB::selectOne('SELECT id FROM users WHERE id = ? AND deleted_at IS NOT NULL', [$id]);
        if (!$exists) return $this->json(['error' => 'User not found in recycle bin.'], 404);
        DB::delete('DELETE FROM users WHERE id = ?', [$id]);
        return $this->json(['message' => 'User permanently deleted.']);
    }

    /* ── GET /users/deleted ──────────────────────────────────────────────── */
    public function deleted(Request $request)
    {
        $this->requireRole($request, ['admin/owner', 'admin']);
        InventoryService::purgeExpiredRecycleBin();
        if (!$this->softDeleteEnabled()) return $this->json([]);
        $rows = DB::select(
            'SELECT u.id, u.name, u.role, u.email, u.position, u.initials, u.status,
                    u.last_login, u.deleted_at, u.deleted_by, u.delete_note,
                    d.name AS deleted_by_name
             FROM users u
             LEFT JOIN users d ON d.id = u.deleted_by
             WHERE u.deleted_at IS NOT NULL
             ORDER BY u.deleted_at DESC'
        );
        return $this->json(array_map(function ($u) {
            $u = (array)$u;
            $base = InventoryService::formatUser($u);
            $base['deletedAt'] = $u['deleted_at'];
            $base['deletedByName'] = $u['deleted_by_name'] ?? $u['deleted_by'] ?? null;
            $base['deleteNote'] = $u['delete_note'] ?? null;
            $base['daysSinceDelete'] = $u['deleted_at']
                ? (int)floor((time() - strtotime($u['deleted_at'])) / 86400)
                : 0;
            return $base;
        }, $rows));
    }

    /* ── DELETE /users/{id}/roles ─────────────────────────────────────────── */
    public function removeRole(Request $request, string $id)
    {
        $authUser = $this->user($request);
        if (!$authUser || $authUser['id'] !== $id) {
            return $this->json(['error' => 'You can only remove roles from your own account.'], 403);
        }
        if (!$this->userRolesEnabled()) {
            return $this->json(['error' => 'Multiple-role migration is required. Apply api/migrations/add_multiple_roles_per_user.sql.'], 503);
        }
        $data = $this->body($request);
        if (!isset($data['role']) || !is_string($data['role']) || trim($data['role']) === '') {
            return $this->json(['error' => 'Specify a role to remove.'], 422);
        }
        $roleToRemove = trim($data['role']);

        DB::beginTransaction();
        try {
            $current = DB::selectOne('SELECT id, role FROM users WHERE id = ? FOR UPDATE', [$id]);
            if (!$current) {
                DB::rollBack();
                return $this->json(['error' => 'User not found.'], 404);
            }

            $rolesRows = DB::select(
                'SELECT role_id FROM user_roles WHERE user_id = ? ORDER BY (role_id = ?) DESC, role_id ASC FOR UPDATE',
                [$id, $current->role]
            );
            $assignedRoles = array_map(fn($r) => $r->role_id, $rolesRows);
            if (!in_array($roleToRemove, $assignedRoles, true)) {
                DB::rollBack();
                return $this->json(['error' => 'That role is not assigned to your account.'], 404);
            }
            if (count($assignedRoles) <= 1) {
                DB::rollBack();
                return $this->json(['error' => 'Your account must keep at least one role.'], 422);
            }

            $remainingRoles = array_values(array_diff($assignedRoles, [$roleToRemove]));
            DB::delete('DELETE FROM user_roles WHERE user_id = ? AND role_id = ?', [$id, $roleToRemove]);
            DB::update('UPDATE users SET role = ?, updated_at = NOW() WHERE id = ?', [$remainingRoles[0], $id]);
            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }

        $updated = DB::selectOne('SELECT id, name, role, email, position, initials, status, last_login FROM users WHERE id = ?', [$id]);
        if (!$updated) return $this->json(['error' => 'User not found.'], 404);
        return $this->json(InventoryService::formatUser((array)$updated));
    }

    /* ── GET /users/{id} ──────────────────────────────────────────────────── */
    public function show(Request $request, string $id)
    {
        $this->requireRole($request, ['admin/owner', 'admin']);
        $u = DB::selectOne('SELECT id, name, role, email, position, initials, status, last_login, created_at FROM users WHERE id = ?', [$id]);
        if (!$u) return $this->json(['error' => 'User not found.'], 404);
        return $this->json(InventoryService::formatUser((array)$u));
    }

    /* ── PUT /users/{id} ──────────────────────────────────────────────────── */
    public function update(Request $request, string $id)
    {
        $authUser = $this->user($request);
        $isSelf = $authUser && $authUser['id'] === $id;
        $isAdmin = AuthenticateToken::userHasRole($authUser, ['admin/owner', 'admin']);
        if (!$isSelf && !$isAdmin) {
            return $this->json(['error' => 'Forbidden: insufficient permissions.'], 403);
        }

        $current = DB::selectOne('SELECT id, role FROM users WHERE id = ?', [$id]);
        if (!$current) return $this->json(['error' => 'User not found.'], 404);
        if ($isAdmin && !$isSelf && !AuthenticateToken::userHasRole($authUser, 'admin/owner') && !$this->adminCanManageUser($authUser, $id, $current->role)) {
            return $this->json(['error' => 'Admins can only manage cashiers and inventory managers.'], 403);
        }

        $data = $this->body($request);
        if ($isSelf) {
            $this->requireFields($data, ['name', 'email']);
            if (!is_string($data['name']) || strlen($data['name']) > 120) {
                return $this->json(['error' => 'Name must be 120 characters or less.'], 422);
            }
            if (!is_string($data['email']) || !filter_var(trim($data['email']), FILTER_VALIDATE_EMAIL)) {
                return $this->json(['error' => 'Enter a valid email address.'], 422);
            }
            $initials = InventoryService::makeInitials($data['name']);
            DB::update('UPDATE users SET name=?, email=?, initials=?, updated_at=NOW() WHERE id = ?', [$data['name'], strtolower(trim($data['email'])), $initials, $id]);
        } else {
            $this->requireFields($data, ['name', 'email', 'status']);
            if (!is_string($data['name']) || strlen($data['name']) > 120) return $this->json(['error' => 'Name must be 120 characters or less.'], 422);
            if (!is_string($data['email']) || !filter_var(trim($data['email']), FILTER_VALIDATE_EMAIL)) {
                return $this->json(['error' => 'Enter a valid email address.'], 422);
            }
            if (!in_array($data['status'], ['active', 'inactive'], true)) {
                return $this->json(['error' => 'Status must be active or inactive.'], 422);
            }
            $assignedRoles = null;
            if (array_key_exists('roles', $data) || array_key_exists('role', $data)) {
                if (!$this->userRolesEnabled()) {
                    return $this->json(['error' => 'Multiple-role migration is required. Apply api/migrations/add_multiple_roles_per_user.sql.'], 503);
                }
                $allowedRoles = AuthenticateToken::userHasRole($authUser, 'admin/owner')
                    ? array_merge(['admin', 'inventory_manager', 'cashier'], array_diff(AuthenticateToken::getUserRoleIds($id, $current->role), ['admin/owner']))
                    : ['inventory_manager', 'cashier'];
                $assignedRoles = $this->userRolesFromRequest($data, $allowedRoles);
                foreach ($assignedRoles as $role) {
                    if (!$this->userRoleExists($role)) {
                        return $this->json(['error' => 'A selected role does not exist in the roles table. Apply api/migrations/create_roles_table.sql.'], 503);
                    }
                }
                if (!AuthenticateToken::userHasRole($authUser, 'admin/owner') && count(array_diff($assignedRoles, ['cashier', 'inventory_manager'])) > 0) {
                    return $this->json(['error' => 'Admins can assign only inventory manager and cashier roles.'], 403);
                }
            }
            $initials = InventoryService::makeInitials($data['name']);
            DB::beginTransaction();
            try {
                $newRole = $assignedRoles !== null ? $assignedRoles[0] : $current->role;
                DB::update('UPDATE users SET name=?, role=?, email=?, status=?, initials=?, position=?, updated_at=NOW() WHERE id = ?',
                    [$data['name'], $newRole, strtolower(trim($data['email'])), $data['status'], $initials, $data['position'] ?? '', $id]);
                if ($assignedRoles !== null) {
                    $this->replaceUserRoles($id, $assignedRoles);
                }
                DB::commit();
            } catch (\Throwable $e) {
                DB::rollBack();
                throw $e;
            }
        }

        $updated = DB::selectOne('SELECT id, name, role, email, position, initials, status, last_login FROM users WHERE id = ?', [$id]);
        if (!$updated) return $this->json(['error' => 'User not found.'], 404);
        return $this->json(InventoryService::formatUser((array)$updated));
    }

    /* ── DELETE /users/{id} ──────────────────────────────────────────────── */
    public function destroy(Request $request, string $id)
    {
        $authUser = $this->requireRole($request, ['admin/owner', 'admin']);
        if ($authUser && $authUser['id'] === $id) return $this->json(['error' => 'You cannot delete your own account.'], 403);
        $cond = $this->softDeleteEnabled() ? ' AND deleted_at IS NULL' : '';
        $target = DB::selectOne('SELECT id, role FROM users WHERE id = ?' . $cond, [$id]);
        if (!$target) return $this->json(['error' => 'User not found.'], 404);
        if (!AuthenticateToken::userHasRole($authUser, 'admin/owner') && !$this->adminCanManageUser($authUser, $id, $target->role)) {
            return $this->json(['error' => 'Admins can only delete cashiers and inventory managers.'], 403);
        }
        if ($this->softDeleteEnabled()) {
            $note = $this->body($request)['note'] ?? null;
            DB::update("UPDATE users SET deleted_at = NOW(), deleted_by = ?, delete_note = ?, status = 'inactive', updated_at = NOW() WHERE id = ?", [$authUser['id'], $note, $id]);
            return $this->json(['message' => 'User moved to recycle bin.']);
        }
        DB::delete('DELETE FROM users WHERE id = ?', [$id]);
        return $this->json(['message' => 'User deleted.']);
    }

    /* ── GET /users ──────────────────────────────────────────────────────── */
    public function index(Request $request)
    {
        $this->requireRole($request, ['admin/owner', 'admin']);
        $where = $this->softDeleteEnabled() ? 'WHERE deleted_at IS NULL' : '';
        $rows = DB::select("SELECT id, name, role, email, position, initials, status, last_login FROM users $where ORDER BY id ASC");
        return $this->json(array_map(fn($u) => InventoryService::formatUser((array)$u), $rows));
    }

    /* ── POST /users ─────────────────────────────────────────────────────── */
    public function store(Request $request)
    {
        $authUser = $this->requireRole($request, ['admin/owner', 'admin']);
        if (!$this->userRolesEnabled()) {
            return $this->json(['error' => 'Multiple-role migration is required. Apply api/migrations/add_multiple_roles_per_user.sql.'], 503);
        }
        $data = $this->body($request);
        $this->requireFields($data, ['name', 'email', 'password']);
        if (!is_string($data['name']) || strlen($data['name']) > 120) {
            return $this->json(['error' => 'Name must be 120 characters or less.'], 422);
        }
        if (!is_string($data['email']) || !filter_var(trim($data['email']), FILTER_VALIDATE_EMAIL)) {
            return $this->json(['error' => 'Enter a valid email address.'], 422);
        }
        $allowedRoles = AuthenticateToken::userHasRole($authUser, 'admin/owner')
            ? ['admin', 'inventory_manager', 'cashier']
            : ['inventory_manager', 'cashier'];
        $assignedRoles = $this->userRolesFromRequest($data, $allowedRoles);
        foreach ($assignedRoles as $role) {
            if (!$this->userRoleExists($role)) {
                return $this->json(['error' => 'A selected role does not exist in the roles table. Apply api/migrations/create_roles_table.sql.'], 503);
            }
        }
        if (!is_string($data['password']) || strlen($data['password']) < 6) {
            return $this->json(['error' => 'Password must be at least 6 characters.'], 422);
        }

        $check = DB::selectOne('SELECT id FROM users WHERE email = ?', [strtolower(trim($data['email']))]);
        if ($check) return $this->json(['error' => 'Email already in use.'], 409);

        $maxRow = DB::selectOne("SELECT MAX(CAST(SUBSTRING(id,2) AS UNSIGNED)) AS m FROM users");
        $maxId = (int)($maxRow->m ?? 0);
        $newId = 'U' . str_pad($maxId + 1, 3, '0', STR_PAD_LEFT);

        DB::beginTransaction();
        try {
            DB::insert('INSERT INTO users (id, name, role, email, password, position, initials, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [$newId, $data['name'], $assignedRoles[0], strtolower(trim($data['email'])),
                 password_hash($data['password'], PASSWORD_BCRYPT),
                 $data['position'] ?? '', InventoryService::makeInitials($data['name']), $data['status'] ?? 'active']);
            $this->replaceUserRoles($newId, $assignedRoles);
            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }

        $row = DB::selectOne('SELECT id, name, role, email, position, initials, status, last_login FROM users WHERE id = ?', [$newId]);
        return $this->json(InventoryService::formatUser((array)$row), 201);
    }
}
