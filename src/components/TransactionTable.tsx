"use client";

import { Fragment, useMemo, useState } from "react";
import type { Employee, PaymentMethod, Sale, Transaction } from "@/lib/types";
import { PAYMENT_METHODS } from "@/lib/dashboard-data";
import { groupTransactionsForDisplay, saleGroupDescription } from "@/lib/tx-display-groups";
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
    return `${t.productName} × ${t.quantity}`;
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
      onClick={(e) => e.stopPropagation()}
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

function DriverCell({
  transaction,
  employees,
  onUpdateDriver,
}: {
  transaction: Transaction;
  employees?: Employee[];
  onUpdateDriver?: (id: string, driverEmployeeId: string, driverEmployeeName: string) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);

  if (transaction.type !== "sale") {
    return <span className="text-xs text-zinc-600">—</span>;
  }

  const currentName = transaction.employeeName?.trim() || "";
  const activeEmployees = (employees ?? []).filter((e) => e.active !== false);

  if (!onUpdateDriver || activeEmployees.length === 0) {
    return <span className="text-xs text-violet-300">{currentName || "—"}</span>;
  }

  const matched = activeEmployees.find((e) => e.name === currentName);
  const value = matched?.id ?? "";

  return (
    <select
      className="max-w-[140px] rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-violet-200 focus:border-violet-500"
      value={value}
      disabled={busy}
      onClick={(e) => e.stopPropagation()}
      onChange={async (e) => {
        const emp = activeEmployees.find((x) => x.id === e.target.value);
        if (!emp) return;
        if (emp.name === currentName) return;
        setBusy(true);
        await onUpdateDriver(transaction.id, emp.id, emp.name);
        setBusy(false);
      }}
    >
      {!matched && currentName ? <option value="">{currentName}</option> : null}
      {!matched && !currentName ? <option value="">—</option> : null}
      {activeEmployees.map((emp) => (
        <option key={emp.id} value={emp.id}>
          {emp.name}
        </option>
      ))}
    </select>
  );
}

function ReviewedCell({
  ids,
  reviewed,
  onToggleReview,
}: {
  ids: string[];
  reviewed: boolean;
  onToggleReview?: (ids: string | string[], reviewed: boolean) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);

  if (!onToggleReview) {
    return (
      <span className={`text-xs ${reviewed ? "text-emerald-400" : "text-zinc-600"}`}>
        {reviewed ? "✓" : "—"}
      </span>
    );
  }

  return (
    <label
      className="inline-flex cursor-pointer items-center gap-1.5"
      title="აისახა ანგარიშზე / ბარათზე"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-600 focus:ring-emerald-500"
        checked={reviewed}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true);
          await onToggleReview(ids, e.target.checked);
          setBusy(false);
        }}
      />
    </label>
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
      onClick={async (e) => {
        e.stopPropagation();
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
  /** გაყიდვები ერთიანდება შეკვეთით (არა პროდუქტებად) */
  groupSales?: boolean;
  employees?: Employee[];
  bankLedgerReviewed?: Record<string, string>;
  onDelete?: (id: string) => Promise<boolean>;
  onUpdatePayment?: (id: string, paymentMethod: PaymentMethod) => Promise<boolean>;
  onUpdateDriver?: (id: string, driverEmployeeId: string, driverEmployeeName: string) => Promise<boolean>;
  onToggleReview?: (ids: string | string[], reviewed: boolean) => Promise<boolean>;
  emptyText?: string;
};

export default function TransactionTable({
  rows,
  showBranch = true,
  groupSales = true,
  employees,
  bankLedgerReviewed,
  onDelete,
  onUpdatePayment,
  onUpdateDriver,
  onToggleReview,
  emptyText = "ტრანზაქციები არ არის",
}: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const groups = useMemo(
    () => (groupSales ? groupTransactionsForDisplay(rows) : rows.map((t) => ({
      key: `tx:${t.id}`,
      primary: t,
      items: [t],
      amount: t.amount,
      productCount: 1,
    }))),
    [rows, groupSales]
  );

  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">{emptyText}</p>;
  }

  const showDriver = Boolean(onUpdateDriver) || rows.some((t) => t.type === "sale" && t.employeeName);
  const showReviewed = Boolean(onToggleReview) || bankLedgerReviewed !== undefined;

  const colCount =
    5 +
    (showBranch ? 1 : 0) +
    (showDriver ? 1 : 0) +
    (showReviewed ? 1 : 0) +
    (onDelete ? 1 : 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] table-fixed text-sm">
        <colgroup>
          <col className="w-[12%]" />
          <col className="w-[9%]" />
          {showBranch && <col className="w-[10%]" />}
          <col className="w-[24%]" />
          <col className="w-[16%]" />
          <col className="w-[12%]" />
          {showDriver && <col className="w-[11%]" />}
          <col className="w-[10%]" />
          {showReviewed && <col className="w-[6%]" />}
          {onDelete && <col className="w-[8%]" />}
        </colgroup>
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
            <th className="px-2 py-2 font-medium">დრო</th>
            <th className="px-2 py-2 font-medium">ტიპი</th>
            {showBranch && <th className="px-2 py-2 font-medium">ფილიალი</th>}
            <th className="px-2 py-2 font-medium">აღწერა</th>
            <th className="px-2 py-2 font-medium">კომენტარი</th>
            <th className="px-2 py-2 font-medium">გადახდა</th>
            {showDriver && <th className="px-2 py-2 font-medium">მომზიდავი</th>}
            <th className="px-2 py-2 text-right font-medium">თანხა</th>
            {showReviewed && (
              <th className="px-2 py-2 text-center font-medium" title="აისახა ანგარიშზე / ბარათზე">
                აისახა
              </th>
            )}
            {onDelete && <th className="px-2 py-2 font-medium">წაშლა</th>}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const t = g.primary;
            const ids = g.items.map((x) => x.id);
            const reviewed =
              ids.length > 0 && ids.every((id) => Boolean(bankLedgerReviewed?.[id]));
            const open = openKey === g.key;
            const isSaleGroup = t.type === "sale" && g.productCount > 1;
            const description =
              t.type === "sale" ? saleGroupDescription(g.items as Sale[]) : txLabel(t);

            return (
              <Fragment key={g.key}>
                <tr
                  className={`border-b border-zinc-800/50 ${
                    showReviewed && !reviewed ? "bg-amber-950/10" : ""
                  } ${isSaleGroup ? "cursor-pointer hover:bg-zinc-800/30" : ""} ${
                    open ? "bg-sky-950/20" : ""
                  }`}
                  onClick={() => {
                    if (isSaleGroup) setOpenKey((prev) => (prev === g.key ? null : g.key));
                  }}
                >
                  <td className="px-2 py-2.5 whitespace-nowrap text-zinc-400">{formatDate(t.date)}</td>
                  <td
                    className={`px-2 py-2.5 ${
                      t.type === "sale"
                        ? "text-emerald-400"
                        : t.type === "deposit"
                          ? "text-sky-400"
                          : "text-red-400"
                    }`}
                  >
                    {t.type === "sale"
                      ? t.paymentStatus === "ბე (ავანსი)" && !t.orderCompletedAt
                        ? "ბე"
                        : "გაყიდვა"
                      : t.type === "deposit"
                        ? "შენატანი"
                        : "ხარჯი"}
                    {t.source === "branch" && <span className="ml-1 text-xs text-zinc-500">📱</span>}
                    {t.source === "import" && <span className="ml-1 text-xs text-zinc-500">📊</span>}
                    {t.source === "distribucia" && (
                      <span className="ml-1 text-xs text-zinc-500" title="დისტრიბუციის აპი">
                        🚐
                      </span>
                    )}
                    {isSaleGroup && (
                      <span className="ml-1 text-[10px] text-zinc-500">{open ? "▲" : "▼"}</span>
                    )}
                  </td>
                  {showBranch && <td className="truncate px-2 py-2.5">{t.branch}</td>}
                  <td className="truncate px-2 py-2.5" title={description}>
                    {description}
                    {isSaleGroup && (
                      <span className="ml-2 text-[10px] text-zinc-500">{g.productCount} ხაზი</span>
                    )}
                  </td>
                  <td className="truncate px-2 py-2.5 text-zinc-500" title={t.comment || txDetail(t)}>
                    {t.comment || txDetail(t)}
                  </td>
                  <td className="px-2 py-2.5">
                    <PaymentMethodCell transaction={t} onUpdatePayment={onUpdatePayment} />
                  </td>
                  {showDriver && (
                    <td className="truncate px-2 py-2.5">
                      <DriverCell transaction={t} employees={employees} onUpdateDriver={onUpdateDriver} />
                    </td>
                  )}
                  <td
                    className={`px-2 py-2.5 text-right font-medium tabular-nums ${
                      t.type === "sale"
                        ? "text-emerald-400"
                        : t.type === "deposit"
                          ? "text-sky-400"
                          : "text-red-400"
                    }`}
                  >
                    {t.type === "sale" || t.type === "deposit" ? "+" : "-"}
                    {formatMoney(g.amount)}
                  </td>
                  {showReviewed && (
                    <td className="px-2 py-2.5 text-center">
                      <ReviewedCell ids={ids} reviewed={reviewed} onToggleReview={onToggleReview} />
                    </td>
                  )}
                  {onDelete && (
                    <td className="px-2 py-2.5">
                      <DeleteRow id={t.id} onDelete={onDelete} />
                    </td>
                  )}
                </tr>
                {open && isSaleGroup && (
                  <tr className="border-b border-sky-900/30 bg-zinc-950/40">
                    <td colSpan={colCount} className="px-3 py-3">
                      <div className="grid grid-cols-[minmax(0,1fr)_5rem_6.5rem_7rem] gap-x-3 border-b border-zinc-800 pb-1 text-[11px] uppercase tracking-wide text-zinc-500">
                        <span>პროდუქტი</span>
                        <span className="text-right">რაოდენობა</span>
                        <span className="text-right">ფასი</span>
                        <span className="text-right">თანხა</span>
                      </div>
                      {g.items.map((item) =>
                        item.type === "sale" ? (
                          <div
                            key={item.id}
                            className="grid grid-cols-[minmax(0,1fr)_5rem_6.5rem_7rem] gap-x-3 border-t border-zinc-800/60 py-1.5 text-sm"
                          >
                            <span className="truncate">{item.productName}</span>
                            <span className="text-right tabular-nums">{item.quantity}</span>
                            <span className="text-right tabular-nums text-zinc-400">{formatMoney(item.unitPrice)}</span>
                            <span className="text-right tabular-nums text-emerald-400">{formatMoney(item.amount)}</span>
                          </div>
                        ) : null
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export { groupTransactionsForDisplay };
