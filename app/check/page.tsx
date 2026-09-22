import type { Metadata } from "next";
import { StockOperationWorkspace } from "@/app/_components/stock-operation-workspace";

export const metadata: Metadata = { title: "Check Stock — MedStock", description: "Check physical stock against MedStock inventory" };

export default function CheckStockPage() {
  return <StockOperationWorkspace operation="check" />;
}
