"use client";

import { useMemo, type ReactNode } from "react";
import type { Branch, Obligation, Sale, Transaction } from "@/lib/types";
import { BRANCHES } from "@/lib/constants";
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
    <div className="space-y-8">
      <nav className="sticky top-0 z-10 flex flex-wrap gap-2 rounded-xl border border-zinc-800 bg-zinc-950/95 p-2 backdrop-blur">
        {blocks.map((b) => (
          <a
            key={b.id}
            href={`#report-${b.id}`}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:border-emerald-500 hover:text-emerald-300"
          >
            {b.label}
          </a>
        ))}
      </nav>

      {blocks.map((b) => (
        <section key={b.id} id={`report-${b.id}`} className="scroll-mt-16 space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="text-lg font-semibold text-zinc-50">{b.label}</h2>
            <p className="mt-1 text-xs text-zinc-500">{from} — {to}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Sum label="შემოსავალი" value={formatMoney(b.incomeSum)} tone="text-emerald-400" />
              <Sum label="ხარჯი" value={formatMoney(b.expenseSum)} tone="text-red-400" />
              <Sum label="ვალდებულება" value={formatMoney(b.payableSum)} tone="text-amber-300" />
              <Sum label="ტრანზაქცია" value={String(b.txs.length)} tone="text-zinc-100" />
            </div>
          </div>

          <Block title="შემოსავალი" hint={`${b.income.length} · ${formatMoney(b.incomeSum)}`}>
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
          </Block>

          <Block title="ხარჯი" hint={`${b.expenses.length} · ${formatMoney(b.expenseSum)}`}>
            {b.expenses.length === 0 ? (
              <Empty text="ხარჯი არ არის" />
            ) : (
              <table className="w-full min-w-[640px] table-fixed text-sm">
                <colgroup>
                  <col className="w-28" />
                  {b.id === "ყველა" && <col className="w-28" />}
                  <col className="w-36" />
                  <col />
                  <col className="w-28" />
                </colgroup>
                <thead className="text-left text-xs text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="px-3 py-2">თარიღი</th>
                    {b.id === "ყველა" && <th className="px-3 py-2">ობიექტი</th>}
                    <th className="px-3 py-2">კატეგორია</th>
                    <th className="px-3 py-2">კომენტარი</th>
                    <th className="px-3 py-2 text-right">თანხა</th>
                  </tr>
                </thead>
                <tbody>
                  {b.expenses.map((ex) =>
                    ex.type === "expense" ? (
                      <tr key={ex.id} className="border-b border-zinc-800/60">
                        <td className="px-3 py-2 whitespace-nowrap">{ex.date.slice(0, 10)}</td>
                        {b.id === "ყველა" && <td className="px-3 py-2">{ex.branch}</td>}
                        <td className="truncate px-3 py-2">{ex.category}</td>
                        <td className="truncate px-3 py-2 text-zinc-400">{ex.comment || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-400">
                          {formatMoney(ex.amount)}
                        </td>
                      </tr>
                    ) : null
                  )}
                </tbody>
              </table>
            )}
          </Block>

          <Block
            title="მიმდინარე ვალდებულებები"
            hint={`გადასახდელი ${formatMoney(b.payableSum)} · მისაღები ${b.receivables.length} · გასაცემი ${b.goods.length}`}
          >
            {b.payables.length === 0 && b.receivables.length === 0 && b.goods.length === 0 ? (
              <Empty text="მიმდინარე ვალდებულება არ დარჩა" />
            ) : (
              <div className="space-y-4 p-3">
                <ObligationGroup title="გადასახდელი">
                  {b.payables.length === 0 ? (
                    <Empty text="გადასახდელი არ დარჩა" />
                  ) : (
                    <ul className="space-y-1">
                      {b.payables.map((o) => {
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
                  )}
                </ObligationGroup>
                <ObligationGroup title="მისაღები — ბე">
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
                </ObligationGroup>
                <ObligationGroup title="გასაცემი პროდუქცია">
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
                </ObligationGroup>
              </div>
            )}
          </Block>

          <Block title="ყველა ტრანზაქცია" hint={`${b.txs.length}`}>
            {b.txs.length === 0 ? (
              <Empty text="ტრანზაქცია არ არის" />
            ) : (
              <table className="w-full min-w-[720px] table-fixed text-sm">
                <colgroup>
                  <col className="w-28" />
                  <col className="w-28" />
                  {b.id === "ყველა" && <col className="w-28" />}
                  <col />
                  <col className="w-28" />
                </colgroup>
                <thead className="text-left text-xs text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="px-3 py-2">თარიღი</th>
                    <th className="px-3 py-2">ტიპი</th>
                    {b.id === "ყველა" && <th className="px-3 py-2">ობიექტი</th>}
                    <th className="px-3 py-2">აღწერა</th>
                    <th className="px-3 py-2 text-right">თანხა</th>
                  </tr>
                </thead>
                <tbody>
                  {b.txs.map((t) => (
                    <tr key={t.id} className="border-b border-zinc-800/60">
                      <td className="px-3 py-2 whitespace-nowrap">{t.date.slice(0, 10)}</td>
                      <td className="px-3 py-2">{txKind(t)}</td>
                      {b.id === "ყველა" && <td className="px-3 py-2">{t.branch}</td>}
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
            )}
          </Block>
        </section>
      ))}
    </div>
  );
}

function Sum({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/30">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-800 px-4 py-2">
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        <p className="text-xs text-zinc-500">{hint}</p>
      </div>
      <div className="max-h-[28rem] overflow-auto">{children}</div>
    </div>
  );
}

function ObligationGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">{title}</p>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-3 text-sm text-zinc-500">{text}</p>;
}
