"use client";

import { useMemo, useState } from "react";
import type { Branch, BranchCash, Transaction } from "@/lib/types";
import { BRANCHES } from "@/lib/dashboard-data";
import { calcBalances, currentMonth, formatMoney, monthStartEnd } from "@/lib/utils";


const tabBtn = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm ${on ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`;

type Period = "today" | "month" | "all";

function periodRange(period: Period): { from: string; to: string } | null {
  const today = new Date().toISOString().slice(0, 10);
  if (period === "today") return { from: today, to: today };
  if (period === "month") return monthStartEnd(currentMonth());
  return null;
}

function branchFlow(
  tx: Transaction[],
  branch: Branch,
  from?: string,
  to?: string
): { revenue: number; expenses: number; net: number } {
  let revenue = 0;
  let expenses = 0;
  for (const t of tx) {
    const d = t.date.slice(0, 10);
    if (from && d < from) continue;
    if (to && d > to) continue;
    if (t.branch !== branch) continue;
    if (t.type === "sale") revenue += t.amount;
    else expenses += t.amount;
  }
  return { revenue, expenses, net: revenue - expenses };
}

function companyFlow(
  tx: Transaction[],
  from?: string,
  to?: string
): { revenue: number; expenses: number; net: number } {
  let revenue = 0;
  let expenses = 0;
  for (const t of tx) {
    const d = t.date.slice(0, 10);
    if (from && d < from) continue;
    if (to && d > to) continue;
    if (t.type === "sale") revenue += t.amount;
    else expenses += t.amount;
  }
  return { revenue, expenses, net: revenue - expenses };
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-base font-semibold ${accent ?? "text-zinc-100"}`}>{value}</p>
    </div>
  );
}

type Props = {
  transactions: Transaction[];
  branchCash: Record<Branch, BranchCash>;
};

export default function BalancesPanel({ transactions, branchCash }: Props) {
  const [period, setPeriod] = useState<Period>("month");
  const range = periodRange(period);

  const rows = useMemo(() => {
    const from = range?.from;
    const to = range?.to;
    const branchRows = BRANCHES.map((branch) => {
      const flow = branchFlow(transactions, branch, from, to);
      const bal = calcBalances(transactions, branch, branchCash);
      return { branch, ...flow, ...bal };
    });
    const companyFlow_ = companyFlow(transactions, from, to);
    const companyBal = calcBalances(transactions, "ყველა", branchCash);
    return {
      branches: branchRows,
      company: {
        branch: "კომპანია (ჯამი)" as const,
        ...companyFlow_,
        cash: companyBal.cash,
        card: companyBal.card,
        bank: companyBal.bank,
        revenue: companyFlow_.revenue,
        expenses: companyFlow_.expenses,
        net: companyFlow_.net,
        total: companyBal.total,
      },
    };
  }, [transactions, branchCash, range]);

  const periodLabel =
    period === "today"
      ? "დღეს"
      : period === "month"
        ? `თვე (${monthStartEnd().from} — ${monthStartEnd().to})`
        : "ყველა დრო";

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-zinc-500">პერიოდი (შემოსავალი/ხარჯი):</span>
        <button type="button" className={tabBtn(period === "today")} onClick={() => setPeriod("today")}>
          დღეს
        </button>
        <button type="button" className={tabBtn(period === "month")} onClick={() => setPeriod("month")}>
          თვე
        </button>
        <button type="button" className={tabBtn(period === "all")} onClick={() => setPeriod("all")}>
          ყველა
        </button>
        <span className="text-xs text-zinc-600">{periodLabel}</span>
      </div>

      <p className="text-xs text-zinc-500">
        ქეში / ბარათი / ანგარიში — მიმდინარე ბალანსი (საწყისი ნაშთი + ყველა ტრანზაქცია). შემოსავალი და ხარჯი — არჩეული პერიოდის.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {rows.branches.map((r) => (
          <div
            key={r.branch}
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
          >
            <h3 className="mb-4 text-lg font-bold text-zinc-100">{r.branch}</h3>
            <div className="mb-4 space-y-2 border-b border-zinc-800 pb-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{periodLabel}</p>
              <Stat label="შემოსავალი" value={formatMoney(r.revenue)} accent="text-emerald-400" />
              <Stat label="ხარჯი" value={formatMoney(r.expenses)} accent="text-red-400" />
              <Stat
                label="ნეტო"
                value={formatMoney(r.net)}
                accent={r.net >= 0 ? "text-emerald-400" : "text-red-400"}
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">ფული ახლა</p>
              <Stat label="💵 ქეში" value={formatMoney(r.cash)} accent="text-emerald-300" />
              <Stat label="💳 ბარათი" value={formatMoney(r.card)} accent="text-sky-400" />
              <Stat label="🏦 ანგარიში" value={formatMoney(r.bank)} accent="text-violet-400" />
            </div>
          </div>
        ))}

        <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-5 sm:col-span-2 xl:col-span-1">
          <h3 className="mb-4 text-lg font-bold text-emerald-300">კომპანია</h3>
          <div className="mb-4 space-y-2 border-b border-emerald-900/40 pb-4">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600/80">{periodLabel}</p>
            <Stat label="შემოსავალი" value={formatMoney(rows.company.revenue)} accent="text-emerald-400" />
            <Stat label="ხარჯი" value={formatMoney(rows.company.expenses)} accent="text-red-400" />
            <Stat
              label="ნეტო (მოგება/ზარალი)"
              value={formatMoney(rows.company.net)}
              accent={rows.company.net >= 0 ? "text-emerald-400" : "text-red-400"}
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600/80">ჯამური ფული</p>
            <Stat label="💵 ქეში (ყველა)" value={formatMoney(rows.company.cash)} accent="text-emerald-300" />
            <Stat label="💳 ბარათი (ყველა)" value={formatMoney(rows.company.card)} accent="text-sky-400" />
            <Stat label="🏦 ანგარიში (ყველა)" value={formatMoney(rows.company.bank)} accent="text-violet-400" />
            <div className="mt-2 rounded-lg bg-emerald-950/40 px-3 py-2">
              <Stat
                label="სულ (ქეში+ბარათი+ანგარიში)"
                value={formatMoney(rows.company.cash + rows.company.card + rows.company.bank)}
                accent="text-emerald-200"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h3 className="mb-4 font-semibold text-zinc-200">შეჯამებით ცხრილი</h3>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
              <th className="pb-3 pr-4">ობიექტი</th>
              <th className="pb-3 pr-4 text-right">შემოსავალი</th>
              <th className="pb-3 pr-4 text-right">ხარჯი</th>
              <th className="pb-3 pr-4 text-right">ნეტო</th>
              <th className="pb-3 pr-4 text-right">ქეში</th>
              <th className="pb-3 pr-4 text-right">ბარათი</th>
              <th className="pb-3 text-right">ანგარიში</th>
            </tr>
          </thead>
          <tbody>
            {rows.branches.map((r) => (
              <tr key={r.branch} className="border-b border-zinc-800/50">
                <td className="py-3 pr-4 font-medium">{r.branch}</td>
                <td className="py-3 pr-4 text-right text-emerald-400">{formatMoney(r.revenue)}</td>
                <td className="py-3 pr-4 text-right text-red-400">{formatMoney(r.expenses)}</td>
                <td className={`py-3 pr-4 text-right ${r.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {formatMoney(r.net)}
                </td>
                <td className="py-3 pr-4 text-right text-emerald-300">{formatMoney(r.cash)}</td>
                <td className="py-3 pr-4 text-right text-sky-400">{formatMoney(r.card)}</td>
                <td className="py-3 text-right text-violet-400">{formatMoney(r.bank)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-3 pr-4 text-emerald-300">კომპანია (ჯამი)</td>
              <td className="py-3 pr-4 text-right text-emerald-400">{formatMoney(rows.company.revenue)}</td>
              <td className="py-3 pr-4 text-right text-red-400">{formatMoney(rows.company.expenses)}</td>
              <td className={`py-3 pr-4 text-right ${rows.company.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {formatMoney(rows.company.net)}
              </td>
              <td className="py-3 pr-4 text-right text-emerald-300">{formatMoney(rows.company.cash)}</td>
              <td className="py-3 pr-4 text-right text-sky-400">{formatMoney(rows.company.card)}</td>
              <td className="py-3 text-right text-violet-400">{formatMoney(rows.company.bank)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
