"use client";

import type { Branch, Transaction } from "@/lib/types";
import { isCreditOrder, isCreditOrderActive } from "@/lib/utils";
import TransactionTable from "@/components/TransactionTable";

type Props = {
  transactions: Transaction[];
  filter: Branch | "ყველა";
  onDelete: (id: string, pin: string) => Promise<boolean>;
};

export default function TransactionsPanel({
  transactions,
  filter,
  onDelete,
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
      <p className="mb-4 text-xs text-zinc-500">წასაშლელად: ადმინ კოდი + Enter უჯრაში.</p>
      <TransactionTable
        rows={rows}
        showBranch={filter === "ყველა"}
        onDelete={onDelete}
        emptyText="ცარიელია"
      />
    </section>
  );
}
