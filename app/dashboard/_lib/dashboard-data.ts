export type DashboardProduct = {
  name: string;
  sku: string;
  category: string;
  unit: string;
  trackMode: string;
  packageUnit?: string;
  unitsPerPack?: number;
};

export type InventoryItem = {
  id: string;
  sku: string;
  productName: string;
  unit: string;
  location: string;
  status: string;
  quantity: number;
  containerType: string;
  trackMode: string;
  packageUnit?: string;
  unitsPerPack?: number;
};

export type StockTransaction = {
  id: string;
  occurredAt: string;
  type: "IN" | "OUT";
  sku: string;
  productName: string;
  quantity: number;
  balance: number;
  unit: string;
  source: string;
  actor: string;
  action: string;
  reason: string;
  location: string;
};

export type DailyMovement = {
  key: string;
  label: string;
  added: number;
  cut: number;
};

export type SkuStockSummary = {
  sku: string;
  productName: string;
  barcodes: number;
  openContainers: number;
  group: string;
  packageType: string;
  locations: string[];
};

export type DashboardData = {
  products: DashboardProduct[];
  inventory: InventoryItem[];
  transactions: StockTransaction[];
  waitingForImport: number;
  updatedAt: string;
};

export type DashboardSummary = {
  inStockItems: InventoryItem[];
  activeSkus: number;
  quantityOnHand: number;
  stockAdded: number;
  cutOperations: number;
  openContainers: number;
};

export function summarizeDashboard(data: DashboardData): DashboardSummary {
  const inStockItems = data.inventory.filter((item) => item.status === "IN STOCK" && item.quantity > 0);

  return {
    inStockItems,
    activeSkus: new Set(inStockItems.map((item) => item.sku)).size,
    quantityOnHand: inStockItems.length,
    stockAdded: data.transactions.filter((item) => item.type === "IN").length,
    cutOperations: data.transactions.filter((item) => item.type === "OUT").length,
    openContainers: inStockItems.filter((item) => item.containerType === "OPEN").length,
  };
}

export function createSkuStockSummary(inventory: InventoryItem[], products: DashboardProduct[] = []): SkuStockSummary[] {
  const bySku = new Map<string, SkuStockSummary>();

  products.forEach((product) => {
    bySku.set(product.sku, {
      sku: product.sku,
      productName: product.name,
      barcodes: 0,
      openContainers: 0,
      group: product.sku.split("-")[0] || "OTHER",
      packageType: product.packageUnit || product.unit || "Other",
      locations: [],
    });
  });

  inventory
    .forEach((item) => {
      const current = bySku.get(item.sku) ?? {
        sku: item.sku,
        productName: item.productName,
        barcodes: 0,
        openContainers: 0,
        group: item.sku.split("-")[0] || "OTHER",
        packageType: item.packageUnit || item.unit || "Other",
        locations: [],
      };
      if (item.location && !current.locations.includes(item.location)) current.locations.push(item.location);
      if (item.status === "IN STOCK" && item.quantity > 0) {
        current.barcodes += 1;
        if (item.containerType === "OPEN") current.openContainers += 1;
      }
      bySku.set(item.sku, current);
    });

  return [...bySku.values()].map((item) => ({ ...item, locations: item.locations.sort() })).sort((left, right) =>
    right.barcodes - left.barcodes || left.sku.localeCompare(right.sku),
  );
}

export function transactionOperation(transaction: StockTransaction) {
  const operation = `${transaction.action} ${transaction.source}`.toUpperCase();
  if (/IMPORT/.test(operation)) return "IMPORT";
  if (/CUT|SALE|STOCK OUT|USE/.test(operation)) return "CUT";
  return "ADJUSTMENT";
}

export function createDailyMovements(transactions: StockTransaction[], days = 7) {
  const latestDate = transactions.length
    ? new Date(Math.max(...transactions.map((item) => new Date(item.occurredAt).getTime())))
    : new Date();
  const movements: DailyMovement[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(latestDate);
    date.setDate(date.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    const dailyTransactions = transactions.filter((item) => item.occurredAt.slice(0, 10) === key);

    movements.push({
      key,
      label: date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      added: dailyTransactions.filter((item) => item.type === "IN").length,
      cut: dailyTransactions.filter((item) => item.type === "OUT").length,
    });
  }

  return movements;
}
