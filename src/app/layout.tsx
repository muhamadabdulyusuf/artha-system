import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Artha System",
  description: "Inventory management — Abdul Company",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
