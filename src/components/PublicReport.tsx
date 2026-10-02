"use client";

import { useMemo, useState, type ReactNode } from "react";
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
type Card = "income" | "expense" | "obligation";

const SCOPES: { id: Scope; label: string }[] = [
  { id: "ყველა", label: "ყველა ერთად" },
  ...BRANCHES.map((b) => ({ id: b, label: b })),
];

function saleIncome(sale: Sale) {
  const method = txPaymentMethod(sale);
  if (isCreditOrder(sale) || method === "კონსიგნაცია") return saleCreditPaid(sale);
  return sale.amount;
}

const MONTHS = ["იან", "თებ", "მარ", "აპრ", "მაი", "ივნ", "ივლ", "აგვ", "სექ", "ოქტ", "ნოე", "დეკ"];

function dayMonth(iso?: string) {
  if (!iso) return "—";
  const day = iso.slice(8, 10);
  const month = MONTHS[Number(iso.slice(5, 7)) - 1];
  if (!day || !month) return "—";
  return `${Number(day)} ${month}`;
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
  const [open, setOpen] = useState<{ scope: Scope; card: Card } | null>(null);
  const [openBranch, setOpenBranch] = useState<Branch | null>(null);

  const blocks = useMemo(() => {
    return SCOPES.map((scope) => {
      const inScope = transactions.filter(
        (t) => txInPeriod(t.date, from, to) && txMatchesBranchFilter(t, scope.id)
      );
      const income = inScope
        .filter((t): t is Sale => t.type === "sale" && saleIncome(t) > 0)
        .sort((a, b) => b.date.localeCompare(a.date));
      const expenses = inScope
        .filter((t) => t.type === "expense")
        .sort((a, b) => b.date.localeCompare(a.date));
      const payables = (obligations[month] ?? []).filter(
        (o) => o.amount - o.paid > 0 && (scope.id === "ყველა" || o.branch === scope.id)
      );
      const receivables = inScope.filter(
        (t): t is Sale =>
          t.type === "sale" && isCreditOrder(t) && saleCreditRemaining(t) > 0 && !isPaidGoodsToDeliver(t)
      );
      const goods = inScope.filter((t): t is Sale => t.type === "sale" && isPaidGoodsToDeliver(t));
      return {
        ...scope,
        income,
        expenses,
        payables,
        receivables,
        goods,
        incomeSum: income.reduce((s, t) => s + saleIncome(t), 0),
        expenseSum: expenses.reduce((s, t) => s + t.amount, 0),
        payableSum: payables.reduce((s, o) => s + (o.amount - o.paid), 0),
      };
    });
  }, [transactions, obligations, month, from, to]);

  function toggle(scope: Scope, card: Card) {
    setOpen((cur) => (cur?.scope === scope && cur.card === card ? null : { scope, card }));
  }

  const company = blocks[0];
  const branches = blocks.slice(1);

  return (
    <div className="space-y-4">
      {company && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-200">{company.label}</h2>
          <ScopeCards
            block={company}
            active={open?.scope === company.id ? open.card : null}
            showBranch
            onToggle={(card) => toggle(company.id, card)}
          />
        </section>
      )}

      <div className="space-y-2">
        {branches.map((b) => {
          const opened = openBranch === b.id;
          return (
            <section key={b.id} className="rounded-xl border border-zinc-800 bg-zinc-950/40">
              <button
                type="button"
                onClick={() => setOpenBranch(opened ? null : (b.id as Branch))}
                className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-zinc-900/60"
              >
                <span className={`text-xs text-zinc-500 ${opened ? "rotate-90" : ""}`}>▶</span>
                <span className="w-28 shrink-0 text-sm font-semibold text-zinc-100">{b.label}</span>
                <span className="grid flex-1 grid-cols-3 gap-2 text-xs">
                  <span>
                    <span className="block text-[10px] text-zinc-500">შემოსავალი</span>
                    <span className="text-emerald-400">{formatMoney(b.incomeSum)}</span>
                  </span>
                  <span>
                    <span className="block text-[10px] text-zinc-500">ხარჯი</span>
                    <span className="text-red-400">{formatMoney(b.expenseSum)}</span>
                  </span>
                  <span>
                    <span className="block text-[10px] text-zinc-500">ვალდებულება</span>
                    <span className="text-amber-300">{formatMoney(b.payableSum)}</span>
                  </span>
                </span>
              </button>
              {opened && (
                <div className="border-t border-zinc-800 p-2">
                  <ScopeCards
                    block={b}
                    active={open?.scope === b.id ? open.card : null}
                    showBranch={false}
                    onToggle={(card) => toggle(b.id, card)}
                  />
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ScopeCards({
  block: b,
  active,
  showBranch,
  onToggle,
}: {
  block: {
    id: Scope;
    income: Sale[];
    expenses: Transaction[];
    payables: Obligation[];
    receivables: Sale[];
    goods: Sale[];
    incomeSum: number;
    expenseSum: number;
    payableSum: number;
  };
  active: Card | null;
  showBranch: boolean;
  onToggle: (card: Card) => void;
}) {
  return (
    <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <CardButton
                label="შემოსავალი"
                value={formatMoney(b.incomeSum)}
                tone="text-emerald-400 border-emerald-900/50"
                on={active === "income"}
                onClick={() => onToggle("income")}
              />
              <CardButton
                label="ხარჯი"
                value={formatMoney(b.expenseSum)}
                tone="text-red-400 border-red-900/50"
                on={active === "expense"}
                onClick={() => onToggle("expense")}
              />
              <CardButton
                label="მიმდინარე ვალდებულება"
                value={formatMoney(b.payableSum)}
                tone="text-amber-300 border-amber-900/50"
                on={active === "obligation"}
                onClick={() => onToggle("obligation")}
              />
            </div>

            {active === "income" && (
              <Lines
                cols={showBranch ? "grid-cols-[3.2rem_4.2rem_minmax(0,1fr)_4.4rem]" : "grid-cols-[3.2rem_minmax(0,1fr)_4.4rem]"}
                heads={showBranch ? ["თარიღი", "ობიექტი", "კლიენტი", "თანხა"] : ["თარიღი", "კლიენტი", "თანხა"]}
              >
                {b.income.length === 0 ? (
                  <Empty text="შემოსავალი არ არის" />
                ) : (
                  b.income.map((sale) => (
                    <Line
                      key={sale.id}
                      cols={showBranch ? "grid-cols-[3.2rem_4.2rem_minmax(0,1fr)_4.4rem]" : "grid-cols-[3.2rem_minmax(0,1fr)_4.4rem]"}
                      cells={[
                        dayMonth(sale.date),
                        ...(showBranch ? [sale.branch] : []),
                        sale.buyerName || sale.comment || "—",
                        formatMoney(saleIncome(sale)),
                      ]}
                      amountClass="text-emerald-400"
                    />
                  ))
                )}
              </Lines>
            )}

            {active === "expense" && (
              <Lines
                cols={
                  showBranch
                    ? "grid-cols-[3.2rem_4.2rem_4.6rem_minmax(0,1fr)_4.4rem]"
                    : "grid-cols-[3.2rem_4.6rem_minmax(0,1fr)_4.4rem]"
                }
                heads={showBranch ? ["თარიღი", "ობიექტი", "კატეგორია", "რისთვის", "თანხა"] : ["თარიღი", "კატეგორია", "რისთვის", "თანხა"]}
              >
                {b.expenses.length === 0 ? (
                  <Empty text="ხარჯი არ არის" />
                ) : (
                  b.expenses.map((ex) =>
                    ex.type === "expense" ? (
                      <Line
                        key={ex.id}
                        cols={
                          showBranch
                            ? "grid-cols-[3.2rem_4.2rem_4.6rem_minmax(0,1fr)_4.4rem]"
                            : "grid-cols-[3.2rem_4.6rem_minmax(0,1fr)_4.4rem]"
                        }
                        cells={[
                          dayMonth(ex.date),
                          ...(showBranch ? [ex.branch] : []),
                          ex.category,
                          ex.comment || "—",
                          formatMoney(ex.amount),
                        ]}
                        amountClass="text-red-400"
                      />
                    ) : null
                  )
                )}
              </Lines>
            )}

            {active === "obligation" && (
              <Lines
                cols="grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_3.2rem_4.4rem]"
                heads={["ვალდებულება", "ვისი", "ვადა", "თანხა"]}
              >
                {b.payables.length === 0 && b.receivables.length === 0 && b.goods.length === 0 ? (
                  <Empty text="მიმდინარე ვალდებულება არ დარჩა" />
                ) : (
                  <>
                    {b.payables.map((o) => (
                      <Line
                        key={o.id}
                        cols="grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_3.2rem_4.4rem]"
                        cells={[o.name, o.responsible || "—", dayMonth(o.plannedPayDate), formatMoney(o.amount - o.paid)]}
                        amountClass={isDueUrgent(o.plannedPayDate) ? "text-red-400" : "text-amber-300"}
                        dueUrgent={isDueUrgent(o.plannedPayDate)}
                      />
                    ))}
                    {b.receivables.map((sale) => (
                      <Line
                        key={sale.id}
                        cols="grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_3.2rem_4.4rem]"
                        cells={[
                          `მისაღები · ${sale.productName}`,
                          sale.buyerName || sale.comment || "—",
                          dayMonth(sale.creditDueDate),
                          formatMoney(saleCreditRemaining(sale)),
                        ]}
                        amountClass="text-amber-300"
                      />
                    ))}
                    {b.goods.map((sale) => (
                      <Line
                        key={sale.id}
                        cols="grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_3.2rem_4.4rem]"
                        cells={[
                          `გასაცემი · ${sale.productName}`,
                          sale.buyerName || sale.comment || "—",
                          dayMonth(sale.creditDueDate),
                          `${saleQuantityRemaining(sale)} ც`,
                        ]}
                        amountClass="text-sky-300"
                      />
                    ))}
                  </>
                )}
              </Lines>
            )}
    </div>
  );
}

function CardButton({
  label,
  value,
  tone,
  on,
  onClick,
}: {
  label: string;
  value: string;
  tone: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border bg-zinc-950/40 px-3 py-3 text-left transition hover:-translate-y-0.5 hover:brightness-125 ${tone} ${
        on ? "ring-2 ring-sky-400" : ""
      }`}
    >
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </button>
  );
}

function Lines({ cols, heads, children }: { cols: string; heads: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <div className="min-w-[22rem]">
      <div className={`grid ${cols} gap-x-2 px-2 py-1 text-[10px] text-zinc-500`}>
        {heads.map((head) => (
          <span key={head} className="truncate">
            {head}
          </span>
        ))}
      </div>
      {children}
      </div>
    </div>
  );
}

function Line({
  cols,
  cells,
  amountClass,
  dueUrgent,
}: {
  cols: string;
  cells: string[];
  amountClass: string;
  dueUrgent?: boolean;
}) {
  return (
    <div className={`grid ${cols} items-baseline gap-x-2 border-t border-zinc-800/70 px-2 py-1.5 text-[11px] leading-tight`}>
      {cells.map((cell, i) => {
        const last = i === cells.length - 1;
        const due = dueUrgent && i === cells.length - 2;
        return (
          <span
            key={`${i}-${cell}`}
            className={`truncate ${last ? `text-right tabular-nums ${amountClass}` : due ? "font-medium text-red-400" : i === 0 ? "text-zinc-300" : "text-zinc-400"}`}
          >
            {cell}
          </span>
        );
      })}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-3 py-2 text-sm text-zinc-500">{text}</p>;
}
