import type { Metadata } from "next";
import { Dashboard } from "./_components/dashboard";

export const metadata: Metadata = {
  title: "Dashboard — MedStock",
  description: "Live inventory movement and transaction dashboard",
};

export default function DashboardPage() {
  return <Dashboard />;
}
