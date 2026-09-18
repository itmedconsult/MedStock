import type { Metadata } from "next";
import { DashboardDemo } from "./_components/dashboard-demo";

export const metadata: Metadata = {
  title: "Dashboard Demo — MedStock",
  description: "Inventory movement and transaction dashboard demo",
};

export default function DashboardPage() {
  return <DashboardDemo />;
}
