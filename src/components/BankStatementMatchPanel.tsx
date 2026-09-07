"use client";

import { useRef, useState } from "react";
import type { StatementLedgerHint } from "@/lib/bank-statement";
import { buildStatementLedgerHints } from "@/lib/bank-statement";

type Props = {
  onMarked?: () => void | Promise<void>;
  onHints?: (hints: Record<string, StatementLedgerHint>) => void;
};

const btnCls =
  "rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-medium hover:bg-violet-600 disabled:opacity-40";
const btnSec =
  "rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 disabled:opacity-40";

export default function BankStatementMatchPanel({ onMarked, onHints }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [summary, setSummary] = useState<{
    periodLabel: string;
    matched: number;
    unmatched: number;
    appMissing: number;
  } | null>(null);

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

      const hints = buildStatementLedgerHints(data.matches ?? []);
      onHints?.(hints);

      setSummary({
        periodLabel: data.periodLabel || `${data.periodFrom} — ${data.periodTo}`,
        matched: data.summary?.matched ?? Object.keys(hints).length,
        unmatched: data.summary?.unmatched ?? 0,
        appMissing: data.summary?.appMissingInStatement ?? 0,
      });

      if (markReviewed) {
        setMsg(
          `დამთხვეულ ჩარიცხვებს მიეწერა ამონაწერის ინფო · მონიშნულია აისახად: ${data.marked}`
        );
        await onMarked?.();
      } else {
        setMsg(
          `დამთხვეულ შემოსავალსა და ხარჯს ქვემოთ სიაში მიეწერა ამონაწერის ინფო · ${data.fileName}`
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-sky-900/40 bg-sky-950/20 p-5">
      <h2 className="font-semibold text-sky-200">ბანკის ამონაწერი — შედარება</h2>
      <p className="mt-1 text-xs text-zinc-500">
        ატვირთეთ Excel ამონაწერი. თანხითა და თარიღით დამთხვეულ შემოსავალსა და ხარჯს ქვემოთ მიეწერება ამონაწერის
        თარიღი, გადმომრიცხავი/მიმღები და სხვაობა — სია არ იცვლება.
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

      {summary && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg border border-zinc-700 px-2 py-1 text-zinc-300">
            პერიოდი: {summary.periodLabel}
          </span>
          <span className="rounded-lg border border-emerald-900/50 px-2 py-1 text-emerald-300">
            მიეწერა: {summary.matched}
          </span>
          {summary.unmatched > 0 && (
            <span className="rounded-lg border border-amber-900/50 px-2 py-1 text-amber-300">
              ამონაწერში უცნობი: {summary.unmatched}
            </span>
          )}
          {summary.appMissing > 0 && (
            <span className="rounded-lg border border-red-900/40 px-2 py-1 text-red-300">
              აპშია, ამონაწერში არა: {summary.appMissing}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
