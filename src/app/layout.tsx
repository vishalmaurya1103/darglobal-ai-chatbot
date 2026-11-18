import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Property Assistant · DarGlobal & Wasalt",
  description: "AI assistant answering questions about DarGlobal projects and Wasalt property listings.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} antialiased`}>
      <body className="bg-stone-50 font-sans text-stone-900">{children}</body>
    </html>
  );
}
