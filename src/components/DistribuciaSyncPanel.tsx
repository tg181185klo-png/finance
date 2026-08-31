"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { formatMoney, currentMonth, monthStartEnd } from "@/lib/utils";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-emerald-500";
const labelCls = "mb-1 block text-xs text-zinc-400";
const btnCls = "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-40";

const APP_URL = "https://polimeri-distribucia.netlify.app";

type DayCustomer = {
  storeName: string;
  storePhone: string;
  orders: number;
  units: number;
  total: number;
};

type DayRow = {
  date: string;
  orders: number;
  customers: number;
  units: number;
  revenue: number;
  byCustomer: DayCustomer[];
};

type Preview = {
  fromDate: string;
  orders: number;
  lines: number;
  revenue: number;
  days: DayRow[];
};

type Props = {
  unlocked: boolean;
  getAdminPin: () => string;
  onSynced: () => void | Promise<void>;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

export default function DistribuciaSyncPanel({ unlocked, getAdminPin, onSynced }: Props) {
  const [fromDate, setFromDate] = useState("2026-03-01");
  const [viewMonth, setViewMonth] = useState(currentMonth());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const visibleDays = useMemo(() => {
    if (!preview?.days) return [];
    const { from, to } = monthStartEnd(viewMonth);
    return preview.days.filter((d) => d.date >= from && d.date <= to);
  }, [preview, viewMonth]);

  const loadPreview = useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/distribucia/sync?from=${encodeURIComponent(fromDate)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "შეცდომა");
      setPreview(data as Preview);
      setMsg(`ნაპოვნია ${data.orders} შეკვეთა · ${data.lines} ხაზი · ${formatMoney(data.revenue)}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }, [fromDate]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  async function runSync() {
    if (!unlocked) {
      setErr("სინქრონიზაციისთვის შეიყვანეთ ადმინ კოდი");
      return;
    }
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/distribucia/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: getAdminPin(), from: fromDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "შეცდომა");
      await onSynced();
      await loadPreview();
      setMsg(
        `სინქრონიზაცია ✓ ${data.imported} ხაზი · ${formatMoney(data.revenue)} · ${data.days} დღე${data.removed ? ` (ჩანაცვლდა ${data.removed})` : ""}`
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-violet-900/40 bg-violet-950/20 p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-violet-200">დისტრიბუცია — polimeri აპი</h2>
          <p className="mt-1 text-xs text-zinc-500">
            მონაცემები იღება{" "}
            <a href={APP_URL} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">
              polimeri-distribucia.netlify.app
            </a>
            -დან · დღიური შეკვეთები და მომხმარებლები
          </p>
        </div>
        <a
          href={APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-violet-800 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-950/50"
        >
          აპის გახსნა ↗
        </a>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="ისტორია დაწყებული (სინქრონიზაცია)">
          <input type="date" className={`${inputCls} w-auto`} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </Field>
        <Field label="ნახვის თვე">
          <input type="month" className={`${inputCls} w-auto`} value={viewMonth} onChange={(e) => setViewMonth(e.target.value)} />
        </Field>
        <button type="button" className={btnCls} disabled={busy} onClick={loadPreview}>
          განახლება
        </button>
        <button
          type="button"
          className={`${btnCls} bg-violet-600 hover:bg-violet-500`}
          disabled={busy || !unlocked}
          onClick={runSync}
        >
          სინქრონიზაცია Dashboard-ში
        </button>
      </div>

      {!unlocked && <p className="mb-2 text-xs text-amber-400">Dashboard-ში ჩამოსატვირთად საჭიროა ადმინ კოდი.</p>}
      {err && <p className="mb-2 text-sm text-red-400">{err}</p>}
      {msg && <p className="mb-2 text-sm text-emerald-400">{msg}</p>}

      {preview && visibleDays.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/40">
          <p className="border-b border-zinc-800 px-3 py-2 text-xs text-zinc-500">ნაჩვენები: {viewMonth}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                <th className="pb-2 pl-3 pr-3 pt-2">დღე</th>
                <th className="pb-2 pr-3 text-right">შეკვეთები</th>
                <th className="pb-2 pr-3 text-right">მომხმარებლები</th>
                <th className="pb-2 pr-3 text-right">ცალი</th>
                <th className="pb-2 pr-3 text-right">ჯამი</th>
                <th className="pb-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {visibleDays.map((day) => (
                <Fragment key={day.date}>
                  <tr className="border-b border-zinc-800/50 hover:bg-zinc-900/40">
                    <td className="py-2 pl-3 pr-3 font-medium">{day.date}</td>
                    <td className="py-2 pr-3 text-right">{day.orders}</td>
                    <td className="py-2 pr-3 text-right">{day.customers}</td>
                    <td className="py-2 pr-3 text-right text-zinc-400">{day.units}</td>
                    <td className="py-2 pr-3 text-right font-medium text-emerald-400">{formatMoney(day.revenue)}</td>
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        className="text-xs text-violet-400 hover:text-violet-300"
                        onClick={() => setExpandedDay(expandedDay === day.date ? null : day.date)}
                      >
                        {expandedDay === day.date ? "▲ დამალვა" : "▼ მომხმარებლები"}
                      </button>
                    </td>
                  </tr>
                  {expandedDay === day.date && (
                    <tr className="border-b border-zinc-800/50 bg-zinc-900/30">
                      <td colSpan={6} className="px-3 py-3">
                        <div className="space-y-1">
                          {day.byCustomer.map((c) => (
                            <div key={c.storeName + c.storePhone} className="flex flex-wrap justify-between gap-2 text-xs">
                              <span className="text-zinc-300">
                                {c.storeName}
                                {c.storePhone && <span className="text-zinc-500"> · {c.storePhone}</span>}
                              </span>
                              <span className="text-zinc-400">
                                {c.orders} შეკვ. · {c.units} ც · <span className="text-emerald-400">{formatMoney(c.total)}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview && visibleDays.length === 0 && (
        <p className="text-sm text-zinc-500">ამ თვეში შეკვეთები არ მოიძებნა — აირჩიეთ სხვა თვე ან განაახლეთ.</p>
      )}
    </div>
  );
}
