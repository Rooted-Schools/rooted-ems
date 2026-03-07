import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
