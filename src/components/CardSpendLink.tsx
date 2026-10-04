"use client";

import { useState } from "react";
import { OPERATIONAL_DATA_FROM } from "@/lib/report-config";

export default function CardSpendLink({ token }: { token: string }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const res = await fetch("/api/card-spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          date,
          amount: parseFloat(amount),
          comment: comment.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "ვერ შეინახა");
      setAmount("");
      setComment("");
      setMsg("ჩაიწერა. ბარათს გამოაკლდა.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ვერ შეინახა");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-6">
      <h1 className="text-2xl font-semibold text-sky-300">ბარათიდან ხარჯი</h1>
      <p className="mt-1 mb-6 text-sm text-zinc-400">თარიღი, თანხა და კომენტარი.</p>
      <form onSubmit={submit} className="flex flex-1 flex-col gap-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-400">თარიღი</span>
          <input
            type="date"
            required
            value={date}
            min={OPERATIONAL_DATA_FROM}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-4 text-lg"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-400">თანხა (₾)</span>
          <input
            required
            inputMode="decimal"
            type="number"
            min={0}
            step={0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-4 text-lg"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-400">კომენტარი</span>
          <textarea
            required
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="რაში დაიხარჯა"
            className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-4 text-lg"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="mt-auto rounded-2xl bg-sky-600 py-4 text-lg font-semibold text-white disabled:opacity-40"
        >
          {busy ? "ინახება..." : "შენახვა"}
        </button>
        {msg && <p className="text-center text-base text-emerald-400">{msg}</p>}
        {err && <p className="text-center text-base text-red-400">{err}</p>}
      </form>
    </main>
  );
}
