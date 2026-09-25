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
  const [group, setGroup] = useState("ALL");
  const [packageType, setPackageType] = useState("ALL");
  const [trackMode, setTrackMode] = useState("ALL");
  const [sort, setSort] = useState("PRODUCT");

  const locations = useMemo(
    () => Array.from(new Set(inventory.map((item) => item.location).filter(Boolean))).sort(),
    [inventory],
  );
  const groups = useMemo(() => Array.from(new Set(inventory.map((item) => item.sku.split("-")[0]).filter(Boolean))).sort(), [inventory]);
  const packageTypes = useMemo(() => Array.from(new Set(inventory.map((item) => item.packageUnit || item.unit).filter(Boolean))).sort(), [inventory]);
  const trackModes = useMemo(() => Array.from(new Set(inventory.map((item) => item.trackMode).filter(Boolean))).sort(), [inventory]);
  const statuses = useMemo(() => Array.from(new Set(inventory.map((item) => item.status).filter(Boolean))).sort(), [inventory]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return inventory.filter((item) => {
      const matchesQuery = !normalizedQuery || [item.id, item.sku, item.productName]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
      const matchesLocation = location === "ALL" || item.location === location;
      const matchesStatus = status === "ALL" || item.status === status;
      const matchesType = containerType === "ALL" || item.containerType === containerType;
      const matchesGroup = group === "ALL" || item.sku.split("-")[0] === group;
      const matchesPackage = packageType === "ALL" || (item.packageUnit || item.unit) === packageType;
      const matchesTrackMode = trackMode === "ALL" || item.trackMode === trackMode;
      return matchesQuery && matchesLocation && matchesStatus && matchesType && matchesGroup && matchesPackage && matchesTrackMode;
    }).sort((left, right) => {
      if (sort === "SKU") return left.sku.localeCompare(right.sku) || left.id.localeCompare(right.id);
      if (sort === "QUANTITY_DESC") return right.quantity - left.quantity || left.sku.localeCompare(right.sku);
      if (sort === "QUANTITY_ASC") return left.quantity - right.quantity || left.sku.localeCompare(right.sku);
      if (sort === "LOCATION") return left.location.localeCompare(right.location) || left.productName.localeCompare(right.productName);
      return left.productName.localeCompare(right.productName) || left.id.localeCompare(right.id);
    });
  }, [containerType, group, inventory, location, packageType, query, sort, status, trackMode]);

  const fullContainers = filtered.filter((item) => item.containerType === "FULL").length;
  const openContainers = filtered.filter((item) => item.containerType === "OPEN").length;
  const resetFilters = () => { setQuery(""); setLocation("ALL"); setStatus("ALL"); setContainerType("ALL"); setGroup("ALL"); setPackageType("ALL"); setTrackMode("ALL"); setSort("PRODUCT"); };

  return (
    <section className={styles.inventoryPanel}>
      <div className={`${styles.inventoryToolbar} ${styles.inventoryToolbarDetailed}`}>
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
            <span>Group</span>
            <select value={group} onChange={(event) => setGroup(event.target.value)}>
              <option value="ALL">All groups</option>
              {groups.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
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
              {statuses.map((value) => <option value={value} key={value}>{value}</option>)}
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
          <label>
            <span>Package</span>
            <select value={packageType} onChange={(event) => setPackageType(event.target.value)}>
              <option value="ALL">All packages</option>
              {packageTypes.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
          <label>
            <span>Tracking</span>
            <select value={trackMode} onChange={(event) => setTrackMode(event.target.value)}>
              <option value="ALL">UNIT &amp; BULK</option>
              {trackModes.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
          <label>
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="PRODUCT">Product name: A–Z</option>
              <option value="SKU">SKU: A–Z</option>
              <option value="QUANTITY_DESC">Quantity: high to low</option>
              <option value="QUANTITY_ASC">Quantity: low to high</option>
              <option value="LOCATION">Location: A–Z</option>
            </select>
          </label>
        </div>
        <button className={styles.resetFilters} onClick={resetFilters}>Reset filters</button>
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
                <td><strong>{item.quantity} {item.unit}</strong>{item.packageUnit && <small>1 {item.packageUnit} / Barcode · {item.unitsPerPack} {item.unit} when full</small>}<span className={item.status === "IN STOCK" ? styles.statusIn : styles.statusOut}>{item.status || "UNKNOWN"}</span></td>
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
        <span>Full: {fullContainers} · Open: {openContainers}</span>
        <span>Live data from Google Sheets · Inventory</span>
      </footer>
    </section>
  );
}
