"use client";

import { useMemo, useState } from "react";
import type { Branch, Expense, ExpenseBranch, ExpenseCategory, TxSource } from "@/lib/types";
import { CATEGORIES, EXPENSE_BRANCHES } from "@/lib/dashboard-data";
import { effectiveExpenseBranch } from "@/lib/branch-allocation";
import { monthStartEnd, formatDate, formatMoney } from "@/lib/utils";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-red-500 focus:outline-none";
const labelCls = "mb-1 block text-xs text-zinc-400";
const btnCls = "rounded-lg bg-red-700 px-4 py-2 text-sm font-medium hover:bg-red-600 disabled:opacity-40";
const tabBtn = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm ${on ? "bg-red-900/60 text-red-200" : "text-zinc-500 hover:text-zinc-300"}`;

type PeriodMode = "month" | "range" | "all";

type Props = {
  expenses: Expense[];
  onDelete: (id: string) => Promise<boolean>;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function sourceLabel(source?: TxSource) {
  if (source === "branch") return "ფილიალი";
  if (source === "import") return "Excel";
  if (source === "distribucia") return "დისტრიბუცია";
  return "ადმინი";
}

function inDateRange(date: string, from: string, to: string) {
  const day = date.slice(0, 10);
  return day >= from && day <= to;
}

export default function ExpensesPanel({ expenses, onDelete }: Props) {
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [from, setFrom] = useState(() => monthStartEnd().from);
  const [to, setTo] = useState(() => monthStartEnd().to);
  const [branch, setBranch] = useState<ExpenseBranch | Branch | "ყველა">("ყველა");
  const [category, setCategory] = useState<ExpenseCategory | "ყველა">("ყველა");
  const [source, setSource] = useState<TxSource | "ყველა">("ყველა");
  const [search, setSearch] = useState("");

  const { rangeFrom, rangeTo } = useMemo(() => {
    if (periodMode === "month") {
      const r = monthStartEnd(month);
      return { rangeFrom: r.from, rangeTo: r.to };
    }
    if (periodMode === "range") return { rangeFrom: from, rangeTo: to };
    return { rangeFrom: "", rangeTo: "" };
  }, [periodMode, month, from, to]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses
      .filter((e) => {
        if (periodMode !== "all" && !inDateRange(e.date, rangeFrom, rangeTo)) return false;
        if (branch !== "ყველა") {
          const attributed = effectiveExpenseBranch(e);
          if (attributed !== branch && e.branch !== branch) return false;
        }
        if (category !== "ყველა" && e.category !== category) return false;
        if (source !== "ყველა") {
          const s = e.source ?? "admin";
          if (s !== source) return false;
        }
        if (q) {
          const hay = `${e.category} ${e.comment} ${e.branch}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, periodMode, rangeFrom, rangeTo, branch, category, source, search]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filtered) {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const total = filtered.reduce((s, e) => s + e.amount, 0);

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-red-900/40 bg-red-950/15 p-5">
        <h2 className="mb-1 font-semibold text-red-200">ხარჯების ფილტრი</h2>
        <p className="mb-4 text-xs text-zinc-500">
          ყველა ხარჯი ინახება სისტემაში — Excel იმპორტი, ფილიალის ანგარიში და ხელით ჩაწერა. აქ შეგიძლიათ ფილტრი თვე/პერიოდის, ფილიალის და კატეგორიის მიხედვით.
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" className={tabBtn(periodMode === "month")} onClick={() => setPeriodMode("month")}>
            თვე
          </button>
          <button type="button" className={tabBtn(periodMode === "range")} onClick={() => setPeriodMode("range")}>
            პერიოდი
          </button>
          <button type="button" className={tabBtn(periodMode === "all")} onClick={() => setPeriodMode("all")}>
            ყველა მონაცემი
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {periodMode === "month" && (
            <Field label="თვე">
              <input type="month" className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)} />
            </Field>
          )}
          {periodMode === "range" && (
            <>
              <Field label="დან">
                <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="მდე">
                <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </>
          )}
          <Field label="ფილიალი">
            <select className={inputCls} value={branch} onChange={(e) => setBranch(e.target.value as ExpenseBranch | Branch | "ყველა")}>
              <option value="ყველა">ყველა</option>
              {EXPENSE_BRANCHES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </Field>
          <Field label="კატეგორია">
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory | "ყველა")}>
              <option value="ყველა">ყველა</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="წყარო">
            <select className={inputCls} value={source} onChange={(e) => setSource(e.target.value as TxSource | "ყველა")}>
              <option value="ყველა">ყველა</option>
              <option value="admin">ადმინი / ხელით</option>
              <option value="branch">ფილიალი (ლინკი)</option>
              <option value="import">Excel იმპორტი</option>
            </select>
          </Field>
          <Field label="ძებნა (კომენტარი, კატეგორია)">
            <input
              className={inputCls}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="მაგ: საწვავი, გიორგი..."
            />
          </Field>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500">ჯამი (ფილტრი)</p>
          <p className="mt-1 text-2xl font-semibold text-red-400">{formatMoney(total)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500">ჩანაწერები</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-200">{filtered.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500">კატეგორიები</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-200">{byCategory.length}</p>
        </div>
      </div>

      {byCategory.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-300">კატეგორიების მიხედვით</h3>
          <div className="flex flex-wrap gap-2">
            {byCategory.map(([cat, amt]) => (
              <button
                key={cat}
                type="button"
                className={`rounded-lg border px-3 py-1.5 text-xs ${
                  category === cat
                    ? "border-red-700 bg-red-950/40 text-red-200"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                }`}
                onClick={() => setCategory(category === cat ? "ყველა" : cat)}
              >
                {cat}: <span className="text-red-400">{formatMoney(amt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-zinc-200">ხარჯების სია</h3>
          <span className="text-xs text-zinc-500">
            {periodMode === "all"
              ? "ყველა დრო"
              : periodMode === "month"
                ? month
                : `${from} — ${to}`}
          </span>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-zinc-500">ამ ფილტრით ხარჯი არ მოიძებნა</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pr-3">თარიღი</th>
                  <th className="pb-2 pr-3">ფილიალი</th>
                  <th className="pb-2 pr-3">კატეგორია</th>
                  <th className="pb-2 pr-3">კომენტარი</th>
                  <th className="pb-2 pr-3">წყარო</th>
                  <th className="pb-2 pr-3 text-right">თანხა</th>
                  <th className="pb-2 w-16" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b border-zinc-800/50">
                    <td className="py-2 pr-3 whitespace-nowrap text-zinc-400">{formatDate(e.date)}</td>
                    <td className="py-2 pr-3">{effectiveExpenseBranch(e)}</td>
                    <td className="py-2 pr-3">{e.category}</td>
                    <td className="py-2 pr-3 text-zinc-500">{e.comment || "—"}</td>
                    <td className="py-2 pr-3 text-xs text-zinc-500">{sourceLabel(e.source)}</td>
                    <td className="py-2 pr-3 text-right font-medium text-red-400">-{formatMoney(e.amount)}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        className="text-xs text-red-400 hover:text-red-300"
                        onClick={async () => {
                          if (!confirm("წავშალოთ ეს ხარჯი?")) return;
                          await onDelete(e.id);
                        }}
                      >
                        წაშლა
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-700 font-semibold">
                  <td colSpan={5} className="py-3 pr-3 text-right text-zinc-400">ჯამი</td>
                  <td className="py-3 pr-3 text-right text-red-400">{formatMoney(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
