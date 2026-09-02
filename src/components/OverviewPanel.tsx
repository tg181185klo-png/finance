"use client";

import { useMemo, useState } from "react";
import type { Branch, BranchCash, BranchDailyReport, PaymentMethod, Transaction } from "@/lib/types";
import { BRANCHES } from "@/lib/dashboard-data";
import type { ResolvedPeriod } from "@/lib/period-filter";
import { periodFlow, txInPeriod } from "@/lib/period-filter";
import { effectiveTxBranch, txMatchesBranchFilter } from "@/lib/branch-allocation";
import { OPERATIONAL_DATA_FROM, OPERATIONAL_DATA_FROM_MONTH } from "@/lib/report-config";
import { calcBalancesUpToDate, emptyBranchCash, formatDate, formatMoney } from "@/lib/utils";
import { isCreditOrder, isCreditOrderActive } from "@/lib/utils";
import TransactionTable from "@/components/TransactionTable";
import BranchActivityPanel from "@/components/BranchActivityPanel";

const scopeBtn = (on: boolean) =>
  `rounded-xl px-4 py-2 text-sm font-medium transition ${
    on ? "bg-emerald-700 text-white" : "border border-zinc-700 text-zinc-400 hover:border-zinc-600"
  }`;

const filterBtn = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm ${on ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`;

const inputCls = "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm focus:border-emerald-500";

function dayBefore(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function StatCard({
  label,
  value,
  accent,
  large,
  hint,
}: {
  label: string;
  value: string;
  accent?: string;
  large?: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 font-semibold ${large ? "text-2xl" : "text-lg"} ${accent ?? "text-zinc-100"}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-[10px] text-zinc-600">{hint}</p>}
    </div>
  );
}

type ViewScope = "company" | Branch;
type RangeMode = "period" | "day";

type Props = {
  transactions: Transaction[];
  branchReports: BranchDailyReport[];
  branchCash: Record<Branch, BranchCash>;
  period: ResolvedPeriod;
  branchFilter: Branch | "ყველა";
  onDelete: (id: string) => Promise<boolean>;
  onUpdatePayment: (id: string, paymentMethod: PaymentMethod) => Promise<boolean>;
};

export default function OverviewPanel({
  transactions,
  branchReports,
  branchCash,
  period,
  branchFilter,
  onDelete,
  onUpdatePayment,
}: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [scope, setScope] = useState<ViewScope>("company");
  const [rangeMode, setRangeMode] = useState<RangeMode>("period");
  const [selectedDay, setSelectedDay] = useState(today);

  const { from, to, rangeLabel } = useMemo(() => {
    if (rangeMode === "day") {
      return { from: selectedDay, to: selectedDay, rangeLabel: formatDate(selectedDay) };
    }
    return { from: period.from, to: period.to, rangeLabel: period.label };
  }, [rangeMode, selectedDay, period.from, period.to, period.label]);

  const branchStats = useMemo(() => {
    return BRANCHES.map((branch) => {
      const flow = periodFlow(transactions, branch, from, to);
      const txs = transactions.filter(
        (t) =>
          effectiveTxBranch(t) === branch &&
          txInPeriod(t.date, from, to) &&
          !(t.type === "sale" && isCreditOrder(t) && isCreditOrderActive(t))
      );
      const closing = calcBalancesUpToDate(transactions, branch, branchCash, to);
      const opening =
        rangeMode === "day" && selectedDay > OPERATIONAL_DATA_FROM
          ? calcBalancesUpToDate(transactions, branch, branchCash, dayBefore(selectedDay))
          : null;
      const openingCash = branchCash[branch] ?? emptyBranchCash();
      return {
        branch,
        ...flow,
        ...closing,
        opening,
        openingCash,
        count: txs.length,
      };
    });
  }, [transactions, branchCash, from, to, rangeMode, selectedDay]);

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
    () => calcBalancesUpToDate(transactions, "ყველა", branchCash, to),
    [transactions, branchCash, to]
  );

  const companyOpeningBal = useMemo(() => {
    if (rangeMode !== "day" || selectedDay <= OPERATIONAL_DATA_FROM) return null;
    return calcBalancesUpToDate(transactions, "ყველა", branchCash, dayBefore(selectedDay));
  }, [transactions, branchCash, rangeMode, selectedDay]);

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
  const balanceHint =
    rangeMode === "day"
      ? `${formatDate(to)}-ის ბოლომდე`
      : `${formatDate(to)}-ის ბოლომდე (პერიოდის ბოლო)`;

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="mb-3 text-lg font-semibold">მიმოხილვა — ფილიალი ან კომპანია</h2>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-xs text-zinc-500">პერიოდის ტიპი</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={filterBtn(rangeMode === "period")} onClick={() => setRangeMode("period")}>
                მთელი პერიოდი
              </button>
              <button type="button" className={filterBtn(rangeMode === "day")} onClick={() => setRangeMode("day")}>
                კონკრეტული დღე
              </button>
            </div>
          </div>

          {rangeMode === "day" && (
            <div>
              <p className="mb-1 text-xs text-zinc-500">დღე</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  className={inputCls}
                  value={selectedDay}
                  min={OPERATIONAL_DATA_FROM}
                  max={today}
                  onChange={(e) => setSelectedDay(e.target.value)}
                />
                <button type="button" className={filterBtn(selectedDay === today)} onClick={() => setSelectedDay(today)}>
                  დღეს
                </button>
                <button
                  type="button"
                  className={filterBtn(selectedDay === dayBefore(today))}
                  onClick={() => setSelectedDay(dayBefore(today))}
                >
                  გუშინ
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mb-4 text-xs text-zinc-500">
          ნაჩვენები: <span className="text-emerald-400">{rangeLabel}</span>
          {rangeMode === "period" && (
            <span className="text-zinc-600"> · ზედა ზოლი: {period.label}</span>
          )}
          {" · "}მონაცემები {OPERATIONAL_DATA_FROM_MONTH}-დან
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
            <StatCard label="შემოსავალი" value={formatMoney(companyFlow.revenue)} accent="text-emerald-400" large />
            <StatCard label="ხარჯი" value={formatMoney(companyFlow.expenses)} accent="text-red-400" large />
            <StatCard
              label="მოგება / ზარალი"
              value={formatMoney(companyFlow.net)}
              accent={companyFlow.net >= 0 ? "text-emerald-400" : "text-red-400"}
              large
            />
            <StatCard label="ტრანზაქციები" value={String(companyFlow.count)} accent="text-zinc-300" large />
          </div>

          {companyOpeningBal && (
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                label="💵 ქეში (დღის დასაწყისი)"
                value={formatMoney(companyOpeningBal.cash)}
                accent="text-zinc-400"
                hint={formatDate(dayBefore(selectedDay))}
              />
              <StatCard
                label="💳 ბარათი (დღის დასაწყისი)"
                value={formatMoney(companyOpeningBal.card)}
                accent="text-zinc-400"
                hint={formatDate(dayBefore(selectedDay))}
              />
              <StatCard
                label="🏦 ანგარიში (დღის დასაწყისი)"
                value={formatMoney(companyOpeningBal.bank)}
                accent="text-zinc-400"
                hint={formatDate(dayBefore(selectedDay))}
              />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="💵 ქეში" value={formatMoney(companyBal.cash)} accent="text-emerald-300" hint={balanceHint} />
            <StatCard label="💳 ბარათი" value={formatMoney(companyBal.card)} accent="text-sky-400" hint={balanceHint} />
            <StatCard label="🏦 ანგარიში" value={formatMoney(companyBal.bank)} accent="text-violet-400" hint={balanceHint} />
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
            <h3 className="mb-3 text-sm font-semibold text-zinc-300">ფილიალების შედარება ({rangeLabel})</h3>
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
                  <p className="mt-1 text-xs text-emerald-400/80">ქეში: {formatMoney(b.cash)}</p>
                  <p className="text-[10px] text-sky-400/70">ბარათი: {formatMoney(b.card)}</p>
                  <p className="text-[10px] text-violet-400/70">ანგარიში: {formatMoney(b.bank)}</p>
                  <p className="text-xs text-zinc-500">{b.count} ჩანაწერი</p>
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
          {activeBranch.opening && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <StatCard
                label="💵 ქეში (დღის დასაწყისი)"
                value={formatMoney(activeBranch.opening.cash)}
                accent="text-zinc-400"
              />
              <StatCard
                label="💳 ბარათი (დღის დასაწყისი)"
                value={formatMoney(activeBranch.opening.card)}
                accent="text-zinc-400"
              />
              <StatCard
                label="🏦 ანგარიში (დღის დასაწყისი)"
                value={formatMoney(activeBranch.opening.bank)}
                accent="text-zinc-400"
              />
            </div>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <StatCard label="💵 ქეში" value={formatMoney(activeBranch.cash)} accent="text-emerald-300" hint={balanceHint} />
            <StatCard label="💳 ბარათი" value={formatMoney(activeBranch.card)} accent="text-sky-400" hint={balanceHint} />
            <StatCard label="🏦 ანგარიში" value={formatMoney(activeBranch.bank)} accent="text-violet-400" hint={balanceHint} />
          </div>
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h3 className="mb-2 font-semibold">
          {scope === "company" ? "ტრანზაქციები — კომპანია" : `ტრანზაქციები — ${scope}`}
          <span className="ml-2 text-sm font-normal text-zinc-500">
            ({tableRows.length}) · {rangeLabel}
          </span>
        </h3>
        <TransactionTable
          rows={tableRows}
          showBranch={scope === "company"}
          onDelete={onDelete}
          onUpdatePayment={onUpdatePayment}
        />
      </div>

      <BranchActivityPanel
        branchReports={branchReports}
        period={period}
        branchFilter={branchFilter}
        dayFilter={rangeMode === "day" ? selectedDay : undefined}
      />
    </section>
  );
}
