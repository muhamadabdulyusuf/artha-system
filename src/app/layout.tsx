import type { Metadata } from "next";
import { FloatingAIAssistant } from "@/components/ai/FloatingAIAssistant";
import { AppFooter } from "@/components/layout/AppFooter";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
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
    <html lang="id" data-theme="dark">
      <body className="min-h-screen">
        <ThemeProvider>
          {children}
          <AppFooter />
          <FloatingAIAssistant />
        </ThemeProvider>
      </body>
    </html>
  );
}
