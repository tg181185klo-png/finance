export type Branch = "ქუთაისი" | "ლილო" | "დიღომი";
export type ExpenseBranch = Branch | "საერთო";
export type PaymentStatus = "სრულად გადახდილი" | "ბე (ავანსი)";
export type PaymentMethod = "ქეში (ნაღდი)" | "ბარათი" | "ანგარიშზე ჩარიცხვა";
export type ExpenseCategory =
  | "ნედლეული" | "წარმოება" | "კომუნალური" | "საკვები" | "ლოგისტიკა" | "დისტრიბუცია" | "საყოფაცხოვრებო" | "სხვა"
  | "საწვავი" | "ხელფასი" | "კომუნალურები" | "დღგ" | "სესხი";
export type ExpensePaymentMethod = "ქეში (ნაღდი)" | "ბარათი";
export type TxSource = "admin" | "branch";

export interface Product {
  code: string;
  name: string;
  price: number;
}

export interface Sale {
  id: string;
  type: "sale";
  date: string;
  branch: Branch;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  comment: string;
  source?: TxSource;
  reportId?: string;
}

export interface Expense {
  id: string;
  type: "expense";
  date: string;
  branch: ExpenseBranch;
  category: ExpenseCategory;
  amount: number;
  comment: string;
  source?: TxSource;
  reportId?: string;
  obligationId?: string;
  expensePaymentMethod?: ExpensePaymentMethod;
}

export type Transaction = Sale | Expense;

export interface Obligation {
  id: string;
  name: string;
  amount: number;
  paid: number;
  branch: ExpenseBranch | "ყველა";
  category: ExpenseCategory;
  month: string;
}

export interface BranchSaleLine {
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  paymentMethod: PaymentMethod;
}

export interface BranchExpenseLine {
  category: ExpenseCategory;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  comment: string;
}

export interface BranchDailyReport {
  id: string;
  branch: Branch;
  date: string;
  salesTotal: number;
  salesNote: string;
  expensesTotal: number;
  expensesNote: string;
  submittedAt: string;
  sales?: BranchSaleLine[];
  expenses?: BranchExpenseLine[];
}

export interface BranchCash {
  cash: number;
  card: number;
  bank: number;
}

/** productCode → quantity per branch */
export type BranchInventory = Record<string, number>;

export interface Store {
  transactions: Transaction[];
  obligations: Record<string, Obligation[]>;
  branchTokens: Record<Branch, string>;
  branchReports: BranchDailyReport[];
  inventory: Record<Branch, BranchInventory>;
  branchCash: Record<Branch, BranchCash>;
}

export interface Balances {
  total: number;
  cash: number;
  card: number;
  bank: number;
  credit: number;
  revenue: number;
  expenses: number;
}

export interface DayReport {
  date: string;
  revenue: number;
  expenses: number;
  net: number;
}

export interface PeriodReport {
  from: string;
  to: string;
  branch: Branch | "ყველა";
  revenue: number;
  expenses: number;
  net: number;
  days: DayReport[];
  obligationTotal: number;
  obligationPaid: number;
  obligationRemaining: number;
}
