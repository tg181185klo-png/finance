import { PAYMENT_METHODS } from "./dashboard-data";
import { effectiveTxBranch, txMatchesBranchFilter } from "./branch-allocation";
import { KUTAISI_DISTRIB_BRANCHES, KUTAISI_DISTRIB_LABEL } from "./constants";
import { txInPeriod } from "./period-filter";
import type { Branch, PaymentMethod, Transaction, TxRecurrence } from "./types";
import { countsTowardOperatingExpenses, txPaymentMethod, txRecurrence } from "./utils";

export type FlowBranchScope = Branch | "ყველა" | typeof KUTAISI_DISTRIB_LABEL;

export type AccountChannel = "card" | "bank";

export type FlowDetailKind =
  | "revenue"
  | "revenue_cash"
  | "revenue_card"
  | "revenue_bank"
  | "revenue_account"
  | "expense"
  | "expense_cash"
  | "expense_card"
  | "expense_bank"
  | "expense_account"
  | "balance_cash"
  | "balance_card"
  | "balance_bank"
  | "balance_account"
  | "account";

export function accountChannelLabel(channel: AccountChannel) {
  return channel === "card" ? "ბარათი" : "გადარიცხვა";
}

export function isAccountDrillKind(kind: FlowDetailKind) {
  return kind === "revenue_account" || kind === "expense_account" || kind === "balance_account";
}

export type ScopePeriodStats = {
  revenueTotal: number;
  revenueCash: number;
  revenueCard: number;
  revenueBank: number;
  expenseOperating: number;
  expenseCash: number;
  expenseCard: number;
  expenseBank: number;
  net: number;
};

const CASH_METHOD = PAYMENT_METHODS[0];
const CARD_METHOD = PAYMENT_METHODS[1];
const BANK_METHOD = PAYMENT_METHODS[2];

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

export function computeScopePeriodStats(
  transactions: Transaction[],
  scope: FlowBranchScope,
  from: string,
  to: string
): ScopePeriodStats {
  let revenueTotal = 0;
  let revenueCash = 0;
  let revenueCard = 0;
  let revenueBank = 0;
  let expenseOperating = 0;
  let expenseCash = 0;
  let expenseCard = 0;
  let expenseBank = 0;

  for (const t of transactions) {
    if (!txInPeriod(t.date, from, to)) continue;
    if (!txMatchesFlowScope(t, scope)) continue;
    const method = txPaymentMethod(t);
    if (t.type === "sale") {
      revenueTotal += t.amount;
      if (method === CASH_METHOD) revenueCash += t.amount;
      else if (method === CARD_METHOD) revenueCard += t.amount;
      else revenueBank += t.amount;
    } else if (t.type === "expense") {
      if (method === CASH_METHOD) expenseCash += t.amount;
      else if (method === CARD_METHOD) expenseCard += t.amount;
      else expenseBank += t.amount;
      if (countsTowardOperatingExpenses(t)) expenseOperating += t.amount;
    }
  }

  return {
    revenueTotal,
    revenueCash,
    revenueCard,
    revenueBank,
    expenseOperating,
    expenseCash,
    expenseCard,
    expenseBank,
    net: revenueTotal - expenseOperating,
  };
}

function matchesChannelKind(t: Transaction, kind: FlowDetailKind): boolean {
  const method = txPaymentMethod(t);
  switch (kind) {
    case "revenue":
      return t.type === "sale";
    case "revenue_cash":
      return t.type === "sale" && method === CASH_METHOD;
    case "revenue_card":
      return t.type === "sale" && method === CARD_METHOD;
    case "revenue_bank":
      return t.type === "sale" && method === BANK_METHOD;
    case "revenue_account":
      return t.type === "sale" && isNonCashPayment(method);
    case "expense":
      return t.type === "expense" && countsTowardOperatingExpenses(t);
    case "expense_cash":
      return t.type === "expense" && method === CASH_METHOD;
    case "expense_card":
      return t.type === "expense" && method === CARD_METHOD;
    case "expense_bank":
      return t.type === "expense" && method === BANK_METHOD;
    case "expense_account":
      return t.type === "expense" && isNonCashPayment(method);
    case "balance_cash":
      return method === CASH_METHOD;
    case "balance_card":
      return method === CARD_METHOD;
    case "balance_bank":
      return method === BANK_METHOD;
    case "balance_account":
      return isNonCashPayment(method);
    case "account":
      return isNonCashPayment(method);
    default:
      return false;
  }
}

export function filterFlowDetailTransactions(
  transactions: Transaction[],
  kind: FlowDetailKind,
  scope: FlowBranchScope,
  from: string,
  to: string,
  options?: { recurrence?: TxRecurrence; accountChannel?: AccountChannel }
): Transaction[] {
  const resolvedKind =
    options?.accountChannel && isAccountDrillKind(kind)
      ? kind === "revenue_account"
        ? options.accountChannel === "card"
          ? "revenue_card"
          : "revenue_bank"
        : kind === "expense_account"
          ? options.accountChannel === "card"
            ? "expense_card"
            : "expense_bank"
          : options.accountChannel === "card"
            ? "balance_card"
            : "balance_bank"
      : kind;

  return transactions
    .filter((t) => {
      if (!txInPeriod(t.date, from, to)) return false;
      if (!txMatchesFlowScope(t, scope)) return false;
      if (options?.recurrence && txRecurrence(t) !== options.recurrence) return false;
      return matchesChannelKind(t, resolvedKind);
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function flowDetailTitle(
  kind: FlowDetailKind,
  scope: FlowBranchScope,
  rangeLabel: string,
  accountChannel?: AccountChannel
) {
  const scopeName = flowScopeLabel(scope);
  const channelSuffix = accountChannel ? ` · ${accountChannelLabel(accountChannel)}` : "";
  const titles: Record<FlowDetailKind, string> = {
    revenue: `მთლიანი შემოსავალი — ${scopeName} · ${rangeLabel}`,
    revenue_cash: `შემოსავალი (ქეში) — ${scopeName} · ${rangeLabel}`,
    revenue_card: `შემოსავალი (ბარათი) — ${scopeName} · ${rangeLabel}`,
    revenue_bank: `შემოსავალი (ანგარიში) — ${scopeName} · ${rangeLabel}`,
    revenue_account: `შემოსავალი (ანგარიში) — ${scopeName} · ${rangeLabel}${channelSuffix}`,
    expense: `ხარჯი (ოპერაციული) — ${scopeName} · ${rangeLabel}`,
    expense_cash: `ხარჯი (ქეში) — ${scopeName} · ${rangeLabel}`,
    expense_card: `ხარჯი (ბარათი) — ${scopeName} · ${rangeLabel}`,
    expense_bank: `ხარჯი (ანგარიში) — ${scopeName} · ${rangeLabel}`,
    expense_account: `ხარჯი (ანგარიში) — ${scopeName} · ${rangeLabel}${channelSuffix}`,
    balance_cash: `ქეში — მოძრაობა · ${scopeName} · ${rangeLabel}`,
    balance_card: `ბარათი — მოძრაობა · ${scopeName} · ${rangeLabel}`,
    balance_bank: `ანგარიში — მოძრაობა · ${scopeName} · ${rangeLabel}`,
    balance_account: `ანგარიში — ნაშთის მოძრაობა · ${scopeName} · ${rangeLabel}${channelSuffix}`,
    account: `ანგარიშის ტრანზაქციები (ბარათი + ანგარიში) — ${scopeName} · ${rangeLabel}`,
  };
  return titles[kind];
}

export function flowDrillShowBranch(scope: FlowBranchScope) {
  return scope === "ყველა" || scope === KUTAISI_DISTRIB_LABEL;
}

export { KUTAISI_DISTRIB_BRANCHES, KUTAISI_DISTRIB_LABEL };
