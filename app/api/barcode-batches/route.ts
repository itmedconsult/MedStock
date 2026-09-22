import { callGoogleSheetsWebApi } from "@/lib/google-sheets-web-api";

type ReserveItem = { sku: string; stockDate: string; quantity: number };
type ReserveRequest = { branch?: unknown; requestId?: unknown; items?: unknown };

const OPERATIONAL_BRANCHES = new Set(["Thonglor", "Silom"]);
const HISTORY_BRANCHES = new Set(["Thonglor", "Silom", "Legacy"]);
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseItems(value: unknown): ReserveItem[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Select at least one product to print.");
  if (value.length > 100) throw new Error("A barcode batch cannot contain more than 100 product rows.");
  let total = 0;
  const items = value.map((value, index) => {
    const row = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
    const sku = text(row.sku, 32).toUpperCase();
    const stockDate = text(row.stockDate, 10);
    const quantity = Number(row.quantity);
    if (!SKU_PATTERN.test(sku)) throw new Error(`Row ${index + 1} has an invalid SKU.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(stockDate) || Number.isNaN(Date.parse(`${stockDate}T00:00:00Z`))) {
      throw new Error(`Row ${index + 1} has an invalid stock date.`);
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) throw new Error(`Row ${index + 1} has an invalid quantity.`);
    total += quantity;
    return { sku, stockDate, quantity };
  });
  if (total > 500) throw new Error("A barcode batch cannot contain more than 500 labels.");
  return items;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const branch = text(url.searchParams.get("branch"), 20);
    if (branch && !HISTORY_BRANCHES.has(branch)) throw new Error("Select a valid print history branch.");
    const result = await callGoogleSheetsWebApi<{ ok: true; batches?: unknown[] }>("listBarcodePrintBatches", {
      branch: branch || undefined,
      limit: 200,
    });
    return Response.json({ batches: Array.isArray(result.batches) ? result.batches : [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load barcode batches." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as ReserveRequest;
    const branch = text(body.branch, 20);
    const requestId = text(body.requestId, 100);
    if (!OPERATIONAL_BRANCHES.has(branch)) throw new Error("Select a valid print branch.");
    if (!requestId || !/^[A-Za-z0-9-]{8,100}$/.test(requestId)) throw new Error("The barcode request ID is invalid.");
    const items = parseItems(body.items);
    const result = await callGoogleSheetsWebApi<{ ok: true; batch?: unknown }>("reserveBarcodeBatch", { branch, requestId, items });
    if (!result.batch) throw new Error("Google Sheets did not return the reserved barcode batch.");
    return Response.json({ batch: result.batch }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to reserve the barcode batch." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
