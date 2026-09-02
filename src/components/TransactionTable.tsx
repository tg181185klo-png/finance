"use client";

import { useState } from "react";
import type { PaymentMethod, Transaction } from "@/lib/types";
import { PAYMENT_METHODS } from "@/lib/dashboard-data";
import {
  formatDate,
  formatMoney,
  isCreditOrder,
  isCreditOrderActive,
  paymentMethodLabel,
  saleCreditRemaining,
  saleQuantityRemaining,
  txPaymentMethod,
} from "@/lib/utils";

export function txLabel(t: Transaction) {
  if (t.type === "sale") {
    const emp = t.employeeName ? ` (${t.employeeName})` : "";
    return `${t.productName} × ${t.quantity}${emp}`;
  }
  if (t.type === "deposit") {
    const kind =
      t.kind === "founder" ? "დამფუძნებლის შენატანი" : t.kind === "loan_repayment" ? "ვალის დაბრუნება" : "შენატანი";
    return kind;
  }
  return t.category;
}

export function txDetail(t: Transaction) {
  if (t.type === "deposit") return t.comment;
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
    if (t.orderCompletedAt) return `ბე დასრულებული · ${paymentMethodLabel(t.paymentMethod)}`;
    return `${t.paymentStatus} · ${paymentMethodLabel(t.paymentMethod)}`;
  }
  return t.source === "branch" ? "ხარჯი (ფილიალი)" : "ხარჯი";
}

function PaymentMethodCell({
  transaction,
  onUpdatePayment,
}: {
  transaction: Transaction;
  onUpdatePayment?: (id: string, paymentMethod: PaymentMethod) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const value = txPaymentMethod(transaction);

  if (!onUpdatePayment) {
    return <span className="text-xs text-zinc-400">{paymentMethodLabel(value)}</span>;
  }

  return (
    <select
      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs focus:border-emerald-500"
      value={value}
      disabled={busy}
      onChange={async (e) => {
        const next = e.target.value as PaymentMethod;
        if (next === value) return;
        setBusy(true);
        await onUpdatePayment(transaction.id, next);
        setBusy(false);
      }}
    >
      {PAYMENT_METHODS.map((m) => (
        <option key={m} value={m}>
          {paymentMethodLabel(m)}
        </option>
      ))}
    </select>
  );
}

function DeleteRow({
  id,
  onDelete,
}: {
  id: string;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className="rounded border border-red-900/60 px-2 py-1 text-xs text-red-400 hover:bg-red-950/40 disabled:opacity-40"
      disabled={busy}
      onClick={async () => {
        if (!confirm("წავშალოთ ეს ჩანაწერი?")) return;
        setBusy(true);
        await onDelete(id);
        setBusy(false);
      }}
    >
      წაშლა
    </button>
  );
}

type Props = {
  rows: Transaction[];
  showBranch?: boolean;
  onDelete: (id: string) => Promise<boolean>;
  onUpdatePayment?: (id: string, paymentMethod: PaymentMethod) => Promise<boolean>;
  emptyText?: string;
};

export default function TransactionTable({
  rows,
  showBranch = true,
  onDelete,
  onUpdatePayment,
  emptyText = "ტრანზაქციები არ არის",
}: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">{emptyText}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
            <th className="pb-2 pr-3">დრო</th>
            <th className="pb-2 pr-3">ტიპი</th>
            {showBranch && <th className="pb-2 pr-3">ფილიალი</th>}
            <th className="pb-2 pr-3">აღწერა</th>
            <th className="pb-2 pr-3">კომენტარი</th>
            <th className="pb-2 pr-3">გადახდა</th>
            <th className="pb-2 pr-3 text-right">თანხა</th>
            <th className="pb-2 w-24">წაშლა</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-b border-zinc-800/50">
              <td className="py-2 pr-3 whitespace-nowrap text-zinc-400">{formatDate(t.date)}</td>
              <td
                className={`py-2 pr-3 ${
                  t.type === "sale" ? "text-emerald-400" : t.type === "deposit" ? "text-sky-400" : "text-red-400"
                }`}
              >
                {t.type === "sale"
                  ? t.orderCompletedAt
                    ? "გაყიდვა"
                    : t.paymentStatus === "ბე (ავანსი)"
                      ? "ბე"
                      : "გაყიდვა"
                  : t.type === "deposit"
                    ? "შენატანი"
                    : "ხარჯი"}
                {t.source === "branch" && <span className="ml-1 text-xs text-zinc-500">📱</span>}
                {t.source === "import" && <span className="ml-1 text-xs text-zinc-500">📊</span>}
                {t.source === "distribucia" && <span className="ml-1 text-xs text-zinc-500" title="polimeri აპი">🚐</span>}
              </td>
              {showBranch && <td className="py-2 pr-3">{t.branch}</td>}
              <td className="py-2 pr-3">{txLabel(t)}</td>
              <td className="py-2 pr-3 text-zinc-500">{t.comment || txDetail(t)}</td>
              <td className="py-2 pr-3">
                <PaymentMethodCell transaction={t} onUpdatePayment={onUpdatePayment} />
              </td>
              <td
                className={`py-2 pr-3 text-right font-medium ${
                  t.type === "sale" ? "text-emerald-400" : t.type === "deposit" ? "text-sky-400" : "text-red-400"
                }`}
              >
                {t.type === "sale" ? "+" : t.type === "deposit" ? "+" : "-"}
                {formatMoney(t.amount)}
              </td>
              <td className="py-2">
                <DeleteRow id={t.id} onDelete={onDelete} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
