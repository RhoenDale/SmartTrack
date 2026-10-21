import { useCallback, useEffect, useState } from "react";
import { Check, Clock3, PackageCheck, PackageX, RefreshCw, RotateCcw } from "lucide-react";
import { returnRequestsApi, type ReturnRequest } from "./api";
import type { AuthUser } from "./data";
import { fmt } from "./shared";

export default function ReturnsPage({
  user,
  onDispositionComplete,
}: {
  user: AuthUser;
  onDispositionComplete: () => Promise<void>;
}) {
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processingReturnId, setProcessingReturnId] = useState<string | null>(null);
  const canProcess = user.role === "inventory_manager";

  const loadReturns = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setReturns(await returnRequestsApi.list());
    } catch (loadError) {
      console.error("Returns list load failed:", loadError);
      setError(loadError instanceof Error ? loadError.message : "Unable to load returns.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReturns();
  }, [loadReturns]);

  const processReturn = async (request: ReturnRequest, disposition: "restocked" | "broken") => {
    setProcessingReturnId(request.returnTxId);
    setError("");
    try {
      await returnRequestsApi.setDisposition(request.returnTxId, disposition);
      await loadReturns();
      await onDispositionComplete();
    } catch (processError) {
      console.error("Return disposition failed:", processError);
      setError(processError instanceof Error ? processError.message : "Unable to process this return.");
    } finally {
      setProcessingReturnId(null);
    }
  };

  const statusStyle: Record<ReturnRequest["disposition"], string> = {
    pending: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    restocked: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
    broken: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Returns</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {canProcess
              ? "Inspect returned products and decide whether to restock or mark them broken."
              : "View return requests and their inventory inspection status."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadReturns()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </header>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <button type="button" onClick={() => void loadReturns()} className="shrink-0 font-semibold underline">Retry</button>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-foreground">Return Requests</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {returns.filter(request => request.disposition === "pending").length} awaiting inspection · {returns.length} total
            </p>
          </div>
          <RotateCcw size={18} className="text-muted-foreground" />
        </div>

        {loading && returns.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading returns…</p>
        ) : returns.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Check size={24} className="mx-auto mb-2 text-emerald-600" />
            <p className="text-sm font-medium text-foreground">No return requests yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Returns submitted by cashiers will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {returns.map(request => (
              <article key={request.returnTxId} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{request.product} · {request.qty} unit{request.qty === 1 ? "" : "s"}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusStyle[request.disposition]}`}>
                      {request.disposition}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Return {request.returnTxId} · Sale {request.saleTxId} · Cashier {request.cashier} · Refund {fmt(request.refund)}
                  </p>
                  <p className="text-xs text-muted-foreground">Submitted {request.createdAt} · Reason: {request.reason}</p>
                  {request.processedAt && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock3 size={12} /> Processed {request.processedAt}
                    </p>
                  )}
                </div>
                {canProcess && request.disposition === "pending" && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={processingReturnId !== null}
                      onClick={() => void processReturn(request, "restocked")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <PackageCheck size={14} /> Restock
                    </button>
                    <button
                      type="button"
                      disabled={processingReturnId !== null}
                      onClick={() => void processReturn(request, "broken")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      <PackageX size={14} /> Mark Broken
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
