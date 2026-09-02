"use client";

import { useEffect, useMemo, useState } from "react";
import type { Branch, BranchCash, BranchDailyReport, Transaction } from "@/lib/types";
import OverviewPanel from "@/components/OverviewPanel";
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
  const [branchCash, setBranchCash] = useState<Record<string, BranchCash>>({});
  const [branchReports, setBranchReports] = useState<BranchDailyReport[]>([]);
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
        setBranchCash(data.branchCash ?? {});
        setBranchReports(data.branchReports ?? []);
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
      <div className="mx-auto max-w-7xl px-4 py-6">
        <header className="mb-6 border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-bold text-emerald-400">მიმოხილვა — საჯარო რეპორტი</h1>
          <p className="mt-1 text-sm text-zinc-500">
            მხოლოდ საინფორმაციო · მონაცემები {OPERATIONAL_DATA_FROM}-დან · ცვლილება შეუძლებელია
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <p className="mb-1 text-xs text-zinc-500">თვე</p>
              <input
                type="month"
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-emerald-500"
                value={viewMonth}
                min={OPERATIONAL_DATA_FROM_MONTH}
                onChange={(e) => setViewMonth(e.target.value)}
              />
            </div>
            <p className="text-xs text-zinc-600">
              პერიოდი: {period.from} — {period.to}
            </p>
          </div>
        </header>

        <OverviewPanel
          readOnly
          transactions={transactions}
          branchReports={branchReports}
          branchCash={branchCash as Record<Branch, BranchCash>}
          period={period}
        />
      </div>
    </div>
  );
}
