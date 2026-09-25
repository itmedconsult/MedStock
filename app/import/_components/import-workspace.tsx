"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { importQuantity, isPacked } from "@/lib/packaging";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconBarcode,
  IconCheck,
  IconPackageImport,
  IconRefresh,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import type { DashboardData, DashboardProduct } from "@/app/dashboard/_lib/dashboard-data";
import { StockWorkflowNav } from "@/app/_components/stock-workflow-nav";
import styles from "../import.module.css";

type Branch = "Thonglor" | "Silom";

type ParsedBarcode = {
  barcode: string;
  sku: string;
  stockGroup: string;
};

type QueueItem = {
  barcode: string;
  sku: string;
  productName: string;
  lot: string;
  expiry: string;
  quantity: number;
  type: "FULL";
  location: Branch;
  unit: string;
  trackMode: string;
  packageUnit?: string;
  unitsPerPack?: number;
};

type ImportResponse = {
  ok?: boolean;
  batchId?: string;
  importedCount?: number;
  error?: string;
};

const BARCODE_PATTERN = /^([A-Z]{2,6}-\d{3})-(\d{6})-([A-Z]\d{4})$/;

function localDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function parseBarcode(rawBarcode: string): ParsedBarcode {
  const barcode = rawBarcode.trim().toUpperCase();
  const match = barcode.match(BARCODE_PATTERN);
  if (!match || Number(match[3].slice(1)) === 0) throw new Error("Invalid barcode format");

  const dateCode = match[2];
  const day = Number(dateCode.slice(0, 2));
  const month = Number(dateCode.slice(2, 4));
  const year = 2000 + Number(dateCode.slice(4, 6));
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error("Invalid barcode date");
  }

  return { barcode, sku: match[1], stockGroup: match[1].split("-")[0] };
}

function queueErrors(item: QueueItem, duplicateCount: number, inventoryIds: Set<string>) {
  const errors: string[] = [];
  let parsed: ParsedBarcode | null = null;
  try { parsed = parseBarcode(item.barcode); } catch { errors.push("INVALID BARCODE"); }
  if (parsed && parsed.sku !== item.sku) errors.push("SKU MISMATCH");
  if (duplicateCount > 1) errors.push("DUPLICATE IN QUEUE");
  if (inventoryIds.has(item.barcode)) errors.push("ALREADY IN INVENTORY");
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) errors.push("INVALID QTY");
  if (item.trackMode === "UNIT" && item.quantity !== 1) errors.push("UNIT QTY MUST BE 1");
  if (isPacked(item) && item.quantity !== item.unitsPerPack) errors.push("QTY MUST MATCH ONE FULL CONTAINER");
  if (item.type !== "FULL") errors.push("TYPE MUST BE FULL");
  return errors;
}

export function ImportWorkspace() {
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<DashboardData | null>(null);
  const [sourceState, setSourceState] = useState<"loading" | "ready" | "error">("loading");
  const [sourceError, setSourceError] = useState("");
  const [branch, setBranch] = useState<Branch>("Thonglor");
  const [receivedDate, setReceivedDate] = useState(localDate);
  const [barcode, setBarcode] = useState("");
  const [lot, setLot] = useState("");
  const [expiry, setExpiry] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [autoAdd, setAutoAdd] = useState(true);
  const [scannedProduct, setScannedProduct] = useState<DashboardProduct | null>(null);
  const [validation, setValidation] = useState("Scan a barcode to begin");
  const [validationType, setValidationType] = useState<"idle" | "ready" | "error">("idle");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchStatus, setBatchStatus] = useState("AUTO ADD ON — READY FOR SCAN");
  const [isImporting, setIsImporting] = useState(false);

  const inventoryIds = useMemo(
    () => new Set((source?.inventory ?? []).flatMap((item) => [item.id.toUpperCase()])),
    [source],
  );
  const duplicateCounts = useMemo(() => queue.reduce<Record<string, number>>((counts, item) => {
    counts[item.barcode] = (counts[item.barcode] ?? 0) + 1;
    return counts;
  }, {}), [queue]);
  const rowErrors = useMemo(() => new Map(queue.map((item) => [
    item.barcode,
    queueErrors(item, duplicateCounts[item.barcode] ?? 0, inventoryIds),
  ])), [duplicateCounts, inventoryIds, queue]);
  const totalQuantity = queue.reduce((sum, item) => sum + (Number.isFinite(item.quantity) ? item.quantity : 0), 0);
  const invalidRows = queue.filter((item) => (rowErrors.get(item.barcode)?.length ?? 0) > 0).length;
  const allSelected = queue.length > 0 && selected.size === queue.length;
  const selectedItems = useMemo(() => queue.filter((item) => selected.has(item.barcode)), [queue, selected]);
  const selectedQuantity = selectedItems.reduce((sum, item) => sum + (Number.isFinite(item.quantity) ? item.quantity : 0), 0);
  const selectedInvalidRows = selectedItems.filter((item) => (rowErrors.get(item.barcode)?.length ?? 0) > 0).length;

  const loadSource = async () => {
    setSourceState("loading");
    setSourceError("");
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const data = await response.json() as DashboardData & { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to load inventory data.");
      setSource(data);
      setSourceState("ready");
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : "Unable to load inventory data.");
      setSourceState("error");
    }
  };

  useEffect(() => { void loadSource(); }, []);

  const clearInput = () => {
    setBarcode("");
    setLot("");
    setExpiry("");
    setQuantity(1);
    setScannedProduct(null);
    setValidation("Scan a barcode to begin");
    setValidationType("idle");
    requestAnimationFrame(() => barcodeRef.current?.focus());
  };

  const findProduct = (rawBarcode: string) => {
    if (!source) throw new Error("Inventory data is still loading");
    const parsed = parseBarcode(rawBarcode);
    const product = source.products.find((item) => item.sku.toUpperCase() === parsed.sku);
    if (!product) throw new Error(`Unknown or inactive SKU: ${parsed.sku}`);
    if (inventoryIds.has(parsed.barcode)) throw new Error("Barcode already exists in Inventory");
    if (queue.some((item) => item.barcode === parsed.barcode)) throw new Error("Barcode already exists in the queue");
    return { parsed, product };
  };

  const addQueueItem = (parsed: ParsedBarcode, product: DashboardProduct, nextLot: string, nextExpiry: string, nextQuantity: number) => {
    if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) throw new Error("Qty must be greater than 0");
    if (product.trackMode.toUpperCase() === "UNIT" && nextQuantity !== 1) throw new Error("UNIT Qty must be 1");

    const item: QueueItem = {
      barcode: parsed.barcode,
      sku: product.sku.toUpperCase(),
      productName: product.name,
      lot: nextLot.trim(),
      expiry: nextExpiry,
      quantity: nextQuantity,
      type: "FULL",
      location: branch,
      unit: product.unit,
      trackMode: product.trackMode.toUpperCase(),
      packageUnit: product.packageUnit,
      unitsPerPack: product.unitsPerPack,
    };
    setQueue((current) => [...current, item]);
    setSelected((current) => new Set(current).add(item.barcode));
    setBatchStatus(`QUEUED: ${parsed.barcode} — ${autoAdd ? "AUTO ADD ON" : "MANUAL ADD"} / READY FOR IMPORT`);
    clearInput();
  };

  const handleScan = (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = findProduct(barcode);
      setBarcode(result.parsed.barcode);
      setScannedProduct(result.product);
      setQuantity(importQuantity(result.product));
      setValidation("READY TO ADD");
      setValidationType("ready");
      if (autoAdd) addQueueItem(result.parsed, result.product, "", "", importQuantity(result.product));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to validate barcode";
      setScannedProduct(null);
      setValidation(message);
      setValidationType("error");
      if (message.includes("already exists")) {
        setBarcode("");
        requestAnimationFrame(() => barcodeRef.current?.focus());
      }
    }
  };

  const handleManualAdd = () => {
    try {
      const result = findProduct(barcode);
      addQueueItem(result.parsed, result.product, lot, expiry, quantity);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to add barcode";
      setValidation(message);
      setValidationType("error");
      if (message.includes("already exists")) {
        setBarcode("");
        setScannedProduct(null);
        requestAnimationFrame(() => barcodeRef.current?.focus());
      }
    }
  };

  const updateQueueItem = (itemBarcode: string, patch: Partial<QueueItem>) => {
    setQueue((current) => current.map((item) => item.barcode === itemBarcode ? { ...item, ...patch } : item));
    setBatchStatus("QUEUE CHANGED — IMPORT WILL RECHECK");
  };

  const changeBranch = (nextBranch: Branch) => {
    setBranch(nextBranch);
    setQueue((current) => current.map((item) => ({ ...item, location: nextBranch })));
    if (queue.length) setBatchStatus("QUEUE CHANGED — IMPORT WILL RECHECK");
    requestAnimationFrame(() => barcodeRef.current?.focus());
  };

  const deleteSelected = () => {
    if (!selected.size) {
      setBatchStatus("NO QUEUE ROWS SELECTED");
      return;
    }
    const removed = selected.size;
    setQueue((current) => current.filter((item) => !selected.has(item.barcode)));
    setSelected(new Set());
    setBatchStatus(`REMOVED ${removed} ROW(S) — IMPORT WILL RECHECK`);
  };

  const clearAll = () => {
    setQueue([]);
    setSelected(new Set());
    setAutoAdd(true);
    setBatchStatus("CANCELLED — AUTO ADD ON / READY FOR NEW SCAN");
    clearInput();
  };

  const importBatch = async () => {
    if (!selectedItems.length) {
      setBatchStatus(queue.length ? "BLOCK: SELECT AT LEAST ONE ROW TO IMPORT" : "BLOCK: QUEUE IS EMPTY");
      return;
    }
    if (!receivedDate) {
      setBatchStatus("BLOCK: SELECT A RECEIVED DATE");
      return;
    }
    if (selectedInvalidRows) {
      setBatchStatus(`BLOCK: FIX ${selectedInvalidRows} INVALID SELECTED ROW(S)`);
      return;
    }

    setIsImporting(true);
    setBatchStatus(`VALIDATING ${selectedItems.length} SELECTED BARCODE(S), TOTAL QTY ${selectedQuantity}`);
    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, receivedDate, items: selectedItems }),
      });
      const result = await response.json() as ImportResponse;
      if (!response.ok || !result.ok) throw new Error(result.error || "Import failed.");
      const importedBarcodes = new Set(selectedItems.map((item) => item.barcode));
      setQueue((current) => current.filter((item) => !importedBarcodes.has(item.barcode)));
      setSelected(new Set());
      clearInput();
      setBatchStatus(`COMPLETED: ${result.batchId || "IMPORT"} — ${result.importedCount ?? selectedItems.length} SELECTED BARCODE(S) IMPORTED`);
      await loadSource();
    } catch (error) {
      setBatchStatus(`ERROR: ${error instanceof Error ? error.message : "Import failed"}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <main className={styles.importPage}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/dashboard"><span>MS</span><div><strong>MedStock</strong><small>Stock import scanner</small></div></Link>
        <div className={styles.headerStatus}><span className={sourceState === "ready" ? styles.onlineDot : styles.offlineDot} />{sourceState === "ready" ? "Inventory connected" : sourceState === "loading" ? "Connecting…" : "Connection issue"}</div>
        <Link className={styles.backLink} href="/dashboard"><IconArrowLeft size={16} /> Back to dashboard</Link>
      </header>
      <StockWorkflowNav active="import" />

      <div className={styles.content}>
        <section className={styles.titleRow}>
          <div><p>Stock intake</p><h1>Import scanner</h1><span>Scan printed barcodes, review the batch, then import into Inventory and Log Data.</span></div>
          <div className={styles.batchSummary}><small>Current queue</small><strong>{queue.length}</strong><span>{totalQuantity} total qty</span></div>
        </section>

        {sourceState === "error" && <section className={styles.sourceError}><IconAlertCircle size={19} /><div><strong>Inventory data unavailable</strong><span>{sourceError}</span></div><button type="button" onClick={() => void loadSource()}><IconRefresh size={15} /> Retry</button></section>}

        <section className={styles.workspace}>
          <div className={styles.scannerPanel}>
            <div className={styles.panelHeading}><div><span>Step 1</span><h2>Scan or enter barcode</h2></div><IconBarcode size={24} /></div>

            <form className={styles.scanForm} onSubmit={handleScan}>
              <label>Barcode / Unique ID</label>
              <div className={styles.scanInput}><IconBarcode size={19} /><input ref={barcodeRef} value={barcode} onChange={(event) => { setBarcode(event.target.value.toUpperCase()); setScannedProduct(null); setValidation("Press Enter to validate"); setValidationType("idle"); }} placeholder="AES-001-220926-A0001" autoComplete="off" disabled={sourceState !== "ready"} /><button type="submit" disabled={!barcode.trim() || sourceState !== "ready"}>Scan</button></div>
            </form>

            <div className={styles.formGrid}>
              <label><span>Current branch</span><select value={branch} onChange={(event) => changeBranch(event.target.value as Branch)}><option>Thonglor</option><option>Silom</option></select></label>
              <label><span>Received date</span><input type="date" value={receivedDate} onChange={(event) => { setReceivedDate(event.target.value); if (queue.length) setBatchStatus("QUEUE CHANGED — IMPORT WILL RECHECK"); }} /></label>
              <label className={styles.fullField}><span>Scanned product</span><input value={scannedProduct?.name ?? ""} placeholder="Waiting for barcode" readOnly /></label>
              <label><span>SKU</span><input value={scannedProduct?.sku ?? ""} placeholder="—" readOnly /></label>
              <label><span>Track mode</span><input value={scannedProduct?.trackMode ?? ""} placeholder="—" readOnly /></label>
              <label><span>Lot <em>Optional</em></span><input value={lot} onChange={(event) => setLot(event.target.value)} placeholder="Lot number" disabled={!scannedProduct} /></label>
              <label><span>Expiry date <em>Optional</em></span><input type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} disabled={!scannedProduct} /></label>
              <label><span>Quantity {scannedProduct ? `(${scannedProduct.unit})` : ""}</span><input type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} disabled={!scannedProduct || isPacked(scannedProduct) || scannedProduct.trackMode.toUpperCase() === "UNIT"} /></label>
            </div>

            <div className={`${styles.validation} ${styles[validationType]}`}><span>{validationType === "ready" ? <IconCheck size={17} /> : validationType === "error" ? <IconAlertCircle size={17} /> : <IconBarcode size={17} />}</span><div><small>Validation result</small><strong>{validation}</strong></div></div>

            <label className={styles.autoAdd}><input type="checkbox" checked={autoAdd} onChange={(event) => { setAutoAdd(event.target.checked); setBatchStatus(event.target.checked ? "AUTO ADD ON — READY FOR SCAN" : "MANUAL MODE — SCAN AND REVIEW DETAILS"); requestAnimationFrame(() => barcodeRef.current?.focus()); }} /><span><b>Auto add</b><small>Each scan adds one barcode. Container contents are filled from Product List.</small></span></label>

            <button className={styles.addButton} type="button" onClick={handleManualAdd} disabled={!scannedProduct || autoAdd}><IconPackageImport size={18} /> Add to queue</button>

            <div className={styles.safeWorkflow}><strong>Safe workflow</strong><ol><li>Select one branch for the batch.</li><li>Auto Add is on by default; each valid scan is queued and selected.</li><li>Turn Auto Add off to edit lot, expiry, or bulk quantity before adding.</li><li>Only checked rows will be imported.</li></ol></div>
          </div>

          <div className={styles.queuePanel}>
            <div className={styles.queueHeading}><div><span>Pending import queue</span><h2>Review scanned stock</h2><p>Every row is validated again before Inventory and Log Data are updated.</p></div><div className={styles.queueActions}><button type="button" className={styles.deleteButton} onClick={deleteSelected} disabled={!queue.length}><IconTrash size={15} /> Delete selected</button><button type="button" className={styles.clearButton} onClick={clearAll} disabled={!queue.length && !barcode}><IconX size={15} /> Cancel / clear</button></div></div>

            <div className={styles.tableScroll}>
              <table>
                <thead><tr><th><input aria-label="Select all rows" type="checkbox" checked={allSelected} onChange={(event) => setSelected(event.target.checked ? new Set(queue.map((item) => item.barcode)) : new Set())} /></th><th>Barcode</th><th>Product</th><th>Lot</th><th>Expiry</th><th>Qty</th><th>Type</th><th>Location</th><th>Validation</th></tr></thead>
                <tbody>
                  {queue.map((item) => {
                    const errors = rowErrors.get(item.barcode) ?? [];
                    return <tr key={item.barcode} className={errors.length ? styles.invalidRow : ""}><td><input aria-label={`Select ${item.barcode}`} type="checkbox" checked={selected.has(item.barcode)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(item.barcode); else next.delete(item.barcode); return next; })} /></td><td><code>{item.barcode}</code><small>{item.sku}</small></td><td><strong>{item.productName}</strong><small>{item.trackMode} · {item.unit}{isPacked(item) ? ` · 1 ${item.packageUnit} = ${item.unitsPerPack} ${item.unit}` : ""}</small></td><td><input value={item.lot} onChange={(event) => updateQueueItem(item.barcode, { lot: event.target.value })} placeholder="Optional" /></td><td><input type="date" value={item.expiry} onChange={(event) => updateQueueItem(item.barcode, { expiry: event.target.value })} /></td><td><input className={styles.qtyInput} type="number" min="0.001" step="0.001" value={item.quantity} disabled={isPacked(item) || item.trackMode === "UNIT"} onChange={(event) => updateQueueItem(item.barcode, { quantity: Number(event.target.value) })} /></td><td><span className={styles.typeBadge}>FULL</span></td><td>{item.location}</td><td><span className={errors.length ? styles.blockedBadge : styles.readyBadge}>{errors.length ? `BLOCK: ${errors.join(" / ")}` : "READY"}</span></td></tr>;
                  })}
                </tbody>
              </table>
              {!queue.length && <div className={styles.emptyQueue}><IconBarcode size={30} /><strong>No barcodes queued</strong><span>Scan a barcode on the left to start this import batch.</span></div>}
            </div>

            <div className={styles.batchBar}><div><small>Batch status</small><strong>{batchStatus}</strong></div><button type="button" onClick={() => void importBatch()} disabled={!selectedItems.length || isImporting || sourceState !== "ready"}>{isImporting ? <IconRefresh className={styles.spinning} size={18} /> : <IconPackageImport size={18} />}{isImporting ? "Importing…" : `Import selected (${selectedItems.length})`}</button></div>
          </div>
        </section>
      </div>
    </main>
  );
}
