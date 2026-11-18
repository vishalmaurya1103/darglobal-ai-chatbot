import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Fraunces } from "next/font/google";
import "./globals.css";

/** Body text: neutral grotesque. Both families are self-hosted by next/font, so no external origin. */
const sans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

/** Display face: a high-contrast serif gives the product its editorial, premium register. */
const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});

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
  themeColor: "#17130f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} antialiased`}>
      <body className="bg-sand font-sans text-ink-800">{children}</body>
    </html>
  );
}
