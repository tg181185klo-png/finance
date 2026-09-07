"use client";

import { useRef, useState } from "react";
import type {
  BankStatementMatchResult,
  StatementMatchRow,
  AppUnmatchedRow,
  StatementLedgerHint,
} from "@/lib/bank-statement";
import { buildStatementLedgerHints } from "@/lib/bank-statement";
import { formatDate, formatMoney } from "@/lib/utils";

type ResultPayload = BankStatementMatchResult & {
  fileName?: string;
  marked?: number;
};

type Props = {
  onMarked?: () => void | Promise<void>;
  onHints?: (hints: Record<string, StatementLedgerHint>) => void;
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

function channelKa(ch: "card" | "bank") {
  return ch === "card" ? "ბარათი" : "ანგარიში";
}

function kindKa(kind: "sale" | "deposit") {
  return kind === "sale" ? "გაყიდვა" : "შენატანი";
}

function Cell({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <div className="mt-0.5 break-words text-sm text-zinc-200">{children}</div>
    </div>
  );
}

export default function BankStatementMatchPanel({ onMarked, onHints }: Props) {
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
      onHints?.(buildStatementLedgerHints(data.matches ?? []));
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

  const creditMatches = (result?.matches ?? []).filter(
    (m) => m.line.direction === "in" && m.status !== "skipped"
  );
  const appMissing = result?.appUnmatched ?? [];

  return (
    <div className="rounded-xl border border-sky-900/40 bg-sky-950/20 p-5">
      <h2 className="font-semibold text-sky-200">ბანკის ამონაწერი — შედარება</h2>
      <p className="mt-1 text-xs text-zinc-500">
        ატვირთეთ საქართველოს ბანკის Excel ამონაწერი. შედარების შემდეგ მოძრაობის სიაში გამოჩნდება ამონაწერის
        თარიღი, ჩარიცხავი და საკომისიო.
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
        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap gap-2 text-xs">
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
          </div>

          <div>
            <h3 className="mb-3 text-sm font-medium text-zinc-200">ამონაწერის ჩარიცხვები</h3>
            {creditMatches.length === 0 ? (
              <p className="text-sm text-zinc-500">ჩარიცხვები არ არის</p>
            ) : (
              <div className="space-y-3">
                {creditMatches.map((m) => (
                  <MatchCard key={m.line.key} row={m} />
                ))}
              </div>
            )}
          </div>

          {appMissing.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-medium text-amber-200">
                აპში ბარათი/ანგარიში — ამონაწერში ვერ მოიძებნა
              </h3>
              <div className="space-y-3">
                {appMissing.map((r) => (
                  <AppMissingCard key={r.candidate.key} row={r} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MatchCard({ row }: { row: StatementMatchRow }) {
  const st = statusLabel(row.status);
  const c = row.candidate;
  const bankNet = row.line.credit || row.line.amount;
  return (
    <article
      className={`rounded-xl border p-4 ${
        row.status === "matched"
          ? "border-emerald-900/40 bg-emerald-950/15"
          : "border-amber-900/40 bg-amber-950/15"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className={`text-xs font-semibold ${st.cls}`}>{st.text}</p>
        {row.commission != null && (
          <p className="rounded-md border border-amber-800/50 bg-amber-950/40 px-2 py-0.5 text-xs text-amber-200">
            საკომისიო / სხვაობა: {formatMoney(row.commission)}
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Cell label="გაყიდვის თარიღი (აპი)">{c ? formatDate(c.date) : "—"}</Cell>
        <Cell label="თარიღი ამონაწერის მიხედვით">
          {formatDate(row.line.statementDate || row.line.date)}
        </Cell>
        <Cell label="ფილიალი">{c?.branch || "—"}</Cell>
        <Cell label="ტიპი">{c ? kindKa(c.kind) : "შემოსავალი"}</Cell>
        <Cell label="ჩამრიცხავი (აპი)">{c?.buyerName || c?.label || "—"}</Cell>
        <Cell label="ჩარიცხული ამონაწერში (ვის მიერ)">
          <span className="font-medium text-sky-200">{row.line.senderName || "—"}</span>
          {row.line.purpose ? (
            <span className="mt-0.5 block text-xs text-zinc-500">{row.line.purpose}</span>
          ) : null}
        </Cell>
        <Cell label="არხი">{c ? channelKa(c.channel) : row.line.opType || "—"}</Cell>
        <Cell label="გადახდა">
          {c ? (c.channel === "card" ? "ბარათი" : "ანგარიშზე ჩარიცხვა") : "—"}
        </Cell>
        <Cell label="თანხა (აპი)">
          {c ? <span className="font-medium text-emerald-300">{formatMoney(c.amount)}</span> : "—"}
        </Cell>
        <Cell label="თანხა (ამონაწერი)">
          <span className="font-medium text-emerald-200">{formatMoney(bankNet)}</span>
          {row.line.grossAmount != null && row.line.grossAmount !== bankNet && (
            <span className="mt-0.5 block text-xs text-zinc-500">
              სრული (აღწერა): {formatMoney(row.line.grossAmount)}
            </span>
          )}
        </Cell>
        <Cell label="სხვაობა (საკომისიო)" className="sm:col-span-2">
          {row.commission != null ? (
            <span className="font-medium text-amber-200">{formatMoney(row.commission)}</span>
          ) : (
            <span className="text-zinc-500">—</span>
          )}
        </Cell>
        <Cell label="შენიშვნა" className="sm:col-span-2 lg:col-span-4">
          {row.note}
        </Cell>
      </div>
    </article>
  );
}

function AppMissingCard({ row }: { row: AppUnmatchedRow }) {
  const c = row.candidate;
  return (
    <article className="rounded-xl border border-amber-900/40 bg-zinc-950/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cell label="გაყიდვის თარიღი">{formatDate(c.date)}</Cell>
        <Cell label="ფილიალი">{c.branch}</Cell>
        <Cell label="ტიპი">{kindKa(c.kind)}</Cell>
        <Cell label="არხი">{channelKa(c.channel)}</Cell>
        <Cell label="ჩამრიცხავი">{c.buyerName || "—"}</Cell>
        <Cell label="თანხა">
          <span className="font-medium text-amber-200">{formatMoney(c.amount)}</span>
        </Cell>
        <Cell label="აღწერა" className="sm:col-span-2">
          {c.label}
        </Cell>
        <Cell label="შენიშვნა" className="sm:col-span-2 lg:col-span-4">
          {row.note}
        </Cell>
      </div>
    </article>
  );
}
