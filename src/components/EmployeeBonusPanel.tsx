"use client";

import { useCallback, useMemo, useState } from "react";
import type { BonusSaleLine } from "@/lib/employee-bonus-report";
import type { Branch, BranchDailyReport, Customer, Employee } from "@/lib/types";
import {
  BONUS_RATE_LEGACY,
  BONUS_RATE_NEW,
  bonusTotals,
  buildBonusSaleLines,
  buildClientTradingSummary,
  buildEmployeeBonusSummary,
} from "@/lib/employee-bonus-report";
import { branchDriverEmployees } from "@/lib/branch-drivers";
import type { ResolvedPeriod } from "@/lib/period-filter";
import { BRANCHES } from "@/lib/dashboard-data";
import { formatMoney } from "@/lib/utils";

const tabBtn = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm ${on ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`;
const inputCls = "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm";
const selectCls = "max-w-[160px] rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs focus:border-violet-500";

type View = "daily" | "employees" | "clients";

type Props = {
  branchReports: BranchDailyReport[];
  customers: Customer[];
  employees: Employee[];
  period: ResolvedPeriod;
  branchFilter: Branch | "ყველა";
  onRefresh: () => Promise<unknown>;
};

export default function EmployeeBonusPanel({
  branchReports,
  customers,
  employees,
  period,
  branchFilter,
  onRefresh,
}: Props) {
  const [view, setView] = useState<View>("daily");
  const [branch, setBranch] = useState<Branch | "ყველა">(branchFilter);
  const [dayFilter, setDayFilter] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const lines = useMemo(
    () => buildBonusSaleLines(branchReports, customers, period.from, period.to, branch),
    [branchReports, customers, period.from, period.to, branch]
  );

  const filteredLines = useMemo(
    () => (dayFilter ? lines.filter((l) => l.date === dayFilter) : lines),
    [lines, dayFilter]
  );

  const employeeRows = useMemo(() => buildEmployeeBonusSummary(filteredLines), [filteredLines]);
  const clientRows = useMemo(() => buildClientTradingSummary(filteredLines), [filteredLines]);
  const totals = useMemo(() => bonusTotals(filteredLines), [filteredLines]);

  const availableDays = useMemo(
    () => [...new Set(lines.map((l) => l.date))].sort((a, b) => b.localeCompare(a)),
    [lines]
  );

  const driversForBranch = useCallback(
    (b: Branch) => branchDriverEmployees(b, employees),
    [employees]
  );

  async function updateDriver(line: BonusSaleLine, driverEmployeeId: string) {
    const emp = employees.find((e) => e.id === driverEmployeeId);
    if (!emp) return;
    const key = `${line.reportId}-${line.clientSaleId}`;
    setBusyKey(key);
    setErr("");
    try {
      const res = await fetch("/api/branch-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateDriver",
          reportId: line.reportId,
          clientSaleId: line.clientSaleId,
          driverEmployeeId: emp.id,
          driverEmployeeName: emp.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "შეცდომა");
      await onRefresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-violet-900/40 bg-violet-950/15 p-4">
        <h2 className="text-lg font-semibold">თანამშრომლის გაყიდვების რეპორტი</h2>
        <p className="mt-1 text-xs text-zinc-500">
          ფილიალის პორტალიდან გაგზავნილი გაყიდვები · პერიოდი: {period.label} · ბონუსი: ახალი კლიენტი{" "}
          {BONUS_RATE_NEW * 100}% · ძველი {BONUS_RATE_LEGACY * 100}%
        </p>
        <p className="mt-1 text-xs text-violet-300/80">
          მომზიდავი თანამშრომელი შეგიძლიათ შეცვალოთ დღიურ ხაზებში, თუ არასწორად გამოაგზავნეს
        </p>
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500">გაყიდვები</p>
          <p className="mt-1 text-xl font-semibold">{totals.sales}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500">შემოსავალი</p>
          <p className="mt-1 text-xl font-semibold text-emerald-400">{formatMoney(totals.revenue)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500">ბონუსი სულ</p>
          <p className="mt-1 text-xl font-semibold text-violet-400">{formatMoney(totals.bonus)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500">ახალი / ძველი</p>
          <p className="mt-1 text-xl font-semibold">
            <span className="text-emerald-400">{totals.newSales}</span>
            <span className="text-zinc-600"> / </span>
            <span className="text-amber-400">{totals.oldSales}</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <select className={inputCls} value={branch} onChange={(e) => setBranch(e.target.value as Branch | "ყველა")}>
          <option value="ყველა">ყველა ფილიალი</option>
          {BRANCHES.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">კონკრეტული დღე</label>
          <select className={inputCls} value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}>
            <option value="">მთელი პერიოდი</option>
            {availableDays.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <button type="button" className={tabBtn(view === "daily")} onClick={() => setView("daily")}>დღიური ხაზები</button>
        <button type="button" className={tabBtn(view === "employees")} onClick={() => setView("employees")}>თანამშრომელი</button>
        <button type="button" className={tabBtn(view === "clients")} onClick={() => setView("clients")}>კლიენტი</button>
      </div>

      {view === "daily" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          {filteredLines.length === 0 ? (
            <p className="text-sm text-zinc-500">ამ პერიოდში გაყიდვები არ არის</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pr-3">თარიღი</th>
                  <th className="pb-2 pr-3">ფილიალი</th>
                  <th className="pb-2 pr-3">მომზიდავი</th>
                  <th className="pb-2 pr-3">კლიენტი</th>
                  <th className="pb-2 pr-3">სტატუსი</th>
                  <th className="pb-2 pr-3">პროდუქტები</th>
                  <th className="pb-2 pr-3 text-right">თანხა</th>
                  <th className="pb-2 pr-3 text-right">%</th>
                  <th className="pb-2 text-right">ბონუსი</th>
                </tr>
              </thead>
              <tbody>
                {filteredLines.map((l) => {
                  const rowKey = `${l.reportId}-${l.clientSaleId}`;
                  const drivers = driversForBranch(l.branch);
                  const currentDriverId =
                    l.driverEmployeeId ??
                    drivers.find((e) => e.name === l.employeeName)?.id ??
                    "";
                  return (
                    <tr key={rowKey} className="border-b border-zinc-800/50">
                      <td className="py-2 pr-3 whitespace-nowrap">{l.date}</td>
                      <td className="py-2 pr-3">{l.branch}</td>
                      <td className="py-2 pr-3">
                        <select
                          className={selectCls}
                          value={currentDriverId}
                          disabled={busyKey === rowKey}
                          onChange={(e) => void updateDriver(l, e.target.value)}
                        >
                          <option value="">— აირჩიეთ —</option>
                          {drivers.map((emp) => (
                            <option key={emp.id} value={emp.id}>{emp.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-3 font-medium">{l.clientName}</td>
                      <td className="py-2 pr-3">
                        <span className={`rounded px-2 py-0.5 text-xs ${l.isLegacy ? "bg-amber-950/50 text-amber-300" : "bg-emerald-950/50 text-emerald-300"}`}>
                          {l.clientStatus}
                        </span>
                      </td>
                      <td className="py-2 pr-3 max-w-[200px] truncate text-xs text-zinc-400">{l.productsSummary}</td>
                      <td className="py-2 pr-3 text-right text-emerald-400">{formatMoney(l.amount)}</td>
                      <td className="py-2 pr-3 text-right text-zinc-500">{(l.bonusRate * 100).toFixed(1)}%</td>
                      <td className="py-2 text-right font-medium text-violet-400">{formatMoney(l.bonusAmount)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-700 font-semibold">
                  <td colSpan={6} className="py-2 pr-3 text-right text-zinc-400">სულ</td>
                  <td className="py-2 pr-3 text-right text-emerald-400">{formatMoney(totals.revenue)}</td>
                  <td />
                  <td className="py-2 text-right text-violet-400">{formatMoney(totals.bonus)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {view === "employees" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          {employeeRows.length === 0 ? (
            <p className="text-sm text-zinc-500">მონაცემები არ არის</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pr-3">მომზიდავი</th>
                  <th className="pb-2 pr-3 text-right">გაყიდვა</th>
                  <th className="pb-2 pr-3 text-right">ახალი</th>
                  <th className="pb-2 pr-3 text-right">ძველი</th>
                  <th className="pb-2 pr-3 text-right">შემოსავალი</th>
                  <th className="pb-2 pr-3 text-right">ახალი ₾</th>
                  <th className="pb-2 pr-3 text-right">ძველი ₾</th>
                  <th className="pb-2 text-right">ბონუსი</th>
                </tr>
              </thead>
              <tbody>
                {employeeRows.map((r) => (
                  <tr key={r.employeeName} className="border-b border-zinc-800/50">
                    <td className="py-2 pr-3 font-medium text-violet-300">{r.employeeName}</td>
                    <td className="py-2 pr-3 text-right">{r.salesCount}</td>
                    <td className="py-2 pr-3 text-right text-emerald-400">{r.newCount}</td>
                    <td className="py-2 pr-3 text-right text-amber-400">{r.oldCount}</td>
                    <td className="py-2 pr-3 text-right text-emerald-400">{formatMoney(r.totalAmount)}</td>
                    <td className="py-2 pr-3 text-right">{formatMoney(r.newAmount)}</td>
                    <td className="py-2 pr-3 text-right">{formatMoney(r.oldAmount)}</td>
                    <td className="py-2 text-right font-semibold text-violet-400">{formatMoney(r.totalBonus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {view === "clients" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          {clientRows.length === 0 ? (
            <p className="text-sm text-zinc-500">მონაცემები არ არის</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pr-3">კლიენტი</th>
                  <th className="pb-2 pr-3">სტატუსი</th>
                  <th className="pb-2 pr-3">მომზიდავი</th>
                  <th className="pb-2 pr-3 text-right">დღეები</th>
                  <th className="pb-2 pr-3 text-right">გაყიდვა</th>
                  <th className="pb-2 pr-3 text-right">თვეში ჯამი</th>
                  <th className="pb-2 text-right">ბონუსი</th>
                </tr>
              </thead>
              <tbody>
                {clientRows.map((r) => (
                  <tr key={`${r.clientKey}-${r.employeeName}`} className="border-b border-zinc-800/50">
                    <td className="py-2 pr-3 font-medium">{r.clientName}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded px-2 py-0.5 text-xs ${r.isLegacy ? "bg-amber-950/50 text-amber-300" : "bg-emerald-950/50 text-emerald-300"}`}>
                        {r.clientStatus}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-violet-300">{r.employeeName}</td>
                    <td className="py-2 pr-3 text-right">{r.saleDays}</td>
                    <td className="py-2 pr-3 text-right">{r.salesCount}</td>
                    <td className="py-2 pr-3 text-right text-emerald-400">{formatMoney(r.totalAmount)}</td>
                    <td className="py-2 text-right text-violet-400">{formatMoney(r.totalBonus)}</td>
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
