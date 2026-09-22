type ImportItem = {
  barcode: string;
  lot: string;
  expiry: string;
  quantity: number;
};

type ImportRequest = {
  branch?: unknown;
  receivedDate?: unknown;
  items?: unknown;
};

type SheetImportResponse = {
  ok?: boolean;
  batchId?: string;
  importedCount?: number;
  error?: string;
};

const BARCODE_PATTERN = /^[A-Z]{2,6}-\d{3}-\d{6}-[A-Z]\d{4}$/;
const BRANCHES = new Set(["Thonglor", "Silom"]);

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseItems(value: unknown): ImportItem[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Import queue is empty.");
  if (value.length > 100) throw new Error("Import queue cannot contain more than 100 barcodes.");

  const seen = new Set<string>();
  return value.map((value, index) => {
    const row = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
    const barcode = cleanText(row.barcode, 64).toUpperCase();
    const quantity = Number(row.quantity);
    if (!BARCODE_PATTERN.test(barcode)) throw new Error(`Row ${index + 1} has an invalid barcode.`);
    if (seen.has(barcode)) throw new Error(`Duplicate barcode: ${barcode}`);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`Row ${index + 1} has an invalid quantity.`);
    seen.add(barcode);
    return {
      barcode,
      lot: cleanText(row.lot, 100),
      expiry: cleanText(row.expiry, 10),
      quantity,
    };
  });
}

export async function POST(request: Request) {
  const endpoint = process.env.GOOGLE_SHEETS_WEB_APP_URL;
  const token = process.env.GOOGLE_SHEETS_API_TOKEN;
  if (!endpoint || !token) {
    return Response.json({ ok: false, error: "Google Sheets connection is not configured on the MedStock server." }, { status: 503 });
  }

  try {
    const body = await request.json() as ImportRequest;
    const branch = cleanText(body.branch, 30);
    const receivedDate = cleanText(body.receivedDate, 10);
    if (!BRANCHES.has(branch)) throw new Error("Select a valid branch.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate) || Number.isNaN(Date.parse(`${receivedDate}T00:00:00Z`))) {
      throw new Error("Select a valid received date.");
    }
    const items = parseItems(body.items);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "importStockBatch", token, branch, receivedDate, items }),
      cache: "no-store",
      redirect: "follow",
    });
    if (!response.ok) throw new Error(`Google Apps Script responded with HTTP ${response.status}.`);

    const result = await response.json() as SheetImportResponse;
    if (!result.ok) throw new Error(result.error || "Google Sheets rejected the import batch.");
    return Response.json({
      ok: true,
      batchId: result.batchId || "IMPORT",
      importedCount: Number(result.importedCount) || items.length,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to import stock." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
