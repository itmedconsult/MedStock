const MEDSTOCK_WEB_API = {
  TOKEN_PROPERTY: "MEDSTOCK_WEB_API_TOKEN",
  PRODUCT_SHEET: "Product List",
  INVENTORY_SHEET: "Inventory",
  LOG_SHEET: "Log Data",
  REGISTRY_SHEET: "BC_Registry"
};

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const expectedToken = PropertiesService.getScriptProperties().getProperty(MEDSTOCK_WEB_API.TOKEN_PROPERTY);
    if (!expectedToken) throw new Error("MEDSTOCK_WEB_API_TOKEN is not configured in Script Properties.");
    if (!body.token || body.token !== expectedToken) return medStockWebApiJson_({ ok: false, error: "Unauthorized." });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (body.action === "listProducts") return medStockWebApiJson_({ ok: true, products: medStockWebApiProducts_(ss), updatedAt: new Date().toISOString() });
    if (body.action === "getDashboard") return medStockWebApiJson_(medStockWebApiDashboard_(ss));
    const barcodeResponse = medStockBarcodeDispatch_(body, ss);
    if (barcodeResponse) return medStockWebApiJson_(barcodeResponse);
    const stockResponse = medStockStockOperationDispatch_(body, ss);
    if (stockResponse) return medStockWebApiJson_(stockResponse);
    return medStockWebApiJson_({ ok: false, error: "Unsupported action." });
  } catch (error) {
    return medStockWebApiJson_({ ok: false, error: error && error.message ? error.message : "Unable to load MedStock data." });
  }
}

function medStockWebApiProducts_(ss) {
  const sheet = ss.getSheetByName(MEDSTOCK_WEB_API.PRODUCT_SHEET);
  if (!sheet || sheet.getLastRow() < 2) throw new Error("Product List is empty or missing.");
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(10, sheet.getLastColumn())).getDisplayValues();
  const stockDate = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || "Asia/Bangkok", "yyyy-MM-dd");
  const seen = {};
  const products = [];
  rows.forEach(function(row) {
    const sku = String(row[0] || "").trim().toUpperCase();
    const category = String(row[2] || "").trim();
    const name = String(row[3] || "").trim();
    const unit = String(row[4] || "").trim();
    const trackMode = String(row[5] || "").trim().toUpperCase();
    const active = String(row[7] || "").trim().toUpperCase();
    const imageUrl = String(row[9] || "").trim();
    if (!sku || !name || active !== "YES") return;
    if (seen[sku]) throw new Error("Duplicate active SKU in Product List: " + sku);
    seen[sku] = true;
    products.push({ sku: sku, name: name, category: category || "Medical Stock", unit: unit || "units", trackMode: trackMode,
      packageUnit: medStockPackageFields_(ss, sku).packageUnit,
      unitsPerPack: medStockPackageFields_(ss, sku).unitsPerPack,
      imageUrl: imageUrl, stockDate: stockDate });
  });
  return products;
}

function medStockWebApiDashboard_(ss) {
  const products = medStockWebApiProducts_(ss);
  const bySku = {};
  products.forEach(function(product) { bySku[product.sku] = product; });
  const inventorySheet = ss.getSheetByName(MEDSTOCK_WEB_API.INVENTORY_SHEET);
  const logSheet = ss.getSheetByName(MEDSTOCK_WEB_API.LOG_SHEET);
  const registrySheet = ss.getSheetByName(MEDSTOCK_WEB_API.REGISTRY_SHEET);
  if (!inventorySheet || !logSheet || !registrySheet) throw new Error("Inventory, Log Data or BC_Registry sheet is missing.");
  const inventory = [];
  if (inventorySheet.getLastRow() > 1) {
    inventorySheet.getRange(2, 1, inventorySheet.getLastRow() - 1, 20).getValues().forEach(function(row) {
      const id = String(row[0] || "").trim();
      const sku = String(row[1] || "").trim().toUpperCase();
      if (!id || !sku) return;
      const product = bySku[sku] || {};
      inventory.push({ id: id, sku: sku, productName: String(row[2] || product.name || sku).trim(),
        unit: String(row[4] || product.unit || "units").trim(), location: String(row[7] || "").trim(),
        status: String(row[8] || "").trim().toUpperCase(), quantity: medStockWebApiNumber_(row[9]),
        containerType: String(row[13] || "").trim().toUpperCase(), packageUnit: product.packageUnit || "",
        unitsPerPack: product.packageUnit ? Number(row[14]) : 0,
        trackMode: String(product.trackMode || "").trim().toUpperCase() });
    });
  }
  const transactions = [];
  if (logSheet.getLastRow() > 1) {
    logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 19).getValues().forEach(function(row, index) {
      const id = String(row[1] || "").trim();
      const sku = String(row[3] || "").trim().toUpperCase();
      if (!id || !sku) return;
      const before = medStockWebApiNumber_(row[12]);
      const after = medStockWebApiNumber_(row[13]);
      let movement = medStockWebApiNumber_(row[8]);
      const action = String(row[7] || "").trim().toUpperCase();
      if (String(row[16] || "") === "Pack Correction") return;
      const delta = after - before;
      if (delta !== 0) movement = delta;
      else if (/CUT|OUT|SALE|USE|REMOVE/.test(action)) movement = -Math.abs(movement);
      else movement = Math.abs(movement);
      if (!movement) return;
      const product = bySku[sku] || {};
      transactions.push({ id: id || "LOG-" + String(index + 2), occurredAt: medStockWebApiIso_(row[0], ss),
        type: movement < 0 ? "OUT" : "IN", sku: sku, productName: String(row[4] || product.name || sku).trim(),
        quantity: movement, balance: after, unit: String(row[18] || product.unit || "units").trim(),
        source: String(row[16] || action || "Log Data").trim(), actor: String(row[10] || "Spreadsheet User").trim() });
    });
  }
  transactions.sort(function(a, b) { return b.occurredAt.localeCompare(a.occurredAt); });
  let waitingForImport = 0;
  if (registrySheet.getLastRow() > 1) registrySheet.getRange(2, 10, registrySheet.getLastRow() - 1, 1).getDisplayValues().forEach(function(row) {
    if (String(row[0] || "").trim().toUpperCase() === "ISSUED") waitingForImport += 1;
  });
  return { ok: true, products: products, inventory: inventory, transactions: transactions, waitingForImport: waitingForImport, updatedAt: new Date().toISOString() };
}

function medStockWebApiNumber_(value) {
  const number = Number(value);
  return isFinite(number) ? Math.round(number * 1000000) / 1000000 : 0;
}
function medStockWebApiIso_(value, ss) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) return value.toISOString();
  const parsed = new Date(value);
  if (!isNaN(parsed)) return parsed.toISOString();
  return Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || "Asia/Bangkok", "yyyy-MM-dd'T'HH:mm:ssXXX");
}
function medStockWebApiJson_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
function createMedStockWebApiToken() {
  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  PropertiesService.getScriptProperties().setProperty(MEDSTOCK_WEB_API.TOKEN_PROPERTY, token);
  console.log("MEDSTOCK_WEB_API_TOKEN=" + token);
}
