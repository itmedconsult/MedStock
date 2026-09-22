import type { Metadata } from "next";
import { StockOperationWorkspace } from "@/app/_components/stock-operation-workspace";

export const metadata: Metadata = { title: "Cut Stock — MedStock", description: "Record sale or usage from MedStock inventory" };

export default function CutStockPage() {
  return <StockOperationWorkspace operation="cut" />;
}
