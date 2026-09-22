import type { BrotherLabelStatus, BrotherPrintLabel } from "./brother-print";

export type OperationalPrintBranch = "Thonglor" | "Silom";
export type PrintBranch = OperationalPrintBranch | "Legacy";
export type PrintAttemptType = "INITIAL" | "RETRY" | "REPRINT";

export type PrintAttemptLabel = {
  uuid: string;
  status: BrotherLabelStatus;
  error?: string;
};

export type PrintAttempt = {
  id: string;
  type: PrintAttemptType;
  createdAt: string;
  labels: PrintAttemptLabel[];
};

export type PrintBatch = {
  id: string;
  branch: PrintBranch;
  createdAt: string;
  labels: BrotherPrintLabel[];
  attempts: PrintAttempt[];
};

export type ReservePrintProduct = {
  sku: string;
  date: string;
  quantity: number;
};

export type PrintAttemptInput = {
  attemptId: string;
  batchId: string;
  type: PrintAttemptType;
  labels: PrintAttemptLabel[];
};

const OUTBOX_KEY = "medstock:pending-print-attempts:v1";

async function jsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed with HTTP ${response.status}.`);
  return data;
}

export async function fetchPrintBatches(branch?: PrintBranch) {
  const query = branch ? `?branch=${encodeURIComponent(branch)}` : "";
  const response = await fetch(`/api/barcode-batches${query}`, { cache: "no-store" });
  const data = await jsonResponse<{ batches: PrintBatch[] }>(response);
  return data.batches;
}

export async function reservePrintBatch(
  branch: OperationalPrintBranch,
  products: ReservePrintProduct[],
  requestId: string,
) {
  const response = await fetch("/api/barcode-batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch, requestId, items: products.map((product) => ({
      sku: product.sku,
      stockDate: product.date,
      quantity: product.quantity,
    })) }),
  });
  const data = await jsonResponse<{ batch: PrintBatch }>(response);
  return data.batch;
}

function readOutbox(): PrintAttemptInput[] {
  try {
    const value = window.localStorage.getItem(OUTBOX_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as PrintAttemptInput[] : [];
  } catch {
    return [];
  }
}

function writeOutbox(attempts: PrintAttemptInput[]) {
  window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(attempts.slice(-100)));
}

function queueAttempt(attempt: PrintAttemptInput) {
  const attempts = readOutbox().filter((item) => item.attemptId !== attempt.attemptId);
  writeOutbox([...attempts, attempt]);
}

async function sendAttempt(attempt: PrintAttemptInput) {
  const response = await fetch("/api/barcode-print-attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(attempt),
  });
  await jsonResponse<{ ok: true }>(response);
}

export async function recordCloudPrintAttempt(attempt: PrintAttemptInput) {
  try {
    await sendAttempt(attempt);
    writeOutbox(readOutbox().filter((item) => item.attemptId !== attempt.attemptId));
    return { synced: true as const };
  } catch (error) {
    queueAttempt(attempt);
    return {
      synced: false as const,
      error: error instanceof Error ? error.message : "Unable to save the print log.",
    };
  }
}

export async function flushPrintAttemptOutbox() {
  const pending = readOutbox();
  if (!pending.length) return { synced: 0, remaining: 0 };
  const remaining: PrintAttemptInput[] = [];
  let synced = 0;
  for (const attempt of pending) {
    try {
      await sendAttempt(attempt);
      synced += 1;
    } catch {
      remaining.push(attempt);
    }
  }
  writeOutbox(remaining);
  return { synced, remaining: remaining.length };
}

export function labelReprintCount(batch: PrintBatch, uuid: string) {
  return batch.attempts.filter((attempt) => attempt.type === "REPRINT"
    && attempt.labels.some((label) => label.uuid === uuid && label.status === "sent")).length;
}

export function latestLabelStatus(batch: PrintBatch, uuid: string) {
  for (let index = batch.attempts.length - 1; index >= 0; index -= 1) {
    const result = batch.attempts[index].labels.find((label) => label.uuid === uuid);
    if (result) return result;
  }
  return undefined;
}
