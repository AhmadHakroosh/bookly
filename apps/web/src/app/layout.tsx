import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TopProgress } from "@/components/top-progress";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

// Static here so routes without a workspace (404, setup) prerender; the public layout adds per-workspace metadata.
export const metadata: Metadata = {
  title: { default: "Bookly", template: "%s — Bookly" },
  description:
    "Self-hostable scheduling: booking pages, calendar sync, Meet, Zoom, Teams and Bookly video.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body
        // Browser extensions (Grammarly and friends) add attributes here before hydration.
        suppressHydrationWarning
        className="flex min-h-full flex-col bg-background font-sans text-foreground"
      >
        <ThemeProvider>
          <Suspense fallback={null}>
            <TopProgress />
          </Suspense>
          {/* Everything below depends on the request host (tenant), so it streams in. */}
          <Suspense fallback={null}>{children}</Suspense>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
