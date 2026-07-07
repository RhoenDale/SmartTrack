﻿﻿import { useState, useEffect, useRef, useMemo } from "react";
import {
  LayoutDashboard, Package, ShoppingCart, BarChart2, Users,
  LogOut, Bell, Search, TrendingUp, AlertTriangle, Plus,
  DollarSign, ArrowUpRight, ArrowDownRight, Shield, Pill,
  FileText, X, Moon, Sun, Check, CheckCheck,
  Settings, Pencil, RotateCcw, Printer, Tag,
  BellRing, ClipboardList, Download, ChevronRight, RefreshCw,
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import {
  INIT_CATEGORIES,
  INIT_INVENTORY,
  INIT_NOTIFS,
  INIT_STAFF,
  INIT_TRANSACTIONS,
  PIE_COLORS,
  ROLES,
  categoryData,
  demandSupply,
  revenueData,
  type AuthUser,
  type Notification,
  type Page,
  type Product,
  type StaffMember,
  type StockStatus,
  type Transaction,
  type TxStatus,
  type TxType,
} from "./data";

const PESO = "\u20b1";
const fmt = (n: number) => `${PESO}${n.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

function computeStatus(stock: number, reorder: number): StockStatus {
  if (stock < reorder * 0.4) return "critical";
  if (stock < reorder) return "low";
  if (stock < reorder * 1.5) return "moderate";
  return "good";
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

function nowDateStr() {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function staffAbbrev(name: string) {
  return name.split(" ").map((w, i) => i === 0 ? w[0] + "." : w).join(" ");
}

// â”€â”€â”€ SVG Charts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SvgAreaChart({ data, lines, yFormatter = (v: number) => String(v) }: {
  data: Record<string, any>[];
  lines: { key: string; color: string; name: string }[];
  yFormatter?: (v: number) => string;
}) {
  const W = 500; const H = 200;
  const pad = { t: 8, r: 8, b: 24, l: 46 };
  const cw = W - pad.l - pad.r; const ch = H - pad.t - pad.b;
  const allVals = data.flatMap(d => lines.map(l => Number(d[l.key])));
  const maxV = Math.max(...allVals) * 1.08;
  const xs = (i: number) => pad.l + (i / (data.length - 1)) * cw;
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
        const pts = data.map((d, i) => [xs(i), ys(Number(d[line.key]))] as [number, number]);
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

function SvgBarChart({ data }: { data: { name: string; sold: number }[] }) {
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

// â”€â”€â”€ Shared UI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function FieldInput({ label, type = "text", value, onChange, placeholder, required, min, step, helperText }: {
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

function FieldSelect({ label, value, onChange, options, required }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{label}</label>
      <select
        value={value} onChange={e => onChange(e.target.value)} required={required}
        className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
      >
        <option value="">Select…</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 sm:items-center sm:pt-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
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

function StockBadge({ status }: { status: StockStatus }) {
  const cls: Record<StockStatus, string> = {
    good: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    moderate: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    low: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20",
    critical: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
  };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${cls[status]}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

function TxBadge({ status }: { status: TxStatus }) {
  const cls: Record<TxStatus, string> = {
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    pending: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    approved: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20",
    cancelled: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
  };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${cls[status]}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

function TxTypeBadge({ type }: { type: TxType }) {
  const cfg: Record<TxType, { label: string; cls: string }> = {
    sale: { label: "Sale", cls: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20" },
    purchase: { label: "PO", cls: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20" },
    return: { label: "Return", cls: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20" },
  };
  const { label, cls } = cfg[type];
  return <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${cls}`}>{label}</span>;
}

function StatCard({ label, value, sub, icon: Icon, trend, trendUp, color }: {
  label: string; value: string; sub: string; icon: any; trend?: string; trendUp?: boolean; color: string;
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
        <p className="text-2xl font-semibold text-foreground tracking-tight" style={{ fontFamily: "'DM Mono', monospace" }}>{value}</p>
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

// â”€â”€â”€ Product Search Widget â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ProductSearchWidget({ inventory, onSelect, selectedProduct }: {
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
      mode === "name"
        ? p.name.toLowerCase().includes(q)
        : p.id.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query, mode, inventory]);

  const selectProduct = (p: Product) => {
    onSelect(p);
    setQuery(mode === "name" ? p.name : p.id);
    setOpen(false);
  };

  const clear = () => {
    onSelect(null);
    setQuery("");
    setOpen(false);
  };

  return (
    <div>
      <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Product</label>
      <div className="flex gap-1 mb-2">
        {(["name", "id"] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setQuery(""); onSelect(null); }}
            className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all border ${mode === m ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}
          >
            {m === "name" ? "By Name" : "By ID / Barcode"}
          </button>
        ))}
      </div>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onSelect(null); }}
          onFocus={() => setOpen(true)}
          placeholder={mode === "name" ? "Search by product name…" : "Enter product ID or barcode…"}
          className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all pr-8"
        />
        {query && (
          <button type="button" onClick={clear} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={13} /></button>
        )}
        {open && filtered.length > 0 && (
          <div className="absolute z-20 top-full mt-1 w-full bg-card border border-border rounded-xl shadow-xl overflow-hidden">
            {filtered.map(p => {
              const displayPrice = p.salePrice ?? p.price;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectProduct(p)}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/50 transition-colors text-left border-b border-border/40 last:border-b-0"
                >
                  <div>
                    <p className="text-xs font-bold text-foreground">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">{p.id} &middot; {p.stock} in stock</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    {p.salePrice != null ? (
                      <div>
                        <span className="text-[10px] text-muted-foreground line-through">{fmt(p.price)}</span>
                        <span className="text-xs font-bold text-primary ml-1">{fmt(p.salePrice)}</span>
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-foreground">{fmt(p.price)}</span>
                    )}
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
          <div className="flex justify-between"><span className="text-muted-foreground">ID</span><span className="font-semibold text-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{selectedProduct.id}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Unit Price</span>
            <span className="font-semibold" style={{ fontFamily: "'DM Mono', monospace" }}>
              {selectedProduct.salePrice != null ? (
                <>
                  <span className="line-through text-muted-foreground mr-1">{fmt(selectedProduct.price)}</span>
                  <span className="text-primary">{fmt(selectedProduct.salePrice)}</span>
                </>
              ) : (
                <span className="text-foreground">{fmt(selectedProduct.price)}</span>
              )}
            </span>
          </div>
          <div className="flex justify-between"><span className="text-muted-foreground">Available</span><span className="font-semibold text-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{selectedProduct.stock} units</span></div>
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Category Select with Custom â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CategorySelect({ categories, value, onChange, onAddCategory }: {
  categories: string[];
  value: string;
  onChange: (v: string) => void;
  onAddCategory: (cat: string) => void;
}) {
  const [custom, setCustom] = useState("");
  const showCustom = value === "__other__";

  const handleChange = (v: string) => {
    onChange(v);
    if (v !== "__other__") setCustom("");
  };

  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Category</label>
      <select
        value={value}
        onChange={e => handleChange(e.target.value)}
        required
        className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
      >
        <option value="">Select…</option>
        {categories.map(c => <option key={c} value={c}>{c}</option>)}
        <option value="__other__">Other (custom)…</option>
      </select>
      {showCustom && (
        <input
          type="text"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          placeholder="Enter custom category name"
          className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        />
      )}
    </div>
  );
}

// â”€â”€â”€ Notification Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function NotificationPanel({ notifs, onMarkAll, onMarkOne, onClose }: {
  notifs: Notification[]; onMarkAll: () => void; onMarkOne: (id: number) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const iconMap = { alert: <AlertTriangle size={13} className="text-amber-500" />, order: <FileText size={13} className="text-primary" />, info: <Check size={13} className="text-emerald-500" /> };

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
            onClick={() => onMarkOne(n.id)}
            className={`flex gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50 ${n.read ? "opacity-60" : ""}`}
          >
            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: n.type === "alert" ? "#fef3c7" : n.type === "order" ? "#ccfbf1" : "#f0fdf4" }}>
              {iconMap[n.type]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className={`text-xs font-semibold text-foreground leading-tight ${!n.read ? "" : "font-medium"}`}>{n.title}</p>
                {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1" />}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{n.time}</p>
            </div>
          </div>
        ))}
        {notifs.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No notifications</p>}
      </div>
    </div>
  );
}

// â”€â”€â”€ Login â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function Dashboard({ user, inventory, transactions }: { user: AuthUser; inventory: Product[]; transactions: Transaction[] }) {
  const lowStock = inventory.filter(i => i.status === "low" || i.status === "critical");
  const weekRevenue = revenueData.reduce((s, d) => s + d.revenue, 0);
  const weekProfit = revenueData.reduce((s, d) => s + d.profit, 0);
  const topProducts = [
    { name: "Paracetamol", sold: 412 }, { name: "Amoxicillin", sold: 284 },
    { name: "Omeprazole", sold: 203 }, { name: "Metformin", sold: 198 }, { name: "Amlodipine", sold: 156 },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px]">
      <div>
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Good morning, {user.name.split(" ")[user.role === "admin" ? 1 : 0]}. Here&apos;s what&apos;s happening today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Weekly Revenue" value={fmt(weekRevenue)} sub="Jun 19–25, 2025" icon={DollarSign} trend="+12.4% vs last week" trendUp color="#0d9488" />
        <StatCard label="Weekly Profit" value={fmt(weekProfit)} sub="Net after cost of goods" icon={TrendingUp} trend="+8.1% vs last week" trendUp color="#06b6d4" />
        <StatCard label="Total Stock Units" value={inventory.reduce((s, p) => s + p.stock, 0).toLocaleString()} sub={`${inventory.length} product lines`} icon={Package} color="#8b5cf6" />
        <StatCard label="Stock Alerts" value={String(lowStock.length)} sub={`${lowStock.filter(i => i.status === "critical").length} critical · ${lowStock.filter(i => i.status === "low").length} low`} icon={AlertTriangle} trend="Needs attention" trendUp={false} color="#f59e0b" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div><h3 className="text-sm font-bold text-foreground">Revenue &amp; Profit</h3><p className="text-[11px] text-muted-foreground mt-0.5">This week · Jun 19–25</p></div>
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />Revenue</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />Profit</span>
            </div>
          </div>
          <div className="text-foreground" style={{ height: 200 }}>
            <SvgAreaChart data={revenueData} lines={[{ key: "revenue", color: "#0d9488", name: "Revenue" }, { key: "profit", color: "#06b6d4", name: "Profit" }]} yFormatter={v => `${PESO}${(v / 1000).toFixed(0)}k`} />
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="mb-4"><h3 className="text-sm font-bold text-foreground">Top Selling Products</h3><p className="text-[11px] text-muted-foreground mt-0.5">Units sold this week</p></div>
          <div className="text-foreground" style={{ height: 200 }}>
            <SvgBarChart data={topProducts} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold text-foreground">Recent Transactions</h3>
            <span className="text-[11px] text-primary font-semibold cursor-pointer hover:underline">View all</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-border bg-muted/30">
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-5 py-2.5">ID</th>
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-4 py-2.5">Product</th>
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-4 py-2.5">Type</th>
                <th className="text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-4 py-2.5">Amount</th>
                <th className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-4 py-2.5">Status</th>
              </tr></thead>
              <tbody>
                {transactions.slice(0, 6).map(tx => (
                  <tr key={tx.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-2.5 text-[11px] text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{tx.id}</td>
                    <td className="px-4 py-2.5 text-xs font-semibold text-foreground">{tx.product}</td>
                    <td className="px-4 py-2.5"><TxTypeBadge type={tx.type} /></td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(tx.amount)}</td>
                    <td className="px-4 py-2.5"><TxBadge status={tx.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold text-foreground">Stock Alerts</h3>
            <AlertTriangle size={14} className="text-amber-500" />
          </div>
          <div className="divide-y divide-border/50">
            {inventory.filter(i => i.status !== "good").map(item => (
              <div key={item.id} className="px-5 py-3 hover:bg-muted/20 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-foreground leading-tight">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5" style={{ fontFamily: "'DM Mono', monospace" }}>{item.stock} units · reorder at {item.reorder}</p>
                  </div>
                  <StockBadge status={item.status} />
                </div>
              </div>
            ))}
            {inventory.filter(i => i.status !== "good").length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">All stock levels healthy</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Product Form Modal (Add & Edit) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ProductFormModal({ initial, inventory, categories, onClose, onSave, onAddCategory }: {
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
    stock: initial?.stock != null ? String(initial.stock) : "",
    reorder: initial?.reorder != null ? String(initial.reorder) : "",
    price: initial?.price != null ? String(initial.price) : "",
    salePrice: initial?.salePrice != null ? String(initial.salePrice) : "",
    expiry: initial?.expiry ?? "",
  });
  const [customCategory, setCustomCategory] = useState("");
  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleCategoryChange = (v: string) => {
    set("category")(v);
    if (v !== "__other__") setCustomCategory("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const stock = parseInt(form.stock);
    const reorder = parseInt(form.reorder);
    const price = parseFloat(form.price);
    const salePriceVal = form.salePrice.trim() !== "" ? parseFloat(form.salePrice) : undefined;

    let finalCategory = form.category;
    if (form.category === "__other__" && customCategory.trim()) {
      finalCategory = customCategory.trim();
      onAddCategory(finalCategory);
    } else if (form.category === "__other__") {
      return; // custom category name required
    }

    const updated: Product = {
      id: form.id.trim(),
      name: form.name,
      category: finalCategory,
      stock,
      reorder,
      price,
      salePrice: salePriceVal,
      expiry: form.expiry,
      status: computeStatus(stock, reorder),
    };
    onSave(initial ?? null, updated);
    onClose();
  };

  return (
    <Modal title={isEdit ? "Edit Product" : "Add New Product"} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FieldInput label="Product ID / Barcode" value={form.id} onChange={set("id")} placeholder={suggestedId} required />
        <FieldInput label="Product Name" value={form.name} onChange={set("name")} placeholder="e.g. Amoxicillin 500mg" required />

        <div className="space-y-2">
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Category</label>
          <select
            value={form.category}
            onChange={e => handleCategoryChange(e.target.value)}
            required
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          >
            <option value="">Select…</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
            <option value="__other__">Other (custom)…</option>
          </select>
          {form.category === "__other__" && (
            <input
              type="text"
              value={customCategory}
              onChange={e => setCustomCategory(e.target.value)}
              placeholder="Enter custom category name"
              required
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="Stock Quantity" type="number" value={form.stock} onChange={set("stock")} placeholder="0" required min={0} />
          <FieldInput label="Reorder Level" type="number" value={form.reorder} onChange={set("reorder")} placeholder="0" required min={0} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label={`Regular Price (${PESO})`} type="number" value={form.price} onChange={set("price")} placeholder="0.00" required min={0} step={0.01} />
          <FieldInput label={`Sale Price (${PESO})`} type="number" value={form.salePrice} onChange={set("salePrice")} placeholder="Optional" min={0} step={0.01} helperText="If set, old price shows as strikethrough" />
        </div>
        <FieldInput label="Expiry (e.g. Jan 2027)" value={form.expiry} onChange={set("expiry")} placeholder="Mon YYYY" required />
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">Cancel</button>
          <button type="submit" className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity">{isEdit ? "Save Changes" : "Add Product"}</button>
        </div>
      </form>
    </Modal>
  );
}

// â”€â”€â”€ New Sale Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function NewSaleModal({ onClose, onAdd, inventory, currentUser }: {
  onClose: () => void;
  onAdd: (t: Transaction, productId: string, qty: number) => void;
  inventory: Product[];
  currentUser: AuthUser;
}) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState("1");

  const qtyNum = parseInt(qty) || 0;
  const unitPrice = selectedProduct ? (selectedProduct.salePrice ?? selectedProduct.price) : 0;
  const total = unitPrice * qtyNum;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || qtyNum <= 0 || qtyNum > selectedProduct.stock) return;
    const tx: Transaction = {
      id: `TXN-${Date.now().toString().slice(-4)}`,
      type: "sale",
      product: selectedProduct.name,
      qty: qtyNum,
      amount: total,
      staff: staffAbbrev(currentUser.name),
      date: nowDateStr(),
      status: "completed",
      productId: selectedProduct.id,
    };
    onAdd(tx, selectedProduct.id, qtyNum);
    onClose();
  };

  return (
    <Modal title="New Sale" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <ProductSearchWidget inventory={inventory} onSelect={setSelectedProduct} selectedProduct={selectedProduct} />
        <FieldInput label="Quantity" type="number" value={qty} onChange={setQty} placeholder="1" required min={1} />
        {selectedProduct && qtyNum > selectedProduct.stock && (
          <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={11} /> Quantity exceeds available stock ({selectedProduct.stock} units)</p>
        )}
        {total > 0 && (
          <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
            <span className="text-sm font-semibold text-foreground">Total Amount</span>
            <span className="text-lg font-bold text-primary" style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(total)}</span>
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">Cancel</button>
          <button type="submit" disabled={!selectedProduct || qtyNum <= 0 || qtyNum > (selectedProduct?.stock ?? 0)} className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50">Confirm Sale</button>
        </div>
      </form>
    </Modal>
  );
}

// â”€â”€â”€ Purchase Order Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function PurchaseOrderModal({ onClose, onAdd, inventory, currentUser }: {
  onClose: () => void;
  onAdd: (t: Transaction) => void;
  inventory: Product[];
  currentUser: AuthUser;
}) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState("100");
  const [supplier, setSupplier] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");

  const qtyNum = parseInt(qty) || 0;
  const costNum = parseFloat(unitCost) || 0;
  const total = qtyNum * costNum;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || qtyNum <= 0 || costNum <= 0) return;
    const tx: Transaction = {
      id: `PO-${Date.now().toString().slice(-4)}`,
      type: "purchase",
      product: selectedProduct.name,
      qty: qtyNum,
      amount: total,
      staff: staffAbbrev(currentUser.name),
      date: nowDateStr(),
      status: "pending",
      productId: selectedProduct.id,
      note: supplier ? `Supplier: ${supplier}${expectedDelivery ? ` | ETA: ${expectedDelivery}` : ""}` : undefined,
    };
    onAdd(tx);
    onClose();
  };

  return (
    <Modal title="New Purchase Order" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <ProductSearchWidget inventory={inventory} onSelect={setSelectedProduct} selectedProduct={selectedProduct} />
        <FieldInput label="Supplier Name" value={supplier} onChange={setSupplier} placeholder="e.g. MedLine Distributors" required />
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label={`Unit Cost (${PESO})`} type="number" value={unitCost} onChange={setUnitCost} placeholder="0.00" required min={0} step={0.01} />
          <FieldInput label="Quantity" type="number" value={qty} onChange={setQty} placeholder="100" required min={1} />
        </div>
        <FieldInput label="Expected Delivery" value={expectedDelivery} onChange={setExpectedDelivery} placeholder="e.g. Jul 5, 2025" />
        {total > 0 && (
          <div className="flex items-center justify-between bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 rounded-xl px-4 py-3">
            <span className="text-sm font-semibold text-foreground">Order Total</span>
            <span className="text-lg font-bold text-violet-600 dark:text-violet-400" style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(total)}</span>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground flex items-center gap-1"><AlertTriangle size={11} className="text-amber-500" /> Status will be set to Pending – admin approval required.</p>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">Cancel</button>
          <button type="submit" disabled={!selectedProduct || qtyNum <= 0 || costNum <= 0} className="flex-1 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50">Submit PO</button>
        </div>
      </form>
    </Modal>
  );
}

// â”€â”€â”€ Return Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ReturnModal({ onClose, onAdd, inventory, currentUser }: {
  onClose: () => void;
  onAdd: (t: Transaction, productId: string, qty: number) => void;
  inventory: Product[];
  currentUser: AuthUser;
}) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");

  const qtyNum = parseInt(qty) || 0;
  const unitPrice = selectedProduct ? (selectedProduct.salePrice ?? selectedProduct.price) : 0;
  const refund = qtyNum * unitPrice;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || qtyNum <= 0 || !reason.trim()) return;
    const tx: Transaction = {
      id: `RET-${Date.now().toString().slice(-4)}`,
      type: "return",
      product: selectedProduct.name,
      qty: qtyNum,
      amount: refund,
      staff: staffAbbrev(currentUser.name),
      date: nowDateStr(),
      status: "completed",
      productId: selectedProduct.id,
      note: reason,
    };
    onAdd(tx, selectedProduct.id, qtyNum);
    onClose();
  };

  return (
    <Modal title="Process Return" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <ProductSearchWidget inventory={inventory} onSelect={setSelectedProduct} selectedProduct={selectedProduct} />
        <FieldInput label="Quantity to Return" type="number" value={qty} onChange={setQty} placeholder="1" required min={1} />
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Reason for Return <span className="text-red-500">*</span></label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Explain reason for return…"
            required
            rows={3}
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
          />
        </div>
        {refund > 0 && (
          <div className="flex items-center justify-between bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-xl px-4 py-3">
            <span className="text-sm font-semibold text-foreground">Refund Amount</span>
            <span className="text-lg font-bold text-orange-600 dark:text-orange-400" style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(refund)}</span>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">Returned items will be restocked automatically.</p>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">Cancel</button>
          <button type="submit" disabled={!selectedProduct || qtyNum <= 0 || !reason.trim()} className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50">Process Return</button>
        </div>
      </form>
    </Modal>
  );
}

// â”€â”€â”€ Cancel PO Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CancelPOModal({ tx, onClose, onConfirm }: {
  tx: Transaction;
  onClose: () => void;
  onConfirm: (txId: string, reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    onConfirm(tx.id, reason.trim());
    onClose();
  };

  return (
    <Modal title="Cancel Purchase Order" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-muted/40 border border-border rounded-xl p-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">PO ID</span><span className="font-semibold text-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{tx.id}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Product</span><span className="font-semibold text-foreground">{tx.product}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold text-foreground">{fmt(tx.amount)}</span></div>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Cancellation Reason <span className="text-red-500">*</span></label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Provide reason for cancelling this PO…"
            required
            rows={3}
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">Keep PO</button>
          <button type="submit" disabled={!reason.trim()} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50">Cancel PO</button>
        </div>
      </form>
    </Modal>
  );
}

// â”€â”€â”€ Invoice / Receipt Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function InvoiceModal({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const typeHeader: Record<TxType, string> = {
    sale: "SALES RECEIPT",
    purchase: "PURCHASE ORDER",
    return: "RETURN RECEIPT",
  };
  const header = tx.status === "cancelled" ? "CANCELLATION NOTICE" : typeHeader[tx.type];

  const receiptHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt ${tx.id}</title>
<style>
  body { margin: 0; padding: 16px; background: #fff; font-family: 'Courier New', Courier, monospace; font-size: 12px; color: #000; }
  .receipt { width: 302px; margin: 0 auto; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .dashes { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; }
  @media print { body { margin: 0; padding: 0; } }
</style>
</head>
<body>
<div class="receipt">
  <div class="center bold" style="font-size:14px;">TANGUB PHARMACY</div>
  <div class="center">Tangub City, Misamis Occidental</div>
  <div class="center">Tel: (088) 545-0001</div>
  <div class="dashes"></div>
  <div class="center bold">${header}</div>
  <div class="dashes"></div>
  <div class="row"><span>Txn ID:</span><span>${tx.id}</span></div>
  <div class="row"><span>Date:</span><span>${tx.date}</span></div>
  <div class="row"><span>Staff:</span><span>${tx.staff}</span></div>
  <div class="row"><span>Status:</span><span>${tx.status.toUpperCase()}</span></div>
  <div class="dashes"></div>
  <div class="row bold"><span>ITEM</span><span>QTY x PRICE = AMT</span></div>
  <div class="dashes"></div>
  <div>${tx.product}</div>
  <div class="row"><span></span><span>${tx.qty} x &#8369;${(tx.amount / tx.qty).toFixed(2)} = &#8369;${tx.amount.toFixed(2)}</span></div>
  <div class="dashes"></div>
  <div class="row bold"><span>${tx.type === "return" ? "REFUND TOTAL" : "TOTAL"}</span><span>&#8369;${tx.amount.toFixed(2)}</span></div>
  <div class="dashes"></div>
  ${tx.status === "cancelled" && tx.note ? `<div>Cancellation Reason:</div><div>${tx.note}</div><div class="dashes"></div>` : ""}
  ${tx.type === "return" && tx.note ? `<div>Return Reason:</div><div>${tx.note}</div><div class="dashes"></div>` : ""}
  <div class="center">Thank you for your business!</div>
  <div class="center">SmartTrack v2.1</div>
</div>
</body>
</html>`;

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) return;
    win.document.write(receiptHtml);
    win.document.close();
    win.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 sm:items-center sm:pt-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-sm font-bold text-foreground">Receipt / Invoice</h2>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 transition-opacity">
              <Printer size={12} />Print
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={16} /></button>
          </div>
        </div>
        <div className="p-4 overflow-y-auto flex justify-center">
          <div style={{ width: 302, fontFamily: "'Courier New', Courier, monospace", fontSize: 12, background: "#fff", color: "#000", padding: "12px 8px" }}>
            <div style={{ textAlign: "center", fontWeight: "bold", fontSize: 14 }}>TANGUB PHARMACY</div>
            <div style={{ textAlign: "center" }}>Tangub City, Misamis Occidental</div>
            <div style={{ textAlign: "center" }}>Tel: (088) 545-0001</div>
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            <div style={{ textAlign: "center", fontWeight: "bold" }}>{header}</div>
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Txn ID:</span><span>{tx.id}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Date:</span><span>{tx.date}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Staff:</span><span>{tx.staff}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Status:</span><span>{tx.status.toUpperCase()}</span></div>
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}><span>ITEM</span><span>AMT</span></div>
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            <div style={{ marginBottom: 2 }}>{tx.product}</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{tx.qty} &times; {PESO}{(tx.amount / tx.qty).toFixed(2)}</span>
              <span>{PESO}{tx.amount.toFixed(2)}</span>
            </div>
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
              <span>{tx.type === "return" ? "REFUND TOTAL" : "TOTAL"}</span>
              <span>&#8369;{tx.amount.toFixed(2)}</span>
            </div>
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            {tx.status === "cancelled" && tx.note && (
              <>
                <div style={{ fontWeight: "bold" }}>Cancellation Reason:</div>
                <div style={{ wordBreak: "break-word" }}>{tx.note}</div>
                <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
              </>
            )}
            {tx.type === "return" && tx.note && tx.status !== "cancelled" && (
              <>
                <div style={{ fontWeight: "bold" }}>Return Reason:</div>
                <div style={{ wordBreak: "break-word" }}>{tx.note}</div>
                <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
              </>
            )}
            <div style={{ textAlign: "center" }}>Thank you for your business!</div>
            <div style={{ textAlign: "center", marginTop: 4, opacity: 0.6 }}>SmartTrack v2.1</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Add User Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function UserFormModal({ initial, onClose, onSave }: {
  initial?: StaffMember;
  onClose: () => void;
  onSave: (original: StaffMember | null, updated: StaffMember) => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    role: initial?.role ?? "",
    email: initial?.email ?? "",
    status: initial?.status ?? "active",
  });
  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: StaffMember = {
      id: initial?.id ?? `U${String(Date.now()).slice(-3)}`,
      name: form.name.trim(),
      role: form.role,
      email: form.email.trim(),
      status: form.status as StaffMember["status"],
      lastLogin: initial?.lastLogin ?? "Never",
      initials: initials(form.name),
    };
    onSave(initial ?? null, updated);
    onClose();
  };

  return (
    <Modal title={isEdit ? "Edit User" : "Add New User"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FieldInput label="User" value={form.name} onChange={set("name")} placeholder="e.g. Juan Dela Cruz" required />
        <FieldSelect label="Role" value={form.role} onChange={set("role")} options={ROLES} required />
        <FieldInput label="Email Address" type="email" value={form.email} onChange={set("email")} placeholder="user@tangub.ph" required />
        <FieldSelect label="Status" value={form.status} onChange={set("status")} options={["active", "inactive"]} required />
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">Cancel</button>
          <button type="submit" className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity">{isEdit ? "Save Changes" : "Add User"}</button>
        </div>
      </form>
    </Modal>
  );
}

// â”€â”€â”€ Inventory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function InventoryPage({ inventory, categories, onAddProduct, onEditProduct, onAddCategory }: {
  inventory: Product[];
  categories: string[];
  onAddProduct: () => void;
  onEditProduct: (p: Product) => void;
  onAddCategory: (cat: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const filtered = useMemo(() => inventory.filter(item => {
    const ms = item.name.toLowerCase().includes(search.toLowerCase()) || item.category.toLowerCase().includes(search.toLowerCase());
    const mf = statusFilter === "all" || item.status === statusFilter;
    return ms && mf;
  }), [search, statusFilter, inventory]);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px]">
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{inventory.length} products · {inventory.filter(i => i.status !== "good").length} need attention</p>
        </div>
        <button onClick={onAddProduct} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity shadow-sm shadow-primary/20 flex-shrink-0">
          <Plus size={14} />Add Product
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…" className="w-full bg-card border border-border rounded-xl pl-8 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary shadow-sm" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {["all", "critical", "low", "moderate", "good"].map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === f ? "bg-primary text-primary-foreground shadow-sm" : "bg-card border border-border text-muted-foreground hover:text-foreground shadow-sm"}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-border bg-muted/30">
              {["Product", "Category", "Stock", "Reorder At", "Unit Price", "Expiry", "Status", ""].map(h => (
                <th key={h} className={`text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 ${h === "Stock" || h === "Reorder At" || h === "Unit Price" ? "text-right px-4" : h === "" ? "px-4" : "text-left px-4 first:px-5"}`}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3"><p className="text-xs font-bold text-foreground">{item.name}</p><p className="text-[10px] text-muted-foreground mt-0.5" style={{ fontFamily: "'DM Mono', monospace" }}>{item.id}</p></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{item.category}</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{item.stock.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{item.reorder}</td>
                  <td className="px-4 py-3 text-right text-xs font-bold" style={{ fontFamily: "'DM Mono', monospace" }}>
                    {item.salePrice != null ? (
                      <span>
                        <span className="line-through text-muted-foreground mr-1">{fmt(item.price)}</span>
                        <span className="text-primary">{fmt(item.salePrice)}</span>
                      </span>
                    ) : (
                      <span className="text-foreground">{fmt(item.price)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{item.expiry}</td>
                  <td className="px-4 py-3"><StockBadge status={item.status} /></td>
                  <td className="px-4 py-3">
                    <button onClick={() => onEditProduct(item)} className="text-muted-foreground hover:text-primary transition-colors" title="Edit product">
                      <Pencil size={13} />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-sm text-muted-foreground">No products match your filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Transactions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TransactionsPage({ user, transactions, inventory, currentUser, onAddSale, onAddPO, onAddReturn, onUpdateTxStatus, onViewInvoice }: {
  user: AuthUser;
  transactions: Transaction[];
  inventory: Product[];
  currentUser: AuthUser;
  onAddSale: () => void;
  onAddPO: () => void;
  onAddReturn: () => void;
  onUpdateTxStatus: (txId: string, status: "approved" | "cancelled", note?: string) => void;
  onViewInvoice: (tx: Transaction) => void;
}) {
  const [typeFilter, setTypeFilter] = useState<"all" | "sale" | "purchase" | "return">("all");
  const filtered = useMemo(() => {
    if (typeFilter === "all") return transactions;
    return transactions.filter(t => t.type === typeFilter);
  }, [typeFilter, transactions]);

  const totalSales = transactions.filter(t => t.type === "sale").reduce((s, t) => s + t.amount, 0);
  const totalPO = transactions.filter(t => t.type === "purchase").reduce((s, t) => s + t.amount, 0);
  const totalReturns = transactions.filter(t => t.type === "return").reduce((s, t) => s + t.amount, 0);

  const [cancellingTx, setCancellingTx] = useState<Transaction | null>(null);
  const isStaff = user.role === "staff";
  const canManagePO = isStaff;

  const handleCancelConfirm = (txId: string, reason: string) => {
    onUpdateTxStatus(txId, "cancelled", reason);
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px]">
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Transactions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Sales, purchase orders &amp; returns · Jun 25, 2025</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {isStaff && (
            <>
              <button onClick={onAddSale} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90 transition-opacity shadow-sm shadow-primary/20">
                <ShoppingCart size={13} />New Sale
              </button>
              <button onClick={onAddPO} className="flex items-center gap-2 px-3 py-2 border border-violet-400 text-violet-600 dark:text-violet-400 rounded-xl text-xs font-bold hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-all">
                <Package size={13} />Purchase Order
              </button>
              <button onClick={onAddReturn} className="flex items-center gap-2 px-3 py-2 border border-orange-400 text-orange-600 dark:text-orange-400 rounded-xl text-xs font-bold hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-all">
                <RotateCcw size={13} />Return
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Sales Today", val: fmt(totalSales), sub: `${transactions.filter(t => t.type === "sale").length} transactions`, color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Purchase Orders", val: fmt(totalPO), sub: `${transactions.filter(t => t.type === "purchase").length} orders · ${transactions.filter(t => t.status === "pending").length} pending`, color: "text-violet-600 dark:text-violet-400" },
          { label: "Returns / Refunds", val: fmt(totalReturns), sub: `${transactions.filter(t => t.type === "return").length} returns`, color: "text-orange-600 dark:text-orange-400" },
        ].map(c => (
          <div key={c.label} className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</p>
            <p className="text-xl font-bold text-foreground mt-2" style={{ fontFamily: "'DM Mono', monospace" }}>{c.val}</p>
            <p className={`text-xs mt-1 font-medium ${c.color}`}>{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border flex-wrap gap-3">
          <div className="flex items-center gap-1.5">
            {(["all", "sale", "purchase", "return"] as const).map(f => (
              <button key={f} onClick={() => setTypeFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${typeFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {f === "all" ? "All" : f === "sale" ? "Sales" : f === "purchase" ? "Purchase Orders" : "Returns"}
              </button>
            ))}
          </div>
          {user.role === "admin" && (
            <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-semibold">
              <FileText size={12} />Export
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-border/60 bg-muted/20">
              {["Transaction ID", "Product", "Qty", "Amount", "Staff", "Date", "Type", "Status", "Actions"].map((h, i) => (
                <th key={h} className={`text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 ${i >= 2 && i <= 3 ? "text-right px-4" : "text-left px-4 first:px-5"}`}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map(tx => (
                <tr key={tx.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 text-[11px] text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{tx.id}</td>
                  <td className="px-4 py-3 text-xs font-bold text-foreground">{tx.product}</td>
                  <td className="px-4 py-3 text-right text-xs text-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{tx.qty}</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(tx.amount)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{tx.staff}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{tx.date}</td>
                  <td className="px-4 py-3"><TxTypeBadge type={tx.type} /></td>
                  <td className="px-4 py-3"><TxBadge status={tx.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {tx.type === "purchase" && (tx.status === "pending" || tx.status === "approved") && canManagePO && (
                        <>
                          {tx.status === "pending" && (
                            <button onClick={() => onUpdateTxStatus(tx.id, "approved")} className="px-2 py-0.5 bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-400 text-[10px] font-bold rounded hover:opacity-80 transition-opacity">Approve</button>
                          )}
                          <button onClick={() => setCancellingTx(tx)} className="px-2 py-0.5 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] font-bold rounded hover:opacity-80 transition-opacity">Cancel</button>
                        </>
                      )}
                      <button onClick={() => onViewInvoice(tx)} className="text-muted-foreground hover:text-primary transition-colors" title="View receipt">
                        <Printer size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {cancellingTx && (
        <CancelPOModal
          tx={cancellingTx}
          onClose={() => setCancellingTx(null)}
          onConfirm={handleCancelConfirm}
        />
      )}
    </div>
  );
}

// â”€â”€â”€ Analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AnalyticsPage() {
  const perf = [
    { name: "Paracetamol 500mg", cat: "Analgesic", units: 412, rev: 1030, trend: "+14%", up: true, level: "High" },
    { name: "Amoxicillin 500mg", cat: "Antibiotic", units: 284, rev: 2414, trend: "+8%", up: true, level: "High" },
    { name: "Omeprazole 20mg", cat: "Antacid", units: 203, rev: 1989.4, trend: "+5%", up: true, level: "Moderate" },
    { name: "Metformin 500mg", cat: "Antidiabetic", units: 198, rev: 831.6, trend: "-3%", up: false, level: "Moderate" },
    { name: "Vitamin C 500mg", cat: "Supplement", units: 189, rev: 604.8, trend: "+22%", up: true, level: "High" },
    { name: "Amlodipine 5mg", cat: "Antihypertensive", units: 156, rev: 1053, trend: "+1%", up: true, level: "Stable" },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px]">
      <div>
        <h1 className="text-xl font-bold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Supply-demand analysis · Jan–Jun 2025</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "Avg Monthly Revenue", value: `${PESO}142,400`, sub: "+18.2% YoY", color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Inventory Turnover", value: "4.2Ã—", sub: "Per quarter", color: "text-sky-600 dark:text-sky-400" },
          { label: "Demand Fulfillment", value: "96.4%", sub: "On-time delivery rate", color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Stock-Out Incidents", value: "3", sub: "This quarter", color: "text-amber-600 dark:text-amber-400" },
        ].map(m => (
          <div key={m.label} className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{m.label}</p>
            <p className="text-xl font-bold text-foreground mt-2" style={{ fontFamily: "'DM Mono', monospace" }}>{m.value}</p>
            <p className={`text-xs mt-1 font-medium ${m.color}`}>{m.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div><h3 className="text-sm font-bold text-foreground">Supply vs. Demand</h3><p className="text-[11px] text-muted-foreground mt-0.5">Monthly units · Jan–Jun 2025</p></div>
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />Supply</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />Demand</span>
            </div>
          </div>
          <div className="text-foreground" style={{ height: 220 }}>
            <SvgAreaChart data={demandSupply} lines={[{ key: "supply", color: "#0d9488", name: "Supply" }, { key: "demand", color: "#8b5cf6", name: "Demand" }]} yFormatter={v => `${(v / 1000).toFixed(1)}k`} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="mb-4"><h3 className="text-sm font-bold text-foreground">Sales by Category</h3><p className="text-[11px] text-muted-foreground mt-0.5">Current quarter</p></div>
          <ResponsiveContainer width="100%" height={170}>
            <PieChart id="chart-category-pie">
              <Pie data={categoryData} cx="50%" cy="50%" innerRadius={48} outerRadius={70} paddingAngle={3} dataKey="value">
                {categoryData.map((_, i) => <Cell key={`cell-${i}`} fill={PIE_COLORS[i]} />)}
              </Pie>
              <Tooltip formatter={(v: any) => `${v}%`} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "11px", color: "var(--foreground)" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {categoryData.map((cat, i) => (
              <div key={cat.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i] }} /><span className="text-xs text-muted-foreground">{cat.name}</span></div>
                <span className="text-xs font-bold text-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{cat.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border"><h3 className="text-sm font-bold text-foreground">Product Performance</h3><p className="text-[11px] text-muted-foreground mt-0.5">Revenue contribution and demand trend</p></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-border/60 bg-muted/20">
              {["Product", "Category", "Units Sold", "Revenue", "Trend", "Demand Level"].map((h, i) => (
                <th key={h} className={`text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 ${i >= 2 && i <= 4 ? "text-right px-4" : "text-left px-4 first:px-5"}`}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {perf.map(row => (
                <tr key={row.name} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 text-xs font-bold text-foreground">{row.name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{row.cat}</td>
                  <td className="px-4 py-3 text-right text-xs text-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{row.units}</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(row.rev)}</td>
                  <td className="px-4 py-3 text-right"><span className={`flex items-center justify-end gap-0.5 text-xs font-bold ${row.up ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>{row.up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{row.trend}</span></td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${row.level === "High" ? "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20" : row.level === "Moderate" ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20" : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"}`}>{row.level}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Users â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function UsersPage({ staff, onAddUser, onEditUser }: { staff: StaffMember[]; onAddUser: () => void; onEditUser: (user: StaffMember) => void }) {
  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px]">
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{staff.length} users · {staff.filter(s => s.status === "active").length} active</p>
        </div>
        <button onClick={onAddUser} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity shadow-sm shadow-primary/20 flex-shrink-0">
          <Plus size={14} />Add User
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-border bg-muted/30">
              {["User", "Role", "Email", "Last Login", "Status", ""].map(h => (
                <th key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-bold text-primary flex-shrink-0">{s.initials}</div>
                      <div><p className="text-xs font-bold text-foreground">{s.name}</p><p className="text-[10px] text-muted-foreground mt-0.5" style={{ fontFamily: "'DM Mono', monospace" }}>{s.id}</p></div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{s.role}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{s.email}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{s.lastLogin}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${s.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20" : "bg-muted text-muted-foreground border-border"}`}>
                      {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => onEditUser(s)} className="text-muted-foreground hover:text-primary transition-colors" title="Edit user">
                      <Pencil size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ App â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


// --- Stock Alerts Page ---

function StockAlertsPage({ inventory, onGoToInventory }: { inventory: Product[]; onGoToInventory: () => void }) {
  const critical = inventory.filter(i => i.status === "critical");
  const low = inventory.filter(i => i.status === "low");
  const moderate = inventory.filter(i => i.status === "moderate");
  const alertItems = [...critical, ...low, ...moderate];

  const severityConfig = {
    critical: { label: "Critical", bg: "bg-red-50 dark:bg-red-500/10", border: "border-red-200 dark:border-red-500/30", text: "text-red-700 dark:text-red-400", bar: "bg-red-500", icon: "text-red-500" },
    low: { label: "Low", bg: "bg-amber-50 dark:bg-amber-500/10", border: "border-amber-200 dark:border-amber-500/30", text: "text-amber-700 dark:text-amber-400", bar: "bg-amber-500", icon: "text-amber-500" },
    moderate: { label: "Moderate", bg: "bg-yellow-50 dark:bg-yellow-500/10", border: "border-yellow-200 dark:border-yellow-500/30", text: "text-yellow-700 dark:text-yellow-400", bar: "bg-yellow-400", icon: "text-yellow-500" },
    good: { label: "Good", bg: "", border: "", text: "", bar: "bg-emerald-500", icon: "text-emerald-500" },
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px]">
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Stock Alerts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {alertItems.length === 0 ? "All stock levels are healthy" : `${alertItems.length} product${alertItems.length > 1 ? "s" : ""} need attention`}
          </p>
        </div>
        <button onClick={onGoToInventory} className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all flex-shrink-0">
          <Package size={13} />View Inventory
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Critical", count: critical.length, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-500/10", border: "border-red-200 dark:border-red-500/20", icon: <AlertTriangle size={14} className="text-red-500" /> },
          { label: "Low", count: low.length, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10", border: "border-amber-200 dark:border-amber-500/20", icon: <AlertTriangle size={14} className="text-amber-500" /> },
          { label: "Moderate", count: moderate.length, color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-500/10", border: "border-yellow-200 dark:border-yellow-500/20", icon: <AlertTriangle size={14} className="text-yellow-400" /> },
        ].map(c => (
          <div key={c.label} className={`${c.bg} border ${c.border} rounded-xl p-4 shadow-sm`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</span>
              {c.icon}
            </div>
            <p className={`text-2xl font-bold ${c.color}`} style={{ fontFamily: "'DM Mono', monospace" }}>{c.count}</p>
            <p className="text-[10px] text-muted-foreground mt-1">product{c.count !== 1 ? "s" : ""}</p>
          </div>
        ))}
      </div>

      {alertItems.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
            <Check size={22} className="text-emerald-500" />
          </div>
          <p className="text-sm font-bold text-foreground">All stock levels are healthy</p>
          <p className="text-xs text-muted-foreground mt-1">No products currently need reordering</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(["critical", "low", "moderate"] as const).map(severity => {
            const items = inventory.filter(i => i.status === severity);
            if (items.length === 0) return null;
            const cfg = severityConfig[severity];
            return (
              <div key={severity} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                <div className={`flex items-center gap-2 px-5 py-3 border-b ${cfg.border} ${cfg.bg}`}>
                  <AlertTriangle size={13} className={cfg.icon} />
                  <span className={`text-xs font-bold ${cfg.text}`}>{cfg.label} — {items.length} product{items.length > 1 ? "s" : ""}</span>
                </div>
                <div className="divide-y divide-border/50">
                  {items.map(item => {
                    const pct = Math.min(100, Math.round((item.stock / (item.reorder * 1.5)) * 100));
                    const shortage = Math.max(0, item.reorder - item.stock);
                    return (
                      <div key={item.id} className="px-5 py-4 hover:bg-muted/20 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-foreground">{item.name}</p>
                              <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{item.id}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{item.category} · Expires {item.expiry}</p>
                          </div>
                          <StockBadge status={item.status} />
                        </div>
                        <div className="mt-3 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Current stock</span>
                            <span className={`font-bold ${cfg.text}`} style={{ fontFamily: "'DM Mono', monospace" }}>{item.stock.toLocaleString()} / {item.reorder} units</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${cfg.bar}`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>Reorder point: {item.reorder}</span>
                            {shortage > 0 && <span className={`font-semibold ${cfg.text}`}>Need {shortage} more to reach reorder level</span>}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <button onClick={onGoToInventory} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-[11px] font-bold hover:opacity-90 transition-opacity">
                            <RefreshCw size={10} />Reorder Now
                          </button>
                          <span className="text-[10px] text-muted-foreground">Unit price: {fmt(item.price)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Reports Page ---

function ReportsPage({ inventory, transactions, user }: { inventory: Product[]; transactions: Transaction[]; user: AuthUser }) {
  const [activeTab, setActiveTab] = useState<"sales" | "stock" | "inventory">("sales");

  const sales = transactions.filter(t => t.type === "sale");
  const purchases = transactions.filter(t => t.type === "purchase");
  const returns = transactions.filter(t => t.type === "return");
  const totalRevenue = sales.reduce((s, t) => s + t.amount, 0);
  const totalReturns = returns.reduce((s, t) => s + t.amount, 0);
  const totalPO = purchases.reduce((s, t) => s + t.amount, 0);
  const netRevenue = totalRevenue - totalReturns;

  const salesByProduct = useMemo(() => {
    const map: Record<string, { product: string; qty: number; amount: number }> = {};
    sales.forEach(t => {
      if (!map[t.product]) map[t.product] = { product: t.product, qty: 0, amount: 0 };
      map[t.product].qty += t.qty;
      map[t.product].amount += t.amount;
    });
    return Object.values(map).sort((a, b) => b.amount - a.amount);
  }, [sales]);

  const totalStock = inventory.reduce((s, p) => s + p.stock, 0);
  const totalValue = inventory.reduce((s, p) => s + p.stock * p.price, 0);
  const critical = inventory.filter(i => i.status === "critical");
  const low = inventory.filter(i => i.status === "low");
  const moderate = inventory.filter(i => i.status === "moderate");
  const good = inventory.filter(i => i.status === "good");

  const tabs: { id: "sales" | "stock" | "inventory"; label: string; icon: any }[] = [
    { id: "sales", label: "Sales Report", icon: ShoppingCart },
    { id: "stock", label: "Stock Alerts", icon: AlertTriangle },
    { id: "inventory", label: "Inventory", icon: Package },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px]">
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Generated on Jun 25, 2025 · Tangub Pharmacy</p>
        </div>
        <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all flex-shrink-0">
          <Printer size={13} />Print
        </button>
      </div>

      <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1 w-full overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex-1 justify-center ${activeTab === t.id ? "bg-card text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"}`}>
            <t.icon size={12} />{t.label}
          </button>
        ))}
      </div>

      {activeTab === "sales" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Revenue", value: fmt(totalRevenue), color: "text-emerald-600 dark:text-emerald-400" },
              { label: "Returns / Refunds", value: fmt(totalReturns), color: "text-orange-600 dark:text-orange-400" },
              { label: "Net Revenue", value: fmt(netRevenue), color: "text-primary" },
              { label: "Purchase Orders", value: fmt(totalPO), color: "text-violet-600 dark:text-violet-400" },
            ].map(c => (
              <div key={c.label} className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</p>
                <p className={`text-lg font-bold mt-2 ${c.color}`} style={{ fontFamily: "'DM Mono', monospace" }}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Sales", count: sales.length, color: "text-emerald-600 dark:text-emerald-400" },
              { label: "Purchase Orders", count: purchases.length, color: "text-violet-600 dark:text-violet-400" },
              { label: "Returns", count: returns.length, color: "text-orange-600 dark:text-orange-400" },
            ].map(c => (
              <div key={c.label} className="bg-card border border-border rounded-xl p-4 shadow-sm text-center">
                <p className={`text-2xl font-bold ${c.color}`} style={{ fontFamily: "'DM Mono', monospace" }}>{c.count}</p>
                <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
              </div>
            ))}
          </div>
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-bold text-foreground">Sales by Product</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Jun 25, 2025</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-border bg-muted/30">
                  {["Product", "Qty Sold", "Revenue", "% of Sales"].map((h, i) => (
                    <th key={h} className={`text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 px-4 ${i > 0 ? "text-right" : "text-left first:px-5"}`}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {salesByProduct.map(row => (
                    <tr key={row.product} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 text-xs font-semibold text-foreground">{row.product}</td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{row.qty}</td>
                      <td className="px-4 py-3 text-right text-xs font-bold text-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(row.amount)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round((row.amount / totalRevenue) * 100)}%` }} />
                          </div>
                          <span className="text-[11px] text-muted-foreground w-7 text-right">{Math.round((row.amount / totalRevenue) * 100)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {salesByProduct.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-sm text-muted-foreground">No sales recorded</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "stock" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Critical", count: critical.length, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-500/10", border: "border-red-200 dark:border-red-500/20" },
              { label: "Low Stock", count: low.length, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10", border: "border-amber-200 dark:border-amber-500/20" },
              { label: "Moderate", count: moderate.length, color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-500/10", border: "border-yellow-200 dark:border-yellow-500/20" },
              { label: "Healthy", count: good.length, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-200 dark:border-emerald-500/20" },
            ].map(c => (
              <div key={c.label} className={`${c.bg} border ${c.border} rounded-xl p-4 shadow-sm`}>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</p>
                <p className={`text-2xl font-bold ${c.color} mt-2`} style={{ fontFamily: "'DM Mono', monospace" }}>{c.count}</p>
              </div>
            ))}
          </div>
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-bold text-foreground">Items Requiring Action</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">{critical.length + low.length + moderate.length} products below or near reorder threshold</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-border bg-muted/30">
                  {["Product", "Category", "Current Stock", "Reorder At", "Shortage", "Status"].map((h, i) => (
                    <th key={h} className={`text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 px-4 ${i >= 2 && i <= 4 ? "text-right" : "text-left first:px-5"}`}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {[...critical, ...low, ...moderate].map(item => (
                    <tr key={item.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3"><p className="text-xs font-bold text-foreground">{item.name}</p><p className="text-[10px] text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{item.id}</p></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{item.category}</td>
                      <td className="px-4 py-3 text-right text-xs font-bold text-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{item.stock}</td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{item.reorder}</td>
                      <td className="px-4 py-3 text-right text-xs font-semibold" style={{ fontFamily: "'DM Mono', monospace" }}>
                        <span className={item.stock < item.reorder ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>{item.stock < item.reorder ? `-${item.reorder - item.stock}` : "—"}</span>
                      </td>
                      <td className="px-4 py-3"><StockBadge status={item.status} /></td>
                    </tr>
                  ))}
                  {critical.length + low.length + moderate.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">All products are at healthy stock levels</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "inventory" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "Total Products", value: String(inventory.length), color: "text-foreground" },
              { label: "Total Stock Units", value: totalStock.toLocaleString(), color: "text-primary" },
              { label: "Total Inventory Value", value: fmt(totalValue), color: "text-emerald-600 dark:text-emerald-400" },
            ].map(c => (
              <div key={c.label} className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</p>
                <p className={`text-xl font-bold mt-2 ${c.color}`} style={{ fontFamily: "'DM Mono', monospace" }}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-bold text-foreground">Complete Inventory</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">All products as of Jun 25, 2025</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-border bg-muted/30">
                  {["Product", "Category", "Stock", "Unit Price", "Stock Value", "Expiry", "Status"].map((h, i) => (
                    <th key={h} className={`text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 px-4 ${i >= 2 && i <= 4 ? "text-right" : "text-left first:px-5"}`}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {inventory.map(item => (
                    <tr key={item.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3"><p className="text-xs font-bold text-foreground">{item.name}</p><p className="text-[10px] text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{item.id}</p></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{item.category}</td>
                      <td className="px-4 py-3 text-right text-xs font-bold text-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{item.stock.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(item.price)}</td>
                      <td className="px-4 py-3 text-right text-xs font-bold text-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>{fmt(item.stock * item.price)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{item.expiry}</td>
                      <td className="px-4 py-3"><StockBadge status={item.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Stock Alerts Page ---

export default function Home({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [page, setPage] = useState<Page>("dashboard");
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // Data state
  const [inventory, setInventory] = useState<Product[]>(INIT_INVENTORY);
  const [transactions, setTransactions] = useState<Transaction[]>(INIT_TRANSACTIONS);
  const [staff, setStaff] = useState<StaffMember[]>(INIT_STAFF);
  const [notifs, setNotifs] = useState<Notification[]>(INIT_NOTIFS);
  const [categories, setCategories] = useState<string[]>(INIT_CATEGORIES);

  // Modal state
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showAddSale, setShowAddSale] = useState(false);
  const [showAddPO, setShowAddPO] = useState(false);
  const [showAddReturn, setShowAddReturn] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffMember | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<Transaction | null>(null);

  const lowStockCount = inventory.filter(i => i.status === "critical" || i.status === "low").length;
  const unreadCount = notifs.filter(n => !n.read).length;

  const handleAddCategory = (cat: string) => {
    setCategories(prev => prev.includes(cat) ? prev : [...prev, cat]);
  };

  const handleSaveProduct = (original: Product | null, updated: Product) => {
    if (original) {
      setInventory(prev => prev.map(p => p.id === original.id ? updated : p));
    } else {
      setInventory(prev => [updated, ...prev]);
    }
  };

  const handleEditProduct = (p: Product) => setEditingProduct(p);

  const handleAddSale = (tx: Transaction, productId: string, qty: number) => {
    setTransactions(prev => [tx, ...prev]);
    setInventory(prev => prev.map(p => {
      if (p.id !== productId) return p;
      const newStock = p.stock - qty;
      return { ...p, stock: newStock, status: computeStatus(newStock, p.reorder) };
    }));
  };

  const handleAddPO = (tx: Transaction) => {
    setTransactions(prev => [tx, ...prev]);
  };

  const handleReturn = (tx: Transaction, productId: string, qty: number) => {
    setTransactions(prev => [tx, ...prev]);
    setInventory(prev => prev.map(p => {
      if (p.id !== productId) return p;
      const newStock = p.stock + qty;
      return { ...p, stock: newStock, status: computeStatus(newStock, p.reorder) };
    }));
  };

  const handleUpdateTxStatus = (txId: string, status: "approved" | "cancelled", note?: string) => {
    setTransactions(prev => prev.map(t => {
      if (t.id !== txId) return t;
      return { ...t, status, note: note ?? t.note };
    }));
  };

  const handleSaveUser = (original: StaffMember | null, updated: StaffMember) => {
    if (original) {
      setStaff(prev => prev.map(s => s.id === original.id ? updated : s));
    } else {
      setStaff(prev => [...prev, updated]);
    }
  };
  const markAllRead = () => setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  const markOneRead = (id: number) => setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));

  const navigate = (p: Page) => setPage(p);

  const adminNav: { id: Page; icon: any; label: string; badge?: number }[] = [
    { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { id: "inventory", icon: Package, label: "Inventory", badge: lowStockCount },
    { id: "transactions", icon: ShoppingCart, label: "Transactions" },
    { id: "analytics", icon: BarChart2, label: "Analytics" },
    { id: "stock-alerts", icon: BellRing, label: "Stock Alerts", badge: lowStockCount },
    { id: "reports", icon: ClipboardList, label: "Reports" },
    { id: "users", icon: Users, label: "Users" },
  ];
  const staffNav: { id: Page; icon: any; label: string; badge?: number }[] = [
    { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { id: "inventory", icon: Package, label: "Inventory", badge: lowStockCount },
    { id: "transactions", icon: ShoppingCart, label: "Transactions" },
    { id: "stock-alerts", icon: BellRing, label: "Stock Alerts", badge: lowStockCount },
    { id: "reports", icon: ClipboardList, label: "Reports" },
  ];
  const navItems = user.role === "admin" ? adminNav : staffNav;

  const sidebarContent = (
    <div className="flex flex-col h-full" style={{ background: "linear-gradient(180deg, #1a3040 0%, #132633 100%)" }}>
      {/* Logo – click to toggle expand/collapse */}
      <button
        onClick={() => setSidebarExpanded(v => !v)}
        className="flex items-center gap-3 px-4 py-[18px] border-b border-white/[0.07] w-full text-left hover:bg-white/[0.04] transition-colors group"
      >
        <div className="w-7 h-7 rounded-lg bg-teal-400/20 border border-teal-400/30 flex items-center justify-center flex-shrink-0 group-hover:bg-teal-400/30 transition-colors">
          <Pill size={14} className="text-teal-300" />
        </div>
        {sidebarExpanded && (
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-bold text-white leading-tight">SmartTrack</p>
            <p className="text-[9px] text-teal-300/70 leading-tight mt-0.5">Tangub Pharmacy</p>
          </div>
        )}
      </button>

      {/* Role chip */}
      {sidebarExpanded && (
        <div className="px-3 py-2.5 border-b border-white/[0.07]">
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${user.role === "admin" ? "bg-teal-400/15" : "bg-violet-400/15"}`}>
            <Shield size={10} className={user.role === "admin" ? "text-teal-300" : "text-violet-300"} />
            <span className={`text-[10px] font-bold ${user.role === "admin" ? "text-teal-300" : "text-violet-300"}`}>
              {user.role === "admin" ? "Admin Access" : "Staff Access"}
            </span>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(item => (
          <button key={item.id} onClick={() => navigate(item.id)} title={!sidebarExpanded ? item.label : undefined}
            className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all duration-150 ${page === item.id ? "bg-teal-400/20 text-teal-200 border border-teal-400/25" : "text-white/50 hover:bg-white/[0.06] hover:text-white/90 border border-transparent"}`}
          >
            <item.icon size={15} className="flex-shrink-0" />
            {sidebarExpanded && (
              <>
                <span className="flex-1 text-left text-xs font-semibold">{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  <span className="w-4 h-4 bg-amber-400 rounded-full text-[9px] text-black flex items-center justify-center font-bold">{item.badge}</span>
                )}
              </>
            )}
          </button>
        ))}
      </nav>

      {/* Settings panel */}
      <div className="border-t border-white/[0.07] px-2 py-2">
        <button onClick={() => setShowSettings(v => !v)} title={!sidebarExpanded ? "Settings" : undefined}
          className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all ${showSettings ? "bg-white/10 text-white" : "text-white/40 hover:bg-white/[0.06] hover:text-white/80"}`}>
          <Settings size={14} className="flex-shrink-0" />
          {sidebarExpanded && <span className="text-xs font-semibold">Settings</span>}
        </button>

        {showSettings && sidebarExpanded && (
          <div className="mt-1 mx-1 bg-white/[0.06] border border-white/[0.08] rounded-xl p-3 space-y-2">
            {/* Dark mode toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {darkMode ? <Moon size={12} className="text-teal-300" /> : <Sun size={12} className="text-amber-300" />}
                <span className="text-[11px] font-semibold text-white/70">Dark Mode</span>
              </div>
              <button
                onClick={() => setDarkMode(v => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${darkMode ? "bg-teal-400" : "bg-white/20"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${darkMode ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </div>
            {/* Sidebar toggle hint */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-white/50">Collapse panel</span>
              <button onClick={() => setSidebarExpanded(false)} className="text-[10px] text-teal-300 font-semibold hover:underline">Hide</button>
            </div>
          </div>
        )}
      </div>

      {/* User profile */}
      <div className="border-t border-white/[0.07] p-3">
        <div className={`flex items-center gap-2.5 ${sidebarExpanded ? "" : "justify-center"}`}>
          <div className="w-8 h-8 rounded-full bg-teal-400/20 border border-teal-400/30 flex items-center justify-center text-[11px] font-bold text-teal-300 flex-shrink-0">{user.initials}</div>
          {sidebarExpanded && (
            <>
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-bold text-white truncate">{user.name}</p>
                <p className="text-[10px] text-white/40 truncate">{user.position}</p>
              </div>
              <button onClick={onLogout} title="Sign out" className="text-white/30 hover:text-red-400 transition-colors flex-shrink-0"><LogOut size={14} /></button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex h-screen bg-background overflow-hidden">
        {/* Sidebar – always visible, expands/collapses in place */}
        <aside
          className="flex-shrink-0 transition-all duration-300 overflow-hidden"
          style={{ width: sidebarExpanded ? "224px" : "52px" }}
        >
          {sidebarContent}
        </aside>

        {/* Main area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Topbar */}
          <header className="flex-shrink-0 h-14 border-b border-border flex items-center gap-3 px-4 sm:px-6 bg-card shadow-sm" style={{ zIndex: 10, position: "relative" }}>
            <div className="flex-1 flex items-center">
              <div className="relative max-w-xs w-full hidden sm:block">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input placeholder="Search products, transactions…" className="w-full bg-background border border-border rounded-xl pl-8 pr-4 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary shadow-sm" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Notification bell */}
              <div className="relative">
                <button onClick={() => setShowNotifications(v => !v)} className="relative w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl transition-all">
                  <Bell size={16} />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold leading-none">{unreadCount}</span>
                  )}
                </button>
                {showNotifications && (
                  <NotificationPanel notifs={notifs} onMarkAll={markAllRead} onMarkOne={markOneRead} onClose={() => setShowNotifications(false)} />
                )}
              </div>

              <div className="flex items-center gap-2 pl-2 border-l border-border">
                <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-bold text-primary">{user.initials}</div>
                <span className="text-xs font-bold text-foreground hidden sm:block">{user.name.split(" ")[0]}</span>
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto">
            {page === "dashboard" && <Dashboard user={user} inventory={inventory} transactions={transactions} />}
            {page === "inventory" && (
              <InventoryPage
                inventory={inventory}
                categories={categories}
                onAddProduct={() => setShowAddProduct(true)}
                onEditProduct={handleEditProduct}
                onAddCategory={handleAddCategory}
              />
            )}
            {page === "transactions" && (
              <TransactionsPage
                user={user}
                transactions={transactions}
                inventory={inventory}
                currentUser={user}
                onAddSale={() => setShowAddSale(true)}
                onAddPO={() => setShowAddPO(true)}
                onAddReturn={() => setShowAddReturn(true)}
                onUpdateTxStatus={handleUpdateTxStatus}
                onViewInvoice={tx => setViewingInvoice(tx)}
              />
            )}
            {page === "analytics" && user.role === "admin" && <AnalyticsPage />}
            {page === "stock-alerts" && <StockAlertsPage inventory={inventory} onGoToInventory={() => setPage("inventory")} />}
            {page === "reports" && <ReportsPage inventory={inventory} transactions={transactions} user={user} />}
            {page === "users" && user.role === "admin" && <UsersPage staff={staff} onAddUser={() => setShowAddUser(true)} onEditUser={setEditingUser} />}
          </main>
        </div>

        {/* Modals */}
        {showAddProduct && (
          <ProductFormModal
            inventory={inventory}
            categories={categories}
            onClose={() => setShowAddProduct(false)}
            onSave={handleSaveProduct}
            onAddCategory={handleAddCategory}
          />
        )}
        {editingProduct && (
          <ProductFormModal
            initial={editingProduct}
            inventory={inventory}
            categories={categories}
            onClose={() => setEditingProduct(null)}
            onSave={handleSaveProduct}
            onAddCategory={handleAddCategory}
          />
        )}
        {showAddSale && (
          <NewSaleModal
            onClose={() => setShowAddSale(false)}
            onAdd={handleAddSale}
            inventory={inventory}
            currentUser={user}
          />
        )}
        {showAddPO && (
          <PurchaseOrderModal
            onClose={() => setShowAddPO(false)}
            onAdd={handleAddPO}
            inventory={inventory}
            currentUser={user}
          />
        )}
        {showAddReturn && (
          <ReturnModal
            onClose={() => setShowAddReturn(false)}
            onAdd={handleReturn}
            inventory={inventory}
            currentUser={user}
          />
        )}
        {showAddUser && <UserFormModal onClose={() => setShowAddUser(false)} onSave={handleSaveUser} />}
        {editingUser && <UserFormModal initial={editingUser} onClose={() => setEditingUser(null)} onSave={handleSaveUser} />}
        {viewingInvoice && <InvoiceModal tx={viewingInvoice} onClose={() => setViewingInvoice(null)} />}
      </div>
    </div>
  );
}
