import type { Branch, Transaction } from "./types";
import { txMatchesBranchFilter } from "./branch-allocation";
import { currentMonth, monthStartEnd } from "./utils";

export type PeriodMode = "month" | "today" | "custom";

export type ResolvedPeriod = {
  mode: PeriodMode;
  from: string;
  to: string;
  label: string;
};

export function resolvePeriod(mode: PeriodMode, customFrom?: string, customTo?: string): ResolvedPeriod {
  const today = new Date().toISOString().slice(0, 10);
  if (mode === "today") {
    return { mode, from: today, to: today, label: "დღეს" };
  }
  if (mode === "custom" && customFrom && customTo) {
    return {
      mode,
      from: customFrom,
      to: customTo,
      label: customFrom === customTo ? customFrom : `${customFrom} — ${customTo}`,
    };
  }
  const month = currentMonth();
  const { from, to } = monthStartEnd(month);
  return { mode: "month", from, to, label: `მიმდინარე თვე (${month})` };
}

export function txInPeriod(date: string, from: string, to: string) {
  const d = date.slice(0, 10);
  return d >= from && d <= to;
}

export function filterTxByPeriod(transactions: Transaction[], from: string, to: string) {
  return transactions.filter((t) => txInPeriod(t.date, from, to));
}

export function periodFlow(
  transactions: Transaction[],
  branch: Branch | "ყველა",
  from: string,
  to: string
) {
  let revenue = 0;
  let expenses = 0;
  let count = 0;
  for (const t of transactions) {
    if (!txInPeriod(t.date, from, to)) continue;
    if (branch !== "ყველა" && !txMatchesBranchFilter(t, branch)) continue;
    count += 1;
    if (t.type === "sale") revenue += t.amount;
    else expenses += t.amount;
  }
  return { revenue, expenses, net: revenue - expenses, count };
}
