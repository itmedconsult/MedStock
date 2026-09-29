const MEDSTOCK_STOCK_API = {
  PRODUCT_SHEET: "Product List",
  INVENTORY_SHEET: "Inventory",
  LOG_SHEET: "Log Data",
  REGISTRY_SHEET: "BC_Registry",
  TIME_ZONE: "Asia/Bangkok",
  MAX_ITEMS: 100,
  INVENTORY_COLUMNS: 22,
  LOG_COLUMNS: 18
};

function medStockStockOperationDispatch_(body, ss) {
  if (["importStockBatch", "checkStockBatch", "cutStockBatch", "refundStockBatch"].indexOf(body.action) !== -1
      && ss.getSpreadsheetTimeZone() !== MEDSTOCK_STOCK_API.TIME_ZONE) {
    ss.setSpreadsheetTimeZone(MEDSTOCK_STOCK_API.TIME_ZONE);
  }
  if (["importStockBatch", "checkStockBatch", "cutStockBatch", "refundStockBatch"].indexOf(body.action) !== -1) {
    const inventorySheet = ss.getSheetByName(MEDSTOCK_STOCK_API.INVENTORY_SHEET);
    const logSheet = ss.getSheetByName(MEDSTOCK_STOCK_API.LOG_SHEET);
    if (inventorySheet) inventorySheet.getRange("F:G").setNumberFormat("dd/MM/yyyy");
    if (logSheet) logSheet.getRange("A:A").setNumberFormat("dd/MM/yyyy HH:mm:ss");
    if (logSheet) logSheet.getRange("F:G").setNumberFormat("dd/MM/yyyy");
  }
  if (body.action === "importStockBatch") return medStockImportBatch_(body, ss);
  if (body.action === "checkStockBatch") return medStockCheckStockBatch_(body, ss);
  if (body.action === "cutStockBatch") return medStockCutStockBatch_(body, ss);
  if (body.action === "refundStockBatch") return medStockRefundStockBatch_(body, ss);
  return null;
}

function medStockImportBatch_(body, ss) {
  const branch = medStockStockText_(body.branch, 30);
  if (["Thonglor", "Silom"].indexOf(branch) === -1) throw new Error("Select a valid branch.");
  const receivedDate = medStockStockDate_(body.receivedDate, "received date");
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > MEDSTOCK_STOCK_API.MAX_ITEMS) {
    throw new Error("Import queue must contain 1 to " + MEDSTOCK_STOCK_API.MAX_ITEMS + " barcodes.");
  }

  const seen = {};
  const requested = body.items.map(function(value, index) {
    const barcode = medStockStockText_(value && value.barcode, 64).toUpperCase();
    const lotText = medStockStockText_(value && value.lot, 10);
    const expiryText = medStockStockText_(value && value.expiry, 10);
    const quantity = Number(value && value.quantity);
    if (!/^[A-Z]{2,6}-\d{3}-\d{6}-[A-Z]\d{4}$/.test(barcode)) {
      throw new Error("Row " + (index + 1) + " has an invalid barcode.");
    }
    if (seen[barcode]) throw new Error("Duplicate barcode: " + barcode);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Row " + (index + 1) + " has an invalid quantity.");
    seen[barcode] = true;
    return {
      barcode: barcode,
      lot: lotText ? medStockStockDate_(lotText, "lot date at row " + (index + 1)) : "",
      expiry: expiryText ? medStockStockDate_(expiryText, "expiry date at row " + (index + 1)) : "",
      quantity: quantity
    };
  });

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const productSheet = ss.getSheetByName(MEDSTOCK_STOCK_API.PRODUCT_SHEET);
    const inventory = ss.getSheetByName(MEDSTOCK_STOCK_API.INVENTORY_SHEET);
    const log = ss.getSheetByName(MEDSTOCK_STOCK_API.LOG_SHEET);
    const registry = ss.getSheetByName(MEDSTOCK_STOCK_API.REGISTRY_SHEET);
    if (!productSheet || !inventory || !log || !registry) {
      throw new Error("Product List, Inventory, Log Data or BC_Registry sheet is missing.");
    }

    medStockStockAssertHeaders_(inventory, [
      "Unique ID", "SKU", "Product Name", "Category", "Unit", "Lot", "Expiry Date", "Location",
      "Status", "Qty", "Barcode Value", "Received / Count Date", "Notes", "Stock Type", "Initial Qty",
      "Opened At", "Updated At", "Used Up At", "Source Reference", "Updated By", "Track Mode", "Data Set"
    ]);
    medStockStockAssertHeaders_(log, [
      "Timestamp", "Transaction ID", "Unique ID", "SKU", "Product Name", "Lot", "Expiry Date", "Action",
      "Qty Change", "Location", "Staff", "Reference / Note", "Qty Before", "Qty After", "Stock Type",
      "Stock Group", "Source", "Details"
    ]);
    medStockStockAssertHeaders_(registry, [
      "Issued At", "Batch ID", "Barcode", "SKU", "Product Name", "Barcode Date", "Run Code", "Unit",
      "Track Mode", "Status", "Request ID", "Request Snapshot", "Branch", "Source"
    ]);

    const products = {};
    if (productSheet.getLastRow() > 1) {
      productSheet.getRange(2, 1, productSheet.getLastRow() - 1, 14).getDisplayValues().forEach(function(row) {
        const sku = String(row[0] || "").trim().toUpperCase();
        if (!sku || String(row[7] || "").trim().toUpperCase() !== "YES") return;
        products[sku] = {
          sku: sku,
          category: String(row[2] || "").trim(),
          name: String(row[3] || "").trim(),
          unit: String(row[4] || "").trim(),
          trackMode: String(row[5] || "").trim().toUpperCase(),
          stockGroup: String(row[8] || sku.split("-")[0]).trim().toUpperCase(),
          packageUnit: String(row[12] || "").trim(),
          unitsPerPack: Number(row[13]) || 0
        };
      });
    }

    const registryByBarcode = {};
    if (registry.getLastRow() > 1) {
      registry.getRange(2, 1, registry.getLastRow() - 1, 14).getDisplayValues().forEach(function(row, index) {
        const barcode = String(row[2] || "").trim().toUpperCase();
        if (!barcode) return;
        if (!registryByBarcode[barcode]) registryByBarcode[barcode] = [];
        registryByBarcode[barcode].push({ row: row, sheetRow: index + 2 });
      });
    }

    const inventoryBarcodes = {};
    if (inventory.getLastRow() > 1) {
      inventory.getRange(2, 1, inventory.getLastRow() - 1, 11).getDisplayValues().forEach(function(row) {
        [row[0], row[10]].forEach(function(value) {
          const barcode = String(value || "").trim().toUpperCase();
          if (barcode) inventoryBarcodes[barcode] = true;
        });
      });
    }

    const items = requested.map(function(item) {
      const match = /^([A-Z]{2,6}-\d{3})-(\d{6})-([A-Z]\d{4})$/.exec(item.barcode);
      if (!match || Number(match[3].slice(1)) === 0) throw new Error("Invalid barcode format: " + item.barcode);
      const sku = match[1];
      const product = products[sku];
      if (!product) throw new Error("Unknown or inactive SKU: " + sku);
      const matches = registryByBarcode[item.barcode] || [];
      if (matches.length !== 1) {
        throw new Error(matches.length ? "Duplicate barcode in BC_Registry: " + item.barcode : "Barcode was not issued in BC_Registry: " + item.barcode);
      }
      const registered = matches[0];
      const registeredSku = String(registered.row[3] || "").trim().toUpperCase();
      const registeredName = String(registered.row[4] || "").trim();
      const status = String(registered.row[9] || "").trim().toUpperCase();
      const registeredBranch = String(registered.row[12] || "").trim();
      if (registeredSku !== sku) throw new Error("Barcode SKU does not match BC_Registry: " + item.barcode);
      if (registeredName !== product.name) throw new Error("Barcode product mapping is no longer current: " + item.barcode);
      if (status !== "ISSUED") throw new Error("Barcode is not available for import (" + status + "): " + item.barcode);
      if (registeredBranch && registeredBranch !== branch) throw new Error("Barcode belongs to " + registeredBranch + ": " + item.barcode);
      if (inventoryBarcodes[item.barcode]) throw new Error("Barcode is already in Inventory: " + item.barcode);
      if (product.trackMode === "UNIT" && item.quantity !== 1) throw new Error("Unit-tracked barcode quantity must be 1: " + item.barcode);
      medStockValidatePackImport_(product, item.quantity);
      return {
        barcode: item.barcode,
        lot: item.lot,
        expiry: item.expiry,
        quantity: item.quantity,
        product: product,
        registryRow: registered.sheetRow
      };
    });

    const now = new Date();
    const zone = ss.getSpreadsheetTimeZone() || "Asia/Bangkok";
    const batchId = "IMPORT-WEB-" + Utilities.formatDate(now, zone, "yyyyMMdd-HHmmss") + "-" + Utilities.getUuid().slice(0, 6).toUpperCase();
    const staff = Session.getActiveUser().getEmail() || "MedStock Web";
    const inventoryRows = items.map(function(item) {
      return [
        item.barcode, item.product.sku, item.product.name, item.product.category, item.product.unit,
        item.lot, item.expiry || "", branch, "IN STOCK", item.quantity, item.barcode, receivedDate,
        "Imported from MedStock web — " + batchId, "FULL", item.quantity, "", now, "", batchId, staff,
        item.product.trackMode, "LIVE"
      ];
    });
    const logRows = items.map(function(item, index) {
      return [
        now, batchId + "-" + String(index + 1).padStart(3, "0"), item.barcode, item.product.sku,
        item.product.name, item.lot, item.expiry || "", "IMPORT", item.quantity, branch, staff, batchId,
        0, item.quantity, "FULL", item.product.stockGroup, "Import Stock API",
        "Received " + Utilities.formatDate(receivedDate, zone, "yyyy-MM-dd")
      ];
    });

    const inventoryStart = medStockStockFindEmptyBlock_(
      inventory,
      inventoryRows.length,
      MEDSTOCK_STOCK_API.INVENTORY_COLUMNS
    );
    const logStart = medStockStockFindEmptyBlock_(
      log,
      logRows.length,
      MEDSTOCK_STOCK_API.LOG_COLUMNS
    );
    medStockStockEnsureRows_(inventory, inventoryStart + inventoryRows.length - 1);
    medStockStockEnsureRows_(log, logStart + logRows.length - 1);
    medStockStockCopyRowFormat_(inventory, inventoryStart, inventoryRows.length, MEDSTOCK_STOCK_API.INVENTORY_COLUMNS);
    medStockStockCopyRowFormat_(log, logStart, logRows.length, MEDSTOCK_STOCK_API.LOG_COLUMNS);

    let inventoryWritten = false;
    let logWritten = false;
    let registryUpdated = false;
    try {
      inventory.getRange(inventoryStart, 1, inventoryRows.length, MEDSTOCK_STOCK_API.INVENTORY_COLUMNS).setValues(inventoryRows);
      inventoryWritten = true;
      log.getRange(logStart, 1, logRows.length, MEDSTOCK_STOCK_API.LOG_COLUMNS).setValues(logRows);
      logWritten = true;
      registry.getRangeList(items.map(function(item) { return "J" + item.registryRow; })).setValue("IMPORTED");
      registryUpdated = true;
      SpreadsheetApp.flush();
    } catch (error) {
      if (inventoryWritten) inventory.getRange(inventoryStart, 1, inventoryRows.length, MEDSTOCK_STOCK_API.INVENTORY_COLUMNS).clearContent();
      if (logWritten) log.getRange(logStart, 1, logRows.length, MEDSTOCK_STOCK_API.LOG_COLUMNS).clearContent();
      if (registryUpdated) registry.getRangeList(items.map(function(item) { return "J" + item.registryRow; })).setValue("ISSUED");
      SpreadsheetApp.flush();
      throw new Error("Import was rolled back: " + (error && error.message ? error.message : error));
    }

    return { ok: true, batchId: batchId, importedCount: items.length };
  } finally {
    lock.releaseLock();
  }
}

function medStockCheckStockBatch_(body, ss) {
  const branch = medStockStockText_(body.branch, 30);
  if (["Thonglor", "Silom"].indexOf(branch) === -1) throw new Error("Select a valid branch.");
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > MEDSTOCK_STOCK_API.MAX_ITEMS) {
    throw new Error("Check queue must contain 1 to " + MEDSTOCK_STOCK_API.MAX_ITEMS + " barcodes.");
  }

  const seen = {};
  const requested = body.items.map(function(value, index) {
    const id = medStockStockText_(value && value.id, 64).toUpperCase();
    const note = medStockStockText_(value && value.note, 500);
    const actualType = medStockStockText_(value && value.actualType, 10).toUpperCase();
    const actualQuantity = Number(value && value.actualQuantity);
    if (!id) throw new Error("Row " + (index + 1) + " is missing a barcode.");
    if (seen[id]) throw new Error("Duplicate barcode: " + id);
    if (["FULL", "OPEN"].indexOf(actualType) === -1) throw new Error("Row " + (index + 1) + " has an invalid stock type.");
    if (!Number.isFinite(actualQuantity) || actualQuantity < 0 || Math.abs(actualQuantity * 1000000 - Math.round(actualQuantity * 1000000)) > 0.000001) {
      throw new Error("Row " + (index + 1) + " has an invalid actual quantity.");
    }
    seen[id] = true;
    return { id: id, note: note, actualType: actualType, actualQuantity: medStockStockRound_(actualQuantity) };
  });

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const inventory = ss.getSheetByName(MEDSTOCK_STOCK_API.INVENTORY_SHEET);
    const log = ss.getSheetByName(MEDSTOCK_STOCK_API.LOG_SHEET);
    if (!inventory || !log) throw new Error("Inventory or Log Data sheet is missing.");
    medStockStockAssertHeaders_(inventory, [
      "Unique ID", "SKU", "Product Name", "Category", "Unit", "Lot", "Expiry Date", "Location",
      "Status", "Qty", "Barcode Value", "Received / Count Date", "Notes", "Stock Type", "Initial Qty",
      "Opened At", "Updated At", "Used Up At", "Source Reference", "Updated By", "Track Mode", "Data Set"
    ]);
    medStockStockAssertHeaders_(log, [
      "Timestamp", "Transaction ID", "Unique ID", "SKU", "Product Name", "Lot", "Expiry Date", "Action",
      "Qty Change", "Location", "Staff", "Reference / Note", "Qty Before", "Qty After", "Stock Type",
      "Stock Group", "Source", "Details"
    ]);
    if (inventory.getLastRow() < 2) throw new Error("Inventory is empty.");

    const inventoryValues = inventory.getRange(2, 1, inventory.getLastRow() - 1, MEDSTOCK_STOCK_API.INVENTORY_COLUMNS).getValues();
    const items = requested.map(function(item) {
      const matches = [];
      inventoryValues.forEach(function(row, index) {
        const uniqueId = String(row[0] || "").trim().toUpperCase();
        const barcode = String(row[10] || "").trim().toUpperCase();
        if (uniqueId === item.id || barcode === item.id) matches.push({ row: row, sheetRow: index + 2 });
      });
      if (matches.length !== 1) {
        throw new Error(matches.length ? "Duplicate barcode in Inventory: " + item.id : "Barcode not found in Inventory: " + item.id);
      }
      const match = matches[0];
      const row = match.row;
      const itemBranch = String(row[7] || "").trim();
      const typeBefore = String(row[13] || "").trim().toUpperCase();
      const statusBefore = String(row[8] || "").trim().toUpperCase();
      const trackMode = String(row[20] || "").trim().toUpperCase();
      const quantityBefore = Number(row[9]);
      medStockValidatePackCheck_(ss, row, item.actualQuantity, item.actualType);
      if (itemBranch !== branch) throw new Error("Barcode belongs to " + itemBranch + ": " + item.id);
      if (["FULL", "OPEN"].indexOf(typeBefore) === -1) throw new Error("Inventory stock type must be FULL or OPEN: " + item.id);
      if (["UNIT", "BULK"].indexOf(trackMode) === -1) throw new Error("Inventory Track Mode is invalid: " + item.id);
      if (!Number.isFinite(quantityBefore) || quantityBefore < 0) throw new Error("Inventory quantity is invalid: " + item.id);
      if (trackMode === "UNIT" && item.actualQuantity !== 0 && item.actualQuantity !== 1) {
        throw new Error("Unit-tracked quantity must be 0 or 1: " + item.id);
      }
      const statusAfter = item.actualQuantity > 0 ? "IN STOCK" : statusBefore === "SOLD" ? "SOLD" : "OUT OF STOCK";
      const changed = item.actualQuantity !== quantityBefore || item.actualType !== typeBefore || statusAfter !== statusBefore;
      if (changed && !item.note) throw new Error("Reason / note is required when stock changes: " + item.id);
      return {
        id: item.id,
        note: item.note,
        actualType: item.actualType,
        actualQuantity: item.actualQuantity,
        sheetRow: match.sheetRow,
        row: row,
        sku: String(row[1] || "").trim().toUpperCase(),
        productName: String(row[2] || "").trim(),
        branch: itemBranch,
        typeBefore: typeBefore,
        statusBefore: statusBefore,
        trackMode: trackMode,
        quantityBefore: quantityBefore,
        statusAfter: statusAfter,
        difference: medStockStockRound_(item.actualQuantity - quantityBefore)
      };
    });

    const pendingByRow = {};
    items.forEach(function(item) { pendingByRow[item.sheetRow] = item; });
    const openBySkuBranch = {};
    inventoryValues.forEach(function(row, index) {
      const sheetRow = index + 2;
      const pending = pendingByRow[sheetRow];
      const quantity = pending ? pending.actualQuantity : Number(row[9]);
      const type = pending ? pending.actualType : String(row[13] || "").trim().toUpperCase();
      const sku = String(row[1] || "").trim().toUpperCase();
      const location = String(row[7] || "").trim();
      if (Number.isFinite(quantity) && quantity > 0 && type === "OPEN") {
        const key = sku + "|" + location;
        if (!openBySkuBranch[key]) openBySkuBranch[key] = [];
        openBySkuBranch[key].push(String(row[0] || row[10] || sheetRow));
      }
    });
    items.forEach(function(item) {
      const key = item.sku + "|" + item.branch;
      const openItems = openBySkuBranch[key] || [];
      if (openItems.length > 1) throw new Error("Only one OPEN item is allowed for " + key + ": " + openItems.join(", "));
    });

    const now = new Date();
    const zone = ss.getSpreadsheetTimeZone() || "Asia/Bangkok";
    const batchId = "CHECK-WEB-" + Utilities.formatDate(now, zone, "yyyyMMdd-HHmmss") + "-" + Utilities.getUuid().slice(0, 6).toUpperCase();
    const staff = Session.getActiveUser().getEmail() || "MedStock Web";
    const logRows = items.map(function(item, index) {
      return [
        now, batchId + "-" + String(index + 1).padStart(3, "0"), item.id, item.sku, item.productName,
        item.row[5] || "", item.row[6] || "", "CHECK STOCK", item.difference, item.branch, staff,
        item.note || "Physical stock verified", item.quantityBefore, item.actualQuantity, item.actualType,
        item.sku.split("-")[0], "Check Stock API",
        "Type " + item.typeBefore + " -> " + item.actualType + "; Status " + item.statusBefore + " -> " + item.statusAfter
      ];
    });

    const logStart = medStockStockFindEmptyBlock_(
      log,
      logRows.length,
      MEDSTOCK_STOCK_API.LOG_COLUMNS
    );
    medStockStockEnsureRows_(log, logStart + logRows.length - 1);
    medStockStockCopyRowFormat_(log, logStart, logRows.length, MEDSTOCK_STOCK_API.LOG_COLUMNS);
    let logWritten = false;
    let inventoryWritten = false;
    try {
      log.getRange(logStart, 1, logRows.length, MEDSTOCK_STOCK_API.LOG_COLUMNS).setValues(logRows);
      logWritten = true;
      items.forEach(function(item) {
        inventory.getRange(item.sheetRow, 9).setValue(item.statusAfter);
        inventory.getRange(item.sheetRow, 10).setValue(item.actualQuantity);
        inventory.getRange(item.sheetRow, 14).setValue(item.actualType);
        inventory.getRange(item.sheetRow, 17).setValue(now);
        inventory.getRange(item.sheetRow, 19).setValue(batchId);
        inventory.getRange(item.sheetRow, 20).setValue(staff);
      });
      inventoryWritten = true;
      SpreadsheetApp.flush();
    } catch (error) {
      if (logWritten) log.getRange(logStart, 1, logRows.length, MEDSTOCK_STOCK_API.LOG_COLUMNS).clearContent();
      if (inventoryWritten || logWritten) {
        items.forEach(function(item) {
          inventory.getRange(item.sheetRow, 9).setValue(item.row[8]);
          inventory.getRange(item.sheetRow, 10).setValue(item.row[9]);
          inventory.getRange(item.sheetRow, 14).setValue(item.row[13]);
          inventory.getRange(item.sheetRow, 17).setValue(item.row[16]);
          inventory.getRange(item.sheetRow, 19).setValue(item.row[18]);
          inventory.getRange(item.sheetRow, 20).setValue(item.row[19]);
        });
      }
      SpreadsheetApp.flush();
      throw new Error("Check was rolled back: " + (error && error.message ? error.message : error));
    }
    return { ok: true, batchId: batchId, processedCount: items.length };
  } finally {
    lock.releaseLock();
  }
}

function medStockCutStockBatch_(body, ss) {
  const branch = medStockStockText_(body.branch, 30);
  if (["Thonglor", "Silom"].indexOf(branch) === -1) throw new Error("Select a valid branch.");
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > MEDSTOCK_STOCK_API.MAX_ITEMS) {
    throw new Error("Cut queue must contain 1 to " + MEDSTOCK_STOCK_API.MAX_ITEMS + " barcodes.");
  }

  const seen = {};
  const requested = body.items.map(function(value, index) {
    const id = medStockStockText_(value && value.id, 64).toUpperCase();
    const cutReason = medStockStockText_(value && value.cutReason, 10).toUpperCase();
    const cutMode = medStockStockText_(value && value.cutMode, 10).toUpperCase();
    const cutQuantity = Number(value && value.cutQuantity);
    if (!id) throw new Error("Row " + (index + 1) + " is missing a barcode.");
    if (seen[id]) throw new Error("Duplicate barcode: " + id);
    if (["SALE", "USE"].indexOf(cutReason) === -1) throw new Error("Row " + (index + 1) + " has an invalid reason.");
    if (["ALL", "PARTIAL"].indexOf(cutMode) === -1) throw new Error("Row " + (index + 1) + " has an invalid cut mode.");
    if (!Number.isFinite(cutQuantity) || cutQuantity <= 0 || Math.abs(cutQuantity * 1000000 - Math.round(cutQuantity * 1000000)) > 0.000001) {
      throw new Error("Row " + (index + 1) + " has an invalid cut quantity.");
    }
    seen[id] = true;
    return { id: id, cutReason: cutReason, cutMode: cutMode, cutQuantity: medStockStockRound_(cutQuantity) };
  });

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const inventory = ss.getSheetByName(MEDSTOCK_STOCK_API.INVENTORY_SHEET);
    const log = ss.getSheetByName(MEDSTOCK_STOCK_API.LOG_SHEET);
    if (!inventory || !log) throw new Error("Inventory or Log Data sheet is missing.");
    medStockStockAssertHeaders_(inventory, [
      "Unique ID", "SKU", "Product Name", "Category", "Unit", "Lot", "Expiry Date", "Location",
      "Status", "Qty", "Barcode Value", "Received / Count Date", "Notes", "Stock Type", "Initial Qty",
      "Opened At", "Updated At", "Used Up At", "Source Reference", "Updated By", "Track Mode", "Data Set"
    ]);
    medStockStockAssertHeaders_(log, [
      "Timestamp", "Transaction ID", "Unique ID", "SKU", "Product Name", "Lot", "Expiry Date", "Action",
      "Qty Change", "Location", "Staff", "Reference / Note", "Qty Before", "Qty After", "Stock Type",
      "Stock Group", "Source", "Details"
    ]);
    if (inventory.getLastRow() < 2) throw new Error("Inventory is empty.");

    const inventoryValues = inventory.getRange(2, 1, inventory.getLastRow() - 1, MEDSTOCK_STOCK_API.INVENTORY_COLUMNS).getValues();
    const items = requested.map(function(item) {
      const matches = [];
      inventoryValues.forEach(function(row, index) {
        const uniqueId = String(row[0] || "").trim().toUpperCase();
        const barcode = String(row[10] || "").trim().toUpperCase();
        if (uniqueId === item.id || barcode === item.id) matches.push({ row: row, sheetRow: index + 2 });
      });
      if (matches.length !== 1) throw new Error(matches.length ? "Duplicate barcode in Inventory: " + item.id : "Barcode not found in Inventory: " + item.id);
      const match = matches[0];
      const row = match.row;
      const itemBranch = String(row[7] || "").trim();
      const statusBefore = String(row[8] || "").trim().toUpperCase();
      const quantityBefore = Number(row[9]);
      const typeBefore = String(row[13] || "").trim().toUpperCase();
      const trackMode = String(row[20] || "").trim().toUpperCase();
      if (itemBranch !== branch) throw new Error("Barcode belongs to " + itemBranch + ": " + item.id);
      if (statusBefore !== "IN STOCK" || !Number.isFinite(quantityBefore) || quantityBefore <= 0) throw new Error("Item is not available in stock: " + item.id);
      if (["FULL", "OPEN"].indexOf(typeBefore) === -1) throw new Error("Inventory stock type must be FULL or OPEN: " + item.id);
      if (["UNIT", "BULK"].indexOf(trackMode) === -1) throw new Error("Inventory Track Mode is invalid: " + item.id);
      const amount = item.cutMode === "ALL" ? quantityBefore : item.cutQuantity;
      medStockValidatePackCut_(ss, row, amount);
      if (amount <= 0 || amount > quantityBefore) throw new Error("Insufficient quantity: " + item.id);
      if (trackMode === "UNIT" && (item.cutMode !== "ALL" || quantityBefore !== 1 || amount !== 1)) {
        throw new Error("Unit-tracked stock must use ALL with quantity 1: " + item.id);
      }
      const quantityAfter = medStockStockRound_(quantityBefore - amount);
      const typeAfter = item.cutMode === "PARTIAL" ? "OPEN" : typeBefore;
      const statusAfter = quantityAfter > 0 ? "IN STOCK" : item.cutReason === "SALE" && item.cutMode === "ALL" ? "SOLD" : "OUT OF STOCK";
      return {
        id: item.id, cutReason: item.cutReason, cutMode: item.cutMode, amount: amount,
        quantityAfter: quantityAfter, typeAfter: typeAfter, statusAfter: statusAfter,
        sheetRow: match.sheetRow, row: row, sku: String(row[1] || "").trim().toUpperCase(),
        productName: String(row[2] || "").trim(), branch: itemBranch, quantityBefore: quantityBefore,
        typeBefore: typeBefore, statusBefore: statusBefore, trackMode: trackMode
      };
    });

    const pendingByRow = {};
    items.forEach(function(item) { pendingByRow[item.sheetRow] = item; });
    const openBySkuBranch = {};
    inventoryValues.forEach(function(row, index) {
      const pending = pendingByRow[index + 2];
      const quantity = pending ? pending.quantityAfter : Number(row[9]);
      const type = pending ? pending.typeAfter : String(row[13] || "").trim().toUpperCase();
      const sku = String(row[1] || "").trim().toUpperCase();
      const location = String(row[7] || "").trim();
      if (Number.isFinite(quantity) && quantity > 0 && type === "OPEN") {
        const key = sku + "|" + location;
        if (!openBySkuBranch[key]) openBySkuBranch[key] = [];
        openBySkuBranch[key].push(String(row[0] || row[10] || index + 2));
      }
    });
    items.forEach(function(item) {
      const key = item.sku + "|" + item.branch;
      const openItems = openBySkuBranch[key] || [];
      if (openItems.length > 1) throw new Error("Only one OPEN item is allowed for " + key + ": " + openItems.join(", "));
    });

    const now = new Date();
    const zone = ss.getSpreadsheetTimeZone() || "Asia/Bangkok";
    const batchId = "CUT-WEB-" + Utilities.formatDate(now, zone, "yyyyMMdd-HHmmss") + "-" + Utilities.getUuid().slice(0, 6).toUpperCase();
    const staff = Session.getActiveUser().getEmail() || "MedStock Web";
    const logRows = items.map(function(item, index) {
      return [
        now, batchId + "-" + String(index + 1).padStart(3, "0"), item.id, item.sku, item.productName,
        item.row[5] || "", item.row[6] || "", item.cutReason === "SALE" ? "SALE" : "STOCK OUT", -item.amount,
        item.branch, staff, batchId, item.quantityBefore, item.quantityAfter, item.typeAfter,
        item.sku.split("-")[0], "Cut Stock API",
        item.cutMode + "; " + item.typeBefore + " -> " + item.typeAfter + "; status " + item.statusAfter
      ];
    });

    const logStart = medStockStockFindEmptyBlock_(
      log,
      logRows.length,
      MEDSTOCK_STOCK_API.LOG_COLUMNS
    );
    medStockStockEnsureRows_(log, logStart + logRows.length - 1);
    medStockStockCopyRowFormat_(log, logStart, logRows.length, MEDSTOCK_STOCK_API.LOG_COLUMNS);
    const originalLog = log.getRange(logStart, 1, logRows.length, MEDSTOCK_STOCK_API.LOG_COLUMNS).getValues();
    const changed = [];
    let logAttempted = false;
    try {
      items.slice().sort(function(a, b) { return (a.quantityAfter === 0 ? 0 : 1) - (b.quantityAfter === 0 ? 0 : 1); }).forEach(function(item) {
        changed.push(item);
        const extra = item.row.slice(13, 20);
        extra[0] = item.typeAfter;
        if (extra[1] === "" || extra[1] == null) extra[1] = item.quantityBefore;
        if (item.cutMode === "PARTIAL" && !extra[2]) extra[2] = now;
        extra[3] = now;
        if (item.quantityAfter === 0) extra[4] = now;
        extra[5] = batchId;
        extra[6] = staff;
        inventory.getRange(item.sheetRow, 9, 1, 2).setValues([[item.statusAfter, item.quantityAfter]]);
        inventory.getRange(item.sheetRow, 14, 1, 7).setValues([extra]);
      });
      logAttempted = true;
      log.getRange(logStart, 1, logRows.length, MEDSTOCK_STOCK_API.LOG_COLUMNS).setValues(logRows);
      SpreadsheetApp.flush();
    } catch (error) {
      const failures = [];
      changed.forEach(function(item) {
        try {
          inventory.getRange(item.sheetRow, 9, 1, 2).setValues([item.row.slice(8, 10)]);
          inventory.getRange(item.sheetRow, 14, 1, 7).setValues([item.row.slice(13, 20)]);
        } catch (rollbackError) {
          failures.push(item.id);
        }
      });
      if (logAttempted) {
        try {
          log.getRange(logStart, 1, logRows.length, MEDSTOCK_STOCK_API.LOG_COLUMNS).setValues(originalLog);
        } catch (rollbackError) {
          failures.push("Log Data");
        }
      }
      SpreadsheetApp.flush();
      if (failures.length) throw new Error("RECONCILIATION REQUIRED for " + batchId + ": " + failures.join(", "));
      throw new Error("Cut was rolled back: " + (error && error.message ? error.message : error));
    }
    return { ok: true, batchId: batchId, processedCount: items.length };
  } finally {
    lock.releaseLock();
  }
}

function medStockRefundStockBatch_(body, ss) {
  const branch = medStockStockText_(body.branch, 30);
  if (["Thonglor", "Silom"].indexOf(branch) === -1) throw new Error("Select a valid branch.");
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > MEDSTOCK_STOCK_API.MAX_ITEMS) {
    throw new Error("Refund queue must contain 1 to " + MEDSTOCK_STOCK_API.MAX_ITEMS + " sale transactions.");
  }

  const seen = {};
  const requested = body.items.map(function(value, index) {
    const transactionId = medStockStockText_(value && value.transactionId, 80).toUpperCase();
    const refundQuantity = Number(value && value.refundQuantity);
    if (!transactionId) throw new Error("Row " + (index + 1) + " is missing a sale transaction ID.");
    if (seen[transactionId]) throw new Error("Duplicate sale transaction: " + transactionId);
    if (!Number.isFinite(refundQuantity) || refundQuantity <= 0 || Math.abs(refundQuantity * 1000000 - Math.round(refundQuantity * 1000000)) > 0.000001) {
      throw new Error("Row " + (index + 1) + " has an invalid refund quantity.");
    }
    if (!value || value.restockableConfirmed !== true) {
      throw new Error("Returned stock must be confirmed unopened and ready for sale.");
    }
    seen[transactionId] = true;
    return { transactionId: transactionId, refundQuantity: medStockStockRound_(refundQuantity) };
  });

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const inventory = ss.getSheetByName(MEDSTOCK_STOCK_API.INVENTORY_SHEET);
    const log = ss.getSheetByName(MEDSTOCK_STOCK_API.LOG_SHEET);
    if (!inventory || !log) throw new Error("Inventory or Log Data sheet is missing.");
    medStockStockAssertHeaders_(inventory, [
      "Unique ID", "SKU", "Product Name", "Category", "Unit", "Lot", "Expiry Date", "Location",
      "Status", "Qty", "Barcode Value", "Received / Count Date", "Notes", "Stock Type", "Initial Qty",
      "Opened At", "Updated At", "Used Up At", "Source Reference", "Updated By", "Track Mode", "Data Set"
    ]);
    medStockStockAssertHeaders_(log, [
      "Timestamp", "Transaction ID", "Unique ID", "SKU", "Product Name", "Lot", "Expiry Date", "Action",
      "Qty Change", "Location", "Staff", "Reference / Note", "Qty Before", "Qty After", "Stock Type",
      "Stock Group", "Source", "Details"
    ]);
    if (inventory.getLastRow() < 2 || log.getLastRow() < 2) throw new Error("Inventory or Log Data is empty.");

    const inventoryValues = inventory.getRange(2, 1, inventory.getLastRow() - 1, MEDSTOCK_STOCK_API.INVENTORY_COLUMNS).getValues();
    const logValues = log.getRange(2, 1, log.getLastRow() - 1, MEDSTOCK_STOCK_API.LOG_COLUMNS).getValues();
    const items = requested.map(function(item) {
      const saleMatches = logValues.filter(function(row) {
        return String(row[1] || "").trim().toUpperCase() === item.transactionId;
      });
      if (saleMatches.length !== 1) throw new Error(saleMatches.length ? "Duplicate transaction in Log Data: " + item.transactionId : "Sale transaction not found: " + item.transactionId);
      const sale = saleMatches[0];
      const saleAction = String(sale[7] || "").trim().toUpperCase();
      const uniqueId = String(sale[2] || "").trim().toUpperCase();
      const saleQuantity = Math.abs(Number(sale[8]));
      const saleBranch = String(sale[9] || "").trim();
      if (saleAction !== "SALE" || !Number.isFinite(saleQuantity) || saleQuantity <= 0) throw new Error("Only SALE transactions can be refunded: " + item.transactionId);
      if (!uniqueId) throw new Error("Sale transaction has no Unique ID: " + item.transactionId);
      if (saleBranch !== branch) throw new Error("Sale belongs to " + saleBranch + ": " + item.transactionId);

      let refunded = 0;
      logValues.forEach(function(row) {
        const action = String(row[7] || "").trim().toUpperCase();
        const reference = String(row[11] || "").trim().toUpperCase();
        if (action === "REFUND" && reference === item.transactionId) refunded += Math.max(0, Number(row[8]) || 0);
      });
      refunded = medStockStockRound_(refunded);
      const refundable = medStockStockRound_(saleQuantity - refunded);
      if (refundable <= 0) throw new Error("Sale transaction is already fully refunded: " + item.transactionId);
      if (item.refundQuantity > refundable) throw new Error("Refund quantity exceeds the remaining " + refundable + ": " + item.transactionId);

      const inventoryMatches = [];
      inventoryValues.forEach(function(row, index) {
        const rowUniqueId = String(row[0] || "").trim().toUpperCase();
        const barcode = String(row[10] || "").trim().toUpperCase();
        if (rowUniqueId === uniqueId || barcode === uniqueId) inventoryMatches.push({ row: row, sheetRow: index + 2 });
      });
      if (inventoryMatches.length !== 1) throw new Error(inventoryMatches.length ? "Duplicate barcode in Inventory: " + uniqueId : "Barcode not found in Inventory: " + uniqueId);
      const match = inventoryMatches[0];
      const row = match.row;
      const quantityBefore = Number(row[9]);
      const initialQuantity = Number(row[14]);
      if (!Number.isFinite(quantityBefore) || quantityBefore < 0) throw new Error("Inventory quantity is invalid: " + uniqueId);
      const quantityAfter = medStockStockRound_(quantityBefore + item.refundQuantity);
      if (Number.isFinite(initialQuantity) && initialQuantity > 0 && quantityAfter > initialQuantity) {
        throw new Error("Refund would exceed the initial quantity for " + uniqueId + ".");
      }
      const currentType = String(row[13] || sale[14] || "FULL").trim().toUpperCase();
      const saleType = String(sale[14] || currentType).trim().toUpperCase();
      const fullyRestored = Number.isFinite(initialQuantity) && initialQuantity > 0 && quantityAfter === initialQuantity;
      const typeAfter = fullyRestored && currentType === "FULL" && saleType === "FULL" ? "FULL" : "OPEN";
      if (["FULL", "OPEN"].indexOf(typeAfter) === -1) throw new Error("Refund stock type is invalid: " + uniqueId);
      const sku = String(row[1] || "").trim().toUpperCase();
      if (typeAfter === "OPEN") {
        const otherOpen = inventoryValues.some(function(other, index) {
          return index + 2 !== match.sheetRow
            && String(other[1] || "").trim().toUpperCase() === sku
            && String(other[7] || "").trim() === branch
            && String(other[13] || "").trim().toUpperCase() === "OPEN"
            && String(other[8] || "").trim().toUpperCase() === "IN STOCK"
            && Number(other[9]) > 0;
        });
        if (otherOpen) throw new Error("Refund would create a second OPEN barcode for " + sku + ". Finish the current opened stock first.");
      }
      return {
        transactionId: item.transactionId, amount: item.refundQuantity, uniqueId: uniqueId,
        sheetRow: match.sheetRow, row: row, sku: sku, productName: String(row[2] || sale[4] || sku).trim(),
        branch: branch, quantityBefore: quantityBefore, quantityAfter: quantityAfter, typeAfter: typeAfter
      };
    });

    const now = new Date();
    const zone = ss.getSpreadsheetTimeZone() || MEDSTOCK_STOCK_API.TIME_ZONE;
    const batchId = "REFUND-WEB-" + Utilities.formatDate(now, zone, "yyyyMMdd-HHmmss") + "-" + Utilities.getUuid().slice(0, 6).toUpperCase();
    const staff = Session.getActiveUser().getEmail() || "MedStock Web";
    const logRows = items.map(function(item, index) {
      return [
        now, batchId + "-" + String(index + 1).padStart(3, "0"), item.uniqueId, item.sku, item.productName,
        item.row[5] || "", item.row[6] || "", "REFUND", item.amount, item.branch, staff, item.transactionId,
        item.quantityBefore, item.quantityAfter, item.typeAfter, item.sku.split("-")[0], "Refund Stock API",
        "Restockable customer return; original sale " + item.transactionId
      ];
    });

    const logStart = medStockStockFindEmptyBlock_(log, logRows.length, MEDSTOCK_STOCK_API.LOG_COLUMNS);
    medStockStockEnsureRows_(log, logStart + logRows.length - 1);
    medStockStockCopyRowFormat_(log, logStart, logRows.length, MEDSTOCK_STOCK_API.LOG_COLUMNS);
    const originalLog = log.getRange(logStart, 1, logRows.length, MEDSTOCK_STOCK_API.LOG_COLUMNS).getValues();
    const changed = [];
    let logAttempted = false;
    try {
      items.forEach(function(item) {
        changed.push(item);
        const extra = item.row.slice(13, 20);
        extra[0] = item.typeAfter;
        extra[3] = now;
        extra[4] = "";
        extra[5] = batchId;
        extra[6] = staff;
        inventory.getRange(item.sheetRow, 9, 1, 2).setValues([["IN STOCK", item.quantityAfter]]);
        inventory.getRange(item.sheetRow, 14, 1, 7).setValues([extra]);
      });
      logAttempted = true;
      log.getRange(logStart, 1, logRows.length, MEDSTOCK_STOCK_API.LOG_COLUMNS).setValues(logRows);
      SpreadsheetApp.flush();
    } catch (error) {
      const failures = [];
      changed.forEach(function(item) {
        try {
          inventory.getRange(item.sheetRow, 9, 1, 2).setValues([item.row.slice(8, 10)]);
          inventory.getRange(item.sheetRow, 14, 1, 7).setValues([item.row.slice(13, 20)]);
        } catch (rollbackError) {
          failures.push(item.uniqueId);
        }
      });
      if (logAttempted) {
        try {
          log.getRange(logStart, 1, logRows.length, MEDSTOCK_STOCK_API.LOG_COLUMNS).setValues(originalLog);
        } catch (rollbackError) {
          failures.push("Log Data");
        }
      }
      SpreadsheetApp.flush();
      if (failures.length) throw new Error("RECONCILIATION REQUIRED for " + batchId + ": " + failures.join(", "));
      throw new Error("Refund was rolled back: " + (error && error.message ? error.message : error));
    }
    return { ok: true, batchId: batchId, processedCount: items.length };
  } finally {
    lock.releaseLock();
  }
}

function medStockStockAssertHeaders_(sheet, expected) {
  if (sheet.getMaxColumns() < expected.length) throw new Error(sheet.getName() + " does not have the expected columns.");
  const current = sheet.getRange(1, 1, 1, expected.length).getDisplayValues()[0];
  expected.forEach(function(header, index) {
    if (String(current[index] || "").trim() !== header) throw new Error(sheet.getName() + " header changed at column " + (index + 1) + ": " + header);
  });
}

function medStockStockText_(value, maxLength) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function medStockStockDate_(value, field) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) throw new Error("Invalid " + field + ".");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) {
    throw new Error("Invalid " + field + ".");
  }
  return date;
}

function medStockStockRound_(value) {
  return Math.round(Number(value) * 1000000) / 1000000;
}

function medStockStockEnsureRows_(sheet, requiredLastRow) {
  if (sheet.getMaxRows() < requiredLastRow) sheet.insertRowsAfter(sheet.getMaxRows(), requiredLastRow - sheet.getMaxRows());
}

function medStockStockFindEmptyBlock_(sheet, rowCount, columnCount) {
  const firstDataRow = 2;
  const rowsToScan = Math.max(sheet.getMaxRows() - firstDataRow + 1, 0);
  if (!rowsToScan) return firstDataRow;

  const values = sheet.getRange(firstDataRow, 1, rowsToScan, columnCount).getDisplayValues();
  let emptyRun = 0;
  for (let index = 0; index < values.length; index += 1) {
    const isEmpty = values[index].every(function(value) {
      return String(value == null ? "" : value).trim() === "";
    });
    emptyRun = isEmpty ? emptyRun + 1 : 0;
    if (emptyRun === rowCount) return firstDataRow + index - rowCount + 1;
  }
  return sheet.getMaxRows() + 1;
}

function medStockStockCopyRowFormat_(sheet, startRow, rowCount, columnCount) {
  const sourceRow = Math.max(2, startRow - 1);
  if (sourceRow >= startRow || sheet.getLastRow() < 2) return;
  sheet.getRange(sourceRow, 1, 1, columnCount).copyTo(
    sheet.getRange(startRow, 1, rowCount, columnCount),
    SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
    false
  );
}

function migrateLegacyLotDatesToImportDates() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const inventory = ss.getSheetByName(MEDSTOCK_STOCK_API.INVENTORY_SHEET);
  const log = ss.getSheetByName(MEDSTOCK_STOCK_API.LOG_SHEET);
  const backupName = "Lot_Migration_Backup_20260929";
  if (!inventory || !log) throw new Error("Inventory or Log Data sheet is missing.");
  if (ss.getSheetByName(backupName)) throw new Error(backupName + " already exists; migration was already prepared or completed.");

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const inventoryCount = Math.max(0, inventory.getLastRow() - 1);
    const logCount = Math.max(0, log.getLastRow() - 1);
    const inventoryRows = inventoryCount ? inventory.getRange(2, 1, inventoryCount, 12).getValues() : [];
    const logRows = logCount ? log.getRange(2, 1, logCount, 8).getValues() : [];
    const importedAtByBarcode = {};

    logRows.forEach(function(row) {
      const barcode = String(row[2] || "").trim().toUpperCase();
      const action = String(row[7] || "").trim().toUpperCase();
      const date = medStockMigrationDate_(row[0]);
      if (!barcode || action !== "IMPORT" || !date) return;
      if (!importedAtByBarcode[barcode] || date < importedAtByBarcode[barcode]) importedAtByBarcode[barcode] = date;
    });

    const migratedAtByBarcode = {};
    const inventoryLots = [];
    const backupRows = [];
    let inventoryMigrated = 0;
    let inventorySkipped = 0;

    inventoryRows.forEach(function(row, index) {
      const barcode = String(row[0] || row[10] || "").trim().toUpperCase();
      const targetDate = medStockMigrationDate_(row[11]) || importedAtByBarcode[barcode] || null;
      if (!barcode || !targetDate) {
        inventoryLots.push([row[5] || ""]);
        inventorySkipped += 1;
        return;
      }
      backupRows.push(["Inventory", index + 2, barcode, row[5] || "", targetDate]);
      inventoryLots.push([targetDate]);
      migratedAtByBarcode[barcode] = targetDate;
      inventoryMigrated += 1;
    });

    const logLots = [];
    let logMigrated = 0;
    logRows.forEach(function(row, index) {
      const barcode = String(row[2] || "").trim().toUpperCase();
      const targetDate = migratedAtByBarcode[barcode] || null;
      if (!targetDate) {
        logLots.push([row[5] || ""]);
        return;
      }
      backupRows.push(["Log Data", index + 2, barcode, row[5] || "", targetDate]);
      logLots.push([targetDate]);
      logMigrated += 1;
    });

    const backup = ss.insertSheet(backupName);
    backup.getRange(1, 1, 1, 5).setValues([["Source Sheet", "Source Row", "Unique ID", "Previous Lot", "Migrated Lot"]]);
    if (backupRows.length) backup.getRange(2, 1, backupRows.length, 5).setValues(backupRows);
    backup.getRange("E:E").setNumberFormat("dd/MM/yyyy");
    backup.setFrozenRows(1);

    if (inventoryLots.length) inventory.getRange(2, 6, inventoryLots.length, 1).setValues(inventoryLots).setNumberFormat("dd/MM/yyyy");
    if (logLots.length) log.getRange(2, 6, logLots.length, 1).setValues(logLots).setNumberFormat("dd/MM/yyyy");
    SpreadsheetApp.flush();
    return {
      ok: true,
      backupSheet: backupName,
      inventoryMigrated: inventoryMigrated,
      inventorySkipped: inventorySkipped,
      logMigrated: logMigrated
    };
  } finally {
    lock.releaseLock();
  }
}

function medStockMigrationDate_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const text = String(value || "").trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match) return medStockMigrationDateParts_(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{2})(?:[\/-]?)(\d{2})(?:[\/-]?)(\d{4})$/.exec(text);
  if (match) return medStockMigrationDateParts_(Number(match[3]), Number(match[2]), Number(match[1]));
  return null;
}

function medStockMigrationDateParts_(year, month, day) {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}
