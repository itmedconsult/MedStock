const CONFIG = {
  PRODUCT_SHEET: "Product List",
  INVENTORY_SHEET: "Inventory",
  TRANSACTION_SHEET: "Log Data",
  RESPONSE_SHEET: "Form Responses 1",
  SCANNER_SHEET: "Cut Stock",

  LOCATION_CODES: {
    "Thonglor": "TL",
    "Silom": "SL"
  },

  SCAN: {
    BARCODE: "B5",
    EXPECTED_PRODUCT: "B6",
    CURRENT_BRANCH: "B7",

    PRODUCT: "B9",
    SKU: "B10",
    CATEGORY: "B11",
    UNIT: "B12",
    LOT: "B13",
    EXPIRY: "B14",
    ITEM_LOCATION: "B15",
    STATUS: "B16",
    CURRENT_QTY: "B17",
    TRACK_MODE: "B18",
    QTY_USED: "B19",
    VALIDATION: "B20"
  }
};


const BARCODE_CONFIG = {
  PRINT_SHEET: "Gen_BC",
  OUTPUT_SHEET: "Print_BC",

  COL_PRINT: 1,       // A
  COL_UNIQUE_ID: 2,   // B
  COL_BARCODE: 3,     // C
  COL_PRODUCT: 4,     // D
  COL_LOCATION: 5,    // E
  COL_UNIT: 6,        // F
  COL_QTY: 7,         // G
  COL_LOT: 8,         // H
  COL_EXPIRY: 9,      // I
  COL_URL: 10,        // J
  COL_PREVIEW: 11,    // K
  COL_STATUS: 12      // L
};

/* ============================================================
   MEDSTOCK WEB API

   Deploy this Apps Script project as a Web app that executes as
   the owner. The Next.js server calls doPost() with the token kept
   in Script Properties under MEDSTOCK_WEB_API_TOKEN.
============================================================ */

const MEDSTOCK_WEB_API = {
  TOKEN_PROPERTY: "MEDSTOCK_WEB_API_TOKEN",
  PRODUCT_SHEET: "Product List"
};

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const expectedToken = PropertiesService
      .getScriptProperties()
      .getProperty(MEDSTOCK_WEB_API.TOKEN_PROPERTY);

    if (!expectedToken) {
      throw new Error("MEDSTOCK_WEB_API_TOKEN is not configured in Script Properties.");
    }

    if (!body.token || body.token !== expectedToken) {
      return medStockWebApiJson_({ ok: false, error: "Unauthorized." });
    }

    if (body.action !== "listProducts") {
      return medStockWebApiJson_({ ok: false, error: "Unsupported action." });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(MEDSTOCK_WEB_API.PRODUCT_SHEET);

    if (!sheet || sheet.getLastRow() < 2) {
      throw new Error("Product List is empty or missing.");
    }

    const rows = sheet
      .getRange(2, 1, sheet.getLastRow() - 1, Math.max(10, sheet.getLastColumn()))
      .getDisplayValues();
    const stockDate = Utilities.formatDate(
      new Date(),
      ss.getSpreadsheetTimeZone() || "Asia/Bangkok",
      "yyyy-MM-dd"
    );
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

      products.push({
        sku: sku,
        name: name,
        category: category || "Medical Stock",
        unit: unit || "units",
        trackMode: trackMode,
        imageUrl: imageUrl,
        stockDate: stockDate
      });
    });

    return medStockWebApiJson_({
      ok: true,
      products: products,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    return medStockWebApiJson_({
      ok: false,
      error: error && error.message ? error.message : "Unable to load products."
    });
  }
}

function medStockWebApiJson_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function createMedStockWebApiToken() {
  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  PropertiesService.getScriptProperties().setProperty(MEDSTOCK_WEB_API.TOKEN_PROPERTY, token);
  console.log("MEDSTOCK_WEB_API_TOKEN=" + token);
}



/* ============================================================
   MENU
============================================================ */

function onOpen() {

  SpreadsheetApp
    .getUi()
    .createMenu("Aesthetic Inventory")
    .addItem(
      "Generate Barcode Labels",
      "generateBarcodeLabels"
    )
    .addItem(
      "Print Selected Labels",
      "buildPrintableBarcodeLabels"
    )
    .addSeparator()
    .addItem(
      "Clear Barcode Selection",
      "clearBarcodeSelection"
    )
    .addSeparator()
    .addItem(
      "Reload Scanner",
      "loadScannedItem_"
    )
    .addToUi();

}



/* ============================================================
   STOCK IN FROM GOOGLE FORM
   Trigger:
   onFormSubmit
   From spreadsheet → On form submit
============================================================ */

function onFormSubmit(e) {

  const lock =
    LockService.getScriptLock();

  try {

    lock.waitLock(30000);

    const ss =
      SpreadsheetApp
        .getActiveSpreadsheet();

    const responseSheet =
      e.range.getSheet();

    if (
      responseSheet.getName() !==
      CONFIG.RESPONSE_SHEET
    ) {
      return;
    }


    const row =
      e.range.getRow();

    const lastColumn =
      responseSheet.getLastColumn();


    const headers =
      responseSheet
        .getRange(
          1,
          1,
          1,
          lastColumn
        )
        .getDisplayValues()[0];


    const values =
      responseSheet
        .getRange(
          row,
          1,
          1,
          lastColumn
        )
        .getValues()[0];


    const formData = {};


    headers.forEach(
      (header, index) => {

        formData[
          String(header).trim()
        ] = values[index];

      }
    );


    const sku =
      cleanText_(
        formData["SKU"]
      );

    const lot =
      cleanText_(
        formData["Lot"]
      );

    const expiryDate =
      formData["Expiry Date"];

    const qty =
      Number(
        formData["Qty"]
      );

    const location =
      cleanText_(
        formData["Location"]
      );

    const receivedDate =
      formData["Received Date"]
      || new Date();

    const staff =
      cleanText_(
        formData["Staff"]
      );

    const notes =
      cleanText_(
        formData["Notes"]
      );


    if (!sku) {

      throw new Error(
        "SKU is missing."
      );

    }


    if (
      !qty ||
      qty <= 0
    ) {

      throw new Error(
        "Qty must be greater than 0."
      );

    }


    if (
      !CONFIG.LOCATION_CODES[
        location
      ]
    ) {

      throw new Error(
        "Invalid Location: " +
        location
      );

    }


    const product =
      getProductBySKU_(
        ss,
        sku
      );


    if (!product) {

      throw new Error(
        "SKU not found in Product List: " +
        sku
      );

    }


    if (
      product.active &&
      product.active
        .toUpperCase() !==
        "YES"
    ) {

      throw new Error(
        "Product is inactive: " +
        sku
      );

    }


    if (
      product.trackMode ===
      "UNIT"
    ) {

      stockInUnit_({
        ss,
        product,
        lot,
        expiryDate,
        qty,
        location,
        receivedDate,
        staff,
        notes
      });

    }


    else if (
      product.trackMode ===
      "BULK"
    ) {

      stockInBulk_({
        ss,
        product,
        lot,
        expiryDate,
        qty,
        location,
        receivedDate,
        staff,
        notes
      });

    }


    else {

      throw new Error(
        "Invalid Track Mode: " +
        product.trackMode
      );

    }


    refreshPrintLabels_();


  }
  finally {

    lock.releaseLock();

  }

}



/* ============================================================
   PRODUCT LOOKUP
============================================================ */

function getProductBySKU_(
  ss,
  sku
) {

  const sheet =
    ss.getSheetByName(
      CONFIG.PRODUCT_SHEET
    );


  if (!sheet) {

    throw new Error(
      "Sheet not found: " +
      CONFIG.PRODUCT_SHEET
    );

  }


  const data =
    sheet
      .getDataRange()
      .getValues();


  const headers =
    data[0];


  const colSKU =
    headers.indexOf(
      "SKU"
    );

  const colPrefix =
    headers.indexOf(
      "ID Prefix"
    );

  const colCategory =
    headers.indexOf(
      "Category"
    );

  const colProduct =
    headers.indexOf(
      "Product Name"
    );

  const colUnit =
    headers.indexOf(
      "Unit"
    );

  const colTrack =
    headers.indexOf(
      "Track Mode"
    );

  const colActive =
    headers.indexOf(
      "Active"
    );


  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    if (
      cleanText_(
        data[i][colSKU]
      ) === sku
    ) {

      return {

        sku,

        prefix:
          cleanText_(
            data[i][colPrefix]
          ),

        category:
          cleanText_(
            data[i][colCategory]
          ),

        productName:
          cleanText_(
            data[i][colProduct]
          ),

        unit:
          cleanText_(
            data[i][colUnit]
          ),

        trackMode:
          cleanText_(
            data[i][colTrack]
          )
          .toUpperCase(),

        active:
          colActive !== -1
            ? cleanText_(
                data[i][colActive]
              )
            : "YES"

      };

    }

  }


  return null;

}



/* ============================================================
   STOCK IN — UNIT
============================================================ */

function stockInUnit_(p) {

  if (
    !Number.isInteger(
      p.qty
    )
  ) {

    throw new Error(
      "UNIT Qty must be a whole number."
    );

  }


  const inventorySheet =
    p.ss.getSheetByName(
      CONFIG.INVENTORY_SHEET
    );


  const transactionSheet =
    p.ss.getSheetByName(
      CONFIG.TRANSACTION_SHEET
    );


  const locationCode =
    CONFIG.LOCATION_CODES[
      p.location
    ];


  let running =
    getLastUnitRunning_(
      inventorySheet,
      p.product.prefix,
      locationCode
    );


  const inventoryRows = [];
  const transactionRows = [];


  for (
    let i = 0;
    i < p.qty;
    i++
  ) {

    running++;


    const uniqueID =
      p.product.prefix +
      "-" +
      locationCode +
      "-" +
      String(running)
        .padStart(
          4,
          "0"
        );


    inventoryRows.push([

      uniqueID,
      p.product.sku,
      p.product.productName,
      p.product.category,
      p.product.unit,
      p.lot,
      p.expiryDate,
      p.location,
      "IN STOCK",
      1,
      uniqueID,
      p.receivedDate,
      p.notes

    ]);


    transactionRows.push([

      new Date(),
      createTransactionId_("IN"),
      uniqueID,
      p.product.sku,
      p.product.productName,
      p.lot,
      p.expiryDate,
      "STOCK IN",
      1,
      p.location,
      p.staff,
      p.notes

    ]);

  }


  inventorySheet
    .getRange(
      inventorySheet
        .getLastRow() + 1,
      1,
      inventoryRows.length,
      inventoryRows[0].length
    )
    .setValues(
      inventoryRows
    );


  transactionSheet
    .getRange(
      transactionSheet
        .getLastRow() + 1,
      1,
      transactionRows.length,
      transactionRows[0].length
    )
    .setValues(
      transactionRows
    );

}



/* ============================================================
   STOCK IN — BULK
============================================================ */

function stockInBulk_(p) {

  const inventorySheet =
    p.ss.getSheetByName(
      CONFIG.INVENTORY_SHEET
    );


  const transactionSheet =
    p.ss.getSheetByName(
      CONFIG.TRANSACTION_SHEET
    );


  const data =
    inventorySheet
      .getDataRange()
      .getValues();


  const headers =
    data[0];


  const colID =
    headers.indexOf(
      "Unique ID"
    );

  const colSKU =
    headers.indexOf(
      "SKU"
    );

  const colLot =
    headers.indexOf(
      "Lot"
    );

  const colExpiry =
    headers.indexOf(
      "Expiry Date"
    );

  const colLocation =
    headers.indexOf(
      "Location"
    );

  const colStatus =
    headers.indexOf(
      "Status"
    );

  const colQty =
    headers.indexOf(
      "Qty"
    );

  const colReceived =
    headers.indexOf(
      "Received / Count Date"
    );

  const colNotes =
    headers.indexOf(
      "Notes"
    );


  let foundRow = -1;
  let uniqueID = "";


  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    if (

      cleanText_(
        data[i][colSKU]
      ) ===
      p.product.sku

      &&

      cleanText_(
        data[i][colLocation]
      ) ===
      p.location

      &&

      String(
        data[i][colID]
      )
      .includes(
        "-B"
      )

    ) {

      foundRow =
        i + 1;

      uniqueID =
        data[i][colID];

      break;

    }

  }


  if (
    foundRow !== -1
  ) {

    const currentQty =
      Number(
        inventorySheet
          .getRange(
            foundRow,
            colQty + 1
          )
          .getValue()
      )
      || 0;


    inventorySheet
      .getRange(
        foundRow,
        colQty + 1
      )
      .setValue(
        currentQty +
        p.qty
      );


    inventorySheet
      .getRange(
        foundRow,
        colStatus + 1
      )
      .setValue(
        "IN STOCK"
      );


    if (
      p.lot &&
      colLot !== -1
    ) {

      inventorySheet
        .getRange(
          foundRow,
          colLot + 1
        )
        .setValue(
          p.lot
        );

    }


    if (
      p.expiryDate &&
      colExpiry !== -1
    ) {

      inventorySheet
        .getRange(
          foundRow,
          colExpiry + 1
        )
        .setValue(
          p.expiryDate
        );

    }


    if (
      colReceived !== -1
    ) {

      inventorySheet
        .getRange(
          foundRow,
          colReceived + 1
        )
        .setValue(
          p.receivedDate
        );

    }


    if (
      p.notes &&
      colNotes !== -1
    ) {

      inventorySheet
        .getRange(
          foundRow,
          colNotes + 1
        )
        .setValue(
          p.notes
        );

    }

  }


  else {

    const locationCode =
      CONFIG.LOCATION_CODES[
        p.location
      ];


    const running =
      getLastBulkRunning_(
        inventorySheet,
        p.product.prefix,
        locationCode
      )
      + 1;


    uniqueID =
      p.product.prefix +
      "-" +
      locationCode +
      "-B" +
      String(running)
        .padStart(
          3,
          "0"
        );


    inventorySheet.appendRow([

      uniqueID,
      p.product.sku,
      p.product.productName,
      p.product.category,
      p.product.unit,
      p.lot,
      p.expiryDate,
      p.location,
      "IN STOCK",
      p.qty,
      uniqueID,
      p.receivedDate,
      p.notes

    ]);

  }


  transactionSheet.appendRow([

    new Date(),
    createTransactionId_("IN"),
    uniqueID,
    p.product.sku,
    p.product.productName,
    p.lot,
    p.expiryDate,
    "STOCK IN",
    p.qty,
    p.location,
    p.staff,
    p.notes

  ]);

}



/* ============================================================
   STOCK OUT SCANNER
   Trigger:
   stockOutValidationOnEdit
   From spreadsheet → On edit
============================================================ */

function stockOutValidationOnEdit(e) {
  if (cutV2Enabled_()) return;

  const sheet =
    e.range.getSheet();


  if (
    sheet.getName() !==
    CONFIG.SCANNER_SHEET
  ) {
    return;
  }


  const a1 =
    e.range
      .getA1Notation();


  if (
    a1 ===
    CONFIG.SCAN.BARCODE
  ) {

    loadScannedItem_();

    return;

  }


  if (

    a1 ===
      CONFIG.SCAN.EXPECTED_PRODUCT

    ||

    a1 ===
      CONFIG.SCAN.CURRENT_BRANCH

    ||

    a1 ===
      CONFIG.SCAN.QTY_USED

  ) {

    validateStockOut_();

  }

}



/* ============================================================
   LOAD SCANNED ITEM
============================================================ */

function loadScannedItem_() {
  if (cutV2Enabled_()) return cutV2Lookup_(cutV2Sheet_(), true);

  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  const scannerSheet =
    ss.getSheetByName(
      CONFIG.SCANNER_SHEET
    );


  const inventorySheet =
    ss.getSheetByName(
      CONFIG.INVENTORY_SHEET
    );


  const productSheet =
    ss.getSheetByName(
      CONFIG.PRODUCT_SHEET
    );


  const barcode =
    cleanText_(

      scannerSheet
        .getRange(
          CONFIG.SCAN.BARCODE
        )
        .getValue()

    );


  clearScannerOutput_(
    scannerSheet
  );


  if (!barcode) {

    scannerSheet
      .getRange(
        CONFIG.SCAN.VALIDATION
      )
      .setValue(
        "BLOCK: ENTER OR SCAN BARCODE"
      );

    return;

  }


  const data =
    inventorySheet
      .getDataRange()
      .getValues();


  const headers =
    data[0];


  const colID =
    headers.indexOf(
      "Unique ID"
    );

  const colSKU =
    headers.indexOf(
      "SKU"
    );

  const colProduct =
    headers.indexOf(
      "Product Name"
    );

  const colCategory =
    headers.indexOf(
      "Category"
    );

  const colUnit =
    headers.indexOf(
      "Unit"
    );

  const colLot =
    headers.indexOf(
      "Lot"
    );

  const colExpiry =
    headers.indexOf(
      "Expiry Date"
    );

  const colLocation =
    headers.indexOf(
      "Location"
    );

  const colStatus =
    headers.indexOf(
      "Status"
    );

  const colQty =
    headers.indexOf(
      "Qty"
    );


  let item = null;


  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    if (
      cleanText_(
        data[i][colID]
      )
      ===
      barcode
    ) {

      item =
        data[i];

      break;

    }

  }


  if (!item) {

    scannerSheet
      .getRange(
        CONFIG.SCAN.VALIDATION
      )
      .setValue(
        "BLOCK: BARCODE NOT FOUND"
      );

    return;

  }


  const sku =
    cleanText_(
      item[colSKU]
    );


  const trackMode =
    getTrackModeBySku_(
      productSheet,
      sku
    );


  scannerSheet
    .getRange(
      CONFIG.SCAN.PRODUCT
    )
    .setValue(
      item[colProduct]
    );


  scannerSheet
    .getRange(
      CONFIG.SCAN.SKU
    )
    .setValue(
      sku
    );


  scannerSheet
    .getRange(
      CONFIG.SCAN.CATEGORY
    )
    .setValue(
      item[colCategory]
    );


  scannerSheet
    .getRange(
      CONFIG.SCAN.UNIT
    )
    .setValue(
      item[colUnit]
    );


  scannerSheet
    .getRange(
      CONFIG.SCAN.LOT
    )
    .setValue(
      item[colLot]
    );


  scannerSheet
    .getRange(
      CONFIG.SCAN.EXPIRY
    )
    .setValue(
      item[colExpiry]
    );


  scannerSheet
    .getRange(
      CONFIG.SCAN.ITEM_LOCATION
    )
    .setValue(
      item[colLocation]
    );


  scannerSheet
    .getRange(
      CONFIG.SCAN.STATUS
    )
    .setValue(
      item[colStatus]
    );


  scannerSheet
    .getRange(
      CONFIG.SCAN.CURRENT_QTY
    )
    .setValue(
      item[colQty]
    );


  scannerSheet
    .getRange(
      CONFIG.SCAN.TRACK_MODE
    )
    .setValue(
      trackMode
    );


  validateStockOut_();

}



/* ============================================================
   STOCK OUT VALIDATION
============================================================ */

function validateStockOut_() {

  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  const sheet =
    ss.getSheetByName(
      CONFIG.SCANNER_SHEET
    );


  const c =
    CONFIG.SCAN;


  const barcode =
    cleanText_(
      sheet
        .getRange(
          c.BARCODE
        )
        .getValue()
    );


  const expectedProduct =
    cleanText_(
      sheet
        .getRange(
          c.EXPECTED_PRODUCT
        )
        .getValue()
    );


  const currentBranch =
    cleanText_(
      sheet
        .getRange(
          c.CURRENT_BRANCH
        )
        .getValue()
    );


  const product =
    cleanText_(
      sheet
        .getRange(
          c.PRODUCT
        )
        .getValue()
    );


  const location =
    cleanText_(
      sheet
        .getRange(
          c.ITEM_LOCATION
        )
        .getValue()
    );


  const status =
    cleanText_(
      sheet
        .getRange(
          c.STATUS
        )
        .getValue()
    );


  const trackMode =
    cleanText_(
      sheet
        .getRange(
          c.TRACK_MODE
        )
        .getValue()
    )
    .toUpperCase();


  const currentQty =
    Number(
      sheet
        .getRange(
          c.CURRENT_QTY
        )
        .getValue()
    )
    || 0;


  const qtyUsed =
    Number(
      sheet
        .getRange(
          c.QTY_USED
        )
        .getValue()
    )
    || 0;


  const errors = [];


  if (
    !barcode ||
    !product
  ) {

    errors.push(
      "BARCODE NOT LOADED"
    );

  }


  if (
    expectedProduct &&
    expectedProduct !==
    product
  ) {

    errors.push(
      "PRODUCT MISMATCH"
    );

  }


  if (
    currentBranch &&
    location &&
    currentBranch !==
    location
  ) {

    errors.push(
      "WRONG LOCATION"
    );

  }


  if (
    status !==
    "IN STOCK"
  ) {

    errors.push(
      "STATUS = " +
      status
    );

  }


  if (
    qtyUsed <= 0
  ) {

    errors.push(
      "QTY USED MUST BE > 0"
    );

  }


  if (
    trackMode ===
      "UNIT"
    &&
    qtyUsed !== 1
  ) {

    errors.push(
      "UNIT PRODUCT MUST USE QTY 1"
    );

  }


  if (
    trackMode ===
      "BULK"
    &&
    qtyUsed >
      currentQty
  ) {

    errors.push(
      "INSUFFICIENT QTY"
    );

  }


  if (
    currentQty <= 0
  ) {

    errors.push(
      "NO STOCK"
    );

  }


  const result =
    errors.length

      ? "BLOCK: " +
        errors.join(
          " | "
        )

      : "READY TO IMPORT";


  sheet
    .getRange(
      c.VALIDATION
    )
    .setValue(
      result
    );


  return (
    errors.length === 0
  );

}



/* ============================================================
   CONFIRM STOCK OUT
   Assign to green button
============================================================ */

function confirmStockOut() {
  if (cutV2Enabled_()) return cutV2Confirm();

  const lock =
    LockService
      .getScriptLock();


  try {

    lock.waitLock(
      30000
    );


    const ss =
      SpreadsheetApp
        .getActiveSpreadsheet();


    const scannerSheet =
      ss.getSheetByName(
        CONFIG.SCANNER_SHEET
      );


    const inventorySheet =
      ss.getSheetByName(
        CONFIG.INVENTORY_SHEET
      );


    const transactionSheet =
      ss.getSheetByName(
        CONFIG.TRANSACTION_SHEET
      );


    const c =
      CONFIG.SCAN;


    if (
      !validateStockOut_()
    ) {

      SpreadsheetApp
        .getUi()
        .alert(

          "Stock Out Blocked",

          scannerSheet
            .getRange(
              c.VALIDATION
            )
            .getDisplayValue(),

          SpreadsheetApp
            .getUi()
            .ButtonSet.OK

        );


      return;

    }


    const barcode =
      cleanText_(
        scannerSheet
          .getRange(
            c.BARCODE
          )
          .getValue()
      );


    const product =
      cleanText_(
        scannerSheet
          .getRange(
            c.PRODUCT
          )
          .getValue()
      );


    const sku =
      cleanText_(
        scannerSheet
          .getRange(
            c.SKU
          )
          .getValue()
      );


    const lot =
      scannerSheet
        .getRange(
          c.LOT
        )
        .getValue();


    const expiry =
      scannerSheet
        .getRange(
          c.EXPIRY
        )
        .getValue();


    const location =
      cleanText_(
        scannerSheet
          .getRange(
            c.ITEM_LOCATION
          )
          .getValue()
      );


    const trackMode =
      cleanText_(
        scannerSheet
          .getRange(
            c.TRACK_MODE
          )
          .getValue()
      )
      .toUpperCase();


    const qtyUsed =
      Number(
        scannerSheet
          .getRange(
            c.QTY_USED
          )
          .getValue()
      )
      || 0;


    const data =
      inventorySheet
        .getDataRange()
        .getValues();


    const headers =
      data[0];


    const colID =
      headers.indexOf(
        "Unique ID"
      );


    const colStatus =
      headers.indexOf(
        "Status"
      );


    const colQty =
      headers.indexOf(
        "Qty"
      );


    let inventoryRow = -1;


    for (
      let i = 1;
      i < data.length;
      i++
    ) {

      if (
        cleanText_(
          data[i][colID]
        )
        ===
        barcode
      ) {

        inventoryRow =
          i + 1;

        break;

      }

    }


    if (
      inventoryRow === -1
    ) {

      throw new Error(
        "Barcode not found: " +
        barcode
      );

    }


    const liveStatus =
      cleanText_(
        inventorySheet
          .getRange(
            inventoryRow,
            colStatus + 1
          )
          .getValue()
      );


    const liveQty =
      Number(
        inventorySheet
          .getRange(
            inventoryRow,
            colQty + 1
          )
          .getValue()
      )
      || 0;


    if (
      liveStatus !==
      "IN STOCK"
    ) {

      throw new Error(
        "Item is no longer IN STOCK. Current status: " +
        liveStatus
      );

    }


    if (
      trackMode ===
      "UNIT"
    ) {

      inventorySheet
        .getRange(
          inventoryRow,
          colQty + 1
        )
        .setValue(
          0
        );


      inventorySheet
        .getRange(
          inventoryRow,
          colStatus + 1
        )
        .setValue(
          "SOLD"
        );

    }


    else if (
      trackMode ===
      "BULK"
    ) {

      if (
        qtyUsed >
        liveQty
      ) {

        throw new Error(
          "Insufficient Qty. Current Qty: " +
          liveQty
        );

      }


      const newQty =
        liveQty -
        qtyUsed;


      inventorySheet
        .getRange(
          inventoryRow,
          colQty + 1
        )
        .setValue(
          newQty
        );


      inventorySheet
        .getRange(
          inventoryRow,
          colStatus + 1
        )
        .setValue(

          newQty <= 0

            ? "OUT OF STOCK"

            : "IN STOCK"

        );

    }


    else {

      throw new Error(
        "Invalid Track Mode: " +
        trackMode
      );

    }


    transactionSheet
      .appendRow([

        new Date(),
        createTransactionId_("OUT"),
        barcode,
        sku,
        product,
        lot,
        expiry,
        "SALE",
        -qtyUsed,
        location,

        Session
          .getActiveUser()
          .getEmail()
        ||
        "Scanner User",

        "Confirmed via Cut Stock"

      ]);


    refreshPrintLabels_();


    SpreadsheetApp
      .getUi()
      .alert(

        "Stock Out Complete",

        product +
        "\nBarcode: " +
        barcode +
        "\nQty Used: " +
        qtyUsed,

        SpreadsheetApp
          .getUi()
          .ButtonSet.OK

      );


    clearStockOutScanner();

  }


  finally {

    lock.releaseLock();

  }

}



/* ============================================================
   CLEAR SCANNER
   Assign to red button
============================================================ */

function clearStockOutScanner() {
  if (cutV2Enabled_()) return cutV2Cancel();

  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  const sheet =
    ss.getSheetByName(
      CONFIG.SCANNER_SHEET
    );


  sheet
    .getRange(
      CONFIG.SCAN.BARCODE
    )
    .clearContent();


  sheet
    .getRange(
      CONFIG.SCAN.EXPECTED_PRODUCT
    )
    .clearContent();


  clearScannerOutput_(
    sheet
  );


  sheet
    .getRange(
      CONFIG.SCAN.QTY_USED
    )
    .setValue(
      1
    );


  sheet
    .getRange(
      CONFIG.SCAN.BARCODE
    )
    .activate();

}



/* ============================================================
   BARCODE GENERATOR
============================================================ */

function generateBarcodeLabels() { return genBcGenerate(); }

function legacyGenerateBarcodeLabels_() {

  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  const sheet =
    ss.getSheetByName(
      BARCODE_CONFIG.PRINT_SHEET
    );


  if (!sheet) {

    throw new Error(
      "Sheet not found: " +
      BARCODE_CONFIG.PRINT_SHEET
    );

  }


  const lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {

    SpreadsheetApp
      .getUi()
      .alert(
        "No label data found."
      );

    return;

  }


  const data =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        12
      )
      .getValues();


  let generated = 0;


  for (
    let i = 0;
    i < data.length;
    i++
  ) {

    const row =
      i + 2;


    const printFlag =
      String(
        data[i][
          BARCODE_CONFIG.COL_PRINT - 1
        ]
        || ""
      )
      .trim()
      .toUpperCase();


    // YES = Generate
    // NO or Blank = Skip

    if (
      printFlag !==
      "YES"
    ) {

      continue;

    }


    const barcodeValue =
      String(
        data[i][
          BARCODE_CONFIG.COL_BARCODE - 1
        ]
        || ""
      )
      .trim();


    if (!barcodeValue) {

      sheet
        .getRange(
          row,
          BARCODE_CONFIG.COL_STATUS
        )
        .setValue(
          "ERROR: NO BARCODE VALUE"
        );

      continue;

    }


    const url =
      "https://bwipjs-api.metafloor.com/?" +
      "bcid=code128" +
      "&text=" +
      encodeURIComponent(
        barcodeValue
      ) +
      "&scale=3" +
      "&height=12" +
      "&includetext" +
      "&textxalign=center";


    sheet
      .getRange(
        row,
        BARCODE_CONFIG.COL_URL
      )
      .setValue(
        url
      );


    sheet
      .getRange(
        row,
        BARCODE_CONFIG.COL_PREVIEW
      )
      .setFormula(
        '=IMAGE("' +
        url +
        '",4,90,260)'
      );


    sheet
      .getRange(
        row,
        BARCODE_CONFIG.COL_STATUS
      )
      .setValue(
        "READY"
      );


    sheet
      .setRowHeight(
        row,
        100
      );


    generated++;

  }


  SpreadsheetApp
    .getUi()
    .alert(

      "Barcode generation complete.\n\n" +
      generated +
      " label(s) generated."

    );

}



/* ============================================================
   PRINTABLE LABEL SHEET
============================================================ */

function buildPrintableBarcodeLabels() { return genBcReprintBatch(); }

function legacyBuildPrintableBarcodeLabels_() {

  generateBarcodeLabels();

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const source =
    ss.getSheetByName(
      BARCODE_CONFIG.PRINT_SHEET
    );

  let output =
    ss.getSheetByName(
      BARCODE_CONFIG.OUTPUT_SHEET
    );

  if (!output) {
    output =
      ss.insertSheet(
        BARCODE_CONFIG.OUTPUT_SHEET
      );
  }

  output.clear();

  const data =
    source
      .getDataRange()
      .getValues();

  let startRow = 1;
  let count = 0;

  for (let i = 1; i < data.length; i++) {

    const printFlag =
      String(
        data[i][BARCODE_CONFIG.COL_PRINT - 1] || ""
      )
      .trim()
      .toUpperCase();

    const status =
      String(
        data[i][BARCODE_CONFIG.COL_STATUS - 1] || ""
      )
      .trim()
      .toUpperCase();

    if (
      printFlag !== "YES" ||
      status !== "READY"
    ) {
      continue;
    }

    const product =
      data[i][BARCODE_CONFIG.COL_PRODUCT - 1];

    const uniqueID =
      data[i][BARCODE_CONFIG.COL_UNIQUE_ID - 1];

    const lot =
      data[i][BARCODE_CONFIG.COL_LOT - 1];

    const expiry =
      data[i][BARCODE_CONFIG.COL_EXPIRY - 1];

    const location =
      data[i][BARCODE_CONFIG.COL_LOCATION - 1];

    const barcodeURL =
      data[i][BARCODE_CONFIG.COL_URL - 1];

    let expiryText = "-";

    if (expiry instanceof Date) {
      expiryText =
        Utilities.formatDate(
          expiry,
          Session.getScriptTimeZone(),
          "dd/MM/yy"
        );
    } else if (expiry) {
      expiryText = String(expiry);
    }


    // =========================
    // LABEL PAGE
    // =========================

    // Product
    output
      .getRange(startRow, 1, 1, 6)
      .merge()
      .setValue(product)
      .setFontWeight("bold")
      .setFontSize(11)
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");


    // Barcode
    output
      .getRange(startRow + 1, 1, 3, 6)
      .merge()
      .setFormula(
        '=IMAGE("' +
        barcodeURL +
        '",4,70,260)'
      );


    // Unique ID
    output
      .getRange(startRow + 4, 1, 1, 6)
      .merge()
      .setValue(uniqueID)
      .setFontWeight("bold")
      .setFontSize(9)
      .setHorizontalAlignment("center");


    // Lot / Expiry / Location
    output
      .getRange(startRow + 5, 1, 1, 6)
      .merge()
      .setValue(
        "Lot: " +
        (lot || "-") +
        " | Exp: " +
        expiryText +
        " | " +
        (location || "")
      )
      .setFontSize(8)
      .setHorizontalAlignment("center");


    // Border
    output
      .getRange(
        startRow,
        1,
        6,
        6
      )
      .setBorder(
        true,
        true,
        true,
        true,
        false,
        false
      );


    // Row heights
    output.setRowHeight(startRow, 22);
    output.setRowHeight(startRow + 1, 28);
    output.setRowHeight(startRow + 2, 28);
    output.setRowHeight(startRow + 3, 28);
    output.setRowHeight(startRow + 4, 20);
    output.setRowHeight(startRow + 5, 20);


    // เว้นช่องเพื่อให้ Google Sheets แยกหน้าได้ง่ายขึ้น
    startRow += 8;

    count++;
  }


  // Width
  output.setColumnWidths(
    1,
    6,
    36
  );


  // Page breaks
  const breaks = [];

  for (
    let r = 9;
    r <= output.getLastRow();
    r += 8
  ) {
    breaks.push(r);
  }

  // Google Apps Script ไม่มี direct page-break API ที่เสถียรใน Sheets
  // ดังนั้นใช้ช่องว่าง + Print setting ให้ 1 block ต่อหน้าแทน


  output.activate();

  SpreadsheetApp
    .getUi()
    .alert(
      "Created " +
      count +
      " label page(s)."
    );
}


/* ============================================================
   REFRESH PRINT LABELS FROM INVENTORY
============================================================ */

function refreshPrintLabels_() {
  const gen = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Gen_BC");
  if (gen && gen.getRange("B29").getValue() === "MEDSTOCK_GEN_BC_V1") return;

  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  const inventory =
    ss.getSheetByName(
      CONFIG.INVENTORY_SHEET
    );


  const printSheet =
    ss.getSheetByName(
      BARCODE_CONFIG.PRINT_SHEET
    );


  if (
    !inventory ||
    !printSheet
  ) {
    return;
  }


  const data =
    inventory
      .getDataRange()
      .getValues();


  const headers =
    data[0];


  const cID =
    headers.indexOf(
      "Unique ID"
    );

  const cProduct =
    headers.indexOf(
      "Product Name"
    );

  const cLocation =
    headers.indexOf(
      "Location"
    );

  const cUnit =
    headers.indexOf(
      "Unit"
    );

  const cQty =
    headers.indexOf(
      "Qty"
    );

  const cLot =
    headers.indexOf(
      "Lot"
    );

  const cExpiry =
    headers.indexOf(
      "Expiry Date"
    );

  const cStatus =
    headers.indexOf(
      "Status"
    );


  const existingLastRow =
    printSheet.getLastRow();


  if (
    existingLastRow > 1
  ) {

    printSheet
      .getRange(
        2,
        1,
        existingLastRow - 1,
        12
      )
      .clearContent();

  }


  const output = [];


  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    const status =
      cleanText_(
        data[i][cStatus]
      );


    const qty =
      Number(
        data[i][cQty]
      )
      || 0;


    if (
      status !==
        "IN STOCK"
      ||
      qty <= 0
    ) {

      continue;

    }


    const uniqueID =
      data[i][cID];


    output.push([

      "NO",
      uniqueID,
      uniqueID,
      data[i][cProduct],
      data[i][cLocation],
      data[i][cUnit],
      qty,
      data[i][cLot],
      data[i][cExpiry],
      "",
      "",
      ""

    ]);

  }


  if (
    output.length
  ) {

    printSheet
      .getRange(
        2,
        1,
        output.length,
        12
      )
      .setValues(
        output
      );

  }

}



/* ============================================================
   TRACK MODE LOOKUP
============================================================ */

function getTrackModeBySku_(
  productSheet,
  sku
) {

  const data =
    productSheet
      .getDataRange()
      .getValues();


  const headers =
    data[0];


  const colSKU =
    headers.indexOf(
      "SKU"
    );


  const colMode =
    headers.indexOf(
      "Track Mode"
    );


  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    if (
      cleanText_(
        data[i][colSKU]
      )
      ===
      sku
    ) {

      return cleanText_(
        data[i][colMode]
      )
      .toUpperCase();

    }

  }


  return "";

}



/* ============================================================
   UNIQUE ID RUNNING — UNIT
============================================================ */

function getLastUnitRunning_(
  inventorySheet,
  prefix,
  locationCode
) {

  const lastRow =
    inventorySheet
      .getLastRow();


  if (
    lastRow < 2
  ) {

    return 0;

  }


  const ids =
    inventorySheet
      .getRange(
        2,
        1,
        lastRow - 1,
        1
      )
      .getDisplayValues()
      .flat();


  const regex =
    new RegExp(

      "^" +
      escapeRegex_(
        prefix
      ) +
      "-" +
      locationCode +
      "-(\\d+)$"

    );


  let max = 0;


  ids.forEach(
    id => {

      const match =
        String(id)
          .match(regex);


      if (match) {

        max =
          Math.max(
            max,
            Number(
              match[1]
            )
          );

      }

    }
  );


  return max;

}



/* ============================================================
   UNIQUE ID RUNNING — BULK
============================================================ */

function getLastBulkRunning_(
  inventorySheet,
  prefix,
  locationCode
) {

  const lastRow =
    inventorySheet
      .getLastRow();


  if (
    lastRow < 2
  ) {

    return 0;

  }


  const ids =
    inventorySheet
      .getRange(
        2,
        1,
        lastRow - 1,
        1
      )
      .getDisplayValues()
      .flat();


  const regex =
    new RegExp(

      "^" +
      escapeRegex_(
        prefix
      ) +
      "-" +
      locationCode +
      "-B(\\d+)$"

    );


  let max = 0;


  ids.forEach(
    id => {

      const match =
        String(id)
          .match(regex);


      if (match) {

        max =
          Math.max(
            max,
            Number(
              match[1]
            )
          );

      }

    }
  );


  return max;

}



/* ============================================================
   CLEAR SCANNER OUTPUT
============================================================ */

function clearScannerOutput_(
  sheet
) {

  const c =
    CONFIG.SCAN;


  [

    c.PRODUCT,
    c.SKU,
    c.CATEGORY,
    c.UNIT,
    c.LOT,
    c.EXPIRY,
    c.ITEM_LOCATION,
    c.STATUS,
    c.CURRENT_QTY,
    c.TRACK_MODE,
    c.VALIDATION

  ]
  .forEach(
    cell => {

      sheet
        .getRange(
          cell
        )
        .clearContent();

    }
  );

}



/* ============================================================
   TRANSACTION ID
============================================================ */

function createTransactionId_(
  type
) {

  const datePart =
    Utilities.formatDate(

      new Date(),

      Session
        .getScriptTimeZone(),

      "yyyyMMddHHmmss"

    );


  const randomPart =
    Math.floor(
      Math.random() *
      9000
    )
    + 1000;


  return (

    type +
    "-" +
    datePart +
    "-" +
    randomPart

  );

}



/* ============================================================
   CLEAN TEXT
============================================================ */

function cleanText_(
  value
) {

  if (
    value === null ||
    value === undefined
  ) {

    return "";

  }


  return String(
    value
  )
  .trim();

}



/* ============================================================
   REGEX ESCAPE
============================================================ */

function escapeRegex_(
  text
) {

  return String(
    text
  )
  .replace(

    /[.*+?^${}()|[\]\\]/g,

    "\\$&"

  );

}

function setupMedStockRulesAndSchema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const product = ss.getSheetByName("Product List");
  const inventory = ss.getSheetByName("Inventory");
  const log = ss.getSheetByName("Log Data");

  if (!product || !inventory || !log) {
    throw new Error("Missing Product List, Inventory, or Log Data sheet.");
  }

  // Extend Product List without moving any existing columns used by the current scripts.
  product.getRange("I1:L1").setValues([[
    "Stock Group", "Image URL", "Reorder Thonglor", "Reorder Silom"
  ]]);
  product.getRange("A1:H1").copyTo(
    product.getRange("I1:L1"),
    SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
    false
  );
  const productLastRow = product.getLastRow();
  if (productLastRow > 1) {
    const productCore = product.getRange(2, 1, productLastRow - 1, 8).getValues();
    const productExtra = product.getRange(2, 9, productLastRow - 1, 4).getValues();
    productCore.forEach((row, index) => {
      if (!row[0]) return;
      if (!productExtra[index][0]) productExtra[index][0] = "AES";
      if (productExtra[index][2] === "" || productExtra[index][2] == null) productExtra[index][2] = row[6];
      if (productExtra[index][3] === "" || productExtra[index][3] == null) productExtra[index][3] = row[6];
    });
    product.getRange(2, 9, productLastRow - 1, 4).setValues(productExtra);
  }
  product.getRange("I2:I500").setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(["AES", "PEN"], true).setAllowInvalid(false).build()
  );

  // Extend Inventory. FULL/OPEN is the physical item's type; Qty remains its current balance.
  inventory.getRange("N1:T1").setValues([[
    "Stock Type", "Initial Qty", "Opened At", "Updated At", "Used Up At", "Source Reference", "Updated By"
  ]]);
  inventory.getRange("A1:M1").copyTo(
    inventory.getRange("N1:T1"),
    SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
    false
  );
  const inventoryLastRow = inventory.getLastRow();
  if (inventoryLastRow > 1) {
    const inventoryCore = inventory.getRange(2, 1, inventoryLastRow - 1, 10).getValues();
    const initialQty = inventory.getRange(2, 15, inventoryLastRow - 1, 1).getValues();
    inventoryCore.forEach((row, index) => {
      if (!row[0]) return;
      if (initialQty[index][0] === "" || initialQty[index][0] == null) initialQty[index][0] = row[9];
    });
    inventory.getRange(2, 15, inventoryLastRow - 1, 1).setValues(initialQty);
  }
  inventory.getRange("N2:N1000").setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(["FULL", "OPEN"], true).setAllowInvalid(false).build()
  );
  inventory.getRange("J2:J1000").setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false).build()
  );

  const keptRules = inventory.getConditionalFormatRules().filter(rule => {
    const condition = rule.getBooleanCondition();
    if (!condition) return true;
    const values = condition.getCriteriaValues().map(String);
    return !values.includes("=$J2=0") && !values.includes('=AND($N2="OPEN",$J2>0)');
  });
  keptRules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied("=$J2=0")
      .setBackground("#F4CCCC")
      .setFontColor("#990000")
      .setRanges([inventory.getRange("A2:T1000")])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($N2="OPEN",$J2>0)')
      .setBackground("#FCE5CD")
      .setRanges([inventory.getRange("N2:N1000")])
      .build()
  );
  inventory.setConditionalFormatRules(keptRules);

  // Extend the append-only transaction log for traceable before/after balances.
  log.getRange("M1:R1").setValues([[
    "Qty Before", "Qty After", "Stock Type", "Stock Group", "Source", "Details"
  ]]);
  log.getRange("A1:L1").copyTo(
    log.getRange("M1:R1"),
    SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
    false
  );
  log.getRange("H2:H1000").setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList([
      "IMPORT", "STOCK IN", "STOCK OUT", "SALE", "CHECK STOCK", "ADJUSTMENT",
      "OPEN", "USED UP", "TRANSFER", "RETURN", "EXPIRED", "DAMAGED"
    ], true).setAllowInvalid(false).build()
  );
  log.getRange("O2:O1000").setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(["FULL", "OPEN"], true).setAllowInvalid(false).build()
  );
  log.getRange("P2:P1000").setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(["AES", "PEN"], true).setAllowInvalid(false).build()
  );

  // Store business rules in one visible configuration sheet.
  let settings = ss.getSheetByName("Settings");
  if (!settings) settings = ss.insertSheet("Settings");
  const settingsData = [
    ["Setting", "Value", "Description"],
    ["BARCODE_FORMAT", "{SKU}-{DDMMYY}-{A####}", "Format for newly generated barcodes"],
    ["BARCODE_EXAMPLE", "AES-001-120926-A0001", "Example using DDMMYY"],
    ["BARCODE_DATE_FORMAT", "DDMMYY", "Date segment in the barcode"],
    ["BARCODE_SEQUENCE_SCOPE", "PER SKU / PER DAY", "Sequence resets for each SKU on each date"],
    ["ACTIVE_STOCK_GROUP", "AES", "DA/AES is implemented first"],
    ["STOCK_TYPES", "FULL,OPEN", "FULL = unopened; OPEN = opened with remaining quantity"],
    ["TYPE_ASSIGNMENT", "CHECK STOCK", "Staff identifies and sets FULL/OPEN during stock check"],
    ["MAX_OPEN_PER_SKU_LOCATION", "1", "At most one OPEN item for each SKU in each location"],
    ["OPEN_USAGE_RULE", "USE OPEN UNTIL QTY 0", "Finish the current OPEN item before opening the next FULL item"],
    ["ALLOW_NEGATIVE_STOCK", "NO", "Inventory Qty must never be below zero"],
    ["KEEP_ZERO_QTY_ROWS", "YES", "Keep exhausted rows for audit history"],
    ["ZERO_QTY_STATUS", "OUT OF STOCK", "Status used when Qty reaches zero"],
    ["ZERO_QTY_HIGHLIGHT", "LIGHT RED", "Exhausted inventory rows are highlighted"],
    ["LOCATIONS", "Thonglor,Silom", "Current physical locations"],
    ["REORDER_LEVEL_SCOPE", "PER LOCATION", "Separate thresholds for Thonglor and Silom"]
  ];
  settings.getRange(1, 1, settings.getMaxRows(), Math.min(settings.getMaxColumns(), 3)).clearContent();
  settings.getRange(1, 1, settingsData.length, 3).setValues(settingsData);
  settings.getRange("A1:C1")
    .setBackground("#1F4E78")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold");
  settings.setFrozenRows(1);
  settings.setColumnWidth(1, 230);
  settings.setColumnWidth(2, 220);
  settings.setColumnWidth(3, 520);
  settings.getRange(1, 1, settingsData.length, 3).setWrap(true).setVerticalAlignment("middle");

  product.autoResizeColumns(9, 4);
  inventory.autoResizeColumns(14, 7);
  log.autoResizeColumns(13, 6);
  ss.setActiveSheet(settings);
  SpreadsheetApp.flush();
}


const IMPORT_STOCK_CONFIG = {
  SHEET_NAME: "Import Stock",
  PRODUCT_SHEET: "Product List",
  INVENTORY_SHEET: "Inventory",
  LOG_SHEET: "Log Data",
  INPUT: {
    LOCATION: "B7",
    RECEIVED_DATE: "B8",
    BARCODE: "B5",
    LOT: "B13",
    EXPIRY: "B14",
    QTY: "B15",
    PRODUCT: "B9",
    SKU: "B10",
    TRACK_MODE: "B11",
    VALIDATION: "B17",
    AUTO_ADD: "D6",
    ADD: "D6",
    REVIEW: "B16",
    CONFIRM: "B17",
    DELETE_SELECTED: "B18",
    CLEAR_ALL: "B19",
    SUMMARY: "B20",
    REVIEW_HASH: "B30"
  },
  QUEUE_START_ROW: 4,
  QUEUE_END_ROW: 103,
  QUEUE_START_COL: 8,
  QUEUE_COL_COUNT: 12
};

function setupImportStockSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(IMPORT_STOCK_CONFIG.SHEET_NAME);
  if (sheet && sheet.getRange("A1").getDisplayValue()) {
    throw new Error("Import Stock sheet already exists. Use upgradeImportStockSheetV2 instead.");
  }
  if (!sheet) sheet = ss.insertSheet(IMPORT_STOCK_CONFIG.SHEET_NAME);
  buildImportStockSheetLayoutV2_(sheet, null);
  updateImportSettings_(ss);
  ss.setActiveSheet(sheet);
  ss.moveActiveSheet(8);
  sheet.setActiveRange(sheet.getRange("B5"));
  SpreadsheetApp.flush();
}

function upgradeImportStockSheetV2() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(IMPORT_STOCK_CONFIG.SHEET_NAME);
  if (!sheet) throw new Error("Import Stock sheet not found.");

  const inputValues = sheet.getRange("B3:B12").getValues();
  const summary = sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.SUMMARY).getValue();
  const reviewHash = sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.REVIEW_HASH).getValue();
  const oldQueueStartsAtD = sheet.getRange("D3").getDisplayValue() === "Select";
  const queueValues = sheet.getRange(oldQueueStartsAtD ? "D4:O103" : "J4:U103").getValues();

  buildImportStockSheetLayoutV2_(sheet, {
    inputValues: inputValues,
    summary: summary,
    reviewHash: reviewHash,
    queueValues: queueValues
  });
  updateImportSettings_(ss);
  ss.setActiveSheet(sheet);
  sheet.setActiveRange(sheet.getRange("B5"));
  SpreadsheetApp.flush();
}

function buildImportStockSheetLayoutV2_(sheet, preserved) {
  sheet.getRange("A1:S103").breakApart();
  sheet.getRange("A1:S103").clear();
  sheet.getRange("A1:S103").clearDataValidations();
  sheet.setHiddenGridlines(true);
  sheet.setFrozenRows(3);
  sheet.setFrozenColumns(0);

  sheet.getRange("A1:F1").merge().setValue("Aesthetic Stock Import Scanner");
  sheet.getRange("J1:U1").merge().setValue("PENDING IMPORT QUEUE");
  sheet.getRange("A2").setValue("STEP 1");
  sheet.getRange("B2:F2").merge().setValue("Scan / enter barcode below");
  sheet.getRange("J2:U2").merge().setValue("Review all rows before confirming. Lot and Expiry are optional.");

  sheet.getRange("A3:A12").setValues([
    ["Current Branch"],
    ["Received Date"],
    ["Barcode / Unique ID (Scan Here)"],
    ["Lot (Optional)"],
    ["Expiry Date (Optional)"],
    ["Qty"],
    ["Scanned Product"],
    ["SKU"],
    ["Track Mode"],
    ["Validation"]
  ]);
  sheet.getRange("A14").setValue("ADD TO QUEUE / AUTO ADD");
  sheet.getRange("A16:A19").setValues([
    ["1. REVIEW"],
    ["2. CONFIRM IMPORT"],
    ["DELETE SELECTED"],
    ["CANCEL / CLEAR ALL"]
  ]);
  sheet.getRange("A21").setValue("Batch Status");
  sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.SUMMARY).setValue("MANUAL MODE — READY FOR SCAN");
  sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.REVIEW_HASH).clearContent();

  sheet.getRange("D3:F3").merge().setValue("SAFE WORKFLOW");
  sheet.getRange("D4:F12").merge().setValue(
    "1. Select one branch for the batch\n" +
    "2. Scan barcode\n" +
    "3. Qty starts at 1 for every product\n" +
    "4. Auto Add ON: scan directly into queue\n" +
    "5. Auto Add OFF: edit details, then check ADD TO QUEUE\n" +
    "6. REVIEW before CONFIRM IMPORT"
  );

  sheet.getRange("J3:U3").setValues([[
    "Select", "Barcode", "SKU", "Product Name", "Lot", "Expiry", "Qty",
    "Type", "Location", "Validation", "Unit", "Track Mode"
  ]]);

  sheet.getRange("B3").setValue("Thonglor");
  sheet.getRange("B4").setValue(new Date()).setNumberFormat("dd-mmm-yyyy");
  sheet.getRange("B7").setNumberFormat("dd-mmm-yyyy");
  sheet.getRange("B8").setValue(1).setNumberFormat("0.###");
  sheet.getRange("Q4:Q103").setNumberFormat("dd-mmm-yyyy");
  sheet.getRange("R4:R103").setNumberFormat("0.###");

  const locationRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Thonglor", "Silom"], true).setAllowInvalid(false).build();
  const dateRule = SpreadsheetApp.newDataValidation()
    .requireDate().setAllowInvalid(false).build();
  const positiveQtyRule = SpreadsheetApp.newDataValidation()
    .requireNumberGreaterThan(0).setAllowInvalid(false).build();
  const fullRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["FULL"], true).setAllowInvalid(false).build();

  sheet.getRange("B3").setDataValidation(locationRule);
  sheet.getRange("B4").setDataValidation(dateRule);
  sheet.getRange("B7").setDataValidation(dateRule);
  sheet.getRange("B8").setDataValidation(positiveQtyRule);
  sheet.getRange("B14").insertCheckboxes().setValue(false);
  sheet.getRange("B16:B19").insertCheckboxes().setValues([[false], [false], [false], [false]]);
  sheet.getRange("H4:H103").insertCheckboxes();
  sheet.getRange("Q4:Q103").setDataValidation(dateRule);
  sheet.getRange("R4:R103").setDataValidation(positiveQtyRule);
  sheet.getRange("Q4:Q103").setDataValidation(fullRule);
  sheet.getRange("R4:R103").setDataValidation(locationRule);

  const teal = "#0B7285";
  const darkTeal = "#07505D";
  const paleBlue = "#D9EAF7";
  const scanYellow = "#FFE082";
  const green = "#93C47D";
  const darkGreen = "#38761D";
  const red = "#E69191";
  const paleRed = "#F4CCCC";
  const paleYellow = "#FFF2CC";

  sheet.getRange("A1:F1").setBackground(teal).setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(16);
  sheet.getRange("J1:U1").setBackground(teal).setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(14);
  sheet.getRange("A2").setBackground(paleBlue).setFontWeight("bold").setFontColor(darkTeal);
  sheet.getRange("B2:F2").setBackground(paleBlue).setFontWeight("bold").setFontColor(darkTeal);
  sheet.getRange("J2:U2").setBackground(paleBlue).setFontColor("#4A6075").setFontSize(10);
  sheet.getRange("A3:A12").setBackground(paleBlue).setFontWeight("bold").setFontColor("#24445A");
  sheet.getRange("B5").setBackground(scanYellow).setFontWeight("bold");
  sheet.getRange("B3:B12").setVerticalAlignment("middle");
  sheet.getRange("D3:F3").setBackground(paleYellow).setFontColor("#7F6000").setFontWeight("bold");
  sheet.getRange("D4:F12").setBackground(paleYellow).setFontColor("#7F6000").setWrap(true).setVerticalAlignment("top");
  sheet.getRange("J3:U3").setBackground(teal).setFontColor("#FFFFFF").setFontWeight("bold").setHorizontalAlignment("center");
  sheet.getRange("A14:B14").setBackground("#3D85C6").setFontColor("#FFFFFF").setFontWeight("bold");
  sheet.getRange("A16:B16").setBackground(paleBlue).setFontColor(darkTeal).setFontWeight("bold");
  sheet.getRange("A17:B17").setBackground(green).setFontColor(darkGreen).setFontWeight("bold");
  sheet.getRange("A18:B18").setBackground(paleYellow).setFontColor("#7F6000").setFontWeight("bold");
  sheet.getRange("A19:B19").setBackground(red).setFontColor("#7A0000").setFontWeight("bold");
  sheet.getRange("A21:B21").setBackground("#EEF2F6").setFontWeight("bold").setWrap(true);
  sheet.getRange("B12").setBackground(paleYellow).setFontWeight("bold").setWrap(true);
  sheet.getRange("J4:U103").setVerticalAlignment("middle");
  sheet.getRange("I4:J103").setNumberFormat("@");

  sheet.setColumnWidth(1, 225);
  sheet.setColumnWidth(2, 270);
  sheet.setColumnWidth(3, 24);
  sheet.setColumnWidths(4, 3, 72);
  sheet.setColumnWidth(7, 26);
  sheet.setColumnWidth(8, 60);
  sheet.setColumnWidth(9, 205);
  sheet.setColumnWidth(10, 90);
  sheet.setColumnWidth(11, 220);
  sheet.setColumnWidth(12, 105);
  sheet.setColumnWidth(13, 110);
  sheet.setColumnWidth(14, 80);
  sheet.setColumnWidth(15, 75);
  sheet.setColumnWidth(16, 100);
  sheet.setColumnWidth(17, 165);
  sheet.setColumnWidth(18, 80);
  sheet.setColumnWidth(19, 95);
  sheet.setRowHeight(1, 36);
  sheet.setRowHeight(2, 30);
  sheet.setRowHeight(3, 34);

  sheet.getRange("B14").setNote("Unchecked = review details first. Checked = each scanned barcode is added automatically.");
  sheet.getRange("B16").setNote("Validate every queued row and prepare the batch.");
  sheet.getRange("B17").setNote("After REVIEW, write the batch to Inventory and Log Data.");
  sheet.getRange("B18").setNote("Select queue rows in column H, then check here to remove them.");
  sheet.getRange("B19").setNote("Clear the current input and all queued rows.");

  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$S4="READY"')
      .setBackground("#E8F5E9").setRanges([sheet.getRange("J4:U103")]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($K4<>"",$S4<>"READY")')
      .setBackground(paleRed).setRanges([sheet.getRange("J4:U103")]).build()
  ]);

  if (preserved) {
    sheet.getRange("B3:B12").setValues(preserved.inputValues);
    if (!sheet.getRange("B8").getValue()) sheet.getRange("B8").setValue(1);
    sheet.getRange("B14").setValue(false);
    sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.SUMMARY).setValue(preserved.summary || "MANUAL MODE — READY FOR SCAN");
    sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.REVIEW_HASH).setValue(preserved.reviewHash || "");
    const kept = preserved.queueValues.filter(row => row[1]);
    if (kept.length) sheet.getRange(4, 8, kept.length, 12).setValues(kept);
  }
}

function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() === "Check Stock") { checkV1OnEdit_(e); return; }
  if (sheet.getName() === "Cut Stock" && cutV2Enabled_()) { cutV2OnEdit_(e); return; }
  if (sheet.getName() === "Gen_BC") { genBcOnEdit_(e); return; }
  if (sheet.getName() !== IMPORT_STOCK_CONFIG.SHEET_NAME) return;

  try {
    importStockOnEdit_(e);
  } catch (error) {
    sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.VALIDATION)
      .setValue("ERROR: " + error.message)
      .setBackground("#FCE8E6")
      .setFontColor("#A12A22");
  }
}

function importStockOnEdit_(e) {
  const sheet = e.range.getSheet();
  const a1 = e.range.getA1Notation();
  const checked = String(e.value).toUpperCase() === "TRUE";

  if (a1 === IMPORT_STOCK_CONFIG.INPUT.BARCODE) {
    lookupImportBarcode_(sheet);
    invalidateImportReview_(sheet, false);
    if (sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.AUTO_ADD).getValue() === true &&
        String(sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.BARCODE).getDisplayValue()).trim()) {
      addImportQueueItem_(sheet);
    }
    return;
  }

  if (a1 === IMPORT_STOCK_CONFIG.INPUT.LOCATION) {
    const location = sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.LOCATION).getDisplayValue();
    const queueValues = sheet.getRange("H4:S103").getValues();
    queueValues.forEach(row => { if (row[1]) row[8] = location; });
    sheet.getRange("H4:S103").setValues(queueValues);
    invalidateImportReview_(sheet, true);
    return;
  }

  if (a1 === IMPORT_STOCK_CONFIG.INPUT.RECEIVED_DATE ||
      a1 === IMPORT_STOCK_CONFIG.INPUT.LOT ||
      a1 === IMPORT_STOCK_CONFIG.INPUT.EXPIRY ||
      a1 === IMPORT_STOCK_CONFIG.INPUT.QTY) {
    invalidateImportReview_(sheet, false);
    return;
  }

  if (a1 === IMPORT_STOCK_CONFIG.INPUT.AUTO_ADD) {
    sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.SUMMARY).setValue(
      checked ? "AUTO ADD ON — READY FOR SCAN" : "MANUAL MODE — SCAN AND REVIEW DETAILS"
    );
    sheet.setActiveRange(sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.BARCODE));
    return;
  }

  const row = e.range.getRow();
  const col = e.range.getColumn();
  if (row >= IMPORT_STOCK_CONFIG.QUEUE_START_ROW && row <= IMPORT_STOCK_CONFIG.QUEUE_END_ROW &&
      col >= 12 && col <= 16) {
    sheet.getRange(row, 17).setValue("IMPORT WILL RECHECK");
    invalidateImportReview_(sheet, true);
  }
}

function lookupImportBarcode_(sheet) {
  const barcodeCell = sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.BARCODE);
  const barcode = String(barcodeCell.getDisplayValue()).trim().toUpperCase();
  sheet.getRange("B9:B11").clearContent();
  sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.VALIDATION).setBackground("#FFF4D6").setFontColor("#7A5200");
  if (!barcode) return;

  barcodeCell.setValue(barcode);
  const parsed = parseImportBarcode_(barcode);
  const product = findImportProduct_(parsed.sku);
  if (!product) throw new Error("Unknown or inactive SKU: " + parsed.sku);
  if (inventoryHasBarcode_(barcode)) throw new Error("Barcode already exists in Inventory");
  if (queueHasBarcode_(sheet, barcode)) throw new Error("Barcode already exists in the queue");

  sheet.getRange("B9:B11").setValues([
    [product.name],
    [product.sku],
    [product.trackMode]
  ]);
  sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.QTY).setValue(1);
  sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.VALIDATION)
    .setValue("READY TO ADD")
    .setBackground("#E8F5EF")
    .setFontColor("#147A55");
}

function addImportQueueItem_(sheet) {
  const barcode = String(sheet.getRange("B5").getDisplayValue()).trim().toUpperCase();
  const lot = String(sheet.getRange("B13").getDisplayValue()).trim();
  const expiry = sheet.getRange("B14").getValue();
  const qty = Number(sheet.getRange("B15").getValue());
  const productName = String(sheet.getRange("B9").getDisplayValue()).trim();
  const sku = String(sheet.getRange("B10").getDisplayValue()).trim();
  const trackMode = String(sheet.getRange("B11").getDisplayValue()).trim().toUpperCase();
  const location = String(sheet.getRange("B7").getDisplayValue()).trim();

  const parsed = parseImportBarcode_(barcode);
  const product = findImportProduct_(parsed.sku);
  if (!product || !productName || sku !== parsed.sku) throw new Error("Scan the barcode again before adding");
  if (inventoryHasBarcode_(barcode)) throw new Error("Barcode already exists in Inventory");
  if (queueHasBarcode_(sheet, barcode)) throw new Error("Barcode already exists in the queue");
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Qty must be greater than 0");
  if (trackMode === "UNIT" && qty !== 1) throw new Error("UNIT Qty must be 1");
  if (!["Thonglor", "Silom"].includes(location)) throw new Error("Select a valid branch");

  const queueRange = sheet.getRange("H4:S103");
  const queue = queueRange.getValues();
  const emptyIndex = queue.findIndex(row => !row[1]);
  if (emptyIndex < 0) throw new Error("Import queue is full");

  queue[emptyIndex] = [
    false,
    barcode,
    sku,
    product.name,
    lot,
    expiry || "",
    qty,
    "FULL",
    location,
    "READY",
    product.unit,
    product.trackMode
  ];
  queueRange.setValues(queue);

  clearImportStockInput_(sheet);
  sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.VALIDATION).setBackground("#FFF4D6").setFontColor("#7A5200");
  sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.SUMMARY).setValue("QUEUED: " + barcode + " — " + (sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.AUTO_ADD).getValue() === true ? "AUTO ADD ON" : "MANUAL ADD") + " / READY FOR IMPORT");
  sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.REVIEW_HASH).clearContent();
  sheet.setActiveRange(sheet.getRange("B5"));
}

function reviewImportStock_(sheet) {
  const result = validateImportQueue_(sheet);
  if (!result.items.length) {
    sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.SUMMARY).setValue("BLOCK: QUEUE IS EMPTY");
    sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.REVIEW_HASH).clearContent();
    return;
  }
  if (!result.valid) {
    sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.SUMMARY).setValue("BLOCK: FIX " + result.errorCount + " INVALID ROW(S)");
    sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.REVIEW_HASH).clearContent();
    return;
  }

  sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.REVIEW_HASH).setValue(result.hash);
  sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.SUMMARY).setValue(
    "READY TO IMPORT: " + result.items.length + " BARCODE(S), TOTAL QTY " + result.totalQty
  );
}

function confirmImportStock_(sheet) {
  const expectedHash = String(sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.REVIEW_HASH).getDisplayValue()).trim();
  if (!expectedHash) {
    sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.SUMMARY).setValue("BLOCK: CLICK IMPORT TO VALIDATE");
    return;
  }

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) throw new Error("Another stock update is running. Try again.");

  try {
    const result = validateImportQueue_(sheet);
    if (!result.valid) {
      sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.SUMMARY).setValue("BLOCK: FIX INVALID ROWS AND IMPORT AGAIN");
      sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.REVIEW_HASH).clearContent();
      return;
    }
    if (result.hash !== expectedHash) {
      sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.SUMMARY).setValue("BLOCK: QUEUE CHANGED — CLICK IMPORT AGAIN");
      sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.REVIEW_HASH).clearContent();
      return;
    }

    const ss = sheet.getParent();
    const inventory = ss.getSheetByName(IMPORT_STOCK_CONFIG.INVENTORY_SHEET);
    const log = ss.getSheetByName(IMPORT_STOCK_CONFIG.LOG_SHEET);
    if (!inventory || !log) throw new Error("Inventory or Log Data sheet is missing");

    const now = new Date();
    const timezone = ss.getSpreadsheetTimeZone();
    const batchId = "IMPORT-" + Utilities.formatDate(now, timezone, "yyyyMMdd-HHmmss");
    const receivedDate = sheet.getRange("B8").getValue();
    const staff = Session.getActiveUser().getEmail() || "Spreadsheet User";

    const inventoryRows = result.items.map(item => [
      item.barcode,
      item.sku,
      item.product.name,
      item.product.category,
      item.product.unit,
      item.lot,
      item.expiry || "",
      item.location,
      "IN STOCK",
      item.qty,
      item.barcode,
      receivedDate,
      "Imported from Import Stock — " + batchId,
      "FULL",
      item.qty,
      "",
      now,
      "",
      batchId,
      staff
    ]);

    const logRows = result.items.map((item, index) => [
      now,
      batchId + "-" + String(index + 1).padStart(3, "0"),
      item.barcode,
      item.sku,
      item.product.name,
      item.lot,
      item.expiry || "",
      "IMPORT",
      item.qty,
      item.location,
      staff,
      batchId,
      0,
      item.qty,
      "FULL",
      item.parsed.stockGroup,
      "Import Stock",
      "Received " + Utilities.formatDate(receivedDate, timezone, "yyyy-MM-dd")
    ]);

    const inventoryStartRow = inventory.getLastRow() + 1;
    const logStartRow = log.getLastRow() + 1;
    ensureSheetCapacity_(inventory, inventoryStartRow + inventoryRows.length - 1);
    ensureSheetCapacity_(log, logStartRow + logRows.length - 1);

    let inventoryWritten = false;
    let logWritten = false;
    try {
      inventory.getRange(inventoryStartRow, 1, inventoryRows.length, 20).setValues(inventoryRows);
      inventoryWritten = true;
      log.getRange(logStartRow, 1, logRows.length, 18).setValues(logRows);
      logWritten = true;
      SpreadsheetApp.flush();
    } catch (writeError) {
      if (inventoryWritten) inventory.getRange(inventoryStartRow, 1, inventoryRows.length, 20).clearContent();
      if (logWritten) log.getRange(logStartRow, 1, logRows.length, 18).clearContent();
      SpreadsheetApp.flush();
      throw new Error("Import was rolled back: " + writeError.message);
    }

    clearImportStockQueue_(sheet, false);
    sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.SUMMARY).setValue(
      "COMPLETED: " + batchId + " — " + inventoryRows.length + " BARCODE(S) IMPORTED"
    );
    sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.REVIEW_HASH).clearContent();
    sheet.setActiveRange(sheet.getRange("B5"));
  } finally {
    lock.releaseLock();
  }
}

function validateImportQueue_(sheet) {
  const rows = sheet.getRange("H4:S103").getValues();
  const branch = String(sheet.getRange("B7").getDisplayValue()).trim();
  const receivedDate = sheet.getRange("B8").getValue();
  const barcodeCounts = {};

  rows.forEach(row => {
    const barcode = String(row[1] || "").trim().toUpperCase();
    if (barcode) barcodeCounts[barcode] = (barcodeCounts[barcode] || 0) + 1;
  });

  let errorCount = 0;
  const items = [];
  rows.forEach((row, index) => {
    const sheetRow = index + 4;
    const barcode = String(row[1] || "").trim().toUpperCase();
    if (!barcode) {
      sheet.getRange(sheetRow, 17).clearContent();
      return;
    }

    const errors = [];
    let parsed = null;
    let product = null;
    try {
      parsed = parseImportBarcode_(barcode);
      product = findImportProduct_(parsed.sku);
      if (!product) errors.push("UNKNOWN SKU");
    } catch (error) {
      errors.push("INVALID BARCODE");
    }

    const sku = String(row[2] || "").trim();
    const lot = String(row[4] || "").trim();
    const expiry = row[5] || "";
    const qty = Number(row[6]);
    const type = String(row[7] || "").trim().toUpperCase();
    const location = String(row[8] || "").trim();
    const trackMode = String(row[11] || "").trim().toUpperCase();

    if (parsed && sku !== parsed.sku) errors.push("SKU MISMATCH");
    if (barcodeCounts[barcode] > 1) errors.push("DUPLICATE IN QUEUE");
    if (inventoryHasBarcode_(barcode)) errors.push("ALREADY IN INVENTORY");
    if (!Number.isFinite(qty) || qty <= 0) errors.push("INVALID QTY");
    if (trackMode === "UNIT" && qty !== 1) errors.push("UNIT QTY MUST BE 1");
    if (type !== "FULL") errors.push("TYPE MUST BE FULL");
    if (location !== branch || !["Thonglor", "Silom"].includes(location)) errors.push("LOCATION MISMATCH");
    if (expiry && Object.prototype.toString.call(expiry) !== "[object Date]") errors.push("INVALID EXPIRY");

    const validation = errors.length ? "BLOCK: " + errors.join(" / ") : "READY";
    sheet.getRange(sheetRow, 17).setValue(validation);
    if (errors.length) errorCount += 1;

    items.push({
      sheetRow,
      barcode,
      sku,
      lot,
      expiry,
      qty,
      type,
      location,
      trackMode,
      parsed,
      product
    });
  });

  const dateKey = receivedDate instanceof Date && !isNaN(receivedDate)
    ? Utilities.formatDate(receivedDate, sheet.getParent().getSpreadsheetTimeZone(), "yyyy-MM-dd")
    : "";
  const hashPayload = JSON.stringify({
    branch,
    receivedDate: dateKey,
    items: items.map(item => ({
      barcode: item.barcode,
      sku: item.sku,
      lot: item.lot,
      expiry: item.expiry instanceof Date && !isNaN(item.expiry)
        ? Utilities.formatDate(item.expiry, sheet.getParent().getSpreadsheetTimeZone(), "yyyy-MM-dd")
        : "",
      qty: item.qty,
      type: item.type,
      location: item.location
    }))
  });
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, hashPayload);
  const hash = digest.map(byte => (byte + 256).toString(16).slice(-2)).join("");
  const totalQty = items.reduce((sum, item) => sum + (Number.isFinite(item.qty) ? item.qty : 0), 0);

  return {
    valid: items.length > 0 && errorCount === 0 && dateKey !== "",
    errorCount: errorCount + (dateKey ? 0 : 1),
    items,
    totalQty: Number(totalQty.toFixed(3)),
    hash
  };
}

function deleteSelectedImportRows_(sheet) {
  const range = sheet.getRange("H4:S103");
  const rows = range.getValues();
  const selectedCount = rows.filter(row => row[0] === true && row[1]).length;
  if (!selectedCount) {
    sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.SUMMARY).setValue("NO QUEUE ROWS SELECTED");
    return;
  }

  const keptRows = rows.filter(row => row[1] && row[0] !== true).map(row => [false].concat(row.slice(1)));
  range.clearContent();
  if (keptRows.length) {
    sheet.getRange(4, 8, keptRows.length, 12).setValues(keptRows);
  }
  sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.SUMMARY).setValue("REMOVED " + selectedCount + " ROW(S) — IMPORT WILL RECHECK");
  sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.REVIEW_HASH).clearContent();
}

function clearImportStockInput_(sheet) {
  sheet.getRange("B5").clearContent();
  sheet.getRange("B9:B11").clearContent();
  sheet.getRange("B13:B15").clearContent();
  sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.QTY).setValue(1);
  sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.VALIDATION)
    .clearContent().setBackground("#FFF2CC").setFontColor("#7F6000");
}

function clearImportStockQueue_(sheet, showStatus) {
  sheet.getRange("H4:S103").clearContent();
  clearImportStockInput_(sheet);
  sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.AUTO_ADD).setValue(false);
  sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.REVIEW_HASH).clearContent();
  if (showStatus) sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.SUMMARY).setValue("CANCELLED — READY FOR NEW SCAN");
  sheet.setActiveRange(sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.BARCODE));
}

function invalidateImportReview_(sheet, showMessage) {
  sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.REVIEW_HASH).clearContent();
  if (showMessage && queueItemCount_(sheet) > 0) {
    sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.SUMMARY).setValue("QUEUE CHANGED — IMPORT WILL RECHECK");
  }
}

function queueItemCount_(sheet) {
  return sheet.getRange("I4:I103").getDisplayValues().filter(row => row[0]).length;
}

function queueHasBarcode_(sheet, barcode) {
  return sheet.getRange("I4:I103").getDisplayValues()
    .some(row => String(row[0]).trim().toUpperCase() === barcode);
}

function inventoryHasBarcode_(barcode) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(IMPORT_STOCK_CONFIG.INVENTORY_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return false;
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getDisplayValues()
    .some(row => [row[0], row[10]].some(value => String(value).trim().toUpperCase() === barcode));
}

function findImportProduct_(sku) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(IMPORT_STOCK_CONFIG.PRODUCT_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getDisplayValues();
  const row = rows.find(values => String(values[0]).trim().toUpperCase() === sku);
  if (!row || String(row[7]).trim().toUpperCase() !== "YES") return null;
  return {
    sku: String(row[0]).trim().toUpperCase(),
    category: String(row[2]).trim(),
    name: String(row[3]).trim(),
    unit: String(row[4]).trim(),
    trackMode: String(row[5]).trim().toUpperCase(),
    stockGroup: String(row[8] || "AES").trim().toUpperCase()
  };
}

function parseImportBarcode_(rawBarcode) {
  const barcode = String(rawBarcode || "").trim().toUpperCase();
  const match = barcode.match(/^([A-Z]{2,6}-\d{3})-(\d{6})-([A-Z]\d{4})$/);
  if (!match || Number(match[3].slice(1)) === 0) throw new Error("Invalid barcode format");

  const dateCode = match[2];
  const day = Number(dateCode.slice(0, 2));
  const month = Number(dateCode.slice(2, 4));
  const year = 2000 + Number(dateCode.slice(4, 6));
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error("Invalid barcode date");
  }

  return {
    barcode,
    sku: match[1],
    dateCode,
    sequence: match[3],
    stockGroup: match[1].split("-")[0]
  };
}

function ensureSheetCapacity_(sheet, requiredLastRow) {
  if (requiredLastRow > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), requiredLastRow - sheet.getMaxRows());
  }
}

function updateImportSettings_(ss) {
  const sheet = ss.getSheetByName("Settings");
  if (!sheet) return;
  const rows = [
    ["IMPORT_DEFAULT_TYPE", "FULL", "Every imported barcode starts as FULL"],
    ["IMPORT_LOT_REQUIRED", "NO", "Lot is optional during import"],
    ["IMPORT_EXPIRY_REQUIRED", "NO", "Expiry is optional during import"],
    ["IMPORT_UNIT_DEFAULT_QTY", "1", "UNIT items default to Qty 1"],
    ["IMPORT_BULK_QTY_REQUIRED", "YES", "BULK items require a positive Qty"],
    ["IMPORT_DEFAULT_QTY", "1", "Every scanned product starts at Qty 1"],
    ["IMPORT_AUTO_QUEUE_DEFAULT", "OFF", "ADD TO QUEUE starts unchecked when the page is reset"],
    ["IMPORT_BRANCH_SCOPE", "PER BATCH", "One branch is selected for the complete import batch"]
  ];
  const existing = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getDisplayValues()
    .map(row => row[0]);
  const newRows = rows.filter(row => !existing.includes(row[0]));
  if (!newRows.length) return;
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, newRows.length, 3).setValues(newRows);
  sheet.getRange(startRow, 1, newRows.length, 3).setWrap(true).setVerticalAlignment("middle");
}


/* ============================================================
   IMPORT STOCK V3 — CLICKABLE BUTTON LAYOUT
============================================================ */

function upgradeImportStockSheetV3() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(IMPORT_STOCK_CONFIG.SHEET_NAME);
  if (!sheet) throw new Error("Import Stock sheet not found.");

  const old = {
    location: sheet.getRange("B3").getValue(),
    receivedDate: sheet.getRange("B4").getValue(),
    barcode: sheet.getRange("B5").getValue(),
    lot: sheet.getRange("B6").getValue(),
    expiry: sheet.getRange("B7").getValue(),
    qty: sheet.getRange("B8").getValue(),
    product: sheet.getRange("B9").getValue(),
    sku: sheet.getRange("B10").getValue(),
    trackMode: sheet.getRange("B11").getValue(),
    validation: sheet.getRange("B12").getValue(),
    autoAdd: sheet.getRange("B14").getValue() === true,
    summary: sheet.getRange("B21").getValue(),
    reviewHash: sheet.getRange("B22").getValue()
  };
  const queueSource = sheet.getRange("H3").getDisplayValue() === "Select" ? "H4:S103" : "J4:U103";
  const queueValues = sheet.getRange(queueSource).getValues();

  sheet.getImages().forEach(image => {
    if (String(image.getAltTextTitle() || "").indexOf("IMPORT_STOCK_BUTTON_") === 0) image.remove();
  });

  sheet.getRange("A1:U103").breakApart();
  sheet.getRange("A1:U103").clear();
  sheet.getRange("A1:U103").clearDataValidations();
  sheet.showRows(1, Math.min(30, sheet.getMaxRows()));
  sheet.setHiddenGridlines(true);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(0);

  const teal = "#0B7285";
  const paleBlue = "#D9EAF7";
  const yellow = "#FFE082";
  const paleYellow = "#FFF2CC";
  const blue = "#3D85C6";
  const green = "#93C47D";
  const red = "#E69191";

  sheet.getRange("A1:I1").merge().setValue("Aesthetic Stock Import Scanner")
    .setBackground(teal).setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(16)
    .setVerticalAlignment("middle");
  sheet.getRange("J1:U1").merge().setValue("PENDING IMPORT QUEUE")
    .setBackground(teal).setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(14);
  sheet.getRange("A3").setValue("STEP 1").setBackground(paleBlue).setFontWeight("bold").setFontColor("#07505D");
  sheet.getRange("B3").setValue("Scan / enter barcode below").setBackground(paleBlue).setFontWeight("bold").setFontColor("#07505D");
  sheet.getRange("J2:U2").merge().setValue("Select queued rows before DELETE SELECTED. IMPORT validates every row automatically.")
    .setBackground(paleBlue).setFontColor("#4A6075").setFontSize(10);

  [[5,"Barcode / Unique ID (Scan Here)"],[7,"Current Branch"],[8,"Received Date"],
   [9,"Scanned Product"],[10,"SKU"],[11,"Track Mode"],[13,"Lot (Optional)"],
   [14,"Expiry Date (Optional)"],[15,"Qty"],[17,"Validation Result"],[20,"Batch Status"]]
  .forEach(item => sheet.getRange(item[0],1).setValue(item[1]).setBackground(paleBlue).setFontWeight("bold").setFontColor("#24445A"));

  sheet.getRange("B5").setBackground(yellow).setFontWeight("bold");
  sheet.getRange("B17").setBackground(paleYellow).setFontWeight("bold").setWrap(true);
  sheet.getRange("A20:B20").setBackground("#EEF2F6").setFontWeight("bold").setWrap(true);

  sheet.getRange("D3:F4").merge().setValue("ADD TO QUEUE").setBackground(blue).setFontColor("#FFFFFF")
    .setFontWeight("bold").setFontSize(16).setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("D6").insertCheckboxes().setValue(false);
  sheet.getRange("E6:F6").merge().setValue("AUTO ADD").setBackground(paleBlue).setFontColor("#07505D")
    .setFontWeight("bold").setFontSize(12).setVerticalAlignment("middle");
  sheet.getRange("D7:F8").merge().setValue("DELETE SELECTED").setBackground("#FFD966").setFontColor("#7F6000")
    .setFontWeight("bold").setFontSize(15).setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("D10:F14").merge().setValue("IMPORT").setBackground(green).setFontColor("#173F35")
    .setFontWeight("bold").setFontSize(22).setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("G10:I14").merge().setValue("CANCEL / CLEAR").setBackground(red).setFontColor("#7A0000")
    .setFontWeight("bold").setFontSize(20).setHorizontalAlignment("center").setVerticalAlignment("middle");

  sheet.getRange("D16:I16").merge().setValue("SAFE WORKFLOW").setBackground(paleYellow).setFontColor("#7F6000").setFontWeight("bold");
  sheet.getRange("D17:I22").merge().setValue(
    "1. Select one branch for the batch\n" +
    "2. Scan barcode — Qty starts at 1\n" +
    "3. AUTO ADD ON sends scans directly to the queue\n" +
    "4. AUTO ADD OFF lets you edit details, then click ADD TO QUEUE\n" +
    "5. Select queue rows and click DELETE SELECTED when needed\n" +
    "6. IMPORT checks all rows before writing Inventory and Log Data"
  ).setBackground(paleYellow).setFontColor("#7F6000").setWrap(true).setVerticalAlignment("top");

  sheet.getRange("J3:U3").setValues([[
    "Select", "Barcode", "SKU", "Product Name", "Lot", "Expiry", "Qty",
    "Type", "Location", "Validation", "Unit", "Track Mode"
  ]]).setBackground(teal).setFontColor("#FFFFFF").setFontWeight("bold").setHorizontalAlignment("center");

  const locationRule = SpreadsheetApp.newDataValidation().requireValueInList(["Thonglor","Silom"], true).setAllowInvalid(false).build();
  const dateRule = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build();
  const positiveQtyRule = SpreadsheetApp.newDataValidation().requireNumberGreaterThan(0).setAllowInvalid(false).build();
  const fullRule = SpreadsheetApp.newDataValidation().requireValueInList(["FULL"], true).setAllowInvalid(false).build();
  sheet.getRange("B7").setDataValidation(locationRule);
  sheet.getRange("B8").setDataValidation(dateRule).setNumberFormat("dd-mmm-yyyy");
  sheet.getRange("B14").setDataValidation(dateRule).setNumberFormat("dd-mmm-yyyy");
  sheet.getRange("B15").setDataValidation(positiveQtyRule).setNumberFormat("0.###");
  sheet.getRange("J4:J103").insertCheckboxes();
  sheet.getRange("O4:O103").setDataValidation(dateRule).setNumberFormat("dd-mmm-yyyy");
  sheet.getRange("P4:P103").setDataValidation(positiveQtyRule).setNumberFormat("0.###");
  sheet.getRange("Q4:Q103").setDataValidation(fullRule);
  sheet.getRange("R4:R103").setDataValidation(locationRule);
  sheet.getRange("K4:L103").setNumberFormat("@");
  sheet.getRange("J4:U103").setVerticalAlignment("middle");

  sheet.getRange("B7").setValue(["Thonglor","Silom"].includes(String(old.location)) ? old.location : "Thonglor");
  sheet.getRange("B8").setValue(old.receivedDate instanceof Date ? old.receivedDate : new Date());
  sheet.getRange("B5").setValue(old.barcode || "");
  sheet.getRange("B9").setValue(old.product || "");
  sheet.getRange("B10").setValue(old.sku || "");
  sheet.getRange("B11").setValue(old.trackMode || "");
  sheet.getRange("B13").setValue(old.lot || "");
  sheet.getRange("B14").setValue(old.expiry || "");
  sheet.getRange("B15").setValue(Number(old.qty) > 0 ? old.qty : 1);
  sheet.getRange("B17").setValue(old.validation || "");
  sheet.getRange("B20").setValue(old.summary || "MANUAL MODE — READY FOR SCAN");
  sheet.getRange("B30").setValue(old.reviewHash || "");
  sheet.getRange("D6").setValue(false);
  const keptQueue = queueValues.filter(row => row[1]);
  if (keptQueue.length) sheet.getRange(4,10,keptQueue.length,12).setValues(keptQueue);

  sheet.setColumnWidth(1,225); sheet.setColumnWidth(2,270); sheet.setColumnWidth(3,25);
  sheet.setColumnWidths(4,6,90); sheet.setColumnWidth(10,60); sheet.setColumnWidth(11,205);
  sheet.setColumnWidth(12,90); sheet.setColumnWidth(13,220); sheet.setColumnWidth(14,105);
  sheet.setColumnWidth(15,110); sheet.setColumnWidth(16,80); sheet.setColumnWidth(17,75);
  sheet.setColumnWidth(18,100); sheet.setColumnWidth(19,165); sheet.setColumnWidth(20,80); sheet.setColumnWidth(21,95);
  sheet.setRowHeight(1,36); sheet.setRowHeight(3,30); sheet.setRowHeight(4,28);
  sheet.setRowHeight(6,32); sheet.setRowHeight(7,30); sheet.setRowHeight(8,28);
  for (let r=10; r<=14; r++) sheet.setRowHeight(r,28);
  sheet.setRowHeight(16,28); for (let r=17; r<=22; r++) sheet.setRowHeight(r,25);
  sheet.hideRows(30);

  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$S4="READY"')
      .setBackground("#E8F5E9").setRanges([sheet.getRange("J4:U103")]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($K4<>"",$S4<>"READY")')
      .setBackground("#F4CCCC").setRanges([sheet.getRange("J4:U103")]).build()
  ]);

  sheet.getRange("D6").setNote("Checked: each scanned barcode is added automatically. Unchecked: review details and click ADD TO QUEUE.");
  createImportStockButton_(sheet,"ADD_TO_QUEUE","importStockAddButton",4,3,270,58);
  createImportStockButton_(sheet,"DELETE_SELECTED","importStockDeleteSelectedButton",4,7,270,58);
  createImportStockButton_(sheet,"IMPORT","importStockImportButton",4,10,270,140);
  createImportStockButton_(sheet,"CANCEL_CLEAR","importStockCancelButton",7,10,270,140);

  updateImportSettings_(ss);
  ss.setActiveSheet(sheet);
  sheet.setActiveRange(sheet.getRange("B5"));
  SpreadsheetApp.flush();
}

function createImportStockButton_(sheet, title, functionName, column, row, width, height) {
  const transparentPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4//8/IwAI/QL/1vP/NwAAAABJRU5ErkJggg==";
  const blob = Utilities.newBlob(Utilities.base64Decode(transparentPng), "image/png", title + ".png");
  sheet.insertImage(blob, column, row, 0, 0)
    .setWidth(width).setHeight(height)
    .setAltTextTitle("IMPORT_STOCK_BUTTON_" + title)
    .setAltTextDescription("Click to run " + functionName)
    .assignScript(functionName);
}

function getImportStockSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(IMPORT_STOCK_CONFIG.SHEET_NAME);
  if (!sheet) throw new Error("Import Stock sheet not found.");
  return sheet;
}

function showImportStockButtonError_(sheet, error) {
  const message = "ERROR: " + error.message;
  sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.VALIDATION).setValue(message)
    .setBackground("#F4CCCC").setFontColor("#A12A22");
  sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.SUMMARY).setValue(message);
}

function importStockAddButton() {
  const sheet = getImportStockSheet_();
  try { addImportQueueItem_(sheet); }
  catch (error) { showImportStockButtonError_(sheet, error); }
}

function importStockDeleteSelectedButton() {
  const sheet = getImportStockSheet_();
  try { deleteSelectedImportRows_(sheet); }
  catch (error) { showImportStockButtonError_(sheet, error); }
}

function importStockImportButton() {
  const sheet = getImportStockSheet_();
  try {
    reviewImportStock_(sheet);
    if (!String(sheet.getRange(IMPORT_STOCK_CONFIG.INPUT.REVIEW_HASH).getDisplayValue()).trim()) return;
    confirmImportStock_(sheet);
  } catch (error) { showImportStockButtonError_(sheet, error); }
}

function importStockCancelButton() {
  const sheet = getImportStockSheet_();
  try { clearImportStockQueue_(sheet, true); }
  catch (error) { showImportStockButtonError_(sheet, error); }
}


/* ============================================================
   IMPORT STOCK V4 — LEFT BUTTON STACK + QUEUE AT H:S
============================================================ */

function upgradeImportStockSheetV4() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(IMPORT_STOCK_CONFIG.SHEET_NAME);
  if (!sheet) throw new Error("Import Stock sheet not found.");

  const old = {
    location: sheet.getRange("B7").getValue(),
    receivedDate: sheet.getRange("B8").getValue(),
    barcode: sheet.getRange("B5").getValue(),
    lot: sheet.getRange("B13").getValue(),
    expiry: sheet.getRange("B14").getValue(),
    qty: sheet.getRange("B15").getValue(),
    product: sheet.getRange("B9").getValue(),
    sku: sheet.getRange("B10").getValue(),
    trackMode: sheet.getRange("B11").getValue(),
    validation: sheet.getRange("B17").getValue(),
    autoAdd: sheet.getRange("D6").getValue() === true,
    summary: sheet.getRange("B20").getValue(),
    reviewHash: sheet.getRange("B30").getValue()
  };
  const queueSource = sheet.getRange("H3").getDisplayValue() === "Select" ? "H4:S103" : "J4:U103";
  const queueValues = sheet.getRange(queueSource).getValues();

  sheet.getImages().forEach(image => {
    if (String(image.getAltTextTitle() || "").indexOf("IMPORT_STOCK_BUTTON_") === 0) image.remove();
  });

  sheet.getRange("A1:U103").breakApart();
  sheet.getRange("A1:U103").clear();
  sheet.getRange("A1:U103").clearDataValidations();
  sheet.showRows(1, Math.min(30, sheet.getMaxRows()));
  sheet.setHiddenGridlines(true);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(0);

  const teal = "#0B7285";
  const paleBlue = "#D9EAF7";
  const yellow = "#FFE082";
  const paleYellow = "#FFF2CC";
  const blue = "#3D85C6";
  const green = "#93C47D";
  const red = "#E69191";

  sheet.getRange("A1:F1").merge().setValue("Aesthetic Stock Import Scanner")
    .setBackground(teal).setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(16)
    .setVerticalAlignment("middle");
  sheet.getRange("H1:S1").merge().setValue("PENDING IMPORT QUEUE")
    .setBackground(teal).setFontColor("#FFFFFF").setFontWeight("bold").setFontSize(14);
  sheet.getRange("A3").setValue("STEP 1").setBackground(paleBlue).setFontWeight("bold").setFontColor("#07505D");
  sheet.getRange("B3").setValue("Scan / enter barcode below").setBackground(paleBlue).setFontWeight("bold").setFontColor("#07505D");
  sheet.getRange("H2:S2").merge().setValue("Select queued rows before DELETE SELECTED. IMPORT validates every row automatically.")
    .setBackground(paleBlue).setFontColor("#4A6075").setFontSize(10);

  [[5,"Barcode / Unique ID (Scan Here)"],[7,"Current Branch"],[8,"Received Date"],
   [9,"Scanned Product"],[10,"SKU"],[11,"Track Mode"],[13,"Lot (Optional)"],
   [14,"Expiry Date (Optional)"],[15,"Qty"],[17,"Validation Result"],[20,"Batch Status"]]
  .forEach(item => sheet.getRange(item[0],1).setValue(item[1]).setBackground(paleBlue).setFontWeight("bold").setFontColor("#24445A"));

  sheet.getRange("B5").setBackground(yellow).setFontWeight("bold");
  sheet.getRange("B17").setBackground(paleYellow).setFontWeight("bold").setWrap(true);
  sheet.getRange("A20:B20").setBackground("#EEF2F6").setFontWeight("bold").setWrap(true);

  sheet.getRange("D3:F4").merge().setValue("ADD TO QUEUE").setBackground(blue).setFontColor("#FFFFFF")
    .setFontWeight("bold").setFontSize(16).setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("D6").insertCheckboxes().setValue(false);
  sheet.getRange("E6:F6").merge().setValue("AUTO ADD").setBackground(paleBlue).setFontColor("#07505D")
    .setFontWeight("bold").setFontSize(12).setVerticalAlignment("middle");
  sheet.getRange("D7:F8").merge().setValue("DELETE SELECTED").setBackground("#FFD966").setFontColor("#7F6000")
    .setFontWeight("bold").setFontSize(15).setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("D10:F14").merge().setValue("IMPORT").setBackground(green).setFontColor("#173F35")
    .setFontWeight("bold").setFontSize(22).setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("D16:F20").merge().setValue("CANCEL / CLEAR").setBackground(red).setFontColor("#7A0000")
    .setFontWeight("bold").setFontSize(20).setHorizontalAlignment("center").setVerticalAlignment("middle");

  sheet.getRange("A22:F22").merge().setValue("SAFE WORKFLOW").setBackground(paleYellow).setFontColor("#7F6000").setFontWeight("bold");
  sheet.getRange("A23:F28").merge().setValue(
    "1. Select one branch for the batch\n" +
    "2. Scan barcode — Qty starts at 1\n" +
    "3. AUTO ADD ON sends scans directly to the queue\n" +
    "4. AUTO ADD OFF lets you edit details, then click ADD TO QUEUE\n" +
    "5. Select queue rows and click DELETE SELECTED when needed\n" +
    "6. IMPORT checks all rows before writing Inventory and Log Data"
  ).setBackground(paleYellow).setFontColor("#7F6000").setWrap(true).setVerticalAlignment("top");

  sheet.getRange("H3:S3").setValues([[
    "Select", "Barcode", "SKU", "Product Name", "Lot", "Expiry", "Qty",
    "Type", "Location", "Validation", "Unit", "Track Mode"
  ]]).setBackground(teal).setFontColor("#FFFFFF").setFontWeight("bold").setHorizontalAlignment("center");

  const locationRule = SpreadsheetApp.newDataValidation().requireValueInList(["Thonglor","Silom"], true).setAllowInvalid(false).build();
  const dateRule = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build();
  const positiveQtyRule = SpreadsheetApp.newDataValidation().requireNumberGreaterThan(0).setAllowInvalid(false).build();
  const fullRule = SpreadsheetApp.newDataValidation().requireValueInList(["FULL"], true).setAllowInvalid(false).build();
  sheet.getRange("B7").setDataValidation(locationRule);
  sheet.getRange("B8").setDataValidation(dateRule).setNumberFormat("dd-mmm-yyyy");
  sheet.getRange("B14").setDataValidation(dateRule).setNumberFormat("dd-mmm-yyyy");
  sheet.getRange("B15").setDataValidation(positiveQtyRule).setNumberFormat("0.###");
  sheet.getRange("H4:H103").insertCheckboxes();
  sheet.getRange("M4:M103").setDataValidation(dateRule).setNumberFormat("dd-mmm-yyyy");
  sheet.getRange("N4:N103").setDataValidation(positiveQtyRule).setNumberFormat("0.###");
  sheet.getRange("O4:O103").setDataValidation(fullRule);
  sheet.getRange("P4:P103").setDataValidation(locationRule);
  sheet.getRange("I4:J103").setNumberFormat("@");
  sheet.getRange("H4:S103").setVerticalAlignment("middle");

  sheet.getRange("B7").setValue(["Thonglor","Silom"].includes(String(old.location)) ? old.location : "Thonglor");
  sheet.getRange("B8").setValue(old.receivedDate instanceof Date ? old.receivedDate : new Date());
  sheet.getRange("B5").setValue(old.barcode || "");
  sheet.getRange("B9").setValue(old.product || "");
  sheet.getRange("B10").setValue(old.sku || "");
  sheet.getRange("B11").setValue(old.trackMode || "");
  sheet.getRange("B13").setValue(old.lot || "");
  sheet.getRange("B14").setValue(old.expiry || "");
  sheet.getRange("B15").setValue(Number(old.qty) > 0 ? old.qty : 1);
  sheet.getRange("B17").setValue(old.validation || "");
  sheet.getRange("B20").setValue(old.summary || "MANUAL MODE — READY FOR SCAN");
  sheet.getRange("B30").setValue(old.reviewHash || "");
  sheet.getRange("D6").setValue(false);
  const keptQueue = queueValues.filter(row => row[1]);
  if (keptQueue.length) sheet.getRange(4,8,keptQueue.length,12).setValues(keptQueue);

  sheet.setColumnWidth(1,225); sheet.setColumnWidth(2,270); sheet.setColumnWidth(3,25);
  sheet.setColumnWidths(4,3,90); sheet.setColumnWidth(7,25);
  sheet.setColumnWidth(8,60); sheet.setColumnWidth(9,205); sheet.setColumnWidth(10,90);
  sheet.setColumnWidth(11,220); sheet.setColumnWidth(12,105); sheet.setColumnWidth(13,110);
  sheet.setColumnWidth(14,80); sheet.setColumnWidth(15,75); sheet.setColumnWidth(16,100);
  sheet.setColumnWidth(17,165); sheet.setColumnWidth(18,80); sheet.setColumnWidth(19,95);
  sheet.setRowHeight(1,36); sheet.setRowHeight(3,30); sheet.setRowHeight(4,28);
  sheet.setRowHeight(6,32); sheet.setRowHeight(7,30); sheet.setRowHeight(8,28);
  for (let r=10; r<=20; r++) sheet.setRowHeight(r,28);
  sheet.setRowHeight(22,28); for (let r=23; r<=28; r++) sheet.setRowHeight(r,25);
  sheet.hideRows(30);

  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$Q4="READY"')
      .setBackground("#E8F5E9").setRanges([sheet.getRange("H4:S103")]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($I4<>"",$Q4<>"READY")')
      .setBackground("#F4CCCC").setRanges([sheet.getRange("H4:S103")]).build()
  ]);

  sheet.getRange("D6").setNote("Checked: each scanned barcode is added automatically. Unchecked: review details and click ADD TO QUEUE.");
  createImportStockButton_(sheet,"ADD_TO_QUEUE","importStockAddButton",4,3,270,58);
  createImportStockButton_(sheet,"DELETE_SELECTED","importStockDeleteSelectedButton",4,7,270,58);
  createImportStockButton_(sheet,"IMPORT","importStockImportButton",4,10,270,140);
  createImportStockButton_(sheet,"CANCEL_CLEAR","importStockCancelButton",4,16,270,140);

  updateImportSettings_(ss);
  ss.setActiveSheet(sheet);
  sheet.setActiveRange(sheet.getRange("B5"));
  SpreadsheetApp.flush();
}



/* MedStock barcode issuing: one barcode per physical item. */
const GEN_BC_V1 = { MARKER: 'MEDSTOCK_GEN_BC_V1', REGISTRY: 'BC_Registry', QUEUE: 'H4:L103', MAX_LABELS: 500 };

function genBcSheet_() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Gen_BC');
  if (!s || s.getRange('B29').getValue() !== GEN_BC_V1.MARKER) throw new Error('Run setupGenBarcodeV1 first.');
  return s;
}
function genBcStatus_(message) { genBcSheet_().getRange('B18:B20').setValue(message); }
function genBcRunCode_(number) {
  if (!Number.isInteger(number) || number < 1 || number > 26 * 9999) throw new Error('Run code exhausted (Z9999).');
  return String.fromCharCode(65 + Math.floor((number - 1) / 9999)) + String((number - 1) % 9999 + 1).padStart(4, '0');
}
function genBcSequence_(barcode) {
  const m = String(barcode || '').trim().toUpperCase().match(/^([A-Z]{2,6}-\d{3})-\d{6}-([A-Z])(\d{4})$/);
  if (!m || Number(m[3]) === 0) return null;
  return {sku: m[1], number: (m[2].charCodeAt(0) - 65) * 9999 + Number(m[3])};
}
function genBcProducts_() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Product List');
  if (!s || s.getLastRow() < 2) throw new Error('Product List is empty.');
  const values = s.getRange(2,1,s.getLastRow()-1,8).getDisplayValues();
  const products = {}; values.forEach(r => {
    const sku = r[0].trim().toUpperCase();
    if (!sku || r[7].trim().toUpperCase() !== 'YES') return;
    if (products[sku]) throw new Error('Duplicate SKU in Product List: ' + sku);
    products[sku] = {sku:sku, name:r[3].trim(), unit:r[4].trim(), mode:r[5].trim().toUpperCase()};
  }); return products;
}
function genBcLookup_(s) {
  const value = String(s.getRange('B5').getDisplayValue()).trim();
  if (!value) { s.getRange('B7:B9').clearContent(); return; }
  const products = genBcProducts_();
  const key = value.split(' | ')[0].trim().toUpperCase();
  const p = products[key] || Object.values(products).find(p => p.name.toLowerCase() === value.toLowerCase());
  if (!p) { s.getRange('B7:B9').clearContent(); throw new Error('Choose an active product from the dropdown.'); }
  s.getRange('B7:B9').setValues([[p.name],[p.sku],[p.mode]]);
  return p;
}
function genBcSummary_(s) {
  const rows = s.getRange(GEN_BC_V1.QUEUE).getValues().filter(r => r[1]);
  const total = rows.reduce((sum,r) => sum + (Number(r[3]) || 0),0);
  s.getRange('H2:L2').setValue(rows.length + ' products / ' + total + ' barcodes');
}
function genBcOnEdit_(e) {
  const s = e.range.getSheet(); if (s.getRange('B29').getValue() !== GEN_BC_V1.MARKER) return;
  try {
    const a = e.range.getA1Notation();
    if (a === 'B5') { genBcLookup_(s); s.getRange('B11').setValue(1); }
    const r = e.range.getRow(), c = e.range.getColumn();
    if (r <= 103 && e.range.getLastRow() >= 4 && c <= 12 && e.range.getLastColumn() >= 9) {
      s.getRange('B30').setValue(Utilities.getUuid());
      genBcSummary_(s);
      s.getRange(Math.max(4,r),12,Math.min(103,e.range.getLastRow())-Math.max(4,r)+1,1).setValue('WILL CHECK');
    }
    if (a === 'B3') s.getRange('B30').setValue(Utilities.getUuid());
  } catch(error) { s.getRange('B18').setValue('ERROR: ' + error.message); }
}
function genBcAddToQueue() {
  const lock = LockService.getDocumentLock(); if (!lock.tryLock(10000)) throw new Error('Please try again.');
  try {
    const s = genBcSheet_(), p = genBcLookup_(s), qty = Number(s.getRange('B11').getValue());
    if (!p) throw new Error('Choose a product first.');
    if (!Number.isInteger(qty) || qty < 1) throw new Error('Number of pieces must be a positive whole number.');
    const rows = s.getRange(GEN_BC_V1.QUEUE).getValues();
    const total = rows.reduce((sum,r) => sum + (r[1] ? Number(r[3]) || 0 : 0),0) + qty;
    if (total > GEN_BC_V1.MAX_LABELS) throw new Error('Maximum 500 labels per batch.');
    let i = rows.findIndex(r => r[1] === p.sku); if (i < 0) i = rows.findIndex(r => !r[1]);
    if (i < 0) throw new Error('Queue is full.');
    rows[i] = [false,p.sku,p.name,qty + (rows[i][1] ? Number(rows[i][3]) : 0),'READY'];
    s.getRange(GEN_BC_V1.QUEUE).setValues(rows); s.getRange('B30').setValue(Utilities.getUuid());
    s.getRange('B5').clearContent(); s.getRange('B7:B9').clearContent(); s.getRange('B11').setValue(1);
    genBcSummary_(s); genBcStatus_('Added ' + p.sku + '. Review the queue before GENERATE BARCODE.');
    s.setActiveRange(s.getRange('B5'));
  } catch(error) {genBcStatus_('ERROR: ' + error.message);} finally {lock.releaseLock();}
}
function genBcDeleteSelected() {
  const lock = LockService.getDocumentLock(); if (!lock.tryLock(10000)) throw new Error('Please try again.');
  try {
    const s = genBcSheet_(), rows = s.getRange(GEN_BC_V1.QUEUE).getValues();
    const count = rows.filter(r => r[0] === true && r[1]).length;
    if (!count) {genBcStatus_('Select queue rows to remove.'); return;}
    const kept = rows.filter(r => r[1] && r[0] !== true).map(r => [false].concat(r.slice(1)));
    s.getRange(GEN_BC_V1.QUEUE).clearContent(); if (kept.length) s.getRange(4,8,kept.length,5).setValues(kept);
    s.getRange('B30').setValue(Utilities.getUuid()); genBcSummary_(s);genBcStatus_('Removed ' + count + ' queued products.');
  } finally {lock.releaseLock();}
}
function genBcCancel() {
  const s=genBcSheet_(); const ui=SpreadsheetApp.getUi();
  if (ui.alert('Clear barcode queue','Clear selected product and pending queue? Issued barcodes remain in BC_Registry.',ui.ButtonSet.YES_NO)!==ui.Button.YES) return;
  const lock=LockService.getDocumentLock();lock.waitLock(10000);
  try{s.getRange(GEN_BC_V1.QUEUE).clearContent();s.getRange('B5').clearContent();s.getRange('B7:B9').clearContent();s.getRange('B11').setValue(1);s.getRange('B30').setValue(Utilities.getUuid());genBcSummary_(s);genBcStatus_('Ready to select a product.');}finally{lock.releaseLock();}
}
function genBcValidate_(s, productOverride) {
  const products=productOverride || genBcProducts_(), rows=s.getRange(GEN_BC_V1.QUEUE).getValues(), items=[], seen={};
  const date=s.getRange('B3').getValue();
  if (!(date instanceof Date) || isNaN(date)) throw new Error('Enter a valid barcode date.');
  const dateCode=Utilities.formatDate(date,s.getParent().getSpreadsheetTimeZone(),'ddMMyy');
  const errors=[];
  rows.forEach((r,i)=>{
    if (!r[1] && !r[2] && !r[3]) return;
    const sku=String(r[1]||'').trim().toUpperCase(),p=products[sku],qty=Number(r[3]);let error='';
    if(!p || !/^[A-Z]{2,6}-\d{3}$/.test(sku))error='UNKNOWN / INVALID SKU';
    else if(seen[sku])error='DUPLICATE SKU';
    else if(!Number.isInteger(qty)||qty<1)error='WHOLE NUMBER > 0 REQUIRED';
    seen[sku]=true;s.getRange(i+4,12).setValue(error||'READY');
    if(error)errors.push('Row '+(i+4)+': '+error);else items.push({sku:sku,name:p.name,unit:p.unit,mode:p.mode,qty:qty});
  });
  if(errors.length)throw new Error(errors.join('\n'));
  if(!items.length)throw new Error('Queue is empty.');
  const total=items.reduce((n,p)=>n+p.qty,0);if(total>GEN_BC_V1.MAX_LABELS)throw new Error('Maximum 500 labels per batch.');
  const payload=JSON.stringify({date:dateCode,items:items});
  return {items:items,total:total,date:date,dateCode:dateCode,payload:payload};
}
function genBcHighwater_(ss,registry) {
  const high={}; const take=value=>{const p=genBcSequence_(value);if(p)high[p.sku]=Math.max(high[p.sku]||0,p.number);};
  if(registry.getLastRow()>1)registry.getRange(2,3,registry.getLastRow()-1,1).getDisplayValues().forEach(r=>take(r[0]));
  const inventory=ss.getSheetByName('Inventory');if(inventory && inventory.getLastRow()>1)inventory.getRange(2,1,inventory.getLastRow()-1,11).getDisplayValues().forEach(r=>{take(r[0]);take(r[10]);});
  const legacy=ss.getSheetByName('_Gen_BC_Legacy');if(legacy && legacy.getLastRow()>1)legacy.getRange(2,2,legacy.getLastRow()-1,2).getDisplayValues().forEach(r=>r.forEach(take));
  return high;
}
function genBcGenerate() {
  let batch='';
  try {
    const s=genBcSheet_(),preview=genBcValidate_(s),ui=SpreadsheetApp.getUi();
    const answer=ui.alert('Confirm barcode generation',preview.items.map(p=>p.sku+'  '+p.name+'  x '+p.qty).join('\n')+'\n\nTotal: '+preview.total+' unique barcodes\nDate: '+preview.dateCode+'\n1 barcode = 1 physical item',ui.ButtonSet.YES_NO);
    if(answer!==ui.Button.YES)return;
    const lock=LockService.getDocumentLock();lock.waitLock(30000);
    try {
      const checked=genBcValidate_(s);if(checked.payload!==preview.payload)throw new Error('Queue changed. Review and generate again.');
      const ss=s.getParent(),registry=ss.getSheetByName(GEN_BC_V1.REGISTRY);
      if(!registry)throw new Error('BC_Registry is missing.');
      let request=String(s.getRange('B30').getValue()||'');if(!request){request=Utilities.getUuid();s.getRange('B30').setValue(request);}
      const previous=registry.getLastRow()>1?registry.getRange(2,1,registry.getLastRow()-1,12).getValues():[];
      const issued=previous.find(r=>r[10]===request && r[11]===checked.payload);
      if(issued)batch=issued[1];
      else {
        const props=PropertiesService.getDocumentProperties(), high=genBcHighwater_(ss,registry), reservations={},out=[],now=new Date();
        batch='BC-'+Utilities.formatDate(now,ss.getSpreadsheetTimeZone(),'yyyyMMdd-HHmmss')+'-'+Utilities.getUuid().slice(0,8);
        checked.items.forEach(p=>{
          const key='GEN_BC_SEQ_'+ss.getId()+'_'+p.sku;
          const start=Math.max(high[p.sku]||0,Number(props.getProperty(key))||0);
          genBcRunCode_(start+p.qty);
          for(let n=1;n<=p.qty;n++){
            const run=genBcRunCode_(start+n),barcode=p.sku+'-'+checked.dateCode+'-'+run;
            out.push([now,batch,barcode,p.sku,p.name,checked.date,run,p.unit,p.mode,'ISSUED',request,checked.payload]);
          }
          reservations[key]=String(start+p.qty);
        });
        // Reserve first: a failed write may leave a gap, but can never reuse a serial number.
        props.setProperties(reservations);
        const row=registry.getLastRow()+1;ensureSheetCapacity_(registry,row+out.length-1);
        registry.getRange(row,1,out.length,12).setValues(out);SpreadsheetApp.flush();
      }
      s.getRange('B15').setValue(batch);s.getRange(GEN_BC_V1.QUEUE).clearContent();s.getRange('B30').setValue(Utilities.getUuid());genBcSummary_(s);
      genBcStatus_('Created '+checked.total+' barcodes. Preparing Print_BC...');
      genBcPrintBatch_(batch);genBcStatus_('Created '+checked.total+' barcodes. Ready in Print_BC. Reprint uses the same codes.');
    } finally {lock.releaseLock();}
  } catch(error){genBcStatus_((batch?'Batch '+batch+' retained; use REPRINT BATCH. ':'')+'ERROR: '+error.message);}
}
function genBcReprintBatch() {
  const lock=LockService.getDocumentLock();if(!lock.tryLock(30000))throw new Error('Please try again.');
  try {const batch=String(genBcSheet_().getRange('B15').getDisplayValue()).trim();if(!batch)throw new Error('Select a generated batch first.');genBcPrintBatch_(batch);}
  catch(error){genBcStatus_('ERROR: '+error.message);}finally{lock.releaseLock();}
}
function genBcPrintBatch_(batch) {
  const ss=SpreadsheetApp.getActiveSpreadsheet(),registry=ss.getSheetByName(GEN_BC_V1.REGISTRY);
  const rows=registry.getLastRow()>1?registry.getRange(2,1,registry.getLastRow()-1,12).getValues().filter(r=>r[1]===batch):[];
  if(!rows.length)throw new Error('Batch not found: '+batch);
  const s=ss.getSheetByName('Print_BC')||ss.insertSheet('Print_BC');
  const needed = genBcRenderLabels_(s,rows);
  SpreadsheetApp.flush();ss.setActiveSheet(s);s.setActiveRange(s.getRange(1,1,needed-1,13));
  ss.toast(rows.length+' labels. File > Print > Selected cells; fit to width.','Print_BC',10);
}
function genBcButton_(s,range,label,color,fn) {
  const r=s.getRange(range);r.merge().setValue(label).setBackground(color).setFontWeight('bold').setFontColor(color==='#3D85C6'?'#FFFFFF':'#24445A').setFontSize(14).setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4//8/IwAI/QL/1vP/NwAAAABJRU5ErkJggg==';
  const blob=Utilities.newBlob(Utilities.base64Decode(png),'image/png',fn+'.png');
  s.insertImage(blob,r.getColumn(),r.getRow(),0,0).setWidth(270).setHeight(r.getNumRows()*28).setAltTextTitle('GEN_BC_BUTTON_'+fn).setAltTextDescription(label).assignScript(fn);
}
function setupGenBarcodeV1() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(ss.getId()!=='1xrB9CnUe3umZ-pPq91idY1jQJWAoR9wrhM2_7gieG2Q')throw new Error('This setup is for MedStock only.');
  const lock=LockService.getDocumentLock();lock.waitLock(30000);
  try {
    const s=ss.getSheetByName('Gen_BC');if(!s)throw new Error('Gen_BC not found.');
    if(s.getRange('B29').getValue()===GEN_BC_V1.MARKER)throw new Error('Gen_BC V1 already installed.');
    if(!ss.getSheetByName('_Gen_BC_Legacy'))s.copyTo(ss).setName('_Gen_BC_Legacy').hideSheet();
    const oldPrint=ss.getSheetByName('Print_BC');if(oldPrint&&!ss.getSheetByName('_Print_BC_Legacy'))oldPrint.copyTo(ss).setName('_Print_BC_Legacy').hideSheet();
    let registry=ss.getSheetByName(GEN_BC_V1.REGISTRY);
    if(!registry){registry=ss.insertSheet(GEN_BC_V1.REGISTRY);registry.getRange('A1:L1').setValues([['Issued At','Batch ID','Barcode','SKU','Product Name','Barcode Date','Run Code','Unit','Track Mode','Status','Request ID','Request Snapshot']]);registry.setFrozenRows(1);registry.getRange('A1:L1').setBackground('#0B7285').setFontColor('#FFFFFF').setFontWeight('bold');registry.setColumnWidth(1,155);registry.setColumnWidth(2,270);registry.setColumnWidth(3,220);registry.setColumnWidth(4,100);registry.setColumnWidth(5,270);registry.setColumnWidth(6,110);registry.getRange('A2:A1000').setNumberFormat('dd/MM/yyyy HH:mm:ss');registry.getRange('F2:F1000').setNumberFormat('dd/MM/yyyy');registry.getRange('C2:D1000').setNumberFormat('@');registry.hideColumns(11,2);}
    if(s.getMaxColumns()<23)s.insertColumnsAfter(s.getMaxColumns(),23-s.getMaxColumns());
    ensureSheetCapacity_(s,1003);s.getRange(1,1,s.getMaxRows(),s.getMaxColumns()).breakApart();s.clear();s.getRange(1,1,s.getMaxRows(),s.getMaxColumns()).clearDataValidations();s.getImages().forEach(i=>i.remove());
    s.setHiddenGridlines(true);s.setFrozenRows(1);s.setFrozenColumns(0);s.showRows(1,31);s.setRowHeights(1,103,28);
    s.setColumnWidth(1,195);s.setColumnWidth(2,300);s.setColumnWidth(3,25);s.setColumnWidths(4,3,90);s.setColumnWidth(7,25);
    s.setColumnWidth(8,60);s.setColumnWidth(9,90);s.setColumnWidth(10,260);s.setColumnWidth(11,95);s.setColumnWidth(12,185);
    s.getRange('A1:F1').merge().setValue('GENERATE BARCODE').setBackground('#0B7285').setFontColor('white').setFontSize(16).setFontWeight('bold');s.setRowHeight(1,36);
    s.getRange('H1:L1').merge().setValue('BARCODE QUEUE').setBackground('#0B7285').setFontColor('white').setFontSize(14).setFontWeight('bold');
    s.getRange('H2:L2').merge().setBackground('#D9EAF7');
    [[3,'Barcode Date'],[5,'Select Product / SKU'],[7,'Product Name'],[8,'SKU'],[9,'Track Mode'],[11,'Number of Pieces'],[15,'Reprint Batch'],[18,'Status']].forEach(r=>s.getRange(r[0],1).setValue(r[1]).setBackground('#D9EAF7').setFontWeight('bold').setFontColor('#24445A'));
    s.getRange('B3').setValue(genBcToday_(ss)).setNumberFormat('dd/MM/yyyy').setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build()).setBackground('#FFF2CC');
    s.getRange('B5').setBackground('#FFE082');s.getRange('B7:B9').setBackground('#F3F6F8');s.getRange('B7').setWrap(true);s.setRowHeight(7,28);
    s.getRange('B11').setValue(1).setNumberFormat('0').setBackground('#FFF2CC').setDataValidation(SpreadsheetApp.newDataValidation().requireFormulaSatisfied('=AND(ISNUMBER(B11),B11=INT(B11),B11>=1,B11<=500)').setAllowInvalid(false).build());
    s.getRange('B15').setBackground('#FFF2CC').setFontSize(9).setWrap(true);s.getRange('B18:B20').merge().setBackground('#EEF2F6').setWrap(true).setVerticalAlignment('top');
    s.getRange('H3:L3').setValues([['Select','SKU','Product Name','Pieces','Validation']]).setBackground('#0B7285').setFontColor('white').setFontWeight('bold');
    s.getRange('H4:H103').insertCheckboxes();s.getRange('K4:K103').setNumberFormat('0').setBackground('#FFF2CC').setDataValidation(SpreadsheetApp.newDataValidation().requireFormulaSatisfied('=AND(ISNUMBER(K4),K4=INT(K4),K4>=1,K4<=500)').setAllowInvalid(false).build());
    s.getRange('J4:J103').setWrap(true);s.getRange('L4:L103').setWrap(true).setFontSize(10);
    s.getRange('A23:F23').merge().setValue('HOW TO USE').setBackground('#FFF2CC').setFontWeight('bold');
    s.getRange('A24:F28').merge().setValue('1. Choose a product by SKU or name and enter number of pieces.\n2. ADD TO QUEUE combines quantities for the same SKU.\n3. Review the queue, then GENERATE BARCODE and confirm.\n4. Print labels in Print_BC, attach to items, then scan in Import Stock.\n5. REPRINT BATCH uses existing codes. Maximum 500 labels per batch.\nOne barcode identifies one item. BULK quantity is entered during Import Stock.').setBackground('#FFF2CC').setWrap(true).setVerticalAlignment('top').setFontSize(10);
    s.getRange('U3').setValue('Product options');s.getRange('U4').setFormula('=IFERROR(SORT(FILTER(\'Product List\'!A2:A&" | "&\'Product List\'!D2:D,\'Product List\'!H2:H="YES",\'Product List\'!A2:A<>"")),"")');
    s.getRange('W3').setValue('Batch options');s.getRange('W4').setFormula('=IFERROR(SORT(UNIQUE(FILTER(BC_Registry!B2:B,BC_Registry!B2:B<>"")),1,FALSE),"")');
    s.getRange('B5').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(s.getRange('U4:U1003'),true).setAllowInvalid(true).build());
    s.getRange('B15').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(s.getRange('W4:W1003'),true).setAllowInvalid(true).build());s.hideColumns(21,3);
    s.getRange('B29').setValue(GEN_BC_V1.MARKER);s.getRange('B30').setValue(Utilities.getUuid());s.hideRows(29,2);
    genBcButton_(s,'D3:F4','ADD TO QUEUE','#3D85C6','genBcAddToQueue');
    genBcButton_(s,'D6:F7','DELETE SELECTED','#FFD966','genBcDeleteSelected');
    genBcButton_(s,'D9:F12','GENERATE BARCODE','#93C47D','genBcGenerate');
    genBcButton_(s,'D14:F17','CANCEL / CLEAR','#E69191','genBcCancel');
    genBcButton_(s,'D19:F21','REPRINT BATCH','#D9EAF7','genBcReprintBatch');
    genBcSummary_(s);genBcStatus_('Select a product to start. 1 barcode = 1 physical item.');
    ss.setActiveSheet(s);s.setActiveRange(s.getRange('B5'));SpreadsheetApp.flush();
  } finally {lock.releaseLock();}
}
function clearBarcodeSelection(){genBcCancel();}


function verifyGenBarcodeV1() {
  let passed=0;
  const equal=(actual,expected,label)=>{if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(label+': '+JSON.stringify(actual));passed++;};
  const reject=(fn,label)=>{let failed=false;try{fn();}catch(e){failed=true;}if(!failed)throw new Error('Expected rejection: '+label);passed++;};
  [[1,'A0001'],[9999,'A9999'],[10000,'B0001'],[19998,'B9999'],[19999,'C0001'],[259974,'Z9999']].forEach(t=>equal(genBcRunCode_(t[0]),t[1],'Run boundary'));
  [0,-1,1.5,259975,NaN].forEach(n=>reject(()=>genBcRunCode_(n),'Invalid sequence'));
  for(let n=1;n<=26000;n+=137){equal(genBcSequence_('AES-001-170926-'+genBcRunCode_(n)).number,n,'Run roundtrip');}
  equal(genBcSequence_('AES-001-170926-A0000'),null,'Zero sequence');
  equal(parseImportBarcode_('AES-001-170926-B0001').sku,'AES-001','Import letter B');
  equal(parseImportBarcode_('AES-001-170926-Z9999').sequence,'Z9999','Import letter Z');
  ['AES-001-310226-A0001','AES-001-170926-A0000','AES-001-170926-AA001'].forEach(b=>reject(()=>parseImportBarcode_(b),'Invalid import barcode'));
  const products={'AES-001':{sku:'AES-001',name:'Test product',unit:'CC',mode:'BULK'}};
  const fake=(rows,date)=>({getRange:a=>({getValues:()=>rows,getValue:()=>date,setValue:()=>{}}),getParent:()=>({getSpreadsheetTimeZone:()=> 'Asia/Bangkok'})});
  const date=new Date('2026-09-17T05:00:00Z');
  const result=genBcValidate_(fake([[false,'AES-001','Test product',3,'']],date),products);
  equal(result.total,3,'Three pieces');equal(result.dateCode,'170926','ddmmyy');
  [0,-1,1.5,'bad',501].forEach(q=>reject(()=>genBcValidate_(fake([[false,'AES-001','Test product',q,'']],date),products),'Invalid piece count'));
  reject(()=>genBcValidate_(fake([],date),products),'Empty queue');
  reject(()=>genBcValidate_(fake([[false,'AES-999','Unknown',1,'']],date),products),'Unknown SKU');
  reject(()=>genBcValidate_(fake([[false,'AES-001','Test product',1,''],[false,'AES-001','Test product',1,'']],date),products),'Duplicate SKU');
  reject(()=>genBcValidate_(fake([[false,'AES-001','Test product',1,'']],'bad'),products),'Invalid date');
  equal(genBcValidate_(fake([[false,'AES-001','Test product',500,'']],date),products).total,500,'Batch limit');
  console.log('PASS: '+passed+' barcode / import / queue validation checks. No live stock or barcode records were written.');
}

function genBcRenderLabels_(s,rows) {
  const needed=Math.ceil(rows.length/2)*8;ensureSheetCapacity_(s,needed);if(s.getMaxColumns()<13)s.insertColumnsAfter(s.getMaxColumns(),13-s.getMaxColumns());
  s.getRange(1,1,s.getMaxRows(),s.getMaxColumns()).breakApart();s.clear();s.setHiddenGridlines(true);s.setFrozenRows(0);s.setFrozenColumns(0);
  s.setColumnWidths(1,6,56);s.setColumnWidth(7,24);s.setColumnWidths(8,6,56);s.setRowHeights(1,needed,22);
  rows.forEach((r,i)=>{
    const top=1+Math.floor(i/2)*8,col=i%2===0?1:8;
    const url='https://bwipjs-api.metafloor.com/?bcid=code128&text='+encodeURIComponent(r[2])+'&scale=3&height=14&paddingwidth=12&paddingheight=2';
    // Label format: large product name, barcode, then a smaller unique ID.
    // The SKU is already included in the unique ID, so it is not repeated.
    s.getRange(top,col,1,6).merge().setValue(r[4]).setFontWeight('bold').setFontSize(16).setWrap(true);
    s.setRowHeight(top,36);
    s.getRange(top+1,col,4,6).merge().setFormula('=IMAGE("'+url+'",4,82,320)');
    s.getRange(top+5,col,1,6).merge().setValue(r[2]).setFontWeight('normal').setFontSize(8).setNumberFormat('@');
    s.setRowHeights(top+1,4,22);
    s.setRowHeight(top+5,18);
    s.getRange(top,col,6,6).setHorizontalAlignment('center').setVerticalAlignment('middle').setBackground('#FFFFFF').setBorder(true,true,true,true,false,false);
  });

  return needed;
}

function genBcToday_(ss){
  const text=Utilities.formatDate(new Date(),'Asia/Bangkok','yyyy-MM-dd');
  return Utilities.parseDate(text,ss.getSpreadsheetTimeZone(),'yyyy-MM-dd');
}
function finishGenBarcodeV1Setup(){
  const s=genBcSheet_(),ss=s.getParent();s.getRange('A1:A103').clearDataValidations();
  s.getRange('B3').setValue(genBcToday_(ss));
  ss.setActiveSheet(s);s.setActiveRange(s.getRange('B5'));SpreadsheetApp.flush();
  console.log('Gen_BC installed. Date defaults to Bangkok calendar date. Existing queue preserved.');
}
function previewGenBarcodeLabelsV1(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(ss.getSheetByName('_BC_Print_QA'))throw new Error('QA preview already exists.');
  const s=ss.insertSheet('_BC_Print_QA');
  const rows=[1,2,3].map(n=>[new Date(),'TEST','TEST-001-170926-A'+String(n).padStart(4,'0'),'TEST-001','TEST LABEL - DO NOT USE']);
  genBcRenderLabels_(s,rows);ss.setActiveSheet(s);s.getRange('A1').activate();SpreadsheetApp.flush();
  console.log('Preview only. No issued barcodes, counters, Inventory or Log Data changed.');
}
function removeGenBarcodePreviewV1(){
  const ss=SpreadsheetApp.getActiveSpreadsheet(),s=ss.getSheetByName('_BC_Print_QA');
  if(s){if(s.getRange('A1').getValue()!=='TEST LABEL - DO NOT USE')throw new Error('Unexpected preview content.');ss.deleteSheet(s);}
  ss.setActiveSheet(genBcSheet_());
}


/* Cut Stock V2: staged cuts, partial use, one OPEN item per SKU/location. */
const CUT_V2={MARKER:'MEDSTOCK_CUT_V2',QUEUE:'H4:W103',MODE_ALL:'ALL',MODE_PARTIAL:'PARTIAL'};
function cutV2Sheet_(){const s=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Cut Stock');if(!s||s.getRange('B31').getValue()!==CUT_V2.MARKER)throw new Error('Cut Stock V2 is not installed.');return s;}
function cutV2Enabled_(){const s=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Cut Stock');return !!s&&s.getRange('B31').getValue()===CUT_V2.MARKER;}
function cutV2Status_(s,message){s.getRange('B23:B25').setValue(message).setWrap(true);}
function cutV2Context_(){
 const ss=SpreadsheetApp.getActiveSpreadsheet(),inventory=ss.getSheetByName('Inventory'),product=ss.getSheetByName('Product List'),log=ss.getSheetByName('Log Data');
 if(!inventory||!product||!log)throw new Error('Inventory, Product List or Log Data is missing.');
 const head=inventory.getRange(1,1,1,20).getDisplayValues()[0];
 ['Unique ID','SKU','Product Name','Category','Unit','Lot','Expiry Date','Location','Status','Qty','Barcode Value','Received / Count Date','Notes','Stock Type','Initial Qty','Opened At','Updated At','Used Up At','Source Reference','Updated By'].forEach((h,i)=>{if(head[i]!==h)throw new Error('Inventory header changed: '+h);});
 const products={};if(product.getLastRow()>1)product.getRange(2,1,product.getLastRow()-1,8).getDisplayValues().forEach(r=>{const sku=String(r[0]).trim().toUpperCase();if(sku){if(products[sku])throw new Error('Duplicate Product List SKU: '+sku);products[sku]={mode:String(r[5]).trim().toUpperCase()};}});
 const rows=inventory.getLastRow()>1?inventory.getRange(2,1,inventory.getLastRow()-1,20).getValues():[];
 const items=rows.map((r,i)=>({row:i+2,data:r,id:String(r[0]||'').trim().toUpperCase(),barcode:String(r[10]||r[0]||'').trim().toUpperCase(),sku:String(r[1]||'').trim().toUpperCase(),name:String(r[2]||''),unit:String(r[4]||''),location:String(r[7]||'').trim(),status:String(r[8]||'').trim().toUpperCase(),qty:Number(r[9]),type:String(r[13]||'').trim().toUpperCase(),mode:(products[String(r[1]).trim().toUpperCase()]||{}).mode||''})).filter(i=>i.id);
 return {ss:ss,inventory:inventory,log:log,items:items};
}
function cutV2Find_(ctx,barcode){const key=String(barcode||'').trim().toUpperCase();const found=ctx.items.filter(i=>i.id===key||i.barcode===key);if(found.length!==1)throw new Error(found.length?'Duplicate barcode in Inventory: '+key:'Barcode not found: '+key);return found[0];}
function cutV2Snapshot_(i){return JSON.stringify([i.id,i.sku,i.location,i.status,i.qty,i.type,i.mode]);}
function cutV2Transition_(item,mode,requested){
 if(item.status!=='IN STOCK'||!Number.isFinite(item.qty)||item.qty<=0)throw new Error('Item is not available in stock.');
 if(!['FULL','OPEN'].includes(item.type))throw new Error('Stock Type is blank/invalid. Set FULL or OPEN for this item in Inventory first.');
 if(!['UNIT','BULK'].includes(item.mode))throw new Error('Unknown Track Mode.');
 if(!['ALL','PARTIAL'].includes(mode))throw new Error('Choose ALL or PARTIAL.');
 const amount=mode==='ALL'?item.qty:Number(requested);
 if(!Number.isFinite(amount)||amount<=0)throw new Error('Qty must be greater than 0.');
 if(amount>item.qty)throw new Error('Insufficient Qty: '+item.qty+' '+item.unit); 
 if(item.mode==='UNIT'&&(mode!=='ALL'||item.qty!==1||amount!==1))throw new Error('UNIT requires ALL and exactly one physical item (Qty 1).');
 const after=Math.round((item.qty-amount)*1000000)/1000000;
 if(after<0)throw new Error('Negative stock is not allowed.');
 return {amount:amount,after:after,typeAfter:mode==='PARTIAL'?'OPEN':item.type};
}
function cutV2Plan_(ctx,rows,branch){
 const issues={},planned=[],seen={},byId={};ctx.items.forEach(i=>{byId[i.id]=i;});
 const fail=(n,message)=>{issues[n]=(issues[n]?issues[n]+' / ':'')+message;};
 rows.forEach((r,n)=>{
  if(!r[1])return;
  try{
   if(!['Thonglor','Silom'].includes(branch))throw new Error('Choose a branch.');
   const item=cutV2Find_(ctx,r[1]);
   if(seen[item.id]!==undefined){fail(seen[item.id],'Duplicate barcode in queue');throw new Error('Duplicate barcode in queue');}seen[item.id]=n;
   if(item.location!==branch)throw new Error('Wrong branch: item is at '+item.location);
   if(r[15]!==item.id||r[14]!==cutV2Snapshot_(item))throw new Error('Stock changed since scan. Remove this row and scan again.');
   const reason=String(r[8]||'').trim().toUpperCase(),mode=String(r[9]||'').trim().toUpperCase();
   if(!['SALE','USE'].includes(reason))throw new Error('Choose SALE or USE.');
   const result=cutV2Transition_(item,mode,r[10]);
   planned.push({index:n,item:item,reason:reason,mode:mode,amount:result.amount,after:result.after,typeAfter:result.typeAfter,statusAfter:result.after>0?'IN STOCK':reason==='SALE'&&mode==='ALL'?'SOLD':'OUT OF STOCK'});
  }catch(error){fail(n,error.message);}
 });
 const touched=new Set(planned.map(p=>p.item.sku+'|'+p.item.location)),finalOpen={},changes={};planned.forEach(p=>{changes[p.item.id]=p;});
 ctx.items.forEach(i=>{const p=changes[i.id],qty=p?p.after:i.qty,type=p?p.typeAfter:i.type,key=i.sku+'|'+i.location;if(qty>0&&type==='OPEN'){(finalOpen[key]||(finalOpen[key]=[])).push(i.id);}});
 planned.forEach(p=>{
  const key=p.item.sku+'|'+p.item.location,open=finalOpen[key]||[];
  if(open.length>1)fail(p.index,'Only one OPEN item allowed. Finish: '+open.filter(id=>id!==p.item.id).join(', '));
  if(p.item.type==='FULL'&&p.mode==='PARTIAL'){
   const unknown=ctx.items.filter(i=>i.id!==p.item.id&&i.sku===p.item.sku&&i.location===p.item.location&&i.qty>0&&!['FULL','OPEN'].includes(i.type));
   if(unknown.length)fail(p.index,'Set FULL/OPEN on existing stock first: '+unknown.map(i=>i.id).join(', '));
   // Even when the new item is used completely, consume the existing OPEN first.
   const remainingOpen=ctx.items.filter(i=>i.id!==p.item.id&&i.sku===p.item.sku&&i.location===p.item.location&&i.type==='OPEN'&&(changes[i.id]?changes[i.id].after:i.qty)>0);
   if(remainingOpen.length)fail(p.index,'Use existing OPEN first: '+remainingOpen.map(i=>i.id).join(', '));
  }
 });
 const signature=JSON.stringify({branch:branch,items:planned.map(p=>[p.item.id,cutV2Snapshot_(p.item),p.reason,p.mode,p.amount,p.after,p.typeAfter])});
 return {valid:planned.length>0&&Object.keys(issues).length===0,issues:issues,planned:planned,signature:signature};
}
function cutV2Review_(s,ctx){
 ctx=ctx||cutV2Context_();const rows=s.getRange(CUT_V2.QUEUE).getValues(),result=cutV2Plan_(ctx,rows,s.getRange('B7').getDisplayValue());
 const updated=rows.map(r=>r.slice());
 result.planned.forEach(p=>{const r=updated[p.index];r[2]=p.item.name;r[3]=p.item.sku;r[4]=p.item.location;r[5]=p.item.type;r[6]=p.item.qty;r[7]=p.item.unit;r[10]=p.amount;r[11]=p.after;r[12]=p.typeAfter+(p.after===0?' / EMPTY':'');});
 updated.forEach((r,n)=>{if(r[1])r[13]=result.issues[n]?'BLOCK: '+result.issues[n]:'READY';});
 s.getRange(CUT_V2.QUEUE).setValues(updated);s.getRange('H2:U2').setValue(rows.filter(r=>r[1]).length+' items / '+Object.keys(result.issues).length+' errors');
 return result;
}
function cutV2ResetInput_(s){['B5','B9:B15','B19:B21'].forEach(a=>s.getRange(a).clearContent());s.getRange('B18').setValue(1);s.getRange('B17').setValue('PARTIAL');}
function cutV2Lookup_(s,reset){
 const barcode=s.getRange('B5').getDisplayValue().trim();if(!barcode){cutV2ResetInput_(s);return;}
 const item=cutV2Find_(cutV2Context_(),barcode);
 s.getRange('B9:B15').setValues([[item.name],[item.sku],[item.type||'NOT SET'],[item.qty],[item.unit],[item.location],[item.mode]]);
 if(reset){s.getRange('B17').setValue(item.mode==='UNIT'?'ALL':'PARTIAL');s.getRange('B18').setValue(1);}
 if(item.location!==s.getRange('B7').getDisplayValue())throw new Error('Wrong branch: item is at '+item.location);
 const result=cutV2Transition_(item,s.getRange('B17').getDisplayValue(),s.getRange('B18').getValue());
 if(s.getRange('B17').getValue()==='ALL')s.getRange('B18').setValue(result.amount);
 s.getRange('B19:B21').setValues([[result.after],[result.typeAfter+(result.after===0?' / EMPTY':'')],['READY TO QUEUE - final check on CUT STOCK']]);
 return item;
}
function cutV2OnEdit_(e){
 const s=e.range.getSheet(),lock=LockService.getDocumentLock();if(!lock.tryLock(5000))return;
 try{
  const a=e.range.getA1Notation();
  if(a==='B5'){s.getRange('B9:B15').clearContent();s.getRange('B19:B21').clearContent();cutV2Lookup_(s,true);if(s.getRange('D6').getValue()===true&&s.getRange('B5').getValue())cutV2AddCore_(s);}
  else if(['B7','B16','B17','B18'].includes(a)){if(a==='B17'&&s.getRange('B17').getValue()==='PARTIAL')s.getRange('B18').setValue(1);if(s.getRange('B5').getValue())cutV2Lookup_(s,false);cutV2Review_(s);}
  else if(a==='D6')cutV2Status_(s,s.getRange('D6').getValue()?'AUTO ADD ON: each scan queues Qty 1; review before cutting.':'MANUAL MODE: scan, review details, then ADD TO QUEUE.');
  else if(e.range.getRow()<=103&&e.range.getLastRow()>=4&&e.range.getColumn()<=23&&e.range.getLastColumn()>=9)cutV2Review_(s);
 }catch(error){s.getRange('B21').setValue('BLOCK: '+error.message);cutV2Status_(s,'BLOCK: '+error.message);}finally{lock.releaseLock();}
}
function cutV2AddCore_(s){
 const ctx=cutV2Context_(),item=cutV2Find_(ctx,s.getRange('B5').getDisplayValue()),rows=s.getRange(CUT_V2.QUEUE).getValues();
 if(rows.some(r=>r[15]===item.id)){const n=rows.findIndex(r=>r[15]===item.id);s.setActiveRange(s.getRange(n+4,18));throw new Error('Barcode is already queued at row '+(n+4)+'. Edit Qty there.');}
 if(item.location!==s.getRange('B7').getDisplayValue())throw new Error('Wrong branch: '+item.location);
 const mode=s.getRange('B17').getDisplayValue(),reason=s.getRange('B16').getDisplayValue(),t=cutV2Transition_(item,mode,s.getRange('B18').getValue());
 if(!['SALE','USE'].includes(reason))throw new Error('Choose SALE or USE.');
 const n=rows.findIndex(r=>!r[1]);if(n<0)throw new Error('Queue is full (100 items).');
 rows[n]=[false,item.barcode,item.name,item.sku,item.location,item.type,item.qty,item.unit,reason,mode,t.amount,t.after,t.typeAfter,'READY',cutV2Snapshot_(item),item.id];
 s.getRange(CUT_V2.QUEUE).setValues(rows);const review=cutV2Review_(s,ctx);cutV2ResetInput_(s);
 cutV2Status_(s,'QUEUED: '+item.barcode+(review.valid?' - ready for review.':' - check blocked rows.'));s.setActiveRange(s.getRange('B5'));
}
function cutV2Add(){const s=cutV2Sheet_(),lock=LockService.getDocumentLock();if(!lock.tryLock(10000))return;try{cutV2AddCore_(s);}catch(error){cutV2Status_(s,'BLOCK: '+error.message);}finally{lock.releaseLock();}}
function cutV2Delete(){const s=cutV2Sheet_(),lock=LockService.getDocumentLock();lock.waitLock(10000);try{const rows=s.getRange(CUT_V2.QUEUE).getValues(),selected=rows.filter(r=>r[0]===true&&r[1]);if(!selected.length){cutV2Status_(s,'Select queue rows first.');return;}const kept=rows.filter(r=>r[1]&&r[0]!==true).map(r=>[false].concat(r.slice(1)));s.getRange(CUT_V2.QUEUE).clearContent();if(kept.length)s.getRange(4,8,kept.length,16).setValues(kept);cutV2Review_(s);cutV2Status_(s,'Removed '+selected.length+' queued items.');}finally{lock.releaseLock();}}
function cutV2Cancel(){const s=cutV2Sheet_(),ui=SpreadsheetApp.getUi();if(ui.alert('Cancel / Clear','Clear the pending queue and scanner? No stock will be deducted.',ui.ButtonSet.YES_NO)!==ui.Button.YES)return;const lock=LockService.getDocumentLock();lock.waitLock(10000);try{s.getRange(CUT_V2.QUEUE).clearContent();cutV2ResetInput_(s);s.getRange('D6').setValue(false);s.getRange('H2:U2').setValue('0 items');cutV2Status_(s,'Ready to scan.');}finally{lock.releaseLock();}}
function cutV2Confirm(){
 const s=cutV2Sheet_();let scriptLock,docLock;
 try{
  const preview=cutV2Review_(s);if(!preview.valid){cutV2Status_(s,'BLOCK: '+(Object.keys(preview.issues).length?'Fix highlighted queue rows.':'Queue is empty.'));return;}
  const ui=SpreadsheetApp.getUi(),text=preview.planned.map(p=>p.item.name+' ['+p.item.barcode+']\n'+p.reason+' / '+p.mode+': '+p.item.qty+' - '+p.amount+' = '+p.after+' '+p.item.unit+'; '+p.item.type+' > '+p.typeAfter).join('\n\n');
  if(ui.alert('Confirm Cut Stock',text+'\n\nConfirm '+preview.planned.length+' items?',ui.ButtonSet.YES_NO)!==ui.Button.YES)return;
  scriptLock=LockService.getScriptLock();scriptLock.waitLock(30000);docLock=LockService.getDocumentLock();docLock.waitLock(30000);
  if(s.getRange('B32').getValue())throw new Error('A prior stock write needs reconciliation. Do not retry; contact the administrator.');
  const ctx=cutV2Context_(),fresh=cutV2Review_(s,ctx);if(!fresh.valid||fresh.signature!==preview.signature)throw new Error('Stock or queue changed during review. Check the queue and confirm again.');
  const expected=['Qty Before','Qty After','Stock Type','Stock Group','Source','Details'];const heads=ctx.log.getRange('M1:R1').getDisplayValues()[0];expected.forEach((h,i)=>{if(heads[i]!==h)throw new Error('Log Data header changed: '+h);});
  const now=new Date(),staff=medStockActor_(),batch='CUT-'+Utilities.formatDate(now,ctx.ss.getSpreadsheetTimeZone(),'yyyyMMdd-HHmmss')+'-'+Utilities.getUuid().slice(0,8);
  const logRows=fresh.planned.map((p,i)=>[now,batch+'-'+String(i+1).padStart(3,'0'),p.item.id,p.item.sku,p.item.name,p.item.data[5],p.item.data[6],p.reason==='SALE'?'SALE':'STOCK OUT',-p.amount,p.item.location,staff,batch,p.item.qty,p.after,p.typeAfter,p.item.sku.split('-')[0],'Cut Stock',p.mode+'; '+p.item.type+' -> '+p.typeAfter+'; status '+p.statusAfter]);
  const start=ctx.log.getLastRow()+1;ensureSheetCapacity_(ctx.log,start+logRows.length-1);
  const changed=[],originalLog=ctx.log.getRange(start,1,logRows.length,18).getValues();let logAttempted=false;
  s.getRange('B32').setValue(batch);SpreadsheetApp.flush();
  try{
   const ordered=fresh.planned.slice().sort((a,b)=>(a.after===0?0:1)-(b.after===0?0:1));
   ordered.forEach(p=>{changed.push(p);const extra=p.item.data.slice(13,20);extra[0]=p.typeAfter;if(extra[1]===''||extra[1]==null)extra[1]=p.item.qty;if(p.mode==='PARTIAL'&&!extra[2])extra[2]=now;extra[3]=now;if(p.after===0)extra[4]=now;extra[6]=staff;ctx.inventory.getRange(p.item.row,9,1,2).setValues([[p.statusAfter,p.after]]);ctx.inventory.getRange(p.item.row,14,1,7).setValues([extra]);});
   logAttempted=true;ctx.log.getRange(start,1,logRows.length,18).setValues(logRows);SpreadsheetApp.flush();
  }catch(writeError){
   const failures=[];changed.forEach(p=>{try{ctx.inventory.getRange(p.item.row,9,1,2).setValues([p.item.data.slice(8,10)]);ctx.inventory.getRange(p.item.row,14,1,7).setValues([p.item.data.slice(13,20)]);}catch(e){failures.push(p.item.id);}});
   if(logAttempted){try{ctx.log.getRange(start,1,logRows.length,18).setValues(originalLog);}catch(e){failures.push('Log Data');}}
   if(!failures.length){s.getRange('B32').clearContent();SpreadsheetApp.flush();throw new Error('No stock deducted; write rolled back: '+writeError.message);}
   throw new Error('RECONCILIATION REQUIRED for '+batch+': '+failures.join(', '));
  }
  // Only clear the queue after both inventory and log have been committed.
  s.getRange(CUT_V2.QUEUE).clearContent();cutV2ResetInput_(s);s.getRange('D6').setValue(false);s.getRange('H2:U2').setValue('0 items');cutV2Status_(s,'COMPLETED: '+fresh.planned.length+' items. '+batch);s.getRange('B32').clearContent();SpreadsheetApp.flush();
 }catch(error){cutV2Status_(s,'BLOCK: '+error.message);}finally{if(docLock)docLock.releaseLock();if(scriptLock)scriptLock.releaseLock();}
}
function setupCutStockV2(){
 const ss=SpreadsheetApp.getActiveSpreadsheet();if(ss.getId()!=='1xrB9CnUe3umZ-pPq91idY1jQJWAoR9wrhM2_7gieG2Q')throw new Error('MedStock only.');
 const s=ss.getSheetByName('Cut Stock');if(!s)throw new Error('Cut Stock missing.');if(s.getRange('B31').getValue()===CUT_V2.MARKER)throw new Error('Cut Stock V2 already installed.');
 const branch=s.getRange('B7').getValue();if(!ss.getSheetByName('_Cut_Stock_Legacy'))s.copyTo(ss).setName('_Cut_Stock_Legacy').hideSheet();
 if(s.getMaxColumns()<23)s.insertColumnsAfter(s.getMaxColumns(),23-s.getMaxColumns());ensureSheetCapacity_(s,103);
 s.getRange(1,1,s.getMaxRows(),s.getMaxColumns()).breakApart().clearDataValidations();s.clear();s.getImages().forEach(i=>i.remove());s.getDrawings().forEach(d=>d.remove());s.setHiddenGridlines(true);s.setFrozenRows(1);s.setFrozenColumns(0);s.showRows(1,33);s.setRowHeights(1,103,28);
 s.setColumnWidth(1,225);s.setColumnWidth(2,270);s.setColumnWidth(3,25);s.setColumnWidths(4,3,90);s.setColumnWidth(7,25);
 [60,215,220,90,95,85,90,65,85,100,90,90,115,310].forEach((w,i)=>s.setColumnWidth(i+8,w));
 s.getRange('A1:F1').merge().setValue('Aesthetic Cut Stock Scanner').setBackground('#0B7285').setFontColor('white').setFontSize(16).setFontWeight('bold');s.setRowHeight(1,36);
 s.getRange('H1:U1').merge().setValue('PENDING CUT STOCK QUEUE').setBackground('#0B7285').setFontColor('white').setFontSize(14).setFontWeight('bold');s.getRange('H2:U2').merge().setValue('0 items').setBackground('#D9EAF7');
 s.getRange('A3:B3').setValues([['STEP 1','Scan / enter barcode below']]).setBackground('#D9EAF7').setFontWeight('bold');
 [[5,'Barcode / Unique ID'],[7,'Current Branch'],[9,'Scanned Product'],[10,'SKU'],[11,'Current Stock Type'],[12,'Current Qty'],[13,'Unit'],[14,'Item Location'],[15,'Track Mode'],[16,'Reason: SALE / USE'],[17,'Cut: ALL / PARTIAL'],[18,'Qty to Cut'],[19,'Qty After Cut'],[20,'Stock Type After Cut'],[21,'Validation'],[23,'Batch Status']].forEach(r=>s.getRange(r[0],1).setValue(r[1]).setBackground('#D9EAF7').setFontWeight('bold').setFontColor('#24445A'));
 s.getRange('B5').setBackground('#FFE082').setNumberFormat('@');s.getRange('B9').setWrap(true);s.getRange('B21').setWrap(true).setFontSize(10);s.setRowHeight(21,56);s.getRange('B23:B25').merge().setWrap(true).setBackground('#EEF2F6').setVerticalAlignment('top');
 const list=values=>SpreadsheetApp.newDataValidation().requireValueInList(values,true).setAllowInvalid(false).build();
 s.getRange('B7').setDataValidation(list(['Thonglor','Silom'])).setValue(['Thonglor','Silom'].includes(branch)?branch:'Thonglor');s.getRange('B16').setDataValidation(list(['SALE','USE'])).setValue('SALE');s.getRange('B17').setDataValidation(list(['ALL','PARTIAL'])).setValue('PARTIAL');s.getRange('B18').setValue(1).setNumberFormat('0.######').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThan(0).setAllowInvalid(false).build());s.getRange('B16:B18').setBackground('#FFF2CC');s.getRange('B19:B20').setBackground('#E8F5E9');
 s.getRange('D6').insertCheckboxes().setValue(false);s.getRange('E6:F6').merge().setValue('AUTO ADD').setBackground('#D9EAF7').setFontWeight('bold');
 genBcButton_(s,'D3:F4','ADD TO QUEUE','#3D85C6','cutV2Add');genBcButton_(s,'D7:F8','DELETE SELECTED','#FFD966','cutV2Delete');genBcButton_(s,'D10:F14','CUT STOCK','#93C47D','cutV2Confirm');genBcButton_(s,'D16:F20','CANCEL / CLEAR','#E69191','cutV2Cancel');
 s.getRange('H3:W3').setValues([['Select','Barcode','Product Name','SKU','Branch','Type Before','Qty Before','Unit','Reason','Cut Mode','Qty to Cut','Qty After','Type After','Validation','Snapshot','Inventory ID']]).setBackground('#0B7285').setFontColor('white').setFontWeight('bold').setWrap(true);
 s.getRange('H4:H103').insertCheckboxes();s.getRange('P4:P103').setDataValidation(list(['SALE','USE']));s.getRange('Q4:Q103').setDataValidation(list(['ALL','PARTIAL']));s.getRange('R4:R103').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThan(0).setAllowInvalid(false).build());s.getRange('P4:R103').setBackground('#FFF2CC');s.getRange('N4:N103').setNumberFormat('0.######');s.getRange('R4:S103').setNumberFormat('0.######');s.getRange('U4:U103').setWrap(true).setFontSize(10);s.getRange('I4:I103').setNumberFormat('@');s.hideColumns(22,2);
 s.getRange('A27:F27').merge().setValue('SAFE WORKFLOW').setBackground('#FFF2CC').setFontWeight('bold');s.getRange('A28:F30').merge().setValue('Scan, choose SALE / USE and ALL / PARTIAL, then queue. Only CUT STOCK changes Inventory.\nPARTIAL uses the entered Qty and becomes OPEN. Finish existing OPEN before opening another of the same SKU / branch.\nALL cuts the complete remaining Qty. Edit yellow queue cells. Remove and rescan a row if stock changes.').setBackground('#FFF2CC').setWrap(true).setVerticalAlignment('top').setFontSize(10);
 s.getRange('B31').setValue(CUT_V2.MARKER);s.getRange('B32').clearContent();s.hideRows(31,2);cutV2Status_(s,'Ready to scan. Choose branch first.');
 s.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($I4<>"",LEFT($U4,5)="BLOCK")').setBackground('#F4CCCC').setRanges([s.getRange('H4:U103')]).build()]);
 const settings=ss.getSheetByName('Settings');if(settings){const data=settings.getRange(2,1,Math.max(1,settings.getLastRow()-1),3).getValues();data.forEach((r,i)=>{if(r[0]==='TYPE_ASSIGNMENT')settings.getRange(i+2,2,1,2).setValues([['CUT STOCK / CHECK STOCK','Cut Stock PARTIAL opens the item; Check Stock verifies its actual type.']]);});}
 ss.setActiveSheet(s);s.setActiveRange(s.getRange('B5'));SpreadsheetApp.flush();
 console.log('Cut Stock V2 installed. Inventory and Log Data records unchanged.');
}


function prepareMedStockMockInventory(){
 const ss=SpreadsheetApp.getActiveSpreadsheet();if(ss.getId()!=='1xrB9CnUe3umZ-pPq91idY1jQJWAoR9wrhM2_7gieG2Q')throw new Error('MedStock only.');
 const lock=LockService.getDocumentLock();lock.waitLock(30000);
 try{
  const props=PropertiesService.getDocumentProperties();if(props.getProperty('MEDSTOCK_MOCK_V2'))throw new Error('Mock preparation already started/completed; inspect before retrying.');
  const ctx=cutV2Context_(),s=ctx.inventory,products=genBcProducts_(),registry=ss.getSheetByName('BC_Registry');if(!registry)throw new Error('BC_Registry missing.');
  const backup='_Inventory_Before_Mock_V2';if(!ss.getSheetByName(backup))s.copyTo(ss).setName(backup).hideSheet();
  const logBackup='_Log_Before_Mock_V2';if(!ss.getSheetByName(logBackup))ctx.log.copyTo(ss).setName(logBackup).hideSheet();
  const valid=[],removed=[],seen={},opens={};
  ctx.items.forEach(i=>{let ok=true;try{parseImportBarcode_(i.barcode);}catch(e){ok=false;}
   const group=i.sku+'|'+i.location;
   ok=ok&&i.id===i.barcode&&!!products[i.sku]&&['FULL','OPEN'].includes(i.type)&&['Thonglor','Silom'].includes(i.location)&&Number.isFinite(i.qty)&&i.qty>=0&&['UNIT','BULK'].includes(i.mode)&&!seen[i.id];
   if(i.mode==='UNIT'&&![0,1].includes(i.qty))ok=false;
   if(i.qty>0&&i.status!=='IN STOCK')ok=false;
   if(i.qty===0&&!['OUT OF STOCK','SOLD'].includes(i.status))ok=false;
   if(i.type==='OPEN'&&i.qty>0&&opens[group])ok=false;
   if(ok){valid.push(i.data);seen[i.id]=true;if(i.type==='OPEN'&&i.qty>0)opens[group]=true;}else removed.push(i.id);
  });
  // Quantity is content remaining per item, e.g. one BULK bottle holding 10 CC.
  const specs=[['AES-001','Thonglor','FULL',10,10,'IN STOCK'],['AES-001','Thonglor','OPEN',7,10,'IN STOCK'],['AES-001','Thonglor','FULL',10,10,'IN STOCK'],['AES-001','Silom','OPEN',4,10,'IN STOCK'],['AES-001','Silom','FULL',10,10,'IN STOCK'],['AES-001','Thonglor','OPEN',0,10,'OUT OF STOCK'],['AES-002','Thonglor','FULL',5,5,'IN STOCK'],['AES-002','Thonglor','FULL',5,5,'IN STOCK'],['AES-024','Thonglor','FULL',1,1,'IN STOCK'],['AES-024','Thonglor','FULL',1,1,'IN STOCK'],['AES-024','Silom','FULL',1,1,'IN STOCK'],['AES-024','Thonglor','FULL',0,1,'SOLD']];
  const high=genBcHighwater_(ss,registry),now=new Date(),date=genBcToday_(ss),code=Utilities.formatDate(date,ss.getSpreadsheetTimeZone(),'ddMMyy'),batch='MOCK-V2-'+Utilities.formatDate(now,'Asia/Bangkok','yyyyMMdd-HHmmss'),staff=medStockActor_();
  const rows=[],ledger=[],logs=[],reserve={};
  specs.forEach((x,n)=>{const p=products[x[0]];if(!p)throw new Error('Missing mock product '+x[0]);const group=x[0]+'|'+x[1];if(x[2]==='OPEN'&&x[3]>0&&opens[group])return;
   const key='GEN_BC_SEQ_'+ss.getId()+'_'+p.sku;const last=Math.max(high[p.sku]||0,Number(props.getProperty(key))||0);const seq=last+1;high[p.sku]=seq;reserve[key]=String(seq);const run=genBcRunCode_(seq),barcode=p.sku+'-'+code+'-'+run;
   if(x[2]==='OPEN'&&x[3]>0)opens[group]=true;
   const fullProduct=ctx.items.find(i=>i.sku===p.sku);const category=fullProduct?fullProduct.data[3]:'';
   rows.push([barcode,p.sku,p.name,category,p.unit,'MOCK-V2','',x[1],x[5],x[3],barcode,date,'MOCK DATA - for system testing only',x[2],x[4],x[2]==='OPEN'?now:'',now,x[3]===0?now:'',batch,staff]);
   ledger.push([now,batch,barcode,p.sku,p.name,date,run,p.unit,p.mode,'MOCK',batch,'MOCK DATA - do not attach to real products']);
   logs.push([now,batch+'-'+String(n+1).padStart(3,'0'),barcode,p.sku,p.name,'MOCK-V2','','ADJUSTMENT',x[3],x[1],staff,batch,0,x[3],x[2],p.sku.split('-')[0],'Mock Setup','MOCK: seeded '+x[5]+'; initial capacity '+x[4]]);
  });
  props.setProperty('MEDSTOCK_MOCK_V2','STARTED '+batch);props.setProperties(reserve);
  const all=valid.concat(rows);if(s.getMaxColumns()<22)s.insertColumnsAfter(s.getMaxColumns(),22-s.getMaxColumns());ensureSheetCapacity_(s,Math.max(all.length+1,1000));
  if(s.getFilter())s.getFilter().remove();s.getRange(2,1,Math.max(s.getLastRow()-1,1),22).clearContent();
  if(all.length)s.getRange(2,1,all.length,20).setValues(all);
  s.getRange('U1:V1').setValues([['Track Mode','Data Set']]);
  s.getRange('U2').setFormula('=ARRAYFORMULA(IF(B2:B="","",IFERROR(VLOOKUP(B2:B,\'Product List\'!A:F,6,FALSE),"UNKNOWN")))');s.getRange('V2').setFormula('=ARRAYFORMULA(IF(A2:A="","",IF(LEFT(S2:S,7)="MOCK-V2","MOCK","LIVE")))');
  const appendRegistry=registry.getLastRow()+1;ensureSheetCapacity_(registry,appendRegistry+ledger.length-1);registry.getRange(appendRegistry,1,ledger.length,12).setValues(ledger);
  const appendLog=ctx.log.getLastRow()+1;ensureSheetCapacity_(ctx.log,appendLog+logs.length-1);ctx.log.getRange(appendLog,1,logs.length,18).setValues(logs);
  s.setFrozenRows(1);s.setFrozenColumns(3);s.setHiddenGridlines(true);s.getRange('A1:V1').setBackground('#0B7285').setFontColor('white').setFontWeight('bold').setWrap(true);s.setRowHeight(1,40);
  const widths=[220,95,270,110,70,110,105,105,125,90,220,130,300,100,100,165,165,165,230,220,100,100];widths.forEach((w,i)=>s.setColumnWidth(i+1,w));s.getRange(2,1,all.length,22).setVerticalAlignment('middle');s.setRowHeights(2,all.length,34);s.getRange(2,3,all.length,1).setWrap(true);
  s.getRange('A2:B1000').setNumberFormat('@');s.getRange('K2:K1000').setNumberFormat('@');s.getRange('J2:J1000').setNumberFormat('0.######');s.getRange('O2:O1000').setNumberFormat('0.######');s.getRange('G2:G1000').setNumberFormat('dd/MM/yyyy');s.getRange('L2:L1000').setNumberFormat('dd/MM/yyyy');s.getRange('P2:R1000').setNumberFormat('dd/MM/yyyy HH:mm');
  s.getRange('N2:N1000').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['FULL','OPEN'],true).setAllowInvalid(false).build());s.getRange('H2:H1000').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Thonglor','Silom'],true).setAllowInvalid(false).build());s.getRange('J2:J1000').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false).build());
  s.getRange('J1').setNote('Content remaining in this physical item, in Unit. One barcode = one physical item. UNIT: Qty 0 or 1. BULK: e.g. 10 CC in one bottle.');s.getRange('V1').setNote('MOCK identifies test records. Do not mix mock labels with real goods.');
  s.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($A2<>"",$J2=0)').setBackground('#F4CCCC').setFontColor('#990000').setRanges([s.getRange('A2:V1000')]).build(),SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($N2="OPEN",$J2>0)').setBackground('#FCE5CD').setRanges([s.getRange('N2:N1000')]).build(),SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('MOCK').setBackground('#D9EAF7').setRanges([s.getRange('V2:V1000')]).build()]);
  s.getRange(1,1,all.length+1,22).createFilter();SpreadsheetApp.flush();props.setProperty('MEDSTOCK_MOCK_V2','COMPLETE '+batch);
  console.log(JSON.stringify({removed:removed.length,preserved:valid.length,mock:rows.length,items:rows.map(r=>({barcode:r[0],sku:r[1],branch:r[7],qty:r[9],type:r[13]}))}));
 }finally{lock.releaseLock();}
}
function verifyCutStockV2(){
 let count=0;const check=(ok,msg)=>{if(!ok)throw new Error(msg);count++;};const reject=(fn,msg)=>{let failed=false;try{fn();}catch(e){failed=true;}check(failed,msg);};
 const make=(id,type,qty,branch,mode)=>({id:id,barcode:id,sku:'AES-001',name:'Mock',unit:'CC',location:branch||'Thonglor',status:qty>0?'IN STOCK':'OUT OF STOCK',qty:qty,type:type,mode:mode||'BULK'});
 const q=(i,amount,mode,reason)=>[false,i.id,i.name,i.sku,i.location,i.type,i.qty,i.unit,reason||'SALE',mode||'PARTIAL',amount,'','','',cutV2Snapshot_(i),i.id];
 const f=make('FULL','FULL',10),o=make('OPEN','OPEN',7),u=make('UNIT','FULL',1,'Thonglor','UNIT');u.sku='AES-024';
 let r=cutV2Transition_(f,'PARTIAL',3);check(r.after===7&&r.typeAfter==='OPEN','FULL partial -> OPEN');
 r=cutV2Transition_(o,'PARTIAL',2);check(r.after===5&&r.typeAfter==='OPEN','Reuse OPEN');r=cutV2Transition_(o,'PARTIAL',7);check(r.after===0,'Finish OPEN');
 check(cutV2Transition_(f,'ALL',1).amount===10,'ALL uses full content');check(cutV2Transition_(u,'ALL',1).after===0,'UNIT whole');
 [0,-1,11,NaN].forEach(n=>reject(()=>cutV2Transition_(f,'PARTIAL',n),'Invalid quantity'));
 reject(()=>cutV2Transition_(u,'PARTIAL',0.5),'UNIT partial');reject(()=>cutV2Transition_(make('BLANK','',10),'PARTIAL',1),'Missing type');
 const run=(items,rows,branch)=>cutV2Plan_({items:items},rows,branch||'Thonglor');
 check(!run([f,o],[q(f,3)]).valid,'Cannot open second item');check(!run([f,o],[q(f,10)]).valid,'Cannot bypass existing OPEN by consuming new FULL completely');
 check(run([f,o],[q(f,10,'ALL')]).valid,'Sell unopened full with another OPEN');check(run([f,o],[q(o,7),q(f,3)]).valid,'Finish existing OPEN then open next in same batch');
 check(!run([f,o],[q(o,2),q(f,3)]).valid,'Still cannot leave two OPEN');check(!run([f],[q(f,1),q(f,1)]).valid,'Duplicate scan');
 check(!run([f],[q(f,1)],'Silom').valid,'Wrong branch');check(run([f,make('SILOM','OPEN',4,'Silom')],[q(f,1)]).valid,'OPEN scope is branch-specific');
 const changed=q(f,1);changed[14]='old';check(!run([f],[changed]).valid,'Stale snapshot');check(!run([f],[q(f,1,'PARTIAL','OTHER')]).valid,'Invalid reason');
 check(!run([f,make('UNKNOWN','',3)],[q(f,1)]).valid,'Unknown existing type');
 check(!run([make('ZERO','OPEN',0)],[q(make('ZERO','OPEN',0),1)]).valid,'Zero stock');
 check(!run([f],[]).valid,'Empty queue');
 const dec=make('DEC','OPEN',0.3);check(cutV2Transition_(dec,'PARTIAL',0.1).after===0.2,'Decimal rounding');
 console.log('PASS: '+count+' Cut Stock business-rule checks. No live inventory changed.');
}

function medStockActor_(){
  try { return Session.getActiveUser().getEmail() || "Spreadsheet User"; }
  catch (e) { return "Spreadsheet User"; }
}

// Check Stock V1: physical counts, reviewed queue, audited adjustments.
const CHECK_V1={MARKER:'MEDSTOCK_CHECK_V1',QUEUE:'H4:W103'};
function checkV1Sheet_(){const s=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Check Stock');if(!s||s.getRange('B31').getValue()!==CHECK_V1.MARKER)throw new Error('Check Stock is not installed.');return s;}
function checkV1Status_(s,m){s.getRange('B23:B25').setValue(m).setWrap(true);}
function checkV1Transition_(item,rawQty,type,note){
 if(!['IN STOCK','OUT OF STOCK','SOLD'].includes(item.status))throw new Error('Status cannot be counted here: '+item.status);
 if(!['UNIT','BULK'].includes(item.mode))throw new Error('Unknown Track Mode.');
 if(rawQty===''||rawQty===null||typeof rawQty==='boolean')throw new Error('Enter actual Qty.');
 const qty=Number(rawQty);if(!Number.isFinite(qty)||qty<0||Math.abs(qty*1000000-Math.round(qty*1000000))>0.000001)throw new Error('Qty must be nonnegative, with up to 6 decimal places.');
 if(item.mode==='UNIT'&&qty!==0&&qty!==1)throw new Error('UNIT Qty must be 0 or 1.');
 if(!['FULL','OPEN'].includes(type))throw new Error('Choose FULL or OPEN.');
 const status=qty>0?'IN STOCK':item.status==='SOLD'?'SOLD':'OUT OF STOCK';
 if((qty!==item.qty||type!==item.type||status!==item.status)&&!String(note||'').trim())throw new Error('A reason is required for changed Qty, type or status.');
 return {after:qty,typeAfter:type,statusAfter:status,delta:Math.round((qty-item.qty)*1000000)/1000000};
}
function checkV1Plan_(ctx,rows,branch){
 const issues={},planned=[],seen={};const fail=(n,m)=>{issues[n]=(issues[n]?issues[n]+' / ':'')+m;};
 rows.forEach((r,n)=>{if(!r[1])return;try{
  if(!['Thonglor','Silom'].includes(branch))throw new Error('Choose branch.');
  const item=cutV2Find_(ctx,r[1]);if(seen[item.id]!==undefined){fail(seen[item.id],'Duplicate barcode');throw new Error('Duplicate barcode');}seen[item.id]=n;
  if(item.location!==branch)throw new Error('Wrong branch: '+item.location);
  if(r[15]!==item.id||r[14]!==cutV2Snapshot_(item))throw new Error('Stock changed. Remove this row and scan again.');
  const note=String(r[8]||'').trim(),type=String(r[9]||'').trim().toUpperCase(),t=checkV1Transition_(item,r[10],type,note);
  planned.push(Object.assign({index:n,item:item,note:note},t));
 }catch(e){fail(n,e.message);}});
 const changes={},opens={};planned.forEach(p=>{changes[p.item.id]=p;});
 ctx.items.forEach(i=>{const p=changes[i.id],qty=p?p.after:i.qty,type=p?p.typeAfter:i.type;if(qty>0&&type==='OPEN'){const key=i.sku+'|'+i.location;(opens[key]||(opens[key]=[])).push(i.id);}});
 planned.forEach(p=>{const ids=opens[p.item.sku+'|'+p.item.location]||[];if(ids.length>1)fail(p.index,'Only one OPEN per SKU / branch: '+ids.join(', '));});
 return {valid:planned.length>0&&!Object.keys(issues).length,issues:issues,planned:planned,signature:JSON.stringify([branch,planned.map(p=>[cutV2Snapshot_(p.item),p.after,p.typeAfter,p.statusAfter,p.note])])};
}
function checkV1Review_(s,ctx){ctx=ctx||cutV2Context_();const rows=s.getRange(CHECK_V1.QUEUE).getValues(),p=checkV1Plan_(ctx,rows,s.getRange('B7').getDisplayValue());p.planned.forEach(x=>{const r=rows[x.index];r[2]=x.item.name;r[3]=x.item.sku;r[4]=x.item.location;r[5]=x.item.type;r[6]=x.item.qty;r[7]=x.item.unit;r[11]=x.delta;r[12]=x.typeAfter;});rows.forEach((r,n)=>{if(r[1])r[13]=p.issues[n]?'BLOCK: '+p.issues[n]:'READY';});s.getRange(CHECK_V1.QUEUE).setValues(rows);s.getRange('H2:U2').setValue(rows.filter(r=>r[1]).length+' items / '+Object.keys(p.issues).length+' errors');return p;}
function checkV1Reset_(s){['B5','B9:B21'].forEach(a=>s.getRange(a).clearContent());}
function checkV1Lookup_(s,reset){const ctx=cutV2Context_(),i=cutV2Find_(ctx,s.getRange('B5').getDisplayValue());s.getRange('B9:B15').setValues([[i.name],[i.sku],[i.type],[i.qty],[i.unit],[i.location],[i.mode]]);if(reset){s.getRange('B16').clearContent();s.getRange('B17').setValue(i.type);s.getRange('B18').setValue(i.qty);}if(i.location!==s.getRange('B7').getDisplayValue())throw new Error('Wrong branch: '+i.location);const t=checkV1Transition_(i,s.getRange('B18').getValue(),s.getRange('B17').getDisplayValue(),s.getRange('B16').getDisplayValue());s.getRange('B19:B21').setValues([[t.delta],[t.statusAfter],['READY TO QUEUE - final check on CONFIRM CHECK']]);return i;}
function checkV1AddCore_(s){const ctx=cutV2Context_(),i=cutV2Find_(ctx,s.getRange('B5').getDisplayValue()),rows=s.getRange(CHECK_V1.QUEUE).getValues(),duplicate=rows.findIndex(r=>r[15]===i.id);if(duplicate>=0){s.setActiveRange(s.getRange(duplicate+4,18));throw new Error('Already queued at row '+(duplicate+4)+'. Edit actual Qty there.');}if(i.location!==s.getRange('B7').getDisplayValue())throw new Error('Wrong branch: '+i.location);const qty=s.getRange('B18').getValue(),type=s.getRange('B17').getDisplayValue(),note=s.getRange('B16').getDisplayValue(),t=checkV1Transition_(i,qty,type,note),n=rows.findIndex(r=>!r[1]);if(n<0)throw new Error('Queue full (100 items).');rows[n]=[false,i.barcode,i.name,i.sku,i.location,i.type,i.qty,i.unit,note,type,t.after,t.delta,t.typeAfter,'READY',cutV2Snapshot_(i),i.id];s.getRange(CHECK_V1.QUEUE).setValues(rows);const review=checkV1Review_(s,ctx);checkV1Reset_(s);checkV1Status_(s,'QUEUED: '+i.barcode+(review.valid?'':' - fix blocked rows.'));s.setActiveRange(s.getRange('B5'));}
function checkV1Add(){const s=checkV1Sheet_(),lock=LockService.getDocumentLock();if(!lock.tryLock(10000))return;try{checkV1AddCore_(s);}catch(e){checkV1Status_(s,'BLOCK: '+e.message);}finally{lock.releaseLock();}}
function checkV1OnEdit_(e){const s=e.range.getSheet(),lock=LockService.getDocumentLock();if(!lock.tryLock(5000))return;try{const a=e.range.getA1Notation();if(a==='B5'){s.getRange('B9:B21').clearContent();if(!s.getRange('B5').getValue())return;checkV1Lookup_(s,true);if(s.getRange('D6').getValue()===true)checkV1AddCore_(s);}else if(['B7','B16','B17','B18'].includes(a)){s.getRange('B19:B21').clearContent();if(s.getRange('B5').getValue())checkV1Lookup_(s,false);checkV1Review_(s);}else if(a==='D6')checkV1Status_(s,s.getRange('D6').getValue()?'AUTO ADD ON: current values are queued; edit actual count in yellow cells.':'MANUAL: scan, enter actual Qty / type, then add.');else if(e.range.getRow()<=103&&e.range.getLastRow()>=4&&e.range.getColumn()<=23&&e.range.getLastColumn()>=9)checkV1Review_(s);}catch(e){s.getRange('B21').setValue('BLOCK: '+e.message);checkV1Status_(s,'BLOCK: '+e.message);}finally{lock.releaseLock();}}
function checkV1Delete(){const s=checkV1Sheet_(),lock=LockService.getDocumentLock();lock.waitLock(10000);try{const rows=s.getRange(CHECK_V1.QUEUE).getValues(),kept=rows.filter(r=>r[1]&&r[0]!==true).map(r=>[false].concat(r.slice(1)));s.getRange(CHECK_V1.QUEUE).clearContent();if(kept.length)s.getRange(4,8,kept.length,16).setValues(kept);checkV1Review_(s);checkV1Status_(s,'Selected rows removed. Inventory unchanged.');}finally{lock.releaseLock();}}
function checkV1Cancel(){const s=checkV1Sheet_(),ui=SpreadsheetApp.getUi();if(ui.alert('Cancel Check','Clear pending check results? Inventory will not change.',ui.ButtonSet.YES_NO)!==ui.Button.YES)return;const lock=LockService.getDocumentLock();lock.waitLock(10000);try{s.getRange(CHECK_V1.QUEUE).clearContent();checkV1Reset_(s);s.getRange('D6').setValue(false);s.getRange('H2:U2').setValue('0 items');checkV1Status_(s,'Ready to scan.');}finally{lock.releaseLock();}}
function checkV1Confirm(){const s=checkV1Sheet_();let sl,dl;try{
 const preview=checkV1Review_(s);if(!preview.valid){checkV1Status_(s,'BLOCK: empty queue or invalid rows. Fix the Validation column.');return;}
 const ui=SpreadsheetApp.getUi(),text=preview.planned.map(p=>p.item.barcode+': '+p.item.qty+' -> '+p.after+' '+p.item.unit+'; '+p.item.type+' -> '+p.typeAfter+'; '+p.statusAfter+'\nReason: '+(p.note||'Count verified')).join('\n\n');
 if(ui.alert('Confirm Check Stock',text+'\n\nSave '+preview.planned.length+' counts? Unscanned items stay unchanged.',ui.ButtonSet.YES_NO)!==ui.Button.YES)return;
 sl=LockService.getScriptLock();sl.waitLock(30000);dl=LockService.getDocumentLock();dl.waitLock(30000);
 // A pending write in either workflow must be reconciled before further changes.
 ['Check Stock','Cut Stock'].forEach(name=>{const t=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);if(t&&t.getRange('B32').getValue())throw new Error('Pending write in '+name+'. Administrator reconciliation required.');});
 const ctx=cutV2Context_(),fresh=checkV1Review_(s,ctx);if(!fresh.valid||fresh.signature!==preview.signature)throw new Error('Inventory or queue changed during review. Review again.');
 const heads=ctx.log.getRange('M1:R1').getDisplayValues()[0];['Qty Before','Qty After','Stock Type','Stock Group','Source','Details'].forEach((h,i)=>{if(heads[i]!==h)throw new Error('Log header changed: '+h);});
 const now=new Date(),staff=medStockActor_(),batch='CHECK-'+Utilities.formatDate(now,'Asia/Bangkok','yyyyMMdd-HHmmss')+'-'+Utilities.getUuid().slice(0,8);
 const logs=fresh.planned.map((p,n)=>[now,batch+'-'+String(n+1).padStart(3,'0'),p.item.id,p.item.sku,p.item.name,p.item.data[5],p.item.data[6],'ADJUSTMENT',p.delta,p.item.location,staff,p.note||'Count verified',p.item.qty,p.after,p.typeAfter,p.item.sku.split('-')[0],'Check Stock',p.item.type+' -> '+p.typeAfter+'; '+p.item.status+' -> '+p.statusAfter+'; '+batch]);
 const start=ctx.log.getLastRow()+1;ensureSheetCapacity_(ctx.log,start+logs.length-1);const oldLog=ctx.log.getRange(start,1,logs.length,18).getValues(),changed=[];let attempted=false;s.getRange('B32').setValue(batch);SpreadsheetApp.flush();
 try{fresh.planned.slice().sort((a,b)=>(a.typeAfter==='OPEN'&&a.after>0?1:0)-(b.typeAfter==='OPEN'&&b.after>0?1:0)).forEach(p=>{changed.push(p);const ex=p.item.data.slice(13,20);ex[0]=p.typeAfter;ex[2]=p.typeAfter==='OPEN'?(ex[2]||now):'';ex[3]=now;ex[4]=p.after===0?(ex[4]||now):'';ex[6]=staff;ctx.inventory.getRange(p.item.row,9,1,2).setValues([[p.statusAfter,p.after]]);ctx.inventory.getRange(p.item.row,12).setValue(now);ctx.inventory.getRange(p.item.row,14,1,7).setValues([ex]);});attempted=true;ctx.log.getRange(start,1,logs.length,18).setValues(logs);SpreadsheetApp.flush();}
 catch(e){const errors=[];changed.forEach(p=>{try{ctx.inventory.getRange(p.item.row,9,1,2).setValues([p.item.data.slice(8,10)]);ctx.inventory.getRange(p.item.row,12).setValue(p.item.data[11]);ctx.inventory.getRange(p.item.row,14,1,7).setValues([p.item.data.slice(13,20)]);}catch(x){errors.push(p.item.id);}});if(attempted){try{ctx.log.getRange(start,1,logs.length,18).setValues(oldLog);}catch(x){errors.push('Log Data');}}if(errors.length)throw new Error('RECONCILIATION REQUIRED '+batch+': '+errors.join(', '));SpreadsheetApp.flush();s.getRange('B32').clearContent();throw new Error('Changes rolled back: '+e.message);}
 s.getRange(CHECK_V1.QUEUE).clearContent();checkV1Reset_(s);s.getRange('D6').setValue(false);s.getRange('H2:U2').setValue('0 items');checkV1Status_(s,'COMPLETED: '+fresh.planned.length+' counts. '+batch);s.getRange('B32').clearContent();SpreadsheetApp.flush();
 }catch(e){checkV1Status_(s,'BLOCK: '+e.message);}finally{if(dl)dl.releaseLock();if(sl)sl.releaseLock();}}
function setupCheckStockV1(){
 const ss=SpreadsheetApp.getActiveSpreadsheet();if(ss.getId()!=='1xrB9CnUe3umZ-pPq91idY1jQJWAoR9wrhM2_7gieG2Q')throw new Error('MedStock only.');
 if(ss.getSheetByName('Check Stock'))throw new Error('Check Stock already exists; inspect before setup.');
 const s=ss.insertSheet('Check Stock'),branch='Thonglor';
 if(s.getMaxColumns()<23)s.insertColumnsAfter(s.getMaxColumns(),23-s.getMaxColumns());ensureSheetCapacity_(s,103);
 s.getRange(1,1,s.getMaxRows(),s.getMaxColumns()).breakApart().clearDataValidations();s.clear();s.getImages().forEach(i=>i.remove());s.getDrawings().forEach(d=>d.remove());s.setHiddenGridlines(true);s.setFrozenRows(1);s.setFrozenColumns(0);s.showRows(1,33);s.setRowHeights(1,103,28);
 s.setColumnWidth(1,225);s.setColumnWidth(2,270);s.setColumnWidth(3,25);s.setColumnWidths(4,3,90);s.setColumnWidth(7,25);
 [60,215,220,90,95,85,90,65,260,100,90,90,115,310].forEach((w,i)=>s.setColumnWidth(i+8,w));
 s.getRange('A1:F1').merge().setValue('Aesthetic Check Stock Scanner').setBackground('#0B7285').setFontColor('white').setFontSize(16).setFontWeight('bold');s.setRowHeight(1,36);
 s.getRange('H1:U1').merge().setValue('PENDING CHECK STOCK QUEUE').setBackground('#0B7285').setFontColor('white').setFontSize(14).setFontWeight('bold');s.getRange('H2:U2').merge().setValue('0 items').setBackground('#D9EAF7');
 s.getRange('A3:B3').setValues([['STEP 1','Scan / enter barcode below']]).setBackground('#D9EAF7').setFontWeight('bold');
 [[5,'Barcode / Unique ID'],[7,'Current Branch'],[9,'Scanned Product'],[10,'SKU'],[11,'Current Stock Type'],[12,'Current Qty'],[13,'Unit'],[14,'Item Location'],[15,'Track Mode'],[16,'Reason / Note'],[17,'Actual Stock Type'],[18,'Actual Qty Found'],[19,'Qty Difference'],[20,'Status After Check'],[21,'Validation'],[23,'Batch Status']].forEach(r=>s.getRange(r[0],1).setValue(r[1]).setBackground('#D9EAF7').setFontWeight('bold').setFontColor('#24445A'));
 s.getRange('B5').setBackground('#FFE082').setNumberFormat('@');s.getRange('B9').setWrap(true);s.getRange('B21').setWrap(true).setFontSize(10);s.setRowHeight(21,56);s.getRange('B23:B25').merge().setWrap(true).setBackground('#EEF2F6').setVerticalAlignment('top');
 const list=values=>SpreadsheetApp.newDataValidation().requireValueInList(values,true).setAllowInvalid(false).build();
 s.getRange('B7').setDataValidation(list(['Thonglor','Silom'])).setValue(['Thonglor','Silom'].includes(branch)?branch:'Thonglor');s.getRange('B16').setWrap(true);s.getRange('B17').setDataValidation(list(['FULL','OPEN']));s.getRange('B18').setNumberFormat('0.######').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false).build());s.getRange('B16:B18').setBackground('#FFF2CC');s.getRange('B19:B20').setBackground('#E8F5E9');
 s.getRange('D6').insertCheckboxes().setValue(false);s.getRange('E6:F6').merge().setValue('AUTO ADD').setBackground('#D9EAF7').setFontWeight('bold');
 genBcButton_(s,'D3:F4','ADD TO QUEUE','#3D85C6','checkV1Add');genBcButton_(s,'D7:F8','DELETE SELECTED','#FFD966','checkV1Delete');genBcButton_(s,'D10:F14','CONFIRM CHECK','#93C47D','checkV1Confirm');genBcButton_(s,'D16:F20','CANCEL / CLEAR','#E69191','checkV1Cancel');
 s.getRange('H3:W3').setValues([['Select','Barcode','Product Name','SKU','Branch','Type Before','Qty Before','Unit','Reason / Note','Actual Type','Actual Qty','Difference','Type After','Validation','Snapshot','Inventory ID']]).setBackground('#0B7285').setFontColor('white').setFontWeight('bold').setWrap(true);
 s.getRange('H4:H103').insertCheckboxes();s.getRange('P4:P103').setWrap(true);s.getRange('Q4:Q103').setDataValidation(list(['FULL','OPEN']));s.getRange('R4:R103').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false).build());s.getRange('P4:R103').setBackground('#FFF2CC');s.getRange('N4:N103').setNumberFormat('0.######');s.getRange('R4:S103').setNumberFormat('0.######');s.getRange('U4:U103').setWrap(true).setFontSize(10);s.getRange('I4:I103').setNumberFormat('@');s.hideColumns(22,2);
 s.getRange('A27:F27').merge().setValue('SAFE WORKFLOW').setBackground('#FFF2CC').setFontWeight('bold');s.getRange('A28:F30').merge().setValue('Scan each physical item, enter actual Qty / FULL or OPEN, and a reason for any change.\nAUTO ADD queues current values; edit yellow queue cells before confirming. Max one positive OPEN per SKU / branch.\nCONFIRM CHECK reviews and records Inventory + Log. Unscanned items stay unchanged. Qty 0 can be restored with a reason.').setBackground('#FFF2CC').setWrap(true).setVerticalAlignment('top').setFontSize(10);
 s.getRange('B31').setValue(CHECK_V1.MARKER);s.getRange('B32').clearContent();s.hideRows(31,2);checkV1Status_(s,'Ready to scan. Choose branch first.');
 s.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($I4<>"",LEFT($U4,5)="BLOCK")').setBackground('#F4CCCC').setRanges([s.getRange('H4:U103')]).build()]);
 ss.setActiveSheet(s);s.setActiveRange(s.getRange('B5'));SpreadsheetApp.flush();
 console.log('Check Stock V1 installed. Inventory and Log Data records unchanged.');
}



function verifyCheckStockV1(){
 let n=0;const ok=(v,m)=>{if(!v)throw new Error('FAIL: '+m);n++;},bad=(fn,m)=>{let threw=false;try{fn();}catch(e){threw=true;}ok(threw,m);};
 const full={id:'A',barcode:'A',sku:'AES-001',name:'Test',unit:'CC',location:'Thonglor',status:'IN STOCK',qty:5,type:'FULL',mode:'BULK'},empty=Object.assign({},full,{id:'E',barcode:'E',qty:0,status:'OUT OF STOCK',type:'OPEN'}),open=Object.assign({},full,{id:'O',barcode:'O',qty:3,type:'OPEN'});
 const row=(i,q,t,note)=>[false,i.barcode,i.name,i.sku,i.location,i.type,i.qty,i.unit,note,t,q,0,t,'',cutV2Snapshot_(i),i.id];
 ok(checkV1Transition_(full,5,'FULL','').delta===0,'unchanged count');bad(()=>checkV1Transition_(full,4,'FULL',''),'changed qty reason');bad(()=>checkV1Transition_(full,5,'OPEN',''),'changed type reason');
 ok(checkV1Transition_(empty,2,'OPEN','Found during mock count').statusAfter==='IN STOCK','restore zero');bad(()=>checkV1Transition_(empty,2,'OPEN',''),'restore reason');
 ok(checkV1Transition_(full,0,'FULL','Missing during count').statusAfter==='OUT OF STOCK','count zero');
 [-1,NaN,'',null,true,0.0000001].forEach(v=>bad(()=>checkV1Transition_(full,v,'FULL','test'),'invalid qty '+v));
 const unit=Object.assign({},full,{mode:'UNIT',qty:1});bad(()=>checkV1Transition_(unit,2,'FULL','test'),'unit over1');ok(checkV1Transition_(unit,0,'FULL','missing').after===0,'unit zero');bad(()=>checkV1Transition_(full,1,'OTHER','test'),'invalid type');
 const ctx={items:[full,open,empty]};ok(!checkV1Plan_(ctx,[row(full,5,'OPEN','found open')],'Thonglor').valid,'two opens');ok(checkV1Plan_(ctx,[row(open,0,'OPEN','empty'),row(full,5,'OPEN','found open')],'Thonglor').valid,'resolve open same batch');ok(!checkV1Plan_(ctx,[row(full,5,'FULL','')],'Silom').valid,'wrong branch');ok(!checkV1Plan_(ctx,[row(full,5,'FULL',''),row(full,5,'FULL','')],'Thonglor').valid,'duplicate');const stale=row(full,5,'FULL','');stale[14]='old';ok(!checkV1Plan_(ctx,[stale],'Thonglor').valid,'stale');ok(!checkV1Plan_(ctx,[],'Thonglor').valid,'empty queue');ok(checkV1Plan_(ctx,[row(full,5,'FULL','')],'Thonglor').planned.length===1,'only scanned items');const missing=row(full,5,'FULL','');missing[1]='MISSING';ok(!checkV1Plan_(ctx,[missing],'Thonglor').valid,'unknown BC');bad(()=>checkV1Transition_(Object.assign({},full,{status:'TRANSFERRED'}),5,'FULL','test'),'no implicit transfer');ok(checkV1Transition_(Object.assign({},empty,{status:'SOLD'}),1,'FULL','found').statusAfter==='IN STOCK','restore sold');
 console.log('PASS: '+n+' Check Stock checks. No Inventory or Log records changed.');
}
