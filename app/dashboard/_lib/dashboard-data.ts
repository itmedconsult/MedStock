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
};

export type DailyMovement = {
  key: string;
  label: string;
  added: number;
  cut: number;
};

export type DashboardData = {
  products: DashboardProduct[];
  inventory: InventoryItem[];
  transactions: StockTransaction[];
  waitingForImport: number;
  updatedAt: string;
};

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
      added: dailyTransactions
        .filter((item) => item.type === "IN")
        .reduce((sum, item) => sum + item.quantity, 0),
      cut: Math.abs(dailyTransactions
        .filter((item) => item.type === "OUT")
        .reduce((sum, item) => sum + item.quantity, 0)),
    });
  }

  return movements;
}
