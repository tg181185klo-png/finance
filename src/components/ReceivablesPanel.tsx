"use client";

import { useMemo, useState } from "react";
import type { Branch, CreditPayment, Sale, SettlementPaymentMethod, Store } from "@/lib/types";
import { BRANCHES, SETTLEMENT_PAYMENT_METHODS } from "@/lib/dashboard-data";
import {
  formatMoney,
  isCreditOrderActive,
  isCreditOrderFullyComplete,
  paymentMethodLabel,
  paymentsForSale,
  saleCreditPaid,
  saleCreditRemaining,
  saleQuantityDelivered,
} from "@/lib/utils";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-teal-500";
const labelCls = "mb-1 block text-xs text-zinc-400";
const btnCls =
  "rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium hover:bg-teal-600 disabled:opacity-40";

type ReceivableGroup = {
  key: string;
  buyerName: string;
  branch: Branch;
  issuer: string | null;
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
  onPay: (
    saleId: string,
    amount: number,
    paymentMethod: SettlementPaymentMethod,
    branch: Branch
  ) => Promise<boolean>;
  onSetDueDate?: (saleId: string, creditDueDate: string) => Promise<boolean>;
  onRefresh?: () => void | Promise<unknown>;
};

/** ერთი კლიენტი / შეკვეთა = ერთი მისაღები ჩანაწერი */
function groupKey(sale: Sale) {
  if (sale.clientSaleId) return `client:${sale.clientSaleId}`;
  if (sale.distribuciaOrderId) return `dist:${sale.distribuciaOrderId}`;
  if (sale.buyerName?.trim()) {
    return `buyer:${sale.branch}|${sale.buyerName.trim().toLowerCase()}`;
  }
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
  const [payMethods, setPayMethods] = useState<Record<string, SettlementPaymentMethod>>({});
  const [payBranches, setPayBranches] = useState<Record<string, Branch>>({});
  const [dueEdits, setDueEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<"open" | "all">("open");

  const groups = useMemo(() => {
    const map = new Map<string, ReceivableGroup>();
    for (const sale of sales) {
      if (filter === "open" && !isCreditOrderActive(sale)) continue;
      if (
        filter === "all" &&
        !sale.paymentStatus?.includes("ბე") &&
        sale.paymentMethod !== "კონსიგნაცია" &&
        !isCreditOrderActive(sale) &&
        !sale.orderCompletedAt
      ) {
        if ((sale.creditPaid ?? 0) <= 0 && (sale.quantityDelivered ?? 0) <= 0) continue;
      }
      const key = groupKey(sale);
      const cur = map.get(key) ?? {
        key,
        buyerName: sale.buyerName?.trim() || sale.comment || "უცნობი კლიენტი",
        branch: sale.branch,
        issuer: sale.employeeName?.trim() || null,
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
      if (!cur.issuer && sale.employeeName?.trim()) cur.issuer = sale.employeeName.trim();
      const due = sale.creditDueDate || addDaysIso(sale.date, 30);
      if (!cur.dueDate || due < cur.dueDate) cur.dueDate = due;
      if (sale.date.slice(0, 10) < cur.saleDate) cur.saleDate = sale.date.slice(0, 10);
      map.set(key, cur);
    }
    for (const g of map.values()) {
      g.sales.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
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

  async function handleGroupPay(g: ReceivableGroup) {
    let left = parseFloat(payInputs[g.key] ?? "");
    if (!left || left <= 0) return;
    const method = payMethods[g.key] ?? "ქეში (ნაღდი)";
    const branch = payBranches[g.key] ?? g.branch;
    setBusy(g.key);
    setErr("");
    try {
      for (const sale of g.sales) {
        if (left <= 0) break;
        const due = saleCreditRemaining(sale);
        if (due <= 0) continue;
        const pay = Math.min(left, due);
        const ok = await onPay(sale.id, pay, method, branch);
        if (!ok) {
          setErr("დაფარვა ვერ მოხერხდა");
          return;
        }
        left -= pay;
      }
      setPayInputs((m) => ({ ...m, [g.key]: "" }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(null);
    }
  }

  async function handleGroupDue(g: ReceivableGroup) {
    if (!onSetDueDate) return;
    const date = dueEdits[g.key] || g.dueDate || addDaysIso(g.saleDate, 30);
    setBusy(`due:${g.key}`);
    setErr("");
    try {
      for (const sale of g.sales) {
        if (saleCreditRemaining(sale) <= 0) continue;
        await onSetDueDate(sale.id, date);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(null);
    }
  }

  function groupPayments(g: ReceivableGroup): CreditPayment[] {
    const list: CreditPayment[] = [];
    for (const sale of g.sales) {
      list.push(...paymentsForSale(store, sale.id));
    }
    return list.sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  }

  return (
    <section className="space-y-4 rounded-xl border border-teal-900/40 bg-teal-950/15 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-teal-200">მისაღები ვალდებულებები</h2>
          <p className="mt-1 text-xs text-zinc-500">
            კონსიგნაცია ერთიანად კლიენტის მიხედვით. ნავაჭრში არ ემატება — დაფარვა ქეში / ბარათი /
            გადმორიცხვა.
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
          <p className="text-xs text-zinc-500">კლიენტები</p>
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
        <div className="space-y-3">
          {groups.map((g) => {
            const overdue =
              g.dueDate && g.remaining > 0 && g.dueDate < new Date().toISOString().slice(0, 10);
            const done = g.sales.every((s) => isCreditOrderFullyComplete(s));
            const method = payMethods[g.key] ?? "ქეში (ნაღდი)";
            const payments = groupPayments(g);
            const products = g.sales
              .map((s) => `${s.productName} × ${s.quantity}`)
              .join(", ");

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
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-[7rem] shrink-0">
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">მისაღები</p>
                    <p
                      className={`text-xl font-semibold tabular-nums ${
                        g.remaining > 0 ? "text-amber-300" : "text-emerald-400"
                      }`}
                    >
                      {formatMoney(g.remaining)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-zinc-500">
                      {formatMoney(g.paid)} / {formatMoney(g.total)}
                    </p>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-teal-100">
                      {g.buyerName}
                      {done && <span className="ml-2 text-xs text-emerald-400">✓</span>}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {g.branch} · {g.sales.length} ხაზი · {g.qty} ც · {g.saleDate}
                      {g.issuer ? ` · გასცა: ${g.issuer}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">{products}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      ვადა:{" "}
                      <span className={overdue ? "text-red-300" : "text-teal-300"}>
                        {g.dueDate ?? "—"}
                      </span>
                      {overdue && <span className="ml-2 text-red-400">ვადაგადაცილებული</span>}
                    </p>
                  </div>
                </div>

                {onSetDueDate && g.remaining > 0 && (
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <Field label="გადახდის ვადა">
                      <input
                        type="date"
                        className={`${inputCls} w-auto`}
                        value={dueEdits[g.key] ?? g.dueDate ?? addDaysIso(g.saleDate, 30)}
                        onChange={(e) => setDueEdits((m) => ({ ...m, [g.key]: e.target.value }))}
                      />
                    </Field>
                    <button
                      type="button"
                      className={btnCls}
                      disabled={busy === `due:${g.key}`}
                      onClick={() => void handleGroupDue(g)}
                    >
                      ვადის შენახვა
                    </button>
                  </div>
                )}

                {g.remaining > 0 && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-zinc-800/80 pt-3">
                    <div className="min-w-[100px] flex-1">
                      <Field label="მიღებული თანხა (ერთიანი)">
                        <input
                          className={inputCls}
                          type="number"
                          min={0}
                          step={0.01}
                          max={g.remaining}
                          value={payInputs[g.key] ?? ""}
                          onChange={(e) => setPayInputs((m) => ({ ...m, [g.key]: e.target.value }))}
                          placeholder={`მაქს ${g.remaining.toFixed(0)}`}
                        />
                      </Field>
                    </div>
                    <div className="min-w-[120px] flex-1">
                      <Field label="დაფარვის საშუალება">
                        <select
                          className={inputCls}
                          value={method}
                          onChange={(e) =>
                            setPayMethods((m) => ({
                              ...m,
                              [g.key]: e.target.value as SettlementPaymentMethod,
                            }))
                          }
                        >
                          {SETTLEMENT_PAYMENT_METHODS.map((m) => (
                            <option key={m} value={m}>
                              {paymentMethodLabel(m)}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <div className="min-w-[120px] flex-1">
                      <Field
                        label={
                          method === "ქეში (ნაღდი)" ? "ფილიალი (ქეშის მიღება)" : "ფილიალი (აღრიცხვა)"
                        }
                      >
                        <select
                          className={inputCls}
                          value={payBranches[g.key] ?? g.branch}
                          onChange={(e) =>
                            setPayBranches((m) => ({
                              ...m,
                              [g.key]: e.target.value as Branch,
                            }))
                          }
                        >
                          {BRANCHES.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <button
                      type="button"
                      className={btnCls}
                      disabled={busy === g.key}
                      onClick={() => void handleGroupPay(g)}
                    >
                      დაფარვის აღრიცხვა
                    </button>
                  </div>
                )}

                {payments.length > 0 && (
                  <div className="mt-3 border-t border-zinc-800 pt-2">
                    <p className="mb-1 text-[10px] uppercase text-zinc-500">მიღებების ისტორია</p>
                    {payments.map((p) => (
                      <p key={p.id} className="text-xs text-zinc-400">
                        {p.paidAt.slice(0, 10)} · {formatMoney(p.amount)} ·{" "}
                        {paymentMethodLabel(p.paymentMethod ?? "ქეში (ნაღდი)")}
                        {p.branch ? ` · ${p.branch}` : ""}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
