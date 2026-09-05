"use client";

import type { Branch, Employee, PaymentMethod, Transaction } from "@/lib/types";
import { isCreditOrder, isCreditOrderActive } from "@/lib/utils";
import TransactionTable from "@/components/TransactionTable";

type Props = {
  transactions: Transaction[];
  filter: Branch | "ყველა";
  employees?: Employee[];
  bankLedgerReviewed?: Record<string, string>;
  onDelete: (id: string) => Promise<boolean>;
  onUpdatePayment: (id: string, paymentMethod: PaymentMethod) => Promise<boolean>;
  onUpdateDriver?: (id: string, driverEmployeeId: string, driverEmployeeName: string) => Promise<boolean>;
  onToggleReview?: (id: string, reviewed: boolean) => Promise<boolean>;
};

export default function TransactionsPanel({
  transactions,
  filter,
  employees,
  bankLedgerReviewed,
  onDelete,
  onUpdatePayment,
  onUpdateDriver,
  onToggleReview,
}: Props) {
  const rows = (
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
        მომზიდავის შეცვლა და „აისახა“ — ანგარიშზე/ბარათზე კონტროლი
      </p>
      <TransactionTable
        rows={rows}
        showBranch={filter === "ყველა"}
        employees={employees}
        bankLedgerReviewed={bankLedgerReviewed}
        onDelete={onDelete}
        onUpdatePayment={onUpdatePayment}
        onUpdateDriver={onUpdateDriver}
        onToggleReview={onToggleReview}
        emptyText="ცარიელია"
      />
    </section>
  );
}
