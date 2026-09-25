"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { isPacked } from "@/lib/packaging";
import Barcode from "react-barcode";
import {
  BrotherLabelStatus,
  BrotherPrintLabel,
  BrotherPrintLog,
  brotherPrinterConfig,
  printLabelsToBrother,
} from "@/lib/brother-print";
import {
  fetchPrintBatches,
  flushPrintAttemptOutbox,
  labelReprintCount,
  latestLabelStatus,
  recordCloudPrintAttempt,
  reservePrintBatch,
  type OperationalPrintBranch,
  type PrintAttemptType,
  type PrintBatch,
  type PrintBranch,
  type ReservePrintProduct,
} from "@/lib/print-history";
import {
  IconBarcode,
  IconCalendar,
  IconCheck,
  IconChevronDown,
  IconPackage,
  IconPhotoEdit,
  IconPill,
  IconHistory,
  IconMapPin,
  IconPrinter,
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
  packageUnit?: string;
  unitsPerPack?: number;
  image?: string;
};

type InventoryApiResponse = {
  products?: Array<Pick<Product, "name" | "sku" | "date" | "category" | "unit" | "image" | "packageUnit" | "unitsPerPack">>;
  updatedAt?: string;
  error?: string;
};

type PrintLabelState = BrotherPrintLabel & {
  status: BrotherLabelStatus;
  error?: string;
};

type PrintRunContext = {
  batchId: string;
  attemptType: PrintAttemptType;
  target: "create" | "reprint";
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
  const [branch, setBranch] = useState<OperationalPrintBranch>("Thonglor");
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [isReprintModalOpen, setIsReprintModalOpen] = useState(false);
  const [printStatus, setPrintStatus] = useState<"idle" | "printing" | "success" | "error">("idle");
  const [printMessage, setPrintMessage] = useState("");
  const [printLogs, setPrintLogs] = useState<BrotherPrintLog[]>([]);
  const [printLabels, setPrintLabels] = useState<PrintLabelState[]>([]);
  const [activeBatchId, setActiveBatchId] = useState("");
  const [initialPrintStarted, setInitialPrintStarted] = useState(false);
  const [pendingPrintProducts, setPendingPrintProducts] = useState<ReservePrintProduct[]>([]);
  const [pendingPrintBranch, setPendingPrintBranch] = useState<OperationalPrintBranch>("Thonglor");
  const pendingPrintRequestId = useRef("");
  const [printBatches, setPrintBatches] = useState<PrintBatch[]>([]);
  const [historyBranch, setHistoryBranch] = useState<PrintBranch>("Thonglor");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [selectedReprintUuids, setSelectedReprintUuids] = useState<Set<string>>(new Set());
  const [reprintSearch, setReprintSearch] = useState("");
  const [reprintLabels, setReprintLabels] = useState<PrintLabelState[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
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

  useEffect(() => {
    void flushPrintAttemptOutbox();
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

  const pendingLabelCount = useMemo(
    () => pendingPrintProducts.reduce((total, product) => total + product.quantity, 0),
    [pendingPrintProducts],
  );

  const branchBatches = useMemo(
    () => printBatches.filter((batch) => batch.branch === historyBranch),
    [historyBranch, printBatches],
  );

  const selectedBatch = useMemo(
    () => printBatches.find((batch) => batch.id === selectedBatchId) ?? null,
    [printBatches, selectedBatchId],
  );

  const visibleReprintLabels = useMemo(() => {
    if (!selectedBatch) return [];
    const term = reprintSearch.trim().toLowerCase();
    return selectedBatch.labels.filter((label) => !term
      || label.uuid.toLowerCase().includes(term)
      || label.sku.toLowerCase().includes(term)
      || label.name.toLowerCase().includes(term));
  }, [reprintSearch, selectedBatch]);

  const selectedReprintLabels = useMemo(
    () => selectedBatch?.labels.filter((label) => selectedReprintUuids.has(label.uuid)) ?? [],
    [selectedBatch, selectedReprintUuids],
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
    setActiveBatchId("");
    setInitialPrintStarted(false);
    setPendingPrintProducts([]);
    pendingPrintRequestId.current = "";
  };

  const openBarcodeModal = () => {
    if (!barcodeProducts.length) return;
    const productsToPrint = barcodeProducts.map(({ sku, date: stockDate, quantity }) => ({
      sku,
      date: stockDate,
      quantity,
    }));
    setIsBarcodeModalOpen(true);
    setPrintStatus("idle");
    setPrintMessage("Review the label count, then click Print. No barcode has been issued yet.");
    setPrintLogs([]);
    setPrintLabels([]);
    setActiveBatchId("");
    setInitialPrintStarted(false);
    setPendingPrintProducts(productsToPrint);
    setPendingPrintBranch(branch);
    pendingPrintRequestId.current = crypto.randomUUID();
  };

  const refreshPrintHistory = async () => {
    const batches = await fetchPrintBatches();
    setPrintBatches(batches);
    return batches;
  };

  const openReprintModal = async () => {
    setHistoryLoading(true);
    setHistoryError("");
    setHistoryBranch(branch);
    setSelectedBatchId("");
    setSelectedReprintUuids(new Set());
    setReprintSearch("");
    setReprintLabels([]);
    setPrintStatus("idle");
    setPrintMessage("");
    setPrintLogs([]);
    setIsReprintModalOpen(true);
    try {
      await flushPrintAttemptOutbox();
      const batches = await refreshPrintHistory();
      const firstBatch = batches.find((batch) => batch.branch === branch);
      setSelectedBatchId(firstBatch?.id ?? "");
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Unable to load print history from Google Sheets.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeReprintModal = () => {
    if (printStatus === "printing") return;
    setIsReprintModalOpen(false);
    setSelectedReprintUuids(new Set());
    setReprintLabels([]);
    setPrintStatus("idle");
    setPrintMessage("");
    setPrintLogs([]);
    setHistoryError("");
  };

  const changeHistoryBranch = (nextBranch: PrintBranch) => {
    setHistoryBranch(nextBranch);
    const firstBatch = printBatches.find((batch) => batch.branch === nextBranch);
    setSelectedBatchId(firstBatch?.id ?? "");
    setSelectedReprintUuids(new Set());
    setReprintLabels([]);
    setPrintMessage("");
    setPrintStatus("idle");
    setHistoryError("");
  };

  const runBrotherPrint = async (labels: BrotherPrintLabel[], context: PrintRunContext) => {
    if (!labels.length) return;

    setPrintStatus("printing");
    setPrintMessage(`Sending ${labels.length} ${labels.length === 1 ? "label" : "labels"} to Brother QL-820NWB…`);
    setPrintLogs([]);

    const targetUuids = new Set(labels.map((label) => label.uuid));
    const updateTarget = context.target === "create" ? setPrintLabels : setReprintLabels;
    const outcomes = new Map(labels.map((label) => [label.uuid, { uuid: label.uuid, status: "queued" as BrotherLabelStatus }]));
    updateTarget((current) => current.map((label) => targetUuids.has(label.uuid)
      ? { ...label, status: "queued", error: undefined }
      : label));

    try {
      const result = await printLabelsToBrother(
        labels,
        (entry) => setPrintLogs((current) => [...current, entry]),
        (update) => {
          outcomes.set(update.uuid, update);
          updateTarget((current) => current.map((label) => label.uuid === update.uuid
            ? { ...label, status: update.status, error: update.error }
            : label));
        },
      );

      const historyResult = await recordCloudPrintAttempt({
        attemptId: crypto.randomUUID(),
        batchId: context.batchId,
        type: context.attemptType,
        labels: Array.from(outcomes.values()),
      });
      const historyWarning = historyResult.synced
        ? ""
        : ` Print log is queued for Google Sheets sync: ${historyResult.error}`;
      if (historyResult.synced) {
        try { await refreshPrintHistory(); } catch { /* The print log is already safely stored. */ }
      }

      if (result.failed > 0 || result.pending > 0) {
        setPrintStatus("error");
        setPrintMessage(`${result.sent} sent, ${result.failed} failed, ${result.pending} not attempted. Clear the printer error, then retry only failed/unprinted labels.${historyWarning}`);
      } else {
        setPrintStatus("success");
        setPrintMessage(`${result.sent} ${result.sent === 1 ? "label was" : "labels were"} accepted by Brother with no hardware error reported.${historyWarning}`);
      }
    } catch (error) {
      setPrintStatus("error");
      setPrintMessage(error instanceof Error ? error.message : "Unable to print to Brother QL-820NWB.");
    }
  };

  const printWithBrother = async () => {
    if (!pendingPrintProducts.length || !pendingPrintRequestId.current) return;
    setPrintStatus("printing");
    setPrintMessage("Issuing barcode numbers in Google Sheets…");
    setPrintLogs([]);
    try {
      const batch = await reservePrintBatch(pendingPrintBranch, pendingPrintProducts, pendingPrintRequestId.current);
      const labels = batch.labels;
      setActiveBatchId(batch.id);
      setPrintBatches((current) => [batch, ...current.filter((item) => item.id !== batch.id)]);
      setPrintLabels(labels.map((label) => ({ ...label, status: "queued" })));
      setInitialPrintStarted(true);
      await runBrotherPrint(labels, { batchId: batch.id, attemptType: "INITIAL", target: "create" });
    } catch (error) {
      setPrintStatus("error");
      setPrintMessage(error instanceof Error ? error.message : "Unable to issue barcode numbers in Google Sheets.");
    }
  };

  const reprintSelected = async () => {
    if (!selectedBatch || !selectedReprintLabels.length) return;
    setReprintLabels(selectedReprintLabels.map((label) => ({ ...label, status: "queued" })));
    await runBrotherPrint(selectedReprintLabels, { batchId: selectedBatch.id, attemptType: "REPRINT", target: "reprint" });
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
          <label className="branch-control">
            <IconMapPin size={18} />
            <span><small>PRINT BRANCH</small><select value={branch} onChange={(event) => setBranch(event.target.value as OperationalPrintBranch)}><option>Thonglor</option><option>Silom</option></select></span>
            <IconChevronDown size={17} />
          </label>
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
                    <div><small>{isPacked(product) ? `${product.packageUnit === "Box" ? "BOXES" : "BOTTLES"} / BARCODES` : "QUANTITY"}</small><strong>{product.quantity}</strong><span> {isPacked(product) ? product.packageUnit : product.unit}</span>{isPacked(product) && <small>1 {product.packageUnit} = {product.unitsPerPack} {product.unit} · 1 Barcode</small>}</div>
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
        <button className="reprint-history-button" onClick={() => void openReprintModal()}><IconHistory size={20} /> Reprint labels</button>
        <button className="generate-button" onClick={openBarcodeModal} disabled={!barcodeProducts.length}>
          <IconBarcode size={21} /> Generate {barcodeProducts.length === 1 ? "barcode" : "barcodes"}
          {barcodeProducts.length > 0 && <span className="selection-count">{barcodeProducts.length}</span>}
        </button>
        <button className="clear-button" onClick={clearAll}>Clear</button>
      </div>

      {isBarcodeModalOpen && (
        <div className="modal-backdrop" onMouseDown={closeBarcodeModal}>
          <div className="barcode-modal multi-barcode-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="barcode-modal-title">
            <button className="modal-close" onClick={closeBarcodeModal} aria-label="Close generated barcodes" disabled={printStatus === "printing"}><IconX size={20} /></button>
            <div className="success-icon"><IconCheck size={22} /></div>
            <p className="section-kicker">{printLabels.length ? "Barcodes issued" : "Ready to print"}</p>
            <h2 id="barcode-modal-title">{printLabels.length || pendingLabelCount} {(printLabels.length || pendingLabelCount) === 1 ? "label" : "labels"}</h2>
            <p className="barcode-help">{printLabels.length ? "These UUIDs were issued in Google Sheets when printing started and are safe to scan or retry." : "No UUID or BC_Registry row will be created until you click Print to Brother."}</p>
            <div className="batch-context"><span><IconMapPin size={15} /> {pendingPrintBranch}</span>{activeBatchId && <code>{activeBatchId}</code>}</div>
            <div className="printer-chip">
              <span className="printer-dot" />
              <div><strong>{brotherPrinterConfig.model}</strong><small>{brotherPrinterConfig.connection} direct print</small></div>
            </div>
            <div className="barcode-labels">
              {!printLabels.length && pendingPrintProducts.map((item) => {
                const product = products.find((product) => product.sku === item.sku);
                return <article className="barcode-label" key={item.sku}><div className="barcode-label-heading"><div><h3>{product?.name ?? item.sku}</h3><p>{item.sku} · {item.date}</p></div><span>{item.quantity} {item.quantity === 1 ? "label" : "labels"}</span></div></article>;
              })}
              {printLabels.map((label) => {
                const product = products.find((item) => item.sku === label.sku);
                return (
                <article className="barcode-label" key={label.uuid}>
                  <div className="barcode-label-heading">
                    <div>
                      <h3>{label.name}</h3>
                      <p>{label.sku} · {label.date}</p>
                    </div>
                    <span>{product?.category ?? "Product"}</span>
                  </div>
                  <div className="barcode-paper">
                    <Barcode value={label.uuid} format="CODE128" height={58} width={1.1} fontSize={11} background="transparent" />
                  </div>
                </article>
                );
              })}
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
                        onClick={() => activeBatchId && void runBrotherPrint([label], { batchId: activeBatchId, attemptType: label.status === "sent" ? "REPRINT" : "RETRY", target: "create" })}
                        disabled={printStatus === "printing" || !activeBatchId || !initialPrintStarted}
                        title={!initialPrintStarted ? "Print the initial batch first" : label.status === "sent" ? "Reprint this exact UUID if the physical label did not come out" : "Retry this exact UUID"}
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
                onClick={() => initialPrintStarted ? void runBrotherPrint(retryableLabels, { batchId: activeBatchId, attemptType: "RETRY", target: "create" }) : void printWithBrother()}
                disabled={printStatus === "printing" || (!initialPrintStarted && !pendingPrintProducts.length) || (initialPrintStarted && (!activeBatchId || retryableLabels.length === 0))}
              >
                {printStatus === "printing"
                  ? activeBatchId ? "Sending to printer…" : "Issuing barcodes…"
                  : !initialPrintStarted
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

      {isReprintModalOpen && (
        <div className="modal-backdrop" onMouseDown={closeReprintModal}>
          <div className="barcode-modal reprint-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="reprint-modal-title">
            <button className="modal-close" onClick={closeReprintModal} aria-label="Close reprint labels" disabled={printStatus === "printing"}><IconX size={20} /></button>
            <div className="reprint-heading">
              <span className="reprint-icon"><IconHistory size={22} /></span>
              <div><p className="section-kicker">Print history</p><h2 id="reprint-modal-title">Reprint labels</h2><p>Select a branch, print batch, and only the damaged labels you need.</p></div>
            </div>

            <div className="reprint-branch-tabs" role="group" aria-label="Print history branch">
              {(["Thonglor", "Silom", "Legacy"] as PrintBranch[]).map((option) => <button key={option} className={historyBranch === option ? "active" : ""} onClick={() => changeHistoryBranch(option)}><IconMapPin size={15} /> {option}<span>{printBatches.filter((batch) => batch.branch === option).length}</span></button>)}
            </div>

            <div className="reprint-workspace">
              <aside className="batch-list">
                <div className="reprint-section-title"><div><small>PRINT BATCHES</small><strong>{branchBatches.length} {branchBatches.length === 1 ? "batch" : "batches"}</strong></div></div>
                <div className="batch-list-scroll">
                  {branchBatches.map((batch) => {
                    const successfulReprints = batch.attempts.filter((attempt) => attempt.type === "REPRINT").length;
                    return <button key={batch.id} className={selectedBatchId === batch.id ? "active" : ""} onClick={() => { setSelectedBatchId(batch.id); setSelectedReprintUuids(new Set()); setReprintLabels([]); setPrintMessage(""); setPrintStatus("idle"); }}><span><IconPrinter size={17} /></span><div><strong>{batch.id}</strong><small>{new Date(batch.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</small><em>{batch.labels.length} labels · {successfulReprints} reprint jobs</em></div></button>;
                  })}
                  {historyLoading && <div className="empty-batches"><IconHistory size={28} /><strong>Loading Google Sheets</strong><span>Reading barcode batches and print attempts…</span></div>}
                  {!historyLoading && historyError && <div className="empty-batches"><IconHistory size={28} /><strong>Print history unavailable</strong><span>{historyError}</span></div>}
                  {!historyLoading && !historyError && !branchBatches.length && <div className="empty-batches"><IconHistory size={28} /><strong>No print batches</strong><span>{historyBranch === "Legacy" ? "Older batches without a branch will appear here." : `New batches printed for ${historyBranch} will appear here.`}</span></div>}
                </div>
              </aside>

              <section className="reprint-label-panel">
                {selectedBatch ? <>
                  <div className="reprint-toolbar">
                    <div><small>SELECTED BATCH</small><strong>{selectedBatch.id}</strong><span>{selectedBatch.branch} · {selectedBatch.labels.length} labels</span></div>
                    <label className="reprint-search"><IconSearch size={16} /><input value={reprintSearch} onChange={(event) => setReprintSearch(event.target.value)} placeholder="Search barcode, SKU, or product…" /></label>
                  </div>
                  <div className="reprint-select-bar">
                    <label><input type="checkbox" checked={visibleReprintLabels.length > 0 && visibleReprintLabels.every((label) => selectedReprintUuids.has(label.uuid))} onChange={(event) => setSelectedReprintUuids((current) => { const next = new Set(current); visibleReprintLabels.forEach((label) => event.target.checked ? next.add(label.uuid) : next.delete(label.uuid)); return next; })} /> Select all shown</label>
                    <span>{selectedReprintUuids.size} selected</span>
                  </div>
                  <div className="reprint-label-list">
                    {visibleReprintLabels.map((label) => {
                      const latest = latestLabelStatus(selectedBatch, label.uuid);
                      const count = labelReprintCount(selectedBatch, label.uuid);
                      return <label className={selectedReprintUuids.has(label.uuid) ? "selected" : ""} key={label.uuid}><input type="checkbox" checked={selectedReprintUuids.has(label.uuid)} onChange={(event) => setSelectedReprintUuids((current) => { const next = new Set(current); if (event.target.checked) next.add(label.uuid); else next.delete(label.uuid); return next; })} /><div><strong>{label.name}</strong><code>{label.uuid}</code><small>{label.sku} · Reprinted {count} {count === 1 ? "time" : "times"}</small></div><span className={`history-status ${latest?.status ?? "queued"}`}>{latest?.status === "sent" ? "Last sent" : latest?.status === "failed" ? "Last failed" : "Not sent"}</span></label>;
                    })}
                    {!visibleReprintLabels.length && <div className="empty-batches"><IconSearch size={28} /><strong>No labels found</strong><span>Try another barcode, SKU, or product name.</span></div>}
                  </div>
                </> : <div className="reprint-empty-detail"><IconPrinter size={35} /><strong>Select a print batch</strong><span>Choose a batch from {historyBranch} to see its labels.</span></div>}
              </section>
            </div>

            {printMessage && <div className={`print-message ${printStatus}`} role="status">{printMessage}</div>}
            {reprintLabels.length > 0 && <section className="label-results" aria-label="Reprint label status"><div className="label-results-heading"><strong>Reprint results</strong><span>{reprintLabels.filter((label) => label.status === "sent").length}/{reprintLabels.length} sent</span></div><div className="label-result-list">{reprintLabels.map((label) => <article className={`label-result ${label.status}`} key={label.uuid}><div><strong>{label.name}</strong><code>{label.uuid}</code>{label.error && <small>{label.error}</small>}</div><span className="label-status">{label.status === "sent" ? "Sent" : label.status === "printing" ? "Printing…" : label.status === "failed" ? "Failed" : "Pending"}</span></article>)}</div></section>}
            {printLogs.length > 0 && <section className="print-log" aria-label="Brother reprint log"><div className="print-log-heading"><strong>Brother reprint log</strong><span>{printLogs.length} events</span></div><ol>{printLogs.map((entry, index) => <li className={entry.level} key={`${entry.timestamp}-${entry.step}-${index}`}><time>{entry.timestamp}</time><strong>{entry.step}</strong><span>{entry.message}</span></li>)}</ol></section>}

            <div className="reprint-actions"><div><strong>{selectedReprintUuids.size} labels selected</strong><span>Original UUIDs will be reused. No inventory or running numbers will change.</span></div><button className="print-button" onClick={() => void reprintSelected()} disabled={!selectedReprintLabels.length || printStatus === "printing"}>{printStatus === "printing" ? "Sending to printer…" : `Reprint ${selectedReprintLabels.length || "selected"} ${selectedReprintLabels.length === 1 ? "label" : "labels"}`}</button><button className="cancel-button" onClick={closeReprintModal} disabled={printStatus === "printing"}>Close</button></div>
          </div>
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`}><IconCheck size={17} /> Search and quantities cleared</div>
    </main>
  );
}

