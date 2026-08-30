"use client";

import { useMemo, useState } from "react";
import type { Branch, BranchCash, Transaction } from "@/lib/types";
import { BRANCHES } from "@/lib/dashboard-data";
import { calcBalances, currentMonth, formatMoney, monthStartEnd } from "@/lib/utils";
import { isCreditOrder, isCreditOrderActive } from "@/lib/utils";
import TransactionTable from "@/components/TransactionTable";

type ViewScope = "company" | Branch;
type Period = "today" | "month" | "all";

const tabBtn = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium ${on ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`;
const scopeBtn = (on: boolean) =>
  `rounded-xl px-4 py-2 text-sm font-medium transition ${
    on ? "bg-emerald-700 text-white" : "border border-zinc-700 text-zinc-400 hover:border-zinc-600"
  }`;

function periodRange(period: Period): { from: string; to: string } | null {
  const today = new Date().toISOString().slice(0, 10);
  if (period === "today") return { from: today, to: today };
  if (period === "month") return monthStartEnd(currentMonth());
  return null;
}

function inPeriod(date: string, from?: string, to?: string) {
  const d = date.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function flowForTxs(txs: Transaction[]) {
  let revenue = 0;
  let expenses = 0;
  for (const t of txs) {
    if (t.type === "sale") revenue += t.amount;
    else expenses += t.amount;
  }
  return { revenue, expenses, net: revenue - expenses };
}

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

type Props = {
  transactions: Transaction[];
  branchCash: Record<Branch, BranchCash>;
  onDelete: (id: string, pin: string) => Promise<boolean>;
};

export default function OverviewPanel({
  transactions,
  branchCash,
  onDelete,
}: Props) {
  const [scope, setScope] = useState<ViewScope>("company");
  const [period, setPeriod] = useState<Period>("month");
  const range = periodRange(period);
  const from = range?.from;
  const to = range?.to;

  const periodLabel =
    period === "today" ? "დღეს" : period === "month" ? "მიმდინარე თვე" : "ყველა დრო";

  const branchStats = useMemo(() => {
    return BRANCHES.map((branch) => {
      const txs = transactions.filter(
        (t) =>
          t.branch === branch &&
          inPeriod(t.date, from, to) &&
          !(t.type === "sale" && isCreditOrder(t) && isCreditOrderActive(t))
      );
      const flow = flowForTxs(txs);
      const bal = calcBalances(transactions, branch, branchCash);
      return { branch, ...flow, ...bal, count: txs.length };
    });
  }, [transactions, branchCash, from, to]);

  const companyFlow = useMemo(() => {
    const txs = transactions.filter(
      (t) =>
        inPeriod(t.date, from, to) &&
        !(t.type === "sale" && isCreditOrder(t) && isCreditOrderActive(t))
    );
    return { ...flowForTxs(txs), count: txs.length };
  }, [transactions, from, to]);

  const companyBal = useMemo(
    () => calcBalances(transactions, "ყველა", branchCash),
    [transactions, branchCash]
  );

  const tableRows = useMemo(() => {
    return transactions
      .filter((t) => {
        if (!inPeriod(t.date, from, to)) return false;
        if (t.type === "sale" && isCreditOrder(t) && isCreditOrderActive(t)) return false;
        if (scope === "company") return true;
        return t.branch === scope;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, scope, from, to]);

  const activeBranch = scope === "company" ? null : branchStats.find((b) => b.branch === scope);

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="mb-3 text-lg font-semibold">მიმოხილვა — ფილიალი ან კომპანია</h2>
        <p className="mb-4 text-xs text-zinc-500">
          აირჩიეთ ფილიალი ცალკე ნახვისთვის, ან „კომპანია“ ჯამური შემოსავალი/ხარჯისთვის. ქვემოთ — ყველა ტრანზაქცია.
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" className={scopeBtn(scope === "company")} onClick={() => setScope("company")}>
            🏢 კომპანია (ჯამი)
          </button>
          {BRANCHES.map((b) => (
            <button key={b} type="button" className={scopeBtn(scope === b)} onClick={() => setScope(b)}>
              {b}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="self-center text-xs text-zinc-500">პერიოდი:</span>
          <button type="button" className={tabBtn(period === "today")} onClick={() => setPeriod("today")}>
            დღეს
          </button>
          <button type="button" className={tabBtn(period === "month")} onClick={() => setPeriod("month")}>
            თვე
          </button>
          <button type="button" className={tabBtn(period === "all")} onClick={() => setPeriod("all")}>
            ყველა
          </button>
          <span className="self-center text-xs text-zinc-600">{periodLabel}</span>
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
            <h3 className="mb-3 text-sm font-semibold text-zinc-300">ფილიალების შედარება ({periodLabel})</h3>
            <div className="grid gap-3 sm:grid-cols-3">
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
                  <p className="mt-1 text-xs text-zinc-500">ქეში: {formatMoney(b.cash)} · {b.count} ჩანაწერი</p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {activeBranch && (
        <>
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
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <StatCard label="💵 ქეში" value={formatMoney(activeBranch.cash)} accent="text-emerald-300" />
              <StatCard label="💳 ბარათი" value={formatMoney(activeBranch.card)} accent="text-sky-400" />
              <StatCard label="🏦 ანგარიში" value={formatMoney(activeBranch.bank)} accent="text-violet-400" />
            </div>
          </div>
        </>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h3 className="mb-2 font-semibold">
          {scope === "company" ? "ყველა ტრანზაქცია — კომპანია" : `ტრანზაქციები — ${scope}`}
          <span className="ml-2 text-sm font-normal text-zinc-500">({tableRows.length})</span>
        </h3>
        <p className="mb-4 text-xs text-zinc-500">
          წასაშლელად: შეიყვანეთ ადმინ კოდი უჯრაში და დააჭირეთ Enter.
        </p>
        <TransactionTable
          rows={tableRows}
          showBranch={scope === "company"}
          onDelete={onDelete}
        />
      </div>
    </section>
  );
}
