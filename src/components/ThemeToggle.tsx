"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  persistTheme,
  readStoredTheme,
  type AppTheme,
} from "@/lib/theme";

const btn = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm transition ${
    on
      ? "bg-emerald-700 text-white"
      : "border border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-200"
  }`;

export default function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<AppTheme>("dark");

  useEffect(() => {
    const stored = readStoredTheme();
    setTheme(stored);
    applyTheme(stored);
  }, []);

  function select(next: AppTheme) {
    setTheme(next);
    applyTheme(next);
    persistTheme(next);
  }

  return (
    <div className={`inline-flex items-center gap-1 ${className ?? ""}`} role="group" aria-label="ინტერფეისის ფერი">
      <button type="button" className={btn(theme === "dark")} onClick={() => select("dark")}>
        შავი
      </button>
      <button type="button" className={btn(theme === "light")} onClick={() => select("light")}>
        თეთრი
      </button>
    </div>
  );
}
