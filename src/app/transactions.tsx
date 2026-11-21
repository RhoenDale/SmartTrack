import { memo, useState, useMemo, useEffect, useRef } from "react";
import { ShoppingCart, FileText, Printer } from "lucide-react";
import { groupCartTransactions, hasUserRole, type AuthUser, type Product, type Transaction } from "./data";
import { fmt, TxTypeBadge, TxBadge, ViewReasonModal, ConfirmDialog, TablePager, SegmentedTabs, AnimatedMetricText, InfoTip } from "./shared";

const TRANSACTIONS_PAGE_SIZE = 40;

const TransactionsPage = memo(function TransactionsPage({
  user,
  transactions,
  inventory,
  selectedTransactionId,
  onAddSale,
  onAddReturn,
  onViewInvoice,
  showToast,
}: {
  user: AuthUser;
  transactions: Transaction[];
  inventory: Product[];
  selectedTransactionId: string | null;
  onAddSale: () => void;
  onAddReturn: (tx: Transaction) => void;
  onViewInvoice: (tx: Transaction) => void;
  showToast?: (msg: string, type?: "success" | "error" | "info") => void;
}) {
  const todayISO = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const [typeFilter, setTypeFilter] = useState<"all" | "sale" | "return" | "adjustment">("all");
  const [dateFrom, setDateFrom] = useState(todayISO);
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [viewingReason, setViewingReason] = useState<Transaction | null>(null);
  const [confirmExportCsv, setConfirmExportCsv] = useState(false);
  const [highlightedTransactionId, setHighlightedTransactionId] = useState<string | null>(null);
  const transactionRows = useRef(new Map<string, HTMLTableRowElement>());
  const lastScrolledTxRef = useRef<string | null>(null);

  const parseTransactionDate = (date: string) => {
    const [rawDate] = date.split(" ");
    const [mm, dd, yyyy] = rawDate.split("/");
    return new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T00:00:00`);
  };

  const filtered = useMemo(() => {
    const fromDate = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const toDate = dateTo ? new Date(`${dateTo}T23:59:59`) : null;
    const matchingTransactions = transactions.filter(tx => {
      if (typeFilter !== "all" && tx.type !== typeFilter) return false;
      if (fromDate || toDate) {
        const txDate = parseTransactionDate(tx.date);
        if (fromDate && txDate < fromDate) return false;
        if (toDate && txDate > toDate) return false;
      }
      return true;
    });
    return groupCartTransactions(matchingTransactions);
  }, [typeFilter, transactions, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / TRANSACTIONS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * TRANSACTIONS_PAGE_SIZE, safePage * TRANSACTIONS_PAGE_SIZE),
    [filtered, safePage]
  );

  useEffect(() => {
    if (!selectedTransactionId) {
      lastScrolledTxRef.current = null;
      return;
    }
    setTypeFilter("all");
    setDateFrom("");
    setDateTo("");
    lastScrolledTxRef.current = null;
  }, [selectedTransactionId]);

  useEffect(() => {
    if (!selectedTransactionId || lastScrolledTxRef.current === selectedTransactionId) return;
    const idx = filtered.findIndex(
      tx => tx.id === selectedTransactionId || tx.cartItems?.some(i => i.id === selectedTransactionId)
    );
    if (idx >= 0) {
      const targetPage = Math.floor(idx / TRANSACTIONS_PAGE_SIZE) + 1;
      if (targetPage !== safePage) {
        setPage(targetPage);
        return;
      }
    }
    const targetTx = idx >= 0 ? filtered[idx] : undefined;
    const row =
      transactionRows.current.get(selectedTransactionId) ??
      (targetTx ? transactionRows.current.get(targetTx.id) : undefined);
    if (!row) return;
    lastScrolledTxRef.current = selectedTransactionId;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedTransactionId(targetTx?.id ?? selectedTransactionId);
  }, [selectedTransactionId, filtered, paginated, safePage]);

  useEffect(() => {
    if (!highlightedTransactionId) return;
    const timeout = window.setTimeout(() => setHighlightedTransactionId(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [highlightedTransactionId]);

  const { salesToday, allSales, allReturns, salesTodayAmt, allSalesAmt, allReturnsAmt } = useMemo(() => {
    const today = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }); // "MM/DD/YYYY"
    const groupedSales = groupCartTransactions(transactions.filter(t => t.type === "sale"));
    const todaySales = groupedSales.filter(t => t.date.startsWith(today));
    const returnsList = transactions.filter(t => t.type === "return");
    return {
      salesToday: todaySales,
      allSales: groupedSales,
      allReturns: returnsList,
      salesTodayAmt: todaySales.reduce((s, t) => s + t.amount, 0),
      allSalesAmt: groupedSales.reduce((s, t) => s + t.amount, 0),
      allReturnsAmt: returnsList.reduce((s, t) => s + t.amount, 0),
    };
  }, [transactions]);
  const isAdmin = hasUserRole(user, "admin") || hasUserRole(user, "admin/owner");
  const isCashier = hasUserRole(user, "cashier");
  const canModify = isCashier;
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
    showToast?.("Transactions exported to CSV", "success");
  };

  return (
    <div className="st-page-shell flex flex-col w-full overflow-hidden" style={{ height: "calc(100dvh - 56px)" }}>
      {/* ── Fixed header: title + stats ── */}
      <div className="st-page-header flex-shrink-0 st-shell-px pt-4 sm:pt-6 pb-4 bg-background border-b border-border/50 z-20">
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">Transactions</h1>
              <InfoTip
                title="Transactions & Stock Impact"
                lines={[
                  "Audit trail of POS checkouts, customer returns, and stock adjustments.",
                  { label: "Sale", value: "Deducts sold units immediately from active FIFO inventory batches" },
                  { label: "Return", value: "Logs customer refund; stock restores only after quality inspection in Returns" },
                  { label: "Adjustment", value: "Manual inventory audit count or damaged write-off" },
                ]}
              />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Sales &amp; returns
              {isAdmin && !isCashier && <span className="ml-2 text-amber-600 dark:text-amber-400 font-semibold">· Read-only access</span>}
            </p>
          </div>
          {canModify && (
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <button
                onClick={onAddSale}
                className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90 transition-all shadow-sm shadow-primary/20 st-btn"
              >
                <ShoppingCart size={13} />New Sale
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          {[
            { label: "Sales Today",       val: fmt(salesTodayAmt), sub: `${salesToday.length} transaction${salesToday.length !== 1 ? "s" : ""}`,    color: "text-emerald-600 dark:text-emerald-400" },
            { label: "All Sales",         val: fmt(allSalesAmt),   sub: `${allSales.length} total sale${allSales.length !== 1 ? "s" : ""}`,          color: "text-sky-600 dark:text-sky-400" },
            { label: "Returns / Refunds", val: fmt(allReturnsAmt), sub: `${allReturns.length} return${allReturns.length !== 1 ? "s" : ""}`,           color: "text-orange-600 dark:text-orange-400" },
          ].map(c => (
            <div key={c.label} className="bg-card border border-border rounded-xl p-4 shadow-sm st-card">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</p>
              <p className="text-xl font-bold text-foreground mt-2 tabular-nums tracking-tight">
                <AnimatedMetricText value={c.val} />
              </p>
              <p className={`text-xs mt-1 font-medium ${c.color}`}>{c.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Scrollable table ── */}
      <div className="st-page-fixed-card flex-1 min-h-0 overflow-hidden flex flex-col st-shell-mx my-4 bg-card border border-border rounded-xl shadow-sm">
        {/* Filters bar — fixed inside the card */}
        <div className="flex-shrink-0 flex flex-col gap-3 px-5 py-3.5 border-b border-border sm:flex-row sm:items-center sm:justify-between">
          <SegmentedTabs<"all" | "sale" | "return" | "adjustment">
            tone="primary"
            ariaLabel="Filter transactions by type"
            value={typeFilter}
            onChange={f => { setTypeFilter(f); setPage(1); }}
            className="flex-wrap"
            buttonClassName="font-bold"
            items={[
              { id: "all", label: "All" },
              { id: "sale", label: "Sales" },
              { id: "return", label: "Returns" },
              { id: "adjustment", label: "Adjustments" },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">From</label>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground" />
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">To</label>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground" />
            {(dateFrom !== todayISO || dateTo !== "") && (
              <button type="button" onClick={() => { setDateFrom(todayISO); setDateTo(""); setPage(1); }} className="st-chip-btn">
                Reset
              </button>
            )}
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }} className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2 py-1 transition-colors font-semibold">
                Clear dates
              </button>
            )}
            {isAdmin && (
              <button onClick={() => setConfirmExportCsv(true)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-semibold">
                <FileText size={12} />Export
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0" data-table-scroll="fixed">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-card shadow-sm">
              <tr className="border-b border-border/60 bg-muted/20">
                {["Transaction ID", "Product", "Qty", "Amount", "Staff", "Date", "Type", "Status", "Actions"].map(h => (
                  <th key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-3 text-left px-4 first:px-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map(tx => (
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
                      {isCashier && tx.type === "sale" && (
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
        <div className="flex-shrink-0">
          <TablePager total={filtered.length} page={safePage} pageSize={TRANSACTIONS_PAGE_SIZE} onPage={setPage} />
        </div>
      </div>
      {viewingReason && <ViewReasonModal tx={viewingReason} onClose={() => setViewingReason(null)} />}
      {confirmExportCsv && (
        <ConfirmDialog
          title="Export Transactions CSV?"
          message={`Download ${filtered.length} filtered transaction${filtered.length === 1 ? "" : "s"} as a CSV spreadsheet?`}
          confirmLabel="Export CSV"
          cancelLabel="Cancel"
          variant="info"
          onConfirm={() => { setConfirmExportCsv(false); handleExport(); }}
          onCancel={() => setConfirmExportCsv(false)}
        />
      )}
    </div>
  );
});

export default TransactionsPage;