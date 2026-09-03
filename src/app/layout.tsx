import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ფინანსური Dashboard",
  description: "მარტივი ფინანსური აღრიცხვა",
};

const themeInitScript = `
(function(){
  try {
    var t = localStorage.getItem("finance-theme");
    if (t !== "light" && t !== "dark") t = "dark";
    document.documentElement.setAttribute("data-theme", t);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ka" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
