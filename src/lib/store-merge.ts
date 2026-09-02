import { BRANCHES } from "./constants";
import type { Branch, BranchCash, BranchInventory, Store } from "./types";
import { emptyBranchCash, emptyInventory } from "./utils";

export const DEFAULT_OVERVIEW_REPORT_TOKEN = "ovw-mr9k2";

export const DEFAULT_BRANCH_TOKENS: Record<Branch, string> = {
  ქუთაისი: "kut-a8f3",
  ლილო: "lil-b2c9",
  დიღომი: "dig-c5e1",
  დისტრიბუცია: "dis-e4a2",
};

export function mergeBranchCash(data?: Partial<Record<Branch, BranchCash>>): Record<Branch, BranchCash> {
  const base = Object.fromEntries(BRANCHES.map((b) => [b, emptyBranchCash()])) as Record<Branch, BranchCash>;
  const out = { ...base };
  for (const b of BRANCHES) {
    out[b] = { ...base[b], ...data?.[b] };
  }
  return out;
}

export function mergeInventory(data?: Partial<Record<Branch, BranchInventory>>): Record<Branch, BranchInventory> {
  const base = emptyInventory();
  const out = { ...base };
  for (const b of BRANCHES) {
    out[b] = { ...base[b], ...data?.[b] };
  }
  return out;
}

function stableLegacyId(t: { date?: string; type?: string; branch?: string; amount?: number }, index: number) {
  const date = t.date ?? "nodate";
  const type = t.type ?? "tx";
  const branch = t.branch ?? "nb";
  const amount = t.amount ?? 0;
  return `legacy-${date}-${type}-${branch}-${amount}-${index}`;
}

/** Ensures every Store field exists — safe on client and server */
export function mergeStore(data: Partial<Store> = {}): Store {
  const transactions = (data.transactions ?? []).map((t, index) =>
    t.id ? t : { ...t, id: stableLegacyId(t, index) }
  );
  return {
    transactions,
    obligations: data.obligations ?? {},
    branchTokens: { ...DEFAULT_BRANCH_TOKENS, ...data.branchTokens },
    overviewReportToken: data.overviewReportToken ?? DEFAULT_OVERVIEW_REPORT_TOKEN,
    branchReports: data.branchReports ?? [],
    inventory: mergeInventory(data.inventory),
    branchCash: mergeBranchCash(data.branchCash),
    recurringObligations: data.recurringObligations ?? [],
    obligationPayments: data.obligationPayments ?? [],
    creditPayments: data.creditPayments ?? [],
    creditDeliveries: data.creditDeliveries ?? [],
    employees: data.employees ?? [],
    attendance: data.attendance ?? [],
    customers: data.customers ?? [],
    bankLedgerReviewed: data.bankLedgerReviewed ?? {},
  };
}

export function isStorePayload(value: unknown): value is Partial<Store> {
  return typeof value === "object" && value !== null && !("error" in value);
}
