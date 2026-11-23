<?php

use App\Http\Controllers\Api\ActivityController;
use App\Http\Controllers\Api\AnalyticsController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BackupController;
use App\Http\Controllers\Api\BatchController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\FinancialController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\PurchaseOrderController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\ReturnRequestController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\StockAlertController;
use App\Http\Controllers\Api\TransactionController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| SmartTrack API Routes
|--------------------------------------------------------------------------
| All routes are prefixed with /api by the RouteServiceProvider.
| The frontend reaches these via the bridge at /SmartTrack/api/*.
|
| The auth.token middleware resolves the Bearer token and stores the
| authenticated user on the request. The log.activity middleware
| (registered in the api middleware group) records each request.
*/

Route::get('/health', [HealthController::class, 'index']);

// Auth
Route::post('/auth/login', [AuthController::class, 'login']);
Route::post('/auth/logout', [AuthController::class, 'logout'])->middleware('auth.token');
Route::get('/auth/me', [AuthController::class, 'me'])->middleware('auth.token');

// Settings (public receipt info — no auth)
Route::get('/settings/public', [SettingsController::class, 'public']);
Route::get('/settings/receipt', [SettingsController::class, 'receipt'])->middleware('auth.token');

// Activity
Route::get('/activity', [ActivityController::class, 'index'])->middleware('auth.token');

// Products — special sub-routes BEFORE the generic {id} block
Route::middleware('auth.token')->group(function () {
    Route::get('/products/deleted', [ProductController::class, 'deleted']);
    Route::post('/products/import', [ProductController::class, 'import']);
    Route::get('/products', [ProductController::class, 'index']);
    Route::post('/products', [ProductController::class, 'store']);

    // Batches — defined before the {id} route so /products/{id}/batches wins
    Route::get('/products/{id}/batches', [BatchController::class, 'index'])->where('id', '[^/]+');
    Route::post('/products/{id}/batches', [BatchController::class, 'store'])->where('id', '[^/]+');
    Route::delete('/products/{id}/batches/{batchId}', [BatchController::class, 'destroy'])->where(['id' => '[^/]+', 'batchId' => '[^/]+']);

    // Restore / purge / supplier
    Route::post('/products/{id}/restore', [ProductController::class, 'restore'])->where('id', '[^/]+');
    Route::delete('/products/{id}/purge', [ProductController::class, 'purge'])->where('id', '[^/]+');
    Route::post('/products/{id}/supplier', [ProductController::class, 'updateSupplier'])->where('id', '[^/]+');

    // Generic single-product routes (must come last among /products/*)
    Route::get('/products/{id}', [ProductController::class, 'show'])->where('id', '[^/]+');
    Route::put('/products/{id}', [ProductController::class, 'update'])->where('id', '[^/]+');
    Route::delete('/products/{id}', [ProductController::class, 'destroy'])->where('id', '[^/]+');
});

// Categories
Route::middleware('auth.token')->group(function () {
    Route::get('/categories', [CategoryController::class, 'index']);
    Route::post('/categories', [CategoryController::class, 'store']);
    Route::delete('/categories/{id}', [CategoryController::class, 'destroy'])->where('id', '[^/]+');
});

// Transactions — special actions BEFORE the {id} block
Route::middleware('auth.token')->group(function () {
    Route::get('/transactions/export', [TransactionController::class, 'export']);
    Route::post('/transactions/sale', [TransactionController::class, 'sale']);
    Route::post('/transactions/adjustment', [TransactionController::class, 'adjustment']);
    Route::get('/transactions', [TransactionController::class, 'index']);
    Route::get('/transactions/{id}', [TransactionController::class, 'show'])->where('id', '[^/]+');
});

// Return Requests
Route::middleware('auth.token')->group(function () {
    Route::get('/return-requests', [ReturnRequestController::class, 'index']);
    Route::post('/return-requests/broken', [ReturnRequestController::class, 'broken']);
    Route::post('/return-requests', [ReturnRequestController::class, 'store']);
    Route::put('/return-requests/{id}', [ReturnRequestController::class, 'update'])->where('id', '[A-Za-z0-9\-]+');
});

// Users
Route::middleware('auth.token')->group(function () {
    Route::get('/users/deleted', [UserController::class, 'deleted']);
    Route::get('/users', [UserController::class, 'index']);
    Route::post('/users', [UserController::class, 'store']);
    Route::get('/users/{id}', [UserController::class, 'show'])->where('id', '[^/]+');
    Route::put('/users/{id}/password', [UserController::class, 'changePassword'])->where('id', '[^/]+');
    Route::post('/users/{id}/reset-password', [UserController::class, 'resetPassword'])->where('id', '[^/]+');
    Route::post('/users/{id}/restore', [UserController::class, 'restore'])->where('id', '[^/]+');
    Route::delete('/users/{id}/purge', [UserController::class, 'purge'])->where('id', '[^/]+');
    Route::delete('/users/{id}/roles', [UserController::class, 'removeRole'])->where('id', '[^/]+');
    Route::put('/users/{id}', [UserController::class, 'update'])->where('id', '[^/]+');
    Route::delete('/users/{id}', [UserController::class, 'destroy'])->where('id', '[^/]+');
});

// Roles
Route::middleware('auth.token')->group(function () {
    Route::get('/roles', [RoleController::class, 'index']);
    Route::post('/roles', [RoleController::class, 'store']);
    Route::get('/roles/{id}', [RoleController::class, 'show'])->where('id', '[^/]+');
    Route::put('/roles/{id}', [RoleController::class, 'update'])->where('id', '[^/]+');
    Route::delete('/roles/{id}', [RoleController::class, 'destroy'])->where('id', '[^/]+');
});

// Notifications
Route::middleware('auth.token')->group(function () {
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications', [NotificationController::class, 'store']);
    Route::post('/notifications/mark-read', [NotificationController::class, 'markRead']);
    Route::post('/notifications/generate', [NotificationController::class, 'generate']);
});

// Dashboard
Route::middleware('auth.token')->group(function () {
    Route::get('/dashboard/cashier', [DashboardController::class, 'cashier']);
    Route::get('/dashboard', [DashboardController::class, 'admin']);
});

// Analytics
Route::middleware('auth.token')->group(function () {
    Route::get('/analytics/monthly-demand', [AnalyticsController::class, 'monthlyDemand']);
    Route::get('/analytics/sma', [AnalyticsController::class, 'sma']);
    Route::get('/analytics/eoq', [AnalyticsController::class, 'eoq']);
    Route::get('/analytics/performance', [AnalyticsController::class, 'performance']);
    Route::get('/analytics/category-sales', [AnalyticsController::class, 'categorySales']);
    Route::get('/analytics/adjustments', [AnalyticsController::class, 'adjustments']);
});

// Reports
Route::middleware('auth.token')->group(function () {
    Route::get('/reports/{tab}', [ReportController::class, 'show'])->where('tab', '[^/]+');
    Route::get('/reports', [ReportController::class, 'show']);
});

// Financial
Route::middleware('auth.token')->group(function () {
    Route::get('/financial/{tab}', [FinancialController::class, 'show'])->where('tab', '[^/]+');
    Route::get('/financial', [FinancialController::class, 'show']);
});

// Stock Alerts
Route::middleware('auth.token')->group(function () {
    Route::get('/stock-alerts/stock', [StockAlertController::class, 'show']);
    Route::get('/stock-alerts/expiry', [StockAlertController::class, 'show']);
    Route::get('/stock-alerts', [StockAlertController::class, 'show']);
    Route::get('/stock-alerts/{tab}', [StockAlertController::class, 'show'])->where('tab', '[^/]+');
});

// Purchase Orders
Route::middleware('auth.token')->group(function () {
    Route::get('/purchase-orders/performance', [PurchaseOrderController::class, 'performance']);
    Route::get('/purchase-orders', [PurchaseOrderController::class, 'index']);
    Route::post('/purchase-orders', [PurchaseOrderController::class, 'store']);
    Route::post('/purchase-orders/{id}/receipts', [PurchaseOrderController::class, 'receiveDelivery'])->whereNumber('id');
    Route::get('/purchase-orders/{id}', [PurchaseOrderController::class, 'show'])->whereNumber('id');
    Route::put('/purchase-orders/{id}', [PurchaseOrderController::class, 'update'])->whereNumber('id');
    Route::delete('/purchase-orders/{id}', [PurchaseOrderController::class, 'destroy'])->whereNumber('id');
});

// Backup
Route::middleware('auth.token')->group(function () {
    Route::get('/backup/status', [BackupController::class, 'status']);
    Route::get('/backup/export', [BackupController::class, 'export']);
    Route::post('/backup/create', [BackupController::class, 'create']);
    Route::post('/backup/migrate', [BackupController::class, 'migrate']);
    Route::post('/backup/restore', [BackupController::class, 'restore']);
});
