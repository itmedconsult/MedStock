"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { isPacked, isDiscreteUnit } from "@/lib/packaging";
import { IconAlertCircle, IconArrowLeft, IconBarcode, IconCheck, IconClipboardCheck, IconRefresh, IconScissors, IconTrash, IconX } from "@tabler/icons-react";
import type { DashboardData, InventoryItem } from "@/app/dashboard/_lib/dashboard-data";
import { StockWorkflowNav } from "./stock-workflow-nav";
import styles from "../import/import.module.css";

type Operation = "check" | "cut";
type Branch = "Thonglor" | "Silom";
type StockType = "FULL" | "OPEN";
type CutReason = "SALE" | "USE";
type CutMode = "ALL" | "PARTIAL";

type QueueItem = {
  id: string;
  barcode: string;
  sku: string;
  productName: string;
  branch: string;
  typeBefore: string;
  quantityBefore: number;
  unit: string;
  trackMode: string;
  packageUnit?: string;
  unitsPerPack?: number;
  statusBefore: string;
  note: string;
  actualType: StockType;
  actualQuantity: number;
  cutReason: CutReason;
  cutMode: CutMode;
  cutQuantity: number;
};

type OperationResponse = { ok?: boolean; batchId?: string; processedCount?: number; error?: string };

const roundQuantity = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

function checkResult(item: QueueItem) {
  const quantity = Number(item.actualQuantity);
  const errors: string[] = [];
  if (!Number.isFinite(quantity) || quantity < 0 || Math.abs(quantity * 1_000_000 - Math.round(quantity * 1_000_000)) > .000001) errors.push("INVALID ACTUAL QTY");
  if (item.trackMode === "UNIT" && quantity !== 0 && quantity !== 1) errors.push("UNIT QTY MUST BE 0 OR 1");
  if (!(["FULL", "OPEN"] as string[]).includes(item.actualType)) errors.push("CHOOSE FULL OR OPEN");
  if (isPacked(item) && (!Number.isInteger(quantity) || quantity > Number(item.unitsPerPack))) errors.push("INVALID BOX CONTENT COUNT");
  if (isPacked(item) && quantity > 0 && item.actualType === "FULL" && quantity !== item.unitsPerPack) errors.push("PARTIAL BOX MUST BE OPEN");
  const statusAfter = quantity > 0 ? "IN STOCK" : item.statusBefore === "SOLD" ? "SOLD" : "OUT OF STOCK";
  if ((quantity !== item.quantityBefore || item.actualType !== item.typeBefore || statusAfter !== item.statusBefore) && !item.note.trim()) errors.push("REASON REQUIRED FOR CHANGE");
  return { errors, quantityAfter: quantity, typeAfter: item.actualType, statusAfter, difference: roundQuantity(quantity - item.quantityBefore) };
}

function cutResult(item: QueueItem) {
  const errors: string[] = [];
  if (item.statusBefore !== "IN STOCK" || !Number.isFinite(item.quantityBefore) || item.quantityBefore <= 0) errors.push("ITEM NOT AVAILABLE");
  if (!(["FULL", "OPEN"] as string[]).includes(item.typeBefore)) errors.push("INVALID STOCK TYPE");
  if (!(["UNIT", "BULK"] as string[]).includes(item.trackMode)) errors.push("UNKNOWN TRACK MODE");
  if (!(["SALE", "USE"] as string[]).includes(item.cutReason)) errors.push("CHOOSE SALE OR USE");
  const quantity = item.cutMode === "ALL" ? item.quantityBefore : Number(item.cutQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0) errors.push("INVALID CUT QTY");
  if (isDiscreteUnit(item.unit) && !Number.isInteger(quantity)) errors.push("CUT WHOLE BOTTLES / SYRINGES ONLY");
  if (quantity > item.quantityBefore) errors.push("INSUFFICIENT QTY");
  if (item.trackMode === "UNIT" && (item.cutMode !== "ALL" || item.quantityBefore !== 1 || quantity !== 1)) errors.push("UNIT REQUIRES ALL");
  const quantityAfter = roundQuantity(item.quantityBefore - quantity);
  const typeAfter = item.cutMode === "PARTIAL" ? "OPEN" : item.typeBefore;
  const statusAfter = quantityAfter > 0 ? "IN STOCK" : item.cutReason === "SALE" && item.cutMode === "ALL" ? "SOLD" : "OUT OF STOCK";
  return { errors, quantity, quantityAfter, typeAfter, statusAfter };
}

function stockQueueErrors(items: QueueItem[], inventory: InventoryItem[], branch: Branch, isCheck: boolean) {
  const itemResults = new Map(items.map((item) => [item.id, isCheck ? checkResult(item) : cutResult(item)]));
  const result = new Map<string, string[]>();
  const queuedIds = new Set<string>();
  items.forEach((item) => {
    const errors = [...(itemResults.get(item.id)?.errors ?? [])];
    if (queuedIds.has(item.id)) errors.push("DUPLICATE BARCODE");
    queuedIds.add(item.id);
    if (item.branch !== branch) errors.push(`WRONG BRANCH: ${item.branch}`);
    result.set(item.id, errors);
  });

  const finalOpen = new Map<string, string[]>();
  inventory.forEach((inventoryItem) => {
    const queued = items.find((item) => item.id === inventoryItem.id);
    const calculated = queued ? itemResults.get(queued.id) : null;
    const quantity = calculated ? calculated.quantityAfter : inventoryItem.quantity;
    const type = calculated ? calculated.typeAfter : inventoryItem.containerType;
    if (quantity > 0 && type === "OPEN") {
      const key = `${inventoryItem.sku}|${inventoryItem.location}`;
      finalOpen.set(key, [...(finalOpen.get(key) ?? []), inventoryItem.id]);
    }
  });
  items.forEach((item) => {
    const key = `${item.sku}|${item.branch}`;
    const openIds = finalOpen.get(key) ?? [];
    if (openIds.length > 1) result.set(item.id, [...(result.get(item.id) ?? []), `ONLY ONE OPEN: ${openIds.join(", ")}`]);
    if (!isCheck && item.typeBefore === "FULL" && item.cutMode === "PARTIAL") {
      const otherOpen = inventory.filter((inventoryItem) => inventoryItem.id !== item.id && inventoryItem.sku === item.sku && inventoryItem.location === item.branch && inventoryItem.containerType === "OPEN" && (itemResults.get(inventoryItem.id)?.quantityAfter ?? inventoryItem.quantity) > 0);
      if (otherOpen.length) result.set(item.id, [...(result.get(item.id) ?? []), `USE EXISTING OPEN FIRST: ${otherOpen.map((open) => open.id).join(", ")}`]);
    }
  });
  return result;
}

export function StockOperationWorkspace({ operation }: { operation: Operation }) {
  const isCheck = operation === "check";
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<DashboardData | null>(null);
  const [sourceState, setSourceState] = useState<"loading" | "ready" | "error">("loading");
  const [sourceError, setSourceError] = useState("");
  const [branch, setBranch] = useState<Branch>("Thonglor");
  const [barcode, setBarcode] = useState("");
  const [scanned, setScanned] = useState<InventoryItem | null>(null);
  const [note, setNote] = useState("");
  const [actualType, setActualType] = useState<StockType>("FULL");
  const [actualQuantity, setActualQuantity] = useState(0);
  const [cutReason, setCutReason] = useState<CutReason>("SALE");
  const [cutMode, setCutMode] = useState<CutMode>("PARTIAL");
  const [cutQuantity, setCutQuantity] = useState(1);
  const [autoAdd, setAutoAdd] = useState(true);
  const [validation, setValidation] = useState("Scan a barcode to begin");
  const [validationType, setValidationType] = useState<"idle" | "ready" | "error">("idle");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchStatus, setBatchStatus] = useState("AUTO ADD ON — READY TO SCAN");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadSource = async () => {
    setSourceState("loading"); setSourceError("");
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const data = await response.json() as DashboardData & { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to load inventory data.");
      setSource(data); setSourceState("ready");
    } catch (error) { setSourceError(error instanceof Error ? error.message : "Unable to load inventory data."); setSourceState("error"); }
  };
  useEffect(() => { void loadSource(); }, []);

  const derived = useMemo(() => new Map(queue.map((item) => [item.id, isCheck ? checkResult(item) : cutResult(item)])), [isCheck, queue]);
  const rowErrors = useMemo(() => stockQueueErrors(queue, source?.inventory ?? [], branch, isCheck), [branch, isCheck, queue, source]);

  const invalidRows = queue.filter((item) => (rowErrors.get(item.id)?.length ?? 0) > 0).length;
  const allSelected = queue.length > 0 && selected.size === queue.length;
  const selectedItems = useMemo(() => queue.filter((item) => selected.has(item.id)), [queue, selected]);
  const selectedRowErrors = useMemo(() => stockQueueErrors(selectedItems, source?.inventory ?? [], branch, isCheck), [branch, isCheck, selectedItems, source]);
  const selectedInvalidRows = selectedItems.filter((item) => (selectedRowErrors.get(item.id)?.length ?? 0) > 0).length;

  const clearInput = () => {
    setBarcode(""); setScanned(null); setNote(""); setValidation("Scan a barcode to begin"); setValidationType("idle");
    requestAnimationFrame(() => barcodeRef.current?.focus());
  };

  const findItem = (raw: string) => {
    if (!source) throw new Error("Inventory data is still loading");
    const key = raw.trim().toUpperCase();
    const matches = source.inventory.filter((item) => item.id.toUpperCase() === key);
    if (matches.length !== 1) throw new Error(matches.length ? `Duplicate barcode in Inventory: ${key}` : `Barcode not found: ${key}`);
    const item = matches[0];
    if (queue.some((queued) => queued.id === item.id)) throw new Error("Barcode already exists in the queue");
    if (item.location !== branch) throw new Error(`Wrong branch: item is at ${item.location}`);
    if (!(["UNIT", "BULK"] as string[]).includes(item.trackMode)) throw new Error("Unknown Track Mode");
    if (!isCheck && (item.status !== "IN STOCK" || item.quantity <= 0)) throw new Error("Item is not available in stock");
    if (!(["FULL", "OPEN"] as string[]).includes(item.containerType)) throw new Error("Stock Type must be FULL or OPEN");
    return item;
  };

  const queueItem = (item: InventoryItem, useDefaults = false) => {
    const next: QueueItem = {
      id: item.id, barcode: item.id, sku: item.sku, productName: item.productName, branch: item.location,
      typeBefore: item.containerType, quantityBefore: item.quantity, unit: item.unit, trackMode: item.trackMode, packageUnit: item.packageUnit, unitsPerPack: item.unitsPerPack, statusBefore: item.status,
      note: useDefaults ? "" : note, actualType: useDefaults ? item.containerType as StockType : actualType,
      actualQuantity: useDefaults ? item.quantity : actualQuantity, cutReason, cutMode: item.trackMode === "UNIT" ? "ALL" : useDefaults ? "PARTIAL" : cutMode,
      cutQuantity: item.trackMode === "UNIT" ? item.quantity : useDefaults ? 1 : cutMode === "ALL" ? item.quantity : cutQuantity,
    };
    const calculation = isCheck ? checkResult(next) : cutResult(next);
    if (calculation.errors.length) throw new Error(calculation.errors.join(" / "));
    setQueue((current) => [...current, next]); setSelected((current) => new Set(current).add(item.id)); setBatchStatus(`QUEUED: ${item.id} — REVIEW BEFORE ${isCheck ? "CONFIRM CHECK" : "CUT STOCK"}`); clearInput();
  };

  const handleScan = (event: FormEvent) => {
    event.preventDefault();
    try {
      const item = findItem(barcode); setBarcode(item.id); setScanned(item); setActualType(item.containerType as StockType); setActualQuantity(item.quantity);
      setCutMode(item.trackMode === "UNIT" ? "ALL" : "PARTIAL"); setCutQuantity(item.trackMode === "UNIT" ? item.quantity : 1);
      setValidation(`READY TO QUEUE — final check on ${isCheck ? "CONFIRM CHECK" : "CUT STOCK"}`); setValidationType("ready");
      if (autoAdd) queueItem(item, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to validate barcode";
      setScanned(null); setValidation(message); setValidationType("error");
      if (message.includes("already exists") || message.startsWith("Duplicate barcode")) {
        setBarcode("");
        requestAnimationFrame(() => barcodeRef.current?.focus());
      }
    }
  };

  const addCurrent = () => {
    if (!scanned) return;
    try { queueItem(scanned); } catch (error) { setValidation(error instanceof Error ? error.message : "Unable to add item"); setValidationType("error"); }
  };
  const updateQueue = (id: string, patch: Partial<QueueItem>) => { setQueue((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item)); setBatchStatus("QUEUE CHANGED — FINAL VALIDATION REQUIRED"); };
  const deleteSelected = () => { if (!selected.size) { setBatchStatus("SELECT QUEUE ROWS FIRST"); return; } const count = selected.size; setQueue((current) => current.filter((item) => !selected.has(item.id))); setSelected(new Set()); setBatchStatus(`REMOVED ${count} QUEUED ITEM(S)`); };
  const clearAll = () => { setQueue([]); setSelected(new Set()); setAutoAdd(true); setBatchStatus("CANCELLED — AUTO ADD ON / READY FOR NEW SCAN"); clearInput(); };

  const submitBatch = async () => {
    if (!selectedItems.length) { setBatchStatus(queue.length ? "BLOCK: SELECT AT LEAST ONE ROW" : "BLOCK: QUEUE IS EMPTY"); return; }
    if (selectedInvalidRows) { setBatchStatus(`BLOCK: FIX ${selectedInvalidRows} INVALID SELECTED ROW(S)`); return; }
    setIsSubmitting(true); setBatchStatus(`VALIDATING ${selectedItems.length} SELECTED ITEM(S)`);
    try {
      const response = await fetch("/api/stock-operation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, branch, items: selectedItems }) });
      const result = await response.json() as OperationResponse;
      if (!response.ok || !result.ok) throw new Error(result.error || `${isCheck ? "Check" : "Cut"} failed.`);
      const processedIds = new Set(selectedItems.map((item) => item.id));
      setQueue((current) => current.filter((item) => !processedIds.has(item.id))); setSelected(new Set()); clearInput(); setBatchStatus(`COMPLETED: ${result.batchId || operation.toUpperCase()} — ${result.processedCount ?? selectedItems.length} SELECTED ITEM(S)`); await loadSource();
    } catch (error) { setBatchStatus(`ERROR: ${error instanceof Error ? error.message : "Operation failed"}`); }
    finally { setIsSubmitting(false); }
  };

  const calculatedInput = scanned ? (isCheck ? checkResult({ id: scanned.id, barcode: scanned.id, sku: scanned.sku, productName: scanned.productName, branch: scanned.location, typeBefore: scanned.containerType, quantityBefore: scanned.quantity, unit: scanned.unit, trackMode: scanned.trackMode, packageUnit: scanned.packageUnit, unitsPerPack: scanned.unitsPerPack, statusBefore: scanned.status, note, actualType, actualQuantity, cutReason, cutMode, cutQuantity }) : cutResult({ id: scanned.id, barcode: scanned.id, sku: scanned.sku, productName: scanned.productName, branch: scanned.location, typeBefore: scanned.containerType, quantityBefore: scanned.quantity, unit: scanned.unit, trackMode: scanned.trackMode, packageUnit: scanned.packageUnit, unitsPerPack: scanned.unitsPerPack, statusBefore: scanned.status, note, actualType, actualQuantity, cutReason, cutMode, cutQuantity })) : null;

  return <main className={styles.importPage}>
    <header className={styles.header}><Link className={styles.brand} href="/dashboard"><span>MS</span><div><strong>MedStock</strong><small>{isCheck ? "Physical stock count" : "Stock usage scanner"}</small></div></Link><div className={styles.headerStatus}><span className={sourceState === "ready" ? styles.onlineDot : styles.offlineDot} />{sourceState === "ready" ? "Inventory connected" : sourceState === "loading" ? "Connecting…" : "Connection issue"}</div><Link className={styles.backLink} href="/dashboard"><IconArrowLeft size={16} /> Back to dashboard</Link></header>
    <StockWorkflowNav active={operation} />
    <div className={styles.content}>
      <section className={styles.titleRow}><div><p>Stock operations</p><h1>{isCheck ? "Check stock scanner" : "Cut stock scanner"}</h1><span>{isCheck ? "Compare physical stock with the recorded quantity and save audited adjustments." : "Record sale or usage while protecting quantity and open-container rules."}</span></div><div className={styles.batchSummary}><small>Current queue</small><strong>{queue.length}</strong><span>{invalidRows} errors</span></div></section>
      {sourceState === "error" && <section className={styles.sourceError}><IconAlertCircle size={19} /><div><strong>Inventory data unavailable</strong><span>{sourceError}</span></div><button type="button" onClick={() => void loadSource()}><IconRefresh size={15} /> Retry</button></section>}
      <section className={styles.workspace}>
        <div className={styles.scannerPanel}>
          <div className={styles.panelHeading}><div><span>Step 1</span><h2>Scan or enter barcode</h2></div>{isCheck ? <IconClipboardCheck size={24} /> : <IconScissors size={24} />}</div>
          <form className={styles.scanForm} onSubmit={handleScan}><label>Barcode / Unique ID</label><div className={styles.scanInput}><IconBarcode size={19} /><input ref={barcodeRef} value={barcode} onChange={(event) => { setBarcode(event.target.value.toUpperCase()); setScanned(null); setValidation("Press Enter to validate"); setValidationType("idle"); }} placeholder="Scan inventory barcode" autoComplete="off" disabled={sourceState !== "ready"} /><button type="submit" disabled={!barcode.trim() || sourceState !== "ready"}>Scan</button></div></form>
          <div className={styles.formGrid}>
            <label className={styles.fullField}><span>Current branch</span><select value={branch} onChange={(event) => { setBranch(event.target.value as Branch); setBatchStatus("BRANCH CHANGED — QUEUE WILL RECHECK"); }}><option>Thonglor</option><option>Silom</option></select></label>
            <label className={styles.fullField}><span>Scanned product</span><input value={scanned?.productName ?? ""} placeholder="Waiting for barcode" readOnly /></label>
            <label><span>SKU</span><input value={scanned?.sku ?? ""} placeholder="—" readOnly /></label><label><span>Track mode</span><input value={scanned?.trackMode ?? ""} placeholder="—" readOnly /></label>
            <label><span>Current stock type</span><input value={scanned?.containerType ?? ""} placeholder="—" readOnly /></label><label><span>Current quantity {scanned ? `(${scanned.unit})` : ""}</span><input value={scanned?.quantity ?? ""} placeholder="—" readOnly /></label>
            <label><span>Unit</span><input value={scanned?.unit ?? ""} placeholder="—" readOnly /></label><label><span>Item location</span><input value={scanned?.location ?? ""} placeholder="—" readOnly /></label>
            {isCheck ? <><label className={styles.fullField}><span>Reason / note</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Required when count or type changes" disabled={!scanned} /></label><label><span>Actual stock type</span><select value={actualType} onChange={(event) => setActualType(event.target.value as StockType)} disabled={!scanned}><option>FULL</option><option>OPEN</option></select></label><label><span>Actual quantity found</span><input type="number" min="0" step={scanned && isDiscreteUnit(scanned.unit) ? "1" : "0.000001"} value={actualQuantity} onChange={(event) => setActualQuantity(Number(event.target.value))} disabled={!scanned} /></label><label><span>Quantity difference</span><input value={calculatedInput && "difference" in calculatedInput ? calculatedInput.difference : ""} readOnly /></label><label><span>Status after check</span><input value={calculatedInput?.statusAfter ?? ""} readOnly /></label></> : <><label><span>Reason</span><select value={cutReason} onChange={(event) => setCutReason(event.target.value as CutReason)} disabled={!scanned}><option>SALE</option><option>USE</option></select></label><label><span>Cut mode</span><select value={cutMode} onChange={(event) => { const mode = event.target.value as CutMode; setCutMode(mode); if (mode === "ALL" && scanned) setCutQuantity(scanned.quantity); }} disabled={!scanned || scanned.trackMode === "UNIT"}><option>ALL</option><option>PARTIAL</option></select></label><label><span>Quantity to cut {scanned ? `(${scanned.unit})` : ""}</span><input type="number" min="0.000001" step={scanned && isDiscreteUnit(scanned.unit) ? "1" : "0.000001"} value={cutMode === "ALL" && scanned ? scanned.quantity : cutQuantity} onChange={(event) => setCutQuantity(Number(event.target.value))} disabled={!scanned || cutMode === "ALL"} /></label><label><span>Quantity after cut {scanned ? `(${scanned.unit})` : ""}</span><input value={calculatedInput?.quantityAfter ?? ""} readOnly /></label><label className={styles.fullField}><span>Stock type after cut</span><input value={calculatedInput?.typeAfter ?? ""} readOnly /></label></>}
          </div>
          <div className={`${styles.validation} ${styles[validationType]}`}><span>{validationType === "ready" ? <IconCheck size={17} /> : validationType === "error" ? <IconAlertCircle size={17} /> : <IconBarcode size={17} />}</span><div><small>Validation result</small><strong>{validation}</strong></div></div>
          <label className={styles.autoAdd}><input type="checkbox" checked={autoAdd} onChange={(event) => { setAutoAdd(event.target.checked); setBatchStatus(event.target.checked ? "AUTO ADD ON — READY FOR SCAN" : "MANUAL MODE — SCAN AND REVIEW DETAILS"); }} /><span><b>Auto add</b><small>{isCheck ? "Queue the current recorded count immediately." : "Queue one stock unit per scan using the current reason; review quantities before confirming."}</small></span></label>
          <button className={styles.addButton} type="button" onClick={addCurrent} disabled={!scanned || autoAdd}>{isCheck ? <IconClipboardCheck size={18} /> : <IconScissors size={18} />} Add to queue</button>
          <div className={styles.safeWorkflow}><strong>Safe workflow</strong><ol><li>Select the branch before scanning.</li><li>Scan each physical item only once.</li><li>{isCheck ? "Enter a reason whenever quantity or type changes." : "Use existing OPEN stock before opening another item."}</li><li>Review every row before confirmation.</li></ol></div>
        </div>
        <div className={styles.queuePanel}>
          <div className={styles.queueHeading}><div><span>Pending {isCheck ? "check" : "cut"} stock queue</span><h2>Review scanned stock</h2><p>Inventory is revalidated before any stock or log record changes.</p></div><div className={styles.queueActions}><button type="button" className={styles.deleteButton} onClick={deleteSelected} disabled={!queue.length}><IconTrash size={15} /> Delete selected</button><button type="button" className={styles.clearButton} onClick={clearAll} disabled={!queue.length && !barcode}><IconX size={15} /> Cancel / clear</button></div></div>
          <div className={styles.tableScroll}><table><thead><tr><th><input aria-label="Select all rows" type="checkbox" checked={allSelected} onChange={(event) => setSelected(event.target.checked ? new Set(queue.map((item) => item.id)) : new Set())} /></th><th>Barcode</th><th>Product</th><th>Branch</th><th>Type before</th><th>Qty before</th><th>{isCheck ? "Reason / note" : "Reason"}</th><th>{isCheck ? "Actual type" : "Cut mode"}</th><th>{isCheck ? "Actual qty" : "Qty to cut"}</th><th>{isCheck ? "Difference" : "Qty after"}</th><th>Type after</th><th>Validation</th></tr></thead><tbody>{queue.map((item) => { const calculation = derived.get(item.id); const errors = rowErrors.get(item.id) ?? []; return <tr key={item.id} className={errors.length ? styles.invalidRow : ""}><td><input aria-label={`Select ${item.barcode}`} type="checkbox" checked={selected.has(item.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} /></td><td><code>{item.barcode}</code><small>{item.sku}</small></td><td><strong>{item.productName}</strong><small>{item.trackMode} · {item.unit}{isPacked(item) ? ` · 1 Box = ${item.unitsPerPack} ${item.unit}` : ""}</small></td><td>{item.branch}</td><td><span className={styles.typeBadge}>{item.typeBefore}</span></td><td>{item.quantityBefore}</td><td>{isCheck ? <input value={item.note} onChange={(event) => updateQueue(item.id, { note: event.target.value })} placeholder="Reason if changed" /> : <select value={item.cutReason} onChange={(event) => updateQueue(item.id, { cutReason: event.target.value as CutReason })}><option>SALE</option><option>USE</option></select>}</td><td>{isCheck ? <select value={item.actualType} onChange={(event) => updateQueue(item.id, { actualType: event.target.value as StockType })}><option>FULL</option><option>OPEN</option></select> : <select value={item.cutMode} disabled={item.trackMode === "UNIT"} onChange={(event) => updateQueue(item.id, { cutMode: event.target.value as CutMode })}><option>ALL</option><option>PARTIAL</option></select>}</td><td><input className={styles.qtyInput} type="number" min={isCheck ? 0 : .000001} step={isDiscreteUnit(item.unit) ? "1" : "0.000001"} value={isCheck ? item.actualQuantity : item.cutMode === "ALL" ? item.quantityBefore : item.cutQuantity} disabled={!isCheck && item.cutMode === "ALL"} onChange={(event) => updateQueue(item.id, isCheck ? { actualQuantity: Number(event.target.value) } : { cutQuantity: Number(event.target.value) })} /></td><td>{calculation && ("difference" in calculation ? calculation.difference : calculation.quantityAfter)}</td><td><span className={styles.typeBadge}>{calculation?.typeAfter}</span></td><td><span className={errors.length ? styles.blockedBadge : styles.readyBadge}>{errors.length ? `BLOCK: ${errors.join(" / ")}` : "READY"}</span></td></tr>; })}</tbody></table>{!queue.length && <div className={styles.emptyQueue}><IconBarcode size={30} /><strong>No barcodes queued</strong><span>Scan an inventory barcode on the left to start.</span></div>}</div>
          <div className={styles.batchBar}><div><small>Batch status</small><strong>{batchStatus}</strong></div><button type="button" onClick={() => void submitBatch()} disabled={!selectedItems.length || isSubmitting || sourceState !== "ready"}>{isSubmitting ? <IconRefresh className={styles.spinning} size={18} /> : isCheck ? <IconClipboardCheck size={18} /> : <IconScissors size={18} />}{isSubmitting ? "Processing…" : isCheck ? `Confirm selected (${selectedItems.length})` : `Cut selected (${selectedItems.length})`}</button></div>
        </div>
      </section>
    </div>
  </main>;
}
