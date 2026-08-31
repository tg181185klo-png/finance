import type { PaymentMethod, PaymentStatus } from "./types";
import { BRANCHES, EXPENSE_BRANCHES } from "./constants";
import {
  ALL_EXPENSE_CATEGORIES,
  BRANCH_EXPENSE_CATEGORY_OPTIONS,
} from "./expense-categories";

export { BRANCHES, EXPENSE_BRANCHES };

export const BRANCH_EXPENSE_CATEGORIES = BRANCH_EXPENSE_CATEGORY_OPTIONS;

export const CATEGORIES = ALL_EXPENSE_CATEGORIES;

export const PAYMENT_STATUSES: PaymentStatus[] = ["სრულად გადახდილი", "ბე (ავანსი)"];
export const PAYMENT_METHODS: PaymentMethod[] = ["ქეში (ნაღდი)", "ბარათი", "ანგარიშზე ჩარიცხვა"];
export const EXPENSE_PAYMENT_METHODS = ["ქეში (ნაღდი)", "ბარათი", "ანგარიშზე ჩარიცხვა"] as const;
export const TX_RECURRENCE = ["ყოველთვიური", "ერთჯერადი"] as const;
