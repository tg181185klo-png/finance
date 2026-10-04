"use client";

import { useState } from "react";
import type { Expense } from "@/lib/types";
import { OPERATIONAL_DATA_FROM } from "@/lib/report-config";
import { formatDate, formatMoney } from "@/lib/utils";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none";
const labelCls = "mb-1 block text-xs text-zinc-400";

type Props = {
  expenses: Expense[];
  onAdd: (input: { date: string; what: string; amount: number }) => Promise<boolean>;
};

export default function CardSpendPanel({ expenses, onAdd }: Props) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [what, setWhat] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const rows = [...expenses].sort((a, b) => b.date.localeCompare(a.date));
  const spent = rows.reduce((sum, row) => sum + row.amount, 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(amount);
    const purpose = what.trim();
    if (!purpose || !value || value <= 0) return;
    setBusy(true);
    setMsg("");
    const ok = await onAdd({ date, what: purpose, amount: value });
    setBusy(false);
    if (!ok) return;
    setWhat("");
    setAmount("");
    setMsg("ბარათიდან ჩამოიჭრა");
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="rounded-xl border border-sky-900/50 bg-zinc-900/40 p-5">
        <h2 className="mb-1 text-lg font-semibold text-sky-300">ბარათიდან ხარჯი</h2>
        <p className="mb-4 text-xs text-zinc-500">
          ჩაწერე რაში დაიხარჯა და რამდენი. თანხა ბარათს გამოაკლდება.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>თარიღი</label>
            <input
              type="date"
              className={inputCls}
              value={date}
              min={OPERATIONAL_DATA_FROM}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelCls}>თანხა (₾)</label>
            <input
              className={inputCls}
              type="number"
              min={0}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>რაში დაიხარჯა</label>
            <input
              className={inputCls}
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              placeholder="მაგ. საწვავი, პროდუქტი"
              required
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium hover:bg-sky-600 disabled:opacity-40"
        >
          ჩამოჭრა ბარათიდან
        </button>
        {msg && <p className="mt-3 text-sm text-emerald-400">{msg}</p>}
      </form>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h3 className="mb-1 font-semibold text-zinc-100">ბარათიდან გახარჯული</h3>
        <p className="mb-4 text-xs text-zinc-500">სულ ჩამოჭრილი {formatMoney(spent)}</p>
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">ჯერ ჩანაწერი არ არის</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {rows.map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span>
                  <span className="text-zinc-500">{formatDate(row.date)}</span>
                  <span className="mx-2 text-zinc-700">·</span>
                  {row.comment || row.category}
                </span>
                <span className="shrink-0 font-medium text-red-300">{formatMoney(row.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
