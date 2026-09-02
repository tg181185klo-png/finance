"use client";

import { useMemo, useState } from "react";
import type { Branch, BranchCash, BranchDailyReport, PaymentMethod, Transaction } from "@/lib/types";
import { BRANCHES } from "@/lib/dashboard-data";
import type { ResolvedPeriod } from "@/lib/period-filter";
import { periodFlow, txInPeriod } from "@/lib/period-filter";
import { effectiveTxBranch } from "@/lib/branch-allocation";
import { OPERATIONAL_DATA_FROM, OPERATIONAL_DATA_FROM_MONTH } from "@/lib/report-config";
import { calcBalancesUpToDate, emptyBranchCash, formatDate, formatMoney } from "@/lib/utils";
import {
  computeScopePeriodStats,
  KUTAISI_DISTRIB_BRANCHES,
  KUTAISI_DISTRIB_LABEL,
  txMatchesFlowScope,
  type FlowBranchScope,
  type FlowDetailKind,
  type ScopePeriodStats,
} from "@/lib/flow-detail";
import { ClickableFlowStat, FlowDrillPanel, useFlowDrill } from "@/components/FlowDrillDown";
import TransactionTable from "@/components/TransactionTable";
import BranchActivityPanel from "@/components/BranchActivityPanel";

const scopeBtn = (on: boolean) =>
  `rounded-xl px-4 py-2 text-sm font-medium transition ${
    on ? "bg-emerald-700 text-white" : "border border-zinc-700 text-zinc-400 hover:border-zinc-600"
  }`;

const filterBtn = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm ${on ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`;

const inputCls = "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm focus:border-emerald-500";

type ViewScope = "company" | Branch | typeof KUTAISI_DISTRIB_LABEL;
type RangeMode = "period" | "day";

function toFlowScope(scope: ViewScope): FlowBranchScope {
  return scope === "company" ? "ყველა" : scope;
}

function txMatchesScope(t: Transaction, scope: ViewScope) {
  return txMatchesFlowScope(t, toFlowScope(scope));
}

function dayBefore(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function scopeToBranches(scope: ViewScope): Branch[] | undefined {
  if (scope === "company") return undefined;
  if (scope === KUTAISI_DISTRIB_LABEL) return [...KUTAISI_DISTRIB_BRANCHES];
  return [scope];
}

function scopeLabel(scope: ViewScope) {
  if (scope === "company") return "კომპანია";
  return scope;
}

type BreakdownDrill = {
  onDrill: (kind: FlowDetailKind, scope: ViewScope) => void;
  drillActive: (kind: FlowDetailKind, scope: ViewScope) => boolean;
};

function OverviewBreakdown({
  stats,
  cashBalance,
  cardBalance,
  scope,
  balanceHint,
  compact,
  drill,
}: {
  stats: ScopePeriodStats;
  cashBalance: number;
  cardBalance: number;
  scope: ViewScope;
  balanceHint?: string;
  compact?: boolean;
  drill: BreakdownDrill;
}) {
  const cell = (
    kind: FlowDetailKind,
    label: string,
    value: number,
    accent: string,
    hint?: string
  ) => (
    <ClickableFlowStat
      key={kind}
      label={label}
      value={formatMoney(value)}
      accent={accent}
      hint={hint}
      large={!compact && kind === "revenue"}
      onClick={() => drill.onDrill(kind, scope)}
      active={drill.drillActive(kind, scope)}
    />
  );

  return (
    <div className={`grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}`}>
      {cell("revenue", "მთლიანი შემოსავალი", stats.revenueTotal, "text-emerald-400")}
      {cell("revenue_cash", "შემოსავალი ქეში", stats.revenueCash, "text-emerald-300")}
      {cell("revenue_card", "შემოსავალი ბარათი", stats.revenueCard, "text-sky-400")}
      {cell("expense_cash", "ხარჯი ქეში", stats.expenseCash, "text-red-400")}
      {cell("expense_card", "ხარჯი ბარათი", stats.expenseCard, "text-red-300")}
      {cell("balance_cash", "ნაშთი ქეში", cashBalance, "text-emerald-300", balanceHint)}
      {cell("balance_card", "ნაშთი ბარათი", cardBalance, "text-sky-400", balanceHint)}
      {!compact && (
        <>
          <ClickableFlowStat
            label="ოპ. ხარჯი (ჯამი)"
            value={formatMoney(stats.expenseOperating)}
            accent="text-red-400"
            onClick={() => drill.onDrill("expense", scope)}
            active={drill.drillActive("expense", scope)}
          />
          <ClickableFlowStat
            label="მოგება / ზარალი"
            value={formatMoney(stats.net)}
            accent={stats.net >= 0 ? "text-emerald-400" : "text-red-400"}
          />
        </>
      )}
    </div>
  );
}

function buildGroupStats(
  transactions: Transaction[],
  branchCash: Record<Branch, BranchCash>,
  branches: Branch[],
  from: string,
  to: string,
  rangeMode: RangeMode,
  selectedDay: string
) {
  let revenue = 0;
  let expenses = 0;
  let count = 0;
  let cash = 0;
  let card = 0;
  let bank = 0;
  let opening: { cash: number; card: number; bank: number } | null = null;

  for (const branch of branches) {
    const flow = periodFlow(transactions, branch, from, to);
    revenue += flow.revenue;
    expenses += flow.expenses;
    count += flow.count;

    const closing = calcBalancesUpToDate(transactions, branch, branchCash, to);
    cash += closing.cash;
    card += closing.card;
    bank += closing.bank;

    if (rangeMode === "day" && selectedDay > OPERATIONAL_DATA_FROM) {
      const op = calcBalancesUpToDate(transactions, branch, branchCash, dayBefore(selectedDay));
      if (!opening) opening = { cash: 0, card: 0, bank: 0 };
      opening.cash += op.cash;
      opening.card += op.card;
      opening.bank += op.bank;
    }
  }

  return {
    revenue,
    expenses,
    net: revenue - expenses,
    count,
    cash,
    card,
    bank,
    opening,
  };
}

type Props = {
  transactions: Transaction[];
  branchReports: BranchDailyReport[];
  branchCash: Record<Branch, BranchCash>;
  period: ResolvedPeriod;
  onDelete: (id: string) => Promise<boolean>;
  onUpdatePayment: (id: string, paymentMethod: PaymentMethod) => Promise<boolean>;
};

export default function OverviewPanel({
  transactions,
  branchReports,
  branchCash,
  period,
  onDelete,
  onUpdatePayment,
}: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [scope, setScope] = useState<ViewScope>("company");
  const [rangeMode, setRangeMode] = useState<RangeMode>("period");
  const [selectedDay, setSelectedDay] = useState(today);
  const { drill, toggle, close, isActive } = useFlowDrill();

  const { from, to, rangeLabel } = useMemo(() => {
    if (rangeMode === "day") {
      return { from: selectedDay, to: selectedDay, rangeLabel: formatDate(selectedDay) };
    }
    return { from: period.from, to: period.to, rangeLabel: period.label };
  }, [rangeMode, selectedDay, period.from, period.to, period.label]);

  function toggleDetail(kind: FlowDetailKind, detailScope: ViewScope) {
    toggle({ kind, scope: toFlowScope(detailScope), from, to, rangeLabel });
  }

  function drillActive(kind: FlowDetailKind, detailScope: ViewScope) {
    return isActive(kind, toFlowScope(detailScope), from, to);
  }

  const branchStats = useMemo(() => {
    return BRANCHES.map((branch) => {
      const flow = periodFlow(transactions, branch, from, to);
      const channel = computeScopePeriodStats(transactions, branch, from, to);
      const txs = transactions.filter(
        (t) => effectiveTxBranch(t) === branch && txInPeriod(t.date, from, to)
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
        channel,
        ...closing,
        opening,
        openingCash,
        count: txs.length,
      };
    });
  }, [transactions, branchCash, from, to, rangeMode, selectedDay]);

  const companyChannelStats = useMemo(
    () => computeScopePeriodStats(transactions, "ყველა", from, to),
    [transactions, from, to]
  );

  const kutaisiDistribChannelStats = useMemo(
    () => computeScopePeriodStats(transactions, KUTAISI_DISTRIB_LABEL, from, to),
    [transactions, from, to]
  );

  const kutaisiDistribStats = useMemo(
    () =>
      buildGroupStats(
        transactions,
        branchCash,
        KUTAISI_DISTRIB_BRANCHES,
        from,
        to,
        rangeMode,
        selectedDay
      ),
    [transactions, branchCash, from, to, rangeMode, selectedDay]
  );

  const companyBal = useMemo(
    () => calcBalancesUpToDate(transactions, "ყველა", branchCash, to),
    [transactions, branchCash, to]
  );

  const tableRows = useMemo(() => {
    return transactions
      .filter((t) => txInPeriod(t.date, from, to) && txMatchesScope(t, scope))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, scope, from, to]);

  const activityScopeBranches = useMemo(() => scopeToBranches(scope), [scope]);

  const activeBranch =
    scope === "company" || scope === KUTAISI_DISTRIB_LABEL
      ? null
      : branchStats.find((b) => b.branch === scope);
  const activeGroup = scope === KUTAISI_DISTRIB_LABEL ? kutaisiDistribStats : null;
  const balanceHint =
    rangeMode === "day"
      ? `${formatDate(to)}-ის ბოლომდე`
      : `${formatDate(from)} — ${formatDate(to)} პერიოდის ბოლო`;

  const txSectionHint =
    rangeMode === "day"
      ? `${scopeLabel(scope)} · ${formatDate(selectedDay)} — იმ დღის ყველა ტრანზაქცია`
      : `${scopeLabel(scope)} · ${rangeLabel} — პერიოდის ყველა ტრანზაქცია`;

  const detailDrillPanel = (
    <FlowDrillPanel
      drill={drill}
      transactions={transactions}
      onClose={close}
      onDelete={onDelete}
      onUpdatePayment={onUpdatePayment}
    />
  );

  const breakdownDrill: BreakdownDrill = {
    onDrill: toggleDetail,
    drillActive,
  };

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
          <button
            type="button"
            className={scopeBtn(scope === KUTAISI_DISTRIB_LABEL)}
            onClick={() => setScope(KUTAISI_DISTRIB_LABEL)}
          >
            {KUTAISI_DISTRIB_LABEL}
          </button>
        </div>
      </div>

      {scope === "company" && (
        <>
          <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-4">
            <h3 className="mb-3 text-lg font-semibold text-emerald-200">კომპანია (ჯამი) · {rangeLabel}</h3>
            <OverviewBreakdown
              stats={companyChannelStats}
              cashBalance={companyBal.cash}
              cardBalance={companyBal.card}
              scope="company"
              balanceHint={balanceHint}
              drill={breakdownDrill}
            />
          </div>

          {detailDrillPanel}

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
            <h3 className="mb-3 text-sm font-semibold text-zinc-300">ობიექტებით — {rangeLabel}</h3>
            <div className="grid gap-4 lg:grid-cols-2">
              {branchStats.map((b) => (
                <div
                  key={b.branch}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="text-left font-bold text-zinc-100 hover:text-emerald-300"
                      onClick={() => setScope(b.branch)}
                    >
                      {b.branch}
                    </button>
                    <span className="text-xs text-zinc-500">{b.count} ჩანაწერი</span>
                  </div>
                  <OverviewBreakdown
                    stats={b.channel}
                    cashBalance={b.cash}
                    cardBalance={b.card}
                    scope={b.branch}
                    balanceHint={balanceHint}
                    compact
                    drill={breakdownDrill}
                  />
                </div>
              ))}
              <div className="rounded-xl border border-violet-900/50 bg-violet-950/30 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="text-left font-bold text-violet-200 hover:text-violet-100"
                    onClick={() => setScope(KUTAISI_DISTRIB_LABEL)}
                  >
                    {KUTAISI_DISTRIB_LABEL}
                  </button>
                  <span className="text-xs text-zinc-500">{kutaisiDistribStats.count} ჩანაწერი</span>
                </div>
                <OverviewBreakdown
                  stats={kutaisiDistribChannelStats}
                  cashBalance={kutaisiDistribStats.cash}
                  cardBalance={kutaisiDistribStats.card}
                  scope={KUTAISI_DISTRIB_LABEL}
                  balanceHint={balanceHint}
                  compact
                  drill={breakdownDrill}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {activeBranch && (
        <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-4">
          <h3 className="mb-3 text-xl font-bold text-emerald-200">
            {activeBranch.branch} · {rangeLabel}
          </h3>
          <OverviewBreakdown
            stats={activeBranch.channel}
            cashBalance={activeBranch.cash}
            cardBalance={activeBranch.card}
            scope={activeBranch.branch}
            balanceHint={balanceHint}
            drill={breakdownDrill}
          />
          <p className="mt-3 text-xs text-zinc-500">{activeBranch.count} ჩანაწერი პერიოდში</p>
          {detailDrillPanel}
        </div>
      )}

      {activeGroup && (
        <div className="rounded-xl border border-violet-900/40 bg-violet-950/20 p-4">
          <h3 className="mb-1 text-xl font-bold text-violet-200">{KUTAISI_DISTRIB_LABEL}</h3>
          <p className="mb-3 text-xs text-violet-300/70">ქუთაისი და დისტრიბუცია ერთად · {rangeLabel}</p>
          <OverviewBreakdown
            stats={kutaisiDistribChannelStats}
            cashBalance={activeGroup.cash}
            cardBalance={activeGroup.card}
            scope={KUTAISI_DISTRIB_LABEL}
            balanceHint={balanceHint}
            drill={breakdownDrill}
          />
          <p className="mt-3 text-xs text-zinc-500">{activeGroup.count} ჩანაწერი პერიოდში</p>
          {detailDrillPanel}
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h3 className="mb-1 font-semibold">
          ტრანზაქციები — {scopeLabel(scope)}
          <span className="ml-2 text-sm font-normal text-zinc-500">
            ({tableRows.length}) · {rangeLabel}
          </span>
        </h3>
        <p className="mb-3 text-xs text-zinc-500">{txSectionHint}</p>
        <TransactionTable
          rows={tableRows}
          showBranch={scope === "company" || scope === KUTAISI_DISTRIB_LABEL}
          onDelete={onDelete}
          onUpdatePayment={onUpdatePayment}
        />
      </div>

      <BranchActivityPanel
        branchReports={branchReports}
        period={period}
        scopeBranches={activityScopeBranches}
        dayFilter={rangeMode === "day" ? selectedDay : undefined}
      />
    </section>
  );
}
