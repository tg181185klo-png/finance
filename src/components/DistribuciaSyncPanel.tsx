"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { PaymentMethod, Sale, Transaction } from "@/lib/types";
import {
  branchPaymentOptions,
  groupBranchSales,
  isConsignmentOrCreditSale,
  paymentBucket,
  paymentShort,
  type SalePaymentGroup,
} from "@/lib/branch-payments";
import { formatMoney, currentMonth, isCreditOrderActive, monthStartEnd } from "@/lib/utils";
import { groupSettlement, updateGroupPayment } from "@/components/BranchPaymentsPanel";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-emerald-500";
const selectCls = "rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs focus:border-emerald-500";
const labelCls = "mb-1 block text-xs text-zinc-400";
const btnCls = "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-40";

const APP_URL = "https://polimeridistribucia.netlify.app";

type DayCustomer = {
  storeName: string;
  storePhone: string;
  orders: number;
  units: number;
  total: number;
};

type DayRow = {
  date: string;
  orders: number;
  customers: number;
  units: number;
  revenue: number;
  byCustomer: DayCustomer[];
};

type Preview = {
  fromDate: string;
  orders: number;
  lines: number;
  revenue: number;
  days: DayRow[];
};

type Props = {
  transactions?: Transaction[];
  onSynced: () => void | Promise<void>;
};

function isCreditGroup(group: SalePaymentGroup) {
  return (
    paymentBucket(group.paymentMethod) === "credit" ||
    group.lines.some((line) => isConsignmentOrCreditSale(line) && isCreditOrderActive(line))
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

export default function DistribuciaSyncPanel({ transactions = [], onSynced }: Props) {
  const [fromDate, setFromDate] = useState("2026-03-01");
  const [viewMonth, setViewMonth] = useState(currentMonth());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [payBusy, setPayBusy] = useState<string | null>(null);
  const [payErr, setPayErr] = useState("");
  const [split, setSplit] = useState<{ group: SalePaymentGroup; account: string } | null>(null);

  const paymentGroups = useMemo(() => {
    const sales = transactions.filter((t): t is Sale => t.type === "sale" && t.branch === "დისტრიბუცია");
    return groupBranchSales(sales);
  }, [transactions]);

  const groupsByCustomer = useMemo(() => {
    const map = new Map<string, SalePaymentGroup[]>();
    for (const group of paymentGroups) {
      const key = `${group.date}|${group.label}`;
      const list = map.get(key) ?? [];
      list.push(group);
      map.set(key, list);
    }
    return map;
  }, [paymentGroups]);

  const visibleDays = useMemo(() => {
    if (!preview?.days) return [];
    const { from, to } = monthStartEnd(viewMonth);
    return preview.days.filter((d) => d.date >= from && d.date <= to);
  }, [preview, viewMonth]);

  const loadPreview = useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/distribucia/sync?from=${encodeURIComponent(fromDate)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "შეცდომა");
      setPreview(data as Preview);
      setMsg(`ნაპოვნია ${data.orders} შეკვეთა · ${data.lines} ხაზი · ${formatMoney(data.revenue)}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }, [fromDate]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  async function runSync() {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/distribucia/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "შეცდომა");
      await onSynced();
      await loadPreview();
      setMsg(
        `სინქრონიზაცია ✓ ${data.imported} ხაზი · ${formatMoney(data.revenue)} · ${data.days} დღე${data.removed ? ` (ჩანაცვლდა ${data.removed})` : ""}`
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  function dayParts(date: string) {
    return paymentGroups.reduce(
      (sum, group) => {
        if (group.date !== date || isCreditGroup(group)) return sum;
        const parts = groupSettlement(group);
        sum.cash += parts.cash;
        sum.bank += parts.bank + parts.card;
        return sum;
      },
      { cash: 0, bank: 0 }
    );
  }

  function openTransferSplit(group: SalePaymentGroup) {
    const settled = groupSettlement(group);
    const current = settled.bank + settled.card;
    setPayErr("");
    setSplit({
      group,
      account: String(Math.round((current > 0 ? current : group.total) * 100) / 100),
    });
  }

  async function savePayment(group: SalePaymentGroup, paymentMethod: PaymentMethod, accountPaid?: number) {
    setPayBusy(group.groupId);
    setPayErr("");
    try {
      await updateGroupPayment(group, paymentMethod, accountPaid);
      await onSynced();
      setSplit(null);
    } catch (e) {
      setPayErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setPayBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-violet-900/40 bg-violet-950/20 p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-violet-200">დისტრიბუცია — polimeri აპი</h2>
          <p className="mt-1 text-xs text-zinc-500">
            მონაცემები იღება{" "}
            <a href={APP_URL} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">
              polimeridistribucia.netlify.app
            </a>
            -დან · დღიური შეკვეთები და მომხმარებლები
          </p>
        </div>
        <a
          href={APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-violet-800 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-950/50"
        >
          აპის გახსნა ↗
        </a>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="ისტორია დაწყებული (სინქრონიზაცია)">
          <input type="date" className={`${inputCls} w-auto`} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </Field>
        <Field label="ნახვის თვე">
          <input type="month" className={`${inputCls} w-auto`} value={viewMonth} onChange={(e) => setViewMonth(e.target.value)} />
        </Field>
        <button type="button" className={btnCls} disabled={busy} onClick={loadPreview}>
          განახლება
        </button>
        <button
          type="button"
          className={`${btnCls} bg-violet-600 hover:bg-violet-500`}
          disabled={busy}
          onClick={runSync}
        >
          სინქრონიზაცია Dashboard-ში
        </button>
      </div>

      {err && <p className="mb-2 text-sm text-red-400">{err}</p>}
      {msg && <p className="mb-2 text-sm text-emerald-400">{msg}</p>}

      {preview && visibleDays.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/40">
          <p className="border-b border-zinc-800 px-3 py-2 text-xs text-zinc-500">ნაჩვენები: {viewMonth}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                <th className="pb-2 pl-3 pr-3 pt-2">დღე</th>
                <th className="pb-2 pr-3 text-right">შეკვეთები</th>
                <th className="pb-2 pr-3 text-right">მომხმარებლები</th>
                <th className="pb-2 pr-3 text-right">ცალი</th>
                <th className="pb-2 pr-3 text-right">ქეში</th>
                <th className="pb-2 pr-3 text-right">გადმორიცხვა</th>
                <th className="pb-2 pr-3 text-right">ჯამი</th>
                <th className="pb-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {visibleDays.map((day) => {
                const parts = dayParts(day.date);
                return (
                <Fragment key={day.date}>
                  <tr className="border-b border-zinc-800/50 hover:bg-zinc-900/40">
                    <td className="py-2 pl-3 pr-3 font-medium">{day.date}</td>
                    <td className="py-2 pr-3 text-right">{day.orders}</td>
                    <td className="py-2 pr-3 text-right">{day.customers}</td>
                    <td className="py-2 pr-3 text-right text-zinc-400">{day.units}</td>
                    <td className="py-2 pr-3 text-right text-emerald-400">{formatMoney(parts.cash)}</td>
                    <td className="py-2 pr-3 text-right text-sky-400">{formatMoney(parts.bank)}</td>
                    <td className="py-2 pr-3 text-right font-medium text-emerald-400">{formatMoney(day.revenue)}</td>
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        className="text-xs text-violet-400 hover:text-violet-300"
                        onClick={() => setExpandedDay(expandedDay === day.date ? null : day.date)}
                      >
                        {expandedDay === day.date ? "▲ დამალვა" : "▼ მომხმარებლები"}
                      </button>
                    </td>
                  </tr>
                  {expandedDay === day.date && (
                    <tr className="border-b border-zinc-800/50 bg-zinc-900/30">
                      <td colSpan={8} className="px-3 py-3">
                        <div className="space-y-2">
                          {day.byCustomer.map((c) => {
                            const matched = groupsByCustomer.get(`${day.date}|${c.storeName}`) ?? [];
                            return (
                              <div key={c.storeName + c.storePhone} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <span className="min-w-0 flex-1 text-zinc-300">
                                  {c.storeName}
                                  {c.storePhone && <span className="text-zinc-500"> · {c.storePhone}</span>}
                                </span>
                                <span className="text-zinc-400">
                                  {c.orders} შეკვ. · {c.units} ც · <span className="text-emerald-400">{formatMoney(c.total)}</span>
                                </span>
                                <div className="flex flex-wrap items-center gap-2">
                                  {matched.map((group) => {
                                    const credit = isCreditGroup(group);
                                    const settled = groupSettlement(group);
                                    const account = settled.bank + settled.card;
                                    return (
                                      <div key={group.groupId} className="flex flex-wrap items-center gap-2">
                                        {!credit && settled.cash > 0.009 && account > 0.009 && (
                                          <span className="text-[10px] text-zinc-400">
                                            ქეში {formatMoney(settled.cash)} · ანგარიში {formatMoney(account)}
                                          </span>
                                        )}
                                        {credit ? (
                                          <span className="text-teal-400">{paymentShort(group.paymentMethod)}</span>
                                        ) : (
                                          <select
                                            className={selectCls}
                                            value={group.paymentMethod}
                                            disabled={payBusy === group.groupId}
                                            onChange={(e) => {
                                              const next = e.target.value as PaymentMethod;
                                              if (next === "ანგარიშზე ჩარიცხვა") {
                                                openTransferSplit(group);
                                                return;
                                              }
                                              void savePayment(group, next);
                                            }}
                                          >
                                            {branchPaymentOptions("დისტრიბუცია").map((method) => (
                                              <option key={method} value={method}>
                                                {paymentShort(method)}
                                              </option>
                                            ))}
                                          </select>
                                        )}
                                        {!credit && group.paymentMethod === "ანგარიშზე ჩარიცხვა" && (
                                          <button
                                            type="button"
                                            className="text-[10px] text-sky-300 hover:text-sky-200"
                                            onClick={() => openTransferSplit(group)}
                                          >
                                            თანხა
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
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

      {preview && visibleDays.length === 0 && (
        <p className="text-sm text-zinc-500">ამ თვეში შეკვეთები არ მოიძებნა — აირჩიეთ სხვა თვე ან განაახლეთ.</p>
      )}
      {split && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
            onSubmit={(e) => {
              e.preventDefault();
              const total = split.group.total;
              const account = Math.round((parseFloat(split.account.replace(",", ".")) || 0) * 100) / 100;
              if (!Number.isFinite(account) || account < 0) {
                setPayErr("თანხა არასწორია");
                return;
              }
              if (account > total + 0.02) {
                setPayErr("ანგარიშზე გადმორიცხული შეკვეთის ჯამზე მეტია");
                return;
              }
              if (account <= 0.009) void savePayment(split.group, "ქეში (ნაღდი)");
              else void savePayment(split.group, "ანგარიშზე ჩარიცხვა", account);
            }}
          >
            <h3 className="font-semibold text-zinc-100">გადმორიცხვა — {split.group.label}</h3>
            <p className="mt-1 text-xs text-zinc-500">
              შეკვეთის ჯამი {formatMoney(split.group.total)}. ნაწილი შეიძლება ანგარიშზე ჩაირიცხოს და ნაწილი ქეშად დარჩეს.
            </p>
            <label className="mt-4 block text-xs text-zinc-400">
              ანგარიშზე გადმორიცხული
              <input
                autoFocus
                className={`${inputCls} mt-1`}
                inputMode="decimal"
                value={split.account}
                onChange={(e) => setSplit({ ...split, account: e.target.value })}
              />
            </label>
            <p className="mt-2 text-sm text-emerald-300">
              ქეში: {formatMoney(Math.max(0, split.group.total - (parseFloat(split.account.replace(",", ".")) || 0)))}
            </p>
            {payErr && <p className="mt-2 text-sm text-red-400">{payErr}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300"
                onClick={() => {
                  setSplit(null);
                  setPayErr("");
                }}
              >
                გაუქმება
              </button>
              <button
                type="submit"
                disabled={payBusy === split.group.groupId}
                className="rounded-lg bg-sky-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                შენახვა
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
