import type { Metadata } from "next";
import { Archivo, Instrument_Sans } from "next/font/google";
import "./globals.css";

/**
 * UX Phase 5A type system (free Klavika substitute, no new dependency):
 *   Archivo        → --font-display (uppercase eyebrows/labels/buttons/headlines)
 *   Instrument Sans → --font-body   (sentence-case body copy, 1.6 leading)
 * See tailwind.config.ts for how these variables map to font-display / font-body / font-sans.
 */
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "rootedschools EMS",
  description: "Enrollment Management System for rootedschools",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${archivo.variable} ${instrumentSans.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
