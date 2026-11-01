export type ActivityKind =
  | "create"
  | "update"
  | "delete"
  | "restore"
  | "password"
  | "role"
  | "sale"
  | "stock"
  | "return"
  | "purchase"
  | "auth";

export interface ActivityEntry {
  id: string;
  ts: number;
  actor: string;
  action: string;
  subject: string;
  detail?: string;
  kind: ActivityKind;
}

const ACTIVITY_KEY = "st_user_activity_log";
let currentActor = "User";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? value as JsonRecord : {};
}

function actorName(user: unknown): string | null {
  const name = asRecord(user).name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export function setActivityActor(name: string | null) {
  currentActor = name?.trim() || "User";
}

export function readActivityLog(): ActivityEntry[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(ACTIVITY_KEY) ?? "[]");
    return Array.isArray(stored) ? stored as ActivityEntry[] : [];
  } catch (error) {
    console.error("Could not read the activity log.", error);
    return [];
  }
}

export function clearActivityLog() {
  try {
    localStorage.removeItem(ACTIVITY_KEY);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("st_activity_logged"));
    }
  } catch (error) {
    console.error("Could not clear the activity log in this browser.", error);
  }
}

export function appendLog(entry: Omit<ActivityEntry, "id" | "ts">) {
  const next: ActivityEntry = {
    ...entry,
    actor: entry.actor || currentActor,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ts: Date.now(),
  };
  const updated = [next, ...readActivityLog()];

  try {
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("Could not save the activity log in this browser.", error);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("st_activity_logged", { detail: next }));
  }
  return next;
}

function record(
  action: string,
  subject: string,
  kind: ActivityKind,
  detail?: string,
) {
  appendLog({ actor: currentActor, action, subject, kind, ...(detail ? { detail } : {}) });
}

function bodyRecord(body: unknown): JsonRecord {
  if (typeof body !== "string") return asRecord(body);
  try {
    return asRecord(JSON.parse(body));
  } catch {
    return {};
  }
}

function responseSubject(response: unknown, fallback: string): string {
  const data = asRecord(response);
  const nested = ["product", "user", "record", "role"].map(key => asRecord(data[key]));
  const candidates = [data, ...nested];
  for (const candidate of candidates) {
    for (const key of ["name", "productName", "product_name", "product", "supplier"]) {
      const value = candidate[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return fallback;
}

function formatId(value: unknown, fallback: string): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

/** Records successful, user-initiated API mutations without storing request secrets. */
export function recordApiActivity(method: string, path: string, body: unknown, response: unknown) {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = path.split("?")[0].replace(/^\/+|\/+$/g, "");
  const payload = bodyRecord(body);
  const data = asRecord(response);
  const subjectFromResponse = (fallback: string) => responseSubject(response, fallback);

  if (normalizedPath === "auth/login" && normalizedMethod === "POST") {
    const user = asRecord(data.user);
    setActivityActor(actorName(user));
    record("signed in", "SmartTrack", "auth");
    return;
  }
  if (normalizedPath === "auth/me" && actorName(data.user)) {
    setActivityActor(actorName(data.user));
    return;
  }
  if (normalizedPath === "auth/logout" && normalizedMethod === "POST") {
    record("signed out", "SmartTrack", "auth");
    setActivityActor(null);
    return;
  }

  const product = normalizedPath.match(/^products(?:\/([^/]+))?(?:\/(restore|purge|batches|supplier)(?:\/([^/]+))?)?$/);
  if (product && normalizedMethod !== "GET") {
    const [, id, subroute, subId] = product;
    const fallback = formatId(id, "Product");
    const subject = subjectFromResponse(
      typeof payload.name === "string" ? payload.name : fallback,
    );
    if (subroute === "restore" && normalizedMethod === "POST") {
      record("restored product", subject, "restore");
    } else if (subroute === "purge" && normalizedMethod === "DELETE") {
      record("permanently deleted product", subject, "delete");
    } else if (subroute === "batches" && subId && normalizedMethod === "DELETE") {
      record("deleted batch", `${fallback} · ${subId}`, "delete");
    } else if (subroute === "batches" && normalizedMethod === "POST") {
      record("added stock batch for", subject, "stock");
    } else if (subroute === "supplier" && normalizedMethod === "POST") {
      record("updated supplier for", subject, "update");
    } else if (!subroute && normalizedMethod === "POST") {
      record("created product", subject, "create");
    } else if (!subroute && normalizedMethod === "PUT") {
      record("updated product", subject, "update");
    } else if (!subroute && normalizedMethod === "DELETE") {
      record("deleted product", subject, "delete", `ID ${fallback}`);
    }
    return;
  }

  if (normalizedPath === "transactions/sale" && normalizedMethod === "POST") {
    const items = Array.isArray(payload.items) ? payload.items.length : 1;
    record("completed sale", items === 1 ? "1 product" : `${items} products`, "sale");
    return;
  }
  if (normalizedPath === "transactions/adjustment" && normalizedMethod === "POST") {
    record(
      "recorded stock adjustment",
      formatId(payload.product_id, "Product"),
      "stock",
      `${formatId(payload.qty, "0")} units · ${formatId(payload.reason, "No reason provided")}`,
    );
    return;
  }
  if (normalizedPath === "return-requests" && normalizedMethod === "POST") {
    record("submitted customer return", subjectFromResponse(formatId(payload.sale_tx_id, "Sale")), "return");
    return;
  }
  if (normalizedPath === "return-requests/broken" && normalizedMethod === "POST") {
    record("reported damaged stock", formatId(payload.product_id, "Product"), "return");
    return;
  }
  const returnDisposition = normalizedPath.match(/^return-requests\/([^/]+)$/);
  if (returnDisposition && normalizedMethod === "PUT") {
    record(
      `marked return ${formatId(payload.disposition, "updated")}`,
      returnDisposition[1],
      "return",
    );
    return;
  }

  const purchaseOrder = normalizedPath.match(/^purchase-orders(?:\/([^/]+))?(?:\/(receipts))?$/);
  if (purchaseOrder && normalizedMethod !== "GET") {
    const [, id, subroute] = purchaseOrder;
    const subject = `Purchase order ${formatId(id ?? data.id, "new")}`;
    if (subroute === "receipts" && normalizedMethod === "POST") {
      record("received items for", subject, "purchase");
    } else if (!id && normalizedMethod === "POST") {
      record("created", `purchase order · ${formatId(payload.supplier, "Supplier")}`, "purchase");
    } else if (id && normalizedMethod === "PUT") {
      record("updated", subject, "purchase");
    } else if (id && normalizedMethod === "DELETE") {
      record("cancelled", subject, "purchase");
    }
    return;
  }

  const category = normalizedPath.match(/^categories(?:\/([^/]+))?$/);
  if (category && normalizedMethod !== "GET") {
    const subject = formatId(payload.name ?? category[1], "Category");
    if (!category[1] && normalizedMethod === "POST") record("created category", subject, "create");
    else if (category[1] && normalizedMethod === "DELETE") record("deleted category", subject, "delete");
    return;
  }

  const user = normalizedPath.match(/^users(?:\/([^/]+))?(?:\/(restore|purge|password|reset-password))?$/);
  if (user && normalizedMethod !== "GET") {
    const [, id, subroute] = user;
    const subject = subjectFromResponse(typeof payload.name === "string" ? payload.name : formatId(id, "User"));
    if (subroute === "restore" && normalizedMethod === "POST") record("restored user", subject, "restore");
    else if (subroute === "purge" && normalizedMethod === "DELETE") record("permanently deleted user", subject, "delete");
    else if (subroute === "password" && normalizedMethod === "PUT") record("changed password for", subject, "password");
    else if (subroute === "reset-password" && normalizedMethod === "POST") record("reset password for", subject, "password");
    else if (!subroute && normalizedMethod === "POST") record("created user", subject, "create");
    else if (!subroute && normalizedMethod === "PUT") record("updated user", subject, "update");
    else if (!subroute && normalizedMethod === "DELETE") {
      record("deleted user", subject, "delete", `ID ${formatId(id, "unknown")}`);
    }
    return;
  }

  const role = normalizedPath.match(/^roles(?:\/([^/]+))?$/);
  if (role && normalizedMethod !== "GET") {
    const subject = subjectFromResponse(typeof payload.name === "string" ? payload.name : formatId(role[1], "Role"));
    if (!role[1] && normalizedMethod === "POST") record("created role", subject, "role");
    else if (role[1] && normalizedMethod === "PUT") record("updated role", subject, "role");
    else if (role[1] && normalizedMethod === "DELETE") record("deleted role", subject, "role");
  }
}
