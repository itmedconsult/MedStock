import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Inventory — MedStock",
  description: "Count medical stock and print Brother barcode labels",
};

export default function InventoryLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
