"use client";

import { useMemo, useState } from "react";
import type { Branch, BranchCash, PaymentMethod, Transaction } from "@/lib/types";
import { BRANCHES, PAYMENT_METHODS } from "@/lib/dashboard-data";
import {
  calcBalances,
  currentMonth,
  formatDate,
  formatMoney,
  isCreditOrder,
  isCreditOrderActive,
  monthStartEnd,
  paymentMethodLabel,
  txPaymentMethod,
} from "@/lib/utils";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500";
const labelCls = "mb-1 block text-xs text-zinc-400";
const selectCls = "rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs focus:border-violet-500";
const tabBtn = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm ${on ? "bg-violet-800 text-white" : "text-zinc-500 hover:text-zinc-300"}`;

const BANK_METHOD: PaymentMethod = "ანგარიშზე ჩარიცხვა";

type LedgerRow = {
  id: string;
  date: string;
  branch: Branch | "საერთო";
  kind: "in" | "out";
  label: string;
  amount: number;
  paymentMethod: PaymentMethod;
  transaction: Transaction;
};

type Props = {
  transactions: Transaction[];
  branchCash: Record<Branch, BranchCash>;
  onUpdatePayment: (id: string, paymentMethod: PaymentMethod) => Promise<boolean>;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function txLedgerLabel(t: Transaction): string {
  if (t.type === "sale") return t.buyerName ? `${t.buyerName} · ${t.productName}` : t.productName;
  if (t.type === "deposit") {
    const kind =
      t.kind === "founder" ? "დამფუძნებლის შენატანი" : t.kind === "loan_repayment" ? "ვალის დაბრუნება" : "შენატანი";
    return t.comment || kind;
  }
  return `${t.category}${t.comment ? ` · ${t.comment}` : ""}`;
}

export default function BankAccountPanel({ transactions, branchCash, onUpdatePayment }: Props) {
  const [viewMonth, setViewMonth] = useState(currentMonth());
  const [branchFilter, setBranchFilter] = useState<Branch | "ყველა">("ყველა");
  const [search, setSearch] = useState("");

  const { from, to } = useMemo(() => monthStartEnd(viewMonth), [viewMonth]);

  const currentBalance = useMemo(
    () => calcBalances(transactions, branchFilter, branchCash).bank,
    [transactions, branchFilter, branchCash]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: LedgerRow[] = [];

    for (const t of transactions) {
      if (txPaymentMethod(t) !== BANK_METHOD) continue;
      const date = t.date.slice(0, 10);
      if (date < from || date > to) continue;
      if (branchFilter !== "ყველა" && t.branch !== branchFilter && t.branch !== "საერთო") continue;
      if (t.type === "sale" && isCreditOrder(t) && isCreditOrderActive(t)) continue;

      const kind = t.type === "expense" ? "out" : "in";
      out.push({
        id: t.id,
        date,
        branch: t.branch,
        kind,
        label: txLedgerLabel(t),
        amount: t.amount,
        paymentMethod: txPaymentMethod(t),
        transaction: t,
      });
    }

    return out
      .filter((r) => {
        if (!q) return true;
        return [r.label, r.branch, r.date].join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [transactions, from, to, branchFilter, search]);

  const periodTotals = useMemo(() => {
    let incoming = 0;
    let outgoing = 0;
    for (const r of rows) {
      if (r.kind === "in") incoming += r.amount;
      else outgoing += r.amount;
    }
    return { incoming, outgoing, net: incoming - outgoing };
  }, [rows]);

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-violet-900/40 bg-violet-950/20 p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-violet-200">საბანკო ანგარიში</h2>
            <p className="mt-1 text-xs text-zinc-500">
              გადმორიცხვების მოძრაობა — რა შევიდა და რა გავიდა ანგარიშიდან
            </p>
          </div>
          <Field label="თვე">
            <input
              type="month"
              className={`${inputCls} w-auto`}
              value={viewMonth}
              onChange={(e) => setViewMonth(e.target.value)}
            />
          </Field>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={tabBtn(branchFilter === "ყველა")}
            onClick={() => setBranchFilter("ყველა")}
          >
            ყველა
          </button>
          {BRANCHES.map((b) => (
            <button key={b} type="button" className={tabBtn(branchFilter === b)} onClick={() => setBranchFilter(b)}>
              {b}
            </button>
          ))}
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-violet-900/50 bg-violet-950/30 p-3">
            <p className="text-xs text-zinc-500">მიმდინარე ნაშთი</p>
            <p className="mt-1 text-lg font-semibold text-violet-300">{formatMoney(currentBalance)}</p>
          </div>
          <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3">
            <p className="text-xs text-zinc-500">შემოსული (თვე)</p>
            <p className="mt-1 text-lg font-semibold text-emerald-400">+{formatMoney(periodTotals.incoming)}</p>
          </div>
          <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-3">
            <p className="text-xs text-zinc-500">გასული (თვე)</p>
            <p className="mt-1 text-lg font-semibold text-red-400">−{formatMoney(periodTotals.outgoing)}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-xs text-zinc-500">ნეტო (თვე)</p>
            <p
              className={`mt-1 text-lg font-semibold ${
                periodTotals.net >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {formatMoney(periodTotals.net)}
            </p>
          </div>
        </div>

        <div className="mb-4">
          <Field label="ძებნა">
            <input
              className={inputCls}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="აღწერა, ფილიალი..."
            />
          </Field>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">ამ თვეში გადმორიცხვები არ არის.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pl-3 pr-3 pt-2">თარიღი</th>
                  <th className="pb-2 pr-3">ფილიალი</th>
                  <th className="pb-2 pr-3">მიმართულება</th>
                  <th className="pb-2 pr-3">აღწერა</th>
                  <th className="pb-2 pr-3">გადახდა</th>
                  <th className="pb-2 pr-3 text-right">თანხა</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-zinc-800/50">
                    <td className="py-2 pl-3 pr-3 whitespace-nowrap text-zinc-400">{formatDate(row.date)}</td>
                    <td className="py-2 pr-3">{row.branch}</td>
                    <td className={`py-2 pr-3 ${row.kind === "in" ? "text-emerald-400" : "text-red-400"}`}>
                      {row.kind === "in" ? "შემოსული" : "გასული"}
                    </td>
                    <td className="py-2 pr-3 text-zinc-300">{row.label}</td>
                    <td className="py-2 pr-3">
                      <select
                        className={selectCls}
                        value={row.paymentMethod}
                        onChange={async (e) => {
                          await onUpdatePayment(row.id, e.target.value as PaymentMethod);
                        }}
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {paymentMethodLabel(m)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td
                      className={`py-2 pr-3 text-right font-medium ${
                        row.kind === "in" ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {row.kind === "in" ? "+" : "−"}
                      {formatMoney(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-700 font-semibold">
                  <td colSpan={5} className="py-3 pl-3 pr-3 text-right text-zinc-400">
                    ნეტო თვეში
                  </td>
                  <td
                    className={`py-3 pr-3 text-right ${
                      periodTotals.net >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {formatMoney(periodTotals.net)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-zinc-600">
          აქ ჩანს მხოლოდ „გადმორიცხვა“ ტიპის ტრანზაქციები. ქეში და ბარათი — მიმოხილვის ტაბში.
        </p>
      </div>
    </section>
  );
}
