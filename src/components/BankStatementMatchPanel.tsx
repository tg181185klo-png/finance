"use client";

import { useRef, useState } from "react";
import type { BankStatementMatchResult, StatementMatchRow, AppUnmatchedRow } from "@/lib/bank-statement";
import { formatDate, formatMoney } from "@/lib/utils";

type ResultPayload = BankStatementMatchResult & {
  fileName?: string;
  marked?: number;
};

type Props = {
  onMarked?: () => void | Promise<void>;
};

const btnCls =
  "rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-medium hover:bg-violet-600 disabled:opacity-40";
const btnSec =
  "rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 disabled:opacity-40";

function statusLabel(status: StatementMatchRow["status"]) {
  if (status === "matched") return { text: "ჩაირიცხა ✓", cls: "text-emerald-400" };
  if (status === "unmatched") return { text: "აპში არ არის", cls: "text-amber-300" };
  return { text: "გამოტოვებული", cls: "text-zinc-500" };
}

export default function BankStatementMatchPanel({ onMarked }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState<ResultPayload | null>(null);

  async function upload(markReviewed: boolean) {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErr("აირჩიეთ ბანკის ამონაწერი (.xlsx)");
      return;
    }
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const form = new FormData();
      form.append("file", file);
      if (markReviewed) form.append("markReviewed", "true");
      const res = await fetch("/api/bank-statement/match", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "შეცდომა");
      setResult(data);
      if (markReviewed) {
        setMsg(`მონიშნულია აისახად: ${data.marked} ტრანზაქცია`);
        await onMarked?.();
      } else {
        setMsg(`შედარება მზადაა · ${data.fileName}`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  const creditMatches = (result?.matches ?? []).filter((m) => m.line.direction === "in");
  const appMissing = result?.appUnmatched ?? [];

  return (
    <div className="rounded-xl border border-sky-900/40 bg-sky-950/20 p-5">
      <h2 className="font-semibold text-sky-200">ბანკის ამონაწერი — შედარება</h2>
      <p className="mt-1 text-xs text-zinc-500">
        ატვირთეთ საქართველოს ბანკის Excel ამონაწერი (Report …xlsx). სისტემა შეადარებს ჩარიცხვებს აპის
        ბარათი/ანგარიშის გაყიდვებს და აჩვენებს რომელი ჩაირიცხა და რომელი არა.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Excel ამონაწერი</label>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="block w-full max-w-sm text-xs text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-800 file:px-3 file:py-1.5 file:text-xs file:text-white"
          />
        </div>
        <button type="button" className={btnCls} disabled={busy} onClick={() => void upload(false)}>
          შედარება
        </button>
        <button type="button" className={btnSec} disabled={busy} onClick={() => void upload(true)}>
          შედარება + აისახა მონიშვნა
        </button>
      </div>

      {msg && <p className="mt-2 text-sm text-emerald-400">{msg}</p>}
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}

      {result && (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="rounded-lg border border-zinc-700 px-2 py-1 text-zinc-300">
              პერიოდი: {result.periodLabel || `${result.periodFrom} — ${result.periodTo}`}
            </span>
            <span className="rounded-lg border border-emerald-900/50 px-2 py-1 text-emerald-300">
              იდენტიფიცირებული: {result.summary.matched}
            </span>
            <span className="rounded-lg border border-amber-900/50 px-2 py-1 text-amber-300">
              ამონაწერში / აპში არა: {result.summary.unmatched}
            </span>
            <span className="rounded-lg border border-red-900/40 px-2 py-1 text-red-300">
              აპში არის, ამონაწერში არა: {result.summary.appMissingInStatement}
            </span>
            <span className="rounded-lg border border-zinc-700 px-2 py-1 text-zinc-500">
              გამოტოვებული: {result.summary.skipped}
            </span>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-200">ამონაწერის ჩარიცხვები</h3>
            {creditMatches.length === 0 ? (
              <p className="text-sm text-zinc-500">ჩარიცხვები არ არის</p>
            ) : (
              <MatchTable rows={creditMatches} />
            )}
          </div>

          {appMissing.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-amber-200">
                აპში ბარათი/ანგარიში — ამონაწერში ვერ მოიძებნა
              </h3>
              <AppMissingTable rows={appMissing} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MatchTable({ rows }: { rows: StatementMatchRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/40">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
            <th className="px-3 py-2">თარიღი</th>
            <th className="px-3 py-2">თანხა (ამონაწერი)</th>
            <th className="px-3 py-2">შედარება</th>
            <th className="px-3 py-2">სტატუსი</th>
            <th className="px-3 py-2">აპი / შენიშვნა</th>
            <th className="px-3 py-2">აღწერა</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const st = statusLabel(m.status);
            return (
              <tr
                key={m.line.key}
                className={`border-b border-zinc-800/50 ${
                  m.status === "matched"
                    ? "bg-emerald-950/10"
                    : m.status === "unmatched"
                      ? "bg-amber-950/15"
                      : ""
                }`}
              >
                <td className="whitespace-nowrap px-3 py-2 text-zinc-400">{formatDate(m.line.date)}</td>
                <td className="px-3 py-2 font-medium text-emerald-300">
                  {formatMoney(m.line.credit || m.line.amount)}
                  {m.line.grossAmount != null && m.line.grossAmount !== m.line.amount && (
                    <span className="ml-1 text-[10px] text-zinc-500">
                      (სრული {formatMoney(m.line.grossAmount)})
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-zinc-300">{formatMoney(m.line.matchAmount)}</td>
                <td className={`px-3 py-2 text-xs font-medium ${st.cls}`}>{st.text}</td>
                <td className="px-3 py-2 text-xs text-zinc-400">
                  {m.candidate ? (
                    <>
                      {formatMoney(m.candidate.amount)} · {m.note}
                    </>
                  ) : (
                    m.note
                  )}
                </td>
                <td className="max-w-[280px] truncate px-3 py-2 text-xs text-zinc-500" title={m.line.description}>
                  {m.line.senderName || m.line.purpose || m.line.description.slice(0, 80)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AppMissingTable({ rows }: { rows: AppUnmatchedRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-amber-900/40 bg-zinc-950/40">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
            <th className="px-3 py-2">თარიღი</th>
            <th className="px-3 py-2">თანხა</th>
            <th className="px-3 py-2">არხი</th>
            <th className="px-3 py-2">აღწერა</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.candidate.key} className="border-b border-zinc-800/50">
              <td className="whitespace-nowrap px-3 py-2 text-zinc-400">
                {formatDate(r.candidate.date)}
              </td>
              <td className="px-3 py-2 font-medium text-amber-200">{formatMoney(r.candidate.amount)}</td>
              <td className="px-3 py-2 text-xs text-zinc-400">
                {r.candidate.channel === "card" ? "ბარათი" : "ანგარიში"}
              </td>
              <td className="px-3 py-2 text-xs text-zinc-400">
                {r.candidate.label}
                {r.candidate.buyerName ? ` · ${r.candidate.buyerName}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
