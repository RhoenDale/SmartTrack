/**
 * SmartTrack — API client
 *
 * Auto-detects API base URL:
 *  - Vite dev server (localhost:5173) → proxied via /api
 *  - XAMPP built app (localhost/SmartTrack/dist/) → /SmartTrack/api
 *  - Electron → http://localhost/SmartTrack/api
 */

function getApiBase(): string {
  if (typeof window === 'undefined') return 'http://localhost/SmartTrack/api';

  const { protocol, hostname, port } = window.location;

  // Vite dev server (any port that's not 80/443)
  if (port && port !== '80' && port !== '443') {
    return '/SmartTrack/api';
  }

  // Served directly from XAMPP (port 80)
  return `${protocol}//${hostname}/SmartTrack/api`;
}

export const API_BASE = getApiBase();

/** Generic fetch wrapper — throws on non-2xx. */
async function request<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      msg = err.error ?? msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

const get  = <T>(path: string) => request<T>(path, { method: 'GET' });
const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });
const put  = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
const del  = <T>(path: string) => request<T>(path, { method: 'DELETE' });

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login:  (email: string, password: string) =>
    post<{ user: import('./data').AuthUser }>('/auth/login', { email, password }),
  logout: () => post('/auth/logout', {}),
  me:     () => get<{ user: import('./data').AuthUser }>('/auth/me'),
};

// ─── Products ─────────────────────────────────────────────────────────────────
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
  sale:       (data: { product_id: string; qty: number }) =>
    post<{ transaction: import('./data').Transaction; product: import('./data').Product }>(
      '/transactions/sale', data),
  return:     (data: { sale_tx_id: string; qty: number; reason: string }) =>
    post<{ transaction: import('./data').Transaction; product: import('./data').Product }>(
      '/transactions/return', data),
  adjustment: (data: { product_id: string; qty: number; reason: string; adjust_type: 'damage' | 'correction' }) =>
    post<{ transaction: import('./data').Transaction; product: import('./data').Product }>(
      '/transactions/adjustment', data),
  exportCsv: () => {
    // Opens CSV download directly
    window.open(`${API_BASE}/transactions/export`, '_blank');
  },
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
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationsApi = {
  list:     () => get<import('./data').Notification[]>('/notifications'),
  markOne:  (id: number) => post('/notifications/mark-read', { id }),
  markAll:  () => post('/notifications/mark-read', {}),
  generate: () => post('/notifications/generate', {}),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const dashboardApi = {
  get: () => get<{
    weekChart:   { key: string; revenue: number; profit: number }[];
    weekRevenue: number;
    weekProfit:  number;
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
  sma: () => get<{
    chartData:    { month: string; demand: number; supply: number; sma3: number | null; sma6: number | null }[];
    sma3:         number;
    sma6:         number;
    eoq:          number;
    totalDamaged: number;
    adjustCount:  number;
  }>('/analytics/sma'),
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

// ─── Stock Alerts ─────────────────────────────────────────────────────────────
export const stockAlertsApi = {
  all:    () => get('/stock-alerts'),
  stock:  () => get('/stock-alerts/stock'),
  expiry: () => get('/stock-alerts/expiry'),
};
