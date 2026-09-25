"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconChartBar,
  IconClipboardList,
  IconDatabase,
  IconPackage,
  IconRefresh,
  IconSearch,
  IconUpload,
} from "@tabler/icons-react";
import {
  createDailyMovements,
  createSkuStockSummary,
  summarizeDashboard,
  transactionOperation,
  type DashboardData,
} from "../_lib/dashboard-data";
import { MovementChart } from "./movement-chart";
import { InventoryTable } from "./inventory-table";
import { TransactionTable } from "./transaction-table";
import styles from "../dashboard.module.css";

const EMPTY_DASHBOARD: DashboardData = {
  products: [],
  inventory: [],
  transactions: [],
  waitingForImport: 0,
  updatedAt: "",
};

export function Dashboard() {
  const [data, setData] = useState<DashboardData>(EMPTY_DASHBOARD);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "inventory" | "log">("overview");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "IN" | "OUT">("ALL");
  const [stockQuery, setStockQuery] = useState("");
  const [stockGroup, setStockGroup] = useState("ALL");
  const [stockStatus, setStockStatus] = useState("IN_STOCK");
  const [stockPackage, setStockPackage] = useState("ALL");
  const [stockLocation, setStockLocation] = useState("ALL");
  const [stockSort, setStockSort] = useState("QUANTITY_DESC");
  const [transactionQuery, setTransactionQuery] = useState("");
  const [operationFilter, setOperationFilter] = useState("ALL");
  const [reasonFilter, setReasonFilter] = useState("ALL");
  const [actorFilter, setActorFilter] = useState("ALL");
  const [transactionLocation, setTransactionLocation] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const loadDashboard = async () => {
    setState("loading");
    setError("");
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const nextData = await response.json() as DashboardData & { error?: string };
      if (!response.ok) throw new Error(nextData.error || "Unable to load dashboard data.");
      setData(nextData);
      setState("ready");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard data.");
      setState("error");
    }
  };

  useEffect(() => { void loadDashboard(); }, []);

  const dailyMovements = useMemo(() => createDailyMovements(data.transactions), [data.transactions]);
  const { activeSkus, quantityOnHand, stockAdded, cutOperations, openContainers } = summarizeDashboard(data);
  const locations = useMemo(() => Array.from(new Set(data.inventory.map((item) => item.location).filter(Boolean))).sort(), [data.inventory]);
  const transactionLocations = useMemo(() => Array.from(new Set(data.transactions.map((item) => item.location).filter(Boolean))).sort(), [data.transactions]);
  const actors = useMemo(() => Array.from(new Set(data.transactions.map((item) => item.actor).filter(Boolean))).sort(), [data.transactions]);
  const reasons = useMemo(() => Array.from(new Set(data.transactions.map((item) => item.reason).filter(Boolean))).sort(), [data.transactions]);
  const allSkuStock = useMemo(() => createSkuStockSummary(data.inventory, data.products), [data.inventory, data.products]);
  const groups = useMemo(() => Array.from(new Set(allSkuStock.map((item) => item.group))).sort(), [allSkuStock]);
  const packageTypes = useMemo(() => Array.from(new Set(allSkuStock.map((item) => item.packageType).filter(Boolean))).sort(), [allSkuStock]);
  const skuStock = useMemo(() => {
    const normalizedQuery = stockQuery.trim().toLowerCase();
    const locationInventory = stockLocation === "ALL" ? data.inventory : data.inventory.filter((item) => item.location === stockLocation);
    const scoped = createSkuStockSummary(locationInventory, data.products).filter((item) => {
      const matchesQuery = !normalizedQuery || item.sku.toLowerCase().includes(normalizedQuery) || item.productName.toLowerCase().includes(normalizedQuery);
      const matchesGroup = stockGroup === "ALL" || item.group === stockGroup;
      const matchesPackage = stockPackage === "ALL" || item.packageType === stockPackage;
      const matchesLocation = stockLocation === "ALL" || item.locations.includes(stockLocation);
      const matchesStatus = stockStatus === "ALL"
        || (stockStatus === "IN_STOCK" && item.barcodes > 0)
        || (stockStatus === "OPENED" && item.openContainers > 0)
        || (stockStatus === "OUT_OF_STOCK" && item.barcodes === 0)
        || (stockStatus === "LOW_STOCK" && item.barcodes > 0 && item.barcodes <= 5);
      return matchesQuery && matchesGroup && matchesPackage && matchesLocation && matchesStatus;
    });
    return scoped.sort((left, right) => {
      if (stockSort === "QUANTITY_ASC") return left.barcodes - right.barcodes || left.sku.localeCompare(right.sku);
      if (stockSort === "NAME") return left.productName.localeCompare(right.productName);
      if (stockSort === "SKU") return left.sku.localeCompare(right.sku);
      return right.barcodes - left.barcodes || left.sku.localeCompare(right.sku);
    });
  }, [data.inventory, data.products, stockGroup, stockLocation, stockPackage, stockQuery, stockSort, stockStatus]);
  const filteredTransactions = useMemo(() => {
    const normalizedQuery = transactionQuery.trim().toLowerCase();
    return data.transactions.filter((item) => {
      const itemDate = item.occurredAt.slice(0, 10);
      return (!normalizedQuery || [item.id, item.sku, item.productName].some((value) => value.toLowerCase().includes(normalizedQuery)))
        && (operationFilter === "ALL" || transactionOperation(item) === operationFilter)
        && (reasonFilter === "ALL" || item.reason === reasonFilter)
        && (actorFilter === "ALL" || item.actor === actorFilter)
        && (transactionLocation === "ALL" || item.location === transactionLocation)
        && (!dateFrom || itemDate >= dateFrom)
        && (!dateTo || itemDate <= dateTo);
    });
  }, [actorFilter, data.transactions, dateFrom, dateTo, operationFilter, reasonFilter, transactionLocation, transactionQuery]);
  const recentTransactions = filteredTransactions.slice(0, 6);
  const resetStockFilters = () => { setStockQuery(""); setStockGroup("ALL"); setStockStatus("IN_STOCK"); setStockPackage("ALL"); setStockLocation("ALL"); setStockSort("QUANTITY_DESC"); };
  const resetTransactionFilters = () => { setTransactionQuery(""); setOperationFilter("ALL"); setReasonFilter("ALL"); setActorFilter("ALL"); setTransactionLocation("ALL"); setDateFrom(""); setDateTo(""); };

  return (
    <main className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.brand}><span>MS</span><div><strong>MedStock</strong><small>Google Sheets live</small></div></div>
        <nav><button className={activeTab === "overview" ? styles.activeTab : ""} onClick={() => setActiveTab("overview")}><IconChartBar size={18} /> Overview</button><button className={activeTab === "inventory" ? styles.activeTab : ""} onClick={() => setActiveTab("inventory")}><IconPackage size={18} /> Inventory</button><button className={activeTab === "log" ? styles.activeTab : ""} onClick={() => setActiveTab("log")}><IconClipboardList size={18} /> Log Data</button></nav>
        <div className={styles.headerRight}><span className={styles.liveBadge}>LIVE</span><Link href="/import"><strong>Import</strong></Link><Link href="/create-barcode"><strong>Create Barcode</strong></Link></div>
      </header>

      <div className={styles.content}>
        <section className={styles.titleRow}>
          <div><p>Inventory intelligence</p><h1>{activeTab === "overview" ? "Stock movement overview" : activeTab === "inventory" ? "Physical inventory" : "Log Data transactions"}</h1><span>{activeTab === "overview" ? "Live stock and movement data from MedStock Google Sheets." : activeTab === "inventory" ? "Barcode-level stock recorded in the Inventory sheet." : "Movement history recorded in the Log Data sheet."}</span></div>
          <div className={styles.syncBlock}><button onClick={() => void loadDashboard()} disabled={state === "loading"}><IconRefresh className={state === "loading" ? styles.spinning : ""} size={17} /> Refresh data</button><small>{data.updatedAt ? `Updated ${new Date(data.updatedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Waiting for Google Sheets"}</small></div>
        </section>

        {state === "error" ? <section className={styles.errorState}><IconDatabase size={34} /><h2>Dashboard data unavailable</h2><p>{error}</p><button onClick={() => void loadDashboard()}>Try again</button></section> : (
          <>
            <section className={styles.stats}>
              <article><i className={styles.green}><IconPackage size={22} /></i><div><small>Active SKUs</small><strong>{state === "loading" ? "—" : activeSkus}</strong><span>{data.products.length} configured SKUs</span></div></article>
              <article><i className={styles.blue}><IconArrowUpRight size={22} /></i><div><small>Qty on hand</small><strong>{state === "loading" ? "—" : quantityOnHand}</strong><span>barcodes · {openContainers} open</span></div></article>
              <article><i className={styles.orange}><IconUpload size={22} /></i><div><small>Barcodes imported</small><strong>{state === "loading" ? "—" : stockAdded}</strong><span>From Log Data</span></div></article>
              <article><i className={styles.purple}><IconArrowDownRight size={22} /></i><div><small>Cut operations</small><strong>{state === "loading" ? "—" : cutOperations}</strong><span>From Log Data</span></div></article>
            </section>

            {activeTab === "overview" ? (
              <>
                <section className={styles.chartCard}>
                  <div className={styles.panelHeading}><div><p>Last 7 activity days</p><h2>Barcode movement</h2></div><div className={styles.legend}><span><i className={styles.addedLegend} /> Barcodes imported</span><span><i className={styles.cutLegend} /> Cut operations</span></div></div>
                  <MovementChart data={dailyMovements} />
                </section>

                <section className={styles.overviewGrid}>
                  <article className={styles.skuStockCard}>
                    <div className={styles.panelHeading}><div><p>Stock by product</p><h2>Quantity by SKU</h2></div><button onClick={() => setActiveTab("inventory")}>View Inventory</button></div>
                    <div className={styles.cardFilters}>
                      <label className={styles.filterSearch}><span>Search</span><div><IconSearch size={14} /><input aria-label="Search stock by product or SKU" value={stockQuery} onChange={(event) => setStockQuery(event.target.value)} placeholder="Product or SKU" /></div></label>
                      <label><span>Group</span><select value={stockGroup} onChange={(event) => setStockGroup(event.target.value)}><option value="ALL">All groups</option>{groups.map((value) => <option key={value}>{value}</option>)}</select></label>
                      <label><span>Status</span><select value={stockStatus} onChange={(event) => setStockStatus(event.target.value)}><option value="ALL">All stock</option><option value="IN_STOCK">In stock</option><option value="OPENED">Opened</option><option value="OUT_OF_STOCK">Out of stock</option><option value="LOW_STOCK">Low stock (1–5)</option></select></label>
                      <label><span>Package</span><select value={stockPackage} onChange={(event) => setStockPackage(event.target.value)}><option value="ALL">All packages</option>{packageTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
                      <label><span>Location</span><select value={stockLocation} onChange={(event) => setStockLocation(event.target.value)}><option value="ALL">All locations</option>{locations.map((value) => <option key={value}>{value}</option>)}</select></label>
                      <label><span>Sort</span><select value={stockSort} onChange={(event) => setStockSort(event.target.value)}><option value="QUANTITY_DESC">Quantity: high to low</option><option value="QUANTITY_ASC">Quantity: low to high</option><option value="NAME">Product name: A–Z</option><option value="SKU">SKU: A–Z</option></select></label>
                    </div>
                    <div className={styles.filterSummary}><span>Showing {skuStock.length} of {allSkuStock.length} SKUs</span><button onClick={resetStockFilters}>Reset filters</button></div>
                    <div className={styles.skuStockList}>{skuStock.map((item) => <div key={item.sku}><div><strong>{item.productName}</strong><small>{item.sku}{item.openContainers ? ` · ${item.openContainers} open` : ""}</small></div><b>{item.barcodes}<small>item{item.barcodes === 1 ? "" : "s"}</small></b></div>)}</div>
                    {!skuStock.length && state !== "loading" && <div className={styles.noResults}>No products match these filters.</div>}
                  </article>
                  <article className={`${styles.activityCard} ${styles.recentActivityCard}`}>
                    <div className={styles.panelHeading}><div><p>Latest activity</p><h2>Recent transactions</h2></div><button onClick={() => setActiveTab("log")}>View Log Data</button></div>
                    <div className={`${styles.cardFilters} ${styles.transactionFilters}`}>
                      <label className={styles.filterSearch}><span>Search</span><div><IconSearch size={14} /><input aria-label="Search recent transactions" value={transactionQuery} onChange={(event) => setTransactionQuery(event.target.value)} placeholder="Product, SKU, or transaction" /></div></label>
                      <label><span>Operation</span><select value={operationFilter} onChange={(event) => setOperationFilter(event.target.value)}><option value="ALL">All operations</option><option value="IMPORT">Import</option><option value="CUT">Cut</option><option value="ADJUSTMENT">Adjustment</option></select></label>
                      <label><span>Reason</span><select value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value)}><option value="ALL">All reasons</option>{reasons.map((value) => <option key={value}>{value}</option>)}</select></label>
                      <label><span>User</span><select value={actorFilter} onChange={(event) => setActorFilter(event.target.value)}><option value="ALL">All users</option>{actors.map((value) => <option key={value}>{value}</option>)}</select></label>
                      <label><span>Location</span><select value={transactionLocation} onChange={(event) => setTransactionLocation(event.target.value)}><option value="ALL">All locations</option>{transactionLocations.map((value) => <option key={value}>{value}</option>)}</select></label>
                      <label><span>From</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
                      <label><span>To</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
                    </div>
                    <div className={styles.filterSummary}><span>{filteredTransactions.length} matching transactions</span><button onClick={resetTransactionFilters}>Reset filters</button></div>
                    <div className={styles.activityList}>{recentTransactions.map((item) => <div key={item.id}><span className={item.type === "IN" ? styles.activityIn : styles.activityOut}>{item.type === "IN" ? <IconArrowUpRight size={17} /> : <IconArrowDownRight size={17} />}</span><div><strong>{item.productName}</strong><small>{item.sku} · {item.reason}{item.location ? ` · ${item.location}` : ""} · {new Date(item.occurredAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</small></div><b className={item.type === "IN" ? styles.positive : styles.negative}>{item.type === "IN" ? "+" : ""}{item.quantity} {item.unit}</b></div>)}</div>
                    {!recentTransactions.length && state !== "loading" && <div className={styles.noResults}>No transactions are recorded in Log Data.</div>}
                  </article>
                </section>
              </>
            ) : activeTab === "inventory" ? <InventoryTable inventory={data.inventory} /> : <TransactionTable transactions={data.transactions} query={query} typeFilter={typeFilter} onQueryChange={setQuery} onTypeChange={setTypeFilter} />}
          </>
        )}
      </div>
    </main>
  );
}
