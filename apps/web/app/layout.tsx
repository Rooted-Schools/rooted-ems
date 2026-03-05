import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rooted EMS",
  description: "Enrollment Management System for Rooted School Foundation",
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
