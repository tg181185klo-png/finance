"use client";

import { useMemo, type ReactNode } from "react";
import type { Branch, Obligation, Sale, Transaction } from "@/lib/types";
import { BRANCHES } from "@/lib/constants";
import { STANDARD_EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { txMatchesBranchFilter } from "@/lib/branch-allocation";
import { txInPeriod } from "@/lib/period-filter";
import {
  formatMoney,
  isCreditOrder,
  isDueUrgent,
  isPaidGoodsToDeliver,
  saleCreditPaid,
  saleCreditRemaining,
  saleQuantityRemaining,
  txPaymentMethod,
} from "@/lib/utils";

type Scope = "ყველა" | Branch;

const SCOPES: { id: Scope; label: string }[] = [
  { id: "ყველა", label: "ყველა ერთად" },
  ...BRANCHES.map((b) => ({ id: b, label: b })),
];

function saleIncome(sale: Sale) {
  const method = txPaymentMethod(sale);
  if (isCreditOrder(sale) || method === "კონსიგნაცია") return saleCreditPaid(sale);
  return sale.amount;
}

function txLabel(t: Transaction) {
  if (t.type === "sale") return `${t.buyerName || t.comment || "გაყიდვა"} · ${t.productName} × ${t.quantity}`;
  if (t.type === "expense") return `${t.category}${t.comment ? ` · ${t.comment}` : ""}`;
  return t.comment || "შენატანი";
}

function txKind(t: Transaction) {
  if (t.type === "sale") return "შემოსავალი";
  if (t.type === "expense") return "ხარჯი";
  return "შენატანი";
}

function matchesScope(t: Transaction, scope: Scope) {
  return txMatchesBranchFilter(t, scope);
}

function obligationMatches(o: Obligation, scope: Scope) {
  if (scope === "ყველა") return true;
  return o.branch === scope;
}

const CATEGORY_ORDER = STANDARD_EXPENSE_CATEGORIES as readonly string[];

function groupByCategory<T>(items: T[], categoryOf: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const name = categoryOf(item).trim() || "სხვა";
    const list = map.get(name) ?? [];
    list.push(item);
    map.set(name, list);
  }
  const known = CATEGORY_ORDER.filter((name) => map.has(name));
  const rest = [...map.keys()]
    .filter((name) => !CATEGORY_ORDER.includes(name))
    .sort((a, b) => a.localeCompare(b, "ka"));
  return [...known, ...rest].map((name) => ({
    name,
    items: map.get(name) ?? [],
  }));
}

export default function PublicReport({
  transactions,
  obligations,
  month,
  from,
  to,
}: {
  transactions: Transaction[];
  obligations: Record<string, Obligation[]>;
  month: string;
  from: string;
  to: string;
}) {
  const blocks = useMemo(() => {
    return SCOPES.map((scope) => {
      const inScope = transactions.filter(
        (t) => txInPeriod(t.date, from, to) && matchesScope(t, scope.id)
      );
      const income = inScope
        .filter((t): t is Sale => t.type === "sale" && saleIncome(t) > 0)
        .sort((a, b) => b.date.localeCompare(a.date));
      const expenses = inScope
        .filter((t) => t.type === "expense")
        .sort((a, b) => b.date.localeCompare(a.date));
      const payables = (obligations[month] ?? []).filter(
        (o) => o.amount - o.paid > 0 && obligationMatches(o, scope.id)
      );
      const receivables = inScope.filter(
        (t): t is Sale =>
          t.type === "sale" && isCreditOrder(t) && saleCreditRemaining(t) > 0 && !isPaidGoodsToDeliver(t)
      );
      const goods = inScope.filter((t): t is Sale => t.type === "sale" && isPaidGoodsToDeliver(t));
      const incomeSum = income.reduce((s, t) => s + saleIncome(t), 0);
      const expenseSum = expenses.reduce((s, t) => s + t.amount, 0);
      const payableSum = payables.reduce((s, o) => s + (o.amount - o.paid), 0);
      return {
        ...scope,
        income,
        expenses,
        payables,
        receivables,
        goods,
        txs: [...inScope].sort((a, b) => b.date.localeCompare(a.date)),
        incomeSum,
        expenseSum,
        payableSum,
      };
    });
  }, [transactions, obligations, month, from, to]);

  return (
    <div className="space-y-3">
      <nav className="sticky top-0 z-10 flex flex-wrap gap-2 rounded-xl border border-zinc-800 bg-zinc-950/95 p-2 backdrop-blur">
        {blocks.map((b) => (
          <a
            key={b.id}
            href={`#report-${b.id}`}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:border-emerald-500 hover:text-emerald-300"
            onClick={() => {
              const el = document.getElementById(`report-${b.id}`);
              if (el instanceof HTMLDetailsElement) el.open = true;
            }}
          >
            {b.label}
          </a>
        ))}
      </nav>

      {blocks.map((b) => {
        const expenseGroups = groupByCategory(
          b.expenses.filter((t) => t.type === "expense"),
          (ex) => (ex.type === "expense" ? ex.category : "სხვა")
        );
        const payableGroups = groupByCategory(b.payables, (o) => o.category || "სხვა");
        const txGroups = [
          { name: "შემოსავალი", items: b.txs.filter((t) => t.type === "sale") },
          { name: "ხარჯი", items: b.txs.filter((t) => t.type === "expense") },
          { name: "შენატანი", items: b.txs.filter((t) => t.type === "deposit") },
        ].filter((g) => g.items.length > 0);
        return (
        <Fold
          key={b.id}
          id={`report-${b.id}`}
          title={b.label}
          hint={`${from} — ${to} · შემოსავალი ${formatMoney(b.incomeSum)} · ხარჯი ${formatMoney(b.expenseSum)} · ვალდებულება ${formatMoney(b.payableSum)} · ${b.txs.length} ტრანზაქცია`}
          large
        >
          <Fold title="შემოსავალი" hint={`${b.income.length} · ${formatMoney(b.incomeSum)}`}>
            {b.income.length === 0 ? (
              <Empty text="შემოსავალი არ არის" />
            ) : (
              <table className="w-full min-w-[640px] table-fixed text-sm">
                <colgroup>
                  <col className="w-28" />
                  {b.id === "ყველა" && <col className="w-28" />}
                  <col />
                  <col className="w-28" />
                </colgroup>
                <thead className="text-left text-xs text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="px-3 py-2">თარიღი</th>
                    {b.id === "ყველა" && <th className="px-3 py-2">ობიექტი</th>}
                    <th className="px-3 py-2">ვინ · პროდუქტი</th>
                    <th className="px-3 py-2 text-right">თანხა</th>
                  </tr>
                </thead>
                <tbody>
                  {b.income.map((sale) => (
                    <tr key={sale.id} className="border-b border-zinc-800/60">
                      <td className="px-3 py-2 whitespace-nowrap">{sale.date.slice(0, 10)}</td>
                      {b.id === "ყველა" && <td className="px-3 py-2">{sale.branch}</td>}
                      <td className="truncate px-3 py-2">{txLabel(sale)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-400">
                        {formatMoney(saleIncome(sale))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Fold>

          <Fold title="ხარჯი" hint={`${b.expenses.length} · ${formatMoney(b.expenseSum)}`}>
            {expenseGroups.length === 0 ? (
              <Empty text="ხარჯი არ არის" />
            ) : (
              <div className="space-y-2 p-2">
                {expenseGroups.map((group) => (
                  <Fold
                    key={group.name}
                    title={group.name}
                    hint={`${group.items.length} · ${formatMoney(group.items.reduce((s, ex) => s + ex.amount, 0))}`}
                  >
                    <table className="w-full min-w-[520px] table-fixed text-sm">
                      <thead className="text-left text-xs text-zinc-500">
                        <tr className="border-b border-zinc-800">
                          <th className="px-3 py-2">თარიღი</th>
                          {b.id === "ყველა" && <th className="px-3 py-2">ობიექტი</th>}
                          <th className="px-3 py-2">კომენტარი</th>
                          <th className="px-3 py-2 text-right">თანხა</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((ex) =>
                          ex.type === "expense" ? (
                            <tr key={ex.id} className="border-b border-zinc-800/60">
                              <td className="px-3 py-2 whitespace-nowrap">{ex.date.slice(0, 10)}</td>
                              {b.id === "ყველა" && <td className="px-3 py-2">{ex.branch}</td>}
                              <td className="truncate px-3 py-2 text-zinc-400">{ex.comment || "—"}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-red-400">
                                {formatMoney(ex.amount)}
                              </td>
                            </tr>
                          ) : null
                        )}
                      </tbody>
                    </table>
                  </Fold>
                ))}
              </div>
            )}
          </Fold>

          <Fold
            title="მიმდინარე ვალდებულებები"
            hint={`გადასახდელი ${formatMoney(b.payableSum)} · მისაღები ${b.receivables.length} · გასაცემი ${b.goods.length}`}
          >
            <div className="space-y-2 p-2">
              <Fold title="გადასახდელი" hint={formatMoney(b.payableSum)}>
                {payableGroups.length === 0 ? (
                  <Empty text="გადასახდელი არ დარჩა" />
                ) : (
                  <div className="space-y-2 p-2">
                    {payableGroups.map((group) => (
                      <Fold
                        key={group.name}
                        title={group.name}
                        hint={formatMoney(group.items.reduce((s, o) => s + (o.amount - o.paid), 0))}
                      >
                        <ul className="space-y-1 px-2 py-1">
                          {group.items.map((o) => {
                            const urgent = isDueUrgent(o.plannedPayDate);
                            const left = o.amount - o.paid;
                            return (
                              <li
                                key={o.id}
                                className={`flex flex-wrap items-baseline justify-between gap-2 rounded-lg px-2 py-1 text-sm ${
                                  urgent ? "bg-red-950/40 text-red-300" : "text-zinc-200"
                                }`}
                              >
                                <span>
                                  {o.name}
                                  {o.responsible ? <span className="text-zinc-500"> · {o.responsible}</span> : null}
                                  <span className="text-zinc-500"> · {o.branch}</span>
                                  {o.plannedPayDate ? (
                                    <span className={urgent ? "font-semibold text-red-400" : "text-zinc-500"}>
                                      {" · "}
                                      {o.plannedPayDate}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="tabular-nums text-amber-300">{formatMoney(left)}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </Fold>
                    ))}
                  </div>
                )}
              </Fold>
              <Fold title="მისაღები — ბე" hint={String(b.receivables.length)}>
                  {b.receivables.length === 0 ? (
                    <Empty text="მისაღები არ დარჩა" />
                  ) : (
                    <ul className="space-y-1">
                      {b.receivables.map((sale) => (
                        <li key={sale.id} className="flex flex-wrap items-baseline justify-between gap-2 px-2 py-1 text-sm">
                          <span>
                            {sale.buyerName || sale.comment || "მყიდველი"}
                            <span className="text-zinc-500"> · {sale.productName} · {sale.branch}</span>
                          </span>
                          <span className="tabular-nums text-amber-300">{formatMoney(saleCreditRemaining(sale))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
              </Fold>
              <Fold title="გასაცემი პროდუქცია" hint={String(b.goods.length)}>
                  {b.goods.length === 0 ? (
                    <Empty text="გასაცემი არ დარჩა" />
                  ) : (
                    <ul className="space-y-1">
                      {b.goods.map((sale) => (
                        <li key={sale.id} className="px-2 py-1 text-sm">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span>
                              {sale.buyerName || sale.comment || "მყიდველი"}
                              <span className="text-zinc-500"> · {sale.productName} · {sale.branch}</span>
                            </span>
                            <span className="tabular-nums text-sky-300">{saleQuantityRemaining(sale)} ც</span>
                          </div>
                          <p className="text-[11px] text-zinc-500">თანხა სრულად გადახდილია</p>
                        </li>
                      ))}
                    </ul>
                  )}
              </Fold>
            </div>
          </Fold>

          <Fold title="ყველა ტრანზაქცია" hint={`${b.txs.length}`}>
            {txGroups.length === 0 ? (
              <Empty text="ტრანზაქცია არ არის" />
            ) : (
              <div className="space-y-2 p-2">
                {txGroups.map((group) => (
                  <Fold key={group.name} title={group.name} hint={String(group.items.length)}>
                    <TxTable rows={group.items} showBranch={b.id === "ყველა"} />
                  </Fold>
                ))}
              </div>
            )}
          </Fold>
        </Fold>
        );
      })}
    </div>
  );
}

function TxTable({ rows, showBranch }: { rows: Transaction[]; showBranch: boolean }) {
  return (
              <table className="w-full min-w-[720px] table-fixed text-sm">
                <colgroup>
                  <col className="w-28" />
                  <col className="w-28" />
                  {showBranch && <col className="w-28" />}
                  <col />
                  <col className="w-28" />
                </colgroup>
                <thead className="text-left text-xs text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="px-3 py-2">თარიღი</th>
                    <th className="px-3 py-2">ტიპი</th>
                    {showBranch && <th className="px-3 py-2">ობიექტი</th>}
                    <th className="px-3 py-2">აღწერა</th>
                    <th className="px-3 py-2 text-right">თანხა</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} className="border-b border-zinc-800/60">
                      <td className="px-3 py-2 whitespace-nowrap">{t.date.slice(0, 10)}</td>
                      <td className="px-3 py-2">{txKind(t)}</td>
                      {showBranch && <td className="px-3 py-2">{t.branch}</td>}
                      <td className="truncate px-3 py-2">{txLabel(t)}</td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          t.type === "expense" ? "text-red-400" : "text-emerald-400"
                        }`}
                      >
                        {formatMoney(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
  );
}

function Fold({
  id,
  title,
  hint,
  large,
  children,
}: {
  id?: string;
  title: string;
  hint?: string;
  large?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      className={`group scroll-mt-16 overflow-hidden rounded-xl border border-zinc-800 ${
        large ? "bg-zinc-900/40" : "bg-zinc-950/40"
      }`}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 hover:bg-zinc-800/40 [&::-webkit-details-marker]:hidden">
        <span className="inline-block text-xs text-zinc-500 transition group-open:rotate-90">▶</span>
        <span className={large ? "text-base font-semibold text-zinc-50" : "text-sm font-semibold text-zinc-100"}>
          {title}
        </span>
        {hint ? <span className="ml-auto text-xs text-zinc-500">{hint}</span> : null}
      </summary>
      <div className={`border-t border-zinc-800 ${large ? "space-y-2 p-2" : "max-h-[32rem] overflow-auto"}`}>
        {children}
      </div>
    </details>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-3 text-sm text-zinc-500">{text}</p>;
}
