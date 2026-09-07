"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import type { Branch, BranchCash, BranchDailyReport, PaymentMethod, Sale, Transaction } from "@/lib/types";
import {
  branchPaymentOptions,
  branchSalesForPayments,
  branchesSalesForPayments,
  groupBranchSales,
  isDistribuciaBranch,
  isZeroTradeReport,
  paymentBucket,
  paymentShort,
  isConsignmentOrCreditSale,
  type SalePaymentGroup,
} from "@/lib/branch-payments";
import { isCreditOrderActive, saleCreditRemaining } from "@/lib/utils";
import { currentMonth, formatMoney, monthStartEnd } from "@/lib/utils";
import { CurrentBalanceStrip } from "@/components/OpeningBalancesSummary";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-emerald-500";
const labelCls = "mb-1 block text-xs text-zinc-400";
const selectCls = "rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs focus:border-emerald-500";

type DaySummary = {
  date: string;
  groups: number;
  cash: number;
  bank: number;
  card: number;
  total: number;
  consignment: number;
  zeroReports: number;
};

type ZeroReportRow = {
  reportId: string;
  date: string;
  branch: Branch;
  submittedBy: string;
};

type Theme = {
  border: string;
  bg: string;
  title: string;
  accent: string;
};

const THEMES: Record<Branch, Theme> = {
  დისტრიბუცია: {
    border: "border-violet-900/40",
    bg: "bg-violet-950/20",
    title: "text-violet-200",
    accent: "text-violet-400",
  },
  ქუთაისი: {
    border: "border-emerald-900/40",
    bg: "bg-emerald-950/20",
    title: "text-emerald-200",
    accent: "text-emerald-400",
  },
  ლილო: {
    border: "border-amber-900/40",
    bg: "bg-amber-950/20",
    title: "text-amber-200",
    accent: "text-amber-400",
  },
  დიღომი: {
    border: "border-sky-900/40",
    bg: "bg-sky-950/20",
    title: "text-sky-200",
    accent: "text-sky-400",
  },
};

type Props = {
  branch?: Branch;
  branches?: Branch[];
  title?: string;
  transactions: Transaction[];
  branchReports?: BranchDailyReport[];
  branchCash?: Record<Branch, BranchCash>;
  onRefresh: () => void | Promise<unknown>;
  header?: React.ReactNode;
  subtitle?: string;
  month?: string;
  readOnly?: boolean;
  compact?: boolean;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function isCreditGroup(group: SalePaymentGroup) {
  return (
    paymentBucket(group.paymentMethod) === "credit" ||
    group.lines.some((l) => isConsignmentOrCreditSale(l) && isCreditOrderActive(l))
  );
}

async function updateGroupPayment(group: SalePaymentGroup, paymentMethod: PaymentMethod) {
  if (group.distribuciaOrderId) {
    const res = await fetch("/api/distribucia/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updatePayment",
        orderId: group.distribuciaOrderId,
        paymentMethod,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "შეცდომა");
    return;
  }

  const body: Record<string, string> = { action: "updatePaymentMethod", paymentMethod };
  if (group.clientSaleId) body.clientSaleId = group.clientSaleId;
  else body.id = group.lineIds[0];

  const res = await fetch("/api/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "შეცდომა");
}

export default function BranchPaymentsPanel({
  branch,
  branches: branchesProp,
  title,
  transactions,
  branchReports = [],
  branchCash,
  onRefresh,
  header,
  subtitle,
  month: monthProp,
  readOnly = false,
  compact = false,
}: Props) {
  const scopeBranches = useMemo((): Branch[] => {
    if (branchesProp?.length) return branchesProp;
    if (branch) return [branch];
    return [];
  }, [branchesProp, branch]);

  const combined = scopeBranches.length > 1;
  const primaryBranch = scopeBranches[0] ?? "ქუთაისი";
  const theme = combined ? THEMES.დისტრიბუცია : THEMES[primaryBranch] ?? THEMES.ქუთაისი;
  const showCard = scopeBranches.some((b) => !isDistribuciaBranch(b));
  const heading = title ?? (combined ? scopeBranches.join(" + ") : `${primaryBranch} — გადახდები`);

  const [viewMonth, setViewMonth] = useState(monthProp ?? currentMonth());
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const activeMonth = monthProp ?? viewMonth;
  const { from, to } = useMemo(() => monthStartEnd(activeMonth), [activeMonth]);

  const sales = useMemo(() => {
    const all = transactions.filter((t): t is Sale => t.type === "sale");
    if (combined) return branchesSalesForPayments(all, scopeBranches, from, to);
    return branchSalesForPayments(all, primaryBranch, from, to);
  }, [transactions, combined, scopeBranches, primaryBranch, from, to]);

  const zeroRows = useMemo((): ZeroReportRow[] => {
    const set = new Set(scopeBranches);
    const out: ZeroReportRow[] = [];
    for (const r of branchReports) {
      if (!set.has(r.branch)) continue;
      if (r.date < from || r.date > to) continue;
      if (!isZeroTradeReport(r)) continue;
      out.push({
        reportId: r.id,
        date: r.date,
        branch: r.branch,
        submittedBy: r.submittedBy?.trim() || "—",
      });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [branchReports, scopeBranches, from, to]);

  const zerosByDay = useMemo(() => {
    const map = new Map<string, ZeroReportRow[]>();
    for (const z of zeroRows) {
      const list = map.get(z.date) ?? [];
      list.push(z);
      map.set(z.date, list);
    }
    return map;
  }, [zeroRows]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groupBranchSales(sales).filter((g) => {
      if (!q) return true;
      const hay = [g.label, g.branch, g.groupId, ...g.lines.map((l) => l.productName)]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sales, search]);

  const daySummaries = useMemo(() => {
    const byDay = new Map<string, DaySummary>();
    for (const group of groups) {
      const cur = byDay.get(group.date) ?? {
        date: group.date,
        groups: 0,
        cash: 0,
        bank: 0,
        card: 0,
        total: 0,
        consignment: 0,
        zeroReports: 0,
      };
      if (isCreditGroup(group)) {
        const left = group.lines.reduce((s, l) => s + saleCreditRemaining(l), 0);
        cur.consignment += left > 0 ? left : group.total;
      } else {
        cur.groups += 1;
        cur.total += group.total;
        const bucket = paymentBucket(group.paymentMethod);
        if (bucket !== "credit") cur[bucket] += group.total;
      }
      byDay.set(group.date, cur);
    }
    for (const z of zeroRows) {
      const cur = byDay.get(z.date) ?? {
        date: z.date,
        groups: 0,
        cash: 0,
        bank: 0,
        card: 0,
        total: 0,
        consignment: 0,
        zeroReports: 0,
      };
      cur.zeroReports += 1;
      byDay.set(z.date, cur);
    }
    return [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [groups, zeroRows]);

  const monthTotals = useMemo(() => {
    let cash = 0;
    let bank = 0;
    let card = 0;
    let zeros = 0;
    let consignment = 0;
    for (const d of daySummaries) {
      cash += d.cash;
      bank += d.bank;
      card += d.card;
      zeros += d.zeroReports;
      consignment += d.consignment;
    }
    return {
      cash,
      bank,
      card,
      consignment,
      total: cash + bank + card,
      groups: groups.filter((g) => !isCreditGroup(g)).length,
      zeros,
    };
  }, [daySummaries, groups]);

  const groupsByDay = useMemo(() => {
    const map = new Map<string, SalePaymentGroup[]>();
    for (const group of groups) {
      const list = map.get(group.date) ?? [];
      list.push(group);
      map.set(group.date, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.branch.localeCompare(b.branch, "ka") || b.total - a.total);
    }
    return map;
  }, [groups]);

  const handlePaymentChange = useCallback(
    async (group: SalePaymentGroup, paymentMethod: PaymentMethod) => {
      setBusyGroupId(group.groupId);
      setErr("");
      try {
        await updateGroupPayment(group, paymentMethod);
        await onRefresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "შეცდომა");
      } finally {
        setBusyGroupId(null);
      }
    },
    [onRefresh]
  );

  const defaultSubtitle = combined
    ? "ქუთაისი და დისტრიბუცია ერთად · თარიღის მიხედვით გაერთიანებული"
    : isDistribuciaBranch(primaryBranch)
      ? "ნაგულისხმევად ქეში · შეგიძლიათ შეცვალოთ ქეშად ან გადმორიცხვად"
      : "გაყიდვები დღეების მიხედვით · გადახდის ტიპის ცვლილება ერთ გაყიდვაზე";

  const colSpan = showCard ? 7 : 6;

  return (
    <section className="space-y-6">
      {header}

      <div className={`rounded-xl border ${theme.border} ${theme.bg} p-5`}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className={`font-semibold ${theme.title}`}>
              {combined || title ? heading : `${primaryBranch} — გადახდები`}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">{subtitle ?? defaultSubtitle}</p>
            {monthTotals.zeros > 0 && (
              <p className="mt-1 text-xs text-zinc-400">
                ნულოვანი რეპორტი: {monthTotals.zeros} დღე/ობიექტი
              </p>
            )}
          </div>
          {!monthProp && (
            <Field label="თვე">
              <input
                type="month"
                className={`${inputCls} w-auto`}
                value={viewMonth}
                onChange={(e) => setViewMonth(e.target.value)}
              />
            </Field>
          )}
        </div>

        {!compact && branchCash && !combined && (
          <div className="mb-4">
            <CurrentBalanceStrip
              branchCash={branchCash}
              transactions={transactions}
              branch={primaryBranch}
            />
          </div>
        )}

        <div className={`mb-4 grid gap-3 ${showCard ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-xs text-zinc-500">ნავაჭრი (გაყიდვები)</p>
            <p className="mt-1 text-lg font-semibold">{monthTotals.groups}</p>
          </div>
          <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3">
            <p className="text-xs text-zinc-500">ქეში</p>
            <p className="mt-1 text-lg font-semibold text-emerald-400">{formatMoney(monthTotals.cash)}</p>
          </div>
          <div className="rounded-lg border border-sky-900/40 bg-sky-950/20 p-3">
            <p className="text-xs text-zinc-500">გადმორიცხვა</p>
            <p className="mt-1 text-lg font-semibold text-sky-400">{formatMoney(monthTotals.bank)}</p>
          </div>
          {showCard && (
            <div className="rounded-lg border border-violet-900/40 bg-violet-950/20 p-3">
              <p className="text-xs text-zinc-500">ბარათი</p>
              <p className="mt-1 text-lg font-semibold text-violet-400">{formatMoney(monthTotals.card)}</p>
            </div>
          )}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-xs text-zinc-500">ნავაჭრის ჯამი</p>
            <p className="mt-1 text-lg font-semibold">{formatMoney(monthTotals.total)}</p>
            {monthTotals.consignment > 0 && (
              <p className="mt-1 text-[10px] text-teal-400/90">
                კონსიგნაცია (არ შედის): {formatMoney(monthTotals.consignment)}
              </p>
            )}
          </div>
        </div>

        {!compact && (
          <div className="mb-4">
            <Field label="ძებნა">
              <input
                className={inputCls}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={combined ? "ფილიალი, მომხმარებელი, პროდუქტი..." : "მომხმარებელი, პროდუქტი..."}
              />
            </Field>
          </div>
        )}

        {err && <p className="mb-2 text-sm text-red-400">{err}</p>}

        {daySummaries.length === 0 ? (
          <p className="text-sm text-zinc-500">ამ თვეში გაყიდვები ან ნულოვანი რეპორტი არ არის.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pl-3 pr-3 pt-2">დღე</th>
                  <th className="pb-2 pr-3 text-right">გაყიდვები</th>
                  <th className="pb-2 pr-3 text-right">ქეში</th>
                  <th className="pb-2 pr-3 text-right">გადმორიცხვა</th>
                  {showCard && <th className="pb-2 pr-3 text-right">ბარათი</th>}
                  <th className="pb-2 pr-3 text-right">ჯამი</th>
                  <th className="pb-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {daySummaries.map((day) => {
                  const isZeroOnly = day.groups === 0 && day.zeroReports > 0 && day.consignment <= 0;
                  return (
                    <Fragment key={day.date}>
                      <tr
                        className={`border-b border-zinc-800/50 hover:bg-zinc-900/40 ${
                          isZeroOnly ? "bg-zinc-900/50" : ""
                        }`}
                      >
                        <td className="py-2 pl-3 pr-3 font-medium">
                          {day.date}
                          {isZeroOnly && (
                            <span className="ml-2 text-[10px] font-normal text-zinc-500">ნულოვანი</span>
                          )}
                          {day.consignment > 0 && (
                            <span className="ml-2 text-[10px] font-normal text-teal-400">
                              კონსიგნაცია {formatMoney(day.consignment)}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right">{day.groups}</td>
                        <td className="py-2 pr-3 text-right text-emerald-400">{formatMoney(day.cash)}</td>
                        <td className="py-2 pr-3 text-right text-sky-400">{formatMoney(day.bank)}</td>
                        {showCard && (
                          <td className="py-2 pr-3 text-right text-violet-400">{formatMoney(day.card)}</td>
                        )}
                        <td className="py-2 pr-3 text-right font-medium">{formatMoney(day.total)}</td>
                        <td className="py-2 pr-3">
                          <button
                            type="button"
                            className={`text-xs ${theme.accent} hover:opacity-80`}
                            onClick={() => setExpandedDay(expandedDay === day.date ? null : day.date)}
                          >
                            {expandedDay === day.date ? "▲ დამალვა" : "▼ დეტალები"}
                          </button>
                        </td>
                      </tr>
                      {expandedDay === day.date && (
                        <tr className="border-b border-zinc-800/50 bg-zinc-900/30">
                          <td colSpan={colSpan} className="px-3 py-3">
                            <div className="space-y-2">
                              {(zerosByDay.get(day.date) ?? []).map((z) => (
                                <div
                                  key={z.reportId}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-xs"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-zinc-300">
                                      {(combined || day.zeroReports > 1) && (
                                        <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                                          {z.branch}
                                        </span>
                                      )}
                                      ნულოვანი რეპორტი — გაყიდვა არ ყოფილა
                                    </p>
                                    <p className="text-zinc-500">გამომგზავნი: {z.submittedBy}</p>
                                  </div>
                                  <span className="font-medium text-zinc-500">0.00 ₾</span>
                                </div>
                              ))}
                              {(groupsByDay.get(day.date) ?? []).map((group) => {
                                const opts = branchPaymentOptions(group.branch);
                                const credit = isCreditGroup(group);
                                const remaining = credit
                                  ? group.lines.reduce((s, l) => s + saleCreditRemaining(l), 0)
                                  : group.total;
                                const issuer =
                                  group.lines.find((l) => l.employeeName?.trim())?.employeeName?.trim() ||
                                  null;
                                return (
                                  <div
                                    key={group.groupId}
                                    className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                                      credit
                                        ? "border-teal-900/50 bg-teal-950/20"
                                        : "border-zinc-800/80 bg-zinc-950/40"
                                    }`}
                                  >
                                    {credit && (
                                      <span className="min-w-[5.5rem] shrink-0 font-semibold text-teal-300">
                                        {formatMoney(remaining)}
                                      </span>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="font-medium text-zinc-200">
                                        {combined && (
                                          <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                                            {group.branch}
                                          </span>
                                        )}
                                        {group.label}
                                        {credit && (
                                          <span className="ml-2 text-[10px] font-medium text-teal-400">
                                            კონსიგნაცია → მისაღები
                                          </span>
                                        )}
                                      </p>
                                      <p className="text-zinc-500">
                                        {group.lines.length} ხაზი ·{" "}
                                        {group.lines.map((l) => l.productName).join(", ")}
                                        {issuer ? ` · გასცა: ${issuer}` : ""}
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      {!credit && (
                                        <span className="font-medium text-emerald-400">
                                          {formatMoney(group.total)}
                                        </span>
                                      )}
                                      {readOnly || credit ? (
                                        <span className={credit ? "text-teal-400" : "text-zinc-400"}>
                                          {paymentShort(group.paymentMethod)}
                                        </span>
                                      ) : (
                                        <select
                                          className={selectCls}
                                          value={group.paymentMethod}
                                          disabled={busyGroupId === group.groupId}
                                          onChange={(e) =>
                                            handlePaymentChange(
                                              group,
                                              e.target.value as PaymentMethod
                                            )
                                          }
                                        >
                                          {opts.map((m) => (
                                            <option key={m} value={m}>
                                              {paymentShort(m)}
                                            </option>
                                          ))}
                                        </select>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
