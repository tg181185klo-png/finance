"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import type { Branch, PaymentMethod, Sale, Transaction } from "@/lib/types";
import {
  branchPaymentOptions,
  branchSalesForPayments,
  groupBranchSales,
  isDistribuciaBranch,
  paymentBucket,
  paymentShort,
  type SalePaymentGroup,
} from "@/lib/branch-payments";
import { isCreditOrder, isCreditOrderActive } from "@/lib/utils";
import { currentMonth, formatMoney, monthStartEnd } from "@/lib/utils";

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
  branch: Branch;
  transactions: Transaction[];
  onRefresh: () => void | Promise<void>;
  header?: React.ReactNode;
  subtitle?: string;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
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
  transactions,
  onRefresh,
  header,
  subtitle,
}: Props) {
  const theme = THEMES[branch];
  const paymentOptions = branchPaymentOptions(branch);
  const [viewMonth, setViewMonth] = useState(currentMonth());
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const { from, to } = useMemo(() => monthStartEnd(viewMonth), [viewMonth]);

  const sales = useMemo(() => {
    const all = transactions.filter(
      (t): t is Sale =>
        t.type === "sale" &&
        !(isCreditOrder(t) && isCreditOrderActive(t))
    );
    return branchSalesForPayments(all, branch, from, to);
  }, [transactions, branch, from, to]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groupBranchSales(sales).filter((g) => {
      if (!q) return true;
      const hay = [g.label, g.groupId, ...g.lines.map((l) => l.productName)].join(" ").toLowerCase();
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
      };
      cur.groups += 1;
      cur.total += group.total;
      const bucket = paymentBucket(group.paymentMethod);
      cur[bucket] += group.total;
      byDay.set(group.date, cur);
    }
    return [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [groups]);

  const monthTotals = useMemo(() => {
    let cash = 0;
    let bank = 0;
    let card = 0;
    for (const d of daySummaries) {
      cash += d.cash;
      bank += d.bank;
      card += d.card;
    }
    return { cash, bank, card, total: cash + bank + card, groups: groups.length };
  }, [daySummaries, groups.length]);

  const groupsByDay = useMemo(() => {
    const map = new Map<string, SalePaymentGroup[]>();
    for (const group of groups) {
      const list = map.get(group.date) ?? [];
      list.push(group);
      map.set(group.date, list);
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

  const defaultSubtitle = isDistribuciaBranch(branch)
    ? "ნაგულისხმევად ქეში · შეგიძლიათ შეცვალოთ ქეშად ან გადმორიცხვად"
    : "გაყიდვები დღეების მიხედვით · გადახდის ტიპის ცვლილება ერთ გაყიდვაზე";

  return (
    <section className="space-y-6">
      {header}

      <div className={`rounded-xl border ${theme.border} ${theme.bg} p-5`}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className={`font-semibold ${theme.title}`}>{branch} — გადახდები</h2>
            <p className="mt-1 text-xs text-zinc-500">{subtitle ?? defaultSubtitle}</p>
          </div>
          <Field label="თვე">
            <input
              type="month"
              className={`${inputCls} w-auto`}
              value={viewMonth}
              onChange={(e) => setViewMonth(e.target.value)}
            />
          </Field>
        </div>

        <div className={`mb-4 grid gap-3 ${isDistribuciaBranch(branch) ? "sm:grid-cols-4" : "sm:grid-cols-5"}`}>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-xs text-zinc-500">გაყიდვები</p>
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
          {!isDistribuciaBranch(branch) && (
            <div className="rounded-lg border border-violet-900/40 bg-violet-950/20 p-3">
              <p className="text-xs text-zinc-500">ბარათი</p>
              <p className="mt-1 text-lg font-semibold text-violet-400">{formatMoney(monthTotals.card)}</p>
            </div>
          )}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-xs text-zinc-500">ჯამი</p>
            <p className="mt-1 text-lg font-semibold">{formatMoney(monthTotals.total)}</p>
          </div>
        </div>

        <div className="mb-4">
          <Field label="ძებნა">
            <input
              className={inputCls}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="მომხმარებელი, პროდუქტი..."
            />
          </Field>
        </div>

        {err && <p className="mb-2 text-sm text-red-400">{err}</p>}

        {daySummaries.length === 0 ? (
          <p className="text-sm text-zinc-500">ამ თვეში გაყიდვები არ არის.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pl-3 pr-3 pt-2">დღე</th>
                  <th className="pb-2 pr-3 text-right">გაყიდვები</th>
                  <th className="pb-2 pr-3 text-right">ქეში</th>
                  <th className="pb-2 pr-3 text-right">გადმორიცხვა</th>
                  {!isDistribuciaBranch(branch) && <th className="pb-2 pr-3 text-right">ბარათი</th>}
                  <th className="pb-2 pr-3 text-right">ჯამი</th>
                  <th className="pb-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {daySummaries.map((day) => (
                  <Fragment key={day.date}>
                    <tr className="border-b border-zinc-800/50 hover:bg-zinc-900/40">
                      <td className="py-2 pl-3 pr-3 font-medium">{day.date}</td>
                      <td className="py-2 pr-3 text-right">{day.groups}</td>
                      <td className="py-2 pr-3 text-right text-emerald-400">{formatMoney(day.cash)}</td>
                      <td className="py-2 pr-3 text-right text-sky-400">{formatMoney(day.bank)}</td>
                      {!isDistribuciaBranch(branch) && (
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
                        <td colSpan={isDistribuciaBranch(branch) ? 6 : 7} className="px-3 py-3">
                          <div className="space-y-2">
                            {(groupsByDay.get(day.date) ?? []).map((group) => (
                              <div
                                key={group.groupId}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-xs"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-zinc-200">{group.label}</p>
                                  <p className="text-zinc-500">
                                    {group.lines.length} ხაზი ·{" "}
                                    {group.lines.map((l) => l.productName).join(", ")}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-emerald-400">{formatMoney(group.total)}</span>
                                  <select
                                    className={selectCls}
                                    value={group.paymentMethod}
                                    disabled={busyGroupId === group.groupId}
                                    onChange={(e) =>
                                      handlePaymentChange(group, e.target.value as PaymentMethod)
                                    }
                                  >
                                    {paymentOptions.map((m) => (
                                      <option key={m} value={m}>
                                        {paymentShort(m)}
                                      </option>
                                    ))}
                                  </select>
                                </div>
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
        )}
      </div>
    </section>
  );
}
