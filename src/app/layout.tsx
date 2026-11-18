import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/** One family for everything; both faces are self-hosted by next/font, so no external origin. */
const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Property Assistant · DarGlobal & Wasalt",
    template: "%s · Property Assistant",
  },
  description:
    "An AI assistant that answers questions about DarGlobal developments and Wasalt listings, with every answer cited back to its source page.",
  applicationName: "Property Assistant",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Property Assistant · DarGlobal & Wasalt",
    description: "Grounded answers about DarGlobal developments and Wasalt listings, with sources on every claim.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} antialiased`}>
      <body className="bg-white font-sans text-ink-800">{children}</body>
    </html>
  );
}
