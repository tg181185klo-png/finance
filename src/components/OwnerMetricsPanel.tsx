"use client";

import { Fragment, useMemo, useState } from "react";
import type {
  Branch,
  BranchCash,
  BranchDailyReport,
  Expense,
  Obligation,
  ObligationPayment,
  PaymentMethod,
  Sale,
  Transaction,
} from "@/lib/types";
import type { ResolvedPeriod } from "@/lib/period-filter";
import { periodFlow } from "@/lib/period-filter";
import { computeScopePeriodStats } from "@/lib/flow-detail";
import {
  groupBranchSales,
  isZeroTradeReport,
  paymentShort,
  saleGroupLabel,
} from "@/lib/branch-payments";
import {
  calcBalances,
  currentMonth,
  formatMoney,
  isCreditOrder,
  isCreditOrderActive,
  obligationSummary,
  paymentMethodLabel,
  saleCreditRemaining,
  txPaymentMethod,
} from "@/lib/utils";

type MetricId =
  | "revenue"
  | "expense"
  | "net"
  | "rev_cash"
  | "rev_card"
  | "rev_bank"
  | "bal_cash"
  | "bal_card"
  | "bal_bank"
  | "bal_total"
  | "obligations"
  | "credit"
  | "unreviewed"
  | "zero_reports"
  | "deposits"
  | "branch_activity";

type Props = {
  transactions: Transaction[];
  branchCash: Record<Branch, BranchCash>;
  branchReports: BranchDailyReport[];
  obligations: Record<string, Obligation[]>;
  obligationPayments?: ObligationPayment[];
  bankLedgerReviewed?: Record<string, string>;
  period: ResolvedPeriod;
  branchFilter: Branch | "ყველა";
};

type MetricDef = {
  id: MetricId;
  title: string;
  short: string;
  accent: string;
};

const METRICS: MetricDef[] = [
  {
    id: "revenue",
    title: "შემოსავალი",
    short: "გაყიდვები თარიღით · ვინ იყიდა · რა",
    accent: "text-emerald-400 border-emerald-900/50 bg-emerald-950/20",
  },
  {
    id: "expense",
    title: "ხარჯი",
    short: "რაში დაიხარჯა თარიღით",
    accent: "text-red-400 border-red-900/50 bg-red-950/20",
  },
  {
    id: "net",
    title: "ნეტო",
    short: "შემოსავალი − ხარჯი",
    accent: "text-sky-300 border-sky-900/50 bg-sky-950/20",
  },
  {
    id: "rev_cash",
    title: "ქეში",
    short: "ნაღდი გაყიდვები თარიღით",
    accent: "text-emerald-300 border-zinc-800 bg-zinc-900/40",
  },
  {
    id: "rev_card",
    title: "ბარათი",
    short: "ბარათის გატარებები თარიღით",
    accent: "text-violet-300 border-zinc-800 bg-zinc-900/40",
  },
  {
    id: "rev_bank",
    title: "ანგარიშზე ჩარიცხვა",
    short: "გადმორიცხვები თარიღით / ფილიალით",
    accent: "text-sky-300 border-zinc-800 bg-zinc-900/40",
  },
  {
    id: "bal_total",
    title: "ჯამური ნაშთი",
    short: "ქეში + ბარათი + ანგარიში",
    accent: "text-zinc-100 border-emerald-900/40 bg-emerald-950/15",
  },
  {
    id: "bal_cash",
    title: "ნაშთი ქეში",
    short: "მიმდინარე ნაღდი",
    accent: "text-emerald-300 border-zinc-800 bg-zinc-900/40",
  },
  {
    id: "bal_card",
    title: "ნაშთი ბარათი",
    short: "ბარათის ნაშთი",
    accent: "text-violet-300 border-zinc-800 bg-zinc-900/40",
  },
  {
    id: "bal_bank",
    title: "ნაშთი ანგარიში",
    short: "საბანკო ნაშთი",
    accent: "text-sky-300 border-zinc-800 bg-zinc-900/40",
  },
  {
    id: "obligations",
    title: "ვალდებულებები",
    short: "ყველა · დაგეგმილი გასტუმრება",
    accent: "text-amber-300 border-amber-900/40 bg-amber-950/15",
  },
  {
    id: "credit",
    title: "ბე / გადასახდელი",
    short: "აქტიური კრედიტი",
    accent: "text-orange-300 border-orange-900/40 bg-orange-950/15",
  },
  {
    id: "unreviewed",
    title: "არაისახა",
    short: "შეუმოწმებელი ჩარიცხვები",
    accent: "text-amber-200 border-amber-900/50 bg-amber-950/20",
  },
  {
    id: "zero_reports",
    title: "ნულოვანი რეპორტები",
    short: "დღეები გაყიდვის გარეშე",
    accent: "text-zinc-300 border-zinc-700 bg-zinc-900/50",
  },
  {
    id: "deposits",
    title: "შენატანები",
    short: "დამფუძნებელი / სხვა",
    accent: "text-teal-300 border-teal-900/40 bg-teal-950/15",
  },
  {
    id: "branch_activity",
    title: "ფილიალის რეპორტები",
    short: "ობიექტებიდან გაგზავნილი",
    accent: "text-teal-200 border-teal-900/40 bg-teal-950/15",
  },
];

function inPeriod(date: string, from: string, to: string) {
  const d = date.slice(0, 10);
  return d >= from && d <= to;
}

function branchOk(branch: string, filter: Branch | "ყველა") {
  return filter === "ყველა" || branch === filter || branch === "ყველა";
}

export default function OwnerMetricsPanel({
  transactions,
  branchCash,
  branchReports,
  obligations,
  obligationPayments = [],
  bankLedgerReviewed = {},
  period,
  branchFilter,
}: Props) {
  const [active, setActive] = useState<MetricId>("revenue");
  const [openDay, setOpenDay] = useState<string | null>(null);
  const scope = branchFilter === "ყველა" ? "ყველა" : branchFilter;
  const obMonth = currentMonth();

  const channel = useMemo(
    () => computeScopePeriodStats(transactions, scope, period.from, period.to),
    [transactions, scope, period.from, period.to]
  );
  const flow = useMemo(
    () => periodFlow(transactions, branchFilter, period.from, period.to),
    [transactions, branchFilter, period.from, period.to]
  );
  const balances = useMemo(
    () => calcBalances(transactions, branchFilter, branchCash),
    [transactions, branchFilter, branchCash]
  );
  const ob = useMemo(
    () => obligationSummary(obligations, obMonth, branchFilter),
    [obligations, obMonth, branchFilter]
  );

  const periodSales = useMemo(() => {
    return transactions.filter((t): t is Sale => {
      if (t.type !== "sale") return false;
      if (!inPeriod(t.date, period.from, period.to)) return false;
      if (!branchOk(t.branch, branchFilter)) return false;
      if (isCreditOrder(t) && isCreditOrderActive(t)) return false;
      return true;
    });
  }, [transactions, period, branchFilter]);

  const salesByMethod = useMemo(() => {
    const all = groupBranchSales(periodSales);
    return {
      all,
      cash: all.filter((g) => g.paymentMethod === "ქეში (ნაღდი)"),
      card: all.filter((g) => g.paymentMethod === "ბარათი"),
      bank: all.filter((g) => g.paymentMethod === "ანგარიშზე ჩარიცხვა"),
    };
  }, [periodSales]);

  const expensesByDay = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      if (!inPeriod(t.date, period.from, period.to)) continue;
      if (!branchOk(t.branch, branchFilter)) continue;
      const d = t.date.slice(0, 10);
      const list = map.get(d) ?? [];
      list.push(t);
      map.set(d, list);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({
        date,
        items: items.sort((a, b) => b.amount - a.amount),
        total: items.reduce((s, x) => s + x.amount, 0),
      }));
  }, [transactions, period, branchFilter]);

  const depositsByDay = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of transactions) {
      if (t.type !== "deposit") continue;
      if (!inPeriod(t.date, period.from, period.to)) continue;
      if (!branchOk(t.branch, branchFilter)) continue;
      const d = t.date.slice(0, 10);
      const list = map.get(d) ?? [];
      list.push(t);
      map.set(d, list);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({
        date,
        items,
        total: items.reduce((s, x) => s + x.amount, 0),
      }));
  }, [transactions, period, branchFilter]);

  const unreviewedRows = useMemo(() => {
    const rows: { id: string; date: string; branch: string; label: string; method: string; amount: number }[] = [];
    for (const t of transactions) {
      if (t.type !== "sale" && t.type !== "deposit") continue;
      if (!inPeriod(t.date, period.from, period.to)) continue;
      if (!branchOk(t.branch, branchFilter)) continue;
      const method = txPaymentMethod(t);
      if (method !== "ბარათი" && method !== "ანგარიშზე ჩარიცხვა") continue;
      if (t.type === "sale" && isCreditOrder(t) && isCreditOrderActive(t)) continue;
      if (bankLedgerReviewed[t.id]) continue;
      rows.push({
        id: t.id,
        date: t.date.slice(0, 10),
        branch: t.branch,
        label:
          t.type === "sale"
            ? `${saleGroupLabel(t)} · ${t.productName}`
            : t.comment || "შენატანი",
        method: paymentShort(method),
        amount: t.amount,
      });
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, period, branchFilter, bankLedgerReviewed]);

  const creditRows = useMemo(() => {
    const rows: { id: string; date: string; branch: string; buyer: string; left: number; product: string }[] = [];
    for (const t of transactions) {
      if (t.type !== "sale") continue;
      if (!isCreditOrder(t) || !isCreditOrderActive(t)) continue;
      if (!branchOk(t.branch, branchFilter)) continue;
      const left = saleCreditRemaining(t);
      if (left <= 0) continue;
      rows.push({
        id: t.id,
        date: t.date.slice(0, 10),
        branch: t.branch,
        buyer: t.buyerName || "—",
        left,
        product: `${t.productName} × ${t.quantity}`,
      });
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, branchFilter]);

  const zeroReports = useMemo(() => {
    return branchReports
      .filter((r) => {
        if (!inPeriod(r.date, period.from, period.to)) return false;
        if (!branchOk(r.branch, branchFilter)) return false;
        return isZeroTradeReport(r);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [branchReports, period, branchFilter]);

  const reportsInPeriod = useMemo(() => {
    return branchReports.filter((r) => {
      if (!inPeriod(r.date, period.from, period.to)) return false;
      return branchOk(r.branch, branchFilter);
    }).length;
  }, [branchReports, period, branchFilter]);

  function dayRowsFromGroups(groups: ReturnType<typeof groupBranchSales>) {
    const byDay = new Map<string, { date: string; groups: typeof groups; total: number }>();
    for (const g of groups) {
      const cur = byDay.get(g.date) ?? { date: g.date, groups: [], total: 0 };
      cur.groups.push(g);
      cur.total += g.total;
      byDay.set(g.date, cur);
    }
    return [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
  }

  function valueFor(id: MetricId): string {
    switch (id) {
      case "revenue":
        return formatMoney(channel.revenueTotal);
      case "expense":
        return formatMoney(flow.expenses);
      case "net":
        return formatMoney(channel.net);
      case "rev_cash":
        return formatMoney(channel.revenueCash);
      case "rev_card":
        return formatMoney(channel.revenueCard);
      case "rev_bank":
        return formatMoney(channel.revenueBank);
      case "bal_cash":
        return formatMoney(balances.cash);
      case "bal_card":
        return formatMoney(balances.card);
      case "bal_bank":
        return formatMoney(balances.bank);
      case "bal_total":
        return formatMoney(balances.cash + balances.card + balances.bank);
      case "obligations":
        return formatMoney(ob.remaining);
      case "credit":
        return formatMoney(creditRows.reduce((s, r) => s + r.left, 0));
      case "unreviewed":
        return String(unreviewedRows.length);
      case "zero_reports":
        return String(zeroReports.length);
      case "deposits":
        return formatMoney(flow.deposits);
      case "branch_activity":
        return String(reportsInPeriod);
      default:
        return "—";
    }
  }

  const detail = METRICS.find((m) => m.id === active)!;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-sky-900/40 bg-gradient-to-br from-sky-950/30 via-zinc-950 to-zinc-950 p-6 sm:p-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">
          კომპანიის მფლობელი
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
          მაჩვენებლები
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-400">
          დააჭირე მაჩვენებელს — დეტალები იშლება აქვე, თარიღების მიხედვით. სხვა გვერდზე არ გადადიხარ.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          პერიოდი: <span className="text-sky-300">{period.label}</span>
          {branchFilter !== "ყველა" && (
            <>
              {" · "}ფილიალი: <span className="text-sky-300">{branchFilter}</span>
            </>
          )}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {METRICS.map((m) => {
          const on = active === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setActive(m.id);
                setOpenDay(null);
              }}
              className={`rounded-xl border px-4 py-3 text-left transition ${m.accent} ${
                on ? "ring-2 ring-sky-500/60" : "hover:brightness-110"
              }`}
            >
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">{m.short}</p>
              <p className="mt-1 text-sm font-medium text-zinc-100">{m.title}</p>
              <p className={`mt-2 text-xl font-semibold tabular-nums ${m.accent.split(" ")[0]}`}>
                {valueFor(m.id)}
              </p>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">{detail.title}</h3>
            <p className="mt-1 text-sm text-zinc-400">{detail.short}</p>
          </div>
          <p className={`text-2xl font-bold tabular-nums ${detail.accent.split(" ")[0]}`}>
            {valueFor(detail.id)}
          </p>
        </div>

        {(active === "revenue" ||
          active === "rev_cash" ||
          active === "rev_card" ||
          active === "rev_bank") && (
          <SalesDayTable
            days={dayRowsFromGroups(
              active === "revenue"
                ? salesByMethod.all
                : active === "rev_cash"
                  ? salesByMethod.cash
                  : active === "rev_card"
                    ? salesByMethod.card
                    : salesByMethod.bank
            )}
            openDay={openDay}
            setOpenDay={setOpenDay}
            showBranch={branchFilter === "ყველა"}
          />
        )}

        {active === "expense" && (
          <ExpenseDayTable days={expensesByDay} openDay={openDay} setOpenDay={setOpenDay} />
        )}

        {active === "net" && (
          <p className="text-sm text-zinc-300">
            შემოსავალი {formatMoney(channel.revenueTotal)} − ოპერაციული ხარჯი{" "}
            {formatMoney(channel.expenseOperating)} ={" "}
            <strong className={channel.net >= 0 ? "text-emerald-400" : "text-red-400"}>
              {formatMoney(channel.net)}
            </strong>
          </p>
        )}

        {(active === "bal_cash" ||
          active === "bal_card" ||
          active === "bal_bank" ||
          active === "bal_total") && (
          <ul className="space-y-1 text-sm text-zinc-300">
            <li>ქეში: {formatMoney(balances.cash)}</li>
            <li>ბარათი: {formatMoney(balances.card)}</li>
            <li>ანგარიში: {formatMoney(balances.bank)}</li>
            <li className="pt-1 font-medium text-zinc-100">
              ჯამი: {formatMoney(balances.cash + balances.card + balances.bank)}
            </li>
          </ul>
        )}

        {active === "obligations" && (
          <ObligationsDetail
            items={ob.items}
            payments={obligationPayments}
            summary={ob}
            month={obMonth}
          />
        )}

        {active === "credit" && (
          <div className="overflow-x-auto">
            {creditRows.length === 0 ? (
              <p className="text-sm text-zinc-500">აქტიური ბე არ არის</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                    <th className="pb-2 pr-3">თარიღი</th>
                    <th className="pb-2 pr-3">ფილიალი</th>
                    <th className="pb-2 pr-3">მყიდველი</th>
                    <th className="pb-2 pr-3">პროდუქტი</th>
                    <th className="pb-2 text-right">გადასახდელი</th>
                  </tr>
                </thead>
                <tbody>
                  {creditRows.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-800/50">
                      <td className="py-2 pr-3">{r.date}</td>
                      <td className="py-2 pr-3">{r.branch}</td>
                      <td className="py-2 pr-3">{r.buyer}</td>
                      <td className="py-2 pr-3 text-zinc-400">{r.product}</td>
                      <td className="py-2 text-right text-orange-300">{formatMoney(r.left)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {active === "unreviewed" && (
          <div className="overflow-x-auto">
            {unreviewedRows.length === 0 ? (
              <p className="text-sm text-zinc-500">ყველა ჩარიცხვა მონიშნულია</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                    <th className="pb-2 pr-3">თარიღი</th>
                    <th className="pb-2 pr-3">ფილიალი</th>
                    <th className="pb-2 pr-3">აღწერა</th>
                    <th className="pb-2 pr-3">არხი</th>
                    <th className="pb-2 text-right">თანხა</th>
                  </tr>
                </thead>
                <tbody>
                  {unreviewedRows.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-800/50">
                      <td className="py-2 pr-3">{r.date}</td>
                      <td className="py-2 pr-3">{r.branch}</td>
                      <td className="py-2 pr-3">{r.label}</td>
                      <td className="py-2 pr-3 text-zinc-400">{r.method}</td>
                      <td className="py-2 text-right text-amber-200">{formatMoney(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {active === "zero_reports" && (
          <div className="overflow-x-auto">
            {zeroReports.length === 0 ? (
              <p className="text-sm text-zinc-500">ნულოვანი რეპორტი არ არის</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                    <th className="pb-2 pr-3">თარიღი</th>
                    <th className="pb-2 pr-3">ფილიალი</th>
                    <th className="pb-2">გამომგზავნი</th>
                  </tr>
                </thead>
                <tbody>
                  {zeroReports.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-800/50">
                      <td className="py-2 pr-3">{r.date}</td>
                      <td className="py-2 pr-3">{r.branch}</td>
                      <td className="py-2 text-zinc-400">{r.submittedBy || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {active === "deposits" && (
          <DepositDayTable days={depositsByDay} openDay={openDay} setOpenDay={setOpenDay} />
        )}

        {active === "branch_activity" && (
          <p className="text-sm text-zinc-300">
            რეპორტები პერიოდში: <strong>{reportsInPeriod}</strong> · ნულოვანი: {zeroReports.length}
          </p>
        )}
      </div>
    </section>
  );
}

function SalesDayTable({
  days,
  openDay,
  setOpenDay,
  showBranch,
}: {
  days: { date: string; groups: ReturnType<typeof groupBranchSales>; total: number }[];
  openDay: string | null;
  setOpenDay: (d: string | null) => void;
  showBranch: boolean;
}) {
  if (days.length === 0) {
    return <p className="text-sm text-zinc-500">ამ პერიოდში გაყიდვები არ არის</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
            <th className="px-3 py-2">დღე</th>
            <th className="px-3 py-2 text-right">გაყიდვები</th>
            <th className="px-3 py-2 text-right">ჯამი</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <Fragment key={day.date}>
              <tr className="border-b border-zinc-800/50 hover:bg-zinc-900/40">
                <td className="px-3 py-2 font-medium">{day.date}</td>
                <td className="px-3 py-2 text-right">{day.groups.length}</td>
                <td className="px-3 py-2 text-right text-emerald-400">{formatMoney(day.total)}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="text-xs text-sky-400 hover:text-sky-300"
                    onClick={() => setOpenDay(openDay === day.date ? null : day.date)}
                  >
                    {openDay === day.date ? "▲ დამალვა" : "▼ დეტალები"}
                  </button>
                </td>
              </tr>
              {openDay === day.date && (
                <tr className="border-b border-zinc-800/50 bg-zinc-950/50">
                  <td colSpan={4} className="px-3 py-3">
                    <div className="space-y-2">
                      {day.groups.map((g) => (
                        <div
                          key={g.groupId}
                          className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium text-zinc-200">
                              {showBranch && (
                                <span className="mr-2 text-[10px] uppercase text-zinc-500">
                                  {g.branch}
                                </span>
                              )}
                              {g.label}
                              <span className="ml-2 text-zinc-500">
                                · {paymentShort(g.paymentMethod)}
                              </span>
                            </p>
                            <span className="font-medium text-emerald-400">
                              {formatMoney(g.total)}
                            </span>
                          </div>
                          <p className="mt-1 text-zinc-500">
                            {g.lines.map((l) => `${l.productName} × ${l.quantity}`).join(" · ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpenseDayTable({
  days,
  openDay,
  setOpenDay,
}: {
  days: { date: string; items: Expense[]; total: number }[];
  openDay: string | null;
  setOpenDay: (d: string | null) => void;
}) {
  if (days.length === 0) {
    return <p className="text-sm text-zinc-500">ამ პერიოდში ხარჯები არ არის</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
            <th className="px-3 py-2">დღე</th>
            <th className="px-3 py-2 text-right">ჩანაწერი</th>
            <th className="px-3 py-2 text-right">ჯამი</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <Fragment key={day.date}>
              <tr className="border-b border-zinc-800/50">
                <td className="px-3 py-2 font-medium">{day.date}</td>
                <td className="px-3 py-2 text-right">{day.items.length}</td>
                <td className="px-3 py-2 text-right text-red-400">{formatMoney(day.total)}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="text-xs text-sky-400"
                    onClick={() => setOpenDay(openDay === day.date ? null : day.date)}
                  >
                    {openDay === day.date ? "▲ დამალვა" : "▼ დეტალები"}
                  </button>
                </td>
              </tr>
              {openDay === day.date && (
                <tr className="border-b border-zinc-800/50 bg-zinc-950/50">
                  <td colSpan={4} className="px-3 py-3">
                    <div className="space-y-2">
                      {day.items.map((ex) => (
                        <div
                          key={ex.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-xs"
                        >
                          <div>
                            <p className="font-medium text-zinc-200">
                              {ex.category}
                              <span className="ml-2 text-zinc-500">
                                · {ex.branch} · {paymentMethodLabel(txPaymentMethod(ex))}
                              </span>
                            </p>
                            <p className="text-zinc-500">{ex.comment || "—"}</p>
                          </div>
                          <span className="font-medium text-red-400">−{formatMoney(ex.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DepositDayTable({
  days,
  openDay,
  setOpenDay,
}: {
  days: { date: string; items: Transaction[]; total: number }[];
  openDay: string | null;
  setOpenDay: (d: string | null) => void;
}) {
  if (days.length === 0) {
    return <p className="text-sm text-zinc-500">შენატანები არ არის</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
            <th className="px-3 py-2">დღე</th>
            <th className="px-3 py-2 text-right">ჯამი</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <Fragment key={day.date}>
              <tr className="border-b border-zinc-800/50">
                <td className="px-3 py-2 font-medium">{day.date}</td>
                <td className="px-3 py-2 text-right text-teal-300">{formatMoney(day.total)}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="text-xs text-sky-400"
                    onClick={() => setOpenDay(openDay === day.date ? null : day.date)}
                  >
                    {openDay === day.date ? "▲ დამალვა" : "▼ დეტალები"}
                  </button>
                </td>
              </tr>
              {openDay === day.date && (
                <tr className="bg-zinc-950/50">
                  <td colSpan={3} className="px-3 py-3 text-xs text-zinc-400">
                    {day.items.map((t) =>
                      t.type === "deposit" ? (
                        <p key={t.id} className="mb-1">
                          {t.branch} · {t.kind || "შენატანი"} · {t.comment || "—"} ·{" "}
                          <span className="text-teal-300">{formatMoney(t.amount)}</span>
                        </p>
                      ) : null
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ObligationsDetail({
  items,
  payments,
  summary,
  month,
}: {
  items: Obligation[];
  payments: ObligationPayment[];
  summary: { total: number; paid: number; remaining: number };
  month: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">ვალდებულებები არ არის ({month})</p>;
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        თვე {month}: ჯამი {formatMoney(summary.total)} · გადახდილი {formatMoney(summary.paid)} ·
        დარჩენილი <span className="text-amber-300">{formatMoney(summary.remaining)}</span>
      </p>
      <div className="space-y-3">
        {items.map((o) => {
          const pays = payments.filter((p) => p.obligationId === o.id);
          const left = o.amount - o.paid;
          return (
            <div key={o.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-zinc-100">{o.name}</p>
                  <p className="text-xs text-zinc-500">
                    {o.branch} · {o.category}
                    {o.comment ? ` · ${o.comment}` : ""}
                  </p>
                </div>
                <p className="text-zinc-300">
                  {formatMoney(o.paid)} / {formatMoney(o.amount)}
                </p>
              </div>
              <p className="mt-2 text-xs text-violet-300">
                დაგეგმილი გასტუმრება:{" "}
                {o.plannedPayDate || o.plannedPaymentMethod ? (
                  <>
                    {o.plannedPayDate || "თარიღი არ არის"}
                    {" · "}
                    {o.plannedPaymentMethod
                      ? paymentMethodLabel(o.plannedPaymentMethod as PaymentMethod)
                      : "საშუალება არ არის"}
                  </>
                ) : (
                  <span className="text-zinc-500">არ არის მითითებული — დაამატე ვალდებულებების ტაბში</span>
                )}
              </p>
              {left > 0 && (
                <p className="mt-1 text-xs text-amber-400">დარჩენილი: {formatMoney(left)}</p>
              )}
              {pays.length > 0 && (
                <div className="mt-2 border-t border-zinc-800 pt-2">
                  <p className="mb-1 text-[10px] uppercase text-zinc-500">გასტუმრების ისტორია</p>
                  {pays.map((p) => (
                    <p key={p.id} className="text-xs text-zinc-400">
                      {p.paidAt.slice(0, 10)} · {formatMoney(p.amount)}
                      {p.paymentMethod ? ` · ${paymentMethodLabel(p.paymentMethod)}` : ""}
                      {p.branch ? ` · ${p.branch}` : ""}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
