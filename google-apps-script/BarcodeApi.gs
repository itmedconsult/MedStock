const MEDSTOCK_BARCODE_API = {
  REGISTRY_SHEET: "BC_Registry",
  PRINT_LOG_SHEET: "BC_Print_Log",
  PRODUCT_SHEET: "Product List",
  TIME_ZONE: "Asia/Bangkok",
  MAX_LABELS: 500,
  REGISTRY_HEADERS: [
    "Issued At", "Batch ID", "Barcode", "SKU", "Product Name", "Barcode Date",
    "Run Code", "Unit", "Track Mode", "Status", "Request ID", "Request Snapshot",
    "Branch", "Source"
  ],
  LOG_HEADERS: [
    "Logged At", "Attempt ID", "Batch ID", "Branch", "Barcode",
    "Attempt Type", "Status", "Error", "Source"
  ]
};

function setupMedStockBarcodeApi() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    medStockBarcodeEnsureStructure_(SpreadsheetApp.getActiveSpreadsheet());
  } finally {
    lock.releaseLock();
  }
}

function medStockBarcodeDispatch_(body, ss) {
  if (body.action === "reserveBarcodeBatch") return medStockBarcodeReserve_(body, ss);
  if (body.action === "listBarcodePrintBatches") return medStockBarcodeList_(body, ss);
  if (body.action === "recordBarcodePrintAttempt") return medStockBarcodeRecordAttempt_(body, ss);
  return null;
}

function medStockBarcodeEnsureStructure_(ss) {
  if (ss.getSpreadsheetTimeZone() !== MEDSTOCK_BARCODE_API.TIME_ZONE) {
    ss.setSpreadsheetTimeZone(MEDSTOCK_BARCODE_API.TIME_ZONE);
  }
  const registry = ss.getSheetByName(MEDSTOCK_BARCODE_API.REGISTRY_SHEET);
  if (!registry) throw new Error("BC_Registry is missing.");
  if (registry.getMaxColumns() < MEDSTOCK_BARCODE_API.REGISTRY_HEADERS.length) {
    registry.insertColumnsAfter(registry.getMaxColumns(), MEDSTOCK_BARCODE_API.REGISTRY_HEADERS.length - registry.getMaxColumns());
  }

  const current = registry.getRange(1, 1, 1, MEDSTOCK_BARCODE_API.REGISTRY_HEADERS.length).getDisplayValues()[0];
  MEDSTOCK_BARCODE_API.REGISTRY_HEADERS.slice(0, 12).forEach(function(header, index) {
    if (String(current[index] || "").trim() !== header) throw new Error("BC_Registry header changed: " + header);
  });
  ["Branch", "Source"].forEach(function(header, offset) {
    const index = 12 + offset;
    if (current[index] && String(current[index]).trim() !== header) throw new Error("BC_Registry column " + (index + 1) + " is already in use.");
  });
  registry.getRange(1, 13, 1, 2).setValues([["Branch", "Source"]]);
  registry.getRange(1, 12, 1, 1).copyTo(registry.getRange(1, 13, 1, 2), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  registry.getRange("A:A").setNumberFormat("dd/MM/yyyy HH:mm:ss");

  let log = ss.getSheetByName(MEDSTOCK_BARCODE_API.PRINT_LOG_SHEET);
  if (!log) {
    log = ss.insertSheet(MEDSTOCK_BARCODE_API.PRINT_LOG_SHEET);
    log.getRange(1, 1, 1, MEDSTOCK_BARCODE_API.LOG_HEADERS.length).setValues([MEDSTOCK_BARCODE_API.LOG_HEADERS]);
    log.getRange(1, 1, 1, MEDSTOCK_BARCODE_API.LOG_HEADERS.length)
      .setBackground("#0B7285").setFontColor("#FFFFFF").setFontWeight("bold");
    log.setFrozenRows(1);
    [155, 260, 270, 100, 220, 110, 90, 360, 90].forEach(function(width, index) {
      log.setColumnWidth(index + 1, width);
    });
    log.getRange("A:A").setNumberFormat("dd/MM/yyyy HH:mm:ss");
  } else {
    const logHeaders = log.getRange(1, 1, 1, MEDSTOCK_BARCODE_API.LOG_HEADERS.length).getDisplayValues()[0];
    MEDSTOCK_BARCODE_API.LOG_HEADERS.forEach(function(header, index) {
      if (String(logHeaders[index] || "").trim() !== header) throw new Error("BC_Print_Log header changed: " + header);
    });
  }
  log.getRange("A:A").setNumberFormat("dd/MM/yyyy HH:mm:ss");
  SpreadsheetApp.flush();
  return { registry: registry, log: log };
}

function medStockBarcodeReserve_(body, ss) {
  const branch = medStockBarcodeText_(body.branch, 20);
  const requestId = medStockBarcodeText_(body.requestId, 100);
  if (["Thonglor", "Silom"].indexOf(branch) === -1) throw new Error("Select a valid print branch.");
  if (!requestId) throw new Error("Barcode request ID is required.");
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) throw new Error("Barcode items are invalid.");

  const productRows = medStockWebApiProducts_(ss);
  const products = {};
  productRows.forEach(function(product) { products[String(product.sku).toUpperCase()] = product; });
  let total = 0;
  const items = body.items.map(function(value, index) {
    const sku = medStockBarcodeText_(value && value.sku, 32).toUpperCase();
    const stockDate = medStockBarcodeText_(value && value.stockDate, 10);
    const quantity = Number(value && value.quantity);
    if (!products[sku]) throw new Error("Active SKU not found: " + sku);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(stockDate)) throw new Error("Invalid stock date at row " + (index + 1));
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MEDSTOCK_BARCODE_API.MAX_LABELS) throw new Error("Invalid quantity at row " + (index + 1));
    total += quantity;
    return { sku: sku, stockDate: stockDate, quantity: quantity };
  });
  if (total > MEDSTOCK_BARCODE_API.MAX_LABELS) throw new Error("A barcode batch cannot exceed 500 labels.");
  const snapshot = JSON.stringify({ branch: branch, items: items });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheets = medStockBarcodeEnsureStructure_(ss);
    const registry = sheets.registry;
    const rows = registry.getLastRow() > 1
      ? registry.getRange(2, 1, registry.getLastRow() - 1, MEDSTOCK_BARCODE_API.REGISTRY_HEADERS.length).getValues()
      : [];
    const prior = rows.filter(function(row) { return String(row[10] || "") === requestId; });
    if (prior.length) {
      if (String(prior[0][11] || "") !== snapshot) throw new Error("Request ID was already used with different barcode items.");
      return { ok: true, batch: medStockBarcodeBatchFromRows_(prior, ss) };
    }

    const highwater = {};
    rows.forEach(function(row) {
      const sku = String(row[3] || "").trim().toUpperCase();
      const run = medStockBarcodeRunNumber_(String(row[6] || ""));
      if (sku && run > (highwater[sku] || 0)) highwater[sku] = run;
    });

    const now = new Date();
    const zone = ss.getSpreadsheetTimeZone() || "Asia/Bangkok";
    const code = branch === "Thonglor" ? "TL" : "SL";
    const batchId = "BC-" + code + "-" + Utilities.formatDate(now, zone, "yyyyMMdd-HHmmss") + "-" + Utilities.getUuid().slice(0, 8).toUpperCase();
    const properties = PropertiesService.getDocumentProperties();
    const reservations = {};
    const output = [];
    const labels = [];

    items.forEach(function(item) {
      const product = products[item.sku];
      const propertyKey = "GEN_BC_SEQ_" + ss.getId() + "_" + item.sku;
      let current = Math.max(highwater[item.sku] || 0, Number(properties.getProperty(propertyKey)) || 0);
      const date = medStockBarcodeDate_(item.stockDate);
      const dateCode = Utilities.formatDate(date, zone, "ddMMyy");
      for (let count = 0; count < item.quantity; count += 1) {
        current += 1;
        const runCode = medStockBarcodeRunCode_(current);
        const barcode = item.sku + "-" + dateCode + "-" + runCode;
        output.push([
          now, batchId, barcode, item.sku, product.name, date, runCode,
          product.packageUnit || product.unit || "units", product.trackMode || "", "ISSUED",
          requestId, snapshot, branch, "WEB"
        ]);
        labels.push({ uuid: barcode, sku: item.sku, name: product.name, date: item.stockDate });
      }
      highwater[item.sku] = current;
      reservations[propertyKey] = String(current);
    });

    properties.setProperties(reservations);
    const startRow = registry.getLastRow() + 1;
    if (registry.getMaxRows() < startRow + output.length - 1) registry.insertRowsAfter(registry.getMaxRows(), startRow + output.length - 1 - registry.getMaxRows());
    registry.getRange(startRow, 1, output.length, MEDSTOCK_BARCODE_API.REGISTRY_HEADERS.length).setValues(output);
    SpreadsheetApp.flush();
    return { ok: true, batch: { id: batchId, branch: branch, createdAt: now.toISOString(), labels: labels, attempts: [] } };
  } finally {
    lock.releaseLock();
  }
}

function medStockBarcodeList_(body, ss) {
  const branchFilter = medStockBarcodeText_(body.branch, 20);
  if (branchFilter && ["Thonglor", "Silom", "Legacy"].indexOf(branchFilter) === -1) throw new Error("Invalid print history branch.");
  const limit = Math.min(200, Math.max(1, Number(body.limit) || 200));
  const sheets = medStockBarcodeEnsureStructure_(ss);
  const registryRows = sheets.registry.getLastRow() > 1
    ? sheets.registry.getRange(2, 1, sheets.registry.getLastRow() - 1, MEDSTOCK_BARCODE_API.REGISTRY_HEADERS.length).getValues()
    : [];
  const grouped = {};
  registryRows.forEach(function(row) {
    const batchId = String(row[1] || "").trim();
    const barcode = String(row[2] || "").trim();
    if (!batchId || !barcode) return;
    const branch = medStockBarcodeBranch_(row[12]);
    if (branchFilter && branch !== branchFilter) return;
    if (!grouped[batchId]) grouped[batchId] = { id: batchId, branch: branch, createdAt: medStockBarcodeIso_(row[0]), labels: [], attempts: [] };
    grouped[batchId].labels.push({
      uuid: barcode,
      sku: String(row[3] || "").trim(),
      name: String(row[4] || "").trim(),
      date: medStockBarcodeDateText_(row[5], ss)
    });
  });
  const batches = Object.keys(grouped).map(function(id) { return grouped[id]; })
    .sort(function(left, right) { return String(right.createdAt).localeCompare(String(left.createdAt)); })
    .slice(0, limit);
  const wanted = {};
  batches.forEach(function(batch) { wanted[batch.id] = batch; });

  const logRows = sheets.log.getLastRow() > 1
    ? sheets.log.getRange(2, 1, sheets.log.getLastRow() - 1, MEDSTOCK_BARCODE_API.LOG_HEADERS.length).getValues()
    : [];
  const attempts = {};
  logRows.forEach(function(row) {
    const batchId = String(row[2] || "").trim();
    if (!wanted[batchId]) return;
    const attemptId = String(row[1] || "").trim();
    const key = batchId + "|" + attemptId;
    if (!attempts[key]) attempts[key] = {
      id: attemptId,
      type: String(row[5] || "").trim().toUpperCase(),
      createdAt: medStockBarcodeIso_(row[0]),
      labels: []
    };
    const label = { uuid: String(row[4] || "").trim(), status: String(row[6] || "queued").trim().toLowerCase() };
    const error = String(row[7] || "").trim();
    if (error) label.error = error;
    attempts[key].labels.push(label);
  });
  Object.keys(attempts).forEach(function(key) {
    const batchId = key.split("|")[0];
    wanted[batchId].attempts.push(attempts[key]);
  });
  batches.forEach(function(batch) {
    batch.attempts.sort(function(left, right) { return String(left.createdAt).localeCompare(String(right.createdAt)); });
  });
  return { ok: true, batches: batches };
}

function medStockBarcodeRecordAttempt_(body, ss) {
  const attemptId = medStockBarcodeText_(body.attemptId, 100);
  const batchId = medStockBarcodeText_(body.batchId, 100);
  const type = medStockBarcodeText_(body.type, 10).toUpperCase();
  if (!attemptId || !batchId) throw new Error("Attempt ID and batch ID are required.");
  if (["INITIAL", "RETRY", "REPRINT"].indexOf(type) === -1) throw new Error("Invalid print attempt type.");
  if (!Array.isArray(body.labels) || !body.labels.length || body.labels.length > MEDSTOCK_BARCODE_API.MAX_LABELS) throw new Error("Print attempt labels are invalid.");

  const labels = body.labels.map(function(value, index) {
    const uuid = medStockBarcodeText_(value && value.uuid, 64).toUpperCase();
    const status = medStockBarcodeText_(value && value.status, 20).toLowerCase();
    if (!uuid) throw new Error("Missing barcode at label " + (index + 1));
    if (["queued", "printing", "sent", "failed"].indexOf(status) === -1) throw new Error("Invalid print status at label " + (index + 1));
    return { uuid: uuid, status: status, error: medStockBarcodeText_(value && value.error, 500) };
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheets = medStockBarcodeEnsureStructure_(ss);
    const logRows = sheets.log.getLastRow() > 1
      ? sheets.log.getRange(2, 1, sheets.log.getLastRow() - 1, MEDSTOCK_BARCODE_API.LOG_HEADERS.length).getValues()
      : [];
    const existing = logRows.filter(function(row) { return String(row[1] || "") === attemptId; });
    if (existing.length) return { ok: true, attemptId: attemptId, processedCount: existing.length, duplicate: true };

    const registryRows = sheets.registry.getLastRow() > 1
      ? sheets.registry.getRange(2, 1, sheets.registry.getLastRow() - 1, MEDSTOCK_BARCODE_API.REGISTRY_HEADERS.length).getValues()
      : [];
    const batchRows = registryRows.filter(function(row) { return String(row[1] || "") === batchId; });
    if (!batchRows.length) throw new Error("Print batch not found: " + batchId);
    const allowed = {};
    batchRows.forEach(function(row) { allowed[String(row[2] || "").toUpperCase()] = true; });
    labels.forEach(function(label) {
      if (!allowed[label.uuid]) throw new Error("Barcode does not belong to batch " + batchId + ": " + label.uuid);
    });
    const branch = medStockBarcodeBranch_(batchRows[0][12]);
    const now = new Date();
    const output = labels.map(function(label) {
      return [now, attemptId, batchId, branch, label.uuid, type, label.status, label.error, "WEB"];
    });
    sheets.log.getRange(sheets.log.getLastRow() + 1, 1, output.length, MEDSTOCK_BARCODE_API.LOG_HEADERS.length).setValues(output);
    SpreadsheetApp.flush();
    return { ok: true, attemptId: attemptId, processedCount: output.length, duplicate: false };
  } finally {
    lock.releaseLock();
  }
}

function medStockBarcodeBatchFromRows_(rows, ss) {
  const first = rows[0];
  return {
    id: String(first[1]),
    branch: medStockBarcodeBranch_(first[12]),
    createdAt: medStockBarcodeIso_(first[0]),
    labels: rows.map(function(row) {
      return { uuid: String(row[2]), sku: String(row[3]), name: String(row[4]), date: medStockBarcodeDateText_(row[5], ss) };
    }),
    attempts: []
  };
}

function medStockBarcodeText_(value, maxLength) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function medStockBarcodeBranch_(value) {
  const branch = String(value || "").trim();
  return branch === "Thonglor" || branch === "Silom" ? branch : "Legacy";
}

function medStockBarcodeDate_(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) throw new Error("Invalid stock date: " + value);
  // Noon UTC prevents a date-only value from shifting to the previous/next day
  // when the Apps Script and spreadsheet time zones differ.
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) throw new Error("Invalid stock date: " + value);
  return date;
}

function medStockBarcodeDateText_(value, ss) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(value, ss.getSpreadsheetTimeZone() || "Asia/Bangkok", "yyyy-MM-dd");
  }
  const text = String(value || "").trim();
  const display = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  return display ? display[3] + "-" + display[2] + "-" + display[1] : text;
}

function medStockBarcodeIso_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) return value.toISOString();
  const parsed = new Date(value);
  return isNaN(parsed) ? new Date(0).toISOString() : parsed.toISOString();
}

function medStockBarcodeRunNumber_(code) {
  const match = /^([A-Z])(\d{4})$/.exec(String(code || "").trim().toUpperCase());
  if (!match) return 0;
  return (match[1].charCodeAt(0) - 65) * 9999 + Number(match[2]);
}

function medStockBarcodeRunCode_(number) {
  if (!Number.isInteger(number) || number < 1 || number > 26 * 9999) throw new Error("Barcode running number exhausted.");
  return String.fromCharCode(65 + Math.floor((number - 1) / 9999)) + String((number - 1) % 9999 + 1).padStart(4, "0");
}
