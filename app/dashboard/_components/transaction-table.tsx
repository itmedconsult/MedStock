import { useState, type FormEvent } from "react";
import { formatBangkokDateTime, type StockTransaction } from "../_lib/dashboard-data";
import { IconSearch, IconX } from "@tabler/icons-react";
import styles from "../dashboard.module.css";

type TransactionTableProps = {
  transactions: StockTransaction[];
  query: string;
  typeFilter: "ALL" | "IN" | "OUT";
  onQueryChange: (value: string) => void;
  onTypeChange: (value: "ALL" | "IN" | "OUT") => void;
  showFilters?: boolean;
  refundedQuantityBySale?: Record<string, number>;
  onRefundComplete?: () => Promise<void> | void;
};

type OperationResponse = { ok?: boolean; error?: string };

export function TransactionTable({
  transactions,
  query,
  typeFilter,
  onQueryChange,
  onTypeChange,
  showFilters = true,
  refundedQuantityBySale = {},
  onRefundComplete,
}: TransactionTableProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [refundTarget, setRefundTarget] = useState<StockTransaction | null>(null);
  const [refundQuantity, setRefundQuantity] = useState(1);
  const [restockableConfirmed, setRestockableConfirmed] = useState(false);
  const [refundState, setRefundState] = useState<"idle" | "submitting">("idle");
  const [refundError, setRefundError] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = transactions.filter((item) => {
    const matchesType = typeFilter === "ALL" || item.type === typeFilter;
    const matchesQuery = !normalizedQuery || item.productName.toLowerCase().includes(normalizedQuery) || item.sku.toLowerCase().includes(normalizedQuery) || item.id.toLowerCase().includes(normalizedQuery) || (item.barcode || "").toLowerCase().includes(normalizedQuery) || item.actor.toLowerCase().includes(normalizedQuery);
    return matchesType && matchesQuery;
  }).sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const refundsEnabled = Boolean(onRefundComplete);
  const targetSoldQuantity = refundTarget ? Math.abs(refundTarget.quantity) : 0;
  const targetRefundedQuantity = refundTarget ? refundedQuantityBySale[refundTarget.id] || 0 : 0;
  const targetRefundableQuantity = Math.max(0, targetSoldQuantity - targetRefundedQuantity);

  const openRefund = (item: StockTransaction) => {
    const remaining = Math.max(0, Math.abs(item.quantity) - (refundedQuantityBySale[item.id] || 0));
    setRefundTarget(item);
    setRefundQuantity(remaining);
    setRestockableConfirmed(false);
    setRefundError("");
  };

  const closeRefund = () => {
    if (refundState === "submitting") return;
    setRefundTarget(null);
    setRefundError("");
  };

  const submitRefund = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!refundTarget) return;
    setRefundState("submitting");
    setRefundError("");
    try {
      const response = await fetch("/api/stock-operation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "refund",
          branch: refundTarget.location,
          items: [{ transactionId: refundTarget.id, refundQuantity, restockableConfirmed }],
        }),
      });
      const result = await response.json() as OperationResponse;
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to refund this sale.");
      setRefundTarget(null);
      await onRefundComplete?.();
    } catch (error) {
      setRefundError(error instanceof Error ? error.message : "Unable to refund this sale.");
    } finally {
      setRefundState("idle");
    }
  };

  return (
    <section className={styles.logPanel}>
      {showFilters && <div className={styles.logToolbar}>
        <div className={styles.logSearch}><IconSearch size={18} /><input value={query} aria-label="Search transaction history" onChange={(event) => { setPage(1); onQueryChange(event.target.value); }} placeholder="Search barcode, transaction ID, product, SKU, or user" /></div>
        <div className={styles.filterGroup} aria-label="Transaction type filter">
          {(["ALL", "IN", "OUT"] as const).map((type) => <button className={typeFilter === type ? styles.activeFilter : ""} onClick={() => { setPage(1); onTypeChange(type); }} key={type}>{type === "ALL" ? "All" : type === "IN" ? "Stock in" : "Cut stock"}</button>)}
        </div>
      </div>}

      <div className={styles.tableScroll}>
        <table className={styles.logTable}>
          <thead><tr><th>Date & time (ICT)</th><th>Barcode / Unique ID</th><th>Product</th><th>Movement</th><th>Balance</th><th>Reason / Location</th><th>Source</th>{refundsEnabled && <th>Action</th>}</tr></thead>
          <tbody>
            {visible.map((item) => {
              const saleQuantity = Math.abs(item.quantity);
              const refundedQuantity = refundedQuantityBySale[item.id] || 0;
              const refundableQuantity = Math.max(0, saleQuantity - refundedQuantity);
              const isSale = item.action === "SALE" && item.type === "OUT";
              return (
                <tr key={item.id}>
                  <td><time dateTime={item.occurredAt}>{formatBangkokDateTime(item.occurredAt)}</time></td>
                  <td><code>{item.barcode || item.id}</code></td>
                  <td><strong>{item.productName}</strong><small>{item.sku}</small></td>
                  <td><span className={item.type === "IN" ? styles.stockIn : styles.stockOut}>{item.type === "IN" ? "+" : ""}{item.quantity} {item.unit}</span></td>
                  <td>{item.balance} {item.unit}</td>
                  <td><strong>{item.reason}</strong><small>{item.location || "—"}</small></td>
                  <td><strong>{item.source}</strong><small>{item.actor}</small></td>
                  {refundsEnabled && <td>{isSale ? <button className={styles.refundButton} disabled={refundableQuantity <= 0} onClick={() => openRefund(item)}>{refundableQuantity <= 0 ? "Refunded" : refundedQuantity > 0 ? "Refund remaining" : "Refund"}</button> : <span className={styles.noAction}>—</span>}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length && <div className={styles.noResults}>No transactions match this filter.</div>}
      </div>
      <footer><span aria-live="polite">Showing {filtered.length ? start + 1 : 0}–{start + visible.length} of {filtered.length} transactions</span><div className={styles.pagination}><label>Rows <select aria-label="Transactions per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><button onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}>Previous</button><span>Page {currentPage} / {pageCount}</span><button onClick={() => setPage(currentPage + 1)} disabled={currentPage === pageCount}>Next</button></div></footer>

      {refundTarget && <div className={styles.refundBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeRefund(); }}>
        <section className={styles.refundDialog} role="dialog" aria-modal="true" aria-labelledby="refund-title">
          <div className={styles.refundHeader}><div><p>Restock customer return</p><h2 id="refund-title">Refund sale</h2></div><button aria-label="Close refund dialog" onClick={closeRefund} disabled={refundState === "submitting"}><IconX size={20} /></button></div>
          <div className={styles.refundSummary}>
            <div><span>Product</span><strong>{refundTarget.productName}</strong><small>{refundTarget.sku}</small></div>
            <div><span>Barcode / Unique ID</span><code>{refundTarget.barcode || refundTarget.id}</code></div>
            <div><span>Sale transaction</span><code>{refundTarget.id}</code></div>
            <div><span>Refundable</span><strong>{targetRefundableQuantity} {refundTarget.unit}</strong><small>{targetRefundedQuantity} already refunded</small></div>
          </div>
          <form onSubmit={submitRefund}>
            <label className={styles.refundQuantity}><span>Refund quantity</span><input type="number" min="0.000001" max={targetRefundableQuantity} step="any" value={refundQuantity} onChange={(event) => setRefundQuantity(Number(event.target.value))} required /><small>Maximum {targetRefundableQuantity} {refundTarget.unit}</small></label>
            <label className={styles.refundConfirmation}><input type="checkbox" checked={restockableConfirmed} onChange={(event) => setRestockableConfirmed(event.target.checked)} /><span>I confirm the returned stock is unopened, ready for sale, and can be returned to inventory.</span></label>
            {refundError && <p className={styles.refundError} role="alert">{refundError}</p>}
            <div className={styles.refundActions}><button type="button" onClick={closeRefund} disabled={refundState === "submitting"}>Cancel</button><button type="submit" disabled={refundState === "submitting" || !restockableConfirmed || refundQuantity <= 0 || refundQuantity > targetRefundableQuantity}>{refundState === "submitting" ? "Refunding…" : `Refund ${refundQuantity || 0} ${refundTarget.unit}`}</button></div>
          </form>
        </section>
      </div>}
    </section>
  );
}
