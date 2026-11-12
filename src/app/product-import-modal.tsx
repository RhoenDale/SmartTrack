import { useState, useRef, useEffect } from "react";
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, X, HelpCircle, ArrowRight, RefreshCw, FileText } from "lucide-react";
import { productsApi } from "./api";

interface ParsedProductRow {
  barcode: string;
  name: string;
  category: string;
  supplier: string;
  price: number;
  sale_price: number;
  reorder: number;
  stock: number;
  expiry: string;
  unit_label: string;
  isValid: boolean;
  validationError?: string;
}

const SAMPLE_CSV_CONTENT = `Barcode,Medicine Name,Category,Supplier,Cost Price,Selling Price,Stock,Reorder Point,Expiry Date,Unit
4800016624018,Paracetamol 500mg Tablet,Analgesic,Unilab,2.50,4.00,150,50,2027-12-31,tablet
4800016624025,Amoxicillin 500mg Capsule,Antibiotic,Unilab,6.00,9.50,100,30,2027-06-30,capsule
4800016624032,Vitamin C + Zinc 500mg,Vitamins,Bayer,4.00,6.50,200,40,2028-01-15,capsule
4800016624049,Mefenamic Acid 500mg Capsule,Pain Relief,United Laboratories,3.80,6.00,120,40,2027-10-31,capsule
4800016624056,Cetirizine 10mg Tablet,Anti-allergy,Pfizer,5.20,8.00,80,25,2027-09-30,tablet`;

export function ProductImportModal({
  isOpen,
  onClose,
  onSuccess,
  showToast,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  showToast?: (msg: string, type?: "info" | "success" | "warning") => void;
}) {
  const [activeTab, setActiveTab] = useState<"upload" | "instructions">("upload");
  const [parsedRows, setParsedRows] = useState<ParsedProductRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [importing, setImporting] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDownloadTemplate = () => {
    const blob = new Blob(["\uFEFF" + SAMPLE_CSV_CONTENT], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `smarttrack_inventory_template.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast?.("Template downloaded. Open in Excel, Google Sheets, or Numbers.", "info");
  };

  const parseDelimitedText = (text: string, sourceName = "pasted_data.csv") => {
    setResultMsg(null);
    const lines = text
      .split(/\r\n|\n|\r/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length < 2) {
      setResultMsg({ text: "Spreadsheet must contain at least a header row and 1 medicine row.", type: "error" });
      return;
    }

    // Detect delimiter: tab (Excel copy-paste) or comma (CSV)
    const delimiter = lines[0].includes("\t") ? "\t" : ",";

    const splitLine = (line: string): string[] => {
      if (delimiter === "\t") return line.split("\t").map(s => s.trim());
      // Regex for CSV supporting quoted values
      const re = /(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*|(?:\n|$))/g;
      const cells: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = re.exec(line)) !== null) {
        let val = match[1] || "";
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1).replace(/""/g, '"');
        }
        cells.push(val.trim());
        if (match.index + match[0].length >= line.length) break;
      }
      return cells;
    };

    const header = splitLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));

    // Find column indexes
    const findIdx = (keywords: string[]) =>
      header.findIndex(h => keywords.some(k => h.includes(k)));

    const barcodeIdx   = findIdx(["barcode", "upc", "sku", "code"]);
    const nameIdx      = findIdx(["name", "medicine", "product", "description", "item"]);
    const categoryIdx  = findIdx(["category", "classification", "type"]);
    const supplierIdx  = findIdx(["supplier", "vendor", "manufacturer"]);
    const priceIdx     = findIdx(["cost", "buy", "purchase", "unitcost", "costprice"]);
    const salePriceIdx = findIdx(["sale", "selling", "retail", "price", "saleprice", "srp"]);
    const stockIdx     = findIdx(["stock", "qty", "quantity", "inventory", "count"]);
    const reorderIdx   = findIdx(["reorder", "rop", "minstock", "reorderpoint", "minimum"]);
    const expiryIdx    = findIdx(["expiry", "expiration", "exp", "expdate"]);
    const unitIdx      = findIdx(["unit", "packaging", "dosageform"]);

    if (nameIdx === -1) {
      setResultMsg({ text: "Could not find a 'Medicine Name' or 'Product' column in the header.", type: "error" });
      return;
    }

    const rows: ParsedProductRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = splitLine(lines[i]);
      if (cols.length === 0 || cols.every(c => c === "")) continue;

      const name = cols[nameIdx] ?? "";
      const barcode = barcodeIdx !== -1 ? cols[barcodeIdx] ?? "" : "";
      const category = categoryIdx !== -1 ? cols[categoryIdx] ?? "General" : "General";
      const supplier = supplierIdx !== -1 ? cols[supplierIdx] ?? "Direct Supplier" : "Direct Supplier";

      const rawPrice = priceIdx !== -1 ? parseFloat(cols[priceIdx].replace(/[^0-9.]/g, "")) : 0;
      const price = isNaN(rawPrice) ? 0 : rawPrice;

      const rawSalePrice = salePriceIdx !== -1 ? parseFloat(cols[salePriceIdx].replace(/[^0-9.]/g, "")) : 0;
      const salePrice = isNaN(rawSalePrice) || rawSalePrice <= 0 ? (price > 0 ? Number((price * 1.25).toFixed(2)) : 0) : rawSalePrice;

      const rawStock = stockIdx !== -1 ? parseInt(cols[stockIdx].replace(/[^0-9]/g, ""), 10) : 0;
      const stock = isNaN(rawStock) ? 0 : rawStock;

      const rawReorder = reorderIdx !== -1 ? parseInt(cols[reorderIdx].replace(/[^0-9]/g, ""), 10) : 20;
      const reorder = isNaN(rawReorder) ? 20 : rawReorder;

      const expiry = expiryIdx !== -1 ? cols[expiryIdx] ?? "" : "";
      const unit_label = unitIdx !== -1 ? cols[unitIdx] || "unit" : "unit";

      const isValid = name.trim().length > 0;
      const validationError = !isValid ? "Missing medicine name" : undefined;

      rows.push({
        barcode,
        name,
        category: category || "General",
        supplier: supplier || "Direct Supplier",
        price,
        sale_price: salePrice,
        reorder,
        stock,
        expiry,
        unit_label,
        isValid,
        validationError,
      });
    }

    setParsedRows(rows);
    setFileName(sourceName);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const text = evt.target?.result as string;
      if (text) parseDelimitedText(text, file.name);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const text = evt.target?.result as string;
      if (text) parseDelimitedText(text, file.name);
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    const validRows = parsedRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      setResultMsg({ text: "No valid rows to import.", type: "error" });
      return;
    }

    setImporting(true);
    setResultMsg(null);

    try {
      const res = await productsApi.bulkImport(validRows as unknown as Record<string, unknown>[]);
      setResultMsg({
        text: `Success! Imported ${res.created} new medicines and updated ${res.updated} existing records.`,
        type: "success",
      });
      showToast?.(`Imported ${res.total} products successfully.`, "success");
      onSuccess?.();
      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to import products.";
      setResultMsg({ text: msg, type: "error" });
    } finally {
      setImporting(false);
    }
  };

  const validCount = parsedRows.filter(r => r.isValid).length;
  const invalidCount = parsedRows.length - validCount;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-border/70">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500 shadow-2xs">
                <FileSpreadsheet size={16} />
              </span>
              <h3 className="text-base font-bold text-foreground">Bulk Product &amp; Inventory Import</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Easily import 100+ medicines, prices, and initial stocks from Excel or CSV spreadsheets.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 pt-3 pb-2 border-b border-border/40">
          <button
            type="button"
            onClick={() => setActiveTab("upload")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === "upload"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            <Upload size={13} />
            <span>Upload &amp; Preview</span>
            {parsedRows.length > 0 && (
              <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] font-bold">
                {parsedRows.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("instructions")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === "instructions"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            <HelpCircle size={13} />
            <span>Guide &amp; Format Instructions</span>
          </button>

          <div className="ml-auto">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted font-medium text-foreground text-xs transition-colors cursor-pointer"
            >
              <Download size={13} className="text-primary" />
              <span>Download Excel/CSV Template</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {activeTab === "instructions" ? (
            /* ── Instructions Tab ── */
            <div className="space-y-4 text-xs leading-relaxed">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                <h4 className="font-bold text-foreground text-sm flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-primary" />
                  Quick 3-Step Setup for Pharmacy Staff
                </h4>
                <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground text-[11px] pt-1">
                  <li>
                    Click <strong className="text-foreground">Download Excel/CSV Template</strong> above to get the standard pharmacy spreadsheet.
                  </li>
                  <li>
                    Open the file in <strong>Microsoft Excel, Google Sheets, or Numbers</strong>. Fill in your medicine names, selling prices, categories, and initial stocks.
                  </li>
                  <li>
                    Save as <strong>.csv</strong> or simply <strong>copy and paste</strong> the rows directly into SmartTrack.
                  </li>
                </ol>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <h4 className="font-bold text-foreground text-xs uppercase tracking-wider text-muted-foreground">
                  Supported Column Specifications
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="border-b border-border/80 text-muted-foreground">
                        <th className="py-2 pr-3 font-semibold">Column Header</th>
                        <th className="py-2 pr-3 font-semibold">Required?</th>
                        <th className="py-2 pr-3 font-semibold">Example Value</th>
                        <th className="py-2 font-semibold">Notes &amp; Auto-defaults</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 text-foreground">
                      <tr>
                        <td className="py-2 pr-3 font-mono font-semibold text-primary">Medicine Name</td>
                        <td className="py-2 pr-3 text-emerald-600 font-bold">Yes</td>
                        <td className="py-2 pr-3">Paracetamol 500mg Tablet</td>
                        <td className="py-2 text-muted-foreground">Primary medicine identifier.</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-3 font-mono font-semibold">Barcode</td>
                        <td className="py-2 pr-3 text-muted-foreground">Optional</td>
                        <td className="py-2 pr-3">4800016624018</td>
                        <td className="py-2 text-muted-foreground">If left empty, SmartTrack generates a unique barcode automatically.</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-3 font-mono font-semibold">Category</td>
                        <td className="py-2 pr-3 text-muted-foreground">Optional</td>
                        <td className="py-2 pr-3">Analgesic</td>
                        <td className="py-2 text-muted-foreground">Defaults to &quot;General&quot; if blank. Creates category automatically if new.</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-3 font-mono font-semibold">Selling Price</td>
                        <td className="py-2 pr-3 text-muted-foreground">Recommended</td>
                        <td className="py-2 pr-3">4.50</td>
                        <td className="py-2 text-muted-foreground">Price charged at POS cashier checkout.</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-3 font-mono font-semibold">Cost Price</td>
                        <td className="py-2 pr-3 text-muted-foreground">Optional</td>
                        <td className="py-2 pr-3">2.80</td>
                        <td className="py-2 text-muted-foreground">Supplier purchase cost per unit. Used for profit calculations.</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-3 font-mono font-semibold">Stock</td>
                        <td className="py-2 pr-3 text-muted-foreground">Optional</td>
                        <td className="py-2 pr-3">100</td>
                        <td className="py-2 text-muted-foreground">Initial batch quantity. Creates a live inventory batch ready for selling.</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-3 font-mono font-semibold">Expiry Date</td>
                        <td className="py-2 pr-3 text-muted-foreground">Optional</td>
                        <td className="py-2 pr-3">2027-12-31</td>
                        <td className="py-2 text-muted-foreground">Defaults to +1 year from today if omitted.</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-3 font-mono font-semibold">Reorder Point</td>
                        <td className="py-2 pr-3 text-muted-foreground">Optional</td>
                        <td className="py-2 pr-3">50</td>
                        <td className="py-2 text-muted-foreground">Trigger for restocking warnings. Defaults to 20 units.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-1">
                <p className="font-semibold text-foreground text-xs">What happens to existing products?</p>
                <p className="text-[11px] text-muted-foreground">
                  If a medicine in your Excel file has the same barcode or name as an existing product in SmartTrack, the system safely updates its pricing and adds the new quantity as an inventory batch without wiping previous sales or transaction histories.
                </p>
              </div>
            </div>
          ) : (
            /* ── Upload & Preview Tab ── */
            <div className="space-y-4">
              {/* Dropzone */}
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
                  isDragging
                    ? "border-primary bg-primary/10 scale-[0.99]"
                    : "border-border/80 hover:border-primary/50 hover:bg-muted/30"
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv,.txt"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
                  <Upload size={22} />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  {fileName ? (
                    <span className="text-primary font-bold">{fileName}</span>
                  ) : (
                    "Click to browse or drag & drop CSV file here"
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Supports .csv or tab-delimited exports from Microsoft Excel and Google Sheets
                </p>
              </div>

              {/* Paste from Clipboard Toggle */}
              <div className="flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={() => setShowPasteArea(v => !v)}
                  className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <FileText size={13} />
                  <span>{showPasteArea ? "Hide direct paste box" : "Or copy & paste directly from Excel / Sheets"}</span>
                </button>
              </div>

              {showPasteArea && (
                <div className="space-y-2 p-3 rounded-xl border border-border bg-muted/20">
                  <p className="text-[11px] text-muted-foreground">
                    Copy your rows in Excel (including header), then paste below:
                  </p>
                  <textarea
                    rows={4}
                    value={pastedText}
                    onChange={e => setPastedText(e.target.value)}
                    placeholder="Barcode&#9;Medicine Name&#9;Category&#9;Price&#9;Stock&#10;480001&#9;Amoxicillin&#9;Antibiotic&#9;9.50&#9;100"
                    className="w-full text-xs font-mono p-2.5 rounded-lg border border-border bg-background focus:outline-hidden focus:ring-1 focus:ring-primary"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => parseDelimitedText(pastedText, "pasted_clipboard_data.csv")}
                      disabled={!pastedText.trim()}
                      className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 cursor-pointer"
                    >
                      Parse Pasted Text
                    </button>
                  </div>
                </div>
              )}

              {/* Result / Error Banner */}
              {resultMsg && (
                <div
                  className={`flex items-start gap-2.5 p-3 rounded-xl text-xs ${
                    resultMsg.type === "success"
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                      : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                  }`}
                >
                  {resultMsg.type === "success" ? <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />}
                  <span>{resultMsg.text}</span>
                </div>
              )}

              {/* Live Preview Table */}
              {parsedRows.length > 0 && (
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground">Preview Parsed Items</span>
                      <span className="rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-bold">
                        {validCount} ready
                      </span>
                      {invalidCount > 0 && (
                        <span className="rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 px-2 py-0.5 text-[10px] font-bold">
                          {invalidCount} invalid
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">Showing first 10 items</span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-border/80 bg-background max-h-56">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="bg-muted/40 sticky top-0 border-b border-border text-muted-foreground">
                        <tr>
                          <th className="py-2 px-3 font-semibold">Status</th>
                          <th className="py-2 px-3 font-semibold">Medicine Name</th>
                          <th className="py-2 px-3 font-semibold">Category</th>
                          <th className="py-2 px-3 font-semibold">Barcode</th>
                          <th className="py-2 px-3 font-semibold text-right">Cost</th>
                          <th className="py-2 px-3 font-semibold text-right">Selling Price</th>
                          <th className="py-2 px-3 font-semibold text-right">Initial Stock</th>
                          <th className="py-2 px-3 font-semibold">Expiry</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40 text-foreground">
                        {parsedRows.slice(0, 10).map((row, idx) => (
                          <tr key={idx} className={row.isValid ? "hover:bg-muted/20" : "bg-rose-500/5 text-rose-600"}>
                            <td className="py-2 px-3">
                              {row.isValid ? (
                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-bold">
                                  <CheckCircle2 size={12} /> Ready
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] text-rose-500 font-bold" title={row.validationError}>
                                  <AlertTriangle size={12} /> {row.validationError}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-medium max-w-[160px] truncate">{row.name}</td>
                            <td className="py-2 px-3 text-muted-foreground">{row.category}</td>
                            <td className="py-2 px-3 font-mono text-[10px] text-muted-foreground">
                              {row.barcode || <span className="italic text-muted-foreground/60">Auto-generated</span>}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-muted-foreground">₱{row.price.toFixed(2)}</td>
                            <td className="py-2 px-3 text-right font-mono font-semibold">₱{row.sale_price.toFixed(2)}</td>
                            <td className="py-2 px-3 text-right font-bold">{row.stock}</td>
                            <td className="py-2 px-3 text-[10px] text-muted-foreground">{row.expiry || "1 year"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-border/70 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            {activeTab === "instructions"
              ? "Read format requirements before importing."
              : parsedRows.length > 0
              ? `${validCount} of ${parsedRows.length} items ready to import into inventory.`
              : "Select a file or download the template to begin."}
          </p>

          <div className="flex items-center gap-2">
            {activeTab === "instructions" ? (
              <button
                type="button"
                onClick={() => setActiveTab("upload")}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs shadow-xs hover:opacity-90 transition-opacity cursor-pointer"
              >
                <span>Continue to Upload</span>
                <ArrowRight size={13} />
              </button>
            ) : validCount > 0 ? (
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={importing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs transition-colors disabled:opacity-40 cursor-pointer"
              >
                {importing ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />}
                <span>{importing ? "Importing to Inventory…" : `Confirm & Import (${validCount})`}</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

