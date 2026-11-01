import { useState, useEffect, useRef, useMemo } from "react";
import { Search, Plus, Pencil, Trash2, Download } from "lucide-react";
import { getReorderUnits, sortBatchesByExpiry, type Product } from "./data";
import { fmt, StockBadge, InfoTip, TablePager, ConfirmDialog } from "./shared";

export default function InventoryPage({
  inventory,
  categories,
  onAddProduct,
  onEditProduct,
  onDeleteProduct,
  onAddCategory,
  selectedProductId,
  hoveredProductId,
  userRole,
}: {
  inventory: Product[];
  categories: string[];
  onAddProduct: () => void;
  onEditProduct: (p: Product) => void;
  onDeleteProduct: (p: Product) => void;
  onAddCategory: (cat: string) => void;
  selectedProductId?: string | null;
  hoveredProductId?: string | null;
  userRole: string;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const [confirmExportCsv, setConfirmExportCsv] = useState(false);

  // Admin, Owner, and Inventory Manager have full CRUD access; Cashier is view-only
  const isAdmin   = userRole === "admin" || userRole === "admin/owner";
  const isCashier = userRole === "cashier";
  const canModify = !isCashier;

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    if (selectedProductId) {
      setSearch("");
      setStatusFilter("all");
      const idx = inventory.findIndex(item => item.id === selectedProductId);
      if (idx !== -1) {
        setPage(Math.floor(idx / PAGE_SIZE) + 1);
      }
      setTimeout(() => {
        const row = rowRefs.current[selectedProductId];
        row?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
  }, [selectedProductId, inventory]);

  const filtered = useMemo(
    () =>
      inventory.filter(item => {
        const ms =
          item.name.toLowerCase().includes(search.toLowerCase()) ||
          item.category.toLowerCase().includes(search.toLowerCase()) ||
          (item.barcode ?? "").toLowerCase().includes(search.toLowerCase()) ||
          item.id.toLowerCase().includes(search.toLowerCase());
        const mf = statusFilter === "all" || item.status === statusFilter;
        return ms && mf;
      }),
    [search, statusFilter, inventory]
  );

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

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
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px] mx-auto">
      <div className="sticky top-0 z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 pt-4 sm:pt-6 pb-4 bg-background">
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">Inventory</h1>
              <InfoTip
                title="Pharmacy Inventory"
                lines={[
                  "Comprehensive catalog of pharmaceutical items, active stock, and pricing.",
                  { label: "FIFO Dispensing", value: "Older inventory batches are deducted first" },
                  { label: "Packs vs Units", value: "Packaging breakdown showing total & loose units" },
                  { label: "Reorder At", value: "Minimum stock threshold triggering replenishment" },
                  { label: "Permissions", value: "Admin & Inventory Manager have full edit rights" },
                ]}
              />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {inventory.length} products · {inventory.filter(i => i.status !== "good").length} need attention
              {isCashier && <span className="ml-2 text-violet-600 dark:text-violet-400 font-semibold">· View-only access</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={() => setConfirmExportCsv(true)}
              className="flex items-center gap-2 px-3 py-2.5 border border-border/80 bg-card/90 text-foreground rounded-xl text-sm font-semibold hover:bg-muted/50 transition-colors shadow-2xs flex-shrink-0"
            >
              <Download size={14} />Export CSV
            </button>
            {canModify && (
              <button
                onClick={onAddProduct}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm shadow-primary/20 flex-shrink-0"
              >
                <Plus size={14} />Add Product
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-5">
        <div className="relative flex-1 max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products"
            className="w-full bg-card/90 border border-border/80 rounded-xl pl-8 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary shadow-2xs"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {["all", "out_of_stock", "critical", "low", "moderate", "good"].map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                statusFilter === f
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "bg-card/90 border border-border/80 text-muted-foreground hover:text-foreground shadow-2xs"
              }`}
            >
                {f === "out_of_stock" ? "Out of Stock" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <InfoTip
            title="Stock Status Levels"
            lines={[
              "Products are categorized relative to their configured reorder threshold.",
              { label: "Out of Stock", value: "0 units remaining in pharmacy" },
              { label: "Critical", value: "Stock is below 50% of reorder level" },
              { label: "Low", value: "Stock is at or below reorder level" },
              { label: "Moderate", value: "Stock is between 1x and 2x reorder point" },
              { label: "Good", value: "Stock exceeds 2x reorder point" },
            ]}
          />
        </div>
      </div>
      </div>

      <div className="bg-card border border-border/80 rounded-2xl overflow-hidden shadow-[0_2px_12px_-4px_rgba(13,148,136,0.06),0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="overflow-x-auto" data-table-scroll="fixed">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-card shadow-xs">
              <tr className="border-b border-border/70 bg-muted/30">
                {["Product / Barcode", "Category", "Supplier", "Stock (Packs / Units)", "Reorder At", "Unit Price", "Expiry", "Stock Status", ""].map(h => (
                  <th key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map(item => (
                <tr
                  key={item.id}
                  ref={el => { rowRefs.current[item.id] = el; }}
                  className={`border-b border-border/40 transition-colors ${
                    item.id === selectedProductId
                      ? "bg-primary/10"
                      : hoveredProductId === item.id
                      ? "bg-secondary/10"
                      : "hover:bg-muted/30"
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
                    {(() => {
                      const unitsPerPack = Math.max(1, item.unitsPerPack ?? 1);
                      const packCount = Math.floor(item.stock / unitsPerPack);
                      const looseUnits = item.stock % unitsPerPack;
                      const unitLabel = item.unitLabel ?? "unit";
                      return (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-foreground">
                            {unitsPerPack > 1
                              ? `${packCount.toLocaleString()} packs/boxes`
                              : `${item.stock.toLocaleString()} ${unitLabel}${item.stock === 1 ? "" : "s"}`}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {item.stock.toLocaleString()} {unitLabel}{item.stock !== 1 ? "s" : ""} total
                            {unitsPerPack > 1 && ` · ${looseUnits} loose`}
                          </span>
                          {unitsPerPack > 1 && <span className="text-[10px] text-primary">1 pack = {unitsPerPack} {unitLabel}s</span>}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {(() => {
                      const unitsPerPack = Math.max(1, item.unitsPerPack ?? 1);
                      const unitLabel = item.unitLabel ?? "unit";
                      return unitsPerPack > 1
                        ? <>{item.reorder} pack{item.reorder !== 1 ? "s" : ""}
                            <span className="block text-[10px]">({getReorderUnits(item).toLocaleString()} units)</span>
                          </>
                        : <>{getReorderUnits(item).toLocaleString()} {unitLabel}{getReorderUnits(item) === 1 ? "" : "s"}</>;
                    })()}
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
                    {(() => {
                      const earliest = sortBatchesByExpiry(item.batches)[0];
                      if (!earliest?.expiryDate) return item.expiry;
                      const monthsLeft = (new Date(earliest.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30);
                      return (
                        <span className={monthsLeft <= 3 ? "text-red-500 font-semibold" : monthsLeft <= 6 ? "text-amber-600 dark:text-amber-400 font-medium" : ""}>
                          {earliest.expiry}{monthsLeft <= 3 && " ⚠"}
                        </span>
                      );
                    })()}
                    {item.batches.length > 1 && (
                      <span className="ml-1 text-[10px] text-primary">+{item.batches.length - 1} batch</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><StockBadge status={item.status} /></td>
                  <td className="px-4 py-3">
                    {canModify ? (
                      <div className="flex items-center gap-2">
                        <button onClick={() => onEditProduct(item)} className="text-muted-foreground hover:text-primary transition-colors" title="Edit product">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => onDeleteProduct(item)} className="text-muted-foreground hover:text-red-500 transition-colors" title="Delete product">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">
                        {isCashier ? "View only" : "Read only"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-sm text-muted-foreground">
                    No products match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePager total={filtered.length} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
      </div>
      {confirmExportCsv && (
        <ConfirmDialog
          title="Export Inventory CSV?"
          message="This will download a CSV file of all products and their current stock levels."
          confirmLabel="Export"
          cancelLabel="Cancel"
          variant="info"
          onConfirm={() => { setConfirmExportCsv(false); handleExportCsv(); }}
          onCancel={() => setConfirmExportCsv(false)}
        />
      )}
    </div>
  );
}
