import type { Branch, BranchCash, Transaction } from "./types";
import { BRANCHES } from "./constants";
import { calcBalances, emptyBranchCash, formatMoney } from "./utils";

export const OPENING_BALANCE_DATE = "2026-09-01";

export type BranchBalanceRow = {
  branch: Branch;
  opening: BranchCash;
  current: BranchCash;
};

export function sumOpening(branchCash: Record<Branch, BranchCash>): BranchCash {
  const out = emptyBranchCash();
  for (const b of BRANCHES) {
    const o = branchCash[b] ?? emptyBranchCash();
    out.cash += o.cash;
    out.card += o.card;
    out.bank += o.bank;
  }
  return out;
}

export function buildBranchBalanceRows(
  transactions: Transaction[],
  branchCash: Record<Branch, BranchCash>
): BranchBalanceRow[] {
  return BRANCHES.map((branch) => ({
    branch,
    opening: branchCash[branch] ?? emptyBranchCash(),
    current: {
      cash: calcBalances(transactions, branch, branchCash).cash,
      card: calcBalances(transactions, branch, branchCash).card,
      bank: calcBalances(transactions, branch, branchCash).bank,
    },
  }));
}

export function openingBalanceLabel(cash: BranchCash) {
  return `ქეში ${formatMoney(cash.cash)} · ბარათი ${formatMoney(cash.card)} · ანგარიში ${formatMoney(cash.bank)}`;
}
