export type Branch = "ქუთაისი" | "ლილო" | "დიღომი" | "დისტრიბუცია";
export type ExpenseBranch = Branch | "საერთო";
export type PaymentStatus = "სრულად გადახდილი" | "ბე (ავანსი)";
export type PaymentMethod = "ქეში (ნაღდი)" | "ბარათი" | "ანგარიშზე ჩარიცხვა";
export type ExpenseCategory = string;
export type ExpensePaymentMethod = "ქეში (ნაღდი)" | "ბარათი" | "ანგარიშზე ჩარიცხვა";
export type TxRecurrence = "ყოველთვიური" | "ერთჯერადი";
export type TxSource = "admin" | "branch" | "import" | "distribucia";
export type WorkShift = "დღის" | "საღამოს" | "ღამის";
export type CustomerPersonType = "physical" | "legal";
export type CustomerRegistrySource = "import" | "employee";

/** კლიენტების რეგისტრი — იმპორტი ან თანამშრომლის მიერ რეგისტრაცია */
export interface Customer {
  id: string;
  personType: CustomerPersonType;
  /** true = ძველი (Excel/ისტორია), false = ახალი (თანამშრომლის რეგისტრაცია) */
  isLegacy: boolean;
  firstName?: string;
  lastName?: string;
  personalId?: string;
  phone?: string;
  companyName?: string;
  companyId?: string;
  contactFirstName?: string;
  contactLastName?: string;
  contactPhone?: string;
  driverEmployeeId?: string;
  driverEmployeeName?: string;
  registeredByEmployeeId?: string;
  registeredByEmployeeName?: string;
  branch?: Branch;
  registeredAt: string;
  source: CustomerRegistrySource;
  /** ფილიალის რეპორტის გაყიდვასთან დაკავშირება */
  sourceClientSaleId?: string;
  sourceReportId?: string;
}

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
  /** ყოველთვიური თუ ერთჯერადი (მოგება-ზარალის ანგარიშისთვის) */
  recurrence?: TxRecurrence;
  source?: TxSource;
  reportId?: string;
  clientSaleId?: string;
  employeeName?: string;
  /** მყიდველი / კომპანია (ბე შეკვეთისას) */
  buyerName?: string;
  /** უკვე გადახდილი თანხა (ავანსი + ნაწილობრივი გადახდები) */
  creditPaid?: number;
  /** უკვე მიწოდებული რაოდენობა */
  quantityDelivered?: number;
  /** ფული სრულად გადახდილი */
  creditCompletedAt?: string;
  /** პროდუქტი სრულად მიწოდებული */
  deliveryCompletedAt?: string;
  /** შეკვეთა სრულად დასრულებული (ფული + მოწოდება) */
  orderCompletedAt?: string;
  /** polimeri-distribucia აპის შეკვეთის ID */
  distribuciaOrderId?: string;
}

/** ბე შეკვეთის გადახდის ისტორია */
export interface CreditPayment {
  id: string;
  saleId: string;
  amount: number;
  paidAt: string;
  note?: string;
  paymentMethod?: PaymentMethod;
}

/** ბე შეკვეთის მიწოდების ისტორია */
export interface CreditDelivery {
  id: string;
  saleId: string;
  quantity: number;
  deliveredAt: string;
  note?: string;
}

export interface Expense {
  id: string;
  type: "expense";
  date: string;
  branch: ExpenseBranch;
  category: ExpenseCategory;
  amount: number;
  comment: string;
  /** ყოველთვიური თუ ერთჯერადი (მოგება-ზარალის ანგარიშისთვის) */
  recurrence?: TxRecurrence;
  source?: TxSource;
  reportId?: string;
  obligationId?: string;
  expensePaymentMethod?: ExpensePaymentMethod;
}

export type DepositKind = "founder" | "loan_repayment" | "other";

export interface Deposit {
  id: string;
  type: "deposit";
  date: string;
  branch: Branch;
  amount: number;
  kind: DepositKind;
  comment: string;
  recurrence?: TxRecurrence;
  source?: TxSource;
  reportId?: string;
  depositPaymentMethod?: ExpensePaymentMethod;
}

export type Transaction = Sale | Expense | Deposit;

export interface Obligation {
  id: string;
  name: string;
  amount: number;
  paid: number;
  branch: ExpenseBranch | "ყველა";
  category: ExpenseCategory;
  month: string;
  comment?: string;
  recurringId?: string;
  employeeId?: string;
}

/** ყოველთვიური ფიქსირებული ვალდებულების შაბლონი */
export interface RecurringObligation {
  id: string;
  name: string;
  amount: number;
  branch: ExpenseBranch | "ყველა";
  category: ExpenseCategory;
  comment?: string;
  createdAt: string;
}

/** ვალდებულების გადახდის ისტორია */
export interface ObligationPayment {
  id: string;
  obligationId: string;
  expenseId: string;
  amount: number;
  paidAt: string;
  note?: string;
  paymentMethod?: PaymentMethod;
  branch?: ExpenseBranch;
}

export interface Employee {
  id: string;
  name: string;
  branch: Branch;
  dailyWage: number;
  active: boolean;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  branch: Branch;
  date: string;
  checkedInAt: string;
  shift?: WorkShift;
  wageAmount?: number;
}

export interface BranchSaleLine {
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  paymentMethod: PaymentMethod;
}

/** ფილიალის რეპორტში კლიენტის გაყიდვა */
export interface BranchClientSale {
  clientSaleId?: string;
  personType: CustomerPersonType;
  customerFirstName: string;
  customerLastName: string;
  personalId?: string;
  phone: string;
  companyName?: string;
  companyId?: string;
  contactFirstName?: string;
  contactLastName?: string;
  contactPhone?: string;
  driverEmployeeId?: string;
  driverEmployeeName?: string;
  paymentMethod: PaymentMethod;
  comment?: string;
  products: BranchSaleLine[];
  /** როდის გაიგზავნა ეს ხაზი */
  recordedAt?: string;
}

export interface BranchIncomeLine {
  amount: number;
  paymentMethod: PaymentMethod;
}

export interface BranchExpenseLine {
  category: ExpenseCategory;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  comment: string;
  recordedAt?: string;
}

export interface BranchWorkedEmployee {
  employeeId: string;
  employeeName: string;
  shift: WorkShift;
  wageAmount: number;
}

export interface BranchReportSubmission {
  submittedAt: string;
  submittedEmployeeId: string;
  submittedBy: string;
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
  submittedBy?: string;
  submittedEmployeeId?: string;
  /** ყოველი გაგზავნა ცალკე — დუბლიკატის შესამოწმებლად */
  submissionHistory?: BranchReportSubmission[];
  incomes?: BranchIncomeLine[];
  sales?: BranchSaleLine[];
  clientSales?: BranchClientSale[];
  expenses?: BranchExpenseLine[];
  workedEmployees?: BranchWorkedEmployee[];
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
  /** საჯარო მიმოხილვის ლინკი (/o/{token}) */
  overviewReportToken: string;
  branchReports: BranchDailyReport[];
  inventory: Record<Branch, BranchInventory>;
  branchCash: Record<Branch, BranchCash>;
  recurringObligations: RecurringObligation[];
  obligationPayments: ObligationPayment[];
  creditPayments: CreditPayment[];
  creditDeliveries: CreditDelivery[];
  employees: Employee[];
  attendance: AttendanceRecord[];
  customers: Customer[];
  /** საბანკო/ბარათის შემოსავლის ტრანზაქციის ID → ნანახობის დრო */
  bankLedgerReviewed?: Record<string, string>;
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

export interface RecurrenceStats {
  revenue: number;
  expenses: number;
  net: number;
}

export interface BranchPeriodStats {
  branch: Branch;
  revenue: number;
  expenses: number;
  deposits: number;
  founderDeposits: number;
  net: number;
  cashFlowNet: number;
  cashAtEnd: number;
  cardAtEnd: number;
  bankAtEnd: number;
}

export interface DayReport {
  date: string;
  revenue: number;
  expenses: number;
  net: number;
  /** ქეში თითო ფილიალში ამ დღის ბოლოს */
  cashByBranch?: Record<Branch, number>;
}

export interface PeriodReport {
  from: string;
  to: string;
  branch: Branch | "ყველა";
  revenue: number;
  expenses: number;
  deposits: number;
  founderDeposits: number;
  net: number;
  cashFlowNet: number;
  days: DayReport[];
  transactions: Transaction[];
  obligationTotal: number;
  obligationPaid: number;
  obligationRemaining: number;
  /** თითო ფილიალის შემოსავალი/ხარჯი პერიოდში */
  byBranch: BranchPeriodStats[];
  /** ყოველთვიური vs ერთჯერადი */
  recurring: RecurrenceStats;
  oneTime: RecurrenceStats;
  /** პერიოდის ბოლოს ქეში (არჩეული ფილიალი ან ყველა) */
  cashAtEnd: number;
  cardAtEnd: number;
  bankAtEnd: number;
}

/** თვის/პერიოდის ფი�nanancial შეჯამება */
export interface FinancialSummaryRow {
  month?: string;
  from: string;
  to: string;
  revenue: number;
  founderDeposits: number;
  otherDeposits: number;
  deposits: number;
  expenses: number;
  net: number;
  cashFlowNet: number;
  byBranch: BranchPeriodStats[];
}
