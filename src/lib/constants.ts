import type { Branch, ExpenseBranch } from "./types";

export const ADMIN_PIN = process.env.ADMIN_PIN || "12345";
export const BRANCHES: Branch[] = ["ქუთაისი", "ლილო", "დიღომი"];
export const EXPENSE_BRANCHES: ExpenseBranch[] = [...BRANCHES, "საერთო"];
