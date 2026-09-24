# Box barcode packaging

Deployed to the existing Script_Barcode web app as version 14 on 2026-09-24.
Keep Packaging.gs alongside StockOperationsApi.gs and BarcodeApi.gs.

Product List columns M/N contain Barcode Unit / Units Per Barcode. Box products
use Bottle or Syringe as their stock unit and BULK as the tracking mode.
Each barcode identifies one box; Inventory Initial Qty retains its capacity.
Import requires a full box. Cut accepts whole contents, and partial use sets OPEN.

The live WebApi.gs adapter was also updated:
- Product responses include packageUnit and unitsPerPack from medStockPackageFields_.
- Inventory responses include product packageUnit and Initial Qty as unitsPerPack.
- Log Data reads A:S; column S preserves the historical unit when present.
- Source `Pack Correction` is an audit-only correction and is excluded from movements.

Migration PACK-CORRECTION-20260924 converted 38 untouched FULL inventory rows
from their legacy quantity of 1 to 131 contents across the same 38 barcodes.
Original import rows and barcode IDs remain unchanged. The 38 zero-movement
audit rows store previous quantities, units and references in Details.
Before-state and exact update requests are saved locally under tmp/packaging-*.json.

AES-031 is Rejuran i, AES-039 is Rejuran s, and new AES-066 is Rejuran Lidocaine.
The latter has no supplied product photo yet.

Validation: `node scripts/test-packaging.mjs`, `npx tsc --noEmit`, `npm run build`.
The stock tests use an in-memory sheet, never live stock mutations.
