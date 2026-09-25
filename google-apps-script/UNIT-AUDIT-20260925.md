# Container unit audit, 2026-09-25

Barcode identifies one Box for packaged syringes/bottles, or one Bottle for toxin potency.
Stock quantity uses whole Syringe/Bottle counts or labelled IU/U respectively.
Do not convert toxin units between brands or infer potency from dilution volume.

## Applied

Existing 14 confirmed box configurations are unchanged.
Bottle potency uses the explicit SKU product names in Product List:

| SKU | Product | Unit | Capacity per bottle |
|---|---|---|---|
| AES-048 | Aestox | IU | 200 |
| AES-049 | Allergan | IU | 100 |
| AES-050 | Neuronox | IU | 200 |
| AES-051 | Hugel Toxin | IU | 50 |
| AES-052 | Dysport | IU | 300 |
| AES-053 | Xeomin | IU | 100 |
| AES-054 | Nabota | U | 200 |
| AES-055 | BTXA | IU | 100 |

19 inventory barcodes were recorded FULL with quantity/initial quantity 1 and
only IMPORT history. Migration preserves barcodes and original import units,
adds zero-movement Pack Correction audit rows, and stores the previous values.
Backup: tmp/toxin-unit-before-20260925.json. Apps Script deployment version 15.

## Confirmed barcode scope, 2026-09-25

The owner confirmed that existing Filler barcodes identify one BOX, not one
syringe. Keep each original barcode and use the verified number of syringes
per box as its stock capacity. Do not treat mL/CC volume as a syringe count.
This confirmation alone does not establish the pack count of each SKU or
authorize resetting partially consumed inventory to full capacity.

## Owner-confirmed box contents applied

| SKU(s) | Product group | Stock unit | Units per Box |
|---|---|---|---:|
| AES-001, 002, 003 | Belotero Soft, Lidocaine, Revive | Syringe | 1 |
| AES-005, 006, 007 | Restylane Lyft, Volyme, Kysse | Syringe | 1 |
| AES-008, 009 | Neuramis Deep/Volume Lidocaine | Syringe | 1 |
| AES-011 | Juvederm Volift | Syringe | 2 |
| AES-015 | Biohyalux Deep Dermis | Syringe | 1 |
| AES-016, 017 | Yvoire Classic Plus, Volume Plus | Syringe | 1 |
| AES-018, 019, 020 | EPTQ S500, S300, S100 | Syringe | 1 |
| AES-021, 022 | YOUTHFILL Deep, Fine | Syringe | 1 |
| AES-026 | Neobelle | Syringe | 1 |
| AES-028, 029 | Sculptra, Juvelook | Bottle | 1 |
| AES-030 | Profhilo | Syringe | 1 |
| AES-033 | Rejuran HB plus | Syringe | 1 |
| AES-036 | SiSi Code II | Bottle | 1 |
| AES-037 | Radiesse | Syringe | 1 |
| AES-056, 058, 059, 061 | MBTOX, Bienox, Renevox, MBTOX | U | 100 |
| AES-063 | Transmin 1 | Bottle | 10 |
| AES-064 | Vitaran | Syringe | 2 |
| AES-065 | Ejal40 | Syringe | 1 |

Product unit follows the table, barcode unit is Box, and tracking is BULK.
The second owner-confirmed migration updated 27 SKUs, 75 untouched FULL
inventory barcodes, and 348 registry records. All affected inventory had
IMPORT-only history. Seventy-five zero-movement Pack Correction logs retain
the old values, and the original import logs retain their historical units.
Backup: tmp/filler-latest-before-20260925.json.
Second backup: tmp/confirmed-packaging-before-20260925.json.
An unrelated PEN import arrived during inspection; it was preserved and audit
rows were appended atomically instead of writing over a precomputed log row.

Packaging references:
- Volift: https://www.allerganaesthetics.com.au/content/dam/aa-corporate/au/en/pdf/volift/Juvederm-Volift-ifu.pdf
- Yvoire: https://innovation.lgchem.com/resource/assets/web/images/pdf/LG%20Chem%20Life%20Sciences%20Factsheet.pdf
- HB plus: https://www.pharmaresearch.com/en/product/view.html?code=2&curpage=1&idx=6&srh_cate=1
- Ejal40: https://www.medixasrl.com/ejal40/

### Still unresolved

- AES-004 Restylane Vital Light was not included in the owner's confirmed list.
- AES-057 Hutox 100 U was not included in the owner's confirmed list.
- Thread pack and piece SKUs must not both count the same physical stock.
- PEN products remain counted by pen; no sharing or arbitrary dose conversion.

## Evidence and limits

- Juvederm Volift IFU: two 1 mL syringes per box; verify that the current SKU
  is this presentation before migration. Historic barcode scope is confirmed:
  https://media.allergan.com/products/J%20Volift%20DFU.pdf
- Belotero Revive Thailand IFU explicitly directs readers to the outer box
  for the number of syringes; do not assume every market pack is identical:
  https://www.ifu.merzaesthetics.com/products/download/53095/Belotero%C2%AE-Revive-TH-V01-30-AUG-2024.pdf
- Neuronox manufacturer shows 200U presentation:
  https://medytox.com/page/meditoxin_en?site_id=en
- Nabota manufacturer/distributor lists 200-unit presentation:
  https://www.dncompany.co.kr/m231.php?cate=1

Inventory tracking does not establish that an opened product may be reused;
follow its local label for single-use, storage, and discard requirements.
