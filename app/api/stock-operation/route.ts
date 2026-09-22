type StockOperation = "check" | "cut";
type OperationRequest = { operation?: unknown; branch?: unknown; items?: unknown };
type SheetResponse = { ok?: boolean; batchId?: string; processedCount?: number; error?: string };

const BRANCHES = new Set(["Thonglor", "Silom"]);

function text(value: unknown, maxLength = 120) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function number(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a number.`);
  return parsed;
}

function sanitizeItems(value: unknown, operation: StockOperation) {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Operation queue is empty.");
  if (value.length > 100) throw new Error("Operation queue cannot contain more than 100 items.");
  const seen = new Set<string>();
  return value.map((value, index) => {
    const row = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
    const id = text(row.id, 64).toUpperCase();
    if (!id) throw new Error(`Row ${index + 1} is missing a barcode.`);
    if (seen.has(id)) throw new Error(`Duplicate barcode: ${id}`);
    seen.add(id);
    if (operation === "check") {
      const actualType = text(row.actualType, 10).toUpperCase();
      const actualQuantity = number(row.actualQuantity, `Row ${index + 1} actual quantity`);
      if (!new Set(["FULL", "OPEN"]).has(actualType)) throw new Error(`Row ${index + 1} has an invalid stock type.`);
      if (actualQuantity < 0) throw new Error(`Row ${index + 1} quantity cannot be negative.`);
      return { id, note: text(row.note, 500), actualType, actualQuantity };
    }
    const cutReason = text(row.cutReason, 10).toUpperCase();
    const cutMode = text(row.cutMode, 10).toUpperCase();
    const cutQuantity = number(row.cutQuantity, `Row ${index + 1} cut quantity`);
    if (!new Set(["SALE", "USE"]).has(cutReason)) throw new Error(`Row ${index + 1} has an invalid reason.`);
    if (!new Set(["ALL", "PARTIAL"]).has(cutMode)) throw new Error(`Row ${index + 1} has an invalid cut mode.`);
    if (cutQuantity <= 0) throw new Error(`Row ${index + 1} cut quantity must be greater than zero.`);
    return { id, cutReason, cutMode, cutQuantity };
  });
}

export async function POST(request: Request) {
  const endpoint = process.env.GOOGLE_SHEETS_WEB_APP_URL;
  const token = process.env.GOOGLE_SHEETS_API_TOKEN;
  if (!endpoint || !token) return Response.json({ ok: false, error: "Google Sheets connection is not configured on the MedStock server." }, { status: 503 });
  try {
    const body = await request.json() as OperationRequest;
    const operation = text(body.operation, 10) as StockOperation;
    const branch = text(body.branch, 30);
    if (operation !== "check" && operation !== "cut") throw new Error("Unsupported stock operation.");
    if (!BRANCHES.has(branch)) throw new Error("Select a valid branch.");
    const items = sanitizeItems(body.items, operation);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: operation === "check" ? "checkStockBatch" : "cutStockBatch", token, branch, items }),
      cache: "no-store",
      redirect: "follow",
    });
    if (!response.ok) throw new Error(`Google Apps Script responded with HTTP ${response.status}.`);
    const result = await response.json() as SheetResponse;
    if (!result.ok) throw new Error(result.error || "Google Sheets rejected the stock operation.");
    return Response.json({ ok: true, batchId: result.batchId || operation.toUpperCase(), processedCount: Number(result.processedCount) || items.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Unable to process stock operation." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
