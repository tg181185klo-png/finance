"use client";

import { useEffect, useMemo, useState } from "react";
import type { Obligation, Transaction } from "@/lib/types";
import PublicReport from "@/components/PublicReport";
import ThemeToggle from "@/components/ThemeToggle";
import { OPERATIONAL_DATA_FROM, OPERATIONAL_DATA_FROM_MONTH } from "@/lib/report-config";
import { clampPeriodFrom, resolvePeriod } from "@/lib/period-filter";
import { currentMonth, monthStartEnd } from "@/lib/utils";

type Props = {
  token: string;
};

export default function OverviewPortal({ token }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [obligations, setObligations] = useState<Record<string, Obligation[]>>({});
  const [viewMonth, setViewMonth] = useState(() => {
    const m = currentMonth();
    return m < OPERATIONAL_DATA_FROM_MONTH ? OPERATIONAL_DATA_FROM_MONTH : m;
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/overview?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "შეცდომა");
        if (cancelled) return;
        setTransactions(data.transactions ?? []);
        setObligations(data.obligations ?? {});
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "შეცდომა");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const period = useMemo(() => {
    const { from, to } = monthStartEnd(viewMonth);
    return clampPeriodFrom(
      resolvePeriod("custom", from, to)
    );
  }, [viewMonth]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        იტვირთება...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="w-full px-3 py-2 sm:px-4 lg:px-6">
        <header className="mb-3 flex items-center gap-2">
          <h1 className="text-sm font-medium text-zinc-300">რეპორტი</h1>
          <input
            type="month"
            aria-label="თვე"
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs focus:border-emerald-500"
            value={viewMonth}
            min={OPERATIONAL_DATA_FROM_MONTH}
            onChange={(e) => setViewMonth(e.target.value)}
          />
          <span className="hidden text-[11px] text-zinc-600 sm:inline">{OPERATIONAL_DATA_FROM}-დან</span>
          <ThemeToggle compact className="ml-auto" />
        </header>

        <PublicReport
          transactions={transactions}
          obligations={obligations}
          month={viewMonth}
          from={period.from}
          to={period.to}
        />
      </div>
    </div>
  );
}
