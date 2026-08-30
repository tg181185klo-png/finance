"use client";

import { useMemo, useState } from "react";
import type { Branch, BranchDailyReport, Employee } from "@/lib/types";
import { BRANCHES } from "@/lib/dashboard-data";
import { formatDate, formatMoney } from "@/lib/utils";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-emerald-500";
const labelCls = "mb-1 block text-xs text-zinc-400";
const btnCls = "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-40";
const tabBtn = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm ${on ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function branchLink(token: string) {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/f/${token}`;
}

type Props = {
  branchReports: BranchDailyReport[];
  employees: Employee[];
  branchTokens: Record<Branch, string>;
  unlocked: boolean;
  getAdminPin: () => string;
  onRefresh: () => Promise<unknown>;
  onDeleteReport: (reportId: string) => void;
};

export default function BranchesPanel({
  branchReports,
  employees,
  branchTokens,
  unlocked,
  getAdminPin,
  onRefresh,
  onDeleteReport,
}: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [filterBranch, setFilterBranch] = useState<Branch | "ყველა">("ყველა");
  const [filterFrom, setFilterFrom] = useState(today);
  const [filterTo, setFilterTo] = useState(today);
  const [quickDay, setQuickDay] = useState<"today" | "week" | "month" | "custom">("month");

  const [restoreBranch, setRestoreBranch] = useState<Branch>("დიღომი");
  const [restoreDate, setRestoreDate] = useState("");
  const [restoreEmployeeId, setRestoreEmployeeId] = useState("");
  const [restoreMsg, setRestoreMsg] = useState("");
  const [restoreErr, setRestoreErr] = useState("");
  const [restoring, setRestoring] = useState(false);

  const { from, to } = useMemo(() => {
    if (quickDay === "today") return { from: today, to: today };
    if (quickDay === "week") {
      const d = new Date();
      const start = new Date(d);
      start.setDate(d.getDate() - 6);
      return { from: start.toISOString().slice(0, 10), to: today };
    }
    if (quickDay === "month") {
      const m = today.slice(0, 7);
      const [y, mo] = m.split("-").map(Number);
      const last = new Date(y, mo, 0).getDate();
      return { from: `${m}-01`, to: `${m}-${String(last).padStart(2, "0")}` };
    }
    return { from: filterFrom, to: filterTo };
  }, [quickDay, today, filterFrom, filterTo]);

  const filtered = useMemo(() => {
    return branchReports
      .filter((r) => {
        if (filterBranch !== "ყველა" && r.branch !== filterBranch) return false;
        if (r.date < from || r.date > to) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.submittedAt.localeCompare(a.submittedAt));
  }, [branchReports, filterBranch, from, to]);

  const daySummary = useMemo(() => {
    const map = new Map<string, { revenue: number; expenses: number; reports: number }>();
    for (const r of filtered) {
      const key = `${r.date}|${r.branch}`;
      const row = map.get(key) ?? { revenue: 0, expenses: 0, reports: 0 };
      row.revenue += r.salesTotal;
      row.expenses += r.expensesTotal;
      row.reports += 1;
      map.set(key, row);
    }
    return [...map.entries()]
      .map(([key, v]) => {
        const [date, branch] = key.split("|") as [string, Branch];
        return { date, branch, ...v, net: v.revenue - v.expenses };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [filtered]);

  const branchEmployees = employees.filter((e) => e.branch === restoreBranch && e.active);

  async function adminRestore(e: React.FormEvent) {
    e.preventDefault();
    if (!restoreEmployeeId || !restoreDate) {
      setRestoreErr("აირჩიეთ თარიღი და თანამშრომელი");
      return;
    }
    setRestoring(true);
    setRestoreErr("");
    setRestoreMsg("");
    try {
      const res = await fetch("/api/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "adminRestore",
          pin: getAdminPin(),
          branch: restoreBranch,
          date: restoreDate,
          submittedEmployeeId: restoreEmployeeId,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "შეცდომა");
      setRestoreMsg(`აღდგენილია: ${restoreBranch} · ${restoreDate}`);
      setRestoreDate("");
      setRestoreEmployeeId("");
      await onRefresh();
    } catch (err) {
      setRestoreErr(err instanceof Error ? err.message : "შეცდომა");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-zinc-800 p-5">
        <h2 className="mb-4 font-semibold">ფილიალის ლინკები</h2>
        <p className="mb-4 text-sm text-zinc-500">გაუგზავნეთ თითოეულ ფილიალს თავისი ლინკი. დღის ბოლოს შეავსებენ ანგარიშს.</p>
        {BRANCHES.map((b) => {
          const token = branchTokens[b];
          const link = branchLink(token);
          return (
            <div key={b} className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="font-medium">{b}</p>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    className="text-xs text-zinc-400 hover:text-white"
                    onClick={() => navigator.clipboard.writeText(link)}
                  >
                    კოპირება
                  </button>
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    გახსნა
                  </a>
                </div>
              </div>
              <code className="block break-all text-xs text-emerald-400">{link}</code>
            </div>
          );
        })}
      </div>

      {unlocked && (
        <form onSubmit={adminRestore} className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-5">
          <h2 className="mb-2 font-semibold text-amber-200">რეპორტის აღდგენა (ადმინი)</h2>
          <p className="mb-4 text-xs text-zinc-500">
            თუ თანამშრომელმა დაავიწყა გაგზავნა — აირჩიეთ დღე და ვინ იმუშავა. შეიქმნება ნულოვანი რეპორტი + ხელფასის ხარჯი + სამუშაო დღე.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="ფილიალი">
              <select
                className={inputCls}
                value={restoreBranch}
                onChange={(e) => {
                  setRestoreBranch(e.target.value as Branch);
                  setRestoreEmployeeId("");
                }}
              >
                {BRANCHES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="თარიღი (რომელი დღე)">
              <input
                type="date"
                className={inputCls}
                value={restoreDate}
                onChange={(e) => setRestoreDate(e.target.value)}
                required
              />
            </Field>
            <Field label="ვინ იმუშავა">
              <select
                className={inputCls}
                value={restoreEmployeeId}
                onChange={(e) => setRestoreEmployeeId(e.target.value)}
                required
              >
                <option value="">აირჩიეთ...</option>
                {branchEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} · {formatMoney(emp.dailyWage)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-end">
              <button type="submit" className={`${btnCls} w-full`} disabled={restoring}>
                {restoring ? "..." : "აღდგენა"}
              </button>
            </div>
          </div>
          {restoreMsg && <p className="mt-2 text-sm text-emerald-400">{restoreMsg}</p>}
          {restoreErr && <p className="mt-2 text-sm text-red-400">{restoreErr}</p>}
        </form>
      )}

      <div className="rounded-xl border border-zinc-800 p-5">
        <h2 className="mb-4 font-semibold">ფილიალის ანგარიშები</h2>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={tabBtn(quickDay === "today")} onClick={() => setQuickDay("today")}>
              დღეს
            </button>
            <button type="button" className={tabBtn(quickDay === "week")} onClick={() => setQuickDay("week")}>
              7 დღე
            </button>
            <button type="button" className={tabBtn(quickDay === "month")} onClick={() => setQuickDay("month")}>
              თვე
            </button>
            <button type="button" className={tabBtn(quickDay === "custom")} onClick={() => setQuickDay("custom")}>
              პერიოდი
            </button>
          </div>
          {quickDay === "custom" && (
            <>
              <Field label="დან">
                <input type="date" className={inputCls} value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
              </Field>
              <Field label="მდე">
                <input type="date" className={inputCls} value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
              </Field>
            </>
          )}
          <Field label="ფილიალი">
            <select
              className={`${inputCls} min-w-[140px]`}
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value as Branch | "ყველა")}
            >
              <option value="ყველა">ყველა</option>
              {BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {daySummary.length > 0 && (
          <div className="mb-6 overflow-x-auto">
            <h3 className="mb-2 text-sm font-semibold text-zinc-300">დღის შეჯამება</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pr-4">თარიღი</th>
                  <th className="pb-2 pr-4">ფილიალი</th>
                  <th className="pb-2 pr-4 text-right">შემოსავალი</th>
                  <th className="pb-2 pr-4 text-right">ხარჯი</th>
                  <th className="pb-2 text-right">ნეტო</th>
                </tr>
              </thead>
              <tbody>
                {daySummary.map((row) => (
                  <tr key={`${row.date}-${row.branch}`} className="border-b border-zinc-800/50">
                    <td className="py-2 pr-4">{row.date}</td>
                    <td className="py-2 pr-4">{row.branch}</td>
                    <td className="py-2 pr-4 text-right text-emerald-400">{formatMoney(row.revenue)}</td>
                    <td className="py-2 pr-4 text-right text-red-400">{formatMoney(row.expenses)}</td>
                    <td className={`py-2 text-right ${row.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {formatMoney(row.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="text-sm text-zinc-500">ამ ფილტრით რეპორტები არ არის</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm">
                <div className="mb-2 flex flex-wrap justify-between gap-2">
                  <span className="font-medium">
                    {r.branch} · {r.date}
                    {r.submittedBy ? ` · ${r.submittedBy}` : ""}
                  </span>
                  <span className="text-zinc-500">{formatDate(r.submittedAt)}</span>
                </div>
                <div className="mb-2 flex flex-wrap gap-4 text-xs">
                  <span className="text-emerald-400">+{formatMoney(r.salesTotal)} შემოსავალი</span>
                  <span className="text-red-400">-{formatMoney(r.expensesTotal)} ხარჯი</span>
                  <span className={r.salesTotal - r.expensesTotal >= 0 ? "text-emerald-300" : "text-red-300"}>
                    ნეტო: {formatMoney(r.salesTotal - r.expensesTotal)}
                  </span>
                </div>

                {r.clientSales?.length ? (
                  <div className="mb-2 space-y-2">
                    {r.clientSales.map((c, i) => (
                      <div key={i} className="rounded border border-zinc-800/80 p-2">
                        <p className="text-zinc-200">
                          {c.customerFirstName} {c.customerLastName}
                          <span className="text-zinc-500"> · {c.phone}</span>
                        </p>
                        {c.products.map((p, j) => (
                          <p key={j} className="text-emerald-400">
                            +{formatMoney(p.amount)} — {p.productName} ×{p.quantity} · {p.paymentMethod || c.paymentMethod}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : r.salesTotal > 0 ? (
                  <p className="mb-2 text-emerald-400">+{formatMoney(r.salesTotal)} — {r.salesNote}</p>
                ) : (
                  <p className="mb-2 text-zinc-500">ნულოვანი რეპორტი — გაყიდვა არ ყოფილა</p>
                )}

                {r.expenses?.length ? (
                  <div className="space-y-1">
                    {r.expenses.map((ex, i) => (
                      <p key={i} className="text-red-400">
                        -{formatMoney(ex.amount)} — {ex.category}: {ex.comment}
                      </p>
                    ))}
                  </div>
                ) : r.expensesTotal > 0 ? (
                  <p className="text-red-400">-{formatMoney(r.expensesTotal)} — {r.expensesNote}</p>
                ) : null}

                {r.workedEmployees?.length ? (
                  <div className="mt-2 space-y-1 border-t border-zinc-800 pt-2">
                    <p className="text-xs text-zinc-500">სამუშაო დღე:</p>
                    {r.workedEmployees.map((w) => (
                      <p key={`${w.employeeId}-${w.shift}`} className="text-teal-300">
                        {w.employeeName} · {formatMoney(w.wageAmount)}
                      </p>
                    ))}
                  </div>
                ) : null}

                {unlocked && (
                  <button
                    type="button"
                    className="mt-2 text-xs text-red-400 hover:text-red-300"
                    onClick={() => onDeleteReport(r.id)}
                  >
                    წაშლა (ხელახლა შეავსონ / აღადგინოთ)
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
