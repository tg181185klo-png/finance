"use client";

import { useState } from "react";
import type { BranchClientSale, BranchDailyReport, Transaction } from "@/lib/types";

type RefreshPatch = {
  branchReports?: BranchDailyReport[];
  transactions?: Transaction[];
};

export function ClientSaleActions({
  reportId,
  sale,
  index,
  onRefresh,
}: {
  reportId: string;
  sale: BranchClientSale;
  index: number;
  onRefresh?: (patch?: RefreshPatch) => void | Promise<unknown>;
}) {
  const clientSaleId = sale.clientSaleId ?? `${reportId}-sale-${index}`;
  const label =
    sale.personType === "legal"
      ? sale.companyName || "კომპანია"
      : `${sale.customerFirstName ?? ""} ${sale.customerLastName ?? ""}`.trim() || "კლიენტი";
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next: BranchClientSale = { ...sale, clientSaleId };
    if (sale.personType === "legal") next.companyName = trimmed;
    else {
      const [first, ...rest] = trimmed.split(/\s+/);
      next.customerFirstName = first;
      next.customerLastName = rest.join(" ");
    }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/branch-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateClientSale",
          reportId,
          clientSaleId,
          sale: next,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "შეცდომა");
      await onRefresh?.({ branchReports: data.branchReports, transactions: data.transactions });
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`წავშალოთ „${label}"?`)) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/branch-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteClientSale", reportId, clientSaleId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "შეცდომა");
      await onRefresh?.({ branchReports: data.branchReports, transactions: data.transactions });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="ml-2 inline-flex flex-wrap items-center gap-2 align-middle">
      {editing ? (
        <>
          <input
            className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="button" className="text-xs text-emerald-400" disabled={busy} onClick={() => void save()}>
            შენახვა
          </button>
          <button type="button" className="text-xs text-zinc-500" disabled={busy} onClick={() => setEditing(false)}>
            გაუქმება
          </button>
        </>
      ) : (
        <>
          <button type="button" className="text-xs text-sky-400" disabled={busy} onClick={() => { setName(label); setEditing(true); }}>
            შეცვლა
          </button>
          <button type="button" className="text-xs text-red-400" disabled={busy} onClick={() => void remove()}>
            წაშლა
          </button>
        </>
      )}
      {err ? <span className="text-xs text-red-400">{err}</span> : null}
    </span>
  );
}
