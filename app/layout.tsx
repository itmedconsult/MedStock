import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MedStock — Dashboard",
  description: "Medical inventory movement and barcode operations dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
