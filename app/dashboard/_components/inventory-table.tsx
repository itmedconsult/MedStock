import { useMemo, useState } from "react";
import { IconSearch } from "@tabler/icons-react";
import type { InventoryItem } from "../_lib/dashboard-data";
import styles from "../dashboard.module.css";

type InventoryTableProps = {
  inventory: InventoryItem[];
};

export function InventoryTable({ inventory }: InventoryTableProps) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [containerType, setContainerType] = useState("ALL");

  const locations = useMemo(
    () => Array.from(new Set(inventory.map((item) => item.location).filter(Boolean))).sort(),
    [inventory],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return inventory.filter((item) => {
      const matchesQuery = !normalizedQuery || [item.id, item.sku, item.productName]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
      const matchesLocation = location === "ALL" || item.location === location;
      const matchesStatus = status === "ALL" || item.status === status;
      const matchesType = containerType === "ALL" || item.containerType === containerType;
      return matchesQuery && matchesLocation && matchesStatus && matchesType;
    });
  }, [containerType, inventory, location, query, status]);

  const filteredQuantity = filtered.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <section className={styles.inventoryPanel}>
      <div className={styles.inventoryToolbar}>
        <div className={styles.logSearch}>
          <IconSearch size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search barcode, product, or SKU"
            aria-label="Search inventory"
          />
        </div>
        <div className={styles.inventoryFilters}>
          <label>
            <span>Location</span>
            <select value={location} onChange={(event) => setLocation(event.target.value)}>
              <option value="ALL">All locations</option>
              {locations.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="ALL">All statuses</option>
              <option value="IN STOCK">In stock</option>
              <option value="OUT OF STOCK">Out of stock</option>
              <option value="SOLD">Sold</option>
            </select>
          </label>
          <label>
            <span>Container</span>
            <select value={containerType} onChange={(event) => setContainerType(event.target.value)}>
              <option value="ALL">FULL &amp; OPEN</option>
              <option value="FULL">Full</option>
              <option value="OPEN">Open</option>
            </select>
          </label>
        </div>
      </div>

      <div className={styles.tableScroll}>
        <table className={styles.inventoryTable}>
          <thead>
            <tr><th>Barcode / Unique ID</th><th>Product</th><th>Location</th><th>Stock</th><th>Container</th><th>Tracking</th></tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td><code>{item.id}</code></td>
                <td><strong>{item.productName}</strong><small>{item.sku}</small></td>
                <td><strong>{item.location || "—"}</strong></td>
                <td><strong>{item.quantity} {item.unit}</strong><span className={item.status === "IN STOCK" ? styles.statusIn : styles.statusOut}>{item.status || "UNKNOWN"}</span></td>
                <td><span className={item.containerType === "OPEN" ? styles.containerOpen : styles.containerFull}>{item.containerType || "—"}</span></td>
                <td><span className={styles.trackMode}>{item.trackMode || "—"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <div className={styles.noResults}>No inventory items match these filters.</div>}
      </div>

      <footer>
        <span>Showing {filtered.length} of {inventory.length} barcodes</span>
        <span>Filtered quantity: {filteredQuantity}</span>
        <span>Live data from Google Sheets · Inventory</span>
      </footer>
    </section>
  );
}
