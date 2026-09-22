import productImages from "./product-images.json";

// Image filenames retain their original catalog IDs. Match by product name,
// because Google Sheets SKUs can be renumbered independently of these assets.
const imagesByName: Record<string, string> = productImages;

export function resolveProductImage(name: string, imageUrl: unknown) {
  if (typeof imageUrl === "string" && imageUrl.trim()) return imageUrl.trim();
  return imagesByName[name.trim().toLowerCase()];
}
