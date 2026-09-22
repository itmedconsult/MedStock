import type { Metadata } from "next";
import { ImportWorkspace } from "./_components/import-workspace";

export const metadata: Metadata = {
  title: "Import — MedStock",
  description: "Import stock data into MedStock",
};

export default function ImportPage() {
  return <ImportWorkspace />;
}
