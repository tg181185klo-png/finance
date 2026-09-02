"use client";

import { useState } from "react";
import type { Branch, PeriodReport } from "@/lib/types";
import { REPORT_HISTORY_MONTHS } from "@/lib/report-config";
import type { ReportSnapshotMeta } from "@/lib/report-snapshots";
import { monthStartEnd } from "@/lib/utils";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-indigo-500";
const labelCls = "mb-1 block text-xs text-zinc-400";
const btnCls =
  "rounded-lg bg-indigo-700 px-3 py-2 text-sm font-medium hover:bg-indigo-600 disabled:opacity-40";
const cardCls = "rounded-xl border border-zinc-800 bg-zinc-900/50 p-4";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

type Props = {
  report: PeriodReport | null;
  repFrom: string;
  repTo: string;
  repBranch: Branch | "ყველა";
  canSaveSnapshots: boolean;
  snapshotBusy: boolean;
  snapshotTitle: string;
  onSnapshotTitleChange: (v: string) => void;
  onSaveSnapshot: () => void;
  snapshots: ReportSnapshotMeta[];
  onViewSnapshot: (id: string) => void;
  onDeleteSnapshot: (id: string) => void;
  onRefreshSnapshots: () => void;
};

export default function ReportsExportHub({
  report,
  repFrom,
  repTo,
  repBranch,
  canSaveSnapshots,
  snapshotBusy,
  snapshotTitle,
  onSnapshotTitleChange,
  onSaveSnapshot,
  snapshots,
  onViewSnapshot,
  onDeleteSnapshot,
  onRefreshSnapshots,
}: Props) {
  const [finMonth, setFinMonth] = useState(() => monthStartEnd().from.slice(0, 7));
  const [finFrom, setFinFrom] = useState(repFrom);
  const [finTo, setFinTo] = useState(repTo);
  const [finMode, setFinMode] = useState<"month" | "period">("month");
  const [monthCount, setMonthCount] = useState(REPORT_HISTORY_MONTHS);

  function exportPeriod() {
    const from = report?.from ?? repFrom;
    const to = report?.to ?? repTo;
    const branch = report?.branch ?? repBranch;
    window.open(
      `/api/reports/export?from=${from}&to=${to}&branch=${encodeURIComponent(branch)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function exportFinancial() {
    if (finMode === "month") {
      const { from, to } = monthStartEnd(finMonth);
      window.open(
        `/api/reports/summary-export?mode=period&from=${from}&to=${to}`,
        "_blank",
        "noopener,noreferrer"
      );
      return;
    }
    window.open(
      `/api/reports/summary-export?mode=period&from=${finFrom}&to=${finTo}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function exportFinancialMonths() {
    window.open(
      `/api/reports/summary-export?mode=months&count=${monthCount}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  return (
    <section className="rounded-xl border border-indigo-900/50 bg-indigo-950/20 p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-indigo-200">რეპორტების ცენტრი — ყველა ექსპორტი</h2>
        <p className="text-xs text-zinc-500">
          ერთ ადგილას: პერიოდის ანგარიში, ფინანსური შეჯამება, კლიენტები, თანამშრომლები, ბაზაში შენახვა
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <div className={cardCls}>
          <h3 className="mb-2 font-semibold text-emerald-300">პერიოდის ანგარიში (Excel)</h3>
          <p className="mb-3 text-xs text-zinc-500">
            შემოსავალი, ხარჯი, ფილიალები, ტრანზაქციები, ფილიალის რეპორტები
          </p>
          <p className="mb-3 text-xs text-zinc-400">
            {repFrom === repTo ? repFrom : `${repFrom} — ${repTo}`} · {repBranch}
          </p>
          <button type="button" className={btnCls} onClick={exportPeriod}>
            ↓ Excel ჩამოტვირთვა
          </button>
        </div>

        <div className={cardCls}>
          <h3 className="mb-2 font-semibold text-teal-300">ფინანსური შეჯამება (Excel)</h3>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={`rounded px-2 py-1 text-xs ${finMode === "month" ? "bg-teal-700 text-white" : "border border-zinc-700 text-zinc-400"}`}
              onClick={() => setFinMode("month")}
            >
              თვე
            </button>
            <button
              type="button"
              className={`rounded px-2 py-1 text-xs ${finMode === "period" ? "bg-teal-700 text-white" : "border border-zinc-700 text-zinc-400"}`}
              onClick={() => setFinMode("period")}
            >
              პერიოდი
            </button>
          </div>
          {finMode === "month" ? (
            <Field label="თვე">
              <input type="month" className={inputCls} value={finMonth} onChange={(e) => setFinMonth(e.target.value)} />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Field label="დან">
                <input type="date" className={inputCls} value={finFrom} onChange={(e) => setFinFrom(e.target.value)} />
              </Field>
              <Field label="მდე">
                <input type="date" className={inputCls} value={finTo} onChange={(e) => setFinTo(e.target.value)} />
              </Field>
            </div>
          )}
          <button type="button" className={`${btnCls} mt-3 bg-teal-700 hover:bg-teal-600`} onClick={exportFinancial}>
            ↓ Excel ჩამოტვირთვა
          </button>
          <div className="mt-3 border-t border-zinc-800 pt-3">
            <Field label="ბოლო N თვე (max 24)">
              <input
                type="number"
                min={1}
                max={24}
                className={inputCls}
                value={monthCount}
                onChange={(e) => setMonthCount(Math.min(24, Math.max(1, parseInt(e.target.value, 10) || 12)))}
              />
            </Field>
            <button type="button" className={`${btnCls} mt-2 bg-teal-800 hover:bg-teal-700`} onClick={exportFinancialMonths}>
              ↓ Excel — ბოლო {monthCount} თვე
            </button>
          </div>
        </div>

        <div className={cardCls}>
          <h3 className="mb-2 font-semibold text-sky-300">კლიენტების რეესტრი</h3>
          <p className="mb-3 text-xs text-zinc-500">ყველა კლიენტი — ფიზიკური და იურიდიული</p>
          <a href="/api/clients/export" className={`${btnCls} inline-block bg-sky-700 hover:bg-sky-600`}>
            ↓ Excel ჩამოტვირთვა
          </a>
        </div>

        <div className={cardCls}>
          <h3 className="mb-2 font-semibold text-violet-300">თანამშრომლები</h3>
          <p className="mb-3 text-xs text-zinc-500">თანამშრომლების სია და ხელფასები</p>
          <a href="/api/employees/export" className={`${btnCls} inline-block bg-violet-700 hover:bg-violet-600`}>
            ↓ Excel ჩამოტვირთვა
          </a>
        </div>

        <div className={`${cardCls} lg:col-span-2`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-indigo-300">შენახვა ბაზაში (უსაფრთხო)</h3>
            <button type="button" className="text-xs text-indigo-400 hover:text-indigo-300" onClick={onRefreshSnapshots}>
              განახლება
            </button>
          </div>
          {!canSaveSnapshots ? (
            <p className="text-sm text-amber-400">POSTGRES_URL საჭიროა რეპორტის შესანახად</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-end gap-3">
                <Field label="სახელი (არასავალდებულო)">
                  <input
                    className={inputCls}
                    value={snapshotTitle}
                    onChange={(e) => onSnapshotTitleChange(e.target.value)}
                    placeholder={report ? `${report.from} — ${report.to} · ${report.branch}` : "რეპორტის სახელი"}
                  />
                </Field>
                <button
                  type="button"
                  className={btnCls}
                  disabled={!report || snapshotBusy}
                  onClick={onSaveSnapshot}
                >
                  {snapshotBusy ? "ინახება..." : "შენახვა ბაზაში"}
                </button>
              </div>
              {snapshots.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded border border-zinc-800 bg-zinc-950/40 text-xs">
                  {snapshots.slice(0, 8).map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 border-b border-zinc-800/50 px-3 py-2">
                      <span className="truncate text-zinc-300">{s.title}</span>
                      <span className="shrink-0 text-zinc-500">{s.fromDate}</span>
                      <button type="button" className="text-indigo-400" onClick={() => onViewSnapshot(s.id)}>
                        ნახვა
                      </button>
                      <button type="button" className="text-red-400" onClick={() => onDeleteSnapshot(s.id)}>
                        წაშლა
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
