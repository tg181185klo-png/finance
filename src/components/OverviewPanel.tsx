"use client";

import { useMemo, useState } from "react";
import type { Branch, BranchCash, Transaction } from "@/lib/types";
import { BRANCHES } from "@/lib/dashboard-data";
import type { ResolvedPeriod } from "@/lib/period-filter";
import { periodFlow, txInPeriod } from "@/lib/period-filter";
import { effectiveTxBranch, txMatchesBranchFilter } from "@/lib/branch-allocation";
import { OPERATIONAL_DATA_FROM_MONTH } from "@/lib/report-config";
import { calcBalances, formatMoney } from "@/lib/utils";
import { isCreditOrder, isCreditOrderActive } from "@/lib/utils";
import TransactionTable from "@/components/TransactionTable";

const scopeBtn = (on: boolean) =>
  `rounded-xl px-4 py-2 text-sm font-medium transition ${
    on ? "bg-emerald-700 text-white" : "border border-zinc-700 text-zinc-400 hover:border-zinc-600"
  }`;

function StatCard({
  label,
  value,
  accent,
  large,
}: {
  label: string;
  value: string;
  accent?: string;
  large?: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 font-semibold ${large ? "text-2xl" : "text-lg"} ${accent ?? "text-zinc-100"}`}>
        {value}
      </p>
    </div>
  );
}

type ViewScope = "company" | Branch;

type Props = {
  transactions: Transaction[];
  branchCash: Record<Branch, BranchCash>;
  period: ResolvedPeriod;
  branchFilter: Branch | "ყველა";
  onDelete: (id: string) => Promise<boolean>;
};

export default function OverviewPanel({
  transactions,
  branchCash,
  period,
  branchFilter,
  onDelete,
}: Props) {
  const [scope, setScope] = useState<ViewScope>("company");
  const from = period.from;
  const to = period.to;

  const branchStats = useMemo(() => {
    return BRANCHES.map((branch) => {
      const flow = periodFlow(transactions, branch, from, to);
      const txs = transactions.filter(
        (t) =>
          effectiveTxBranch(t) === branch &&
          txInPeriod(t.date, from, to) &&
          !(t.type === "sale" && isCreditOrder(t) && isCreditOrderActive(t))
      );
      const bal = calcBalances(transactions, branch, branchCash);
      return { branch, ...flow, ...bal, count: txs.length };
    });
  }, [transactions, branchCash, from, to]);

  const companyFlow = useMemo(() => {
    const flow = periodFlow(transactions, "ყველა", from, to);
    const txs = transactions.filter(
      (t) =>
        txInPeriod(t.date, from, to) &&
        !(t.type === "sale" && isCreditOrder(t) && isCreditOrderActive(t))
    );
    return { ...flow, count: txs.length };
  }, [transactions, from, to]);

  const companyBal = useMemo(
    () => calcBalances(transactions, "ყველა", branchCash),
    [transactions, branchCash]
  );

  const tableRows = useMemo(() => {
    return transactions
      .filter((t) => {
        if (!txInPeriod(t.date, from, to)) return false;
        if (branchFilter !== "ყველა" && !txMatchesBranchFilter(t, branchFilter)) return false;
        if (t.type === "sale" && isCreditOrder(t) && isCreditOrderActive(t)) return false;
        if (scope === "company") return true;
        return effectiveTxBranch(t) === scope;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, scope, from, to, branchFilter]);

  const activeBranch = scope === "company" ? null : branchStats.find((b) => b.branch === scope);

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="mb-3 text-lg font-semibold">მიმოხილვა — ფილიალი ან კომპანია</h2>
        <p className="mb-4 text-xs text-zinc-500">
          პერიოდი: <span className="text-emerald-400">{period.label}</span> · მონაცემები {OPERATIONAL_DATA_FROM_MONTH}-დან
        </p>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={scopeBtn(scope === "company")} onClick={() => setScope("company")}>
            🏢 კომპანია (ჯამი)
          </button>
          {BRANCHES.map((b) => (
            <button key={b} type="button" className={scopeBtn(scope === b)} onClick={() => setScope(b)}>
              {b}
            </button>
          ))}
        </div>
      </div>

      {scope === "company" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="შემოსავალი (ჯამი)" value={formatMoney(companyFlow.revenue)} accent="text-emerald-400" large />
            <StatCard label="ხარჯი (ჯამი)" value={formatMoney(companyFlow.expenses)} accent="text-red-400" large />
            <StatCard
              label="მოგება / ზარალი"
              value={formatMoney(companyFlow.net)}
              accent={companyFlow.net >= 0 ? "text-emerald-400" : "text-red-400"}
              large
            />
            <StatCard label="ტრანზაქციები" value={String(companyFlow.count)} accent="text-zinc-300" large />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="💵 ქეში (ყველა)" value={formatMoney(companyBal.cash)} accent="text-emerald-300" />
            <StatCard label="💳 ბარათი" value={formatMoney(companyBal.card)} accent="text-sky-400" />
            <StatCard label="🏦 ანგარიში" value={formatMoney(companyBal.bank)} accent="text-violet-400" />
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
            <h3 className="mb-3 text-sm font-semibold text-zinc-300">ფილიალების შედარება ({period.label})</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {branchStats.map((b) => (
                <button
                  key={b.branch}
                  type="button"
                  className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 text-left hover:border-emerald-800/50"
                  onClick={() => setScope(b.branch)}
                >
                  <p className="mb-2 font-bold text-zinc-100">{b.branch}</p>
                  <p className="text-sm text-emerald-400">+{formatMoney(b.revenue)}</p>
                  <p className="text-sm text-red-400">-{formatMoney(b.expenses)}</p>
                  <p className={`text-sm font-medium ${b.net >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    ნეტო: {formatMoney(b.net)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{b.count} ჩანაწერი</p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {activeBranch && (
        <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-4">
          <h3 className="mb-3 text-xl font-bold text-emerald-200">{activeBranch.branch}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="შემოსავალი" value={formatMoney(activeBranch.revenue)} accent="text-emerald-400" />
            <StatCard label="ხარჯი" value={formatMoney(activeBranch.expenses)} accent="text-red-400" />
            <StatCard
              label="ნეტო"
              value={formatMoney(activeBranch.net)}
              accent={activeBranch.net >= 0 ? "text-emerald-400" : "text-red-400"}
            />
            <StatCard label="ჩანაწერები" value={String(activeBranch.count)} />
          </div>
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h3 className="mb-2 font-semibold">
          {scope === "company" ? "ტრანზაქციები — კომპანია" : `ტრანზაქციები — ${scope}`}
          <span className="ml-2 text-sm font-normal text-zinc-500">({tableRows.length})</span>
        </h3>
        <TransactionTable rows={tableRows} showBranch={scope === "company"} onDelete={onDelete} />
      </div>
    </section>
  );
}
