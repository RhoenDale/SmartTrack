import { useState, useEffect, useRef, useMemo } from "react";
import { Search, Plus, Pencil, Trash2 } from "lucide-react";
import { sortBatchesByExpiry, type Product } from "./data";
import { fmt, StockBadge } from "./shared";

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
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  // Check if user is admin (read-only access to inventory)
  const isAdmin = userRole === "admin" || userRole === "admin/owner";
  const canModify = !isAdmin;

  useEffect(() => {
    if (selectedProductId) {
      setSearch("");
      setStatusFilter("all");
      const row = rowRefs.current[selectedProductId];
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedProductId]);

  const filtered = useMemo(
    () =>
      inventory.filter(item => {
        const ms =
          item.name.toLowerCase().includes(search.toLowerCase()) ||
          item.category.toLowerCase().includes(search.toLowerCase());
        const mf = statusFilter === "all" || item.status === statusFilter;
        return ms && mf;
      }),
    [search, statusFilter, inventory]
  );

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px]">
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {inventory.length} products · {inventory.filter(i => i.status !== "good").length} need attention
            {isAdmin && <span className="ml-2 text-amber-600 dark:text-amber-400 font-semibold">· Read-only access</span>}
          </p>
        </div>
        {canModify && (
          <button
            onClick={onAddProduct}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity shadow-sm shadow-primary/20 flex-shrink-0"
          >
            <Plus size={14} />Add Product
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products"
            className="w-full bg-card border border-border rounded-xl pl-8 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary shadow-sm"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {["all", "critical", "low", "moderate", "good"].map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === f
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground shadow-sm"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["Product", "Category", "Supplier", "Stock", "Reorder At", "Unit Price", "Expiry", "Stock Status", ""].map(h => (
                  <th key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr
                  key={item.id}
                  ref={el => { rowRefs.current[item.id] = el; }}
                  className={`border-b border-border/50 transition-colors ${
                    item.id === selectedProductId
                      ? "bg-primary/10"
                      : hoveredProductId === item.id
                      ? "bg-secondary/10"
                      : "hover:bg-muted/20"
                  }`}
                >
                  <td className="px-5 py-3">
                    <p className="text-xs font-bold text-foreground">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{item.id}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{item.category}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{item.supplier}</td>
                  <td className="px-4 py-3 text-xs font-bold text-foreground">{item.stock.toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{item.reorder}</td>
                  <td className="px-4 py-3 text-xs font-bold">
                    {item.salePrice != null ? (
                      <span>
                        <span className="line-through text-muted-foreground mr-1">{fmt(item.price)}</span>
                        <span className="text-primary">{fmt(item.salePrice)}</span>
                      </span>
                    ) : (
                      <span className="text-foreground">{fmt(item.price)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {(() => {
                      const earliest = sortBatchesByExpiry(item.batches)[0];
                      if (!earliest) return item.expiry;
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
                      <span className="text-[10px] text-muted-foreground italic">View only</span>
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
      </div>
    </div>
  );
}
