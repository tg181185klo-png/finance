"use client";

import { Fragment, useMemo, useState } from "react";
import type { Branch, Customer, Transaction } from "@/lib/types";
import {
  buildClientPurchaseOrderRows,
  type ClientPersonKind,
} from "@/lib/client-purchase-report";
import type { ResolvedPeriod } from "@/lib/period-filter";
import { BRANCHES } from "@/lib/dashboard-data";
import { OPERATIONAL_DATA_FROM } from "@/lib/report-config";
import { formatDate, formatMoney } from "@/lib/utils";

const inputCls = "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm focus:border-emerald-500";
const filterBtn = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm ${on ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`;

type Props = {
  transactions: Transaction[];
  customers: Customer[];
  period: ResolvedPeriod;
};

type RangeMode = "period" | "day";

function paymentAccent(label: string) {
  if (label === "ქეში") return "text-emerald-400";
  if (label === "ბარათი") return "text-sky-400";
  return "text-violet-400";
}

export default function ClientPurchasesReportPanel({ transactions, customers, period }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [branch, setBranch] = useState<Branch | "ყველა">("ყველა");
  const [personType, setPersonType] = useState<ClientPersonKind | "all">("all");
  const [search, setSearch] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [rangeMode, setRangeMode] = useState<RangeMode>("period");
  const [selectedDay, setSelectedDay] = useState(() =>
    period.from === period.to ? period.from : today < OPERATIONAL_DATA_FROM ? OPERATIONAL_DATA_FROM : today
  );

  const from = rangeMode === "day" ? selectedDay : period.from;
  const to = rangeMode === "day" ? selectedDay : period.to;
  const rangeLabel = rangeMode === "day" ? formatDate(selectedDay) : period.label;

  const rows = useMemo(
    () =>
      buildClientPurchaseOrderRows(transactions, customers, from, to, {
        branch,
        personType,
        search,
      }),
    [transactions, customers, from, to, branch, personType, search]
  );

  const totals = useMemo(() => {
    let paid = 0;
    let cash = 0;
    let card = 0;
    let bank = 0;
    for (const r of rows) {
      paid += r.paid;
      if (r.paymentMethod === "ქეში (ნაღდი)") cash += r.paid;
      else if (r.paymentMethod === "ბარათი") card += r.paid;
      else bank += r.paid;
    }
    return { count: rows.length, paid, cash, card, bank };
  }, [rows]);

  const scopeHint =
    branch === "ყველა" ? "ყველა ობიექტი" : branch;

  return (
    <section className="space-y-4 rounded-xl border border-sky-900/40 bg-sky-950/15 p-5">
      <div>
        <h2 className="text-lg font-semibold text-sky-200">კლიენტის შესყიდვები</h2>
        <p className="text-xs text-zinc-500">
          ერთიანი შეკვეთა ერთ ხაზად · პროდუქტები დაჭერისას ·{" "}
          <span className="text-zinc-400">
            {scopeHint} · {rangeLabel}
          </span>
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">ობიექტი</label>
          <select className={inputCls} value={branch} onChange={(e) => setBranch(e.target.value as Branch | "ყველა")}>
            <option value="ყველა">ყველა ფილიალი</option>
            {BRANCHES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">პერიოდი</label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={filterBtn(rangeMode === "period")} onClick={() => setRangeMode("period")}>
              ზედა პერიოდი
            </button>
            <button type="button" className={filterBtn(rangeMode === "day")} onClick={() => setRangeMode("day")}>
              კონკრეტული დღე
            </button>
          </div>
        </div>
        {rangeMode === "day" && (
          <div>
            <label className="mb-1 block text-xs text-zinc-500">თარიღი</label>
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
            </div>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-zinc-500">ტიპი</label>
          <select
            className={inputCls}
            value={personType}
            onChange={(e) => setPersonType(e.target.value as ClientPersonKind | "all")}
          >
            <option value="all">ყველა</option>
            <option value="legal">კომპანია</option>
            <option value="physical">ფიზიკური პირი</option>
          </select>
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-xs text-zinc-500">ძებნა</label>
          <input
            className={`${inputCls} w-full`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="სახელი, ს/კ, ტელეფონი..."
          />
        </div>
      </div>

      <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-emerald-300/80">
          {rangeMode === "day" ? "იმ დღის ჯამი" : "პერიოდის ჯამი"} · {scopeHint} · {rangeLabel}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-xs text-zinc-500">შეკვეთები</p>
            <p className="mt-1 text-xl font-semibold">{totals.count}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-xs text-zinc-500">ჯამი</p>
            <p className="mt-1 text-xl font-semibold text-emerald-400">{formatMoney(totals.paid)}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-xs text-zinc-500">ქეში</p>
            <p className="mt-1 text-xl font-semibold text-emerald-300">{formatMoney(totals.cash)}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-xs text-zinc-500">ბარათი</p>
            <p className="mt-1 text-xl font-semibold text-sky-400">{formatMoney(totals.card)}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-xs text-zinc-500">გადარიცხვა</p>
            <p className="mt-1 text-xl font-semibold text-violet-400">{formatMoney(totals.bank)}</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">ამ ფილტრში კლიენტის შესყიდვები არ არის</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                <th className="pb-2 pr-3">დრო</th>
                <th className="pb-2 pr-3">კლიენტი</th>
                <th className="pb-2 pr-3">ტიპი</th>
                <th className="pb-2 pr-3">ს/კ / პირადი</th>
                <th className="pb-2 pr-3">ტელეფონი</th>
                <th className="pb-2 pr-3">შეიყვანა</th>
                <th className="pb-2 pr-3">ფილიალი</th>
                <th className="pb-2 pr-3 text-right">პროდუქტი</th>
                <th className="pb-2 pr-3">გადახდა</th>
                <th className="pb-2 pr-3 text-right">თანხა</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const open = openKey === r.key;
                return (
                  <Fragment key={r.key}>
                    <tr
                      className={`cursor-pointer border-b border-zinc-800/50 hover:bg-zinc-800/40 ${
                        open ? "bg-sky-950/30" : ""
                      }`}
                      onClick={() => setOpenKey((prev) => (prev === r.key ? null : r.key))}
                    >
                      <td className="py-2 pr-3 whitespace-nowrap text-zinc-400">{formatDate(r.date)}</td>
                      <td className="py-2 pr-3 font-medium">{r.name}</td>
                      <td className="py-2 pr-3 text-xs text-zinc-400">{r.personTypeLabel}</td>
                      <td className="py-2 pr-3 text-zinc-400">{r.identity || "—"}</td>
                      <td className="py-2 pr-3 text-zinc-400">{r.phone || "—"}</td>
                      <td className="py-2 pr-3 text-violet-300">{r.enteredBy}</td>
                      <td className="py-2 pr-3">{r.branch}</td>
                      <td className="py-2 pr-3 text-right text-zinc-400">
                        {r.productCount}
                        <span className="ml-1 text-[10px] text-zinc-600">{open ? "▲" : "▼"}</span>
                      </td>
                      <td className={`py-2 pr-3 font-medium ${paymentAccent(r.paymentMethodLabel)}`}>
                        {r.paymentMethodLabel}
                      </td>
                      <td className="py-2 pr-3 text-right text-emerald-400">{formatMoney(r.paid)}</td>
                    </tr>
                    {open && (
                      <tr className="border-b border-sky-900/40 bg-zinc-950/40">
                        <td colSpan={10} className="px-4 py-3">
                          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-sky-300/80">
                            პროდუქტები — {r.name}
                          </p>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-zinc-500">
                                <th className="pb-1 pr-3">პროდუქტი</th>
                                <th className="pb-1 pr-3 text-right">რაოდენობა</th>
                                <th className="pb-1 text-right">თანხა</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.products.map((p) => (
                                <tr key={p.id} className="border-t border-zinc-800/60">
                                  <td className="py-1.5 pr-3">
                                    {p.productName}
                                    {p.productCode ? (
                                      <span className="text-zinc-500"> · {p.productCode}</span>
                                    ) : null}
                                  </td>
                                  <td className="py-1.5 pr-3 text-right">{p.quantity}</td>
                                  <td className="py-1.5 text-right text-emerald-400">
                                    {formatMoney(p.paid)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
