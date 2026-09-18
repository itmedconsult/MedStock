import type { StockTransaction } from "../_lib/demo-data";
import { IconSearch } from "@tabler/icons-react";
import styles from "../dashboard.module.css";

type TransactionTableProps = {
  transactions: StockTransaction[];
  query: string;
  typeFilter: "ALL" | "IN" | "OUT";
  onQueryChange: (value: string) => void;
  onTypeChange: (value: "ALL" | "IN" | "OUT") => void;
};

export function TransactionTable({ transactions, query, typeFilter, onQueryChange, onTypeChange }: TransactionTableProps) {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = transactions.filter((item) => {
    const matchesType = typeFilter === "ALL" || item.type === typeFilter;
    const matchesQuery = !normalizedQuery || item.productName.toLowerCase().includes(normalizedQuery) || item.sku.toLowerCase().includes(normalizedQuery) || item.id.toLowerCase().includes(normalizedQuery);
    return matchesType && matchesQuery;
  });

  return (
    <section className={styles.logPanel}>
      <div className={styles.logToolbar}>
        <div className={styles.logSearch}><IconSearch size={18} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search transaction, product, or SKU" /></div>
        <div className={styles.filterGroup} aria-label="Transaction type filter">
          {(["ALL", "IN", "OUT"] as const).map((type) => <button className={typeFilter === type ? styles.activeFilter : ""} onClick={() => onTypeChange(type)} key={type}>{type === "ALL" ? "All" : type === "IN" ? "Stock in" : "Cut stock"}</button>)}
        </div>
      </div>

      <div className={styles.tableScroll}>
        <table className={styles.logTable}>
          <thead><tr><th>Date & time</th><th>Transaction</th><th>Product</th><th>Movement</th><th>Balance</th><th>Source</th></tr></thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td><strong>{new Date(item.occurredAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</strong><small>{new Date(item.occurredAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</small></td>
                <td><code>{item.id}</code></td>
                <td><strong>{item.productName}</strong><small>{item.sku}</small></td>
                <td><span className={item.type === "IN" ? styles.stockIn : styles.stockOut}>{item.type === "IN" ? "+" : ""}{item.quantity} {item.unit}</span></td>
                <td>{item.balance} {item.unit}</td>
                <td><strong>{item.source}</strong><small>{item.actor}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <div className={styles.noResults}>No transactions match this filter.</div>}
      </div>
      <footer><span>Showing {filtered.length} of {transactions.length} transactions</span><span>Demo data derived from the current product list</span></footer>
    </section>
  );
}
