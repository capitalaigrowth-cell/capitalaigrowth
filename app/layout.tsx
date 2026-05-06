import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Capital AI Growth — Lead System",
  description: "Lead qualification and booking system",
  robots: "noindex, nofollow",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
