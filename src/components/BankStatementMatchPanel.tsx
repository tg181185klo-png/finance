"use client";

import { useRef, useState } from "react";
import type { StatementLedgerHint } from "@/lib/bank-statement";

type Props = {
  onMarked?: () => void | Promise<void>;
  onHints?: (hints: Record<string, StatementLedgerHint>, periodFrom?: string) => void;
  onReviewed?: (bankLedgerReviewed: Record<string, string>) => void;
};

const btnCls =
  "rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-medium hover:bg-violet-600 disabled:opacity-40";

export default function BankStatementMatchPanel({ onMarked, onHints, onReviewed }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [summary, setSummary] = useState<{
    periodLabel: string;
    matched: number;
    unmatched: number;
    appMissing: number;
    annotated: number;
    marked: number;
  } | null>(null);

  async function upload() {
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
      const res = await fetch("/api/bank-statement/match", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "შეცდომა");

      const hints = (data.hints ?? {}) as Record<string, StatementLedgerHint>;
      onHints?.(hints, data.periodFrom);

      if (data.bankLedgerReviewed && typeof data.bankLedgerReviewed === "object") {
        onReviewed?.(data.bankLedgerReviewed as Record<string, string>);
      }

      const annotated = Object.keys(hints).length;
      const marked = typeof data.marked === "number" ? data.marked : 0;
      setSummary({
        periodLabel: data.periodLabel || `${data.periodFrom} — ${data.periodTo}`,
        matched: data.summary?.matched ?? 0,
        unmatched: data.summary?.unmatched ?? 0,
        appMissing: data.summary?.appMissingInStatement ?? 0,
        annotated,
        marked,
      });

      if (annotated === 0) {
        setMsg(
          `შედარება დასრულდა, მაგრამ დამთხვევა ვერ მოიძებნა (${data.fileName}). შეამოწმეთ თვე/თანხები.`
        );
      } else {
        setMsg(
          `მიეწერა ${annotated} ჩანაწერს · ნანახად მონიშნულია ${marked} · ${data.fileName}`
        );
        await onMarked?.();
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
        ატვირთეთ Excel ამონაწერი. დამთხვეული ჩანაწერები ავტომატურად მოინიშნება ნანახად; გადმორიცხვებსა და
        ხარჯებს მიეწერება გადმომრიცხავი ან ხარჯის გამწევი/მიმღები.
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
        <button type="button" className={btnCls} disabled={busy} onClick={() => void upload()}>
          შედარება
        </button>
      </div>

      {msg && (
        <p className={`mt-2 text-sm ${summary && summary.annotated === 0 ? "text-amber-300" : "text-emerald-400"}`}>
          {msg}
        </p>
      )}
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}

      {summary && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg border border-zinc-700 px-2 py-1 text-zinc-300">
            პერიოდი: {summary.periodLabel}
          </span>
          <span className="rounded-lg border border-emerald-900/50 px-2 py-1 text-emerald-300">
            მიეწერა: {summary.annotated}
          </span>
          <span className="rounded-lg border border-violet-900/50 px-2 py-1 text-violet-300">
            ნანახი: {summary.marked}
          </span>
          <span className="rounded-lg border border-zinc-700 px-2 py-1 text-zinc-400">
            დამთხვევა: {summary.matched}
          </span>
          {summary.unmatched > 0 && (
            <span className="rounded-lg border border-amber-900/50 px-2 py-1 text-amber-300">
              ამონაწერში უპასუხო: {summary.unmatched}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
