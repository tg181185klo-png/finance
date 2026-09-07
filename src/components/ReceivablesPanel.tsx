"use client";

import { useMemo, useState } from "react";
import type { CreditPayment, PaymentMethod, Sale, Store } from "@/lib/types";
import { PAYMENT_METHODS } from "@/lib/dashboard-data";
import {
  formatMoney,
  isCreditOrderActive,
  isCreditOrderFullyComplete,
  paymentMethodLabel,
  paymentsForSale,
  saleCreditPaid,
  saleCreditRemaining,
  saleQuantityDelivered,
  saleQuantityRemaining,
} from "@/lib/utils";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-teal-500";
const labelCls = "mb-1 block text-xs text-zinc-400";
const btnCls =
  "rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium hover:bg-teal-600 disabled:opacity-40";

type ReceivableGroup = {
  key: string;
  buyerName: string;
  branch: string;
  sales: Sale[];
  total: number;
  paid: number;
  remaining: number;
  qty: number;
  qtyDelivered: number;
  dueDate: string | null;
  saleDate: string;
};

type Props = {
  sales: Sale[];
  store: Store;
  onPay: (saleId: string, amount: number, paymentMethod: PaymentMethod) => Promise<boolean>;
  onSetDueDate?: (saleId: string, creditDueDate: string) => Promise<boolean>;
  onRefresh?: () => void | Promise<unknown>;
};

function groupKey(sale: Sale) {
  if (sale.clientSaleId) return `client:${sale.clientSaleId}`;
  if (sale.distribuciaOrderId) return `dist:${sale.distribuciaOrderId}`;
  if (sale.buyerName?.trim()) return `buyer:${sale.branch}|${sale.buyerName.trim()}`;
  return `sale:${sale.id}`;
}

function addDaysIso(isoDate: string, days: number) {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

export default function ReceivablesPanel({ sales, store, onPay, onSetDueDate }: Props) {
  const [payInputs, setPayInputs] = useState<Record<string, string>>({});
  const [payMethods, setPayMethods] = useState<Record<string, PaymentMethod>>({});
  const [dueEdits, setDueEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<"open" | "all">("open");

  const groups = useMemo(() => {
    const map = new Map<string, ReceivableGroup>();
    for (const sale of sales) {
      if (filter === "open" && !isCreditOrderActive(sale)) continue;
      if (filter === "all" && !sale.paymentStatus?.includes("ბე") && !isCreditOrderActive(sale) && !sale.orderCompletedAt) {
        if ((sale.creditPaid ?? 0) <= 0 && (sale.quantityDelivered ?? 0) <= 0) continue;
      }
      const key = groupKey(sale);
      const cur = map.get(key) ?? {
        key,
        buyerName: sale.buyerName?.trim() || sale.comment || "უცნობი კლიენტი",
        branch: sale.branch,
        sales: [],
        total: 0,
        paid: 0,
        remaining: 0,
        qty: 0,
        qtyDelivered: 0,
        dueDate: null as string | null,
        saleDate: sale.date.slice(0, 10),
      };
      cur.sales.push(sale);
      cur.total += sale.amount;
      cur.paid += saleCreditPaid(sale);
      cur.remaining += saleCreditRemaining(sale);
      cur.qty += sale.quantity;
      cur.qtyDelivered += saleQuantityDelivered(sale);
      const due = sale.creditDueDate || addDaysIso(sale.date, 30);
      if (!cur.dueDate || due < cur.dueDate) cur.dueDate = due;
      if (sale.date.slice(0, 10) < cur.saleDate) cur.saleDate = sale.date.slice(0, 10);
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => {
      if (a.remaining !== b.remaining) return b.remaining - a.remaining;
      return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
    });
  }, [sales, filter]);

  const totals = useMemo(() => {
    let remaining = 0;
    let paid = 0;
    let total = 0;
    const byMethod: Record<string, number> = { ქეში: 0, ბარათი: 0, გადმორიცხვა: 0 };
    for (const g of groups) {
      remaining += g.remaining;
      paid += g.paid;
      total += g.total;
      for (const sale of g.sales) {
        for (const p of paymentsForSale(store, sale.id)) {
          const m = p.paymentMethod ?? "ქეში (ნაღდი)";
          const label = paymentMethodLabel(m);
          byMethod[label] = (byMethod[label] ?? 0) + p.amount;
        }
      }
    }
    return { remaining, paid, total, count: groups.length, byMethod };
  }, [groups, store]);

  async function handlePay(sale: Sale) {
    const amount = parseFloat(payInputs[sale.id] ?? "");
    if (!amount || amount <= 0) return;
    setBusy(sale.id);
    setErr("");
    try {
      const ok = await onPay(sale.id, amount, payMethods[sale.id] ?? "ქეში (ნაღდი)");
      if (ok) setPayInputs((m) => ({ ...m, [sale.id]: "" }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(null);
    }
  }

  async function handleDue(sale: Sale) {
    if (!onSetDueDate) return;
    const date = dueEdits[sale.id] || sale.creditDueDate || addDaysIso(sale.date, 30);
    setBusy(`due:${sale.id}`);
    setErr("");
    try {
      await onSetDueDate(sale.id, date);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-teal-900/40 bg-teal-950/15 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-teal-200">მისაღები ვალდებულებები</h2>
          <p className="mt-1 text-xs text-zinc-500">
            კონსიგნაცია / ბე — პროდუქცია გატანილია, ფული მოგვიანებით. ჩარიცხვა ქეშით, ბარათით ან
            გადმორიცხვით.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-xs ${filter === "open" ? "bg-teal-800 text-white" : "text-zinc-500"}`}
            onClick={() => setFilter("open")}
          >
            აქტიური
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-xs ${filter === "all" ? "bg-teal-800 text-white" : "text-zinc-500"}`}
            onClick={() => setFilter("all")}
          >
            ყველა
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <p className="text-xs text-zinc-500">შეკვეთები</p>
          <p className="mt-1 text-lg font-semibold">{totals.count}</p>
        </div>
        <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3">
          <p className="text-xs text-zinc-500">მისაღები</p>
          <p className="mt-1 text-lg font-semibold text-amber-300">{formatMoney(totals.remaining)}</p>
        </div>
        <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3">
          <p className="text-xs text-zinc-500">მიღებული</p>
          <p className="mt-1 text-lg font-semibold text-emerald-400">{formatMoney(totals.paid)}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <p className="text-xs text-zinc-500">მიღებული ქეში / ბარათი</p>
          <p className="mt-1 text-sm text-emerald-300">
            {formatMoney(totals.byMethod["ქეში"] ?? 0)} / {formatMoney(totals.byMethod["ბარათი"] ?? 0)}
          </p>
        </div>
        <div className="rounded-lg border border-sky-900/40 bg-sky-950/20 p-3">
          <p className="text-xs text-zinc-500">მიღებული გადმორიცხვა</p>
          <p className="mt-1 text-lg font-semibold text-sky-300">
            {formatMoney(totals.byMethod["გადმორიცხვა"] ?? 0)}
          </p>
        </div>
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}

      {groups.length === 0 ? (
        <p className="text-sm text-zinc-500">მისაღები ვალდებულება არ არის</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const overdue = g.dueDate && g.remaining > 0 && g.dueDate < new Date().toISOString().slice(0, 10);
            return (
              <div
                key={g.key}
                className={`rounded-xl border p-4 ${
                  g.remaining <= 0
                    ? "border-emerald-800/50 bg-emerald-950/20"
                    : overdue
                      ? "border-red-900/50 bg-red-950/15"
                      : "border-teal-900/40 bg-zinc-950/40"
                }`}
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-teal-100">{g.buyerName}</p>
                    <p className="text-xs text-zinc-500">
                      {g.branch} · {g.sales.length} შეკვ. · {g.qty} ც · შეკვეთა {g.saleDate}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">
                      ვადა:{" "}
                      <span className={overdue ? "text-red-300" : "text-teal-300"}>
                        {g.dueDate ?? "—"}
                      </span>
                      {overdue && <span className="ml-2 text-red-400">ვადაგადაცილებული</span>}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-zinc-400">
                      {formatMoney(g.paid)} / {formatMoney(g.total)}
                    </p>
                    <p className={`font-semibold ${g.remaining > 0 ? "text-amber-300" : "text-emerald-400"}`}>
                      {g.remaining > 0 ? `მისაღები ${formatMoney(g.remaining)}` : "სრულად მიღებული ✓"}
                    </p>
                  </div>
                </div>

                <div className="mb-3 space-y-2">
                  {g.sales.map((sale) => {
                    const moneyLeft = saleCreditRemaining(sale);
                    const payments = paymentsForSale(store, sale.id);
                    const done = isCreditOrderFullyComplete(sale);
                    return (
                      <div
                        key={sale.id}
                        className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3 text-xs"
                      >
                        <div className="mb-2 flex flex-wrap justify-between gap-2">
                          <p className="text-zinc-200">
                            {sale.productName} × {sale.quantity} · {formatMoney(sale.amount)}
                            {done && <span className="ml-2 text-emerald-400">✓</span>}
                          </p>
                          <p className="text-zinc-500">
                            მიწოდება {saleQuantityDelivered(sale)}/{sale.quantity} ც
                            {saleQuantityRemaining(sale) > 0
                              ? ` · დარჩა ${saleQuantityRemaining(sale)}`
                              : " · სრულად"}
                          </p>
                        </div>
                        <p className="mb-2 text-zinc-400">
                          ფული: {formatMoney(saleCreditPaid(sale))} / {formatMoney(sale.amount)}
                          {moneyLeft > 0 && (
                            <span className="text-amber-300"> · დარჩა {formatMoney(moneyLeft)}</span>
                          )}
                        </p>

                        {onSetDueDate && moneyLeft > 0 && (
                          <div className="mb-2 flex flex-wrap items-end gap-2">
                            <Field label="გადახდის ვადა">
                              <input
                                type="date"
                                className={`${inputCls} w-auto`}
                                value={
                                  dueEdits[sale.id] ??
                                  sale.creditDueDate ??
                                  addDaysIso(sale.date, 30)
                                }
                                onChange={(e) =>
                                  setDueEdits((m) => ({ ...m, [sale.id]: e.target.value }))
                                }
                              />
                            </Field>
                            <button
                              type="button"
                              className={btnCls}
                              disabled={busy === `due:${sale.id}`}
                              onClick={() => void handleDue(sale)}
                            >
                              ვადის შენახვა
                            </button>
                          </div>
                        )}

                        {moneyLeft > 0 && (
                          <div className="flex flex-wrap items-end gap-2">
                            <div className="min-w-[100px] flex-1">
                              <Field label="მიღებული თანხა">
                                <input
                                  className={inputCls}
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  max={moneyLeft}
                                  value={payInputs[sale.id] ?? ""}
                                  onChange={(e) =>
                                    setPayInputs((m) => ({ ...m, [sale.id]: e.target.value }))
                                  }
                                  placeholder={`მაქს ${moneyLeft.toFixed(0)}`}
                                />
                              </Field>
                            </div>
                            <div className="min-w-[120px] flex-1">
                              <Field label="საშუალება">
                                <select
                                  className={inputCls}
                                  value={payMethods[sale.id] ?? "ქეში (ნაღდი)"}
                                  onChange={(e) =>
                                    setPayMethods((m) => ({
                                      ...m,
                                      [sale.id]: e.target.value as PaymentMethod,
                                    }))
                                  }
                                >
                                  {PAYMENT_METHODS.map((m) => (
                                    <option key={m} value={m}>
                                      {paymentMethodLabel(m)}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                            </div>
                            <button
                              type="button"
                              className={btnCls}
                              disabled={busy === sale.id}
                              onClick={() => void handlePay(sale)}
                            >
                              ჩარიცხვის აღრიცხვა
                            </button>
                          </div>
                        )}

                        {payments.length > 0 && (
                          <div className="mt-2 border-t border-zinc-800 pt-2">
                            <p className="mb-1 text-[10px] uppercase text-zinc-500">მიღებების ისტორია</p>
                            {payments.map((p: CreditPayment) => (
                              <p key={p.id} className="text-zinc-400">
                                {p.paidAt.slice(0, 10)} · {formatMoney(p.amount)} ·{" "}
                                {paymentMethodLabel(p.paymentMethod ?? "ქეში (ნაღდი)")}
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
          })}
        </div>
      )}
    </section>
  );
}
