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
const thCls = "whitespace-nowrap px-2.5 py-2 font-medium";
const tdCls = "px-2.5 py-2 align-top text-xs";

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
      <table className="w-full min-w-[1280px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/80 text-xs text-zinc-500">
            <th className={thCls}>გაყიდვის თარიღი</th>
            <th className={thCls}>ამონაწერის თარიღი</th>
            <th className={thCls}>ფილიალი</th>
            <th className={thCls}>ტიპი</th>
            <th className={thCls}>ჩამრიცხავი</th>
            <th className={thCls}>ჩარიცხული ამონაწერში</th>
            <th className={thCls}>არხი</th>
            <th className={thCls}>გადახდა</th>
            <th className={`${thCls} text-right`}>თანხა (აპი)</th>
            <th className={`${thCls} text-right`}>თანხა (ამონაწერი)</th>
            <th className={`${thCls} text-right`}>სხვაობა</th>
            <th className={thCls}>სტატუსი</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const st = statusLabel(m.status);
            const c = m.candidate;
            const bankNet = m.line.credit || m.line.amount;
            return (
              <tr
                key={m.line.key}
                className={`border-b border-zinc-800/60 ${
                  m.status === "matched"
                    ? "bg-emerald-950/10"
                    : m.status === "unmatched"
                      ? "bg-amber-950/15"
                      : ""
                }`}
              >
                <td className={`${tdCls} whitespace-nowrap text-zinc-400`}>
                  {c ? formatDate(c.date) : "—"}
                </td>
                <td className={`${tdCls} whitespace-nowrap text-violet-200`}>
                  {formatDate(m.line.statementDate || m.line.date)}
                </td>
                <td className={`${tdCls} whitespace-nowrap`}>{c?.branch || "—"}</td>
                <td className={`${tdCls} whitespace-nowrap text-zinc-300`}>
                  {c ? kindKa(c.kind) : "შემოსავალი"}
                </td>
                <td className={`${tdCls} max-w-[160px] whitespace-normal break-words font-medium text-sky-200`}>
                  {c?.buyerName || c?.label || "—"}
                </td>
                <td className={`${tdCls} max-w-[200px] whitespace-normal break-words font-medium text-sky-100`}>
                  {m.line.senderName || "—"}
                  {m.line.purpose ? (
                    <span className="mt-0.5 block text-[10px] font-normal text-zinc-500">{m.line.purpose}</span>
                  ) : null}
                </td>
                <td className={`${tdCls} whitespace-nowrap text-sky-300`}>
                  {c ? channelKa(c.channel) : m.line.opType || "—"}
                </td>
                <td className={`${tdCls} whitespace-nowrap text-zinc-300`}>
                  {c ? (c.channel === "card" ? "ბარათი" : "ანგარიშზე ჩარიცხვა") : "—"}
                </td>
                <td className={`${tdCls} whitespace-nowrap text-right font-medium text-emerald-300`}>
                  {c ? formatMoney(c.amount) : "—"}
                </td>
                <td className={`${tdCls} whitespace-nowrap text-right font-medium text-emerald-200`}>
                  {formatMoney(bankNet)}
                </td>
                <td className={`${tdCls} whitespace-nowrap text-right font-medium text-amber-200`}>
                  {m.commission != null ? formatMoney(m.commission) : "—"}
                </td>
                <td className={`${tdCls} whitespace-nowrap font-medium ${st.cls}`}>{st.text}</td>
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
      <table className="w-full min-w-[900px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/80 text-xs text-zinc-500">
            <th className={thCls}>გაყიდვის თარიღი</th>
            <th className={thCls}>ფილიალი</th>
            <th className={thCls}>ტიპი</th>
            <th className={thCls}>არხი</th>
            <th className={thCls}>ჩამრიცხავი</th>
            <th className={`${thCls} text-right`}>თანხა</th>
            <th className={thCls}>აღწერა</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const c = r.candidate;
            return (
              <tr key={c.key} className="border-b border-zinc-800/60">
                <td className={`${tdCls} whitespace-nowrap text-zinc-400`}>{formatDate(c.date)}</td>
                <td className={`${tdCls} whitespace-nowrap`}>{c.branch}</td>
                <td className={`${tdCls} whitespace-nowrap`}>{kindKa(c.kind)}</td>
                <td className={`${tdCls} whitespace-nowrap text-sky-300`}>{channelKa(c.channel)}</td>
                <td className={`${tdCls} max-w-[180px] whitespace-normal break-words text-sky-200`}>
                  {c.buyerName || "—"}
                </td>
                <td className={`${tdCls} whitespace-nowrap text-right font-medium text-amber-200`}>
                  {formatMoney(c.amount)}
                </td>
                <td className={`${tdCls} max-w-[280px] whitespace-normal break-words text-zinc-400`}>
                  {c.label}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
