// Product List: M = Barcode Unit, N = Units Per Barcode. Blank = legacy behavior.
var medStockPackCache_;
function medStockPackageFields_(ss, sku) {
  if (!medStockPackCache_) {
    medStockPackCache_ = {};
    const sheet = ss.getSheetByName("Product List");
    if (sheet && sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues().forEach(function(row) {
        medStockPackCache_[String(row[0]).trim().toUpperCase()] = {
          packageUnit: String(row[12] || "").trim(),
          unitsPerPack: Number(row[13]) || 0,
          unit: String(row[4] || "").trim()
        };
      });
    }
  }
  return medStockPackCache_[String(sku).trim().toUpperCase()] || { packageUnit: "", unitsPerPack: 0 };
}

function medStockIsPacked_(pack) {
  return pack.packageUnit === "Box";
}

function medStockValidatePackImport_(product, quantity) {
  if (!medStockIsPacked_(product)) return;
  if (!Number.isInteger(product.unitsPerPack) || product.unitsPerPack < 1 || quantity !== product.unitsPerPack) {
    throw new Error("One barcode must contain one full box: " + product.sku + " = " + product.unitsPerPack + " " + product.unit);
  }
}

function medStockValidatePackCheck_(ss, row, quantity, type) {
  const pack = medStockPackageFields_(ss, row[1]);
  if (!medStockIsPacked_(pack)) return;
  if (String(row[4]).trim() !== pack.unit) throw new Error("Legacy unit requires correction before use: " + row[0]);
  const capacity = Number(row[14]);
  if (!Number.isInteger(quantity) || quantity < 0 || !Number.isInteger(capacity) || capacity < 1 || quantity > capacity) {
    throw new Error("Invalid box content count: " + row[0]);
  }
  if (quantity > 0 && type === "FULL" && quantity !== capacity) throw new Error("Partially used box must be OPEN: " + row[0]);
}

function medStockValidatePackCut_(ss, row, amount) {
  const pack = medStockPackageFields_(ss, row[1]);
  if (medStockIsPacked_(pack) && String(row[4]).trim() !== pack.unit) throw new Error("Legacy unit requires correction before use: " + row[0]);
  if (["bottle", "syringe"].indexOf(String(row[4]).trim().toLowerCase()) !== -1 && !Number.isInteger(amount)) {
    throw new Error("Cut whole bottles or syringes only: " + row[0]);
  }
}
