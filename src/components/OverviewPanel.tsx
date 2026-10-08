"use client";

import { Fragment, useMemo, useState } from "react";
import type { Branch, BranchCash, BranchDailyReport, Employee, Expense, Obligation, PaymentMethod, Sale, Transaction } from "@/lib/types";
import { BRANCHES } from "@/lib/dashboard-data";
import { branchSaleBuyerName } from "@/lib/customers";
import type { ResolvedPeriod } from "@/lib/period-filter";
import { periodFlow, txInPeriod } from "@/lib/period-filter";
import { effectiveTxBranch, txMatchesBranchFilter } from "@/lib/branch-allocation";
import { FRESH_START_DATE, FRESH_START_MONTH, OPERATIONAL_DATA_FROM, OPERATIONAL_DATA_FROM_MONTH } from "@/lib/report-config";
import {
  calcBalancesUpToDate,
  emptyBranchCash,
  formatDate,
  formatMoney,
  isCreditOrder,
  saleSettlementParts,
  isCreditOrderActive,
  isDueUrgent,
  isPaidGoodsToDeliver,
  saleQuantityRemaining,
  obligationRemaining,
} from "@/lib/utils";
import {
  computeScopePeriodStats,
  KUTAISI_DISTRIB_BRANCHES,
  KUTAISI_DISTRIB_LABEL,
  type FlowBranchScope,
  type FlowDetailKind,
  type ScopePeriodStats,
} from "@/lib/flow-detail";
import { ClickableFlowStat, FlowDrillPanel, useFlowDrill } from "@/components/FlowDrillDown";
import BranchActivityPanel from "@/components/BranchActivityPanel";
import { ClientSaleActions } from "@/components/ClientSaleActions";
import BranchPaymentsPanel from "@/components/BranchPaymentsPanel";
import { branchSalesForPayments, branchesSalesForPayments, groupBranchSales } from "@/lib/branch-payments";
import { buildAccountLedgerRows, type AccountLedgerRow, type LedgerDirection } from "@/lib/bank-ledger";

/** დროებით დამალული სექციები მიმოხილვაზე */
const SHOW_OBJECTS_SECTION = false;

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
  bankBalance,
  scope,
  balanceHint,
  compact,
  drill,
}: {
  stats: ScopePeriodStats;
  cashBalance: number;
  bankBalance: number;
  scope: ViewScope;
  balanceHint?: string;
  compact?: boolean;
  drill: BreakdownDrill;
}) {
  const isCompanySummary = scope === "company";
  const sectioned = !compact;
  const accountExpense = stats.expenseCard + stats.expenseBank;
  const cell = (
    kind: FlowDetailKind,
    label: string,
    value: number,
    accent: string,
    hint?: string,
    large?: boolean
  ) => (
    <ClickableFlowStat
      key={kind}
      label={label}
      value={formatMoney(value)}
      accent={accent}
      hint={hint}
      large={large}
      onClick={() => drill.onDrill(kind, scope)}
      active={drill.drillActive(kind, scope)}
    />
  );

  if (sectioned) {
    return (
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">შემოსავლები</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cell("revenue", "მთლიანი შემოსავალი", stats.revenueTotal, "text-emerald-400", undefined, true)}
            {cell("revenue_cash", "შემოსავალი ქეში", stats.revenueCash, "text-emerald-300")}
            {cell("revenue_card", "ბარათით შემოვიდა", stats.revenueCard, "text-sky-300")}
            {cell("revenue_bank", "გადმორიცხვით შემოვიდა", stats.revenueBank, "text-violet-300")}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">ხარჯები</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cell("expense_cash", "ხარჯი ქეში", stats.expenseCash, "text-red-400")}
            {isCompanySummary && cell("expense_account", "ხარჯი ანგარიში", accountExpense, "text-red-300")}
            <ClickableFlowStat
              label="ოპ. ხარჯი (ჯამი)"
              value={formatMoney(stats.expenseOperating)}
              accent="text-red-400"
              onClick={() => drill.onDrill("expense", scope)}
              active={drill.drillActive("expense", scope)}
            />
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">ნაშთი</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cell("balance_cash", "ნაშთი ქეში", cashBalance, "text-emerald-300", balanceHint)}
            {isCompanySummary &&
              cell("balance_account", "ნაშთი ანგარიში", bankBalance, "text-violet-400", balanceHint)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cell("revenue", "მთლიანი შემოსავალი", stats.revenueTotal, "text-emerald-400")}
      {cell("revenue_cash", "შემოსავალი ქეში", stats.revenueCash, "text-emerald-300")}
      {cell("revenue_card", "ბარათით შემოვიდა", stats.revenueCard, "text-sky-300")}
      {cell("revenue_bank", "გადმორიცხვით შემოვიდა", stats.revenueBank, "text-violet-300")}
      {cell("expense_cash", "ხარჯი ქეში", stats.expenseCash, "text-red-400")}
      {cell("balance_cash", "ნაშთი ქეში", cashBalance, "text-emerald-300", balanceHint)}
    </div>
  );
}

const RETAIL_BRANCHES: Branch[] = ["ქუთაისი", "ლილო", "დიღომი"];

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, "0")}`,
  };
}

function BranchExpenseDays({
  branches,
  title,
  transactions,
  month,
}: {
  branches: Branch[];
  title: string;
  transactions: Transaction[];
  month: string;
}) {
  const [open, setOpen] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const { from, to } = useMemo(() => monthBounds(month), [month]);
  const days = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      const date = t.date.slice(0, 10);
      if (date < from || date > to) continue;
      if (!branches.some((b) => txMatchesBranchFilter(t, b))) continue;
      const list = map.get(date) ?? [];
      list.push(t);
      map.set(date, list);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({
        date,
        items: [...items].sort((a, b) => b.amount - a.amount),
        total: items.reduce((sum, item) => sum + item.amount, 0),
      }));
  }, [transactions, branches, from, to]);
  const total = days.reduce((sum, day) => sum + day.total, 0);
  const count = days.reduce((sum, day) => sum + day.items.length, 0);

  return (
    <div className="rounded-xl border border-red-900/30 bg-red-950/10 p-4">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>
          <span className="font-semibold text-red-200">ხარჯები · {title}</span>
          <span className="mt-0.5 block text-xs text-zinc-500">
            {formatMoney(total)} · {count} ჩანაწერი · დღეების მიხედვით
          </span>
        </span>
        <span className="shrink-0 text-xs text-zinc-400">{open ? "▲" : "▼"}</span>
      </button>
      {open &&
        (days.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">ამ თვეში ხარჯი არ არის.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pl-3 pr-3 pt-2">დღე</th>
                  <th className="pb-2 pr-3 text-right">ხარჯი</th>
                  <th className="pb-2 pr-3 text-right">ჯამი</th>
                  <th className="pb-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <Fragment key={day.date}>
                    <tr className="border-b border-zinc-800/50">
                      <td className="py-2 pl-3 pr-3 font-medium">{day.date}</td>
                      <td className="py-2 pr-3 text-right">{day.items.length}</td>
                      <td className="py-2 pr-3 text-right font-medium text-red-300">{formatMoney(day.total)}</td>
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          className="text-xs text-red-300 hover:text-red-200"
                          onClick={() => setExpandedDay((cur) => (cur === day.date ? null : day.date))}
                        >
                          {expandedDay === day.date ? "▲ დამალვა" : "▼ დეტალები"}
                        </button>
                      </td>
                    </tr>
                    {expandedDay === day.date && (
                      <tr className="border-b border-zinc-800/50 bg-zinc-900/30">
                        <td colSpan={4} className="px-3 py-3">
                          <div className="space-y-2">
                            {day.items.map((item) => (
                              <div
                                key={item.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-xs"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-zinc-200">
                                    {item.category}
                                    {item.comment ? ` · ${item.comment}` : ""}
                                  </p>
                                  <p className="text-zinc-500">
                                    {item.branch}
                                    {item.expensePaymentMethod ? ` · ${item.expensePaymentMethod}` : ""}
                                  </p>
                                </div>
                                <span className="font-medium text-red-300">{formatMoney(item.amount)}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-700 font-semibold">
                  <td colSpan={2} className="py-2 pl-3 pr-3 text-right text-zinc-400">
                    დღიური ხარჯის ჯამი
                  </td>
                  <td className="py-2 pr-3 text-right text-red-300">{formatMoney(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ))}
    </div>
  );
}

function AccountMovementDays({
  direction,
  transactions,
  month,
  branches,
  includeShared,
}: {
  direction: LedgerDirection;
  transactions: Transaction[];
  month: string;
  branches: Branch[];
  includeShared: boolean;
}) {
  const incoming = direction === "in";
  const [open, setOpen] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const { from, to } = useMemo(() => monthBounds(month), [month]);
  const days = useMemo(() => {
    const rows = buildAccountLedgerRows(transactions, { from, to, branch: "ყველა" }).filter((row) => {
      if (row.direction !== direction) return false;
      if (row.branch === "საერთო") return includeShared;
      return branches.includes(row.branch);
    });
    const map = new Map<string, AccountLedgerRow[]>();
    for (const row of rows) {
      const list = map.get(row.date) ?? [];
      list.push(row);
      map.set(row.date, list);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({
        date,
        items: [...items].sort((a, b) => b.amount - a.amount),
        total: items.reduce((sum, item) => sum + item.amount, 0),
      }));
  }, [transactions, from, to, direction, branches, includeShared]);
  const total = days.reduce((sum, day) => sum + day.total, 0);
  const count = days.reduce((sum, day) => sum + day.items.length, 0);
  const tone = incoming
    ? {
        box: "border-emerald-900/30 bg-emerald-950/10",
        title: "text-emerald-200",
        money: "text-emerald-300",
        link: "text-emerald-300 hover:text-emerald-200",
      }
    : {
        box: "border-red-900/30 bg-red-950/10",
        title: "text-red-200",
        money: "text-red-300",
        link: "text-red-300 hover:text-red-200",
      };

  return (
    <div className={`rounded-xl border p-4 ${tone.box}`}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>
          <span className={`font-semibold ${tone.title}`}>
            {incoming ? "შემოსავლები" : "ხარჯები"} · საბანკო ანგარიში
          </span>
          <span className="mt-0.5 block text-xs text-zinc-500">
            {formatMoney(total)} · {count} ჩანაწერი · დღეების მიხედვით
          </span>
        </span>
        <span className="shrink-0 text-xs text-zinc-400">{open ? "▲" : "▼"}</span>
      </button>
      {open &&
        (days.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            {incoming ? "ამ თვეში ანგარიშზე ჩარიცხვა არ არის." : "ამ თვეში ანგარიშიდან ხარჯი არ არის."}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pl-3 pr-3 pt-2">დღე</th>
                  <th className="pb-2 pr-3 text-right">{incoming ? "ჩარიცხვა" : "ხარჯი"}</th>
                  <th className="pb-2 pr-3 text-right">ჯამი</th>
                  <th className="pb-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <Fragment key={day.date}>
                    <tr className="border-b border-zinc-800/50">
                      <td className="py-2 pl-3 pr-3 font-medium">{day.date}</td>
                      <td className="py-2 pr-3 text-right">{day.items.length}</td>
                      <td className={`py-2 pr-3 text-right font-medium ${tone.money}`}>{formatMoney(day.total)}</td>
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          className={`text-xs ${tone.link}`}
                          onClick={() => setExpandedDay((cur) => (cur === day.date ? null : day.date))}
                        >
                          {expandedDay === day.date ? "▲ დამალვა" : "▼ დეტალები"}
                        </button>
                      </td>
                    </tr>
                    {expandedDay === day.date && (
                      <tr className="border-b border-zinc-800/50 bg-zinc-900/30">
                        <td colSpan={4} className="px-3 py-3">
                          <div className="space-y-2">
                            {day.items.map((item) => (
                              <div
                                key={item.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-xs"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-zinc-200">{item.label}</p>
                                  <p className="text-zinc-500">
                                    {item.branch} · {item.channel === "card" ? "ბარათი" : "გადმორიცხვა"}
                                    {item.comment ? ` · ${item.comment}` : ""}
                                  </p>
                                </div>
                                <span className={`font-medium ${tone.money}`}>{formatMoney(item.amount)}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-700 font-semibold">
                  <td colSpan={2} className="py-2 pl-3 pr-3 text-right text-zinc-400">
                    {incoming ? "დღიური შემოსავლის ჯამი" : "დღიური ხარჯის ჯამი"}
                  </td>
                  <td className={`py-2 pr-3 text-right ${tone.money}`}>{formatMoney(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ))}
    </div>
  );
}

function monthsTouching(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const end = to.slice(0, 7);
  const skipSeptemberCarry = from >= FRESH_START_DATE;
  for (let i = 0; i < 36; i += 1) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (!(skipSeptemberCarry && key < FRESH_START_MONTH)) out.push(key);
    if (key >= end) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function buildGroupStats(
  transactions: Transaction[],
  branchCash: Record<Branch, BranchCash>,
  branches: Branch[],
  from: string,
  to: string,
  rangeMode: RangeMode,
  selectedDay: string,
  openingByMonth?: Record<string, Record<Branch, BranchCash>>
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

    const closing = calcBalancesUpToDate(transactions, branch, branchCash, to, openingByMonth);
    cash += closing.cash;
    card += closing.card;
    bank += closing.bank;

    if (rangeMode === "day" && selectedDay > OPERATIONAL_DATA_FROM) {
      const op = calcBalancesUpToDate(transactions, branch, branchCash, dayBefore(selectedDay), openingByMonth);
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
  openingByMonth?: Record<string, Record<Branch, BranchCash>>;
  obligations?: Record<string, Obligation[]>;
  period: ResolvedPeriod;
  readOnly?: boolean;
  employees?: Employee[];
  bankLedgerReviewed?: Record<string, string>;
  onDelete?: (id: string) => Promise<boolean>;
  onUpdatePayment?: (id: string, paymentMethod: PaymentMethod) => Promise<boolean>;
  onUpdateDriver?: (id: string, driverEmployeeId: string, driverEmployeeName: string) => Promise<boolean>;
  onToggleReview?: (ids: string | string[], reviewed: boolean) => Promise<boolean>;
  onRefresh?: (patch?: {
    branchReports?: BranchDailyReport[];
    transactions?: Transaction[];
  }) => void | Promise<unknown>;
  onReceiveGoods?: (saleId: string, fromBranch: Branch) => Promise<boolean>;
};

export default function OverviewPanel({
  transactions,
  branchReports,
  branchCash,
  openingByMonth,
  obligations,
  period,
  readOnly = false,
  employees,
  bankLedgerReviewed,
  onDelete,
  onUpdatePayment,
  onUpdateDriver,
  onToggleReview,
  onRefresh,
  onReceiveGoods,
}: Props) {
  const [goodsFrom, setGoodsFrom] = useState<Record<string, Branch>>({});
  const [goodsBusy, setGoodsBusy] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [scope, setScope] = useState<ViewScope>("company");
  const [rangeMode, setRangeMode] = useState<RangeMode>("period");
  const [selectedDay, setSelectedDay] = useState(today);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [objectsOpen, setObjectsOpen] = useState(false);
  const [cashPlaceOpen, setCashPlaceOpen] = useState(false);
  const [branchDetailOpen, setBranchDetailOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(true);
  const [moneyObOpen, setMoneyObOpen] = useState(false);
  const [goodsObOpen, setGoodsObOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const { drill, toggle, close, isActive, setAccountChannel } = useFlowDrill();

  const { from, to, rangeLabel } = useMemo(() => {
    if (rangeMode === "day") {
      return { from: selectedDay, to: selectedDay, rangeLabel: formatDate(selectedDay) };
    }
    return { from: period.from, to: period.to, rangeLabel: period.label };
  }, [rangeMode, selectedDay, period.from, period.to, period.label]);

  const paymentsMonth = useMemo(() => from.slice(0, 7), [from]);

  const paymentBranches = useMemo((): Branch[] => {
    if (scope === "company") return [...BRANCHES];
    if (scope === KUTAISI_DISTRIB_LABEL) return [...KUTAISI_DISTRIB_BRANCHES];
    return [scope];
  }, [scope]);

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
      const closing = calcBalancesUpToDate(transactions, branch, branchCash, to, openingByMonth);
      const opening =
        rangeMode === "day" && selectedDay > OPERATIONAL_DATA_FROM
          ? calcBalancesUpToDate(transactions, branch, branchCash, dayBefore(selectedDay), openingByMonth)
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
  }, [transactions, branchCash, openingByMonth, from, to, rangeMode, selectedDay]);

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
        selectedDay,
        openingByMonth
      ),
    [transactions, branchCash, openingByMonth, from, to, rangeMode, selectedDay]
  );

  const companyBal = useMemo(
    () => calcBalancesUpToDate(transactions, "ყველა", branchCash, to, openingByMonth),
    [transactions, branchCash, openingByMonth, to]
  );

  const balanceAsOf = to > today ? today : to;
  const placeCash = useMemo(
    () =>
      RETAIL_BRANCHES.map((branch) => ({
        branch,
        cash: calcBalancesUpToDate(transactions, branch, branchCash, balanceAsOf, openingByMonth).cash,
      })),
    [transactions, branchCash, openingByMonth, balanceAsOf]
  );
  const kutaisiDistribCashBalance = useMemo(() => {
    const kutaisi = calcBalancesUpToDate(transactions, "ქუთაისი", branchCash, balanceAsOf, openingByMonth).cash;
    const distrib = calcBalancesUpToDate(transactions, "დისტრიბუცია", branchCash, balanceAsOf, openingByMonth).cash;
    return kutaisi + distrib;
  }, [transactions, branchCash, openingByMonth, balanceAsOf]);
  const accountNow = useMemo(
    () => calcBalancesUpToDate(transactions, "ყველა", branchCash, balanceAsOf, openingByMonth),
    [transactions, branchCash, openingByMonth, balanceAsOf]
  );
  const cardSpends = useMemo(
    () =>
      transactions
        .filter((t): t is Expense => t.type === "expense" && t.expensePaymentMethod === "ბარათი")
        .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions]
  );
  const incomeByBranch = useMemo(
    () =>
      BRANCHES.map((branch) => ({
        branch,
        revenue: transactions.reduce((sum, t) => {
          if (t.type !== "sale" || t.branch !== branch) return sum;
          if (!txInPeriod(t.date, from, to)) return sum;
          if (isCreditOrder(t)) return sum;
          return sum + saleSettlementParts(t).cash;
        }, 0),
      })),
    [transactions, from, to]
  );
  const companyObligations = useMemo(() => {
    const months = monthsTouching(from, to);
    const items = months.flatMap((month) => obligations?.[month] ?? []);
    const unpaid = items
      .map((item) => ({ item, left: obligationRemaining(item) }))
      .filter((row) => row.left > 0)
      .sort((a, b) => {
        const au = isDueUrgent(a.item.plannedPayDate, today) ? 0 : 1;
        const bu = isDueUrgent(b.item.plannedPayDate, today) ? 0 : 1;
        if (au !== bu) return au - bu;
        return (a.item.plannedPayDate ?? "9999").localeCompare(b.item.plannedPayDate ?? "9999");
      });
    const remaining = unpaid.reduce((sum, row) => sum + row.left, 0);
    return { months, unpaid, remaining };
  }, [obligations, from, to, today]);
  const goodsToDeliver = useMemo(
    () =>
      transactions.filter(
        (t): t is Sale => t.type === "sale" && txInPeriod(t.date, from, to) && isPaidGoodsToDeliver(t)
      ),
    [transactions, from, to]
  );
  const reportWatch = useMemo(() => {
    if (from === to) {
      return { day: from, phrase: from === today ? "დღეს" : formatDate(from) };
    }
    if (today >= from && today <= to) return { day: today, phrase: "დღეს" };
    const day = to < today ? to : today;
    return { day, phrase: formatDate(day) };
  }, [from, to, today]);
  const dayReports = useMemo(
    () => branchReports.filter((r) => r.date === reportWatch.day && RETAIL_BRANCHES.includes(r.branch)),
    [branchReports, reportWatch.day]
  );
  const ownerAccountOutflows = useMemo(
    () =>
      transactions.filter(
        (t): t is Expense =>
          t.type === "expense" &&
          t.spentBy === "მფლობელი" &&
          t.date.slice(0, 10) === reportWatch.day &&
          (t.expensePaymentMethod === "ბარათი" || t.expensePaymentMethod === "ანგარიშზე ჩარიცხვა")
      ),
    [transactions, reportWatch.day]
  );
  const missingReportBranches = RETAIL_BRANCHES.filter(
    (branch) => !dayReports.some((r) => r.branch === branch)
  );

  const paymentSaleGroups = useMemo(() => {
    const sales = transactions.filter(
      (t): t is Sale => t.type === "sale" && !(isCreditOrder(t) && isCreditOrderActive(t))
    );
    const { from: monthFrom, to: monthTo } = (() => {
      const [y, m] = paymentsMonth.split("-").map(Number);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return {
        from: `${paymentsMonth}-01`,
        to: `${paymentsMonth}-${String(last).padStart(2, "0")}`,
      };
    })();
    if (scope === KUTAISI_DISTRIB_LABEL) {
      return groupBranchSales(
        branchesSalesForPayments(sales, [...KUTAISI_DISTRIB_BRANCHES], monthFrom, monthTo)
      ).length;
    }
    let groups = 0;
    for (const b of paymentBranches) {
      groups += groupBranchSales(branchSalesForPayments(sales, b, monthFrom, monthTo)).length;
    }
    return groups;
  }, [transactions, paymentBranches, paymentsMonth, scope]);

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
      ? `${scopeLabel(scope)} · ${formatDate(selectedDay)} — იმ დღის გაყიდვები გადახდების მიხედვით`
      : `${scopeLabel(scope)} · ${rangeLabel} — პერიოდის გაყიდვები გადახდების მიხედვით`;

  const detailDrillPanel = (
    <FlowDrillPanel
      drill={drill}
      transactions={transactions}
      onClose={close}
      onSetAccountChannel={setAccountChannel}
      employees={readOnly ? undefined : employees}
      bankLedgerReviewed={bankLedgerReviewed}
      onDelete={readOnly ? undefined : onDelete}
      onUpdatePayment={readOnly ? undefined : onUpdatePayment}
      onUpdateDriver={readOnly ? undefined : onUpdateDriver}
      onToggleReview={readOnly ? undefined : onToggleReview}
    />
  );

  const breakdownDrill: BreakdownDrill = {
    onDrill: toggleDetail,
    drillActive,
  };

  const accountTotal = accountNow.card + accountNow.bank;

  return (
    <section className="space-y-6">
      <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div>
          <h2 className="text-lg font-semibold">მთავარი</h2>
          <p className="text-xs text-zinc-500">
            {rangeLabel}
            {" · "}ნაშთი {formatDate(balanceAsOf)}-ის მდგომარეობით
            {balanceAsOf >= FRESH_START_DATE ? ` · ოქტომბრიდან სექტემბერი არ შედის` : ""}
          </p>
        </div>

        {obligations && (
        <div className="space-y-2">
          <div className="rounded-lg border border-zinc-800">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-2 py-2 text-left"
              onClick={() => setMoneyObOpen((v) => !v)}
              aria-expanded={moneyObOpen}
            >
              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                კომპანიის ვალდებულებები — თანხები
                <span className="ml-2 normal-case tracking-normal text-amber-300">
                  {formatMoney(companyObligations.remaining)}
                </span>
              </span>
              <span className="text-xs text-zinc-500">{moneyObOpen ? "▲" : "▼"}</span>
            </button>
            {moneyObOpen && (
              <div className="border-t border-zinc-800 px-2 py-2">
              <p className="mb-2 text-sm text-zinc-500">{companyObligations.months.join(", ")}</p>
              {companyObligations.unpaid.length === 0 ? (
                <p className="text-sm text-zinc-500">ამ პერიოდში გადასახდელი ვალდებულება არ დარჩა.</p>
              ) : (
                <ul className="space-y-1">
                  {companyObligations.unpaid.map(({ item, left }) => {
                    const urgent = isDueUrgent(item.plannedPayDate, today);
                    const overdue = Boolean(item.plannedPayDate && item.plannedPayDate < today);
                    return (
                      <li
                        key={item.id}
                        className={`flex flex-wrap items-baseline justify-between gap-2 rounded-lg px-2 py-1 text-sm ${
                          urgent ? "bg-red-950/40 text-red-300" : "text-zinc-200"
                        }`}
                      >
                        <span>
                          {item.name}
                          {item.responsible ? (
                            <span className="text-zinc-400"> · {item.responsible}</span>
                          ) : null}
                          <span className="text-zinc-500"> · {item.branch}</span>
                          {item.plannedPayDate ? (
                            <span className={urgent ? "font-semibold text-red-400" : "text-zinc-500"}>
                              {" · "}
                              {item.plannedPayDate}
                              {urgent ? (overdue ? " · ვადაგადაცილებული" : " · ვადა ახლოვდება") : ""}
                            </span>
                          ) : null}
                        </span>
                        <span className={urgent ? "font-semibold text-red-400" : "text-amber-300"}>
                          {formatMoney(left)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-zinc-800">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-2 py-2 text-left"
              onClick={() => setGoodsObOpen((v) => !v)}
              aria-expanded={goodsObOpen}
            >
              <span className="text-[11px] font-medium uppercase tracking-wide text-sky-400/90">
                კომპანიის ვალდებულებები — პროდუქცია
                <span className="ml-2 normal-case tracking-normal text-sky-300">
                  {goodsToDeliver.length}
                </span>
              </span>
              <span className="text-xs text-zinc-500">{goodsObOpen ? "▲" : "▼"}</span>
            </button>
            {goodsObOpen && (
              <div className="border-t border-zinc-800 px-2 py-2">
              {goodsToDeliver.length === 0 ? (
                <p className="text-sm text-zinc-500">გასაცემი პროდუქცია არ დარჩა.</p>
              ) : (
                  <ul className="space-y-1">
                    {goodsToDeliver.map((sale) => (
                      <li key={sale.id} className="text-sm text-zinc-200">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span>
                            {sale.buyerName || sale.comment || "მყიდველი"}
                            <span className="text-zinc-500"> · {sale.productName} · {sale.branch}</span>
                          </span>
                          <span className="tabular-nums text-sky-300">{saleQuantityRemaining(sale)} ც</span>
                        </div>
                        <p className="text-[11px] text-zinc-500">თანხა სრულად გადახდილია</p>
                        {!readOnly && onReceiveGoods && (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <label className="text-[11px] text-zinc-500">
                              საიდან
                              <select
                                className="ml-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
                                value={goodsFrom[sale.id] ?? sale.branch}
                                onChange={(e) =>
                                  setGoodsFrom((m) => ({ ...m, [sale.id]: e.target.value as Branch }))
                                }
                              >
                                {BRANCHES.map((b) => (
                                  <option key={b} value={b}>{b}</option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              disabled={goodsBusy === sale.id}
                              className="rounded bg-sky-700 px-2 py-1 text-xs text-white disabled:opacity-40"
                              onClick={async () => {
                                setGoodsBusy(sale.id);
                                const ok = await onReceiveGoods(sale.id, goodsFrom[sale.id] ?? sale.branch);
                                setGoodsBusy(null);
                                if (ok) setGoodsFrom((m) => ({ ...m, [sale.id]: sale.branch }));
                              }}
                            >
                              მიიღო
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
              )}
              </div>
            )}
          </div>
        </div>
        )}

        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">ქეში შემოსავალი ფილიალებით</p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {incomeByBranch.map((row) => (
              <div key={row.branch} className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
                <p className="text-xs text-zinc-500">{row.branch}</p>
                <p className="text-base font-semibold text-emerald-400">{formatMoney(row.revenue)}</p>
              </div>
            ))}
            <div className="rounded-lg border border-violet-900/50 bg-violet-950/30 px-3 py-2">
              <p className="text-xs text-violet-200/80">დისტრიბუცია+ქუთაისი</p>
              <p className="text-base font-semibold text-violet-200">{formatMoney(kutaisiDistribCashBalance)}</p>
              <p className="text-[10px] text-zinc-500">ქეშის ნაშთი</p>
            </div>
          </div>
        </div>

        <div>
          <button
            type="button"
            className="mb-2 flex w-full items-center justify-between gap-3 text-left"
            onClick={() => setCashPlaceOpen((v) => !v)}
            aria-expanded={cashPlaceOpen}
          >
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">ქეში ადგილზე და ანგარიში</span>
            <span className="text-xs text-zinc-500">{cashPlaceOpen ? "▲" : "▼"}</span>
          </button>
          {cashPlaceOpen && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">ქეში ადგილზე</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {placeCash.map((row) => (
                <div key={row.branch} className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
                  <p className="text-xs text-zinc-500">{row.branch}</p>
                  <p className="text-base font-semibold text-emerald-300">{formatMoney(row.cash)}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-violet-900/40 bg-violet-950/20 px-3 py-2">
            <p className="text-xs text-zinc-500">ანგარიში</p>
            <p className="group relative inline-flex text-xl font-semibold text-violet-300">
              <span className="cursor-help underline decoration-dotted underline-offset-2">
                {formatMoney(accountTotal)}
              </span>
              <span className="invisible absolute left-0 top-full z-30 mt-1 w-80 rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-left text-sm font-normal shadow-xl group-hover:visible">
                <span className="block text-xs text-zinc-400">დარჩა ანგარიშზე</span>
                <span className="mb-2 block text-sm font-semibold text-violet-300">{formatMoney(accountTotal)}</span>
                <span className="mb-1 block text-xs text-zinc-400">რაში დაიხარჯა</span>
                {cardSpends.length === 0 ? (
                  <span className="block text-xs text-zinc-500">ანგარიშიდან ხარჯი ჯერ არ არის</span>
                ) : (
                  <span className="block max-h-52 space-y-1 overflow-y-auto">
                    {cardSpends.map((row) => (
                      <span key={row.id} className="flex justify-between gap-2 text-xs text-zinc-200">
                        <span>
                          {formatDate(row.date)} · {row.comment || row.category}
                        </span>
                        <span className="shrink-0 text-red-300">{formatMoney(row.amount)}</span>
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </p>
            <p className="text-[11px] text-zinc-500">
              ბარათით და გადმორიცხვით შემოსული აქ გროვდება. აქედან გადახდა ობიექტის ქეშს არ აკლდება.
            </p>
          </div>
        </div>
          )}
        </div>

        <button
          type="button"
          className={`w-full rounded-lg border px-3 py-2 text-left ${
            missingReportBranches.length
              ? "border-red-800/70 bg-red-950/30"
              : "border-emerald-900/50 bg-emerald-950/20"
          }`}
          onClick={() => setReportsOpen((v) => !v)}
          aria-expanded={reportsOpen}
        >
          <span className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                ფილიალის რეპორტი · {reportWatch.phrase} ({formatDate(reportWatch.day)})
              </span>
              {missingReportBranches.length ? (
                <span className="mt-1 block text-sm font-semibold text-red-300">
                  რეპორტი არ გაუგზავნიათ — შეახსენეთ: {missingReportBranches.join(", ")}
                </span>
              ) : (
                <span className="mt-1 block text-sm text-emerald-300">
                  ქუთაისი, ლილო და დიღომი — რეპორტი გამოგზავნილია.
                </span>
              )}
            </span>
            <span className="shrink-0 text-xs text-zinc-400">{reportsOpen ? "▲" : "▼"}</span>
          </span>
        </button>

        {reportsOpen && dayReports.length > 0 && (
          <div className="space-y-2">
            {dayReports.map((r) => (
              <div key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-sm">
                <p className="mb-1 font-medium">
                  {r.branch}
                  {r.submittedBy ? ` · ${r.submittedBy}` : ""}
                </p>
                {r.clientSales?.length ? (
                  <div className="space-y-2">
                    {r.clientSales.map((c, i) => (
                      <div key={c.clientSaleId ?? i}>
                        <p className="text-zinc-200">
                          {branchSaleBuyerName(c)}
                          <span className="text-zinc-500">
                            {" "}
                            · {c.personType === "legal" ? c.companyId : c.phone}
                          </span>
                          {c.driverEmployeeName ? (
                            <span className="text-violet-400"> · მომზიდავი: {c.driverEmployeeName}</span>
                          ) : null}
                          {!readOnly && onRefresh ? (
                            <ClientSaleActions reportId={r.id} sale={c} index={i} onRefresh={onRefresh} />
                          ) : null}
                        </p>
                        {c.products.map((p, j) => (
                          <p key={j} className="text-emerald-400">
                            +{formatMoney(p.amount)} — {p.productName} ×{p.quantity} · {p.paymentMethod || c.paymentMethod}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (r.sales?.length ?? 0) > 0 ? (
                  r.sales!.map((p, j) => (
                    <p key={j} className="text-emerald-400">
                      +{formatMoney(p.amount)} — {p.productName} ×{p.quantity} · {p.paymentMethod}
                    </p>
                  ))
                ) : (r.incomes?.length ?? 0) > 0 ? (
                  r.incomes!.map((income, j) => (
                    <p key={j} className="text-emerald-400">
                      +{formatMoney(income.amount)} — დღის შემოსავალი · {income.paymentMethod}
                    </p>
                  ))
                ) : r.salesTotal > 0 ? (
                  <p className="text-emerald-400">+{formatMoney(r.salesTotal)} — {r.salesNote}</p>
                ) : (
                  <p className="text-zinc-500">ნულოვანი რეპორტი — გაყიდვა არ ყოფილა</p>
                )}
                {r.expenses?.length ? (
                  <div className="mt-1 space-y-1">
                    {r.expenses.map((ex, i) => (
                      <p key={i} className="text-red-400">
                        -{formatMoney(ex.amount)} — {ex.category}: {ex.comment} · {ex.paymentMethod}
                      </p>
                    ))}
                  </div>
                ) : r.expensesTotal > 0 ? (
                  <p className="text-red-400">-{formatMoney(r.expensesTotal)} — {r.expensesNote}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {reportsOpen && ownerAccountOutflows.length > 0 && (
          <div className="rounded-lg border border-violet-900/40 bg-violet-950/20 p-3 text-sm">
            <p className="mb-1 font-medium text-violet-200">ანგარიშიდან გასავალი · მფლობელი</p>
            <div className="space-y-1">
              {ownerAccountOutflows.map((row) => (
                <p key={row.id} className="text-red-300">
                  -{formatMoney(row.amount)} — {row.comment || row.category}
                  <span className="text-zinc-500"> · ანგარიში</span>
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="mb-3 text-lg font-semibold">
          {readOnly ? "მიმოხილვა" : "მთავარი გვერდი"}
        </h2>

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
            <button
              type="button"
              className="mb-0 flex w-full items-center justify-between gap-3 text-left"
              onClick={() => setCompanyOpen((v) => !v)}
              aria-expanded={companyOpen}
            >
              <h3 className="text-lg font-semibold text-emerald-200">
                კომპანია (ჯამი) · {rangeLabel}
              </h3>
              <span className="shrink-0 text-sm text-emerald-400/80">{companyOpen ? "▲" : "▼"}</span>
            </button>
            {companyOpen && (
              <div className="mt-3">
                <OverviewBreakdown
                  stats={companyChannelStats}
                  cashBalance={companyBal.cash}
                  bankBalance={companyBal.card + companyBal.bank}
                  scope="company"
                  balanceHint={balanceHint}
                  drill={breakdownDrill}
                />
              </div>
            )}
          </div>

          {companyOpen && detailDrillPanel}

          {SHOW_OBJECTS_SECTION && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
            <button
              type="button"
              className="mb-0 flex w-full items-center justify-between gap-3 text-left"
              onClick={() => setObjectsOpen((v) => !v)}
              aria-expanded={objectsOpen}
            >
              <h3 className="text-sm font-semibold text-zinc-300">ობიექტებით — {rangeLabel}</h3>
              <span className="shrink-0 text-sm text-zinc-500">{objectsOpen ? "▲" : "▼"}</span>
            </button>
            {objectsOpen && (
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
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
                      bankBalance={b.card + b.bank}
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
                    bankBalance={kutaisiDistribStats.card + kutaisiDistribStats.bank}
                    scope={KUTAISI_DISTRIB_LABEL}
                    balanceHint={balanceHint}
                    compact
                    drill={breakdownDrill}
                  />
                </div>
              </div>
            )}
          </div>
          )}
        </>
      )}

      {activeBranch && (
        <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-4">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() => setBranchDetailOpen((v) => !v)}
            aria-expanded={branchDetailOpen}
          >
            <h3 className="text-xl font-bold text-emerald-200">
              {activeBranch.branch} · {rangeLabel}
            </h3>
            <span className="shrink-0 text-sm text-emerald-400/80">{branchDetailOpen ? "▲" : "▼"}</span>
          </button>
          {branchDetailOpen && (
          <div className="mt-3">
          <OverviewBreakdown
            stats={activeBranch.channel}
            cashBalance={activeBranch.cash}
            bankBalance={activeBranch.card + activeBranch.bank}
            scope={activeBranch.branch}
            balanceHint={balanceHint}
            drill={breakdownDrill}
          />
          <p className="mt-3 text-xs text-zinc-500">{activeBranch.count} ჩანაწერი პერიოდში</p>
          {detailDrillPanel}
          </div>
          )}
        </div>
      )}

      {activeGroup && (
        <div className="rounded-xl border border-violet-900/40 bg-violet-950/20 p-4">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() => setBranchDetailOpen((v) => !v)}
            aria-expanded={branchDetailOpen}
          >
            <span>
              <h3 className="text-xl font-bold text-violet-200">{KUTAISI_DISTRIB_LABEL}</h3>
              <p className="text-xs text-violet-300/70">ქუთაისი და დისტრიბუცია ერთად · {rangeLabel}</p>
            </span>
            <span className="shrink-0 text-sm text-violet-300/80">{branchDetailOpen ? "▲" : "▼"}</span>
          </button>
          {branchDetailOpen && (
          <div className="mt-3">
          <OverviewBreakdown
            stats={kutaisiDistribChannelStats}
            cashBalance={activeGroup.cash}
            bankBalance={activeGroup.card + activeGroup.bank}
            scope={KUTAISI_DISTRIB_LABEL}
            balanceHint={balanceHint}
            drill={breakdownDrill}
          />
          <p className="mt-3 text-xs text-zinc-500">{activeGroup.count} ჩანაწერი პერიოდში</p>
          {detailDrillPanel}
          </div>
          )}
        </div>
      )}

      <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => setTxOpen((v) => !v)}
          aria-expanded={txOpen}
        >
          <h3 className="font-semibold">
            ტრანზაქციები — {scopeLabel(scope)}
            <span className="ml-2 text-sm font-normal text-zinc-500">
              ({paymentSaleGroups}) · {rangeLabel}
            </span>
          </h3>
          <span className="shrink-0 text-xs text-zinc-400">{txOpen ? "▲" : "▼"}</span>
        </button>
        {txOpen && (
        <>
        <div>
          <p className="mb-1 text-xs text-zinc-500">{txSectionHint}</p>
          <p className="text-xs text-zinc-600">
            დღე · გაყიდვები · ქეში · გადმორიცხვა · ბარათი · ჯამი · დეტალები
          </p>
        </div>
        {scope === KUTAISI_DISTRIB_LABEL ? (
          <div className="space-y-3">
            <BranchPaymentsPanel
              branches={[...KUTAISI_DISTRIB_BRANCHES]}
              title={KUTAISI_DISTRIB_LABEL}
              transactions={transactions}
              branchReports={branchReports}
              month={paymentsMonth}
              compact
              readOnly={readOnly || !onRefresh}
              onRefresh={onRefresh ?? (async () => undefined)}
              subtitle="ქუთაისი და დისტრიბუცია ერთად · თარიღის მიხედვით"
            />
            <BranchExpenseDays
              branches={[...KUTAISI_DISTRIB_BRANCHES]}
              title={KUTAISI_DISTRIB_LABEL}
              transactions={transactions}
              month={paymentsMonth}
            />
          </div>
        ) : (
          paymentBranches.map((b) => (
            <div key={b} className="space-y-3">
              <BranchPaymentsPanel
                branch={b}
                transactions={transactions}
                branchReports={branchReports}
                month={paymentsMonth}
                compact
                readOnly={readOnly || !onRefresh}
                onRefresh={onRefresh ?? (async () => undefined)}
              />
              <BranchExpenseDays branches={[b]} title={b} transactions={transactions} month={paymentsMonth} />
            </div>
          ))
        )}
        <div className="space-y-3">
          <AccountMovementDays
            direction="in"
            transactions={transactions}
            month={paymentsMonth}
            branches={paymentBranches}
            includeShared={scope === "company"}
          />
          <AccountMovementDays
            direction="out"
            transactions={transactions}
            month={paymentsMonth}
            branches={paymentBranches}
            includeShared={scope === "company"}
          />
        </div>
        </>
        )}
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
