"use client";

import { useCallback, useEffect, useState } from "react";
import type { Branch, Employee, PeriodReport, Transaction, TxRecurrence } from "@/lib/types";
import { BRANCHES, TX_RECURRENCE } from "@/lib/dashboard-data";
import ImportSalesPanel from "@/components/ImportSalesPanel";
import ImportExpensesPanel from "@/components/ImportExpensesPanel";
import FinancialSummaryPanel from "@/components/FinancialSummaryPanel";
import DistribuciaSyncPanel from "@/components/DistribuciaSyncPanel";
import type { ResolvedPeriod } from "@/lib/period-filter";
import { formatDate, formatMoney, monthStartEnd, txRecurrence } from "@/lib/utils";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-emerald-500";
const labelCls = "mb-1 block text-xs text-zinc-400";
const btnCls = "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${accent ?? ""}`}>{value}</p>
    </div>
  );
}

function MiniReport({ title, report }: { title: string; report: PeriodReport | null }) {
  if (!report) return null;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <h3 className="mb-3 font-semibold text-zinc-200">{title}</h3>
      <div className="grid gap-2 sm:grid-cols-3">
        <Stat label="შემოსავალი" value={formatMoney(report.revenue)} accent="text-emerald-400" />
        <Stat label="ხარჯი" value={formatMoney(report.expenses)} accent="text-red-400" />
        <Stat
          label="მოგება/ზარალი"
          value={formatMoney(report.net)}
          accent={report.net >= 0 ? "text-emerald-400" : "text-red-400"}
        />
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        ქეში თვის ბოლოს: <span className="text-emerald-400">{formatMoney(report.cashAtEnd)}</span>
      </p>
    </div>
  );
}

type MonthBranchStat = {
  branch: Branch;
  revenue: number;
  expenses: number;
  deposits: number;
  founderDeposits: number;
  net: number;
  cashFlowNet: number;
};

type MonthHistoryRow = {
  month: string;
  revenue: number;
  expenses: number;
  deposits: number;
  founderDeposits: number;
  net: number;
  cashFlowNet: number;
  byBranch: MonthBranchStat[];
};

function BranchMonthCell({ br }: { br?: MonthBranchStat }) {
  if (!br) return <span className="text-zinc-600">—</span>;
  const hasExtra = br.expenses > 0 || br.founderDeposits > 0;
  return (
    <div className="min-w-[4.5rem] space-y-0.5">
      <div className={`font-medium ${br.net >= 0 ? "text-zinc-200" : "text-red-400"}`}>{formatMoney(br.net)}</div>
      {hasExtra && (
        <>
          {br.founderDeposits > 0 && (
            <div className="text-[10px] leading-tight text-sky-400">+{formatMoney(br.founderDeposits)}</div>
          )}
          {br.expenses > 0 && (
            <div className="text-[10px] leading-tight text-red-400">−{formatMoney(br.expenses)}</div>
          )}
        </>
      )}
    </div>
  );
}

type Props = {
  employees: Employee[];
  period: ResolvedPeriod;
  unlocked: boolean;
  getAdminPin: () => string;
  onTransactionsUpdate: () => void | Promise<void>;
};

export default function ReportsPanel({ employees, period, unlocked, getAdminPin, onTransactionsUpdate }: Props) {
  const [report, setReport] = useState<PeriodReport | null>(null);
  const [monthBranchReport, setMonthBranchReport] = useState<PeriodReport | null>(null);
  const [monthCompanyReport, setMonthCompanyReport] = useState<PeriodReport | null>(null);
  const [repFrom, setRepFrom] = useState(() => monthStartEnd().from);
  const [repTo, setRepTo] = useState(() => monthStartEnd().to);
  const [repBranch, setRepBranch] = useState<Branch | "ყველა">("ყველა");
  const [monthBranch, setMonthBranch] = useState<Branch>("დიღომი");
  const [history, setHistory] = useState<MonthHistoryRow[]>([]);
  const [summaryRefresh, setSummaryRefresh] = useState(0);
  const [err, setErr] = useState("");

  const loadReport = useCallback(async (mode: string, from?: string, to?: string, branch?: Branch | "ყველა") => {
    const b = branch ?? repBranch;
    let url = `/api/reports?mode=${mode}&branch=${encodeURIComponent(b)}`;
    if (from && to) url += `&from=${from}&to=${to}`;
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    if (data.error) {
      setErr(data.error);
      return null;
    }
    setErr("");
    return data as PeriodReport;
  }, [repBranch]);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/reports?mode=months&count=6", { cache: "no-store" });
    const data = await res.json();
    if (data.error) {
      setErr(data.error);
      return;
    }
    setHistory(data.months ?? []);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const loadMonthlySnapshots = useCallback(async () => {
    const [company, branch] = await Promise.all([
      loadReport("month", undefined, undefined, "ყველა"),
      loadReport("month", undefined, undefined, monthBranch),
    ]);
    setMonthCompanyReport(company);
    setMonthBranchReport(branch);
  }, [loadReport, monthBranch]);

  useEffect(() => {
    loadMonthlySnapshots();
  }, [loadMonthlySnapshots]);

  const refreshAllReports = useCallback(async () => {
    const [periodData] = await Promise.all([
      loadReport("period", period.from, period.to),
      loadHistory(),
      loadMonthlySnapshots(),
    ]);
    if (periodData) setReport(periodData);
    setSummaryRefresh((n) => n + 1);
  }, [loadHistory, loadMonthlySnapshots, loadReport, period.from, period.to]);

  const handleImportComplete = useCallback(async () => {
    await onTransactionsUpdate();
    await refreshAllReports();
  }, [onTransactionsUpdate, refreshAllReports]);

  useEffect(() => {
    setRepFrom(period.from);
    setRepTo(period.to);
    loadReport("period", period.from, period.to).then((data) => {
      if (data) setReport(data);
    });
  }, [period.from, period.to, loadReport]);

  async function runReport(mode: string, from?: string, to?: string) {
    const data = await loadReport(mode, from, to);
    if (data) setReport(data);
  }

  function exportExcel(r: PeriodReport) {
    const b = encodeURIComponent(r.branch);
    window.open(`/api/reports/export?from=${r.from}&to=${r.to}&branch=${b}`, "_blank", "noopener,noreferrer");
  }

  async function setRecurrence(txId: string, recurrence: TxRecurrence) {
    if (!unlocked) {
      setErr("PIN-ით შესვლა საჭიროა");
      return;
    }
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateRecurrence",
          id: txId,
          recurrence,
          pin: getAdminPin(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "შეცდომა");
      await onTransactionsUpdate();
      await refreshAllReports();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    }
  }

  function txLabel(t: Transaction) {
    if (t.type === "sale") {
      const emp = t.employeeName ? ` (${t.employeeName})` : "";
      return `${t.productName} × ${t.quantity}${emp}`;
    }
    if (t.type === "deposit") {
      return t.kind === "founder" ? "დამფუძნებლის შენატანი" : "შენატანი";
    }
    return t.category;
  }

  const { from: monthFrom, to: monthTo } = monthStartEnd();

  return (
    <section className="space-y-6">
      <DistribuciaSyncPanel
        unlocked={unlocked}
        getAdminPin={getAdminPin}
        onSynced={handleImportComplete}
      />

      <ImportSalesPanel
        employees={employees}
        unlocked={unlocked}
        getAdminPin={getAdminPin}
        onImported={handleImportComplete}
      />

      <ImportExpensesPanel
        unlocked={unlocked}
        getAdminPin={getAdminPin}
        onImported={handleImportComplete}
      />

      <FinancialSummaryPanel refreshSignal={summaryRefresh} />

      {history.length > 0 && (
        <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/15 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-emerald-200">ბოლო 6 თვე — კომპანია</h2>
            <button type="button" className={btnCls} onClick={loadHistory}>განახლება</button>
          </div>
          <p className="mb-3 text-xs text-zinc-500">
            ფილიალის სვეტებში: <span className="text-zinc-300">ოპ. ნეტო</span> (გაყიდვა − ხარჯი).
            ხარჯის/შენატანის ქვემოთ — <span className="text-sky-400">+დამფ. შენატანი</span>,{" "}
            <span className="text-red-400">−ხარჯი</span>.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pr-3">თვე</th>
                  <th className="pb-2 pr-3 text-right">შემოსავალი</th>
                  <th className="pb-2 pr-2 text-right text-sky-400/80">დამფ. შენატანი</th>
                  <th className="pb-2 pr-3 text-right">ხარჯი</th>
                  <th className="pb-2 pr-3 text-right">ოპ. ნეტო</th>
                  <th className="pb-2 pr-3 text-right">სალარო ნეტო</th>
                  {BRANCHES.map((b) => (
                    <th key={b} className="pb-2 pr-2 text-right text-[10px]">
                      {b}
                      <br />
                      <span className="text-zinc-600">ნეტო / ±</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((row) => {
                  const branchExpenseSum = row.byBranch.reduce((s, b) => s + b.expenses, 0);
                  return (
                  <tr key={row.month} className="border-b border-zinc-800/50">
                    <td className="py-2 pr-3 font-medium">{row.month}</td>
                    <td className="py-2 pr-3 text-right text-emerald-400">{formatMoney(row.revenue)}</td>
                    <td className="py-2 pr-2 text-right text-sky-400">{formatMoney(row.founderDeposits ?? 0)}</td>
                    <td
                      className="py-2 pr-3 text-right text-red-400"
                      title={
                        branchExpenseSum > 0
                          ? BRANCHES.map((b) => {
                              const br = row.byBranch.find((x) => x.branch === b);
                              return br?.expenses ? `${b}: ${formatMoney(br.expenses)}` : null;
                            })
                              .filter(Boolean)
                              .join(" · ")
                          : undefined
                      }
                    >
                      {formatMoney(row.expenses)}
                    </td>
                    <td className={`py-2 pr-3 text-right ${row.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {formatMoney(row.net)}
                    </td>
                    <td
                      className={`py-2 pr-3 text-right ${(row.cashFlowNet ?? row.net) >= 0 ? "text-teal-300" : "text-red-400"}`}
                    >
                      {formatMoney(row.cashFlowNet ?? row.net + (row.deposits ?? 0))}
                    </td>
                    {BRANCHES.map((b) => {
                      const br = row.byBranch.find((x) => x.branch === b);
                      return (
                        <td key={b} className="py-2 pr-2 text-right align-top">
                          <BranchMonthCell br={br} />
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-violet-900/40 bg-violet-950/20 p-4">
        <h2 className="mb-1 font-semibold text-violet-200">პერიოდის ანგარიში</h2>
        <p className="mb-4 text-xs text-zinc-500">
          ნაგულისხმევი: ზემოთ არჩეული პერიოდი ({period.label}). შეცვალეთ თარიღები ქვემოთ სხვა პერიოდისთვის.
        </p>
      </div>

      <div className="rounded-xl border border-violet-900/40 bg-violet-950/20 p-4">
        <h2 className="mb-1 font-semibold text-violet-200">თვის ჭრილი — სწრაფი ხედი</h2>
        <p className="mb-4 text-xs text-zinc-500">
          {monthFrom} — {monthTo}
        </p>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Field label="ფილიალი (მარცხენა პანელი)">
            <select
              className={`${inputCls} w-auto min-w-[140px]`}
              value={monthBranch}
              onChange={(e) => setMonthBranch(e.target.value as Branch)}
            >
              {BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
          <button type="button" className={btnCls} onClick={loadMonthlySnapshots}>
            განახლება
          </button>
          {monthCompanyReport && (
            <button type="button" className={btnCls} onClick={() => exportExcel(monthCompanyReport)}>
              Excel — კომპანია (თვე)
            </button>
          )}
          {monthBranchReport && (
            <button type="button" className={btnCls} onClick={() => exportExcel(monthBranchReport)}>
              Excel — {monthBranch} (თვე)
            </button>
          )}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <MiniReport title={`კომპანია — ${monthFrom} / ${monthTo}`} report={monthCompanyReport} />
          <MiniReport title={`${monthBranch} — ${monthFrom} / ${monthTo}`} report={monthBranchReport} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnCls} onClick={() => runReport("today")}>
          დღევანდელი
        </button>
        <button type="button" className={btnCls} onClick={() => runReport("month")}>
          მიმდინარე თვე
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 p-4">
        <Field label="დან">
          <input type="date" className={inputCls} value={repFrom} onChange={(e) => setRepFrom(e.target.value)} />
        </Field>
        <Field label="მდე">
          <input type="date" className={inputCls} value={repTo} onChange={(e) => setRepTo(e.target.value)} />
        </Field>
        <Field label="ფილიალი">
          <select
            className={inputCls}
            value={repBranch}
            onChange={(e) => setRepBranch(e.target.value as Branch | "ყველა")}
          >
            <option value="ყველა">ყველა (კომპანია)</option>
            {BRANCHES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="button"
          className={btnCls}
          disabled={!repFrom || !repTo}
          onClick={() => runReport("period", repFrom, repTo)}
        >
          პერიოდი
        </button>
        {report && (
          <button type="button" className={btnCls} onClick={() => exportExcel(report)}>
            Excel-ში ჩამოტვირთვა
          </button>
        )}
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}

      {report && (
        <>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">
                {report.from === report.to ? report.from : `${report.from} — ${report.to}`} · {report.branch}
              </h3>
              <button type="button" className="text-sm text-emerald-400 hover:text-emerald-300" onClick={() => exportExcel(report)}>
                ↓ Excel
              </button>
            </div>
            <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="შემოსავალი" value={formatMoney(report.revenue)} accent="text-emerald-400" />
              <Stat label="ხარჯები" value={formatMoney(report.expenses)} accent="text-red-400" />
              <Stat
                label="მოგება / ზარალი"
                value={formatMoney(report.net)}
                accent={report.net >= 0 ? "text-emerald-400" : "text-red-400"}
              />
              <Stat label="ქეში (პერიოდის ბოლოს)" value={formatMoney(report.cashAtEnd)} accent="text-emerald-300" />
            </div>

            <div className="mb-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                <h4 className="mb-2 text-sm font-semibold text-zinc-300">ყოველთვიური</h4>
                <p className="text-sm">
                  შემოსავალი: <span className="text-emerald-400">{formatMoney(report.recurring.revenue)}</span>
                </p>
                <p className="text-sm">
                  ხარჯი: <span className="text-red-400">{formatMoney(report.recurring.expenses)}</span>
                </p>
                <p className="text-sm font-medium">
                  ნეტო:{" "}
                  <span className={report.recurring.net >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {formatMoney(report.recurring.net)}
                  </span>
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                <h4 className="mb-2 text-sm font-semibold text-zinc-300">ერთჯერადი</h4>
                <p className="text-sm">
                  შემოსავალი: <span className="text-emerald-400">{formatMoney(report.oneTime.revenue)}</span>
                </p>
                <p className="text-sm">
                  ხარჯი: <span className="text-red-400">{formatMoney(report.oneTime.expenses)}</span>
                </p>
                <p className="text-sm font-medium">
                  ნეტო:{" "}
                  <span className={report.oneTime.net >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {formatMoney(report.oneTime.net)}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h4 className="mb-3 text-sm font-semibold text-zinc-300">ფილიალების შედარება</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                    <th className="pb-2 pr-4">ფილიალი</th>
                    <th className="pb-2 pr-4 text-right">შემოსავალი</th>
                    <th className="pb-2 pr-4 text-right">ხარჯი</th>
                    <th className="pb-2 pr-4 text-right">მოგება/ზარალი</th>
                    <th className="pb-2 text-right">ქეში (ბოლოს)</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byBranch.map((b) => (
                    <tr key={b.branch} className="border-b border-zinc-800/50">
                      <td className="py-2 pr-4 font-medium">{b.branch}</td>
                      <td className="py-2 pr-4 text-right text-emerald-400">{formatMoney(b.revenue)}</td>
                      <td className="py-2 pr-4 text-right text-red-400">{formatMoney(b.expenses)}</td>
                      <td className={`py-2 pr-4 text-right ${b.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {formatMoney(b.net)}
                      </td>
                      <td className="py-2 text-right text-emerald-300">{formatMoney(b.cashAtEnd)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 pr-4">კომპანია (ჯამი)</td>
                    <td className="py-2 pr-4 text-right text-emerald-400">
                      {formatMoney(report.byBranch.reduce((s, b) => s + b.revenue, 0))}
                    </td>
                    <td className="py-2 pr-4 text-right text-red-400">
                      {formatMoney(report.byBranch.reduce((s, b) => s + b.expenses, 0))}
                    </td>
                    <td className="py-2 pr-4 text-right text-emerald-400">
                      {formatMoney(report.byBranch.reduce((s, b) => s + b.net, 0))}
                    </td>
                    <td className="py-2 text-right text-emerald-300">
                      {formatMoney(report.byBranch.reduce((s, b) => s + b.cashAtEnd, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {report.days.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h4 className="mb-2 text-sm font-semibold text-zinc-300">დღეების შეჯამება + ქეში</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                      <th className="pb-2 pr-4">დღე</th>
                      <th className="pb-2 pr-4 text-right">შემოსავალი</th>
                      <th className="pb-2 pr-4 text-right">ხარჯი</th>
                      <th className="pb-2 pr-4 text-right">ნეტო</th>
                      {BRANCHES.map((b) => (
                        <th key={b} className="pb-2 pr-2 text-right text-[10px]">
                          {b}
                          <br />
                          ქეში
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.days.map((d) => (
                      <tr key={d.date} className="border-b border-zinc-800/50">
                        <td className="py-2 pr-4">{d.date}</td>
                        <td className="py-2 pr-4 text-right text-emerald-400">{formatMoney(d.revenue)}</td>
                        <td className="py-2 pr-4 text-right text-red-400">{formatMoney(d.expenses)}</td>
                        <td className={`py-2 pr-4 text-right ${d.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {formatMoney(d.net)}
                        </td>
                        {BRANCHES.map((b) => (
                          <td key={b} className="py-2 pr-2 text-right text-xs text-emerald-300/80">
                            {formatMoney(d.cashByBranch?.[b] ?? 0)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {report.transactions.length > 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <h4 className="mb-2 text-sm font-semibold text-zinc-300">
                ტრანზაქციები {unlocked ? "— დააკონფიგურირეთ ყოველთვიური/ერთჯერადი" : ""}
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                      <th className="pb-2 pr-3">დრო</th>
                      <th className="pb-2 pr-3">ფილიალი</th>
                      <th className="pb-2 pr-3">ტიპი</th>
                      <th className="pb-2 pr-3">აღწერა</th>
                      <th className="pb-2 pr-3">ტიპი*</th>
                      <th className="pb-2 text-right">თანხა</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.transactions.map((t) => (
                      <tr key={t.id} className="border-b border-zinc-800/50">
                        <td className="whitespace-nowrap py-2 pr-3 text-zinc-400">{formatDate(t.date)}</td>
                        <td className="py-2 pr-3">{t.branch}</td>
                        <td className={`py-2 pr-3 ${t.type === "sale" ? "text-emerald-400" : "text-red-400"}`}>
                          {t.type === "sale" ? "შემოსავალი" : "ხარჯი"}
                        </td>
                        <td className="py-2 pr-3">{txLabel(t)}</td>
                        <td className="py-2 pr-3">
                          {unlocked ? (
                            <select
                              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                              value={txRecurrence(t)}
                              onChange={(e) => setRecurrence(t.id, e.target.value as TxRecurrence)}
                            >
                              {TX_RECURRENCE.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-zinc-500">{txRecurrence(t)}</span>
                          )}
                        </td>
                        <td className={`py-2 text-right font-medium ${t.type === "sale" ? "text-emerald-400" : "text-red-400"}`}>
                          {t.type === "sale" ? "+" : "-"}
                          {formatMoney(t.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-zinc-600">* ყოველთვიური vs ერთჯერადი — მოგება-ზარალის ანგარიშისთვის</p>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">ამ პერიოდში ტრანზაქციები არ არის</p>
          )}
        </>
      )}
    </section>
  );
}
