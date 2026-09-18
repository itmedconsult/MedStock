export type DashboardProduct = {
  name: string;
  sku: string;
  date: string;
  category: string;
  unit: string;
  image?: string;
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
  source: "Stock intake" | "Cut Stock";
  actor: string;
};

export type DailyMovement = {
  key: string;
  label: string;
  added: number;
  cut: number;
};

function skuNumber(sku: string) {
  return Array.from(sku).reduce((total, character) => total + character.charCodeAt(0), 0);
}

function dateAtDayOffset(date: string, offset: number) {
  const value = new Date(`${date}T09:00:00`);
  value.setDate(value.getDate() + offset);
  return value;
}

export function createDemoTransactions(products: DashboardProduct[]) {
  const transactions: StockTransaction[] = [];

  products.forEach((product, index) => {
    const seed = skuNumber(product.sku);
    const intakeQuantity = 3 + (seed % 15);
    const addedAt = dateAtDayOffset(product.date, -(index % 7));
    const cutQuantity = index % 3 === 0 ? Math.max(1, Math.floor(intakeQuantity / 3)) : 0;

    transactions.push({
      id: `IN-${product.sku}-${index + 1}`,
      occurredAt: addedAt.toISOString(),
      type: "IN",
      sku: product.sku,
      productName: product.name,
      quantity: intakeQuantity,
      balance: intakeQuantity,
      unit: product.unit,
      source: "Stock intake",
      actor: "Inventory team",
    });

    if (cutQuantity > 0) {
      const cutAt = dateAtDayOffset(product.date, -(index % 4));
      transactions.push({
        id: `OUT-${product.sku}-${index + 1}`,
        occurredAt: cutAt.toISOString(),
        type: "OUT",
        sku: product.sku,
        productName: product.name,
        quantity: -cutQuantity,
        balance: intakeQuantity - cutQuantity,
        unit: product.unit,
        source: "Cut Stock",
        actor: index % 2 === 0 ? "Thonglor" : "Silom",
      });
    }
  });

  return transactions.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
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
      added: dailyTransactions.filter((item) => item.type === "IN").reduce((sum, item) => sum + item.quantity, 0),
      cut: Math.abs(dailyTransactions.filter((item) => item.type === "OUT").reduce((sum, item) => sum + item.quantity, 0)),
    });
  }

  return movements;
}
