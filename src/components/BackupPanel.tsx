"use client";

import { useCallback, useEffect, useState } from "react";
import type { StoreBackupMeta } from "@/lib/store-backup";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function reasonLabel(reason: string) {
  if (reason === "daily") return "ყოველდღიური";
  if (reason === "auto") return "ავტო";
  if (reason === "pre-restore") return "აღდგენამდე";
  return "ხელით";
}

export default function BackupPanel() {
  const [backups, setBackups] = useState<StoreBackupMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/backup", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ბექაპების ჩატვირთვა ვერ მოხერხდა");
      setBackups(data.backups ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createBackup() {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ბექაპი ვერ შეიქმნა");
      setMsg(`ბექაპი შენახულია (${data.backup?.id ?? ""})`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  function downloadBackup(id: string) {
    window.open(`/api/backup?id=${encodeURIComponent(id)}&download=1`, "_blank");
  }

  async function restoreBackup(id: string) {
    const pin = window.prompt("აღდგენისთვის შეიყვანეთ ადმინ კოდი (PIN)");
    if (!pin) return;
    if (
      !window.confirm(
        "ყველა მიმდინარე მონაცემი შეიცვლება ამ ბექაპით. მიმდინარე მდგომარეობა ავტომატურად დაბექაპდება. გავაგრძელოთ?"
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", backupId: id, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "აღდგენა ვერ მოხერხდა");
      setMsg(
        `აღდგენილია: ${data.transactions ?? 0} ტრანზაქცია, ${data.employees ?? 0} თანამშრომელი. განაახლეთ გვერდი.`
      );
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-emerald-300">მონაცემების ბექაპი</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            ასლები ინახება Supabase-ში ცალკე ცხრილში. ყოველდღე ავტომატურად (02:00 UTC) და შენახვისას
            პერიოდულად. შეგიძლიათ ჩამოტვირთოთ JSON კომპიუტერზე ან აღადგინოთ ძველი მდგომარეობა.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={createBackup}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-40"
        >
          {busy ? "..." : "ახლა დააბექაპე"}
        </button>
      </div>

      {msg && (
        <p className="mb-3 rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
          {msg}
        </p>
      )}
      {err && (
        <p className="mb-3 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {err}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">იტვირთება...</p>
      ) : backups.length === 0 ? (
        <p className="text-sm text-zinc-500">ბექაპები ჯერ არ არის — დააჭირეთ „ახლა დააბექაპე“.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                <th className="pb-2 pr-3">თარიღი</th>
                <th className="pb-2 pr-3">ტიპი</th>
                <th className="pb-2 pr-3 text-right">ტრანზ.</th>
                <th className="pb-2 pr-3 text-right">თანამშრ.</th>
                <th className="pb-2 pr-3 text-right">ზომა</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.id} className="border-b border-zinc-800/80">
                  <td className="py-2 pr-3 font-mono text-xs text-zinc-300">
                    {new Date(b.createdAt).toLocaleString("ka-GE")}
                  </td>
                  <td className="py-2 pr-3 text-zinc-400">{reasonLabel(b.reason)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{b.transactions}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{b.employees}</td>
                  <td className="py-2 pr-3 text-right text-zinc-500">{formatBytes(b.bytes)}</td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800"
                        onClick={() => downloadBackup(b.id)}
                      >
                        ჩამოტვირთვა
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded border border-amber-700/60 px-2 py-1 text-xs text-amber-300 hover:bg-amber-950/40 disabled:opacity-40"
                        onClick={() => restoreBackup(b.id)}
                      >
                        აღდგენა
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
