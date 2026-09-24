import type {
  DashboardData,
  DashboardProduct,
  InventoryItem,
  StockTransaction,
} from "@/app/dashboard/_lib/dashboard-data";

type SheetDashboardResponse = {
  ok?: boolean;
  error?: string;
  updatedAt?: unknown;
  waitingForImport?: unknown;
  products?: unknown;
  inventory?: unknown;
  transactions?: unknown;
};

export const dynamic = "force-dynamic";

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rows(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function product(value: unknown): DashboardProduct | null {
  const item = record(value);
  const sku = text(item.sku).toUpperCase();
  const name = text(item.name);
  if (!sku || !name) return null;
  return {
    sku,
    name,
    category: text(item.category, "Medical Stock"),
    unit: text(item.unit, "units"),
    trackMode: text(item.trackMode).toUpperCase(),
    packageUnit: text(item.packageUnit),
    unitsPerPack: number(item.unitsPerPack),
  };
}

function inventoryItem(value: unknown): InventoryItem | null {
  const item = record(value);
  const id = text(item.id);
  const sku = text(item.sku).toUpperCase();
  if (!id || !sku) return null;
  return {
    id,
    sku,
    productName: text(item.productName, sku),
    unit: text(item.unit, "units"),
    location: text(item.location),
    status: text(item.status).toUpperCase(),
    quantity: number(item.quantity),
    containerType: text(item.containerType).toUpperCase(),
    trackMode: text(item.trackMode).toUpperCase(),
    packageUnit: text(item.packageUnit),
    unitsPerPack: number(item.unitsPerPack),
  };
}

function transaction(value: unknown): StockTransaction | null {
  const item = record(value);
  const id = text(item.id);
  const sku = text(item.sku).toUpperCase();
  const occurredAt = text(item.occurredAt);
  const type = text(item.type).toUpperCase();
  if (!id || !sku || !occurredAt || (type !== "IN" && type !== "OUT")) return null;
  return {
    id,
    occurredAt,
    type,
    sku,
    productName: text(item.productName, sku),
    quantity: number(item.quantity),
    balance: number(item.balance),
    unit: text(item.unit, "units"),
    source: text(item.source, "Google Sheets"),
    actor: text(item.actor, "Spreadsheet User"),
  };
}

export async function GET() {
  const endpoint = process.env.GOOGLE_SHEETS_WEB_APP_URL;
  const token = process.env.GOOGLE_SHEETS_API_TOKEN;

  if (!endpoint || !token) {
    return Response.json(
      { error: "Google Sheets connection is not configured on the MedStock server." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "getDashboard", token }),
      cache: "no-store",
      redirect: "follow",
    });
    if (!response.ok) throw new Error(`Google Apps Script responded with HTTP ${response.status}.`);

    const sheet = await response.json() as SheetDashboardResponse;
    if (!sheet.ok) throw new Error(sheet.error || "Google Sheets returned an error.");

    const data: DashboardData = {
      products: rows(sheet.products).map(product).filter((item): item is DashboardProduct => item !== null),
      inventory: rows(sheet.inventory).map(inventoryItem).filter((item): item is InventoryItem => item !== null),
      transactions: rows(sheet.transactions).map(transaction).filter((item): item is StockTransaction => item !== null),
      waitingForImport: number(sheet.waitingForImport),
      updatedAt: text(sheet.updatedAt, new Date().toISOString()),
    };

    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[MedStock dashboard sync]", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load dashboard from Google Sheets." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
