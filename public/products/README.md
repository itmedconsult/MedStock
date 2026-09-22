# Product images

Product card images retain their original catalog SKU filenames (`AES-001.webp`, `PEN-001.webp`, and so on). These filenames no longer necessarily match the current Google Sheets SKUs.

- `lib/product-images.json` maps current product names to the original image files after SKU renumbering. Update this mapping when adding or renaming products; do not derive image paths from current SKUs.
- The inventory API prefers an explicit Google Sheets `imageUrl`, then uses the name mapping. Unknown names without an image URL use the UI placeholder.
- The download scripts and `sources.json` use the original asset IDs. Do not renumber the image files without also updating the mapping and scripts.

- `sources.json` records the original image URL and source page for each image group.
- Several Bottle/Open SKUs intentionally share an image because they are the same packaged product.
- Records marked `related-image-unverified-product-match` could not be verified as an exact brand match and should be replaced when an authoritative supplier image is available.
- These are third-party product reference images. Confirm commercial reuse permission with each rights holder before public deployment.
