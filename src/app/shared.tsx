// ─── Shared utilities, UI components and small modals used across pages ───────
import React from "react";
import { X, ArrowUpRight, ArrowDownRight, Package, Trash2, Eye, EyeOff, AlertTriangle, ShieldAlert } from "lucide-react";
import { type Product, type StockStatus, type Transaction, type TxStatus, type TxType } from "./data";

// ─── Currency helpers ─────────────────────────────────────────────────────────
export const PESO = "\u20b1";
export const fmt = (n: number) =>
  `${PESO}${n.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

export function PesoIcon({ size, style }: { size?: number; style?: React.CSSProperties }) {
  return <span style={{ ...style, fontSize: size, lineHeight: 1 }}>{PESO}</span>;
}

// ─── Logic helpers ────────────────────────────────────────────────────────────
export function computeStatus(stock: number, reorder: number): StockStatus {
  if (stock < reorder * 0.4) return "critical";
  if (stock < reorder) return "low";
  if (stock < reorder * 1.5) return "moderate";
  return "good";
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join("");
}

export function nowDateStr() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${mm}/${dd}/${yyyy} ${hh}:${min}`;
}

export function staffAbbrev(name: string) {
  return name
    .split(" ")
    .map((w, i) => (i === 0 ? w[0] + "." : w))
    .join(" ");
}

// ─── SVG Charts ───────────────────────────────────────────────────────────────
export function SvgAreaChart({
  data,
  lines,
  yFormatter = (v: number) => String(v),
}: {
  data: Record<string, any>[];
  lines: { key: string; color: string; name: string }[];
  yFormatter?: (v: number) => string;
}) {
  // Handle empty or single data point
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  const W = 500; const H = 200;
  const pad = { t: 8, r: 8, b: 24, l: 46 };
  const cw = W - pad.l - pad.r; const ch = H - pad.t - pad.b;
  
  const allVals = data.flatMap(d => lines.map(l => Number(d[l.key]) || 0));
  const maxV = Math.max(...allVals, 1) * 1.08; // Ensure maxV is at least 1 to avoid division by zero
  
  // Safe calculation for x position
  const xs = (i: number) => {
    if (data.length === 1) return pad.l + cw / 2; // Center single point
    return pad.l + (i / (data.length - 1)) * cw;
  };
  
  const ys = (v: number) => pad.t + ch - (v / maxV) * ch;
  
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ overflow: "visible" }}>
      {[0, 0.25, 0.5, 0.75, 1].map(t => {
        const y = pad.t + t * ch;
        return (
          <g key={t}>
            <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="currentColor" strokeOpacity={0.06} strokeDasharray="3 3" />
            <text x={pad.l - 4} y={y + 3} textAnchor="end" fontSize={9} fill="currentColor" opacity={0.45}>{yFormatter(maxV * (1 - t))}</text>
          </g>
        );
      })}
      {data.map((d, i) => (
        <text key={String(d.day ?? d.month ?? i)} x={xs(i)} y={H - 5} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.45}>{d.day ?? d.month}</text>
      ))}
      {lines.map(line => {
        const pts = data.map((d, i) => [xs(i), ys(Number(d[line.key]) || 0)] as [number, number]);
        const linePts = pts.map(p => p.join(",")).join(" ");
        const areaPts = [`${xs(0)},${pad.t + ch}`, ...pts.map(p => p.join(",")), `${xs(data.length - 1)},${pad.t + ch}`].join(" ");
        return (
          <g key={line.key}>
            <polygon points={areaPts} fill={line.color} fillOpacity={0.1} />
            <polyline points={linePts} fill="none" stroke={line.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        );
      })}
    </svg>
  );
}

export function SvgBarChart({ data }: { data: { name: string; sold: number }[] }) {
  const W = 280; const H = 210;
  const pad = { t: 4, r: 12, b: 4, l: 82 };
  const cw = W - pad.l - pad.r; const ch = H - pad.t - pad.b;
  const maxV = Math.max(...data.map(d => d.sold)) * 1.1;
  const rowH = ch / data.length;
  const barH = Math.min(rowH * 0.55, 18);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
      {data.map((d, i) => {
        const y = pad.t + i * rowH + (rowH - barH) / 2;
        const bw = (d.sold / maxV) * cw;
        return (
          <g key={d.name}>
            <text x={pad.l - 6} y={y + barH / 2 + 3.5} textAnchor="end" fontSize={10} fill="currentColor" opacity={0.6}>{d.name}</text>
            <rect x={pad.l} y={y} width={bw} height={barH} rx={3} fill="#0d9488" fillOpacity={0.8} />
            <text x={pad.l + bw + 4} y={y + barH / 2 + 3.5} fontSize={9} fill="currentColor" opacity={0.45}>{d.sold}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Base UI components ───────────────────────────────────────────────────────
export function FieldInput({
  label, type = "text", value, onChange, placeholder, required, min, step, helperText,
}: {
  label: string; type?: string; value: string | number; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; min?: number; step?: number; helperText?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} required={required} min={min} step={step}
        className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
      />
      {helperText && <p className="text-[10px] text-muted-foreground mt-1">{helperText}</p>}
    </div>
  );
}

export function FieldSelect({
  label, value, onChange, options, required, roleLabels, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; required?: boolean;
  roleLabels?: Record<string, string>;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{label}</label>
      <select
        value={value} onChange={e => onChange(e.target.value)} required={required}
        className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
      >
        {/* Placeholder option — visible only when nothing is selected, hidden in the open dropdown */}
        {placeholder !== undefined && (
          <option value="" disabled hidden={value !== ""}>{placeholder}</option>
        )}
        {!placeholder && <option value="">Select</option>}
        {options.map(o => <option key={o} value={o}>{roleLabels?.[o] ?? o}</option>)}
      </select>
    </div>
  );
}

export function Modal({
  title, onClose, children, wide, closeOnOverlay = true,
}: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; closeOnOverlay?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 sm:items-center sm:pt-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={closeOnOverlay ? onClose : undefined} />
      <div className={`relative bg-card border border-border rounded-2xl shadow-2xl w-full ${wide ? "max-w-lg" : "max-w-md"} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={16} /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4">{children}</div>
      </div>
    </div>
  );
}

export function DeleteConfirmModal({
  product, onClose, onConfirm,
}: {
  product: Product; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-red-500 to-red-400" />
        <div className="p-6 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 flex items-center justify-center flex-shrink-0">
            <Trash2 size={24} className="text-red-500" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-foreground">Delete Product?</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              You're about to permanently delete{" "}
              <span className="font-semibold text-foreground">{product.name}</span>.
              This action cannot be undone.
            </p>
          </div>
          <div className="w-full bg-muted/40 border border-border rounded-xl px-4 py-3 flex items-center gap-3 text-left">
            <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-500/10 flex items-center justify-center flex-shrink-0">
              <Package size={14} className="text-red-500" />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">{product.name}</p>
              <p className="text-[10px] text-muted-foreground">{product.id} · {product.category} · {product.stock} units in stock</p>
            </div>
          </div>
          <div className="flex gap-3 w-full pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted/50 transition-colors">
              Cancel
            </button>
            <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors shadow-sm shadow-red-500/20">
              Delete Product
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StockBadge({ status }: { status: StockStatus }) {
  const cls: Record<StockStatus, string> = {
    good: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    moderate: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    low: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20",
    critical: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
  };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${cls[status]}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

export function TxBadge({ status }: { status: TxStatus }) {
  return <span className="px-2 py-0.5 rounded text-[10px] font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">Completed</span>;
}

export function TxTypeBadge({ type }: { type: TxType }) {
  const cfg: Record<TxType, { label: string; cls: string }> = {
    sale: { label: "Sale", cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20" },
    return: { label: "Return", cls: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20" },
    adjustment: { label: "Adjustment", cls: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20" },
  };
  const { label, cls } = cfg[type];
  return <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${cls}`}>{label}</span>;
}

export function StatCard({
  label, value, sub, icon: Icon, trend, trendUp, color,
}: {
  label: string; value: string; sub: string; icon: any; trend?: React.ReactNode; trendUp?: boolean; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col gap-3 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + "18" }}>
          <Icon size={17} style={{ color }} />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground tracking-tight tabular-nums">{value}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-xs font-medium ${trendUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
          {trendUp ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {trend}
        </div>
      )}
    </div>
  );
}

export function ViewReasonModal({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  return (
    <Modal title="Return Reason" onClose={onClose}>
      <div className="space-y-3">
        <div className="bg-muted/40 border border-border rounded-xl p-3 text-xs space-y-1.5">
          <div className="flex justify-between"><span className="text-muted-foreground">Transaction ID</span><span className="font-semibold text-foreground">{tx.id}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Product</span><span className="font-semibold text-foreground">{tx.product}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Qty Returned</span><span className="font-semibold text-foreground">{tx.qty}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Refund Amount</span><span className="font-semibold text-foreground">{fmt(tx.amount)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-semibold text-foreground">{tx.date}</span></div>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Reason</p>
          <p className="text-sm text-foreground bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-xl px-4 py-3 leading-relaxed">
            {tx.note || "No reason provided."}
          </p>
        </div>
        <button onClick={onClose} className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity">Close</button>
      </div>
    </Modal>
  );
}

// ─── Notification Panel ───────────────────────────────────────────────────────
import { useRef, useEffect, useState, useMemo } from "react";
import { AlertTriangle as _AlertTriangle, FileText as _FileText, Check as _Check, CheckCheck, RefreshCw, X as _X } from "lucide-react";
import { sortBatchesFIFO, sortBatchesByExpiry, deductFIFO, getTotalStock, getEarliestExpiry, parseExpiry, formatExpiryString, ROLES, ROLE_LABELS, computeTax, VAT_RATE_LABEL, type Notification, type ProductBatch } from "./data";

export function NotificationPanel({
  notifs, onMarkAll, onMarkOne, onNotificationClick, onNotificationHover, productMap, onClose,
}: {
  notifs: Notification[];
  onMarkAll: () => void;
  onMarkOne: (id: number) => void;
  onNotificationClick: (notification: Notification) => void;
  onNotificationHover: (productId: string | null) => void;
  productMap: Record<string, string>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const iconMap = {
    alert: <_AlertTriangle size={13} className="text-amber-500" />,
    order: <_FileText size={13} className="text-primary" />,
    info: <_Check size={13} className="text-emerald-500" />,
  };

  return (
    <div ref={ref} className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden" style={{ zIndex: 200 }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <p className="text-sm font-bold text-foreground">Notifications</p>
          <p className="text-[10px] text-muted-foreground">{notifs.filter(n => !n.read).length} unread</p>
        </div>
        <button onClick={onMarkAll} className="flex items-center gap-1 text-[11px] text-primary hover:underline font-semibold">
          <CheckCheck size={12} />Mark all read
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto divide-y divide-border">
        {notifs.map(n => (
          <div
            key={n.id}
            onClick={() => onNotificationClick(n)}
            onMouseEnter={() => onNotificationHover(n.productId ?? null)}
            onMouseLeave={() => onNotificationHover(null)}
            className={`flex gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50 ${n.read ? "opacity-60" : ""}`}
          >
            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: n.type === "alert" ? "#fef3c7" : n.type === "order" ? "#ccfbf1" : "#f0fdf4" }}>
              {iconMap[n.type]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className={`text-xs font-semibold text-foreground leading-tight ${!n.read ? "" : "font-medium"}`}>{n.title}</p>
                {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1" />}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
              {productMap[n.productId ?? ""] && (
                <p className="text-[10px] text-primary mt-1">View product: {productMap[n.productId ?? ""]}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">{n.time}</p>
            </div>
          </div>
        ))}
        {notifs.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No notifications</p>}
      </div>
    </div>
  );
}

// ─── Product Form Modal ───────────────────────────────────────────────────────
export function ProductFormModal({
  initial, inventory, categories, onClose, onSave, onAddCategory,
}: {
  initial?: Product;
  inventory: Product[];
  categories: string[];
  onClose: () => void;
  onSave: (original: Product | null, updated: Product) => void;
  onAddCategory: (cat: string) => void;
}) {
  const isEdit = !!initial;
  const suggestedId = `P${String(inventory.length + 1).padStart(3, "0")}`;

  const [form, setForm] = useState({
    id: initial?.id ?? suggestedId,
    name: initial?.name ?? "",
    category: initial?.category ?? "",
    supplier: initial?.supplier ?? "",
    reorder: initial?.reorder != null ? String(initial.reorder) : "",
    price: initial?.price != null ? String(initial.price) : "",
    salePrice: initial?.salePrice != null ? String(initial.salePrice) : "",
  });
  const [isVatExempt, setIsVatExempt] = useState<boolean>(
    !!(initial?.isVatExempt ?? initial?.is_vat_exempt)
  );
  const [customCategory, setCustomCategory] = useState("");
  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const [batches, setBatches] = useState<ProductBatch[]>(initial?.batches ?? []);
  const [newBatchQty, setNewBatchQty] = useState("");
  const [newBatchExpiry, setNewBatchExpiry] = useState("");
  const [newBatchTotalCost, setNewBatchTotalCost] = useState("");

  const handleCategoryChange = (v: string) => {
    set("category")(v);
    if (v !== "__other__") setCustomCategory("");
  };

  const handleAddBatch = () => {
    const qty = parseInt(newBatchQty, 10);
    if (!qty || qty <= 0 || !newBatchExpiry.trim()) return;
    const batchNum = batches.length + 1;
    const batchId = `${form.id.trim() || suggestedId}-B${batchNum}`;
    const expiryDate = parseExpiry(newBatchExpiry.trim());
    if (Number.isNaN(expiryDate.getTime())) return;
    const totalCost = newBatchTotalCost.trim() !== "" ? parseFloat(newBatchTotalCost) : null;
    const unitCost  = totalCost != null && qty > 0 ? parseFloat((totalCost / qty).toFixed(4)) : null;
    const newBatch: ProductBatch = {
      batchId, qty,
      expiry: formatExpiryString(expiryDate),
      expiryDate: formatExpiryString(expiryDate),
      receivedDate: new Date().toLocaleDateString("en-PH"),
      batchTotalCost: totalCost,
      unitCost,
    };
    setBatches(prev => sortBatchesFIFO([...prev, newBatch]));
    setNewBatchQty("");
    setNewBatchExpiry("");
    setNewBatchTotalCost("");
  };

  function handleRemoveBatch(batchId: string) {
    setBatches(prev => prev.filter(b => b.batchId !== batchId));
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (batches.length === 0) return;
    const reorder = parseInt(form.reorder, 10) || 0;
    const price = parseFloat(form.price) || 0;
    const salePriceVal = form.salePrice.trim() !== "" ? parseFloat(form.salePrice) : undefined;
    let finalCategory = form.category;
    if (form.category === "__other__" && customCategory.trim()) {
      finalCategory = customCategory.trim();
      onAddCategory(finalCategory);
    } else if (form.category === "__other__") return;
    const sortedBatches = sortBatchesFIFO(batches);
    const totalStock = getTotalStock(sortedBatches);
    const updated: Product = {
      id: form.id.trim(), name: form.name, category: finalCategory, supplier: form.supplier.trim(),
      stock: totalStock, reorder, price, salePrice: salePriceVal,
      isVatExempt, is_vat_exempt: isVatExempt ? 1 : 0,
      expiry: getEarliestExpiry(sortedBatches), status: computeStatus(totalStock, reorder), batches: sortedBatches,
    };
    onSave(initial ?? null, updated);
    onClose();
  };

  return (
    <Modal title={isEdit ? "Edit Product" : "Add New Product"} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FieldInput label="Product ID / Barcode" value={form.id} onChange={set("id")} placeholder={suggestedId} required />
        <FieldInput label="Product Name" value={form.name} onChange={set("name")} placeholder="e.g. Amoxicillin 500mg" required />
        <FieldInput label="Supplier" value={form.supplier} onChange={set("supplier")} placeholder="e.g. Apex Pharma" required />
        <div className="space-y-2">
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Category</label>
          <select value={form.category} onChange={e => handleCategoryChange(e.target.value)} required
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all">
            <option value="">Select</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
            <option value="__other__">Other (custom)</option>
          </select>
          {form.category === "__other__" && (
            <input type="text" value={customCategory} onChange={e => setCustomCategory(e.target.value)}
              placeholder="Enter custom category name" required
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
          )}
        </div>
        <FieldInput label="Reorder Point" type="number" value={form.reorder} onChange={set("reorder")} placeholder="0" required min={0} />
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label={`Selling Price (${PESO}) — VAT-inclusive`} type="number" value={form.price} onChange={set("price")} placeholder="0.00" required min={0} step={0.01} />
          <FieldInput label={`Sale/Discounted Price (${PESO})`} type="number" value={form.salePrice} onChange={set("salePrice")} placeholder="Optional" min={0} step={0.01} helperText="Discounted price (optional)" />
        </div>

        {/* VAT-exempt toggle */}
        <div className="flex items-center justify-between bg-muted/30 border border-border rounded-xl px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-foreground">VAT-Exempt Product</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              e.g. essential medicines for Senior Citizens / PWD (BIR RA 10963)
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsVatExempt(v => !v)}
            className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 flex-shrink-0 ${isVatExempt ? "bg-emerald-500" : "bg-muted"}`}
            style={{ width: 40, height: 22 }}
          >
            <span className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-transform duration-200 ${isVatExempt ? "translate-x-[18px]" : "translate-x-0"}`} />
          </button>
        </div>

        {/* Live VAT breakdown */}
        {parseFloat(form.price) > 0 && (
          <div className="bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-[10px] font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wide">
              VAT Breakdown — {isVatExempt ? "VAT-Exempt" : `${VAT_RATE_LABEL} Standard VAT`}
            </p>
            {(() => {
              const activePrice = parseFloat(form.salePrice || form.price) || parseFloat(form.price) || 0;
              const breakdown = computeTax(activePrice, isVatExempt);
              return (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Selling Price (VAT-inclusive)</span>
                    <span className="font-semibold text-foreground tabular-nums">{PESO}{activePrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pre-tax Amount (Net)</span>
                    <span className="font-semibold text-foreground tabular-nums">{PESO}{breakdown.preTax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={`${isVatExempt ? "text-muted-foreground/60" : "text-muted-foreground"}`}>
                      VAT ({isVatExempt ? "Exempt" : VAT_RATE_LABEL})
                    </span>
                    <span className={`tabular-nums font-semibold ${isVatExempt ? "text-muted-foreground/60" : "text-sky-600 dark:text-sky-400"}`}>
                      {PESO}{breakdown.tax.toFixed(2)}
                    </span>
                  </div>
                  <div className="border-t border-sky-200 dark:border-sky-500/30 pt-1 flex justify-between font-bold">
                    <span className="text-foreground">Total</span>
                    <span className="tabular-nums text-sky-700 dark:text-sky-400">{PESO}{breakdown.total.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
        <div className="space-y-2">
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Stock Batches <span className="text-primary">(FIFO — first in first out)</span>
          </label>
          {batches.length > 0 && (
            <div className="bg-muted/30 border border-border rounded-xl overflow-hidden">
              <div className="grid grid-cols-5 px-3 py-1.5 bg-muted/50 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                <span>Batch ID</span><span>Qty</span><span>Expiry</span><span>Batch Cost</span><span>Unit Cost</span>
              </div>
              {sortBatchesFIFO(batches).map((b, i) => (
                <div key={b.batchId} className={`grid grid-cols-5 px-3 py-2 text-xs items-center border-t border-border/40 ${i === 0 ? "bg-amber-50/50 dark:bg-amber-500/5" : ""}`}>
                  <span className="text-muted-foreground font-mono text-[11px]">
                    {i === 0 && <span className="text-amber-600 dark:text-amber-400 mr-1">▶</span>}{b.batchId}
                  </span>
                  <span className="font-bold text-foreground">{b.qty}</span>
                  <span className={i === 0 ? "font-semibold text-amber-700 dark:text-amber-400" : "text-foreground"}>{b.expiry}</span>
                  <span className="text-foreground tabular-nums">
                    {b.batchTotalCost != null ? `${PESO}${b.batchTotalCost.toFixed(2)}` : <span className="text-muted-foreground/60 italic">—</span>}
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground tabular-nums">
                      {b.unitCost != null ? `${PESO}${b.unitCost.toFixed(4)}` : "—"}
                    </span>
                    <button type="button" onClick={() => handleRemoveBatch(b.batchId)} className="text-muted-foreground hover:text-red-500 transition-colors ml-2"><_X size={11} /></button>
                  </div>
                </div>
              ))}
              <div className="px-3 py-1.5 border-t border-border/40 bg-muted/20 flex justify-between text-xs">
                <span className="text-muted-foreground">Total Stock</span>
                <span className="font-bold text-foreground">{getTotalStock(batches)} units</span>
              </div>
            </div>
          )}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-[10px] text-muted-foreground mb-1">Qty</label>
              <input type="number" value={newBatchQty} onChange={e => setNewBatchQty(e.target.value)} placeholder="e.g. 100" min={1}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-muted-foreground mb-1">Expiry</label>
              <input type="date" value={newBatchExpiry} onChange={e => setNewBatchExpiry(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-muted-foreground mb-1">
                Batch Cost ({PESO}) <span className="text-muted-foreground/60 font-normal">optional</span>
              </label>
              <input type="number" value={newBatchTotalCost} onChange={e => setNewBatchTotalCost(e.target.value)}
                placeholder="e.g. 5000" min={0} step={0.01}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
              {newBatchTotalCost && newBatchQty && parseFloat(newBatchQty) > 0 && (
                <p className="text-[10px] text-primary mt-0.5 tabular-nums">
                  Unit cost: {PESO}{(parseFloat(newBatchTotalCost) / parseFloat(newBatchQty)).toFixed(4)}
                </p>
              )}
            </div>
            <button type="button" onClick={handleAddBatch}
              className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 transition-opacity whitespace-nowrap flex-shrink-0 self-end mb-0">
              + Add Batch
            </button>
          </div>
          {batches.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <_AlertTriangle size={11} /> Add at least one batch to set the stock quantity and expiry.
            </p>
          )}
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">Cancel</button>
          <button type="submit" disabled={batches.length === 0} className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50">
            {isEdit ? "Save Changes" : "Add Product"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── New Sale Modal ───────────────────────────────────────────────────────────
// Expiry helpers used in sale flow
const EXPIRY_BLOCK_DAYS = 60;

/** Returns days left until expiry — negative means already expired. */
function daysUntilExpiry(expiryStr: string): number {
  const [mm, dd, yyyy] = expiryStr.split("/");
  const expDate = new Date(`${yyyy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}T00:00:00`);
  return (expDate.getTime() - Date.now()) / 86400000;
}

/** Returns the earliest-expiring batch of a product that has qty > 0. */
function getFirstBatch(product: import("./data").Product) {
  return [...product.batches]
    .filter(b => b.qty > 0)
    .sort((a, b) => {
      const toMs = (s: string) => { const [mm,dd,yyyy] = s.split("/"); return new Date(`${yyyy}-${mm}-${dd}`).getTime(); };
      return toMs(a.expiry) - toMs(b.expiry);
    })[0] ?? null;
}

/** Returns "blocked" | "warning" | "ok" and days left for a product. */
export function getExpiryStatus(product: import("./data").Product): { status: "blocked" | "ok"; daysLeft: number; batchId: string } | null {
  const batch = getFirstBatch(product);
  if (!batch) return null;
  const days = daysUntilExpiry(batch.expiry);
  if (days <= EXPIRY_BLOCK_DAYS) return { status: "blocked", daysLeft: Math.ceil(days), batchId: batch.batchId };
  return null;
}

// ── Expiry block dialog (SweetAlert-style) ────────────────────────────────────
export function ExpiryBlockDialog({
  product, batchId, daysLeft, onClose, onGoToInventory, canManage,
}: {
  product: import("./data").Product;
  batchId: string;
  daysLeft: number;
  onClose: () => void;
  onGoToInventory: () => void;
  canManage: boolean;
}) {
  const expired    = daysLeft <= 0;
  const isOneBatch = product.batches.filter(b => b.qty > 0).length === 1;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
        {/* Icon */}
        <div className="flex flex-col items-center gap-3">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center ${expired ? "bg-red-100 dark:bg-red-500/20" : "bg-amber-100 dark:bg-amber-500/20"}`}>
            <ShieldAlert size={28} className={expired ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"} />
          </div>
          <h2 className={`text-base font-bold text-center ${expired ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
            {expired ? "Batch Expired" : "Near-Expiry — Sale Blocked"}
          </h2>
        </div>

        {/* Body */}
        <div className="bg-muted/40 border border-border rounded-xl p-3 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Product</span>
            <span className="font-semibold text-foreground">{product.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Batch</span>
            <span className="font-mono text-foreground">{batchId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className={`font-bold ${expired ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
              {expired ? `Expired ${Math.abs(daysLeft)}d ago` : `Expires in ${daysLeft}d`}
            </span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          {expired
            ? "This product cannot be sold — the first batch has already expired."
            : `Products expiring within ${EXPIRY_BLOCK_DAYS} days cannot be dispensed for patient safety.`}
          {canManage
            ? isOneBatch
              ? " This is the only batch — please remove the product from inventory."
              : " Please remove this batch from inventory. The next batch will then become available for sale."
            : " Please inform your Inventory Manager to remove this batch from the system."}
        </p>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
            {canManage ? "Cancel" : "Understood"}
          </button>
          {canManage && (
            <button onClick={onGoToInventory}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 ${expired ? "bg-red-500" : "bg-amber-500"}`}>
              {isOneBatch ? "Remove Product" : "Update Inventory"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const CUSTOMER_EXEMPTION_TYPES = ["Senior Citizen", "PWD", "Other Qualified ID"] as const;
type CustomerExemptionType = typeof CUSTOMER_EXEMPTION_TYPES[number];
const roundCurrency = (value: number) => Math.round(value * 100) / 100;

export function NewSaleModal({
  onClose, onAdd, inventory, currentUser, onGoToInventory,
}: {
  onClose: () => void;
  onAdd: (t: Transaction, productId: string, qty: number) => void;
  inventory: Product[];
  currentUser: import("./data").AuthUser;
  onGoToInventory: () => void;
}) {
  const canManage = currentUser.role === "inventory_manager";
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState("1");
  const [expiryBlock, setExpiryBlock] = useState<{ batchId: string; daysLeft: number } | null>(null);
  const [customerVatExempt, setCustomerVatExempt] = useState(false);
  const [customerExemptionType, setCustomerExemptionType] = useState<CustomerExemptionType>("Senior Citizen");
  const [customerIdNumber, setCustomerIdNumber] = useState("");

  const qtyNum = parseInt(qty) || 0;
  const unitPrice = selectedProduct ? (selectedProduct.salePrice ?? selectedProduct.price) : 0;
  const shelfTotal = roundCurrency(unitPrice * qtyNum);
  const productVatExempt = !!(selectedProduct?.isVatExempt ?? selectedProduct?.is_vat_exempt);
  const taxBreakdown = selectedProduct ? (() => {
    if (productVatExempt) return computeTax(shelfTotal, true);
    if (customerVatExempt) {
      const vatRemovedTotal = roundCurrency(shelfTotal / 1.12);
      return { preTax: vatRemovedTotal, tax: 0, total: vatRemovedTotal, rate: 0, isExempt: true };
    }
    return computeTax(shelfTotal, false);
  })() : null;
  const customerExemptionMissing = customerVatExempt && customerIdNumber.trim() === "";
  const exemptionNote = customerVatExempt
    ? `Customer VAT exemption: ${customerExemptionType} ID ${customerIdNumber.trim()}`
    : undefined;

  // Check expiry whenever a product is selected
  const handleSelect = (p: Product | null) => {
    setSelectedProduct(p);
    setExpiryBlock(null);
    if (p) {
      const exp = getExpiryStatus(p);
      if (exp) setExpiryBlock({ batchId: exp.batchId, daysLeft: exp.daysLeft });
    }
  };

  const fifoPreview = useMemo(() => {
    if (!selectedProduct || qtyNum <= 0 || qtyNum > selectedProduct.stock) return [];
    try { const { consumed } = deductFIFO(selectedProduct.batches, qtyNum); return consumed; } catch { return []; }
  }, [selectedProduct, qtyNum]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || qtyNum <= 0 || qtyNum > selectedProduct.stock) return;
    if (customerExemptionMissing) return;
    // Re-check expiry at submit time (guard against stale state)
    const exp = getExpiryStatus(selectedProduct);
    if (exp) { setExpiryBlock({ batchId: exp.batchId, daysLeft: exp.daysLeft }); return; }
    const tb = taxBreakdown;
    if (!tb) return;
    const { consumed } = deductFIFO(selectedProduct.batches, qtyNum);
    const tx: Transaction = {
      id: `TXN-${Date.now().toString().slice(-4)}`, type: "sale", product: selectedProduct.name,
      qty: qtyNum, amount: tb.total,
      preTaxAmount: tb.preTax, taxAmount: tb.tax, taxRate: tb.rate,
      customerVatExempt,
      customerExemptionType: customerVatExempt ? customerExemptionType : null,
      customerIdNumber: customerVatExempt ? customerIdNumber.trim() : null,
      staff: staffAbbrev(currentUser.name), date: nowDateStr(),
      status: "completed", productId: selectedProduct.id, batchesConsumed: consumed, note: exemptionNote,
    };
    onAdd(tx, selectedProduct.id, qtyNum);
    onClose();
  };

  const handleGoToInventory = () => {
    onClose();
    onGoToInventory();
  };

  return (
    <>
      {/* Expiry block dialog — shown on top of modal */}
      {expiryBlock && selectedProduct && (
        <ExpiryBlockDialog
          product={selectedProduct}
          batchId={expiryBlock.batchId}
          daysLeft={expiryBlock.daysLeft}
          onClose={() => setExpiryBlock(null)}
          onGoToInventory={handleGoToInventory}
          canManage={canManage}
        />
      )}
    <Modal title="New Sale" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <ProductSearchWidget inventory={inventory} onSelect={handleSelect} selectedProduct={selectedProduct} />
        <FieldInput label="Quantity" type="number" value={qty} onChange={setQty} placeholder="1" required min={1} />
        {selectedProduct && (
          <div className="border border-border rounded-xl px-4 py-3 space-y-3 bg-muted/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-foreground">Customer VAT-Exempt ID</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Senior Citizen, PWD, or other qualified ID</p>
              </div>
              <button
                type="button"
                onClick={() => setCustomerVatExempt(v => !v)}
                className={`relative flex-shrink-0 rounded-full transition-colors duration-200 ${customerVatExempt ? "bg-emerald-500" : "bg-muted"}`}
                style={{ width: 40, height: 22 }}
              >
                <span className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-transform duration-200 ${customerVatExempt ? "translate-x-[18px]" : "translate-x-0"}`} />
              </button>
            </div>
            {customerVatExempt && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">ID Type</label>
                  <select
                    value={customerExemptionType}
                    onChange={e => setCustomerExemptionType(e.target.value as CustomerExemptionType)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  >
                    {CUSTOMER_EXEMPTION_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">ID Number</label>
                  <input
                    type="text"
                    value={customerIdNumber}
                    onChange={e => setCustomerIdNumber(e.target.value)}
                    placeholder="Enter ID number"
                    required={customerVatExempt}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                </div>
              </div>
            )}
            {customerExemptionMissing && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <_AlertTriangle size={11} /> Customer ID number is required for VAT exemption.
              </p>
            )}
          </div>
        )}
        {fifoPreview.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1">
              <RefreshCw size={10} /> FIFO — Batches to be consumed
            </p>
            {fifoPreview.map(b => (
              <div key={b.batchId} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{b.batchId} · Expiry: <span className="font-semibold text-foreground">{b.expiry}</span></span>
                <span className="font-bold text-amber-700 dark:text-amber-400">{b.qty} units</span>
              </div>
            ))}
          </div>
        )}
        {selectedProduct && qtyNum > selectedProduct.stock && (
          <p className="text-xs text-red-500 flex items-center gap-1"><_AlertTriangle size={11} /> Quantity exceeds available stock ({selectedProduct.stock} units)</p>
        )}
        {shelfTotal > 0 && taxBreakdown && (
          <div className="bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-[10px] font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wide">
              Price Breakdown — {customerVatExempt && !productVatExempt ? "Customer VAT-Exempt" : taxBreakdown.isExempt ? "VAT-Exempt" : `${VAT_RATE_LABEL} VAT Inclusive`}
            </p>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unit Price × {qtyNum}</span>
                <span className="tabular-nums text-foreground">{fmt(unitPrice)} × {qtyNum}</span>
              </div>
              {customerVatExempt && !productVatExempt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT Removed</span>
                  <span className="tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">-{fmt(shelfTotal - taxBreakdown.total)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pre-tax Amount</span>
                <span className="tabular-nums text-foreground">{fmt(taxBreakdown.preTax)}</span>
              </div>
              <div className="flex justify-between">
                <span className={taxBreakdown.isExempt ? "text-muted-foreground/60" : "text-muted-foreground"}>
                  VAT ({taxBreakdown.isExempt ? "Exempt" : VAT_RATE_LABEL})
                </span>
                <span className={`tabular-nums font-semibold ${taxBreakdown.isExempt ? "text-muted-foreground/60" : "text-sky-600 dark:text-sky-400"}`}>
                  {fmt(taxBreakdown.tax)}
                </span>
              </div>
              <div className="border-t border-sky-200 dark:border-sky-500/30 pt-1.5 flex justify-between font-bold">
                <span className="text-foreground">Total</span>
                <span className="tabular-nums text-primary text-base">{fmt(taxBreakdown.total)}</span>
              </div>
            </div>
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">Cancel</button>
          <button type="submit"
            disabled={!selectedProduct || qtyNum <= 0 || qtyNum > (selectedProduct?.stock ?? 0) || !!expiryBlock || customerExemptionMissing}
            className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50">
            Confirm Sale
          </button>
        </div>
      </form>
    </Modal>
    </>
  );
}

// ─── Return Modal ─────────────────────────────────────────────────────────────
export function ReturnModal({
  saleTx, onClose, onAdd, inventory, currentUser,
}: {
  saleTx: Transaction;
  onClose: () => void;
  onAdd: (t: Transaction, productId: string, qty: number) => void;
  inventory: Product[];
  currentUser: import("./data").AuthUser;
}) {
  const product = inventory.find(p => p.id === saleTx.productId) ?? null;
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const qtyNum = parseInt(qty) || 0;
  const unitPrice = saleTx.qty > 0 ? saleTx.amount / saleTx.qty : product ? (product.salePrice ?? product.price) : 0;
  const refund = qtyNum * unitPrice;
  const maxQty = saleTx.qty;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || qtyNum <= 0 || qtyNum > maxQty || !reason.trim()) return;
    const tx: Transaction = {
      id: `RET-${Date.now().toString().slice(-4)}`, type: "return", product: saleTx.product,
      qty: qtyNum, amount: refund, staff: staffAbbrev(currentUser.name), date: nowDateStr(),
      status: "completed", productId: saleTx.productId, note: reason, returnedTxId: saleTx.id,
    };
    onAdd(tx, saleTx.productId!, qtyNum);
    onClose();
  };

  return (
    <Modal title="Process Return" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-muted/40 border border-border rounded-xl p-3 text-xs space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Returning from Sale</p>
          <div className="flex justify-between"><span className="text-muted-foreground">Transaction</span><span className="font-semibold text-foreground">{saleTx.id}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Product</span><span className="font-semibold text-foreground">{saleTx.product}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Max Returnable</span><span className="font-semibold text-foreground">{maxQty} units</span></div>
        </div>
        <FieldInput label="Quantity to Return" type="number" value={qty} onChange={setQty} placeholder="1" required min={1} />
        {qtyNum > maxQty && <p className="text-xs text-red-500 flex items-center gap-1"><_AlertTriangle size={11} /> Cannot exceed sold quantity ({maxQty} units)</p>}
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Reason for Return <span className="text-red-500">*</span></label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain reason for return..." required rows={3}
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none" />
        </div>
        {refund > 0 && (
          <div className="flex items-center justify-between bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-xl px-4 py-3">
            <span className="text-sm font-semibold text-foreground">Refund Amount</span>
            <span className="text-lg font-bold text-orange-600 dark:text-orange-400">{fmt(refund)}</span>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">Returned items will be restocked automatically.</p>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">Cancel</button>
          <button type="submit" disabled={!product || qtyNum <= 0 || qtyNum > maxQty || !reason.trim()}
            className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50">Process Return</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Inventory Adjustment Modal ───────────────────────────────────────────────
export function InventoryAdjustmentModal({
  onClose, onAdd, inventory, currentUser,
}: {
  onClose: () => void;
  onAdd: (tx: Transaction, productId: string, qty: number) => void;
  inventory: Product[];
  currentUser: import("./data").AuthUser;
}) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const [adjustType, setAdjustType] = useState<"damage" | "correction">("damage");
  const qtyNum = parseInt(qty) || 0;
  const maxQty = selectedProduct?.stock ?? 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || qtyNum <= 0 || qtyNum > maxQty || !reason.trim()) return;
    const tx: Transaction = {
      id: `ADJ-${Date.now().toString().slice(-4)}`, type: "adjustment", product: selectedProduct.name,
      qty: qtyNum, amount: 0, staff: staffAbbrev(currentUser.name), date: nowDateStr(), status: "completed",
      productId: selectedProduct.id, note: reason,
      adjustmentReason: adjustType === "damage" ? `Damaged — ${reason}` : `Stock Correction — ${reason}`,
      damagedQty: adjustType === "damage" ? qtyNum : 0,
    };
    onAdd(tx, selectedProduct.id, qtyNum);
    onClose();
  };

  return (
    <Modal title="Record Inventory Adjustment" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2">
          {(["damage", "correction"] as const).map(t => (
            <button key={t} type="button" onClick={() => setAdjustType(t)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${adjustType === t ? t === "damage" ? "bg-red-500 text-white border-red-500" : "bg-amber-500 text-white border-amber-500" : "bg-background border-border text-muted-foreground"}`}>
              {t === "damage" ? "🗑 Damaged Stock" : "✏ Stock Correction"}
            </button>
          ))}
        </div>
        <ProductSearchWidget inventory={inventory} onSelect={setSelectedProduct} selectedProduct={selectedProduct} />
        <FieldInput label="Quantity to Deduct" type="number" value={qty} onChange={setQty} placeholder="1" required min={1} />
        {selectedProduct && qtyNum > maxQty && (
          <p className="text-xs text-red-500 flex items-center gap-1"><_AlertTriangle size={11} /> Cannot exceed available stock ({maxQty} units)</p>
        )}
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            {adjustType === "damage" ? "Damage Reason" : "Correction Reason"} <span className="text-red-500">*</span>
          </label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} required rows={3}
            placeholder={adjustType === "damage" ? "e.g. Water damage, broken packaging..." : "e.g. Physical count discrepancy found..."}
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">Cancel</button>
          <button type="submit" disabled={!selectedProduct || qtyNum <= 0 || qtyNum > maxQty || !reason.trim()}
            className={`flex-1 py-2.5 text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 ${adjustType === "damage" ? "bg-red-500" : "bg-amber-500"}`}>
            Record Adjustment
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── User Form Modal ──────────────────────────────────────────────────────────
export function UserFormModal({
  initial, onClose, onSave, currentUserRole,
}: {
  initial?: import("./data").StaffMember;
  onClose: () => void;
  onSave: (original: import("./data").StaffMember | null, updated: import("./data").StaffMember, password?: string) => void;
  currentUserRole?: string;
}) {
  const isEdit = !!initial;
  const [form, setForm] = React.useState({
    name:     initial?.name     ?? "",
    role:     initial?.role     ?? "",
    email:    initial?.email    ?? "",
    status:   initial?.status   ?? "" as string,
    password: "",
  });
  const [showPassword, setShowPassword] = React.useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  // Filter available roles based on current user's role
  const availableRoles = React.useMemo(() => {
    const allRoles = [...ROLES].filter(r => r !== "admin/owner"); // Never allow creating admin/owner
    
    // Admin can only create cashier and inventory_manager
    if (currentUserRole === "admin") {
      return allRoles.filter(r => r === "cashier" || r === "inventory_manager");
    }
    
    // Admin/Owner can create any role except admin/owner
    return allRoles;
  }, [currentUserRole]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEdit && form.password.trim().length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }
    const updated: import("./data").StaffMember = {
      id:        initial?.id ?? `U${String(Date.now()).slice(-3)}`,
      name:      form.name.trim(),
      role:      form.role,
      email:     form.email.trim(),
      status:    form.status as import("./data").StaffMember["status"],
      lastLogin: initial?.lastLogin ?? "Never",
      initials:  initials(form.name),
    };
    onSave(initial ?? null, updated, isEdit ? undefined : form.password);
    onClose();
  };

  // ── Edit mode: only status is editable ──
  if (isEdit && initial) {
    return (
      <Modal title="Edit User" onClose={onClose}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Read-only info */}
          {[
            { label: "Full Name",     value: initial.name },
            { label: "Role",          value: ROLE_LABELS[initial.role] ?? initial.role },
            { label: "Email Address", value: initial.email },
          ].map(({ label, value }) => (
            <div key={label}>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{label}</label>
              <div className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground/60 select-text">
                {value}
              </div>
            </div>
          ))}

          {/* Only editable field */}
          <FieldSelect
            label="Status"
            value={form.status}
            onChange={set("status")}
            options={["active", "inactive"]}
            required
            placeholder="Select status"
          />

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity">
              Save Changes
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  // ── Add mode: full form ──
  return (
    <Modal title="Add New User" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FieldInput label="Full Name" value={form.name} onChange={set("name")} placeholder="e.g. Juan Dela Cruz" required />
        <FieldSelect label="Role" value={form.role} onChange={set("role")} options={availableRoles} required roleLabels={ROLE_LABELS} placeholder="Select role" />
        <FieldInput label="Email Address" type="email" value={form.email} onChange={set("email")} placeholder="user@tangub.ph" required />
        <FieldSelect label="Status" value={form.status} onChange={set("status")} options={["active", "inactive"]} required placeholder="Select status" />

        {/* Password */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-foreground">
            Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={e => set("password")(e.target.value)}
              placeholder="Min. 6 characters"
              required
              minLength={6}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">The user will log in with this password.</p>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
            Cancel
          </button>
          <button type="submit"
            className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity">
            Add User
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Password Field Component ─────────────────────────────────────────────────
const PwdField = ({ label, value, onChange, show, onToggle }: {
  label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void;
}) => (
  <div className="space-y-1.5">
    <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Min. 6 characters"
        required
        minLength={6}
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
      />
      <button type="button" tabIndex={-1} onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  </div>
);

// ─── User Info Modal (with inline password reset) ─────────────────────────────
export function UserInfoModal({
  user, onClose, onResetPassword, onUpdateProfile,
}: {
  user: import("./data").StaffMember;
  onClose: () => void;
  onResetPassword?: (newPassword: string) => Promise<void>;
  onUpdateProfile?: (name: string, email: string) => Promise<void>;
}) {
  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = React.useState(false);
  const [editName, setEditName] = React.useState(user.name);
  const [editEmail, setEditEmail] = React.useState(user.email);
  const [profileLoading, setProfileLoading] = React.useState(false);
  const [profileError, setProfileError] = React.useState("");
  const [profileSuccess, setProfileSuccess] = React.useState(false);

  // Password reset state
  const [showPwdForm, setShowPwdForm] = React.useState(false);
  const [newPwd,      setNewPwd]      = React.useState("");
  const [confirmPwd,  setConfirmPwd]  = React.useState("");
  const [showNew,     setShowNew]     = React.useState(false);
  const [showConf,    setShowConf]    = React.useState(false);
  const [pwdLoading,  setPwdLoading]  = React.useState(false);
  const [pwdError,    setPwdError]    = React.useState("");
  const [pwdSuccess,  setPwdSuccess]  = React.useState(false);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError("");
    if (!editName.trim()) { setProfileError("Name cannot be empty."); return; }
    if (editName.length > 120) { setProfileError("Name must be 120 characters or less."); return; }
    if (!editEmail.trim()) { setProfileError("Email cannot be empty."); return; }
    
    setProfileLoading(true);
    try {
      await onUpdateProfile?.(editName.trim(), editEmail.trim());
      setProfileSuccess(true);
      setTimeout(() => { 
        setProfileSuccess(false); 
        setIsEditingProfile(false);
      }, 1500);
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError("");
    if (newPwd.trim().length < 6) { setPwdError("Password must be at least 6 characters."); return; }
    if (newPwd !== confirmPwd)    { setPwdError("Passwords do not match."); return; }
    setPwdLoading(true);
    try {
      await onResetPassword?.(newPwd);
      setPwdSuccess(true);
      setNewPwd(""); setConfirmPwd("");
      setTimeout(() => { setPwdSuccess(false); setShowPwdForm(false); }, 1500);
    } catch (err: unknown) {
      setPwdError(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <Modal title="My Profile" onClose={onClose}>
      <div className="space-y-4">
        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-2 pb-3 border-b border-border">
          <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center text-xl font-bold text-primary">
            {user.initials}
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-foreground">{user.name}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{user.id}</p>
          </div>
        </div>

        {/* Profile info - editable */}
        {!isEditingProfile ? (
          <div className="space-y-0.5">
            {[
              { label: "Role",  value: ROLE_LABELS[user.role] ?? user.role },
              { label: "Name",  value: user.name },
              { label: "Email", value: user.email },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
                <span className="text-xs font-semibold text-foreground text-right max-w-[60%] truncate">{value}</span>
              </div>
            ))}
            {onUpdateProfile && (
              <button
                type="button"
                onClick={() => { setIsEditingProfile(true); setProfileError(""); setProfileSuccess(false); }}
                className="w-full mt-2 py-2 text-xs font-semibold text-primary hover:bg-primary/5 rounded-lg transition-colors"
              >
                Edit Profile
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleProfileSubmit} className="space-y-3">
            {profileSuccess && (
              <div className="text-emerald-600 dark:text-emerald-400 text-xs bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg px-3 py-2">
                ✓ Profile updated successfully.
              </div>
            )}
            
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Name</label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Your name"
                required
                maxLength={120}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
              <p className="text-[10px] text-muted-foreground">{editName.length}/120 characters</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Email</label>
              <input
                type="email"
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
                placeholder="your.email@example.com"
                required
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>

            {profileError && (
              <p className="text-xs text-red-500">{profileError}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => { setIsEditingProfile(false); setEditName(user.name); setEditEmail(user.email); setProfileError(""); }}
                className="flex-1 py-2 border border-border rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted/50 transition-all">
                Cancel
              </button>
              <button type="submit" disabled={profileLoading}
                className="flex-1 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
                {profileLoading ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}

        {/* Change Password section */}
        {onResetPassword && (
          <div className="border border-border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => { setShowPwdForm(v => !v); setPwdError(""); setPwdSuccess(false); }}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-muted/40 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Eye size={13} className="text-muted-foreground" />
                Change Password
              </span>
              <span className="text-muted-foreground text-[10px]">{showPwdForm ? "▲" : "▼"}</span>
            </button>

            {showPwdForm && (
              <form onSubmit={handlePasswordSubmit} className="px-4 pb-4 pt-1 space-y-3 border-t border-border/50 bg-muted/20">
                {pwdSuccess && (
                  <div className="text-emerald-600 dark:text-emerald-400 text-xs bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg px-3 py-2">
                    ✓ Password updated successfully.
                  </div>
                )}
                <PwdField label="New Password"     value={newPwd}     onChange={setNewPwd}     show={showNew}  onToggle={() => setShowNew(v => !v)} />
                <PwdField label="Confirm Password" value={confirmPwd} onChange={setConfirmPwd} show={showConf} onToggle={() => setShowConf(v => !v)} />
                
                {/* Real-time password mismatch warning */}
                {confirmPwd && newPwd && newPwd !== confirmPwd && (
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle size={12} />
                    Passwords do not match
                  </div>
                )}
                
                {pwdError && (
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle size={12} />
                    {pwdError}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => { setShowPwdForm(false); setPwdError(""); }}
                    className="flex-1 py-2 border border-border rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted/50 transition-all">
                    Cancel
                  </button>
                  <button type="submit" disabled={pwdLoading}
                    className="flex-1 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
                    {pwdLoading ? "Saving…" : "OK"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        <button onClick={onClose}
          className="w-full py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
          Close
        </button>
      </div>
    </Modal>
  );
}

// ─── Reset Password Modal ─────────────────────────────────────────────────────
export function ResetPasswordModal({
  onClose, onSave,
}: {
  onClose: () => void;
  onSave: (newPassword: string) => Promise<void>;
}) {
  const [newPwd,     setNewPwd]     = React.useState("");
  const [confirmPwd, setConfirmPwd] = React.useState("");
  const [showNew,    setShowNew]    = React.useState(false);
  const [showConf,   setShowConf]   = React.useState(false);
  const [loading,    setLoading]    = React.useState(false);
  const [error,      setError]      = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPwd.trim().length < 6) { setError("Password must be at least 6 characters."); return; }
    if (newPwd !== confirmPwd)    { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      await onSave(newPwd);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setLoading(false);
    }
  };

  const PwdField = ({ label, value, onChange, show, onToggle }: {
    label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void;
  }) => (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Min. 6 characters"
          required
          minLength={6}
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        />
        <button type="button" tabIndex={-1} onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );

  return (
    <Modal title="Reset Password" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <PwdField label="New Password"     value={newPwd}     onChange={setNewPwd}     show={showNew}  onToggle={() => setShowNew(v => !v)} />
        <PwdField label="Confirm Password" value={confirmPwd} onChange={setConfirmPwd} show={showConf} onToggle={() => setShowConf(v => !v)} />

        {error && (
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
            {loading ? "Saving…" : "OK"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Invoice Modal ────────────────────────────────────────────────────────────
export function InvoiceModal({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const typeHeader: Record<import("./data").TxType, string> = {
    sale: "OFFICIAL RECEIPT", return: "RETURN RECEIPT", adjustment: "INVENTORY ADJUSTMENT",
  };
  const header = typeHeader[tx.type];
  const P = "\u20b1";

  // Tax figures — use stored values if present, otherwise derive from amount
  const isExempt   = (tx.taxRate ?? 0) === 0;
  const preTax     = tx.preTaxAmount ?? (isExempt ? tx.amount : Math.round(tx.amount / 1.12 * 100) / 100);
  const taxAmt     = tx.taxAmount    ?? (isExempt ? 0 : Math.round((tx.amount - preTax) * 100) / 100);
  const unitNet    = tx.qty > 0 ? preTax / tx.qty : 0;
  const vatLabel   = isExempt ? "VAT-Exempt" : "VAT (12%)";
  const customerExemptionText =
    tx.type === "sale" && tx.customerVatExempt
      ? `${tx.customerExemptionType ?? "Qualified ID"} ID ${tx.customerIdNumber ?? ""}`.trim()
      : tx.type === "sale" && tx.note?.startsWith("Customer VAT exemption: ")
        ? tx.note.replace("Customer VAT exemption: ", "")
        : "";
  const escapeReceiptHtml = (value: string) =>
    value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] ?? ch));
  const customerExemptionHtml = customerExemptionText
    ? `<div class="bold">VAT Exemption:</div><div style="word-break:break-word">${escapeReceiptHtml(customerExemptionText)}</div><div class="dashes"></div>`
    : "";

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=420,height=680");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Receipt ${tx.id}</title>
    <style>
      body{margin:0;padding:16px;background:#fff;font-family:'Courier New',monospace;font-size:12px;color:#000;}
      .receipt{width:302px;margin:0 auto;}
      .center{text-align:center;} .bold{font-weight:bold;} .right{text-align:right;}
      .dashes{border-top:1px dashed #000;margin:6px 0;}
      .row{display:flex;justify-content:space-between;margin:2px 0;}
      .small{font-size:10px;}
      @media print{body{margin:0;padding:0;}}
    </style></head><body>
    <div class="receipt">
      <div class="center bold" style="font-size:14px;">TANGUB PHARMACY</div>
      <div class="center small">Tangub City, Misamis Occidental</div>
      <div class="center small">Tel: (088) 545-0001</div>
      <div class="center small">TIN: 123-456-789-000</div>
      <div class="dashes"></div>
      <div class="center bold">${header}</div>
      <div class="dashes"></div>
      <div class="row"><span>OR No.:</span><span>${tx.id}</span></div>
      <div class="row"><span>Date:</span><span>${tx.date}</span></div>
      <div class="row"><span>Cashier:</span><span>${tx.staff}</span></div>
      <div class="dashes"></div>
      <div class="row bold"><span>ITEM</span><span>AMT</span></div>
      <div class="dashes"></div>
      <div style="margin-bottom:2px">${tx.product}</div>
      <div class="row">
        <span>${tx.qty} × ${P}${unitNet.toFixed(2)} (net)</span>
        <span>${P}${preTax.toFixed(2)}</span>
      </div>
      <div class="dashes"></div>
      <div class="row"><span>Vatable Sales</span><span>${P}${isExempt ? "0.00" : preTax.toFixed(2)}</span></div>
      <div class="row"><span>VAT-Exempt Sales</span><span>${P}${isExempt ? preTax.toFixed(2) : "0.00"}</span></div>
      <div class="row"><span>Zero-Rated Sales</span><span>${P}0.00</span></div>
      <div class="row"><span>${vatLabel}</span><span>${P}${taxAmt.toFixed(2)}</span></div>
      <div class="dashes"></div>
      <div class="row bold"><span>${tx.type === "return" ? "TOTAL REFUND" : "TOTAL AMOUNT DUE"}</span><span>${P}${tx.amount.toFixed(2)}</span></div>
      <div class="dashes"></div>
      ${customerExemptionHtml}
      ${tx.type === "return" && tx.note ? `<div class="bold">Return Reason:</div><div style="word-break:break-word">${tx.note}</div><div class="dashes"></div>` : ""}
      <div class="center small" style="margin-top:4px">This serves as your Official Receipt</div>
      <div class="center small">Thank you for your patronage!</div>
    </div></body></html>`);
    win.document.close(); win.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 sm:items-center sm:pt-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-sm font-bold text-foreground">Official Receipt</h2>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 transition-opacity">
              Print
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><_X size={16} /></button>
          </div>
        </div>
        <div className="p-4 overflow-y-auto flex justify-center">
          {/* On-screen receipt preview */}
          <div style={{ width: 302, fontFamily: "'Courier New', monospace", fontSize: 12, background: "#fff", color: "#000", padding: "12px 8px", border: "1px solid #e5e7eb", borderRadius: 8 }}>
            <div style={{ textAlign: "center", fontWeight: "bold", fontSize: 14 }}>TANGUB PHARMACY</div>
            <div style={{ textAlign: "center", fontSize: 10 }}>Tangub City, Misamis Occidental</div>
            <div style={{ textAlign: "center", fontSize: 10 }}>Tel: (088) 545-0001  ·  TIN: 123-456-789-000</div>
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            <div style={{ textAlign: "center", fontWeight: "bold" }}>{header}</div>
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            {[
              ["OR No.:", tx.id],
              ["Date:", tx.date],
              ["Cashier:", tx.staff],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span>{k}</span><span>{v}</span>
              </div>
            ))}
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", marginBottom: 4 }}>
              <span>ITEM</span><span>AMT</span>
            </div>
            <div style={{ marginBottom: 2 }}>{tx.product}</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{tx.qty} × {P}{unitNet.toFixed(2)} (net)</span>
              <span>{P}{preTax.toFixed(2)}</span>
            </div>
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            {/* BIR-required VAT breakdown lines */}
            {[
              ["Vatable Sales",    isExempt ? "0.00" : preTax.toFixed(2)],
              ["VAT-Exempt Sales", isExempt ? preTax.toFixed(2) : "0.00"],
              ["Zero-Rated Sales", "0.00"],
              [vatLabel,           taxAmt.toFixed(2)],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 2, fontSize: 11 }}>
                <span>{k}</span><span>{P}{v}</span>
              </div>
            ))}
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
              <span>{tx.type === "return" ? "TOTAL REFUND" : "TOTAL AMOUNT DUE"}</span>
              <span>{P}{tx.amount.toFixed(2)}</span>
            </div>
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            {customerExemptionText && (
              <>
                <div style={{ fontWeight: "bold" }}>VAT Exemption:</div>
                <div style={{ wordBreak: "break-word", marginBottom: 4 }}>{customerExemptionText}</div>
                <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
              </>
            )}
            {tx.type === "return" && tx.note && (
              <><div style={{ fontWeight: "bold" }}>Return Reason:</div><div style={{ wordBreak: "break-word", marginBottom: 4 }}>{tx.note}</div></>
            )}
            <div style={{ textAlign: "center", fontSize: 10, marginTop: 4 }}>This serves as your Official Receipt</div>
            <div style={{ textAlign: "center", fontSize: 10 }}>Thank you for your patronage!</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Product Search Widget ────────────────────────────────────────────────────
export function ProductSearchWidget({
  inventory, onSelect, selectedProduct,
}: {
  inventory: Product[];
  onSelect: (p: Product | null) => void;
  selectedProduct: Product | null;
}) {
  const [mode, setMode] = useState<"name" | "id">("name");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return inventory.filter(p =>
      mode === "name" ? p.name.toLowerCase().includes(q) : p.id.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query, mode, inventory]);

  const selectProduct = (p: Product) => {
    onSelect(p);
    setQuery(mode === "name" ? p.name : p.id);
    setOpen(false);
  };

  const clear = () => { onSelect(null); setQuery(""); setOpen(false); };

  return (
    <div>
      <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Product</label>
      <div className="flex gap-1 mb-2">
        {(["name", "id"] as const).map(m => (
          <button key={m} type="button" onClick={() => { setMode(m); setQuery(""); onSelect(null); }}
            className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all border ${mode === m ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}>
            {m === "name" ? "By Name" : "By ID / Barcode"}
          </button>
        ))}
      </div>
      <div className="relative">
        <input type="text" value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onSelect(null); }}
          onFocus={() => setOpen(true)}
          placeholder={mode === "name" ? "Search by product name" : "Enter product ID or barcode"}
          className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all pr-8"
        />
        {query && <button type="button" onClick={clear} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><_X size={13} /></button>}
        {open && filtered.length > 0 && (
          <div className="absolute z-20 top-full mt-1 w-full bg-card border border-border rounded-xl shadow-xl overflow-hidden">
          {filtered.map(p => {
              const expBlock = getExpiryStatus(p);
              return (
              <button key={p.id} type="button" onClick={() => selectProduct(p)}
                className={`w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/50 transition-colors text-left border-b border-border/40 last:border-b-0 ${expBlock ? "opacity-70" : ""}`}>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-foreground">{p.name}</p>
                    {expBlock && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${expBlock.daysLeft <= 0 ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"}`}>
                        {expBlock.daysLeft <= 0 ? "EXPIRED" : `${expBlock.daysLeft}d left`}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{p.id} &middot; {p.stock} in stock</p>
                </div>
                <div className="flex-shrink-0 ml-2">
                  {expBlock ? (
                    <span className="text-[10px] font-bold text-red-600 dark:text-red-400">Cannot sell</span>
                  ) : p.salePrice != null ? (
                    <div><span className="text-[10px] text-muted-foreground line-through">{fmt(p.price)}</span><span className="text-xs font-bold text-primary ml-1">{fmt(p.salePrice)}</span></div>
                  ) : <span className="text-xs font-bold text-foreground">{fmt(p.price)}</span>}
                </div>
              </button>
              );
            })}
          </div>
        )}
      </div>
      {selectedProduct && (
        <div className="mt-2 bg-muted/40 border border-border rounded-xl p-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Product</span><span className="font-semibold text-foreground">{selectedProduct.name}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">ID</span><span className="font-semibold text-foreground">{selectedProduct.id}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Unit Price</span>
            <span className="font-semibold">
              {selectedProduct.salePrice != null ? (
                <><span className="line-through text-muted-foreground mr-1">{fmt(selectedProduct.price)}</span><span className="text-primary">{fmt(selectedProduct.salePrice)}</span></>
              ) : <span className="text-foreground">{fmt(selectedProduct.price)}</span>}
            </span>
          </div>
          <div className="flex justify-between"><span className="text-muted-foreground">Available</span><span className="font-semibold text-foreground">{selectedProduct.stock} units</span></div>
        </div>
      )}
    </div>
  );
}
