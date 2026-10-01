import type { Branch, BranchCash, Transaction } from "./types";
import { BRANCHES } from "./constants";
import { FRESH_START_DATE } from "./report-config";
import { calcBalancesUpToDate, emptyBranchCash, formatMoney } from "./utils";

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

function zeroOpenings(): Record<Branch, BranchCash> {
  return Object.fromEntries(BRANCHES.map((b) => [b, emptyBranchCash()])) as Record<Branch, BranchCash>;
}

export function buildBranchBalanceRows(
  transactions: Transaction[],
  branchCash: Record<Branch, BranchCash>,
  asOf?: string,
  openingByMonth?: Record<string, Record<Branch, BranchCash>>
): BranchBalanceRow[] {
  const end = (asOf ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const fresh = end >= FRESH_START_DATE;
  const openingSource = fresh ? (openingByMonth?.[end.slice(0, 7)] ?? zeroOpenings()) : branchCash;
  return BRANCHES.map((branch) => {
    const current = calcBalancesUpToDate(transactions, branch, openingSource, end, openingByMonth);
    return {
      branch,
      opening: openingSource[branch] ?? emptyBranchCash(),
      current: { cash: current.cash, card: current.card, bank: current.bank },
    };
  });
}

export function openingBalanceLabel(cash: BranchCash) {
  return `ქეში ${formatMoney(cash.cash)} · ბარათი ${formatMoney(cash.card)} · ანგარიში ${formatMoney(cash.bank)}`;
}
