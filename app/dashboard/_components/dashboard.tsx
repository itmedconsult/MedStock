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
  IconUpload,
} from "@tabler/icons-react";
import {
  createDailyMovements,
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
  const inStockItems = data.inventory.filter((item) => item.status === "IN STOCK" && item.quantity > 0);
  const quantityOnHand = inStockItems.reduce((sum, item) => sum + item.quantity, 0);
  const stockIn = data.transactions
    .filter((item) => item.type === "IN")
    .reduce((sum, item) => sum + item.quantity, 0);
  const cutStock = Math.abs(data.transactions
    .filter((item) => item.type === "OUT")
    .reduce((sum, item) => sum + item.quantity, 0));
  const openContainers = inStockItems.filter((item) => item.containerType === "OPEN").length;
  const locations = new Set(inStockItems.map((item) => item.location).filter(Boolean)).size;
  const recentTransactions = data.transactions.slice(0, 6);

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
              <article><i className={styles.green}><IconPackage size={22} /></i><div><small>Inventory barcodes</small><strong>{state === "loading" ? "—" : inStockItems.length}</strong><span>{data.products.length} active SKUs</span></div></article>
              <article><i className={styles.blue}><IconArrowUpRight size={22} /></i><div><small>Qty on hand</small><strong>{state === "loading" ? "—" : quantityOnHand}</strong><span>{openContainers} open container{openContainers === 1 ? "" : "s"}</span></div></article>
              <article><i className={styles.orange}><IconArrowDownRight size={22} /></i><div><small>Stock added</small><strong>{state === "loading" ? "—" : stockIn}</strong><span>From Log Data</span></div></article>
              <article><i className={styles.purple}><IconDatabase size={22} /></i><div><small>Cut stock</small><strong>{state === "loading" ? "—" : cutStock}</strong><span>From Log Data</span></div></article>
            </section>

            {activeTab === "overview" ? (
              <>
                <section className={styles.chartCard}>
                  <div className={styles.panelHeading}><div><p>Last 7 activity days</p><h2>Inventory movement</h2></div><div className={styles.legend}><span><i className={styles.addedLegend} /> Product added</span><span><i className={styles.cutLegend} /> Cut stock</span></div></div>
                  <MovementChart data={dailyMovements} />
                </section>

                <section className={styles.overviewGrid}>
                  <article className={styles.activityCard}>
                    <div className={styles.panelHeading}><div><p>Latest activity</p><h2>Recent transactions</h2></div><button onClick={() => setActiveTab("log")}>View Log Data</button></div>
                    <div className={styles.activityList}>{recentTransactions.map((item) => <div key={item.id}><span className={item.type === "IN" ? styles.activityIn : styles.activityOut}>{item.type === "IN" ? <IconArrowUpRight size={17} /> : <IconArrowDownRight size={17} />}</span><div><strong>{item.productName}</strong><small>{item.sku} · {new Date(item.occurredAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</small></div><b className={item.type === "IN" ? styles.positive : styles.negative}>{item.type === "IN" ? "+" : ""}{item.quantity}</b></div>)}</div>
                    {!recentTransactions.length && state !== "loading" && <div className={styles.noResults}>No transactions are recorded in Log Data.</div>}
                  </article>
                  <article className={styles.explainerCard}><span><IconDatabase size={25} /></span><p>Data source</p><h2>Connected to Google Sheets</h2><p>Products, physical inventory and movement history are loaded from the MedStock workbook whenever this dashboard is refreshed.</p><div><strong>Sheets</strong><span>Product List · Inventory · Log Data</span></div><div><strong>Waiting for import</strong><span>{data.waitingForImport} barcode{data.waitingForImport === 1 ? "" : "s"}</span></div><div><strong>Stock locations</strong><span>{locations}</span></div></article>
                </section>
              </>
            ) : activeTab === "inventory" ? <InventoryTable inventory={data.inventory} /> : <TransactionTable transactions={data.transactions} query={query} typeFilter={typeFilter} onQueryChange={setQuery} onTypeChange={setTypeFilter} />}
          </>
        )}
      </div>
    </main>
  );
}
