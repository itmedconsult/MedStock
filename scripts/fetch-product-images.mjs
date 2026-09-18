import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const groups = [
  { query: "Belotero Soft dermal filler official product box", skus: ["AES-001"] },
  { query: "Belotero Balance lidocaine dermal filler official product box", skus: ["AES-002"] },
  { query: "Belotero Revive official product box", skus: ["AES-003"] },
  { query: "Restylane Vital Light official product box", skus: ["AES-004"] },
  { query: "Restylane Lyft official product box", skus: ["AES-005"] },
  { query: "Restylane Volyme official product box", skus: ["AES-006"] },
  { query: "Restylane Kysse official product box", skus: ["AES-007"] },
  { query: "Neuramis Deep official product box", skus: ["AES-008"] },
  { query: "Neuramis Volume official product box", skus: ["AES-009"] },
  { query: "Juvederm Ultra Plus XC official product box", skus: ["AES-010"] },
  { query: "Juvederm Volift official product box", skus: ["AES-011"] },
  { query: "Juvederm Volbella official product box", skus: ["AES-012"] },
  { query: "Juvederm Voluma official product box", skus: ["AES-013"] },
  { query: "Juvederm Volux official product box", skus: ["AES-014", "AES-023"] },
  { query: "Biohyalux dermal filler official product box", skus: ["AES-015"] },
  { query: "Yvoire Classic dermal filler official product box", skus: ["AES-016"] },
  { query: "Yvoire Volume dermal filler official product box", skus: ["AES-017"] },
  { query: "EPTQ S500 dermal filler official product box", skus: ["AES-018"] },
  { query: "EPTQ S300 dermal filler official product box", skus: ["AES-019"] },
  { query: "EPTQ S100 dermal filler official product box", skus: ["AES-020"] },
  { query: "Youthfill Deep dermal filler official product box", skus: ["AES-021"] },
  { query: "Youthfill Fine dermal filler official product box", skus: ["AES-022"] },
  { query: "Kabelline fat dissolving official product box vial", skus: ["AES-024", "AES-025"] },
  { query: "Neobella mesofat 8ml official product box", skus: ["AES-026"] },
  { query: "Neobelle 1cc mesotherapy official product", skus: ["AES-027"] },
  { query: "Lilied M mesotherapy official product vial", skus: ["AES-028"] },
  { query: "Sculptra official product vial box", skus: ["AES-029", "AES-030"] },
  { query: "Juvelook official product vial box", skus: ["AES-031", "AES-032"] },
  { query: "Profhilo official product box syringe", skus: ["AES-033", "AES-034"] },
  { query: "Rejuran Healer official product box syringe", skus: ["AES-035"] },
  { query: "Rejuran Black official product box", skus: ["AES-036"] },
  { query: "Rejuran HB Plus official product box", skus: ["AES-037"] },
  { query: "L'ebss skin booster official product", skus: ["AES-038"] },
  { query: "SiSi Code I skin booster official product", skus: ["AES-039"] },
  { query: "SiSi Code II skin booster official product", skus: ["AES-040"] },
  { query: "Radiesse official product box syringe", skus: ["AES-041"] },
  { query: "LiteActiv 10ml skin booster official product", skus: ["AES-042"] },
  { query: "Rejuran PN official product box syringe", skus: ["AES-043"] },
  { query: "MINERVA thread lift 19 21 product package", skus: ["AES-044", "AES-045", "AES-046", "AES-047"] },
  { query: "MINT thread lift official product package", skus: ["AES-048", "AES-049"] },
  { query: "i-THREAD lifting thread official product package", skus: ["AES-050", "AES-051"] },
  { query: "Aestox 200IU botulinum toxin official product box vial", skus: ["AES-052", "AES-053"] },
  { query: "Botox Allergan 100 units official product box vial", skus: ["AES-054", "AES-055", "AES-077"] },
  { query: "Neuronox 200IU official product box vial", skus: ["AES-056", "AES-057"] },
  { query: "Hugel botulinum toxin 50 units official product box vial", skus: ["AES-058", "AES-059"] },
  { query: "Dysport 300 units official product box vial", skus: ["AES-060", "AES-061"] },
  { query: "Xeomin 100 units official product box vial", skus: ["AES-062", "AES-063"] },
  { query: "Nabota botulinum toxin official product box vial", skus: ["AES-064", "AES-065"] },
  { query: "BTXA 100IU Lanzhou official product box vial", skus: ["AES-066", "AES-067"] },
  { query: "MBTOX botulinum toxin official product box vial", skus: ["AES-068", "AES-069", "AES-078"] },
  { query: "Hutox botulinum toxin official product box vial", skus: ["AES-070", "AES-072"] },
  { query: "Bienox botulinum toxin official product box vial", skus: ["AES-071", "AES-073"] },
  { query: "Renevox botulinum toxin official product box vial", skus: ["AES-074", "AES-075"] },
  { query: "Aston botulinum toxin 200IU official product box vial", skus: ["AES-076"] },
  { query: "Revenox botulinum toxin official product box vial", skus: ["AES-079", "AES-080"] },
  { query: "Mounjaro 2.5 mg KwikPen official product box", skus: ["PEN-001"] },
  { query: "Mounjaro 5 mg KwikPen official product box", skus: ["PEN-002"] },
  { query: "Mounjaro 7.5 mg KwikPen official product box", skus: ["PEN-003"] },
  { query: "Mounjaro 10 mg KwikPen official product box", skus: ["PEN-004"] },
  { query: "Mounjaro 12.5 mg KwikPen official product box", skus: ["PEN-005"] },
  { query: "Mounjaro 15 mg KwikPen official product box", skus: ["PEN-006"] },
  { query: "Wegovy 0.25 mg FlexTouch official product box", skus: ["PEN-007"] },
  { query: "Wegovy 0.5 mg FlexTouch official product box", skus: ["PEN-008"] },
  { query: "Wegovy 1 mg FlexTouch official product box", skus: ["PEN-009"] },
  { query: "Wegovy 1.7 mg FlexTouch official product box", skus: ["PEN-010"] },
  { query: "Wegovy 2.4 mg FlexTouch official product box", skus: ["PEN-011"] },
  { query: "Ozempic 1 mg FlexTouch official product box", skus: ["PEN-012"] },
];

const root = process.cwd();
const outputDir = path.join(root, "public", "products");
const reviewDir = path.join(root, "product-images-review");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

async function searchImages(query) {
  const encoded = encodeURIComponent(query);
  const headers = { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" };
  const searchResponse = await fetch(`https://duckduckgo.com/?q=${encoded}&iax=images&ia=images`, { headers });
  const html = await searchResponse.text();
  const vqd = html.match(/vqd=['"]([^'"]+)['"]/i)?.[1];
  if (!vqd) throw new Error("Image search token was not returned.");

  const resultResponse = await fetch(`https://duckduckgo.com/i.js?l=us-en&o=json&q=${encoded}&vqd=${encodeURIComponent(vqd)}&f=,,,&p=1`, {
    headers: { ...headers, Referer: "https://duckduckgo.com/" },
  });
  if (!resultResponse.ok) throw new Error(`Image search failed (${resultResponse.status}).`);
  const payload = await resultResponse.json();
  return (payload.results || []).map((item) => ({
    title: decodeHtml(String(item.title || "")),
    imageUrl: String(item.image || ""),
    sourcePage: String(item.url || ""),
  }));
}

async function downloadUsableImage(results) {
  for (const result of results.slice(0, 12)) {
    try {
      const response = await fetch(result.imageUrl, {
        headers: { "User-Agent": "Mozilla/5.0", Referer: result.sourcePage },
        signal: AbortSignal.timeout(18_000),
      });
      if (!response.ok) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 8_000 || buffer.length > 15_000_000) continue;
      const metadata = await sharp(buffer).metadata();
      if (!metadata.width || !metadata.height || metadata.width < 250 || metadata.height < 180) continue;
      const webp = await sharp(buffer)
        .rotate()
        .resize(800, 500, { fit: "contain", background: "#f5f7f5", withoutEnlargement: false })
        .webp({ quality: 82, effort: 5 })
        .toBuffer();
      return { ...result, webp, originalWidth: metadata.width, originalHeight: metadata.height };
    } catch {
      // Try the next result when a source rejects hotlink downloads or is not a supported image.
    }
  }
  throw new Error("No usable image result could be downloaded.");
}

function escapeXml(value) {
  return value.replace(/[<>&'"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character]);
}

async function createContactSheets(records) {
  const itemsPerSheet = 20;
  for (let start = 0; start < records.length; start += itemsPerSheet) {
    const subset = records.slice(start, start + itemsPerSheet);
    const tiles = await Promise.all(subset.map(async (record) => {
      const image = await fs.readFile(path.join(outputDir, `${record.skus[0]}.webp`));
      const label = `${record.skus.join(", ")} · ${record.query}`;
      const svg = Buffer.from(`<svg width="360" height="48" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#18342f"/><text x="12" y="20" fill="white" font-family="Arial" font-size="12" font-weight="700">${escapeXml(label.slice(0, 52))}</text><text x="12" y="38" fill="#b9d6ce" font-family="Arial" font-size="10">${escapeXml(record.sourceHost)}</text></svg>`);
      return sharp({ create: { width: 360, height: 273, channels: 3, background: "#ffffff" } })
        .composite([
          { input: await sharp(image).resize(360, 225, { fit: "contain", background: "#f5f7f5" }).toBuffer(), top: 0, left: 0 },
          { input: svg, top: 225, left: 0 },
        ])
        .webp({ quality: 80 })
        .toBuffer();
    }));
    const columns = 4;
    const rows = Math.ceil(tiles.length / columns);
    const contactSheet = sharp({ create: { width: columns * 360, height: rows * 273, channels: 3, background: "#dfe5e1" } });
    await contactSheet.composite(tiles.map((input, index) => ({ input, left: (index % columns) * 360, top: Math.floor(index / columns) * 273 })))
      .webp({ quality: 82 })
      .toFile(path.join(reviewDir, `contact-sheet-${Math.floor(start / itemsPerSheet) + 1}.webp`));
  }
}

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(reviewDir, { recursive: true });

const records = [];
const failures = [];
for (const [index, group] of groups.entries()) {
  try {
    const results = await searchImages(group.query);
    const selected = await downloadUsableImage(results);
    await Promise.all(group.skus.map((sku) => fs.writeFile(path.join(outputDir, `${sku}.webp`), selected.webp)));
    const sourceHost = new URL(selected.sourcePage).hostname.replace(/^www\./, "");
    records.push({
      query: group.query,
      skus: group.skus,
      title: selected.title,
      imageUrl: selected.imageUrl,
      sourcePage: selected.sourcePage,
      sourceHost,
      originalSize: `${selected.originalWidth}x${selected.originalHeight}`,
    });
    console.log(`[${index + 1}/${groups.length}] ${group.skus.join(", ")} <- ${sourceHost}`);
  } catch (error) {
    failures.push({ ...group, error: error instanceof Error ? error.message : String(error) });
    console.error(`[${index + 1}/${groups.length}] FAILED ${group.skus.join(", ")}: ${failures.at(-1).error}`);
  }
  await delay(850);
}

await fs.writeFile(path.join(outputDir, "sources.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), records, failures }, null, 2)}\n`);
await createContactSheets(records);
console.log(`Completed ${records.length}/${groups.length} image groups; ${failures.length} failed.`);
if (failures.length) process.exitCode = 2;
