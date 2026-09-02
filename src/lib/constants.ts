import type { Branch, ExpenseBranch } from "./types";

export const ADMIN_PIN = process.env.ADMIN_PIN || "12345";
export const BRANCHES: Branch[] = ["ქუთაისი", "ლილო", "დიღომი", "დისტრიბუცია"];
export const EXPENSE_BRANCHES: ExpenseBranch[] = [...BRANCHES, "საერთო"];
/** მიმოხილვაში ქუთაისი და დისტრიბუცია ერთად */
export const KUTAISI_DISTRIB_BRANCHES: Branch[] = ["ქუთაისი", "დისტრიბუცია"];
export const KUTAISI_DISTRIB_LABEL = "ქუთაისი+დისტრიბუცია" as const;
