"use client";

import { Fragment, useMemo, useState } from "react";
import type { Branch, Employee, PaymentMethod, Sale, Transaction } from "@/lib/types";
import { BRANCHES } from "@/lib/constants";
import { PAYMENT_METHODS } from "@/lib/dashboard-data";
import { groupTransactionsForDisplay } from "@/lib/tx-display-groups";
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
import { confirmedActionPin } from "@/lib/action-password";

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
  requirePin,
}: {
  transaction: Transaction;
  onUpdatePayment?: (id: string, paymentMethod: PaymentMethod) => Promise<boolean>;
  requirePin?: boolean;
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
        if (requirePin && !confirmedActionPin()) {
          e.target.value = value;
          return;
        }
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
  requirePin,
}: {
  transaction: Transaction;
  employees?: Employee[];
  onUpdateDriver?: (id: string, driverEmployeeId: string, driverEmployeeName: string) => Promise<boolean>;
  requirePin?: boolean;
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
        if (requirePin && !confirmedActionPin()) {
          e.target.value = value;
          return;
        }
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

export type SaleEditPatch = {
  date: string;
  branch: Branch;
  buyerName: string;
  comment: string;
  lines: { id: string; quantity: number; unitPrice: number; productName: string }[];
};

const editInputCls = "w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs";

function SaleEditForm({
  sales,
  onSave,
  onClose,
}: {
  sales: Sale[];
  onSave: (patch: SaleEditPatch) => Promise<boolean>;
  onClose: () => void;
}) {
  const first = sales[0];
  const [date, setDate] = useState(first.date.slice(0, 10));
  const [branch, setBranch] = useState<Branch>(first.branch);
  const [buyerName, setBuyerName] = useState(first.buyerName ?? "");
  const [comment, setComment] = useState(first.comment ?? "");
  const [lines, setLines] = useState(
    sales.map((s) => ({
      id: s.id,
      productName: s.productName,
      quantity: String(s.quantity),
      unitPrice: String(s.unitPrice),
    }))
  );
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await onSave({
          date,
          branch,
          buyerName,
          comment,
          lines: lines.map((line) => ({
            id: line.id,
            productName: line.productName.trim(),
            quantity: Number(line.quantity),
            unitPrice: Number(line.unitPrice),
          })),
        });
        setBusy(false);
        if (ok) onClose();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="text-xs text-zinc-400">
          თარიღი
          <input type="date" className={`${editInputCls} mt-1`} value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="text-xs text-zinc-400">
          ფილიალი
          <select className={`${editInputCls} mt-1`} value={branch} onChange={(e) => setBranch(e.target.value as Branch)}>
            {BRANCHES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400 sm:col-span-2">
          მომხმარებელი
          <input className={`${editInputCls} mt-1`} value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
        </label>
      </div>
      <label className="block text-xs text-zinc-400">
        კომენტარი
        <input className={`${editInputCls} mt-1`} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      {lines.map((line, idx) => (
        <div key={line.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_7rem]">
          <label className="text-xs text-zinc-400">
            პროდუქტი
            <input
              className={`${editInputCls} mt-1`}
              value={line.productName}
              onChange={(e) =>
                setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, productName: e.target.value } : row)))
              }
            />
          </label>
          <label className="text-xs text-zinc-400">
            რაოდენობა
            <input
              type="number"
              min={0.01}
              step={0.01}
              className={`${editInputCls} mt-1`}
              value={line.quantity}
              onChange={(e) =>
                setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, quantity: e.target.value } : row)))
              }
            />
          </label>
          <label className="text-xs text-zinc-400">
            ფასი
            <input
              type="number"
              min={0.01}
              step={0.01}
              className={`${editInputCls} mt-1`}
              value={line.unitPrice}
              onChange={(e) =>
                setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, unitPrice: e.target.value } : row)))
              }
            />
          </label>
        </div>
      ))}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white disabled:opacity-50">
          {busy ? "..." : "შენახვა"}
        </button>
        <button type="button" onClick={onClose} className="rounded border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300">
          გაუქმება
        </button>
      </div>
    </form>
  );
}

function DeleteRow({
  ids,
  onDelete,
  onDeleteMany,
}: {
  ids: string[];
  onDelete?: (id: string) => Promise<boolean>;
  onDeleteMany?: (ids: string[]) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const unique = [...new Set(ids.filter(Boolean))];

  return (
    <button
      type="button"
      className="rounded border border-red-900/60 px-2 py-1 text-xs text-red-400 hover:bg-red-950/40 disabled:opacity-40"
      disabled={busy || unique.length === 0}
      onClick={async (e) => {
        e.stopPropagation();
        const label = unique.length > 1 ? `წავშალოთ ეს ჩანაწერი (${unique.length} პროდუქტი)?` : "წავშალოთ ეს ჩანაწერი?";
        if (!confirm(label)) return;
        setBusy(true);
        if (onDeleteMany) await onDeleteMany(unique);
        else if (onDelete) {
          for (const id of unique) {
            const ok = await onDelete(id);
            if (!ok) break;
          }
        }
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
  onDeleteMany?: (ids: string[]) => Promise<boolean>;
  onUpdateSale?: (patch: SaleEditPatch) => Promise<boolean>;
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
  onDeleteMany,
  onUpdateSale,
  onUpdatePayment,
  onUpdateDriver,
  onToggleReview,
  emptyText = "ტრანზაქციები არ არის",
}: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);

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
    (onDelete || onUpdateSale ? 1 : 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] table-fixed text-sm">
        <colgroup>
          <col className="w-[9.5rem]" />
          <col className="w-[8%]" />
          {showBranch && <col className="w-[6.5rem]" />}
          <col className="w-[22%]" />
          <col className="w-[14%]" />
          <col className="w-[12%]" />
          {showDriver && <col className="w-[11%]" />}
          <col className="w-[10%]" />
          {showReviewed && <col className="w-[6%]" />}
          {(onDelete || onUpdateSale) && <col className="w-[8.5rem]" />}
        </colgroup>
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
            <th className="px-2 py-2 font-medium">დრო</th>
            <th className="px-2 py-2 font-medium">ტიპი</th>
            {showBranch && <th className="px-2 py-2 font-medium">ფილიალი</th>}
            <th className="px-2 py-2 font-medium">მომხმარებელი</th>
            <th className="px-2 py-2 font-medium">კომენტარი</th>
            <th className="px-2 py-2 font-medium">გადახდა</th>
            {showDriver && <th className="px-2 py-2 font-medium">მომზიდავი</th>}
            <th className="px-2 py-2 text-right font-medium">თანხა</th>
            {showReviewed && (
              <th className="px-2 py-2 text-center font-medium" title="აისახა ანგარიშზე / ბარათზე">
                აისახა
              </th>
            )}
            {(onDelete || onUpdateSale) && <th className="px-2 py-2 font-medium">მოქმედება</th>}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const t = g.primary;
            const ids = g.items.map((x) => x.id);
            const reviewed =
              ids.length > 0 && ids.every((id) => Boolean(bankLedgerReviewed?.[id]));
            const open = openKey === g.key;
            const isSale = t.type === "sale";
            const customer =
              isSale ? (t.buyerName || t.comment || "—").trim() : "—";

            return (
              <Fragment key={g.key}>
                <tr
                  className={`border-b border-zinc-800/50 ${
                    showReviewed && !reviewed ? "bg-amber-950/10" : ""
                  } ${isSale ? "cursor-pointer hover:bg-zinc-800/30" : ""} ${
                    open ? "bg-sky-950/20" : ""
                  }`}
                  onClick={() => {
                    if (isSale) setOpenKey((prev) => (prev === g.key ? null : g.key));
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
                    {isSale && (
                      <span className="ml-1 text-[10px] text-zinc-500">{open ? "▲" : "▼"}</span>
                    )}
                  </td>
                  {showBranch && <td className="truncate px-2 py-2.5">{t.branch}</td>}
                  <td className="truncate px-2 py-2.5" title={customer}>
                    {customer}
                  </td>
                  <td className="truncate px-2 py-2.5 text-zinc-500" title={t.comment || txDetail(t)}>
                    {t.comment || txDetail(t)}
                  </td>
                  <td className="px-2 py-2.5">
                    <PaymentMethodCell
                      transaction={t}
                      onUpdatePayment={onUpdatePayment}
                      requirePin={Boolean(onUpdateSale)}
                    />
                  </td>
                  {showDriver && (
                    <td className="truncate px-2 py-2.5">
                      <DriverCell
                        transaction={t}
                        employees={employees}
                        onUpdateDriver={onUpdateDriver}
                        requirePin={Boolean(onUpdateSale)}
                      />
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
                  {(onDelete || onUpdateSale) && (
                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col items-start gap-1">
                        {onUpdateSale && isSale && (
                          <button
                            type="button"
                            className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:border-emerald-600 hover:text-emerald-300"
                            onClick={() => setEditKey((prev) => (prev === g.key ? null : g.key))}
                          >
                            რედაქტირება
                          </button>
                        )}
                        {onDelete && (
                          <DeleteRow
                            ids={
                              onDeleteMany && isSale
                                ? g.items.filter((item) => item.type === "sale").map((item) => item.id)
                                : [t.id]
                            }
                            onDelete={onDelete}
                            onDeleteMany={onDeleteMany}
                          />
                        )}
                      </div>
                    </td>
                  )}
                </tr>
                {editKey === g.key && isSale && onUpdateSale && (
                  <tr className="border-b border-emerald-900/40 bg-zinc-950/50">
                    <td colSpan={colCount} className="px-3 py-3">
                      <SaleEditForm
                        sales={g.items.filter((item): item is Sale => item.type === "sale")}
                        onSave={onUpdateSale}
                        onClose={() => setEditKey(null)}
                      />
                    </td>
                  </tr>
                )}
                {open && isSale && (
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
