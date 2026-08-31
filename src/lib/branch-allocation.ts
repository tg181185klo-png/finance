import type { Branch, Deposit, Expense, ExpenseBranch, Transaction } from "./types";

const BRANCH_KEYWORDS: { branch: Branch; pattern: RegExp }[] = [
  { branch: "დისტრიბუცია", pattern: /დისტრიბუც/i },
  { branch: "ლილო", pattern: /ლილო/i },
  { branch: "დიღომი", pattern: /დიღომ/i },
  { branch: "ქუთაისი", pattern: /ქუთაის/i },
];

/** ხარჯის რეპორტინგ ფილიალი — კომენტარი/კატეგორიიდან (მაგ. „დისტრიბუცია“) */
export function effectiveExpenseBranch(expense: Expense): ExpenseBranch {
  const text = `${expense.category} ${expense.comment}`;
  for (const { branch, pattern } of BRANCH_KEYWORDS) {
    if (pattern.test(text)) return branch;
  }
  return expense.branch;
}

/** შენატანის რეპორტინგ ფილიალი */
export function effectiveDepositBranch(deposit: Deposit): Branch {
  for (const { branch, pattern } of BRANCH_KEYWORDS) {
    if (pattern.test(deposit.comment)) return branch;
  }
  return deposit.branch;
}

export function effectiveTxBranch(t: Transaction): Branch | ExpenseBranch {
  if (t.type === "sale") return t.branch;
  if (t.type === "deposit") return effectiveDepositBranch(t);
  return effectiveExpenseBranch(t);
}

export function txMatchesBranchFilter(t: Transaction, filter: Branch | "ყველა"): boolean {
  if (filter === "ყველა") return true;
  const attributed = effectiveTxBranch(t);
  return attributed === filter || attributed === "საერთო";
}

export function resolveExpenseBranchFromText(
  label: string,
  comment: string,
  defaultBranch: Branch
): Branch {
  const text = `${label} ${comment}`;
  for (const { branch, pattern } of BRANCH_KEYWORDS) {
    if (pattern.test(text)) return branch;
  }
  return defaultBranch;
}
