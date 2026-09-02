import { effectiveTxBranch, txMatchesBranchFilter } from "./branch-allocation";
import { KUTAISI_DISTRIB_BRANCHES, KUTAISI_DISTRIB_LABEL } from "./constants";
import { txInPeriod } from "./period-filter";
import type { Branch, PaymentMethod, Transaction, TxRecurrence } from "./types";
import { countsTowardOperatingExpenses, txPaymentMethod, txRecurrence } from "./utils";

export type FlowBranchScope = Branch | "ყველა" | typeof KUTAISI_DISTRIB_LABEL;
export type FlowDetailKind = "revenue" | "expense" | "account";

export function flowScopeLabel(scope: FlowBranchScope): string {
  if (scope === "ყველა") return "კომპანია";
  return scope;
}

export function txMatchesFlowScope(t: Transaction, scope: FlowBranchScope): boolean {
  if (scope === "ყველა") return true;
  if (scope === KUTAISI_DISTRIB_LABEL) {
    const br = effectiveTxBranch(t);
    return br === "ქუთაისი" || br === "დისტრიბუცია";
  }
  return txMatchesBranchFilter(t, scope);
}

export function isNonCashPayment(method: PaymentMethod) {
  return method === "ბარათი" || method === "ანგარიშზე ჩარიცხვა";
}

export function txAffectsAccount(t: Transaction) {
  return isNonCashPayment(txPaymentMethod(t));
}

export function accountTotal(bal: { card: number; bank: number }) {
  return bal.card + bal.bank;
}

export function filterFlowDetailTransactions(
  transactions: Transaction[],
  kind: FlowDetailKind,
  scope: FlowBranchScope,
  from: string,
  to: string,
  options?: { recurrence?: TxRecurrence }
): Transaction[] {
  return transactions
    .filter((t) => {
      if (!txInPeriod(t.date, from, to)) return false;
      if (!txMatchesFlowScope(t, scope)) return false;
      if (options?.recurrence && txRecurrence(t) !== options.recurrence) return false;
      if (kind === "revenue") return t.type === "sale";
      if (kind === "expense") return t.type === "expense" && countsTowardOperatingExpenses(t);
      return txAffectsAccount(t);
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function flowDetailTitle(kind: FlowDetailKind, scope: FlowBranchScope, rangeLabel: string) {
  const scopeName = flowScopeLabel(scope);
  if (kind === "revenue") return `შემოსავლის ტრანზაქციები — ${scopeName} · ${rangeLabel}`;
  if (kind === "expense") return `ხარჯის ტრანზაქციები — ${scopeName} · ${rangeLabel}`;
  return `ანგარიშის ტრანზაქციები (ბარათი + ანგარიში) — ${scopeName} · ${rangeLabel}`;
}

export function flowDrillShowBranch(scope: FlowBranchScope) {
  return scope === "ყველა" || scope === KUTAISI_DISTRIB_LABEL;
}

export { KUTAISI_DISTRIB_BRANCHES, KUTAISI_DISTRIB_LABEL };
