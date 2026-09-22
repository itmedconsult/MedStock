"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Barcode from "react-barcode";
import {
  BrotherLabelStatus,
  BrotherPrintLabel,
  BrotherPrintLog,
  brotherPrinterConfig,
  formatBarcodeUuid,
  prepareBrotherPrintLabels,
  printLabelsToBrother,
} from "@/lib/brother-print";
import {
  IconBarcode,
  IconCalendar,
  IconCheck,
  IconChevronDown,
  IconPackage,
  IconPhotoEdit,
  IconPill,
  IconArrowLeft,
  IconRefresh,
  IconSearch,
  IconStethoscope,
  IconVaccine,
  IconX,
} from "@tabler/icons-react";

type Product = {
  id: string;
  name: string;
  sku: string;
  date: string;
  quantity: number;
  category: string;
  accent: string;
  tint: string;
  unit: string;
  image?: string;
};

type InventoryApiResponse = {
  products?: Array<Pick<Product, "name" | "sku" | "date" | "category" | "unit" | "image">>;
  updatedAt?: string;
  error?: string;
};

type PrintLabelState = BrotherPrintLabel & {
  status: BrotherLabelStatus;
  error?: string;
};

const categoryPalettes = [
  { accent: "#2e7d6b", tint: "#e3f2ed" },
  { accent: "#c58148", tint: "#faeee3" },
  { accent: "#5b78a6", tint: "#e7edf7" },
  { accent: "#735f9b", tint: "#eeeaf5" },
  { accent: "#b26d55", tint: "#f9eae4" },
  { accent: "#367b8a", tint: "#e2f0f3" },
];

function paletteFor(category: string) {
  const hash = Array.from(category).reduce((total, character) => total + character.charCodeAt(0), 0);
  return categoryPalettes[hash % categoryPalettes.length];
}

function ProductArtwork({ product }: { product: Product }) {
  const Icon = product.category === "Injection" ? IconVaccine : product.category === "Devices" ? IconStethoscope : product.category === "Supplies" ? IconPackage : IconPill;
  return (
    <div className="product-art" style={{ background: product.tint, color: product.accent }}>
      <span className="art-orbit orbit-one" />
      <span className="art-orbit orbit-two" />
      <Icon size={58} stroke={1.35} />
      <span className="art-label">{product.category}</span>
      {product.image && (
        <img
          className="product-image"
          src={product.image}
          alt={product.name}
          onError={(event) => { event.currentTarget.style.display = "none"; }}
        />
      )}
    </div>
  );
}

export default function CreateBarcodePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryState, setInventoryState] = useState<"loading" | "ready" | "error">("loading");
  const [inventoryError, setInventoryError] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [printStatus, setPrintStatus] = useState<"idle" | "printing" | "success" | "error">("idle");
  const [printMessage, setPrintMessage] = useState("");
  const [printLogs, setPrintLogs] = useState<BrotherPrintLog[]>([]);
  const [printLabels, setPrintLabels] = useState<PrintLabelState[]>([]);
  const [toast, setToast] = useState(false);
  const dateInput = useRef<HTMLInputElement>(null);

  const loadInventory = async (signal?: AbortSignal, preserveQuantities = false) => {
    if (preserveQuantities) setIsSyncing(true);
    else setInventoryState("loading");
    setInventoryError("");

    try {
      const response = await fetch("/api/inventory", { cache: "no-store", signal });
      const data = await response.json() as InventoryApiResponse;
      if (!response.ok) throw new Error(data.error || "Unable to load products from Google Sheets.");

      const nextProducts = (data.products || []).map((product) => ({
        ...product,
        id: product.sku,
        quantity: 0,
        image: product.image,
        ...paletteFor(product.category),
      }));

      setProducts((current) => nextProducts.map((product) => ({
        ...product,
        quantity: preserveQuantities
          ? current.find((currentProduct) => currentProduct.id === product.id)?.quantity || 0
          : 0,
      })));
      setUpdatedAt(data.updatedAt || new Date().toISOString());
      setInventoryState("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setProducts([]);
      setInventoryError(error instanceof Error ? error.message : "Unable to load products from Google Sheets.");
      setInventoryState("error");
    } finally {
      if (preserveQuantities) setIsSyncing(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void loadInventory(controller.signal);
    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => products.filter((product) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || product.name.toLowerCase().includes(term) || product.sku.toLowerCase().includes(term) || product.category.toLowerCase().includes(term);
    return matchesSearch && (!date || product.date === date);
  }), [products, search, date]);

  const barcodeProducts = useMemo(
    () => products.filter((product) => product.quantity > 0),
    [products],
  );

  const retryableLabels = useMemo(
    () => printLabels.filter((label) => label.status === "failed" || label.status === "queued"),
    [printLabels],
  );

  const adjustQuantity = (id: string, amount: number) => {
    setProducts((current) => current.map((product) => product.id === id ? { ...product, quantity: Math.max(0, product.quantity + amount) } : product));
  };

  const changeImage = (id: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const image = URL.createObjectURL(file);
    setProducts((current) => current.map((product) => product.id === id ? { ...product, image } : product));
  };

  const clearAll = () => {
    setSearch("");
    setDate("");
    setProducts((current) => current.map((product) => ({ ...product, quantity: 0 })));
    setToast(true);
    window.setTimeout(() => setToast(false), 2200);
  };

  const closeBarcodeModal = () => {
    if (printStatus === "printing") return;
    setIsBarcodeModalOpen(false);
    setPrintStatus("idle");
    setPrintMessage("");
    setPrintLogs([]);
    setPrintLabels([]);
  };

  const runBrotherPrint = async (labels: BrotherPrintLabel[]) => {
    if (!labels.length) return;

    setPrintStatus("printing");
    setPrintMessage(`Sending ${labels.length} ${labels.length === 1 ? "label" : "labels"} to Brother QL-820NWB…`);
    setPrintLogs([]);

    const targetUuids = new Set(labels.map((label) => label.uuid));
    setPrintLabels((current) => current.map((label) => targetUuids.has(label.uuid)
      ? { ...label, status: "queued", error: undefined }
      : label));

    try {
      const result = await printLabelsToBrother(
        labels,
        (entry) => setPrintLogs((current) => [...current, entry]),
        (update) => setPrintLabels((current) => current.map((label) => label.uuid === update.uuid
          ? { ...label, status: update.status, error: update.error }
          : label)),
      );

      if (result.failed > 0 || result.pending > 0) {
        setPrintStatus("error");
        setPrintMessage(`${result.sent} sent, ${result.failed} failed, ${result.pending} not attempted. Clear the printer error, then retry only failed/unprinted labels.`);
      } else {
        setPrintStatus("success");
        setPrintMessage(`${result.sent} ${result.sent === 1 ? "label was" : "labels were"} accepted by Brother with no hardware error reported.`);
      }
    } catch (error) {
      setPrintStatus("error");
      setPrintMessage(error instanceof Error ? error.message : "Unable to print to Brother QL-820NWB.");
    }
  };

  const printWithBrother = async () => {
    try {
      const labels = prepareBrotherPrintLabels(barcodeProducts);
      setPrintLabels(labels.map((label) => ({ ...label, status: "queued" })));
      await runBrotherPrint(labels);
    } catch (error) {
      setPrintStatus("error");
      setPrintMessage(error instanceof Error ? error.message : "Unable to prepare barcode labels.");
    }
  };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-mark"><IconPill size={22} /></span>
          <span>Med<span>Stock</span></span>
        </a>
        <div className={`header-status ${inventoryState}`}><span className="status-dot" />{inventoryState === "ready" ? "Google Sheets connected" : inventoryState === "loading" ? "Connecting to Google Sheets…" : "Google Sheets disconnected"}</div>
        <div className="topbar-actions">
          <Link className="dashboard-link" href="/"><IconArrowLeft size={17} /> Back to dashboard</Link>
          <button className="avatar" aria-label="Account menu">MS</button>
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">Medical inventory</p>
        <h1>Everything in its place.</h1>
        <p className="hero-copy">Search, count, and label your medical stock with clarity.</p>

        <div className="search-panel">
          <div className="search-box">
            <IconSearch size={22} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by product, SKU, or category…" autoFocus />
            {search && <button onClick={() => setSearch("")} aria-label="Clear search"><IconX size={18} /></button>}
            
          </div>
          <button className={`date-control ${date ? "active" : ""}`} onClick={() => dateInput.current?.showPicker()}>
            <IconCalendar size={18} />
            <span>{date ? new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "All stock dates"}</span>
            <IconChevronDown size={17} />
            <input ref={dateInput} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </button>
        </div>
      </section>

      <section className="inventory">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Current inventory</p>
            <h2>{filtered.length} {filtered.length === 1 ? "item" : "items"}</h2>
          </div>
          <div className="inventory-sync">
            <button
              className="sync-button"
              onClick={() => void loadInventory(undefined, true)}
              disabled={isSyncing || inventoryState === "loading"}
              aria-label="Sync inventory with Google Sheets"
            >
              <IconRefresh className={isSyncing ? "spinning" : ""} size={16} />
              {isSyncing ? "Syncing…" : "Sync"}
            </button>
            <p aria-live="polite">{updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : inventoryState === "loading" ? "Loading from Google Sheets…" : "Not synced"}</p>
          </div>
        </div>

        {inventoryState === "loading" ? (
          <div className="inventory-state" aria-live="polite">
            <span className="loading-spinner" />
            <h3>Loading products</h3>
            <p>Reading the active product list from Google Sheets.</p>
          </div>
        ) : inventoryState === "error" ? (
          <div className="inventory-state error-state" role="alert">
            <IconX size={38} stroke={1.5} />
            <h3>Google Sheets connection failed</h3>
            <p>{inventoryError}</p>
            <button onClick={() => void loadInventory()}>Try again</button>
          </div>
        ) : filtered.length > 0 ? (
          <div className="product-grid">
            {filtered.map((product) => (
              <article className="product-card" key={product.id}>
                <div className="image-wrap">
                  <ProductArtwork product={product} />
                  <label className="edit-image" title="Change cover image">
                    <IconPhotoEdit size={17} />
                    <input type="file" accept="image/*" onChange={(event) => changeImage(product.id, event)} />
                  </label>
                  <span className="category-pill">{product.category}</span>
                </div>
                <div className="card-body">
                  <h3>{product.name}</h3>
                  <div className="metadata">
                    <span><small>SKU</small>{product.sku}</span>
                    <span><small>STOCK DATE</small>{new Date(`${product.date}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
                  </div>
                  <div className="quantity-row">
                    <div><small>QUANTITY</small><strong>{product.quantity}</strong><span> {product.unit}</span></div>
                    <div className="stepper">
                      <button onClick={() => adjustQuantity(product.id, -1)} aria-label={`Decrease ${product.name}`}>−</button>
                      <button onClick={() => adjustQuantity(product.id, 1)} aria-label={`Increase ${product.name}`}>+</button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <IconPackage size={40} stroke={1.3} />
            <h3>No stock items found</h3>
            <p>Try another search term or stock date.</p>
            <button onClick={() => { setSearch(""); setDate(""); }}>Reset filters</button>
          </div>
        )}
      </section>

      <div className="action-dock">
        <button className="generate-button" onClick={() => { setIsBarcodeModalOpen(true); setPrintStatus("idle"); setPrintMessage(""); setPrintLogs([]); setPrintLabels([]); }} disabled={!barcodeProducts.length}>
          <IconBarcode size={21} /> Generate {barcodeProducts.length === 1 ? "barcode" : "barcodes"}
          {barcodeProducts.length > 0 && <span className="selection-count">{barcodeProducts.length}</span>}
        </button>
        <button className="clear-button" onClick={clearAll}>Clear</button>
      </div>

      {isBarcodeModalOpen && barcodeProducts.length > 0 && (
        <div className="modal-backdrop" onMouseDown={closeBarcodeModal}>
          <div className="barcode-modal multi-barcode-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="barcode-modal-title">
            <button className="modal-close" onClick={closeBarcodeModal} aria-label="Close generated barcodes" disabled={printStatus === "printing"}><IconX size={20} /></button>
            <div className="success-icon"><IconCheck size={22} /></div>
            <p className="section-kicker">Barcodes ready</p>
            <h2 id="barcode-modal-title">{barcodeProducts.length} {barcodeProducts.length === 1 ? "product" : "products"} with stock</h2>
            <p className="barcode-help">Products with a quantity above zero are included automatically. Exact UUIDs are reserved when printing starts.</p>
            <div className="printer-chip">
              <span className="printer-dot" />
              <div><strong>{brotherPrinterConfig.model}</strong><small>{brotherPrinterConfig.connection} direct print</small></div>
            </div>
            <div className="barcode-labels">
              {barcodeProducts.map((product) => (
                <article className="barcode-label" key={product.id}>
                  <div className="barcode-label-heading">
                    <div>
                      <h3>{product.name}</h3>
                      <p>{product.quantity} {product.quantity === 1 ? "unit" : "units"} in stock</p>
                    </div>
                    <span>{product.category}</span>
                  </div>
                  <div className="barcode-paper">
                    <Barcode value={formatBarcodeUuid(product.sku, product.date, 1)} format="CODE128" height={58} width={1.1} fontSize={11} background="transparent" />
                  </div>
                </article>
              ))}
            </div>
            {printMessage && <div className={`print-message ${printStatus}`} role="status">{printMessage}</div>}
            {printLabels.length > 0 && (
              <section className="label-results" aria-label="Individual label print status">
                <div className="label-results-heading">
                  <strong>Individual labels</strong>
                  <span>{printLabels.filter((label) => label.status === "sent").length}/{printLabels.length} sent</span>
                </div>
                <div className="label-result-list">
                  {printLabels.map((label) => (
                    <article className={`label-result ${label.status}`} key={label.uuid}>
                      <div>
                        <strong>{label.name}</strong>
                        <code>{label.uuid}</code>
                        {label.error && <small>{label.error}</small>}
                      </div>
                      <span className="label-status">{label.status === "sent" ? "Sent" : label.status === "printing" ? "Printing…" : label.status === "failed" ? "Failed" : "Not printed"}</span>
                      <button
                        onClick={() => void runBrotherPrint([label])}
                        disabled={printStatus === "printing"}
                        title={label.status === "sent" ? "Reprint this exact UUID if the physical label did not come out" : "Retry this exact UUID"}
                      >
                        {label.status === "sent" ? "Reprint" : "Retry"}
                      </button>
                    </article>
                  ))}
                </div>
                <p className="label-results-note">“Sent” means Brother accepted the job and reported no error. If a physical label is missing after a paper jam, use Reprint beside that UUID.</p>
              </section>
            )}
            {printLogs.length > 0 && (
              <section className="print-log" aria-label="Brother print log">
                <div className="print-log-heading">
                  <strong>Brother print log</strong>
                  <span>{printLogs.length} events</span>
                </div>
                <ol>
                  {printLogs.map((entry, index) => (
                    <li className={entry.level} key={`${entry.timestamp}-${entry.step}-${index}`}>
                      <time>{entry.timestamp}</time>
                      <strong>{entry.step}</strong>
                      <span>{entry.message}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            <div className="barcode-actions">
              <button
                className="print-button"
                onClick={() => printLabels.length > 0 ? void runBrotherPrint(retryableLabels) : void printWithBrother()}
                disabled={printStatus === "printing" || (printLabels.length > 0 && retryableLabels.length === 0)}
              >
                {printStatus === "printing"
                  ? "Sending to printer…"
                  : printLabels.length === 0
                    ? "Print to Brother QL-820NWB"
                    : retryableLabels.length > 0
                      ? `Retry ${retryableLabels.length} failed/unprinted`
                      : "All labels sent"}
              </button>
              <button className="cancel-button" onClick={closeBarcodeModal} disabled={printStatus === "printing"}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`}><IconCheck size={17} /> Search and quantities cleared</div>
    </main>
  );
}

