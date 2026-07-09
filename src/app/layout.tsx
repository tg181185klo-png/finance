import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ფინანსური Dashboard",
  description: "მარტივი ფინანსური აღრიცხვა",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ka">
      <body>{children}</body>
    </html>
  );
}
