import React, { memo, useState, useEffect, useMemo, useRef, useId } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Search,
  ArrowLeft,
  ChevronRight,
  TrendingUp,
  DollarSign,
  Calculator,
  Package,
  CornerDownLeft,
  CornerDownRight,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  ShieldAlert,
} from "lucide-react";
import { getReorderUnits, groupCartTransactions, hasUserRole, type Product, type Transaction, type AuthUser, type Page } from "./data";
import { analyticsApi } from "./api";
import { fmt } from "./shared";

interface CommandAssistantProps {
  user: AuthUser;
  inventory: Product[];
  transactions: Transaction[];
  onNavigate: (page: Page) => void;
  allowedPages: Page[];
  onOpenNewSale: () => void;
  onOpenAddProduct: () => void;
  onSelectProduct?: (product: Product) => void;
  enabled?: boolean;
  mode: "sidebar" | "trackhub";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOpen?: () => void;
  sidebarExpanded?: boolean;
}

type SuggestionChip = {
  label: string;
  cmd?: string;
  prefill?: string;
  action?: () => void;
};

type Message = {
  id: string;
  sender: "user" | "bot";
  text: string;
  type?: "info" | "success" | "warning" | "error" | "action";
  actionLabel?: string;
  onAction?: () => void;
  details?: { label: string; value: string }[];
  suggestions?: SuggestionChip[];
};

const INAPPROPRIATE_WORDS = [
  "gago", "tarantado", "tangina", "putangina", "bobo", "ulol", "pota", "yawa", "peste",
  "atay", "bilat", "buang", "inutil", "fuck", "shit", "bitch", "asshole", "bastard"
];

const MONTHS_MAP: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

const MONTH_LIST = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const GENERIC_STOCK_WORDS = new Set([
  "medicine", "medicines", "stock", "alert", "alerts", "items",
  "item", "product", "products", "tablet", "tablets", "capsule",
  "capsules", "syrup", "botika", "tambal",
]);

const OUT_OF_SCOPE_PATTERN = /\b(dosage|dose|symptom|symptoms|fever|headache|cough|sick|pregnant|side effect|side effects|treat|cure|diagnos\w*|doctor|prescription|poem|essay|weather|joke|recipe|who is|why is)\b/i;

type LookupRow = {
  label: string;
  hint: string;
  liveBadge?: string;
  cmd: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

type SpotlightMatch = {
  id: string;
  label: string;
  meta: string;
  tag: string;
  cmd: string;
  kind: "command" | "product" | "lookup";
};

type BannerSlide = {
  kind: "limit" | "cmd" | "prompt" | "tip";
  text: string;
  cmd?: string;
  prefill?: string;
};

function renderFormattedText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function parseTransactionDate(value: string): Date | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const [, month, day, year, hour = "0", minute = "0"] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day)
  ) return null;
  return parsed;
}

export function SmartBotMascot({ className = "", floating = true }: { className?: string; floating?: boolean }) {
  const gradientId = useId().replace(/:/g, "");
  const shellGradient = `${gradientId}-shell`;
  const sideGradient = `${gradientId}-side`;
  const faceGradient = `${gradientId}-face`;
  const bodyGradient = `${gradientId}-body`;
  const glintGradient = `${gradientId}-glint`;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 80 80"
      fill="none"
      className={`overflow-visible ${className}`}
    >
      <defs>
        <linearGradient id={shellGradient} x1="20" y1="15" x2="61" y2="59" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--card)" />
          <stop offset=".42" stopColor="color-mix(in srgb, var(--primary) 24%, var(--card))" />
          <stop offset="1" stopColor="var(--primary)" />
        </linearGradient>
        <linearGradient id={sideGradient} x1="16" y1="28" x2="63" y2="47" gradientUnits="userSpaceOnUse">
          <stop stopColor="color-mix(in srgb, var(--primary) 72%, var(--foreground))" />
          <stop offset=".5" stopColor="color-mix(in srgb, var(--primary) 56%, var(--foreground))" />
          <stop offset="1" stopColor="var(--foreground)" />
        </linearGradient>
        <linearGradient id={faceGradient} x1="25" y1="26" x2="53" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="color-mix(in srgb, var(--foreground) 82%, var(--primary))" />
          <stop offset="1" stopColor="var(--foreground)" />
        </linearGradient>
        <linearGradient id={bodyGradient} x1="27" y1="52" x2="52" y2="72" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--card)" />
          <stop offset=".55" stopColor="color-mix(in srgb, var(--primary) 26%, var(--card))" />
          <stop offset="1" stopColor="color-mix(in srgb, var(--primary) 64%, var(--card))" />
        </linearGradient>
        <radialGradient id={glintGradient} cx="0" cy="0" r="1" gradientTransform="matrix(20 0 0 13 30 19)" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity=".78" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="40" cy="70" rx="17" ry="3.5" fill="var(--foreground)" opacity=".14" />
      <g className={floating ? "smartbot-mascot-float" : undefined}>
      <path d="M40 8v7" stroke="var(--muted-foreground)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="40" cy="7" r="4" fill="var(--primary)" />
      <circle cx="40" cy="7" r="2" fill="var(--primary-foreground)" />
      <path d="M17 33a7 7 0 0 1 7-7h32a7 7 0 0 1 7 7v13a7 7 0 0 1-7 7H24a7 7 0 0 1-7-7V33Z" fill={`url(#${sideGradient})`} />
      <path d="M13 35a5 5 0 0 1 4-5v19a5 5 0 0 1-4-5V35Zm50-5a5 5 0 0 1 4 5v9a5 5 0 0 1-4 5V30Z" fill="var(--muted-foreground)" />
      <rect x="20" y="21" width="40" height="34" rx="13" fill={`url(#${shellGradient})`} />
      <path d="M22 32c0-6.075 4.925-11 11-11h14c7.18 0 13 5.82 13 13v8c0 7.18-5.82 13-13 13H33c-6.075 0-11-4.925-11-11V32Z" fill={`url(#${glintGradient})`} />
      <rect x="25" y="29" width="30" height="20" rx="8" fill={`url(#${faceGradient})`} />
      <ellipse cx="33" cy="37" rx="3" ry="3.5" fill="var(--primary)" />
      <ellipse cx="47" cy="37" rx="3" ry="3.5" fill="var(--primary)" />
      <circle cx="32" cy="36" r="1" fill="white" />
      <circle cx="46" cy="36" r="1" fill="white" />
      <path d="M35 44h10" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" />
      <path d="M29 54h22l7 14H23l6-14Z" fill={`url(#${bodyGradient})`} />
      <path d="M32 55h16l3 5H29l3-5Z" fill="white" fillOpacity=".42" />
      <rect x="36" y="57" width="9" height="9" rx="2.5" fill="var(--card)" stroke="var(--primary)" strokeWidth="1" />
      <path d="M40.5 59v5m-2.5-2.5h5" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="56" cy="59" r="2" fill="var(--primary)" />
      </g>
    </svg>
  );
}

const CommandAssistant = memo(function CommandAssistant({
  user,
  inventory,
  transactions,
  onNavigate,
  allowedPages,
  onOpenNewSale,
  onOpenAddProduct,
  enabled = true,
  mode,
  open,
  onOpenChange,
  onOpen,
  sidebarExpanded = true,
}: CommandAssistantProps) {
  const [localOpen, setLocalOpen] = useState(false);
  const isOpen = open ?? localOpen;
  const setIsOpen = (next: boolean | ((current: boolean) => boolean)) => {
    const nextOpen = typeof next === "function" ? next(isOpen) : next;
    if (open === undefined) setLocalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  const isTrackHubMode = mode === "trackhub";
  const [query, setQuery] = useState("");

  const [messages, setMessages] = useState<Message[]>([]);
  const [showGuide, setShowGuide] = useState(true);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [promptIndex, setPromptIndex] = useState(0);
  const [promptFading, setPromptFading] = useState(false);
  const [isPromptPaused, setIsPromptPaused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const firstName = user.name.split(" ")[0] || "there";
  const canSell = hasUserRole(user, "cashier");
  const canManageInventory = hasUserRole(user, "inventory_manager");

  const { sampleProduct, sampleProductName, secondProductName } = useMemo(() => {
    const stocked = inventory.filter(p => p.stock > 0);
    const pool = stocked.length > 0 ? stocked : inventory;
    const formatShort = (product?: Product, fallback = "Amoxicillin") => {
      if (!product) return fallback;
      const short = product.name.split(/\s+/).slice(0, 2).join(" ");
      return short || product.name;
    };
    const first = pool[0];
    const second = pool.find(p => p.id !== first?.id) ?? pool[0];
    return {
      sampleProduct: first,
      sampleProductName: formatShort(first, "Amoxicillin"),
      secondProductName: formatShort(second, "Cetirizine"),
    };
  }, [inventory]);

  const navCommands = useMemo(() => {
    const items: { label: string; tag: string; cmd: string; keys: string[]; page?: Page; show: boolean }[] = [
      { label: "New Sale", tag: "POS", cmd: "new sale", keys: ["sell", "pos", "cashier", "sale", "baligya"], show: canSell },
      { label: "Add Product", tag: "Action", cmd: "add product", keys: ["add product", "create item", "dugang"], show: canManageInventory },
      { label: "Open Analytics", tag: "Module", cmd: "open analytics", keys: ["analytics", "charts", "sma", "eoq"], page: "analytics", show: allowedPages.includes("analytics") },
      { label: "Open Inventory", tag: "Module", cmd: "open inventory", keys: ["inventory", "medicines", "items"], page: "inventory", show: allowedPages.includes("inventory") },
      { label: "Low Stock Alerts", tag: "Alerts", cmd: "show low stock items", keys: ["low stock", "critical", "shortage", "alerts"], show: true },
      { label: "Reports", tag: "Module", cmd: "open reports", keys: ["reports", "export", "summary"], page: "reports", show: allowedPages.includes("reports") },
      { label: "Transactions", tag: "Module", cmd: "open transactions", keys: ["transactions", "orders", "receipts"], page: "transactions", show: allowedPages.includes("transactions") },
      { label: "Purchase Orders", tag: "Module", cmd: "open purchase orders", keys: ["purchases", "orders", "supplier"], page: "purchases", show: allowedPages.includes("purchases") },
      { label: "Returns & Loss", tag: "Module", cmd: "open returns", keys: ["returns", "damaged", "refund"], page: "returns", show: allowedPages.includes("returns") },
      { label: "Financial Audit", tag: "Module", cmd: "open financial audit", keys: ["financial", "profit", "margin", "audit"], page: "financial", show: allowedPages.includes("financial") },
      { label: "Activity Log", tag: "Module", cmd: "open activity log", keys: ["activity", "audit trail", "logs"], page: "activity-log", show: allowedPages.includes("activity-log") },
      { label: "Recycle Bin", tag: "Module", cmd: "open recycle bin", keys: ["recycle", "trash", "deleted"], page: "recycle-bin", show: allowedPages.includes("recycle-bin") },
      { label: "Users & Roles", tag: "Module", cmd: "open users", keys: ["users", "staff", "roles"], page: "users", show: allowedPages.includes("users") },
      { label: "Dashboard", tag: "Module", cmd: "open dashboard", keys: ["dashboard", "home"], page: "dashboard", show: allowedPages.includes("dashboard") },
    ];
    return items.filter(i => i.show);
  }, [allowedPages, canSell, canManageInventory]);

  const resultCards = useMemo(() => {
    const pairs: { id: string; queryText: string; result: Message }[] = [];
    let pendingQuery = "";
    for (const msg of messages) {
      if (msg.sender === "user") {
        pendingQuery = msg.text;
      } else {
        pairs.push({ id: msg.id, queryText: pendingQuery, result: msg });
      }
    }
    return pairs;
  }, [messages]);

  const bannerSlides: BannerSlide[] = useMemo(
    () => [
      {
        kind: "limit",
        text: "Commands & live records only — no medical advice or open AI chat",
      },
      {
        kind: "cmd",
        text: `Commands: "new sale", "open analytics", "open inventory", "open reports"`,
        cmd: allowedPages.includes("analytics") ? "open analytics" : "open inventory",
      },
      {
        kind: "prompt",
        text: `Lookup: How much will I earn if I sold 50 ${sampleProductName}?`,
        cmd: `how much will i earn if i sold 50 ${sampleProductName}`,
      },
      {
        kind: "prompt",
        text: `Lookup: Stock left for ${secondProductName} · Sales October`,
        cmd: `stock ${secondProductName}`,
      },
      {
        kind: "tip",
        text: `Signed in as ${firstName} · English, Bisaya & Tagalog supported`,
        prefill: "sales ",
      },
    ],
    [sampleProductName, secondProductName, allowedPages, firstName]
  );

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [query]);

  useEffect(() => {
    if (!isOpen || !showGuide || query.trim().length > 0 || isPromptPaused) return;
    let swapTimer: number | undefined;
    const interval = window.setInterval(() => {
      setPromptFading(true);
      swapTimer = window.setTimeout(() => {
        setPromptIndex(prev => (prev + 1) % bannerSlides.length);
        setPromptFading(false);
      }, 150);
    }, 3600);
    return () => {
      window.clearInterval(interval);
      if (swapTimer) window.clearTimeout(swapTimer);
    };
  }, [isOpen, showGuide, query, isPromptPaused, bannerSlides.length]);

  const predictiveState = useMemo(() => {
    const raw = query.trim();
    if (!raw) {
      return { outOfScope: false, showNoMatchHint: false, suggestions: [] as SuggestionChip[] };
    }
    const qLower = raw.toLowerCase();

    if (
      OUT_OF_SCOPE_PATTERN.test(qLower) &&
      !/\b(stock|price|how many|nabilin|presyo|sold|sell|sales|forecast)\b/i.test(qLower)
    ) {
      return {
        outOfScope: true,
        showNoMatchHint: false,
        suggestions: [
          { label: `stock ${sampleProductName}`, cmd: `stock ${sampleProductName}` },
          { label: "low stock alerts", cmd: "show low stock items" },
          { label: "See commands", action: () => setShowGuide(true) },
        ],
      };
    }

    const suggestions: SuggestionChip[] = [];
    const seen = new Set<string>();
    const pushChip = (chip: SuggestionChip) => {
      const key = chip.cmd ?? chip.prefill ?? chip.label;
      if (seen.has(key) || suggestions.length >= 4) return;
      seen.add(key);
      suggestions.push(chip);
    };

    const stockedPool = inventory.filter(p => p.stock > 0);
    const productPool = stockedPool.length > 0 ? stockedPool : inventory;
    const matchProducts = (term: string, limit = 3) => {
      const clean = term.trim().toLowerCase();
      if (!clean) return productPool.slice(0, limit);
      return inventory.filter(p => p.name.toLowerCase().includes(clean)).slice(0, limit);
    };

    const sellPrefix = qLower.match(/(?:if i sold|if i sell|sold|sell|earn on|kung mahalin)\s*(\d*)\s*([a-z0-9\s]*)$/i);
    if (sellPrefix) {
      const qty = sellPrefix[1] || "50";
      const medTail = sellPrefix[2] ?? "";
      for (const p of matchProducts(medTail)) {
        pushChip({ label: `if i sold ${qty} ${p.name}`, cmd: `if i sold ${qty} ${p.name}` });
      }
    }

    const stockPrefix = qLower.match(/(?:^|\b)(?:stock|price|how much(?: is| for)?|pila(?: pay)? stock(?: sa)?|presyo(?: sa)?)\s+([a-z0-9\s]*)$/i);
    if (stockPrefix && !sellPrefix) {
      for (const p of matchProducts(stockPrefix[1] ?? "")) {
        pushChip({ label: `stock ${p.name}`, cmd: `stock ${p.name}` });
      }
    }

    const salesPrefix = qLower.match(/(?:sales?|halin|benta|data)\s*(?:from|for|of|in|sa|a month of)?\s*([a-z]*)$/i);
    if (salesPrefix) {
      const tail = (salesPrefix[1] ?? "").toLowerCase();
      if (!tail) {
        const now = new Date();
        const curMonth = MONTH_LIST[now.getMonth()];
        const prevMonth = MONTH_LIST[(now.getMonth() + 11) % 12];
        pushChip({ label: "sales today", cmd: "sales today" });
        pushChip({ label: "sales yesterday", cmd: "sales yesterday" });
        pushChip({ label: `sales ${curMonth}`, cmd: `sales ${curMonth}` });
        pushChip({ label: `sales ${prevMonth}`, cmd: `sales ${prevMonth}` });
      } else {
        for (const m of MONTH_LIST) {
          if (m.toLowerCase().startsWith(tail)) {
            pushChip({ label: `sales ${m}`, cmd: `sales ${m}` });
          }
        }
        if ("today".startsWith(tail)) pushChip({ label: "sales today", cmd: "sales today" });
        if ("yesterday".startsWith(tail)) pushChip({ label: "sales yesterday", cmd: "sales yesterday" });
      }
    } else if (qLower.length >= 3) {
      for (const m of MONTH_LIST) {
        if (m.toLowerCase().startsWith(qLower)) {
          pushChip({ label: `sales ${m}`, cmd: `sales ${m}` });
        }
      }
    }

    const pageCandidates: { page: Page; label: string; keywords: string[] }[] = [
      { page: "analytics", label: "open analytics", keywords: ["open analytics", "analytics", "charts", "forecast"] },
      { page: "inventory", label: "open inventory", keywords: ["open inventory", "inventory", "medicines"] },
      { page: "transactions", label: "open transactions", keywords: ["open transactions", "transactions", "history"] },
      { page: "stock-alerts", label: "open stock alerts", keywords: ["open alerts", "stock alerts", "shortage"] },
      { page: "reports", label: "open reports", keywords: ["open reports", "reports"] },
      { page: "financial", label: "open financial audit", keywords: ["open financial", "financial audit"] },
      { page: "returns", label: "open returns", keywords: ["open returns", "returns", "damaged"] },
    ];

    if (/^(open|go to|ablihi|buksan)/i.test(qLower)) {
      const tail = qLower.replace(/^(open|go to|ablihi|buksan)\s*/, "");
      for (const p of pageCandidates) {
        if (allowedPages.includes(p.page) && (!tail || p.label.includes(tail) || p.keywords.some(k => k.includes(tail)))) {
          pushChip({ label: p.label, cmd: p.label });
        }
      }
      if (canSell && (!tail || "new sale".includes(tail))) pushChip({ label: "new sale", cmd: "new sale" });
      if (canManageInventory && (!tail || "add product".includes(tail))) pushChip({ label: "add product", cmd: "add product" });
    }

    if (suggestions.length < 4 && !sellPrefix && !stockPrefix) {
      for (const p of matchProducts(qLower, 2)) {
        pushChip({ label: `stock ${p.name}`, cmd: `stock ${p.name}` });
        pushChip({ label: `if i sold 50 ${p.name}`, cmd: `if i sold 50 ${p.name}` });
      }
    }

    if (suggestions.length < 4) {
      const generalTemplates: { label: string; cmd: string; keys: string[] }[] = [
        {
          label: `how much will i earn if i sold 50 ${sampleProductName}`,
          cmd: `how much will i earn if i sold 50 ${sampleProductName}`,
          keys: ["how much", "will", "earn", "if", "sold", "sell", "profit", "tubo", "ganansya", "kita"],
        },
        {
          label: "sales today",
          cmd: "sales today",
          keys: ["sales", "today", "halin", "benta", "karon", "revenue", "income", "how much"],
        },
        {
          label: "sales October",
          cmd: "sales October",
          keys: ["sales", "october", "oct", "month", "data", "show"],
        },
        {
          label: "low stock alerts",
          cmd: "show low stock items",
          keys: ["low stock", "alert", "critical", "out of stock", "short", "mahurot", "kulang", "which"],
        },
        {
          label: "forecast next month",
          cmd: "forecast next month",
          keys: ["forecast", "predict", "next month", "demand", "sma", "sunod"],
        },
        {
          label: "what is FIFO / SmartTrack?",
          cmd: "what is fifo",
          keys: ["what is", "purpose", "explain", "fifo", "unsa", "para unsa", "help"],
        },
      ];

      for (const tpl of generalTemplates) {
        if (tpl.keys.some(k => k.includes(qLower) || qLower.includes(k))) {
          pushChip({ label: tpl.label, cmd: tpl.cmd });
        }
      }

      for (const p of pageCandidates) {
        if (allowedPages.includes(p.page) && p.keywords.some(k => k.includes(qLower) || qLower.includes(k))) {
          pushChip({ label: p.label, cmd: p.label });
        }
      }
      if (canSell && ("new sale".includes(qLower) || "sell".includes(qLower) || "baligya".includes(qLower))) {
        pushChip({ label: "new sale", cmd: "new sale" });
      }
      if (canManageInventory && ("add product".includes(qLower) || "dugang".includes(qLower))) {
        pushChip({ label: "add product", cmd: "add product" });
      }
    }

    if (suggestions.length === 0 && qLower.length >= 4) {
      return {
        outOfScope: false,
        showNoMatchHint: true,
        suggestions: [
          { label: "stock …", prefill: "stock " },
          { label: "sales …", prefill: "sales " },
          { label: "if i sold 50 …", prefill: "if i sold 50 " },
          { label: "forecast next month", cmd: "forecast next month" },
        ],
      };
    }

    return { outOfScope: false, showNoMatchHint: false, suggestions };
  }, [query, inventory, allowedPages, canSell, canManageInventory, sampleProductName]);

  const liveSpotlightMatches = useMemo((): SpotlightMatch[] => {
    const raw = query.trim();
    if (!raw) return [];
    const qLower = raw.toLowerCase();
    const out: SpotlightMatch[] = [];
    const seenCmd = new Set<string>();
    const pushItem = (item: SpotlightMatch) => {
      if (seenCmd.has(item.cmd)) return;
      seenCmd.add(item.cmd);
      out.push(item);
    };

    for (const c of navCommands) {
      if (c.label.toLowerCase().includes(qLower) || c.cmd.includes(qLower) || c.keys.some(k => k.includes(qLower) || qLower.includes(k))) {
        pushItem({
          id: `cmd-${c.cmd}`,
          label: c.label,
          meta: c.cmd,
          tag: c.tag,
          cmd: c.cmd,
          kind: "command",
        });
      }
    }

    const medTerm = qLower
      .replace(/^(?:stock|price|how much(?: is| for)?|if i sold\s*\d*|if i sell\s*\d*|pila(?: pay)? stock(?: sa)?)\s*/i, "")
      .trim();
    const sellQtyMatch = qLower.match(/(?:if i sold|if i sell|sell|sold)\s*(\d+)/i);
    if (medTerm.length >= 2) {
      for (const p of inventory) {
        if (p.name.toLowerCase().includes(medTerm)) {
          const reorder = getReorderUnits(p);
          const status = p.stock === 0 ? "Out" : p.stock <= reorder ? "Low" : "In stock";
          pushItem({
            id: `prod-${p.id}`,
            label: sellQtyMatch ? `Simulate: ${sellQtyMatch[1]} × ${p.name}` : p.name,
            meta: `${p.stock} units · ${fmt(p.price)} (${status})`,
            tag: sellQtyMatch ? "What-If" : "Live Stock",
            cmd: sellQtyMatch ? `if i sold ${sellQtyMatch[1]} ${p.name}` : `stock ${p.name}`,
            kind: "product",
          });
          if (out.length >= 6) break;
        }
      }
    }

    if (out.length === 0 && !predictiveState.outOfScope) {
      for (const s of predictiveState.suggestions) {
        if (s.cmd) {
          pushItem({
            id: `pred-${s.cmd}`,
            label: s.label,
            meta: s.cmd,
            tag: "Lookup",
            cmd: s.cmd,
            kind: "lookup",
          });
        }
      }
    }

    return out.slice(0, 6);
  }, [query, navCommands, inventory, predictiveState.suggestions, predictiveState.outOfScope]);

  // Keep Escape available to close the embedded assistant without competing
  // with the app-wide search shortcut.
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, isOpen]);

  // Focus input AFTER TrackHub/Modal expand transition settles so focus layout + caret
  // paint never compete with the opening morph frames.
  useEffect(() => {
    if (!isOpen) return;
    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
    }, isTrackHubMode ? 280 : 180);
    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [isOpen, isTrackHubMode]);

  const addMessage = (msg: Omit<Message, "id">) => {
    setMessages(prev => [...prev, { ...msg, id: Math.random().toString(36).substring(2, 9) }]);
  };

  const checkProfanity = (text: string) => {
    const lower = text.toLowerCase();
    return INAPPROPRIATE_WORDS.some(w => new RegExp(`\\b${w}\\b`, "i").test(lower));
  };

  const findMonthInQuery = (text: string): { index: number; name: string } | null => {
    for (const [mName, mIdx] of Object.entries(MONTHS_MAP)) {
      if (new RegExp(`\\b${mName}\\b`, "i").test(text)) {
        return { index: mIdx, name: mName };
      }
    }
    return null;
  };

  const prefillCommand = (text: string) => {
    setShowGuide(false);
    setQuery(text);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const activateChip = (chip: SuggestionChip) => {
    if (chip.action) chip.action();
    else if (chip.cmd) handleCommand(chip.cmd);
    else if (chip.prefill) prefillCommand(chip.prefill);
  };

  const handleCommand = async (userInput: string) => {
    const raw = userInput.trim();
    if (!raw) return;

    setShowGuide(false);
    setSelectedResultId(null);
    setHighlightedIndex(-1);
    // 1. Add user message
    addMessage({ sender: "user", text: raw });
    setQuery("");
    setLoading(true);

    const q = raw.toLowerCase();

    // Detect user query language (English vs Tagalog vs Bisaya)
    const isTagalog = /\b(ano|paano|bakit|saan|kailan|mga|ng|nang|benta|kahapon|ngayon|buwan|produkto|dagdag|buksan|pumunta)\b/i.test(q);
    const isBisaya = /\b(unsa|unsay|para unsa|nganong|pila|pilay|nabilin|gahapon|karon|bulana|tambal|dugang|hurot|ubos|kulang|halin|adto|ablihi|tan-awon|pakita|baligya|tubo|ganansya|kaya|pwede)\b/i.test(q);
    const lang: "en" | "tl" | "ceb" = isBisaya ? "ceb" : isTagalog ? "tl" : "en";

    if (/^(help|\?|commands?|examples?|what can you do|unsay kaya|unsa imong kaya|ano kaya)/i.test(q)) {
      setLoading(false);
      setShowGuide(true);
      return;
    }

    // 2. Inappropriate filter
    if (checkProfanity(q)) {
      setLoading(false);
      const profanityMsg =
        lang === "ceb"
          ? "Palihug gamita lamang ang SmartTrack Assistant alang sa mga transaksyon ug imbentaryo sa botika."
          : lang === "tl"
          ? "Mangyaring gumamit ng mga angkop na salita para sa imbentaryo at benta ng botika."
          : "Please keep commands professional and related to pharmacy inventory, sales, or navigation.";
      addMessage({
        sender: "bot",
        text: profanityMsg,
        type: "warning",
      });
      return;
    }

    // 2b. Limitation Guard (medical/dosage advice or open-ended non-pharmacy topics)
    if (
      OUT_OF_SCOPE_PATTERN.test(q) &&
      !/\b(stock|price|how many|nabilin|presyo|sold|sell|sales|forecast)\b/i.test(q)
    ) {
      setLoading(false);
      const limitMsg =
        lang === "ceb"
          ? `**Dili suportado:** Ang SmartTrack Assistant para lang sa live stock, halin, forecast, ug module shortcuts. Dili kini mohatag og medical/dosage advice o open-ended AI chat.`
          : lang === "tl"
          ? `**Hindi suportado:** Pang-live stock, benta, forecast, at shortcuts lang ang SmartTrack Assistant. Hindi ito nagbibigay ng medical advice o open-ended AI chat.`
          : `**Not supported:** SmartTrack Assistant only reads live pharmacy stock, sales, forecasts, and page shortcuts — it cannot give medical/dosage advice or answer open-ended AI questions.`;
      addMessage({
        sender: "bot",
        text: limitMsg,
        type: "warning",
        suggestions: [
          { label: `stock ${sampleProductName}`, cmd: `stock ${sampleProductName}` },
          { label: "low stock alerts", cmd: "show low stock items" },
          { label: "See all commands", action: () => setShowGuide(true) },
        ],
      });
      return;
    }

    // 3. System Knowledge Base & Purpose FAQs (English, Bisaya, & Tagalog patterns)
    const isFaqQuery =
      q.includes("purpose") || q.includes("what is") || q.includes("explain") || q.includes("how does") ||
      q.includes("para unsa") || q.includes("unsa ang") || q.includes("unsa man") || q.includes("unsay") ||
      q.includes("ano ang") || q.includes("ano ba") || q.includes("para saan") || q.includes("paano gamitin") ||
      q.includes("nganong") || q.includes("bakit");

    if (isFaqQuery) {
      let topic = "";
      let title = "";
      let desc = "";
      let features: { label: string; value: string }[] = [];
      let pageTarget: Page | "" = "";

      if (q.includes("analytic") || q.includes("forecast") || q.includes("sma") || q.includes("eoq") || q.includes("tagna") || q.includes("hula")) {
        topic = "Analytics & Demand Forecasting";
        pageTarget = "analytics";
        if (lang === "ceb") {
          title = "Katuyoan sa Analytics (Demand Forecasting)";
          desc = "Gigamit ang Analytics para sa data-driven decision support sa pagpalit og stocks ug pagtagna sa umaabot nga demand.";
          features = [
            { label: "SMA-3 & SMA-6", value: "Gitagna ang sunod nga halin gamit ang 3-month ug 6-month sales history." },
            { label: "EOQ (Economic Order Quantity)", value: "Kalkulado ang saktong gidaghanon sa i-reorder aron maminusan ang gasto." },
            { label: "Supply vs. Demand", value: "Ginatan-aw kung igo ba ang kasamtangang stock batok sa gipalit sa mga kustomer." },
            { label: "Product Ranking", value: "Mailhan ang fast-moving ug slow-moving nga mga tambal." },
          ];
        } else if (lang === "tl") {
          title = "Layunin ng Analytics (Demand Forecasting)";
          desc = "Ginagamit ang Analytics para sa data-driven na desisyon sa pagbili ng stocks at paghula ng demand sa susunod na buwan.";
          features = [
            { label: "SMA-3 & SMA-6", value: "Pagtaya ng benta gamit ang nakaraang 3 at 6 na buwan." },
            { label: "EOQ", value: "Tamang dami ng order para makatipid sa gastos." },
            { label: "Supply vs. Demand", value: "Paghahambing ng stock sa aktwal na nabebenta." },
          ];
        } else {
          title = "Purpose of Analytics";
          desc = "The Analytics module provides data-driven decision support for stock procurement and sales prediction.";
          features = [
            { label: "SMA-3 & SMA-6", value: "Forecasts next month demand using 3-month and 6-month moving averages." },
            { label: "EOQ Batch Sizing", value: "Computes optimal reorder quantities to minimize holding and ordering costs." },
            { label: "Supply vs. Demand", value: "Compares shelf stock on hand against outgoing customer purchases." },
            { label: "Revenue Ranking", value: "Ranks fast-moving medications versus slow-moving stock." },
          ];
        }
      } else if (q.includes("stock alert") || q.includes("alert") || q.includes("reorder") || q.includes("hurot") || q.includes("ubos") || q.includes("kaubuson") || q.includes("paubos")) {
        topic = "Stock Alerts & Reordering";
        pageTarget = "stock-alerts";
        if (lang === "ceb") {
          title = "Katuyoan sa Stock Alerts";
          desc = "Real-time nga nagamonitor sa lebel sa tambal aron dili mahurot (stockout prevention).";
          features = [
            { label: "Status Levels", value: "Gibahin sa Critical (0-20%), Low (21-50%), ug Moderate safety levels." },
            { label: "Stock Gap", value: "Gipakita ang kuwang nga gidaghanon tali sa on-hand stock ug safety reorder level." },
            { label: "Direct PO Creation", value: "Makahimo dayon og Purchase Order gikan sa shortage alerts." },
          ];
        } else if (lang === "tl") {
          title = "Layunin ng Stock Alerts";
          desc = "Real-time na nagbabantay sa dami ng gamot upang maiwasan ang maubusan ng stock.";
          features = [
            { label: "Status Levels", value: "Hinahati sa Critical, Low, at Moderate." },
            { label: "Direct PO", value: "Mabilis na makagawa ng Purchase Order kapag kulang na ang stock." },
          ];
        } else {
          title = "Purpose of Stock Alerts";
          desc = "Monitors inventory thresholds in real time to prevent stockouts of essential medication.";
          features = [
            { label: "Status Levels", value: "Categorizes stock into Critical (0-20%), Low (21-50%), and Moderate." },
            { label: "Stock Gap", value: "Identifies the exact shortage between current stock and safety reorder levels." },
            { label: "Direct PO Action", value: "Allows inventory managers to create purchase orders directly from shortage alerts." },
          ];
        }
      } else if (q.includes("return") || q.includes("refund") || q.includes("broken") || q.includes("loss") || q.includes("guba") || q.includes("alkanse") || q.includes("balik")) {
        topic = "Returns & Loss Audit";
        pageTarget = "returns";
        if (lang === "ceb") {
          title = "Katuyoan sa Returns & Loss Audit";
          desc = "Sentralisadong dapit para sa customer returns, physical inspection, ug damaged inventory write-offs.";
          features = [
            { label: "Customer Returns", value: "Susiha kung ma-Restock pa (ibalik sa FIFO shelf) o Discard (naguba/expired)." },
            { label: "Broken / Scrap", value: "Irekord ang mga nabali o nadaot nga tambal nga gikuha sa estante." },
            { label: "Loss Accounting", value: "Gi-compute ang kinatibuk-ang alkanse (refunds + scrap) alang sa financial audit." },
          ];
        } else {
          title = "Purpose of Returns & Loss Audit";
          desc = "Centralizes customer returns, physical condition inspections, and damaged inventory write-offs.";
          features = [
            { label: "Customer Returns", value: "Inspect returned items to either Restock (put back to FIFO shelf) or Discard (mark broken)." },
            { label: "Broken / Scrap Logging", value: "Records damaged, broken, or compromised medicines removed from stock." },
            { label: "Loss Accounting", value: "Tracks financial write-offs and refund deductions for pharmacy compliance." },
          ];
        }
      } else if (q.includes("activity log") || q.includes("recycle bin") || q.includes("audit") || q.includes("basurahan") || q.includes("nabura") || q.includes("deleted")) {
        topic = "Activity Log & Audit Trail";
        pageTarget = "activity-log";
        if (lang === "ceb") {
          title = "Katuyoan sa Activity Log & Recycle Bin";
          desc = "Para sa accountability, transparency, ug seguridad sa tanang lihok sa staff sulod sa system.";
          features = [
            { label: "Activity Log", value: "Gi-record ang oras sa login, pagbag-o sa role, pag-edit sa tambal, ug transactions." },
            { label: "Recycle Bin", value: "Soft-delete security diin pwede pa ma-restore ang aksidenteng natangtang nga data." },
          ];
        } else {
          title = "Purpose of Activity Log & Recycle Bin";
          desc = "Ensures accountability, transparency, and data safety across all staff actions.";
          features = [
            { label: "Activity Log", value: "Timestamps user logins, role changes, product modifications, and deletions." },
            { label: "Recycle Bin", value: "Implements soft-deletion so mistakenly deleted items or accounts can be restored." },
          ];
        }
      } else if (q.includes("financial") || q.includes("profit") || q.includes("revenue") || q.includes("ganansya") || q.includes("halin") || q.includes("kita")) {
        topic = "Financial Audit & Accounting";
        pageTarget = "financial";
        if (lang === "ceb") {
          title = "Katuyoan sa Financial Audit";
          desc = "Gi-compute ang gross margin, customer refunds, alkanse sa naguba, ug limpyong net profit sa botika.";
          features = [
            { label: "Daily & Monthly Charts", value: "Makasubay sa dagan sa kita kada adlaw ug kada buwan." },
            { label: "Net Margin", value: "Total sales minus cost of goods, returns, ug damaged stock write-offs." },
          ];
        } else {
          title = "Purpose of Financial Audit";
          desc = "Calculates pharmacy gross margins, customer refunds, damaged stock losses, and net income.";
          features = [
            { label: "Daily & Monthly Breakdown", value: "Historical audit charts of pharmacy earnings." },
            { label: "Net Profit Calculation", value: "Gross revenue minus COGS, returns, and damaged stock write-offs." },
          ];
        }
      } else if (q.includes("system") || q.includes("smarttrack") || q.includes("app") || q.includes("sistema")) {
        topic = "SmartTrack Pharmacy System";
        pageTarget = "dashboard";
        if (lang === "ceb") {
          title = "Mahitungod sa SmartTrack";
          desc = "Usa ka automated Pharmacy Inventory, POS Sales, ug Demand Forecasting System.";
          features = [
            { label: "FIFO Inventory", value: "First-In-First-Out batch tracking aron mapugngan ang pagka-expired sa tambal." },
            { label: "Decision Support", value: "SMA & EOQ forecasting aron dili magsobra o magkulang ang stocks." },
            { label: "Role-Based Security", value: "Lahi-lahi nga access alang sa Admin, Inventory Manager, ug Cashier." },
          ];
        } else {
          title = "About SmartTrack";
          desc = "SmartTrack is a computerized Pharmacy Inventory, Sales POS, and Demand Forecasting Management System.";
          features = [
            { label: "FIFO Inventory Management", value: "First-In-First-Out batch tracking to mitigate expiration waste." },
            { label: "Forecasting Decision Support", value: "SMA and EOQ modeling to prevent overstocking and understocking." },
            { label: "Role-Based Security", value: "Customized interfaces for Admins, Inventory Managers, and Cashiers." },
          ];
        }
      }

      if (topic) {
        setLoading(false);
        addMessage({
          sender: "bot",
          text: `📘 **${title}**\n${desc}`,
          type: "info",
          details: features,
          actionLabel: lang === "ceb" ? `Ablihi ang ${topic}` : `Open ${topic}`,
          onAction: pageTarget ? () => { onNavigate(pageTarget as Page); setIsOpen(false); } : undefined,
        });
        return;
      }
    }

    // 4. Explicit navigation shortcuts (avoid hijacking live sales/stock data questions)
    const matchedMonth = findMonthInQuery(q);
    const hasTimeWindow =
      matchedMonth !== null ||
      /\b(today|yesterday|karon|gahapon|kahapon|this month|last month|past month|karong bulana|miaging bulan|ngayong buwan|nakaraang buwan)\b/i.test(q);
    const hasDataIntent =
      hasTimeWindow ||
      /\b(how much|pila|pilay|total|summary|data|low stock|critical|out of stock|shortage|mahurot|kulang|forecast|predict|demand)\b/i.test(q);

    const isDirectPageWord =
      !hasDataIntent &&
      /^(dashboard|home|inventory|transactions|stock alerts?|alerts?|analytics|reports?|returns?|financial(?: audit)?|recycle bin|activity logs?|purchase orders?|purchases?|users?(?: & roles)?)$/i.test(q);

    const isNav =
      !hasDataIntent &&
      (isDirectPageWord ||
       q.includes("go to") || q.includes("open") || q.startsWith("navigate") ||
       q.includes("adto sa") || q.includes("ablihi") ||
       q.includes("pumunta sa") || q.includes("buksan"));

    if (isNav) {
      let targetPage: Page | null = null;
      let label = "";

      if (q.includes("dashboard") || q.includes("home")) { targetPage = "dashboard"; label = "Dashboard"; }
      else if (q.includes("inventory") || q.includes("stock") || q.includes("imbentaryo")) { targetPage = "inventory"; label = "Inventory"; }
      else if (q.includes("sale") || q.includes("transaction") || q.includes("halin") || q.includes("benta")) { targetPage = "transactions"; label = "Transactions"; }
      else if (q.includes("alert") || q.includes("pahimangno")) { targetPage = "stock-alerts"; label = "Stock Alerts"; }
      else if (q.includes("analytic") || q.includes("forecast") || q.includes("tagna")) { targetPage = "analytics"; label = "Analytics"; }
      else if (q.includes("report") || q.includes("taho") || q.includes("ulat")) { targetPage = "reports"; label = "Reports"; }
      else if (q.includes("return") || q.includes("balik") || q.includes("guba")) { targetPage = "returns"; label = "Returns"; }
      else if (q.includes("financial") || q.includes("profit") || q.includes("kita")) { targetPage = "financial"; label = "Financial Audit"; }
      else if (q.includes("recycle") || q.includes("trash") || q.includes("bin") || q.includes("basura")) { targetPage = "recycle-bin"; label = "Recycle Bin"; }
      else if (q.includes("log") || q.includes("audit") || q.includes("activity")) { targetPage = "activity-log"; label = "Activity Log"; }
      else if (q.includes("purchase") || q.includes("order") || q.includes("supplier") || q.includes("palit")) { targetPage = "purchases"; label = "Purchase Orders"; }
      else if (q.includes("user") || q.includes("staff") || q.includes("role") || q.includes("empleyado")) { targetPage = "users"; label = "Users & Roles"; }

      if (targetPage) {
        if (!allowedPages.includes(targetPage)) {
          setLoading(false);
          addMessage({
            sender: "bot",
            text: lang === "ceb"
              ? `Dili ka maka-access sa ${label} gamit ang imong kasamtangang role. Pangayo og access sa administrator.`
              : lang === "tl"
              ? `Wala kang access sa ${label} gamit ang kasalukuyan mong role. Makipag-ugnayan sa administrator.`
              : `Your current role doesn’t have access to ${label}. Please ask your administrator for access.`,
            type: "warning",
          });
          return;
        }
        setLoading(false);
        const navMsg =
          lang === "ceb" ? `Gia-ablihan ang ${label} alang kanimo.` :
          lang === "tl" ? `Binubuksan ang ${label} para sa iyo.` :
          `Opening ${label} page for you.`;

        addMessage({
          sender: "bot",
          text: navMsg,
          type: "success",
        });
        onNavigate(targetPage);
        setIsOpen(false);
        return;
      }
    }

    // 5. Quick Action Triggers

    if (q.includes("new sale") || q.includes("add transaction") || q.includes("create sale") || q === "sell" || q.includes("bag-ong halin") || q.includes("baligya") || q.includes("bagong benta")) {
      setLoading(false);
      if (!canSell) {
        addMessage({
          sender: "bot",
          text: lang === "ceb"
            ? "Pasensya, ang Cashier role ra ang makabuhat og bag-ong halin (New Sale)."
            : "Only users with the Cashier active role can create a New Sale.",
          type: "warning",
        });
        return;
      }
      addMessage({
        sender: "bot",
        text: lang === "ceb" ? "Gia-ablihan ang POS Bag-ong Halin terminal..." : "Launching POS New Sale terminal...",
        type: "success",
      });
      onOpenNewSale();
      setIsOpen(false);
      return;
    }

    if (q.includes("add product") || q.includes("create product") || q.includes("new item") || q.includes("dugang tambal") || q.includes("magdagdag ng produkto")) {
      setLoading(false);
      if (!canManageInventory) {
        addMessage({
          sender: "bot",
          text: lang === "ceb"
            ? "Pasensya, ang Inventory Manager role ra ang makadugang og bag-ong produkto."
            : "Only users with the Inventory Manager active role can add products.",
          type: "warning",
        });
        return;
      }
      addMessage({
        sender: "bot",
        text: lang === "ceb" ? "Gia-ablihan ang Dugang Tambal (Add Product) modal..." : "Opening Add Product modal...",
        type: "success",
      });
      onOpenAddProduct();
      setIsOpen(false);
      return;
    }

    // 6. Simulation / What-If Earnings Calculator (e.g. "if i sold 50 paracetamol, how much do i earn?" or "kung mahalin kog 50 ka biogesic...")
    const soldMatch = q.match(/(?:sold|sell|if i sell|if i sold|profit for|earn on|kung mahalin|kung ibaligya|tubo sa|kita sa)\s*(?:og|ng|na)?\s*(\d+)\s*(?:ka|units?|packs?|boxes?)?\s*(?:of\s+)?([a-z0-9\s]+)/i)
      || q.match(/(\d+)\s+([a-z0-9\s]+)\s+(?:profit|earn|sales?|kita|tubo)/i);

    if (soldMatch) {
      const qty = parseInt(soldMatch[1], 10);
      const prodNameQuery = soldMatch[2]
        .replace(/(?:this month|next month|will i earn|would i earn|do i earn|does i earn|how much|profit|earn|revenue|sales?|margin|today|tomorrow|pilay kita|pilay halin|pilay ganansya|,|\?)/gi, "")
        .replace(/\s+/g, " ")
        .trim();

      const matchedProduct =
        inventory.find(p => p.name.toLowerCase().includes(prodNameQuery) || prodNameQuery.includes(p.name.toLowerCase())) ??
        inventory.find(p =>
          p.name
            .toLowerCase()
            .split(/\s+/)
            .some(part => part.length > 3 && !GENERIC_STOCK_WORDS.has(part) && prodNameQuery.includes(part))
        );

      if (matchedProduct && qty > 0) {
        const unitPrice = matchedProduct.price;
        const totalRevenue = unitPrice * qty;
        const activeBatches = matchedProduct.batches.filter(batch => batch.qty > 0);
        const hasCompleteUnitCosts = activeBatches.length > 0 && activeBatches.every(batch =>
          typeof batch.unitCost === "number" && Number.isFinite(batch.unitCost) && batch.unitCost >= 0
        );
        const currentStock = activeBatches.reduce((sum, batch) => sum + batch.qty, 0);
        const currentStockCost = activeBatches.reduce((sum, batch) => sum + batch.qty * (batch.unitCost ?? 0), 0);
        const unitCost = hasCompleteUnitCosts && currentStock > 0 ? currentStockCost / currentStock : null;
        const totalCost = unitCost === null ? null : unitCost * qty;
        const totalProfit = totalCost === null ? null : totalRevenue - totalCost;
        const marginPct = totalProfit === null || totalRevenue <= 0
          ? null
          : ((totalProfit / totalRevenue) * 100).toFixed(1);

        setLoading(false);
        const headTxt =
          lang === "ceb"
            ? `Kwentada sa tubo alang sa **${qty} ka unit${qty > 1 ? "s" : ""}** sa **${matchedProduct.name}**:`
            : `Profit simulation for **${qty} unit${qty > 1 ? "s" : ""}** of **${matchedProduct.name}**:`;

        addMessage({
          sender: "bot",
          text: headTxt,
          type: "info",
          details: [
            { label: lang === "ceb" ? "Presyo/Unit" : "Unit Price", value: fmt(unitPrice) },
            { label: lang === "ceb" ? "Kinatibuk-ang Halin (Revenue)" : "Gross Revenue", value: fmt(totalRevenue) },
            ...(unitCost === null || totalCost === null || totalProfit === null || marginPct === null
              ? [{ label: "Profit estimate", value: "Unavailable — batch cost data is missing." }]
              : [
                  { label: lang === "ceb" ? "Puhonan/Unit" : "Est. Cost/Unit (current batches)", value: fmt(unitCost) },
                  { label: lang === "ceb" ? "Kinatibuk-ang Puhonan (Cost)" : "Estimated Total Cost", value: fmt(totalCost) },
                  { label: lang === "ceb" ? "Gibanabana nga Tubo (Profit)" : "Estimated Profit", value: `${fmt(totalProfit)} (${marginPct}% margin)` },
                ]),
          ],
        });
        return;
      }
    }

    // 7. Sales & Period Data Lookup (handles "sales October", "show data from October", "halin karon", etc.)
    const wantsPeriodSummary =
      hasTimeWindow &&
      !q.includes("forecast") &&
      !q.includes("predict") &&
      !q.includes("next month");

    if (
      wantsPeriodSummary ||
      q.includes("sale") || q.includes("revenue") || q.includes("earn") ||
      q.includes("income") || q.includes("halin") || q.includes("benta") || q.includes("kita")
    ) {
      const salesTransactions = groupCartTransactions(transactions.filter(transaction => transaction.type === "sale"));
      let dateFilter = (_date: Date) => true;
      let timeframeLabel = lang === "ceb" ? "Tanan (All-Time)" : "All-Time";
      const now = new Date();

      if (matchedMonth !== null) {
        const year = matchedMonth.index > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
        const capMonth = matchedMonth.name.charAt(0).toUpperCase() + matchedMonth.name.slice(1);
        timeframeLabel = `${capMonth} ${year}`;
        dateFilter = date => date.getMonth() === matchedMonth.index && date.getFullYear() === year;
      } else if (q.includes("today") || q.includes("karon") || q.includes("ngayong araw")) {
        timeframeLabel = lang === "ceb" ? "Karon (Today)" : "Today";
        dateFilter = date => date.toDateString() === now.toDateString();
      } else if (q.includes("yesterday") || q.includes("gahapon") || q.includes("kahapon")) {
        timeframeLabel = lang === "ceb" ? "Gahapon (Yesterday)" : "Yesterday";
        const yest = new Date(now);
        yest.setDate(yest.getDate() - 1);
        dateFilter = date => date.toDateString() === yest.toDateString();
      } else if (q.includes("this month") || q.includes("karong bulana") || q.includes("ngayong buwan")) {
        timeframeLabel = lang === "ceb" ? "Karong Bulana (This Month)" : "This Month";
        dateFilter = date => date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      } else if (q.includes("last month") || q.includes("past month") || q.includes("miaging bulan") || q.includes("nakaraang buwan")) {
        timeframeLabel = lang === "ceb" ? "Miaging Bulan (Last Month)" : "Last Month";
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        dateFilter = date => date.getMonth() === lastMonth.getMonth() && date.getFullYear() === lastMonth.getFullYear();
      }

      const filteredTx = salesTransactions.filter(transaction => {
        const date = parseTransactionDate(transaction.date);
        return date !== null && dateFilter(date);
      });
      const totalSales = filteredTx.reduce((sum, transaction) => sum + transaction.amount, 0);
      const totalUnits = filteredTx.reduce((sum, transaction) => sum + transaction.qty, 0);
      const totalOrders = filteredTx.length;

      setLoading(false);
      const salesHead =
        lang === "ceb"
          ? `Halin alang sa panahon nga **${timeframeLabel}**:`
          : `Sales performance for **${timeframeLabel}**:`;

      addMessage({
        sender: "bot",
        text: salesHead,
        type: "success",
        details: [
          { label: lang === "ceb" ? "Kinatibuk-ang Halin" : "Total Revenue", value: fmt(totalSales) },
          { label: lang === "ceb" ? "Gidaghanon sa Orders" : "Transactions", value: `${totalOrders} orders` },
          { label: lang === "ceb" ? "Nahalin nga Tambal" : "Units Sold", value: `${totalUnits} items` },
        ],
        actionLabel: lang === "ceb" ? "Tan-awa ang Transactions" : "View All Transactions",
        onAction: () => { onNavigate("transactions"); setIsOpen(false); },
      });
      return;
    }

    // 8. Demand Forecast Query (Bisaya: "pilay mahalin sunod buwan?", English: "how many units sold next month?")
    if (q.includes("forecast") || q.includes("next month") || q.includes("predict") || q.includes("demand") || q.includes("sunod buwan") || q.includes("sunod bulan") || q.includes("susunod na buwan")) {
      try {
        const smaRes = await analyticsApi.sma();
        const sma3 = Math.round(smaRes.sma3 ?? 0);
        const sma6 = Math.round(smaRes.sma6 ?? 0);
        const eoq = smaRes.eoq ?? 0;

        setLoading(false);
        const forecastHead =
          lang === "ceb"
            ? `Base sa rekord sa halin, mao kini ang Demand Forecast sa sunod buwan:`
            : `Based on your sales history, here is the Demand Forecast for next month:`;

        addMessage({
          sender: "bot",
          text: forecastHead,
          type: "info",
          details: [
            { label: lang === "ceb" ? "SMA-3 Forecast (3 ka bulan)" : "SMA-3 Forecast", value: `~${sma3} units (short-term)` },
            { label: lang === "ceb" ? "SMA-6 Forecast (6 ka bulan)" : "SMA-6 Forecast", value: `~${sma6} units (medium-term)` },
            { label: lang === "ceb" ? "Gisugyot nga EOQ Batch" : "Recommended EOQ Batch", value: `${eoq} units` },
          ],
          actionLabel: lang === "ceb" ? "Ablihi ang Demand Forecasting" : "Open Demand Forecasting",
          onAction: () => { onNavigate("analytics"); setIsOpen(false); },
        });
        return;
      } catch (err) {
        setLoading(false);
        addMessage({
          sender: "bot",
          text: `I couldn't load the demand forecast: ${err instanceof Error ? err.message : String(err)}`,
          type: "error",
        });
        return;
      }
    }

    // 9. Stock / Product Inquiry (Bisaya: "pila pay nabilin nga amoxicillin?", English: "stock amoxicillin")
    const matchedProducts = inventory.filter(p =>
      q.includes(p.name.toLowerCase()) ||
      p.name
        .toLowerCase()
        .split(/\s+/)
        .some(part => part.length > 3 && !GENERIC_STOCK_WORDS.has(part) && q.includes(part))
    );

    if (matchedProducts.length > 0) {
      setLoading(false);
      const topProd = matchedProducts[0];
      const reorderUnits = getReorderUnits(topProd);
      const isLowStock = topProd.stock <= reorderUnits;
      const statusColor = topProd.stock === 0 ? "Out of Stock" : isLowStock ? "Low Stock" : "Good Stock";

      const stockHead =
        lang === "ceb"
          ? `Kahimtang sa stock sa **${topProd.name}**:`
          : `Stock status for **${topProd.name}**:`;

      addMessage({
        sender: "bot",
        text: stockHead,
        type: isLowStock ? "warning" : "info",
        details: [
          { label: lang === "ceb" ? "Kasamtangang Stock" : "Current Stock", value: `${topProd.stock} units` },
          { label: "Reorder Threshold", value: `${reorderUnits} units` },
          { label: lang === "ceb" ? "Presyo sa Pagbaligya" : "Selling Price", value: fmt(topProd.price) },
          { label: "Status", value: statusColor },
        ],
        actionLabel: lang === "ceb" ? "Pangitaa sa Inventory" : "Locate in Inventory",
        onAction: () => { onNavigate("inventory"); setIsOpen(false); },
      });
      return;
    }

    // 10. Stock Alerts Summary
    if (q.includes("low stock") || q.includes("critical") || q.includes("out of stock") || q.includes("alert") || q.includes("mahurot") || q.includes("kulang") || q.includes("paubos")) {
      const lowList = inventory.filter(product => product.stock <= getReorderUnits(product));
      setLoading(false);
      const alertHead =
        lang === "ceb"
          ? `Adunay **${lowList.length} ka produkto** nga ubos o hapit na mahurot ang stock.`
          : `There are currently **${lowList.length} products** requiring attention (low or out of stock).`;

      addMessage({
        sender: "bot",
        text: alertHead,
        type: lowList.length > 0 ? "warning" : "success",
        details: lowList.slice(0, 4).map(p => ({
          label: p.name,
          value: `${p.stock} left (reorder at ${getReorderUnits(p)})`,
        })),
        actionLabel: lang === "ceb" ? "Tan-awa ang Stock Alerts" : "View Stock Alerts",
        onAction: () => { onNavigate("stock-alerts"); setIsOpen(false); },
      });
      return;
    }

    // 11. Interactive Apple-style fallback with one-tap example suggestions
    setLoading(false);
    const fallbackMsg =
      lang === "ceb"
        ? `Wala ko kakita og matching command ana — sulayi pag-apil og word pareha sa **stock**, **sales**, **halin**, **forecast**, o ngalan sa tambal. Pwede sab ka mopindot sa ubos:`
        : lang === "tl"
        ? `Hindi ko nahanap ang command na iyon — subukang maglagay ng salitang **stock**, **sales**, **benta**, **forecast**, o pangalan ng gamot. O pindutin sa ibaba:`
        : `I work on direct pharmacy commands — try including **sales**, **stock**, **forecast**, or a medicine name, or tap a quick command below:`;

    addMessage({
      sender: "bot",
      text: fallbackMsg,
      type: "info",
      suggestions: [
        { label: `Stock: ${sampleProductName}`, cmd: `stock ${sampleProductName}` },
        { label: "Sales today", cmd: "sales today" },
        { label: "Sales October", cmd: "sales October" },
        { label: "Low stock items", cmd: "low stock alerts" },
        { label: "See all commands", action: () => setShowGuide(true) },
      ],
    });
  };

  const lookupRows: LookupRow[] = [
    {
      label: `Stock & Price · ${sampleProductName}`,
      hint: "stock [item]",
      liveBadge: sampleProduct ? `${sampleProduct.stock} units · ${fmt(sampleProduct.price)}` : undefined,
      cmd: `stock ${sampleProductName}`,
      icon: Package,
    },
    {
      label: "Sales Summary · October",
      hint: "sales [month]",
      cmd: "sales October",
      icon: DollarSign,
    },
    {
      label: `Profit Simulator · 50 × ${sampleProductName}`,
      hint: "if i sold [qty]",
      cmd: `if i sold 50 ${sampleProductName}`,
      icon: TrendingUp,
    },
    {
      label: "Demand Forecast · Next Month",
      hint: "forecast",
      cmd: "forecast next month",
      icon: Calculator,
    },
  ];

  if (!enabled) return null;

  const renderContent = (isHub: boolean) => {
    const activeBanner = bannerSlides[promptIndex % bannerSlides.length];
    const hasQuery = query.trim().length > 0;
    const activeResultCard =
      (selectedResultId ? resultCards.find(r => r.id === selectedResultId) : undefined) ??
      resultCards[resultCards.length - 1] ??
      null;
    const showingInspector = !hasQuery && !showGuide && activeResultCard !== null;
    const showingCommands = !hasQuery && !showingInspector;

    return (
      <div
        data-st-modal-panel={isHub ? undefined : "true"}
        className={`relative flex flex-col w-full h-full overflow-hidden ${
          isHub ? "bg-[#0a0a0a] text-white" : "rounded-2xl border border-border bg-card text-foreground"
        }`}
      >
        {/* Top Apple Spotlight Command & Search Bar */}
        <form
          onSubmit={e => {
            e.preventDefault();
            if (highlightedIndex >= 0 && liveSpotlightMatches[highlightedIndex]) {
              handleCommand(liveSpotlightMatches[highlightedIndex].cmd);
              return;
            }
            handleCommand(query);
          }}
          className={`flex items-center gap-2.5 px-3.5 py-2.5 shrink-0 border-b ${
            isHub ? "border-white/[0.08] bg-[#0a0a0a]" : "border-border bg-card"
          }`}
        >
          {loading ? (
            <LoaderCircle size={16} className={`shrink-0 animate-spin ${isHub ? "text-blue-400" : "text-primary"}`} />
          ) : (
            <Search size={16} className={`shrink-0 ${isHub ? "text-white/45" : "text-muted-foreground"}`} />
          )}

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "ArrowDown" && liveSpotlightMatches.length > 0) {
                e.preventDefault();
                setHighlightedIndex(prev => (prev + 1) % liveSpotlightMatches.length);
              } else if (e.key === "ArrowUp" && liveSpotlightMatches.length > 0) {
                e.preventDefault();
                setHighlightedIndex(prev => (prev <= 0 ? liveSpotlightMatches.length - 1 : prev - 1));
              } else if (e.key === "Tab" && predictiveState.suggestions.length > 0) {
                const top = predictiveState.suggestions[0];
                const fill = top.cmd ?? top.prefill;
                if (fill) {
                  e.preventDefault();
                  setQuery(fill);
                }
              }
            }}
            placeholder="Command or lookup… (e.g. open analytics, new sale, stock amoxicillin)"
            aria-label="SmartTrack Spotlight command bar"
            className={`min-w-0 flex-1 bg-transparent py-1 text-[13px] font-medium focus:outline-none ${
              isHub ? "text-white placeholder:text-white/35" : "text-foreground placeholder:text-muted-foreground"
            }`}
          />

          <div className="flex shrink-0 items-center gap-1">
            {query && (
              <>
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className={`rounded-md p-1 transition-colors cursor-pointer ${
                    isHub ? "text-white/40 hover:bg-white/[0.08] hover:text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  aria-label="Clear command input"
                >
                  <X size={13} />
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors cursor-pointer ${
                    isHub
                      ? "bg-blue-600 text-white hover:bg-blue-500"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                >
                  <span>Run</span>
                  <CornerDownLeft size={10} />
                </button>
              </>
            )}

            {!query && showingInspector && (
              <button
                type="button"
                onClick={() => setShowGuide(true)}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
                  isHub
                    ? "border-white/12 bg-white/[0.05] text-white/80 hover:bg-white/[0.1] hover:text-white"
                    : "border-border bg-muted/50 text-foreground hover:bg-muted"
                }`}
              >
                <ArrowLeft size={11} />
                <span>Commands</span>
              </button>
            )}

            {!query && showingCommands && resultCards.length > 0 && (
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
                  isHub
                    ? "border-white/12 bg-white/[0.05] text-white/80 hover:bg-white/[0.1] hover:text-white"
                    : "border-border bg-muted/50 text-foreground hover:bg-muted"
                }`}
              >
                <span>Last result</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className={`rounded-lg p-1.5 transition-colors cursor-pointer ${
                isHub
                  ? "text-white/50 hover:bg-white/[0.08] hover:text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              title="Close (Esc)"
              aria-label="Close SmartTrack Assistant"
            >
              <X size={15} />
            </button>
          </div>
        </form>

        {/* Single-line keyboard predictive bar directly beneath Spotlight input when typing */}
        {hasQuery && predictiveState.suggestions.length > 0 && (
          <div
            className={`shrink-0 border-b px-3.5 py-1.5 flex items-center gap-2 ${
              predictiveState.outOfScope
                ? isHub
                  ? "border-amber-400/20 bg-amber-500/[0.07]"
                  : "border-amber-500/25 bg-amber-500/[0.07]"
                : isHub
                ? "border-white/[0.07] bg-white/[0.02]"
                : "border-border/70 bg-muted/30"
            }`}
          >
            {predictiveState.outOfScope && (
              <span className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-medium ${isHub ? "text-amber-200" : "text-amber-700 dark:text-amber-300"}`}>
                <ShieldAlert size={11} />
                <span>Not supported:</span>
              </span>
            )}
            <div className="flex flex-1 items-center gap-1.5 overflow-x-auto scrollbar-none">
              {predictiveState.suggestions.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => activateChip(s)}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
                    isHub
                      ? "border-white/12 bg-white/[0.05] text-white/90 hover:border-blue-400/45 hover:bg-blue-500/20"
                      : "border-border bg-card text-foreground hover:border-primary/40 hover:text-primary"
                  }`}
                >
                  <span className="truncate max-w-[220px]">{s.label}</span>
                  {idx === 0 && !predictiveState.outOfScope && !predictiveState.showNoMatchHint && (
                    <span className="hidden sm:inline text-[8.5px] font-mono opacity-45">⇥</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Shopee-style floating rotating notice & example carousel banner */}
        {showingCommands && (
          <div
            onMouseEnter={() => setIsPromptPaused(true)}
            onMouseLeave={() => setIsPromptPaused(false)}
            className="mx-3.5 mt-2.5 shrink-0"
          >
            <div
              onClick={() => {
                if (activeBanner.cmd) handleCommand(activeBanner.cmd);
                else if (activeBanner.prefill) prefillCommand(activeBanner.prefill);
              }}
              className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-1.5 shadow-sm transition-colors ${
                activeBanner.cmd || activeBanner.prefill ? "cursor-pointer" : ""
              } ${
                activeBanner.kind === "limit"
                  ? isHub
                    ? "border-amber-400/20 bg-amber-500/[0.08] text-amber-100/90"
                    : "border-amber-500/25 bg-amber-500/[0.08] text-amber-800 dark:text-amber-200"
                  : isHub
                  ? "border-white/[0.08] bg-white/[0.04] text-white/85 hover:border-blue-400/35 hover:bg-white/[0.07]"
                  : "border-border bg-muted/40 text-foreground hover:border-primary/35"
              }`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {activeBanner.kind === "limit" ? (
                  <ShieldAlert size={12} className={`shrink-0 ${isHub ? "text-amber-300" : "text-amber-600 dark:text-amber-400"}`} />
                ) : (
                  <Sparkles size={12} className={`shrink-0 ${isHub ? "text-blue-400" : "text-primary"}`} />
                )}
                <span
                  className={`min-w-0 flex-1 truncate text-[10.5px] font-medium transition-all duration-150 ${
                    promptFading ? "opacity-0 -translate-y-0.5" : "opacity-100 translate-y-0"
                  }`}
                >
                  {activeBanner.text}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {(activeBanner.cmd || activeBanner.prefill) && (
                  <span className={`text-[9.5px] font-semibold ${isHub ? "text-blue-300" : "text-primary"}`}>
                    Run ↵
                  </span>
                )}
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  {bannerSlides.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPromptIndex(idx)}
                      aria-label={`Banner ${idx + 1}`}
                      className={`h-1 rounded-full transition-all cursor-pointer ${
                        idx === promptIndex % bannerSlides.length
                          ? isHub
                            ? "w-2.5 bg-white/80"
                            : "w-2.5 bg-foreground/70"
                          : isHub
                          ? "w-1 bg-white/25 hover:bg-white/45"
                          : "w-1 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Spotlight Body: Live Filtered Matches / Inspector Result Card / Idle Commands & Lookups */}
        <div
          className={`flex-1 overflow-y-auto px-3.5 py-2.5 ${
            isHub ? "bg-transparent" : "bg-muted/[0.12]"
          }`}
        >
          {hasQuery ? (
            <div className="space-y-2">
              {liveSpotlightMatches.length > 0 ? (
                <div
                  className={`overflow-hidden rounded-xl border divide-y ${
                    isHub
                      ? "border-white/[0.08] bg-white/[0.02] divide-white/[0.06]"
                      : "border-border bg-card divide-border/70"
                  }`}
                >
                  {liveSpotlightMatches.map((item, idx) => {
                    const isHighlighted = idx === highlightedIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        onClick={() => handleCommand(item.cmd)}
                        className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors cursor-pointer ${
                          isHighlighted
                            ? isHub
                              ? "bg-blue-600/20 text-white"
                              : "bg-primary/10 text-foreground"
                            : isHub
                            ? "hover:bg-white/[0.05] text-white/90"
                            : "hover:bg-muted/60 text-foreground"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{item.label}</p>
                          <p className={`truncate text-[10px] ${isHub ? "text-white/45" : "text-muted-foreground"}`}>
                            {item.meta}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-medium ${
                            item.kind === "command"
                              ? isHub
                                ? "border-blue-400/25 bg-blue-500/15 text-blue-200"
                                : "border-primary/25 bg-primary/10 text-primary"
                              : item.kind === "product"
                              ? isHub
                                ? "border-emerald-400/25 bg-emerald-500/15 text-emerald-200"
                                : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : isHub
                              ? "border-white/10 bg-white/[0.05] text-white/60"
                              : "border-border bg-muted text-muted-foreground"
                          }`}
                        >
                          {item.tag}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div
                  className={`rounded-xl border px-3.5 py-4 text-center ${
                    isHub ? "border-white/[0.08] bg-white/[0.02]" : "border-border bg-card"
                  }`}
                >
                  <p className={`text-xs font-medium ${isHub ? "text-white/80" : "text-foreground"}`}>
                    {predictiveState.outOfScope
                      ? "Direct pharmacy commands & live records only"
                      : "Press Enter to query, or try keywords below"}
                  </p>
                  <p className={`mt-1 text-[10.5px] ${isHub ? "text-white/45" : "text-muted-foreground"}`}>
                    {predictiveState.outOfScope
                      ? "Does not answer medical/dosage questions or general AI chat."
                      : "Supported: open [page], new sale, stock [item], sales [month], if i sold [qty], forecast"}
                  </p>
                </div>
              )}
            </div>
          ) : showingInspector && activeResultCard ? (
            <div className="space-y-2.5">
              {/* Breadcrumb & Recent inspector switcher */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5 text-[10.5px]">
                  <span className={`font-mono truncate max-w-[280px] ${isHub ? "text-white/55" : "text-muted-foreground"}`}>
                    &ldquo;{activeResultCard.queryText}&rdquo;
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    setSelectedResultId(null);
                    setShowGuide(true);
                  }}
                  className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] transition-colors cursor-pointer ${
                    isHub ? "text-white/45 hover:bg-white/[0.08] hover:text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <RotateCcw size={10} />
                  <span>Clear</span>
                </button>
              </div>

              {/* Apple Quick Look Inspector Card */}
              <div
                className={`rounded-xl border p-3.5 ${
                  isHub ? "border-white/[0.1] bg-white/[0.03]" : "border-border bg-card shadow-xs"
                }`}
              >
                <p className={`whitespace-pre-line text-xs leading-relaxed ${isHub ? "text-white/95" : "text-foreground"}`}>
                  {renderFormattedText(activeResultCard.result.text)}
                </p>

                {activeResultCard.result.details && activeResultCard.result.details.length > 0 && (
                  <div
                    className={`mt-3 overflow-hidden rounded-lg border divide-y ${
                      isHub
                        ? "border-white/[0.08] bg-black/30 divide-white/[0.06]"
                        : "border-border/80 bg-muted/25 divide-border/60"
                    }`}
                  >
                    {activeResultCard.result.details.map((d, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[11px]">
                        <span className={isHub ? "text-white/55" : "text-muted-foreground"}>{d.label}</span>
                        <span className={`font-semibold tabular-nums text-right ${isHub ? "text-white" : "text-foreground"}`}>
                          {d.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {activeResultCard.result.onAction && (
                    <button
                      type="button"
                      onClick={activeResultCard.result.onAction}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                        isHub
                          ? "bg-blue-600 text-white hover:bg-blue-500"
                          : "bg-primary text-primary-foreground hover:bg-primary/90"
                      }`}
                    >
                      <span>{activeResultCard.result.actionLabel}</span>
                      <ChevronRight size={12} />
                    </button>
                  )}

                  {activeResultCard.result.suggestions?.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => activateChip(s)}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
                        isHub
                          ? "border-white/12 bg-white/[0.05] text-white/85 hover:border-blue-400/45 hover:bg-blue-500/20"
                          : "border-border bg-muted/40 text-foreground hover:border-primary/40 hover:text-primary"
                      }`}
                    >
                      <CornerDownRight size={10} className="opacity-60" />
                      <span>{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {resultCards.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className={`text-[9.5px] uppercase tracking-wider ${isHub ? "text-white/35" : "text-muted-foreground"}`}>
                    Recent:
                  </span>
                  {resultCards.slice(-4, -1).reverse().map(card => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => {
                        setSelectedResultId(card.id);
                        setShowGuide(false);
                      }}
                      className={`max-w-[140px] truncate rounded-md border px-2 py-0.5 text-[10px] transition-colors cursor-pointer ${
                        card.id === activeResultCard.id
                          ? isHub
                            ? "border-blue-400/40 bg-blue-500/20 text-blue-200"
                            : "border-primary/40 bg-primary/10 text-primary"
                          : isHub
                          ? "border-white/10 bg-white/[0.03] text-white/60 hover:text-white"
                          : "border-border bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {card.queryText}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Section 1: Actual System Commands (POS, Add Product, Pages) */}
              <div>
                <div className="mb-1.5 flex items-center justify-between px-0.5">
                  <span className={`text-[9.5px] font-semibold uppercase tracking-[0.08em] ${isHub ? "text-white/45" : "text-muted-foreground"}`}>
                    Commands · Jump &amp; Run
                  </span>
                  <span className={`text-[9px] ${isHub ? "text-white/30" : "text-muted-foreground"}`}>
                    Type page name or command
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {navCommands.slice(0, 6).map(item => (
                    <button
                      key={item.cmd}
                      type="button"
                      onClick={() => handleCommand(item.cmd)}
                      className={`group flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors cursor-pointer ${
                        isHub
                          ? "border-white/[0.08] bg-white/[0.03] hover:border-blue-400/35 hover:bg-white/[0.07]"
                          : "border-border bg-card hover:border-primary/35 hover:bg-muted/50"
                      }`}
                    >
                      <span className={`truncate text-[11px] font-medium ${isHub ? "text-white/90 group-hover:text-white" : "text-foreground"}`}>
                        {item.label}
                      </span>
                      <span
                        className={`shrink-0 rounded px-1 py-0.5 text-[8.5px] font-medium ${
                          isHub ? "bg-white/[0.06] text-white/45" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {item.tag}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 2: Direct Live Lookups */}
              <div>
                <div className="mb-1.5 flex items-center justify-between px-0.5">
                  <span className={`text-[9.5px] font-semibold uppercase tracking-[0.08em] ${isHub ? "text-white/45" : "text-muted-foreground"}`}>
                    Live Lookups · Pharmacy Data
                  </span>
                  <span className={`text-[9px] font-mono ${isHub ? "text-white/30" : "text-muted-foreground"}`}>
                    syntax hints
                  </span>
                </div>
                <div
                  className={`overflow-hidden rounded-xl border divide-y ${
                    isHub
                      ? "border-white/[0.08] bg-white/[0.02] divide-white/[0.06]"
                      : "border-border bg-card divide-border/70"
                  }`}
                >
                  {lookupRows.map(row => {
                    const RowIcon = row.icon;
                    return (
                      <button
                        key={row.cmd}
                        type="button"
                        onClick={() => handleCommand(row.cmd)}
                        className={`group flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors cursor-pointer ${
                          isHub ? "hover:bg-white/[0.05]" : "hover:bg-muted/60"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <RowIcon
                            size={13}
                            className={`shrink-0 transition-colors ${
                              isHub ? "text-white/45 group-hover:text-blue-400" : "text-muted-foreground group-hover:text-primary"
                            }`}
                          />
                          <span className={`truncate text-xs font-medium ${isHub ? "text-white/90 group-hover:text-white" : "text-foreground"}`}>
                            {row.label}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {row.liveBadge && (
                            <span
                              className={`hidden sm:inline rounded px-1.5 py-0.5 text-[9px] font-medium tabular-nums ${
                                isHub ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              }`}
                            >
                              {row.liveBadge}
                            </span>
                          )}
                          <span className={`font-mono text-[9.5px] ${isHub ? "text-white/35 group-hover:text-white/55" : "text-muted-foreground"}`}>
                            {row.hint}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quiet Spotlight Footer */}
        <div
          className={`flex shrink-0 items-center justify-between border-t px-3.5 py-2 text-[9.5px] ${
            isHub ? "border-white/[0.08] bg-[#0a0a0a] text-white/35" : "border-border bg-card text-muted-foreground"
          }`}
        >
          <span>↑↓ select · Tab fill · ↵ run · English, Bisaya, Tagalog</span>
          <span>
            <kbd
              className={`rounded border px-1 font-mono ${
                isHub ? "border-white/10 bg-white/[0.06]" : "border-border bg-muted"
              }`}
            >
              Esc
            </kbd>{" "}
            close
          </span>
        </div>
      </div>
    );
  };

  // When rendered inside TrackHub Dynamic Island, mount directly inside the expanded island pill
  if (mode === "trackhub") {
    return renderContent(true);
  }

  // Sidebar mode: render trigger button and portaled modal dialog
  return (
    <>
      <div className="px-2 py-2">
        <button
          type="button"
          onClick={() => {
            if (!isOpen) onOpen?.();
            setIsOpen(!isOpen);
          }}
          className={`w-full flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors ${
            isOpen
              ? "border-blue-400/30 bg-blue-600/20 text-blue-100"
              : "border-transparent text-white/65 hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
          } ${sidebarExpanded ? "" : "justify-center"}`}
          title={sidebarExpanded ? undefined : "SmartTrack Assistant"}
          aria-label={isOpen ? "Close SmartTrack Assistant" : "Open SmartTrack Assistant"}
          aria-expanded={isOpen}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
            <SmartBotMascot className="h-7 w-7" floating={isOpen} />
          </span>
          {sidebarExpanded && (
            <>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-xs font-semibold">SmartTrack Assistant</span>
                <span className="mt-0.5 block truncate text-[9px] text-white/45">Stock · Sales · Tasks</span>
              </span>
              <span className="text-[10px] text-white/40">{isOpen ? "−" : "+"}</span>
            </>
          )}
        </button>
      </div>

      {/* Centered modal overlay for sidebar mode (clean solid dim backdrop, NO blur) */}
      {isOpen &&
        createPortal(
          <div
            data-assistant-portal
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="SmartTrack Assistant"
          >
            {/* Click outside to close — clean non-blur dim backdrop for crisp contrast */}
            <div
              className="fixed inset-0 bg-black/25 dark:bg-black/45"
              onClick={() => setIsOpen(false)}
            />

            {/* Panel */}
            <div className="relative z-10 w-full max-w-lg h-[min(85dvh,420px)] shadow-2xl">
              {renderContent(false)}
            </div>
          </div>,
          document.body
        )}
    </>
  );
});

export default CommandAssistant;
