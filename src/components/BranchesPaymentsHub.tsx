"use client";

import { useState } from "react";
import type { Branch, Transaction } from "@/lib/types";
import BranchPaymentsPanel from "@/components/BranchPaymentsPanel";
import DistribuciaSyncPanel from "@/components/DistribuciaSyncPanel";

const BRANCH_TABS: Branch[] = ["დისტრიბუცია", "ქუთაისი", "ლილო", "დიღომი"];

const tabBtn = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm ${on ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`;

type Props = {
  transactions: Transaction[];
  onRefresh: () => void | Promise<void>;
};

export default function BranchesPaymentsHub({ transactions, onRefresh }: Props) {
  const [branch, setBranch] = useState<Branch>("დისტრიბუცია");

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="mb-3 text-lg font-semibold text-zinc-200">ფილიალის გადახდები</h2>
        <div className="flex flex-wrap gap-2">
          {BRANCH_TABS.map((b) => (
            <button key={b} type="button" className={tabBtn(branch === b)} onClick={() => setBranch(b)}>
              {b}
            </button>
          ))}
        </div>
      </div>

      <BranchPaymentsPanel
        key={branch}
        branch={branch}
        transactions={transactions}
        onRefresh={onRefresh}
        header={
          branch === "დისტრიბუცია" ? <DistribuciaSyncPanel onSynced={onRefresh} /> : undefined
        }
      />
    </div>
  );
}
