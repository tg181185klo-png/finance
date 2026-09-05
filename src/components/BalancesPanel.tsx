"use client";

import { useMemo, useState } from "react";
import type { Branch, BranchCash, Employee, PaymentMethod, Transaction } from "@/lib/types";
import { BRANCHES } from "@/lib/dashboard-data";
import { effectiveDepositBranch, effectiveExpenseBranch } from "@/lib/branch-allocation";
import { calcBalances, currentMonth, emptyBranchCash, formatMoney, monthStartEnd, operatingExpenseAmount } from "@/lib/utils";
import { ClickableFlowStat, FlowDrillPanel, useFlowDrill } from "@/components/FlowDrillDown";

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
    if (t.type === "sale") {
      if (t.branch !== branch) continue;
      revenue += t.amount;
    } else if (t.type === "expense") {
      if (effectiveExpenseBranch(t) !== branch) continue;
      expenses += operatingExpenseAmount(t);
    } else if (t.type === "deposit") {
      if (effectiveDepositBranch(t) !== branch) continue;
    }
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
    else if (t.type === "expense") expenses += operatingExpenseAmount(t);
  }
  return { revenue, expenses, net: revenue - expenses };
}

type Props = {
  transactions: Transaction[];
  branchCash: Record<Branch, BranchCash>;
  employees?: Employee[];
  bankLedgerReviewed?: Record<string, string>;
  onDelete: (id: string) => Promise<boolean>;
  onUpdatePayment: (id: string, paymentMethod: PaymentMethod) => Promise<boolean>;
  onUpdateDriver?: (id: string, driverEmployeeId: string, driverEmployeeName: string) => Promise<boolean>;
  onToggleReview?: (ids: string | string[], reviewed: boolean) => Promise<boolean>;
};

export default function BalancesPanel({
  transactions,
  branchCash,
  employees,
  bankLedgerReviewed,
  onDelete,
  onUpdatePayment,
  onUpdateDriver,
  onToggleReview,
}: Props) {
  const [period, setPeriod] = useState<Period>("month");
  const range = periodRange(period);
  const { drill, toggle, close, isActive } = useFlowDrill();

  const drillFrom = range?.from ?? "1970-01-01";
  const drillTo = range?.to ?? "2099-12-31";

  const rows = useMemo(() => {
    const from = range?.from;
    const to = range?.to;
    const branchRows = BRANCHES.map((branch) => {
      const flow = branchFlow(transactions, branch, from, to);
      const bal = calcBalances(transactions, branch, branchCash);
      const opening = branchCash?.[branch] ?? emptyBranchCash();
      return { branch, ...flow, ...bal, opening };
    });
    const companyFlow_ = companyFlow(transactions, from, to);
    const companyBal = calcBalances(transactions, "ყველა", branchCash);
    const companyOpening = BRANCHES.reduce(
      (acc, b) => {
        const o = branchCash?.[b] ?? emptyBranchCash();
        acc.cash += o.cash;
        acc.card += o.card;
        acc.bank += o.bank;
        return acc;
      },
      emptyBranchCash()
    );
    return {
      branches: branchRows,
      company: {
        branch: "კომპანია (ჯამი)" as const,
        ...companyFlow_,
        cash: companyBal.cash,
        card: companyBal.card,
        bank: companyBal.bank,
        opening: companyOpening,
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

  function drillToggle(kind: "revenue" | "expense", scope: Branch | "ყველა") {
    toggle({ kind, scope, from: drillFrom, to: drillTo, rangeLabel: periodLabel });
  }

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
          <div key={r.branch} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <h3 className="mb-4 text-lg font-bold text-zinc-100">{r.branch}</h3>
            <div className="mb-4 space-y-2 border-b border-zinc-800 pb-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{periodLabel}</p>
              <ClickableFlowStat
                variant="inline"
                label="შემოსავალი"
                value={formatMoney(r.revenue)}
                accent="text-emerald-400"
                onClick={() => drillToggle("revenue", r.branch)}
                active={isActive("revenue", r.branch, drillFrom, drillTo)}
              />
              <ClickableFlowStat
                variant="inline"
                label="ხარჯი"
                value={formatMoney(r.expenses)}
                accent="text-red-400"
                onClick={() => drillToggle("expense", r.branch)}
                active={isActive("expense", r.branch, drillFrom, drillTo)}
              />
              <div>
                <p className="text-xs text-zinc-500">ნეტო</p>
                <p className={`text-base font-semibold ${r.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {formatMoney(r.net)}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">საწყისი ნაშთი</p>
              <p className="text-xs text-zinc-500">💵 ქეში</p>
              <p className="text-base font-semibold text-zinc-400">{formatMoney(r.opening.cash)}</p>
              <p className="text-xs text-zinc-500">💳 ბარათი</p>
              <p className="text-base font-semibold text-zinc-400">{formatMoney(r.opening.card)}</p>
              <p className="text-xs text-zinc-500">🏦 ანგარიში</p>
              <p className="text-base font-semibold text-zinc-400">{formatMoney(r.opening.bank)}</p>
            </div>
            <div className="mt-3 space-y-2 border-t border-zinc-800 pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">ფული ახლა</p>
              <p className="text-xs text-zinc-500">💵 ქეში</p>
              <p className="text-base font-semibold text-emerald-300">{formatMoney(r.cash)}</p>
              <p className="text-xs text-zinc-500">💳 ბარათი</p>
              <p className="text-base font-semibold text-sky-400">{formatMoney(r.card)}</p>
              <p className="text-xs text-zinc-500">🏦 ანგარიში</p>
              <p className="text-base font-semibold text-violet-400">{formatMoney(r.bank)}</p>
            </div>
          </div>
        ))}

        <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-5 sm:col-span-2 xl:col-span-1">
          <h3 className="mb-4 text-lg font-bold text-emerald-300">კომპანია</h3>
          <div className="mb-4 space-y-2 border-b border-emerald-900/40 pb-4">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600/80">{periodLabel}</p>
            <ClickableFlowStat
              variant="inline"
              label="შემოსავალი"
              value={formatMoney(rows.company.revenue)}
              accent="text-emerald-400"
              onClick={() => drillToggle("revenue", "ყველა")}
              active={isActive("revenue", "ყველა", drillFrom, drillTo)}
            />
            <ClickableFlowStat
              variant="inline"
              label="ხარჯი"
              value={formatMoney(rows.company.expenses)}
              accent="text-red-400"
              onClick={() => drillToggle("expense", "ყველა")}
              active={isActive("expense", "ყველა", drillFrom, drillTo)}
            />
            <div>
              <p className="text-xs text-zinc-500">ნეტო (მოგება/ზარალი)</p>
              <p
                className={`text-base font-semibold ${rows.company.net >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {formatMoney(rows.company.net)}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600/80">საწყისი ნაშთი</p>
            <p className="text-xs text-zinc-500">💵 ქეში (ყველა)</p>
            <p className="text-base font-semibold text-zinc-400">{formatMoney(rows.company.opening.cash)}</p>
            <p className="text-xs text-zinc-500">💳 ბარათი (ყველა)</p>
            <p className="text-base font-semibold text-zinc-400">{formatMoney(rows.company.opening.card)}</p>
            <p className="text-xs text-zinc-500">🏦 ანგარიში (ყველა)</p>
            <p className="text-base font-semibold text-zinc-400">{formatMoney(rows.company.opening.bank)}</p>
          </div>
          <div className="mt-3 space-y-2 border-t border-emerald-900/40 pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600/80">ჯამური ფული</p>
            <p className="text-xs text-zinc-500">💵 ქეში (ყველა)</p>
            <p className="text-base font-semibold text-emerald-300">{formatMoney(rows.company.cash)}</p>
            <p className="text-xs text-zinc-500">💳 ბარათი (ყველა)</p>
            <p className="text-base font-semibold text-sky-400">{formatMoney(rows.company.card)}</p>
            <p className="text-xs text-zinc-500">🏦 ანგარიში (ყველა)</p>
            <p className="text-base font-semibold text-violet-400">{formatMoney(rows.company.bank)}</p>
            <div className="mt-2 rounded-lg bg-emerald-950/40 px-3 py-2">
              <p className="text-xs text-zinc-500">სულ (ქეში+ბარათი+ანგარიში)</p>
              <p className="text-base font-semibold text-emerald-200">
                {formatMoney(rows.company.cash + rows.company.card + rows.company.bank)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <FlowDrillPanel
        drill={drill}
        transactions={transactions}
        onClose={close}
        employees={employees}
        bankLedgerReviewed={bankLedgerReviewed}
        onDelete={onDelete}
        onUpdatePayment={onUpdatePayment}
        onUpdateDriver={onUpdateDriver}
        onToggleReview={onToggleReview}
      />

      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h3 className="mb-4 font-semibold text-zinc-200">შეჯამებით ცხრილი</h3>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
              <th className="pb-3 pr-4">ობიექტი</th>
              <th className="pb-3 pr-4 text-right">შემოსავალი</th>
              <th className="pb-3 pr-4 text-right">ხარჯი</th>
              <th className="pb-3 pr-4 text-right">ნეტო</th>
              <th className="pb-3 pr-4 text-right">საწყისი ქეში</th>
              <th className="pb-3 pr-4 text-right">ქეში</th>
              <th className="pb-3 pr-4 text-right">ბარათი</th>
              <th className="pb-3 text-right">ანგარიში</th>
            </tr>
          </thead>
          <tbody>
            {rows.branches.map((r) => (
              <tr key={r.branch} className="border-b border-zinc-800/50">
                <td className="py-3 pr-4 font-medium">{r.branch}</td>
                <td className="py-3 pr-4 text-right">
                  <button
                    type="button"
                    className="text-emerald-400 hover:underline"
                    onClick={() => drillToggle("revenue", r.branch)}
                  >
                    {formatMoney(r.revenue)}
                  </button>
                </td>
                <td className="py-3 pr-4 text-right">
                  <button
                    type="button"
                    className="text-red-400 hover:underline"
                    onClick={() => drillToggle("expense", r.branch)}
                  >
                    {formatMoney(r.expenses)}
                  </button>
                </td>
                <td className={`py-3 pr-4 text-right ${r.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {formatMoney(r.net)}
                </td>
                <td className="py-3 pr-4 text-right text-zinc-500">{formatMoney(r.opening.cash)}</td>
                <td className="py-3 pr-4 text-right text-emerald-300">{formatMoney(r.cash)}</td>
                <td className="py-3 pr-4 text-right text-sky-400">{formatMoney(r.card)}</td>
                <td className="py-3 text-right text-violet-400">{formatMoney(r.bank)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-3 pr-4 text-emerald-300">კომპანია (ჯამი)</td>
              <td className="py-3 pr-4 text-right">
                <button
                  type="button"
                  className="text-emerald-400 hover:underline"
                  onClick={() => drillToggle("revenue", "ყველა")}
                >
                  {formatMoney(rows.company.revenue)}
                </button>
              </td>
              <td className="py-3 pr-4 text-right">
                <button
                  type="button"
                  className="text-red-400 hover:underline"
                  onClick={() => drillToggle("expense", "ყველა")}
                >
                  {formatMoney(rows.company.expenses)}
                </button>
              </td>
              <td className={`py-3 pr-4 text-right ${rows.company.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {formatMoney(rows.company.net)}
              </td>
              <td className="py-3 pr-4 text-right text-zinc-500">{formatMoney(rows.company.opening.cash)}</td>
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
