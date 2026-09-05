"use client";

import { useMemo, useState } from "react";
import type { Branch, Customer, Transaction } from "@/lib/types";
import {
  buildClientPurchaseTxRows,
  type ClientPersonKind,
} from "@/lib/client-purchase-report";
import type { ResolvedPeriod } from "@/lib/period-filter";
import { BRANCHES } from "@/lib/dashboard-data";
import { formatDate, formatMoney } from "@/lib/utils";

const inputCls = "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm focus:border-emerald-500";

type Props = {
  transactions: Transaction[];
  customers: Customer[];
  period: ResolvedPeriod;
};

function paymentAccent(label: string) {
  if (label === "ქეში") return "text-emerald-400";
  if (label === "ბარათი") return "text-sky-400";
  return "text-violet-400";
}

export default function ClientPurchasesReportPanel({ transactions, customers, period }: Props) {
  const [branch, setBranch] = useState<Branch | "ყველა">("ყველა");
  const [personType, setPersonType] = useState<ClientPersonKind | "all">("all");
  const [search, setSearch] = useState("");

  const rows = useMemo(
    () =>
      buildClientPurchaseTxRows(transactions, customers, period.from, period.to, {
        branch,
        personType,
        search,
      }),
    [transactions, customers, period.from, period.to, branch, personType, search]
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

  return (
    <section className="space-y-4 rounded-xl border border-sky-900/40 bg-sky-950/15 p-5">
      <div>
        <h2 className="text-lg font-semibold text-sky-200">კლიენტის შესყიდვები</h2>
        <p className="text-xs text-zinc-500">
          თითო ტრანზაქცია ცალკე · დროის მიხედვით ·{" "}
          <span className="text-zinc-400">{period.label}</span>
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">ფილიალი</label>
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
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs text-zinc-500">ძებნა</label>
          <input
            className={`${inputCls} w-full`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="სახელი, ს/კ, ტელეფონი, პროდუქტი, შეიყვანა..."
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500">ტრანზაქციები</p>
          <p className="mt-1 text-xl font-semibold">{totals.count}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500">გადახდილი (ჯამი)</p>
          <p className="mt-1 text-xl font-semibold text-sky-400">{formatMoney(totals.paid)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500">ქეში / ბარათი</p>
          <p className="mt-1 text-sm font-semibold">
            <span className="text-emerald-400">{formatMoney(totals.cash)}</span>
            <span className="mx-1 text-zinc-600">·</span>
            <span className="text-sky-400">{formatMoney(totals.card)}</span>
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500">გადარიცხვა</p>
          <p className="mt-1 text-xl font-semibold text-violet-400">{formatMoney(totals.bank)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">ამ პერიოდში კლიენტის შესყიდვები არ არის</p>
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
                <th className="pb-2 pr-3">პროდუქტი</th>
                <th className="pb-2 pr-3">გადახდა</th>
                <th className="pb-2 pr-3 text-right">თანხა</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-800/50">
                  <td className="py-2 pr-3 whitespace-nowrap text-zinc-400">{formatDate(r.date)}</td>
                  <td className="py-2 pr-3 font-medium">{r.name}</td>
                  <td className="py-2 pr-3 text-xs text-zinc-400">{r.personTypeLabel}</td>
                  <td className="py-2 pr-3 text-zinc-400">{r.identity || "—"}</td>
                  <td className="py-2 pr-3 text-zinc-400">{r.phone || "—"}</td>
                  <td className="py-2 pr-3 text-violet-300">{r.enteredBy}</td>
                  <td className="py-2 pr-3">{r.branch}</td>
                  <td className="py-2 pr-3">
                    {r.productName} × {r.quantity}
                  </td>
                  <td className={`py-2 pr-3 font-medium ${paymentAccent(r.paymentMethodLabel)}`}>
                    {r.paymentMethodLabel}
                  </td>
                  <td className="py-2 pr-3 text-right text-emerald-400">{formatMoney(r.paid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
