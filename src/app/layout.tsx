import type { Metadata } from "next";
import { ThemeProvider } from "@/platform/theme";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "TradingCore - Professional Trading Platform",
  description: "Professional charting, bring-your-own broker APIs, advanced execution, AI assistance, and CoreSpirit scripting — all in your browser.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
