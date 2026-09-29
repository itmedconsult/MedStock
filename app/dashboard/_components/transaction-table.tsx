import { useState } from "react";
import { formatBangkokDateTime, type StockTransaction } from "../_lib/dashboard-data";
import { IconSearch } from "@tabler/icons-react";
import styles from "../dashboard.module.css";

type TransactionTableProps = {
  transactions: StockTransaction[];
  query: string;
  typeFilter: "ALL" | "IN" | "OUT";
  onQueryChange: (value: string) => void;
  onTypeChange: (value: "ALL" | "IN" | "OUT") => void;
  showFilters?: boolean;
};

export function TransactionTable({ transactions, query, typeFilter, onQueryChange, onTypeChange, showFilters = true }: TransactionTableProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = transactions.filter((item) => {
    const matchesType = typeFilter === "ALL" || item.type === typeFilter;
    const matchesQuery = !normalizedQuery || item.productName.toLowerCase().includes(normalizedQuery) || item.sku.toLowerCase().includes(normalizedQuery) || item.id.toLowerCase().includes(normalizedQuery) || (item.barcode || "").toLowerCase().includes(normalizedQuery);
    return matchesType && matchesQuery;
  }).sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);

  return (
    <section className={styles.logPanel}>
      {showFilters && <div className={styles.logToolbar}>
        <div className={styles.logSearch}><IconSearch size={18} /><input value={query} aria-label="Search transaction history" onChange={(event) => { setPage(1); onQueryChange(event.target.value); }} placeholder="Search barcode, unique ID, product, or SKU" /></div>
        <div className={styles.filterGroup} aria-label="Transaction type filter">
          {(["ALL", "IN", "OUT"] as const).map((type) => <button className={typeFilter === type ? styles.activeFilter : ""} onClick={() => { setPage(1); onTypeChange(type); }} key={type}>{type === "ALL" ? "All" : type === "IN" ? "Stock in" : "Cut stock"}</button>)}
        </div>
      </div>}

      <div className={styles.tableScroll}>
        <table className={styles.logTable}>
          <thead><tr><th>Date & time (ICT)</th><th>Barcode / Unique ID</th><th>Product</th><th>Movement</th><th>Balance</th><th>Reason / Location</th><th>Source</th></tr></thead>
          <tbody>
            {visible.map((item) => (
              <tr key={item.id}>
                <td><time dateTime={item.occurredAt}>{formatBangkokDateTime(item.occurredAt)}</time></td>
                <td><code>{item.barcode || item.id}</code></td>
                <td><strong>{item.productName}</strong><small>{item.sku}</small></td>
                <td><span className={item.type === "IN" ? styles.stockIn : styles.stockOut}>{item.type === "IN" ? "+" : ""}{item.quantity} {item.unit}</span></td>
                <td>{item.balance} {item.unit}</td>
                <td><strong>{item.reason}</strong><small>{item.location || "—"}</small></td>
                <td><strong>{item.source}</strong><small>{item.actor}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <div className={styles.noResults}>No transactions match this filter.</div>}
      </div>
      <footer><span aria-live="polite">Showing {filtered.length ? start + 1 : 0}–{start + visible.length} of {filtered.length} transactions</span><div className={styles.pagination}><label>Rows <select aria-label="Transactions per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><button onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}>Previous</button><span>Page {currentPage} / {pageCount}</span><button onClick={() => setPage(currentPage + 1)} disabled={currentPage === pageCount}>Next</button></div></footer>
    </section>
  );
}
