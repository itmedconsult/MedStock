import { resolveProductImage } from "@/lib/product-images";

type SheetProduct = {
  sku?: unknown;
  name?: unknown;
  category?: unknown;
  unit?: unknown;
  trackMode?: unknown;
  imageUrl?: unknown;
  stockDate?: unknown;
};

type SheetResponse = {
  ok?: boolean;
  error?: string;
  updatedAt?: string;
  products?: SheetProduct[];
};

export const dynamic = "force-dynamic";

function requiredText(value: unknown, field: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`Google Sheets returned a product without ${field}.`);
  return text;
}

export async function GET() {
  const endpoint = process.env.GOOGLE_SHEETS_WEB_APP_URL;
  const token = process.env.GOOGLE_SHEETS_API_TOKEN;

  if (!endpoint || !token) {
    return Response.json(
      { error: "Google Sheets connection is not configured on the MedStock server." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "listProducts", token }),
      cache: "no-store",
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`Google Apps Script responded with HTTP ${response.status}.`);
    }

    const data = await response.json() as SheetResponse;
    if (!data.ok) throw new Error(data.error || "Google Sheets returned an error.");

    const products = (data.products || []).map((product) => ({
      sku: requiredText(product.sku, "an SKU"),
      name: requiredText(product.name, "a product name"),
      category: typeof product.category === "string" && product.category.trim() ? product.category.trim() : "Medical Stock",
      unit: typeof product.unit === "string" && product.unit.trim() ? product.unit.trim() : "units",
      trackMode: typeof product.trackMode === "string" ? product.trackMode.trim() : "",
      image: resolveProductImage(requiredText(product.name, "a product name"), product.imageUrl),
      date: requiredText(product.stockDate, "a stock date"),
    }));

    return Response.json(
      { products, updatedAt: data.updatedAt || new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[MedStock inventory sync]", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load inventory from Google Sheets." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
