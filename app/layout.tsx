import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MedStock — Inventory",
  description: "Simple, reliable medical inventory management",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
