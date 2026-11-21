import { memo, useCallback, useState, useEffect, useRef, useMemo } from "react";
import { Search, Plus, Pencil, Trash2, Download, Upload } from "lucide-react";
import { getReorderUnits, hasUserRole, sortBatchesByExpiry, type Product, type Transaction } from "./data";
import { fmt, StockBadge, ConfirmDialog, SegmentedTabs, InfoTip } from "./shared";
import { ProductImportModal } from "./product-import-modal";

interface InventoryRowMeta {
  unitsPerPack: number;
  packCount: number;
  looseUnits: number;
  unitLabel: string;
  totalSold: number;
  packsSold: number;
  looseSold: number;
  reorderUnits: number;
  earliestExpiry: string;
  monthsLeft: number | null;
  extraBatches: number;
}

const InventoryRow = memo(function InventoryRow({
  item,
  meta,
  isSelected,
  isHovered,
  canModify,
  isCashier,
  setRowRef,
  onEditProduct,
  onDeleteProduct,
}: {
  item: Product;
  meta: InventoryRowMeta;
  isSelected: boolean;
  isHovered: boolean;
  canModify: boolean;
  isCashier: boolean;
  setRowRef: (id: string, el: HTMLTableRowElement | null) => void;
  onEditProduct: (p: Product) => void;
  onDeleteProduct: (p: Product) => void;
}) {
  return (
    <tr
      ref={el => setRowRef(item.id, el)}
      className={`border-b border-border/50 ${
        isSelected
          ? "bg-primary/10"
          : isHovered
          ? "bg-secondary/10"
          : "hover:bg-muted/20"
      }`}
    >
      <td className="px-5 py-3">
        {item.barcode && <p className="text-[10px] font-semibold text-primary">{item.barcode}</p>}
        <p className="text-xs font-bold text-foreground">{item.name}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">ID {item.id}</p>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{item.category}</td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{item.supplier}</td>
      <td className="px-4 py-3 text-xs text-foreground">
        <div className="flex flex-col gap-0.5">
          <span className="font-bold text-foreground">
            {meta.unitsPerPack > 1
              ? `${meta.packCount.toLocaleString()} packs/boxes`
              : `${item.stock.toLocaleString()} ${meta.unitLabel}${item.stock === 1 ? "" : "s"}`}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {item.stock.toLocaleString()} {meta.unitLabel}{item.stock !== 1 ? "s" : ""} total
            {meta.unitsPerPack > 1 && ` · ${meta.looseUnits} loose`}
          </span>
          {meta.unitsPerPack > 1 && <span className="text-[10px] text-primary">1 pack = {meta.unitsPerPack} {meta.unitLabel}s</span>}
        </div>
      </td>
      <td className="px-3 py-3 text-xs text-foreground w-24">
        {meta.totalSold === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : meta.unitsPerPack > 1 ? (
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold tabular-nums">{meta.packsSold.toLocaleString()} pk</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {meta.totalSold.toLocaleString()} {meta.unitLabel}s{meta.looseSold > 0 ? ` · ${meta.looseSold}L` : ""}
            </span>
          </div>
        ) : (
          <span className="tabular-nums font-semibold">
            {meta.totalSold.toLocaleString()} <span className="font-normal text-muted-foreground">{meta.unitLabel}{meta.totalSold !== 1 ? "s" : ""}</span>
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {meta.unitsPerPack > 1 ? (
          <>
            {item.reorder} pack{item.reorder !== 1 ? "s" : ""}
            <span className="block text-[10px]">({meta.reorderUnits.toLocaleString()} units)</span>
          </>
        ) : (
          <>{meta.reorderUnits.toLocaleString()} {meta.unitLabel}{meta.reorderUnits === 1 ? "" : "s"}</>
        )}
      </td>
      <td className="px-4 py-3 text-xs font-bold">
        <div className="flex flex-col gap-0.5">
          {item.salePrice != null ? (
            <span>
              <span className="line-through text-muted-foreground mr-1">{fmt(item.price)}</span>
              <span className="text-primary">{fmt(item.salePrice)}</span>
            </span>
          ) : (
            <span className="text-foreground">{fmt(item.price)}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {meta.monthsLeft !== null ? (
          <span className={meta.monthsLeft <= 3 ? "text-red-500 font-semibold" : meta.monthsLeft <= 6 ? "text-amber-600 dark:text-amber-400 font-medium" : ""}>
            {meta.earliestExpiry}{meta.monthsLeft <= 3 && " ⚠"}
          </span>
        ) : (
          meta.earliestExpiry
        )}
        {meta.extraBatches > 0 && (
          <span className="ml-1 text-[10px] text-primary">+{meta.extraBatches} batch</span>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap"><StockBadge status={item.status} /></td>
      <td className="px-4 py-3 whitespace-nowrap">
        {canModify ? (
          <div className="flex items-center gap-2">
            <button onClick={() => onEditProduct(item)} className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="Edit product">
              <Pencil size={16} />
            </button>
            <button onClick={() => onDeleteProduct(item)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors" title="Delete product">
              <Trash2 size={16} />
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground italic">
            {isCashier ? "View only" : "Read only"}
          </span>
        )}
      </td>
    </tr>
  );
});

const InventoryPage = memo(function InventoryPage({
  inventory,
  transactions,
  categories,
  onAddProduct,
  onEditProduct,
  onDeleteProduct,
  onAddCategory,
  onReload,
  showToast,
  selectedProductId,
  hoveredProductId,
  userRoles,
}: {
  inventory: Product[];
  transactions: Transaction[];
  categories: string[];
  onAddProduct: () => void;
  onEditProduct: (p: Product) => void;
  onDeleteProduct: (p: Product) => void;
  onAddCategory: (cat: string) => void;
  onReload?: () => void;
  showToast?: (msg: string, type?: "info" | "success" | "warning") => void;
  selectedProductId?: string | null;
  hoveredProductId?: string | null;
  userRoles: string[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showImportModal, setShowImportModal] = useState(false);
  const [confirmExportCsv, setConfirmExportCsv] = useState(false);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const setRowRef = useCallback((id: string, el: HTMLTableRowElement | null) => {
    rowRefs.current[id] = el;
  }, []);

  // Check if user is admin (read-only access to inventory)
  const isAdmin   = hasUserRole({ roles: userRoles }, "admin") || hasUserRole({ roles: userRoles }, "admin/owner");
  const isCashier = hasUserRole({ roles: userRoles }, "cashier");
  const canModify = hasUserRole({ roles: userRoles }, "inventory_manager");
  const canImport = canModify;

  // Units sold per product from sale transactions
  const soldByProductId = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach(t => {
      if (t.type !== "sale") return;
      const id = t.productId ?? t.product; // fall back to name key if no id
      map[id] = (map[id] ?? 0) + t.qty;
    });
    return map;
  }, [transactions]);

  const rowMetaById = useMemo(() => {
    const now = Date.now();
    const metaMap = new Map<string, InventoryRowMeta>();
    for (const item of inventory) {
      const unitsPerPack = Math.max(1, item.unitsPerPack ?? 1);
      const packCount = Math.floor(item.stock / unitsPerPack);
      const looseUnits = item.stock % unitsPerPack;
      const unitLabel = item.unitLabel ?? "unit";
      const totalSold = soldByProductId[item.id] ?? soldByProductId[item.name] ?? 0;
      const earliest = sortBatchesByExpiry(item.batches)[0];
      const monthsLeft = earliest?.expiryDate
        ? (new Date(earliest.expiryDate).getTime() - now) / (1000 * 60 * 60 * 24 * 30)
        : null;
      metaMap.set(item.id, {
        unitsPerPack,
        packCount,
        looseUnits,
        unitLabel,
        totalSold,
        packsSold: unitsPerPack > 1 ? Math.floor(totalSold / unitsPerPack) : 0,
        looseSold: unitsPerPack > 1 ? totalSold % unitsPerPack : 0,
        reorderUnits: getReorderUnits(item),
        earliestExpiry: earliest?.expiry ?? item.expiry,
        monthsLeft,
        extraBatches: item.batches.length > 1 ? item.batches.length - 1 : 0,
      });
    }
    return metaMap;
  }, [inventory, soldByProductId]);

  useEffect(() => {
    if (!selectedProductId) return;
    setSearch("");
    setStatusFilter("all");
    const frame = window.requestAnimationFrame(() => {
      rowRefs.current[selectedProductId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedProductId]);

  const attentionCount = useMemo(() => inventory.filter(i => i.status !== "good").length, [inventory]);

  const filtered = useMemo(
    () => {
      const q = search.toLowerCase();
      return inventory.filter(item => {
        const ms =
          !q ||
          item.name.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          (item.barcode ?? "").toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q);
        const mf = statusFilter === "all" || item.status === statusFilter;
        return ms && mf;
      });
    },
    [search, statusFilter, inventory]
  );

  const handleExportCsv = () => {
    const headers = ["Product", "Barcode", "ID", "Category", "Supplier", "Stock", "Reorder At", "Unit Price", "Expiry", "Stock Status"];
    const rows = inventory.map(item => {
      const unitsPerPack = Math.max(1, item.unitsPerPack ?? 1);
      const packCount = Math.floor(item.stock / unitsPerPack);
      const looseUnits = item.stock % unitsPerPack;
      const stock = unitsPerPack > 1
        ? `${packCount} packs/boxes (${item.stock} ${item.unitLabel ?? "unit"} total, ${looseUnits} loose)`
        : `${item.stock} ${item.unitLabel ?? "unit"}${item.stock === 1 ? "" : "s"}`;
      const earliest = sortBatchesByExpiry(item.batches)[0]?.expiry ?? item.expiry;
      return [
        item.name,
        item.barcode ?? "",
        item.id,
        item.category,
        item.supplier,
        stock,
        unitsPerPack > 1
          ? `${item.reorder} packs (${getReorderUnits(item)} units)`
          : `${getReorderUnits(item)} ${item.unitLabel ?? "unit"}${getReorderUnits(item) === 1 ? "" : "s"}`,
        fmt(item.price),
        earliest,
        item.status,
      ];
    });
    const csv = "\uFEFF" + [headers, ...rows]
      .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `products-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast?.("Inventory exported to CSV", "success");
  };

  return (
    <div className="st-page-shell flex flex-col w-full overflow-hidden" style={{ height: "calc(100dvh - 56px)" }}>
      {/* ── Sticky header: title + actions + search/filter ── */}
      <div className="st-page-header flex-shrink-0 st-shell-px pt-4 sm:pt-6 pb-4 bg-background border-b border-border/50 z-20">
        <div className="flex flex-wrap items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">Products</h1>
              <InfoTip
                title="Inventory & Batch Rules"
                lines={[
                  "Tracks medicine stock across supplier batches, pack sizes, and expiry dates.",
                  { label: "Batch Order", value: "POS deducts oldest received batches first (FIFO); table flags earliest expiry" },
                  { label: "Packs & Units", value: "Pack quantities automatically convert into sellable base units" },
                  { label: "Alert Threshold", value: "Low below Reorder Point; Critical below 40% of Reorder Point" },
                ]}
              />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {inventory.length} products · {attentionCount} need attention
              {isAdmin && !canModify && <span className="ml-2 text-amber-600 dark:text-amber-400 font-semibold">· Read-only access</span>}
              {isCashier && !canModify && <span className="ml-2 text-violet-600 dark:text-violet-400 font-semibold">· View-only access</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={() => setConfirmExportCsv(true)}
              className="flex items-center gap-2 px-3 py-2.5 border border-border bg-card text-foreground rounded-xl text-sm font-bold hover:bg-muted/50 transition-colors shadow-sm flex-shrink-0 cursor-pointer"
            >
              <Download size={14} />Export CSV
            </button>
            {canImport && (
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-3 py-2.5 border border-border bg-card text-foreground rounded-xl text-sm font-bold hover:bg-muted/50 transition-colors shadow-sm flex-shrink-0 cursor-pointer"
                title="Bulk import products from Excel or CSV spreadsheet"
              >
                <Upload size={14} className="text-emerald-500" />Import CSV
              </button>
            )}
            {canModify && (
              <button
                onClick={onAddProduct}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-[opacity,background-color,transform] shadow-sm shadow-primary/20 flex-shrink-0 cursor-pointer st-btn"
              >
                <Plus size={14} />Add Product
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-4 items-start sm:items-center">
          <div className="relative flex-1 w-full max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products"
              className="w-full bg-card border border-border rounded-xl pl-8 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary shadow-sm"
            />
          </div>
          <SegmentedTabs
            tone="primary"
            ariaLabel="Filter products by stock status"
            value={statusFilter}
            onChange={setStatusFilter}
            className="flex-wrap"
            buttonClassName="font-bold"
            items={["all", "out_of_stock", "critical", "low", "moderate", "good"].map(f => ({
              id: f,
              label: f === "out_of_stock" ? "Out of Stock" : f.charAt(0).toUpperCase() + f.slice(1),
            }))}
          />
        </div>
      </div>

      {/* ── Scrollable table ── */}
      <div className="st-page-fixed-card flex-1 min-h-0 overflow-hidden flex flex-col st-shell-mx my-4 bg-card border border-border rounded-xl shadow-sm">
        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" data-table-scroll="fixed">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-card shadow-sm">
              <tr className="border-b border-border bg-muted/30">
                {["Product / Barcode", "Category", "Supplier", "Stock (Packs / Units)", "Sold", "Reorder At", "Unit Price", "Expiry", "Stock Status", ""].map(h => (
                  <th key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const meta = rowMetaById.get(item.id);
                if (!meta) return null;
                return (
                  <InventoryRow
                    key={item.id}
                    item={item}
                    meta={meta}
                    isSelected={item.id === selectedProductId}
                    isHovered={hoveredProductId === item.id}
                    canModify={canModify}
                    isCashier={isCashier}
                    setRowRef={setRowRef}
                    onEditProduct={onEditProduct}
                    onDeleteProduct={onDeleteProduct}
                  />
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-sm text-muted-foreground">
                    No products match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ProductImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={onReload}
        showToast={showToast}
      />
      {confirmExportCsv && (
        <ConfirmDialog
          title="Export Inventory CSV?"
          message={`Download all ${inventory.length} inventory product${inventory.length === 1 ? "" : "s"} and stock levels as a CSV spreadsheet?`}
          confirmLabel="Export CSV"
          cancelLabel="Cancel"
          variant="info"
          onConfirm={() => { setConfirmExportCsv(false); handleExportCsv(); }}
          onCancel={() => setConfirmExportCsv(false)}
        />
      )}
    </div>
  );
});

export default InventoryPage;