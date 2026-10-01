import { useState, useMemo, useEffect, useRef } from "react";
import { ShoppingCart, FileText, Printer } from "lucide-react";
import { groupCartTransactions, type AuthUser, type Product, type Transaction } from "./data";
import { fmt, TxTypeBadge, TxBadge, ViewReasonModal } from "./shared";

export default function TransactionsPage({
  user,
  transactions,
  inventory,
  currentUser,
  selectedTransactionId,
  onAddSale,
  onAddReturn,
  onViewInvoice,
}: {
  user: AuthUser;
  transactions: Transaction[];
  inventory: Product[];
  currentUser: AuthUser;
  selectedTransactionId: string | null;
  onAddSale: () => void;
  onAddReturn: (tx: Transaction) => void;
  onViewInvoice: (tx: Transaction) => void;
}) {
  const todayISO = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const [typeFilter, setTypeFilter] = useState<"all" | "sale" | "return" | "adjustment">("all");
  const [dateFrom, setDateFrom] = useState(todayISO);
  const [dateTo, setDateTo] = useState("");
  const [viewingReason, setViewingReason] = useState<Transaction | null>(null);
  const [highlightedTransactionId, setHighlightedTransactionId] = useState<string | null>(null);
  const transactionRows = useRef(new Map<string, HTMLTableRowElement>());

  const parseTransactionDate = (date: string) => {
    const [rawDate] = date.split(" ");
    const [mm, dd, yyyy] = rawDate.split("/");
    return new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T00:00:00`);
  };

  const filtered = useMemo(() => {
    const matchingTransactions = transactions.filter(tx => {
      if (typeFilter !== "all" && tx.type !== typeFilter) return false;
      const txDate = parseTransactionDate(tx.date);
      if (dateFrom) {
        const fromDate = new Date(`${dateFrom}T00:00:00`);
        if (txDate < fromDate) return false;
      }
      if (dateTo) {
        const toDate = new Date(`${dateTo}T23:59:59`);
        if (txDate > toDate) return false;
      }
      return true;
    });
    return groupCartTransactions(matchingTransactions);
  }, [typeFilter, transactions, dateFrom, dateTo]);

  useEffect(() => {
    if (!selectedTransactionId) return;
    setDateFrom("");
    setDateTo("");
  }, [selectedTransactionId]);

  useEffect(() => {
    if (!selectedTransactionId) return;
    const row = transactionRows.current.get(selectedTransactionId);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedTransactionId(selectedTransactionId);
    const timeout = window.setTimeout(() => setHighlightedTransactionId(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [selectedTransactionId, filtered]);

  const today = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }); // "MM/DD/YYYY"

  const groupedSales = groupCartTransactions(transactions.filter(t => t.type === "sale"));
  const salesToday   = groupedSales.filter(t => t.date.startsWith(today));
  const allSales     = groupedSales;
  const allReturns   = transactions.filter(t => t.type === "return");

  const salesTodayAmt  = salesToday.reduce((s, t) => s + t.amount, 0);
  const allSalesAmt    = allSales.reduce((s, t) => s + t.amount, 0);
  const allReturnsAmt  = allReturns.reduce((s, t) => s + t.amount, 0);
  const isAdmin = user.role === "admin" || user.role === "admin/owner";
  const canModify = !isAdmin; // Admins cannot add sales or returns

  const handleExport = () => {
    const columns = ["Transaction ID", "Product", "Qty", "Amount", "Staff", "Date", "Type", "Status"];
    const rows = filtered.map(tx => [
      tx.id, tx.product, String(tx.qty), tx.amount.toFixed(2),
      tx.staff, tx.date, tx.type, tx.status,
    ]);
    const csvContent = [columns, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px]">
      <div className="sticky top-0 z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 pt-4 sm:pt-6 pb-4 bg-background">
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Transactions</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Sales &amp; returns
              {isAdmin && <span className="ml-2 text-amber-600 dark:text-amber-400 font-semibold">· Read-only access</span>}
            </p>
          </div>
          {canModify && (
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <button
                onClick={onAddSale}
                className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90 transition-opacity shadow-sm shadow-primary/20"
              >
                <ShoppingCart size={13} />New Sale
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
        {[
          {
            label: "Sales Today",
            val: fmt(salesTodayAmt),
            sub: `${salesToday.length} transaction${salesToday.length !== 1 ? "s" : ""}`,
            color: "text-emerald-600 dark:text-emerald-400",
          },
          {
            label: "All Sales",
            val: fmt(allSalesAmt),
            sub: `${allSales.length} total sale${allSales.length !== 1 ? "s" : ""}`,
            color: "text-sky-600 dark:text-sky-400",
          },
          {
            label: "Returns / Refunds",
            val: fmt(allReturnsAmt),
            sub: `${allReturns.length} return${allReturns.length !== 1 ? "s" : ""}`,
            color: "text-orange-600 dark:text-orange-400",
          },
        ].map(c => (
          <div key={c.label} className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</p>
            <p className="text-xl font-bold text-foreground mt-2 tabular-nums tracking-tight">{c.val}</p>
            <p className={`text-xs mt-1 font-medium ${c.color}`}>{c.sub}</p>
          </div>
        ))}
      </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="flex flex-col gap-3 px-5 py-3.5 border-b border-border sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {(["all", "sale", "return", "adjustment"] as const).map(f => (
              <button
                key={f}
                onClick={() => setTypeFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  typeFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? "All" : f === "sale" ? "Sales" : f === "return" ? "Returns" : "Adjustments"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground" />
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground" />
            {(dateFrom !== todayISO || dateTo !== "") && (
              <button
                onClick={() => { setDateFrom(todayISO); setDateTo(""); }}
                className="text-xs text-primary hover:text-primary/80 font-semibold transition-colors"
              >
                Reset
              </button>
            )}
            {isAdmin && (
              <button onClick={handleExport} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-semibold">
                <FileText size={12} />Export
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-card shadow-sm">
              <tr className="border-b border-border/60 bg-muted/20">
                {["Transaction ID", "Product", "Qty", "Amount", "Staff", "Date", "Type", "Status", "Actions"].map(h => (
                  <th key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(tx => (
                <tr
                  key={tx.id}
                  ref={row => {
                    if (row) transactionRows.current.set(tx.id, row);
                    else transactionRows.current.delete(tx.id);
                  }}
                  className={`border-b border-border/40 hover:bg-muted/20 transition-colors ${highlightedTransactionId === tx.id ? "bg-primary/15 ring-1 ring-inset ring-primary/40" : ""}`}
                >
                  <td className="px-5 py-3 text-[11px] text-muted-foreground">{tx.id}</td>
                  <td className="px-4 py-3 text-xs font-bold text-foreground">
                    {tx.cartItems?.length ? (
                      <div>
                        <div>{tx.product}</div>
                        <div className="mt-1 max-w-64 text-[11px] font-normal text-muted-foreground" title={tx.cartItems.map(item => item.product).join(", ")}>
                          {tx.cartItems.map(item => item.product).join(", ")}
                        </div>
                      </div>
                    ) : tx.product}
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground">{tx.cartItems ? `${tx.cartItems.length} line items · ${tx.qty} units` : `${tx.saleQty ?? tx.qty} ${tx.saleUnit && tx.saleUnit !== "unit" ? tx.saleUnit : "unit"}`}</td>
                  <td className="px-4 py-3 text-xs font-bold text-foreground">{fmt(tx.amount)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{tx.staff}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{tx.date}</td>
                  <td className="px-4 py-3"><TxTypeBadge type={tx.type} /></td>
                  <td className="px-4 py-3"><TxBadge status={tx.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onViewInvoice(tx)}
                        className="rounded-full border border-border bg-muted/10 p-2 text-muted-foreground hover:bg-muted/20 hover:text-primary transition-all duration-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        title="Print receipt"
                      >
                        <Printer size={13} />
                      </button>
                      {canModify && tx.type === "sale" && (
                        <button
                          onClick={() => onAddReturn(tx)}
                          className="rounded-full border border-orange-300 bg-orange-50 px-3 py-1.5 text-[11px] font-semibold text-orange-700 hover:bg-orange-100 hover:border-orange-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-orange-400/30"
                          title="Return"
                        >
                          Return
                        </button>
                      )}
                      {tx.type === "return" && (
                        <button
                          onClick={() => setViewingReason(tx)}
                          className="text-muted-foreground hover:text-primary transition-colors"
                          title="View reason"
                        >
                          <FileText size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-sm text-muted-foreground">
                    No transactions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewingReason && <ViewReasonModal tx={viewingReason} onClose={() => setViewingReason(null)} />}
    </div>
  );
}
