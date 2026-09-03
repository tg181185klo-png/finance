"use client";

import { useMemo, useState } from "react";
import type { Branch, Customer, Transaction } from "@/lib/types";
import {
  buildClientPurchaseReport,
  type ClientPersonKind,
  type ClientPurchaseRow,
} from "@/lib/client-purchase-report";
import type { ResolvedPeriod } from "@/lib/period-filter";
import { BRANCHES } from "@/lib/dashboard-data";
import { formatDate, formatMoney } from "@/lib/utils";

const inputCls = "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm focus:border-emerald-500";
const tabBtn = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm ${on ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`;

type Props = {
  transactions: Transaction[];
  customers: Customer[];
  period: ResolvedPeriod;
};

export default function ClientPurchasesReportPanel({ transactions, customers, period }: Props) {
  const [branch, setBranch] = useState<Branch | "ყველა">("ყველა");
  const [personType, setPersonType] = useState<ClientPersonKind | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [view, setView] = useState<"clients" | "products">("clients");

  const rows = useMemo(
    () =>
      buildClientPurchaseReport(transactions, customers, period.from, period.to, {
        branch,
        personType,
        search,
      }),
    [transactions, customers, period.from, period.to, branch, personType, search]
  );

  const selected: ClientPurchaseRow | null = useMemo(
    () => rows.find((r) => r.key === selectedKey) ?? null,
    [rows, selectedKey]
  );

  const totals = useMemo(
    () => ({
      clients: rows.length,
      ordered: rows.reduce((s, r) => s + r.orderedTotal, 0),
      paid: rows.reduce((s, r) => s + r.paidTotal, 0),
      remaining: rows.reduce((s, r) => s + r.remainingTotal, 0),
    }),
    [rows]
  );

  return (
    <section className="space-y-4 rounded-xl border border-sky-900/40 bg-sky-950/15 p-5">
      <div>
        <h2 className="text-lg font-semibold text-sky-200">კლიენტის შესყიდვები</h2>
        <p className="text-xs text-zinc-500">
          კომპანია ან ფიზიკური პირი — რა შეიძინა და რამდენი გადაიხადა ·{" "}
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
            placeholder="სახელი, ს/კ, ტელეფონი, პროდუქტი..."
          />
        </div>
        <div className="flex gap-2">
          <button type="button" className={tabBtn(view === "clients")} onClick={() => setView("clients")}>
            კლიენტები
          </button>
          <button type="button" className={tabBtn(view === "products")} onClick={() => setView("products")}>
            პროდუქტები
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500">კლიენტები</p>
          <p className="mt-1 text-xl font-semibold">{totals.clients}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500">შეძენილი (ჯამი)</p>
          <p className="mt-1 text-xl font-semibold text-emerald-400">{formatMoney(totals.ordered)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500">გადახდილი</p>
          <p className="mt-1 text-xl font-semibold text-sky-400">{formatMoney(totals.paid)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500">დარჩენილი</p>
          <p className="mt-1 text-xl font-semibold text-amber-400">{formatMoney(totals.remaining)}</p>
        </div>
      </div>

      {view === "clients" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          {rows.length === 0 ? (
            <p className="text-sm text-zinc-500">ამ პერიოდში კლიენტის შესყიდვები არ არის</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pr-3">კლიენტი</th>
                  <th className="pb-2 pr-3">ტიპი</th>
                  <th className="pb-2 pr-3">ს/კ / პირადი</th>
                  <th className="pb-2 pr-3">ტელეფონი</th>
                  <th className="pb-2 pr-3 text-right">შეკვეთა</th>
                  <th className="pb-2 pr-3 text-right">შეძენილი</th>
                  <th className="pb-2 pr-3 text-right">გადახდილი</th>
                  <th className="pb-2 pr-3 text-right">დარჩენილი</th>
                  <th className="pb-2">ბოლო</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.key}
                    className={`cursor-pointer border-b border-zinc-800/50 hover:bg-zinc-800/40 ${
                      selectedKey === r.key ? "bg-sky-950/30" : ""
                    }`}
                    onClick={() => setSelectedKey((prev) => (prev === r.key ? null : r.key))}
                  >
                    <td className="py-2 pr-3 font-medium">{r.name}</td>
                    <td className="py-2 pr-3 text-xs text-zinc-400">{r.personTypeLabel}</td>
                    <td className="py-2 pr-3 text-zinc-400">{r.identity || "—"}</td>
                    <td className="py-2 pr-3 text-zinc-400">{r.phone || "—"}</td>
                    <td className="py-2 pr-3 text-right">{r.orders}</td>
                    <td className="py-2 pr-3 text-right text-emerald-400">{formatMoney(r.orderedTotal)}</td>
                    <td className="py-2 pr-3 text-right text-sky-400">{formatMoney(r.paidTotal)}</td>
                    <td className="py-2 pr-3 text-right text-amber-400">{formatMoney(r.remainingTotal)}</td>
                    <td className="py-2 whitespace-nowrap text-xs text-zinc-500">{formatDate(r.lastDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {view === "products" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          {rows.length === 0 ? (
            <p className="text-sm text-zinc-500">ამ პერიოდში პროდუქტები არ არის</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pr-3">კლიენტი</th>
                  <th className="pb-2 pr-3">ტიპი</th>
                  <th className="pb-2 pr-3">პროდუქტი</th>
                  <th className="pb-2 pr-3 text-right">რაოდენობა</th>
                  <th className="pb-2 pr-3 text-right">თანხა</th>
                </tr>
              </thead>
              <tbody>
                {rows.flatMap((r) =>
                  r.products.map((p, i) => (
                    <tr key={`${r.key}-${p.productName}-${i}`} className="border-b border-zinc-800/50">
                      <td className="py-2 pr-3 font-medium">{r.name}</td>
                      <td className="py-2 pr-3 text-xs text-zinc-400">{r.personTypeLabel}</td>
                      <td className="py-2 pr-3">
                        {p.productName}
                        {p.productCode ? <span className="text-zinc-500"> · {p.productCode}</span> : null}
                      </td>
                      <td className="py-2 pr-3 text-right">{p.quantity}</td>
                      <td className="py-2 pr-3 text-right text-emerald-400">{formatMoney(p.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {selected && (
        <div className="rounded-xl border border-sky-800/50 bg-zinc-900/50 p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-sky-200">{selected.name}</h3>
              <p className="text-xs text-zinc-500">
                {selected.personTypeLabel}
                {selected.identity ? ` · ${selected.identity}` : ""}
                {selected.phone ? ` · ${selected.phone}` : ""}
                {selected.branches ? ` · ${selected.branches}` : ""}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                შეძენილი {formatMoney(selected.orderedTotal)} · გადახდილი{" "}
                <span className="text-sky-400">{formatMoney(selected.paidTotal)}</span>
                {selected.remainingTotal > 0 && (
                  <>
                    {" "}
                    · დარჩენილი <span className="text-amber-400">{formatMoney(selected.remainingTotal)}</span>
                  </>
                )}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:border-zinc-500"
              onClick={() => setSelectedKey(null)}
            >
              დახურვა
            </button>
          </div>

          <div className="mb-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">რა შეიძინა</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                    <th className="pb-2 pr-3">პროდუქტი</th>
                    <th className="pb-2 pr-3 text-right">რაოდენობა</th>
                    <th className="pb-2 text-right">თანხა</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.products.map((p) => (
                    <tr key={`${p.productCode}-${p.productName}`} className="border-b border-zinc-800/40">
                      <td className="py-1.5 pr-3">{p.productName}</td>
                      <td className="py-1.5 pr-3 text-right">{p.quantity}</td>
                      <td className="py-1.5 text-right text-emerald-400">{formatMoney(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">ტრანზაქციები / გადახდა</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                    <th className="pb-2 pr-3">თარიღი</th>
                    <th className="pb-2 pr-3">ფილიალი</th>
                    <th className="pb-2 pr-3">პროდუქტი</th>
                    <th className="pb-2 pr-3 text-right">თანხა</th>
                    <th className="pb-2 pr-3 text-right">გადახდილი</th>
                    <th className="pb-2">სტატუსი</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.detailLines.map((l) => (
                    <tr key={l.id} className="border-b border-zinc-800/40">
                      <td className="py-1.5 pr-3 whitespace-nowrap text-zinc-400">{formatDate(l.date)}</td>
                      <td className="py-1.5 pr-3">{l.branch}</td>
                      <td className="py-1.5 pr-3">
                        {l.productName} × {l.quantity}
                      </td>
                      <td className="py-1.5 pr-3 text-right">{formatMoney(l.amount)}</td>
                      <td className="py-1.5 pr-3 text-right text-sky-400">{formatMoney(l.paid)}</td>
                      <td className="py-1.5 text-xs text-zinc-500">{l.paymentLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
