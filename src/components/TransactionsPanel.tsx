"use client";

import { useState } from "react";
import type { Branch, Transaction } from "@/lib/types";
import {
  formatDate,
  formatMoney,
  isCreditOrder,
  isCreditOrderActive,
  saleCreditRemaining,
  saleQuantityRemaining,
} from "@/lib/utils";

function txLabel(t: Transaction) {
  if (t.type === "sale") {
    const emp = t.employeeName ? ` (${t.employeeName})` : "";
    return `${t.productName} × ${t.quantity}${emp}`;
  }
  return t.category;
}

function txDetail(t: Transaction) {
  if (t.type === "sale" && isCreditOrder(t) && isCreditOrderActive(t)) {
    const moneyLeft = saleCreditRemaining(t);
    const qtyLeft = saleQuantityRemaining(t);
    const parts: string[] = [];
    if (moneyLeft > 0) parts.push(`გადასახდელი ${formatMoney(moneyLeft)}`);
    else parts.push("ფული ✓");
    if (qtyLeft > 0) parts.push(`დასამიწოდებელი ${qtyLeft} ც`);
    else parts.push("მოწოდება ✓");
    return `ბე · ${parts.join(" · ")}`;
  }
  if (t.type === "sale") {
    if (t.orderCompletedAt) return `ბე დასრულებული · ${t.paymentMethod}`;
    return `${t.paymentStatus} · ${t.paymentMethod}`;
  }
  return t.source === "branch" ? "ხარჯი (ფილიალი)" : "ხარჯი";
}

function DeleteRow({
  id,
  unlocked,
  sessionPin,
  onDelete,
}: {
  id: string;
  unlocked: boolean;
  sessionPin: string;
  onDelete: (id: string, pin: string) => Promise<boolean>;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  if (unlocked && sessionPin) {
    return (
      <button
        type="button"
        title="წაშლა"
        disabled={busy}
        className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-950/40 hover:text-red-300 disabled:opacity-40"
        onClick={async () => {
          setBusy(true);
          await onDelete(id, sessionPin);
          setBusy(false);
        }}
      >
        ✕
      </button>
    );
  }

  return (
    <input
      type="password"
      className="w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs focus:border-red-500 focus:outline-none"
      placeholder="PIN ↵"
      value={pin}
      disabled={busy}
      onChange={(e) => setPin(e.target.value)}
      onKeyDown={async (e) => {
        if (e.key !== "Enter" || !pin.trim() || busy) return;
        setBusy(true);
        await onDelete(id, pin.trim());
        setPin("");
        setBusy(false);
      }}
      title="შეიყვანეთ PIN და Enter — წაიშლება მაშინვე"
    />
  );
}

type Props = {
  transactions: Transaction[];
  filter: Branch | "ყველა";
  unlocked: boolean;
  sessionPin: string;
  onDelete: (id: string, pin: string) => Promise<boolean>;
};

export default function TransactionsPanel({
  transactions,
  filter,
  unlocked,
  sessionPin,
  onDelete,
}: Props) {
  const history = (
    filter === "ყველა"
      ? transactions
      : transactions.filter((t) => t.branch === filter || t.branch === "საერთო")
  )
    .filter((t) => !(t.type === "sale" && isCreditOrder(t) && isCreditOrderActive(t)))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <h2 className="mb-2 text-lg font-semibold">გაყიდვები და ხარჯები</h2>
      <p className="mb-4 text-xs text-zinc-500">
        წასაშლელად შეიყვანეთ PIN უჯრაში და დააჭირეთ Enter — დამატებითი დადასტურება არ სჭირდება.
        {unlocked && sessionPin ? " (PIN უკვე აქტიურია — ✕-ზე დაჭერით წაიშლება)" : ""}
      </p>

      {history.length === 0 ? (
        <p className="text-sm text-zinc-500">ცარიელია</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                <th className="pb-2 pr-3">დრო</th>
                <th className="pb-2 pr-3">ტიპი</th>
                <th className="pb-2 pr-3">ფილიალი</th>
                <th className="pb-2 pr-3">აღწერა</th>
                <th className="pb-2 pr-3">კომენტარი</th>
                <th className="pb-2 pr-3 text-right">თანხა</th>
                <th className="pb-2 w-24">წაშლა</th>
              </tr>
            </thead>
            <tbody>
              {history.map((t) => (
                <tr key={t.id} className="border-b border-zinc-800/50">
                  <td className="py-2 pr-3 whitespace-nowrap text-zinc-400">{formatDate(t.date)}</td>
                  <td className={`py-2 pr-3 ${t.type === "sale" ? "text-emerald-400" : "text-red-400"}`}>
                    {t.type === "sale"
                      ? t.orderCompletedAt
                        ? "გაყიდვა"
                        : t.paymentStatus === "ბე (ავანსი)"
                          ? "ბე"
                          : "გაყიდვა"
                      : "ხარჯი"}
                    {t.source === "branch" && <span className="ml-1 text-xs text-zinc-500">📱</span>}
                  </td>
                  <td className="py-2 pr-3">{t.branch}</td>
                  <td className="py-2 pr-3">{txLabel(t)}</td>
                  <td className="py-2 pr-3 text-zinc-500">{t.comment || txDetail(t)}</td>
                  <td
                    className={`py-2 pr-3 text-right font-medium ${t.type === "sale" ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {t.type === "sale" ? "+" : "-"}
                    {formatMoney(t.amount)}
                  </td>
                  <td className="py-2">
                    <DeleteRow
                      id={t.id}
                      unlocked={unlocked}
                      sessionPin={sessionPin}
                      onDelete={onDelete}
                    />
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
