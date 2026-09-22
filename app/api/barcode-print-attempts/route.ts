import { callGoogleSheetsWebApi } from "@/lib/google-sheets-web-api";

const TYPES = new Set(["INITIAL", "RETRY", "REPRINT"]);
const STATUSES = new Set(["queued", "printing", "sent", "failed"]);

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const attemptId = text(body.attemptId, 100);
    const batchId = text(body.batchId, 100);
    const type = text(body.type, 10).toUpperCase();
    if (!attemptId || !/^[A-Za-z0-9-]{8,100}$/.test(attemptId)) throw new Error("The print attempt ID is invalid.");
    if (!batchId) throw new Error("The print batch ID is missing.");
    if (!TYPES.has(type)) throw new Error("The print attempt type is invalid.");
    if (!Array.isArray(body.labels) || body.labels.length === 0 || body.labels.length > 500) throw new Error("The print attempt labels are invalid.");
    const labels = body.labels.map((value, index) => {
      const row = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
      const uuid = text(row.uuid, 64).toUpperCase();
      const status = text(row.status, 20).toLowerCase();
      if (!uuid) throw new Error(`Label ${index + 1} is missing a barcode.`);
      if (!STATUSES.has(status)) throw new Error(`Label ${index + 1} has an invalid status.`);
      return { uuid, status, error: text(row.error, 500) };
    });
    await callGoogleSheetsWebApi<{ ok: true }>("recordBarcodePrintAttempt", { attemptId, batchId, type, labels });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save the print attempt." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
