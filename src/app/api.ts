/**
 * SmartTrack — API Client
 *
 * Handles communication with XAMPP backend:
 *  - Electron (file://) → http://localhost/SmartTrack/api
 *  - Vite dev server (localhost:5173) → /SmartTrack/api (proxied) or http://localhost/SmartTrack/api
 *  - Production (XAMPP) → /SmartTrack/api or http://localhost/SmartTrack/api
 *
 * Authentication:
 *  - Bearer Token (stateless) for Electron and API clients
 *  - Session Cookie (stateful) fallback for browser
 *  - Token stored in localStorage and included in all requests
 */

const TOKEN_KEY = 'st_token';
const ACTIVE_ROLE_KEY = 'st_active_role';
let activeRoleMemory: string | null = null;

// Debug logging
const DEBUG = import.meta.env.DEV;
const log = (msg: string, data?: unknown) => {
  if (DEBUG) console.log(`[API] ${msg}`, data || '');
};

export const tokenStore = {
  get: (): string | null => {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) log('Token retrieved from storage');
      return token;
    } catch {
      log('Failed to read token from storage');
      return null;
    }
  },
  set: (token: string): void => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      log('Token stored', token.substring(0, 16) + '...');
    } catch {
      log('Failed to store token');
    }
  },
  clear: (): void => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      log('Token cleared');
    } catch {
      log('Failed to clear token');
    }
  },
};

export const activeRoleStore = {
  get: (): string | null => {
    try {
      activeRoleMemory = localStorage.getItem(ACTIVE_ROLE_KEY) ?? activeRoleMemory;
    } catch {
      // Keep the selected role for this runtime if storage is unavailable.
    }
    return activeRoleMemory;
  },
  set: (role: string): void => {
    activeRoleMemory = role;
    try {
      localStorage.setItem(ACTIVE_ROLE_KEY, role);
    } catch {
      log('Could not persist active role');
    }
  },
  clear: (): void => {
    activeRoleMemory = null;
    try {
      localStorage.removeItem(ACTIVE_ROLE_KEY);
    } catch {
      log('Could not clear persisted active role');
    }
  },
};

function getApiBase(): string {
  if (typeof window === 'undefined') {
    return 'http://localhost/SmartTrack/api';
  }

  // Environment variable override
  const configuredApiBase = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '');
  if (configuredApiBase) {
    log('Using configured API base', configuredApiBase);
    return configuredApiBase;
  }

  const { protocol, hostname, port } = window.location;

  // Electron app running from file:// protocol
  if (protocol === 'file:') {
    log('Electron app detected (file:// protocol)', 'Using http://127.0.0.1/SmartTrack/api');
    return 'http://127.0.0.1/SmartTrack/api';
  }

  // Vite dev server or production on non-standard port
  if (port && port !== '80' && port !== '443') {
    log('Dev server detected', `port ${port}, using /SmartTrack/api`);
    return '/SmartTrack/api';
  }

  // Production on XAMPP (port 80)
  const apiHost = hostname === 'localhost' ? '127.0.0.1' : hostname;
  const apiBase = `${protocol}//${apiHost}/SmartTrack/api`;
  log('Production XAMPP detected', apiBase);
  return apiBase;
}

export const API_BASE = getApiBase();
log('API Base URL', API_BASE);

/** Generic fetch wrapper — throws on non-2xx with detailed error info. */
async function request<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = tokenStore.get();
  const authHeader: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};
  const activeRole = activeRoleStore.get();
  if (activeRole) authHeader['X-Active-Role'] = activeRole;

  const fullUrl = `${API_BASE}${path}`;
  const startTime = performance.now();

  log(`${options.method || 'GET'} ${path}`);

  try {
    const res = await fetch(fullUrl, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
        ...options.headers,
      },
      ...options,
    });

    const duration = performance.now() - startTime;
    log(`Response ${res.status} (${duration.toFixed(0)}ms)`);

    // Handle non-2xx responses
    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      let errorData: unknown = null;

      try {
        errorData = await res.json();
        errorMsg = (errorData as any)?.error ?? errorMsg;
      } catch {
        // Response wasn't JSON, use status message
        errorMsg = res.statusText || errorMsg;
      }

      // Check for authentication errors
      if (res.status === 401) {
        log('Authentication failed - clearing token');
        tokenStore.clear();
      }

      throw new Error(errorMsg);
    }

    // 204 No Content
    if (res.status === 204) return undefined as T;

    if (!res.headers.get('content-type')?.includes('application/json')) {
      throw new Error(
        'The API returned a non-JSON response. Check that api/config.php is set up and the request reached the SmartTrack API.'
      );
    }

    const data = await res.json() as T;
    log(`Parsed response`, data);
    return data;
  } catch (error) {
    const duration = performance.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`Error after ${duration.toFixed(0)}ms: ${errorMsg}`);
    throw error;
  }
}

const get  = <T>(path: string) => request<T>(path, { method: 'GET' });
const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });
const put  = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
const del  = <T>(path: string) => request<T>(path, { method: 'DELETE' });
const delWithBody = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'DELETE', body: JSON.stringify(body) });

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: async (email: string, password: string) => {
    activeRoleStore.clear();
    const res = await post<{ user: import('./data').AuthUser; token: string }>(
      '/auth/login', { email, password }
    );
    // Persist the token so all subsequent requests include it
    if (res.token) tokenStore.set(res.token);
    return res;
  },
  logout: async () => {
    try { await post('/auth/logout', {}); } catch { /* ignore */ }
    tokenStore.clear();
    activeRoleStore.clear();
  },
  me: () => get<{ user: import('./data').AuthUser }>('/auth/me'),
};

// ─── Products ─────────────────────────────────────────────────────────────────
// ─── Deleted item types (Recycle Bin) ────────────────────────────────────────
export interface DeletedProduct {
  id: string;
  name: string;
  category: string;
  stock: number;
  deletedAt: string;
  deletedByName?: string;
  deleteNote?: string;
  daysSinceDelete: number;
}

export interface DeletedUser {
  id: string;
  name: string;
  initials: string;
  role: string;
  roles?: string[];
  deletedAt: string;
  deletedByName?: string;
  deleteNote?: string;
  daysSinceDelete: number;
}

export interface ActivityLogEntry {
  id: string;
  actorId: string | null;
  actor: string;
  method: string;
  path: string;
  status: number;
  ts: string;
}

export interface ActivityLogActor {
  id: string | null;
  name: string;
}

export interface ActivityLogPage {
  entries: ActivityLogEntry[];
  actors: ActivityLogActor[];
  hasMore: boolean;
  nextCursor: string | null;
}

export const productsApi = {
  list:         (search = '', status = 'all') =>
    get<import('./data').Product[]>(`/products?search=${encodeURIComponent(search)}&status=${status}`),
  get:          (id: string) => get<import('./data').Product>(`/products/${id}`),
  create:       (data: unknown) => post<import('./data').Product>('/products', data),
  update:       (id: string, data: unknown) => put<import('./data').Product>(`/products/${id}`, data),
  delete:       (id: string) => del(`/products/${id}`),
  addBatch:     (productId: string, data: unknown) =>
    post(`/products/${productId}/batches`, data),
  deleteBatch:  (productId: string, batchId: string) =>
    del(`/products/${productId}/batches/${batchId}`),
  listDeleted:  () => get<DeletedProduct[]>('/products/deleted'),
  restore:      (id: string) => post<{ message: string }>(`/products/${id}/restore`, {}),
  purge:        (id: string) => del<{ message: string }>(`/products/${id}/purge`),
  setSupplier:  (id: string, supplier: string) => put(`/products/${id}`, { supplier }),
  bulkImport:   (items: Array<Record<string, unknown>>) =>
    post<{
      success: boolean;
      created: number;
      updated: number;
      total: number;
      errors: string[];
      message: string;
    }>('/products/import', { items }),
};

// ─── Categories ───────────────────────────────────────────────────────────────
export const categoriesApi = {
  list:   () => get<string[]>('/categories'),
  create: (name: string) => post('/categories', { name }),
  delete: (id: number)   => del(`/categories/${id}`),
};

// ─── Transactions ─────────────────────────────────────────────────────────────
export const transactionsApi = {
  list: (type = 'all', dateFrom = '', dateTo = '') => {
    const params = new URLSearchParams({ type });
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo)   params.set('date_to', dateTo);
    return get<import('./data').Transaction[]>(`/transactions?${params}`);
  },
  get:        (id: string) => get<import('./data').Transaction>(`/transactions/${id}`),
  sale:       (data: {
    product_id?: string;
    qty?: number;
    sale_qty?: number;
    sale_unit?: string;
    customer_vat_exempt?: boolean;
    customer_exemption_type?: string | null;
    customer_id_number?: string | null;
    items?: Array<{
      product_id: string;
      qty?: number;
      sale_qty?: number;
      sale_unit?: string;
        apply_customer_discount?: boolean;
    }>;
  }) =>
    post<{
      saleId?: string;
      transaction?: import('./data').Transaction;
      product?: import('./data').Product;
      transactions?: import('./data').Transaction[];
      products?: import('./data').Product[];
    }>(
      '/transactions/sale', data),
  adjustment: (data: { product_id: string; qty: number; reason: string; adjust_type: 'damage' | 'correction' }) =>
    post<{ transaction: import('./data').Transaction; product: import('./data').Product }>(
      '/transactions/adjustment', data),
  exportCsv: () => {
    const token = tokenStore.get();
    const url   = `${API_BASE}/transactions/export${token ? `?token=${token}` : ''}`;
    window.open(url, '_blank');
  },
};

export type ReturnRequest = {
  returnTxId:   string;   // product_returns.id (RET-* or BRK-*)
  saleTxId:     string;   // original sale tx id; equals returnTxId for broken records
  productId:    string;
  product:      string;   // product_name (denormalised)
  qty:          number;   // base units
  refund:       number;   // refund_amount; 0 for broken records
  reason:       string;
  cashier:      string;   // recorded_by_name (denormalised)
  createdAt:    string;   // "MM/DD/YYYY HH:mm"
  disposition:  'pending' | 'restocked' | 'broken';
  processedAt:  string | null;
  saleUnit:     'unit' | 'pack';
  unitsPerSale: number;
  returnType:   'return' | 'adjustment'; // 'return' = customer return, 'adjustment' = broken
};

export const returnRequestsApi = {
  list: () =>
    get<ReturnRequest[]>('/return-requests'),
  submit: (data: { sale_tx_id: string; qty: number; reason: string }) =>
    post<{
      record: ReturnRequest;
      transaction: import('./data').Transaction;
      disposition: 'pending';
    }>('/return-requests', data),
  setDisposition: (returnTxId: string, disposition: 'restocked' | 'broken') =>
    put<{ message: string; product: import('./data').Product }>(`/return-requests/${returnTxId}`, { disposition }),
  reportBroken: (data: {
    product_id: string;
    qty: number;
    reason: string;
    sale_qty?: number;
    sale_unit?: 'unit' | 'pack';
    units_per_sale?: number;
  }) =>
    post<{ message: string; record: ReturnRequest; product: import('./data').Product }>('/return-requests/broken', data),
};

// ─── Users ────────────────────────────────────────────────────────────────────
export const usersApi = {
  list:           () => get<import('./data').StaffMember[]>('/users'),
  get:            (id: string) => get<import('./data').StaffMember>(`/users/${id}`),
  create:         (data: unknown) => post<import('./data').StaffMember>('/users', data),
  update:         (id: string, data: unknown) => put<import('./data').StaffMember>(`/users/${id}`, data),
  delete:         (id: string) => del<{ message: string }>(`/users/${id}`),
  changePassword: (id: string, password: string) =>
    put(`/users/${id}/password`, { password }),
  resetPassword:  (id: string) =>
    post<{ message: string }>(`/users/${id}/reset-password`, {}),
  createPassword: (id: string, password: string) =>
    put<{ message: string }>(`/users/${id}/password`, { password }),
  listDeleted:    () => get<DeletedUser[]>('/users/deleted'),
  restore:        (id: string) => post<{ message: string }>(`/users/${id}/restore`, {}),
  purge:          (id: string) => del<{ message: string }>(`/users/${id}/purge`),
  removeOwnRole:  (id: string, role: string) =>
    delWithBody<import('./data').StaffMember>(`/users/${id}/roles`, { role }),
};

export const activityApi = {
  list: (options: { before?: string; actorId?: string } = {}) => {
    const params = new URLSearchParams({ limit: '50' });
    if (options.before) params.set('before', options.before);
    if (options.actorId) params.set('actor_id', options.actorId);
    return get<ActivityLogPage>(`/activity?${params.toString()}`);
  },
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationsApi = {
  list:     () => get<import('./data').Notification[]>('/notifications'),
  markOne:  (id: number) => post('/notifications/mark-read', { id }),
  markAll:  () => post('/notifications/mark-read', {}),
  generate: () => post('/notifications/generate', {}),
};

export interface ReceiptSettings {
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  businessTin: string;
  orPrefix: string;
}

export interface PublicBusinessSettings {
  businessName: string;
  businessAddress: string;
}

export const receiptSettingsApi = {
  get: () => get<ReceiptSettings>('/settings/receipt'),
  getPublic: () => get<PublicBusinessSettings>('/settings/public'),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
export interface CashierDashboardSummary {
  todayRevenue: number;
  todaySalesCount: number;
  todayUnits: number;
  todayReturnsCount: number;
  todayReturnedUnits: number;
  weekRevenue: number;
  weekSalesCount: number;
  stockAlertCount: number;
}

export const dashboardApi = {
  cashier: () => get<CashierDashboardSummary>('/dashboard/cashier'),
  get: () => get<{
    weekChart:   { key: string; revenue: number }[];
    weekRevenue: number;
    topProducts: { name: string; sold: number }[];
    recentTx:    import('./data').Transaction[];
    stats: {
      totalStockUnits: number; productCount: number;
      lowStockCount: number;  criticalCount: number;
      expiredCount: number;   within30Count: number;
      within90Count: number;  totalAlertBadge: number;
    };
    stockAlerts: { id: string; name: string; status: string; stock: number; reorder: number }[];
  }>('/dashboard'),
};

// ─── Analytics ────────────────────────────────────────────────────────────────
export const analyticsApi = {
  sma: (filters: { productId?: string; category?: string } = {}) => get<{
    chartData:    { month: string; demand: number; supply: number; sma3: number | null; sma6: number | null }[];
    sma3:         number;
    sma6:         number;
    eoq:          number;
    totalDamaged: number;
    adjustCount:  number;
    returnLoss: number;
    brokenLoss: number;
    totalLoss: number;
    uncostedBrokenCount: number;
  }>(`/analytics/sma?product_id=${encodeURIComponent(filters.productId ?? '')}&category=${encodeURIComponent(filters.category ?? '')}`),
  eoq:          () => get('/analytics/eoq'),
  performance:  () => get('/analytics/performance'),
  categorySales:() => get<{ name: string; value: number }[]>('/analytics/category-sales'),
  adjustments:  () => get('/analytics/adjustments'),
};

// ─── Reports ──────────────────────────────────────────────────────────────────
export const reportsApi = {
  sales:     () => get('/reports/sales'),
  stock:     () => get('/reports/stock'),
  inventory: () => get('/reports/inventory'),
};

// ─── Financial Management ─────────────────────────────────────────────────────
export const financialApi = {
  summary:   (dateFrom = '', dateTo = '') => {
    const p = new URLSearchParams();
    if (dateFrom) p.set('date_from', dateFrom);
    if (dateTo)   p.set('date_to',   dateTo);
    const qs = p.toString() ? `?${p}` : '';
    return get<{
      totalRevenue: number; totalPreTax: number; totalVatCollected: number; netVatPayable: number;
      totalReturns: number; netRevenue: number;
      brokenStockLoss: number; totalLosses: number; netAfterLosses: number;
      uncostedBrokenCount: number;
      salesCount: number; returnsCount: number;
      adjustmentsCount: number; totalTransactions: number; avgOrderValue: number;
      todayRevenue: number; weekRevenue: number; monthRevenue: number;
    }>(`/financial/summary${qs}`);
  },
  daily:     (days = 30) =>
    get<{ date: string; revenue: number; returns: number; brokenLoss: number }[]>(`/financial/daily?days=${days}`),
  monthly:   () =>
    get<{ month: string; revenue: number; returns: number; brokenLoss: number; net: number; netAfterLosses: number; sales_count: number }[]>('/financial/monthly'),
  records:   (params: { type?: string; dateFrom?: string; dateTo?: string; page?: number; perPage?: number }) => {
    const p = new URLSearchParams({ type: params.type ?? 'all', page: String(params.page ?? 1), per_page: String(params.perPage ?? 25) });
    if (params.dateFrom) p.set('date_from', params.dateFrom);
    if (params.dateTo)   p.set('date_to',   params.dateTo);
    return get<{
      records: { id: string; type: string; product: string; qty: number; amount: number; staff: string; note: string; status: string; date: string }[];
      total: number; page: number; per_page: number; pages: number;
    }>(`/financial/records?${p}`);
  },
  breakdown: (dateFrom = '', dateTo = '') => {
    const p = new URLSearchParams();
    if (dateFrom) p.set('date_from', dateFrom);
    if (dateTo)   p.set('date_to',   dateTo);
    const qs = p.toString() ? `?${p}` : '';
    return get<{ category: string; revenue: number; units: number; share: number }[]>(`/financial/breakdown${qs}`);
  },
  staff:     (dateFrom = '', dateTo = '') => {
    const p = new URLSearchParams();
    if (dateFrom) p.set('date_from', dateFrom);
    if (dateTo)   p.set('date_to',   dateTo);
    const qs = p.toString() ? `?${p}` : '';
    return get<{ staff: string; transactions: number; revenue: number; unitsSold: number }[]>(`/financial/staff${qs}`);
  },
  exportCsv: (type = 'all', dateFrom = '', dateTo = '') => {
    const p = new URLSearchParams({ type });
    if (dateFrom) p.set('date_from', dateFrom);
    if (dateTo)   p.set('date_to',   dateTo);
    const token = tokenStore.get();
    if (token)   p.set('token', token);
    window.open(`${API_BASE}/financial/export?${p}`, '_blank');
  },
  income: (dateFrom = '', dateTo = '') => {
    const p = new URLSearchParams();
    if (dateFrom) p.set('date_from', dateFrom);
    if (dateTo)   p.set('date_to',   dateTo);
    const qs = p.toString() ? `?${p}` : '';
    return get<{
      rows: {
        productId: string; productName: string; category: string;
        unitsSold: number; revenue: number;
        totalCost: number | null; grossProfit: number | null;
        margin: number | null; avgUnitCost: number | null;
        multiCost: boolean; hasCostData: boolean;
      }[];
      totals: { revenue: number; totalCost: number; grossProfit: number; margin: number | null };
    }>(`/financial/income${qs}`);
  },
};

// ─── Stock Alerts ─────────────────────────────────────────────────────────────
export const stockAlertsApi = {
  all:    () => get('/stock-alerts'),
  stock:  () => get('/stock-alerts/stock'),
  expiry: () => get('/stock-alerts/expiry'),
};


// ─── Purchase Orders ───────────────────────────────────────────────────────────
export interface PurchaseOrderItem {
  id: number;
  productId: string;
  productName: string;
  qtyOrdered: number;
  qtyReceived: number;
  qtyRemaining: number;
}

export interface PurchaseOrder {
  id: number;
  supplier: string;
  orderedAt: string;
  expectedDeliveryDate: string | null;
  status: 'ordered' | 'partially_received' | 'received' | 'cancelled';
  createdAt: string;
  items: PurchaseOrderItem[];
}

export interface SupplierPerformance {
  supplier: string;
  orderCount: number;
  qtyOrdered: number;
  qtyFulfilled: number;
  fulfillmentRate: number | null;
  openOrders: number;
  avgLeadDays?: number | null;
  receiptCount?: number;
}

export const purchaseOrdersApi = {
  list: () => get<PurchaseOrder[]>('/purchase-orders'),
  performance: () => get<SupplierPerformance[]>('/purchase-orders/performance'),
  get: (id: number) => get<PurchaseOrder>(`/purchase-orders/${id}`),
  create: (data: {
    supplier: string;
    orderedAt: string;
    expectedDeliveryDate: string | null;
    items: { productId: string; qtyOrdered: number }[];
  }) => post<{ id: number; message: string }>('/purchase-orders', data),
  receive: (id: number, data: {
    receivedAt: string;
    items: { itemId: number; qtyReceived: number; expiryDate: string | null; batchTotalCost: number | null }[];
  }) => post<{ message: string }>(`/purchase-orders/${id}/receipts`, data),
  update: (id: number, data: {
    supplier?: string;
    orderedAt?: string;
    expectedDeliveryDate?: string | null;
    items?: { productId: string; qtyOrdered: number }[];
  }) => put<{ message: string }>(`/purchase-orders/${id}`, data),
  cancel: (id: number) => del<{ message: string }>(`/purchase-orders/${id}`),
};

// ─── Roles ────────────────────────────────────────────────────────────────────
export const rolesApi = {
  list:   () => get<import('./data').CustomRole[]>('/roles'),
  get:    (id: string) => get<import('./data').CustomRole>(`/roles/${id}`),
  create: (data: { name: string; description: string; permissions: string[] }) =>
    post<import('./data').CustomRole>('/roles', data),
  update: (id: string, data: { name: string; description: string; permissions: string[] }) =>
    put<import('./data').CustomRole>(`/roles/${id}`, data),
  delete: (id: string) => del<{ message: string }>(`/roles/${id}`),
};

// ─── Offline Database & Disaster Recovery ─────────────────────────────────────
export interface DatabaseBackupStatus {
  database: string;
  tableCount: number;
  productCount: number;
  transactionCount: number;
  backupCount: number;
  lastBackup: {
    file: string;
    date: string;
    size: string;
  } | null;
  offlineMode: boolean;
  systemVersion: string;
  migrationCount?: number;
}

export const backupApi = {
  getStatus: () => get<DatabaseBackupStatus>('/backup/status'),
  createBackup: () => post<{ success: boolean; message: string; filename: string; size: string }>('/backup/create'),
  runMigrations: () => post<{ success: boolean; message: string }>('/backup/migrate'),
  downloadBackupUrl: () => `${getApiBase()}/backup/export`,
  restoreBackup: async (file: File) => {
    const formData = new FormData();
    formData.append('backup_file', file);
    const token = tokenStore.get();
    const res = await fetch(`${getApiBase()}/backup/restore`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Restore failed' }));
      throw new Error(err.error || 'Restore failed');
    }
    return res.json() as Promise<{ success: boolean; message: string; restoredFrom: string }>;
  },
};

