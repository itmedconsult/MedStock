import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const replacements = [
  {
    skus: ["AES-026"],
    title: "NEOGENESIS Neobella 8ml",
    imageUrl: "https://bjushop.com/wp-content/uploads/2022/07/opakowanie-neobella-750x750.jpg",
    sourcePage: "https://bjushop.com/product/neogenesis-neobella-8ml/",
  },
  {
    skus: ["AES-052", "AES-053"],
    title: "Aestox 200U",
    imageUrl: "https://agent-skin.com/wp-content/uploads/2024/09/aestox-200-u.jpg",
    sourcePage: "https://agent-skin.com/product/botulinum-toxin/aestox-200-u/",
  },
  {
    skus: ["AES-068", "AES-069", "AES-078"],
    title: "MBTOX 100U",
    imageUrl: "https://agent-skin.com/wp-content/uploads/2025/04/MBTOX-100-u-1-600x600.webp",
    sourcePage: "https://agent-skin.com/product/botulinum-toxin/mbtox/",
  },
  {
    skus: ["AES-074", "AES-075"],
    title: "Renevox",
    imageUrl: "https://vincentskin.com/wp-content/uploads/2026/03/Is-Renevox-purple-Botox-good-What-are-its-key-advantages.webp",
    sourcePage: "https://vincentskin.com/skin-tips/renevox-botox/",
  },
];

const root = process.cwd();
const outputDir = path.join(root, "public", "products");
const sourcePath = path.join(outputDir, "sources.json");
const sourceData = JSON.parse(await fs.readFile(sourcePath, "utf8"));

for (const replacement of replacements) {
  const response = await fetch(replacement.imageUrl, {
    headers: { "User-Agent": "Mozilla/5.0", Referer: replacement.sourcePage },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Unable to download ${replacement.title}: ${response.status}`);
  const original = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(original).metadata();
  const webp = await sharp(original)
    .rotate()
    .resize(800, 500, { fit: "contain", background: "#f5f7f5" })
    .webp({ quality: 82, effort: 5 })
    .toBuffer();
  await Promise.all(replacement.skus.map((sku) => fs.writeFile(path.join(outputDir, `${sku}.webp`), webp)));

  const existingIndex = sourceData.records.findIndex((record) => record.skus.some((sku) => replacement.skus.includes(sku)));
  const record = {
    query: `${replacement.title} curated replacement`,
    skus: replacement.skus,
    title: replacement.title,
    imageUrl: replacement.imageUrl,
    sourcePage: replacement.sourcePage,
    sourceHost: new URL(replacement.sourcePage).hostname.replace(/^www\./, ""),
    originalSize: `${metadata.width}x${metadata.height}`,
    reviewStatus: "verified-product-match",
  };
  if (existingIndex >= 0) sourceData.records.splice(existingIndex, 1, record);
  else sourceData.records.push(record);
  console.log(`${replacement.skus.join(", ")} <- ${record.sourceHost}`);
}

const unverified = {
  "AES-050": "No exact i.THREAD manufacturer image could be verified; related lifting-thread packaging is used.",
  "AES-051": "No exact i.THREAD manufacturer image could be verified; related lifting-thread packaging is used.",
  "AES-076": "No exact Aston 200IU product image could be verified; related 200IU toxin packaging is used.",
  "AES-079": "No verifiable botulinum-toxin product named Revenox was found; a related toxin-vial image is used.",
  "AES-080": "No verifiable botulinum-toxin product named Revenox was found; a related toxin-vial image is used.",
};

for (const record of sourceData.records) {
  const notes = record.skus.filter((sku) => unverified[sku]).map((sku) => `${sku}: ${unverified[sku]}`);
  if (notes.length) {
    record.reviewStatus = "related-image-unverified-product-match";
    record.reviewNotes = notes;
  } else if (!record.reviewStatus) {
    record.reviewStatus = "visually-reviewed";
  }
}

sourceData.reviewedAt = new Date().toISOString();
await fs.writeFile(sourcePath, `${JSON.stringify(sourceData, null, 2)}\n`);
