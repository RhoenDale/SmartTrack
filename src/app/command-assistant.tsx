import React, { useState, useEffect, useRef, useId } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ArrowRight,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  AlertTriangle,
  Calculator,
  CornerDownLeft,
  LoaderCircle,
} from "lucide-react";
import { getReorderUnits, groupCartTransactions, type Product, type Transaction, type AuthUser, type Page } from "./data";
import { analyticsApi } from "./api";
import { fmt, InfoTip } from "./shared";

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

type Message = {
  id: string;
  sender: "user" | "bot";
  text: string;
  type?: "info" | "success" | "warning" | "error" | "action";
  actionLabel?: string;
  onAction?: () => void;
  details?: { label: string; value: string }[];
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

export function SmartBotMascot({ className = "" }: { className?: string }) {
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
      className={`overflow-visible drop-shadow-[0_5px_4px_rgba(12,45,57,0.22)] ${className}`}
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
      <g className="smartbot-mascot-float">
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

export default function CommandAssistant({
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

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "bot",
      text: `Hi ${user.name.split(" ")[0]}. I can help you check stock, look up sales, estimate demand, or open a pharmacy task.`,
      type: "info",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isOpen, messages]);

  const addMessage = (msg: Omit<Message, "id">) => {
    setMessages(prev => [...prev, { ...msg, id: Math.random().toString(36).substring(2, 9) }]);
  };

  const checkProfanity = (text: string) => {
    const lower = text.toLowerCase();
    return INAPPROPRIATE_WORDS.some(w => new RegExp(`\\b${w}\\b`, "i").test(lower));
  };

  const handleCommand = async (userInput: string) => {
    const raw = userInput.trim();
    if (!raw) return;

    // 1. Add user message
    addMessage({ sender: "user", text: raw });
    setQuery("");
    setLoading(true);

    const q = raw.toLowerCase();

    // Detect user query language (English vs Tagalog vs Bisaya)
    const isTagalog = /\b(ano|paano|bakit|saan|kailan|mga|ng|nang|benta|kahapon|ngayon|buwan|produkto|dagdag|buksan|pumunta)\b/i.test(q);
    const isBisaya = /\b(unsa|unsay|para unsa|nganong|pila|pilay|nabilin|gahapon|karon|bulana|tambal|dugang|hurot|ubos|kulang|halin|adto|ablihi|tan-awon|pakita|baligya|tubo|ganansya)\b/i.test(q);
    const lang: "en" | "tl" | "ceb" = isBisaya ? "ceb" : isTagalog ? "tl" : "en";

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

    // 4. Navigation shortcuts (English, Bisaya, Tagalog)
    const isNav =
      q.includes("go to") || q.includes("open") || q.includes("show me") || q.startsWith("navigate") ||
      q.includes("adto sa") || q.includes("ablihi") || q.includes("tan-awon") || q.includes("pakita") ||
      q.includes("pumunta sa") || q.includes("buksan");

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
      const prodNameQuery = soldMatch[2].replace(/(?:this month|how much|does i earn|do i earn|pilay kita|pilay halin|pilay ganansya|\?)/gi, "").trim();

      const matchedProduct = inventory.find(p =>
        p.name.toLowerCase().includes(prodNameQuery) || prodNameQuery.includes(p.name.toLowerCase())
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

    // 7. Sales Query (English/Bisaya/Tagalog: "how much total sales from past october?", "pilay halin atong october?")
    if (q.includes("sale") || q.includes("revenue") || q.includes("earn") || q.includes("income") || q.includes("halin") || q.includes("benta") || q.includes("kita")) {
      const salesTransactions = groupCartTransactions(transactions.filter(transaction => transaction.type === "sale"));
      let dateFilter = (_date: Date) => true;
      let timeframeLabel = lang === "ceb" ? "Tanan (All-Time)" : "All-Time";
      const now = new Date();

      // Detect month
      let foundMonth: number | null = null;
      let foundMonthName = "";
      for (const [mName, mIdx] of Object.entries(MONTHS_MAP)) {
        if (q.includes(mName)) {
          foundMonth = mIdx;
          foundMonthName = mName;
          break;
        }
      }

      if (foundMonth !== null) {
        const year = foundMonth > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
        timeframeLabel = `${foundMonthName.toUpperCase()} ${year}`;
        dateFilter = date => date.getMonth() === foundMonth && date.getFullYear() === year;
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
      q.includes(p.name.toLowerCase()) || p.name.toLowerCase().split(" ").some(part => part.length > 3 && q.includes(part))
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

    // 11. Keep unsupported questions in scope and return a single helpful reply.
    setLoading(false);
    const fallbackMsg =
      lang === "ceb"
        ? "Pasayloa, dili ko makatubag ana. Ang SmartTrack Assistant para ra sa pharmacy stock, sales, forecasts, ug pag-abli sa mga system task. Sulayi: “stock amoxicillin,” “halin sa October,” o “ablihi ang inventory.”"
        : lang === "tl"
        ? "Paumanhin, hindi ako makakasagot niyan. Para lang ang SmartTrack Assistant sa stock, benta, forecast, at pagpunta sa mga bahagi ng system. Subukan: “stock amoxicillin,” “sales October,” o “open inventory.”"
        : "Sorry, I can’t help with that. The SmartTrack Assistant is only for pharmacy stock, sales, forecasts, and system tasks. Try “stock amoxicillin,” “sales October,” or “open inventory.”";

    addMessage({ sender: "bot", text: fallbackMsg, type: "info" });
  };

  const quickPrompts = [
    { label: "Demand Forecast", icon: <TrendingUp size={12} />, cmd: "how many units will be sold next month?" },
    { label: "Sales Lookups", icon: <DollarSign size={12} />, cmd: "how much total sales from past october?" },
    { label: "Low Stock Items", icon: <AlertTriangle size={12} />, cmd: "show low stock items" },
    { label: "Today's Sales", icon: <ShoppingCart size={12} />, cmd: "how much total sales today?" },
    { label: "Profit Simulator", icon: <Calculator size={12} />, cmd: "if i sold 50 units of amoxicillin, how much do i earn?" },
  ];

  if (!enabled) return null;

  const renderContent = (isHub: boolean) => (
    <div
      className={`relative flex flex-col w-full h-full overflow-hidden ${
        isHub ? "bg-[#0a0a0a] text-white" : "rounded-2xl border border-border bg-card text-foreground"
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-4 py-3 shrink-0 border-b ${
          isHub ? "border-white/[0.08] bg-[#0a0a0a]" : "border-border bg-card"
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              isHub ? "bg-blue-500/15 border border-blue-400/20" : "bg-primary/10 ring-1 ring-primary/15"
            }`}
          >
            <SmartBotMascot className="h-8 w-8" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className={`text-sm font-bold tracking-tight ${isHub ? "text-white" : "text-foreground"}`}>
                SmartTrack Assistant
              </h3>
              <InfoTip
                title="About the SmartTrack Assistant"
                color="sky"
                lines={[
                  "A rule-based pharmacy shortcut assistant for common tasks.",
                  { label: "Can help with", value: "Stock checks, sales lookups, demand forecasts, calculations, and navigation" },
                  { label: "How it responds", value: "Matches supported commands and queries against pharmacy data" },
                  { label: "Not for", value: "Open-ended questions or medical advice" },
                ]}
              />
            </div>
            <p className={`mt-0.5 text-[10px] ${isHub ? "text-white/50" : "text-muted-foreground"}`}>
              Pharmacy shortcuts · Live stock &amp; sales
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className={`rounded-lg p-2 transition-colors cursor-pointer ${
            isHub
              ? "text-white/60 hover:bg-white/[0.08] hover:text-white"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          title="Close (Esc)"
          aria-label="Close SmartTrack Assistant"
        >
          <X size={16} />
        </button>
      </div>

      {/* Quick prompts */}
      <div
        className={`border-b px-3 py-2 shrink-0 ${
          isHub ? "border-white/[0.08] bg-white/[0.02]" : "border-border/70 bg-muted/15"
        }`}
      >
        <p
          className={`mb-1.5 px-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
            isHub ? "text-white/45" : "text-muted-foreground"
          }`}
        >
          Common tasks
        </p>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {quickPrompts.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleCommand(p.cmd)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-medium transition-colors cursor-pointer ${
                isHub
                  ? "border-white/10 bg-white/[0.06] text-white/90 hover:border-blue-400/40 hover:bg-white/[0.12] hover:text-white"
                  : "border-border bg-card text-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              }`}
            >
              <span className={isHub ? "text-white/60" : "text-muted-foreground"}>{p.icon}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div
        className={`flex-1 space-y-3.5 overflow-y-auto p-4 ${
          isHub ? "bg-transparent" : "bg-muted/[0.12]"
        }`}
      >
        {messages.map(m => (
          <div
            key={m.id}
            className={`flex items-end gap-2 ${m.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            {m.sender === "bot" && (
              <span
                className={`mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  isHub ? "bg-blue-500/15" : "bg-primary/10"
                }`}
              >
                <SmartBotMascot className="h-6 w-6" />
              </span>
            )}
            <div
              className={`max-w-[84%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${
                m.sender === "user"
                  ? isHub
                    ? "rounded-br-md bg-blue-600 text-white font-medium"
                    : "rounded-br-md bg-primary text-primary-foreground"
                  : isHub
                  ? "rounded-bl-md border border-white/10 bg-white/[0.07] text-white/95"
                  : "rounded-bl-md border border-border/80 bg-card text-foreground"
              }`}
            >
              <p className="whitespace-pre-line">{m.text}</p>

              {m.details && (
                <div
                  className={`mt-2 space-y-1.5 border-t pt-2 ${
                    isHub ? "border-white/10" : "border-border/60"
                  }`}
                >
                  {m.details.map((d, i) => (
                    <div key={i} className="flex justify-between gap-3 text-[11px]">
                      <span className={isHub ? "text-white/55" : "text-muted-foreground"}>{d.label}:</span>
                      <span className={`font-semibold tabular-nums ${isHub ? "text-white" : "text-foreground"}`}>
                        {d.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {m.onAction && (
                <button
                  type="button"
                  onClick={m.onAction}
                  className={`mt-2.5 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                    isHub
                      ? "border-blue-400/40 bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
                      : "border-primary/30 bg-primary/15 text-primary hover:bg-primary/25"
                  }`}
                >
                  {m.actionLabel}
                  <ArrowRight size={12} />
                </button>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2.5 pl-1 text-[11px]">
            <SmartBotMascot className="h-7 w-7" />
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${
                isHub
                  ? "border-white/10 bg-white/[0.06] text-white/70"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              <LoaderCircle size={12} className={`animate-spin ${isHub ? "text-blue-400" : "text-primary"}`} />
              Checking pharmacy data…
            </span>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={e => {
          e.preventDefault();
          handleCommand(query);
        }}
        className={`flex shrink-0 flex-col gap-2 border-t p-3 ${
          isHub ? "border-white/[0.08] bg-[#0a0a0a]" : "border-border bg-card"
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ask about stock, sales, or a task…"
              className={`w-full rounded-xl border px-3.5 py-2.5 pr-8 text-xs transition-all focus:outline-none focus:ring-2 ${
                isHub
                  ? "border-white/10 bg-white/[0.06] text-white placeholder:text-white/40 focus:border-blue-500 focus:ring-blue-500/20"
                  : "border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/20"
              }`}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className={`absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer ${
                  isHub ? "text-white/40 hover:text-white" : "text-muted-foreground hover:text-foreground"
                }`}
                aria-label="Clear message"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!query.trim() || loading}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold shadow-sm transition-colors disabled:opacity-40 cursor-pointer ${
              isHub
                ? "bg-blue-600 text-white hover:bg-blue-500"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            <span>Send</span>
            <CornerDownLeft size={13} />
          </button>
        </div>
        <div
          className={`flex items-center justify-between px-1 text-[9px] ${
            isHub ? "text-white/40" : "text-muted-foreground"
          }`}
        >
          <span>Rule-based · Pharmacy data only</span>
          <span>
            <kbd
              className={`rounded border px-1 font-mono ${
                isHub ? "border-white/10 bg-white/[0.06]" : "border-border bg-muted"
              }`}
            >
              Esc
            </kbd>{" "}
            to close
          </span>
        </div>
      </form>
    </div>
  );

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
            <SmartBotMascot className="h-7 w-7" />
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
            {/* Click outside to close — clear backdrop, no dark overlay */}
            <div
              className="fixed inset-0"
              onClick={() => setIsOpen(false)}
            />

            {/* Panel */}
            <div className="relative z-10 w-full max-w-lg h-[min(90dvh,600px)] shadow-2xl">
              {renderContent(false)}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
