"use client";

import { useMemo, useState } from "react";
import { listActions } from "@/lib/activity-log";
import type { ActivityEntry, Transaction } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type Props = {
  transactions: Transaction[];
  activityLog: ActivityEntry[];
  onUndo: (body: { entryId?: string; txId?: string }) => Promise<void>;
};

export default function ActivityPanel({ transactions, activityLog, onUndo }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const rows = useMemo(() => listActions(transactions, activityLog), [transactions, activityLog]);
  const q = query.trim().toLowerCase();
  const visible = (q ? rows.filter((r) => `${r.title} ${r.detail}`.toLowerCase().includes(q)) : rows).slice(0, 250);

  async function undo(key: string, body: { entryId?: string; txId?: string }) {
    setBusy(key);
    setError("");
    try {
      await onUndo(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "გაუქმება ვერ მოხერხდა");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <h2 className="text-lg font-semibold">მოქმედებები</h2>
      <p className="mt-1 text-xs text-zinc-500">
        ჩაწერა, შეცვლა და წაშლა. გაუქმება აბრუნებს სწორედ იმ ჩანაწერს. ამ გვერდამდე წაშლილი ჩანაწერი სიაში აღარ
        არის — წაშლისას არ ინახებოდა. აქედან ახალი წაშლა და შეცვლა ბრუნდება. სიაში ბოლო 250 ჩანს, ძებნით ძველიც.
      </p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ძებნა სახელით, თარიღით, თანხით"
        className="mt-4 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
      />
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs text-zinc-500">
              <th className="px-2 py-2 font-medium">დრო</th>
              <th className="px-2 py-2 font-medium">მოქმედება</th>
              <th className="px-2 py-2 font-medium">ჩანაწერი</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.key} className="border-b border-zinc-800/70">
                <td className="whitespace-nowrap px-2 py-2 text-xs text-zinc-400">{formatDate(row.at)}</td>
                <td className="whitespace-nowrap px-2 py-2 text-xs text-zinc-200">{row.title}</td>
                <td className="px-2 py-2 text-xs text-zinc-300">{row.detail}</td>
                <td className="px-2 py-2 text-right">
                  {row.canUndo ? (
                    <button
                      type="button"
                      disabled={busy === row.key}
                      onClick={() => void undo(row.key, { entryId: row.entryId, txId: row.txId })}
                      className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:border-violet-500 hover:text-violet-200 disabled:opacity-50"
                    >
                      {busy === row.key ? "..." : "გაუქმება"}
                    </button>
                  ) : (
                    <span className="text-xs text-zinc-600">—</span>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-6 text-center text-sm text-zinc-500">
                  მოქმედება ვერ მოიძებნა
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
