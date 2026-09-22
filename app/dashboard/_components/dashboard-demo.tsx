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
} from "@tabler/icons-react";
import { createDailyMovements, createDemoTransactions, type DashboardProduct } from "../_lib/demo-data";
import { MovementChart } from "./movement-chart";
import { TransactionTable } from "./transaction-table";
import styles from "../dashboard.module.css";

type InventoryResponse = { products?: DashboardProduct[]; updatedAt?: string; error?: string };

export function DashboardDemo() {
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [updatedAt, setUpdatedAt] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "log">("overview");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "IN" | "OUT">("ALL");

  const loadDashboard = async () => {
    setState("loading");
    setError("");
    try {
      const response = await fetch("/api/inventory", { cache: "no-store" });
      const data = await response.json() as InventoryResponse;
      if (!response.ok) throw new Error(data.error || "Unable to load inventory data.");
      setProducts(data.products || []);
      setUpdatedAt(data.updatedAt || new Date().toISOString());
      setState("ready");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load inventory data.");
      setState("error");
    }
  };

  useEffect(() => { void loadDashboard(); }, []);

  const transactions = useMemo(() => createDemoTransactions(products), [products]);
  const dailyMovements = useMemo(() => createDailyMovements(transactions), [transactions]);
  const stockIn = transactions.filter((item) => item.type === "IN").reduce((sum, item) => sum + item.quantity, 0);
  const cutStock = Math.abs(transactions.filter((item) => item.type === "OUT").reduce((sum, item) => sum + item.quantity, 0));
  const categoryCount = new Set(products.map((product) => product.category)).size;
  const recentTransactions = transactions.slice(0, 6);

  return (
    <main className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.brand}><span>MS</span><div><strong>MedStock</strong><small>Analytics demo</small></div></div>
        <nav><button className={activeTab === "overview" ? styles.activeTab : ""} onClick={() => setActiveTab("overview")}><IconChartBar size={18} /> Overview</button><button className={activeTab === "log" ? styles.activeTab : ""} onClick={() => setActiveTab("log")}><IconClipboardList size={18} /> Log_Data</button></nav>
        <div className={styles.headerRight}><span className={styles.demoBadge}>DEMO</span><Link href="/create-barcode"><strong>Create Barcode</strong></Link></div>
      </header>

      <div className={styles.content}>
        <section className={styles.titleRow}>
          <div><p>Inventory intelligence</p><h1>{activeTab === "overview" ? "Stock movement overview" : "Log_Data transactions"}</h1><span>{activeTab === "overview" ? "See when products enter inventory and when stock is cut." : "Append-only movement history for stock intake and Cut Stock."}</span></div>
          <div className={styles.syncBlock}><button onClick={() => void loadDashboard()} disabled={state === "loading"}><IconRefresh className={state === "loading" ? styles.spinning : ""} size={17} /> Refresh data</button><small>{updatedAt ? `Updated ${new Date(updatedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Waiting for data"}</small></div>
        </section>

        {state === "error" ? <section className={styles.errorState}><IconDatabase size={34} /><h2>Dashboard data unavailable</h2><p>{error}</p><button onClick={() => void loadDashboard()}>Try again</button></section> : (
          <>
            <section className={styles.stats}>
              <article><i className={styles.green}><IconPackage size={22} /></i><div><small>Products in inventory</small><strong>{state === "loading" ? "—" : products.length}</strong><span>Active product SKUs</span></div></article>
              <article><i className={styles.blue}><IconArrowUpRight size={22} /></i><div><small>Stock added</small><strong>{state === "loading" ? "—" : stockIn}</strong><span>Demo units received</span></div></article>
              <article><i className={styles.orange}><IconArrowDownRight size={22} /></i><div><small>Cut stock</small><strong>{state === "loading" ? "—" : cutStock}</strong><span>Demo units removed</span></div></article>
              <article><i className={styles.purple}><IconDatabase size={22} /></i><div><small>Categories</small><strong>{state === "loading" ? "—" : categoryCount}</strong><span>Across the catalog</span></div></article>
            </section>

            {activeTab === "overview" ? (
              <>
                <section className={styles.chartCard}>
                  <div className={styles.panelHeading}><div><p>Last 7 activity days</p><h2>Inventory movement</h2></div><div className={styles.legend}><span><i className={styles.addedLegend} /> Product added</span><span><i className={styles.cutLegend} /> Cut stock</span></div></div>
                  <MovementChart data={dailyMovements} />
                </section>

                <section className={styles.overviewGrid}>
                  <article className={styles.activityCard}>
                    <div className={styles.panelHeading}><div><p>Latest activity</p><h2>Recent transactions</h2></div><button onClick={() => setActiveTab("log")}>View Log_Data</button></div>
                    <div className={styles.activityList}>{recentTransactions.map((item) => <div key={item.id}><span className={item.type === "IN" ? styles.activityIn : styles.activityOut}>{item.type === "IN" ? <IconArrowUpRight size={17} /> : <IconArrowDownRight size={17} />}</span><div><strong>{item.productName}</strong><small>{item.sku} · {new Date(item.occurredAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</small></div><b className={item.type === "IN" ? styles.positive : styles.negative}>{item.type === "IN" ? "+" : ""}{item.quantity}</b></div>)}</div>
                  </article>
                  <article className={styles.explainerCard}><span><IconDatabase size={25} /></span><p>Data source</p><h2>Ready for Log Data API</h2><p>The layout already follows the transaction fields used by the Google Sheet: transaction ID, SKU, product, movement, balance, source, and actor.</p><div><strong>Current mode</strong><span>Product List + demo movements</span></div><div><strong>Next integration</strong><span>Read-only Log Data endpoint</span></div></article>
                </section>
              </>
            ) : <TransactionTable transactions={transactions} query={query} typeFilter={typeFilter} onQueryChange={setQuery} onTypeChange={setTypeFilter} />}
          </>
        )}
      </div>
    </main>
  );
}
