import { BRANCHES } from "./constants";
import type { Branch, BranchCash, BranchInventory, Store } from "./types";
import { emptyBranchCash, emptyInventory } from "./utils";

export const DEFAULT_BRANCH_TOKENS: Record<Branch, string> = {
  ქუთაისი: "kut-a8f3",
  ლილო: "lil-b2c9",
  დიღომი: "dig-c5e1",
};

export function mergeBranchCash(data?: Partial<Record<Branch, BranchCash>>): Record<Branch, BranchCash> {
  const base = {
    ქუთაისი: emptyBranchCash(),
    ლილო: emptyBranchCash(),
    დიღომი: emptyBranchCash(),
  };
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

/** Ensures every Store field exists — safe on client and server */
export function mergeStore(data: Partial<Store> = {}): Store {
  return {
    transactions: data.transactions ?? [],
    obligations: data.obligations ?? {},
    branchTokens: { ...DEFAULT_BRANCH_TOKENS, ...data.branchTokens },
    branchReports: data.branchReports ?? [],
    inventory: mergeInventory(data.inventory),
    branchCash: mergeBranchCash(data.branchCash),
    recurringObligations: data.recurringObligations ?? [],
    obligationPayments: data.obligationPayments ?? [],
  };
}

export function isStorePayload(value: unknown): value is Partial<Store> {
  return typeof value === "object" && value !== null && !("error" in value);
}
