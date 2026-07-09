import type { ExpenseCategory, PaymentMethod, PaymentStatus } from "./types";
import { BRANCHES, EXPENSE_BRANCHES } from "./constants";

export { BRANCHES, EXPENSE_BRANCHES };

export const BRANCH_EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "ნედლეული", label: "ნედლეული — პლასტმასი, საღებავი, დანამატები" },
  { value: "წარმოება", label: "წარმოება — დაზგარის ნაწილები, ხელსაწყოები, რემონტი" },
  { value: "კომუნალური", label: "კომუნალური — დენი, წყალი და სხვა" },
  { value: "საკვები", label: "საკვები — ყავა, ჩაი, შაქარი, კვება" },
  { value: "ლოგისტიკა", label: "ლოგისტიკა — საწვავი, მიწოდება" },
  { value: "დისტრიბუცია", label: "დისტრიბუცია — დისტრიბუციის ხარჯი" },
  { value: "საყოფაცხოვრებო", label: "საყოფაცხოვრებო — დასუფთავება, ჰიგიენა, საკანცელარიო" },
  { value: "სხვა", label: "სხვა — გაუთვალისწინებელი წვრილმანი" },
];

export const CATEGORIES: ExpenseCategory[] = [
  ...BRANCH_EXPENSE_CATEGORIES.map((c) => c.value),
  "ხელფასი", "დღგ", "სესხი", "საწვავი", "კომუნალურები",
];

export const PAYMENT_STATUSES: PaymentStatus[] = ["სრულად გადახდილი", "ბე (ავანსი)"];
export const PAYMENT_METHODS: PaymentMethod[] = ["ქეში (ნაღდი)", "ბარათი", "ანგარიშზე ჩარიცხვა"];
export const EXPENSE_PAYMENT_METHODS = ["ქეში (ნაღდი)", "ბარათი"] as const;
