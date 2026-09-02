"use client";

import { useMemo } from "react";
import type { Branch, BranchDailyReport } from "@/lib/types";
import { branchSaleBuyerName } from "@/lib/customers";
import { BRANCHES } from "@/lib/dashboard-data";
import type { ResolvedPeriod } from "@/lib/period-filter";
import { formatDate, formatMoney } from "@/lib/utils";

type Props = {
  branchReports: BranchDailyReport[];
  period: ResolvedPeriod;
  branchFilter?: Branch | "ყველა";
  limit?: number;
};

type ActivityItem =
  | { kind: "sale"; date: string; branch: Branch; label: string; amount: number; employee: string; submittedBy: string }
  | { kind: "expense"; date: string; branch: Branch; label: string; amount: number; employee: string; submittedBy: string }
  | { kind: "zero"; date: string; branch: Branch; label: string; employee: string; submittedBy: string };

export default function BranchActivityPanel({
  branchReports,
  period,
  branchFilter = "ყველა",
  limit = 50,
}: Props) {
  const items = useMemo(() => {
    const out: ActivityItem[] = [];
    for (const report of branchReports) {
      if (report.date < period.from || report.date > period.to) continue;
      if (branchFilter !== "ყველა" && report.branch !== branchFilter) continue;
      const submittedBy = report.submittedBy ?? "—";

      for (const sale of report.clientSales ?? []) {
        const total = sale.products.reduce((s, p) => s + (p.amount || 0), 0);
        const driver = sale.driverEmployeeName?.trim() || submittedBy;
        out.push({
          kind: "sale",
          date: report.date,
          branch: report.branch,
          label: branchSaleBuyerName(sale),
          amount: total,
          employee: driver,
          submittedBy,
        });
      }

      for (const ex of report.expenses ?? []) {
        out.push({
          kind: "expense",
          date: report.date,
          branch: report.branch,
          label: `${ex.category}: ${ex.comment}`,
          amount: ex.amount,
          employee: submittedBy,
          submittedBy,
        });
      }

      const hasSales = (report.clientSales ?? []).length > 0;
      const hasExpenses = (report.expenses ?? []).length > 0;
      if (!hasSales && !hasExpenses) {
        out.push({
          kind: "zero",
          date: report.date,
          branch: report.branch,
          label: "ნულოვანი რეპორტი (სამუშაო დღე)",
          employee: submittedBy,
          submittedBy,
        });
      }
    }

    return out
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
  }, [branchReports, period.from, period.to, branchFilter, limit]);

  const byBranch = useMemo(() => {
    const map = new Map<Branch, number>();
    for (const b of BRANCHES) map.set(b, 0);
    for (const r of branchReports) {
      if (r.date < period.from || r.date > period.to) continue;
      map.set(r.branch, (map.get(r.branch) ?? 0) + 1);
    }
    return map;
  }, [branchReports, period.from, period.to]);

  return (
    <section className="rounded-xl border border-teal-900/40 bg-teal-950/15 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-teal-200">ფილიალის ლინკებიდან — აქტივობა</h3>
          <p className="text-xs text-zinc-500">
            გაყიდვები, კლიენტები, ხარჯები · {period.label}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {BRANCHES.map((b) => (
            <span key={b} className="rounded-full border border-zinc-700 px-2 py-0.5 text-zinc-400">
              {b}: {byBranch.get(b) ?? 0} რეპორტი
            </span>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">ამ პერიოდში ფილიალის ლინკებიდან არაფერი არ ჩანს</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                <th className="pb-2 pr-3">თარიღი</th>
                <th className="pb-2 pr-3">ფილიალი</th>
                <th className="pb-2 pr-3">ტიპი</th>
                <th className="pb-2 pr-3">აღწერა</th>
                <th className="pb-2 pr-3">მომზიდავი</th>
                <th className="pb-2 pr-3">გამომგზავნი</th>
                <th className="pb-2 text-right">თანხა</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={`${item.date}-${item.branch}-${item.kind}-${i}`} className="border-b border-zinc-800/50">
                  <td className="py-2 pr-3 whitespace-nowrap">{item.date}</td>
                  <td className="py-2 pr-3">{item.branch}</td>
                  <td className={`py-2 pr-3 ${item.kind === "sale" ? "text-emerald-400" : item.kind === "expense" ? "text-red-400" : "text-zinc-500"}`}>
                    {item.kind === "sale" ? "გაყიდვა" : item.kind === "expense" ? "ხარჯი" : "ნულოვანი"}
                  </td>
                  <td className="py-2 pr-3 max-w-[200px] truncate" title={item.label}>{item.label}</td>
                  <td className="py-2 pr-3 text-violet-300">{item.employee}</td>
                  <td className="py-2 pr-3 text-zinc-500">{item.submittedBy}</td>
                  <td className={`py-2 text-right font-medium ${item.kind === "sale" ? "text-emerald-400" : item.kind === "expense" ? "text-red-400" : "text-zinc-600"}`}>
                    {item.kind === "zero" ? "—" : item.kind === "sale" ? `+${formatMoney(item.amount)}` : `-${formatMoney(item.amount)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
