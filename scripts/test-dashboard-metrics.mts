import assert from "node:assert/strict";
import { createDailyMovements, summarizeDashboard, type DashboardData } from "../app/dashboard/_lib/dashboard-data.ts";

const data: DashboardData = {
  products: [],
  inventory: [
    { id: "BIENOX-1", sku: "AES-058", productName: "Bienox 100 U", unit: "U", location: "Thonglor", status: "IN STOCK", quantity: 100, containerType: "FULL", trackMode: "BULK", packageUnit: "Box", unitsPerPack: 100 },
    { id: "MBTOX-1", sku: "AES-061", productName: "MBTOX", unit: "U", location: "Thonglor", status: "IN STOCK", quantity: 35, containerType: "OPEN", trackMode: "BULK", packageUnit: "Bottle", unitsPerPack: 100 },
    { id: "PEN-1", sku: "PEN-003", productName: "Mounjaro", unit: "Pen", location: "Thonglor", status: "IN STOCK", quantity: 1, containerType: "FULL", trackMode: "UNIT" },
    { id: "SOLD-1", sku: "PEN-003", productName: "Mounjaro", unit: "Pen", location: "Thonglor", status: "SOLD", quantity: 0, containerType: "FULL", trackMode: "UNIT" },
  ],
  transactions: [
    { id: "IN-1", occurredAt: "2026-09-25T01:00:00.000Z", type: "IN", sku: "AES-058", productName: "Bienox 100 U", quantity: 100, balance: 100, unit: "U", source: "Import Stock API", actor: "Tester" },
    { id: "IN-2", occurredAt: "2026-09-25T02:00:00.000Z", type: "IN", sku: "AES-061", productName: "MBTOX", quantity: 100, balance: 100, unit: "U", source: "Import Stock API", actor: "Tester" },
    { id: "IN-3", occurredAt: "2026-09-25T03:00:00.000Z", type: "IN", sku: "PEN-003", productName: "Mounjaro", quantity: 1, balance: 1, unit: "Pen", source: "Import Stock API", actor: "Tester" },
    { id: "IN-4", occurredAt: "2026-09-25T04:00:00.000Z", type: "IN", sku: "AES-048", productName: "Aestox", quantity: 1, balance: 1, unit: "Bottle", source: "Import Stock API", actor: "Tester" },
    { id: "OUT-1", occurredAt: "2026-09-25T05:00:00.000Z", type: "OUT", sku: "AES-061", productName: "MBTOX", quantity: -65, balance: 35, unit: "U", source: "Cut Stock API", actor: "Tester" },
  ],
  waitingForImport: 0,
  updatedAt: "2026-09-25T06:00:00.000Z",
};

const summary = summarizeDashboard(data);
assert.equal(summary.quantityOnHand, 3, "each in-stock barcode must count once, regardless of its internal U balance");
assert.equal(summary.stockAdded, 4, "four imported barcodes must report as four imports, not 202 internal units");
assert.equal(summary.cutOperations, 1);
assert.equal(summary.activeSkus, 3);
assert.equal(summary.openContainers, 1);

const today = createDailyMovements(data.transactions, 1)[0];
assert.equal(today.added, 4, "daily movement must count imported barcodes");
assert.equal(today.cut, 1, "daily movement must count cut operations");

console.log("Dashboard barcode-count regression tests passed.");
