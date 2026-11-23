# SmartTrack — Laravel Backend

The SmartTrack backend has been migrated from plain PHP to the **Laravel 9** framework.
All 80 API endpoints have been ported and verified to work exactly as before.

## Architecture

```
SmartTrack/
├── api/                        ← Front-facing API entry point (unchanged URLs)
│   ├── index.php               ← Bridge: bootstraps Laravel, rewrites /api/* → Laravel router
│   └── .htaccess               ← Rewrites all requests to index.php, passes Authorization header
├── backend/                    ← Laravel 9 application
│   ├── app/
│   │   ├── Http/
│   │   │   ├── Controllers/Api/   (18 controllers)
│   │   │   │   ├── ApiHelpers.php  (shared trait: body parsing, role checks, JSON)
│   │   │   │   ├── AuthController.php
│   │   │   │   ├── ProductController.php
│   │   │   │   ├── BatchController.php
│   │   │   │   ├── CategoryController.php
│   │   │   │   ├── TransactionController.php
│   │   │   │   ├── ReturnRequestController.php
│   │   │   │   ├── UserController.php
│   │   │   │   ├── RoleController.php
│   │   │   │   ├── SettingsController.php
│   │   │   │   ├── NotificationController.php
│   │   │   │   ├── DashboardController.php
│   │   │   │   ├── AnalyticsController.php
│   │   │   │   ├── ReportController.php
│   │   │   │   ├── FinancialController.php
│   │   │   │   ├── StockAlertController.php
│   │   │   │   ├── PurchaseOrderController.php
│   │   │   │   ├── ActivityController.php
│   │   │   │   ├── BackupController.php
│   │   │   │   └── HealthController.php
│   │   │   ├── Middleware/
│   │   │   │   ├── AuthenticateToken.php  (Bearer token auth via auth_tokens table)
│   │   │   │   ├── Cors.php               (CORS + preflight handling)
│   │   │   │   └── LogActivity.php        (records each request to activity_logs)
│   │   │   └── Kernel.php
│   │   ├── Services/
│   │   │   └── InventoryService.php       (FIFO, batch logic, formatting, EOQ/SMA)
│   │   └── Exceptions/
│   │       └── Handler.php                 (JSON error responses for all API errors)
│   ├── routes/api.php                      (all 80 API routes)
│   ├── config/ (cors.php, database.php, etc.)
│   └── .env                                 (DB credentials, app config)
└── src/                       ← Frontend (unchanged — same API_BASE)
```

## How it works

The frontend still calls `/SmartTrack/api/{resource}` through XAMPP Apache on port 80.
The `api/index.php` bridge bootstraps the Laravel app from `../backend/` and rewrites
the request URI from `/SmartTrack/api/products` → `/api/products` so Laravel's router
matches it to the correct controller.

Authentication uses the same Bearer-token mechanism as before: the `auth_tokens` table
stores 64-char hex tokens tied to users, with the `AuthenticateToken` middleware
validating them on every protected request. The `X-Active-Role` header selects which
of the user's assigned roles is active for the request.

## Key design decisions

- **Raw SQL via `DB::` facade** — not Eloquent ORM. The original queries are
  well-optimized and use MySQL-specific features (GROUP_CONCAT, window-style
  aggregation, FOR UPDATE locks). Porting them to Eloquent would add complexity
  without benefit. `DB::getPdo()` is used where PDO prepared statements are needed.
- **MySQL strict mode disabled** — the original GROUP BY clauses are non-strict
  (selecting columns not in the GROUP BY). `config/database.php` has `strict => false`.
- **Token auth, not Sanctum/Passport** — reuses the existing `auth_tokens` table
  and the exact same 64-char hex token format so the Electron app and browser
  keep working without changes.
- **Activity logging** — the `LogActivity` middleware (in the `api` middleware group)
  records every authenticated request to `activity_logs`, matching the legacy behavior.
- **Error handling** — the `Handler` always returns JSON for API routes, mapping PDO
  error codes (1062→409, 1451→409, 1452→422, 1265→503) to the same status codes.

## Running

The backend runs under XAMPP (Apache + MySQL), the same as before:

1. Start XAMPP Apache and MySQL.
2. The API is available at `http://localhost/SmartTrack/api/...`.
3. No frontend changes needed — the same API_BASE and token auth work.

To run Artisan commands (migrations, tinker, etc.):

```bash
cd C:\xampp\htdocs\SmartTrack\backend
C:\xampp\php\php.exe artisan <command>
```

## Verification

All 80 routes load, all endpoints return correct JSON, and write operations
(sales with FIFO deduction, category creation, notifications, backups) work
end-to-end through the Apache bridge.
