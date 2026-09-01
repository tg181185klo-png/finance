"use client";

import { useState } from "react";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none";
const btnCls =
  "w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-medium hover:bg-emerald-500 disabled:opacity-40";

type Props = {
  onSuccess: () => void;
};

export default function LoginScreen({ onSuccess }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "შესვლა ვერ მოხერხდა");
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl"
      >
        <h1 className="mb-1 text-xl font-semibold text-white">ფინანსური Dashboard</h1>
        <p className="mb-6 text-sm text-zinc-500">შესვლა საჭიროა გასაგრძელებლად</p>

        <label className="mb-1 block text-xs text-zinc-400">მომხმარებელი</label>
        <input
          className={`${inputCls} mb-4`}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          required
        />

        <label className="mb-1 block text-xs text-zinc-400">პაროლი</label>
        <input
          type="password"
          className={`${inputCls} mb-4`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        {err && <p className="mb-3 text-sm text-red-400">{err}</p>}

        <button type="submit" className={btnCls} disabled={busy}>
          {busy ? "შესვლა..." : "შესვლა"}
        </button>
      </form>
    </div>
  );
}
