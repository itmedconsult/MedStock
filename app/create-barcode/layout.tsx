import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Barcode — MedStock",
  description: "Count medical stock and print Brother barcode labels",
};

export default function CreateBarcodeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
