"use client";

import { useMemo, useState } from "react";
import type { Branch, CreditPayment, Sale, SettlementPaymentMethod, Store } from "@/lib/types";
import { BRANCHES, SETTLEMENT_PAYMENT_METHODS } from "@/lib/dashboard-data";
import {
  formatMoney,
  isCreditOrderActive,
  paymentMethodLabel,
  paymentsForSale,
  saleCreditPaid,
  saleCreditRemaining,
} from "@/lib/utils";

const inputCls =
  "w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs focus:border-teal-500";
const btnCls =
  "rounded bg-teal-700 px-2.5 py-1.5 text-xs font-medium hover:bg-teal-600 disabled:opacity-40";

type ReceivableGroup = {
  key: string;
  category: string;
  buyerName: string;
  branch: Branch;
  issuer: string | null;
  sales: Sale[];
  total: number;
  paid: number;
  remaining: number;
  qty: number;
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

function groupKey(sale: Sale) {
  if (sale.clientSaleId) return `client:${sale.clientSaleId}`;
  if (sale.distribuciaOrderId) return `dist:${sale.distribuciaOrderId}`;
  if (sale.buyerName?.trim()) {
    return `buyer:${sale.branch}|${sale.buyerName.trim().toLowerCase()}`;
  }
  return `sale:${sale.id}`;
}

function categoryOf(sales: Sale[]): string {
  if (sales.some((s) => s.paymentMethod === "კონსიგნაცია")) return "კონსიგნაცია";
  return "ბე / კრედიტი";
}

function addDaysIso(isoDate: string, days: number) {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const CATEGORY_ORDER = ["კონსიგნაცია", "ბე / კრედიტი"];

export default function ReceivablesPanel({ sales, store, onPay, onSetDueDate }: Props) {
  const [payInputs, setPayInputs] = useState<Record<string, string>>({});
  const [payMethods, setPayMethods] = useState<Record<string, SettlementPaymentMethod>>({});
  const [payBranches, setPayBranches] = useState<Record<string, Branch>>({});
  const [dueEdits, setDueEdits] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [collapsedCat, setCollapsedCat] = useState<Record<string, boolean>>({});
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
        category: "",
        buyerName: sale.buyerName?.trim() || sale.comment || "უცნობი კლიენტი",
        branch: sale.branch,
        issuer: sale.employeeName?.trim() || null,
        sales: [] as Sale[],
        total: 0,
        paid: 0,
        remaining: 0,
        qty: 0,
        dueDate: null as string | null,
        saleDate: sale.date.slice(0, 10),
      };
      cur.sales.push(sale);
      cur.total += sale.amount;
      cur.paid += saleCreditPaid(sale);
      cur.remaining += saleCreditRemaining(sale);
      cur.qty += sale.quantity;
      if (!cur.issuer && sale.employeeName?.trim()) cur.issuer = sale.employeeName.trim();
      const due = sale.creditDueDate || addDaysIso(sale.date, 30);
      if (!cur.dueDate || due < cur.dueDate) cur.dueDate = due;
      if (sale.date.slice(0, 10) < cur.saleDate) cur.saleDate = sale.date.slice(0, 10);
      map.set(key, cur);
    }
    for (const g of map.values()) {
      g.category = categoryOf(g.sales);
      g.sales.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    }
    return [...map.values()].sort((a, b) => {
      if (a.remaining !== b.remaining) return b.remaining - a.remaining;
      return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
    });
  }, [sales, filter]);

  const byCategory = useMemo(() => {
    const map = new Map<string, { items: ReceivableGroup[]; remaining: number; paid: number; total: number }>();
    for (const g of groups) {
      const cur = map.get(g.category) ?? { items: [], remaining: 0, paid: 0, total: 0 };
      cur.items.push(g);
      cur.remaining += g.remaining;
      cur.paid += g.paid;
      cur.total += g.total;
      map.set(g.category, cur);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c))
      .concat([...map.keys()].filter((c) => !CATEGORY_ORDER.includes(c)))
      .map((name) => ({ name, ...map.get(name)! }));
  }, [groups]);

  const totals = useMemo(() => {
    let remaining = 0;
    let paid = 0;
    for (const g of groups) {
      remaining += g.remaining;
      paid += g.paid;
    }
    return { remaining, paid, count: groups.length };
  }, [groups]);

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
    for (const sale of g.sales) list.push(...paymentsForSale(store, sale.id));
    return list.sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="rounded-xl border border-teal-900/40 bg-teal-950/10 p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-teal-200">მისაღები</h2>
          <p className="text-[11px] text-zinc-500">
            {totals.count} · მისაღები{" "}
            <span className="font-medium text-amber-300">{formatMoney(totals.remaining)}</span>
            {" · "}მიღებული{" "}
            <span className="font-medium text-emerald-400">{formatMoney(totals.paid)}</span>
          </p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            className={`rounded px-2 py-1 text-[11px] ${filter === "open" ? "bg-teal-800 text-white" : "text-zinc-500"}`}
            onClick={() => setFilter("open")}
          >
            აქტიური
          </button>
          <button
            type="button"
            className={`rounded px-2 py-1 text-[11px] ${filter === "all" ? "bg-teal-800 text-white" : "text-zinc-500"}`}
            onClick={() => setFilter("all")}
          >
            ყველა
          </button>
        </div>
      </div>

      {err && <p className="mb-2 text-xs text-red-400">{err}</p>}

      {groups.length === 0 ? (
        <p className="py-2 text-xs text-zinc-500">მისაღები ვალდებულება არ არის</p>
      ) : (
        <div className="space-y-2">
          {byCategory.map((cat) => {
            const closed = collapsedCat[cat.name];
            return (
              <div key={cat.name} className="overflow-hidden rounded-lg border border-zinc-800/80">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 bg-zinc-900/60 px-2.5 py-1.5 text-left"
                  onClick={() => setCollapsedCat((m) => ({ ...m, [cat.name]: !m[cat.name] }))}
                >
                  <span className="text-xs font-semibold text-teal-200">
                    {closed ? "▶" : "▼"} {cat.name}
                    <span className="ml-1.5 font-normal text-zinc-500">({cat.items.length})</span>
                  </span>
                  <span className="text-xs tabular-nums text-amber-300">{formatMoney(cat.remaining)}</span>
                </button>
                {!closed && (
                  <div className="divide-y divide-zinc-800/60">
                    {cat.items.map((g) => {
                      const overdue = Boolean(g.dueDate && g.remaining > 0 && g.dueDate < today);
                      const open = expanded === g.key;
                      const method = payMethods[g.key] ?? "ქეში (ნაღდი)";
                      const payments = open ? groupPayments(g) : [];
                      return (
                        <div
                          key={g.key}
                          className={
                            overdue
                              ? "bg-red-950/10"
                              : g.remaining <= 0
                                ? "bg-emerald-950/10"
                                : "bg-zinc-950/30"
                          }
                        >
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-zinc-900/40"
                            onClick={() => setExpanded(open ? null : g.key)}
                          >
                            <span
                              className={`w-16 shrink-0 text-xs font-semibold tabular-nums sm:w-20 ${
                                g.remaining > 0 ? "text-amber-300" : "text-emerald-400"
                              }`}
                            >
                              {formatMoney(g.remaining)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">
                              {g.buyerName}
                              <span className="text-zinc-500">
                                {" · "}
                                {g.branch}
                                {g.issuer ? ` · ${g.issuer}` : ""}
                              </span>
                            </span>
                            <span
                              className={`hidden shrink-0 text-[10px] sm:inline ${
                                overdue ? "text-red-400" : "text-zinc-500"
                              }`}
                            >
                              {g.dueDate ?? "—"}
                              {overdue ? "!" : ""}
                            </span>
                            <span className="shrink-0 text-[10px] text-zinc-600">{open ? "▲" : "▼"}</span>
                          </button>
                          {open && (
                            <div className="space-y-2 border-t border-zinc-800/50 px-2.5 py-2">
                              <p className="text-[10px] text-zinc-500">
                                {formatMoney(g.paid)} / {formatMoney(g.total)} · {g.qty} ც · {g.saleDate}
                                {" · "}
                                {g.sales.map((s) => s.productName).join(", ")}
                              </p>
                              {g.remaining > 0 && (
                                <div className="flex flex-wrap items-end gap-1.5">
                                  <div className="w-[88px]">
                                    <label className="mb-0.5 block text-[10px] text-zinc-500">თანხა</label>
                                    <input
                                      className={inputCls}
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      max={g.remaining}
                                      value={payInputs[g.key] ?? ""}
                                      onChange={(e) =>
                                        setPayInputs((m) => ({ ...m, [g.key]: e.target.value }))
                                      }
                                      placeholder={String(Math.round(g.remaining))}
                                    />
                                  </div>
                                  <div className="min-w-[100px] flex-1">
                                    <label className="mb-0.5 block text-[10px] text-zinc-500">საშუალება</label>
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
                                  </div>
                                  <div className="min-w-[90px] flex-1">
                                    <label className="mb-0.5 block text-[10px] text-zinc-500">ფილიალი</label>
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
                                  </div>
                                  <button
                                    type="button"
                                    className={btnCls}
                                    disabled={busy === g.key}
                                    onClick={() => void handleGroupPay(g)}
                                  >
                                    დაფარვა
                                  </button>
                                  {onSetDueDate && (
                                    <>
                                      <input
                                        type="date"
                                        className={`${inputCls} w-auto`}
                                        value={dueEdits[g.key] ?? g.dueDate ?? addDaysIso(g.saleDate, 30)}
                                        onChange={(e) =>
                                          setDueEdits((m) => ({ ...m, [g.key]: e.target.value }))
                                        }
                                      />
                                      <button
                                        type="button"
                                        className="rounded border border-zinc-700 px-2 py-1.5 text-[10px] text-zinc-400"
                                        disabled={busy === `due:${g.key}`}
                                        onClick={() => void handleGroupDue(g)}
                                      >
                                        ვადა
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                              {payments.length > 0 && (
                                <div className="space-y-0.5">
                                  {payments.slice(0, 5).map((p) => (
                                    <p key={p.id} className="text-[10px] text-zinc-500">
                                      {p.paidAt.slice(0, 10)} · {formatMoney(p.amount)} ·{" "}
                                      {paymentMethodLabel(p.paymentMethod ?? "ქეში (ნაღდი)")}
                                      {p.branch ? ` · ${p.branch}` : ""}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
