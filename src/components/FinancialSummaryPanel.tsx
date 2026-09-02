"use client";

import { useCallback, useEffect, useState } from "react";
import type { Branch, FinancialSummaryRow } from "@/lib/types";
import { BRANCHES } from "@/lib/dashboard-data";
import { REPORT_HISTORY_MONTHS } from "@/lib/report-config";
import { formatMoney, monthStartEnd } from "@/lib/utils";
import type { FlowBranchScope, FlowDetailKind } from "@/lib/flow-detail";
import type { FlowDrillState } from "@/components/FlowDrillDown";

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

type Mode = "month" | "period" | "months";

type Props = {
  refreshSignal?: number;
  onDrillToggle?: (state: FlowDrillState) => void;
};

export default function FinancialSummaryPanel({ refreshSignal = 0, onDrillToggle }: Props) {
  const [mode, setMode] = useState<Mode>("month");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [from, setFrom] = useState(() => monthStartEnd().from);
  const [to, setTo] = useState(() => monthStartEnd().to);
  const [monthCount, setMonthCount] = useState(REPORT_HISTORY_MONTHS);
  const [rows, setRows] = useState<FinancialSummaryRow[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      if (mode === "months") {
        const res = await fetch(`/api/reports?mode=months&count=${monthCount}`, { cache: "no-store" });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        const items = (data.months ?? []).map(
          (m: {
            month: string;
            revenue: number;
            expenses: number;
            deposits: number;
            founderDeposits: number;
            net: number;
            cashFlowNet: number;
            byBranch: FinancialSummaryRow["byBranch"];
          }) => ({
            month: m.month,
            from: `${m.month}-01`,
            to: monthStartEnd(m.month).to,
            revenue: m.revenue,
            expenses: m.expenses,
            deposits: m.deposits ?? 0,
            founderDeposits: m.founderDeposits ?? 0,
            otherDeposits: (m.deposits ?? 0) - (m.founderDeposits ?? 0),
            net: m.net,
            cashFlowNet: m.cashFlowNet ?? m.net + (m.deposits ?? 0),
            byBranch: m.byBranch,
          })
        );
        setRows(items);
        return;
      }

      let loadFrom = from;
      let loadTo = to;
      if (mode === "month") {
        const range = monthStartEnd(month);
        loadFrom = range.from;
        loadTo = range.to;
      }

      const res = await fetch(
        `/api/reports?from=${loadFrom}&to=${loadTo}&branch=${encodeURIComponent("ყველა")}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRows([
        {
          month: mode === "month" ? month : undefined,
          from: data.from,
          to: data.to,
          revenue: data.revenue,
          expenses: data.expenses,
          deposits: data.deposits ?? 0,
          founderDeposits: data.founderDeposits ?? 0,
          otherDeposits: (data.deposits ?? 0) - (data.founderDeposits ?? 0),
          net: data.net,
          cashFlowNet: data.cashFlowNet ?? data.net + (data.deposits ?? 0),
          byBranch: data.byBranch,
        },
      ]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }, [mode, month, from, to, monthCount]);

  useEffect(() => {
    if (refreshSignal === 0 || rows.length === 0) return;
    load();
  }, [refreshSignal, load, rows.length]);

  function exportExcel() {
    if (mode === "months") {
      window.open(`/api/reports/summary-export?mode=months&count=${monthCount}`, "_blank", "noopener,noreferrer");
      return;
    }
    let loadFrom = from;
    let loadTo = to;
    if (mode === "month") {
      const range = monthStartEnd(month);
      loadFrom = range.from;
      loadTo = range.to;
    }
    window.open(
      `/api/reports/summary-export?mode=period&from=${loadFrom}&to=${loadTo}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function periodLabel(r: FinancialSummaryRow) {
    return r.month ?? (r.from === r.to ? r.from : `${r.from} — ${r.to}`);
  }

  function openDrill(kind: FlowDetailKind, scope: FlowBranchScope, row: FinancialSummaryRow) {
    onDrillToggle?.({
      kind,
      scope,
      from: row.from,
      to: row.to,
      rangeLabel: periodLabel(row),
    });
  }

  return (
    <div className="rounded-xl border border-teal-900/40 bg-teal-950/20 p-5">
      <h2 className="mb-1 font-semibold text-teal-200">ფინანსური ანგარიში — თვე / პერიოდი</h2>
      <p className="mb-4 text-xs text-zinc-500">
        შემოსავალი (გაყიდვები), დამფუძნებლის შენატანი (Excel „მიღება“), ხარჯი — ფილიალებით. Excel ექსპორტი.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["month", "თვე"],
            ["period", "პერიოდი"],
            ["months", "ბოლო N თვე"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm ${
              mode === id ? "bg-teal-700 text-white" : "border border-zinc-700 text-zinc-400"
            }`}
            onClick={() => setMode(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {mode === "month" && (
          <Field label="თვე">
            <input type="month" className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
        )}
        {mode === "period" && (
          <>
            <Field label="დან">
              <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="მდე">
              <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </>
        )}
        {mode === "months" && (
          <Field label="თვეების რაოდენობა">
            <input
              type="number"
              min={1}
              max={24}
              className={inputCls}
              value={monthCount}
              onChange={(e) => setMonthCount(Math.min(24, Math.max(1, parseInt(e.target.value, 10) || REPORT_HISTORY_MONTHS)))}
            />
          </Field>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className={btnCls} disabled={busy} onClick={load}>
          {busy ? "..." : "ანგარიში"}
        </button>
        <button type="button" className={`${btnCls} bg-teal-700 hover:bg-teal-600`} disabled={!rows.length} onClick={exportExcel}>
          Excel ჩამოტვირთვა
        </button>
      </div>

      {err && <p className="mb-3 text-sm text-red-400">{err}</p>}

      {rows.length > 0 && (
        <div className="space-y-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pr-3">პერიოდი</th>
                  <th className="pb-2 pr-3 text-right">შემოსავალი</th>
                  <th className="pb-2 pr-3 text-right">დამფ. შენატანი</th>
                  <th className="pb-2 pr-3 text-right">სხვა შენატანი</th>
                  <th className="pb-2 pr-3 text-right">ხარჯი</th>
                  <th className="pb-2 pr-3 text-right">ოპ. ნეტო</th>
                  <th className="pb-2 text-right">სალარო ნეტო</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={periodLabel(r)} className="border-b border-zinc-800/50">
                    <td className="py-2 pr-3 font-medium">{periodLabel(r)}</td>
                    <td className="py-2 pr-3 text-right">
                      {onDrillToggle ? (
                        <button
                          type="button"
                          className="text-emerald-400 hover:underline"
                          onClick={() => openDrill("revenue", "ყველა", r)}
                        >
                          {formatMoney(r.revenue)}
                        </button>
                      ) : (
                        <span className="text-emerald-400">{formatMoney(r.revenue)}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right text-sky-400">{formatMoney(r.founderDeposits)}</td>
                    <td className="py-2 pr-3 text-right text-sky-300/70">{formatMoney(r.otherDeposits)}</td>
                    <td className="py-2 pr-3 text-right">
                      {onDrillToggle ? (
                        <button
                          type="button"
                          className="text-red-400 hover:underline"
                          onClick={() => openDrill("expense", "ყველა", r)}
                        >
                          {formatMoney(r.expenses)}
                        </button>
                      ) : (
                        <span className="text-red-400">{formatMoney(r.expenses)}</span>
                      )}
                    </td>
                    <td className={`py-2 pr-3 text-right ${r.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {formatMoney(r.net)}
                    </td>
                    <td className={`py-2 text-right font-medium ${r.cashFlowNet >= 0 ? "text-teal-300" : "text-red-400"}`}>
                      {formatMoney(r.cashFlowNet)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length === 1 && (
            <div className="overflow-x-auto">
              <h3 className="mb-2 text-sm font-semibold text-zinc-300">ფილიალებით — {periodLabel(rows[0])}</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                    <th className="pb-2 pr-3">ფილიალი</th>
                    <th className="pb-2 pr-3 text-right">შემოსავალი</th>
                    <th className="pb-2 pr-3 text-right">დამფ. შენატანი</th>
                    <th className="pb-2 pr-3 text-right">ხარჯი</th>
                    <th className="pb-2 pr-3 text-right">ოპ. ნეტო</th>
                    <th className="pb-2 text-right">სალარო ნეტო</th>
                  </tr>
                </thead>
                <tbody>
                  {rows[0].byBranch.map((b) => (
                    <tr key={b.branch} className="border-b border-zinc-800/50">
                      <td className="py-2 pr-3 font-medium">{b.branch}</td>
                      <td className="py-2 pr-3 text-right">
                        {onDrillToggle ? (
                          <button
                            type="button"
                            className="text-emerald-400 hover:underline"
                            onClick={() => openDrill("revenue", b.branch as Branch, rows[0])}
                          >
                            {formatMoney(b.revenue)}
                          </button>
                        ) : (
                          <span className="text-emerald-400">{formatMoney(b.revenue)}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right text-sky-400">{formatMoney(b.founderDeposits)}</td>
                      <td className="py-2 pr-3 text-right">
                        {onDrillToggle ? (
                          <button
                            type="button"
                            className="text-red-400 hover:underline"
                            onClick={() => openDrill("expense", b.branch as Branch, rows[0])}
                          >
                            {formatMoney(b.expenses)}
                          </button>
                        ) : (
                          <span className="text-red-400">{formatMoney(b.expenses)}</span>
                        )}
                      </td>
                      <td className={`py-2 pr-3 text-right ${b.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {formatMoney(b.net)}
                      </td>
                      <td className={`py-2 text-right ${b.cashFlowNet >= 0 ? "text-teal-300" : "text-red-400"}`}>
                        {formatMoney(b.cashFlowNet)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > 1 && (
            <div className="overflow-x-auto">
              <h3 className="mb-2 text-sm font-semibold text-zinc-300">ფილიალები — ნეტო თვეებით</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-zinc-500">
                    <th className="pb-2 pr-2">თვე</th>
                    {BRANCHES.map((b) => (
                      <th key={b} className="pb-2 pr-2 text-right">
                        {b}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={periodLabel(r)} className="border-b border-zinc-800/50">
                      <td className="py-2 pr-2 font-medium">{periodLabel(r)}</td>
                      {BRANCHES.map((br) => {
                        const b = r.byBranch.find((x) => x.branch === br);
                        return (
                          <td key={br} className="py-2 pr-2 text-right text-zinc-300">
                            {b ? (
                              <div>
                                <div>{formatMoney(b.net)}</div>
                                {b.founderDeposits > 0 && (
                                  <div className="text-sky-400/80">+{formatMoney(b.founderDeposits)}</div>
                                )}
                                {b.expenses > 0 && (
                                  <button
                                    type="button"
                                    className="block w-full text-right text-red-400/80 hover:underline"
                                    onClick={() => onDrillToggle?.({
                                      kind: "expense",
                                      scope: br,
                                      from: r.from,
                                      to: r.to,
                                      rangeLabel: periodLabel(r),
                                    })}
                                  >
                                    −{formatMoney(b.expenses)}
                                  </button>
                                )}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
