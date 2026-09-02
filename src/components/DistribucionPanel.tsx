"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import type { PaymentMethod, Sale, Transaction } from "@/lib/types";
import { PAYMENT_METHODS } from "@/lib/dashboard-data";
import { isDistribuciaSale } from "@/lib/distribucia-sync";
import DistribuciaSyncPanel from "@/components/DistribuciaSyncPanel";
import { currentMonth, formatMoney, monthStartEnd } from "@/lib/utils";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-emerald-500";
const labelCls = "mb-1 block text-xs text-zinc-400";
const selectCls = "rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs focus:border-violet-500";

type OrderRow = {
  orderId: string;
  date: string;
  buyerName: string;
  lines: Sale[];
  total: number;
  paymentMethod: PaymentMethod;
};

type DayPaymentSummary = {
  date: string;
  orders: number;
  cash: number;
  bank: number;
  card: number;
  total: number;
};

type Props = {
  transactions: Transaction[];
  onRefresh: () => void | Promise<void>;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function paymentShort(m: PaymentMethod) {
  if (m === "ქეში (ნაღდი)") return "ქეში";
  if (m === "ანგარიშზე ჩარიცხვა") return "გადმორიცხვა";
  return m;
}

function paymentBucket(m: PaymentMethod): "cash" | "bank" | "card" {
  if (m === "ქეში (ნაღდი)") return "cash";
  if (m === "ბარათი") return "card";
  return "bank";
}

export default function DistribucionPanel({ transactions, onRefresh }: Props) {
  const [viewMonth, setViewMonth] = useState(currentMonth());
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const distribuciaSales = useMemo(
    () => transactions.filter((t): t is Sale => isDistribuciaSale(t) && t.type === "sale"),
    [transactions]
  );

  const { from, to } = useMemo(() => monthStartEnd(viewMonth), [viewMonth]);

  const orders = useMemo(() => {
    const map = new Map<string, OrderRow>();
    for (const sale of distribuciaSales) {
      const date = sale.date.slice(0, 10);
      if (date < from || date > to) continue;
      const orderId = sale.distribuciaOrderId ?? sale.id;
      const cur = map.get(orderId) ?? {
        orderId,
        date,
        buyerName: sale.buyerName || sale.comment || "—",
        lines: [],
        total: 0,
        paymentMethod: sale.paymentMethod,
      };
      cur.lines.push(sale);
      cur.total += sale.amount;
      if (date < cur.date) cur.date = date;
      map.set(orderId, cur);
    }

    const q = search.trim().toLowerCase();
    return [...map.values()]
      .filter((o) => {
        if (!q) return true;
        const hay = [o.buyerName, o.orderId, ...o.lines.map((l) => l.productName)].join(" ").toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.total - a.total);
  }, [distribuciaSales, from, to, search]);

  const daySummaries = useMemo(() => {
    const byDay = new Map<string, DayPaymentSummary>();
    for (const order of orders) {
      const cur = byDay.get(order.date) ?? {
        date: order.date,
        orders: 0,
        cash: 0,
        bank: 0,
        card: 0,
        total: 0,
      };
      cur.orders += 1;
      cur.total += order.total;
      const bucket = paymentBucket(order.paymentMethod);
      cur[bucket] += order.total;
      byDay.set(order.date, cur);
    }
    return [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [orders]);

  const monthTotals = useMemo(() => {
    let cash = 0;
    let bank = 0;
    let card = 0;
    for (const d of daySummaries) {
      cash += d.cash;
      bank += d.bank;
      card += d.card;
    }
    return { cash, bank, card, total: cash + bank + card, orders: orders.length };
  }, [daySummaries, orders.length]);

  const updateOrderPayment = useCallback(
    async (orderId: string, paymentMethod: PaymentMethod) => {
      setBusyOrderId(orderId);
      setErr("");
      try {
        const res = await fetch("/api/distribucia/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "updatePayment", orderId, paymentMethod }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "შეცდომა");
        await onRefresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "შეცდომა");
      } finally {
        setBusyOrderId(null);
      }
    },
    [onRefresh]
  );

  const ordersByDay = useMemo(() => {
    const map = new Map<string, OrderRow[]>();
    for (const order of orders) {
      const list = map.get(order.date) ?? [];
      list.push(order);
      map.set(order.date, list);
    }
    return map;
  }, [orders]);

  return (
    <section className="space-y-6">
      <DistribuciaSyncPanel onSynced={onRefresh} />

      <div className="rounded-xl border border-violet-900/40 bg-violet-950/20 p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-violet-200">დისტრიბუციის გატარებები</h2>
            <p className="mt-1 text-xs text-zinc-500">
              ნაგულისხმევად ქეში · შუალედში შეიძლება გადმორიცხვაც · გადახდის ტიპის შეცვლა შეკვეთაზე
            </p>
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

        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-xs text-zinc-500">შეკვეთები</p>
            <p className="mt-1 text-lg font-semibold">{monthTotals.orders}</p>
          </div>
          <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3">
            <p className="text-xs text-zinc-500">ქეში</p>
            <p className="mt-1 text-lg font-semibold text-emerald-400">{formatMoney(monthTotals.cash)}</p>
          </div>
          <div className="rounded-lg border border-sky-900/40 bg-sky-950/20 p-3">
            <p className="text-xs text-zinc-500">გადმორიცხვა</p>
            <p className="mt-1 text-lg font-semibold text-sky-400">{formatMoney(monthTotals.bank)}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-xs text-zinc-500">ჯამი</p>
            <p className="mt-1 text-lg font-semibold">{formatMoney(monthTotals.total)}</p>
          </div>
        </div>

        <div className="mb-4">
          <Field label="ძებნა (მომხმარებელი, პროდუქტი)">
            <input
              className={inputCls}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="მაგ. მაღაზია, ტელეფონი..."
            />
          </Field>
        </div>

        {err && <p className="mb-2 text-sm text-red-400">{err}</p>}

        {daySummaries.length === 0 ? (
          <p className="text-sm text-zinc-500">
            ამ თვეში დისტრიბუციის გატარებები არ არის — გაუშვით სინქრონიზაცია ან აირჩიეთ სხვა თვე.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pl-3 pr-3 pt-2">დღე</th>
                  <th className="pb-2 pr-3 text-right">შეკვეთები</th>
                  <th className="pb-2 pr-3 text-right">ქეში</th>
                  <th className="pb-2 pr-3 text-right">გადმორიცხვა</th>
                  <th className="pb-2 pr-3 text-right">ჯამი</th>
                  <th className="pb-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {daySummaries.map((day) => (
                  <Fragment key={day.date}>
                    <tr className="border-b border-zinc-800/50 hover:bg-zinc-900/40">
                      <td className="py-2 pl-3 pr-3 font-medium">{day.date}</td>
                      <td className="py-2 pr-3 text-right">{day.orders}</td>
                      <td className="py-2 pr-3 text-right text-emerald-400">{formatMoney(day.cash)}</td>
                      <td className="py-2 pr-3 text-right text-sky-400">{formatMoney(day.bank)}</td>
                      <td className="py-2 pr-3 text-right font-medium">{formatMoney(day.total)}</td>
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          className="text-xs text-violet-400 hover:text-violet-300"
                          onClick={() => setExpandedDay(expandedDay === day.date ? null : day.date)}
                        >
                          {expandedDay === day.date ? "▲ დამალვა" : "▼ შეკვეთები"}
                        </button>
                      </td>
                    </tr>
                    {expandedDay === day.date && (
                      <tr className="border-b border-zinc-800/50 bg-zinc-900/30">
                        <td colSpan={6} className="px-3 py-3">
                          <div className="space-y-2">
                            {(ordersByDay.get(day.date) ?? []).map((order) => (
                              <div
                                key={order.orderId}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-xs"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-zinc-200">{order.buyerName}</p>
                                  <p className="text-zinc-500">
                                    {order.lines.length} ხაზი · {order.lines.map((l) => l.productName).join(", ")}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-emerald-400">{formatMoney(order.total)}</span>
                                  <select
                                    className={selectCls}
                                    value={order.paymentMethod}
                                    disabled={busyOrderId === order.orderId}
                                    onChange={(e) =>
                                      updateOrderPayment(order.orderId, e.target.value as PaymentMethod)
                                    }
                                  >
                                    {PAYMENT_METHODS.map((m) => (
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
