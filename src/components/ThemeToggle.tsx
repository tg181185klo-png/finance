"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  persistTheme,
  readStoredTheme,
  type AppTheme,
} from "@/lib/theme";

function btn(on: boolean, compact: boolean) {
  return compact
    ? `rounded px-1.5 py-0.5 text-[11px] leading-none ${
        on ? "bg-emerald-700 text-white" : "border border-zinc-700 text-zinc-500 hover:text-zinc-200"
      }`
    : `rounded-lg px-2.5 py-1.5 text-xs sm:px-3 sm:text-sm transition min-h-9 ${
        on
          ? "bg-emerald-700 text-white"
          : "border border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-200"
      }`;
}

export default function ThemeToggle({ className, compact = false }: { className?: string; compact?: boolean }) {
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
      <button type="button" className={btn(theme === "dark", compact)} onClick={() => select("dark")}>
        შავი
      </button>
      <button type="button" className={btn(theme === "light", compact)} onClick={() => select("light")}>
        თეთრი
      </button>
    </div>
  );
}
