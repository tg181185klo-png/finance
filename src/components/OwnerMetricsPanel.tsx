"use client";

import { useMemo, useState } from "react";
import type {
  Branch,
  BranchCash,
  BranchDailyReport,
  Obligation,
  Sale,
  Transaction,
} from "@/lib/types";
import type { ResolvedPeriod } from "@/lib/period-filter";
import { periodFlow } from "@/lib/period-filter";
import { computeScopePeriodStats } from "@/lib/flow-detail";
import { isZeroTradeReport } from "@/lib/branch-payments";
import {
  calcBalances,
  currentMonth,
  formatMoney,
  isCreditOrder,
  isCreditOrderActive,
  obligationSummary,
  saleCreditRemaining,
} from "@/lib/utils";

type NavTarget =
  | "overview"
  | "bank"
  | "payments"
  | "expenses"
  | "reports"
  | "obligations"
  | "branches"
  | "balances"
  | "main"
  | "clients"
  | "system";

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
  bankLedgerReviewed?: Record<string, string>;
  period: ResolvedPeriod;
  branchFilter: Branch | "ყველა";
  onOpen?: (tab: NavTarget) => void;
};

type MetricDef = {
  id: MetricId;
  title: string;
  short: string;
  accent: string;
  tab?: NavTarget;
};

const METRICS: MetricDef[] = [
  {
    id: "revenue",
    title: "შემოსავალი (პერიოდი)",
    short: "გაყიდვების ჯამი არჩეულ პერიოდში",
    accent: "text-emerald-400 border-emerald-900/50 bg-emerald-950/20",
    tab: "overview",
  },
  {
    id: "expense",
    title: "ხარჯი (პერიოდი)",
    short: "ოპერაციული და სხვა ხარჯები",
    accent: "text-red-400 border-red-900/50 bg-red-950/20",
    tab: "expenses",
  },
  {
    id: "net",
    title: "ნეტო (შემოსავალი − ხარჯი)",
    short: "პერიოდის შედეგი",
    accent: "text-sky-300 border-sky-900/50 bg-sky-950/20",
    tab: "overview",
  },
  {
    id: "rev_cash",
    title: "შემოსავალი — ქეში",
    short: "ნაღდი ფულით გაყიდვები",
    accent: "text-emerald-300 border-zinc-800 bg-zinc-900/40",
    tab: "payments",
  },
  {
    id: "rev_card",
    title: "შემოსავალი — ბარათი",
    short: "ობიექტზე გატარებული ბარათი",
    accent: "text-violet-300 border-zinc-800 bg-zinc-900/40",
    tab: "bank",
  },
  {
    id: "rev_bank",
    title: "შემოსავალი — გადმორიცხვა",
    short: "ანგარიშზე ჩარიცხვით გადახდები",
    accent: "text-sky-300 border-zinc-800 bg-zinc-900/40",
    tab: "bank",
  },
  {
    id: "bal_cash",
    title: "ნაშთი — ქეში",
    short: "მიმდინარე ნაღდი ფული",
    accent: "text-emerald-300 border-zinc-800 bg-zinc-900/40",
    tab: "balances",
  },
  {
    id: "bal_card",
    title: "ნაშთი — ბარათი",
    short: "ბარათზე დაგროვილი / ასახული",
    accent: "text-violet-300 border-zinc-800 bg-zinc-900/40",
    tab: "balances",
  },
  {
    id: "bal_bank",
    title: "ნაშთი — ანგარიში",
    short: "საბანკო ანგარიშის ნაშთი",
    accent: "text-sky-300 border-zinc-800 bg-zinc-900/40",
    tab: "bank",
  },
  {
    id: "bal_total",
    title: "ჯამური ნაშთი",
    short: "ქეში + ბარათი + ანგარიში",
    accent: "text-zinc-100 border-emerald-900/40 bg-emerald-950/15",
    tab: "balances",
  },
  {
    id: "obligations",
    title: "ვალდებულებები",
    short: "გასასტუმრებელი და უკვე გადახდილი",
    accent: "text-amber-300 border-amber-900/40 bg-amber-950/15",
    tab: "obligations",
  },
  {
    id: "credit",
    title: "ბე / გადასახდელი",
    short: "აქტიური კრედიტის ნაშთი",
    accent: "text-orange-300 border-orange-900/40 bg-orange-950/15",
    tab: "clients",
  },
  {
    id: "unreviewed",
    title: "არაისახა ანგარიშზე",
    short: "ბარათი/გადმორიცხვა ჯერ შეუმოწმებელი",
    accent: "text-amber-200 border-amber-900/50 bg-amber-950/20",
    tab: "bank",
  },
  {
    id: "zero_reports",
    title: "ნულოვანი რეპორტები",
    short: "დღეები გაყიდვის გარეშე",
    accent: "text-zinc-300 border-zinc-700 bg-zinc-900/50",
    tab: "overview",
  },
  {
    id: "deposits",
    title: "შენატანები",
    short: "დამფუძნებელი / სხვა შენატანი პერიოდში",
    accent: "text-teal-300 border-teal-900/40 bg-teal-950/15",
    tab: "main",
  },
  {
    id: "branch_activity",
    title: "ფილიალის რეპორტები",
    short: "ობიექტებიდან გაგზავნილი რეპორტები",
    accent: "text-teal-200 border-teal-900/40 bg-teal-950/15",
    tab: "branches",
  },
];

export default function OwnerMetricsPanel({
  transactions,
  branchCash,
  branchReports,
  obligations,
  bankLedgerReviewed = {},
  period,
  branchFilter,
  onOpen,
}: Props) {
  const [active, setActive] = useState<MetricId | null>("revenue");
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

  const creditLeft = useMemo(() => {
    let sum = 0;
    let count = 0;
    for (const t of transactions) {
      if (t.type !== "sale") continue;
      if (!isCreditOrder(t) || !isCreditOrderActive(t)) continue;
      if (branchFilter !== "ყველა" && t.branch !== branchFilter) continue;
      const left = saleCreditRemaining(t);
      if (left > 0) {
        sum += left;
        count += 1;
      }
    }
    return { sum, count };
  }, [transactions, branchFilter]);

  const unreviewed = useMemo(() => {
    let count = 0;
    let amount = 0;
    for (const t of transactions) {
      if (t.type !== "sale" && t.type !== "deposit") continue;
      if (!txInPeriodSafe(t.date, period.from, period.to)) continue;
      if (branchFilter !== "ყველა" && t.branch !== branchFilter) continue;
      const method = t.type === "sale" ? t.paymentMethod : t.depositPaymentMethod;
      if (method !== "ბარათი" && method !== "ანგარიშზე ჩარიცხვა") continue;
      if (t.type === "sale" && isCreditOrder(t) && isCreditOrderActive(t)) continue;
      if (bankLedgerReviewed[t.id]) continue;
      count += 1;
      amount += t.amount;
    }
    return { count, amount };
  }, [transactions, period, branchFilter, bankLedgerReviewed]);

  const zeroReports = useMemo(() => {
    const list = branchReports.filter((r) => {
      if (r.date < period.from || r.date > period.to) return false;
      if (branchFilter !== "ყველა" && r.branch !== branchFilter) return false;
      return isZeroTradeReport(r);
    });
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [branchReports, period, branchFilter]);

  const reportsInPeriod = useMemo(() => {
    return branchReports.filter((r) => {
      if (r.date < period.from || r.date > period.to) return false;
      if (branchFilter !== "ყველა" && r.branch !== branchFilter) return false;
      return true;
    }).length;
  }, [branchReports, period, branchFilter]);

  const saleCount = useMemo(() => {
    return transactions.filter((t): t is Sale => {
      if (t.type !== "sale") return false;
      if (!txInPeriodSafe(t.date, period.from, period.to)) return false;
      if (branchFilter !== "ყველა" && t.branch !== branchFilter) return false;
      return true;
    }).length;
  }, [transactions, period, branchFilter]);

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
        return formatMoney(creditLeft.sum);
      case "unreviewed":
        return String(unreviewed.count);
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

  const detail = active ? METRICS.find((m) => m.id === active) : null;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-sky-900/40 bg-gradient-to-br from-sky-950/30 via-zinc-950 to-zinc-950 p-6 sm:p-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400/80">
          კომპანიის მფლობელი
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
          მაჩვენებლები
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-400 sm:text-base">
          ყველა ძირითადი ციფრი, რაც მფლობელს სჭირდება კონტროლისთვის. დააჭირე მაჩვენებელს —
          გამოჩნდება ახსნა, მიმდინარე მნიშვნელობა და შესაბამისი გვერდი.
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
              onClick={() => setActive(on ? null : m.id)}
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

      {detail && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-5">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-zinc-100">{detail.title}</h3>
              <p className="mt-1 text-sm text-zinc-400">{detail.short}</p>
            </div>
            <p className={`text-2xl font-bold tabular-nums ${detail.accent.split(" ")[0]}`}>
              {valueFor(detail.id)}
            </p>
          </div>

          <MetricDetailBody
            id={detail.id}
            channel={channel}
            flow={flow}
            balances={balances}
            ob={ob}
            creditLeft={creditLeft}
            unreviewed={unreviewed}
            zeroReports={zeroReports}
            reportsInPeriod={reportsInPeriod}
            saleCount={saleCount}
            periodLabel={period.label}
            obMonth={obMonth}
          />

          {detail.tab && onOpen && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
              <button
                type="button"
                className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
                onClick={() => onOpen(detail.tab!)}
              >
                გახსენი შესაბამისი გვერდი
              </button>
              <button
                type="button"
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
                onClick={() => setActive(null)}
              >
                დახურვა
              </button>
            </div>
          )}
        </div>
      )}

      {!detail && (
        <p className="text-sm text-zinc-500">აირჩიე მაჩვენებელი ზემოთ — დეტალური ინფორმაცია აქ გამოჩნდება.</p>
      )}
    </section>
  );
}

function txInPeriodSafe(date: string, from: string, to: string) {
  const d = date.slice(0, 10);
  return d >= from && d <= to;
}

function MetricDetailBody({
  id,
  channel,
  flow,
  balances,
  ob,
  creditLeft,
  unreviewed,
  zeroReports,
  reportsInPeriod,
  saleCount,
  periodLabel,
  obMonth,
}: {
  id: MetricId;
  channel: ReturnType<typeof computeScopePeriodStats>;
  flow: ReturnType<typeof periodFlow>;
  balances: ReturnType<typeof calcBalances>;
  ob: ReturnType<typeof obligationSummary>;
  creditLeft: { sum: number; count: number };
  unreviewed: { count: number; amount: number };
  zeroReports: BranchDailyReport[];
  reportsInPeriod: number;
  saleCount: number;
  periodLabel: string;
  obMonth: string;
}) {
  if (id === "revenue") {
    return (
      <div className="space-y-2 text-sm text-zinc-300">
        <p>
          პერიოდში <span className="text-zinc-100">{periodLabel}</span> გაყიდვების ჯამი:{" "}
          <strong className="text-emerald-400">{formatMoney(channel.revenueTotal)}</strong> ·{" "}
          {saleCount} ჩანაწერი.
        </p>
        <ul className="space-y-1 text-xs text-zinc-500">
          <li>ქეში: {formatMoney(channel.revenueCash)}</li>
          <li>ბარათი: {formatMoney(channel.revenueCard)}</li>
          <li>გადმორიცხვა: {formatMoney(channel.revenueBank)}</li>
        </ul>
      </div>
    );
  }
  if (id === "expense") {
    return (
      <div className="space-y-2 text-sm text-zinc-300">
        <p>
          ხარჯების ჯამი პერიოდში: <strong className="text-red-400">{formatMoney(flow.expenses)}</strong>
        </p>
        <ul className="space-y-1 text-xs text-zinc-500">
          <li>ოპერაციული ხარჯი (ანგარიშში): {formatMoney(channel.expenseOperating)}</li>
          <li>ქეშით: {formatMoney(channel.expenseCash)}</li>
          <li>ბარათით: {formatMoney(channel.expenseCard)}</li>
          <li>ანგარიშიდან: {formatMoney(channel.expenseBank)}</li>
        </ul>
      </div>
    );
  }
  if (id === "net") {
    return (
      <p className="text-sm text-zinc-300">
        შემოსავალი {formatMoney(channel.revenueTotal)} − ხარჯი {formatMoney(channel.expenseOperating)} ={" "}
        <strong className={channel.net >= 0 ? "text-emerald-400" : "text-red-400"}>
          {formatMoney(channel.net)}
        </strong>
        . ეს არის პერიოდის ოპერაციული შედეგი.
      </p>
    );
  }
  if (id === "rev_cash" || id === "rev_card" || id === "rev_bank") {
    const map = {
      rev_cash: { v: channel.revenueCash, n: "ქეში" },
      rev_card: { v: channel.revenueCard, n: "ბარათი" },
      rev_bank: { v: channel.revenueBank, n: "გადმორიცხვა" },
    } as const;
    const x = map[id];
    const pct = channel.revenueTotal > 0 ? Math.round((x.v / channel.revenueTotal) * 100) : 0;
    return (
      <p className="text-sm text-zinc-300">
        {x.n}-ით შემოსავალი: <strong>{formatMoney(x.v)}</strong> · მთლიანი შემოსავლის {pct}%.
      </p>
    );
  }
  if (id === "bal_cash" || id === "bal_card" || id === "bal_bank" || id === "bal_total") {
    return (
      <ul className="space-y-1 text-sm text-zinc-300">
        <li>ქეში: {formatMoney(balances.cash)}</li>
        <li>ბარათი: {formatMoney(balances.card)}</li>
        <li>ანგარიში: {formatMoney(balances.bank)}</li>
        <li className="pt-1 font-medium text-zinc-100">
          ჯამი: {formatMoney(balances.cash + balances.card + balances.bank)}
        </li>
      </ul>
    );
  }
  if (id === "obligations") {
    return (
      <div className="space-y-2 text-sm text-zinc-300">
        <p>
          თვე {obMonth}: ვალდებულება {formatMoney(ob.total)} · გადახდილი {formatMoney(ob.paid)} · დარჩენილი{" "}
          <strong className="text-amber-300">{formatMoney(ob.remaining)}</strong>
        </p>
        <p className="text-xs text-zinc-500">{ob.items.length} ჩანაწერი სიაში</p>
      </div>
    );
  }
  if (id === "credit") {
    return (
      <p className="text-sm text-zinc-300">
        აქტიური ბე: {creditLeft.count} შეკვეთა · გადასახდელი{" "}
        <strong className="text-orange-300">{formatMoney(creditLeft.sum)}</strong>
      </p>
    );
  }
  if (id === "unreviewed") {
    return (
      <p className="text-sm text-zinc-300">
        {unreviewed.count} ჩარიცხვა ჯერ არ არის მონიშნული „აისახა“-დ · თანხა{" "}
        <strong className="text-amber-200">{formatMoney(unreviewed.amount)}</strong>. შეამოწმე საბანკო
        ანგარიშში ან ამონაწერის შედარებით.
      </p>
    );
  }
  if (id === "zero_reports") {
    return (
      <div className="space-y-2 text-sm text-zinc-300">
        <p>ნულოვანი რეპორტები პერიოდში: {zeroReports.length}</p>
        {zeroReports.length > 0 && (
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-zinc-500">
            {zeroReports.slice(0, 12).map((r) => (
              <li key={r.id}>
                {r.date} · {r.branch}
                {r.submittedBy ? ` · ${r.submittedBy}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  if (id === "deposits") {
    return (
      <p className="text-sm text-zinc-300">
        შენატანები პერიოდში: <strong className="text-teal-300">{formatMoney(flow.deposits)}</strong>
        {flow.founderDeposits > 0 && (
          <> · აქედან დამფუძნებელი: {formatMoney(flow.founderDeposits)}</>
        )}
      </p>
    );
  }
  if (id === "branch_activity") {
    return (
      <p className="text-sm text-zinc-300">
        ობიექტებიდან მიღებული რეპორტები პერიოდში: <strong>{reportsInPeriod}</strong> · აქედან ნულოვანი:{" "}
        {zeroReports.length}
      </p>
    );
  }
  return null;
}
