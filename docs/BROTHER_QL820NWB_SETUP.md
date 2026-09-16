# Brother QL-820NWB USB setup

MedStock prints directly from Chrome or Edge through Brother b-PAC. No CSV or PDF export is involved.

## Workstation requirements

1. Connect the Brother QL-820NWB by USB and install its Windows printer driver.
2. Install Brother b-PAC SDK/runtime.
3. Install the Brother b-PAC Extension for the browser used to open MedStock.
4. Copy `bpac.js` from the b-PAC SDK extension resources into `public/brother/bpac.js`.
5. Use P-touch Editor to create `C:\MedStock\labels\medstock.lbx` for the installed DK roll.

The label template must contain these named objects:

- `product_name` — text
- `sku` — text
- `barcode` — Code 128 barcode
- `category` — text

MedStock calls `PrintOut(quantity, 0)`, so a product with quantity `2` prints two identical labels.

## Configuration

Copy `.env.example` to `.env.local` if the b-PAC module or template lives elsewhere. Restart the Next.js development server after changing environment variables.

## Browser-to-printer path

`MedStock -> bpac.js -> Brother b-PAC Extension -> b-PAC runtime -> QL-820NWB driver -> USB printer`
