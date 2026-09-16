// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole    = "admin/owner" | "admin" | "inventory_manager" | "cashier";
export type Page        = "dashboard" | "inventory" | "transactions" | "analytics" | "users" | "stock-alerts" | "reports" | "financial";
export type StockStatus = "good" | "moderate" | "low" | "critical";
export type TxStatus    = "completed";
export type TxType      = "sale" | "return" | "adjustment";

export interface AuthUser {
  id:        string;
  name:      string;
  role:      UserRole;
  initials:  string;
  position:  string;
  email:     string;
  status:    "active" | "inactive";
}

export interface ProductBatch {
  batchId:        string;   // e.g. "P001-B1"
  qty:            number;
  expiry:         string;   // "MM/DD/YYYY"
  expiryDate:     string;   // "YYYY-MM-DD" from API
  receivedDate:   string;   // "MM/DD/YYYY"
  batchTotalCost?: number | null; // total paid to supplier for this batch
  unitCost?:       number | null; // batchTotalCost / original qty
}

export interface Product {
  id:           string;
  name:         string;
  category:     string;
  supplier:     string;
  stock:        number;      // computed: sum of batch qty
  reorder:      number;
  price:        number;      // VAT-inclusive selling price
  sale_price?:  number | null;
  salePrice?:   number | null; // alias used in UI
  is_vat_exempt?: number | null; // 0 = standard VAT, 1 = VAT-exempt
  isVatExempt?:   boolean;       // camelCase alias
  expiry:       string;      // earliest batch expiry "MM/DD/YYYY"
  status:       StockStatus;
  batches:      ProductBatch[];
}

export interface Transaction {
  id:                string;
  type:              TxType;
  product:           string;  // product name
  productId?:        string;
  qty:               number;
  amount:            number;  // total paid by customer
  preTaxAmount?:     number;  // net of VAT (taxable base)
  taxAmount?:        number;  // VAT collected
  taxRate?:          number;  // e.g. 0.12 or 0 if exempt
  customerVatExempt?: boolean;
  customerExemptionType?: string | null;
  customerIdNumber?: string | null;
  staff:             string;
  date:              string;  // "MM/DD/YYYY HH:MM"
  status:            TxStatus;
  note?:             string;
  returnedTxId?:     string;
  batchesConsumed?:  { batchId: string; expiry: string; qty: number }[];
  adjustmentReason?: string;
  damagedQty?:       number;
}

export interface StaffMember {
  id:        string;
  name:      string;
  role:      string;
  email:     string;
  position?: string;
  status:    "active" | "inactive";
  lastLogin: string;
  initials:  string;
}

export interface Notification {
  id:        number;
  type:      "alert" | "order" | "info";
  title:     string;
  body:      string;
  time:      string;
  read:      boolean;
  productId?: string;
}

// ─── Role constants ───────────────────────────────────────────────────────────

export const ROLES = ["admin/owner", "admin", "inventory_manager", "cashier"] as const;

export const ROLE_LABELS: Record<string, string> = {
  "admin/owner":       "Admin / Owner",
  "admin":             "Admin",
  "inventory_manager": "Inventory Manager",
  "cashier":           "Cashier / Pharmacist",
};

// ─── Chart seed colours ───────────────────────────────────────────────────────

export const PIE_COLORS = ["#0d9488", "#06b6d4", "#8b5cf6", "#f59e0b", "#94a3b8"];

// ─── Pure utility functions (no data dependencies) ───────────────────────────

/** Parse expiry strings into a Date for comparison. */
export function parseExpiry(expiry: string): Date {
  const normalized = expiry.trim();
  const mmddyyyy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
  const yyyymmdd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

  const m1 = normalized.match(mmddyyyy);
  if (m1) return new Date(`${m1[3]}-${m1[1].padStart(2,"0")}-${m1[2].padStart(2,"0")}`);

  const m2 = normalized.match(yyyymmdd);
  if (m2) return new Date(`${m2[1]}-${m2[2].padStart(2,"0")}-${m2[3].padStart(2,"0")}`);

  return new Date(normalized);
}

export function formatExpiryString(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${date.getFullYear()}`;
}

export function formatExpiryInputValue(expiry: string): string {
  const date = parseExpiry(expiry);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

/** Sort batches by received date ascending (FIFO). */
export function sortBatchesFIFO(batches: ProductBatch[]): ProductBatch[] {
  return [...batches]
    .filter(b => b.qty > 0)
    .sort((a, b) => parseExpiry(a.receivedDate).getTime() - parseExpiry(b.receivedDate).getTime());
}

/** Sort batches by expiry date ascending — earliest first. */
export function sortBatchesByExpiry(batches: ProductBatch[]): ProductBatch[] {
  return [...batches]
    .filter(b => b.qty > 0)
    .sort((a, b) => parseExpiry(a.expiry).getTime() - parseExpiry(b.expiry).getTime());
}

export function getEarliestExpiry(batches: ProductBatch[]): string {
  const active = sortBatchesByExpiry(batches);
  return active.length > 0 ? active[0].expiry : "—";
}

export function getTotalStock(batches: ProductBatch[]): number {
  return batches.reduce((sum, b) => sum + b.qty, 0);
}

/** Normalize a product from the API — ensures salePrice alias and expiryDate as Date. */
export function normalizeProduct(p: Product): Product {
  return {
    ...p,
    salePrice:    p.sale_price    ?? p.salePrice    ?? undefined,
    isVatExempt:  !!(p.is_vat_exempt ?? (p.isVatExempt ? 1 : 0)),
    batches: (p.batches ?? []).map(b => ({
      ...b,
      expiryDate:     b.expiryDate     ?? b.expiry,
      batchTotalCost: b.batchTotalCost ?? null,
      unitCost:       b.unitCost       ?? null,
    })),
  };
}

export function computeSMA(values: number[], window: number): number {
  if (values.length === 0 || window <= 0) return 0;
  const slice = values.slice(-window);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

export function estimateEOQ(
  annualDemand: number, avgUnitCost: number,
  orderCost = 120, holdingRate = 0.2
): number {
  if (annualDemand <= 0 || avgUnitCost <= 0) return 0;
  return Math.max(0, Math.round(Math.sqrt((2 * annualDemand * orderCost) / (avgUnitCost * holdingRate))));
}

export function getMonthlyDemand(transactions: Transaction[]): { month: string; demand: number }[] {
  const map = new Map<string, number>();
  transactions.filter(tx => tx.type === "sale").forEach(tx => {
    const d = new Date(tx.date);
    if (Number.isNaN(d.getTime())) return;
    const key = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    map.set(key, (map.get(key) ?? 0) + tx.qty);
  });
  return Array.from(map.entries())
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .map(([month, demand]) => ({ month, demand }));
}

/** FIFO deduction — client-side preview only (actual deduction happens on server). */
export function deductFIFO(
  batches: ProductBatch[], qty: number
): { updatedBatches: ProductBatch[]; consumed: { batchId: string; expiry: string; qty: number }[] } {
  const sorted = sortBatchesFIFO(batches);
  const available = sorted.reduce((s, b) => s + b.qty, 0);
  if (qty > available) throw new Error(`Insufficient stock. Requested: ${qty}, Available: ${available}`);

  let remaining = qty;
  const consumed: { batchId: string; expiry: string; qty: number }[] = [];
  const updated = sorted.map(b => {
    if (remaining <= 0) return b;
    const take = Math.min(b.qty, remaining);
    remaining -= take;
    if (take > 0) consumed.push({ batchId: b.batchId, expiry: b.expiry, qty: take });
    return { ...b, qty: b.qty - take };
  });

  return { updatedBatches: updated.filter(b => b.qty > 0), consumed };
}

// ─── VAT / Tax utilities (Philippine BIR — 12% standard rate) ────────────────

export const VAT_RATE        = 0.12;   // 12% standard VAT
export const VAT_DIVISOR     = 1.12;   // used to extract VAT from inclusive price
export const VAT_RATE_LABEL  = "12%";

export interface TaxBreakdown {
  preTax:     number;  // net amount before VAT  (amount / 1.12)
  tax:        number;  // VAT amount             (amount - preTax)
  total:      number;  // final sale total       (= amount)
  rate:       number;  // 0.12 or 0 if exempt
  isExempt:   boolean;
}

/**
 * Compute VAT breakdown from a VAT-inclusive total.
 * Philippine BIR: prices are quoted VAT-inclusive; pre-tax = total ÷ 1.12.
 */
export function computeTax(total: number, isVatExempt = false): TaxBreakdown {
  if (isVatExempt) {
    return { preTax: total, tax: 0, total, rate: 0, isExempt: true };
  }
  const preTax = round2(total / VAT_DIVISOR);
  const tax    = round2(total - preTax);
  return { preTax, tax, total, rate: VAT_RATE, isExempt: false };
}

/** Compute tax breakdown for a product + quantity. */
export function computeSaleTax(product: Product, qty: number): TaxBreakdown {
  const unitPrice = product.salePrice ?? product.price;
  const total     = round2(unitPrice * qty);
  return computeTax(total, !!(product.isVatExempt ?? product.is_vat_exempt));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
