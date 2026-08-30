"use client";

import { useMemo, useState } from "react";
import type { Branch, Transaction } from "@/lib/types";
import { buildClientReport, buildClientSaleLines } from "@/lib/client-report";
import type { ResolvedPeriod } from "@/lib/period-filter";
import { BRANCHES } from "@/lib/dashboard-data";
import { formatDate, formatMoney } from "@/lib/utils";

const tabBtn = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm ${on ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`;

type Props = {
  transactions: Transaction[];
  period: ResolvedPeriod;
  branchFilter: Branch | "ყველა";
};

export default function ClientsPanel({ transactions, period, branchFilter }: Props) {
  const [view, setView] = useState<"summary" | "detail">("summary");
  const [branch, setBranch] = useState<Branch | "ყველა">(branchFilter);

  const scopedTx = useMemo(() => {
    if (branch === "ყველა") return transactions;
    return transactions.filter((t) => t.branch === branch);
  }, [transactions, branch]);

  const rows = useMemo(
    () => buildClientReport(scopedTx, period.from, period.to),
    [scopedTx, period.from, period.to]
  );

  const lines = useMemo(
    () => buildClientSaleLines(scopedTx, period.from, period.to),
    [scopedTx, period.from, period.to]
  );

  const totals = useMemo(
    () => ({
      clients: rows.length,
      orders: rows.reduce((s, r) => s + r.orders, 0),
      revenue: rows.reduce((s, r) => s + r.total, 0),
    }),
    [rows]
  );

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="mb-1 text-lg font-semibold">კლიენტების რეპორტი</h2>
        <p className="text-xs text-zinc-500">
          პერიოდი: <span className="text-zinc-300">{period.label}</span> · ფილიალი და თანამშრომელი ვის ჩაუწერა
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
            value={branch}
            onChange={(e) => setBranch(e.target.value as Branch | "ყველა")}
          >
            <option value="ყველა">ყველა ფილიალი</option>
            {BRANCHES.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <button type="button" className={tabBtn(view === "summary")} onClick={() => setView("summary")}>
            შეჯამება
          </button>
          <button type="button" className={tabBtn(view === "detail")} onClick={() => setView("detail")}>
            ხაზები
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500">კლიენტები</p>
          <p className="mt-1 text-xl font-semibold">{totals.clients}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500">შეკვეთები</p>
          <p className="mt-1 text-xl font-semibold">{totals.orders}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500">ჯამური გაყიდვა</p>
          <p className="mt-1 text-xl font-semibold text-emerald-400">{formatMoney(totals.revenue)}</p>
        </div>
      </div>

      {view === "summary" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          {rows.length === 0 ? (
            <p className="text-sm text-zinc-500">ამ პერიოდში კლიენტის მონაცემები არ არის</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pr-3">კლიენტი</th>
                  <th className="pb-2 pr-3">ტელეფონი</th>
                  <th className="pb-2 pr-3">ფილიალი</th>
                  <th className="pb-2 pr-3">თანამშრომელი</th>
                  <th className="pb-2 pr-3">წყარო</th>
                  <th className="pb-2 pr-3 text-right">შეკვეთა</th>
                  <th className="pb-2 pr-3 text-right">ჯამი</th>
                  <th className="pb-2">ბოლო</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-zinc-800/50">
                    <td className="py-2 pr-3 font-medium">{r.name}</td>
                    <td className="py-2 pr-3 text-zinc-400">{r.phone || "—"}</td>
                    <td className="py-2 pr-3">{r.branch}</td>
                    <td className="py-2 pr-3 text-violet-300">{r.employee}</td>
                    <td className="py-2 pr-3 text-xs text-zinc-500">{r.source}</td>
                    <td className="py-2 pr-3 text-right">{r.orders}</td>
                    <td className="py-2 pr-3 text-right font-medium text-emerald-400">{formatMoney(r.total)}</td>
                    <td className="py-2 whitespace-nowrap text-xs text-zinc-500">{formatDate(r.lastDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {view === "detail" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          {lines.length === 0 ? (
            <p className="text-sm text-zinc-500">ამ პერიოდში ხაზები არ არის</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pr-3">დრო</th>
                  <th className="pb-2 pr-3">კლიენტი</th>
                  <th className="pb-2 pr-3">ფილიალი</th>
                  <th className="pb-2 pr-3">თანამშრომელი</th>
                  <th className="pb-2 pr-3">პროდუქტი</th>
                  <th className="pb-2 pr-3 text-right">ჯამი</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-zinc-800/50">
                    <td className="py-2 pr-3 whitespace-nowrap text-zinc-400">{formatDate(l.date)}</td>
                    <td className="py-2 pr-3">
                      {l.clientName}
                      {l.clientPhone && <span className="text-zinc-500"> · {l.clientPhone}</span>}
                    </td>
                    <td className="py-2 pr-3">{l.branch}</td>
                    <td className="py-2 pr-3 text-violet-300">{l.employee}</td>
                    <td className="py-2 pr-3">{l.productName} × {l.quantity}</td>
                    <td className="py-2 pr-3 text-right text-emerald-400">{formatMoney(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
